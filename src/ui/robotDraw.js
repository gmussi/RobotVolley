/**
 * Robot body drawing — shared by in-game renderer, HUD previews, and lottery reels.
 */
import { ROBOT_W, ROBOT_H } from "../data/constants.js";
import { ball, shadeColor, updateRobotParts } from "../engine/game.js";
import { HEAD_TYPES } from "../data/heads.js";
import { COLORS, GLOW, PART_ACCENTS } from "../data/theme.js";

let ctx;

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
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  roundRect(x, y, w, h, rad);
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
      const extend = HEAD_TYPES.drill.extendW + 26;
      if (r.facing >= 0) b.w += extend;
      else {
        b.x -= extend;
        b.w += extend;
      }
      b.h = Math.max(b.h, HEAD_TYPES.drill.extendH + 6);
    } else if (r.headType === "satellite") {
      const depth = 16 + HEAD_TYPES.satellite.dishAbove * 0.35;
      b.y -= depth - HEAD_TYPES.satellite.dishAbove;
      b.h += depth - HEAD_TYPES.satellite.dishAbove + 10;
      const lnbPad = 18;
      if (r.facing >= 0) b.w += lnbPad;
      else {
        b.x -= lnbPad;
        b.w += lnbPad;
      }
    }
    return b;
  }
  if (slotKey === "torsoType") return { ...p.torso };
  if (slotKey === "legType") return unionRects(p.legL, p.legR, p.footL, p.footR);
  if (slotKey === "armType" || slotKey === "arms") {
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
    cogAngle: 0.9,
    colors: { ...colors },
    parts: {},
  };
  if (slotKey === "legType") r.legType = typeId;
  else if (slotKey === "headType") r.headType = typeId;
  else if (slotKey === "torsoType") r.torsoType = typeId;
  else if (slotKey === "armType") r.armType = typeId;
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
  else if (slotKey === "armType" || slotKey === "arms") drawRobotArms(r, p, col);
}

export function colorsFromAccent(accent) {
  return {
    head: accent,
    torso: accent,
    arms: shadeColor(accent, -35),
    legs: shadeColor(accent, -35),
  };
}

export function drawPartPreview(targetCtx, slotKey, typeId, cx, cy, maxSize, colors) {
  useCtx(targetCtx, () => {
    const r = buildPreviewRobot(slotKey, typeId, colors);
    const view = partViewBounds(r, slotKey);
    const scale = (maxSize * 0.84) / Math.max(view.w, view.h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-(view.x + view.w / 2), -(view.y + view.h / 2));
    drawPreviewPart(r, slotKey);
    ctx.restore();
  });
}

