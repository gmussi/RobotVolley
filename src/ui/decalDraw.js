/**
 * Court decals — the arena art a player claims their half with, in the spirit
 * of trackside boards in F1 or the hoardings round a football pitch.
 *
 * Unlike every other cosmetic, a decal is not worn: it paints the *stadium*, so
 * both players' decals are on screen at once, one per half. That is the appeal —
 * a decal is the only cosmetic your opponent cannot help but look at.
 *
 * Ball readability sets the layout, in this order of safety:
 *
 *   1. The courtside strip below FLOOR_Y. The ball bounces *at* FLOOR_Y, so
 *      those 40px are entirely out of play and take the boldest art.
 *   2. The stand banner high above the court, clear of normal rallies.
 *   3. A wash tint over the existing team zone gradient.
 *
 * Nothing above FLOOR_Y is drawn at more than a low alpha. A cosmetic that made
 * the ball harder to track would be a gameplay change, and these are meant to
 * be purely visual.
 *
 * Everything here is static, which is what lets stadiumDraw.js bake it into its
 * cached overlay and pay nothing per frame.
 */
import { W, H, FLOOR_Y } from "../data/constants.js";
import { spriteFor } from "../data/cosmetics.js";

/** Courtside board: the out-of-play band under the floor line. */
const STRIP_TOP = FLOOR_Y + 4;
const STRIP_H = H - FLOOR_Y - 8;
/** Stand banner, above the net's reach. */
const BANNER_Y = FLOOR_Y - 206;
const BANNER_H = 30;

/**
 * Per-decal palette and motif. `tint` recolours the zone wash; `ink` is the
 * motif; `bg` backs the courtside board.
 */
const STYLES = {
  century: { bg: "#1b2230", ink: "255,213,74", tint: "255,213,74", motif: "tally" },
  shutout: { bg: "#101c2a", ink: "150,220,255", tint: "41,182,246", motif: "zero" },
  streak: { bg: "#2a1410", ink: "255,150,60", tint: "255,120,40", motif: "chevrons" },
  comeback: { bg: "#1d1030", ink: "190,150,255", tint: "160,110,255", motif: "reversal" },
};

function halfBounds(side) {
  return side < 0 ? { x0: 0, x1: W / 2 } : { x0: W / 2, x1: W };
}

// ------------------------------------------------------------------ motifs
//
// Each motif is drawn into a normalised box so the same code serves the wide
// courtside strip, the narrow stand banner, and the small Profile preview tile.

function motifTally(ctx, x, y, w, h, ink) {
  ctx.strokeStyle = `rgba(${ink},0.9)`;
  ctx.lineWidth = Math.max(2, h * 0.12);
  const groups = 4;
  const gw = w / groups;
  for (let g = 0; g < groups; g++) {
    const gx = x + g * gw + gw * 0.18;
    for (let i = 0; i < 4; i++) {
      const bx = gx + i * (gw * 0.13);
      ctx.beginPath();
      ctx.moveTo(bx, y + h * 0.2);
      ctx.lineTo(bx, y + h * 0.8);
      ctx.stroke();
    }
    // The diagonal that closes a group of five.
    ctx.beginPath();
    ctx.moveTo(gx - gw * 0.04, y + h * 0.78);
    ctx.lineTo(gx + gw * 0.44, y + h * 0.22);
    ctx.stroke();
  }
}

function motifZero(ctx, x, y, w, h, ink) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = h * 0.34;
  ctx.strokeStyle = `rgba(${ink},0.95)`;
  ctx.lineWidth = Math.max(2, h * 0.13);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.72, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Slash through it — a nil, not a letter O.
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, cy + r * 0.85);
  ctx.lineTo(cx + r * 0.6, cy - r * 0.85);
  ctx.stroke();

  ctx.strokeStyle = `rgba(${ink},0.35)`;
  ctx.lineWidth = Math.max(1, h * 0.06);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * r * 1.5, cy - h * 0.22);
    ctx.lineTo(cx + dir * w * 0.42, cy - h * 0.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + dir * r * 1.5, cy + h * 0.22);
    ctx.lineTo(cx + dir * w * 0.42, cy + h * 0.22);
    ctx.stroke();
  }
}

