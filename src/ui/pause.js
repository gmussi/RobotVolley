/**
 * Pause overlay — resume, settings, quit (canvas UI).
 */
import { W, H } from "../data/constants.js";
import { pauseOptions, pauseIndex } from "../engine/game.js";
import { t } from "../i18n/index.js";
import {
  drawScrim, drawTitle, drawMenuItem, drawFooterHint,
} from "./neonUi.js";

export function drawPauseOverlay(ctx) {
  drawScrim(ctx, 0.6);
  drawTitle(ctx, t("pause.title"), W / 2, H * 0.28, 48);

  const now = performance.now();
  const startY = H * 0.38;
  const rowH = 48;
  const itemW = 440;
  const itemH = 44;

  pauseOptions.forEach((o, i) => {
    const cy = startY + i * rowH;
    o.w = itemW;
    o.h = itemH;
    o.x = (W - itemW) / 2;
    o.y = cy - itemH / 2;
    drawMenuItem(ctx, t(o.labelKey), W / 2, cy, itemW, itemH, i === pauseIndex, now);
  });

  drawFooterHint(ctx, [
    { text: t("common.select") },
    { text: t("pause.footerActions"), accent: true },
  ], H - 58);
}
