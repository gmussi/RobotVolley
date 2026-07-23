/**
 * Core game state and rules. Pure logic — no DOM or canvas imports.
 */
import {
  W, H, FLOOR_Y, GRAVITY, BALL_GRAVITY, WIN_SCORE,
  SERVE_CHARGE_TIME, SERVE_CHARGE_FLOOR, SERVE_MIN_SPEED, SERVE_MAX_SPEED,
  SERVE_DIR_X, SERVE_DIR_Y, GROUND_RESTITUTION, AIR_RESTITUTION,
  TOP_FALL_RESTITUTION_GROUND, TOP_FALL_RESTITUTION_AIR, TOP_FALL_MIN_VY,
  TOP_HEAD_MIN_BOUNCE_VY, TOP_HEAD_MAX_UP_FRAC_GROUND, TOP_HEAD_MAX_UP_FRAC_AIR,
  HIT_SPEED_GAIN, BALL_MAX_SPEED, NET, ROBOT_W, ROBOT_H, MOVE_SPEED,
  MOVE_ACCEL, JUMP_V, AIR_ACCEL, ARM_OVERHANG, COURT_GAP, HEAD_TOP_OFFSET,
  POWER_JUMP_V, ROCKET_FLAP_V, ROCKET_MAX_FLAPS, BALL_R, NET_BOUNCE,
  PHYSICS_STEP, DEFAULT_COLORS,
} from "../data/constants.js";
import { HEAD_TYPES, HEAD_TYPE_IDS } from "../data/heads.js";
import { TORSO_TYPES, TORSO_TYPE_IDS } from "../data/torsos.js";
import { ARM_TYPES, ARM_TYPE_IDS } from "../data/arms.js";
import { codeFor } from "../data/controls.js";

export { W, H, FLOOR_Y, PHYSICS_STEP };

// ---- Audio events (drained by main.js; engine never imports audio) ----
export const audioEvents = [];

function emitAudio(type, data = {}) {
  audioEvents.push({ type, ...data });
}

// ---- Shared state ----
export const score = [0, 0];
export const ball = {
  x: W * 0.25, y: 150, vx: 0, vy: 0, r: BALL_R,
  spin: 0, live: false, lastHitBy: null, magnetHold: null, smashBy: null,
};

export let state = "menu";
export let gameMode = null;
export let servingSide = -1;
export let messageTimer = 0;
export let cpuServeTimer = 0;
export let serveCharging = false;
export let serveCharge = 0;
export let bannerText = "";
export let winner = null;
export let lotteryResults = [null, null];
export let lotteryTimer = 0;
export let lotteryTick = 0;
let rallyIndex = 0;

export const LOTTERY_SPIN_DURATION = 3;
export const LOTTERY_HOLD_DURATION = 1;
export const LOTTERY_TOTAL_DURATION = LOTTERY_SPIN_DURATION + LOTTERY_HOLD_DURATION;

const LEG_TYPES = {
  normal: { label: "Robot", description: "Normal jump" },
  power: { label: "Power", description: "Jump higher" },
  rocket: { label: "Rocket", description: "Many small jumps — tap repeatedly, like Flappy Bird" },
};
const LEG_TYPE_IDS = Object.keys(LEG_TYPES);

const PART_SLOTS = [
  { key: "headType", ids: HEAD_TYPE_IDS, labels: HEAD_TYPES },
  { key: "torsoType", ids: TORSO_TYPE_IDS, labels: TORSO_TYPES },
  { key: "legType", ids: LEG_TYPE_IDS, labels: LEG_TYPES },
  { key: "armType", ids: ARM_TYPE_IDS, labels: ARM_TYPES },
];

function pickRandomOther(ids, current) {
  const others = ids.filter((id) => id !== current);
  const pool = others.length ? others : ids;
  return pool[Math.floor(Math.random() * pool.length)];
}

function partSlotName(key) {
  if (key === "headType") return "head";
  if (key === "torsoType") return "torso";
  if (key === "armType") return "arms";
  return "feet";
}

function partTypeLabel(slot, typeId) {
  const info = slot.labels[typeId];
  return typeof info === "string" ? info : info?.label ?? typeId;
}

function partTypeDescription(slot, typeId) {
  const info = slot.labels[typeId];
  return typeof info === "string" ? "" : info?.description ?? "";
}

export function planPartLottery() {
  lotteryResults = robots.map((r) => {
    const slot = PART_SLOTS[Math.floor(Math.random() * PART_SLOTS.length)];
    const oldType = r[slot.key];
    const newType = pickRandomOther(slot.ids, oldType);
    return {
      slotKey: slot.key,
      slotName: partSlotName(slot.key),
      oldType,
      newType,
      oldLabel: partTypeLabel(slot, oldType),
      newLabel: partTypeLabel(slot, newType),
      newDescription: partTypeDescription(slot, newType),
      options: slot.ids.map((id) => ({
        id,
        label: partTypeLabel(slot, id),
      })),
      reelCycles: 4 + Math.random() * 3,
    };
  });
}

