/**
 * Credits screen — static third-party attributions. Read-only, reached via a
 * footer link on the title menu (see main.js / render.js drawMenu footer).
 */
import { W, H } from "../data/constants.js";
import { CREDIT_SECTIONS } from "../data/credits.js";
import {
  COLORS, fontDisplay, fontBody,
  drawScrim, drawTitle, drawGlassPanel, drawFooterHint,
} from "./neonUi.js";

export function drawCreditsScreen(ctx) {
  drawScrim(ctx, 0.55);
  drawGlassPanel(ctx, W / 2 - 260, H * 0.16, 520, H * 0.62, { radius: 16, fillAlpha: 0.82 });
  drawTitle(ctx, "CREDITS", W / 2, H * 0.12, 44);

  let y = H * 0.26;
  const leftX = W / 2 - 210;

  for (const section of CREDIT_SECTIONS) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = fontDisplay(18, 700);
    ctx.letterSpacing = "2px";
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(section.title.toUpperCase(), leftX, y);
    ctx.letterSpacing = "0px";
    y += 30;

    for (const entry of section.entries) {
      ctx.font = fontDisplay(17, 600);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(entry.name, leftX, y);
      ctx.font = fontBody(13, 400);
      ctx.fillStyle = COLORS.textMuted;
      ctx.textAlign = "right";
      ctx.fillText(entry.detail, W / 2 + 210, y);
      ctx.textAlign = "left";
      y += 26;
    }
    y += 18;
  }

  const backHint = "ENTER / ESC   BACK";
  drawFooterHint(ctx, [{ text: backHint, accent: true }], H - 44);
}
