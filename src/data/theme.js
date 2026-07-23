/** Shared visual design tokens — see docs/ART_BIBLE.md */

export const COLORS = {
  bg: "#0a0e1a",
  bgDeep: "#060912",
  surface: "#121828",
  surfaceBorder: "rgba(255,255,255,0.12)",
  text: "#f5f7ff",
  textMuted: "#9aa4c0",
  p1: "#ff5a5f",
  p1Dark: "#b02a2f",
  p2: "#29b6f6",
  p2Dark: "#1565a8",
  accent: "#ffd54a",
  accentLight: "#fff3c0",
  accentDark: "#f2b705",
  net: "#e0e0e0",
  ball: "#ffd54a",
  lottery: "#c084fc",
  smashHot: "#ff6a1a",
};

export const GLOW = {
  p1: "rgba(255,90,95,0.45)",
  p2: "rgba(41,182,246,0.45)",
  accent: "rgba(255,213,74,0.55)",
  surface: "rgba(18,24,40,0.85)",
  scrim: "rgba(6,9,18,0.55)",
  scrimHeavy: "rgba(6,9,18,0.72)",
};

export const FONTS = {
  display: "'Rajdhani', 'Segoe UI', system-ui, sans-serif",
  body: "'Inter', 'Segoe UI', system-ui, sans-serif",
};

/** Canvas font strings (size in px). */
export function fontDisplay(size, weight = 700) {
  return `${weight} ${size}px ${FONTS.display}`;
}

export function fontBody(size, weight = 400) {
  return `${weight} ${size}px ${FONTS.body}`;
}

export const PART_ACCENTS = {
  standard: null,
  dome: "#7dd3fc",
  magnet: "#c084fc",
  drill: "#fb923c",
  satellite: "#4ade80",
};

export const COLOR_PRESETS = [
  "#ff5a5f", "#ff8a65", "#ffd54a", "#66bb6a",
  "#29b6f6", "#5c6bc0", "#ab47bc", "#78909c",
  "#eceff1", "#37474f", "#212121", "#ffffff",
];
