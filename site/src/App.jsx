import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Database,
  Flag,
  Gauge,
  RotateCcw,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { loadDatabase, queryRows } from "./db.js";

const DEFAULT_MODEL = {
  baseRating: 3000,
  finishWeight: 225,
  qualifyingWeight: 0,
  qualifyingSource: "qualifying",
  multiSeasonPeak: 1,
  includeIncomplete: false,
  minRaceShare: 0.75,
  minEntries: 4,
};
const MULTI_SEASON_PEAK_MAX = 23;

function parseMetadata(rows) {
  return Object.fromEntries(
    rows.map((row) => {
      try {
        return [row.key, JSON.parse(row.value)];
      } catch {
        return [row.key, row.value];
      }
    }),
  );
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function titleize(value) {
  return String(value)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function modelScore(row, model) {
  const qualifyingLoss =
    model.qualifyingSource === "grid"
      ? toNumber(row.avg_grid_harmonic_loss)
      : toNumber(row.avg_qualifying_harmonic_loss);

  return (
    toNumber(model.baseRating) -
    toNumber(model.finishWeight) * toNumber(row.avg_finish_harmonic_loss) -
    toNumber(model.qualifyingWeight) * qualifyingLoss
  );
}

function rowKey(row) {
  return `${row.year}:${row.driver_id}`;
}

function constructorNames(value, constructors) {
  if (!value) {
    return "-";
  }
  return String(value)
    .split("/")
    .map((id) => constructors.get(id) || titleize(id))
    .join(" / ");
}

function constructorIds(value) {
  if (!value) {
    return [];
  }
  return String(value).split("/").filter(Boolean);
}

function uniqueChronologicalConstructorIds(rows) {
  const seen = new Set();
  const ids = [];

  rows.forEach((row) => {
    constructorIds(row.constructors).forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    });
  });

  return ids;
}

function average(rows, fieldName) {
  if (!rows.length) {
    return 0;
  }
  return (
    rows.reduce((total, row) => total + toNumber(row[fieldName]), 0) /
    rows.length
  );
}

function sum(rows, fieldName) {
  return rows.reduce((total, row) => total + toNumber(row[fieldName]), 0);
}

function activePoleCount(row, model) {
  return model.qualifyingSource === "grid"
    ? toNumber(row.grid_poles)
    : toNumber(row.poles);
}

function compareSeasonRows(a, b) {
  if (b.computed_score !== a.computed_score) {
    return b.computed_score - a.computed_score;
  }
  if (a.year !== b.year) {
    return toNumber(a.year) - toNumber(b.year);
  }
  return String(a.driver_name).localeCompare(String(b.driver_name));
}

function comparePeakRows(a, b) {
  if (b.computed_score !== a.computed_score) {
    return b.computed_score - a.computed_score;
  }
  if (b.best_season_score !== a.best_season_score) {
    return b.best_season_score - a.best_season_score;
  }
  if (a.earliest_year !== b.earliest_year) {
    return a.earliest_year - b.earliest_year;
  }
  return String(a.driver_name).localeCompare(String(b.driver_name));
}

