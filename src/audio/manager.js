/**
 * Audio manager — context lifecycle, unlock, event drain, music orchestration.
 */
import { initSfx, playSfx } from "./sfx.js";
import {
  initMusic, onStateChange as musicStateChange, updateIntensity,
  startMusicForState, setMusicLevel, primeMatchMedia,
} from "./music.js";
import { mapEngineEvent, uiNavigate, uiConfirm, lotteryTick } from "./events.js";
import { centerOptionIndex } from "../ui/lottery.js";
import {
  state,
  LOTTERY_SPIN_DURATION, LOTTERY_TOTAL_DURATION, lotteryResults, lotteryTimer,
} from "../engine/game.js";

const MUSIC_VOL_KEY = "robotvolley_music_vol";
const SFX_VOL_KEY = "robotvolley_sfx_vol";

const BASE_MUSIC_GAIN = 0.55;
const BASE_SFX_GAIN = 0.85;

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let masterGain = null;
/** @type {GainNode|null} */
let sfxGain = null;
/** @type {GainNode|null} */
let musicGainNode = null;

let unlocked = false;
let silentPrimed = false;
let musicVolume = 1;
let sfxVolume = 1;

/** Sync bootstrap — procedural SFX/music ready instantly; file assets load in background. */
export function initAudio() {
  musicVolume = loadVolume(MUSIC_VOL_KEY, 1);
  sfxVolume = loadVolume(SFX_VOL_KEY, 1);

  ctx = new AudioContext();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  sfxGain = ctx.createGain();
  sfxGain.connect(masterGain);

  musicGainNode = ctx.createGain();
  musicGainNode.connect(masterGain);

  applyVolumes();

  const sfxFiles = loadAssetUrls(
    import.meta.glob("../assets/audio/sfx_*.wav", { eager: true, import: "default" }),
    import.meta.glob("../assets/audio/sfx_*.ogg", { eager: true, import: "default" }),
    import.meta.glob("../assets/audio/sfx_*.mp3", { eager: true, import: "default" }),
  );
  const musicFiles = loadAssetUrls(
    import.meta.glob("../assets/audio/music_*.wav", { eager: true, import: "default" }),
    import.meta.glob("../assets/audio/music_*.ogg", { eager: true, import: "default" }),
    import.meta.glob("../assets/audio/music_*.mp3", { eager: true, import: "default" }),
  );

  initSfx(ctx, sfxGain, sfxFiles);
  initMusic(ctx, musicGainNode, musicFiles);
  bindUnlock();
}

/** @param {Record<string, unknown>[]} globs */
function loadAssetUrls(...globs) {
  /** @type {Record<string, Partial<Record<string, string>>>} */
  const out = {};
  for (const modules of globs) {
    for (const [path, url] of Object.entries(modules)) {
      const base = path.split("/").pop()?.replace(/\.(ogg|mp3|wav)$/i, "") ?? "";
      const ext = path.match(/\.(ogg|mp3|wav)$/i)?.[1]?.toLowerCase() ?? "";
      const id = base.replace(/^sfx_/, "").replace(/^music_/, "");
      if (id && ext && typeof url === "string") {
        if (!out[id]) out[id] = {};
        out[id][ext] = url;
      }
    }
  }
  return out;
}

function primeSilentBuffer() {
  if (!ctx || silentPrimed) return;
  const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start(0);
  silentPrimed = true;
}

/** Must run synchronously inside a user-gesture handler (not in rAF / promise callbacks). */
function unlockFromGesture(onReady) {
  if (!ctx) return;
  if (unlocked) {
    onReady?.();
    return;
  }
  if (ctx.state === "suspended") ctx.resume();
  primeSilentBuffer();
  primeMatchMedia();
  unlocked = true;
  startMusicForState(state);
  onReady?.();
}

function loadVolume(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

function applyVolumes() {
  if (!ctx || !sfxGain || !musicGainNode) return;
  sfxGain.gain.value = BASE_SFX_GAIN * sfxVolume;
  musicGainNode.gain.value = BASE_MUSIC_GAIN * musicVolume;
  setMusicLevel(musicVolume);
}

export function getMusicVolume() {
  return musicVolume;
}

export function getSfxVolume() {
  return sfxVolume;
}

export function setMusicVolume(v) {
  musicVolume = Math.max(0, Math.min(1, v));
  localStorage.setItem(MUSIC_VOL_KEY, String(musicVolume));
  applyVolumes();
}

export function setSfxVolume(v) {
  sfxVolume = Math.max(0, Math.min(1, v));
  localStorage.setItem(SFX_VOL_KEY, String(sfxVolume));
  applyVolumes();
}

function bindUnlock() {
  const unlock = () => unlockFromGesture();
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("touchstart", unlock, { capture: true, passive: true });
}

/**
 * @param {Array<{ type: string, [key: string]: unknown }>} events
 */
export function drainEvents(events) {
  if (!ctx || sfxVolume <= 0) {
    events.length = 0;
    return;
  }
  if (!unlocked) {
    events.length = 0;
    return;
  }
  for (const ev of events) {
    const mapped = mapEngineEvent(ev.type, ev);
    if (mapped) playSfx(mapped.id, mapped, ctx, sfxGain);
  }
  events.length = 0;
}

export function playUiNavigate() {
  if (!ctx || sfxVolume <= 0 || !unlocked) return;
  const m = uiNavigate();
  playSfx(m.id, m, ctx, sfxGain);
}

export function playUiConfirm() {
  if (!ctx || sfxVolume <= 0 || !unlocked) return;
  const m = uiConfirm();
  playSfx(m.id, m, ctx, sfxGain);
}

export function onStateChange(prev, next) {
  if (!unlocked) return;
  musicStateChange(prev, next);
}

/**
 * @param {number} maxScore
 * @param {number} ballSpeed
 */
export function tickMusicIntensity(maxScore, ballSpeed) {
  if (!unlocked || musicVolume <= 0) return;
  updateIntensity(maxScore, ballSpeed);
}

let prevLotteryIndices = [0, 0];

/**
 * @param {string} gameState
 */
export function tickLotterySounds(gameState) {
  if (!ctx || sfxVolume <= 0 || gameState !== "lottery") {
    prevLotteryIndices = [0, 0];
    return;
  }
  if (!unlocked) return;

  const elapsed = LOTTERY_TOTAL_DURATION - lotteryTimer;
  const spinProgress = Math.min(1, elapsed / LOTTERY_SPIN_DURATION);

  for (let side = 0; side < 2; side++) {
    const result = lotteryResults[side];
    if (!result) continue;
    const idx = centerOptionIndex(result, spinProgress);
    if (idx !== prevLotteryIndices[side]) {
      const m = lotteryTick();
      playSfx(m.id, m, ctx, sfxGain);
      prevLotteryIndices[side] = idx;
    }
  }
}
