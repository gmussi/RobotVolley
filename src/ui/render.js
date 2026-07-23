/**
 * Canvas renderer. Reads engine state; never mutates rules.
 */
import {
  W, H, FLOOR_Y, WIN_SCORE, SERVE_CHARGE_FLOOR, NET,
} from "../data/constants.js";
import {
  ball, score, state, gameMode, servingSide, serveCharge,
  bannerText, winner, menuOptions, menuIndex, pauseFromState, submenuReturnState,
  P1, P2, getArmSpec, onlineStatus, onlineLocalSeat,
} from "../engine/game.js";
import { drawLotteryAnimation } from "./lottery.js";
import { drawSettings } from "./settings.js";
import { drawPauseOverlay } from "./pause.js";
import { drawRobotFigure, drawPartPreview } from "./robotDraw.js";
import {
  arenaBgImage, getStadiumComposite, logoImage, logoVisualAnchor,
} from "./art.js";
import { drawTouchControls } from "./touchControls.js";
import {
  COLORS, GLOW, fontDisplay, fontBody,
  roundRect, drawScrim, drawTitle, drawMenuItem, centerText,
  drawFooterHint, drawKeyCap, drawCircularGauge, drawGlassPanel,
} from "./neonUi.js";
import { codeFor } from "../data/controls.js";
import { drawArenaEffects, drawProceduralArena } from "./stadiumDraw.js";
import { colorblindMode } from "../data/accessibility.js";

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
  const vis = state === "pause" ? pauseFromState : state;
  if (state !== "menu" && state !== "controls" && state !== "settings") {
    drawBall(); drawBallTracker(); drawHUD();
  }
  if (vis === "lottery") {
    drawScrim(ctx, 0.45);
    drawLotteryAnimation(ctx);
  } else {
    drawBanner(vis);
  }
  if (state === "pause") drawPauseOverlay(ctx);
  drawTouchControls(ctx);
}

function drawArena() {
  const composite = getStadiumComposite();
  if (composite) {
    ctx.drawImage(composite, 0, 0, W, H);
    drawArenaEffects(ctx, performance.now() * 0.001);
    return;
  }

  if (arenaBgImage.complete && arenaBgImage.naturalWidth) {
    ctx.drawImage(arenaBgImage, 0, 0, W, H);
    drawArenaEffects(ctx, performance.now() * 0.001);
    return;
  }

  drawProceduralArena(ctx);
}

