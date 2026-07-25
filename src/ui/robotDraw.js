/**
 * Robot body drawing — shared by in-game renderer, HUD previews, and lottery reels.
 */
import { ROBOT_W, ROBOT_H } from "../data/constants.js";
import { ball, shadeColor, updateRobotParts } from "../engine/game.js";
import { HEAD_TYPES } from "../data/heads.js";
import { COLORS, GLOW, PART_ACCENTS } from "../data/theme.js";
import { drawSpriteRobot, drawSpritePartPreview, spritesReady } from "./spriteRobot.js";

/** Sprite renderer toggle. Default on; disable at runtime with
 *  localStorage.setItem("rv_spriteRobots","0") then reload. */
function spriteModeEnabled() {
  try {
    return localStorage.getItem("rv_spriteRobots") !== "0";
  } catch {
    return true;
  }
}

let ctx;
let litePreview = false;

function useCtx(targetCtx, fn) {
  const prev = ctx;
  ctx = targetCtx;
  try {
    return fn();
  } finally {
    ctx = prev;
  }
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

function teamColor(r) {
  return r.side < 0 ? COLORS.p1 : COLORS.p2;
}

function headAccent(r) {
  return PART_ACCENTS[r.headType] || teamColor(r);
}

function drawTeamGlow(r, cx, cy) {
  const glow = r.side < 0 ? GLOW.p1 : GLOW.p2;
  ctx.save();
  ctx.globalAlpha = 0.28;
  const g = ctx.createRadialGradient(cx, cy - 24, 8, cx, cy - 24, 72);
  g.addColorStop(0, glow);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 18, 42, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function strokeNeonRect(x, y, w, h, rad, color) {
  ctx.save();
  roundRect(x, y, w, h, rad);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function fillMetallicRect(x, y, w, h, rad, base, dark, light) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, light);
  grad.addColorStop(0.45, base);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  roundRect(x, y, w, h, rad);
  ctx.fill();
}

function drawPart(x, y, w, h, rad, fillCol, r, accent) {
  const a = accent || teamColor(r);
  if (litePreview) {
    ctx.fillStyle = fillCol;
    roundRect(x, y, w, h, rad);
    ctx.fill();
    strokeNeonRect(x, y, w, h, rad, a);
    return;
  }
  const dark = shadeColor(fillCol, -34);
  const light = shadeColor(fillCol, 24);
  fillMetallicRect(x, y, w, h, rad, fillCol, dark, light);
  strokeNeonRect(x, y, w, h, rad, a);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 3, y + 4, Math.max(2, w - 6), 2);
}

function drawAthleticBoot(foot, accent) {
  const x = foot.x - 3;
  const y = foot.y - 2;
  const w = foot.w + 6;
  const h = foot.h + 4;
  if (litePreview) {
    ctx.fillStyle = "#252a36";
    roundRect(x, y, w, h, 5);
    ctx.fill();
    strokeNeonRect(x, y, w, h, 5, accent);
    return;
  }
  fillMetallicRect(x, y, w, h, 5, "#252a36", "#141820", "#3a4254");
  strokeNeonRect(x, y, w, h, 5, accent);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x + 4, y + h - 4, w - 8, 2);
  ctx.globalAlpha = 1;
}

