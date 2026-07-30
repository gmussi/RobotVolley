/**
 * Leaderboard auras — the glow a robot wears for having placed on a board.
 *
 * Entirely procedural, with no art of its own — a painted aura would need a
 * hand-authored P2 variant to avoid rendering grey for team 2, so every shape
 * here is drawn from rgb triples instead. Colour now marks *which board*
 * earned the aura rather than which team is wearing it: daily tiers are red,
 * weekly tiers are gold, on both sides of the net.
 *
 * Drawn *behind* the robot, in the same pass as the contact shadow and team
 * glow, so it never obscures the parts or the ball.
 *
 * Each daily tier mirrors the pattern of its weekly counterpart at the same
 * rank threshold (top 10 / top 3 / top 1) — same shapes, red instead of gold —
 * so the two boards read as one continuum of reward rather than two designs.
 * Anything that moves is gated on `reducedMotion` and falls back to its still
 * form — an aura is decoration, and nobody should have to choose between a
 * reward and a comfortable screen.
 */
import { reducedMotion } from "../data/accessibility.js";
import { spriteFor } from "../data/cosmetics.js";

/** Palettes keyed by board — daily red, weekly gold — independent of team side. */
const PALETTE = {
  daily: { core: "255,120,90", edge: "255,70,55", accent: "255,90,60" },
  weekly: { core: "255,213,74", edge: "255,193,7", accent: "255,213,74" },
};

/** Where the glow centres on the body, measured up from the soles. */
const BODY_CY = 58;

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

/** Top-10 tier: a soft halo with orbiting motes — same shape for both boards. */
function motesShape(ctx, cx, cy, floorY, t, { core, edge }) {
  halo(ctx, cx, cy, 68, edge, 0.22);
  motes(ctx, cx, cy, 62, core, t, 9);
}

/** Top-3 tier: a wider halo plus whipping tendrils (or a still ring when reduced). */
function tempestShape(ctx, cx, cy, floorY, t, { core, edge }) {
  halo(ctx, cx, cy, 74, edge, 0.24);
  if (reducedMotion) groundRing(ctx, cx, floorY, 40, core, 0.5);
  else tendrils(ctx, cx, cy, 70, core, t);
  groundRing(ctx, cx, floorY, 40, edge, 0.4);
}

/** Top-1 tier: rotating ray crown, breathing double halo, and rising embers. */
function sovereignShape(ctx, cx, cy, floorY, t, { core, edge, accent }) {
  const pulse = reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(t * 1.8);
  rays(ctx, cx, cy, 72, accent, t);
  halo(ctx, cx, cy, 80 * pulse, core, 0.28);
  halo(ctx, cx, cy, 60, edge, 0.24);
  if (!reducedMotion) embers(ctx, cx, cy, 66, accent, t);
  groundRing(ctx, cx, floorY, 44, accent, 0.55, 4);
}

/** Every aura variant, mapped to its rank-tier shape and its board's palette. */
const VARIANTS = {
  ember: { shape: motesShape, board: "daily" },
  halo: { shape: tempestShape, board: "daily" },
  corona: { shape: sovereignShape, board: "daily" },
  motes: { shape: motesShape, board: "weekly" },
  tempest: { shape: tempestShape, board: "weekly" },
  sovereign: { shape: sovereignShape, board: "weekly" },
};

/**
 * Draw the aura equipped in `r.cosmetics`, behind the robot.
 *
 * Call in the robot's own space with `floorY` where the soles land — the same
 * contract as drawShadow, which it sits next to in both renderers.
 */
export function drawAura(ctx, r, floorY) {
  const variant = spriteFor(r?.cosmetics, "aura");
  const entry = variant && VARIANTS[variant];
  if (!entry) return;

  const cx = r.x + r.w / 2;
  const cy = floorY - BODY_CY;
  const t = reducedMotion ? 0 : performance.now() * 0.001;

  ctx.save();
  entry.shape(ctx, cx, cy, floorY, t, PALETTE[entry.board]);
  ctx.restore();
}
