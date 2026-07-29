/**
 * Pad button layouts and the key codes they emit.
 *
 * The case that matters most here is Firefox on macOS with a DualSense: it
 * reports `mapping: ""` and raw HID button order, where Cross sits at index 1
 * (not 0) and the d-pad is a hat axis rather than four buttons.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { pollGamepads, __diagnostics } from "../src/input/gamepad.js";

const { readHat, calibrate, readPad, codeForButton, resetGamepads, seats } = __diagnostics;

/** Build a fake Gamepad. `pressed` is a list of button indices. */
function makePad({ mapping = "standard", pressed = [], axes = [0, 0, 0, 0], count = 17 }) {
  return {
    id: "test pad", index: 0, connected: true, mapping, timestamp: 0,
    buttons: Array.from({ length: count }, (_, i) => ({
      pressed: pressed.includes(i), touched: pressed.includes(i), value: pressed.includes(i) ? 1 : 0,
    })),
    axes,
  };
}

/** Calibrate against a resting pad, then read a second, active one. */
function read(restPad, activePad = restPad) {
  return readPad(activePad, calibrate(restPad));
}

describe("readHat", () => {
  it("decodes the eight compass positions", () => {
    const at = (i) => readHat((i * 2) / 7 - 1);
    expect(at(0)).toMatchObject({ up: true, right: false, down: false, left: false });
    expect(at(1)).toMatchObject({ up: true, right: true });
    expect(at(2)).toMatchObject({ up: false, right: true, down: false });
    expect(at(3)).toMatchObject({ right: true, down: true });
    expect(at(4)).toMatchObject({ up: false, right: false, down: true, left: false });
    expect(at(5)).toMatchObject({ down: true, left: true });
    expect(at(6)).toMatchObject({ up: false, down: false, left: true });
    expect(at(7)).toMatchObject({ up: true, left: true });
  });

  it("treats out-of-range values as centered", () => {
    expect(readHat(1.2857)).toBeNull(); // the usual null-hat encoding
    expect(readHat(3.28)).toBeNull();
    expect(readHat(NaN)).toBeNull();
  });
});

describe("standard mapping (Chromium, and Firefox for pads it knows)", () => {
  it("reads face buttons at their W3C indices", () => {
    expect(read(makePad({ pressed: [0] })).cross).toBe(true);
    expect(read(makePad({ pressed: [1] })).circle).toBe(true);
    expect(read(makePad({ pressed: [2] })).square).toBe(true);
    expect(read(makePad({ pressed: [9] })).start).toBe(true);
  });

  it("reads the d-pad as buttons 12-15", () => {
    expect(read(makePad({ pressed: [12] })).up).toBe(true);
    expect(read(makePad({ pressed: [13] })).down).toBe(true);
    expect(read(makePad({ pressed: [14] })).left).toBe(true);
    expect(read(makePad({ pressed: [15] })).right).toBe(true);
  });

  it("reads the left stick past the deadzone", () => {
    const rest = makePad({});
    expect(read(rest, makePad({ axes: [-0.9, 0, 0, 0] })).left).toBe(true);
    expect(read(rest, makePad({ axes: [0, 0.9, 0, 0] })).down).toBe(true);
    expect(read(rest, makePad({ axes: [0.2, -0.2, 0, 0] })).right).toBe(false);
  });
});