export function commitPartLottery() {
  for (let i = 0; i < robots.length; i++) {
    const pick = lotteryResults[i];
    if (!pick) continue;
    robots[i][pick.slotKey] = pick.newType;
    updateRobotParts(robots[i]);
  }
  lotteryTick++;
  emitAudio("lottery_land");
}

function setupServePhase() {
  ball.live = false;
  ball.vx = 0; ball.vy = 0; ball.spin = 0;
  ball.lastHitBy = null;
  ball.magnetHold = null;
  ball.smashBy = null;
  ball.x = servingSide < 0 ? W * 0.25 : W * 0.75;
  ball.y = (FLOOR_Y - ROBOT_H) - 60;
  state = "serve";
  serveCharging = false;
  serveCharge = 0;
  cpuServeTimer = (gameMode === "1p" && servingSide > 0) ? 0.9 : 0;
}

function enterServePhase() {
  commitPartLottery();
  setupServePhase();
}

export const menuOptions = [
  { mode: "1p", label: "SINGLE PLAYER", disabled: false, x: 0, y: 0, w: 0, h: 0 },
  { mode: "2p", label: "TWO PLAYERS", disabled: false, x: 0, y: 0, w: 0, h: 0 },
  { mode: null, label: "ONLINE MATCH", disabled: false, x: 0, y: 0, w: 0, h: 0 },
  { mode: null, action: "controls", label: "CONTROLS", disabled: false, x: 0, y: 0, w: 0, h: 0 },
  { mode: null, action: "settings", label: "SETTINGS", disabled: false, x: 0, y: 0, w: 0, h: 0 },
];

// Single Player is highlighted by default.
export let menuIndex = 0;

export function setMenuIndex(i) {
  if (i >= 0 && i < menuOptions.length) menuIndex = i;
}

export function menuMove(delta) {
  const n = menuOptions.length;
  menuIndex = (menuIndex + delta + n) % n;
}

// Returns true if an actual game mode was started.
export function menuSelect() {
  const o = menuOptions[menuIndex];
  if (!o || o.disabled) return false;
  if (o.action === "controls") {
    submenuReturnState = "menu";
    state = "controls";
    return false;
  }
  if (o.action === "settings") {
    submenuReturnState = "menu";
    state = "settings";
    return false;
  }
  if (o.action === "customize") {
    return false;
  }
  // Placeholder entries (no mode yet) can be highlighted/selected but launch nothing.
  if (!o.mode) return false;
  startGame(o.mode);
  return true;
}

export function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

export function getHeadSpec(r) {
  return HEAD_TYPES[r.headType] ?? HEAD_TYPES.standard;
}

export function getTorsoSpec(r) {
  return TORSO_TYPES[r.torsoType] ?? TORSO_TYPES.standard;
}

export function getArmSpec(r) {
  return ARM_TYPES[r.armType] ?? ARM_TYPES.hand;
}

export function updateRobotParts(r) {
  const { x, y, w, h } = r;
  const armDrop = r.onGround ? 0 : -8;
  const headSpec = getHeadSpec(r);
  const torsoSpec = getTorsoSpec(r);
  const cx = x + w / 2;
  r.parts.head = {
    x: cx - headSpec.w / 2,
    y: y - HEAD_TOP_OFFSET - headSpec.dishAbove,
    w: headSpec.w,
    h: headSpec.h + headSpec.dishAbove,
  };
  r.parts.torso = {
    x: x + 4 + torsoSpec.torsoXOff,
    y: y + 26 + torsoSpec.torsoYOff,
    w: w - 8 + torsoSpec.torsoWExtra,
    h: h - 56 + torsoSpec.torsoHExtra,
  };
  r.parts.armL = { x: x - ARM_OVERHANG, y: y + 30 + armDrop, w: 12, h: 40 };
  r.parts.armR = { x: x + w - (12 - ARM_OVERHANG), y: y + 30 + armDrop, w: 12, h: 40 };
  r.parts.legL = { x: x + 10, y: y + h - 34, w: 20, h: 34 };
  r.parts.legR = { x: x + w - 30, y: y + h - 34, w: 20, h: 34 };
  r.parts.footL = { x: x + 4, y: y + h - 10, w: 30, h: 12 };
  r.parts.footR = { x: x + w - 34, y: y + h - 10, w: 30, h: 12 };
}

