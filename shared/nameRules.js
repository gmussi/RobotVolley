/**
 * Robot-name rules, shared by the game and the Worker so the on-screen editor
 * and the server's validator can't drift — a name the field lets you type is a
 * name the server will accept.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 16;
export const NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;
/** How long before a player may rename again. */
export const RENAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Is this single character typeable into a name? */
export function isNameCharValid(ch) {
  return NAME_PATTERN.test(ch);
}

/** @returns {string|null} an error code, or null when the name is fine. */
export function validateName(name) {
  if (typeof name !== "string") return "invalid_name";
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) return "bad_length";
  if (!NAME_PATTERN.test(trimmed)) return "bad_characters";
  return null;
}
