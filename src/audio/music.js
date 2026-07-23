/**
 * Background music — menu/stinger via Web Audio buffers; match track via
 * HTMLAudioElement (native loop, no decode step for long MP3s).
 */
import { pauseFromState } from "../engine/game.js";
import { makeMenuLoop, makeVictoryStinger } from "./procedural.js";
import { decodeAsset } from "./loadBuffer.js";

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let musicGain = null;
/** @type {BiquadFilterNode|null} */
let filter = null;

/** @type {Record<string, AudioBuffer>} */
let buffers = {};

/** @type {{ id: string, src: AudioBufferSourceNode, gain: GainNode, volume: number }|null} */
let currentLoop = null;
/** @type {AudioBufferSourceNode|null} */
let stingerSrc = null;

/** @type {HTMLAudioElement|null} */
let matchEl = null;
/** @type {string[]} */
let matchUrls = [];
/** @type {string|null} */
let activeMatchUrl = null;
let matchVolume = 0.38;
let musicLevel = 1;

const MATCH_CROSSFADE = 0.8;
const MENU_CROSSFADE = 0.25;
const MATCH_STATES = new Set(["serve", "play", "lottery", "point", "over", "pause"]);
const MENU_STATES = new Set(["menu", "controls", "settings"]);
const MATCH_TRACK_IDS = ["match_a", "match_b"];

function pickFileUrl(urls) {
  return urls?.mp3 ?? urls?.ogg ?? urls?.wav ?? null;
}

function pickRandomMatchUrl() {
  if (matchUrls.length === 0) return null;
  if (matchUrls.length === 1) return matchUrls[0];
  let url = matchUrls[Math.floor(Math.random() * matchUrls.length)];
  if (url === activeMatchUrl) {
    url = matchUrls.find((u) => u !== activeMatchUrl) ?? url;
  }
  return url;
}

/**
 * @param {AudioContext} audioCtx
 * @param {GainNode} out
 * @param {Record<string, Partial<Record<string, string>>>} [fileUrls]
 */
export function initMusic(audioCtx, out, fileUrls = {}) {
  ctx = audioCtx;
  musicGain = out;

  filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 12000;
  filter.connect(musicGain);

  buffers = {
    menu_loop: makeMenuLoop(ctx),
    victory_stinger: makeVictoryStinger(ctx),
  };

  matchUrls = MATCH_TRACK_IDS.map((id) => pickFileUrl(fileUrls[id])).filter(Boolean);
  if (matchUrls.length === 0) {
    const legacy = pickFileUrl(fileUrls.match_loop);
    if (legacy) matchUrls = [legacy];
  }

  loadMusicAssets(ctx, fileUrls);
}

function loadMusicAssets(ctx, fileUrls) {
  for (const [id, urls] of Object.entries(fileUrls)) {
    if (id === "match_loop" || id.startsWith("match_")) continue;
    decodeAsset(ctx, urls, ["mp3", "ogg", "wav"]).then((buf) => {
      if (buf) buffers[id] = buf;
    }).catch(() => {});
  }
}

export function setMusicLevel(level) {
  musicLevel = Math.max(0, Math.min(1, level));
  if (matchEl) matchEl.volume = matchVolume * musicLevel;
  if (musicLevel <= 0) stopMatchElement();
}

function stopMatchElement() {
  if (matchEl) {
    matchEl.pause();
    matchEl.removeAttribute("src");
    matchEl.load();
  }
  matchEl = null;
}

function isMatchPlaying() {
  return matchEl && !matchEl.paused;
}

function stopLoop(fade = MATCH_CROSSFADE) {
  if (!currentLoop || !ctx) return;
  const { gain, src } = currentLoop;
  src.onended = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
  try { src.stop(ctx.currentTime + fade + 0.05); } catch { /* already stopped */ }
  currentLoop = null;
}

function startLoop(id, volume = 0.35, fade = MATCH_CROSSFADE) {
  if (!ctx || !filter || !buffers[id]) return;
  if (currentLoop?.id === id) return;

  stopLoop();

  const src = ctx.createBufferSource();
  src.buffer = buffers[id];
  src.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(gain);
  gain.connect(filter);

  const t = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(volume, t + fade);
  src.start(t);
  currentLoop = { id, src, gain, volume };
}

