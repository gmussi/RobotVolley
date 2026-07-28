/**
 * Settings screen — volume, accessibility, language (canvas UI).
 */
import { W, H } from "../data/constants.js";
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from "../audio/manager.js";
import { submenuReturnState } from "../engine/game.js";
import { colorblindMode, toggleColorblindMode } from "../data/accessibility.js";
import { t, cycleLocale, getLocaleNativeName } from "../i18n/index.js";
import {
  COLORS, fontDisplay, fontBody,
  drawScrim, drawTitle, drawGlassPanel, drawFooterHint, roundRect,
} from "./neonUi.js";

const STEP = 0.05;

let focusIndex = 0;
const FOCUS_COUNT = 4;
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
    focusIndex = (focusIndex - 1 + FOCUS_COUNT) % FOCUS_COUNT;
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
  if (focusIndex === 3) {
    if (code === "ArrowRight" || code === "KeyD" || code === "Enter" || code === "Space") {
      cycleLocale(1);
      return true;
    }
    if (code === "ArrowLeft" || code === "KeyA") {
      cycleLocale(-1);
      return true;
    }
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
        if (b.id === "language") {
          // Click left/right half of the language row to cycle.
          const mid = b.x + b.w / 2;
          cycleLocale(mx < mid ? -1 : 1);
          return true;
        }
        if (b.id === "colorblind") {
          toggleColorblindMode();
          return true;
        }
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

  drawGlassPanel(ctx, W / 2 - 220, H * 0.14, 440, 390, { radius: 16, fillAlpha: 0.82 });
  drawTitle(ctx, t("settings.title"), W / 2, H * 0.10, 48);

  drawVolumeRow(ctx, {
    id: "music",
    label: t("settings.music"),
    y: H * 0.28,
    value: getMusicVolume(),
    accent: COLORS.accent,
    focused: focusIndex === 0,
  });
  drawVolumeRow(ctx, {
    id: "sound",
    label: t("settings.sound"),
    y: H * 0.40,
    value: getSfxVolume(),
    accent: COLORS.p2,
    focused: focusIndex === 1,
  });

  const cbY = H * 0.54;
  const rowX = W / 2 - 180;
  const rowW = 360;
  settingsSliders.push({ id: "colorblind", x: rowX, y: cbY - 16, w: rowW, h: 36 });
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = fontDisplay(22, 600);
  ctx.fillStyle = focusIndex === 2 ? COLORS.accent : COLORS.text;
  ctx.fillText(t("settings.colorblind"), rowX, cbY);
  ctx.textAlign = "right";
  ctx.fillStyle = colorblindMode ? COLORS.accent : COLORS.textMuted;
  ctx.fillText(colorblindMode ? t("common.on") : t("common.off"), rowX + rowW, cbY);

  const langY = H * 0.64;
  settingsSliders.push({ id: "language", x: rowX, y: langY - 16, w: rowW, h: 36 });
  ctx.textAlign = "left";
  ctx.font = fontDisplay(22, 600);
  ctx.fillStyle = focusIndex === 3 ? COLORS.accent : COLORS.text;
  ctx.fillText(t("settings.language"), rowX, langY);
  ctx.textAlign = "right";
  ctx.font = fontBody(18, 600);
  ctx.fillStyle = focusIndex === 3 ? COLORS.accent : COLORS.textMuted;
  ctx.fillText(`◄  ${getLocaleNativeName()}  ►`, rowX + rowW, langY);

  const backHint = submenuReturnState === "pause" ? t("common.backToPause") : t("common.back");
  drawFooterHint(ctx, [
    { text: t("settings.footerBars") },
    { text: backHint, accent: true },
  ], H - 58);
}

export function getSettingsFocus() {
  return focusIndex;
}
