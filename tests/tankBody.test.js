import { describe, it, expect } from "vitest";
import { tankBodyRect, tankRollState } from "../src/ui/tankChassis.js";
import { makeRobot } from "../src/engine/game.js";
import ROLL from "../src/assets/robot/anim/tank-roll.json";

// Mirrored from the sprite skeleton in src/ui/spriteRobot.js: the head is
// anchored by its bottom edge at this fraction of the robot box, and the stock
// torso's top edge sits here. The tank stands in for the torso, so it has to
// reach the torso line to tuck under the head.
const HEAD_BOTTOM_FRAC = 0.405;
const TORSO_TOP_FRAC = 0.315;

describe("tank body geometry", () => {
  const r = makeRobot(-1);

  it("plants on the floor and stays centred on the robot", () => {
    for (const aspect of [1.0, 1.54, 2.4]) {
      const box = tankBodyRect(r, aspect);
      expect(box.y + box.h).toBe(r.y + r.h);
      // Integer rects can only centre to within half a pixel.
      expect(Math.abs(box.x + box.w / 2 - (r.x + r.w / 2))).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the art's aspect so hull and tracks are never squashed", () => {
    for (const aspect of [1.0, 1.54, 2.4]) {
      const box = tankBodyRect(r, aspect);
      expect(box.w / box.h).toBeCloseTo(aspect, 1);
    }
  });

  it("reaches under the head, leaving no air gap at the neck", () => {
    // A wide piece gets capped on width, which shortens it — but never so much
    // that its top drops below the head's bottom edge.
    for (const aspect of [1.0, 1.54, 2.4]) {
      const top = tankBodyRect(r, aspect).y - r.y;
      expect(top).toBeLessThan(r.h * HEAD_BOTTOM_FRAC);
    }
    // Art narrow enough to escape the width cap reaches the torso line exactly.
    const tall = tankBodyRect(r, 1.0).y - r.y;
    expect(Math.abs(tall - r.h * TORSO_TOP_FRAC)).toBeLessThanOrEqual(1);
  });

  it("overhangs the collision box so the tracks read as wider than legs", () => {
    expect(tankBodyRect(r, 1.54).w).toBeGreaterThan(r.w);
  });
});

describe("tank tread roll", () => {
  const box = tankBodyRect(makeRobot(-1), 1.54);
  const pitch = ROLL.pitchFrac * box.w;
  const state = (dist) => tankRollState(dist, box, ROLL);

  it("bakes a belt strip with wheels to spin over it", () => {
    expect(ROLL.frames).toBeGreaterThan(1);
    expect(ROLL.pitchFrac).toBeGreaterThan(0);
    expect(ROLL.wheels.length).toBeGreaterThan(0);
    for (const wheel of ROLL.wheels) {
      // The 3/4 view foreshortens the wheels; a round one means a bad fit.
      expect(wheel.ry * box.h).toBeGreaterThan(wheel.rx * box.w);
    }
  });

  it("cycles the belt once per pad pitch, in the direction of travel", () => {
    expect(state(0).frame).toBe(0);
    expect(state(pitch).frame).toBe(0);
    expect(state(-pitch * 4).frame).toBe(0);
    const seen = new Set();
    for (let i = 0; i < ROLL.frames; i++) {
      const { frame } = state((pitch * i) / ROLL.frames);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(ROLL.frames);
      seen.add(frame);
    }
    expect(seen.size).toBe(ROLL.frames);
    // Rolling backwards runs the belt backwards rather than sticking at 0.
    expect(state(-pitch / ROLL.frames).frame).toBe(ROLL.frames - 1);
  });

  it("keeps the wheels locked to the belt, not free-running", () => {
    const radius = ROLL.wheels[0].ry * box.h;
    expect(state(pitch).spin).toBeCloseTo(pitch / radius, 6);
    expect(state(-pitch).spin).toBeCloseTo(-pitch / radius, 6);
    // A full turn of the wheel must walk the belt a whole number of pads or the
    // two would visibly drift apart over time.
    const perTurn = (2 * Math.PI * radius) / pitch;
    expect(perTurn).toBeGreaterThan(4);
  });
});
