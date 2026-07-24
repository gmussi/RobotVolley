/** Accessibility preferences persisted via the platform save layer. */
import { getItem, setItem } from "../platform/save.js";

export let colorblindMode = getItem("robotvolley_colorblind") === "1";
export let reducedMotion = getItem("robotvolley_reduced_motion") === "1"
  || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function setColorblindMode(on) {
  colorblindMode = on;
  setItem("robotvolley_colorblind", on ? "1" : "0");
}

export function setReducedMotion(on) {
  reducedMotion = on;
  setItem("robotvolley_reduced_motion", on ? "1" : "0");
}

export function toggleColorblindMode() {
  setColorblindMode(!colorblindMode);
}
