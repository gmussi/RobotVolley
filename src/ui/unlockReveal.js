/**
 * "You unlocked an aura" — the only moment a player is told they earned a
 * cosmetic.
 *
 * Two surfaces, because the two reward families are granted at different times:
 *
 *   Post-match, one panel per court half. Both peers get the same
 *   server-authoritative payload (MM.RESULT_SETTLED), so each side sees its own
 *   prize *and* the opponent's — winning something in front of the person you
 *   beat is most of the point.
 *
 *   At launch, one centred panel. Leaderboard auras are granted by the nightly
 *   rollover, hours after the match that earned them, so they can never appear
 *   in a post-match reveal. Without this second surface the six auras — the
 *   headline rewards — would be silent. It also catches anyone who dropped
 *   before RESULT_SETTLED arrived.
 *
 * One item per player, even when several land together: placing first grants
 * three aura tiers at once, and three panels would bury the one that matters.
 * `pickReveal` in shared/cosmetics.js chooses.
 */
import { W, H } from "../data/constants.js";
import { getItem, pickReveal, spriteFor, defaultLoadout } from "../data/cosmetics.js";
import { onlineNames, onlineLocalSeat } from "../engine/game.js";
import { getItem as loadSaved, setItem as saveItem } from "../platform/save.js";
import { t } from "../i18n/index.js";
import { COLORS, GLOW, fontDisplay, fontBody, drawGlassPanel } from "./neonUi.js";
import { drawRobotPreview } from "./robotPreview.js";
import { drawDecalPlate } from "./decalDraw.js";

/** Ids already revealed, so a reward is announced once and never nags again. */
const SEEN_KEY = "robotvolley_seen_unlocks";

/** Post-match panels, indexed by seat. null = that seat won nothing. */
let matchPanels = [null, null];
/** The launch-time panel, if anything was granted while away. */
let launchPanel = null;

/**
 * The seen list, or null if this install has never recorded one.
 *
 * The null case is load-bearing: it is how a fresh install is told apart from an
 * install that has simply unlocked nothing. An empty array is a real answer.
 */