function drawNet() {
  const capY = NET.top - 6;
  ctx.save();
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, NET.x - 4, capY, NET.w + 8, 10, 4);
  ctx.fill();

  const grd = ctx.createLinearGradient(NET.x, NET.top, NET.x + NET.w, FLOOR_Y);
  grd.addColorStop(0, "rgba(255,255,255,0.92)");
  grd.addColorStop(1, "rgba(200,210,230,0.55)");
  ctx.fillStyle = grd;
  roundRect(ctx, NET.x, NET.top, NET.w, NET.h, 6);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  for (let y = NET.top + 8; y < FLOOR_Y; y += 12) {
    ctx.beginPath(); ctx.moveTo(NET.x, y); ctx.lineTo(NET.x + NET.w, y); ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,213,74,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(NET.x - 2, NET.top);
  ctx.lineTo(NET.x - 2, FLOOR_Y);
  ctx.moveTo(NET.x + NET.w + 2, NET.top);
  ctx.lineTo(NET.x + NET.w + 2, FLOOR_Y);
  ctx.stroke();
  ctx.restore();
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
  ctx.font = fontBody(fontSize, 700);
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

function drawScoreHatch(cx, cy, team) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.5;
  const s = 14;
  if (team === "p1") {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - s + i * 4, cy - s);
      ctx.lineTo(cx + s + i * 4, cy + s);
      ctx.stroke();
    }
  } else {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        ctx.beginPath();
        ctx.arc(cx + dx * 6, cy + dy * 6, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawHUD() {
  const HUD_H = 76;
  const cy = 38;
  const ICON_SLOT = 42;
  const ICON_GAP = 5;

  drawGlassPanel(ctx, 8, 8, W - 16, HUD_H - 8, { radius: 14, fillAlpha: 0.75 });

  drawRobotPiecesHUD(P1, -1, cy, ICON_SLOT, ICON_GAP);
  drawRobotPiecesHUD(P2, +1, cy, ICON_SLOT, ICON_GAP);

  const boxW = 196;
  const boxH = 54;
  const boxX = W / 2 - boxW / 2;
  const boxY = cy - boxH / 2;

  drawCircularGauge(ctx, boxX - 24, cy, 18, getAttackFrac(P1), COLORS.p1, isAttackReady(P1));
  drawCircularGauge(ctx, boxX + boxW + 24, cy, 18, getAttackFrac(P2), COLORS.p2, isAttackReady(P2));

  drawGlassPanel(ctx, boxX, boxY, boxW, boxH, { radius: 12, fillAlpha: 0.82 });

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.p1;
  ctx.font = fontDisplay(40);
  ctx.fillText(score[0], W / 2 - 44, cy - 4);
  if (colorblindMode) drawScoreHatch(W / 2 - 44, cy - 4, "p1");
  ctx.fillStyle = COLORS.p2;
  ctx.fillText(score[1], W / 2 + 44, cy - 4);
  if (colorblindMode) drawScoreHatch(W / 2 + 44, cy - 4, "p2");
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.font = fontDisplay(26, 600);
  ctx.fillText("—", W / 2, cy - 4);
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = fontBody(10, 600);
  ctx.fillText(`FIRST TO ${WIN_SCORE}`, W / 2, cy + 16);
}

function getAttackFrac(r) {
  const maxCd = getArmSpec(r).cooldown || 1;
  return r.attack ? 0 : 1 - Math.min(1, Math.max(0, r.attackCooldown / maxCd));
}

function isAttackReady(r) {
  return getAttackFrac(r) >= 1;
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
  ctx.font = fontBody(11, 700);
  let label = side < 0 ? "P1" : (gameMode === "1p" ? "CPU" : "P2");
  if (gameMode === "online") {
    const seat = side < 0 ? 0 : 1;
    label = seat === onlineLocalSeat ? "YOU" : "OPP";
  }
  const labelX = side < 0 ? margin : W - margin;
  ctx.fillText(label, labelX, cy + slotSize / 2 + 10);
}

function drawHudPieceSlot(robot, slot, x, cy, size) {
  const y = cy - size / 2;
  roundRect(ctx, x, y, size, size, 8);
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
    { lite: true },
  );
}

function drawOnlineOverlay() {
  drawScrim(ctx, 0.6);
  drawGlassPanel(ctx, W / 2 - 300, H * 0.30, 600, 200, {
    radius: 16,
    borderColor: COLORS.accent,
    glowColor: GLOW.accent || GLOW.p1,
  });
  const title = state === "searching" ? "ONLINE MATCH" : "DISCONNECTED";
  centerText(ctx, title, COLORS.accent, 36, H * 0.38);
  centerText(ctx, onlineStatus || "", COLORS.text, 18, H * 0.38 + 48, false);
  const hint = state === "searching"
    ? "press ESC or SPACE to cancel"
    : "press SPACE for the menu";
  centerText(ctx, hint, COLORS.textMuted, 14, H * 0.38 + 96, false);
}

function drawBanner(vis = state) {
  if (vis === "menu") { drawMenu(); return; }
  if (vis === "searching" || vis === "disconnect") { drawOnlineOverlay(); return; }
  if (vis === "controls") { drawControls(); return; }
  if (state === "settings") { drawSettings(ctx); return; }
  if (vis === "serve") {
    const serverIsCpu = gameMode === "1p" && servingSide > 0;
    const serverSeat = servingSide < 0 ? 0 : 1;
    let name = serverIsCpu ? "CPU" : `PLAYER ${serverSeat + 1}`;
    if (gameMode === "online") {
      name = serverSeat === onlineLocalSeat ? "YOU" : "OPPONENT";
    }
    centerText(ctx, `${name} TO SERVE`,
      servingSide < 0 ? COLORS.p1 : COLORS.p2, 30, H * 0.32);
    const key = gameMode === "online" ? "S" : (servingSide < 0 ? "S" : "↓");
    const localServing = gameMode !== "online" || serverSeat === onlineLocalSeat;
    const servePrompt = serverIsCpu ? "serving…"
      : localServing
        ? `hold  ${key}  to charge · release to serve`
        : "waiting for opponent to serve…";
    centerText(ctx, servePrompt, COLORS.textMuted, 16, H * 0.32 + 34, false);
  } else if (vis === "point") {
    centerText(ctx, bannerText, COLORS.accent, 34, H * 0.4);
  } else if (vis === "over") {
    drawScrim(ctx, 0.65);
    drawGlassPanel(ctx, W / 2 - 280, H * 0.28, 560, 220, {
      radius: 16,
      borderColor: winner === 0 ? COLORS.p1 : COLORS.p2,
      glowColor: winner === 0 ? GLOW.p1 : GLOW.p2,
    });
    centerText(ctx, bannerText, winner === 0 ? COLORS.p1 : COLORS.p2, 48, H * 0.38);
    centerText(ctx, `${score[0]} — ${score[1]}`, COLORS.text, 34, H * 0.38 + 52);
    centerText(ctx, "press SPACE for the menu", COLORS.textMuted, 16, H * 0.38 + 96, false);
  }
}


const KEY_GLYPH = {
  ArrowLeft: "◄", ArrowRight: "►", ArrowUp: "▲", ArrowDown: "▼",
  Slash: "/", Space: "SPACE",
};

function keyGlyph(code) {
  if (KEY_GLYPH[code]) return KEY_GLYPH[code];
  if (code && code.startsWith("Key")) return code.slice(3);
  return code || "?";
}

const CONTROL_ROWS = [
  { act: "left", label: "MOVE LEFT" },
  { act: "right", label: "MOVE RIGHT" },
  { act: "jump", label: "JUMP" },
  { act: "serve", label: "SERVE", note: "hold to charge" },
  { act: "attack", label: "ATTACK" },
];

function drawMenu() {
  drawScrim(ctx, 0.5);

  if (logoImage.complete && logoImage.naturalWidth) {
    const lw = 700;
    const lh = lw * (logoImage.naturalHeight / logoImage.naturalWidth);
    const cx = W / 2;
    const cy = H * 0.11;
    ctx.drawImage(
      logoImage,
      cx - lw * logoVisualAnchor.x,
      cy - lh * logoVisualAnchor.y,
      lw,
      lh,
    );
  } else {
    drawTitle(ctx, "ROBOT VOLLEY", W / 2, H * 0.10, 64);
  }

  const now = performance.now();
  const startY = H * 0.45;
  const rowH = 52;
  const itemW = 440;
  const itemH = 44;

  menuOptions.forEach((o, i) => {
    const cy = startY + i * rowH;
    o.w = itemW; o.h = itemH;
    o.x = (W - itemW) / 2;
    o.y = cy - itemH / 2;
    drawMenuItem(ctx, o.label, W / 2, cy, itemW, itemH, i === menuIndex, now);
  });

  drawFooterHint(ctx, [
    { text: "▲ ▼  SELECT      ENTER  START" },
    { text: "© 2026  ROBOT VOLLEY" },
  ], H - 58);
}

function drawControls() {
  drawScrim(ctx, 0.55);
  drawTitle(ctx, "CONTROLS", W / 2, H * 0.12, 48);

  const players = [
    { idx: 0, name: "PLAYER 1", accent: COLORS.p1, colX: W * 0.27 },
    { idx: 1, name: "PLAYER 2", accent: COLORS.p2, colX: W * 0.73 },
  ];

  const headerY = H * 0.27;
  const rowY0 = H * 0.37;
  const rowH = 58;
  const keyOffset = -120;
  const labelX = -80;

  players.forEach((p) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "3px";
    ctx.font = fontDisplay(26, 600);
    ctx.fillStyle = p.accent;
    ctx.fillText(p.name, p.colX, headerY);
    ctx.letterSpacing = "0px";

    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(p.colX - 150, headerY + 26);
    ctx.lineTo(p.colX + 150, headerY + 26);
    ctx.stroke();
    ctx.globalAlpha = 1;

    CONTROL_ROWS.forEach((row, i) => {
      const cy = rowY0 + i * rowH;
      const glyph = keyGlyph(codeFor(p.idx, row.act));
      drawKeyCap(ctx, p.colX + keyOffset, cy, glyph, p.accent);

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = fontDisplay(20, 600);
      ctx.letterSpacing = "2px";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(row.label, p.colX + labelX, cy - (row.note ? 8 : 0));
      if (row.note) {
        ctx.font = fontBody(12, 500);
        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText(row.note, p.colX + labelX, cy + 12);
      }
      ctx.letterSpacing = "0px";
    });
  });

  const backHint = submenuReturnState === "pause" ? "ENTER / ESC   BACK TO PAUSE"
    : "ENTER / ESC   BACK";
  drawFooterHint(ctx, [
    { text: "SPACE  RESTART A MATCH" },
    { text: backHint, accent: true },
  ], H - 58);
}

