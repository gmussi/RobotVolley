/**
 * Gamepad input — polled once per frame and translated into synthetic keyboard
 * events for the codes the game already understands. This keeps the entire input
 * system (movement, hold-to-charge serve, menu navigation, pause) driven by one
 * path: gamepad presses become `keydown`/`keyup` for the *bound* key codes, so
 * rebinding (src/data/controls.js) is respected automatically and no engine or
 * menu code needs to know a controller exists.
 *
 * Pad 0 → Player 1, Pad 1 → Player 2 (local 2P). Either pad can drive menus.
 *
 * The emitted codes are the same everywhere — gameplay and menus alike — which
 * works because every menu already accepts WASD alongside the arrow keys:
 *
 * The codes depend on whether a menu is open, because two buttons mean
 * different things in each context:
 *
 *                     in a match                    in a menu
 *   d-pad             bound left / right / jump     that seat's menu keys
 *   cross (south)     bound jump key                Enter   (confirm)
 *   square (west)     bound attack/serve key        nothing — its match key
 *                                                   would nudge the selection
 *   options / start   Enter                         Enter   (confirm)
 *   circle (east)     Escape  (pause)               Escape  (back)
 *
 * With default bindings pad 0 therefore reads A / D / W / W / F in a match, and
 * WASD + Enter in menus.
 *
 * BUTTON LAYOUTS. Chromium exposes pads under the W3C "standard" mapping, where
 * the face buttons and d-pad sit at fixed indices. Firefox only does that for
 * pads it has a remapping entry for; on macOS a DualSense (and especially the
 * newer DualSense Edge) falls through to raw HID order instead, where the face
 * buttons are shifted by one and the d-pad is a hat switch on an *axis* rather
 * than four buttons. Reading `pad.mapping` and branching on it is what keeps the
 * same physical button doing the same thing in both browsers.
 */
import { state } from "../engine/game.js";
import { codeFor } from "../data/controls.js";
import { noteGamepadActivity } from "./device.js";

/**
 * States where the pad is driving a menu rather than a match: directions
 * auto-repeat instead of staying held, and cross/square change meaning.
 * `serve` is deliberately absent — cross has to charge the serve there.
 */
const MENU_STATES = new Set([
  "title", "menu", "modeSelect", "controls", "settings", "credits", "pause",
  "searching", "disconnect", "over", "lottery", "point", "profile", "leaderboard",
]);

const DEADZONE = 0.4;
const MENU_REPEAT_DELAY_MS = 380; // before the first auto-repeat
const MENU_REPEAT_RATE_MS = 140; // between subsequent repeats

/** W3C standard mapping — Chromium everywhere, Firefox for pads it knows. */
const STANDARD = {
  cross: 0, circle: 1, square: 2,
  start: 9,
  dUp: 12, dDown: 13, dLeft: 14, dRight: 15,
};

/**
 * Raw HID order, which Firefox falls back to for pads it has no standard
 * mapping for. Sony's report descriptor lists Square, Cross, Circle, Triangle —
 * so cross/circle land one index later than the standard layout, which is why
 * an un-patched build reads Cross as "back". There are no d-pad buttons at all
 * here; `readHat` picks the direction off the hat axis instead.
 */
const HID = {
  square: 0, cross: 1, circle: 2,
  start: 9, // Options
  dUp: null, dDown: null, dLeft: null, dRight: null,
};

/** A hat axis parks outside [-1,1] when centered; sticks never do. */
const HAT_CENTER_LIMIT = 1.05;

/**
 * Menu navigation keys per seat, from the same family as that seat's defaults
 * (P1 is WASD, P2 is arrows) — every menu in the game accepts both. Menus use
 * these rather than the *bound* keys so that rebinding a gameplay action can
 * never leave a player unable to navigate.
 */
