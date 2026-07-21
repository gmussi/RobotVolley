import { describe, it, expect } from "vitest";
import {
  W, H, FLOOR_Y, WIN_SCORE, BALL_R, NET, ROBOT_W,
} from "../src/data/constants.js";
import {
  ball, score, makeRobot, updateRobotParts, predictBallX,
  serveBall, awardPoint, resetPositions, robots,
} from "../src/engine/game.js";

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
