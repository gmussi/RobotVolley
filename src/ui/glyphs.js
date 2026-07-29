/**
 * Input-aware prompt glyphs — the piece that makes "ENTER  RESUME" turn into
 * "Ⓐ RESUME" the moment someone picks up a controller, and back again the
 * moment they touch a key.
 *
 * Hint strings in the locale catalogs carry `[token]` markers instead of key
 * names (`"[confirm]   RESUME      [back]   BACK"`). Translators never see a
 * glyph — they translate the words around the markers, and this module resolves
 * each marker against the device from src/input/device.js at draw time.
 *
 * On keyboard the markers resolve to plain (localized) text and adjacent runs
 * merge, so a keyboard player gets byte-identical rendering to a single
 * fillText. On a pad they resolve to little vector buttons drawn inline with the
 * text — vector rather than Unicode because ✕ ○ △ □ render inconsistently
 * across platforms and are outright missing from some Windows font stacks.
 */
import { COLORS, fontDisplay, fontBody } from "../data/theme.js";
import { inputDevice, usingGamepad } from "../input/device.js";
import { codeFor } from "../data/controls.js";
import { t } from "../i18n/index.js";

/**
 * Marker → what it means on each device.
 *   `key`  produces the keyboard text (localized where the word is a real word;
 *          arrows are language-neutral and hardcoded).
 *   `pad`  names a glyph drawn by drawPadGlyph.
 *
 * `confirm`/`menuKey` differ only on the keyboard side: menus confirm with
 * ENTER, banners dismiss with SPACE, and both are the pad's south button.
 */
const TOKENS = {
  // Options confirms too, but cross is the one a player reaches for, so that is
  // what the prompts show.
  confirm: { key: () => t("key.enter"), pad: "cross" },
  back: { key: () => t("key.esc"), pad: "circle" },
  menuKey: { key: () => t("common.space"), pad: "cross" },
  // Attack/serve. The keyboard side is the *bound* key, which only the caller
  // knows (it is per-seat and rebindable), so callers substitute the letter
  // themselves and only emit this marker in pad mode — see render.js.
  attack: { key: () => t("key.enter"), pad: "square" },
  updown: { key: () => "▲ ▼", pad: "ud" },
  leftright: { key: () => "◄ ►", pad: "lr" },
  dpad: { key: () => "▲ ▼ ◄ ►", pad: "all" },
};

const TOKEN_RE = /\[(\w+)\]/g;

/**
 * Split a hint string into drawable runs: `{text}` for words, `{pad}` for a
 * controller glyph. Adjacent text runs are merged so the keyboard path is a
 * single fillText.
 */
export function parseHint(str) {
  const src = String(str ?? "");
  const pad = usingGamepad();
  const runs = [];
  const pushText = (s) => {
    if (!s) return;
    const last = runs[runs.length - 1];
    if (last && last.text != null) last.text += s;
    else runs.push({ text: s });
  };

  let at = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(src); m; m = TOKEN_RE.exec(src)) {
    const spec = TOKENS[m[1]];
    pushText(src.slice(at, m.index));
    // An unknown marker falls through as literal text so a typo is visible
    // rather than silently swallowing part of the hint.
    if (!spec) pushText(m[0]);
    else if (pad) runs.push({ pad: spec.pad });
    else pushText(spec.key());
    at = m.index + m[0].length;
  }
  pushText(src.slice(at));
  return runs;
}