export function makeRobot(side) {
  const startX = side < 0 ? W * 0.25 : W * 0.75;
  const r = {
    side,
    x: startX - ROBOT_W / 2,
    y: FLOOR_Y - ROBOT_H,
    vx: 0, vy: 0,
    w: ROBOT_W, h: ROBOT_H,
    onGround: true,
    facing: side < 0 ? 1 : -1,
    moveDir: 0,
    jumpHeld: false,
    jumpPrevHeld: false,
    legType: "normal",
    headType: "standard",
    torsoType: "standard",
    armType: "hand",
    flapsUsed: 0,
    squash: 0,
    eyeBlink: 0,
    flapFx: 0,
    magnetFx: 0,
    drillAngle: 0,
    cogAngle: 0,
    attackCooldown: 0,
    attackHeld: false,
    attackPrevHeld: false,
    attack: null,
    colors: { ...(side < 0 ? DEFAULT_COLORS.p1 : DEFAULT_COLORS.p2) },
    parts: {},
  };
  updateRobotParts(r);
  return r;
}

export const robots = [makeRobot(-1), makeRobot(+1)];
export const P1 = robots[0];
export const P2 = robots[1];

export function resetRobots() {
  for (const r of robots) {
    r.legType = "normal";
    r.headType = "standard";
    r.torsoType = "standard";
    r.armType = "hand";
    r.flapsUsed = 0;
    r.magnetFx = 0;
    r.attack = null;
    r.attackCooldown = 0;
    updateRobotParts(r);
  }
  lotteryResults = [null, null];
  lotteryTimer = 0;
  lotteryTick++;
}

// ---- Game flow ----
export function resetPositions() {
  for (const r of robots) {
    r.x = (r.side < 0 ? W * 0.25 : W * 0.75) - ROBOT_W / 2;
    r.y = FLOOR_Y - ROBOT_H;
    r.vx = 0; r.vy = 0; r.onGround = true; r.squash = 0; r.flapsUsed = 0;
    r.magnetFx = 0;
    r.attack = null;
    r.attackCooldown = 0;
  }
}

export function prepareServe() {
  resetPositions();
  if (rallyIndex === 0) {
    rallyIndex++;
    setupServePhase();
    return;
  }
  planPartLottery();
  lotteryTimer = LOTTERY_TOTAL_DURATION;
  state = "lottery";
}

export function serveBall(charge) {
  ball.live = true;
  const speed = SERVE_MIN_SPEED + (SERVE_MAX_SPEED - SERVE_MIN_SPEED) * charge;
  ball.vx = speed * SERVE_DIR_X * -servingSide;
  ball.vy = speed * SERVE_DIR_Y;
  ball.spin = 0;
  serveCharging = false;
  serveCharge = 0;
  state = "play";
  emitAudio("serve_launch", { charge });
}

export function startGame(mode) {
  gameMode = mode;
  score[0] = 0; score[1] = 0;
  winner = null;
  rallyIndex = 0;
  resetRobots();
  servingSide = Math.random() < 0.5 ? -1 : 1;
  prepareServe();
}

export function toMenu() {
  state = "menu";
  winner = null;
  pauseFromState = null;
}

// ---- Pause ----
const PAUSABLE_STATES = new Set(["serve", "play", "lottery", "point"]);

export let pauseFromState = null;
/** @type {"menu"|"pause"} */
export let submenuReturnState = "menu";

export const pauseOptions = [
  { action: "resume", label: "RESUME", x: 0, y: 0, w: 0, h: 0 },
  { action: "settings", label: "SETTINGS", x: 0, y: 0, w: 0, h: 0 },
  { action: "controls", label: "CONTROLS", x: 0, y: 0, w: 0, h: 0 },
  { action: "quit", label: "QUIT", x: 0, y: 0, w: 0, h: 0 },
];

export let pauseIndex = 0;

export function setPauseIndex(i) {
  if (i >= 0 && i < pauseOptions.length) pauseIndex = i;
}

export function canPause() {
  return PAUSABLE_STATES.has(state);
}

export function pauseGame() {
  if (!canPause()) return false;
  pauseFromState = state;
  state = "pause";
  pauseIndex = 0;
  return true;
}

export function resumeFromPause() {
  if (state !== "pause" || !pauseFromState) return false;
  state = pauseFromState;
  pauseFromState = null;
  return true;
}

export function togglePause() {
  if (state === "pause") return resumeFromPause();
  return pauseGame();
}

export function pauseMove(delta) {
  const n = pauseOptions.length;
  pauseIndex = (pauseIndex + delta + n) % n;
}

export function pauseSelect() {
  const o = pauseOptions[pauseIndex];
  if (!o) return;
  if (o.action === "resume") resumeFromPause();
  else if (o.action === "settings") {
    submenuReturnState = "pause";
    state = "settings";
  } else if (o.action === "controls") {
    submenuReturnState = "pause";
    state = "controls";
  } else if (o.action === "quit") {
    pauseFromState = null;
    toMenu();
  }
}

