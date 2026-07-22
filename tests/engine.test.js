import { describe, it, expect, vi } from "vitest";
import {
  W, H, FLOOR_Y, WIN_SCORE, BALL_R, NET, ROBOT_W,
} from "../src/data/constants.js";
import {
  ball, score, makeRobot, updateRobotParts, predictBallX,
  serveBall, awardPoint, resetPositions, robots,
  collideBallRobot, resolveBallRobotContact, getHeadSpec, getTorsoSpec,
  updateBall, updateRobot, PHYSICS_STEP, state,
  planPartLottery, commitPartLottery, prepareServe, startGame, lotteryResults, lotteryTick,
  tickServe, LOTTERY_TOTAL_DURATION,
} from "../src/engine/game.js";
import { HEAD_TYPES } from "../src/data/heads.js";
import { TORSO_TYPES } from "../src/data/torsos.js";

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

  it("defaults to standard torso type", () => {
    const r = makeRobot(+1);
    expect(r.torsoType).toBe("standard");
    expect(getTorsoSpec(r).jumpMul).toBe(1);
  });

  it("getTorsoSpec falls back to standard for unknown type", () => {
    const r = makeRobot(-1);
    r.torsoType = "unknown";
    expect(getTorsoSpec(r)).toBe(TORSO_TYPES.standard);
  });

  it("lowCoG torso sits lower than standard", () => {
    const standard = makeRobot(-1);
    standard.torsoType = "standard";
    updateRobotParts(standard);

    const low = makeRobot(-1);
    low.torsoType = "lowCoG";
    updateRobotParts(low);

    expect(low.parts.torso.w).toBe(standard.parts.torso.w);
    expect(low.parts.torso.y).toBeGreaterThan(standard.parts.torso.y);
  });

  it("heavy torso reduces jump velocity", () => {
    const heavy = makeRobot(-1);
    heavy.torsoType = "heavy";
    heavy.jumpHeld = true;
    heavy.jumpPrevHeld = false;
    updateRobot(heavy, PHYSICS_STEP);

    const light = makeRobot(-1);
    light.torsoType = "light";
    light.jumpHeld = true;
    light.jumpPrevHeld = false;
    updateRobot(light, PHYSICS_STEP);

    expect(Math.abs(light.vy)).toBeGreaterThan(Math.abs(heavy.vy));
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

describe("part lottery", () => {
  it("plans a different part option per robot without applying immediately", () => {
    const left = robots[0];
    const right = robots[1];
    left.headType = "standard";
    left.torsoType = "standard";
    left.legType = "normal";
    right.headType = "standard";
    right.torsoType = "standard";
    right.legType = "normal";

    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // head slot for P1
      .mockReturnValueOnce(0.99) // pick last head option
      .mockReturnValueOnce(2 / 3) // leg slot for P2
      .mockReturnValueOnce(0.99) // pick last leg option
      .mockReturnValueOnce(0.5) // reel cycles P1
      .mockReturnValueOnce(0.5); // reel cycles P2

    planPartLottery();

    expect(left.headType).toBe("standard");
    expect(right.legType).toBe("normal");
    expect(lotteryResults[0].slotName).toBe("head");
    expect(lotteryResults[0].newType).not.toBe("standard");
    expect(lotteryResults[1].slotName).toBe("feet");
    expect(lotteryResults[1].newType).not.toBe("normal");

    commitPartLottery();
    expect(left.headType).not.toBe("standard");
    expect(right.legType).not.toBe("normal");

    random.mockRestore();
  });

  it("skips lottery on the opening rally", () => {
    startGame("2p");
    expect(state).toBe("serve");
  });

  it("runs lottery before serve from the second rally onward", () => {
    startGame("2p");
    expect(state).toBe("serve");
    prepareServe();
    expect(state).toBe("lottery");
    tickServe(LOTTERY_TOTAL_DURATION);
    expect(state).toBe("serve");
  });
});
