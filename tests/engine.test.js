import { describe, it, expect, vi } from "vitest";
import {
  W, H, FLOOR_Y, WIN_SCORE, BALL_R, NET, ROBOT_W, BALL_MAX_SPEED,
} from "../src/data/constants.js";
import {
  ball, score, makeRobot, updateRobotParts, predictBallX,
  serveBall, awardPoint, resetPositions, robots,
  collideBallRobot, resolveBallRobotContact, getHeadSpec, getTorsoSpec, getArmSpec,
  updateBall, updateRobot, updateAttack, collideBallAttack, PHYSICS_STEP, state,
  planPartLottery, commitPartLottery, prepareServe, startGame, lotteryResults, lotteryTick,
  tickServe, LOTTERY_TOTAL_DURATION,
} from "../src/engine/game.js";
import { HEAD_TYPES } from "../src/data/heads.js";
import { TORSO_TYPES } from "../src/data/torsos.js";
import { ARM_TYPES } from "../src/data/arms.js";

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

    // Calls per robot, in order: slot pick, option pick, reel cycles.
    // With 4 part slots, slot index = floor(random * 4): 0 -> head, 0.5 -> legs.
    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // P1 head slot
      .mockReturnValueOnce(0.99) // P1 pick last head option
      .mockReturnValueOnce(0.5) // P1 reel cycles
      .mockReturnValueOnce(0.5) // P2 leg slot
      .mockReturnValueOnce(0.99) // P2 pick last leg option
      .mockReturnValueOnce(0.5); // P2 reel cycles

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

  it("resets robot parts when a new game starts", () => {
    const [left, right] = robots;
    left.headType = "drill";
    left.torsoType = "heavy";
    left.legType = "rocket";
    right.headType = "magnet";
    right.torsoType = "light";
    right.legType = "power";
    updateRobotParts(left);
    updateRobotParts(right);

    startGame("2p");

    expect(left.headType).toBe("standard");
    expect(left.torsoType).toBe("standard");
    expect(left.legType).toBe("normal");
    expect(right.headType).toBe("standard");
    expect(right.torsoType).toBe("standard");
    expect(right.legType).toBe("normal");
  });
});

describe("arm attacks", () => {
  it("defaults to the hand arm and resolves its spec", () => {
    const r = makeRobot(-1);
    expect(r.armType).toBe("hand");
    expect(getArmSpec(r).kind).toBe("orb");
  });

  it("getArmSpec falls back to hand for unknown type", () => {
    const r = makeRobot(-1);
    r.armType = "nope";
    expect(getArmSpec(r)).toBe(ARM_TYPES.hand);
  });

  it("hand orb smash launches along the orb→ball normal, above the cap", () => {
    const r = robots[0]; // side -1, enemy to the right
    r.armType = "hand";
    // Orb below-left of the ball → ball flies up and toward the enemy (+x, -y).
    r.attack = {
      kind: "orb", spec: ARM_TYPES.hand, t: 0, hitR: ARM_TYPES.hand.hitR,
      connected: false, x: 490, y: 310,
    };
    ball.live = true; ball.smashBy = null; ball.magnetHold = null;
    ball.x = 500; ball.y = 300; ball.vx = 0; ball.vy = 0;
    collideBallAttack(r);
    expect(ball.smashBy).toBe(r.side);
    expect(ball.vx).toBeGreaterThan(0); // toward the enemy (right)
    expect(ball.vy).toBeLessThan(0);    // upward — ball was above the orb
    expect(Math.hypot(ball.vx, ball.vy)).toBeGreaterThan(BALL_MAX_SPEED);
  });

  it("smash never sends the ball back over the smasher's own side", () => {
    const r = robots[0]; // enemy to the right
    r.armType = "hand";
    // Orb in front of (right of) the ball → raw normal points left; must flip.
    r.attack = {
      kind: "orb", spec: ARM_TYPES.hand, t: 0, hitR: ARM_TYPES.hand.hitR,
      connected: false, x: 510, y: 300,
    };
    ball.live = true; ball.smashBy = null; ball.magnetHold = null;
    ball.x = 500; ball.y = 300; ball.vx = 0; ball.vy = 0;
    collideBallAttack(r);
    expect(ball.vx).toBeGreaterThan(0); // flipped toward the enemy
  });

  it("axe throw deflects the ball within the normal cap and stays cold", () => {
    const r = robots[0];
    r.armType = "axe";
    r.attack = {
      kind: "projectile", spec: ARM_TYPES.axe, t: 0, hitR: ARM_TYPES.axe.hitR,
      connected: false, x: 500, y: 300, vx: 400, vy: 0, spin: 0,
    };
    ball.live = true; ball.smashBy = null; ball.magnetHold = null;
    ball.x = 505; ball.y = 300; ball.vx = -120; ball.vy = 0;
    collideBallAttack(r);
    expect(ball.smashBy).toBeNull();
    expect(r.attack).toBeNull(); // projectile despawns on hit
    expect(ball.vx).toBeGreaterThan(0); // redirected toward the axe's travel
    expect(Math.hypot(ball.vx, ball.vy)).toBeLessThanOrEqual(BALL_MAX_SPEED + 1);
  });

  it("axe projectile arcs downward while the ninja star flies straight", () => {
    const r = robots[0];
    r.attackHeld = false; r.attackPrevHeld = true;
    r.attack = {
      kind: "projectile", spec: ARM_TYPES.axe, t: 0, hitR: 20,
      connected: false, x: 300, y: 200, vx: 300, vy: -300, spin: 0,
    };
    for (let i = 0; i < 10; i++) updateAttack(r, PHYSICS_STEP);
    expect(r.attack.vy).toBeGreaterThan(-300); // gravity pulled it down

    r.attack = {
      kind: "projectile", spec: ARM_TYPES.ninjaStar, t: 0, hitR: 15,
      connected: false, x: 300, y: 200, vx: 500, vy: 0, spin: 0,
    };
    for (let i = 0; i < 10; i++) updateAttack(r, PHYSICS_STEP);
    expect(r.attack.vy).toBeCloseTo(0, 5); // no gravity
  });

  it("despawns a projectile that leaves the arena", () => {
    const r = robots[0];
    r.attackHeld = false; r.attackPrevHeld = true;
    r.attack = {
      kind: "projectile", spec: ARM_TYPES.ninjaStar, t: 0, hitR: 15,
      connected: false, x: W - 10, y: 200, vx: 8000, vy: 0, spin: 0,
    };
    updateAttack(r, PHYSICS_STEP);
    expect(r.attack).toBeNull();
  });

  it("cooldown blocks an immediate re-trigger", () => {
    startGame("2p");
    serveBall(0.5); // state = play
    const r = robots[0];
    r.armType = "hand";
    r.attack = null;
    r.attackCooldown = 1;
    r.attackHeld = true; r.attackPrevHeld = false;
    updateAttack(r, PHYSICS_STEP);
    expect(r.attack).toBeNull();
  });

  it("an opponent touch resets a hot ball back under the cap", () => {
    const p2 = robots[1];
    updateRobotParts(p2);
    ball.live = true;
    ball.smashBy = robots[0].side; // smashed by P1
    ball.magnetHold = null;
    ball.x = p2.x - ball.r + 6;
    ball.y = p2.y + p2.h / 2;
    ball.vx = 1400; ball.vy = 0; // above the cap, driving into P2
    p2.vx = 0; p2.vy = 0;
    collideBallRobot(p2);
    expect(ball.smashBy).toBeNull();
    expect(Math.hypot(ball.vx, ball.vy)).toBeLessThanOrEqual(BALL_MAX_SPEED + 1);
  });
});
