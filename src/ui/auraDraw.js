/**
 * Leaderboard auras — the glow a robot wears for having placed on a board.
 *
 * Entirely procedural, with no art of its own. That is not a shortcut: the two
 * team colourways are baked into every sprite by tools/robot/gen_p2_set.py,
 * which only re-shifts the crimson-red family, so a painted aura would need a
 * hand-authored P2 variant to avoid rendering grey for team 2. Deriving the
 * colour from `r.side` instead means both teams work for free and a new tier
 * costs one function.
 *
 * Drawn *behind* the robot, in the same pass as the contact shadow and team
 * glow, so it never obscures the parts or the ball.
 *
 * Daily tiers are static; weekly tiers animate. Anything that moves is gated on
 * `reducedMotion` and falls back to its still form — an aura is decoration, and
 * nobody should have to choose between a reward and a comfortable screen.
 */
import { reducedMotion } from "../data/accessibility.js";
import { spriteFor } from "../data/cosmetics.js";

/** COLORS.accent as an rgb triple — the top tier alone breaks team colour. */
const GOLD = "255,213,74";

/** Where the glow centres on the body, measured up from the soles. */
const BODY_CY = 58;

function auraColors(r) {
  return r.side < 0
    ? { core: "255,140,120", edge: "255,90,95" }
    : { core: "150,220,255", edge: "41,182,246" };
}

/** Soft radial body glow — the shared base every tier builds on. */
function halo(ctx, cx, cy, radius, rgb, alpha) {
  const g = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.45})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 0.82, radius, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Flat ellipse hugging the floor, read as "standing in something". */
function groundRing(ctx, cx, floorY, rx, rgb, alpha, lineWidth = 3) {
  ctx.save();
  ctx.strokeStyle = `rgba(${rgb},${alpha})`;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.ellipse(cx, floorY - 2, rx, rx * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Deterministic per-index offsets. Orbiting motes need to look scattered but
 * must not jitter between frames, so this stands in for a stored particle list.
 */
function scatter(i) {
  return ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
}

function motes(ctx, cx, cy, radius, rgb, t, count) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const phase = scatter(i);
    const angle = phase * Math.PI * 2 + t * (0.6 + phase * 0.5);
    const dist = radius * (0.6 + scatter(i + 99) * 0.45);
    const x = cx + Math.cos(angle) * dist * 0.85;
    const y = cy + Math.sin(angle) * dist * 0.6;
    ctx.globalAlpha = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + i));
    ctx.fillStyle = `rgba(${rgb},0.9)`;
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + scatter(i + 7) * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function tendrils(ctx, cx, cy, radius, rgb, t) {
  ctx.save();
  ctx.strokeStyle = `rgba(${rgb},0.55)`;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) {
    const base = scatter(i) * Math.PI * 2 + t * 1.2;
    // Flicker on a per-arc cadence so the set never pulses in unison.
    ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(t * 6 + i * 1.7));
    ctx.beginPath();
    for (let seg = 0; seg <= 5; seg++) {
      const frac = seg / 5;
      const wobble = Math.sin(t * 9 + i * 3 + seg) * 5 * frac;
      const angle = base + frac * 0.9;
      const dist = radius * (0.35 + frac * 0.7);
      const x = cx + Math.cos(angle) * dist * 0.8 + wobble;
      const y = cy + Math.sin(angle) * dist * 0.6;
      if (seg === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A rotating crown of short ticks around the halo's edge.
 *
 * Ticks rather than full-length spokes from the body centre: spokes long enough
 * to read as rays also cross the robot and punch through the floor, which looks
 * like broken sprite geometry rather than a glow. Keeping them out at the rim
 * says "corona" and leaves the silhouette clean.
 */
function rays(ctx, cx, cy, radius, rgb, t) {
  const inner = radius * 0.82;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.3);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = `rgba(${rgb},1)`;
  ctx.lineCap = "round";
  const count = 16;
  for (let i = 0; i < count; i++) {
    ctx.rotate((Math.PI * 2) / count);
    // Alternating lengths so the crown has texture at a glance.
    const outer = radius * (i % 2 === 0 ? 1 : 0.92);
    ctx.lineWidth = i % 2 === 0 ? 2.4 : 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -inner);
    ctx.lineTo(0, -outer);
    ctx.stroke();
  }
  ctx.restore();
}

function embers(ctx, cx, cy, radius, rgb, t) {
  ctx.save();
  for (let i = 0; i < 10; i++) {
    const phase = scatter(i);
    // Rise and wrap, so a sparse set reads as a continuous updraft.
    const rise = (t * (0.25 + phase * 0.3) + phase) % 1;
    const x = cx + Math.sin(phase * 6.28 + t) * radius * 0.55;
    const y = cy + radius * 0.75 - rise * radius * 1.9;
    ctx.globalAlpha = 0.7 * (1 - rise);
    ctx.fillStyle = `rgba(${rgb},1)`;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + phase * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw the aura equipped in `r.cosmetics`, behind the robot.
 *
 * Call in the robot's own space with `floorY` where the soles land — the same
 * contract as drawShadow, which it sits next to in both renderers.
 */
export function drawAura(ctx, r, floorY) {
  const variant = spriteFor(r?.cosmetics, "aura");
  if (!variant || variant === "none") return;

  const { core, edge } = auraColors(r);
  const cx = r.x + r.w / 2;
  const cy = floorY - BODY_CY;
  const t = reducedMotion ? 0 : performance.now() * 0.001;

  ctx.save();
  switch (variant) {
    // ---- daily: simple, static -------------------------------------------
    case "ember":
      halo(ctx, cx, cy, 62, edge, 0.2);
      break;
    case "halo":
      halo(ctx, cx, cy, 70, edge, 0.26);
      groundRing(ctx, cx, floorY, 34, edge, 0.4);
      break;
    case "corona": {
      // The one daily tier that moves, and only as a slow breath.
      const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 1.4);
      halo(ctx, cx, cy, 78 * pulse, core, 0.3);
      halo(ctx, cx, cy, 58, edge, 0.22);
      groundRing(ctx, cx, floorY, 38, edge, 0.45);
      break;
    }

    // ---- weekly: layered, animated ----------------------------------------
    case "motes":
      halo(ctx, cx, cy, 68, edge, 0.22);
      motes(ctx, cx, cy, 62, core, t, 9);
      break;
    case "tempest":
      halo(ctx, cx, cy, 74, edge, 0.24);
      if (reducedMotion) groundRing(ctx, cx, floorY, 40, core, 0.5);
      else tendrils(ctx, cx, cy, 70, core, t);
      groundRing(ctx, cx, floorY, 40, edge, 0.4);
      break;
    case "sovereign": {
      const pulse = reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(t * 1.8);
      // Gold rather than team colour: the rarest reward in the game should read
      // as itself at a glance, not as "red player with a big glow".
      rays(ctx, cx, cy, 72, GOLD, t);
      halo(ctx, cx, cy, 80 * pulse, core, 0.28);
      halo(ctx, cx, cy, 60, edge, 0.24);
      if (!reducedMotion) embers(ctx, cx, cy, 66, GOLD, t);
      groundRing(ctx, cx, floorY, 44, GOLD, 0.55, 4);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