describe("raw HID order (Firefox + DualSense on macOS)", () => {
  const restAxes = [0, 0, 0, -1, -1, 0, 0, 0, 0, 1.2857]; // triggers at -1, hat centered
  const rest = makePad({ mapping: "", axes: restAxes, count: 15 });

  it("puts Cross at index 1, not 0 — the bug that made X act as Escape", () => {
    const logical = read(rest, makePad({ mapping: "", pressed: [1], axes: restAxes, count: 15 }));
    expect(logical.cross).toBe(true);
    expect(logical.circle).toBe(false);
  });

  it("reads Square at 0 and Circle at 2", () => {
    expect(read(rest, makePad({ mapping: "", pressed: [0], axes: restAxes, count: 15 })).square).toBe(true);
    expect(read(rest, makePad({ mapping: "", pressed: [2], axes: restAxes, count: 15 })).circle).toBe(true);
  });

  it("finds the hat axis and reads the d-pad off it", () => {
    const st = calibrate(rest);
    expect(st.hatAxis).toBe(9);

    const withHat = (v) => {
      const axes = [...restAxes];
      axes[9] = v;
      return readPad(makePad({ mapping: "", axes, count: 15 }), st);
    };
    expect(withHat(-1)).toMatchObject({ up: true, down: false });
    expect(withHat((4 * 2) / 7 - 1)).toMatchObject({ down: true, up: false });
    expect(withHat((6 * 2) / 7 - 1)).toMatchObject({ left: true, right: false });
    expect(withHat((2 * 2) / 7 - 1)).toMatchObject({ right: true, left: false });
    expect(withHat(1.2857)).toMatchObject({ up: false, down: false, left: false, right: false });
  });

  it("recovers the hat axis when the pad is first seen with the d-pad held", () => {
    // Calibrating mid-press cannot spot the hat: it is inside the normal range.
    const held = [...restAxes];
    held[9] = -1; // up
    const st = calibrate(makePad({ mapping: "", axes: held, count: 15 }));
    expect(st.hatAxis).toBeNull();

    // pollGamepads re-scans while it is still unknown; once centred it is found.
    st.hatAxis = __diagnostics.findHatAxis(makePad({ mapping: "", axes: restAxes, count: 15 }));
    expect(st.hatAxis).toBe(9);
  });

  it("does not read a trigger resting at -1 as a held direction", () => {
    // axes[1] here rests at -1. Read absolutely that is "up" held forever, which
    // is what made menus scroll on their own.
    const drifty = [0, -1, 0, 0];
    const st = calibrate(makePad({ mapping: "", axes: drifty }));
    expect(readPad(makePad({ mapping: "", axes: drifty }), st).up).toBe(false);
    // ...and it still registers once it actually moves.
    expect(readPad(makePad({ mapping: "", axes: [0, 0.5, 0, 0] }), st).down).toBe(true);
  });
});

describe("codeForButton in a match", () => {
  const play = (seat, name) => codeForButton(seat, name, false);

  it("emits Player 1's default keys for pad 0", () => {
    expect(play(0, "left")).toBe("KeyA");
    expect(play(0, "right")).toBe("KeyD");
    expect(play(0, "up")).toBe("KeyW");
    expect(play(0, "cross")).toBe("KeyW"); // jump
    expect(play(0, "square")).toBe("KeyF"); // attack / serve
    expect(play(0, "start")).toBe("Enter");
    expect(play(0, "circle")).toBe("Escape"); // pause
  });

  it("emits Player 2's keys for pad 1, so local 2P still works", () => {
    expect(play(1, "left")).toBe("ArrowLeft");
    expect(play(1, "right")).toBe("ArrowRight");
    expect(play(1, "cross")).toBe("ArrowUp");
    expect(play(1, "square")).toBe("Slash");
  });

  it("has nothing bound to d-pad down — nothing crouches", () => {
    expect(play(0, "down")).toBeNull();
    expect(play(1, "down")).toBeNull();
  });
});

