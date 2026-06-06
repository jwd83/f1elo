# Multi-Season Peak

## Purpose

Add a `Multi-season peak` slider that turns the leaderboard from a single
driver-season ranking into a best-`X` seasons per driver ranking.

At `1`, the slider is displayed as `Off` and the app preserves the existing
single-season leaderboard. At values `2` through `23`, each row represents one
driver's best `X` eligible seasons under the current model settings.

## Eligibility

Season eligibility is resolved before grouping:

1. Exclude incomplete seasons unless `Incomplete seasons` is enabled.
2. Require `race_share >= minRaceShare`.
3. Require `entries >= minEntries`.
4. Require at least one race entry.

Drivers with fewer than `X` eligible seasons are removed in multi-season mode.
Search is applied after grouping so it can match the final grouped row.

## Scoring And Selection

For every eligible driver-season, recompute `computed_score` from the current
model controls:

```text
score = baseRating
  - finishWeight * avg_finish_harmonic_loss
  - qualifyingWeight * chosen_qualifying_loss
```

`chosen_qualifying_loss` is `avg_qualifying_harmonic_loss` when the qualifying
source is `Qualifying`, and `avg_grid_harmonic_loss` when the source is `Grid`.

In multi-season mode:

1. Group seasons by `driver_id`.
2. Sort each driver's seasons by computed score descending, then year ascending.
3. Select the best `X` seasons.
4. Average selected seasons equally for score and harmonic loss fields.
5. Rank grouped rows by average score descending, best included single-season
   score descending, earliest included year ascending, then driver name.

## Aggregated Fields

Multi-season rows use:

- `year`: grouped selected years in parentheses, sorted ascending.
- `key`: `peak:${X}:${driver_id}`.
- Constructors: unique constructor names ordered chronologically by selected
  seasons, with duplicates collapsed.
- `entries`, `scheduled_races`, `completed_races`, `wins`, `podiums`, active
  pole count, `grid_poles`, and `points`: totals across selected seasons.
- `race_share`: total entries divided by total scheduled races.
- Harmonic loss fields and `computed_score`: equal-season averages.

The `Poles` table column follows the active qualifying source:

- `Qualifying`: use qualifying poles.
- `Grid`: use grid poles.

## UI Behavior

- Slider label: `Multi-season peak`.
- Slider range: `1` to `23`.
- Slider value display: `Off` at `1`, otherwise `X seasons`.
- Reset returns the slider to `1`.
- Table title is `Peak Seasons` at `1`, and `Peak Drivers` at `2+`.
- The season column header is `Season` at `1`, and `Seasons` at `2+`.
- Footer says `eligible seasons` at `1`, and `eligible drivers` at `2+`.
- The empty state is `No matching seasons` in both modes.
- Selection persists by `driver_id` when possible. If the selected driver no
  longer has a visible row, selection falls back to the top row.
- The Top Eight chart uses the same rows as the leaderboard in both modes.

## Detail Drilldown

At `1`, the detail panel remains the current single-season race trace.

At `2+`, the detail panel becomes a peak trace:

- Heading: selected driver plus grouped years.
- Constructors: compact unique constructors, ordered chronologically.
- Penalties: averaged penalties that reconcile to the displayed average score.
- Race list: all races from included seasons, ordered by year ascending then
  round ascending, with a compact year divider before each season.
