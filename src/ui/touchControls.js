/**
 * Virtual touch controls for mobile/tablet.
 */
import { W, H } from "../data/constants.js";
import { codeFor } from "../data/controls.js";

const BTN_R = 36;
const STICK_R = 48;
const STICK_KNOB = 22;

let active = false;
let moveTouchId = null;
let moveCenter = { x: 0, y: 0 };
let moveKnob = { x: 0, y: 0 };
const pressed = new Set();

function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

function shouldShow() {
  return isTouchDevice() && window.matchMedia("(max-width: 900px)").matches;
}

export function initTouchControls(canvas, keys) {
  if (!shouldShow()) return;

  active = true;
  const layout = computeLayout();
  moveCenter = { x: layout.stickCx, y: layout.stickCy };
  moveKnob = { ...moveCenter };

  canvas.addEventListener("touchstart", (e) => onTouch(e, keys, layout, "start"), { passive: false });
  canvas.addEventListener("touchmove", (e) => onTouch(e, keys, layout, "move"), { passive: false });
  canvas.addEventListener("touchend", (e) => onTouch(e, keys, layout, "end"), { passive: false });
  canvas.addEventListener("touchcancel", (e) => onTouch(e, keys, layout, "end"), { passive: false });
}

function computeLayout() {
  const pad = 24;
  const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sat-bottom") || "0", 10) || 0;
  const y = H - pad - BTN_R - safeBottom;
  return {
    stickCx: pad + STICK_R,
    stickCy: y,
    buttons: [
      { id: "jump", cx: W - pad - BTN_R * 3.2, cy: y, code: codeFor(0, "jump"), label: "↑" },
      { id: "attack", cx: W - pad - BTN_R, cy: y - BTN_R * 1.4, code: codeFor(0, "attack"), label: "⚡" },
      { id: "serve", cx: W - pad - BTN_R, cy: y + BTN_R * 0.6, code: codeFor(0, "serve"), label: "S" },
    ],
  };
}

function hitCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function onTouch(e, keys, layout, phase) {
  if (!active) return;
  e.preventDefault();

  for (const t of e.changedTouches) {
    const rect = e.target.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const x = (t.clientX - rect.left) * scaleX;
    const y = (t.clientY - rect.top) * scaleY;

    if (phase === "start" || phase === "move") {
      if (moveTouchId === null && hitCircle(x, y, moveCenter.x, moveCenter.y, STICK_R + 20)) {
        moveTouchId = t.identifier;
      }
      if (t.identifier === moveTouchId) {
        const dx = x - moveCenter.x;
        const dy = y - moveCenter.y;
        const dist = Math.hypot(dx, dy);
        const max = STICK_R;
        const clamped = dist > max ? max / dist : 1;
        moveKnob.x = moveCenter.x + dx * clamped;
        moveKnob.y = moveCenter.y + dy * clamped;
        keys.delete(codeFor(0, "left"));
        keys.delete(codeFor(0, "right"));
        if (dx < -12) keys.add(codeFor(0, "left"));
        if (dx > 12) keys.add(codeFor(0, "right"));
      }

      for (const btn of layout.buttons) {
        if (hitCircle(x, y, btn.cx, btn.cy, BTN_R)) {
          if (phase === "start") {
            pressed.add(btn.id);
            keys.add(btn.code);
          }
        }
      }
    }

    if (phase === "end" || phase === "cancel") {
      if (t.identifier === moveTouchId) {
        moveTouchId = null;
        moveKnob = { ...moveCenter };
        keys.delete(codeFor(0, "left"));
        keys.delete(codeFor(0, "right"));
      }
      for (const btn of layout.buttons) {
        if (pressed.has(btn.id)) {
          keys.delete(btn.code);
          pressed.delete(btn.id);
        }
      }
    }
  }
}

export function drawTouchControls(ctx) {
  if (!active || !shouldShow()) return;

  const layout = computeLayout();
  moveCenter = { x: layout.stickCx, y: layout.stickCy };

  ctx.save();
  ctx.globalAlpha = 0.55;

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(moveCenter.x, moveCenter.y, STICK_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(18,24,40,0.65)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(moveKnob.x, moveKnob.y, STICK_KNOB, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,213,74,0.35)";
  ctx.fill();

  for (const btn of layout.buttons) {
    ctx.beginPath();
    ctx.arc(btn.cx, btn.cy, BTN_R, 0, Math.PI * 2);
    ctx.fillStyle = pressed.has(btn.id) ? "rgba(255,213,74,0.45)" : "rgba(18,24,40,0.72)";
    ctx.fill();
    ctx.strokeStyle = pressed.has(btn.id) ? "#ffd54a" : "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f5f7ff";
    ctx.font = "bold 18px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(btn.label, btn.cx, btn.cy);
  }
  ctx.restore();
}

export function touchControlsActive() {
  return active && shouldShow();
}
