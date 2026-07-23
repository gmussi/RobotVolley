/**
 * Canvas renderer. Reads engine state; never mutates rules.
 */
import {
  W, H, FLOOR_Y, WIN_SCORE, SERVE_CHARGE_FLOOR, NET,
} from "../data/constants.js";
import {
  ball, score, state, gameMode, servingSide, serveCharge,
  bannerText, winner, menuOptions, P1, P2, getArmSpec,
} from "../engine/game.js";
import { drawLotteryAnimation } from "./lottery.js";
import { drawRobotFigure, drawPartPreview } from "./robotDraw.js";
import { arenaBgImage, stadiumBg, stadiumLayersReady, logoImage } from "./art.js";

let ctx;
let renderRemainder = 0;

export function initRender(canvas) {
  ctx = canvas.getContext("2d");
}

export function setRenderRemainder(remainder) {
  renderRemainder = remainder;
}

export function applyDpr(dpr) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function render() {
  ctx.clearRect(0, 0, W, H);
  drawArena();
  drawNet();
  drawRobot(P1);
  drawRobot(P2);
  drawAttacks();
  if (state !== "menu") { drawBall(); drawBallTracker(); drawHUD(); }
  if (state === "lottery") {
    ctx.fillStyle = "rgba(6,9,18,0.62)";
    ctx.fillRect(0, 0, W, H);
    drawLotteryAnimation(ctx);
  } else {
    drawBanner();
  }
}

function drawArena() {
  if (stadiumLayersReady()) {
    drawStadiumArena();
    return;
  }

  if (stadiumBg.master.complete && stadiumBg.master.naturalWidth) {
    ctx.drawImage(stadiumBg.master, 0, 0, W, H);
    return;
  }

  if (arenaBgImage.complete && arenaBgImage.naturalWidth) {
    ctx.drawImage(arenaBgImage, 0, 0, W, H);
    return;
  }

  const g = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  g.addColorStop(0, "#0d1430");
  g.addColorStop(1, "#151d3d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, FLOOR_Y);

  ctx.fillStyle = "rgba(255,90,95,0.05)";
  ctx.fillRect(0, 0, W / 2, FLOOR_Y);
  ctx.fillStyle = "rgba(41,182,246,0.05)";
  ctx.fillRect(W / 2, 0, W / 2, FLOOR_Y);

  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FLOOR_Y); ctx.stroke();
  }

  const gg = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
  gg.addColorStop(0, "#2a2f45");
  gg.addColorStop(1, "#171a29");
  ctx.fillStyle = gg;
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, FLOOR_Y, W, 3);
}

function drawStadiumArena() {
  const t = performance.now() * 0.001;
  const { sky, stadium, court } = stadiumBg;

  ctx.globalAlpha = 0.96 + 0.04 * Math.sin(t * 0.8);
  ctx.drawImage(sky, 0, 0, W, H);

  ctx.globalAlpha = 0.97 + 0.03 * Math.sin(t * 2.5);
  ctx.drawImage(stadium, 0, 0, W, H);

  ctx.globalAlpha = 1;
  ctx.drawImage(court, 0, 0, W, H);
  ctx.globalAlpha = 1;
}

