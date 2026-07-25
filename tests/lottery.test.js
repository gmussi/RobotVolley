import { describe, it, expect, vi } from "vitest";
import { ACCESSORY_IDS, WEAPON_IDS } from "../src/data/items.js";
import {
  robots, planPartLottery, commitPartLottery, lotteryResults, applyItems,
} from "../src/engine/game.js";
import { centerOptionIndex, computeReelOffset } from "../src/ui/lottery.js";

describe("lottery reel alignment", () => {
  it("centers the committed option when the spin finishes", () => {
    for (let trial = 0; trial < 100; trial++) {
      const itemIds = trial % 2 === 0 ? ACCESSORY_IDS : WEAPON_IDS;
      const winIdx = trial % itemIds.length;
      const result = {
        options: itemIds.map((id) => ({ id, label: id })),
        newType: itemIds[winIdx],
        reelCycles: 4 + Math.random() * 3,
      };

      expect(centerOptionIndex(result, 1)).toBe(winIdx);
      expect(computeReelOffset(result, 1)).toBe(
        (Math.ceil(result.reelCycles) * itemIds.length + winIdx) * 52,
      );
    }
  });
});

describe("lottery commit", () => {
  it("applies only the planned item to each robot", () => {
    const left = robots[0];
    const right = robots[1];
    left.accessory = null;
    left.weapon = "axe";
    right.accessory = "drill";
    right.weapon = null;
    applyItems(left);
    applyItems(right);

    // Two categories — index = floor(random * 2): 0 -> accessory, 0.5 -> weapon.
    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // P1 accessory category
      .mockReturnValueOnce(0.5) // P1 accessory pick
      .mockReturnValueOnce(0.5) // P1 reel cycles
      .mockReturnValueOnce(0.5) // P2 weapon category
      .mockReturnValueOnce(0.5) // P2 weapon pick
      .mockReturnValueOnce(0.5); // P2 reel cycles

    planPartLottery();
    commitPartLottery();

    // P1 won an accessory; its weapon is untouched.
    expect(lotteryResults[0].kind).toBe("accessory");
    expect(left.accessory).toBe(lotteryResults[0].newType);
    expect(left.weapon).toBe("axe");

    // P2 won a weapon; its accessory is untouched.
    expect(lotteryResults[1].kind).toBe("weapon");
    expect(right.weapon).toBe(lotteryResults[1].newType);
    expect(right.accessory).toBe("drill");

    random.mockRestore();
  });

  it("only ever rolls accessories or weapons", () => {
    for (let i = 0; i < 200; i++) {
      planPartLottery();
      for (const pick of lotteryResults) {
        expect(["accessory", "weapon"]).toContain(pick.kind);
        const pool = pick.kind === "accessory" ? ACCESSORY_IDS : WEAPON_IDS;
        expect(pool).toContain(pick.newType);
      }
    }
  });

  it("never rolls the item the robot already carries", () => {
    for (let i = 0; i < 200; i++) {
      planPartLottery();
      for (let seat = 0; seat < robots.length; seat++) {
        const pick = lotteryResults[seat];
        const current = pick.kind === "accessory"
          ? robots[seat].accessory
          : robots[seat].weapon;
        if (current) expect(pick.newType).not.toBe(current);
      }
      commitPartLottery();
    }
  });

  it("includes gameplay descriptions for the winning item", () => {
    planPartLottery();
    for (const pick of lotteryResults) {
      expect(pick.newDescription).toBeTruthy();
    }
  });
});
