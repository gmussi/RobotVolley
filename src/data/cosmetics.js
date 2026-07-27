/**
 * Cosmetics catalog, re-exported so game code keeps importing item data from
 * `src/data/` like every other part module.
 *
 * The implementation lives in `shared/` because the Worker imports the exact
 * same file — the greyed-out tile in the Profile screen and the server's
 * "you haven't unlocked that" both run this code, so they cannot disagree.
 */
export {
  SLOTS,
  ITEMS,
  ENABLED_SLOTS,
  itemsForSlot,
  getItem,
  defaultLoadout,
  unlockProgress,
  unlockLabel,
  earnedCosmetics,
  sanitizeCosmetics,
  spriteFor,
} from "../../shared/cosmetics.js";
