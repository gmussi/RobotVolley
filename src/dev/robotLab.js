/**
 * Dev-only visual harness for tuning the sprite-robot skeleton. Not shipped.
 * Serves at /robot-lab.html during `vite` dev.
 */
import { drawSpriteRobot, spritesReady } from "../ui/spriteRobot.js";
import { drawPartPreview } from "../ui/robotDraw.js";

const canvas = document.getElementById("lab");
const ctx = canvas.getContext("2d");

const BOX = { w: 88, h: 138 };

function bot(cx, floorTop, over = {}) {
  return {
    x: cx - BOX.w / 2,
    y: floorTop,
    w: BOX.w,
    h: BOX.h,
    side: -1,
    facing: 1,
    onGround: true,
    squash: 0,
    eyeBlink: 0,
    legType: "normal",
    torsoType: "standard",
    headType: "standard",
    armType: "hand",
    ...over,
  };
}

function label(text, x, y) {
  ctx.fillStyle = "#9aa4c0";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

let blinkT = 0;

function frame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // periodic blink across all bots
  blinkT += 1;
  const blink = blinkT % 140 < 8 ? 0.12 : 0;

  const floorA = 200;
  const floorB = 430;
  const floorC = 660;

  // Row 1: P1 vs P2 (tint + mirror check), then every head on standard body
  const heads = ["standard", "magnet", "drill"];
  let x = 90;
  drawSpriteRobot(ctx, bot(x, floorA - BOX.h, { side: -1, eyeBlink: blink }), floorA);
  label("P1 standard", x, floorA + 26);
  x += 150;
  drawSpriteRobot(ctx, bot(x, floorA - BOX.h, { side: 1, facing: -1, eyeBlink: blink }), floorA);
  label("P2 tinted", x, floorA + 26);
  x += 150;
  for (const h of heads) {
    drawSpriteRobot(ctx, bot(x, floorA - BOX.h, { headType: h, eyeBlink: blink }), floorA);
    label(h, x, floorA + 26);
    x += 150;
  }

  // Row 2: legs (the torso is fixed to the standard chassis)
  x = 90;
  for (const l of ["normal", "power", "rocket"]) {
    drawSpriteRobot(ctx, bot(x, floorB - BOX.h, { legType: l, eyeBlink: blink }), floorB);
    label("legs " + l, x, floorB + 26);
    x += 150;
  }

  // Row 3: weapons + a fully-loaded mix
  x = 90;
  for (const wn of ["axe", "ninjaStar"]) {
    drawSpriteRobot(ctx, bot(x, floorC - BOX.h, { armType: wn, eyeBlink: blink }), floorC);
    label("weapon " + wn, x, floorC + 26);
    x += 150;
  }
  x += 40;
  drawSpriteRobot(ctx, bot(x, floorC - BOX.h, {
    headType: "drill", legType: "power", armType: "axe", eyeBlink: blink,
  }), floorC);
  label("mix (P1)", x, floorC + 26);
  x += 160;
  drawSpriteRobot(ctx, bot(x, floorC - BOX.h, {
    side: 1, facing: -1, headType: "magnet",
    legType: "rocket", armType: "ninjaStar", eyeBlink: blink,
  }), floorC);
  label("mix (P2)", x, floorC + 26);

  // Deterministic blink-frame check: 0 = open, 0.12 = mid, 0.06 = closed.
  x += 190;
  for (const [eb, name] of [[0, "open"], [0.12, "mid"], [0.06, "closed"]]) {
    drawSpriteRobot(ctx, bot(x, floorC - BOX.h, { eyeBlink: eb }), floorC);
    label("blink " + name, x, floorC + 26);
    x += 130;
  }

  // Facing check: the same robot turned both ways. Head/torso must turn with
  // facing; arms and legs must look IDENTICAL in both (symmetric pair).
  let fx = 90;
  for (const [f, name] of [[1, "faces right"], [-1, "faces left"]]) {
    for (const side of [-1, 1]) {
      drawSpriteRobot(ctx, bot(fx, 800 - BOX.h, { facing: f, side }), 800);
      label(`${name} ${side < 0 ? "P1" : "P2"}`, fx, 800 + 26);
      fx += 140;
    }
    // weapon must be held on the side the robot faces
    drawSpriteRobot(ctx, bot(fx, 800 - BOX.h, { facing: f, armType: "axe" }), 800);
    label(`axe ${name}`, fx, 800 + 26);
    fx += 170;
  }

  // Row 4: the part thumbnails used by the HUD chips / lottery reels / customize.
  const chip = 76;
  let px = 90;
  const previews = [
    ["headType", "standard"], ["headType", "drill"], ["headType", "magnet"],
    ["legType", "rocket"], ["legType", "power"],
    ["armType", "hand"], ["armType", "axe"], ["armType", "ninjaStar"],
  ];
  for (const [slotKey, typeId] of previews) {
    for (const side of [-1, 1]) {
      const cyc = 900;
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.strokeRect(px - chip / 2, cyc - chip / 2, chip, chip);
      drawPartPreview(ctx, slotKey, typeId, px, cyc, chip, {}, { side });
      px += chip + 4;
    }
    px += 10;
  }
  label("part thumbnails — P1 / P2 pairs", 420, 950);

  requestAnimationFrame(frame);
}

function start() {
  if (!spritesReady()) return void setTimeout(start, 60);
  frame();
}
start();