/** Advance width of a pad glyph, including the breathing room around it. */
function padWidth(size) {
  return size * 1.9;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Face-button letters and Xbox fill colors, keyed by physical position rather
 * than by letter — the letter depends on the brand. Nintendo's A/B are mirrored
 * relative to Xbox, and gamepad.js binds by position, so the glyph names the
 * button the player physically presses even though that inverts Nintendo's own
 * "A confirms" convention.
 */
const FACE = {
  cross: { xbox: "A", nintendo: "B", fill: "#6CC24A" }, // south
  circle: { xbox: "B", nintendo: "A", fill: "#E5453B" }, // east
  square: { xbox: "X", nintendo: "Y", fill: "#3A8DDE" }, // west
};

/** A face button: ✕ / ○ / □ on Sony, a lettered disc elsewhere. */
function drawFaceButton(ctx, brand, pos, cx, cy, size) {
  const r = size * 0.62;
  const face = FACE[pos];
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (brand === "xbox" || brand === "nintendo") {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (brand === "xbox") {
      ctx.fillStyle = face.fill;
      ctx.fill();
      ctx.fillStyle = "#0B1020";
      ctx.font = fontDisplay(size * 0.8, 700);
    } else {
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = Math.max(1, size * 0.09);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.font = fontDisplay(size * 0.72, 700);
    }
    ctx.fillText(brand === "xbox" ? face.xbox : face.nintendo, cx, cy + size * 0.05);
  } else {
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = Math.max(1, size * 0.09);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const s = r * 0.46;
    ctx.beginPath();
    if (pos === "cross") {
      ctx.moveTo(cx - s, cy - s);
      ctx.lineTo(cx + s, cy + s);
      ctx.moveTo(cx + s, cy - s);
      ctx.lineTo(cx - s, cy + s);
    } else if (pos === "circle") {
      ctx.arc(cx, cy, s * 1.05, 0, Math.PI * 2);
    } else {
      ctx.rect(cx - s * 0.92, cy - s * 0.92, s * 1.84, s * 1.84);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The confirm button: Options on a DualSense, Menu on Xbox, + on a Switch pad.
 * All three are small and unlettered, so a pill with rules reads better than any
 * attempt at the real silkscreen — except Nintendo's, which really is a plus.
 */
function drawStartButton(ctx, brand, cx, cy, size) {
  const w = size * 0.92;
  const h = size * 1.06;
  ctx.save();
  ctx.strokeStyle = COLORS.text;
  ctx.fillStyle = COLORS.text;
  ctx.lineWidth = Math.max(1, size * 0.09);
  rr(ctx, cx - w / 2, cy - h / 2, w, h, size * 0.22);
  ctx.stroke();
  if (brand === "nintendo") {
    const s = size * 0.26;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy);
    ctx.lineTo(cx + s, cy);
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx, cy + s);
    ctx.stroke();
  } else {
    const lw = w * 0.46;
    const gap = size * 0.22;
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(cx - lw / 2, cy + i * gap - ctx.lineWidth / 2, lw, ctx.lineWidth);
    }
  }
  ctx.restore();
}

/** Which arms a d-pad glyph lights up. */
const DPAD_DIRS = {
  all: ["up", "down", "left", "right"],
  ud: ["up", "down"],
  lr: ["left", "right"],
  up: ["up"], down: ["down"], left: ["left"], right: ["right"],
};

/** Unit vector per direction, screen coordinates. */
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * A d-pad with the named arms lit over a dimmed cross, so the pad shape stays
 * readable whichever directions are active. Hint text is only 13px, so lit arms
 * get arrowheads — a bare bar at this size reads as a stray dash.
 */
function drawDpad(ctx, dirs, cx, cy, size) {
  const arm = size * 0.82;
  const th = size * 0.32;
  const head = size * 0.34;
  const lit = DPAD_DIRS[dirs] ?? DPAD_DIRS.all;

  ctx.save();
  ctx.fillStyle = COLORS.text;

  ctx.globalAlpha = 0.32;
  rr(ctx, cx - arm, cy - th / 2, arm * 2, th, th * 0.35);
  ctx.fill();
  rr(ctx, cx - th / 2, cy - arm, th, arm * 2, th * 0.35);
  ctx.fill();

  ctx.globalAlpha = 1;
  for (const dir of lit) {
    const [dx, dy] = DIR_VEC[dir];
    const ax = dx * arm;
    const ay = dy * arm;
    // Arm: from the hub out to the tip, thickness `th` across.
    rr(
      ctx,
      Math.min(cx - th / 2, cx + ax), Math.min(cy - th / 2, cy + ay),
      Math.max(th, Math.abs(ax) + th / 2), Math.max(th, Math.abs(ay) + th / 2),
      th * 0.35,
    );
    ctx.fill();
    // Arrowhead, its base sitting across the arm.
    const px = -dy;
    const py = dx;
    ctx.beginPath();
    ctx.moveTo(cx + dx * (arm + head * 0.72), cy + dy * (arm + head * 0.72));
    ctx.lineTo(cx + ax * 0.5 + px * head, cy + ay * 0.5 + py * head);
    ctx.lineTo(cx + ax * 0.5 - px * head, cy + ay * 0.5 - py * head);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawPadGlyph(ctx, glyph, cx, cy, size) {
  const brand = inputDevice();
  if (glyph in FACE) drawFaceButton(ctx, brand, glyph, cx, cy, size);
  else if (glyph === "start") drawStartButton(ctx, brand, cx, cy, size);
  else drawDpad(ctx, glyph, cx, cy, size);
}

/**
 * Draw a hint string, resolving `[token]` markers to key names or pad glyphs.
 *
 * The caller owns `ctx.font` and `ctx.fillStyle` exactly as with fillText;
 * `size` is the font's pixel size and only scales the glyphs.
 */
export function drawHintText(ctx, str, cx, y, size, align = "center") {
  const runs = parseHint(str);
  if (runs.length === 0) return;
  if (runs.length === 1 && runs[0].text != null) {
    ctx.textAlign = align;
    ctx.fillText(runs[0].text, cx, y);
    return;
  }

  const widths = runs.map((r) => (
    r.text != null ? ctx.measureText(r.text).width : padWidth(size)
  ));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = align === "center" ? cx - total / 2 : align === "right" ? cx - total : cx;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  runs.forEach((r, i) => {
    if (r.text != null) ctx.fillText(r.text, x, y);
    else drawPadGlyph(ctx, r.pad, x + widths[i] / 2, y, size);
    x += widths[i];
  });
  ctx.textAlign = prevAlign;
}

// ------------------------------------------------------- bound-key rendering

/** Codes whose name is not the character they produce. */
const KEY_GLYPH = {
  ArrowLeft: "◄", ArrowRight: "►", ArrowUp: "▲", ArrowDown: "▼",
  Slash: "/", Backquote: "`", Minus: "-", Equal: "=",
  Comma: ",", Period: ".", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\",
};

/** Cap text for a key code — "KeyF" → "F", "Slash" → "/", null → an em dash. */
export function keyLabel(code) {
  if (!code) return "—"; // unbound
  if (code === "Space") return t("common.space");
  if (KEY_GLYPH[code]) return KEY_GLYPH[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `#${code.slice(6)}`;
  return code;
}

/** The controller button that performs a gameplay action, or null if none does. */
const PAD_FOR_ACTION = { attack: "square", jump: "cross", left: "left", right: "right" };

/**
 * Glyph for the controller button that performs `act`, or null when the player
 * is on the keyboard — callers fall back to the bound key in that case.
 */
export function padGlyphForAction(act) {
  return usingGamepad() ? PAD_FOR_ACTION[act] ?? null : null;
}

/**
 * Badge showing what triggers `act` for `seat` — the bound key on a small cap,
 * or the controller button once a pad is in use. Anchored by its bottom-right
 * corner so it can be tucked into the corner of an icon, and drawn on an opaque
 * plate because it sits over artwork rather than flat background.
 *
 * Reads the binding live, so a rebind shows up without any cache to invalidate.
 */
export function drawActionBadge(ctx, seat, act, rightX, bottomY, h = 16) {
  const pad = usingGamepad() ? PAD_FOR_ACTION[act] : null;
  const label = pad ? null : keyLabel(codeFor(seat, act));

  ctx.save();
  ctx.font = fontBody(h * 0.62, 700);
  const w = pad ? h : Math.max(h, ctx.measureText(label).width + h * 0.55);
  const x = rightX - w;
  const y = bottomY - h;

  rr(ctx, x, y, w, h, h * 0.28);
  ctx.fillStyle = "rgba(8,12,24,0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();

  if (pad) {
    drawPadGlyph(ctx, pad, x + w / 2, y + h / 2, h * 0.66);
  } else {
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  }
  ctx.restore();
}
