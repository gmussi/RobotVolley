/**
 * Sprite-based robot renderer (flat-vector art). Optional replacement for the
 * procedural drawing in robotDraw.js — gated by a flag so it's fully reversible
 * and the collision box / gameplay geometry is untouched (sprites are scaled to
 * the robot's existing bounding box).
 *
 * Parts are baked crimson (P1). P2 gets a runtime hue-rotated tint toward the
 * cyan team color. A dedicated blue art set is the higher-quality follow-up.
 */
import { GLOW } from "../data/theme.js";

// Two baked colorways — P1 crimson and P2 blue (tools/robot/gen_p2_set.py).
// Baked rather than tinted at runtime: identical geometry across teams, exact
// colors, and no per-load pixel work in the browser.
const p1Urls = import.meta.glob("../assets/robot/parts/*.webp", {
  eager: true,
  import: "default",
});
const p2Urls = import.meta.glob("../assets/robot/parts-p2/*.webp", {
  eager: true,
  import: "default",
});

/** slot -> variant -> {p1: Image, p2: Image} */
const PARTS = {};
let readyCount = 0;
let totalCount = 0;

function register(urls, team) {
  for (const [path, url] of Object.entries(urls)) {
    const m = path.match(/([a-z]+)-([A-Za-z]+)\.webp$/);
    if (!m) continue;
    const [, slot, variant] = m;
    totalCount++;
    const img = new Image();
    img.onload = () => { readyCount++; };
    img.onerror = () => { readyCount++; };
    img.src = url;
    const entry = ((PARTS[slot] ||= {})[variant] ||= { p1: null, p2: null });
    entry[team] = img;
  }
}
register(p1Urls, "p1");
register(p2Urls, "p2");

// Blink spritesheets: one strip per head variant per team, 3 equal frames
// (open / mid / closed) played 0,1,2,1,0. Same source art as the static part, so
// framing matches exactly and swapping to a frame never shifts the head.
const blinkUrls = import.meta.glob("../assets/robot/anim/*/head-*.webp", {
  eager: true,
  import: "default",
});
const BLINK = { p1: {}, p2: {} };
for (const [path, url] of Object.entries(blinkUrls)) {
  const m = path.match(/anim\/(p1|p2)\/head-([A-Za-z]+)\.webp$/);
  if (!m) continue;
  const img = new Image();
  img.src = url;
  BLINK[m[1]][m[2]] = img;
}

const BLINK_FRAMES = 3;
const BLINK_DUR = 0.12; // matches the engine's eyeBlink timer

/** 0 = open, 1 = mid, 2 = closed; sequenced mid->closed->mid across the blink. */
function blinkFrame(eyeBlink) {
  if (!(eyeBlink > 0)) return 0;
  const phase = 1 - Math.min(1, eyeBlink / BLINK_DUR);
  return phase < 0.28 || phase > 0.72 ? 1 : 2;
}

// Drill spin strips: cone detail scrolled around a vertical axis (see
// tools/robot/gen_drill_spin.py). Named head-*-spin.webp so the blink glob
// above (head-<letters>.webp) never picks them up.
const spinUrls = import.meta.glob("../assets/robot/anim/*/head-*-spin.webp", {
  eager: true,
  import: "default",
});
const SPIN = { p1: {}, p2: {} };
for (const [path, url] of Object.entries(spinUrls)) {
  const m = path.match(/anim\/(p1|p2)\/head-([A-Za-z]+)-spin\.webp$/);
  if (!m) continue;
  const img = new Image();
  img.src = url;
  SPIN[m[1]][m[2]] = img;
}

const SPIN_FRAMES = 8;

/** Frame index from the engine's continuous drillAngle (radians). */
function spinFrame(drillAngle) {
  const t = ((drillAngle / (Math.PI * 2)) % 1 + 1) % 1;
  return Math.floor(t * SPIN_FRAMES) % SPIN_FRAMES;
}

export function spritesReady() {
  return totalCount > 0 && readyCount === totalCount;
}

function ok(img) {
  return img && img.complete && img.naturalWidth > 0;
}

function pick(slot, variant, side) {
  const bySlot = PARTS[slot];
  if (!bySlot) return null;
  const entry = bySlot[variant] || bySlot.standard || bySlot.normal || bySlot.hand;
  if (!entry) return null;
  const wanted = side > 0 ? entry.p2 : entry.p1;
  return ok(wanted) ? wanted : (ok(entry.p1) ? entry.p1 : null);
}

/**
 * Skeleton in robot-box space. Each socket: center x (fraction of w), a joint
 * line y (fraction of h), max size (fractions of w/h), and the anchor edge that
 * sits on the joint line. Differently-sized variants still meet at their seam.
 */
