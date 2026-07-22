import { describe, it, expect, vi } from "vitest";
import { HEAD_TYPE_IDS } from "../src/data/heads.js";
import { TORSO_TYPE_IDS } from "../src/data/torsos.js";
import {
  robots, planPartLottery, commitPartLottery, lotteryResults,
} from "../src/engine/game.js";
import { centerOptionIndex, computeReelOffset } from "../src/ui/lottery.js";

const LEG_TYPE_IDS = ["normal", "power", "rocket"];

describe("lottery reel alignment", () => {
  it("centers the committed option when the spin finishes", () => {
    for (let trial = 0; trial < 100; trial++) {
      const slotIds = trial % 3 === 0 ? HEAD_TYPE_IDS
        : trial % 3 === 1 ? TORSO_TYPE_IDS
          : LEG_TYPE_IDS;
      const winIdx = trial % slotIds.length;
      const result = {
        options: slotIds.map((id) => ({ id, label: id })),
        newType: slotIds[winIdx],
        reelCycles: 4 + Math.random() * 3,
      };

      expect(centerOptionIndex(result, 1)).toBe(winIdx);
      expect(computeReelOffset(result, 1)).toBe(
        (Math.ceil(result.reelCycles) * slotIds.length + winIdx) * 52,
      );
    }
  });
});

describe("lottery commit", () => {
  it("applies only the planned slot and type to each robot", () => {
    const left = robots[0];
    const right = robots[1];
    left.headType = "standard";
    left.torsoType = "standard";
    left.legType = "normal";
    right.headType = "dome";
    right.torsoType = "heavy";
    right.legType = "power";

    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(1 / 3) // P1 torso slot
      .mockReturnValueOnce(0.5) // P1 torso pick
      .mockReturnValueOnce(0.5) // P1 reel cycles
      .mockReturnValueOnce(0) // P2 head slot
      .mockReturnValueOnce(0.5) // P2 head pick
      .mockReturnValueOnce(0.5); // P2 reel cycles

    planPartLottery();
    commitPartLottery();

    expect(left.headType).toBe("standard");
    expect(left.torsoType).toBe(lotteryResults[0].newType);
    expect(left.legType).toBe("normal");

    expect(right.headType).toBe(lotteryResults[1].newType);
    expect(right.torsoType).toBe("heavy");
    expect(right.legType).toBe("power");

    expect(lotteryResults[0].slotKey).toBe("torsoType");
    expect(lotteryResults[1].slotKey).toBe("headType");
    expect(lotteryResults[1].newType).not.toBe("light");

    random.mockRestore();
  });

  it("includes gameplay descriptions for the winning part", () => {
    planPartLottery();
    for (const pick of lotteryResults) {
      expect(pick.newDescription).toBeTruthy();
    }
  });
});