export function leaveSubmenu() {
  const back = submenuReturnState;
  submenuReturnState = "menu";
  if (back === "pause" && pauseFromState) state = "pause";
  else state = "menu";
}

export function awardPoint(scorer) {
  score[scorer]++;
  ball.live = false;
  ball.magnetHold = null;
  ball.smashBy = null;
  if (score[scorer] >= WIN_SCORE) {
    winner = scorer;
    state = "over";
    bannerText = `PLAYER ${scorer + 1} WINS!`;
    emitAudio("match_win");
  } else {
    bannerText = `POINT — PLAYER ${scorer + 1}`;
    state = "point";
    messageTimer = 1.3;
    servingSide = scorer === 0 ? 1 : -1;
    emitAudio("point_score");
  }
}

// ---- Serve input ----
export function isServerKey(code, controlMap) {
  const ctrl = controlMap[code];
  const serverPlayer = servingSide < 0 ? 0 : 1;
  return ctrl && ctrl.act === "serve" && ctrl.player === serverPlayer;
}

export function handleServeKeyDown(code, controlMap) {
  if (state !== "serve") return;
  if (gameMode === "1p" && servingSide > 0) return;
  if (isServerKey(code, controlMap) && !serveCharging) {
    serveCharging = true;
    serveCharge = SERVE_CHARGE_FLOOR;
  }
}

export function handleServeKeyUp(code, controlMap) {
  if (state !== "serve" || !serveCharging) return;
  if (isServerKey(code, controlMap)) serveBall(serveCharge);
}

// ---- Robot physics ----
export function updateRobot(r, dt) {
  const torso = getTorsoSpec(r);
  const accelMul = r.onGround ? torso.groundAccelMul : torso.airAccelMul;
  const accel = (r.onGround ? MOVE_ACCEL : AIR_ACCEL) * accelMul;
  const target = r.moveDir * MOVE_SPEED * torso.moveSpeedMul;
  if (r.vx < target) r.vx = Math.min(target, r.vx + accel * dt);
  else if (r.vx > target) r.vx = Math.max(target, r.vx - accel * dt);
  if (r.moveDir !== 0) r.facing = r.moveDir;

  const jumpPressed = r.jumpHeld && !r.jumpPrevHeld;
  r.jumpPrevHeld = r.jumpHeld;

  if (r.legType === "rocket") {
    if (jumpPressed && r.flapsUsed < ROCKET_MAX_FLAPS) {
      r.vy = -ROCKET_FLAP_V;
      r.onGround = false;
      r.squash = 0;
      r.flapFx = 0.18;
      r.flapsUsed++;
      emitAudio("rocket_flap");
    }
  } else if (r.jumpHeld && r.onGround) {
    const baseJump = r.legType === "power" ? POWER_JUMP_V : JUMP_V;
    r.vy = -baseJump * torso.jumpMul;
    r.onGround = false;
    r.squash = 0;
  }

  const gravityMul = r.onGround ? 1 : torso.airGravityMul;
  r.vy += GRAVITY * gravityMul * dt;
  r.x += r.vx * dt;
  r.y += r.vy * dt;

  if (r.y - (HEAD_TOP_OFFSET + getHeadSpec(r).dishAbove) < 0) {
    r.y = HEAD_TOP_OFFSET + getHeadSpec(r).dishAbove;
    if (r.vy < 0) r.vy = 0;
  }

  if (r.y + r.h >= FLOOR_Y) {
    if (!r.onGround && r.vy > 300) {
      r.squash = Math.min(1, (r.vy / JUMP_V) * torso.squashMul);
    }
    r.y = FLOOR_Y - r.h;
    r.vy = 0;
    r.onGround = true;
    r.flapsUsed = 0;
  }

  const minX = r.side < 0 ? 6 : NET.x + NET.w + COURT_GAP + ARM_OVERHANG;
  const maxX = r.side < 0 ? NET.x - COURT_GAP - ARM_OVERHANG - r.w : W - r.w - 6;
  if (r.x < minX) { r.x = minX; if (r.vx < 0) r.vx = 0; }
  if (r.x > maxX) { r.x = maxX; if (r.vx > 0) r.vx = 0; }

  r.squash *= Math.pow(0.001, dt);
  r.eyeBlink = Math.max(0, r.eyeBlink - dt);
  r.flapFx = Math.max(0, r.flapFx - dt);
  r.magnetFx = Math.max(0, r.magnetFx - dt);
  if (r.headType === "drill") r.drillAngle += dt * 22;
  if (r.torsoType === "lowCoG") r.cogAngle += dt * 3;
  updateAttack(r, dt);
  updateRobotParts(r);
}

