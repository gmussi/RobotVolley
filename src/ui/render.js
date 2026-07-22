/**
 * Canvas renderer. Reads engine state; never mutates rules.
 */
import {
  W, H, FLOOR_Y, WIN_SCORE, SERVE_CHARGE_FLOOR, NET,
} from "../data/constants.js";
import {
  ball, score, state, gameMode, servingSide, serveCharge,
  bannerText, winner, menuOptions, P1, P2,
  shadeColor,
} from "../engine/game.js";
import { drawLotteryAnimation } from "./lottery.js";
import { HEAD_TYPES } from "../data/heads.js";
import { arenaBgImage, stadiumBg, stadiumLayersReady, logoImage } from "./art.js";

let ctx;

export function initRender(canvas) {
  ctx = canvas.getContext("2d");
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

  // Robot (normal) — classic block legs with a knee joint line.
  for (const leg of [p.legL, p.legR]) {
    ctx.fillStyle = legCol;
    roundRect(leg.x, leg.y, leg.w, leg.h, 5);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(leg.x + 3, leg.y + leg.h * 0.42, leg.w - 6, 2);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
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

function drawRobot(r) {
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
  ctx.ellipse(cx, FLOOR_Y + 6, shW, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  drawRobotLegs(r, p, col);

  drawRobotTorso(r, p, col, cx);

  ctx.fillStyle = col.arms;
  roundRect(p.armL.x, p.armL.y, p.armL.w, p.armL.h, 5); ctx.fill();
  roundRect(p.armR.x, p.armR.y, p.armR.w, p.armR.h, 5); ctx.fill();

  drawRobotHead(r, p, col, cx);
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

  ctx.save();
  ctx.beginPath();
  ctx.arc(ix, indicatorY, ghostR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 213, 74, 0.12)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 213, 74, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

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
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff5a5f";
  ctx.font = "bold 46px 'Segoe UI', sans-serif";
  ctx.fillText(score[0], W / 2 - 70, 46);
  ctx.fillStyle = "#29b6f6";
  ctx.fillText(score[1], W / 2 + 70, 46);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("—", W / 2, 46);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "12px sans-serif";
  ctx.fillText(`FIRST TO ${WIN_SCORE}`, W / 2, 74);
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#ff5a5f";
  ctx.fillText("P1", W / 2 - 70, 76);
  ctx.fillStyle = "#29b6f6";
  ctx.fillText(gameMode === "1p" ? "CPU" : "P2", W / 2 + 70, 76);
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

