/**
 * Settings screen — music / sound volume sliders (canvas UI).
 */
import { W, H } from "../data/constants.js";
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from "../audio/manager.js";

const MENU_FONT = "'Courier New', ui-monospace, monospace";
const STEP = 0.05;

/** 0 = music, 1 = sound */
let focusIndex = 0;
let dragging = null;

/** @type {{ id: string, x: number, y: number, w: number, h: number }[]} */
export const settingsSliders = [];

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clamp(v) {
  return Math.max(0, Math.min(1, v));
}

function valueFromX(x, bar) {
  return clamp((x - bar.x) / bar.w);
}

export function resetSettingsFocus() {
  focusIndex = 0;
  dragging = null;
}

/** @returns {boolean} */
export function handleSettingsKey(code) {
  if (code === "ArrowUp" || code === "KeyW") {
    focusIndex = (focusIndex + 1) % 2;
    return true;
  }
  if (code === "ArrowDown" || code === "KeyS") {
    focusIndex = (focusIndex + 1) % 2;
    return true;
  }
  const delta = (code === "ArrowRight" || code === "KeyD") ? STEP
    : (code === "ArrowLeft" || code === "KeyA") ? -STEP : 0;
  if (!delta) return false;
  if (focusIndex === 0) setMusicVolume(getMusicVolume() + delta);
  else setSfxVolume(getSfxVolume() + delta);
  return true;
}

/**
 * @param {number} mx
 * @param {number} my
 * @param {"down"|"move"|"up"} phase
 * @returns {boolean}
 */
export function handleSettingsPointer(mx, my, phase) {
  if (phase === "down") {
    for (let i = 0; i < settingsSliders.length; i++) {
      const b = settingsSliders[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        focusIndex = i;
        dragging = b.id;
        const v = valueFromX(mx, b);
        if (b.id === "music") setMusicVolume(v);
        else setSfxVolume(v);
        return true;
      }
    }
    return false;
  }
  if (phase === "move" && dragging) {
    const b = settingsSliders.find((s) => s.id === dragging);
    if (!b) return false;
    const v = valueFromX(mx, b);
    if (dragging === "music") setMusicVolume(v);
    else setSfxVolume(v);
    return true;
  }
  if (phase === "up") {
    dragging = null;
  }
  return false;
}

function drawVolumeRow(ctx, cfg) {
  const { id, label, y, value, accent, focused } = cfg;
  const barX = W / 2 - 180;
  const barW = 360;
  const barH = 22;
  const barY = y + 18;

  settingsSliders.push({ id, x: barX, y: barY - 8, w: barW, h: barH + 16 });

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `bold 22px ${MENU_FONT}`;
  ctx.letterSpacing = "3px";
  ctx.fillStyle = focused ? accent : "#e8ecff";
  ctx.fillText(label, barX, y - 4);
  ctx.letterSpacing = "0px";

  roundRect(ctx, barX, barY, barW, barH, 6);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.strokeStyle = focused ? accent : "rgba(255,255,255,0.25)";
  ctx.lineWidth = focused ? 2 : 1;
  ctx.stroke();

  const fillW = Math.max(4, barW * value);
  if (fillW > 0) {
    roundRect(ctx, barX, barY, fillW, barH, 6);
    ctx.fillStyle = accent;
    ctx.globalAlpha = focused ? 1 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = "right";
  ctx.font = `bold 18px ${MENU_FONT}`;
  ctx.fillStyle = focused ? "#ffd54a" : "rgba(255,255,255,0.65)";
  ctx.fillText(`${Math.round(value * 100)}%`, barX + barW, y - 4);
}

export function drawSettings(ctx) {
  settingsSliders.length = 0;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(10,12,34,0.96)");
  grad.addColorStop(1, "rgba(4,5,16,0.96)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (let sy = 0; sy < H; sy += 4) ctx.fillRect(0, sy, W, 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "6px";
  ctx.font = `bold 52px ${MENU_FONT}`;
  ctx.fillStyle = "#1a1030";
  ctx.fillText("SETTINGS", W / 2 + 4, H * 0.12 + 4);
  ctx.fillStyle = "#ffd54a";
  ctx.fillText("SETTINGS", W / 2, H * 0.12);
  ctx.letterSpacing = "0px";

  const musicVol = getMusicVolume();
  const sfxVol = getSfxVolume();

  drawVolumeRow(ctx, {
    id: "music",
    label: "MUSIC",
    y: H * 0.34,
    value: musicVol,
    accent: "#ffd54a",
    focused: focusIndex === 0,
  });
  drawVolumeRow(ctx, {
    id: "sound",
    label: "SOUND",
    y: H * 0.52,
    value: sfxVol,
    accent: "#29b6f6",
    focused: focusIndex === 1,
  });

  const now = performance.now();
  const blink = Math.floor(now / 380) % 2 === 0;
  ctx.textAlign = "center";
  ctx.font = `bold 14px ${MENU_FONT}`;
  ctx.letterSpacing = "2px";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("▲ ▼  SELECT BAR      ◄ ►  ADJUST", W / 2, H - 74);
  ctx.fillStyle = blink ? "rgba(255,213,74,0.9)" : "rgba(255,213,74,0.4)";
  ctx.fillText("ENTER / ESC   BACK", W / 2, H - 46);
  ctx.letterSpacing = "0px";
}

export function getSettingsFocus() {
  return focusIndex;
}
