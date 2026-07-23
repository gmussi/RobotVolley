/**
 * Procedural neon stadium overlays — drawn on top of layered WebP/SVG backdrops.
 */
import { W, H, FLOOR_Y } from "../data/constants.js";
import { COLORS, GLOW } from "../data/theme.js";
import { reducedMotion } from "../data/accessibility.js";

/** Static neon overlays — cached so only animated beams redraw each frame. */
let staticEffectsCache = null;

function ensureStaticEffectsCache() {
  if (staticEffectsCache) return staticEffectsCache;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  drawTeamZoneWash(c);
  drawCenterSpotlight(c);
  drawCourtMarkings(c);
  drawVignette(c);
  staticEffectsCache = canvas;
  return staticEffectsCache;
}

export function drawArenaEffects(ctx, timeSec = 0) {
  ctx.drawImage(ensureStaticEffectsCache(), 0, 0);
  drawNeonBeams(ctx, timeSec);
}

function drawTeamZoneWash(ctx) {
  const floorTop = FLOOR_Y - 8;
  const gradL = ctx.createLinearGradient(0, floorTop - 120, W / 2, floorTop);
  gradL.addColorStop(0, "rgba(255,90,95,0)");
  gradL.addColorStop(1, "rgba(255,90,95,0.14)");
  ctx.fillStyle = gradL;
  ctx.fillRect(0, floorTop - 120, W / 2, 128);

  const gradR = ctx.createLinearGradient(W, floorTop - 120, W / 2, floorTop);
  gradR.addColorStop(0, "rgba(41,182,246,0)");
  gradR.addColorStop(1, "rgba(41,182,246,0.14)");
  ctx.fillStyle = gradR;
  ctx.fillRect(W / 2, floorTop - 120, W / 2, 128);
}

function drawCenterSpotlight(ctx) {
  const cx = W / 2;
  const cy = FLOOR_Y - 20;
  const spot = ctx.createRadialGradient(cx, cy, 20, cx, cy, 340);
  spot.addColorStop(0, "rgba(255,255,255,0.16)");
  spot.addColorStop(0.45, "rgba(255,213,74,0.06)");
  spot.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, FLOOR_Y - 360, W, 360);
}

function drawCourtMarkings(ctx) {
  const y = FLOOR_Y;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(24, y - 2);
  ctx.lineTo(W - 24, y - 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255,213,74,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, y - 6);
  ctx.lineTo(W / 2, y + 28);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,90,95,0.22)";
  ctx.beginPath();
  ctx.arc(W * 0.25, y + 8, 48, Math.PI, 0);
  ctx.stroke();
  ctx.strokeStyle = "rgba(41,182,246,0.22)";
  ctx.beginPath();
  ctx.arc(W * 0.75, y + 8, 48, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
}

function drawNeonBeams(ctx, t) {
  if (reducedMotion) return;
  const pulse = 0.55 + 0.45 * Math.sin(t * 1.6);
  ctx.save();
  ctx.globalAlpha = 0.08 * pulse;
  for (const [x, color] of [[120, COLORS.p1], [880, COLORS.p2]]) {
    const beam = ctx.createLinearGradient(x, 0, x, FLOOR_Y);
    beam.addColorStop(0, color);
    beam.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x - 60, 0);
    ctx.lineTo(x + 60, 0);
    ctx.lineTo(x + 140, FLOOR_Y - 40);
    ctx.lineTo(x - 140, FLOOR_Y - 40);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawVignette(ctx) {
  const v = ctx.createRadialGradient(W / 2, H * 0.55, 120, W / 2, H * 0.55, W * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(4,6,14,0.45)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/** Enhanced procedural fallback when no painted assets load. */
export function drawProceduralArena(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  g.addColorStop(0, "#070b18");
  g.addColorStop(0.55, "#0d1430");
  g.addColorStop(1, "#151d3d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, FLOOR_Y);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137) % W;
    const sy = (i * 89) % (FLOOR_Y - 80);
    ctx.globalAlpha = 0.15 + (i % 5) * 0.08;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  drawStadiumSilhouette(ctx);
  drawTeamZoneWash(ctx);
  drawCenterSpotlight(ctx);

  const gg = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
  gg.addColorStop(0, "#1e2438");
  gg.addColorStop(1, "#0e111c");
  ctx.fillStyle = gg;
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, FLOOR_Y, W, 4);

  drawCourtMarkings(ctx);
  drawVignette(ctx);
}

function drawStadiumSilhouette(ctx) {
  ctx.save();
  ctx.fillStyle = "#0a0f22";
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y - 20);
  for (let x = 0; x <= W; x += 40) {
    const tier = FLOOR_Y - 80 - (x % 120) * 0.15;
    ctx.lineTo(x, tier);
  }
  ctx.lineTo(W, FLOOR_Y - 20);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COLORS.p1;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(40, FLOOR_Y - 200, 120, 28);
  ctx.fillStyle = COLORS.p2;
  ctx.fillRect(W - 160, FLOOR_Y - 200, 120, 28);
  ctx.globalAlpha = 1;
  ctx.restore();
}
