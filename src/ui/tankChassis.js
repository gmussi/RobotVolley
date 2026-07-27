/**
 * Full tank body — hull + treads replace the robot torso and legs.
 * Shared by procedural and sprite renderers.
 */
import { shadeColor } from "../engine/game.js";

/**
 * Deliberately slower than the ground the tank actually covers. At true rolling
 * speed a tread pad crosses more than a frame's worth of screen per tick, which
 * strobes and can read as rolling backwards. The belt frames and the wheel spin
 * both come off the distance below, so they stay locked to each other whatever
 * this is set to.
 */
const ROLL_SCALE = 0.28;

const rolled = new WeakMap();

/**
 * How far the tread has rolled, in world pixels. Accumulated from speed rather
 * than read off the clock so the belt never jumps when the robot starts, stops
 * or turns around, and stops dead while airborne.
 */
export function tankRoll(r) {
  const now = performance.now();
  let s = rolled.get(r);
  if (!s) {
    s = { t: now, d: 0 };
    rolled.set(r, s);
  }
  const dt = Math.min(0.05, (now - s.t) / 1000);
  s.t = now;
  if (r.onGround) s.d += dt * r.vx * ROLL_SCALE;
  return s.d;
}

/**
 * Which belt frame to show, and how far the wheels have turned, for a body of
 * size `box` that has rolled `dist` world pixels.
 *
 * Both come off that one distance, so the pads can never crawl while the wheels
 * race: the strip loops once per pad pitch, and a wheel turns once per its own
 * circumference. `meta` is the bake's sidecar (tools/robot/gen_tank_roll.py).
 */
export function tankRollState(dist, box, meta) {
  const pitch = meta.pitchFrac * box.w;
  const cycle = pitch > 0 ? ((dist / pitch) % 1 + 1) % 1 : 0;
  const radius = meta.wheels.length ? meta.wheels[0].ry * box.h : 0;
  // cycle * frames should land exactly on a frame boundary at exact multiples
  // of the pitch, but the float round-trip through dist/pitch routinely misses
  // by ~1e-16 — enough for Math.floor to drop to the frame below. The nudge is
  // far smaller than a frame's own width (1/frames), so it only ever corrects
  // that boundary case rather than shifting a genuinely mid-frame value.
  return {
    frame: Math.floor(cycle * meta.frames + 1e-9) % meta.frames,
    spin: radius > 0 ? dist / radius : 0,
  };
}

/**
 * Screen-space bounds for the tank body, which stands in for the torso and the
 * legs at once. It runs from the stock torso's top edge — so the neck meets the
 * head where it always did — down to the floor line, and keeps the art's own
 * aspect so the hull and tracks are never squashed against each other.
 *
 * The tracks overhang the collision box; gameplay geometry is untouched, this
 * is only how much canvas the sprite claims.
 */
const TORSO_TOP_FRAC = 0.315;
/** Where the head's bottom edge is anchored — the hull must reach at least here. */
const HEAD_BOTTOM_FRAC = 0.405;
const MAX_WIDTH_MUL = 1.55;
/** Aspect of the painted art, used when no sprite is loaded to measure. */
const NOMINAL_ASPECT = 1.54;

export function tankBodyRect(r, aspect = NOMINAL_ASPECT) {
  let h = r.h * (1 - TORSO_TOP_FRAC);
  let w = h * aspect;
  const cap = r.w * MAX_WIDTH_MUL;
  if (w > cap) {
    // Trim to the cap, but never past the head's bottom edge — a piece short of
    // the neck reads as a robot hovering over a separate vehicle. Art wide
    // enough to hit that floor is mis-authored and overhangs instead.
    h = Math.max(r.h * (1 - HEAD_BOTTOM_FRAC), cap / aspect);
    w = h * aspect;
  }
  // Round the height up: a hair of overlap under the head is invisible, a hair
  // of gap is not.
  h = Math.ceil(h);
  w = Math.round(h * aspect);
  return { x: Math.round(r.x + (r.w - w) / 2), y: r.y + r.h - h, w, h };
}

