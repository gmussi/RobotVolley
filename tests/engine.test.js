import { describe, it, expect } from "vitest";
import {
  W, H, FLOOR_Y, WIN_SCORE, BALL_R, NET, ROBOT_W,
} from "../src/data/constants.js";
import {
  ball, score, makeRobot, updateRobotParts, predictBallX,
  serveBall, awardPoint, resetPositions, robots,
  collideBallRobot, resolveBallRobotContact, getHeadSpec,
  updateBall, PHYSICS_STEP,
} from "../src/engine/game.js";
import { HEAD_TYPES } from "../src/data/heads.js";

describe("constants", () => {
  it("arena dimensions are fixed", () => {
    expect(W).toBe(1000);
    expect(H).toBe(600);
    expect(FLOOR_Y).toBe(560);
  });

  it("net sits at center", () => {
    expect(NET.x + NET.w / 2).toBeCloseTo(W / 2, 5);
  });
});

describe("robots", () => {
  it("creates left and right robots on opposite sides", () => {
    const left = makeRobot(-1);
    const right = makeRobot(+1);
    expect(left.x).toBeLessThan(right.x);
    expect(left.side).toBe(-1);
    expect(right.side).toBe(1);
  });

  it("populates body parts", () => {
    const r = makeRobot(-1);
    updateRobotParts(r);
    expect(r.parts.head).toBeDefined();
    expect(r.parts.torso.w).toBeGreaterThan(0);
  });

  it("sizes dome head wider than standard", () => {
    const r = makeRobot(-1);
    r.headType = "dome";
    updateRobotParts(r);
    expect(r.parts.head.w).toBe(HEAD_TYPES.dome.w);
    expect(r.parts.head.w).toBeGreaterThan(HEAD_TYPES.standard.w);
  });

  it("extends satellite head upward for dish reach", () => {
    const r = makeRobot(-1);
    r.headType = "standard";
    updateRobotParts(r);
    const standardTop = r.parts.head.y;

    r.headType = "satellite";
    updateRobotParts(r);
    expect(r.parts.head.y).toBeLessThan(standardTop);
    expect(r.parts.head.h).toBe(HEAD_TYPES.satellite.h + HEAD_TYPES.satellite.dishAbove);
  });

  it("defaults to standard head type", () => {
    const r = makeRobot(+1);
    expect(r.headType).toBe("standard");
    expect(getHeadSpec(r).w).toBe(44);
  });
});

describe("scoring", () => {
  it("awards points until win score", () => {
    score[0] = 0; score[1] = 0;
    ball.live = true;
    for (let i = 0; i < WIN_SCORE - 1; i++) awardPoint(0);
    expect(score[0]).toBe(WIN_SCORE - 1);
    awardPoint(0);
    expect(score[0]).toBe(WIN_SCORE);
  });
});

describe("ball", () => {
  it("serve launches toward opponent", () => {
    resetPositions();
    ball.live = false;
    serveBall(1);
    expect(ball.live).toBe(true);
    expect(ball.vy).toBeLessThan(0);
  });

  it("predictBallX returns a finite x", () => {
    ball.x = W / 2;
    ball.y = 200;
    ball.vx = 100;
    ball.vy = -200;
    ball.r = BALL_R;
    const px = predictBallX(300, 200);
    expect(px).toBeGreaterThan(0);
    expect(px).toBeLessThan(W);
  });
});

describe("court layout", () => {
  it("robots start on their halves", () => {
    resetPositions();
    expect(robots[0].x + ROBOT_W / 2).toBeLessThan(W / 2);
    expect(robots[1].x + ROBOT_W / 2).toBeGreaterThan(W / 2);
  });
});

describe("head collisions", () => {
  function placeBallOnHead(r) {
    updateRobotParts(r);
    ball.live = true;
    ball.magnetHold = null;
    ball.spin = 0;
    ball.x = r.parts.head.x + r.parts.head.w / 2;
    ball.y = r.parts.head.y - ball.r + 3;
    ball.vx = 20;
    ball.vy = 180;
    r.vx = 0;
    r.vy = 0;
    r.onGround = true;
  }

  it("magnet head captures the ball on head contact", () => {
    const r = makeRobot(-1);
    r.headType = "magnet";
    placeBallOnHead(r);
    const hit = collideBallRobot(r);
    expect(hit).toBe(true);
    expect(ball.magnetHold).toEqual({ side: -1, timer: HEAD_TYPES.magnet.carryTime });
  });

  it("dome head bounces higher than standard on top fall", () => {
    const dome = makeRobot(-1);
    dome.headType = "dome";
    placeBallOnHead(dome);
    collideBallRobot(dome);
    const domeVy = ball.vy;

    const standard = makeRobot(-1);
    standard.headType = "standard";
    placeBallOnHead(standard);
    collideBallRobot(standard);
    expect(Math.abs(domeVy)).toBeGreaterThan(Math.abs(ball.vy));
  });

  it("drill head shoves harder when dashing", () => {
    const r = makeRobot(-1);
    r.headType = "drill";
    placeBallOnHead(r);
    r.vx = 0;
    collideBallRobot(r);
    const idleVx = ball.vx;

    placeBallOnHead(r);
    r.vx = 300;
    r.facing = 1;
    collideBallRobot(r);
    expect(ball.vx).toBeGreaterThan(idleVx + 200);
  });

  it("satellite resolves torso separately from head", () => {
    const r = makeRobot(-1);
    r.headType = "satellite";
    updateRobotParts(r);
    ball.x = r.parts.torso.x + r.parts.torso.w / 2;
    ball.y = r.parts.torso.y + r.parts.torso.h / 2;
    ball.vx = 0;
    ball.vy = -120;
    const contact = resolveBallRobotContact(r);
    expect(contact?.part).toBe("torso");
  });

  it("releases magnet hold after carry timer", () => {
    const r = makeRobot(-1);
    r.headType = "magnet";
    placeBallOnHead(r);
    collideBallRobot(r);
    ball.live = true;
    updateBall(PHYSICS_STEP);
    for (let i = 0; i < Math.ceil(HEAD_TYPES.magnet.carryTime / PHYSICS_STEP) + 2; i++) {
      updateBall(PHYSICS_STEP);
    }
    expect(ball.magnetHold).toBeNull();
    expect(ball.vy).toBeLessThan(0);
  });
});
