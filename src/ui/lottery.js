/**
 * Part lottery reel animation — one panel per court side.
 */
import { W, H } from "../data/constants.js";
import {
  lotteryResults, lotteryTimer,
  LOTTERY_SPIN_DURATION, LOTTERY_HOLD_DURATION, LOTTERY_TOTAL_DURATION,
} from "../engine/game.js";
import { colorsFromAccent, drawPartPreview } from "./robotDraw.js";
import { COLORS, fontDisplay, fontBody, drawGlassPanel, roundRect } from "./neonUi.js";

const ITEM_H = 52;
const PANEL_W = 196;
const PANEL_H = 292;
const REEL_H = ITEM_H * 3;
const ACCENTS = [COLORS.p1, COLORS.p2];

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
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

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrappedCenterText(ctx, text, cx, y, maxWidth, color, font, lineHeight) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapText(ctx, text, maxWidth);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, cx, startY + i * lineHeight));
}

function drawReelItem(ctx, result, option, x, y, w, h, accent, highlighted) {
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
    result.slotKey,
    option.id,
    x + w / 2,
    y + h * 0.38,
    h * 0.52,
    colorsFromAccent(accent),
  );
  ctx.fillStyle = highlighted ? COLORS.text : "rgba(255,255,255,0.82)";
  ctx.font = fontBody(13, highlighted ? 600 : 400);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(option.label, x + w / 2, y + h - 12);
}

function drawLotterySide(ctx, result, cx, playerIdx, elapsed) {
  if (!result) return;

  const accent = ACCENTS[playerIdx];
  const panelX = cx - PANEL_W / 2;
  const panelY = H * 0.28;
  const spinProgress = Math.min(1, elapsed / LOTTERY_SPIN_DURATION);
  const holding = elapsed >= LOTTERY_SPIN_DURATION;
  const winIdx = Math.max(0, result.options.findIndex((o) => o.id === result.newType));

  drawGlassPanel(ctx, panelX, panelY, PANEL_W, PANEL_H, {
    radius: 14,
    borderColor: accent,
    glowColor: holding ? accent : null,
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
  ctx.strokeStyle = holding ? accent : "rgba(192,132,252,0.55)";
  ctx.lineWidth = holding ? 2.5 : 1.5;
  roundRect(ctx, reelX + 4, selectY, reelW - 8, ITEM_H, 8);
  ctx.stroke();

  ctx.save();
  roundRect(ctx, reelX, reelY, reelW, REEL_H, 10);
  ctx.clip();

  const n = result.options.length;

  if (holding) {
    for (const row of [-1, 0, 1]) {
      const option = result.options[((winIdx + row) % n + n) % n];
      drawReelItem(
        ctx, result, option, reelX, selectY + row * ITEM_H, reelW, ITEM_H, accent, row === 0,
      );
    }
  } else {
    const reelOffset = computeReelOffset(result, spinProgress);
    const firstIndex = Math.floor(reelOffset / ITEM_H);
    const subOffset = reelOffset % ITEM_H;

    for (let row = -1; row <= 4; row++) {
      const itemY = selectY + row * ITEM_H - subOffset;
      if (itemY + ITEM_H < reelY || itemY > reelY + REEL_H) continue;
      const option = result.options[((firstIndex + row) % n + n) % n];
      drawReelItem(ctx, result, option, reelX, itemY, reelW, ITEM_H, accent, false);
    }
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

  if (holding) {
    const pulse = 0.85 + 0.15 * Math.sin((elapsed - LOTTERY_SPIN_DURATION) * 8);
    ctx.fillStyle = accent;
    ctx.font = fontDisplay(18 + pulse * 2, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${result.slotName}: ${result.newLabel}`, cx, panelY + PANEL_H - 56);
    drawWrappedCenterText(
      ctx,
      result.newDescription,
      cx,
      panelY + PANEL_H - 24,
      PANEL_W - 20,
      "rgba(255,255,255,0.82)",
      fontBody(12),
      14,
    );
  }
}

export function drawLotteryAnimation(ctx) {
  const elapsed = LOTTERY_TOTAL_DURATION - lotteryTimer;
  drawLotterySide(ctx, lotteryResults[0], W * 0.25, 0, elapsed);
  drawLotterySide(ctx, lotteryResults[1], W * 0.75, 1, elapsed);
}
