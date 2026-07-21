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
import { arenaBgImage, logoImage } from "./art.js";

let ctx;

export function initRender(canvas) {
  ctx = canvas.getContext("2d");
}

export function render() {
  ctx.clearRect(0, 0, W, H);
  drawArena();
  drawNet();
  drawRobot(P1);
  drawRobot(P2);
  if (state !== "menu") { drawBall(); drawBallTracker(); drawHUD(); }
  drawBanner();
}

function drawArena() {
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

  const bodyGrad = ctx.createLinearGradient(p.torso.x, p.torso.y, p.torso.x, p.torso.y + p.torso.h);
  bodyGrad.addColorStop(0, shadeColor(col.torso, 25));
  bodyGrad.addColorStop(1, col.torso);
  ctx.fillStyle = bodyGrad;
  roundRect(p.torso.x, p.torso.y, p.torso.w, p.torso.h, 12); ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  roundRect(p.torso.x + 12, p.torso.y + 14, p.torso.w - 24, 30, 6); ctx.fill();
  ctx.fillStyle = "#ffd54a";
  ctx.fillRect(cx - 3, p.torso.y + 18, 6, 22);

  ctx.fillStyle = col.arms;
  roundRect(p.armL.x, p.armL.y, p.armL.w, p.armL.h, 5); ctx.fill();
  roundRect(p.armR.x, p.armR.y, p.armR.w, p.armR.h, 5); ctx.fill();

  const headGrad = ctx.createLinearGradient(p.head.x, p.head.y, p.head.x, p.head.y + p.head.h);
  headGrad.addColorStop(0, shadeColor(col.head, 25));
  headGrad.addColorStop(1, col.head);
  ctx.fillStyle = headGrad;
  roundRect(p.head.x, p.head.y, p.head.w, p.head.h, 9); ctx.fill();
  const eyeOpen = r.eyeBlink > 0 ? 0.3 : 1;
  ctx.fillStyle = "#eaf6ff";
  ctx.shadowColor = col.head;
  ctx.shadowBlur = 14;
  roundRect(p.head.x + 6, p.head.y + 10, p.head.w - 12, 12 * eyeOpen + 2, 4); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = shadeColor(col.head, -35); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, p.head.y); ctx.lineTo(cx, p.head.y - 12); ctx.stroke();
  ctx.fillStyle = "#ffd54a";
  ctx.beginPath(); ctx.arc(cx, p.head.y - 14, 4, 0, Math.PI * 2); ctx.fill();
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

export function eventToCanvas(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    mx: (e.clientX - rect.left) * (W / rect.width),
    my: (e.clientY - rect.top) * (H / rect.height),
  };
}