/**
 * Procedural fallback — angular hull + continuous treads (variant #1 silhouette).
 */
export function drawTankBody(ctx, r, legCol, accent = "#00dcff", phase = 0) {
  const box = tankBodyRect(r);
  const { x, y, w, h } = box;
  const bottom = y + h;
  const dark = shadeColor(legCol, -38);
  const tread = shadeColor(legCol, -58);
  const treadHi = shadeColor(legCol, -42);

  // Upper armored hull (replaces torso)
  const hullH = h * 0.36;
  const hullY = y + 4;
  ctx.fillStyle = legCol;
  ctx.beginPath();
  ctx.moveTo(x + 10, hullY + hullH);
  ctx.lineTo(x + w - 10, hullY + hullH);
  ctx.lineTo(x + w - 4, hullY + 8);
  ctx.lineTo(x + w * 0.62, hullY);
  ctx.lineTo(x + w * 0.38, hullY);
  ctx.lineTo(x + 4, hullY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.fillRect(x + 12, hullY + 10, w - 24, hullH - 16);

  // Cyan neon stripe along hull base
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x + 8, hullY + hullH - 2);
  ctx.lineTo(x + w - 8, hullY + hullH - 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Gold rivets
  ctx.fillStyle = "#ffc850";
  for (const rx of [0.18, 0.5, 0.82]) {
    ctx.beginPath();
    ctx.arc(x + w * rx, hullY + hullH * 0.45, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Track guard / skirt
  const skirtY = hullY + hullH - 6;
  const skirtH = h * 0.28;
  ctx.fillStyle = dark;
  roundRect(ctx, x + 2, skirtY, w - 4, skirtH, 5);
  ctx.fill();

  // Road wheels inside track
  const wheelY = skirtY + skirtH * 0.55;
  const wheelR = h * 0.09;
  for (const wx of [x + w * 0.24, x + w * 0.5, x + w * 0.76]) {
    ctx.fillStyle = "#8a929e";
    ctx.beginPath();
    ctx.arc(wx, wheelY, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a626e";
    ctx.beginPath();
    ctx.arc(wx, wheelY, wheelR * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Continuous tread belt
  const beltH = h * 0.30;
  const beltY = bottom - beltH;
  ctx.fillStyle = tread;
  roundRect(ctx, x, beltY, w, beltH, 5);
  ctx.fill();

  const toothW = 10;
  const offset = ((phase % toothW) + toothW) % toothW;
  for (let tx = x - offset - toothW; tx < x + w + toothW; tx += toothW) {
    const shade = Math.floor((tx - x + offset) / toothW) % 2 === 0 ? treadHi : tread;
    ctx.fillStyle = shade;
    ctx.fillRect(tx, beltY + 3, toothW - 1, beltH - 8);
    ctx.beginPath();
    ctx.moveTo(tx + 1, bottom - 3);
    ctx.lineTo(tx + toothW - 2, bottom - 3);
    ctx.lineTo(tx + toothW * 0.5, bottom);
    ctx.closePath();
    ctx.fill();
  }

  // Track runs at corners
  for (const sx of [x + 6, x + w - 6]) {
    ctx.strokeStyle = treadHi;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx, beltY + 2);
    ctx.quadraticCurveTo(sx, skirtY + 4, sx + (sx < x + w / 2 ? -6 : 6), skirtY - 2);
    ctx.stroke();
  }
}

function roundRect(ctx, bx, by, w, h, rad) {
  const r = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.arcTo(bx + w, by, bx + w, by + h, r);
  ctx.arcTo(bx + w, by + h, bx, by + h, r);
  ctx.arcTo(bx, by + h, bx, by, r);
  ctx.arcTo(bx, by, bx + w, by, r);
  ctx.closePath();
}
