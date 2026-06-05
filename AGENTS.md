# Agent Notes

## Product Direction

Build this project into a static, local-first F1 rating lab powered by a bundled
SQLite database and a Vite/React frontend.

The v0 experience should open on a primary leaderboard explorer with visible
model controls. It should feel like a polished retro technical timing screen:
dense, fast, high-contrast, data-forward, and motorsport-specific.

## V0 Scope

- Canonical ranking: driver-season dominance using the existing formula.
- Default filters:
  - `race_share >= 0.75`
  - `entries >= 4`
  - completed seasons only
- Add a toggle to include incomplete/current seasons.
- Let users adjust only the existing model parameters for v0:
  - `base_rating`
  - `finish_weight`
  - `qualifying_weight`
  - `qualifying_source`
- Recompute rankings live in the browser from per-driver-season aggregate fields.
- Include constructors in the leaderboard as context.
- Postpone teammate, team-strength, and team-adjusted signals.
- Include a compact race-by-race drilldown for the selected driver-season.

## Data Architecture

- Add a separate SQLite build script, likely `scripts/build_site_db.py`.
- Do not fold SQLite generation into `scripts/build_ratings.py`; keep the rating
  CSV pipeline separate from the site database pipeline.
- The SQLite build script should regenerate the default ratings outputs before
  importing them by default. A future skip flag is fine if rebuild time matters.
- Generate a bundled SQLite database for the frontend, likely under a future
  public/static assets path.
- Keep the frontend-visible SQLite file synchronized whenever data is rebuilt.
  Prefer one rebuild command/script that refreshes ratings, builds the canonical
  SQLite database, and copies or emits the database to the path the Vite app
  serves.
- Mirror all F1DB CSV tables into SQLite.
- Normalize raw table names to SQL-friendly names while preserving the original
  CSV filename in metadata.
  - Example: `f1db-races-race-results.csv` should become `race_results`.
- Use query-friendly typing rather than importing every field as text.
- Use hybrid typing:
  - Infer types automatically where safe.
  - Add overrides for important columns, especially IDs, dates, booleans,
    ranking/position fields, and fields where blank values should become `NULL`.
- Preserve provenance in metadata tables, including source CSV filename and the
  input F1DB snapshot.
- Include rating aggregate/output tables in SQLite, especially the fields needed
  for instant browser-side recomputation:
  - `avg_finish_harmonic_loss`
  - `avg_qualifying_harmonic_loss`
  - `avg_grid_harmonic_loss`
  - `entries`
  - `race_share`
  - `wins`
  - `podiums`
  - `poles`
  - `grid_poles`
  - `points`
- Create app-ready SQL views on top of the raw and rating tables, such as
  leaderboard rows, completed seasons, and selected driver-season race results.

## Frontend Architecture

- Use Vite and React.
- Use `sql.js` for v0 browser-side SQLite queries.
- Treat the bundled SQLite database as read-only in v0.
- Store user model settings separately as frontend state/exportable JSON later.
- Run heavier SQLite work off the main UI path where practical so the interface
  remains responsive.

## Rebuild Workflow

- Main rebuild command:
  `python3 scripts/build_site_db.py`
- Rebuild flow:
  1. The script regenerates default rating CSV outputs.
  2. The script mirrors all raw F1DB CSV tables into SQLite.
  3. The script imports rating output tables.
  4. The script creates indexes and app-ready SQL views.
  5. The script writes `data/output/f1elo.sqlite`.
  6. The script copies the database to `site/public/f1elo.sqlite` so the app
     stays current after rebuild.
- Avoid requiring separate manual copy steps for normal rebuilds.
- Site dev command:
  `cd site && npm run dev -- --host 127.0.0.1`
- Site build command:
  `cd site && npm run build`

## Deferred Ideas

- Advanced model builder using additional fields such as points, wins, podiums,
  poles, DNFs, teammate comparisons, and team-adjusted signals.
- User-authored read-only SQL playground.
- Named model workspaces and model comparison/export.
- Official SQLite WASM with OPFS if persistent user-created tables/views become
  important.
