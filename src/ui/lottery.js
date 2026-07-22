/**
 * Part lottery reel animation — one panel per court side.
 */
import { W, H } from "../data/constants.js";
import {
  lotteryResults, lotteryTimer,
  LOTTERY_SPIN_DURATION, LOTTERY_HOLD_DURATION, LOTTERY_TOTAL_DURATION,
} from "../engine/game.js";

const ITEM_H = 52;
const PANEL_W = 196;
const PANEL_H = 292;
const REEL_H = ITEM_H * 3;
const ACCENTS = ["#ff5a5f", "#29b6f6"];

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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

export function drawPartIcon(ctx, slotKey, typeId, cx, cy, accent) {
  ctx.save();
  ctx.translate(cx, cy);

  if (slotKey === "headType") {
    if (typeId === "dome") {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 12, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    } else if (typeId === "magnet") {
      ctx.strokeStyle = "#e53935";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(-8, 0, 8, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = "#1e88e5";
      ctx.beginPath();
      ctx.arc(8, 0, 8, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
    } else if (typeId === "drill") {
      ctx.fillStyle = accent;
      roundRect(ctx, -14, -8, 18, 16, 4);
      ctx.fill();
      ctx.fillStyle = "#9aa3ad";
      ctx.beginPath();
      ctx.moveTo(4, -10);
      ctx.lineTo(20, 0);
      ctx.lineTo(4, 10);
      ctx.closePath();
      ctx.fill();
    } else if (typeId === "satellite") {
      ctx.fillStyle = accent;
      roundRect(ctx, -14, -2, 28, 18, 5);
      ctx.fill();
      ctx.fillStyle = "#d8dee8";
      ctx.beginPath();
      ctx.ellipse(0, -10, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = accent;
      roundRect(ctx, -16, -10, 32, 22, 6);
      ctx.fill();
      ctx.fillStyle = "#ffd54a";
      ctx.fillRect(-8, -2, 16, 4);
    }
  } else if (slotKey === "torsoType") {
    if (typeId === "heavy") {
      ctx.fillStyle = accent;
      roundRect(ctx, -18, -12, 36, 28, 6);
      ctx.fill();
      ctx.strokeStyle = "#1a1e28";
      ctx.lineWidth = 3;
      roundRect(ctx, -18, -12, 36, 28, 6);
      ctx.stroke();
    } else if (typeId === "light") {
      ctx.strokeStyle = "#b8c0c8";
      ctx.lineWidth = 2;
      roundRect(ctx, -16, -10, 32, 24, 5);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 10);
      ctx.stroke();
    } else if (typeId === "lowCoG") {
      ctx.fillStyle = accent;
      roundRect(ctx, -16, -8, 32, 22, 5);
      ctx.fill();
      ctx.fillStyle = "#7a8490";
      ctx.beginPath();
      ctx.arc(0, 10, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = accent;
      roundRect(ctx, -16, -12, 32, 26, 8);
      ctx.fill();
      ctx.fillStyle = "#ffd54a";
      ctx.fillRect(-2, -4, 4, 12);
    }
  } else {
    const legDraw = (lx) => {
      if (typeId === "power") {
        ctx.fillStyle = accent;
        roundRect(ctx, lx - 7, -6, 14, 22, 4);
        ctx.fill();
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const y = 10 + i * 3;
          ctx.moveTo(lx - 4, y);
          ctx.lineTo(lx + 4, y + 2);
        }
        ctx.stroke();
      } else if (typeId === "rocket") {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(lx - 5, -6);
        ctx.lineTo(lx + 5, -6);
        ctx.lineTo(lx + 3, 16);
        ctx.lineTo(lx - 3, 16);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,140,40,0.85)";
        ctx.beginPath();
        ctx.ellipse(lx, 18, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = accent;
        roundRect(ctx, lx - 6, -4, 12, 20, 4);
        ctx.fill();
      }
    };
    legDraw(-9);
    legDraw(9);
    ctx.fillStyle = "#20242f";
    roundRect(ctx, -16, 16, 32, 6, 3);
    ctx.fill();
  }

  ctx.restore();
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

  drawPartIcon(ctx, result.slotKey, option.id, x + w / 2, y + h * 0.38, accent);
  ctx.fillStyle = highlighted ? "#fff" : "rgba(255,255,255,0.82)";
  ctx.font = `${highlighted ? "bold " : ""}13px 'Segoe UI', sans-serif`;
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

  ctx.save();
  ctx.fillStyle = "rgba(8,12,22,0.88)";
  roundRect(ctx, panelX, panelY, PANEL_W, PANEL_H, 14);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.font = "bold 13px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`PLAYER ${playerIdx + 1}`, cx, panelY + 22);

  ctx.fillStyle = "#c084fc";
  ctx.font = "bold 15px 'Segoe UI', sans-serif";
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
    ctx.font = `bold ${18 + pulse * 2}px 'Segoe UI', sans-serif`;
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
      "12px 'Segoe UI', sans-serif",
      14,
    );
  }

  ctx.restore();
}

export function drawLotteryAnimation(ctx) {
  const elapsed = LOTTERY_TOTAL_DURATION - lotteryTimer;
  drawLotterySide(ctx, lotteryResults[0], W * 0.25, 0, elapsed);
  drawLotterySide(ctx, lotteryResults[1], W * 0.75, 1, elapsed);
}
