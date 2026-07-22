/**
 * Viewport — letterboxed display scaling, HiDPI backing store, and fullscreen.
 * Logical game coordinates stay at W×H; only the canvas buffer and CSS size change.
 */
import { W, H } from "../data/constants.js";
import { applyDpr } from "./render.js";

const MAX_DPR = 3;

let stageEl;
let canvas;
let fsBtn;

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

function onFullscreenChange() {
  const active = !!document.fullscreenElement;
  document.body.classList.toggle("fullscreen", active);
  fsBtn.setAttribute("aria-pressed", String(active));
  fsBtn.title = active ? "Exit fullscreen" : "Enter fullscreen";
  resize();
}

export function initViewport(canvasEl, stage, fsButton) {
  canvas = canvasEl;
  stageEl = stage;
  fsBtn = fsButton;

  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  fsBtn.addEventListener("click", toggleFullscreen);

  resize();
}

export async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      const req = stageEl.requestFullscreen ?? stageEl.webkitRequestFullscreen;
      if (req) await req.call(stageEl);
    } else {
      const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
      if (exit) await exit.call(document);
    }
  } catch {
    // User gesture denied or API unavailable — ignore
  }
}

export function eventToCanvas(canvasEl, e) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    mx: (e.clientX - rect.left) * (W / rect.width),
    my: (e.clientY - rect.top) * (H / rect.height),
  };
}
