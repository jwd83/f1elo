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
  bmw: { color: "#0066b1", code: "BMW" },
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

const LOGO_FILES = {
  "alfa-romeo": "alfa-romeo.svg",
  alpine: "alpine.svg",
  "aston-martin": "aston-martin.svg",
  audi: "audi.svg",
  bmw: "bmw.svg",
  "bmw-sauber": "bmw-sauber.svg",
  cadillac: "cadillac.svg",
  ferrari: "ferrari.svg",
  haas: "haas.svg",
  honda: "honda.svg",
  jaguar: "jaguar.svg",
  "kick-sauber": "kick-sauber.svg",
  maserati: "maserati.svg",
  mclaren: "mclaren.svg",
  mercedes: "mercedes.svg",
  porsche: "porsche.svg",
  "racing-point": "racing-point.svg",
  "red-bull": "red-bull.svg",
  renault: "renault.svg",
  sauber: "sauber.svg",
  toyota: "toyota.svg",
  williams: "williams.svg",
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

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
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

function mixHex(baseHex, targetHex, amount) {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);

  return rgbToHex({
    r: base.r + (target.r - base.r) * amount,
    g: base.g + (target.g - base.g) * amount,
    b: base.b + (target.b - base.b) * amount,
  });
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
    logoFile: LOGO_FILES[normalizedId],
    motif: hashString(normalizedId || name) % 6,
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

const LOGO_CACHE = new Map();

function escapeSvgText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function motifPath(motif) {
  switch (motif) {
    case 0:
      return '<path d="M-6 35 L20 -6 H36 L10 46 Z" fill="currentColor" opacity=".28"/>';
    case 1:
      return '<path d="M4 4 H30 L20 18 H50 L36 36 H4 Z" fill="currentColor" opacity=".24"/>';
    case 2:
      return '<path d="M0 25 C13 12 24 12 36 25 S55 38 66 20 V44 H0 Z" fill="currentColor" opacity=".22"/>';
    case 3:
      return '<path d="M44 -4 H66 V44 H28 Z" fill="currentColor" opacity=".25"/><path d="M28 -4 H37 L21 44 H12 Z" fill="currentColor" opacity=".18"/>';
    case 4:
      return '<path d="M0 0 H18 L44 40 H26 Z" fill="currentColor" opacity=".23"/><path d="M44 0 H64 V40 H58 Z" fill="currentColor" opacity=".18"/>';
    default:
      return '<path d="M-4 10 H68 V18 H-4 Z" fill="currentColor" opacity=".17"/><path d="M-4 27 H68 V35 H-4 Z" fill="currentColor" opacity=".24"/>';
  }
}

export function constructorLogoDataUri(identity) {
  const cacheKey = [
    identity.id,
    identity.code,
    identity.color,
    identity.textColor,
    identity.motif,
  ].join("|");

  if (LOGO_CACHE.has(cacheKey)) {
    return LOGO_CACHE.get(cacheKey);
  }

  const color = identity.color;
  const shadowColor = mixHex(color, "#000000", 0.42);
  const highlightColor = mixHex(color, "#ffffff", 0.3);
  const textColor = identity.textColor;
  const outlineColor = textColor === "#101311" ? "#101311" : "#ffffff";
  const outlineOpacity = textColor === "#101311" ? "0.24" : "0.36";
  const code = escapeSvgText(identity.code || "?");
  const motif = motifPath(identity.motif);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" role="img">
  <defs>
    <linearGradient id="paint" x1="0" y1="0" x2="64" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${highlightColor}"/>
      <stop offset=".44" stop-color="${color}"/>
      <stop offset="1" stop-color="${shadowColor}"/>
    </linearGradient>
    <clipPath id="clip">
      <rect x="1.5" y="1.5" width="61" height="37" rx="7"/>
    </clipPath>
  </defs>
  <rect x="1" y="1" width="62" height="38" rx="8" fill="#0d100f"/>
  <g clip-path="url(#clip)" style="color:${textColor}">
    <rect x="1.5" y="1.5" width="61" height="37" fill="url(#paint)"/>
    ${motif}
    <path d="M4 7 H60" stroke="${outlineColor}" stroke-width="2" opacity="${outlineOpacity}"/>
    <path d="M4 33 H60" stroke="#000" stroke-width="2" opacity=".16"/>
  </g>
  <rect x="1" y="1" width="62" height="38" rx="8" fill="none" stroke="${outlineColor}" stroke-width="2" opacity="${outlineOpacity}"/>
  <text x="32" y="25.5" text-anchor="middle" fill="${textColor}" font-family="Arial Black, Arial, sans-serif" font-size="13" font-weight="900" letter-spacing=".5">${code}</text>
</svg>`.trim();
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  LOGO_CACHE.set(cacheKey, dataUri);
  return dataUri;
}

export function constructorLogoSrc(identity) {
  if (identity.logoFile) {
    return `${import.meta.env.BASE_URL}team-logos/${identity.logoFile}`;
  }

  return constructorLogoDataUri(identity);
}
