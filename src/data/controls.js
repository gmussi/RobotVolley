/**
 * Keyboard bindings — rebindable and persisted via the platform save layer.
 *
 * Two shapes are kept in sync:
 *   - `binding`: the source of truth, action → key code (`"0:left" → "KeyA"`).
 *   - `CONTROL`: a derived code → {player, act} map, mutated IN PLACE so existing
 *     `import { CONTROL }` references (and `code in CONTROL` checks) stay valid
 *     after a rebind.
 *
 * Defaults match the original hardcoded scheme: P1 = WASD + F, P2 = arrows + `/`.
 * Serve uses the attack key (hold to charge, release to launch) — no separate
 * down/serve binding.
 */
import { getJSON, setJSON } from "../platform/save.js";

const BINDINGS_KEY = "robotvolley_bindings";

/** Canonical, ordered action list. player 0 = P1, player 1 = P2. */
export const ACTIONS = [
  { player: 0, act: "left", defaultCode: "KeyA", label: "Move Left" },
  { player: 0, act: "right", defaultCode: "KeyD", label: "Move Right" },
  { player: 0, act: "jump", defaultCode: "KeyW", label: "Jump" },
  { player: 0, act: "attack", defaultCode: "KeyF", label: "Attack / Serve" },
  { player: 1, act: "left", defaultCode: "ArrowLeft", label: "Move Left" },
  { player: 1, act: "right", defaultCode: "ArrowRight", label: "Move Right" },
  { player: 1, act: "jump", defaultCode: "ArrowUp", label: "Jump" },
  { player: 1, act: "attack", defaultCode: "Slash", label: "Attack / Serve" },
];

function keyOf(player, act) {
  return `${player}:${act}`;
}

/** action → code (source of truth). */
const binding = {};

/** code → {player, act} (derived; mutated in place). */
export const CONTROL = {};

function rebuildControl() {
  for (const code of Object.keys(CONTROL)) delete CONTROL[code];
  for (const a of ACTIONS) {
    const code = binding[keyOf(a.player, a.act)];
    if (code) CONTROL[code] = { player: a.player, act: a.act };
  }
}

function loadBindings() {
  const saved = getJSON(BINDINGS_KEY, null) || {};
  for (const a of ACTIONS) {
    const k = keyOf(a.player, a.act);
    binding[k] = typeof saved[k] === "string" ? saved[k] : a.defaultCode;
  }
  rebuildControl();
}

function persist() {
  setJSON(BINDINGS_KEY, binding);
}

/** Code currently bound to (player, act), or null if unbound. */
export function codeFor(player, act) {
  return binding[keyOf(player, act)] || null;
}

/**
 * Assign `code` to (player, act) and persist. If another action already used
 * that code, it becomes unbound — a physical key never drives two actions.
 * Returns the action that was displaced (or null).
 */
export function rebind(player, act, code) {
  let displaced = null;
  for (const a of ACTIONS) {
    const k = keyOf(a.player, a.act);
    if (binding[k] === code && !(a.player === player && a.act === act)) {
      binding[k] = null;
      displaced = { player: a.player, act: a.act };
    }
  }
  binding[keyOf(player, act)] = code;
  rebuildControl();
  persist();
  return displaced;
}

/** Restore every binding to its default and persist. */
export function resetBindings() {
  for (const a of ACTIONS) binding[keyOf(a.player, a.act)] = a.defaultCode;
  rebuildControl();
  persist();
}

loadBindings();
