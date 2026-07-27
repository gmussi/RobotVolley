/**
 * Robot-name rules, re-exported so game code imports them from `src/data/` like
 * every other data module. The implementation is shared with the Worker — see
 * shared/nameRules.js.
 */
export {
  NAME_MIN,
  NAME_MAX,
  NAME_PATTERN,
  RENAME_COOLDOWN_MS,
  isNameCharValid,
  validateName,
} from "../../shared/nameRules.js";
