/** Accessibility preferences persisted in localStorage. */

export let colorblindMode = localStorage.getItem("robotvolley_colorblind") === "1";
export let reducedMotion = localStorage.getItem("robotvolley_reduced_motion") === "1"
  || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function setColorblindMode(on) {
  colorblindMode = on;
  localStorage.setItem("robotvolley_colorblind", on ? "1" : "0");
}

export function setReducedMotion(on) {
  reducedMotion = on;
  localStorage.setItem("robotvolley_reduced_motion", on ? "1" : "0");
}

export function toggleColorblindMode() {
  setColorblindMode(!colorblindMode);
}
