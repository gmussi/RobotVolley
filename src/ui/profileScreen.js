/**
 * Profile screen — your robot's name and its cosmetics.
 *
 * Four sections (TORSO / HEAD / AURA / SPECIAL), each browsed with ◄ ►. Only
 * TORSO is live; the rest are drawn greyed with COMING SOON. That is driven by
 * the `enabled` flag in shared/cosmetics.json rather than hardcoded here, so
 * switching one on later is a data change plus its art.
 *
 * Browsing walks the *whole* list, locked entries included — seeing the chrome
 * torso you haven't earned, with "WIN 10 MATCHES" under it, is the point. Only
 * equipping is gated, and the server re-checks that anyway.
 */
import { W, H } from "../data/constants.js";
import { SLOTS, itemsForSlot, unlockProgress, getItem } from "../data/cosmetics.js";
import {
  getProfile, getSyncState, getLoadout, updateLoadout, updateName,
} from "../progress/profile.js";
import { NAME_MAX, NAME_MIN, isNameCharValid } from "../data/nameRules.js";
import { t } from "../i18n/index.js";
import { drawRobotPreview } from "./robotPreview.js";
import {
  COLORS, fontDisplay, fontBody,
  drawScrim, drawTitle, drawGlassPanel, drawFooterHint, roundRect,
} from "./neonUi.js";
import { drawHintText } from "./glyphs.js";

function localizedUnlockLabel(itemId) {
  const item = getItem(itemId);
  const rule = item?.unlock ?? { type: "default" };
  switch (rule.type) {
    case "default":
      return "";
    case "wins":
      return rule.n === 1 ? t("unlock.win1") : t("unlock.wins", { n: rule.n });
    case "matches":
      return t("unlock.matches", { n: rule.n });
    case "rank":
      return t("unlock.rank", {
        n: rule.top,
        board: t(`leaderboard.${rule.board}`),
      });
    default:
      return t("unlock.locked");
  }
}

function cosmeticItemLabel(item) {
  if (!item) return "—";
  const key = `cosmetic.item.${item.id}`;
  const translated = t(key);
  return translated !== key ? translated : item.label;
}

function slotLabel(slot) {
  const key = `cosmetic.slot.${slot.id}`;
  const translated = t(key);
  return translated !== key ? translated : slot.label;
}

/** Focus row 0 is the name; rows 1..n are the cosmetic sections. */
let focusIndex = 0;
/** Index into each slot's item list — what the preview is currently showing. */
const browseIndex = {};
/** Non-null while the player is typing a new name. */
let nameDraft = null;
let nameError = "";
let nameBusy = false;

/** Hit boxes, refilled every draw (same contract as settings.js). */
export const profileHitBoxes = [];

const ROW_COUNT = () => 1 + SLOTS.length;

/** Sync the browse cursors to whatever is actually equipped. */
function syncBrowseToLoadout() {
  const loadout = getLoadout();
  for (const slot of SLOTS) {
    const items = itemsForSlot(slot.id);
    const idx = items.findIndex((it) => it.id === loadout[slot.id]);
    browseIndex[slot.id] = idx >= 0 ? idx : 0;
  }
}

export function resetProfileFocus() {
  focusIndex = 0;
  nameDraft = null;
  nameError = "";
  nameBusy = false;
  syncBrowseToLoadout();
}

/** What the preview should wear right now — the browsed item, not the saved one. */
function previewLoadout() {
  const out = { ...getLoadout() };
  for (const slot of SLOTS) {
    if (!slot.enabled) continue;
    const items = itemsForSlot(slot.id);
    const item = items[browseIndex[slot.id] ?? 0];
    if (item) out[slot.id] = item.id;
  }
  return out;
}

function currentItem(slotId) {
  const items = itemsForSlot(slotId);
  return items[browseIndex[slotId] ?? 0] ?? null;
}

/**
 * Move the cursor within a slot and equip if the landing item is owned. A
 * locked item is still shown — the player just keeps wearing what they had.
 */
function browse(slotId, delta) {
  const items = itemsForSlot(slotId);
  if (!items.length) return;
  const n = items.length;
  browseIndex[slotId] = ((browseIndex[slotId] ?? 0) + delta + n) % n;

  const item = items[browseIndex[slotId]];
  if (!unlockProgress(item.id, getProfile().stats).unlocked) return;
  void updateLoadout({ ...getLoadout(), [slotId]: item.id });
}

// ---------------------------------------------------------------- name entry

function beginNameEdit() {
  nameDraft = getProfile().displayName ?? "";
  nameError = "";
}

async function commitName() {
  const draft = (nameDraft ?? "").trim();
  if (draft.length < NAME_MIN) {
    nameError = t("profile.atLeastChars", { n: NAME_MIN });
    return;
  }
  nameBusy = true;
  const res = await updateName(draft);
  nameBusy = false;
  if (res.ok) {
    nameDraft = null;
    nameError = "";
    return;
  }
  nameError =
    res.error === "name_taken" ? t("profile.nameTaken")
      : res.error === "rename_cooldown" ? t("profile.renameCooldown")
        : res.error === "bad_characters" ? t("profile.badCharacters")
          : res.error === "offline" || res.error === "not_configured" ? t("profile.cantReach")
            : t("profile.couldntSave");
}

