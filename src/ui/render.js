/**
 * Canvas renderer. Reads engine state; never mutates rules.
 */
import {
  W, H, FLOOR_Y, WIN_SCORE, SERVE_CHARGE_FLOOR, NET, BALL_SPIN_VISUAL_RATE,
} from "../data/constants.js";
import {
  ball, score, state, gameMode, servingSide, serveCharge,
  banner, winner, menuOptions, menuIndex, menuMode, modeOptions, modeIndex,
  pauseFromState, submenuReturnState, onlineOverlay,
  P1, P2, getArmSpec, onlineStatusKey, onlineStatusVars, onlineLocalSeat,
  onlineNames, creditsLink, attractActive,
} from "../engine/game.js";
import { t } from "../i18n/index.js";
import { drawLotteryAnimation } from "./lottery.js";
import { drawSettings } from "./settings.js";
import { drawControlsScreen } from "./controlsScreen.js";
import { drawCreditsScreen } from "./creditsScreen.js";
import { drawPauseOverlay } from "./pause.js";
import { drawRobotFigure, drawPartPreview } from "./robotDraw.js";
import { itemPreviewSlot } from "../data/items.js";
import {
  arenaBgImage, getStadiumComposite, logoImage, logoVisualAnchor,
} from "./art.js";
import { drawTouchControls } from "./touchControls.js";
import {
  COLORS, GLOW, fontDisplay, fontBody,
  roundRect, drawScrim, drawTitle, drawMenuItem, centerText,
  drawFooterHint, drawCircularGauge, drawGlassPanel,
} from "./neonUi.js";
import { drawArenaEffects, drawProceduralArena } from "./stadiumDraw.js";
import { drawRobotPreview } from "./robotPreview.js";
import { getProfile, getSyncState } from "../progress/profile.js";
import { drawProfileScreen } from "./profileScreen.js";
import { drawLeaderboardScreen } from "./leaderboardScreen.js";
import { drawMatchUnlocks, drawLaunchUnlock } from "./unlockReveal.js";
import { colorblindMode } from "../data/accessibility.js";
import { codeFor } from "../data/controls.js";
import { usingGamepad } from "../input/device.js";
import { drawActionBadge, keyLabel } from "./glyphs.js";

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
  if (
    state !== "title" && state !== "modeSelect" && state !== "menu" &&
    state !== "controls" && state !== "settings" && state !== "credits" &&
    state !== "profile" && state !== "leaderboard"
  ) {
    drawBall(); drawBallTracker(); drawHUD();
  } else if (attractActive) {
    // Menu demo: the ball only, dimmed by the scrim the UI draws over it. No
    // HUD or off-screen tracker — they'd collide with the logo and menu rows.
    drawBall();
  }
  if (vis === "lottery") {
    drawScrim(ctx, 0.45);
    drawLotteryAnimation(ctx);
  } else {
    drawBanner(vis);
  }
  if (state === "pause") drawPauseOverlay(ctx);
  if (onlineOverlay === "pause") drawPauseOverlay(ctx);
  else if (onlineOverlay === "settings") drawSettings(ctx);
  else if (onlineOverlay === "controls") drawControlsScreen(ctx);
  drawTouchControls(ctx);
  // Last, over everything: a cosmetic granted by the nightly leaderboard
  // rollover is announced on the next launch, whatever screen that lands on.
  drawLaunchUnlock(ctx);
}

function drawArena() {
  const composite = getStadiumComposite();
  // Each player's decal claims their own half, so the arena needs both
  // loadouts. P1/P2 already carry sanitized cosmetics (applyRobotCosmetics),
  // including the remote peer's, so this is the same data the robots draw from.
  const t = performance.now() * 0.001;
  if (composite) {
    ctx.drawImage(composite, 0, 0, W, H);
    drawArenaEffects(ctx, t, P1.cosmetics, P2.cosmetics);
    return;
  }

  if (arenaBgImage.complete && arenaBgImage.naturalWidth) {
    ctx.drawImage(arenaBgImage, 0, 0, W, H);
    drawArenaEffects(ctx, t, P1.cosmetics, P2.cosmetics);
    return;
  }

  drawProceduralArena(ctx, P1.cosmetics, P2.cosmetics);
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
    else if (at.kind === "portal") drawPortal(at, r);
    else if (r.armType === "axe") drawFlyingAxe(at);
    else drawFlyingStar(at);
  }
}

