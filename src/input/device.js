/**
 * "Which device is the player actually holding right now?" — so on-screen
 * prompts can show matching glyphs the way Steam games do: touch a controller
 * and the hints become pad buttons, touch the keyboard and they become keys.
 *
 * The rule is last-input-wins. Pad activity is reported from the poll loop in
 * gamepad.js; keyboard activity is any *trusted* keydown — the synthetic events
 * gamepad.js dispatches carry `isTrusted === false`, so a pad driving the game
 * through the key path can never masquerade as a keyboard. A real mouse click
 * counts as keyboard too, since mouse and keyboard are the same seat.
 *
 * This is deliberately global rather than per-seat: in local 2P one player can
 * be on a pad and the other on the keyboard, and the hints follow whoever
 * touched something last. Every game that does this has the same limitation.
 */

/** Known pad vendors. Anything else falls back to Xbox glyphs. */
const VENDOR = {
  "054c": "playstation", // Sony
  "045e": "xbox", // Microsoft
  "057e": "nintendo", // Nintendo
};

/**
 * Brand from a Gamepad `id` string. The format is browser-specific:
 *   Chrome/Edge:  "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"
 *   Firefox:      "054c-09cc-Wireless Controller"
 *   Safari:       "DualSense Wireless Controller Extended Gamepad"  (no IDs at all)
 * so we try the vendor ID first and fall back to matching the product name.
 *
 * Note this is unreliable *under Steam*: Steam Input remaps every controller to
 * a virtual Xbox 360 pad, so a DualSense reports as Microsoft. Xbox glyphs are
 * the right default there; real per-device glyphs would need Steam Input's own
 * GetGlyphPNGForActionOrigin.
 */
export function brandFromPadId(id) {
  const s = String(id || "").toLowerCase();
  const vendor = s.match(/vendor:\s*([0-9a-f]{4})/)?.[1]
    ?? s.match(/^([0-9a-f]{4})-[0-9a-f]{4}-/)?.[1];
  if (vendor && VENDOR[vendor]) return VENDOR[vendor];
  if (/dualsense|dualshock|playstation|sony/.test(s)) return "playstation";
  if (/switch|joy-?con|nintendo|pro controller/.test(s)) return "nintendo";
  return "xbox";
}

/** @type {"keyboard"|"xbox"|"playstation"|"nintendo"} */
let device = "keyboard";
let started = false;

/** The device the player last used. */
export function inputDevice() {
  return device;
}

/** True when prompts should show controller glyphs rather than key names. */
export function usingGamepad() {
  return device !== "keyboard";
}

/** Called from the gamepad poll loop whenever a pad reports real activity. */
export function noteGamepadActivity(pad) {
  device = brandFromPadId(pad?.id);
}

export function noteKeyboardActivity() {
  device = "keyboard";
}

/** Listen for the keyboard/mouse half of the switch. Idempotent. */
export function initInputDevice() {
  if (started) return;
  started = true;
  // Capture phase: settle the device before any handler draws or reads it.
  window.addEventListener("keydown", (e) => {
    if (e.isTrusted) noteKeyboardActivity();
  }, true);
  // Touch taps drive the on-screen controls and shouldn't claim the keyboard;
  // only a real mouse means someone is sitting at a desk.
  window.addEventListener("pointerdown", (e) => {
    if (e.isTrusted && e.pointerType === "mouse") noteKeyboardActivity();
  }, true);
}
