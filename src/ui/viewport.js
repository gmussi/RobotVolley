/**
 * Viewport — aspect-correct display scaling and HiDPI backing store.
 * Logical game coordinates stay at W×H; only the canvas buffer and CSS size change.
 * The game window itself is always fullscreen (native OS fullscreen in the
 * Electron/Steam build); this just fits the fixed-aspect canvas into it.
 */
import { W, H } from "../data/constants.js";
import { applyDpr } from "./render.js";

const MAX_DPR = 3;

let stageEl;
let canvas;

function getDpr() {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

function resize() {
  const containerW = stageEl.clientWidth;
  const containerH = stageEl.clientHeight;
  if (!containerW || !containerH) return;

  const scale = Math.min(containerW / W, containerH / H);
  const displayW = Math.floor(W * scale);
  const displayH = Math.floor(H * scale);

  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;

  const dpr = getDpr();
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  applyDpr(dpr);
}

export function initViewport(canvasEl, stage) {
  canvas = canvasEl;
  stageEl = stage;

  window.addEventListener("resize", resize);
  resize();
}

export function eventToCanvas(canvasEl, e) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    mx: (e.clientX - rect.left) * (W / rect.width),
    my: (e.clientY - rect.top) * (H / rect.height),
  };
}