/** Oval portal opened ahead of the ball — red for P1, blue for P2. */
function drawPortal(at, r) {
  const dir = at.dir || 1;
  const rx = at.hitR * 0.42;
  const ry = at.hitR;
  const pulse = 0.85 + 0.15 * Math.sin((at.t || 0) * 22);
  const blue = r.side > 0;
  const glow = blue
    ? ["rgba(80,200,255,0.55)", "rgba(30,140,220,0.35)", "rgba(0,80,180,0)"]
    : ["rgba(255,80,60,0.55)", "rgba(220,30,40,0.35)", "rgba(180,0,20,0)"];
  const rim = blue ? "rgba(70,200,255,0.95)" : "rgba(255,70,55,0.95)";
  const shadow = blue ? "rgba(40,160,255,0.85)" : "rgba(255,40,30,0.85)";
  const inner = blue ? "rgba(180,230,255,0.9)" : "rgba(255,200,180,0.9)";
  const arrow = blue ? "rgba(100,200,255,0.55)" : "rgba(255,120,100,0.55)";

  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(pulse, pulse);

  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, ry + 10);
  g.addColorStop(0, glow[0]);
  g.addColorStop(0.45, glow[1]);
  g.addColorStop(1, glow[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx + 10, ry + 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rim;
  ctx.lineWidth = 5;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = inner;
  ctx.lineWidth = 2;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Hint which way the ball is traveling into the portal.
  ctx.fillStyle = arrow;
  ctx.beginPath();
  ctx.moveTo(-dir * (rx + 14), -8);
  ctx.lineTo(-dir * (rx + 2), 0);
  ctx.lineTo(-dir * (rx + 14), 8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
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
  const spinRot = ball.rot + ball.spin * BALL_SPIN_VISUAL_RATE * renderRemainder;
  if (spinRot) ctx.rotate(spinRot);
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
  ctx.fillText(t("hud.firstTo", { n: WIN_SCORE }), W / 2, cy + 16);
}

function getAttackFrac(r) {
  const maxCd = getArmSpec(r).cooldown || 1;
  return r.attack ? 0 : 1 - Math.min(1, Math.max(0, r.attackCooldown / maxCd));
}

function isAttackReady(r) {
  return getAttackFrac(r) >= 1;
}

/**
 * Is this seat driven from a keyboard or pad on this machine? The CPU has no
 * key to show, and neither does an online opponent — their controls are theirs.
 */
function isLocallyPlayed(seat) {
  if (gameMode === "online") return seat === onlineLocalSeat;
  if (gameMode === "1p") return seat === 0;
  return true; // 2p: both seats are at this keyboard
}

function drawRobotPiecesHUD(robot, side, cy, slotSize, gap) {
  const accent = side < 0 ? "#ff5a5f" : "#29b6f6";
  // The body is always standard apart from the one accessory, so the HUD shows
  // what the robot is carrying rather than every part.
  const slots = [
    { kind: "accessory", id: robot.accessory },
    { kind: "weapon", id: robot.weapon },
  ];
  const count = slots.length;
  const rowW = count * slotSize + (count - 1) * gap;
  const margin = 14;
  const startX = side < 0 ? margin : W - margin - rowW;

  const seat = side < 0 ? 0 : 1;
  const showKey = isLocallyPlayed(seat);

  slots.forEach((slot, i) => {
    const x = startX + i * (slotSize + gap);
    drawHudPieceSlot(robot, slot, x, cy, slotSize);
    // Tuck the trigger for the weapon into its bottom-right corner, but only
    // where somebody at this machine can actually press it, and only when there
    // is a weapon equipped to trigger.
    if (slot.kind === "weapon" && slot.id && showKey) {
      drawActionBadge(ctx, seat, "attack", x + slotSize - 2, cy + slotSize / 2 - 2, 15);
    }
  });

  ctx.textAlign = side < 0 ? "left" : "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  ctx.font = fontBody(11, 700);
  let label = side < 0 ? t("hud.p1") : (gameMode === "1p" ? t("hud.cpu") : t("hud.p2"));
  if (gameMode === "online") {
    const seat = side < 0 ? 0 : 1;
    const isLocal = seat === onlineLocalSeat;
    const name = isLocal ? onlineNames?.local : onlineNames?.opponent;
    label = name || (isLocal ? t("hud.you") : t("hud.opp"));
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

  if (!slot.id) {
    // Empty slot — a dash reads clearer than an unrelated standard-part icon.
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = fontBody(16, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("–", x + size / 2, cy);
    return;
  }

  drawPartPreview(
    ctx,
    itemPreviewSlot(slot.kind, slot.id),
    slot.id,
    x + size / 2,
    cy,
    size,
    robot.colors,
    { lite: true, side: robot.side },
  );
}

function drawOnlineOverlay() {
  drawScrim(ctx, 0.6);
  drawGlassPanel(ctx, W / 2 - 300, H * 0.30, 600, 200, {
    radius: 16,
    borderColor: COLORS.accent,
    glowColor: GLOW.accent || GLOW.p1,
  });
  const title = state === "searching" ? t("online.title") : t("online.disconnected");
  centerText(ctx, title, COLORS.accent, 36, H * 0.38);
  const status = onlineStatusKey ? t(onlineStatusKey, onlineStatusVars) : "";
  centerText(ctx, status, COLORS.text, 18, H * 0.38 + 48, false);
  const hint = state === "searching" ? t("online.cancel") : t("online.pressMenu");
  centerText(ctx, hint, COLORS.textMuted, 14, H * 0.38 + 96, false);
}

function drawBanner(vis = state) {
  if (vis === "title") { drawTitleScreen(); return; }
  if (vis === "modeSelect") { drawModeSelect(); return; }
  if (vis === "menu") { drawMenu(); return; }
  if (vis === "searching" || vis === "disconnect") { drawOnlineOverlay(); return; }
  if (vis === "controls") { drawControlsScreen(ctx); return; }
  if (state === "settings") { drawSettings(ctx); return; }
  if (state === "profile") { drawProfileScreen(ctx); return; }
  if (state === "leaderboard") { drawLeaderboardScreen(ctx); return; }
  if (state === "credits") { drawCreditsScreen(ctx); return; }
  if (vis === "serve") {
    const serverIsCpu = gameMode === "1p" && servingSide > 0;
    const serverSeat = servingSide < 0 ? 0 : 1;
    let name = serverIsCpu ? t("serve.cpu") : t("common.playerN", { n: serverSeat + 1 });
    if (gameMode === "online") {
      const isLocal = serverSeat === onlineLocalSeat;
      const onlineName = isLocal ? onlineNames?.local : onlineNames?.opponent;
      name = onlineName || (isLocal ? t("serve.you") : t("serve.opponent"));
    }
    centerText(ctx, t("serve.toServe", { name }),
      servingSide < 0 ? COLORS.p1 : COLORS.p2, 30, H * 0.32);
    const attackCode = codeFor(gameMode === "online" ? 0 : serverSeat, "attack");
    // On a pad the serve is the square button, so hand the glyph layer a marker
    // instead of a letter; on keyboard it stays the actual bound key.
    const key = usingGamepad() ? "[attack]" : keyLabel(attackCode);
    const localServing = gameMode !== "online" || serverSeat === onlineLocalSeat;
    const servePrompt = serverIsCpu ? t("serve.serving")
      : localServing
        ? t("serve.holdCharge", { key })
        : t("serve.waiting");
    centerText(ctx, servePrompt, COLORS.textMuted, 16, H * 0.32 + 34, false);
  } else if (vis === "point") {
    centerText(ctx, bannerMessage(), COLORS.accent, 34, H * 0.4);
  } else if (vis === "over") {
    drawScrim(ctx, 0.65);
    drawGlassPanel(ctx, W / 2 - 280, H * 0.28, 560, 220, {
      radius: 16,
      borderColor: winner === 0 ? COLORS.p1 : COLORS.p2,
      glowColor: winner === 0 ? GLOW.p1 : GLOW.p2,
    });
    centerText(ctx, bannerMessage(), winner === 0 ? COLORS.p1 : COLORS.p2, 48, H * 0.38);
    centerText(ctx, `${score[0]} — ${score[1]}`, COLORS.text, 34, H * 0.38 + 52);
    centerText(ctx, t("banner.pressMenu"), COLORS.textMuted, 16, H * 0.38 + 96, false);
    // Below the score panel, one per half — see drawMatchUnlocks.
    drawMatchUnlocks(ctx);
  }
}

function bannerMessage() {
  if (!banner) return "";
  const n = (banner.player ?? 0) + 1;
  if (banner.type === "wins") return t("banner.wins", { n });
  if (banner.type === "forfeit") return t("banner.forfeit", { n });
  if (banner.type === "stall") return t("banner.stall");
  return t("banner.point", { n });
}



function drawBrandLogo() {
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
    drawTitle(ctx, t("menu.brand"), W / 2, H * 0.10, 64);
  }
}

function drawTitleScreen() {
  drawScrim(ctx, 0.5);
  drawBrandLogo();

  const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.005);
  ctx.save();
  ctx.globalAlpha = pulse;
  centerText(ctx, t("menu.pressAnyButton"), COLORS.accent, 28, H * 0.58);
  ctx.restore();

  drawFooterHint(ctx, [
    { text: t("menu.copyright") },
  ], H - 58);
}

/**
 * Home-screen profile card: your robot, your name, your record.
 *
 * Renders from the cached profile the moment the game boots and swaps in the
 * server's copy when the sync lands, so returning from another machine looks
 * like a refresh rather than a loading screen. "Offline" is drawn as a quiet
 * badge, not an error — the web build has to stay playable with no backend.
 */
function drawProfileCard(centerY) {
  const sync = getSyncState();
  const profile = getProfile();
  const x = 28;
  const w = 216;
  const h = 244;
  const y = centerY - h / 2;

  drawGlassPanel(ctx, x, y, w, h, { radius: 14, fillAlpha: 0.55 });

  const cx = x + w / 2;
  if (sync === "loading" && !profile.accountId) {
    // Nothing cached yet — a gauge is honest about there being no robot to show.
    const spin = (performance.now() / 900) % 1;
    drawCircularGauge(ctx, cx, y + 104, 34, spin, COLORS.accent);
    centerText(ctx, t("profile.signingIn"), COLORS.textMuted, 13, y + 176, false);
    return;
  }

  drawRobotPreview(ctx, profile.loadout, cx, y + 168, 0.92);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontDisplay(19, 700);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(profile.displayName, cx, y + 194);

  if (sync === "offline") {
    ctx.font = fontBody(11, 700);
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(t("profile.offline"), cx, y + 216);
  }
}

/**
 * Lays out a vertical list of menu-style options centered under `startY`, row
 * spacing shrinking (down to a point) so extra items — e.g. the desktop-only
 * QUIT entry — never collide with the footer. Shared by the mode-select
 * screen and the online/offline menu so their spacing math can't drift apart.
 * @returns {{menuTop: number, menuBottom: number}} vertical extent of the list
 */
function drawOptionList(options, selectedIndex, startY, itemW = 440, itemH = 44) {
  const now = performance.now();
  const footerY = H - 58;
  const footerClearance = footerY - startY - itemH / 2 - 10;
  const rowH = options.length > 1
    ? Math.min(52, footerClearance / (options.length - 1))
    : 52;

  options.forEach((o, i) => {
    const cy = startY + i * rowH;
    o.w = itemW; o.h = itemH;
    o.x = (W - itemW) / 2;
    o.y = cy - itemH / 2;
    drawMenuItem(ctx, t(o.labelKey), W / 2, cy, itemW, itemH, i === selectedIndex, now);
  });

  return {
    menuTop: startY - itemH / 2,
    menuBottom: startY + (options.length - 1) * rowH + itemH / 2,
  };
}

/**
 * The true landing screen, reached from the title splash: your robot and
 * name, and the choice between ONLINE PLAY and OFFLINE PLAY. Each leads to
 * its own menu (see drawMenu) — this screen itself never starts a match.
 *
 * The robot card itself only shows up one level deeper, inside the ONLINE
 * menu — it's an online identity (name, unlocks earned by winning online
 * matches), so it has no business appearing before a mode is even chosen, or
 * inside the offline menu where none of that applies.
 */
function drawModeSelect() {
  drawScrim(ctx, 0.5);
  drawBrandLogo();

  drawOptionList(modeOptions, modeIndex, H * 0.45);

  const footerY = H - 58;
  drawFooterHint(ctx, [
    { text: t("menu.copyright") },
  ], footerY);

  const creditsY = footerY + 44;
  const creditsText = t("menu.credits");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontBody(13, 600);
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(creditsText, W / 2, creditsY);
  const tw = ctx.measureText(creditsText).width;
  const padX = 24;
  const padY = 10;
  creditsLink.x = W / 2 - tw / 2 - padX;
  creditsLink.y = creditsY - padY;
  creditsLink.w = tw + padX * 2;
  creditsLink.h = padY * 2;
}

/** The chosen category's options (online: match/profile/leaderboard, offline: 1P/2P — both plus controls/settings). */
function drawMenu() {
  drawScrim(ctx, 0.5);
  drawBrandLogo();

  const { menuTop, menuBottom } = drawOptionList(menuOptions, menuIndex, H * 0.45);

  // The robot card is an online identity, so it only belongs beside the
  // ONLINE options — the offline menu (single/two player) has no account
  // context to show.
  if (menuMode === "online") {
    drawProfileCard((menuTop + menuBottom) / 2);
  }

  drawFooterHint(ctx, [
    { text: t("menu.copyright") },
    { text: t("common.escBack"), accent: true },
  ], H - 58);
}