function drawChestCore(cx, torso, accent) {
  if (litePreview) return;
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.9;
  roundRect(cx - 5, torso.y + 14, 10, torso.h - 28, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  roundRect(cx - 2, torso.y + 18, 4, torso.h - 36, 1);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawHeadAccentRing(cx, cy, rx, ry, accent) {
  if (!accent) return;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  if (!litePreview) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12;
  }
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawNeonVisor(x, y, w, h, eyeOpen, accent) {
  ctx.save();
  ctx.fillStyle = "#eaf6ff";
  if (!litePreview) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
  }
  roundRect(x, y, w, h * eyeOpen + 2, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (litePreview) {
    ctx.restore();
    return;
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x + 2, y + 1, w - 4, 2);
  ctx.restore();
}

function unionRects(...rects) {
  const x0 = Math.min(...rects.map((rect) => rect.x));
  const y0 = Math.min(...rects.map((rect) => rect.y));
  const x1 = Math.max(...rects.map((rect) => rect.x + rect.w));
  const y1 = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function partViewBounds(r, slotKey) {
  const p = r.parts;
  const cx = r.x + r.w / 2;

  if (slotKey === "headType") {
    const b = { ...p.head };
    if (r.headType === "standard") {
      b.y -= 16;
      b.h += 16;
    } else if (r.headType === "magnet") {
      b.y -= 14;
      b.h += 14;
    } else if (r.headType === "drill") {
      // The cone rises above the hitbox (see drawDrillHead) — frame it in.
      const rise = Math.ceil(b.h * 0.47) + 4;
      b.y -= rise;
      b.h += rise;
    }
    return b;
  }
  if (slotKey === "torsoType") return { ...p.torso };
  if (slotKey === "legType") return unionRects(p.legL, p.legR, p.footL, p.footR);
  if (slotKey === "armType" || slotKey === "arms" || slotKey === "weaponType") {
    const b = unionRects(p.armL, p.armR);
    b.y -= 18; b.h += 18; // room for the weapon emblem above the hands
    return b;
  }
  return { ...p.torso };
}

function buildPreviewRobot(slotKey, typeId, colors) {
  const r = {
    side: -1,
    x: 120,
    y: 48,
    w: ROBOT_W,
    h: ROBOT_H,
    vx: 0,
    vy: 0,
    onGround: true,
    facing: 1,
    moveDir: 0,
    jumpHeld: false,
    jumpPrevHeld: false,
    legType: "normal",
    headType: "standard",
    torsoType: "standard",
    armType: "hand",
    attack: null,
    flapsUsed: 0,
    squash: 0,
    eyeBlink: 0,
    flapFx: 0,
    magnetFx: 0,
    drillAngle: 0.75,
    colors: { ...colors },
    parts: {},
  };
  if (slotKey === "legType") r.legType = typeId;
  else if (slotKey === "headType") r.headType = typeId;
  else if (slotKey === "torsoType") r.torsoType = typeId;
  else if (slotKey === "armType" || slotKey === "weaponType") r.armType = typeId;
  updateRobotParts(r);
  return r;
}

function drawPreviewPart(r, slotKey) {
  const p = r.parts;
  const col = r.colors;
  const cx = r.x + r.w / 2;
  if (slotKey === "headType") drawRobotHead(r, p, col, cx);
  else if (slotKey === "torsoType") drawRobotTorso(r, p, col, cx);
  else if (slotKey === "legType") drawRobotLegs(r, p, col);
  else if (slotKey === "armType" || slotKey === "arms" || slotKey === "weaponType") drawRobotArms(r, p, col);
}

function drawPreviewPartLite(r, slotKey) {
  litePreview = true;
  try {
    drawPreviewPart(r, slotKey);
  } finally {
    litePreview = false;
  }
}

export function colorsFromAccent(accent) {
  return {
    head: accent,
    torso: accent,
    arms: shadeColor(accent, -35),
    legs: shadeColor(accent, -35),
  };
}

export function drawPartPreview(targetCtx, slotKey, typeId, cx, cy, maxSize, colors, opts = {}) {
  // Prefer the sprite art so thumbnails match the robots on court.
  if (spriteModeEnabled() && spritesReady()
      && drawSpritePartPreview(targetCtx, slotKey, typeId, cx, cy, maxSize, opts.side ?? -1)) {
    return;
  }
  useCtx(targetCtx, () => {
    const r = buildPreviewRobot(slotKey, typeId, colors);
    const view = partViewBounds(r, slotKey);
    const scale = (maxSize * 0.84) / Math.max(view.w, view.h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-(view.x + view.w / 2), -(view.y + view.h / 2));
    if (opts.lite) drawPreviewPartLite(r, slotKey);
    else drawPreviewPart(r, slotKey);
    ctx.restore();
  });
}

export function drawRobotFigure(targetCtx, r, floorY) {
  if (spriteModeEnabled() && spritesReady()) {
    drawSpriteRobot(targetCtx, r, floorY);
    return;
  }
  useCtx(targetCtx, () => drawRobot(r, floorY));
}
function drawSpringCoil(x, yTop, yBot, amp) {
  ctx.strokeStyle = "rgba(255,213,74,0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const coils = 4;
  const step = (yBot - yTop) / (coils * 2);
  ctx.moveTo(x, yTop);
  for (let i = 0; i < coils * 2; i++) {
    const cy = yTop + step * (i + 1);
    ctx.lineTo(x + (i % 2 === 0 ? amp : -amp), cy);
  }
  ctx.lineTo(x, yBot);
  ctx.stroke();
}

function drawRobotLegs(r, p, col) {
  const legCol = col.legs;
  const dark = shadeColor(legCol, -30);
  const light = shadeColor(legCol, 18);

  if (r.legType === "power") {
    for (const leg of [p.legL, p.legR]) {
      const cx = leg.x + leg.w / 2;
      drawPart(leg.x - 4, leg.y, leg.w + 8, leg.h - 6, 7, legCol, r);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      roundRect(leg.x + 2, leg.y + 8, leg.w - 4, 10, 3);
      ctx.fill();
      drawSpringCoil(cx, leg.y + leg.h - 18, leg.y + leg.h - 4, 5);
    }
    for (const foot of [p.footL, p.footR]) {
      drawAthleticBoot(foot, COLORS.accent);
    }
    return;
  }

  if (r.legType === "rocket") {
    for (const leg of [p.legL, p.legR]) {
      ctx.beginPath();
      ctx.moveTo(leg.x + 6, leg.y);
      ctx.lineTo(leg.x + leg.w - 6, leg.y);
      ctx.lineTo(leg.x + leg.w - 2, leg.y + leg.h);
      ctx.lineTo(leg.x + 2, leg.y + leg.h);
      ctx.closePath();
      const lg = ctx.createLinearGradient(leg.x, leg.y, leg.x + leg.w, leg.y + leg.h);
      lg.addColorStop(0, light);
      lg.addColorStop(0.5, legCol);
      lg.addColorStop(1, dark);
      ctx.fillStyle = lg;
      ctx.fill();
      strokeNeonRect(leg.x, leg.y, leg.w, leg.h, 4, teamColor(r));
    }
    for (const foot of [p.footL, p.footR]) {
      const fx = foot.x + foot.w / 2;
      const fy = foot.y + foot.h;
      drawAthleticBoot(foot, "#ff8c28");
      ctx.fillStyle = "#444c58";
      ctx.beginPath();
      ctx.moveTo(fx - 10, fy - 2);
      ctx.lineTo(fx + 10, fy - 2);
      ctx.lineTo(fx + 7, fy + 2);
      ctx.lineTo(fx - 7, fy + 2);
      ctx.closePath();
      ctx.fill();
      const idle = r.onGround ? 0.55 : 0.3;
      ctx.fillStyle = `rgba(255,140,40,${idle})`;
      ctx.shadowColor = "#ff8c28";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(fx, fy + 1, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (r.flapFx > 0) {
      const t = r.flapFx / 0.18;
      for (const foot of [p.footL, p.footR]) {
        const fx = foot.x + foot.w / 2;
        const fy = foot.y + foot.h;
        const flameH = 16 * t, flameW = 12 * t;
        ctx.globalAlpha = t;
        ctx.fillStyle = "#ffb347";
        ctx.beginPath();
        ctx.moveTo(fx - flameW / 2, fy + 2);
        ctx.lineTo(fx + flameW / 2, fy + 2);
        ctx.lineTo(fx, fy + 2 + flameH);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff3c0";
        ctx.beginPath();
        ctx.moveTo(fx - flameW / 4, fy + 2);
        ctx.lineTo(fx + flameW / 4, fy + 2);
        ctx.lineTo(fx, fy + 2 + flameH * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    return;
  }

  for (const leg of [p.legL, p.legR]) {
    drawPart(leg.x, leg.y, leg.w, leg.h, 6, legCol, r);
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(leg.x + 4, leg.y + leg.h * 0.38, leg.w - 8, 2);
  }
  drawAthleticBoot(p.footL, teamColor(r));
  drawAthleticBoot(p.footR, teamColor(r));
}

function drawStandardTorsoShell(p, col, r) {
  drawPart(p.torso.x, p.torso.y, p.torso.w, p.torso.h, 14, col.torso, r);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  roundRect(p.torso.x + 10, p.torso.y + 16, p.torso.w - 20, 28, 6);
  ctx.fill();
}

function drawStandardTorso(p, col, cx, r) {
  drawStandardTorsoShell(p, col, r);
  drawChestCore(cx, p.torso, teamColor(r));
}

function drawRobotTorso(r, p, col, cx) {
  drawStandardTorso(p, col, cx, r);
}

function drawRobot(r, floorY) {
  const p = r.parts, col = r.colors;
  ctx.save();
  const sq = r.squash;
  const cx = r.x + r.w / 2;
  const feet = r.y + r.h;
  ctx.translate(cx, feet);
  ctx.scale(1 + sq * 0.18, 1 - sq * 0.18);
  ctx.translate(-cx, -feet);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  const shW = r.w * (0.6 + 0.3 * (r.onGround ? 1 : 0.4));
  ctx.ellipse(cx, floorY + 6, shW, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  drawTeamGlow(r, cx, r.y + r.h / 2);

  drawRobotLegs(r, p, col);

  drawRobotTorso(r, p, col, cx);

  drawRobotArms(r, p, col);

  drawRobotHead(r, p, col, cx);
  ctx.restore();
}

function drawRobotArms(r, p, col) {
  const armCol = col.arms;
  const accent = teamColor(r);
  for (const arm of [p.armL, p.armR]) {
    drawPart(arm.x, arm.y, arm.w, arm.h, 6, armCol, r, accent);
  }

  const enemyDir = -r.side;
  const frontArm = enemyDir > 0 ? p.armR : p.armL;
  const hx = frontArm.x + frontArm.w / 2;
  const hy = frontArm.y + frontArm.h - 3;
  const propGone = r.attack && (r.attack.kind === "projectile" || r.attack.kind === "portal");
  if (!propGone) drawArmEmblem(r.armType, hx, hy, enemyDir, armCol, r.side);
}

function drawArmEmblem(type, hx, hy, dir, armCol, side = -1) {
  ctx.save();
  if (type === "portalGun") {
    // Compact portal gun: barrel + team-colored portal disc at the muzzle.
    ctx.fillStyle = "#5a6270";
    ctx.strokeStyle = "#2a3038";
    ctx.lineWidth = 1.2;
    roundRect(hx - 3, hy - 10, 6, 12, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3a424c";
    ctx.fillRect(hx - 2 + dir * 2, hy - 14, 8, 4);
    ctx.strokeRect(hx - 2 + dir * 2, hy - 14, 8, 4);
    const mx = hx + dir * 10;
    const my = hy - 12;
    const blue = side > 0;
    ctx.fillStyle = blue ? "rgba(40,160,230,0.85)" : "rgba(220,40,40,0.85)";
    ctx.shadowColor = blue ? "rgba(60,180,255,0.8)" : "rgba(255,60,40,0.8)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(mx, my, 3, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = blue ? "rgba(160,220,255,0.9)" : "rgba(255,180,160,0.9)";
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(mx, my, 1.5, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === "axe") {
    ctx.strokeStyle = "#7a5230";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx, hy + 3);
    ctx.lineTo(hx + dir * 3, hy - 12);
    ctx.stroke();
    ctx.fillStyle = "#c8cdd6";
    ctx.beginPath();
    ctx.moveTo(hx + dir * 3, hy - 16);
    ctx.lineTo(hx + dir * 13, hy - 12);
    ctx.lineTo(hx + dir * 13, hy - 4);
    ctx.lineTo(hx + dir * 3, hy - 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#555d6a";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (type === "ninjaStar") {
    ctx.save();
    ctx.translate(hx, hy - 8);
    ctx.fillStyle = "#c8cdd6";
    ctx.strokeStyle = "#555d6a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * 3, Math.sin(a + Math.PI / 4) * 3);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3a4048";
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = shadeColor(armCol, 22);
    ctx.shadowColor = "#5ac8ff";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(hx, hy - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,220,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy - 12, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawRobotHead(r, p, col, cx) {
  const head = p.head;
  const eyeOpen = r.eyeBlink > 0 ? 0.3 : 1;
  const accent = headAccent(r);

  if (r.headType === "magnet") {
    drawCartoonMagnetHead(r, head, col, cx);
    return;
  }

  if (r.headType === "drill") {
    drawDrillHead(r, head, col, cx);
    return;
  }

  // Standard
  drawPart(head.x, head.y, head.w, head.h, 10, col.head, r, accent);
  drawHeadAccentRing(cx, head.y + head.h * 0.5, head.w * 0.55, head.h * 0.52, accent);
  drawNeonVisor(head.x + 6, head.y + 10, head.w - 12, 12, eyeOpen, accent);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(cx, head.y);
  ctx.lineTo(cx, head.y - 14);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.accent;
  ctx.shadowColor = GLOW.accent;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, head.y - 16, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawDrillHead(r, head, col, cx) {
  // The whole head IS the drill: banded housing with the visor at the bottom,
  // fluted cone rising to a point above it.
  const housing = col.head;
  const housingDark = shadeColor(housing, -28);
  const housingLight = shadeColor(housing, 18);
  const metal = "#8a929e";
  const metalDark = "#555d6a";
  const accent = headAccent(r);
  const eyeOpen = r.eyeBlink > 0 ? 0.3 : 1;
  const dashing = Math.abs(r.vx) > HEAD_TYPES.drill.dashMinVx;

  const baseY = head.y + head.h;          // neck line
  const ringH = head.h * 0.52;            // housing ring holding the visor
  const ringY = baseY - ringH;
  const ringW = head.w * 0.82;
  const coneH = head.h * 0.95;            // cone rises above the box, like the sprite
  const coneW = ringW * 0.78;
  const coneTop = ringY - coneH;

  // Neck collar into the torso
  ctx.fillStyle = housingDark;
  roundRect(cx - 5, baseY - 4, 10, 8, 3);
  ctx.fill();

  // Fluted cone
  const coneGrad = ctx.createLinearGradient(cx - coneW / 2, coneTop, cx + coneW / 2, ringY);
  coneGrad.addColorStop(0, housingLight);
  coneGrad.addColorStop(0.55, housing);
  coneGrad.addColorStop(1, housingDark);
  ctx.beginPath();
  ctx.moveTo(cx, coneTop);
  ctx.lineTo(cx + coneW / 2, ringY + 2);
  ctx.lineTo(cx - coneW / 2, ringY + 2);
  ctx.closePath();
  ctx.fillStyle = coneGrad;
  ctx.fill();
  ctx.strokeStyle = housingDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Spiral flute bands, scrolling with drillAngle so the cone reads as spinning
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, coneTop);
  ctx.lineTo(cx + coneW / 2, ringY + 2);
  ctx.lineTo(cx - coneW / 2, ringY + 2);
  ctx.closePath();
  ctx.clip();
  const bands = 4;
  const phase = (r.drillAngle / (Math.PI * 2)) % 1;
  for (let i = 0; i < bands; i++) {
    const t = (i + phase) / bands;              // 0 at tip, 1 at the base
    const y = coneTop + coneH * t;
    const halfW = (coneW / 2) * t;
    ctx.strokeStyle = metal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, y + 2);
    ctx.lineTo(cx + halfW, y - 1);
    ctx.stroke();
    // orange hazard chip riding the band
    if (halfW > 3) {
      ctx.fillStyle = accent;
      ctx.fillRect(cx + halfW * 0.35, y - 2, Math.max(2, halfW * 0.28), 3);
    }
  }
  ctx.restore();

  // Bright tip
  ctx.fillStyle = "#eef1f5";
  ctx.beginPath();
  ctx.moveTo(cx, coneTop);
  ctx.lineTo(cx + coneW * 0.1, coneTop + coneH * 0.16);
  ctx.lineTo(cx - coneW * 0.1, coneTop + coneH * 0.16);
  ctx.closePath();
  ctx.fill();

  // Housing ring + visor face
  drawPart(cx - ringW / 2, ringY, ringW, ringH, 6, housing, r, accent);
  ctx.fillStyle = metalDark;
  ctx.fillRect(cx - ringW / 2 + 2, ringY + 1, ringW - 4, 2);
  drawNeonVisor(cx - ringW / 2 + 5, ringY + ringH * 0.3, ringW - 10, ringH * 0.42,
    eyeOpen, accent);
  drawHeadAccentRing(cx, ringY + ringH * 0.55, ringW * 0.52, ringH * 0.5, accent);

  // Spark flecks off the tip when dashing
  if (dashing) {
    ctx.fillStyle = "rgba(255,200,80,0.75)";
    for (let i = 0; i < 3; i++) {
      const a = r.drillAngle * 2 + i * 2.1;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(a) * 5, coneTop - 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCartoonMagnetHead(r, head, col, cx) {
  const magnetRed = col.head;
  const magnetDark = shadeColor(magnetRed, -28);
  const magnetLight = shadeColor(magnetRed, 18);
  const poleTip = "#dde2eb";
  const poleTipDark = "#8b95a8";

  const topY = head.y + 1;
  const bottomY = head.y + head.h - 4;
  const poleW = 12;
  const gap = 10;
  const leftX = cx - gap / 2 - poleW;
  const rightX = cx + gap / 2;
  const prongH = bottomY - topY - 10;

  // Neck stem
  ctx.fillStyle = magnetDark;
  roundRect(cx - 3, bottomY - 4, 6, 7, 2);
  ctx.fill();

  // Bottom curve of the U
  ctx.strokeStyle = magnetRed;
  ctx.lineWidth = poleW - 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(leftX + poleW / 2, bottomY - 8);
  ctx.quadraticCurveTo(cx, bottomY + 5, rightX + poleW / 2, bottomY - 8);
  ctx.stroke();

  // Left prong
  const leftGrad = ctx.createLinearGradient(leftX, topY, leftX + poleW, bottomY);
  leftGrad.addColorStop(0, magnetLight);
  leftGrad.addColorStop(1, magnetDark);
  ctx.fillStyle = leftGrad;
  roundRect(leftX, topY + 9, poleW, prongH, 4);
  ctx.fill();
  ctx.fillStyle = poleTip;
  roundRect(leftX + 1, topY, poleW - 2, 12, 3);
  ctx.fill();
  ctx.fillStyle = poleTipDark;
  ctx.fillRect(leftX + 2, topY + 2, poleW - 4, 2);

  // Right prong
  const rightGrad = ctx.createLinearGradient(rightX, topY, rightX + poleW, bottomY);
  rightGrad.addColorStop(0, magnetLight);
  rightGrad.addColorStop(1, magnetDark);
  ctx.fillStyle = rightGrad;
  roundRect(rightX, topY + 9, poleW, prongH, 4);
  ctx.fill();
  ctx.fillStyle = poleTip;
  roundRect(rightX + 1, topY, poleW - 2, 12, 3);
  ctx.fill();
  ctx.fillStyle = poleTipDark;
  ctx.fillRect(rightX + 2, topY + 2, poleW - 4, 2);

  // Highlight on prongs
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(leftX + 3, topY + 12, 2, prongH - 8);
  ctx.fillRect(rightX + 3, topY + 12, 2, prongH - 8);

  const carrying = r.magnetFx > 0 || (ball.magnetHold && ball.magnetHold.side === r.side);
  if (carrying) {
    const t = r.magnetFx > 0 ? Math.min(1, r.magnetFx / HEAD_TYPES.magnet.carryTime) : 0.5;
    const pulse = 0.45 + t * 0.55;
    ctx.strokeStyle = `rgba(120,220,255,${pulse})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, topY + 2, 7 + i * 7, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(120,220,255,${0.12 + t * 0.18})`;
    ctx.beginPath();
    ctx.moveTo(leftX + poleW / 2, topY + 1);
    ctx.lineTo(rightX + poleW / 2, topY + 1);
    ctx.lineTo(cx, topY - 12 - t * 5);
    ctx.closePath();
    ctx.fill();
  } else if (r.eyeBlink > 0) {
    ctx.strokeStyle = "rgba(255,255,160,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftX + poleW / 2, topY + 2);
    ctx.lineTo(cx, topY - 9);
    ctx.lineTo(rightX + poleW / 2, topY + 2);
    ctx.stroke();
  }
}
