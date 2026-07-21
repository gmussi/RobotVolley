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
import { codeFor } from "../data/controls.js";

export { W, H, FLOOR_Y, PHYSICS_STEP };

// ---- Shared state ----
export const score = [0, 0];
export const ball = {
  x: W * 0.25, y: 150, vx: 0, vy: 0, r: BALL_R,
  spin: 0, live: false, lastHitBy: null,
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

export const menuOptions = [
  { mode: "1p", label: "1 PLAYER", sub: "vs CPU", x: 0, y: 0, w: 0, h: 0 },
  { mode: "2p", label: "2 PLAYERS", sub: "human vs human", x: 0, y: 0, w: 0, h: 0 },
];

export function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

export function updateRobotParts(r) {
  const { x, y, w, h } = r;
  const armDrop = r.onGround ? 0 : -8;
  r.parts.head = { x: x + w / 2 - 22, y: y - HEAD_TOP_OFFSET, w: 44, h: 34 };
  r.parts.torso = { x: x + 4, y: y + 26, w: w - 8, h: h - 56 };
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
    flapsUsed: 0,
    squash: 0,
    eyeBlink: 0,
    flapFx: 0,
    colors: { ...(side < 0 ? DEFAULT_COLORS.p1 : DEFAULT_COLORS.p2) },
    parts: {},
  };
  updateRobotParts(r);
  return r;
}

export const robots = [makeRobot(-1), makeRobot(+1)];
export const P1 = robots[0];
export const P2 = robots[1];

// ---- Game flow ----
export function resetPositions() {
  for (const r of robots) {
    r.x = (r.side < 0 ? W * 0.25 : W * 0.75) - ROBOT_W / 2;
    r.y = FLOOR_Y - ROBOT_H;
    r.vx = 0; r.vy = 0; r.onGround = true; r.squash = 0; r.flapsUsed = 0;
  }
}

export function prepareServe() {
  resetPositions();
  ball.live = false;
  ball.vx = 0; ball.vy = 0; ball.spin = 0;
  ball.lastHitBy = null;
  ball.x = servingSide < 0 ? W * 0.25 : W * 0.75;
  ball.y = (FLOOR_Y - ROBOT_H) - 60;
  state = "serve";
  serveCharging = false;
  serveCharge = 0;
  cpuServeTimer = (gameMode === "1p" && servingSide > 0) ? 0.9 : 0;
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
}

export function startGame(mode) {
  gameMode = mode;
  score[0] = 0; score[1] = 0;
  winner = null;
  servingSide = Math.random() < 0.5 ? -1 : 1;
  prepareServe();
}

export function toMenu() {
  state = "menu";
  winner = null;
}

export function awardPoint(scorer) {
  score[scorer]++;
  ball.live = false;
  if (score[scorer] >= WIN_SCORE) {
    winner = scorer;
    state = "over";
    bannerText = `PLAYER ${scorer + 1} WINS!`;
  } else {
    bannerText = `POINT — PLAYER ${scorer + 1}`;
    state = "point";
    messageTimer = 1.3;
    servingSide = scorer === 0 ? 1 : -1;
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
  const accel = r.onGround ? MOVE_ACCEL : AIR_ACCEL;
  const target = r.moveDir * MOVE_SPEED;
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
    }
  } else if (r.jumpHeld && r.onGround) {
    r.vy = -(r.legType === "power" ? POWER_JUMP_V : JUMP_V);
    r.onGround = false;
    r.squash = 0;
  }

  r.vy += GRAVITY * dt;
  r.x += r.vx * dt;
  r.y += r.vy * dt;

  if (r.y - HEAD_TOP_OFFSET < 0) {
    r.y = HEAD_TOP_OFFSET;
    if (r.vy < 0) r.vy = 0;
  }

  if (r.y + r.h >= FLOOR_Y) {
    if (!r.onGround && r.vy > 300) r.squash = Math.min(1, r.vy / JUMP_V);
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
  updateRobotParts(r);
}