/**
 * Sockets are derived from the torso art's own ball joints, measured off
 * torso-standard.webp (tools/robot/tighten_parts.py keeps every sprite cropped
 * tight to its content, so these fractions mean what they say — before that the
 * arm sat in the right 40% of a mostly-empty canvas and no socket value could
 * make it meet the shoulder).
 *
 * Measured on the torso image: shoulders at x 0.086 / 0.882, y 0.22; hips at
 * x 0.230 / 0.749, y 0.93. Converted into robot-box fractions below and
 * symmetrised about the centre line.
 */
const SK = {
  head:  { x: 0.50,  y: 0.405, mw: 1.30, mh: 0.62,  anchor: "bottom" },
  // Torso rides high enough to leave the legs visible: at y 0.64 its bottom edge
  // reached 0.91 of the box and swallowed all but ~10px of leg. Head and arms
  // shift up with it so the neck and shoulder joints stay closed.
  torso: { x: 0.50,  y: 0.585, mw: 1.24, mh: 0.54,  anchor: "center" },
  // y places the arm's own shoulder ball (at 0.268 of the sprite) on the torso's
  // shoulder joint (0.489 of the robot box). x sits them beside the body rather
  // than behind it — the torso renders nearly the full box width, so a socket at
  // the painted joint (0.112) buries the whole arm; the procedural robot this
  // replaced also hung its arms 4px outside the box (ARM_OVERHANG).
  armL:  { x: 0.045, y: 0.356, mw: 0.30, mh: 0.290, anchor: "top" },
  armR:  { x: 0.955, y: 0.356, mw: 0.30, mh: 0.290, anchor: "top" },
  // Legs are anchored at the SOLE and fitted by width. The three leg sprites have
  // very different heights (288 / 370 / 404 px), so a height fit rendered the
  // taller power+rocket legs ~40% thinner than normal; fitting by width keeps
  // limb thickness consistent and lets the extra length disappear behind the
  // torso, while the foot always lands exactly on the floor line.
  legL:  { x: 0.230, y: 1.0, mw: 0.226, mh: 0.60, anchor: "bottom" },
  legR:  { x: 0.770, y: 1.0, mw: 0.226, mh: 0.60, anchor: "bottom" },
  weapon:{ x: 0.86,  y: 0.74,  mw: 0.42, mh: 0.42,  anchor: "center" },
};
/**
 * Per-variant seat nudges: [dxFracW, dyFracH, scale].
 *
 * dx is expressed in the sprite's OWN (unmirrored) frame and is flipped along
 * with the art — see drawPiece. That matters because the torso is painted in
 * three-quarter view with its neck socket left of centre, so the socket lands
 * on opposite sides of the body midline for a robot facing right (art
 * mirrored) versus one facing left. A single screen-space dx seats the head on
 * one team and pushes it off the neck on the other.
 */
const OVERRIDE = {
  "head:magnet": [-0.06, 0.03, 0.7],
  // Full-drill head: tall cone, so scale down to sit level with the other heads.
  "head:drill": [-0.06, 0.03, 0.85],
};
// Legs tuck behind the torso; arms sit in FRONT of it so the shoulder ball reads
// as attached and the hand isn't swallowed by the torso silhouette.
const Z = ["legL", "legR", "torso", "armL", "armR", "head", "weapon"];

function drawPiece(ctx, src, sk, r, ov, mirror, frames = 1, frameIdx = 0) {
  const fullW = src.naturalWidth || src.width;
  const iw = fullW / frames;                  // one frame's width for a strip
  const ih = src.naturalHeight || src.height;
  const sx = frameIdx * iw;
  let mw = sk.mw * r.w, mh = sk.mh * r.h;
  let cx = r.x + sk.x * r.w;
  let jointY = r.y + sk.y * r.h;
  if (ov) {
    // dx lives in the sprite's own frame, so it flips with the art.
    cx += (mirror ? -ov[0] : ov[0]) * r.w;
    jointY += ov[1] * r.h;
    mw *= ov[2];
    mh *= ov[2];
  }
  const scale = Math.min(mw / iw, mh / ih);
  const w = iw * scale, h = ih * scale;
  const x = cx - w / 2;
  let y;
  if (sk.anchor === "top") y = jointY;
  else if (sk.anchor === "bottom") y = jointY - h;
  else y = jointY - h / 2;

  if (mirror) {
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, 0, iw, ih, -(x - cx) - w, y, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(src, sx, 0, iw, ih, x, y, w, h);
  }
}

