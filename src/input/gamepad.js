/**
 * Gamepad input — polled once per frame and translated into synthetic keyboard
 * events for the codes the game already understands. This keeps the entire input
 * system (movement, hold-to-charge serve, menu navigation, pause) driven by one
 * path: gamepad presses become `keydown`/`keyup` for the *bound* key codes, so
 * rebinding (src/data/controls.js) is respected automatically and no engine or
 * menu code needs to know a controller exists.
 *
 * Pad 0 → Player 1, Pad 1 → Player 2 (local 2P). Either pad can drive menus.
 * In Electron/Chromium this uses the standard Web Gamepad API, which maps
 * DualShock/DualSense/Xbox/Switch pads to the "standard" layout; on Steam,
 * Steam Input additionally remaps exotic controllers to a virtual Xbox pad.
 */
import { state } from "../engine/game.js";
import { codeFor } from "../data/controls.js";

const DEADZONE = 0.4;
const MENU_REPEAT_DELAY_MS = 380; // before the first auto-repeat
const MENU_REPEAT_RATE_MS = 140; // between subsequent repeats

// Standard-mapping button indices.
const BTN = { A: 0, B: 1, X: 2, Y: 3, START: 9, DUP: 12, DDOWN: 13, DLEFT: 14, DRIGHT: 15 };

// States where the pad drives menu navigation rather than gameplay.
const MENU_STATES = new Set([
  "title", "menu", "controls", "settings", "credits", "pause",
  "searching", "disconnect", "over", "lottery", "point",
]);

/** @type {Array<Record<string, boolean>|null>} previous logical state per pad, for edge detection. */
const prev = [];
/** @type {Array<Record<string, string>>} code actually emitted on press per pad+button, so the
 * matching keyup uses the SAME code even if the game context changed while held (e.g. the confirm
 * button pressed in a menu and released after a match starts). Prevents phantom unmatched events. */
const held = [];
/** @type {Array<{dir: number, nextAt: number}|null>} menu up/down auto-repeat bookkeeping per pad. */
const repeat = [];

let started = false;

/** True once any gamepad button has been pressed this session (Chromium hides idle pads). */
export let gamepadSeen = false;

function dispatchKey(type, code) {
  if (!code) return;
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

/** Collapse a raw pad into the logical booleans the game cares about. */
function readPad(pad) {
  const b = pad.buttons;
  const ax = pad.axes;
  const down = (i) => !!(b[i] && b[i].pressed);
  const lx = ax[0] || 0;
  const ly = ax[1] || 0;
  return {
    left: down(BTN.DLEFT) || lx < -DEADZONE,
    right: down(BTN.DRIGHT) || lx > DEADZONE,
    up: down(BTN.DUP) || ly < -DEADZONE,
    down: down(BTN.DDOWN) || ly > DEADZONE,
    south: down(BTN.A), // jump / confirm
    east: down(BTN.B), // attack / back
    west: down(BTN.X), // unused in gameplay (serve shares attack)
    start: down(BTN.START), // pause
  };
}

/**
 * Fire keydown/keyup when a logical button changes state. On press it dispatches
 * (and records) the context-appropriate code; on release it dispatches the keyup
 * for the recorded code, so a down/up pair is always matched even if the code
 * that action maps to changed between press and release.
 */
function edge(padIndex, cur, pr, name, code) {
  const rec = held[padIndex] || (held[padIndex] = {});
  if (cur[name] && !pr[name]) {
    if (code) { dispatchKey("keydown", code); rec[name] = code; }
  } else if (!cur[name] && pr[name]) {
    const emitted = rec[name] ?? code;
    if (emitted) dispatchKey("keyup", emitted);
    delete rec[name];
  }
}

/** Menu up/down with press + auto-repeat, so holding a direction scrolls. */
function menuStep(padIndex, cur, pr, now) {
  const dir = cur.down ? 1 : cur.up ? -1 : 0;
  const code = dir < 0 ? "ArrowUp" : "ArrowDown";
  if (dir === 0) { repeat[padIndex] = null; return; }
  const r = repeat[padIndex];
  if (!r || r.dir !== dir) {
    // Fresh press: fire immediately, then schedule the first repeat.
    dispatchKey("keydown", code);
    repeat[padIndex] = { dir, nextAt: now + MENU_REPEAT_DELAY_MS };
    return;
  }
  if (now >= r.nextAt) {
    dispatchKey("keydown", code);
    r.nextAt = now + MENU_REPEAT_RATE_MS;
  }
}

/** Poll all connected pads and emit synthetic key events. Call once per frame. */
export function pollGamepads(now) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const inMenu = MENU_STATES.has(state);

  for (let p = 0; p < 2; p++) {
    const pad = pads[p];
    if (!pad) { prev[p] = null; repeat[p] = null; held[p] = {}; continue; }

    const cur = readPad(pad);
    const pr = prev[p] || {}; // first sighting → all-false, so a held button counts as a press
    if (!gamepadSeen && Object.values(cur).some(Boolean)) gamepadSeen = true;

    // Pause is global: Start toggles pause from gameplay (Escape), handled by main.js.
    edge(p, cur, pr, "start", "Escape");

    if (inMenu) {
      menuStep(p, cur, pr, now);
      edge(p, cur, pr, "left", "ArrowLeft"); // settings sliders / lab arrows
      edge(p, cur, pr, "right", "ArrowRight");
      edge(p, cur, pr, "south", "Enter"); // confirm
      edge(p, cur, pr, "east", "Escape"); // back
    } else {
      // Gameplay: emit the *bound* codes for this seat so rebinding is honored.
      edge(p, cur, pr, "left", codeFor(p, "left"));
      edge(p, cur, pr, "right", codeFor(p, "right"));
      edge(p, cur, pr, "south", codeFor(p, "jump"));
      // Attack doubles as serve (hold to charge on the serve screen).
      edge(p, cur, pr, "east", codeFor(p, "attack"));
      repeat[p] = null;
    }

    prev[p] = cur;
  }
}

/** Begin the connect/disconnect logging (optional; polling works without it). */
export function initGamepads() {
  if (started) return;
  started = true;
  window.addEventListener("gamepadconnected", () => { gamepadSeen = true; });
}