// ---- Ball collisions ----
function collideBallRobot(r) {
  const cx = ball.x, cy = ball.y;
  const nearestX = Math.max(r.x, Math.min(cx, r.x + r.w));
  const nearestY = Math.max(r.y, Math.min(cy, r.y + r.h));
  let dx = cx - nearestX;
  let dy = cy - nearestY;
  let dist = Math.hypot(dx, dy);
  if (dist > ball.r) return false;

  let nx, ny;
  if (dist === 0) {
    const toLeft = cx - r.x, toRight = r.x + r.w - cx;
    const toTop = cy - r.y, toBottom = r.y + r.h - cy;
    const m = Math.min(toLeft, toRight, toTop, toBottom);
    if (m === toTop) { nx = 0; ny = -1; }
    else if (m === toBottom) { nx = 0; ny = 1; }
    else if (m === toLeft) { nx = -1; ny = 0; }
    else { nx = 1; ny = 0; }
    dist = 0.01;
  } else {
    nx = dx / dist; ny = dy / dist;
  }

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

  const incomingSpeed = Math.hypot(ball.vx, ball.vy);
  const preVy = ball.vy;
  const topFall = ny < -0.4 && preVy > TOP_FALL_MIN_VY;

  let restitution = r.onGround ? GROUND_RESTITUTION : AIR_RESTITUTION;
  if (topFall) {
    restitution = r.onGround ? TOP_FALL_RESTITUTION_GROUND : TOP_FALL_RESTITUTION_AIR;
  }

  const j = -(1 + restitution) * velAlongNormal;
  ball.vx += j * nx;
  ball.vy += j * ny;
  ball.vx += r.vx * 0.33;
  ball.vy += r.vy * 0.28;

  if (ny < -0.4) {
    const offset = (cx - (r.x + r.w / 2)) / (r.w / 2);
    ball.spin = offset * 6 + r.vx * 0.008;

    if (topFall) {
      // Lateral redirect from where the ball landed + robot movement only.
      // No automatic forward/back shove when standing still.
      ball.vx += offset * 90;
      if (Math.abs(r.vx) > 50) ball.vx += r.vx * 0.55;

      const minUp = TOP_HEAD_MIN_BOUNCE_VY;
      const maxUp = Math.max(minUp, preVy * (r.onGround
        ? TOP_HEAD_MAX_UP_FRAC_GROUND : TOP_HEAD_MAX_UP_FRAC_AIR));
      if (ball.vy > -minUp) ball.vy = -minUp;
      else if (ball.vy < -maxUp) ball.vy = -maxUp;
    } else {
      ball.vx += offset * 150;
    }
  }

  const newSpeed = Math.hypot(ball.vx, ball.vy);
  const allowed = Math.min(newSpeed, incomingSpeed + HIT_SPEED_GAIN, BALL_MAX_SPEED);
  if (newSpeed > allowed && newSpeed > 0) {
    ball.vx *= allowed / newSpeed;
    ball.vy *= allowed / newSpeed;
  }

  // Head hits must always pop the ball up enough to keep the rally alive —
  // applied after the speed cap so a low incoming speed can't zero it out.
  if (ny < -0.4 && r.onGround && ball.vy > -TOP_HEAD_MIN_BOUNCE_VY) {
    ball.vy = -TOP_HEAD_MIN_BOUNCE_VY;
  }

  ball.lastHitBy = r.side;
  r.eyeBlink = 0.12;
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
  }
}

export function updateBall(dt) {
  if (!ball.live) return;

  ball.vy += BALL_GRAVITY * dt;
  ball.vx += ball.spin * 12 * dt;
  ball.spin *= Math.pow(0.2, dt);

  const prevX = ball.x, prevY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * 0.95; }
  if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx) * 0.95; }

  collideBallNet(prevX, prevY);
  for (const r of robots) collideBallRobot(r);

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
}

export function readInput(keys, controlMap) {
  if (state === "menu") {
    for (const r of robots) { r.moveDir = 0; r.jumpHeld = false; }
    return;
  }
  for (let i = 0; i < 2; i++) {
    const r = robots[i];
    if (gameMode === "1p" && i === 1) { aiControl(r); continue; }
    const L = keys.has(codeFor(i, "left"));
    const R = keys.has(codeFor(i, "right"));
    r.moveDir = (R ? 1 : 0) - (L ? 1 : 0);
    r.jumpHeld = keys.has(codeFor(i, "jump"));
  }
}

export function tickServe(dt) {
  if (state === "point") {
    messageTimer -= dt;
    if (messageTimer <= 0) prepareServe();
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
  for (const r of robots) updateRobot(r, PHYSICS_STEP);
  if (state === "play") updateBall(PHYSICS_STEP);
  else if (state === "serve") {
    const s = servingSide < 0 ? P1 : P2;
    ball.x = s.x + s.w / 2;
    ball.y = s.y - 60;
  }
}
