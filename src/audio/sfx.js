/**
 * SFX playback — procedural buffers available immediately; file assets upgrade in background.
 */
import { makeAllSfxBuffers } from "./procedural.js";
import { decodeAsset } from "./loadBuffer.js";

const COOLDOWNS = {
  ui_navigate: 0.04,
  ui_confirm: 0.08,
  ball_hit: 0.05,
  ball_net: 0.06,
  ball_wall: 0.06,
  serve_launch: 0.15,
  point_score: 0.5,
  match_win: 1.0,
  smash: 0.1,
  deflect: 0.08,
  attack_start: 0.12,
  lottery_tick: 0.03,
  lottery_land: 0.3,
  magnet_catch: 0.15,
  magnet_release: 0.12,
  rocket_flap: 0.12,
  drill_shove: 0.1,
};

const MAX_INSTANCES = 6;

/** @type {Record<string, AudioBuffer>} */
let buffers = {};
/** @type {Record<string, number>} */
const lastPlayed = {};
/** @type {number} */
let activeCount = 0;

/**
 * @param {AudioContext} ctx
 * @param {GainNode} out
 * @param {Record<string, Partial<Record<string, string>>>} [fileUrls]
 */
export function initSfx(ctx, out, fileUrls = {}) {
  buffers = makeAllSfxBuffers(ctx);
  loadSfxAssets(ctx, fileUrls);
  return out;
}

function loadSfxAssets(ctx, fileUrls) {
  for (const [id, urls] of Object.entries(fileUrls)) {
    decodeAsset(ctx, urls).then((buf) => {
      if (buf) buffers[id] = buf;
    }).catch(() => {});
  }
}

/**
 * @param {string} id
 * @param {{ pitch?: number, volume?: number }} [opts]
 * @param {AudioContext} ctx
 * @param {GainNode} sfxGain
 */
export function playSfx(id, opts, ctx, sfxGain) {
  const buf = buffers[id];
  if (!buf || !ctx || !sfxGain) return;

  const now = ctx.currentTime;
  const cd = COOLDOWNS[id] ?? 0.05;
  if (now - (lastPlayed[id] ?? 0) < cd) return;
  if (activeCount >= MAX_INSTANCES) return;

  lastPlayed[id] = now;
  activeCount++;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = opts?.pitch ?? 1;

  const g = ctx.createGain();
  g.gain.value = opts?.volume ?? 1;
  src.connect(g);
  g.connect(sfxGain);

  src.onended = () => { activeCount = Math.max(0, activeCount - 1); };
  src.start(now);
}
