#!/usr/bin/env python3
"""Build F1 driver-season dominance ratings from saved F1DB CSV inputs."""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_INPUT_DIR = Path("data/raw/f1db-v2026.5.1")
DEFAULT_OUTPUT_DIR = Path("data/output")
LEGACY_INDY500_GRAND_PRIX_ID = "indianapolis"
LEGACY_INDY500_FIRST_YEAR = 1950
LEGACY_INDY500_LAST_YEAR = 1960


@dataclass
class DriverSeason:
    year: int
    driver_id: str
    driver_name: str
    scheduled_races: int
    completed_races: int
    entries: int = 0
    finish_loss_sum: float = 0.0
    qualifying_loss_sum: float = 0.0
    grid_loss_sum: float = 0.0
    missed_finish_loss_sum: float = 0.0
    missed_qualifying_loss_sum: float = 0.0
    missed_grid_loss_sum: float = 0.0
    wins: int = 0
    podiums: int = 0
    poles: int = 0
    grid_poles: int = 0
    points: float = 0.0
    constructors: set[str] = field(default_factory=set)
    entered_race_ids: set[str] = field(default_factory=set)

    @property
    def race_share(self) -> float:
        if self.scheduled_races == 0:
            return 0.0
        return self.entries / self.scheduled_races

    @property
    def avg_finish_loss(self) -> float:
        if self.entries == 0:
            return 0.0
        return self.finish_loss_sum / self.entries

    @property
    def avg_qualifying_loss(self) -> float:
        if self.entries == 0:
            return 0.0
        return self.qualifying_loss_sum / self.entries

    @property
    def avg_grid_loss(self) -> float:
        if self.entries == 0:
            return 0.0
        return self.grid_loss_sum / self.entries

    @property
    def missed_completed_races(self) -> int:
        return max(self.completed_races - self.entries, 0)

    @property
    def score_denominator(self) -> int:
        return max(self.completed_races, self.entries, 1)

    @property
    def avg_scored_finish_loss(self) -> float:
        return (self.finish_loss_sum + self.missed_finish_loss_sum) / self.score_denominator

    @property
    def avg_scored_qualifying_loss(self) -> float:
        return (self.qualifying_loss_sum + self.missed_qualifying_loss_sum) / self.score_denominator

    @property
    def avg_scored_grid_loss(self) -> float:
        return (self.grid_loss_sum + self.missed_grid_loss_sum) / self.score_denominator


@dataclass
class DriverRace:
    year: int
    race_id: str
    driver_id: str
    finish_position: int
    qualifying_position: int
    grid_position: int
    points: float = 0.0
    constructors: set[str] = field(default_factory=set)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate F1 driver-season ratings using a tunable harmonic penalty "
            "formula over race finishing position and qualifying position."
        )
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help=f"Directory containing extracted F1DB CSV files (default: {DEFAULT_INPUT_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory for generated CSV/metadata outputs (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--base-rating",
        type=float,
        default=3000.0,
        help="Rating before finish/qualifying penalties are applied.",
    )
    parser.add_argument(
        "--finish-weight",
        type=float,
        default=225.0,
        help="Multiplier for average harmonic race-finish loss.",
    )
    parser.add_argument(
        "--qualifying-weight",
        type=float,
        default=75.0,
        help="Multiplier for average harmonic qualifying loss.",
    )
    parser.add_argument(
        "--qualifying-source",
        choices=("qualifying", "grid"),
        default="qualifying",
        help=(
            "Use raw qualifying position when available, or use starting grid "
            "position. The qualifying option falls back to grid when missing."
        ),
    )
    parser.add_argument(
        "--top-limit",
        type=int,
        default=500,
        help="Number of rows to write to driver_season_top.csv.",
    )
    parser.add_argument(
        "--qualified-min-race-share",
        type=float,
        default=0.75,
        help="Minimum scheduled-season race share for driver_season_top_qualified.csv.",
    )
    parser.add_argument(
        "--qualified-min-entries",
        type=int,
        default=4,
        help="Minimum entries for driver_season_top_qualified.csv.",
    )
    parser.add_argument(
        "--recent-completed-seasons",
        type=int,
        default=3,
        help="Number of latest completed seasons to write to driver_season_last_3_completed.csv.",
    )
    parser.add_argument(
        "--include-legacy-indy500",
        action="store_true",
        dest="include_legacy_indy500",
        help=(
            "Include the Indianapolis 500 races that counted toward the World "
            "Championship from 1950 through 1960. This is the default."
        ),
    )
    parser.add_argument(
        "--exclude-legacy-indy500",
        action="store_false",
        dest="include_legacy_indy500",
        help="Exclude the 1950 through 1960 Indianapolis 500 races from the rating CSVs.",
    )
    parser.set_defaults(include_legacy_indy500=True)
    return parser.parse_args()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def required_csv(input_dir: Path, file_name: str) -> Path:
    path = input_dir / file_name
    if not path.exists():
        raise FileNotFoundError(f"Missing required input CSV: {path}")
    return path


