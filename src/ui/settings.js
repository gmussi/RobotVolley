/**
 * Settings screen — music / sound volume sliders (canvas UI).
 */
import { W, H } from "../data/constants.js";
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from "../audio/manager.js";
import { submenuReturnState } from "../engine/game.js";
import { colorblindMode, toggleColorblindMode } from "../data/accessibility.js";
import {
  COLORS, fontDisplay, fontBody,
  drawScrim, drawTitle, drawGlassPanel, drawFooterHint, roundRect,
} from "./neonUi.js";

const STEP = 0.05;

let focusIndex = 0;
const FOCUS_COUNT = 3;
let dragging = null;

export const settingsSliders = [];

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

export function handleSettingsKey(code) {
  if (code === "ArrowUp" || code === "KeyW") {
    focusIndex = (focusIndex + 1) % FOCUS_COUNT;
    return true;
  }
  if (code === "ArrowDown" || code === "KeyS") {
    focusIndex = (focusIndex + 1) % FOCUS_COUNT;
    return true;
  }
  if (focusIndex === 2 && (code === "Enter" || code === "Space")) {
    toggleColorblindMode();
    return true;
  }
  const delta = (code === "ArrowRight" || code === "KeyD") ? STEP
    : (code === "ArrowLeft" || code === "KeyA") ? -STEP : 0;
  if (!delta) return false;
  if (focusIndex >= 2) return false;
  if (focusIndex === 0) setMusicVolume(getMusicVolume() + delta);
  else setSfxVolume(getSfxVolume() + delta);
  return true;
}

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
  ctx.font = fontDisplay(22, 600);
  ctx.letterSpacing = "3px";
  ctx.fillStyle = focused ? accent : COLORS.text;
  ctx.fillText(label, barX, y - 4);
  ctx.letterSpacing = "0px";

  drawGlassPanel(ctx, barX, barY, barW, barH, {
    radius: 6,
    borderColor: focused ? accent : COLORS.surfaceBorder,
    glowColor: focused ? accent : null,
    fillAlpha: 0.65,
  });

  const fillW = Math.max(4, barW * value);
  if (fillW > 0) {
    roundRect(ctx, barX, barY, fillW, barH, 6);
    ctx.fillStyle = accent;
    ctx.globalAlpha = focused ? 1 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = "right";
  ctx.font = fontDisplay(18, 600);
  ctx.fillStyle = focused ? COLORS.accent : COLORS.textMuted;
  ctx.fillText(`${Math.round(value * 100)}%`, barX + barW, y - 4);
}

export function drawSettings(ctx) {
  settingsSliders.length = 0;
  drawScrim(ctx, 0.55);

  drawGlassPanel(ctx, W / 2 - 220, H * 0.18, 440, 320, { radius: 16, fillAlpha: 0.82 });
  drawTitle(ctx, "SETTINGS", W / 2, H * 0.12, 48);

  drawVolumeRow(ctx, {
    id: "music",
    label: "MUSIC",
    y: H * 0.34,
    value: getMusicVolume(),
    accent: COLORS.accent,
    focused: focusIndex === 0,
  });
  drawVolumeRow(ctx, {
    id: "sound",
    label: "SOUND",
    y: H * 0.48,
    value: getSfxVolume(),
    accent: COLORS.p2,
    focused: focusIndex === 1,
  });

  const cbY = H * 0.62;
  const cbX = W / 2 - 180;
  ctx.textAlign = "left";
  ctx.font = fontDisplay(22, 600);
  ctx.fillStyle = focusIndex === 2 ? COLORS.accent : COLORS.text;
  ctx.fillText("COLORBLIND MODE", cbX, cbY);
  ctx.textAlign = "right";
  ctx.fillStyle = colorblindMode ? COLORS.accent : COLORS.textMuted;
  ctx.fillText(colorblindMode ? "ON" : "OFF", cbX + 360, cbY);

  const backHint = submenuReturnState === "pause" ? "ENTER / ESC   BACK TO PAUSE"
    : "ENTER / ESC   BACK";
  drawFooterHint(ctx, [
    { text: "▲ ▼  SELECT BAR      ◄ ►  ADJUST" },
    { text: backHint, accent: true },
  ], H - 58);
}

export function getSettingsFocus() {
  return focusIndex;
}
