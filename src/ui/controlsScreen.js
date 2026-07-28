/**
 * Controls screen — interactive key rebinding for both players.
 *
 * Navigate the 2×4 grid (+ a reset button) with arrows/WASD or a gamepad
 * d-pad; confirm a row to capture the next keyboard key for that action.
 * During capture, gamepad-synthesized events (isTrusted === false) are ignored
 * so pressing a controller can't bind a menu key — rebinding is keyboard-only in
 * v1; controllers are remapped via Steam Input.
 *
 * Owns its own screen state + drawing + input handlers, mirroring settings.js.
 */
import { W, H } from "../data/constants.js";
import {
  COLORS, fontDisplay, fontBody,
  drawScrim, drawTitle, drawGlassPanel, drawFooterHint, drawKeyCap,
} from "./neonUi.js";
import { submenuReturnState } from "../engine/game.js";
import { codeFor, rebind, resetBindings } from "../data/controls.js";
import { t } from "../i18n/index.js";

const KEY_GLYPH = {
  ArrowLeft: "◄", ArrowRight: "►", ArrowUp: "▲", ArrowDown: "▼",
  Slash: "/", Backquote: "`", Minus: "-", Equal: "=",
  Comma: ",", Period: ".", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\",
};

function keyGlyph(code) {
  if (!code) return "—"; // unbound
  if (code === "Space") return t("common.space");
  if (KEY_GLYPH[code]) return KEY_GLYPH[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `#${code.slice(6)}`;
  return code;
}

const MODIFIERS = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock",
]);

const ROWS = [
  { act: "left", labelKey: "controls.moveLeft" },
  { act: "right", labelKey: "controls.moveRight" },
  { act: "jump", labelKey: "controls.jump" },
  { act: "attack", labelKey: "controls.attack", noteKey: "controls.attackNote" },
];

/** {onReset, col, row} — col is the player index (0/1), row indexes ROWS. */
const focus = { onReset: false, col: 0, row: 0 };
/** {player, act, label, pName} while waiting for the next key, else null. */
let capturing = null;

/** Hit-test rects rebuilt each draw. */
const rowRects = [];
let resetRect = null;

export function resetControlsFocus() {
  focus.onReset = false;
  focus.col = 0;
  focus.row = 0;
  capturing = null;
}

export function isCapturingBinding() {
  return !!capturing;
}

function beginCapture(player, act, labelKey) {
  capturing = {
    player,
    act,
    labelKey,
    pNameKey: player === 0 ? "controls.player1" : "controls.player2",
  };
}

function moveFocus(dx, dy) {
  if (focus.onReset) {
    if (dy < 0) { focus.onReset = false; focus.row = ROWS.length - 1; }
    return;
  }
  if (dx !== 0) { focus.col = dx > 0 ? 1 : 0; return; }
  if (dy < 0) { focus.row = Math.max(0, focus.row - 1); return; }
  if (dy > 0) {
    if (focus.row < ROWS.length - 1) focus.row += 1;
    else focus.onReset = true;
  }
}

/**
 * Handle a keydown for the controls screen.
 * @returns {"leave"|"nav"|"capture"|"bound"|"cancel"|"reset"|"consumed"|false}
 */
export function handleControlsKey(code, isTrusted = true) {
  if (capturing) {
    if (code === "Escape") { capturing = null; return "cancel"; }
    if (!isTrusted || MODIFIERS.has(code)) return "consumed"; // ignore pad + bare modifiers
    rebind(capturing.player, capturing.act, code);
    capturing = null;
    return "bound";
  }
  if (code === "ArrowUp" || code === "KeyW") { moveFocus(0, -1); return "nav"; }
  if (code === "ArrowDown" || code === "KeyS") { moveFocus(0, 1); return "nav"; }
  if (code === "ArrowLeft" || code === "KeyA") { moveFocus(-1, 0); return "nav"; }
  if (code === "ArrowRight" || code === "KeyD") { moveFocus(1, 0); return "nav"; }
  if (code === "Enter" || code === "Space") {
    if (focus.onReset) { resetBindings(); return "reset"; }
    beginCapture(focus.col, ROWS[focus.row].act, ROWS[focus.row].labelKey);
    return "capture";
  }
  if (code === "Escape" || code === "Backspace") return "leave";
  return false;
}

/** Pointer down on the controls screen. Returns true if it hit a control. */
export function handleControlsPointer(mx, my, phase) {
  if (phase !== "down") return false;
  if (capturing) { capturing = null; return true; } // click anywhere cancels capture
  if (resetRect && inside(mx, my, resetRect)) {
    focus.onReset = true;
    resetBindings();
    return true;
  }
  for (const r of rowRects) {
    if (inside(mx, my, r)) {
      focus.onReset = false;
      focus.col = r.player;
      focus.row = ROWS.findIndex((x) => x.act === r.act);
      beginCapture(r.player, r.act, ROWS[focus.row].labelKey);
      return true;
    }
  }
  return false;
}