const MENU_KEYS = [
  { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
  { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
];

/**
 * Per-pad bookkeeping, keyed by the browser's gamepad index so it follows the
 * physical controller rather than the seat it happens to be playing.
 *
 * @typedef {object} PadState
 * @property {Record<string, boolean>|null} prev logical state last frame, for edge detection
 * @property {Record<string, string>} held code actually emitted on press per button, so the
 *   matching keyup uses the SAME code even if the game context changed while held (e.g. confirm
 *   pressed in a menu and released after a match starts). Prevents phantom unmatched events.
 * @property {{dir: number, nextAt: number}|null} repeat menu auto-repeat bookkeeping
 * @property {{base: number[], hatAxis: number|null}} cal axis calibration
 *
 * @type {Map<number, PadState>}
 */
const padState = new Map();

/**
 * seat → gamepad index. Seats are claimed in the order pads are first *used*,
 * not the order the browser enumerates them: the first controller someone
 * touches is Player 1, the second is Player 2. Going by raw index instead would
 * mean a controller that reconnects into slot 1 silently becomes Player 2 — and
 * in a 1P match that seat is the CPU, so it would appear to stop working.
 *
 * @type {Array<number|null>}
 */
const seats = [null, null];

let started = false;

/** True once any gamepad button has been pressed this session (Chromium hides idle pads). */
export let gamepadSeen = false;

function dispatchKey(type, code) {
  if (!code) return;
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

/**
 * Decode a HID hat switch: eight compass positions encoded as (i * 2 / 7) - 1,
 * i = 0 at north going clockwise, with anything outside [-1,1] meaning centered.
 */
function readHat(v) {
  if (!Number.isFinite(v) || Math.abs(v) > HAT_CENTER_LIMIT) return null;
  const i = Math.round((v + 1) * 3.5) % 8;
  return {
    up: i === 7 || i === 0 || i === 1,
    right: i >= 1 && i <= 3,
    down: i >= 3 && i <= 5,
    left: i >= 5 && i <= 7,
  };
}

/** Above this, an axis is parked at an extreme rather than merely deflected. */
const REST_EXTREME = 0.85;

/** Search from the end: the hat is reported after the sticks and triggers. */
function findHatAxis(pad) {
  for (let i = pad.axes.length - 1; i >= 0; i--) {
    if (Math.abs(pad.axes[i]) > HAT_CENTER_LIMIT) return i;
  }
  return null;
}

/**
 * Record where this pad's axes sit at rest, and find its hat axis if it has one.
 *
 * Resting values matter because an un-remapped pad exposes its analog triggers
 * as axes that sit at -1 until pulled. Read absolutely, such an axis looks like
 * a stick held hard over for the entire session — which is what makes menus
 * scroll on their own.
 *
 * Only axes parked at an *extreme* get a baseline, though. Chromium hides a pad
 * until its first input, so the moment we first see one is often the moment
 * something is being held — and a stick baselined mid-push would sit
 * permanently offset once released. A trigger rests at ±1; a pushed stick does
 * not rest at all.
 */
function calibrate(pad) {
  return {
    base: Array.from(pad.axes, (v) => (
      Number.isFinite(v) && Math.abs(v) > REST_EXTREME ? v : 0
    )),
    hatAxis: pad.mapping === "standard" ? null : findHatAxis(pad),
  };
}

/** Collapse a raw pad into the logical booleans the game cares about. */
function readPad(pad, st) {
  const L = pad.mapping === "standard" ? STANDARD : HID;
  const b = pad.buttons;
  const down = (i) => i != null && !!(b[i] && b[i].pressed);
  const axis = (i) => {
    const v = pad.axes[i];
    return Number.isFinite(v) ? v - (st.base[i] ?? 0) : 0;
  };

  const hat = st.hatAxis != null ? readHat(pad.axes[st.hatAxis]) : null;
  const lx = axis(0);
  const ly = axis(1);

  return {
    left: down(L.dLeft) || lx < -DEADZONE || !!hat?.left,
    right: down(L.dRight) || lx > DEADZONE || !!hat?.right,
    up: down(L.dUp) || ly < -DEADZONE || !!hat?.up,
    down: down(L.dDown) || ly > DEADZONE || !!hat?.down,
    cross: down(L.cross), // jump / confirm
    circle: down(L.circle), // back / pause
    square: down(L.square), // attack / serve
    start: down(L.start), // confirm
  };
}

/** The key code a logical button emits for this seat, in this context. */
function codeForButton(seat, name, inMenu) {
  if (name === "start") return "Enter";
  if (name === "circle") return "Escape";

  if (inMenu) {
    const menu = MENU_KEYS[seat] ?? MENU_KEYS[1];
    switch (name) {
      case "up": case "down": case "left": case "right": return menu[name];
      case "cross": return "Enter"; // confirm, so the whole menu is one thumb
      case "square": return null; // silent: its match key would move the cursor
      default: return null;
    }
  }

  switch (name) {
    case "left": return codeFor(seat, "left");
    case "right": return codeFor(seat, "right");
    case "up": case "cross": return codeFor(seat, "jump");
    case "square": return codeFor(seat, "attack");
    case "down": return null; // nothing crouches
    default: return null;
  }
}

/**
 * Fire keydown/keyup when a logical button changes state. On press it dispatches
 * (and records) the context-appropriate code; on release it dispatches the keyup
 * for the recorded code, so a down/up pair is always matched even if the code
 * that action maps to changed between press and release.
 */
function edge(st, seat, cur, pr, name, inMenu) {
  if (cur[name] && !pr[name]) {
    const code = codeForButton(seat, name, inMenu);
    if (code) { dispatchKey("keydown", code); st.held[name] = code; }
  } else if (!cur[name] && pr[name]) {
    // Only what we actually pressed: a button that emitted nothing (square in a
    // menu) must not synthesise a keyup that could cancel a real held key.
    if (st.held[name]) dispatchKey("keyup", st.held[name]);
    delete st.held[name];
  }
}

/**
 * Auto-repeat for a held menu direction, so holding up/down scrolls a list. The
 * first press is already emitted by edge(); this only adds the repeats, and only
 * in menus — during a match a held direction has to stay held, not retrigger.
 */
function menuRepeat(st, seat, cur, now) {
  const dir = cur.down ? 1 : cur.up ? -1 : 0;
  if (dir === 0) { st.repeat = null; return; }
  if (!st.repeat || st.repeat.dir !== dir) {
    st.repeat = { dir, nextAt: now + MENU_REPEAT_DELAY_MS };
    return;
  }
  if (now >= st.repeat.nextAt) {
    dispatchKey("keydown", codeForButton(seat, dir < 0 ? "up" : "down", true));
    st.repeat.nextAt = now + MENU_REPEAT_RATE_MS;
  }
}

const BUTTONS = ["left", "right", "up", "down", "cross", "circle", "square", "start"];

/**
 * Forget a pad: release whatever it was holding and free its seat.
 *
 * The keyups matter. Key state lives in a set that only a keyup clears, so a
 * controller unplugged (or with a flat battery) mid-press would otherwise leave
 * its robot walking into the wall for the rest of the match.
 */
function releasePad(index) {
  const st = padState.get(index);
  if (st) {
    for (const code of Object.values(st.held)) dispatchKey("keyup", code);
    padState.delete(index);
  }
  const seat = seats.indexOf(index);
  if (seat !== -1) seats[seat] = null;
}

/** Poll all connected pads and emit synthetic key events. Call once per frame. */
export function pollGamepads(now) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const inMenu = MENU_STATES.has(state);

  // Drop anything that vanished since the last poll, freeing its seat.
  for (const index of [...padState.keys()]) {
    const pad = pads[index];
    if (!pad || pad.connected === false) releasePad(index);
  }

  // Every slot, not just the first two: after enough connect/disconnect churn a
  // lone controller can end up at index 2 or higher.
  for (let index = 0; index < pads.length; index++) {
    const pad = pads[index];
    if (!pad || pad.connected === false) continue;

    let st = padState.get(index);
    if (!st) {
      st = { prev: null, held: {}, repeat: null, cal: calibrate(pad) };
      padState.set(index, st);
    }
    // A pad first seen with its d-pad held parks the hat inside the normal
    // range, so calibration cannot recognise it. Keep looking until it centres.
    if (st.cal.hatAxis == null && pad.mapping !== "standard") {
      st.cal.hatAxis = findHatAxis(pad);
    }

    const cur = readPad(pad, st.cal);
    const active = Object.values(cur).some(Boolean);

    // Any deadzoned input counts as "this player is on a pad now", which flips
    // every on-screen prompt to controller glyphs (src/input/device.js).
    if (active) {
      gamepadSeen = true;
      noteGamepadActivity(pad);
    }

    // Claim a seat on first use. Done before the edges below so the very press
    // that claims the seat is also the press that gets emitted.
    let seat = seats.indexOf(index);
    if (seat === -1 && active) {
      seat = seats.indexOf(null);
      if (seat !== -1) seats[seat] = index;
    }

    // A third pad, or one still untouched, stays silent — but keep tracking its
    // state so it does not fire a burst of stale edges if a seat frees up.
    if (seat !== -1) {
      const pr = st.prev || {}; // first sighting → all-false, so a held button counts as a press
      for (const name of BUTTONS) edge(st, seat, cur, pr, name, inMenu);
      if (inMenu) menuRepeat(st, seat, cur, now);
      else st.repeat = null;
    }

    st.prev = cur;
  }
}

/** Begin the connect/disconnect logging (optional; polling works without it). */
export function initGamepads() {
  if (started) return;
  started = true;
  window.addEventListener("gamepadconnected", () => { gamepadSeen = true; });
  // Release immediately rather than waiting for the next poll to notice, so a
  // pad unplugged mid-press cannot leave a key stuck down for even one frame.
  window.addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad?.index != null) releasePad(e.gamepad.index);
  });
}

/** Forget every pad and free both seats. Test seam. */
function resetGamepads() {
  for (const index of [...padState.keys()]) releasePad(index);
  seats[0] = null;
  seats[1] = null;
}

/** Exposed for the gamepad diagnostic page (gamepad-lab.html). */
export const __diagnostics = {
  STANDARD, HID, readHat, findHatAxis, calibrate, readPad, codeForButton,
  resetGamepads, seats,
};
