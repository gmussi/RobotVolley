/**
 * Shared neon glass UI drawing helpers — see docs/ART_BIBLE.md
 */
import { W, H } from "../data/constants.js";
import { COLORS, GLOW, fontDisplay, fontBody } from "../data/theme.js";

export { fontDisplay, fontBody, COLORS, GLOW };

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawScrim(ctx, opacity = 0.55) {
  ctx.fillStyle = `rgba(6,9,18,${opacity})`;
  ctx.fillRect(0, 0, W, H);
}

export function drawGlassPanel(ctx, x, y, w, h, opts = {}) {
  const {
    radius = 12,
    borderColor = COLORS.surfaceBorder,
    glowColor = null,
    fillAlpha = 0.88,
  } = opts;

  ctx.save();
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;
  }
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = `rgba(18,24,40,${fillAlpha})`;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = glowColor ? 2 : 1;
  ctx.stroke();
  ctx.restore();
}

export function drawTitle(ctx, text, cx, cy, size = 52, color = COLORS.accent) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "4px";
  ctx.font = fontDisplay(size);
  ctx.shadowColor = GLOW.accent;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.letterSpacing = "0px";
  ctx.restore();
}

export function drawMenuItem(ctx, label, cx, cy, w, h, selected, now = performance.now()) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const pulse = 0.6 + 0.4 * Math.sin(now * 0.006);

  if (selected) {
    drawGlassPanel(ctx, x, y, w, h, {
      radius: 10,
      borderColor: COLORS.accent,
      glowColor: `rgba(255,213,74,${0.35 * pulse})`,
      fillAlpha: 0.72,
    });
    ctx.save();
    ctx.fillStyle = `rgba(255,213,74,${0.08 * pulse})`;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "3px";
  ctx.font = fontDisplay(selected ? 28 : 26, 600);
  ctx.fillStyle = selected ? COLORS.accent : COLORS.text;
  ctx.fillText(label, cx, cy);
  ctx.letterSpacing = "0px";
}

export function centerText(ctx, txt, color, size, y, shadow = true) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = fontDisplay(size, 700);
  if (shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
  }
  ctx.fillText(txt, W / 2, y);
  ctx.shadowBlur = 0;
}

export function drawFooterHint(ctx, lines, yStart = H - 62) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.font = fontBody(line.accent ? 14 : 13, line.accent ? 600 : 400);
    ctx.fillStyle = line.accent ? COLORS.accent : COLORS.textMuted;
    ctx.fillText(line.text, W / 2, yStart + i * 22);
  });
}

export function drawKeyCap(ctx, cx, cy, glyph, accent) {
  const wide = glyph.length > 1;
  const w = wide ? 78 : 46;
  const h = 46;
  const x = cx - w / 2;
  const y = cy - h / 2;
  drawGlassPanel(ctx, x, y, w, h, { radius: 8, borderColor: accent, fillAlpha: 0.65 });
  ctx.fillStyle = COLORS.text;
  ctx.font = fontDisplay(wide ? 15 : 22, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy + 1);
}

export function drawCircularGauge(ctx, cx, cy, r, frac, accent, ready = false) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 4;
  ctx.stroke();

  if (frac > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.globalAlpha = ready ? 1 : 0.55;
    ctx.stroke();
  }

  if (ready) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
  }
  ctx.restore();
}
