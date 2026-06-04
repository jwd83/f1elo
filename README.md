# F1 Elo-Style Season Ratings

This repo stores a pinned F1DB CSV input snapshot plus a small Python pipeline for
generating driver-season dominance ratings.

## Current Formula

```text
score = base_rating
      - finish_weight * avg(H(finish_position - 1))
      - qualifying_weight * avg(H(qualifying_position - 1))
```

`H(0)=0`, and `H(n)=1 + 1/2 + ... + 1/n`.

The default parameters are:

```text
base_rating = 3000
finish_weight = 225
qualifying_weight = 75
qualifying_source = qualifying
```

This is a driver-plus-car season dominance score, not a car-corrected driver
skill estimate.

## Data

Raw input data is saved in:

```text
data/raw/f1db-v2026.5.1/
```

The input snapshot is F1DB release `v2026.5.1`, including the original
`f1db-csv.zip` and `checksums_sha256.txt`.

Generated output data is saved in:

```text
data/output/
```

Main outputs:

- `driver_season_ratings.csv`: every driver-season row in the saved input data.
- `driver_season_top.csv`: top-scoring rows, including partial seasons.
- `driver_season_top_qualified.csv`: top-scoring rows filtered to drivers who
  entered at least 75% of a season and at least four races.
- `driver_season_last_3_completed.csv`: all driver-season rows from the latest
  three completed seasons in the saved data.
- `rating_run_metadata.json`: parameters and run metadata for the generated files.

## Rerun

Run with defaults:

```bash
python3 scripts/build_ratings.py
```

Tune the formula:

```bash
python3 scripts/build_ratings.py \
  --base-rating 3000 \
  --finish-weight 225 \
  --qualifying-weight 75
```

Use starting grid instead of raw qualifying position:

```bash
python3 scripts/build_ratings.py --qualifying-source grid
```

Write an alternate tuned output directory:

```bash
python3 scripts/build_ratings.py \
  --finish-weight 250 \
  --qualifying-weight 50 \
  --output-dir data/output_finish250_qual50
```

Adjust the qualified-top filter:

```bash
python3 scripts/build_ratings.py \
  --qualified-min-race-share 0.75 \
  --qualified-min-entries 4
```

Change the number of recent completed seasons:

```bash
python3 scripts/build_ratings.py --recent-completed-seasons 5
```