function inside(mx, my, r) {
  return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
}

export function drawControlsScreen(ctx) {
  rowRects.length = 0;
  drawScrim(ctx, 0.55);
  drawTitle(ctx, t("controls.title"), W / 2, H * 0.12, 44);

  const players = [
    { col: 0, name: t("controls.player1"), accent: COLORS.p1, colX: W * 0.27 },
    { col: 1, name: t("controls.player2"), accent: COLORS.p2, colX: W * 0.73 },
  ];
  const headerY = H * 0.24;
  const rowY0 = H * 0.33;
  const rowH = 52;
  const keyOffset = -120;
  const labelX = -78;
  const boxW = 320;

  players.forEach((p) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "3px";
    ctx.font = fontDisplay(24, 600);
    ctx.fillStyle = p.accent;
    ctx.fillText(p.name, p.colX, headerY);
    ctx.letterSpacing = "0px";

    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(p.colX - 150, headerY + 24);
    ctx.lineTo(p.colX + 150, headerY + 24);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ROWS.forEach((row, i) => {
      const cy = rowY0 + i * rowH;
      const boxX = p.colX - boxW / 2;
      const boxY = cy - rowH / 2 + 3;
      const boxH = rowH - 6;
      const focused = !capturing && !focus.onReset && focus.col === p.col && focus.row === i;
      if (focused) {
        drawGlassPanel(ctx, boxX, boxY, boxW, boxH, {
          radius: 10, borderColor: p.accent, glowColor: p.accent, fillAlpha: 0.22,
        });
      }
      const captureHere = capturing && capturing.player === p.col && capturing.act === row.act;
      const glyph = captureHere ? "…" : keyGlyph(codeFor(p.col, row.act));
      drawKeyCap(ctx, p.colX + keyOffset, cy, glyph, p.accent);

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = fontDisplay(19, 600);
      ctx.letterSpacing = "2px";
      ctx.fillStyle = focused ? p.accent : COLORS.text;
      ctx.fillText(t(row.labelKey), p.colX + labelX, cy - (row.noteKey ? 8 : 0));
      if (row.noteKey) {
        ctx.font = fontBody(12, 500);
        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText(t(row.noteKey), p.colX + labelX, cy + 12);
      }
      ctx.letterSpacing = "0px";

      rowRects.push({ player: p.col, act: row.act, x: boxX, y: boxY, w: boxW, h: boxH });
    });
  });

  // Reset button.
  const rbW = 280;
  const rbH = 44;
  const rbX = W / 2 - rbW / 2;
  const rbY = H * 0.80;
  const rFocused = !capturing && focus.onReset;
  drawGlassPanel(ctx, rbX, rbY, rbW, rbH, {
    radius: 10,
    borderColor: rFocused ? COLORS.accent : COLORS.surfaceBorder,
    glowColor: rFocused ? COLORS.accent : null,
    fillAlpha: 0.6,
  });
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontDisplay(18, 700);
  ctx.letterSpacing = "2px";
  ctx.fillStyle = rFocused ? COLORS.accent : COLORS.text;
  ctx.fillText(t("controls.reset"), W / 2, rbY + rbH / 2 + 1);
  ctx.letterSpacing = "0px";
  resetRect = { x: rbX, y: rbY, w: rbW, h: rbH };

  const backHint = submenuReturnState === "pause"
    ? t("common.backToPause")
    : t("common.back");
  drawFooterHint(ctx, [
    { text: t("controls.footer") },
    { text: backHint, accent: true },
  ], H - 44);

  // Capture prompt overlay.
  if (capturing) {
    drawScrim(ctx, 0.72);
    const pw = 520;
    const ph = 150;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2;
    drawGlassPanel(ctx, px, py, pw, ph, {
      radius: 16, fillAlpha: 0.92, borderColor: COLORS.accent, glowColor: COLORS.accent,
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontDisplay(28, 700);
    ctx.letterSpacing = "2px";
    ctx.fillStyle = COLORS.text;
    ctx.fillText(t("controls.pressKey"), W / 2, py + 50);
    ctx.letterSpacing = "0px";
    ctx.font = fontBody(15, 500);
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(`${t(capturing.pNameKey)} · ${t(capturing.labelKey)}`, W / 2, py + 88);
    ctx.fillText(t("controls.escCancel"), W / 2, py + 114);
  }
}