def int_or_none(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def float_or_zero(value: str | None) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def harmonic_numbers(max_n: int) -> list[float]:
    values = [0.0] * (max_n + 1)
    running = 0.0
    for n in range(1, max_n + 1):
        running += 1.0 / n
        values[n] = running
    return values


def load_driver_names(input_dir: Path) -> dict[str, str]:
    rows = read_csv(required_csv(input_dir, "f1db-drivers.csv"))
    return {row["id"]: row["name"] for row in rows}


def is_legacy_indy500_race(row: dict[str, str]) -> bool:
    return (
        row.get("grandPrixId") == LEGACY_INDY500_GRAND_PRIX_ID
        and LEGACY_INDY500_FIRST_YEAR <= int(row["year"]) <= LEGACY_INDY500_LAST_YEAR
    )


def load_legacy_indy500_race_ids(input_dir: Path) -> set[str]:
    rows = read_csv(required_csv(input_dir, "f1db-races.csv"))
    return {row["id"] for row in rows if is_legacy_indy500_race(row)}


def load_scheduled_race_ids(input_dir: Path, include_legacy_indy500: bool) -> dict[int, set[str]]:
    rows = read_csv(required_csv(input_dir, "f1db-races.csv"))
    race_ids: dict[int, set[str]] = defaultdict(set)
    for row in rows:
        if not include_legacy_indy500 and is_legacy_indy500_race(row):
            continue
        race_ids[int(row["year"])].add(row["id"])
    return dict(race_ids)


def result_field_sizes(results: Iterable[dict[str, str]]) -> dict[str, int]:
    sizes: dict[str, int] = defaultdict(int)
    for row in results:
        sizes[row["raceId"]] += 1
    return dict(sizes)


def completed_races_by_year(results: Iterable[dict[str, str]]) -> dict[int, int]:
    race_ids: dict[int, set[str]] = defaultdict(set)
    for row in results:
        race_ids[int(row["year"])].add(row["raceId"])
    return {year: len(ids) for year, ids in race_ids.items()}


def position_or_back_marker(value: str | None, field_size: int) -> int:
    position = int_or_none(value)
    if position is None or position <= 0:
        return field_size + 1
    return position


def build_driver_seasons(args: argparse.Namespace) -> list[DriverSeason]:
    input_dir = args.input_dir
    driver_names = load_driver_names(input_dir)
    scheduled_race_ids = load_scheduled_race_ids(input_dir, args.include_legacy_indy500)
    scheduled_races = {year: len(race_ids) for year, race_ids in scheduled_race_ids.items()}
    legacy_indy500_race_ids = load_legacy_indy500_race_ids(input_dir)
    results = read_csv(required_csv(input_dir, "f1db-races-race-results.csv"))
    if not args.include_legacy_indy500:
        results = [row for row in results if row["raceId"] not in legacy_indy500_race_ids]
    field_sizes = result_field_sizes(results)
    completed_races = completed_races_by_year(results)
    max_field_size = max(field_sizes.values(), default=0) + 1
    harmonic = harmonic_numbers(max_field_size)

    driver_races: dict[tuple[int, str, str], DriverRace] = {}
    seasons: dict[tuple[int, str], DriverSeason] = {}

    for row in results:
        year = int(row["year"])
        race_id = row["raceId"]
        driver_id = row["driverId"]
        field_size = field_sizes[race_id]
        finish_position = position_or_back_marker(row.get("positionDisplayOrder"), field_size)
        grid_position = position_or_back_marker(row.get("gridPositionNumber"), field_size)

        qualifying_position = int_or_none(row.get("qualificationPositionNumber"))
        if args.qualifying_source == "grid" or qualifying_position is None or qualifying_position <= 0:
            qualifying_position = grid_position

        race_key = (year, race_id, driver_id)
        if race_key not in driver_races:
            driver_races[race_key] = DriverRace(
                year=year,
                race_id=race_id,
                driver_id=driver_id,
                finish_position=finish_position,
                qualifying_position=qualifying_position,
                grid_position=grid_position,
            )

        driver_race = driver_races[race_key]
        driver_race.finish_position = min(driver_race.finish_position, finish_position)
        driver_race.qualifying_position = min(driver_race.qualifying_position, qualifying_position)
        driver_race.grid_position = min(driver_race.grid_position, grid_position)
        driver_race.points += float_or_zero(row.get("points"))
        if row.get("constructorId"):
            driver_race.constructors.add(row["constructorId"])

    for driver_race in driver_races.values():
        year = driver_race.year
        driver_id = driver_race.driver_id
        key = (year, driver_id)
        if key not in seasons:
            seasons[key] = DriverSeason(
                year=year,
                driver_id=driver_id,
                driver_name=driver_names.get(driver_id, driver_id),
                scheduled_races=scheduled_races.get(year, 0),
                completed_races=completed_races.get(year, 0),
            )

        season = seasons[key]
        season.entries += 1
        season.entered_race_ids.add(driver_race.race_id)
        season.finish_loss_sum += harmonic[min(driver_race.finish_position - 1, max_field_size)]
        season.qualifying_loss_sum += harmonic[min(driver_race.qualifying_position - 1, max_field_size)]
        season.grid_loss_sum += harmonic[min(driver_race.grid_position - 1, max_field_size)]
        season.wins += int(driver_race.finish_position == 1)
        season.podiums += int(driver_race.finish_position <= 3)
        season.poles += int(driver_race.qualifying_position == 1)
        season.grid_poles += int(driver_race.grid_position == 1)
        season.points += driver_race.points
        season.constructors.update(driver_race.constructors)

    completed_race_ids_by_year: dict[int, set[str]] = defaultdict(set)
    for row in results:
        completed_race_ids_by_year[int(row["year"])].add(row["raceId"])

    for season in seasons.values():
        missed_race_ids = completed_race_ids_by_year.get(season.year, set()) - season.entered_race_ids
        for race_id in missed_race_ids:
            missed_loss = harmonic[min(field_sizes[race_id], max_field_size)]
            season.missed_finish_loss_sum += missed_loss
            season.missed_qualifying_loss_sum += missed_loss
            season.missed_grid_loss_sum += missed_loss

    return list(seasons.values())


def rating(season: DriverSeason, args: argparse.Namespace) -> float:
    return (
        args.base_rating
        - args.finish_weight * season.avg_scored_finish_loss
        - args.qualifying_weight * season.avg_scored_qualifying_loss
    )


def pct(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def ranked_rows(seasons: list[DriverSeason], args: argparse.Namespace) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for season in seasons:
        if season.entries == 0:
            continue
        rows.append(
            {
                "year": season.year,
                "driver_id": season.driver_id,
                "driver_name": season.driver_name,
                "constructors": "/".join(sorted(season.constructors)),
                "score": rating(season, args),
                "scheduled_races": season.scheduled_races,
                "completed_races": season.completed_races,
                "entries": season.entries,
                "race_share": season.race_share,
                "missed_completed_races": season.missed_completed_races,
                "wins": season.wins,
                "win_rate": pct(season.wins, season.entries),
                "podiums": season.podiums,
                "podium_rate": pct(season.podiums, season.entries),
                "poles": season.poles,
                "pole_rate": pct(season.poles, season.entries),
                "grid_poles": season.grid_poles,
                "points": season.points,
                "avg_finish_harmonic_loss": season.avg_finish_loss,
                "avg_qualifying_harmonic_loss": season.avg_qualifying_loss,
                "avg_grid_harmonic_loss": season.avg_grid_loss,
                "avg_scored_finish_harmonic_loss": season.avg_scored_finish_loss,
                "avg_scored_qualifying_harmonic_loss": season.avg_scored_qualifying_loss,
                "avg_scored_grid_harmonic_loss": season.avg_scored_grid_loss,
                "finish_loss_sum": season.finish_loss_sum,
                "qualifying_loss_sum": season.qualifying_loss_sum,
                "grid_loss_sum": season.grid_loss_sum,
                "missed_finish_loss_sum": season.missed_finish_loss_sum,
                "missed_qualifying_loss_sum": season.missed_qualifying_loss_sum,
                "missed_grid_loss_sum": season.missed_grid_loss_sum,
            }
        )

    rows.sort(key=lambda row: (int(row["year"]), -float(row["score"]), str(row["driver_name"])))
    year_counts: dict[int, int] = defaultdict(int)
    for row in rows:
        year = int(row["year"])
        year_counts[year] += 1
        row["season_rank"] = year_counts[year]

    overall_sorted = sorted(rows, key=lambda row: (-float(row["score"]), int(row["year"]), str(row["driver_name"])))
    for index, row in enumerate(overall_sorted, start=1):
        row["overall_rank"] = index

    return rows


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        raise ValueError(f"No rows to write for {path}")

    preferred_order = [
        "year",
        "season_rank",
        "overall_rank",
        "driver_id",
        "driver_name",
        "constructors",
        "score",
        "scheduled_races",
        "completed_races",
        "entries",
        "race_share",
        "missed_completed_races",
        "wins",
        "win_rate",
        "podiums",
        "podium_rate",
        "poles",
        "pole_rate",
        "grid_poles",
        "points",
        "avg_finish_harmonic_loss",
        "avg_qualifying_harmonic_loss",
        "avg_grid_harmonic_loss",
        "avg_scored_finish_harmonic_loss",
        "avg_scored_qualifying_harmonic_loss",
        "avg_scored_grid_harmonic_loss",
        "finish_loss_sum",
        "qualifying_loss_sum",
        "grid_loss_sum",
        "missed_finish_loss_sum",
        "missed_qualifying_loss_sum",
        "missed_grid_loss_sum",
    ]
    fieldnames = [name for name in preferred_order if name in rows[0]]

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_metadata(path: Path, args: argparse.Namespace, rows: list[dict[str, object]]) -> None:
    years = [int(row["year"]) for row in rows]
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input_dir": str(args.input_dir),
        "outputs": {
            "driver_season_ratings": "driver_season_ratings.csv",
            "driver_season_top": "driver_season_top.csv",
            "driver_season_top_qualified": "driver_season_top_qualified.csv",
            "driver_season_last_3_completed": "driver_season_last_3_completed.csv",
        },
        "formula": {
            "description": (
                "score = base_rating - finish_weight * avg_scored(H(finish_position - 1)) "
                "- qualifying_weight * avg_scored(H(qualifying_position - 1)); "
                "missed completed races count as back-marker harmonic losses"
            ),
            "base_rating": args.base_rating,
            "finish_weight": args.finish_weight,
            "qualifying_weight": args.qualifying_weight,
            "qualifying_source": args.qualifying_source,
            "harmonic_definition": "H(0)=0; H(n)=sum(1/i for i in 1..n)",
        },
        "qualified_top_filter": {
            "min_race_share": args.qualified_min_race_share,
            "min_entries": args.qualified_min_entries,
        },
        "recent_completed_seasons": args.recent_completed_seasons,
        "include_legacy_indy500": args.include_legacy_indy500,
        "row_count": len(rows),
        "first_year": min(years) if years else None,
        "last_year": max(years) if years else None,
    }
    path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def recent_completed_rows(rows: list[dict[str, object]], season_count: int) -> list[dict[str, object]]:
    completed_years = sorted(
        {
            int(row["year"])
            for row in rows
            if int(row["scheduled_races"]) > 0
            and int(row["completed_races"]) == int(row["scheduled_races"])
        },
        reverse=True,
    )[:season_count]
    selected_years = set(completed_years)
    return [
        row
        for row in sorted(rows, key=lambda row: (int(row["year"]), int(row["season_rank"])))
        if int(row["year"]) in selected_years
    ]


def main() -> None:
    args = parse_args()
    seasons = build_driver_seasons(args)
    rows = ranked_rows(seasons, args)
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    write_csv(output_dir / "driver_season_ratings.csv", rows)
    top_rows = sorted(rows, key=lambda row: int(row["overall_rank"]))[: args.top_limit]
    write_csv(output_dir / "driver_season_top.csv", top_rows)
    qualified_rows = [
        row
        for row in sorted(rows, key=lambda row: (-float(row["score"]), int(row["year"]), str(row["driver_name"])))
        if float(row["race_share"]) >= args.qualified_min_race_share
        and int(row["entries"]) >= args.qualified_min_entries
    ][: args.top_limit]
    write_csv(output_dir / "driver_season_top_qualified.csv", qualified_rows)
    recent_rows = recent_completed_rows(rows, args.recent_completed_seasons)
    write_csv(output_dir / "driver_season_last_3_completed.csv", recent_rows)
    write_metadata(output_dir / "rating_run_metadata.json", args, rows)

    print(f"Wrote {len(rows):,} driver-season rows to {output_dir / 'driver_season_ratings.csv'}")
    print(f"Wrote top {len(top_rows):,} rows to {output_dir / 'driver_season_top.csv'}")
    print(f"Wrote qualified top {len(qualified_rows):,} rows to {output_dir / 'driver_season_top_qualified.csv'}")
    print(f"Wrote recent completed rows {len(recent_rows):,} rows to {output_dir / 'driver_season_last_3_completed.csv'}")
    print(f"Wrote metadata to {output_dir / 'rating_run_metadata.json'}")


if __name__ == "__main__":
    main()
