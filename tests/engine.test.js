import { describe, it, expect, vi } from "vitest";
import {
  W, H, FLOOR_Y, WIN_SCORE, BALL_R, NET, ROBOT_W, BALL_MAX_SPEED,
  MOVE_SPEED, JUMP_V, TANK_JUMP_V, TANK_MOVE_SPEED_MUL, POWER_JUMP_V,
  AIR_RESTITUTION, MAX_RALLY_DURATION_MS,
} from "../src/data/constants.js";
import {
  ball, score, banner, makeRobot, updateRobotParts, predictBallX,
  serveBall, awardPoint, voidRally, resetPositions, resetRobots, robots,
  collideBallRobot, getHeadSpec, getTorsoSpec, getLegSpec, getArmSpec, applyItems,
  updateBall, updateRobot, updateAttack, collideBallAttack, PHYSICS_STEP, state,
  planPartLottery, commitPartLottery, prepareServe, startGame, lotteryResults, lotteryTick,
  tickServe, LOTTERY_TOTAL_DURATION,
  canPause, pauseGame, resumeFromPause, pauseSelect, pauseMove,
  pauseFromState, pauseIndex, leaveSubmenu, toMenu,
  onlineOverlay, openOnlineOverlay, closeOnlineOverlay, setOnlineOverlay,
  readLocalOnlineInput,
} from "../src/engine/game.js";
import { codeFor } from "../src/data/controls.js";
import { HEAD_TYPES } from "../src/data/heads.js";
import { TORSO_TYPES } from "../src/data/torsos.js";
import { LEG_TYPES } from "../src/data/legs.js";
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

  it("getLegSpec returns tank tread mobility", () => {
    const r = makeRobot(-1);
    r.legType = "tank";
    expect(getLegSpec(r).jumpV).toBe(TANK_JUMP_V);
    expect(getLegSpec(r).moveSpeedMul).toBe(TANK_MOVE_SPEED_MUL);
  });

  it("getLegSpec falls back to normal for unknown type", () => {
    const r = makeRobot(-1);
    r.legType = "unknown";
    expect(getLegSpec(r)).toBe(LEG_TYPES.normal);
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

describe("stuck-ball safety net", () => {
  it("air restitution never exceeds 1 (would add energy on every bounce)", () => {
    expect(AIR_RESTITUTION).toBeLessThanOrEqual(1);
  });

  it("never lets the ball tunnel through a wall a robot is pinned against, and always resolves the rally", () => {
    startGame("2p");
    const r = robots[0];
    r.x = 6; r.y = FLOOR_Y - r.h; r.vx = 0; r.vy = 0; r.onGround = true;
    updateRobotParts(r);
    robots[1].x = W - ROBOT_W - 6; robots[1].y = FLOOR_Y - robots[1].h;
    updateRobotParts(robots[1]);

    serveBall(1); // resets the rally clock / wall-bounce counters like a real serve
    ball.x = 30; ball.y = r.y + r.h / 2; ball.vx = -400; ball.vy = 0; ball.spin = 0;

    const maxSteps = Math.ceil(MAX_RALLY_DURATION_MS / (PHYSICS_STEP * 1000)) + 200;
    let tunneled = false;
    for (let i = 0; i < maxSteps; i++) {
      updateBall(PHYSICS_STEP);
      if (ball.x - ball.r < -0.01 || ball.x + ball.r > W + 0.01) tunneled = true;
      if (!ball.live) break;
    }
    expect(tunneled).toBe(false);
    expect(ball.live).toBe(false);
  });

  it("does not void a long rally over ordinary wall touches spaced seconds apart", () => {
    startGame("2p");
    serveBall(1);

    const stepsPerGap = Math.round(2000 / (PHYSICS_STEP * 1000)); // ~2s between touches
    for (let bounce = 0; bounce < 12 && ball.live; bounce++) {
      // Park the ball safely mid-air (away from any wall/floor/robot) while the
      // rally clock keeps advancing, same as a normal rally between touches.
      for (let i = 0; i < stepsPerGap && ball.live; i++) {
        ball.x = W / 2; ball.y = 100; ball.vx = 0; ball.vy = 0;
        updateBall(PHYSICS_STEP);
      }
      if (!ball.live) break;
      // A single, ordinary touch against the left wall.
      ball.x = ball.r + 1; ball.y = 300; ball.vx = -60; ball.vy = 0;
      updateBall(PHYSICS_STEP);
    }

    expect(ball.live).toBe(true);
    expect(banner?.type).not.toBe("stall");
  });

  it("voidRally ends the rally as a no-score let, not a point", () => {
    startGame("2p");
    serveBall(1);
    score[0] = 1; score[1] = 2;
    ball.live = true;

    voidRally("test");

    expect(ball.live).toBe(false);
    expect(banner?.type).toBe("stall");
    expect(score[0]).toBe(1);
    expect(score[1]).toBe(2);
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

  it("tank claims the torso as well as the legs, and gives both back", () => {
    const r = robots[0];
    r.accessory = "tank";
    r.weapon = DEFAULT_WEAPON;
    applyItems(r);
    expect(r.legType).toBe("tank");
    expect(r.torsoType).toBe("tank");
    expect(r.headType).toBe("standard");
    // An unknown torso keeps standard mobility — the tank's stats live on the legs.
    expect(getTorsoSpec(r)).toBe(TORSO_TYPES.standard);

    r.accessory = "drill";
    applyItems(r);
    expect(r.torsoType).toBe("standard");
    expect(r.legType).toBe("normal");
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

  it("includes tank treads in the accessory pool", () => {
    expect(ACCESSORY_IDS).toContain("tank");
  });

  it("tank tread accessory replaces legs and boosts walk speed", () => {
    const normal = makeRobot(-1);
    const tank = makeRobot(-1);
    tank.accessory = "tank";
    applyItems(tank);
    expect(tank.legType).toBe("tank");

    for (const r of [normal, tank]) {
      r.x = 50;
      r.onGround = true;
      r.moveDir = 1;
      r.vx = 0;
    }
    for (let i = 0; i < 8; i++) {
      updateRobot(normal, 1 / 60);
      updateRobot(tank, 1 / 60);
    }
    expect(tank.vx).toBeGreaterThan(normal.vx);
    expect(tank.vx).toBeCloseTo(MOVE_SPEED * TANK_MOVE_SPEED_MUL, -1);
  });

  it("tank treads jump lower than normal legs", () => {
    const dt = 1 / 120;
    const normal = makeRobot(-1);
    normal.onGround = true;
    normal.jumpHeld = true;
    normal.jumpPrevHeld = false;
    updateRobot(normal, dt);

    const tank = makeRobot(-1);
    tank.legType = "tank";
    tank.onGround = true;
    tank.jumpHeld = true;
    tank.jumpPrevHeld = false;
    updateRobot(tank, dt);

    expect(tank.vy).toBeGreaterThan(normal.vy);
    expect(TANK_JUMP_V).toBeLessThan(JUMP_V);
  });

  it("power legs still jump higher than tank treads", () => {
    const dt = 1 / 120;
    const power = makeRobot(-1);
    power.legType = "power";
    power.onGround = true;
    power.jumpHeld = true;
    power.jumpPrevHeld = false;
    updateRobot(power, dt);

    const tank = makeRobot(-1);
    tank.legType = "tank";
    tank.onGround = true;
    tank.jumpHeld = true;
    tank.jumpPrevHeld = false;
    updateRobot(tank, dt);

    expect(power.vy).toBeLessThan(tank.vy);
    expect(POWER_JUMP_V).toBeGreaterThan(TANK_JUMP_V);
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

  it("portal gun opens ahead of the ball, holds, then reverses", () => {
    startGame("2p");
    serveBall(0.5);
    const r = robots[0];
    r.weapon = "portalGun";
    applyItems(r);
    expect(getArmSpec(r).kind).toBe("portal");

    ball.live = true;
    ball.portalHold = null;
    ball.magnetHold = null;
    ball.smashBy = null;
    ball.x = 400; ball.y = 220;
    ball.vx = 300; ball.vy = -100;

    r.attack = null;
    r.attackCooldown = 0;
    r.attackHeld = true; r.attackPrevHeld = false;
    updateAttack(r, PHYSICS_STEP);

    expect(r.attack?.kind).toBe("portal");
    expect(ball.portalHold).not.toBeNull();
    expect(ball.portalHold.dir).toBe(1);
    expect(ball.portalHold.x).toBeGreaterThan(ball.portalHold.fromX);
    expect(ball.portalHold.exitVx).toBeCloseTo(-300, 5);
    expect(ball.portalHold.exitVy).toBeCloseTo(100, 5);
    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(0);

    const steps = Math.ceil(ARM_TYPES.portalGun.holdTime / PHYSICS_STEP) + 2;
    let released = false;
    for (let i = 0; i < steps; i++) {
      const held = !!ball.portalHold;
      updateAttack(r, PHYSICS_STEP);
      updateBall(PHYSICS_STEP);
      if (held && !ball.portalHold) {
        // Check the exit velocity on the release frame (before later spin/gravity).
        expect(ball.vx).toBeCloseTo(-300, 5);
        expect(ball.vy).toBeCloseTo(100, 5);
        released = true;
        break;
      }
    }
    expect(released).toBe(true);
    expect(r.attack).toBeNull();
    expect(r.attackCooldown).toBeGreaterThan(0);
  });

  it("portal opens to the left when the ball travels left", () => {
    startGame("2p");
    serveBall(0.5);
    const r = robots[0];
    r.weapon = "portalGun";
    applyItems(r);

    ball.live = true;
    ball.portalHold = null;
    ball.magnetHold = null;
    ball.x = 600; ball.y = 240;
    ball.vx = -250; ball.vy = 40;

    r.attack = null;
    r.attackCooldown = 0;
    r.attackHeld = true; r.attackPrevHeld = false;
    updateAttack(r, PHYSICS_STEP);

    expect(ball.portalHold.dir).toBe(-1);
    expect(ball.portalHold.x).toBeLessThan(ball.portalHold.fromX);
    expect(ball.portalHold.exitVx).toBeCloseTo(250, 5);
  });

  it("portal gun does nothing when the ball is not live", () => {
    startGame("2p");
    serveBall(0.5);
    const r = robots[0];
    r.weapon = "portalGun";
    applyItems(r);
    ball.live = false;
    ball.portalHold = null;

    r.attack = null;
    r.attackCooldown = 0;
    r.attackHeld = true; r.attackPrevHeld = false;
    updateAttack(r, PHYSICS_STEP);
    expect(r.attack).toBeNull();
    expect(ball.portalHold).toBeNull();
    expect(r.attackCooldown).toBe(0);
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

describe("online overlay", () => {
  it("layers on top of a live online match without touching top-level state", () => {
    toMenu();
    startGame("online", { seed: 1 });
    serveBall(1);
    expect(state).toBe("play");

    expect(openOnlineOverlay()).toBe(true);
    expect(onlineOverlay).toBe("pause");
    expect(state).toBe("play"); // match keeps running underneath

    expect(readLocalOnlineInput(new Set([codeFor(0, "right")]))).toEqual({
      moveDir: 0, jumpHeld: false, attackHeld: false,
    });

    setOnlineOverlay("settings");
    expect(onlineOverlay).toBe("settings");
    expect(state).toBe("play");

    closeOnlineOverlay();
    expect(onlineOverlay).toBeNull();
    expect(readLocalOnlineInput(new Set([codeFor(0, "right")]))).toEqual({
      moveDir: 1, jumpHeld: false, attackHeld: false,
    });
  });

  it("is a no-op outside online mode", () => {
    toMenu();
    startGame("2p");
    expect(openOnlineOverlay()).toBe(false);
    expect(onlineOverlay).toBeNull();
  });
});
