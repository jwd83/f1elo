const TEAM_OVERRIDES = {
  afm: { color: "#9aa1a8", code: "AFM" },
  ags: { color: "#f5c400", code: "AGS" },
  "alfa-romeo": { color: "#8b0000", code: "ALF" },
  alphatauri: { color: "#2b4562", code: "AT" },
  alpine: { color: "#0090ff", code: "ALP" },
  arrows: { color: "#fa7023", code: "ARR" },
  "aston-martin": { color: "#006f62", code: "AM" },
  "ats-wheels": { color: "#ffcf00", code: "ATS" },
  audi: { color: "#ff0000", code: "AUD" },
  bar: { color: "#e10600", code: "BAR" },
  benetton: { color: "#00a859", code: "BEN" },
  "bmw-sauber": { color: "#0066b1", code: "BMW" },
  brabham: { color: "#00a6de", code: "BRA" },
  brm: { color: "#0b5d3a", code: "BRM" },
  brawn: { color: "#bfff00", code: "BGP" },
  cadillac: { color: "#d4af37", code: "CAD" },
  caterham: { color: "#007a3d", code: "CAT" },
  cooper: { color: "#004225", code: "COO" },
  dallara: { color: "#c3002f", code: "DAL" },
  ensign: { color: "#f47920", code: "ENS" },
  epperly: { color: "#8bc7ff", code: "EPP" },
  ferrari: { color: "#e10600", code: "FER" },
  fittipaldi: { color: "#f2c300", code: "FIT" },
  "force-india": { color: "#ff5f9e", code: "FI" },
  gordini: { color: "#1f5fbf", code: "GOR" },
  haas: { color: "#b6babd", code: "HAA" },
  hesketh: { color: "#f4d03f", code: "HES" },
  honda: { color: "#e60012", code: "HON" },
  hrt: { color: "#c0c0c0", code: "HRT" },
  "iso-marlboro": { color: "#ef3340", code: "ISO" },
  jaguar: { color: "#006341", code: "JAG" },
  jordan: { color: "#ffd800", code: "JOR" },
  "kick-sauber": { color: "#52e252", code: "KSK" },
  "kurtis-kraft": { color: "#5da9e9", code: "KUR" },
  kuzma: { color: "#e58f2a", code: "KUZ" },
  larrousse: { color: "#de1d23", code: "LAR" },
  "leyton-house": { color: "#7bdff2", code: "LEY" },
  ligier: { color: "#005bbb", code: "LIG" },
  lola: { color: "#3455a4", code: "LOL" },
  lotus: { color: "#004225", code: "LOT" },
  "lotus-f1": { color: "#c6a664", code: "LTF" },
  "lotus-racing": { color: "#0b6b3a", code: "LTR" },
  manor: { color: "#ed1c24", code: "MAN" },
  march: { color: "#f47920", code: "MAR" },
  marussia: { color: "#d71920", code: "MAR" },
  maserati: { color: "#123c69", code: "MAS" },
  matra: { color: "#0054a6", code: "MAT" },
  mclaren: { color: "#ff8000", code: "MCL" },
  mercedes: { color: "#00d2be", code: "MER" },
  minardi: { color: "#ffd500", code: "MIN" },
  osella: { color: "#1f4ea3", code: "OSE" },
  pacific: { color: "#0057b8", code: "PAC" },
  penske: { color: "#f6c400", code: "PEN" },
  porsche: { color: "#d5001c", code: "POR" },
  prost: { color: "#005bbb", code: "PRO" },
  ram: { color: "#f4d03f", code: "RAM" },
  rb: { color: "#6692ff", code: "RB" },
  "racing-bulls": { color: "#6692ff", code: "RBU" },
  "racing-point": { color: "#ff87bc", code: "RP" },
  "red-bull": { color: "#3671c6", code: "RBR" },
  renault: { color: "#fff500", code: "REN" },
  sauber: { color: "#00a3e0", code: "SAU" },
  shadow: { color: "#111111", code: "SHA" },
  simtek: { color: "#7f8c8d", code: "SIM" },
  spirit: { color: "#3b75c4", code: "SPI" },
  stewart: { color: "#ffffff", code: "STW" },
  "super-aguri": { color: "#ed1c24", code: "SA" },
  surtees: { color: "#d71920", code: "SUR" },
  "toro-rosso": { color: "#2242c7", code: "STR" },
  toleman: { color: "#7ec8e3", code: "TOL" },
  toyota: { color: "#eb0a1e", code: "TOY" },
  tyrrell: { color: "#0057b8", code: "TYR" },
  vanwall: { color: "#0b5d3a", code: "VAN" },
  virgin: { color: "#d71920", code: "VIR" },
  watson: { color: "#3b82f6", code: "WAT" },
  williams: { color: "#64c4ff", code: "WIL" },
  wolf: { color: "#071d49", code: "WLF" },
  zakspeed: { color: "#e10600", code: "ZAK" },
};

const FALLBACK_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#84cc16",
  "#a855f7",
];

function titleizeId(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hashString(value) {
  return Array.from(String(value)).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
}

function fallbackColor(id) {
  return FALLBACK_COLORS[hashString(id) % FALLBACK_COLORS.length];
}

function hexToRgb(hex) {
  const normalized = String(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function readableTextColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.56 ? "#101311" : "#f8f5e7";
}

function generatedCode(id, name) {
  const words = String(name || id)
    .replace(/\b(f1|team|racing|scuderia|formula)\b/gi, "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

  if (words.length > 1) {
    return words
      .slice(0, 3)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
  }

  return String(words[0] || id || "?")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 3)
    .toUpperCase();
}

export function constructorIds(value) {
  if (!value) {
    return [];
  }

  const rawIds = Array.isArray(value) ? value : String(value).split("/");
  const seen = new Set();

  return rawIds
    .map((id) => String(id).trim())
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
}

export function getConstructorIdentity(id, constructors = new Map()) {
  const normalizedId = String(id || "").trim();
  const override = TEAM_OVERRIDES[normalizedId] || {};
  const name =
    override.name ||
    constructors.get?.(normalizedId) ||
    titleizeId(normalizedId || "unknown");
  const color = override.color || fallbackColor(normalizedId || name);

  return {
    id: normalizedId,
    name,
    color,
    code: override.code || generatedCode(normalizedId, name),
    textColor: override.textColor || readableTextColor(color),
  };
}

export function constructorIdentities(value, constructors = new Map()) {
  return constructorIds(value).map((id) => getConstructorIdentity(id, constructors));
}

export function primaryConstructorId(row) {
  const ids = constructorIds(row?.constructors || row?.constructor_id);
  return ids[0] || row?.constructor_id || row?.entity_id || "";
}

export function teamIdentityStyle(identity) {
  return {
    "--team-color": identity.color,
    "--team-text": identity.textColor,
  };
}

export function teamAccentStyle(row, constructors = new Map()) {
  return teamIdentityStyle(
    getConstructorIdentity(primaryConstructorId(row), constructors),
  );
}