export function drawRobotFigure(targetCtx, r, floorY) {
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
    // Bulkier hydraulic legs with visible springs and wide stomper boots.
    for (const leg of [p.legL, p.legR]) {
      const cx = leg.x + leg.w / 2;
      const grad = ctx.createLinearGradient(leg.x, leg.y, leg.x + leg.w, leg.y);
      grad.addColorStop(0, dark);
      grad.addColorStop(0.5, legCol);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      roundRect(leg.x - 3, leg.y, leg.w + 6, leg.h - 8, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      roundRect(leg.x + 2, leg.y + 8, leg.w - 4, 10, 3);
      ctx.fill();
      drawSpringCoil(cx, leg.y + leg.h - 18, leg.y + leg.h - 4, 5);
    }
    for (const foot of [p.footL, p.footR]) {
      ctx.fillStyle = "#20242f";
      roundRect(foot.x - 4, foot.y - 2, foot.w + 8, foot.h + 4, 5);
      ctx.fill();
      ctx.fillStyle = "#ffd54a";
      ctx.fillRect(foot.x + 2, foot.y + 3, foot.w - 4, 3);
    }
    return;
  }

  if (r.legType === "rocket") {
    // Slim struts + permanent thruster nozzles under each foot.
    for (const leg of [p.legL, p.legR]) {
      ctx.fillStyle = legCol;
      ctx.beginPath();
      ctx.moveTo(leg.x + 4, leg.y);
      ctx.lineTo(leg.x + leg.w - 4, leg.y);
      ctx.lineTo(leg.x + leg.w - 1, leg.y + leg.h);
      ctx.lineTo(leg.x + 1, leg.y + leg.h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const foot of [p.footL, p.footR]) {
      const fx = foot.x + foot.w / 2;
      const fy = foot.y + foot.h;
      ctx.fillStyle = "#2a3038";
      roundRect(foot.x - 2, foot.y - 4, foot.w + 4, foot.h + 2, 3);
      ctx.fill();
      ctx.fillStyle = "#444c58";
      ctx.beginPath();
      ctx.moveTo(fx - 10, fy - 2);
      ctx.lineTo(fx + 10, fy - 2);
      ctx.lineTo(fx + 7, fy + 2);
      ctx.lineTo(fx - 7, fy + 2);
      ctx.closePath();
      ctx.fill();
      const idle = r.onGround ? 0.45 : 0.25;
      ctx.fillStyle = `rgba(255,140,40,${idle})`;
      ctx.beginPath();
      ctx.ellipse(fx, fy + 1, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
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

  // Robot (normal) — athletic tapered legs with metallic fill.
  for (const leg of [p.legL, p.legR]) {
    const dark = shadeColor(legCol, -30);
    const light = shadeColor(legCol, 18);
    fillMetallicRect(leg.x, leg.y, leg.w, leg.h, 5, legCol, dark, light);
    strokeNeonRect(leg.x, leg.y, leg.w, leg.h, 5, teamColor(r));
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(leg.x + 3, leg.y + 6, 3, leg.h - 12);
  }
  ctx.fillStyle = "#20242f";
  roundRect(p.footL.x, p.footL.y, p.footL.w, p.footL.h, 4);
  ctx.fill();
  roundRect(p.footR.x, p.footR.y, p.footR.w, p.footR.h, 4);
  ctx.fill();
}

function drawStandardTorsoShell(p, col) {
  const bodyGrad = ctx.createLinearGradient(p.torso.x, p.torso.y, p.torso.x, p.torso.y + p.torso.h);
  bodyGrad.addColorStop(0, shadeColor(col.torso, 25));
  bodyGrad.addColorStop(1, col.torso);
  ctx.fillStyle = bodyGrad;
  roundRect(p.torso.x, p.torso.y, p.torso.w, p.torso.h, 12);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  roundRect(p.torso.x + 12, p.torso.y + 14, p.torso.w - 24, 30, 6);
  ctx.fill();
}

function drawStandardTorso(p, col, cx) {
  drawStandardTorsoShell(p, col);
  ctx.fillStyle = "#ffd54a";
  ctx.fillRect(cx - 3, p.torso.y + 18, 6, 22);
}

function drawCog(cx, cy, radius, angle, teeth = 8) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.fillStyle = "#7a8490";
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.35) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.65) / teeth) * Math.PI * 2;
    const a3 = ((i + 1) / teeth) * Math.PI * 2;
    const inner = radius * 0.62;
    const outer = radius;
    if (i === 0) ctx.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
    ctx.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
    ctx.lineTo(Math.cos(a2) * outer, Math.sin(a2) * outer);
    ctx.lineTo(Math.cos(a3) * inner, Math.sin(a3) * inner);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#a8b0ba";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHeavyTorso(p, col, cx) {
  const t = p.torso;
  const bodyGrad = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.h);
  bodyGrad.addColorStop(0, shadeColor(col.torso, 15));
  bodyGrad.addColorStop(1, shadeColor(col.torso, -15));
  ctx.fillStyle = bodyGrad;
  roundRect(t.x, t.y, t.w, t.h, 10);
  ctx.fill();

  ctx.strokeStyle = "#1a1e28";
  ctx.lineWidth = 3;
  roundRect(t.x + 2, t.y + 2, t.w - 4, t.h - 4, 8);
  ctx.stroke();

  ctx.fillStyle = "#2a3038";
  const bandH = 6;
  for (const by of [t.y + 16, t.y + t.h * 0.45, t.y + t.h - 22]) {
    roundRect(t.x + 6, by, t.w - 12, bandH, 2);
    ctx.fill();
  }

  ctx.fillStyle = "#444c58";
  for (const [bx, by] of [
    [t.x + 8, t.y + 8],
    [t.x + t.w - 14, t.y + 8],
    [t.x + 8, t.y + t.h - 14],
    [t.x + t.w - 14, t.y + t.h - 14],
  ]) {
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#1e222c";
  roundRect(cx - 10, t.y + 20, 20, t.h - 36, 4);
  ctx.fill();
}

