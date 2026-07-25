import { describe, it, expect, vi } from "vitest";
import {
  W, H, FLOOR_Y, WIN_SCORE, BALL_R, NET, ROBOT_W, BALL_MAX_SPEED,
} from "../src/data/constants.js";
import {
  ball, score, makeRobot, updateRobotParts, predictBallX,
  serveBall, awardPoint, resetPositions, resetRobots, robots,
  collideBallRobot, getHeadSpec, getTorsoSpec, getArmSpec, applyItems,
  updateBall, updateRobot, updateAttack, collideBallAttack, PHYSICS_STEP, state,
  planPartLottery, commitPartLottery, prepareServe, startGame, lotteryResults, lotteryTick,
  tickServe, LOTTERY_TOTAL_DURATION,
  canPause, pauseGame, resumeFromPause, pauseSelect, pauseMove,
  pauseFromState, pauseIndex, leaveSubmenu, toMenu,
} from "../src/engine/game.js";
import { HEAD_TYPES } from "../src/data/heads.js";
import { TORSO_TYPES } from "../src/data/torsos.js";
import { ARM_TYPES } from "../src/data/arms.js";
import {
  ACCESSORY_IDS, WEAPON_IDS, DEFAULT_WEAPON, WEAPONS, itemPreviewSlot,
} from "../src/data/items.js";

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

  it("exposes exactly one torso type", () => {
    expect(Object.keys(TORSO_TYPES)).toEqual(["standard"]);
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

  /** Drop the ball onto one side of the head: -1 = left, +1 = right. */
  function placeBallOnHeadSide(r, side) {
    updateRobotParts(r);
    ball.live = true;
    ball.magnetHold = null;
    ball.spin = 0;
    const head = r.parts.head;
    ball.x = side < 0 ? head.x : head.x + head.w;
    ball.y = head.y - ball.r + 3;
    ball.vx = 0;
    ball.vy = 180;
    r.vx = 0;
    r.vy = 0;
    r.onGround = true;
  }

  it("drill head always launches sideways at full speed", () => {
    const r = makeRobot(-1);
    r.headType = "drill";

    placeBallOnHeadSide(r, +1);
    expect(collideBallRobot(r)).toBe(true);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(HEAD_TYPES.drill.launchSpeed, 5);
    expect(ball.vx).toBeGreaterThan(0);   // struck on the right -> travels right
    expect(ball.vy).toBeLessThan(0);      // with a little lift
    // Sideways, not a lob: horizontal speed dominates.
    expect(Math.abs(ball.vx)).toBeGreaterThan(Math.abs(ball.vy) * 2);

    placeBallOnHeadSide(r, -1);
    collideBallRobot(r);
    expect(ball.vx).toBeLessThan(0);      // struck on the left -> travels left
  });

  it("drill launch ignores incoming speed and robot motion", () => {
    const r = makeRobot(-1);
    r.headType = "drill";

    placeBallOnHeadSide(r, +1);
    ball.vy = 40;                          // barely moving
    collideBallRobot(r);
    const slow = { vx: ball.vx, vy: ball.vy };

    placeBallOnHeadSide(r, +1);
    ball.vy = 900;                         // slammed down
    r.vx = 300;
    collideBallRobot(r);
    expect(ball.vx).toBeCloseTo(slow.vx, 5);
    expect(ball.vy).toBeCloseTo(slow.vy, 5);
  });

  it("drill skims the ball over the net from mid-half", () => {
    // The calibration behind HEAD_TYPES.drill.launchAngleDeg: a robot at the
    // middle of its own half, struck on the right of the head, just clears the
    // net. Uses the shared robots — updateBall() collides against those, not
    // against a locally built one.
    const r = robots[0];
    r.accessory = "drill";
    r.weapon = DEFAULT_WEAPON;
    r.x = W * 0.25 - ROBOT_W / 2;
    r.y = FLOOR_Y - r.h;
    r.vx = 0; r.vy = 0; r.onGround = true;
    applyItems(r);
    robots[1].x = W - ROBOT_W - 6;          // park the opponent clear of the flight
    robots[1].y = FLOOR_Y - robots[1].h;
    updateRobotParts(robots[1]);

    placeBallOnHeadSide(r, +1);
    collideBallRobot(r);

    let clearance = Infinity;
    let netBounce = false;
    let crossed = false;
    for (let i = 0; i < 400; i++) {
      const vxBefore = ball.vx;
      const xBefore = ball.x;
      updateBall(PHYSICS_STEP);
      if (ball.x + ball.r > NET.x && ball.x - ball.r < NET.x + NET.w) {
        clearance = Math.min(clearance, NET.top - (ball.y + ball.r));
      }
      if (vxBefore > 0 && ball.vx < 0 && xBefore < NET.x + NET.w + 40) netBounce = true;
      if (ball.x - ball.r > NET.x + NET.w) { crossed = true; break; }
      if (!ball.live) break;
    }

    expect(netBounce).toBe(false);
    expect(crossed).toBe(true);
    // "Exactly above the net": clears the near top corner, but only just.
    expect(clearance).toBeGreaterThan(0);
    expect(clearance).toBeLessThan(8);
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
  it("plans an item per robot without applying immediately", () => {
    const left = robots[0];
    const right = robots[1];
    left.accessory = null;
    left.weapon = DEFAULT_WEAPON;
    right.accessory = null;
    right.weapon = DEFAULT_WEAPON;
    applyItems(left);
    applyItems(right);

    // Calls per robot, in order: category pick, item pick, reel cycles.
    // Two categories, so index = floor(random * 2): 0 -> accessory, 0.5 -> weapon.
    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // P1 accessory category
      .mockReturnValueOnce(0.99) // P1 pick last accessory
      .mockReturnValueOnce(0.5) // P1 reel cycles
      .mockReturnValueOnce(0.5) // P2 weapon category
      .mockReturnValueOnce(0.99) // P2 pick last weapon
      .mockReturnValueOnce(0.5); // P2 reel cycles

    planPartLottery();

    expect(left.accessory).toBeNull();
    expect(right.weapon).toBe(DEFAULT_WEAPON);
    expect(lotteryResults[0].kind).toBe("accessory");
    expect(ACCESSORY_IDS).toContain(lotteryResults[0].newType);
    expect(lotteryResults[1].kind).toBe("weapon");
    expect(WEAPON_IDS).toContain(lotteryResults[1].newType);

    commitPartLottery();
    expect(left.accessory).toBe(lotteryResults[0].newType);
    expect(right.weapon).toBe(lotteryResults[1].newType);

    random.mockRestore();
  });

  it("carries one accessory at a time, reverting the previous slot", () => {
    const r = robots[0];
    r.accessory = "magnet";
    r.weapon = DEFAULT_WEAPON;
    applyItems(r);
    expect(r.headType).toBe("magnet");
    expect(r.legType).toBe("normal");

    // A leg accessory takes over; the head falls back to the standard part.
    r.accessory = "rocket";
    applyItems(r);
    expect(r.legType).toBe("rocket");
    expect(r.headType).toBe("standard");
  });

  it("keeps the body standard when only a weapon is carried", () => {
    const r = robots[0];
    r.accessory = null;
    r.weapon = "axe";
    applyItems(r);
    expect(r.headType).toBe("standard");
    expect(r.legType).toBe("normal");
    expect(r.armType).toBe("axe");
  });

  it("carries an accessory and a weapon at the same time", () => {
    const r = robots[0];
    r.accessory = "drill";
    r.weapon = "ninjaStar";
    applyItems(r);
    expect(r.headType).toBe("drill");
    expect(r.armType).toBe("ninjaStar");
  });

  it("starts every robot carrying the starter weapon", () => {
    // The weapon slot is never empty, so the HUD always has an icon to show.
    expect(makeRobot(-1).weapon).toBe(DEFAULT_WEAPON);
    robots[0].weapon = "axe";
    robots[1].weapon = "ninjaStar";
    resetRobots();
    for (const r of robots) {
      expect(r.weapon).toBe(DEFAULT_WEAPON);
      expect(r.armType).toBe(DEFAULT_WEAPON);
      expect(r.accessory).toBeNull();
    }
  });

  it("puts the starter weapon in the lottery pool", () => {
    expect(WEAPON_IDS).toContain(DEFAULT_WEAPON);
    expect(WEAPONS[DEFAULT_WEAPON].label).toBeTruthy();

    // Carrying a weapon, the starter must be reachable again by a later roll.
    robots[0].weapon = "axe";
    robots[1].weapon = "axe";
    applyItems(robots[0]);
    let sawStarter = false;
    for (let i = 0; i < 300 && !sawStarter; i++) {
      planPartLottery();
      for (const pick of lotteryResults) {
        expect(pick.options.map((o) => o.id)).toContain(
          pick.kind === "weapon" ? DEFAULT_WEAPON : pick.newType,
        );
        if (pick.kind === "weapon" && pick.newType === DEFAULT_WEAPON) sawStarter = true;
      }
    }
    expect(sawStarter).toBe(true);
  });

  it("previews the starter weapon as prop art, not a bare arm", () => {
    // "armType" + "hand" resolves to the arm sprite; the weapon slot must not.
    expect(itemPreviewSlot("weapon", DEFAULT_WEAPON)).toBe("weaponType");
    expect(itemPreviewSlot("weapon", "axe")).toBe("weaponType");
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
    left.legType = "rocket";
    right.headType = "magnet";
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

describe("pause", () => {
  it("can pause during an active match", () => {
    toMenu();
    startGame("2p");
    expect(canPause()).toBe(true);
    pauseGame();
    expect(state).toBe("pause");
    expect(pauseFromState).toBe("serve");
    resumeFromPause();
    expect(state).toBe("serve");
    expect(pauseFromState).toBeNull();
  });

  it("cannot pause from menu or game over", () => {
    toMenu();
    expect(canPause()).toBe(false);
    startGame("2p");
    serveBall(0.5);
    awardPoint(0);
    awardPoint(0);
    awardPoint(0);
    awardPoint(0);
    awardPoint(0);
    expect(state).toBe("over");
    expect(canPause()).toBe(false);
  });

  it("opens settings from pause and returns to pause", () => {
    toMenu();
    startGame("2p");
    pauseGame();
    pauseMove(1);
    expect(pauseIndex).toBe(1);
    pauseSelect();
    expect(state).toBe("settings");
    leaveSubmenu();
    expect(state).toBe("pause");
  });

  it("opens controls from pause and returns to pause", () => {
    toMenu();
    startGame("2p");
    pauseGame();
    pauseMove(2);
    expect(pauseIndex).toBe(2);
    pauseSelect();
    expect(state).toBe("controls");
    leaveSubmenu();
    expect(state).toBe("pause");
  });

  it("quit from pause returns to menu", () => {
    toMenu();
    startGame("2p");
    pauseGame();
    pauseMove(3);
    pauseSelect();
    expect(state).toBe("menu");
    expect(pauseFromState).toBeNull();
  });
});