function drawShadow(ctx, r, floorY) {
  const cx = r.x + r.w / 2;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  const shW = r.w * (0.55 + 0.28 * (r.onGround ? 1 : 0.4));
  ctx.ellipse(cx, floorY + 6, shW, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTeamGlow(ctx, r) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * 0.5;
  const glow = r.side < 0 ? GLOW.p1 : GLOW.p2;
  ctx.save();
  ctx.globalAlpha = 0.26;
  const g = ctx.createRadialGradient(cx, cy - 16, 8, cx, cy - 16, 74);
  g.addColorStop(0, glow);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 12, 44, 54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCorePulse(ctx, r) {
  // Additive breathing glow over the (always-centered) chest core.
  const t = 0.5 - 0.5 * Math.cos(performance.now() / 620);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * 0.62;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.16 + 0.30 * t;
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r.w * 0.36);
  g.addColorStop(0, "rgba(150,240,255,0.9)");
  g.addColorStop(1, "rgba(150,240,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r.w * 0.16, r.h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Game slot key -> sprite slot. armType splits: bare hand vs. a held weapon. */
function slotFor(slotKey, typeId) {
  if (slotKey === "headType") return "head";
  if (slotKey === "torsoType") return "torso";
  if (slotKey === "legType") return "leg";
  // The weapon slot always shows prop art, including the starter's orb.
  if (slotKey === "weaponType") return "weapon";
  if (slotKey === "armType" || slotKey === "arms") {
    return typeId && typeId !== "hand" ? "weapon" : "arm";
  }
  return null;
}

/**
 * Single-part thumbnail for the HUD loadout chips, the lottery reels, and the
 * customize screen — so previews use the same art as the robots on court.
 * Returns false when the part isn't available, letting callers fall back.
 */
export function drawSpritePartPreview(ctx, slotKey, typeId, cx, cy, maxSize, side = -1) {
  const slot = slotFor(slotKey, typeId);
  if (!slot) return false;
  const src = pick(slot, typeId, side);
  if (!src) return false;
  const iw = src.naturalWidth || src.width;
  const ih = src.naturalHeight || src.height;
  const scale = Math.min(maxSize * 0.82 / iw, maxSize * 0.82 / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(src, cx - w / 2, cy - h / 2, w, h);
  return true;
}

/**
 * Which pieces mirror, and why.
 *
 * The painted parts are a three-quarter view facing LEFT, so a robot facing
 * right has to mirror the DIRECTIONAL pieces (head, torso, held weapon).
 *
 * Arms and legs are different: their sockets sit symmetric about the body
 * centre and the two sides are mirror images of one another, so the pair reads
 * identically whichever way the robot faces. Their mirror state is therefore
 * FIXED per side — tying it to facing (as this used to) flipped both limbs on
 * every turn, which is why legs looked right facing right and wrong facing left.
 */
const LIMB_FLIP = { armL: false, armR: true, legL: true, legR: false };

export function drawSpriteRobot(ctx, r, floorY) {
  const bodyFlip = !(r.facing < 0); // mirror the left-facing art to face right
  const side = r.side;
  const srcs = {
    legL: pick("leg", r.legType, side),
    legR: pick("leg", r.legType, side),
    armL: pick("arm", "hand", side),
    armR: pick("arm", "hand", side),
    torso: pick("torso", r.torsoType, side),
    head: pick("head", r.headType, side),
    weapon: r.armType && r.armType !== "hand" ? pick("weapon", r.armType, side) : null,
  };

  ctx.save();
  const sq = r.squash || 0;
  const cx = r.x + r.w / 2;
  const feet = r.y + r.h;
  ctx.translate(cx, feet);
  ctx.scale(1 + sq * 0.18, 1 - sq * 0.18);
  ctx.translate(-cx, -feet);

  drawShadow(ctx, r, floorY);
  drawTeamGlow(ctx, r);

  const team = side > 0 ? "p2" : "p1";
  for (const slot of Z) {
    let src = srcs[slot];
    if (!src) continue;
    const base = slot.replace(/[LR]$/, "");
    const variant =
      base === "leg" ? r.legType :
      base === "torso" ? r.torsoType :
      base === "head" ? r.headType :
      base === "weapon" ? r.armType : "hand";
    const ov = OVERRIDE[`${base}:${variant}`];
    const flip = slot in LIMB_FLIP ? LIMB_FLIP[slot] : bodyFlip;
    // The held weapon is carried toward the opponent, so its socket mirrors with
    // facing — otherwise a left-facing robot holds it behind its back.
    const sk = slot === "weapon" && r.facing < 0
      ? { ...SK[slot], x: 1 - SK[slot].x }
      : SK[slot];

    // Mid-blink, swap the head for the matching frame of its blink strip.
    // Otherwise a drill head plays its spin strip from drillAngle.
    let frames = 1, frameIdx = 0;
    if (base === "head" && r.eyeBlink > 0) {
      const strip = BLINK[team][r.headType];
      if (ok(strip)) {
        src = strip;
        frames = BLINK_FRAMES;
        frameIdx = blinkFrame(r.eyeBlink);
      }
    } else if (base === "head" && r.headType === "drill") {
      const strip = SPIN[team].drill;
      if (ok(strip)) {
        src = strip;
        frames = SPIN_FRAMES;
        frameIdx = spinFrame(r.drillAngle || 0);
      }
    }
    drawPiece(ctx, src, sk, r, ov, flip, frames, frameIdx);
  }

  drawCorePulse(ctx, r);
  ctx.restore();
}