function drawNet() {
  const grd = ctx.createLinearGradient(NET.x, 0, NET.x + NET.w, 0);
  grd.addColorStop(0, "#c8c8c8");
  grd.addColorStop(0.5, "#ffffff");
  grd.addColorStop(1, "#a0a0a0");
  ctx.fillStyle = grd;
  roundRect(NET.x, NET.top, NET.w, NET.h, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  for (let y = NET.top + 8; y < FLOOR_Y; y += 12) {
    ctx.beginPath(); ctx.moveTo(NET.x, y); ctx.lineTo(NET.x + NET.w, y); ctx.stroke();
  }
  ctx.fillStyle = "#ffd54a";
  roundRect(NET.x - 3, NET.top - 6, NET.w + 6, 8, 3);
  ctx.fill();
}

function drawRobot(r) {
  drawRobotFigure(ctx, r, FLOOR_Y);
}

function drawAttacks() {
  for (const r of [P1, P2]) {
    const at = r.attack;
    if (!at) continue;
    if (at.kind === "orb") drawOrb(at);
    else if (r.armType === "axe") drawFlyingAxe(at);
    else drawFlyingStar(at);
  }
}

function drawOrb(at) {
  ctx.save();
  const g = ctx.createRadialGradient(at.x, at.y, 2, at.x, at.y, at.hitR + 7);
  g.addColorStop(0, "rgba(210,248,255,0.95)");
  g.addColorStop(0.5, "rgba(90,200,255,0.7)");
  g.addColorStop(1, "rgba(90,200,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(at.x, at.y, at.hitR + 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(at.x, at.y, at.hitR - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawFlyingAxe(at) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.spin);
  ctx.scale(1.5, 1.5);
  ctx.strokeStyle = "#7a5230";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 11);
  ctx.lineTo(0, -12);
  ctx.stroke();
  ctx.fillStyle = "#c8cdd6";
  ctx.strokeStyle = "#555d6a";
  ctx.lineWidth = 1;
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(s * 17, -10, s * 14, 1);
    ctx.quadraticCurveTo(s * 6, -2, 0, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlyingStar(at) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.spin);
  ctx.fillStyle = "#dfe4ea";
  ctx.strokeStyle = "#555d6a";
  ctx.lineWidth = 1.5;
  const R = at.hitR + 2, rIn = R * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    ctx.lineTo(Math.cos(a + Math.PI / 4) * rIn, Math.sin(a + Math.PI / 4) * rIn);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2a3038";
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBall() {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  const sy = FLOOR_Y + 4;
  const sw = ball.r * (1.1 - Math.min(0.6, (FLOOR_Y - ball.y) / 900));
  ctx.ellipse(ball.x, sy, Math.max(6, sw), 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (state === "serve") {
    const visualFill = Math.max(0, Math.min(1,
      (serveCharge - SERVE_CHARGE_FLOOR) / (1 - SERVE_CHARGE_FLOOR)));
    drawChargingBall(visualFill);
    return;
  }

  if (ball.y + ball.r < 0) return;

  if (ball.smashBy !== null) {
    ctx.save();
    const tg = ctx.createRadialGradient(
      ball.x, ball.y, ball.r * 0.3, ball.x, ball.y, ball.r * 2.1);
    tg.addColorStop(0, "rgba(255,180,40,0.8)");
    tg.addColorStop(0.5, "rgba(255,90,20,0.45)");
    tg.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(ball.x, ball.y);
  const g = ctx.createRadialGradient(-8, -8, 4, 0, 0, ball.r);
  g.addColorStop(0, "#fff3c0");
  g.addColorStop(1, "#f2b705");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(120,70,0,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, ball.r - 3, 0.4, 2.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, ball.r - 3, 3.5, 5.6); ctx.stroke();
  ctx.restore();
}

function drawChargingBall(charge) {
  const cx = ball.x, cy = ball.y, r = ball.r;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const level = cy + r - charge * 2 * r;
  const cg = Math.round(229 - 129 * charge);
  const cb = Math.round(138 - 138 * charge);
  ctx.fillStyle = `rgb(255,${cg},${cb})`;
  ctx.fillRect(cx - r, level, 2 * r, (cy + r) - level);
  if (charge > 0.02) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(cx - r, level, 2 * r, 2);
  }
  ctx.restore();
  const full = charge >= 0.999;
  ctx.lineWidth = 3;
  ctx.strokeStyle = full ? "#ff6a1a" : "rgba(255,213,74,0.9)";
  if (full) { ctx.shadowColor = "#ff6a1a"; ctx.shadowBlur = 16; }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawBallTracker() {
  if (!ball.live || state !== "play") return;
  if (ball.y - ball.r >= 0) return;

  const ghostR = ball.r * 0.65;
  const ix = Math.max(ghostR + 4, Math.min(W - ghostR - 4, ball.x));
  const indicatorY = 92;
  const interpY = ball.y + ball.vy * renderRemainder;
  const above = Math.max(0, ball.r - interpY);
  const label = above.toFixed(1);

  ctx.save();
  ctx.beginPath();
  ctx.arc(ix, indicatorY, ghostR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 213, 74, 0.12)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 213, 74, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const fontSize = label.length > 4 ? 7 : label.length > 3 ? 8 : 9;
  ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.strokeText(label, ix, indicatorY);
  ctx.fillStyle = "#ffd54a";
  ctx.fillText(label, ix, indicatorY);

  const arrowBase = indicatorY - ghostR - 4;
  ctx.fillStyle = "rgba(255, 213, 74, 0.85)";
  ctx.beginPath();
  ctx.moveTo(ix, arrowBase - 9);
  ctx.lineTo(ix - 5, arrowBase);
  ctx.lineTo(ix + 5, arrowBase);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHUD() {
  const HUD_H = 76;
  const cy = 38;
  const ICON_SLOT = 42;
  const ICON_GAP = 5;

  ctx.fillStyle = "rgba(6,9,18,0.62)";
  ctx.fillRect(0, 0, W, HUD_H);

  drawRobotPiecesHUD(P1, -1, cy, ICON_SLOT, ICON_GAP);
  drawRobotPiecesHUD(P2, +1, cy, ICON_SLOT, ICON_GAP);

  const boxW = 196;
  const boxH = 54;
  const boxX = W / 2 - boxW / 2;
  const boxY = cy - boxH / 2;

  drawAttackGauge(P1, boxX - 16, cy, "#ff5a5f");
  drawAttackGauge(P2, boxX + boxW + 8, cy, "#29b6f6");
  roundRect(boxX, boxY, boxW, boxH, 10);
  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff5a5f";
  ctx.font = "bold 40px 'Segoe UI', sans-serif";
  ctx.fillText(score[0], W / 2 - 44, cy - 4);
  ctx.fillStyle = "#29b6f6";
  ctx.fillText(score[1], W / 2 + 44, cy - 4);
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText("—", W / 2, cy - 4);
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.font = "10px sans-serif";
  ctx.fillText(`FIRST TO ${WIN_SCORE}`, W / 2, cy + 16);
}

/** Vertical bar by the scoreboard: fills as the player's attack recharges. */
function drawAttackGauge(r, x, cy, accent) {
  const w = 8, h = 44;
  const y = cy - h / 2;
  const maxCd = getArmSpec(r).cooldown || 1;
  const frac = r.attack ? 0 : 1 - Math.min(1, Math.max(0, r.attackCooldown / maxCd));
  const ready = frac >= 1;

  roundRect(x, y, w, h, 4);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const fh = h * frac;
  if (fh > 0) {
    ctx.save();
    roundRect(x, y, w, h, 4);
    ctx.clip();
    ctx.globalAlpha = ready ? 1 : 0.5;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y + h - fh, w, fh);
    ctx.restore();
  }
  if (ready) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawRobotPiecesHUD(robot, side, cy, slotSize, gap) {
  const accent = side < 0 ? "#ff5a5f" : "#29b6f6";
  const slots = [
    { key: "headType", typeId: robot.headType },
    { key: "torsoType", typeId: robot.torsoType },
    { key: "armType", typeId: robot.armType },
    { key: "legType", typeId: robot.legType },
  ];
  const count = slots.length;
  const rowW = count * slotSize + (count - 1) * gap;
  const margin = 14;
  const startX = side < 0 ? margin : W - margin - rowW;

  slots.forEach((slot, i) => {
    const x = startX + i * (slotSize + gap);
    drawHudPieceSlot(robot, slot, x, cy, slotSize);
  });

  ctx.textAlign = side < 0 ? "left" : "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  const label = side < 0 ? "P1" : (gameMode === "1p" ? "CPU" : "P2");
  const labelX = side < 0 ? margin : W - margin;
  ctx.fillText(label, labelX, cy + slotSize / 2 + 10);
}

function drawHudPieceSlot(robot, slot, x, cy, size) {
  const y = cy - size / 2;
  roundRect(x, y, size, size, 8);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.stroke();

  drawPartPreview(
    ctx,
    slot.key,
    slot.typeId ?? "normal",
    x + size / 2,
    cy,
    size,
    robot.colors,
  );
}

function drawBanner() {
  if (state === "menu") { drawMenu(); return; }
  if (state === "serve") {
    const serverIsCpu = gameMode === "1p" && servingSide > 0;
    const name = serverIsCpu ? "CPU" : `PLAYER ${servingSide < 0 ? 1 : 2}`;
    centerText(`${name} TO SERVE`,
      servingSide < 0 ? "#ff5a5f" : "#29b6f6", 30, H * 0.32);
    const key = servingSide < 0 ? "S" : "↓";
    const servePrompt = serverIsCpu ? "serving…"
      : `hold  ${key}  to charge · release to serve`;
    centerText(servePrompt, "rgba(255,255,255,0.6)", 16, H * 0.32 + 34);
  } else if (state === "point") {
    centerText(bannerText, "#ffd54a", 34, H * 0.4);
  } else if (state === "over") {
    ctx.fillStyle = "rgba(6,9,18,0.7)";
    ctx.fillRect(0, 0, W, H);
    centerText(bannerText, winner === 0 ? "#ff5a5f" : "#29b6f6", 54, H * 0.42);
    centerText(`${score[0]} — ${score[1]}`, "#fff", 34, H * 0.42 + 56);
    centerText("press SPACE for the menu", "rgba(255,255,255,0.7)", 18, H * 0.42 + 100);
  }
}

function drawMenu() {
  ctx.fillStyle = "rgba(6,9,18,0.72)";
  ctx.fillRect(0, 0, W, H);

  if (logoImage.complete && logoImage.naturalWidth) {
    const lw = 420, lh = 120;
    ctx.drawImage(logoImage, (W - lw) / 2, H * 0.14, lw, lh);
  } else {
    centerText("ROBOT VOLLEY", "#ffd54a", 58, H * 0.24);
  }
  centerText("choose a mode", "rgba(255,255,255,0.6)", 18, H * 0.24 + 42);

  const bw = 300, bh = 96, gap = 40;
  const totalW = bw * 2 + gap;
  const x0 = (W - totalW) / 2;
  const y = H * 0.5;
  const accents = ["#ff5a5f", "#29b6f6"];

  menuOptions.forEach((o, i) => {
    o.x = x0 + i * (bw + gap);
    o.y = y;
    o.w = bw;
    o.h = bh;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(o.x, o.y, bw, bh, 14); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = accents[i];
    roundRect(o.x, o.y, bw, bh, 14); ctx.stroke();
    ctx.fillStyle = accents[i];
    ctx.font = "bold 34px 'Segoe UI', sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`${i + 1}`, o.x + 22, o.y + bh / 2);
    ctx.fillStyle = "#f5f7ff";
    ctx.font = "bold 24px 'Segoe UI', sans-serif";
    ctx.fillText(o.label, o.x + 62, o.y + bh / 2 - 12);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.fillText(o.sub, o.x + 62, o.y + bh / 2 + 14);
  });

  centerText("press 1 or 2  ·  or click", "rgba(255,255,255,0.45)", 15, y + bh + 40);
}

function centerText(txt, color, size, y) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px 'Segoe UI', sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillText(txt, W / 2, y);
  ctx.shadowBlur = 0;
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