function startMatchElement(newMatch = false) {
  if (matchUrls.length === 0 || musicLevel <= 0) return;

  if (newMatch || !activeMatchUrl) {
    const url = pickRandomMatchUrl();
    if (!url) return;
    if (url !== activeMatchUrl || !matchEl) {
      stopLoop();
      stopMatchElement();
      activeMatchUrl = url;
      matchEl = new Audio(activeMatchUrl);
      matchEl.loop = true;
      matchEl.volume = matchVolume * musicLevel;
      matchEl.play().catch(() => {});
      return;
    }
  }

  if (matchEl) {
    matchEl.volume = matchVolume * musicLevel;
    if (matchEl.paused) matchEl.play().catch(() => {});
    return;
  }

  stopLoop();

  const url = activeMatchUrl ?? pickRandomMatchUrl();
  if (!url) return;
  activeMatchUrl = url;
  matchEl = new Audio(url);
  matchEl.loop = true;
  matchEl.volume = matchVolume * musicLevel;
  matchEl.play().catch(() => {});
}

export function startMenuMusic() {
  stopMatchElement();
  activeMatchUrl = null;
  startLoop("menu_loop", 0.32, MENU_CROSSFADE);
}

export function startMatchMusic(newMatch = false) {
  startMatchElement(newMatch);
}

/** Pick menu or match track based on game state string. */
export function startMusicForState(gameState) {
  if (MENU_STATES.has(gameState)) startMenuMusic();
  else if (MATCH_STATES.has(gameState)) startMatchMusic();
}

export function onStateChange(prev, next) {
  if (!ctx) return;

  if ((next === "settings" || next === "controls") && pauseFromState) return;
  if (next === "pause") return;

  if (MENU_STATES.has(next) && MATCH_STATES.has(prev)) {
    stopMatchElement();
    activeMatchUrl = null;
    startMenuMusic();
  } else if (MATCH_STATES.has(next) && MENU_STATES.has(prev)) {
    startMatchMusic(true);
  } else if (MATCH_STATES.has(next) && MATCH_STATES.has(prev)) {
    if (!isMatchPlaying()) startMatchMusic(false);
  } else if (next === "over") {
    if (!isMatchPlaying()) startMatchMusic(false);
    playVictoryStinger();
  } else if (next === "menu" && prev === "over") {
    stopMatchElement();
    activeMatchUrl = null;
    stopLoop(0.5);
    startMenuMusic();
  }
}

export function playVictoryStinger() {
  if (!ctx || !filter || !buffers.victory_stinger) return;

  if (matchEl) matchEl.volume = 0.12 * musicLevel;

  if (currentLoop?.gain) {
    const t = ctx.currentTime;
    currentLoop.gain.gain.cancelScheduledValues(t);
    currentLoop.gain.gain.setValueAtTime(currentLoop.gain.gain.value, t);
    currentLoop.gain.gain.linearRampToValueAtTime(0.12, t + 0.3);
  }

  if (stingerSrc) {
    try { stingerSrc.stop(); } catch { /* already stopped */ }
  }

  const src = ctx.createBufferSource();
  src.buffer = buffers.victory_stinger;
  const g = ctx.createGain();
  g.gain.value = 0.45;
  src.connect(g);
  g.connect(filter);
  src.start();
  stingerSrc = src;
  src.onended = () => { stingerSrc = null; };
}

/**
 * @param {number} maxScore
 * @param {number} ballSpeed
 */
export function updateIntensity(maxScore, ballSpeed) {
  if (!isMatchPlaying()) return;

  matchVolume = 0.38 + Math.min(0.12, maxScore * 0.02);
  if (matchEl) matchEl.volume = matchVolume * musicLevel;

  if (!filter || !ctx) return;
  const t = ctx.currentTime;
  const scoreBoost = Math.max(0, maxScore - 2) * 800;
  const speedBoost = Math.min(2000, ballSpeed * 0.8);
  const target = 12000 + scoreBoost + speedBoost;
  filter.frequency.cancelScheduledValues(t);
  filter.frequency.setValueAtTime(filter.frequency.value, t);
  filter.frequency.linearRampToValueAtTime(Math.min(16000, target), t + 0.5);
}

export function stopAllMusic() {
  stopMatchElement();
  stopLoop(0.1);
  if (stingerSrc) {
    try { stingerSrc.stop(); } catch { /* ok */ }
    stingerSrc = null;
  }
}