// ---- Arm attack (orb sweep + thrown weapons) ----
/** Unit direction for a clock hour, mirrored so +x always points at the enemy. */
function attackDir(r, hour) {
  const a = (hour % 12) * Math.PI / 6;
  const enemyDir = -r.side;
  return { dx: Math.sin(a) * enemyDir, dy: -Math.cos(a) };
}

function attackOrigin(r) {
  return { cx: r.x + r.w / 2, cy: r.y + 30 };
}

function positionOrb(r) {
  const at = r.attack, spec = at.spec;
  const prog = Math.min(1, at.t / spec.windup);
  const hour = spec.startHour + (spec.endHour - spec.startHour) * prog;
  const { dx, dy } = attackDir(r, hour);
  const { cx, cy } = attackOrigin(r);
  at.cx = cx; at.cy = cy;
  at.x = cx + dx * spec.orbitR;
  at.y = cy + dy * spec.orbitR;
}

function startAttack(r) {
  const spec = getArmSpec(r);
  const { cx, cy } = attackOrigin(r);
  if (spec.kind === "orb") {
    r.attack = { kind: "orb", spec, t: 0, hitR: spec.hitR, connected: false,
      x: cx, y: cy, cx, cy, spin: 0 };
    positionOrb(r);
  } else {
    const { dx, dy } = attackDir(r, spec.launchHour);
    const reach = 34;
    r.attack = { kind: "projectile", spec, t: 0, hitR: spec.hitR, connected: false,
      x: cx + dx * reach, y: cy + dy * reach,
      vx: dx * spec.launchSpeed, vy: dy * spec.launchSpeed, spin: 0 };
  }
  emitAudio("attack_start");
}

function endAttack(r) {
  if (r.attack) r.attackCooldown = r.attack.spec.cooldown;
  r.attack = null;
}

export function updateAttack(r, dt) {
  if (r.attackCooldown > 0) r.attackCooldown = Math.max(0, r.attackCooldown - dt);

  const pressed = r.attackHeld && !r.attackPrevHeld;
  r.attackPrevHeld = r.attackHeld;

  if (!r.attack && pressed && state === "play" && r.attackCooldown <= 0) startAttack(r);

  const at = r.attack;
  if (!at) return;

  at.t += dt;
  if (at.spec.spinRate) at.spin += at.spec.spinRate * dt;

  if (at.kind === "orb") {
    positionOrb(r);
    if (at.t >= at.spec.windup) endAttack(r);
  } else {
    at.vy += at.spec.gravity * dt;
    at.x += at.vx * dt;
    at.y += at.vy * dt;
    if (at.x < -40 || at.x > W + 40 || at.y > FLOOR_Y + 40 || at.y < -600) endAttack(r);
  }
}

/**
 * Hand orb: contact-based smash. The ball is launched along the orb→ball
 * normal, so the angle depends on where the orb strikes it (hit from below →
 * flies up, from the side → flies across). The horizontal component is always
 * forced toward the enemy so it never smashes back over the smasher's own side.
 * Fired at bonus speed, above the normal cap.
 */
function smashBall(r) {
  const spec = getArmSpec(r);
  const at = r.attack;
  const enemyDir = -r.side;
  let nx = ball.x - at.x;
  let ny = ball.y - at.y;
  let d = Math.hypot(nx, ny);
  if (d < 0.001) { nx = enemyDir; ny = 0; d = 1; } // dead-centre fallback
  nx /= d; ny /= d;
  if (nx * enemyDir < 0) nx = -nx;
  ball.vx = nx * spec.smashSpeed;
  ball.vy = ny * spec.smashSpeed;
  ball.spin = enemyDir * 3;
  ball.lastHitBy = r.side;
  ball.smashBy = r.side;
  r.eyeBlink = 0.12;
  emitAudio("smash");
}

/** Axe / ninja star: ordinary redirect, kept under the normal speed cap. */
function deflectBall(r, at) {
  let nx = ball.x - at.x, ny = ball.y - at.y;
  const d = Math.hypot(nx, ny) || 1;
  nx /= d; ny /= d;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    const e = at.spec.deflectBounce;
    ball.vx -= (1 + e) * vn * nx;
    ball.vy -= (1 + e) * vn * ny;
  }
  ball.vx += at.vx * at.spec.impartVel;
  ball.vy += at.vy * at.spec.impartVel;
  ball.spin = -r.side * 2;
  ball.lastHitBy = r.side;
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > BALL_MAX_SPEED) { ball.vx *= BALL_MAX_SPEED / sp; ball.vy *= BALL_MAX_SPEED / sp; }
  r.eyeBlink = 0.12;
  emitAudio("deflect");
}

export function collideBallAttack(r) {
  const at = r.attack;
  if (!at || at.connected) return;
  const dx = ball.x - at.x, dy = ball.y - at.y;
  const rr = ball.r + at.hitR;
  if (dx * dx + dy * dy > rr * rr) return;
  at.connected = true;
  if (at.kind === "orb") smashBall(r);
  else { deflectBall(r, at); endAttack(r); }
}

