#!/usr/bin/env python3
"""Build the SQLite database used by the F1 Elo explorer site."""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = REPO_ROOT / "data/raw/f1db-v2026.5.1"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data/output"
DEFAULT_DB_PATH = DEFAULT_OUTPUT_DIR / "f1elo.sqlite"
DEFAULT_FRONTEND_DB_PATH = REPO_ROOT / "site/public/f1elo.sqlite"
RATING_OUTPUTS = [
    "driver_season_ratings.csv",
    "driver_season_top.csv",
    "driver_season_top_qualified.csv",
    "driver_season_last_3_completed.csv",
]
BOOL_COLUMNS = {
    "constructors_championship_decider",
    "driver_of_the_day",
    "drivers_championship_decider",
    "fastest_lap",
    "grand_slam",
    "pole_position",
    "shared_car",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a query-friendly SQLite database from the pinned F1DB CSV snapshot."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help=f"Directory containing F1DB CSV inputs (default: {DEFAULT_INPUT_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory containing/generated rating CSV outputs (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"Canonical SQLite database path (default: {DEFAULT_DB_PATH})",
    )
    parser.add_argument(
        "--frontend-db-path",
        type=Path,
        default=DEFAULT_FRONTEND_DB_PATH,
        help=(
            "Path served by the frontend. The canonical database is copied here "
            f"after a successful build (default: {DEFAULT_FRONTEND_DB_PATH})."
        ),
    )
    parser.add_argument(
        "--skip-ratings",
        action="store_true",
        help="Import existing rating CSVs instead of regenerating them first.",
    )
    parser.add_argument(
        "--no-frontend-copy",
        action="store_true",
        help="Do not copy the finished SQLite database to the frontend public path.",
    )
    return parser.parse_args()


def project_path(path: Path) -> Path:
    return path if path.is_absolute() else REPO_ROOT / path


def normalize_identifier(value: str) -> str:
    value = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", value)
    value = value.replace("-", "_").replace(" ", "_")
    value = re.sub(r"[^A-Za-z0-9_]", "_", value).lower()
    value = re.sub(r"_+", "_", value).strip("_")
    if not value:
        value = "value"
    if value[0].isdigit():
        value = f"_{value}"
    return value


def table_name_for_csv(path: Path) -> str:
    stem = path.stem
    if stem.startswith("f1db-"):
        stem = stem[len("f1db-") :]
    parts = stem.split("-")
    if parts[0] == "races" and len(parts) > 1:
        if parts[1] == "race":
            parts = ["race", *parts[2:]]
        else:
            parts = ["race", *parts[1:]]
    elif parts[0] == "seasons" and len(parts) > 1:
        parts = ["season", *parts[1:]]
    return normalize_identifier("_".join(parts))


def rating_table_name(path: Path) -> str:
    return normalize_identifier(path.stem)


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"CSV has no header: {path}")
        rows = list(reader)
        return reader.fieldnames, rows


def forced_column_type(column_name: str, values: Iterable[str]) -> str | None:
    if column_name == "id" or column_name.endswith("_id"):
        return "TEXT"
    if column_name == "date" or column_name.endswith("_date"):
        return "TEXT"
    if column_name == "time" or column_name.endswith("_time"):
        return "TEXT"
    if column_name in BOOL_COLUMNS:
        return "INTEGER"

    non_empty = {value.strip().lower() for value in values if value is not None and value.strip() != ""}
    if non_empty and non_empty <= {"true", "false"}:
        return "INTEGER"

    return None


def infer_column_type(source_name: str, rows: list[dict[str, str]]) -> str:
    column_name = normalize_identifier(source_name)
    values = [row[source_name] for row in rows]
    forced_type = forced_column_type(column_name, values)
    if forced_type:
        return forced_type

    non_empty = [value.strip() for value in values if value is not None and value.strip() != ""]
    if not non_empty:
        return "TEXT"

    if all(re.fullmatch(r"-?\d+", value) for value in non_empty):
        return "INTEGER"
    if all(is_real(value) for value in non_empty):
        return "REAL"
    return "TEXT"


def is_real(value: str) -> bool:
    try:
        float(value)
    except ValueError:
        return False
    return True


def convert_value(value: str | None, column_type: str) -> Any:
    if value is None:
        return None
    value = value.strip()
    if value == "":
        return None
    if column_type == "INTEGER":
        lowered = value.lower()
        if lowered == "true":
            return 1
        if lowered == "false":
            return 0
        return int(float(value))
    if column_type == "REAL":
        return float(value)
    return value


def create_metadata_tables(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE source_tables (
          table_name TEXT PRIMARY KEY,
          source_filename TEXT NOT NULL,
          source_kind TEXT NOT NULL,
          row_count INTEGER NOT NULL,
          columns_json TEXT NOT NULL
        );

        CREATE TABLE source_columns (
          table_name TEXT NOT NULL,
          column_name TEXT NOT NULL,
          source_column_name TEXT NOT NULL,
          sqlite_type TEXT NOT NULL,
          PRIMARY KEY (table_name, column_name)
        );
        """
    )


def insert_metadata(connection: sqlite3.Connection, key: str, value: Any) -> None:
    connection.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
        (key, json.dumps(value, sort_keys=True) if not isinstance(value, str) else value),
    )


def import_csv_table(
    connection: sqlite3.Connection,
    path: Path,
    table_name: str,
    source_kind: str,
) -> int:
    source_columns, rows = read_csv_rows(path)
    normalized_columns = [normalize_identifier(column) for column in source_columns]
    column_types = [infer_column_type(column, rows) for column in source_columns]

    column_defs = ", ".join(
        f"{quote_identifier(column)} {column_type}" for column, column_type in zip(normalized_columns, column_types)
    )
    connection.execute(f"DROP TABLE IF EXISTS {quote_identifier(table_name)}")
    connection.execute(f"CREATE TABLE {quote_identifier(table_name)} ({column_defs})")

    placeholders = ", ".join("?" for _ in normalized_columns)
    column_list = ", ".join(quote_identifier(column) for column in normalized_columns)
    insert_sql = f"INSERT INTO {quote_identifier(table_name)} ({column_list}) VALUES ({placeholders})"

    converted_rows = [
        [convert_value(row[source_column], column_type) for source_column, column_type in zip(source_columns, column_types)]
        for row in rows
    ]
    if converted_rows:
        connection.executemany(insert_sql, converted_rows)

    connection.execute(
        """
        INSERT INTO source_tables (table_name, source_filename, source_kind, row_count, columns_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            table_name,
            path.name,
            source_kind,
            len(rows),
            json.dumps(
                [
                    {
                        "column_name": column,
                        "source_column_name": source_column,
                        "sqlite_type": column_type,
                    }
                    for column, source_column, column_type in zip(normalized_columns, source_columns, column_types)
                ],
                sort_keys=True,
            ),
        ),
    )
    connection.executemany(
        """
        INSERT INTO source_columns (table_name, column_name, source_column_name, sqlite_type)
        VALUES (?, ?, ?, ?)
        """,
        [
            (table_name, column, source_column, column_type)
            for column, source_column, column_type in zip(normalized_columns, source_columns, column_types)
        ],
    )
    return len(rows)


def regenerate_ratings(input_dir: Path, output_dir: Path) -> None:
    command = [
        sys.executable,
        str(REPO_ROOT / "scripts/build_ratings.py"),
        "--input-dir",
        str(input_dir),
        "--output-dir",
        str(output_dir),
    ]
    subprocess.run(command, cwd=REPO_ROOT, check=True)


def create_indexes(connection: sqlite3.Connection) -> None:
    index_statements = [
        "CREATE INDEX idx_races_year_round ON races(year, round)",
        "CREATE INDEX idx_race_results_year_driver ON race_results(year, driver_id)",
        "CREATE INDEX idx_race_results_year_constructor ON race_results(year, constructor_id)",
        "CREATE INDEX idx_race_results_race ON race_results(race_id)",
        "CREATE INDEX idx_race_results_constructor ON race_results(constructor_id)",
        "CREATE INDEX idx_race_results_constructor_car ON race_results(race_id, constructor_id, driver_number)",
        "CREATE INDEX idx_driver_season_ratings_driver_year ON driver_season_ratings(driver_id, year)",
        "CREATE INDEX idx_driver_season_ratings_score ON driver_season_ratings(score DESC)",
        "CREATE INDEX idx_driver_season_ratings_year_rank ON driver_season_ratings(year, season_rank)",
    ]
    for statement in index_statements:
        connection.execute(statement)


def create_views(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        DROP VIEW IF EXISTS completed_seasons;
        DROP VIEW IF EXISTS constructor_season_race_results;
        DROP VIEW IF EXISTS leaderboard_constructor_seasons;
        DROP VIEW IF EXISTS constructor_race_peaks;
        DROP VIEW IF EXISTS constructor_car_race_results;

        CREATE VIEW completed_seasons AS
        SELECT
          s.year,
          COUNT(DISTINCT r.id) AS scheduled_races,
          COUNT(DISTINCT rr.race_id) AS completed_races,
          CASE
            WHEN COUNT(DISTINCT r.id) > 0
             AND COUNT(DISTINCT r.id) = COUNT(DISTINCT rr.race_id)
            THEN 1 ELSE 0
          END AS is_completed
        FROM seasons s
        LEFT JOIN races r ON r.year = s.year
        LEFT JOIN race_results rr ON rr.race_id = r.id
        GROUP BY s.year;

        DROP VIEW IF EXISTS leaderboard_driver_seasons;
        CREATE VIEW leaderboard_driver_seasons AS
        SELECT
          dsr.*,
          CASE
            WHEN dsr.scheduled_races > 0
             AND dsr.completed_races = dsr.scheduled_races
            THEN 1 ELSE 0
          END AS is_completed_season,
          CASE
            WHEN dsr.race_share >= 0.75
             AND dsr.entries >= 4
            THEN 1 ELSE 0
          END AS is_default_qualified
        FROM driver_season_ratings dsr;

        DROP VIEW IF EXISTS constructor_car_race_results;
        CREATE VIEW constructor_car_race_results AS
        WITH grouped_cars AS (
          SELECT
            rr.year,
            rr.round,
            rr.race_id,
            rr.constructor_id,
            rr.driver_number,
            GROUP_CONCAT(COALESCE(d.abbreviation, UPPER(SUBSTR(d.id, 1, 3))), '/') AS driver_abbreviations,
            GROUP_CONCAT(COALESCE(d.name, rr.driver_id), ' / ') AS driver_names,
            MIN(CASE
              WHEN rr.position_display_order IS NOT NULL
               AND rr.position_display_order > 0
              THEN rr.position_display_order
            END) AS display_order_sort,
            MIN(CASE
              WHEN rr.position_number IS NOT NULL
               AND rr.position_number > 0
              THEN rr.position_number
            END) AS position_number,
            MIN(CASE
              WHEN rr.position_text IS NOT NULL
               AND rr.position_text <> ''
              THEN rr.position_text
            END) AS position_text,
            MIN(CASE
              WHEN rr.qualification_position_number IS NOT NULL
               AND rr.qualification_position_number > 0
              THEN rr.qualification_position_number
            END) AS qualification_position_number,
            MIN(CASE
              WHEN rr.qualification_position_text IS NOT NULL
               AND rr.qualification_position_text <> ''
              THEN rr.qualification_position_text
            END) AS qualification_position_text,
            MIN(CASE
              WHEN rr.grid_position_number IS NOT NULL
               AND rr.grid_position_number > 0
              THEN rr.grid_position_number
            END) AS grid_position_number,
            MIN(CASE
              WHEN rr.grid_position_text IS NOT NULL
               AND rr.grid_position_text <> ''
              THEN rr.grid_position_text
            END) AS grid_position_text,
            ROUND(SUM(COALESCE(rr.points, 0)), 3) AS points,
            MAX(CASE WHEN rr.pole_position = 1 THEN 1 ELSE 0 END) AS pole_position,
            MAX(CASE WHEN rr.fastest_lap = 1 THEN 1 ELSE 0 END) AS fastest_lap,
            MAX(CASE WHEN rr.driver_of_the_day = 1 THEN 1 ELSE 0 END) AS driver_of_the_day,
            MAX(CASE WHEN rr.grand_slam = 1 THEN 1 ELSE 0 END) AS grand_slam
          FROM race_results rr
          LEFT JOIN drivers d ON d.id = rr.driver_id
          WHERE rr.constructor_id IS NOT NULL
            AND rr.constructor_id <> ''
          GROUP BY
            rr.year,
            rr.round,
            rr.race_id,
            rr.constructor_id,
            rr.driver_number
        ),
        ordered_cars AS (
          SELECT
            grouped_cars.*,
            ROW_NUMBER() OVER (
              PARTITION BY race_id
              ORDER BY
                COALESCE(display_order_sort, 9999),
                constructor_id,
                driver_number
            ) AS display_position
          FROM grouped_cars
        )
        SELECT
          year,
          round,
          race_id,
          constructor_id,
          driver_number,
          driver_abbreviations,
          driver_names,
          COALESCE(position_number, display_position) AS finish_position,
          position_number,
          position_text,
          qualification_position_number,
          qualification_position_text,
          grid_position_number,
          grid_position_text,
          display_position,
          points,
          pole_position,
          fastest_lap,
          driver_of_the_day,
          grand_slam
        FROM ordered_cars;

        DROP VIEW IF EXISTS constructor_race_peaks;
        CREATE VIEW constructor_race_peaks AS
        WITH car_field_sizes AS (
          SELECT
            race_id,
            COUNT(*) AS field_size
          FROM constructor_car_race_results
          GROUP BY race_id
        ),
        scored_cars AS (
          SELECT
            ccrr.*,
            cfs.field_size,
            CASE
              WHEN ccrr.finish_position IS NOT NULL
               AND ccrr.finish_position > 0
              THEN ccrr.finish_position
              ELSE cfs.field_size + 1
            END AS normalized_finish_position,
            CASE
              WHEN ccrr.qualification_position_number IS NOT NULL
               AND ccrr.qualification_position_number > 0
              THEN ccrr.qualification_position_number
              WHEN ccrr.grid_position_number IS NOT NULL
               AND ccrr.grid_position_number > 0
              THEN ccrr.grid_position_number
              ELSE cfs.field_size + 1
            END AS normalized_qualifying_position,
            CASE
              WHEN ccrr.grid_position_number IS NOT NULL
               AND ccrr.grid_position_number > 0
              THEN ccrr.grid_position_number
              ELSE cfs.field_size + 1
            END AS normalized_grid_position
          FROM constructor_car_race_results ccrr
          JOIN car_field_sizes cfs ON cfs.race_id = ccrr.race_id
        ),
        ranked_cars AS (
          SELECT
            scored_cars.*,
            ROW_NUMBER() OVER (
              PARTITION BY race_id, constructor_id
              ORDER BY
                normalized_finish_position,
                display_position,
                driver_number
            ) AS finish_rank,
            ROW_NUMBER() OVER (
              PARTITION BY race_id, constructor_id
              ORDER BY
                normalized_qualifying_position,
                display_position,
                driver_number
            ) AS qualifying_rank,
            ROW_NUMBER() OVER (
              PARTITION BY race_id, constructor_id
              ORDER BY
                normalized_grid_position,
                display_position,
                driver_number
            ) AS grid_rank
          FROM scored_cars
        )
        SELECT
          year,
          round,
          race_id,
          constructor_id,
          field_size,
          COUNT(*) AS car_entries,
          MAX(CASE WHEN finish_rank = 1 THEN normalized_finish_position END) AS best_finish_position,
          MAX(CASE WHEN finish_rank = 1 THEN position_text END) AS best_finish_text,
          MAX(CASE WHEN finish_rank = 1 THEN driver_abbreviations END) AS best_finish_driver_abbreviations,
          MAX(CASE WHEN finish_rank = 1 THEN driver_names END) AS best_finish_driver_names,
          MAX(CASE WHEN qualifying_rank = 1 THEN normalized_qualifying_position END) AS best_qualifying_position,
          MAX(CASE WHEN qualifying_rank = 1 THEN qualification_position_text END) AS best_qualifying_text,
          MAX(CASE WHEN qualifying_rank = 1 THEN driver_abbreviations END) AS best_qualifying_driver_abbreviations,
          MAX(CASE WHEN qualifying_rank = 1 THEN driver_names END) AS best_qualifying_driver_names,
          MAX(CASE WHEN grid_rank = 1 THEN normalized_grid_position END) AS best_grid_position,
          MAX(CASE WHEN grid_rank = 1 THEN grid_position_text END) AS best_grid_text,
          MAX(CASE WHEN grid_rank = 1 THEN driver_abbreviations END) AS best_grid_driver_abbreviations,
          MAX(CASE WHEN grid_rank = 1 THEN driver_names END) AS best_grid_driver_names,
          SUM(COALESCE(points, 0)) AS points,
          SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN finish_position <= 3 THEN 1 ELSE 0 END) AS podiums,
          MAX(CASE WHEN finish_position <= 3 THEN 1 ELSE 0 END) AS podiumed_race,
          SUM(CASE WHEN qualification_position_number = 1 THEN 1 ELSE 0 END) AS poles,
          SUM(CASE WHEN grid_position_number = 1 THEN 1 ELSE 0 END) AS grid_poles,
          MAX(fastest_lap) AS fastest_lap,
          MAX(driver_of_the_day) AS driver_of_the_day,
          MAX(grand_slam) AS grand_slam
        FROM ranked_cars
        GROUP BY
          year,
          round,
          race_id,
          constructor_id,
          field_size;

        DROP VIEW IF EXISTS leaderboard_constructor_seasons;
        CREATE VIEW leaderboard_constructor_seasons AS
        WITH RECURSIVE harmonic(n, value) AS (
          SELECT 0, 0.0
          UNION ALL
          SELECT n + 1, value + (1.0 / (n + 1))
          FROM harmonic
          WHERE n < 200
        ),
        race_losses AS (
          SELECT
            crp.*,
            hf.value AS finish_harmonic_loss,
            hq.value AS qualifying_harmonic_loss,
            hg.value AS grid_harmonic_loss
          FROM constructor_race_peaks crp
          LEFT JOIN harmonic hf ON hf.n = crp.best_finish_position - 1
          LEFT JOIN harmonic hq ON hq.n = crp.best_qualifying_position - 1
          LEFT JOIN harmonic hg ON hg.n = crp.best_grid_position - 1
        )
        SELECT
          rl.year,
          rl.constructor_id,
          c.name AS constructor_name,
          COALESCE(cs.scheduled_races, 0) AS scheduled_races,
          COALESCE(cs.completed_races, 0) AS completed_races,
          COUNT(*) AS entries,
          SUM(rl.car_entries) AS car_entries,
          CASE
            WHEN COALESCE(cs.scheduled_races, 0) > 0
            THEN CAST(COUNT(*) AS REAL) / cs.scheduled_races
            ELSE 0.0
          END AS race_share,
          SUM(rl.wins) AS wins,
          SUM(rl.podiums) AS podiums,
          SUM(rl.podiumed_race) AS podiumed_races,
          SUM(rl.poles) AS poles,
          SUM(rl.grid_poles) AS grid_poles,
          SUM(rl.points) AS points,
          AVG(rl.finish_harmonic_loss) AS avg_finish_harmonic_loss,
          AVG(rl.qualifying_harmonic_loss) AS avg_qualifying_harmonic_loss,
          AVG(rl.grid_harmonic_loss) AS avg_grid_harmonic_loss,
          SUM(rl.finish_harmonic_loss) AS finish_loss_sum,
          SUM(rl.qualifying_harmonic_loss) AS qualifying_loss_sum,
          SUM(rl.grid_harmonic_loss) AS grid_loss_sum,
          CASE
            WHEN COALESCE(cs.scheduled_races, 0) > 0
             AND cs.completed_races = cs.scheduled_races
            THEN 1 ELSE 0
          END AS is_completed_season,
          CASE
            WHEN COALESCE(cs.scheduled_races, 0) > 0
             AND CAST(COUNT(*) AS REAL) / cs.scheduled_races >= 0.75
             AND COUNT(*) >= 4
            THEN 1 ELSE 0
          END AS is_default_qualified
        FROM race_losses rl
        LEFT JOIN constructors c ON c.id = rl.constructor_id
        LEFT JOIN completed_seasons cs ON cs.year = rl.year
        GROUP BY
          rl.year,
          rl.constructor_id,
          c.name,
          cs.scheduled_races,
          cs.completed_races;

        DROP VIEW IF EXISTS constructor_season_race_results;
        CREATE VIEW constructor_season_race_results AS
        SELECT
          crp.year,
          crp.round,
          crp.race_id,
          r.date,
          COALESCE(gp.short_name, gp.name, r.grand_prix_id) AS grand_prix_name,
          r.official_name,
          crp.constructor_id,
          c.name AS constructor_name,
          ci.name AS circuit_name,
          crp.field_size,
          crp.car_entries,
          crp.best_finish_position,
          crp.best_finish_text,
          crp.best_finish_driver_abbreviations,
          crp.best_finish_driver_names,
          crp.best_qualifying_position,
          crp.best_qualifying_text,
          crp.best_qualifying_driver_abbreviations,
          crp.best_qualifying_driver_names,
          crp.best_grid_position,
          crp.best_grid_text,
          crp.best_grid_driver_abbreviations,
          crp.best_grid_driver_names,
          crp.points,
          crp.wins,
          crp.podiums,
          crp.podiumed_race,
          crp.poles,
          crp.grid_poles,
          crp.fastest_lap,
          crp.driver_of_the_day,
          crp.grand_slam
        FROM constructor_race_peaks crp
        LEFT JOIN races r ON r.id = crp.race_id
        LEFT JOIN grands_prix gp ON gp.id = r.grand_prix_id
        LEFT JOIN constructors c ON c.id = crp.constructor_id
        LEFT JOIN circuits ci ON ci.id = r.circuit_id;

        DROP VIEW IF EXISTS driver_season_race_results;
        CREATE VIEW driver_season_race_results AS
        SELECT
          rr.year,
          rr.round,
          rr.race_id,
          r.date,
          COALESCE(gp.short_name, gp.name, r.grand_prix_id) AS grand_prix_name,
          r.official_name,
          rr.driver_id,
          d.name AS driver_name,
          rr.constructor_id,
          c.name AS constructor_name,
          ci.name AS circuit_name,
          rr.position_display_order,
          rr.position_number,
          rr.position_text,
          rr.qualification_position_number,
          rr.qualification_position_text,
          rr.grid_position_number,
          rr.grid_position_text,
          rr.positions_gained,
          rr.laps,
          rr.time,
          rr.gap,
          rr.interval,
          rr.reason_retired,
          rr.points,
          rr.pole_position,
          rr.fastest_lap,
          rr.driver_of_the_day,
          rr.grand_slam
        FROM race_results rr
        LEFT JOIN races r ON r.id = rr.race_id
        LEFT JOIN grands_prix gp ON gp.id = r.grand_prix_id
        LEFT JOIN drivers d ON d.id = rr.driver_id
        LEFT JOIN constructors c ON c.id = rr.constructor_id
        LEFT JOIN circuits ci ON ci.id = r.circuit_id;
        """
    )


def import_rating_metadata(connection: sqlite3.Connection, output_dir: Path) -> None:
    metadata_path = output_dir / "rating_run_metadata.json"
    if not metadata_path.exists():
        return
    insert_metadata(connection, "rating_run_metadata", json.loads(metadata_path.read_text(encoding="utf-8")))


def build_database(args: argparse.Namespace) -> None:
    input_dir = project_path(args.input_dir)
    output_dir = project_path(args.output_dir)
    db_path = project_path(args.db_path)
    frontend_db_path = project_path(args.frontend_db_path)

    if not input_dir.exists():
        raise FileNotFoundError(f"Missing input directory: {input_dir}")

    if not args.skip_ratings:
        regenerate_ratings(input_dir, output_dir)

    raw_csvs = sorted(input_dir.glob("f1db-*.csv"))
    if not raw_csvs:
        raise FileNotFoundError(f"No F1DB CSV files found in {input_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = db_path.with_suffix(".sqlite.tmp")
    if tmp_path.exists():
        tmp_path.unlink()

    connection = sqlite3.connect(tmp_path)
    try:
        connection.execute("PRAGMA journal_mode = OFF")
        connection.execute("PRAGMA synchronous = OFF")
        connection.execute("PRAGMA temp_store = MEMORY")
        create_metadata_tables(connection)

        raw_counts = {}
        for csv_path in raw_csvs:
            table_name = table_name_for_csv(csv_path)
            raw_counts[table_name] = import_csv_table(connection, csv_path, table_name, "f1db_raw")

        rating_counts = {}
        for file_name in RATING_OUTPUTS:
            csv_path = output_dir / file_name
            if not csv_path.exists():
                raise FileNotFoundError(f"Missing rating output: {csv_path}")
            table_name = rating_table_name(csv_path)
            rating_counts[table_name] = import_csv_table(connection, csv_path, table_name, "rating_output")

        create_indexes(connection)
        create_views(connection)
        import_rating_metadata(connection, output_dir)
        insert_metadata(connection, "generated_at", datetime.now(timezone.utc).isoformat())
        insert_metadata(connection, "f1db_snapshot", input_dir.name)
        insert_metadata(connection, "raw_table_count", len(raw_counts))
        insert_metadata(connection, "rating_table_count", len(rating_counts))
        insert_metadata(connection, "raw_row_counts", raw_counts)
        insert_metadata(connection, "rating_row_counts", rating_counts)

        connection.execute("PRAGMA optimize")
        connection.commit()
    finally:
        connection.close()

    tmp_path.replace(db_path)

    if not args.no_frontend_copy:
        frontend_db_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(db_path, frontend_db_path)

    print(f"Wrote SQLite database to {db_path}")
    if not args.no_frontend_copy:
        print(f"Copied SQLite database to {frontend_db_path}")


def main() -> None:
    build_database(parse_args())


if __name__ == "__main__":
    main()
