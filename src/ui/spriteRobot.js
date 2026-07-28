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
import { drawTankBody, tankBodyRect, tankRoll, tankRollState } from "./tankChassis.js";
import ROLL from "../assets/robot/anim/tank-roll.json";
import { spriteFor } from "../data/cosmetics.js";

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

// Rolling tread strips for the tank body: the pads travel around the belt loop
// (see tools/robot/gen_tank_roll.py). The road wheels are not baked in — they
// turn many pad pitches per revolution, so they could not share this loop, and
// drawTankWheels spins them over the top instead.
const rollUrls = import.meta.glob("../assets/robot/anim/*/leg-tank-roll.webp", {
  eager: true,
  import: "default",
});
const ROLL_ART = {};
for (const [path, url] of Object.entries(rollUrls)) {
  const m = path.match(/anim\/(p1|p2)\/leg-tank-roll\.webp$/);
  if (!m) continue;
  const img = new Image();
  img.src = url;
  ROLL_ART[m[1]] = img;
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
  // y seats the arm's top socket nub (~0.06 of the sprite) in the torso's
  // shoulder ball (~0.434 of the robot box). x hangs them beside the body —
  // the torso paints nearly full-box width, so a socket at the painted joint
  // (~0.097) buries the limb; nudge x inward if the nub still sits outside.
  armL:  { x: 0.045, y: 0.413, mw: 0.36, mh: 0.348, anchor: "top" },
  armR:  { x: 0.955, y: 0.413, mw: 0.36, mh: 0.348, anchor: "top" },
  // Legs are anchored at the SOLE and fitted by width. Variants differ in height
  // (short foot / tall spring / compact rocket), so a height fit would thin the
  // taller ones; fitting by width keeps limb thickness consistent and lets extra
  // length tuck behind the torso, while the sole always lands on the floor line.
  legL:  { x: 0.230, y: 1.0, mw: 0.226, mh: 0.60, anchor: "bottom" },
  legR:  { x: 0.770, y: 1.0, mw: 0.226, mh: 0.60, anchor: "bottom" },
  // Held prop — forward mitt (near armR). Mirrored with facing. Visual only.
  weapon:{ x: 0.94,  y: 0.74,  mw: 0.38, mh: 0.38,  anchor: "center" },
};
/**
 * Per-variant seat nudges: [dxFracW, dyFracH, scale, rotDeg?].
 *
 * dx is expressed in the sprite's OWN (unmirrored) frame and is flipped along
 * with the art — see drawPiece. That matters because the torso is painted in
 * three-quarter view with its neck socket left of centre, so the socket lands
 * on opposite sides of the body midline for a robot facing right (art
 * mirrored) versus one facing left. A single screen-space dx seats the head on
 * one team and pushes it off the neck on the other.
 *
 * Axe art's grip sits bottom-left of the canvas — without a seat nudge the
 * bounding-box centre lands in the mitt and the handle hangs at the hip.
 */
const OVERRIDE = {
  "head:magnet": [-0.06, 0.03, 0.7],
  // Full-drill head: tall cone, so scale down to sit level with the other heads.
  "head:drill": [-0.06, 0.03, 0.85],
  "weapon:axe": [0.20, -0.1, 1.0, 10],
  // Grip is bottom-left of the art; seat that in the mitt (not the barrel centre).
  // +45° clockwise so the handle lines up with the forward hand.
  "weapon:portalGun": [0.19, -0.13, 0.9, 45],
  "weapon:ninjaStar": [0.15, -0.09, 0.7, 25],
};
// Legs tuck behind the torso; arms in front of it; held weapon paints over the
// forward hand so the grip reads as sitting in the palm (not hidden behind it).
const Z = ["legL", "legR", "torso", "armL", "armR", "weapon", "head"];

/**
 * Power-spring vertical scale. Only while rising (vy < 0) — a strong
 * stretch/contract pulse; idle on the way down and on the ground.
 */
function powerLegVScale(r) {
  if (r.legType !== "power" || r.onGround || !(r.vy < 0)) return 1;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 55);
  return 0.65 + pulse * 1.05; // ~0.65 ↔ 1.70
}

/**
 * @param {number} vScale  vertical scale multiplier
 * @param {"sole"|"hip"} vPivot  "hip" keeps the rest top fixed and grows the
 *   sole downward (visible spring stretch); "sole" keeps the sole planted.
 */