/** Returns true when the key was consumed by the name editor. */
function handleNameKey(code, key) {
  if (nameBusy) return true;
  if (code === "Enter") {
    void commitName();
    return true;
  }
  if (code === "Escape") {
    nameDraft = null;
    nameError = "";
    return true;
  }
  if (code === "Backspace") {
    nameDraft = nameDraft.slice(0, -1);
    nameError = "";
    return true;
  }
  if (typeof key === "string" && key.length === 1 && isNameCharValid(key)) {
    if (nameDraft.length < NAME_MAX) nameDraft += key;
    nameError = "";
    return true;
  }
  // Swallow everything else so stray keys can't escape into the menu.
  return true;
}

// -------------------------------------------------------------------- input

/**
 * @returns {boolean} true if consumed. `key` is the printable character (for
 * name entry); callers pass event.key alongside event.code.
 */
export function handleProfileKey(code, key) {
  if (nameDraft !== null) return handleNameKey(code, key);

  if (code === "ArrowUp" || code === "KeyW") {
    focusIndex = (focusIndex - 1 + ROW_COUNT()) % ROW_COUNT();
    return true;
  }
  if (code === "ArrowDown" || code === "KeyS") {
    focusIndex = (focusIndex + 1) % ROW_COUNT();
    return true;
  }

  if (focusIndex === 0) {
    if (code === "Enter" || code === "Space") {
      beginNameEdit();
      return true;
    }
    return false;
  }

  const slot = SLOTS[focusIndex - 1];
  if (!slot?.enabled) return false;
  if (code === "ArrowLeft" || code === "KeyA") {
    browse(slot.id, -1);
    return true;
  }
  if (code === "ArrowRight" || code === "KeyD") {
    browse(slot.id, +1);
    return true;
  }
  return false;
}

export function handleProfilePointer(mx, my, phase) {
  if (phase !== "down") return false;
  for (const box of profileHitBoxes) {
    if (mx < box.x || mx > box.x + box.w || my < box.y || my > box.y + box.h) continue;
    if (box.kind === "name") {
      focusIndex = 0;
      if (nameDraft === null) beginNameEdit();
      return true;
    }
    focusIndex = box.row;
    if (box.kind === "arrow") browse(box.slotId, box.delta);
    return true;
  }
  return false;
}

/** True while typing, so main.js can stop ESC from leaving the screen. */
export function isEditingName() {
  return nameDraft !== null;
}

// ------------------------------------------------------------------ drawing

function drawNameRow(ctx, x, y, w, focused) {
  const h = 42;
  profileHitBoxes.push({ kind: "name", row: 0, x, y, w, h });

  const editing = nameDraft !== null;
  drawGlassPanel(ctx, x, y, w, h, {
    radius: 8,
    borderColor: focused ? COLORS.accent : COLORS.surfaceBorder,
    glowColor: focused ? COLORS.accent : null,
    fillAlpha: 0.6,
  });

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = fontDisplay(20, 700);
  ctx.fillStyle = editing ? COLORS.accent : COLORS.text;
  // A caret that blinks makes it obvious the field is live.
  const caret = editing && Math.floor(performance.now() / 500) % 2 === 0 ? "|" : "";
  ctx.fillText((editing ? nameDraft : getProfile().displayName) + caret, x + 14, y + h / 2);

  ctx.textAlign = "right";
  ctx.font = fontBody(12, 700);
  ctx.fillStyle = COLORS.textMuted;
  if (nameBusy) ctx.fillText(t("profile.saving"), x + w - 14, y + h / 2);
  else if (editing) drawHintText(ctx, t("profile.enterHint", { n: nameDraft.length, max: NAME_MAX }), x + w - 14, y + h / 2, 12, "right");
  else if (focused) drawHintText(ctx, t("profile.enterRename"), x + w - 14, y + h / 2, 12, "right");

  if (nameError) {
    ctx.textAlign = "left";
    ctx.font = fontBody(11, 700);
    ctx.fillStyle = COLORS.p1;
    ctx.fillText(nameError, x + 14, y + h + 11);
  }
}