describe("codeForButton in a menu", () => {
  const menu = (seat, name) => codeForButton(seat, name, true);

  it("confirms on cross as well as options", () => {
    expect(menu(0, "cross")).toBe("Enter");
    expect(menu(1, "cross")).toBe("Enter");
    expect(menu(0, "start")).toBe("Enter");
  });

  it("silences square, so jump cannot nudge the selection", () => {
    expect(menu(0, "square")).toBeNull();
    expect(menu(1, "square")).toBeNull();
  });

  it("navigates with each seat's menu keys, not its bound keys", () => {
    expect(menu(0, "up")).toBe("KeyW");
    expect(menu(0, "down")).toBe("KeyS");
    expect(menu(0, "left")).toBe("KeyA");
    expect(menu(0, "right")).toBe("KeyD");
    expect(menu(1, "up")).toBe("ArrowUp");
    expect(menu(1, "down")).toBe("ArrowDown");
    expect(menu(1, "left")).toBe("ArrowLeft");
    expect(menu(1, "right")).toBe("ArrowRight");
  });

  it("keeps back on circle in both contexts", () => {
    for (const seat of [0, 1]) {
      expect(menu(seat, "circle")).toBe("Escape");
      expect(codeForButton(seat, "circle", false)).toBe("Escape");
    }
  });
});

/**
 * Seat assignment, driven through the real poll loop.
 *
 * The game starts on the title screen, which counts as a menu, so each seat
 * emits its own navigation keys — KeyD for Player 1, ArrowRight for Player 2.
 * That difference is what tells us which seat a pad ended up in.
 */
describe("seat assignment", () => {
  /**
   * A pad occupying `slot`, optionally holding d-pad right. Standard mapping:
   * seating is layout-independent, and a button press registers on the pad's
   * very first frame whereas a hat needs one centred reading to be found.
   */
  const at = (slot, held = false) => ({
    id: "test pad", index: slot, connected: true, mapping: "standard",
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: held && i === 15, touched: false, value: held && i === 15 ? 1 : 0,
    })),
    axes: [0, 0, 0, 0],
  });

  /** Put `pads` on the navigator, poll once, and return the codes emitted. */
  function poll(pads, now = 0) {
    const seen = [];
    const onDown = (e) => seen.push(e.code);
    window.addEventListener("keydown", onDown);
    Object.defineProperty(navigator, "getGamepads", {
      value: () => pads, configurable: true, writable: true,
    });
    try {
      pollGamepads(now);
    } finally {
      window.removeEventListener("keydown", onDown);
    }
    return seen;
  }

  beforeEach(() => {
    resetGamepads();
  });

  it("gives the first pad someone touches Player 1, and the second Player 2", () => {
    const a = at(0);
    const b = at(1);
    poll([a, b]); // both connected, neither touched — no seats claimed yet
    expect(seats).toEqual([null, null]);

    expect(poll([at(0, true), b])).toEqual(["KeyD"]); // pad 0 first → P1
    expect(poll([at(0), at(1, true)])).toEqual(["ArrowRight"]); // pad 1 → P2
    expect(seats).toEqual([0, 1]);
  });

  it("seats by order of use, not by slot — a pad alone in slot 1 is Player 1", () => {
    // The reconnect case: the only controller present sits at index 1.
    expect(poll([null, at(1, true)])).toEqual(["KeyD"]);
    expect(seats).toEqual([1, null]);
  });

  it("finds a controller parked beyond the first two slots", () => {
    expect(poll([null, null, at(2, true)])).toEqual(["KeyD"]);
    expect(seats).toEqual([2, null]);
  });

  it("releases keys still held when a pad disappears", () => {
    poll([at(0, true)]);

    const seen = [];
    const onUp = (e) => seen.push(e.code);
    window.addEventListener("keyup", onUp);
    poll([]); // unplugged mid-press
    window.removeEventListener("keyup", onUp);

    // Without this the robot would keep walking for the rest of the match.
    expect(seen).toEqual(["KeyD"]);
    expect(seats).toEqual([null, null]);
  });

  it("frees the seat so a reconnecting pad becomes Player 1 again", () => {
    poll([at(0, true)]);
    poll([]); // unplug
    expect(seats).toEqual([null, null]);
    expect(poll([null, at(1, true)])).toEqual(["KeyD"]); // back on a new slot, still P1
  });

  it("ignores a third pad once both seats are taken", () => {
    poll([at(0, true)]);
    poll([at(0), at(1, true)]);
    expect(poll([at(0), at(1), at(2, true)])).toEqual([]);
    expect(seats).toEqual([0, 1]);
  });
});