function drawPiece(ctx, src, sk, r, ov, mirror, frames = 1, frameIdx = 0, vScale = 1, vPivot = "sole") {
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
  const baseH = ih * scale;
  const w = iw * scale, h = baseH * vScale;
  const x = cx - w / 2;
  let y;
  if (sk.anchor === "top") y = jointY;
  else if (sk.anchor === "bottom") {
    // Hip pivot: top stays where the resting spring top was; sole extends down.
    y = vPivot === "hip" ? jointY - baseH : jointY - h;
  } else y = jointY - h / 2;

  const rotRad = ov && ov[3] != null ? (ov[3] * Math.PI) / 180 : 0;
  if (rotRad !== 0) {
    // Rotate around the socket centre. The mirror (ctx.scale) is applied
    // around the rotated image, not the other way round, so the tilt itself
    // mirrors along with the art instead of being negated in place —
    // otherwise the muzzle swings to the wrong side when mirrored.
    const pivotY =
      sk.anchor === "top" ? jointY + h / 2 :
      sk.anchor === "bottom" ? jointY - h / 2 :
      jointY;
    ctx.save();
    ctx.translate(cx, pivotY);
    if (mirror) ctx.scale(-1, 1);
    ctx.rotate(rotRad);
    ctx.drawImage(src, sx, 0, iw, ih, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else if (mirror) {
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, 0, iw, ih, -(x - cx) - w, y, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(src, sx, 0, iw, ih, x, y, w, h);
  }
}

/** One-shot thruster burst under rocket soles while flapFx is active (up press). */
function drawRocketFlames(ctx, r) {
  if (r.legType !== "rocket" || !(r.flapFx > 0)) return;
  // Ease out over the flapFx window so it fires once and dies.
  const t = Math.min(1, r.flapFx / 0.18);
  const strength = t * t;
  const now = performance.now() / 1000;
  const flicker = 0.85 + 0.15 * Math.sin(now * 48);

  ctx.save();
  for (const sk of [SK.legL, SK.legR]) {
    const fx = r.x + sk.x * r.w;
    const fy = r.y + r.h;
    const phase = Math.sin(now * 60 + sk.x * 9);
    const h = (18 + 10 * strength + 4 * phase) * flicker * strength;
    const w = (9 + 6 * strength) * (0.9 + 0.1 * phase);

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.7 * strength;
    ctx.fillStyle = "#ff6a20";
    ctx.beginPath();
    ctx.moveTo(fx - w, fy);
    ctx.lineTo(fx + w, fy);
    ctx.lineTo(fx + phase * 1.5, fy + h);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.9 * strength;
    ctx.fillStyle = "#ffb347";
    ctx.beginPath();
    ctx.moveTo(fx - w * 0.55, fy);
    ctx.lineTo(fx + w * 0.55, fy);
    ctx.lineTo(fx - phase, fy + h * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = strength;
    ctx.fillStyle = "#fff3c0";
    ctx.beginPath();
    ctx.moveTo(fx - w * 0.28, fy);
    ctx.lineTo(fx + w * 0.28, fy);
    ctx.lineTo(fx + phase * 0.5, fy + h * 0.42);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
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
 * The painted body parts are a three-quarter view facing LEFT, so a robot
 * facing right has to mirror the DIRECTIONAL pieces (head, torso).
 *
 * Held weapons are painted facing RIGHT (blade/barrel out), so they take the
 * opposite mirror of the body — otherwise they point into the torso.
 *
 * Arms and legs are different: their sockets sit symmetric about the body
 * centre and the two sides are mirror images of one another, so the pair reads
 * identically whichever way the robot faces. Their mirror state is therefore
 * FIXED per side — tying it to facing (as this used to) flipped both limbs on
 * every turn, which is why legs looked right facing right and wrong facing left.
 */
const LIMB_FLIP = { armL: false, armR: true, legL: true, legR: false };

/**
 * Spin the road wheels in place over the baked body.
 *
 * The 3/4 view foreshortens each wheel into an ellipse, so a plain rotation
 * would sweep the art outside its own rim. Squashing to a circle, turning, and
 * unsquashing is the same as rotating the wheel on its real axle: the matrix
 * below is that sandwich, and it leaves the ellipse exactly where it was.
 */
function drawTankWheels(ctx, src, sx0, box, angle) {
  const iw = src.naturalWidth / ROLL.frames;
  const ih = src.naturalHeight;
  for (const wheel of ROLL.wheels) {
    const cx = box.x + wheel.x * box.w;
    const cy = box.y + wheel.y * box.h;
    const rx = wheel.rx * box.w;
    const ry = wheel.ry * box.h;
    const k = ry / rx;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.transform(cos, k * sin, -sin / k, cos, 0, 0);
    ctx.drawImage(src,
      sx0 + (wheel.x - wheel.rx) * iw, (wheel.y - wheel.ry) * ih,
      wheel.rx * 2 * iw, wheel.ry * 2 * ih,
      -rx, -ry, rx * 2, ry * 2);
    ctx.restore();
  }
}

function drawTankBodySprite(ctx, r, side, mirror) {
  const team = side > 0 ? "p2" : "p1";
  const roll = ROLL_ART[team];
  const still = pick("leg", "tank", side);
  const src = ok(roll) ? roll : still;
  if (!ok(src)) {
    const legCol = side > 0 ? "#29b6f6" : "#ff5a5f";
    drawTankBody(ctx, r, legCol, side > 0 ? GLOW.p2 : GLOW.p1, tankRoll(r));
    return;
  }

  const frameW = ok(roll) ? src.naturalWidth / ROLL.frames : src.naturalWidth;
  const box = tankBodyRect(r, frameW / src.naturalHeight);
  const dist = tankRoll(r);
  const { frame, spin } = tankRollState(dist, box, ROLL);

  ctx.save();
  if (mirror) {
    // Same pivot as drawPiece: reflect about the robot's centre line so the
    // hull turns with the head instead of sliding sideways. The wheels ride
    // inside this transform, so their positions mirror for free.
    const cx = r.x + r.w / 2;
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
  }
  const sx0 = ok(roll) ? frame * frameW : 0;
  ctx.drawImage(src, sx0, 0, frameW, src.naturalHeight, box.x, box.y, box.w, box.h);
  if (ok(roll) && ROLL.wheels.length) {
    // Mirroring reverses the apparent spin, so flip the angle back.
    drawTankWheels(ctx, src, sx0, box, mirror ? -spin : spin);
  }
  ctx.restore();
}

/**
 * Which torso sprite to paint.
 *
 * The torso is the one body slot with no gameplay behind it — TORSO_TYPES has
 * only "standard" — which is exactly why it carries the cosmetic. When a
 * cosmetic is equipped it names the sprite; otherwise we fall back to the
 * gameplay type, so robots with no profile (local play, the attract demo) look
 * exactly as they did before.
 */
function torsoVariant(r) {
  return spriteFor(r.cosmetics, "torso") ?? r.torsoType;
}

export function drawSpriteRobot(ctx, r, floorY) {
  const bodyFlip = !(r.facing < 0); // mirror the left-facing art to face right
  const side = r.side;
  // Thrown props leave the hand (projectile / portal); orb stay-in-hand attacks
  // keep their emblem. Match robotDraw's propGone so sprites don't double up.
  const propGone = r.attack && (r.attack.kind === "projectile" || r.attack.kind === "portal");
  const isTank = r.legType === "tank";
  const srcs = {
    legL: isTank ? null : pick("leg", r.legType, side),
    legR: isTank ? null : pick("leg", r.legType, side),
    armL: pick("arm", "hand", side),
    armR: pick("arm", "hand", side),
    torso: isTank ? null : pick("torso", torsoVariant(r), side),
    head: pick("head", r.headType, side),
    weapon: !propGone && r.armType && r.armType !== "hand"
      ? pick("weapon", r.armType, side) : null,
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
  if (isTank) drawTankBodySprite(ctx, r, side, bodyFlip);
  for (const slot of Z) {
    if (isTank && (slot === "legL" || slot === "legR" || slot === "torso")) continue;
    let src = srcs[slot];
    if (!src) continue;
    const base = slot.replace(/[LR]$/, "");
    const variant =
      base === "leg" ? r.legType :
      base === "torso" ? torsoVariant(r) :
      base === "head" ? r.headType :
      base === "weapon" ? r.armType : "hand";
    const ov = OVERRIDE[`${base}:${variant}`];
    // Weapons face the opposite way of body art, so invert their flip.
    const flip = slot === "weapon" ? !bodyFlip
      : slot in LIMB_FLIP ? LIMB_FLIP[slot]
      : bodyFlip;
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
    const vScale = base === "leg" ? powerLegVScale(r) : 1;
    // Power spring grows from the hip so stretch is visible below the torso.
    const vPivot = base === "leg" && r.legType === "power" && vScale !== 1 ? "hip" : "sole";
    drawPiece(ctx, src, sk, r, ov, flip, frames, frameIdx, vScale, vPivot);
  }

  drawRocketFlames(ctx, r);
  if (!isTank) drawCorePulse(ctx, r);
  ctx.restore();
}
