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
import {
  constructorIdentities,
  constructorIds,
  constructorLogoSrc,
  getConstructorIdentity,
  primaryConstructorId,
  teamAccentStyle,
  teamIdentityStyle,
} from "./teamIdentity.js";

const DEFAULT_MODEL = {
  mode: "driver",
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

function rowKey(row, mode) {
  const entityId = mode === "constructor" ? row.constructor_id : row.driver_id;
  return `${mode}:${row.year}:${entityId}`;
}

function constructorNames(value, constructors) {
  const identities = constructorIdentities(value, constructors);
  return identities.length
    ? identities.map((identity) => identity.name).join(" / ")
    : "-";
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
  return String(a.entity_name).localeCompare(String(b.entity_name));
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
  return String(a.entity_name).localeCompare(String(b.entity_name));
}

function normalizeSeasonRow(row, mode, constructors, model) {
  if (mode === "constructor") {
    const constructorName = getConstructorIdentity(
      row.constructor_id,
      constructors,
    ).name;

    return {
      ...row,
      entity_type: "constructor",
      entity_id: row.constructor_id,
      entity_name: constructorName,
      key: rowKey(row, "constructor"),
      season_label: String(row.year),
      selected_years: [toNumber(row.year)],
      season_rows: [row],
      is_peak: false,
      constructors: row.constructor_id,
      constructor_names: constructorName,
      computed_score: modelScore(row, model),
      active_poles: activePoleCount(row, model),
    };
  }

  return {
    ...row,
    entity_type: "driver",
    entity_id: row.driver_id,
    entity_name: row.driver_name,
    key: rowKey(row, "driver"),
    season_label: String(row.year),
    selected_years: [toNumber(row.year)],
    season_rows: [row],
    is_peak: false,
    constructor_names: constructorNames(row.constructors, constructors),
    active_poles: activePoleCount(row, model),
    computed_score: modelScore(row, model),
  };
}

function buildPeakRows(rows, model, constructors, peakSize) {
  const byEntity = new Map();

  rows.forEach((row) => {
    if (!byEntity.has(row.entity_id)) {
      byEntity.set(row.entity_id, []);
    }
    byEntity.get(row.entity_id).push(row);
  });

  return Array.from(byEntity.values())
    .filter((entityRows) => entityRows.length >= peakSize)
    .map((entityRows) => {
      const selectedByScore = [...entityRows]
        .sort(compareSeasonRows)
        .slice(0, peakSize);
      const selectedChronological = [...selectedByScore].sort(
        (a, b) => toNumber(a.year) - toNumber(b.year),
      );
      const firstRow = selectedChronological[0];
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
        entity_type: firstRow.entity_type,
        entity_id: firstRow.entity_id,
        entity_name: firstRow.entity_name,
        driver_id: firstRow.driver_id,
        driver_name: firstRow.driver_name,
        constructor_id: firstRow.constructor_id,
        constructor_name: firstRow.constructor_name,
        key: `${firstRow.entity_type}:peak:${peakSize}:${firstRow.entity_id}`,
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
        car_entries: sum(selectedChronological, "car_entries"),
        race_share: scheduledRaces > 0 ? entries / scheduledRaces : 0,
        wins: sum(selectedChronological, "wins"),
        podiums: sum(selectedChronological, "podiums"),
        podiumed_races: sum(selectedChronological, "podiumed_races"),
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
    row.entity_name,
    row.driver_name,
    row.constructor_name,
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

function leaderboardTitle(mode, isMultiSeason) {
  if (mode === "constructor") {
    return isMultiSeason ? "Peak Constructors" : "Constructor Seasons";
  }
  return isMultiSeason ? "Peak Drivers" : "Peak Seasons";
}

function eligibleLabel(mode, isMultiSeason) {
  if (mode === "constructor") {
    return isMultiSeason ? "constructors" : "constructor seasons";
  }
  return isMultiSeason ? "drivers" : "seasons";
}

function positionDisplay(position, text) {
  if (text !== null && text !== undefined && text !== "") {
    return text;
  }
  return formatNumber(position);
}

function placementLabel(prefix, position, text, drivers = "") {
  const driverSuffix = drivers ? ` ${drivers}` : "";
  return `${prefix}${positionDisplay(position, text)}${driverSuffix}`;
}

function App() {
  const [db, setDb] = useState(null);
  const [status, setStatus] = useState("Loading SQLite data");
  const [error, setError] = useState("");
  const [driverSeasonRows, setDriverSeasonRows] = useState([]);
  const [constructorSeasonRows, setConstructorSeasonRows] = useState([]);
  const [constructors, setConstructors] = useState(new Map());
  const [metadata, setMetadata] = useState({});
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
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
        const constructorLeaderboard = queryRows(
          loadedDb,
          "SELECT * FROM leaderboard_constructor_seasons",
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
        setDriverSeasonRows(leaderboard);
        setConstructorSeasonRows(constructorLeaderboard);
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
  const isConstructorMode = model.mode === "constructor";
  const activeSeasonRows = isConstructorMode
    ? constructorSeasonRows
    : driverSeasonRows;

  const scoredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const eligibleSeasonRows = activeSeasonRows
      .map((row) => normalizeSeasonRow(row, model.mode, constructors, model))
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
  }, [activeSeasonRows, constructors, isMultiSeason, model, peakSize, search]);

  const tableRows = scoredRows.slice(0, 250);
  const selectedRow = useMemo(() => {
    if (!scoredRows.length) {
      return null;
    }
    return (
      scoredRows.find((row) => row.key === selectedKey) ||
      scoredRows.find((row) => row.entity_id === selectedEntityId) ||
      scoredRows[0]
    );
  }, [scoredRows, selectedEntityId, selectedKey]);

  useEffect(() => {
    if (!scoredRows.length) {
      setSelectedKey("");
      setSelectedEntityId("");
      return;
    }

    const nextRow =
      scoredRows.find((row) => row.key === selectedKey) ||
      scoredRows.find((row) => row.entity_id === selectedEntityId) ||
      scoredRows[0];

    if (nextRow.key !== selectedKey) {
      setSelectedKey(nextRow.key);
    }
    if (nextRow.entity_id !== selectedEntityId) {
      setSelectedEntityId(nextRow.entity_id);
    }
  }, [scoredRows, selectedEntityId, selectedKey]);

  useEffect(() => {
    if (!db || !selectedRow) {
      setRaceRows([]);
      return;
    }

    const selectedYears = selectedRow.selected_years || [selectedRow.year];
    const placeholders = selectedYears.map(() => "?").join(", ");
    const raceView = isConstructorMode
      ? "constructor_season_race_results"
      : "driver_season_race_results";
    const idField = isConstructorMode ? "constructor_id" : "driver_id";
    const rows = queryRows(
      db,
      `
        SELECT *
        FROM ${raceView}
        WHERE ${idField} = ? AND year IN (${placeholders})
        ORDER BY year, round
      `,
      [selectedRow.entity_id, ...selectedYears],
    );
    setRaceRows(rows);
  }, [db, isConstructorMode, selectedRow?.entity_id, selectedRow?.key]);

  const leader = scoredRows[0];
  const displayedGeneratedAt =
    typeof metadata.generated_at === "string"
      ? new Date(metadata.generated_at).toLocaleString()
      : "-";

  function selectRow(row) {
    setSelectedKey(row.key);
    setSelectedEntityId(row.entity_id);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark">
            <Gauge size={26} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">
              {isConstructorMode
                ? "Constructor peak dominance"
                : "Driver-season dominance"}
            </p>
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
              seasonRows={activeSeasonRows}
              constructors={constructors}
            />
            <TopChart rows={scoredRows.slice(0, 8)} constructors={constructors} />
          </section>

          <section className="workspace-grid">
            <div className="leaderboard-panel">
              <div className="panel-toolbar">
                <div>
                  <p className="eyebrow">Leaderboard</p>
                  <h2>{leaderboardTitle(model.mode, isMultiSeason)}</h2>
                </div>
                <div className="search-box">
                  <Search size={16} aria-hidden="true" />
                  <input
                    aria-label="Search leaderboard"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                      isConstructorMode
                        ? "Constructor or year"
                        : "Driver, year, constructor"
                    }
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
                mode={model.mode}
                constructors={constructors}
                onSelect={selectRow}
              />

              <div className="table-footer">
                <span>
                  {formatNumber(scoredRows.length)} eligible{" "}
                  {eligibleLabel(model.mode, isMultiSeason)}
                </span>
                <span>showing {formatNumber(tableRows.length)}</span>
              </div>
            </div>

            <SeasonDetail
              row={selectedRow}
              raceRows={raceRows}
              model={model}
              mode={model.mode}
              constructors={constructors}
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

      <div className="segmented-control mode-toggle" aria-label="Rating mode">
        <button
          className={model.mode === "driver" ? "active" : ""}
          type="button"
          onClick={() => update("mode", "driver")}
        >
          Driver
        </button>
        <button
          className={model.mode === "constructor" ? "active" : ""}
          type="button"
          onClick={() => update("mode", "constructor")}
        >
          Constructor
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

function TeamLogo({ identity }) {
  return (
    <img
      className={`team-logo ${
        identity.logoFile ? "team-logo-real" : "team-logo-generated"
      }`}
      src={constructorLogoSrc(identity)}
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}

function TeamMark({ identity }) {
  return (
    <span
      className="team-mark"
      style={teamIdentityStyle(identity)}
      title={identity.name}
      aria-hidden="true"
    >
      <TeamLogo identity={identity} />
    </span>
  );
}

function TeamBadge({ identity, showName = true }) {
  return (
    <span
      className="team-badge"
      style={teamIdentityStyle(identity)}
      title={identity.name}
      aria-label={`${identity.code} ${identity.name}`}
    >
      <TeamLogo identity={identity} />
      {showName ? <span className="team-name">{identity.name}</span> : null}
    </span>
  );
}

function TeamBadgeList({
  value,
  constructors,
  maxVisible = Number.POSITIVE_INFINITY,
  showNames = true,
  className = "",
}) {
  const identities = constructorIdentities(value, constructors);

  if (!identities.length) {
    return <span className={`team-strip empty ${className}`.trim()}>-</span>;
  }

  const visibleCount = Number.isFinite(maxVisible)
    ? Math.max(0, maxVisible)
    : identities.length;
  const visible = identities.slice(0, visibleCount);
  const hiddenCount = identities.length - visible.length;
  const title = identities
    .map((identity) => `${identity.name} (${identity.code})`)
    .join(" / ");

  return (
    <span className={`team-strip ${className}`.trim()} title={title}>
      {visible.map((identity) => (
        <TeamBadge
          identity={identity}
          showName={showNames}
          key={identity.id || identity.name}
        />
      ))}
      {hiddenCount > 0 ? <span className="team-more">+{hiddenCount}</span> : null}
    </span>
  );
}

function EntityPick({ row, constructors, showMark, onSelect }) {
  const identity = getConstructorIdentity(primaryConstructorId(row), constructors);

  return (
    <button
      className="entity-pick"
      type="button"
      onClick={() => onSelect(row)}
    >
      {showMark ? <TeamMark identity={identity} /> : null}
      <span className="entity-name-text">{row.entity_name}</span>
    </button>
  );
}

function TimingSnapshot({ leader, rows, seasonRows, constructors }) {
  const leaderIdentity = leader
    ? getConstructorIdentity(primaryConstructorId(leader), constructors)
    : null;

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
        <strong className="snapshot-leader">
          {leaderIdentity ? <TeamMark identity={leaderIdentity} /> : null}
          <span>{leader ? `${leader.entity_name} ${leader.season_label}` : "-"}</span>
        </strong>
      </div>
      <div className="metric accent">
        <span>Score</span>
        <strong>{leader ? formatNumber(leader.computed_score, 1) : "-"}</strong>
      </div>
    </section>
  );
}

function TopChart({ rows, constructors }) {
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
          const identity = getConstructorIdentity(
            primaryConstructorId(row),
            constructors,
          );

          return (
            <div className="bar-row" key={row.key}>
              <span>{row.computed_rank}</span>
              <div
                className="bar-track"
                style={teamIdentityStyle(identity)}
              >
                <div className="bar-fill" style={{ width: `${width}%` }} />
                <strong>
                  <TeamMark identity={identity} />
                  <span>
                    {row.entity_name} {row.season_label}
                  </span>
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

function LeaderboardTable({
  rows,
  selectedKey,
  isMultiSeason,
  mode,
  constructors,
  onSelect,
}) {
  const isConstructorMode = mode === "constructor";

  return (
    <div className="table-wrap">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>{isMultiSeason ? "Seasons" : "Season"}</th>
            <th>{isConstructorMode ? "Constructor" : "Driver"}</th>
            {isConstructorMode ? null : <th>Constructor</th>}
            <th>Score</th>
            <th>Starts</th>
            <th>Wins</th>
            <th>Podiums</th>
            {isConstructorMode ? <th>Podium Races</th> : null}
            <th>Poles</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className={row.key === selectedKey ? "selected" : ""}
              key={row.key}
              onClick={() => onSelect(row)}
              style={teamAccentStyle(row, constructors)}
            >
              <td className="rank-cell">{row.computed_rank}</td>
              <td className="season-cell">{row.season_label}</td>
              <td>
                <EntityPick
                  row={row}
                  constructors={constructors}
                  showMark={isConstructorMode}
                  onSelect={onSelect}
                />
              </td>
              {isConstructorMode ? null : (
                <td className="constructor-cell">
                  <TeamBadgeList
                    value={row.constructors}
                    constructors={constructors}
                    maxVisible={3}
                  />
                </td>
              )}
              <td className="score-cell">{formatNumber(row.computed_score, 1)}</td>
              <td>
                {row.entries}/{row.scheduled_races}
              </td>
              <td>{row.wins}</td>
              <td>{row.podiums}</td>
              {isConstructorMode ? <td>{row.podiumed_races}</td> : null}
              <td>{row.active_poles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeasonDetail({ row, raceRows, model, mode, constructors }) {
  const isConstructorMode = mode === "constructor";

  if (!row) {
    return (
      <aside className="detail-panel">
        <p className="eyebrow">
          {isConstructorMode ? "Constructor trace" : "Season trace"}
        </p>
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
  const traceLabel = row.is_peak
    ? "Peak trace"
    : isConstructorMode
      ? "Constructor trace"
      : "Season trace";

  return (
    <aside className="detail-panel" style={teamAccentStyle(row, constructors)}>
      <div className="detail-hero">
        <div>
          <p className="eyebrow">{traceLabel}</p>
          <h2>
            {row.entity_name} <span>{row.season_label}</span>
          </h2>
          <TeamBadgeList
            value={row.constructors || row.constructor_id}
            constructors={constructors}
            className="detail-team-strip"
          />
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
        {isConstructorMode ? (
          <>
            <div>
              <span>Car starts</span>
              <strong>{formatNumber(row.car_entries)}</strong>
            </div>
            <div>
              <span>Podium races</span>
              <strong>{formatNumber(row.podiumed_races)}</strong>
            </div>
          </>
        ) : null}
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
              <div
                className={`race-row ${
                  isConstructorMode ? "constructor-race-row" : ""
                }`}
                style={teamAccentStyle(race, constructors)}
              >
                <div className="race-round">
                  <Flag size={14} aria-hidden="true" />
                  <span>{race.round}</span>
                </div>
                <div className="race-main">
                  <strong>{race.grand_prix_name}</strong>
                  <span>{race.circuit_name || race.official_name}</span>
                  {isConstructorMode ? null : (
                    <TeamBadgeList
                      value={race.constructor_id}
                      constructors={constructors}
                      maxVisible={1}
                      showNames={false}
                      className="race-team-strip"
                    />
                  )}
                </div>
                {isConstructorMode ? (
                  <div className="race-result constructor-race-result">
                    <span>
                      {placementLabel(
                        "P",
                        race.best_finish_position,
                        race.best_finish_text,
                        race.best_finish_driver_abbreviations,
                      )}
                    </span>
                    <span>
                      {placementLabel(
                        "Q",
                        race.best_qualifying_position,
                        race.best_qualifying_text,
                        race.best_qualifying_driver_abbreviations,
                      )}
                    </span>
                    <span>
                      {placementLabel(
                        "G",
                        race.best_grid_position,
                        race.best_grid_text,
                        race.best_grid_driver_abbreviations,
                      )}
                    </span>
                    <strong>{formatNumber(race.points, 1)}</strong>
                  </div>
                ) : (
                  <div className="race-result">
                    <span>
                      {placementLabel(
                        "P",
                        race.position_display_order,
                        race.position_text,
                      )}
                    </span>
                    <span>
                      {placementLabel(
                        "Q",
                        null,
                        race.qualification_position_text || "-",
                      )}
                    </span>
                    <span>
                      {placementLabel("G", null, race.grid_position_text || "-")}
                    </span>
                    <strong>{formatNumber(race.points, 1)}</strong>
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </aside>
  );
}

export default App;