function drawLightTorso(p, col, cx) {
  const t = p.torso;
  const pad = 5;
  const ix = t.x + pad;
  const iy = t.y + pad;
  const iw = t.w - pad * 2;
  const ih = t.h - pad * 2;

  ctx.fillStyle = "rgba(6,10,18,0.72)";
  roundRect(ix, iy, iw, ih, 9);
  ctx.fill();

  const beamFace = "#b8c0c8";
  const beamEdge = "#6d7680";
  const beamShadow = "#434a54";
  const joint = "#9aa3ad";

  ctx.strokeStyle = beamEdge;
  ctx.lineWidth = 2;
  roundRect(t.x + 2, t.y + 2, t.w - 4, t.h - 4, 11);
  ctx.stroke();

  function beamRect(x, y, w, h) {
    ctx.fillStyle = beamShadow;
    ctx.fillRect(x + 1, y + 1, w, h);
    ctx.fillStyle = beamFace;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = beamEdge;
    if (w >= h) ctx.fillRect(x, y, w, 1);
    else ctx.fillRect(x, y, 1, h);
  }

  const postW = 5;
  const left = ix + 2;
  const right = ix + iw - postW - 2;
  const top = iy + 3;
  const bottom = iy + ih - 8;
  const midY = iy + ih * 0.48;

  beamRect(left, top, postW, bottom - top);
  beamRect(right, top, postW, bottom - top);
  beamRect(left, top, right - left + postW, 4);
  beamRect(left, midY - 2, right - left + postW, 4);
  beamRect(left, bottom - 4, right - left + postW, 4);

  ctx.strokeStyle = beamEdge;
  ctx.lineWidth = 3;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(left + postW + 2, top + 6);
  ctx.lineTo(right - 2, bottom - 8);
  ctx.moveTo(right + postW - 2, top + 6);
  ctx.lineTo(left + 2, bottom - 8);
  ctx.stroke();

  ctx.strokeStyle = shadeColor(col.torso, -10);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, top + 8);
  ctx.lineTo(cx, bottom - 10);
  ctx.stroke();

  for (const [jx, jy] of [
    [left, top], [right, top], [left, midY - 2], [right, midY - 2],
    [left, bottom - 4], [right, bottom - 4], [cx - 2, midY - 2],
  ]) {
    ctx.fillStyle = joint;
    ctx.beginPath();
    ctx.arc(jx + (jx === cx - 2 ? 2 : postW / 2), jy + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLowCoGTorso(r, p, col, cx) {
  drawStandardTorsoShell(p, col);
  drawCog(cx, p.torso.y + 29, 11, r.cogAngle);
}

function drawRobotTorso(r, p, col, cx) {
  switch (r.torsoType) {
    case "heavy": drawHeavyTorso(p, col, cx); break;
    case "light": drawLightTorso(p, col, cx); break;
    case "lowCoG": drawLowCoGTorso(r, p, col, cx); break;
    default: drawStandardTorso(p, col, cx); break;
  }
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
  const dark = shadeColor(armCol, -28);
  for (const arm of [p.armL, p.armR]) {
    const grad = ctx.createLinearGradient(arm.x, arm.y, arm.x + arm.w, arm.y);
    grad.addColorStop(0, dark);
    grad.addColorStop(0.5, armCol);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    roundRect(arm.x, arm.y, arm.w, arm.h, 5);
    ctx.fill();
  }

  // Weapon emblem sits in the enemy-facing hand (hidden while a projectile is airborne).
  const enemyDir = -r.side;
  const frontArm = enemyDir > 0 ? p.armR : p.armL;
  const hx = frontArm.x + frontArm.w / 2;
  const hy = frontArm.y + frontArm.h - 3;
  const projectileGone = r.attack && r.attack.kind === "projectile";
  if (!projectileGone) drawArmEmblem(r.armType, hx, hy, enemyDir, armCol);
}

function drawArmEmblem(type, hx, hy, dir, armCol) {
  ctx.save();
  if (type === "axe") {
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
    // hand: a metal fist with a faint energy orb hint
    ctx.fillStyle = shadeColor(armCol, 22);
    ctx.beginPath();
    ctx.arc(hx, hy - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,220,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy - 12, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRobotHead(r, p, col, cx) {
  const head = p.head;
  const spec = HEAD_TYPES[r.headType] ?? HEAD_TYPES.standard;
  const eyeOpen = r.eyeBlink > 0 ? 0.3 : 1;
  const headGrad = ctx.createLinearGradient(head.x, head.y, head.x, head.y + head.h);
  headGrad.addColorStop(0, shadeColor(col.head, 25));
  headGrad.addColorStop(1, col.head);

  if (r.headType === "dome") {
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(head.x + head.w / 2, head.y + head.h - 2, head.w / 2, head.h / 2 + 2, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#eaf6ff";
    ctx.shadowColor = col.head;
    ctx.shadowBlur = 12;
    roundRect(head.x + 8, head.y + head.h * 0.35, head.w - 16, 10 * eyeOpen + 2, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    return;
  }

  if (r.headType === "magnet") {
    drawCartoonMagnetHead(r, head, col, cx);
    return;
  }

  if (r.headType === "drill") {
    drawDrillHead(r, head, col, cx);
    return;
  }

  if (r.headType === "satellite") {
    drawSatelliteDishHead(r, head, col, cx);
    return;
  }

  // Standard
  ctx.fillStyle = headGrad;
  roundRect(head.x, head.y, head.w, head.h, 9);
  ctx.fill();
  ctx.fillStyle = "#eaf6ff";
  ctx.shadowColor = col.head;
  ctx.shadowBlur = 14;
  roundRect(head.x + 6, head.y + 10, head.w - 12, 12 * eyeOpen + 2, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = shadeColor(col.head, -35);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, head.y);
  ctx.lineTo(cx, head.y - 12);
  ctx.stroke();
  ctx.fillStyle = "#ffd54a";
  ctx.beginPath();
  ctx.arc(cx, head.y - 14, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawDrillHead(r, head, col, cx) {
  const housing = col.head;
  const housingDark = shadeColor(housing, -28);
  const housingLight = shadeColor(housing, 18);
  const metal = "#8a929e";
  const metalDark = "#555d6a";
  const bitCol = "#c8cdd6";

  const centerY = head.y + head.h * 0.52;
  const bodyW = 28;
  const bodyH = 22;
  const face = r.facing;
  const dashing = Math.abs(r.vx) > HEAD_TYPES.drill.dashMinVx;
  const bitLen = dashing ? 22 : 16;

  ctx.save();
  ctx.translate(cx, centerY);
  ctx.scale(face, 1);

  // Pistol grip into torso
  ctx.fillStyle = housingDark;
  roundRect(-5, 4, 10, 14, 3);
  ctx.fill();
  ctx.fillStyle = housing;
  roundRect(-4, 5, 8, 12, 2);
  ctx.fill();

  // Main housing
  const bodyGrad = ctx.createLinearGradient(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2);
  bodyGrad.addColorStop(0, housingLight);
  bodyGrad.addColorStop(0.5, housing);
  bodyGrad.addColorStop(1, housingDark);
  ctx.fillStyle = bodyGrad;
  roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 6);
  ctx.fill();
  ctx.strokeStyle = housingDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Top vent slots
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(-8 + i * 5, -7, 3, 5);
  }

  // Trigger
  ctx.fillStyle = metalDark;
  roundRect(2, 2, 6, 8, 2);
  ctx.fill();

  // Chuck collar
  ctx.fillStyle = metal;
  roundRect(bodyW / 2 - 4, -6, 10, 12, 2);
  ctx.fill();
  ctx.fillStyle = metalDark;
  ctx.fillRect(bodyW / 2 + 2, -4, 3, 8);

  // Spinning drill bit
  const chuckX = bodyW / 2 + 6;
  ctx.save();
  ctx.translate(chuckX, 0);
  ctx.rotate(r.drillAngle);

  // Fluted bit shaft
  ctx.strokeStyle = bitCol;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(bitLen, 0);
    ctx.lineTo(0, 4);
    ctx.stroke();
    ctx.rotate(Math.PI / 2);
  }

  // Bit tip
  ctx.fillStyle = "#eef1f5";
  ctx.beginPath();
  ctx.moveTo(bitLen - 2, -3);
  ctx.lineTo(bitLen + 5, 0);
  ctx.lineTo(bitLen - 2, 3);
  ctx.closePath();
  ctx.fill();

  // Motion blur ring while spinning
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(2, 0, bitLen * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // Spark flecks when dashing
  if (dashing) {
    ctx.fillStyle = "rgba(255,200,80,0.7)";
    for (let i = 0; i < 3; i++) {
      const a = r.drillAngle * 2 + i * 2.1;
      ctx.beginPath();
      ctx.arc(chuckX + bitLen + 4, Math.sin(a) * 5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (r.eyeBlink > 0) {
    ctx.strokeStyle = "rgba(255,220,120,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chuckX + 4, -6);
    ctx.lineTo(chuckX + bitLen + 6, 0);
    ctx.lineTo(chuckX + 4, 6);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSatelliteDishHead(r, head, col, cx) {
  const dishCol = col.head;
  const dishDark = shadeColor(dishCol, -30);
  const dishLight = shadeColor(dishCol, 22);
  const metal = "#7a8494";
  const metalDark = "#505868";

  const mountY = head.y + head.h - 5;
  const rimY = head.y + head.h * 0.42;
  const dishRx = head.w * 0.46;
  const depth = 16 + HEAD_TYPES.satellite.dishAbove * 0.35;

  // Mast arm into the torso
  ctx.strokeStyle = metalDark;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, mountY + 2);
  ctx.lineTo(cx, rimY + 4);
  ctx.stroke();
  ctx.strokeStyle = metal;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, mountY);
  ctx.lineTo(cx, rimY + 2);
  ctx.stroke();

  // Back support strut
  ctx.strokeStyle = metalDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 6, rimY + 2);
  ctx.lineTo(cx - dishRx + 6, rimY - 2);
  ctx.stroke();

  // Parabolic dish bowl
  ctx.beginPath();
  ctx.moveTo(cx - dishRx, rimY);
  ctx.quadraticCurveTo(cx, rimY - depth, cx + dishRx, rimY);
  ctx.lineTo(cx + dishRx - 3, rimY + 4);
  ctx.quadraticCurveTo(cx, rimY - depth + 8, cx - dishRx + 3, rimY + 4);
  ctx.closePath();
  const bowlGrad = ctx.createLinearGradient(cx, rimY - depth, cx, rimY + 4);
  bowlGrad.addColorStop(0, dishLight);
  bowlGrad.addColorStop(0.45, dishCol);
  bowlGrad.addColorStop(1, dishDark);
  ctx.fillStyle = bowlGrad;
  ctx.fill();
  ctx.strokeStyle = dishDark;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Rim highlight
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - dishRx + 4, rimY + 1);
  ctx.quadraticCurveTo(cx, rimY - depth + 2, cx + dishRx - 4, rimY + 1);
  ctx.stroke();

  // Concentric signal rings on the dish
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    ctx.beginPath();
    ctx.moveTo(cx - dishRx * t, rimY + 1);
    ctx.quadraticCurveTo(cx, rimY - depth * t, cx + dishRx * t, rimY + 1);
    ctx.stroke();
  }

  // LNB feed arm + receiver box
  const armLen = 14;
  const lnbX = cx + r.facing * armLen;
  const lnbY = rimY - depth * 0.45;
  ctx.strokeStyle = metal;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + r.facing * 4, rimY - depth * 0.35);
  ctx.lineTo(lnbX, lnbY);
  ctx.stroke();
  ctx.fillStyle = "#3a4048";
  roundRect(lnbX - 4, lnbY - 3, 8, 6, 2);
  ctx.fill();
  ctx.fillStyle = "#66ff88";
  ctx.beginPath();
  ctx.arc(lnbX + r.facing * 3, lnbY, 2, 0, Math.PI * 2);
  ctx.fill();

  // Signal ping on ball hit
  if (r.eyeBlink > 0) {
    const t = r.eyeBlink / 0.12;
    ctx.strokeStyle = `rgba(102,255,136,${0.35 + t * 0.45})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(lnbX + r.facing * 6, lnbY - 2, 6 + i * 8, -0.8, 0.8);
      ctx.stroke();
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
