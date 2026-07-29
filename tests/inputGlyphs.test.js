/**
 * Device-aware prompt glyphs: brand detection, last-input-wins switching, and
 * the locale `[token]` markers that drive it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  brandFromPadId, inputDevice, usingGamepad,
  noteGamepadActivity, noteKeyboardActivity,
} from "../src/input/device.js";
import { parseHint, padGlyphForAction } from "../src/ui/glyphs.js";
import en from "../src/i18n/locales/en.js";
import de from "../src/i18n/locales/de.js";
import es from "../src/i18n/locales/es.js";
import fr from "../src/i18n/locales/fr.js";
import itIT from "../src/i18n/locales/it.js"; // not `it` — that is vitest's test fn
import ja from "../src/i18n/locales/ja.js";
import pl from "../src/i18n/locales/pl.js";
import ptBR from "../src/i18n/locales/pt-BR.js";
import ru from "../src/i18n/locales/ru.js";
import zhHans from "../src/i18n/locales/zh-Hans.js";

const CATALOGS = { en, de, es, fr, it: itIT, ja, pl, "pt-BR": ptBR, ru, "zh-Hans": zhHans };

/** Every marker the glyph layer knows how to resolve. */
const KNOWN_TOKENS = new Set([
  "confirm", "back", "menuKey", "attack", "updown", "leftright", "dpad",
]);

beforeEach(() => {
  noteKeyboardActivity();
});

describe("brandFromPadId", () => {
  it("reads Chrome's vendor id", () => {
    expect(brandFromPadId("Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"))
      .toBe("playstation");
    expect(brandFromPadId("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)"))
      .toBe("xbox");
    expect(brandFromPadId("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)"))
      .toBe("nintendo");
  });

  it("reads Firefox's leading vendor-product pair", () => {
    expect(brandFromPadId("054c-09cc-Wireless Controller")).toBe("playstation");
    expect(brandFromPadId("057e-2009-Pro Controller")).toBe("nintendo");
  });

  it("falls back to the product name when no ids are exposed (Safari)", () => {
    expect(brandFromPadId("DualSense Wireless Controller Extended Gamepad")).toBe("playstation");
    expect(brandFromPadId("Joy-Con (L/R) Extended Gamepad")).toBe("nintendo");
  });

  it("defaults to Xbox for unknown pads, matching Steam Input's virtual pad", () => {
    expect(brandFromPadId("Some Generic HID Pad")).toBe("xbox");
    expect(brandFromPadId("")).toBe("xbox");
    expect(brandFromPadId(undefined)).toBe("xbox");
  });
});

describe("last input wins", () => {
  it("starts on the keyboard", () => {
    expect(inputDevice()).toBe("keyboard");
    expect(usingGamepad()).toBe(false);
  });

  it("switches to the pad's brand and back to the keyboard", () => {
    noteGamepadActivity({ id: "054c-09cc-Wireless Controller" });
    expect(inputDevice()).toBe("playstation");
    expect(usingGamepad()).toBe(true);

    noteKeyboardActivity();
    expect(inputDevice()).toBe("keyboard");
    expect(usingGamepad()).toBe(false);
  });

  it("follows whichever pad moved last", () => {
    noteGamepadActivity({ id: "045e-0b12-Xbox Wireless Controller" });
    noteGamepadActivity({ id: "057e-2009-Pro Controller" });
    expect(inputDevice()).toBe("nintendo");
  });
});

describe("parseHint", () => {
  it("collapses a keyboard hint to a single text run", () => {
    const runs = parseHint("[confirm]   RESUME      [back]   BACK");
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("ENTER   RESUME      ESC   BACK");
  });

  it("emits pad glyphs once a controller is in use", () => {
    noteGamepadActivity({ id: "045e-0b12-Xbox Wireless Controller" });
    const runs = parseHint("[confirm]   RESUME      [back]   BACK");
    // Confirm is Cross and back is Circle — matching what gamepad.js emits.
    expect(runs.map((r) => r.pad ?? r.text)).toEqual([
      "cross", "   RESUME      ", "circle", "   BACK",
    ]);
  });

  it("resolves the serve prompt's caller-substituted attack marker", () => {
    // render.js passes the bound key on keyboard and "[attack]" on a pad.
    expect(parseHint("hold  F  to charge · release to serve"))
      .toEqual([{ text: "hold  F  to charge · release to serve" }]);

    noteGamepadActivity({ id: "054c-09cc-Wireless Controller" });
    expect(parseHint("hold  [attack]  to charge · release to serve")
      .map((r) => r.pad ?? r.text))
      .toEqual(["hold  ", "square", "  to charge · release to serve"]);
  });

  it("keeps an unknown marker visible instead of swallowing it", () => {
    expect(parseHint("a [bogus] b")).toEqual([{ text: "a [bogus] b" }]);
  });

  it("leaves plain strings and empties alone", () => {
    expect(parseHint("© 2026  ROBOT VOLLEY")).toEqual([{ text: "© 2026  ROBOT VOLLEY" }]);
    expect(parseHint("")).toEqual([]);
    expect(parseHint(null)).toEqual([]);
  });
});

describe("padGlyphForAction", () => {
  it("returns nothing on the keyboard, so callers fall back to the bound key", () => {
    expect(padGlyphForAction("attack")).toBeNull();
    expect(padGlyphForAction("jump")).toBeNull();
  });

  it("maps each gameplay action to the button that performs it", () => {
    noteGamepadActivity({ id: "054c-09cc-Wireless Controller" });
    expect(padGlyphForAction("jump")).toBe("cross");
    expect(padGlyphForAction("attack")).toBe("square");
    expect(padGlyphForAction("left")).toBe("left");
    expect(padGlyphForAction("right")).toBe("right");
    expect(padGlyphForAction("nonsense")).toBeNull();
  });
});

describe("locale catalogs", () => {
  it("only use markers the glyph layer knows", () => {
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      for (const [key, value] of Object.entries(catalog)) {
        for (const m of String(value).matchAll(/\[(\w+)\]/g)) {
          expect(KNOWN_TOKENS.has(m[1]), `${code} / ${key} uses [${m[1]}]`).toBe(true);
        }
      }
    }
  });

  it("agree with English on which strings carry markers", () => {
    const marked = (catalog) => Object.keys(catalog)
      .filter((k) => /\[\w+\]/.test(String(catalog[k]))).sort();
    const expected = marked(en);
    expect(expected.length).toBeGreaterThan(0);
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      expect(marked(catalog), `${code} marker coverage`).toEqual(expected);
    }
  });

  it("define the keyboard labels the markers fall back to", () => {
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      expect(catalog["key.enter"], `${code} key.enter`).toBeTruthy();
      expect(catalog["key.esc"], `${code} key.esc`).toBeTruthy();
      expect(catalog["common.space"], `${code} common.space`).toBeTruthy();
    }
  });
});