function buildPeakRows(rows, model, constructors, peakSize) {
  const byDriver = new Map();

  rows.forEach((row) => {
    if (!byDriver.has(row.driver_id)) {
      byDriver.set(row.driver_id, []);
    }
    byDriver.get(row.driver_id).push(row);
  });

  return Array.from(byDriver.values())
    .filter((driverRows) => driverRows.length >= peakSize)
    .map((driverRows) => {
      const selectedByScore = [...driverRows]
        .sort(compareSeasonRows)
        .slice(0, peakSize);
      const selectedChronological = [...selectedByScore].sort(
        (a, b) => toNumber(a.year) - toNumber(b.year),
      );
      const selectedYears = selectedChronological.map((row) => toNumber(row.year));
      const constructorIdList = uniqueChronologicalConstructorIds(selectedChronological);
      const entries = sum(selectedChronological, "entries");
      const scheduledRaces = sum(selectedChronological, "scheduled_races");
      const completedRaces = sum(selectedChronological, "completed_races");
      const avgFinishLoss = average(selectedChronological, "avg_finish_harmonic_loss");
      const avgQualifyingLoss = average(
        selectedChronological,
        "avg_qualifying_harmonic_loss",
      );
      const avgGridLoss = average(selectedChronological, "avg_grid_harmonic_loss");
      const activePoles = selectedChronological.reduce(
        (total, row) => total + activePoleCount(row, model),
        0,
      );

      return {
        driver_id: selectedChronological[0].driver_id,
        driver_name: selectedChronological[0].driver_name,
        key: `peak:${peakSize}:${selectedChronological[0].driver_id}`,
        year: `(${selectedYears.join(", ")})`,
        season_label: `(${selectedYears.join(", ")})`,
        selected_years: selectedYears,
        season_rows: selectedChronological,
        is_peak: true,
        constructors: constructorIdList.join("/"),
        constructor_names: constructorNames(constructorIdList.join("/"), constructors),
        computed_score: average(selectedChronological, "computed_score"),
        best_season_score: selectedByScore[0].computed_score,
        earliest_year: selectedYears[0],
        scheduled_races: scheduledRaces,
        completed_races: completedRaces,
        entries,
        race_share: scheduledRaces > 0 ? entries / scheduledRaces : 0,
        wins: sum(selectedChronological, "wins"),
        podiums: sum(selectedChronological, "podiums"),
        poles: sum(selectedChronological, "poles"),
        grid_poles: sum(selectedChronological, "grid_poles"),
        active_poles: activePoles,
        points: sum(selectedChronological, "points"),
        avg_finish_harmonic_loss: avgFinishLoss,
        avg_qualifying_harmonic_loss: avgQualifyingLoss,
        avg_grid_harmonic_loss: avgGridLoss,
        is_completed_season: selectedChronological.every(
          (row) => row.is_completed_season === 1,
        )
          ? 1
          : 0,
      };
    });
}

