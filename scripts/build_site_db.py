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
        "CREATE INDEX idx_race_results_race ON race_results(race_id)",
        "CREATE INDEX idx_race_results_constructor ON race_results(constructor_id)",
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
