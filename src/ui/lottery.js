/**
 * Part lottery reel animation — one panel per court side.
 * After the spin lands, the reel is replaced by a big bounce-in reveal card.
 */
import { W, H } from "../data/constants.js";
import {
  lotteryResults, lotteryTimer,
  LOTTERY_SPIN_DURATION, LOTTERY_TOTAL_DURATION,
} from "../engine/game.js";
import { colorsFromAccent, drawPartPreview } from "./robotDraw.js";
import { itemPreviewSlot } from "../data/items.js";
import { COLORS, fontDisplay, fontBody, drawGlassPanel, roundRect } from "./neonUi.js";

const ITEM_H = 52;
const PANEL_W = 196;
const REEL_H = ITEM_H * 3;
// Header (player + category) + reel + bottom pad — no room under the reel.
const PANEL_H = 62 + REEL_H + 14;
const REVEAL_SIZE = 268;
const ACCENTS = [COLORS.p1, COLORS.p2];

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** Overshoot bounce — pops past 1 then settles. */
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

export function computeReelOffset(result, spinProgress) {
  const { options, newType, reelCycles } = result;
  const n = options.length;
  const winIdx = Math.max(0, options.findIndex((o) => o.id === newType));
  const scrollItems = Math.ceil(reelCycles) * n + winIdx;
  return scrollItems * ITEM_H * easeOutCubic(spinProgress);
}

export function centerOptionIndex(result, spinProgress = 1) {
  const n = result.options.length;
  const firstIndex = Math.floor(computeReelOffset(result, spinProgress) / ITEM_H);
  return ((firstIndex % n) + n) % n;
}

function drawReelItem(ctx, result, option, x, y, w, h, accent, highlighted, side = -1) {
  roundRect(ctx, x + 6, y + 4, w - 12, h - 8, 8);
  ctx.fillStyle = highlighted ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
  ctx.fill();
  if (highlighted) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawPartPreview(
    ctx,
    itemPreviewSlot(result.kind, option.id),
    option.id,
    x + w / 2,
    y + h * 0.38,
    h * 0.52,
    colorsFromAccent(accent),
    { side },
  );
  ctx.fillStyle = highlighted ? COLORS.text : "rgba(255,255,255,0.82)";
  ctx.font = fontBody(13, highlighted ? 600 : 400);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(option.label, x + w / 2, y + h - 12);
}

