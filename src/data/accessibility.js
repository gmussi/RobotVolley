/** Accessibility preferences persisted via the platform save layer. */
import { getItem, setItem } from "../platform/save.js";

/**
 * The OS-level preference, or false where there is no window to ask — this
 * module is imported (transitively) by the renderers, which the unit tests pull
 * in under node.
 */
function prefersReducedMotion() {
  return !!globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export let colorblindMode = getItem("robotvolley_colorblind") === "1";
export let reducedMotion = getItem("robotvolley_reduced_motion") === "1" || prefersReducedMotion();

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