function circleRectContact(cx, cy, cr, rect) {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  let dx = cx - nearestX;
  let dy = cy - nearestY;
  let dist = Math.hypot(dx, dy);
  if (dist > cr) return null;

  let nx, ny;
  if (dist === 0) {
    const toLeft = cx - rect.x, toRight = rect.x + rect.w - cx;
    const toTop = cy - rect.y, toBottom = rect.y + rect.h - cy;
    const m = Math.min(toLeft, toRight, toTop, toBottom);
    if (m === toTop) { nx = 0; ny = -1; }
    else if (m === toBottom) { nx = 0; ny = 1; }
    else if (m === toLeft) { nx = -1; ny = 0; }
    else { nx = 1; ny = 0; }
    dist = 0.01;
  } else {
    nx = dx / dist; ny = dy / dist;
  }
  return { nx, ny, dist };
}

function getDrillExtendRect(r, head) {
  const spec = HEAD_TYPES.drill;
  if (r.headType !== "drill" || Math.abs(r.vx) < spec.dashMinVx) return null;
  const h = spec.extendH;
  const w = spec.extendW + spec.extendOffset;
  const y = head.y + (head.h - h) / 2;
  if (r.facing > 0) return { x: head.x + head.w - 4, y, w, h };
  return { x: head.x - w + 4, y, w, h };
}

export function resolveBallRobotContact(r) {
  const cx = ball.x, cy = ball.y, cr = ball.r;
  const head = r.parts.head;
  const headRects = [head];
  const drillRect = getDrillExtendRect(r, head);
  if (drillRect) headRects.push(drillRect);

  for (const rect of headRects) {
    const c = circleRectContact(cx, cy, cr, rect);
    if (c) return { ...c, part: "head" };
  }

  const tc = circleRectContact(cx, cy, cr, r.parts.torso);
  if (tc) return { ...tc, part: "torso" };

  const bc = circleRectContact(cx, cy, cr, { x: r.x, y: r.y, w: r.w, h: r.h });
  if (bc) return { ...bc, part: "body" };
  return null;
}

function releaseMagnetHold(r) {
  const spec = HEAD_TYPES.magnet;
  ball.vy = spec.releaseVy;
  ball.vx = r.vx * spec.releaseVxMul + r.facing * spec.releaseFacingBoost;
  ball.spin = r.facing * 4;
  ball.magnetHold = null;
  r.magnetFx = 0;
  emitAudio("magnet_release");
}

function tickMagnetHold(dt) {
  const holder = robots.find((ro) => ro.side === ball.magnetHold.side);
  if (!holder) {
    ball.magnetHold = null;
    return;
  }

  const head = holder.parts.head;
  ball.x = head.x + head.w / 2;
  ball.y = head.y - ball.r;
  ball.vx = holder.vx;
  ball.vy = holder.vy;
  ball.magnetHold.timer -= dt;
  holder.magnetFx = Math.max(0, ball.magnetHold.timer);

  for (const r of robots) {
    if (r.side === holder.side) continue;
    if (collideBallRobot(r, { skipMagnet: true })) {
      ball.magnetHold = null;
      holder.magnetFx = 0;
      return;
    }
  }

  if (ball.magnetHold.timer <= 0) releaseMagnetHold(holder);
}

