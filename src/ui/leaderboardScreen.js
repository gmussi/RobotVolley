/**
 * Leaderboard — daily and weekly boards with a live reset countdown.
 *
 * The countdown ticks against the server's `resetsAt`, corrected for the offset
 * between the server clock and this device's, so a wrong system clock shows the
 * right time remaining. Periods are UTC, so everyone's board resets together.
 */
import { W, H } from "../data/constants.js";
import { apiFetch, isApiConfigured } from "../net/api.js";
import { formatCountdown } from "../../shared/periods.js";
import { getProfile } from "../progress/profile.js";
import {
  COLORS, fontDisplay, fontBody,
  drawScrim, drawTitle, drawGlassPanel, drawFooterHint, roundRect,
} from "./neonUi.js";

const PERIODS = ["daily", "weekly"];
const ROWS_VISIBLE = 9;

let period = "daily";
/** @type {"idle"|"loading"|"ready"|"offline"} */
let loadState = "idle";
let board = null;
/** serverTime - Date.now() at fetch, so the countdown ignores clock skew. */
let clockOffset = 0;
let scrollTop = 0;

export const leaderboardHitBoxes = [];

export function resetLeaderboard() {
  scrollTop = 0;
  void load();
}

async function load() {
  if (!isApiConfigured()) {
    loadState = "offline";
    return;
  }
  loadState = "loading";
  const res = await apiFetch(`/leaderboard?period=${period}`);
  if (res.ok && res.data) {
    board = res.data;
    clockOffset = (res.data.serverTime ?? Date.now()) - Date.now();
    loadState = "ready";
  } else {
    loadState = "offline";
  }
}

function setPeriod(next) {
  if (period === next) return;
  period = next;
  board = null;
  scrollTop = 0;
  void load();
}

export function handleLeaderboardKey(code) {
  if (code === "ArrowLeft" || code === "KeyA") {
    setPeriod(PERIODS[(PERIODS.indexOf(period) + PERIODS.length - 1) % PERIODS.length]);
    return true;
  }
  if (code === "ArrowRight" || code === "KeyD") {
    setPeriod(PERIODS[(PERIODS.indexOf(period) + 1) % PERIODS.length]);
    return true;
  }
  const max = Math.max(0, (board?.entries?.length ?? 0) - ROWS_VISIBLE);
  if (code === "ArrowDown" || code === "KeyS") {
    scrollTop = Math.min(max, scrollTop + 1);
    return true;
  }
  if (code === "ArrowUp" || code === "KeyW") {
    scrollTop = Math.max(0, scrollTop - 1);
    return true;
  }
  return false;
}

export function handleLeaderboardPointer(mx, my, phase) {
  if (phase !== "down") return false;
  for (const box of leaderboardHitBoxes) {
    if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
      setPeriod(box.period);
      return true;
    }
  }
  return false;
}

