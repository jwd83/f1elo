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
- `f1elo.sqlite`: bundled SQLite database for the site explorer.

The site-served copy of the SQLite database is written to:

```text
site/public/f1elo.sqlite
```

## Site Explorer

The `site/` directory contains a Vite/React frontend that loads the bundled
SQLite database with `sql.js`. It opens on a driver-season dominance leaderboard
and includes a Driver/Constructor toggle, with visible controls for the current
scoring model:

- `base_rating`
- `finish_weight`
- `qualifying_weight`
- `qualifying_source`

The default leaderboard filters are:

```text
race_share >= 0.75
entries >= 4
completed seasons only
```

Rows can be searched, re-ranked live in the browser, and opened for a compact
race-by-race drilldown.

Constructor mode ranks constructor-seasons by each constructor's peak car result
per race. Finish, qualifying, and grid peaks are selected independently, shared
cars are collapsed to one physical car result, points use the full constructor
race haul, and the drilldown shows which driver supplied each peak value.

## Rerun

Run with defaults:

```bash
python3 scripts/build_ratings.py
```

Build the site SQLite database and keep the frontend copy current:

```bash
python3 scripts/build_site_db.py
```

That command regenerates the default rating CSVs, mirrors all raw F1DB CSV tables
into SQLite, imports the rating outputs, creates app-ready views and indexes, and
copies the finished database to `site/public/f1elo.sqlite`.

Run the site locally:

```bash
cd site
npm install
npm run dev -- --host 127.0.0.1
```

Build the site:

```bash
cd site
npm run build
```

## GitHub Pages Deploy

This repo is set up to publish the Vite build from `site/dist` with GitHub
Actions. The workflow rebuilds the default rating CSVs, rebuilds
`site/public/f1elo.sqlite`, runs the Vite build, and deploys the static artifact.

On GitHub:

1. Open `jwd83/f1elo` > Settings > Pages.
2. Under Build and deployment, set Source to `GitHub Actions`.
3. Under Custom domain, enter `driverscore.jwd.me` and save it.
4. When GitHub reports the domain is ready, enable Enforce HTTPS.

In Cloudflare DNS for `jwd.me`, create this record:

```text
Type: CNAME
Name: driverscore
Target: jwd83.github.io
Proxy status: DNS only
TTL: Auto
```

Keep the CNAME pointed directly at `jwd83.github.io`, without the repository
name. GitHub also recommends verifying `jwd.me` in your GitHub account Pages
settings to reduce custom-domain takeover risk; GitHub will show the exact TXT
record to add in Cloudflare.

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