// ---- Ball collisions ----
export function collideBallRobot(r, opts = {}) {
  if (ball.magnetHold?.side === r.side && !opts.skipMagnet) return false;

  const contact = resolveBallRobotContact(r);
  if (!contact) return false;

  // The opponent touching a smashed ball resets it (the clamp below reslows it).
  if (ball.smashBy !== null && ball.smashBy !== r.side) ball.smashBy = null;

  const { nx, ny, dist, part } = contact;
  const cx = ball.x;

  const overlap = ball.r - dist;
  ball.x += nx * overlap;
  ball.y += ny * overlap;

  const rvx = ball.vx - r.vx;
  const rvy = ball.vy - r.vy;
  const velAlongNormal = rvx * nx + rvy * ny;
  if (velAlongNormal > 0) {
    ball.lastHitBy = r.side;
    return true;
  }

  if (part === "head" && r.headType === "magnet" && !ball.magnetHold && !opts.skipMagnet) {
    const spec = HEAD_TYPES.magnet;
    ball.magnetHold = { side: r.side, timer: spec.carryTime };
    r.magnetFx = spec.carryTime;
    ball.lastHitBy = r.side;
    r.eyeBlink = 0.12;
    emitAudio("magnet_catch");
    return true;
  }

  const incomingSpeed = Math.hypot(ball.vx, ball.vy);
  const preVy = ball.vy;
  const isHeadHit = part === "head";
  const topFall = isHeadHit && ny < -0.4 && preVy > TOP_FALL_MIN_VY;

  let restitution = r.onGround ? GROUND_RESTITUTION : AIR_RESTITUTION;
  if (topFall) {
    restitution = r.onGround ? TOP_FALL_RESTITUTION_GROUND : TOP_FALL_RESTITUTION_AIR;
  }
  if (isHeadHit && r.headType === "dome" && topFall) {
    restitution += HEAD_TYPES.dome.restitutionBonus;
  }
  if (part === "torso" && r.headType === "satellite") {
    restitution *= HEAD_TYPES.satellite.torsoRestitutionMul;
  }

  const j = -(1 + restitution) * velAlongNormal;
  ball.vx += j * nx;
  ball.vy += j * ny;
  ball.vx += r.vx * 0.33;
  ball.vy += r.vy * 0.28;

  let minBounceVy = TOP_HEAD_MIN_BOUNCE_VY;
  if (isHeadHit && r.headType === "dome") minBounceVy = HEAD_TYPES.dome.minBounceVy;

  if (isHeadHit) {
    const offset = (cx - (r.x + r.w / 2)) / (r.w / 2);
    ball.spin = offset * 6 + r.vx * 0.008;

    if (topFall) {
      const lateralBase = r.headType === "dome" ? 60 : 90;
      ball.vx += offset * lateralBase;
      if (Math.abs(r.vx) > 50) ball.vx += r.vx * 0.55;

      const maxUp = Math.max(minBounceVy, preVy * (r.onGround
        ? TOP_HEAD_MAX_UP_FRAC_GROUND : TOP_HEAD_MAX_UP_FRAC_AIR));
      if (ball.vy > -minBounceVy) ball.vy = -minBounceVy;
      else if (ball.vy < -maxUp) ball.vy = -maxUp;
    } else {
      ball.vx += offset * 150;
    }
  }

  if (isHeadHit && r.headType === "drill" && Math.abs(r.vx) > HEAD_TYPES.drill.shoveMinVx) {
    ball.vx += r.facing * HEAD_TYPES.drill.shoveBoost;
    emitAudio("drill_shove");
  }

  const newSpeed = Math.hypot(ball.vx, ball.vy);
  const allowed = Math.min(newSpeed, incomingSpeed + HIT_SPEED_GAIN, BALL_MAX_SPEED);
  if (newSpeed > allowed && newSpeed > 0) {
    ball.vx *= allowed / newSpeed;
    ball.vy *= allowed / newSpeed;
  }

  if (isHeadHit && r.onGround && ball.vy > -minBounceVy) {
    ball.vy = -minBounceVy;
  }

  ball.lastHitBy = r.side;
  r.eyeBlink = 0.12;
  emitAudio("ball_hit", { speed: Math.hypot(ball.vx, ball.vy), part });
  return true;
}

function collideBallNet(prevX, prevY) {
  const netCX = W / 2;
  const inPostHeight =
    Math.min(ball.y, prevY) + ball.r > NET.top &&
    Math.max(ball.y, prevY) - ball.r < FLOOR_Y;
  if (inPostHeight) {
    const prevSide = prevX < netCX ? -1 : 1;
    const curSide = ball.x < netCX ? -1 : 1;
    if (prevSide !== curSide) {
      if (prevSide < 0) {
        ball.x = NET.x - ball.r;
        ball.vx = -Math.abs(ball.vx) * NET_BOUNCE;
      } else {
        ball.x = NET.x + NET.w + ball.r;
        ball.vx = Math.abs(ball.vx) * NET_BOUNCE;
      }
      ball.spin *= 0.4;
      emitAudio("ball_net");
      return;
    }
  }

  const nx0 = NET.x, ny0 = NET.top, nx1 = NET.x + NET.w, ny1 = FLOOR_Y;
  const nearestX = Math.max(nx0, Math.min(ball.x, nx1));
  const nearestY = Math.max(ny0, Math.min(ball.y, ny1));
  let dx = ball.x - nearestX, dy = ball.y - nearestY;
  let dist = Math.hypot(dx, dy);
  if (dist > ball.r) return;
  let nX, nY;
  if (dist === 0) { nX = ball.x < netCX ? -1 : 1; nY = 0; dist = 0.01; }
  else { nX = dx / dist; nY = dy / dist; }
  const overlap = ball.r - dist;
  ball.x += nX * overlap;
  ball.y += nY * overlap;
  const vn = ball.vx * nX + ball.vy * nY;
  if (vn < 0) {
    ball.vx -= (1 + NET_BOUNCE) * vn * nX;
    ball.vy -= (1 + NET_BOUNCE) * vn * nY;
    emitAudio("ball_net");
  }
}

