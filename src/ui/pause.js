/**
 * Pause overlay — resume, settings, quit (canvas UI).
 */
import { W, H } from "../data/constants.js";
import { pauseOptions, pauseIndex } from "../engine/game.js";

const MENU_FONT = "'Courier New', ui-monospace, monospace";

export function drawPauseOverlay(ctx) {
  ctx.fillStyle = "rgba(6,9,18,0.72)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "6px";
  ctx.font = `bold 52px ${MENU_FONT}`;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText("PAUSED", W / 2 + 4, H * 0.28 + 4);
  ctx.fillStyle = "#ffd54a";
  ctx.fillText("PAUSED", W / 2, H * 0.28);
  ctx.letterSpacing = "0px";

  const now = performance.now();
  const blink = Math.floor(now / 380) % 2 === 0;
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

    const selected = i === pauseIndex;

    if (selected) {
      ctx.fillStyle = "rgba(255,213,74,0.10)";
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "5px";
    ctx.font = `bold 30px ${MENU_FONT}`;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(o.label, W / 2 + 3, cy + 3);
    ctx.fillStyle = selected ? "#ffd54a" : "#e8ecff";
    ctx.fillText(o.label, W / 2, cy);
    ctx.letterSpacing = "0px";

    if (selected && blink) {
      ctx.fillStyle = "#ff5a5f";
      ctx.font = `bold 26px ${MENU_FONT}`;
      ctx.fillText("▶", o.x + 26, cy);
    }
  });

  ctx.textAlign = "center";
  ctx.font = `bold 14px ${MENU_FONT}`;
  ctx.letterSpacing = "2px";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("▲ ▼  SELECT", W / 2, H - 74);
  ctx.fillStyle = blink ? "rgba(255,213,74,0.9)" : "rgba(255,213,74,0.4)";
  ctx.fillText("ENTER   RESUME      ESC   BACK", W / 2, H - 46);
  ctx.letterSpacing = "0px";
}