/** Big square card that replaces the reel once the winner lands. */
function drawRevealCard(ctx, result, cx, playerIdx, holdElapsed) {
  const accent = ACCENTS[playerIdx];
  const side = playerIdx === 0 ? -1 : 1;
  const cy = H * 0.28 + REVEAL_SIZE / 2 + 8;

  // Bounce in over the first ~0.5s, then a soft idle pulse.
  const bounceT = Math.min(1, holdElapsed / 0.5);
  const scale = easeOutBack(bounceT);
  const pulse = holdElapsed > 0.5
    ? 1 + 0.02 * Math.sin((holdElapsed - 0.5) * 7)
    : 1;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale * pulse, scale * pulse);
  ctx.translate(-cx, -cy);

  const x = cx - REVEAL_SIZE / 2;
  const y = cy - REVEAL_SIZE / 2;

  drawGlassPanel(ctx, x, y, REVEAL_SIZE, REVEAL_SIZE, {
    radius: 18,
    borderColor: accent,
    glowColor: accent,
    fillAlpha: 0.92,
  });

  ctx.fillStyle = accent;
  ctx.font = fontBody(13, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`PLAYER ${playerIdx + 1}`, cx, y + 26);

  ctx.fillStyle = COLORS.lottery;
  ctx.font = fontDisplay(14, 600);
  ctx.fillText(result.slotName.toUpperCase(), cx, y + 48);

  // Big icon in the center of the square.
  drawPartPreview(
    ctx,
    itemPreviewSlot(result.kind, result.newType),
    result.newType,
    cx,
    y + REVEAL_SIZE * 0.52,
    REVEAL_SIZE * 0.52,
    colorsFromAccent(accent),
    { side },
  );

  ctx.fillStyle = COLORS.text;
  ctx.font = fontDisplay(24, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillText(result.newLabel, cx, y + REVEAL_SIZE - 34);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawSpinPanel(ctx, result, cx, playerIdx, elapsed) {
  const accent = ACCENTS[playerIdx];
  const panelX = cx - PANEL_W / 2;
  const panelY = H * 0.28;
  const spinProgress = Math.min(1, elapsed / LOTTERY_SPIN_DURATION);

  drawGlassPanel(ctx, panelX, panelY, PANEL_W, PANEL_H, {
    radius: 14,
    borderColor: accent,
    glowColor: null,
    fillAlpha: 0.88,
  });

  ctx.fillStyle = accent;
  ctx.font = fontBody(13, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`PLAYER ${playerIdx + 1}`, cx, panelY + 22);

  ctx.fillStyle = COLORS.lottery;
  ctx.font = fontDisplay(15, 600);
  ctx.fillText(`GETTING NEW ${result.slotName.toUpperCase()}`, cx, panelY + 44);

  const reelX = panelX + 10;
  const reelY = panelY + 62;
  const reelW = PANEL_W - 20;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, reelX, reelY, reelW, REEL_H, 10);
  ctx.fill();

  const selectY = reelY + REEL_H / 2 - ITEM_H / 2;
  ctx.strokeStyle = "rgba(192,132,252,0.55)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, reelX + 4, selectY, reelW - 8, ITEM_H, 8);
  ctx.stroke();

  ctx.save();
  roundRect(ctx, reelX, reelY, reelW, REEL_H, 10);
  ctx.clip();

  const n = result.options.length;
  const reelOffset = computeReelOffset(result, spinProgress);
  const firstIndex = Math.floor(reelOffset / ITEM_H);
  const subOffset = reelOffset % ITEM_H;

  for (let row = -1; row <= 4; row++) {
    const itemY = selectY + row * ITEM_H - subOffset;
    if (itemY + ITEM_H < reelY || itemY > reelY + REEL_H) continue;
    const option = result.options[((firstIndex + row) % n + n) % n];
    drawReelItem(ctx, result, option, reelX, itemY, reelW, ITEM_H, accent, false,
      playerIdx === 0 ? -1 : 1);
  }
  ctx.restore();

  const fadeH = 18;
  const topGrad = ctx.createLinearGradient(0, reelY, 0, reelY + fadeH);
  topGrad.addColorStop(0, "rgba(8,12,22,0.95)");
  topGrad.addColorStop(1, "rgba(8,12,22,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(reelX, reelY, reelW, fadeH);
  const botGrad = ctx.createLinearGradient(0, reelY + REEL_H - fadeH, 0, reelY + REEL_H);
  botGrad.addColorStop(0, "rgba(8,12,22,0)");
  botGrad.addColorStop(1, "rgba(8,12,22,0.95)");
  ctx.fillStyle = botGrad;
  ctx.fillRect(reelX, reelY + REEL_H - fadeH, reelW, fadeH);
}

function drawLotterySide(ctx, result, cx, playerIdx, elapsed) {
  if (!result) return;

  if (elapsed >= LOTTERY_SPIN_DURATION) {
    drawRevealCard(ctx, result, cx, playerIdx, elapsed - LOTTERY_SPIN_DURATION);
    return;
  }
  drawSpinPanel(ctx, result, cx, playerIdx, elapsed);
}

export function drawLotteryAnimation(ctx) {
  const elapsed = LOTTERY_TOTAL_DURATION - lotteryTimer;
  drawLotterySide(ctx, lotteryResults[0], W * 0.25, 0, elapsed);
  drawLotterySide(ctx, lotteryResults[1], W * 0.75, 1, elapsed);
}