function motifChevrons(ctx, x, y, w, h, ink) {
  const count = 6;
  const cw = w / count;
  for (let i = 0; i < count; i++) {
    // Brightening left to right — a run building, not a static pattern.
    ctx.fillStyle = `rgba(${ink},${0.25 + (i / count) * 0.65})`;
    const cx = x + i * cw + cw * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.18);
    ctx.lineTo(cx + cw * 0.34, y + h * 0.5);
    ctx.lineTo(cx, y + h * 0.82);
    ctx.lineTo(cx + cw * 0.14, y + h * 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

function motifReversal(ctx, x, y, w, h, ink) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  // Two arrows curling back on each other: down to nearly nothing, then up.
  ctx.strokeStyle = `rgba(${ink},0.9)`;
  ctx.lineWidth = Math.max(2, h * 0.11);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.12, y + h * 0.28);
  ctx.quadraticCurveTo(cx, y + h * 1.05, x + w * 0.88, y + h * 0.24);
  ctx.stroke();

  ctx.fillStyle = `rgba(${ink},0.95)`;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.88, y + h * 0.12);
  ctx.lineTo(x + w * 0.96, y + h * 0.4);
  ctx.lineTo(x + w * 0.78, y + h * 0.36);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(${ink},0.3)`;
  ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, cy);
  ctx.lineTo(x + w * 0.9, cy);
  ctx.stroke();
}

const MOTIFS = {
  tally: motifTally,
  zero: motifZero,
  chevrons: motifChevrons,
  reversal: motifReversal,
};

/**
 * Paint a decal's motif into an arbitrary box. Exported for the Profile
 * screen's preview tile and the unlock reveal, which cannot show a decal on a
 * robot the way every other slot does.
 */
export function drawDecalPlate(ctx, variant, x, y, w, h, { background = true } = {}) {
  const style = STYLES[variant];
  if (!style) return false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (background) {
    ctx.fillStyle = style.bg;
    ctx.fillRect(x, y, w, h);
  }
  MOTIFS[style.motif]?.(ctx, x, y, w, h, style.ink);
  ctx.restore();
  return true;
}

/**
 * Paint one player's half. `side` is the robot convention: -1 is the left half
 * (P1), +1 the right (P2).
 */
export function drawDecalHalf(ctx, cosmetics, side) {
  const variant = spriteFor(cosmetics, "decal");
  const style = STYLES[variant];
  if (!style) return; // "plain" and anything unknown paint nothing.

  const { x0, x1 } = halfBounds(side);
  const halfW = x1 - x0;

  // 1. Courtside board — fully out of play, so full strength.
  drawDecalPlate(ctx, variant, x0 + 12, STRIP_TOP, halfW - 24, STRIP_H);
  ctx.save();
  ctx.strokeStyle = `rgba(${style.ink},0.35)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 12, STRIP_TOP, halfW - 24, STRIP_H);
  ctx.restore();

  // 2. Stand banner — above the net, but still ball airspace, so held back.
  ctx.save();
  ctx.globalAlpha = 0.5;
  const bannerW = halfW * 0.34;
  const bannerX = side < 0 ? x0 + halfW * 0.1 : x1 - halfW * 0.1 - bannerW;
  drawDecalPlate(ctx, variant, bannerX, BANNER_Y, bannerW, BANNER_H);
  ctx.restore();

  // 3. Retint the zone wash so the half reads as claimed rather than just
  //    decorated. Alpha stays in the same range as the stock wash (0.14).
  ctx.save();
  const floorTop = FLOOR_Y - 8;
  const grad = ctx.createLinearGradient(0, floorTop - 120, 0, floorTop);
  grad.addColorStop(0, `rgba(${style.tint},0)`);
  grad.addColorStop(1, `rgba(${style.tint},0.12)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x0, floorTop - 120, halfW, 128);
  ctx.restore();
}

/** Both halves, for the arena overlay. */
export function drawDecals(ctx, p1Cosmetics, p2Cosmetics) {
  drawDecalHalf(ctx, p1Cosmetics, -1);
  drawDecalHalf(ctx, p2Cosmetics, 1);
}