function readSeen() {
  try {
    const raw = loadSaved(SEEN_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

function markSeen(ids) {
  const seen = new Set(readSeen() ?? []);
  for (const id of ids) seen.add(id);
  saveItem(SEEN_KEY, JSON.stringify([...seen]));
}

/** Post-match reveal. `unlocksBySeat` is [seat0Ids, seat1Ids] from the server. */
export function showMatchUnlocks(unlocksBySeat) {
  if (!Array.isArray(unlocksBySeat)) return;
  matchPanels = [0, 1].map((seat) => {
    const id = pickReveal(unlocksBySeat[seat] ?? []);
    return id ? { id, seat } : null;
  });
  // Both sides' prizes count as seen: the local player just watched them, and
  // the opponent's were never ours to announce again.
  markSeen(unlocksBySeat.flat().filter(Boolean));
}

/**
 * Reconcile an owned set against what has already been announced, and queue the
 * launch-time reveal for anything new. Call after every profile sync.
 *
 * On an install that has never recorded a seen list, everything owned is banked
 * silently instead: signing in on a second device would otherwise replay a
 * season's worth of rewards one panel at a time. The list is written even when
 * empty, so "new install" is only ever true once.
 */
export function reconcileUnlocks(unlockIds) {
  const ids = unlockIds ?? [];
  const seen = readSeen();
  if (seen === null) {
    markSeen(ids);
    return;
  }
  const known = new Set(seen);
  const fresh = ids.filter((id) => !known.has(id) && getItem(id)?.reveal != null);
  if (!fresh.length) return;
  launchPanel = { id: pickReveal(fresh), seat: null };
  markSeen(fresh);
}

export function clearMatchUnlocks() {
  matchPanels = [null, null];
}

export function dismissLaunchUnlock() {
  launchPanel = null;
}

export function hasLaunchUnlock() {
  return !!launchPanel;
}

// ------------------------------------------------------------------ drawing

/**
 * Who won something. Deliberately does *not* name the slot: the slot labels are
 * section headings ("DECALS", "AURA"), and dropping one into a sentence gives
 * "YOU UNLOCKED A DECALS" — and in half the locales it would need an article
 * agreeing with a noun the translator never sees. The item's own name and
 * picture sit directly below, which says what it is far better than the
 * category would.
 */
function revealTitle(seat) {
  // Second person for your own prize, the opponent's name for theirs — the
  // panel has to be readable at a glance from across the court.
  if (seat === null || seat === onlineLocalSeat) return t("reveal.you");
  const name = onlineNames?.opponent;
  return name ? t("reveal.player", { name }) : t("reveal.opponent");
}

function itemLabel(item, id) {
  const key = `cosmetic.item.${id}`;
  const translated = t(key);
  return translated !== key ? translated : item.label;
}

/**
 * Show the cosmetic itself, not just its name. Bottom-aligned inside the given
 * box so the robot stands on the panel floor at any panel height.
 *
 * Auras ride on a robot, so the shared preview renders one wearing it — and
 * because drawRobotPreview goes through the normal figure draw, the aura layer
 * comes along for free. Decals cannot be worn at all, so the robot stands on its
 * board instead, which is where a decal actually lives.
 */
function drawSubject(ctx, item, id, cx, top, w, h) {
  const floor = top + h;
  if (item.slot === "decal") {
    const plateH = Math.min(38, Math.round(h * 0.34));
    const plateY = floor - plateH;
    drawDecalPlate(ctx, spriteFor({ decal: id }, "decal"), cx - w / 2, plateY, w, plateH);
    // Standing on the board rather than behind it, so both stay legible.
    drawRobotPreview(ctx, defaultLoadout(), cx, plateY + plateH * 0.6, (h - plateH) / 150);
    return;
  }
  drawRobotPreview(ctx, { ...defaultLoadout(), [item.slot]: id }, cx, floor - 4, h / 150);
}

function drawPanel(ctx, panel, cx, top, w, h) {
  const item = getItem(panel.id);
  if (!item) return;

  drawGlassPanel(ctx, cx - w / 2, top, w, h, {
    borderColor: COLORS.accent,
    glowColor: GLOW.accent,
  });

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.accent;
  ctx.font = fontDisplay(19);
  ctx.fillText(revealTitle(panel.seat), cx, top + 26);

  ctx.fillStyle = COLORS.text;
  ctx.font = fontDisplay(25);
  ctx.fillText(itemLabel(item, panel.id).toUpperCase(), cx, top + 52);
  ctx.restore();

  drawSubject(ctx, item, panel.id, cx, top + 62, w - 40, h - 72);
}

/**
 * Post-match panels, one per half.
 *
 * Positioned under the win overlay rather than centred: that panel runs to
 * roughly 0.65H (see the "over" branch of render.js), and the reveal must not
 * cover the score. The two halves are far enough apart not to meet.
 */
export function drawMatchUnlocks(ctx) {
  if (!matchPanels[0] && !matchPanels[1]) return;
  const w = W * 0.4;
  const h = 190;
  const top = H - h - 10;
  for (const seat of [0, 1]) {
    const panel = matchPanels[seat];
    if (!panel) continue;
    // Seat 0 plays the left half, seat 1 the right — the same halves the decals
    // claim, so a player's prize appears over their own side of the court.
    drawPanel(ctx, panel, seat === 0 ? W * 0.26 : W * 0.74, top, w, h);
  }
}

/** The launch-time reveal: centred, dimmed background, dismissed by any key. */
export function drawLaunchUnlock(ctx) {
  if (!launchPanel) return;
  const w = W * 0.44;
  const h = 300;
  const top = Math.round(H * 0.5 - h / 2) - 10;

  ctx.save();
  ctx.fillStyle = "rgba(6,9,18,0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  drawPanel(ctx, launchPanel, W / 2, top, w, h);

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = fontBody(15);
  ctx.fillText(t("reveal.dismiss"), W / 2, top + h + 30);
  ctx.restore();
}
