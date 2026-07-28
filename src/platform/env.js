/**
 * Build-time environment, whichever host is running this code.
 *
 * Vite replaces `import.meta.env` wholesale at build time, so the browser build
 * is unaffected. Under plain Node (`tools/bot/`) `import.meta.env` is simply
 * `undefined` — reading `.VITE_SOMETHING` off it throws, which is what kept
 * `src/net/*` from being importable outside a bundler. Everything goes through
 * this one object instead so both hosts work with no per-call guards.
 */
export const ENV =
  (typeof import.meta !== "undefined" && import.meta.env) ||
  (typeof process !== "undefined" && process.env) ||
  {};