function drawSectionRow(ctx, slot, row, x, y, w, focused) {
  const h = 54;
  const enabled = slot.enabled;
  const accent = enabled ? COLORS.accent : COLORS.textMuted;

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = fontDisplay(16, 700);
  ctx.letterSpacing = "2px";
  ctx.fillStyle = focused && enabled ? accent : COLORS.textMuted;
  ctx.fillText(slotLabel(slot), x, y);
  ctx.letterSpacing = "0px";

  const boxY = y + 12;
  const boxH = h - 12;
  drawGlassPanel(ctx, x, boxY, w, boxH, {
    radius: 8,
    borderColor: focused && enabled ? accent : COLORS.surfaceBorder,
    glowColor: focused && enabled ? accent : null,
    fillAlpha: enabled ? 0.6 : 0.3,
  });

  const midY = boxY + boxH / 2;

  if (!enabled) {
    ctx.textAlign = "center";
    ctx.font = fontBody(13, 700);
    ctx.fillStyle = COLORS.textMuted;
    ctx.globalAlpha = 0.75;
    ctx.fillText(t("profile.comingSoon"), x + w / 2, midY);
    ctx.globalAlpha = 1;
    return;
  }

  const item = currentItem(slot.id);
  const items = itemsForSlot(slot.id);
  const progress = item ? unlockProgress(item.id, getProfile().stats) : { unlocked: false };

  // Arrows, both live even on a locked item — you can always keep browsing.
  const arrowW = 30;
  for (const [glyph, delta, ax] of [["◄", -1, x + 6], ["►", +1, x + w - arrowW - 6]]) {
    profileHitBoxes.push({
      kind: "arrow", row, slotId: slot.id, delta,
      x: ax, y: boxY + 4, w: arrowW, h: boxH - 8,
    });
    ctx.textAlign = "center";
    ctx.font = fontDisplay(18, 700);
    ctx.fillStyle = focused ? accent : COLORS.textMuted;
    ctx.fillText(glyph, ax + arrowW / 2, midY);
  }

  ctx.textAlign = "center";
  ctx.font = fontDisplay(17, 700);
  ctx.fillStyle = progress.unlocked ? COLORS.text : COLORS.textMuted;
  ctx.globalAlpha = progress.unlocked ? 1 : 0.55;
  ctx.fillText(cosmeticItemLabel(item), x + w / 2, midY - 8);
  ctx.globalAlpha = 1;

  ctx.font = fontBody(11, 700);
  if (progress.unlocked) {
    const equipped = getLoadout()[slot.id] === item?.id;
    ctx.fillStyle = equipped ? COLORS.accent : COLORS.textMuted;
    ctx.fillText(equipped ? t("profile.equipped") : "", x + w / 2, midY + 12);
  } else {
    ctx.fillStyle = COLORS.p1;
    const label = localizedUnlockLabel(item.id);
    const detail = progress.need ? `${label}   (${progress.have}/${progress.need})` : label;
    ctx.fillText(detail, x + w / 2, midY + 12);
  }

  // Position dots — cheap way to show how deep the list goes.
  const dotY = boxY + boxH - 7;
  const dotGap = 9;
  const startX = x + w / 2 - ((items.length - 1) * dotGap) / 2;
  for (let i = 0; i < items.length; i++) {
    const active = i === (browseIndex[slot.id] ?? 0);
    roundRect(ctx, startX + i * dotGap - 2, dotY - 2, 4, 4, 2);
    ctx.fillStyle = active ? accent : COLORS.surfaceBorder;
    ctx.fill();
  }
}

/**
 * Full-bleed layout — this page replaces the home screen entirely rather than
 * floating a dialog over it, so content is laid directly across the canvas
 * (same treatment as the menu itself) instead of inside a bounded card.
 */
export function drawProfileScreen(ctx) {
  profileHitBoxes.length = 0;
  drawScrim(ctx, 0.62);
  drawTitle(ctx, t("profile.title"), W / 2, H * 0.08, 44);

  const margin = 56;

  // Left: the robot wearing whatever is being browsed right now.
  const previewCx = margin + 200;
  drawRobotPreview(ctx, previewLoadout(), previewCx, H * 0.82, 1.35);

  const stats = getProfile().stats;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontBody(12, 700);
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(
    t("profile.stats", { wins: stats.wins, losses: stats.losses, matches: stats.matches }),
    previewCx,
    H * 0.87,
  );
  if (getSyncState() === "offline") {
    ctx.fillStyle = COLORS.p1;
    ctx.fillText(t("profile.offlineWarn"), previewCx, H * 0.91);
  }

  // Right: name + the four sections, filling the rest of the width.
  const colX = margin + 420;
  const colW = W - margin - colX;
  drawNameRow(ctx, colX, H * 0.19, colW, focusIndex === 0);

  const sectionsTop = H * 0.33;
  const sectionsBottom = H * 0.89;
  const rowGap = (sectionsBottom - sectionsTop) / SLOTS.length;
  let y = sectionsTop;
  SLOTS.forEach((slot, i) => {
    drawSectionRow(ctx, slot, i + 1, colX, y, colW, focusIndex === i + 1);
    y += rowGap;
  });

  drawFooterHint(ctx, [
    { text: nameDraft !== null ? t("profile.footerEdit") : t("profile.footer") },
    { text: nameDraft !== null ? "" : t("common.escBack"), accent: true },
  ], H - 34);
}