function rowMatchesSearch(row, normalizedSearch) {
  if (!normalizedSearch) {
    return true;
  }

  return [
    row.driver_name,
    row.year,
    row.season_label,
    row.constructors,
    row.constructor_names,
    ...(row.selected_years || []),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

function App() {
  const [db, setDb] = useState(null);
  const [status, setStatus] = useState("Loading SQLite data");
  const [error, setError] = useState("");
  const [seasonRows, setSeasonRows] = useState([]);
  const [constructors, setConstructors] = useState(new Map());
  const [metadata, setMetadata] = useState({});
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [raceRows, setRaceRows] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const loadedDb = await loadDatabase();
        const leaderboard = queryRows(
          loadedDb,
          "SELECT * FROM leaderboard_driver_seasons",
        );
        const constructorRows = queryRows(
          loadedDb,
          "SELECT id, name FROM constructors ORDER BY name",
        );
        const metaRows = queryRows(loadedDb, "SELECT key, value FROM metadata");

        if (cancelled) {
          loadedDb.close();
          return;
        }

        setDb(loadedDb);
        setSeasonRows(leaderboard);
        setConstructors(
          new Map(constructorRows.map((row) => [row.id, row.name])),
        );
        setMetadata(parseMetadata(metaRows));
        setStatus("Ready");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
          setStatus("Failed");
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const peakSize = Math.max(
    1,
    Math.min(MULTI_SEASON_PEAK_MAX, toNumber(model.multiSeasonPeak)),
  );
  const isMultiSeason = peakSize >= 2;

  const scoredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const eligibleSeasonRows = seasonRows
      .map((row) => ({
        ...row,
        key: rowKey(row),
        season_label: String(row.year),
        selected_years: [toNumber(row.year)],
        season_rows: [row],
        is_peak: false,
        computed_score: modelScore(row, model),
        constructor_names: constructorNames(row.constructors, constructors),
        active_poles: activePoleCount(row, model),
      }))
      .filter((row) => model.includeIncomplete || row.is_completed_season === 1)
      .filter((row) => toNumber(row.race_share) >= toNumber(model.minRaceShare))
      .filter((row) => toNumber(row.entries) >= toNumber(model.minEntries))
      .filter((row) => toNumber(row.entries) > 0);

    const rows = isMultiSeason
      ? buildPeakRows(eligibleSeasonRows, model, constructors, peakSize)
          .filter((row) => rowMatchesSearch(row, normalizedSearch))
          .sort(comparePeakRows)
      : eligibleSeasonRows
          .filter((row) => rowMatchesSearch(row, normalizedSearch))
          .sort(compareSeasonRows);

    return rows.map((row, index) => ({ ...row, computed_rank: index + 1 }));
  }, [constructors, isMultiSeason, model, peakSize, search, seasonRows]);

  const tableRows = scoredRows.slice(0, 250);
  const selectedRow = useMemo(() => {
    if (!scoredRows.length) {
      return null;
    }
    return (
      scoredRows.find((row) => row.key === selectedKey) ||
      scoredRows.find((row) => row.driver_id === selectedDriverId) ||
      scoredRows[0]
    );
  }, [scoredRows, selectedDriverId, selectedKey]);

  useEffect(() => {
    if (!scoredRows.length) {
      setSelectedKey("");
      return;
    }

    const nextRow =
      scoredRows.find((row) => row.key === selectedKey) ||
      scoredRows.find((row) => row.driver_id === selectedDriverId) ||
      scoredRows[0];

    if (nextRow.key !== selectedKey) {
      setSelectedKey(nextRow.key);
    }
    if (nextRow.driver_id !== selectedDriverId) {
      setSelectedDriverId(nextRow.driver_id);
    }
  }, [scoredRows, selectedDriverId, selectedKey]);

  useEffect(() => {
    if (!db || !selectedRow) {
      setRaceRows([]);
      return;
    }

    const selectedYears = selectedRow.selected_years || [selectedRow.year];
    const placeholders = selectedYears.map(() => "?").join(", ");
    const rows = queryRows(
      db,
      `
        SELECT *
        FROM driver_season_race_results
        WHERE driver_id = ? AND year IN (${placeholders})
        ORDER BY year, round
      `,
      [selectedRow.driver_id, ...selectedYears],
    );
    setRaceRows(rows);
  }, [db, selectedRow?.driver_id, selectedRow?.key]);

  const leader = scoredRows[0];
  const displayedGeneratedAt =
    typeof metadata.generated_at === "string"
      ? new Date(metadata.generated_at).toLocaleString()
      : "-";

  function selectRow(row) {
    setSelectedKey(row.key);
    setSelectedDriverId(row.driver_id);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark">
            <Gauge size={26} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Driver-season dominance</p>
            <h1>F1 Elo Lab</h1>
          </div>
        </div>
        <div className="status-board" aria-live="polite">
          <Database size={17} aria-hidden="true" />
          <span>{status}</span>
          <span>{metadata.f1db_snapshot || "f1db"}</span>
          <span>{displayedGeneratedAt}</span>
        </div>
      </header>

      {error ? (
        <section className="error-panel">
          <h2>Database load failed</h2>
          <p>{error}</p>
        </section>
      ) : (
        <>
          <section className="top-grid">
            <ModelControls model={model} onChange={setModel} />
            <TimingSnapshot
              leader={leader}
              rows={scoredRows}
              seasonRows={seasonRows}
            />
            <TopChart rows={scoredRows.slice(0, 8)} />
          </section>

          <section className="workspace-grid">
            <div className="leaderboard-panel">
              <div className="panel-toolbar">
                <div>
                  <p className="eyebrow">Leaderboard</p>
                  <h2>{isMultiSeason ? "Peak Drivers" : "Peak Seasons"}</h2>
                </div>
                <div className="search-box">
                  <Search size={16} aria-hidden="true" />
                  <input
                    aria-label="Search leaderboard"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Driver, year, constructor"
                  />
                  {search ? (
                    <button
                      className="clear-search"
                      type="button"
                      onClick={() => setSearch("")}
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>

              <LeaderboardTable
                rows={tableRows}
                selectedKey={selectedRow?.key}
                isMultiSeason={isMultiSeason}
                onSelect={selectRow}
              />

              <div className="table-footer">
                <span>
                  {formatNumber(scoredRows.length)} eligible{" "}
                  {isMultiSeason ? "drivers" : "seasons"}
                </span>
                <span>showing {formatNumber(tableRows.length)}</span>
              </div>
            </div>

            <SeasonDetail
              row={selectedRow}
              raceRows={raceRows}
              model={model}
            />
          </section>
        </>
      )}
    </main>
  );
}

function ModelControls({ model, onChange }) {
  function update(name, value) {
    onChange((current) => ({ ...current, [name]: value }));
  }

  return (
    <section className="control-panel" aria-label="Model controls">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Model</p>
          <h2>Scoring Rig</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => onChange(DEFAULT_MODEL)}
          title="Reset model"
          aria-label="Reset model"
        >
          <RotateCcw size={17} aria-hidden="true" />
        </button>
      </div>

      <Slider
        label="Base"
        value={model.baseRating}
        min={2600}
        max={3400}
        step={10}
        onChange={(value) => update("baseRating", value)}
      />
      <Slider
        label="Finish weight"
        value={model.finishWeight}
        min={0}
        max={400}
        step={5}
        onChange={(value) => update("finishWeight", value)}
      />
      <Slider
        label="Qualifying weight"
        value={model.qualifyingWeight}
        min={0}
        max={400}
        step={5}
        onChange={(value) => update("qualifyingWeight", value)}
      />
      <Slider
        label="Multi-season peak"
        value={model.multiSeasonPeak}
        displayValue={
          model.multiSeasonPeak === 1 ? "Off" : `${model.multiSeasonPeak} seasons`
        }
        min={1}
        max={MULTI_SEASON_PEAK_MAX}
        step={1}
        onChange={(value) => update("multiSeasonPeak", value)}
      />

      <div className="segmented-control" aria-label="Qualifying source">
        <button
          className={model.qualifyingSource === "qualifying" ? "active" : ""}
          type="button"
          onClick={() => update("qualifyingSource", "qualifying")}
        >
          Qualifying
        </button>
        <button
          className={model.qualifyingSource === "grid" ? "active" : ""}
          type="button"
          onClick={() => update("qualifyingSource", "grid")}
        >
          Grid
        </button>
      </div>

      <div className="filter-strip">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={model.includeIncomplete}
            onChange={(event) => update("includeIncomplete", event.target.checked)}
          />
          <span>Incomplete seasons</span>
        </label>
        <label className="compact-input">
          <span>Min share</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={model.minRaceShare}
            onChange={(event) =>
              update("minRaceShare", Number(event.target.value))
            }
          />
        </label>
        <label className="compact-input">
          <span>Min entries</span>
          <input
            type="number"
            min="1"
            max="30"
            step="1"
            value={model.minEntries}
            onChange={(event) => update("minEntries", Number(event.target.value))}
          />
        </label>
      </div>
    </section>
  );
}

function Slider({ label, value, displayValue, min, max, step, onChange }) {
  return (
    <label className="slider-row">
      <span>
        {label}
        <strong>{displayValue || formatNumber(value)}</strong>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => onChange(Number(event.target.value))}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TimingSnapshot({ leader, rows, seasonRows }) {
  return (
    <section className="snapshot-panel" aria-label="Timing snapshot">
      <div className="metric">
        <span>Rows</span>
        <strong>{formatNumber(seasonRows.length)}</strong>
      </div>
      <div className="metric">
        <span>Eligible</span>
        <strong>{formatNumber(rows.length)}</strong>
      </div>
      <div className="metric">
        <span>P1</span>
        <strong>
          {leader ? `${leader.driver_name} ${leader.season_label}` : "-"}
        </strong>
      </div>
      <div className="metric accent">
        <span>Score</span>
        <strong>{leader ? formatNumber(leader.computed_score, 1) : "-"}</strong>
      </div>
    </section>
  );
}

function TopChart({ rows }) {
  const maxScore = rows[0]?.computed_score || 1;
  const minScore = rows[rows.length - 1]?.computed_score || 0;
  const spread = Math.max(maxScore - minScore, 1);

  return (
    <section className="chart-panel" aria-label="Top score chart">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Timing strip</p>
          <h2>Top Eight</h2>
        </div>
        <Activity size={18} aria-hidden="true" />
      </div>
      <div className="bar-list">
        {rows.map((row) => {
          const width = 44 + ((row.computed_score - minScore) / spread) * 56;
          return (
            <div className="bar-row" key={row.key}>
              <span>{row.computed_rank}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${width}%` }} />
                <strong>
                  {row.driver_name} {row.season_label}
                </strong>
              </div>
              <span>{formatNumber(row.computed_score, 0)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LeaderboardTable({ rows, selectedKey, isMultiSeason, onSelect }) {
  return (
    <div className="table-wrap">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>{isMultiSeason ? "Seasons" : "Season"}</th>
            <th>Driver</th>
            <th>Constructor</th>
            <th>Score</th>
            <th>Starts</th>
            <th>Wins</th>
            <th>Podiums</th>
            <th>Poles</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className={row.key === selectedKey ? "selected" : ""}
              key={row.key}
              onClick={() => onSelect(row)}
            >
              <td className="rank-cell">{row.computed_rank}</td>
              <td className="season-cell">{row.season_label}</td>
              <td>
                <button
                  className="driver-pick"
                  type="button"
                  onClick={() => onSelect(row)}
                >
                  {row.driver_name}
                </button>
              </td>
              <td>{row.constructor_names}</td>
              <td className="score-cell">{formatNumber(row.computed_score, 1)}</td>
              <td>
                {row.entries}/{row.scheduled_races}
              </td>
              <td>{row.wins}</td>
              <td>{row.podiums}</td>
              <td>{row.active_poles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeasonDetail({ row, raceRows, model }) {
  if (!row) {
    return (
      <aside className="detail-panel">
        <p className="eyebrow">Season trace</p>
        <h2>No matching seasons</h2>
      </aside>
    );
  }

  const finishPenalty =
    Number(model.finishWeight) * Number(row.avg_finish_harmonic_loss);
  const qualifyingLoss =
    model.qualifyingSource === "grid"
      ? Number(row.avg_grid_harmonic_loss)
      : Number(row.avg_qualifying_harmonic_loss);
  const qualifyingPenalty = Number(model.qualifyingWeight) * qualifyingLoss;
  const traceLabel = row.is_peak ? "Peak trace" : "Season trace";

  return (
    <aside className="detail-panel">
      <div className="detail-hero">
        <div>
          <p className="eyebrow">{traceLabel}</p>
          <h2>
            {row.driver_name} <span>{row.season_label}</span>
          </h2>
          <p>{row.constructor_names}</p>
        </div>
        <div className="score-badge">
          <Trophy size={18} aria-hidden="true" />
          <strong>{formatNumber(row.computed_score, 1)}</strong>
        </div>
      </div>

      <div className="component-grid">
        <div>
          <span>Finish penalty</span>
          <strong>{formatNumber(finishPenalty, 1)}</strong>
        </div>
        <div>
          <span>Quali penalty</span>
          <strong>{formatNumber(qualifyingPenalty, 1)}</strong>
        </div>
        <div>
          <span>Race share</span>
          <strong>{formatPercent(row.race_share)}</strong>
        </div>
        <div>
          <span>Points</span>
          <strong>{formatNumber(row.points, 1)}</strong>
        </div>
      </div>

      <div className="race-list">
        {raceRows.map((race, index) => {
          const previousRace = raceRows[index - 1];
          const showYearDivider =
            row.is_peak && (!previousRace || previousRace.year !== race.year);

          return (
            <Fragment key={`${race.year}:${race.race_id}`}>
              {showYearDivider ? (
                <div className="race-year-divider">{race.year}</div>
              ) : null}
              <div className="race-row">
                <div className="race-round">
                  <Flag size={14} aria-hidden="true" />
                  <span>{race.round}</span>
                </div>
                <div className="race-main">
                  <strong>{race.grand_prix_name}</strong>
                  <span>{race.circuit_name || race.official_name}</span>
                </div>
                <div className="race-result">
                  <span>P{race.position_text || race.position_display_order}</span>
                  <span>Q{race.qualification_position_text || "-"}</span>
                  <span>G{race.grid_position_text || "-"}</span>
                  <strong>{formatNumber(race.points, 1)}</strong>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </aside>
  );
}

export default App;