export function updateBall(dt) {
  if (!ball.live) return;

  if (ball.magnetHold) {
    tickMagnetHold(dt);
    if (ball.magnetHold) {
      if (ball.y + ball.r >= FLOOR_Y) {
        ball.y = FLOOR_Y - ball.r;
        ball.magnetHold = null;
        const landedLeft = ball.x < W / 2;
        awardPoint(landedLeft ? 1 : 0);
      }
      return;
    }
  }

  ball.vy += BALL_GRAVITY * dt;
  ball.vx += ball.spin * 12 * dt;
  ball.spin *= Math.pow(0.2, dt);

  const prevX = ball.x, prevY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx) * 0.95;
    emitAudio("ball_wall");
  }
  if (ball.x + ball.r > W) {
    ball.x = W - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.95;
    emitAudio("ball_wall");
  }

  collideBallNet(prevX, prevY);
  for (const r of robots) collideBallRobot(r);
  for (const r of robots) collideBallAttack(r);

  if (ball.y + ball.r >= FLOOR_Y) {
    ball.y = FLOOR_Y - ball.r;
    const landedLeft = ball.x < W / 2;
    awardPoint(landedLeft ? 1 : 0);
  }
}

// ---- CPU AI ----
export function predictBallX(hitY, maxSteps) {
  let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  const dt = PHYSICS_STEP;
  for (let i = 0; i < maxSteps; i++) {
    vy += BALL_GRAVITY * dt;
    x += vx * dt; y += vy * dt;
    if (x - ball.r < 0) { x = ball.r; vx = Math.abs(vx) * 0.95; }
    if (x + ball.r > W) { x = W - ball.r; vx = -Math.abs(vx) * 0.95; }
    if (vy > 0 && y >= hitY) return x;
  }
  return x;
}

export function aiControl(r) {
  const center = r.x + r.w / 2;
  const homeX = W * 0.72;
  const courtMin = NET.x + NET.w + r.w / 2 + 4;
  const courtMax = W - r.w / 2 - 6;

  let targetX = homeX;
  const ballHeadingHere = ball.live && (ball.vx > 0 || ball.x > W / 2 - 40);

  if (ball.live && ballHeadingHere) {
    let px = predictBallX(r.y + 12, 420);
    px = Math.max(courtMin, Math.min(courtMax, px));
    targetX = px + 6;
  }
  targetX = Math.max(courtMin, Math.min(courtMax, targetX));

  const diff = targetX - center;
  r.moveDir = Math.abs(diff) < 10 ? 0 : Math.sign(diff);

  const dx = Math.abs(ball.x - center);
  const inReachV = ball.y < r.y + 24 && ball.y > r.y - 150;
  const onMySide = ball.x > W / 2 - 30;
  r.jumpHeld = ball.live && r.onGround && onMySide && dx < 66 &&
               inReachV && ball.vy > -40;
  r.attackHeld = ball.live && onMySide && r.attackCooldown <= 0 && !r.attack &&
                 dx < 140 && ball.y > r.y - 130 && ball.y < r.y + r.h;
}

export function readInput(keys, controlMap) {
  if (state === "menu" || state === "lottery" || state === "controls" || state === "settings" || state === "pause") {
    for (const r of robots) { r.moveDir = 0; r.jumpHeld = false; r.attackHeld = false; }
    return;
  }
  for (let i = 0; i < 2; i++) {
    const r = robots[i];
    if (gameMode === "1p" && i === 1) { aiControl(r); continue; }
    const L = keys.has(codeFor(i, "left"));
    const R = keys.has(codeFor(i, "right"));
    r.moveDir = (R ? 1 : 0) - (L ? 1 : 0);
    r.jumpHeld = keys.has(codeFor(i, "jump"));
    r.attackHeld = keys.has(codeFor(i, "attack"));
  }
}

export function tickServe(dt) {
  if (state === "pause") return;
  if (state === "point") {
    messageTimer -= dt;
    if (messageTimer <= 0) prepareServe();
  }
  if (state === "lottery") {
    lotteryTimer -= dt;
    if (lotteryTimer <= 0) enterServePhase();
  }
  if (state === "serve" && serveCharging) {
    serveCharge = Math.min(1, serveCharge + dt / SERVE_CHARGE_TIME);
  }
  if (state === "serve" && cpuServeTimer > 0) {
    serveCharge = Math.min(0.75, serveCharge + dt * (0.75 / 0.9));
    cpuServeTimer -= dt;
    if (cpuServeTimer <= 0) serveBall(0.75);
  }
}

export function tickPhysics() {
  if (state === "pause") return;
  for (const r of robots) updateRobot(r, PHYSICS_STEP);
  if (state === "play") updateBall(PHYSICS_STEP);
  else if (state === "serve") {
    const s = servingSide < 0 ? P1 : P2;
    ball.x = s.x + s.w / 2;
    ball.y = s.y - 60;
  }
}