function drawTabs(ctx, x, y, w) {
  const tabW = w / PERIODS.length;
  PERIODS.forEach((p, i) => {
    const tx = x + i * tabW;
    const active = p === period;
    leaderboardHitBoxes.push({ period: p, x: tx, y, w: tabW, h: 34 });
    drawGlassPanel(ctx, tx + 3, y, tabW - 6, 34, {
      radius: 8,
      borderColor: active ? COLORS.accent : COLORS.surfaceBorder,
      glowColor: active ? COLORS.accent : null,
      fillAlpha: active ? 0.7 : 0.35,
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontDisplay(15, 700);
    ctx.letterSpacing = "2px";
    ctx.fillStyle = active ? COLORS.accent : COLORS.textMuted;
    ctx.fillText(p.toUpperCase(), tx + tabW / 2, y + 17);
    ctx.letterSpacing = "0px";
  });
}

function drawRow(ctx, entry, x, y, w, highlight) {
  const h = 30;
  if (highlight) {
    roundRect(ctx, x - 6, y - h / 2, w + 12, h, 6);
    ctx.fillStyle = "rgba(255,213,74,0.12)";
    ctx.fill();
  }
  ctx.textBaseline = "middle";
  ctx.font = fontDisplay(15, 700);
  ctx.fillStyle = highlight ? COLORS.accent : COLORS.textMuted;
  ctx.textAlign = "right";
  ctx.fillText(String(entry.rank), x + 34, y);

  ctx.textAlign = "left";
  ctx.fillStyle = highlight ? COLORS.accent : COLORS.text;
  ctx.fillText(entry.name, x + 52, y);

  // Ranked by points internally (see server/src/results.js), but points is an
  // abstract number players have no context for — a win/loss record reads at
  // a glance, so that is what the board actually shows.
  const losses = Math.max(0, (entry.matches ?? 0) - (entry.wins ?? 0));
  ctx.textAlign = "right";
  ctx.font = fontBody(13, 700);
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(`${entry.wins}W`, x + w - 96, y);
  ctx.font = fontDisplay(15, 700);
  ctx.fillStyle = highlight ? COLORS.accent : COLORS.text;
  ctx.fillText(`${losses}L`, x + w - 12, y);
}

export function drawLeaderboardScreen(ctx) {
  leaderboardHitBoxes.length = 0;
  drawScrim(ctx, 0.6);

  const panelX = W / 2 - 330;
  const panelW = 660;
  drawGlassPanel(ctx, panelX, H * 0.13, panelW, H * 0.76, { radius: 16, fillAlpha: 0.84 });
  drawTitle(ctx, "LEADERBOARD", W / 2, H * 0.09, 38);

  drawTabs(ctx, panelX + 24, H * 0.17, panelW - 48);

  // Reset countdown — the whole reason the board feels urgent.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontBody(13, 700);
  if (board?.resetsAt) {
    const remaining = board.resetsAt - (Date.now() + clockOffset);
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(`RESETS IN ${formatCountdown(remaining)}`, W / 2, H * 0.265);
  } else {
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(" ", W / 2, H * 0.265);
  }

  const listX = panelX + 40;
  const listW = panelW - 80;
  let y = H * 0.34;

  if (loadState === "loading" && !board) {
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = fontBody(14, 700);
    ctx.fillText("LOADING…", W / 2, H * 0.5);
    return;
  }
  if (loadState === "offline") {
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = fontBody(14, 700);
    ctx.fillText("CAN'T REACH THE SERVER", W / 2, H * 0.5);
    drawFooterHint(ctx, [{ text: "ESC   BACK", accent: true }], H - 44);
    return;
  }

  // Column header, so the two numbers on each row are readable.
  ctx.textAlign = "right";
  ctx.font = fontBody(11, 700);
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText("WINS", listX + listW - 96, y - 22);
  ctx.fillText("LOSSES", listX + listW - 12, y - 22);

  const entries = board?.entries ?? [];
  if (!entries.length) {
    ctx.textAlign = "center";
    ctx.font = fontBody(14, 700);
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText("NOBODY HAS PLAYED YET — BE FIRST", W / 2, H * 0.5);
  } else {
    const myId = getProfile().accountId;
    for (const entry of entries.slice(scrollTop, scrollTop + ROWS_VISIBLE)) {
      drawRow(ctx, entry, listX, y, listW, entry.accountId === myId);
      y += 32;
    }
  }

  // Your own row, pinned, when you're not visible in the window above.
  const me = board?.me;
  const visible = entries
    .slice(scrollTop, scrollTop + ROWS_VISIBLE)
    .some((e) => e.accountId === me?.accountId);
  if (me && !visible) {
    const pinY = H * 0.83;
    ctx.strokeStyle = COLORS.surfaceBorder;
    ctx.beginPath();
    ctx.moveTo(listX, pinY - 20);
    ctx.lineTo(listX + listW, pinY - 20);
    ctx.stroke();
    drawRow(ctx, me, listX, pinY, listW, true);
  }

  drawFooterHint(ctx, [
    { text: "◄ ►  DAILY / WEEKLY      ▲ ▼  SCROLL" },
    { text: "ESC   BACK", accent: true },
  ], H - 44);
}
