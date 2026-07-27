import { describe, it, expect } from "vitest";
import {
  dailyKey, weeklyKey, isoWeekParts, dailyResetsAt, weeklyResetsAt,
  resetsAt, periodKey, formatCountdown,
} from "../shared/periods.js";

const utc = (s) => Date.parse(s);

describe("daily period", () => {
  it("keys by UTC calendar day", () => {
    expect(dailyKey(utc("2026-07-27T12:00:00Z"))).toBe("d:2026-07-27");
  });

  it("keeps the same key all day and flips exactly at UTC midnight", () => {
    expect(dailyKey(utc("2026-07-27T00:00:00Z"))).toBe("d:2026-07-27");
    expect(dailyKey(utc("2026-07-27T23:59:59Z"))).toBe("d:2026-07-27");
    expect(dailyKey(utc("2026-07-28T00:00:00Z"))).toBe("d:2026-07-28");
  });

  it("uses UTC, not local time", () => {
    // 23:30 UTC is already "tomorrow" in Sydney and still "today" in São Paulo;
    // both players must land on the same key or their boards diverge.
    expect(dailyKey(utc("2026-07-27T23:30:00Z"))).toBe("d:2026-07-27");
  });

  it("resets at the next UTC midnight", () => {
    expect(dailyResetsAt(utc("2026-07-27T12:00:00Z"))).toBe(utc("2026-07-28T00:00:00Z"));
    expect(dailyResetsAt(utc("2026-07-27T00:00:00Z"))).toBe(utc("2026-07-28T00:00:00Z"));
  });

  it("rolls over month and year ends", () => {
    expect(dailyResetsAt(utc("2026-01-31T18:00:00Z"))).toBe(utc("2026-02-01T00:00:00Z"));
    expect(dailyResetsAt(utc("2026-12-31T18:00:00Z"))).toBe(utc("2027-01-01T00:00:00Z"));
  });

  it("handles a leap day", () => {
    expect(dailyKey(utc("2028-02-29T10:00:00Z"))).toBe("d:2028-02-29");
    expect(dailyResetsAt(utc("2028-02-29T10:00:00Z"))).toBe(utc("2028-03-01T00:00:00Z"));
  });
});

describe("weekly period (ISO, Monday-based)", () => {
  it("keys by ISO week", () => {
    // 2026-07-27 is a Monday — the first day of ISO week 31.
    expect(weeklyKey(utc("2026-07-27T00:00:00Z"))).toBe("w:2026-W31");
    expect(weeklyKey(utc("2026-08-02T23:59:00Z"))).toBe("w:2026-W31"); // that Sunday
    expect(weeklyKey(utc("2026-08-03T00:00:00Z"))).toBe("w:2026-W32"); // next Monday
  });

  it("pads the week number to two digits so keys sort", () => {
    expect(weeklyKey(utc("2026-01-08T00:00:00Z"))).toMatch(/^w:\d{4}-W0\d$/);
  });

  it("uses the ISO week-numbering year, which is not always the calendar year", () => {
    // 2026-01-01 is a Thursday, so it belongs to week 1 of 2026.
    expect(isoWeekParts(utc("2026-01-01T00:00:00Z"))).toEqual({ year: 2026, week: 1 });
    // 2027-01-01 is a Friday, so it belongs to week 53 of 2026 — using the
    // calendar year here would make the key jump backwards at New Year.
    expect(isoWeekParts(utc("2027-01-01T00:00:00Z"))).toEqual({ year: 2026, week: 53 });
    expect(weeklyKey(utc("2027-01-01T00:00:00Z"))).toBe("w:2026-W53");
  });

  it("resets at the next UTC Monday midnight", () => {
    // Wednesday 2026-07-29 -> Monday 2026-08-03.
    expect(weeklyResetsAt(utc("2026-07-29T15:00:00Z"))).toBe(utc("2026-08-03T00:00:00Z"));
    // Sunday is the last day of the week, so its reset is the very next day.
    expect(weeklyResetsAt(utc("2026-08-02T23:00:00Z"))).toBe(utc("2026-08-03T00:00:00Z"));
    // Monday itself gets a full seven days, not zero.
    expect(weeklyResetsAt(utc("2026-08-03T00:00:00Z"))).toBe(utc("2026-08-10T00:00:00Z"));
  });

  it("always resets no earlier than the daily board", () => {
    for (const d of ["2026-07-27", "2026-07-29", "2026-08-01", "2026-08-02"]) {
      const t = utc(`${d}T12:00:00Z`);
      expect(weeklyResetsAt(t)).toBeGreaterThanOrEqual(dailyResetsAt(t));
    }
  });
});

describe("period dispatch", () => {
  it("routes by name and defaults to daily", () => {
    const t = utc("2026-07-29T12:00:00Z");
    expect(periodKey("weekly", t)).toBe(weeklyKey(t));
    expect(periodKey("daily", t)).toBe(dailyKey(t));
    expect(periodKey("nonsense", t)).toBe(dailyKey(t));
    expect(resetsAt("weekly", t)).toBe(weeklyResetsAt(t));
    expect(resetsAt("daily", t)).toBe(dailyResetsAt(t));
  });
});

describe("countdown formatting", () => {
  it("shows days and hours when far out", () => {
    expect(formatCountdown(3 * 86400e3 + 4 * 3600e3)).toBe("3d 4h");
  });

  it("shows hours and minutes within a day", () => {
    expect(formatCountdown(4 * 3600e3 + 12 * 60e3)).toBe("4h 12m");
  });

  it("shows minutes and seconds in the last hour", () => {
    expect(formatCountdown(12 * 60e3 + 30e3)).toBe("12m 30s");
  });

  it("never shows a negative or nonsense countdown", () => {
    expect(formatCountdown(0)).toBe("0m");
    expect(formatCountdown(-5000)).toBe("0m");
    expect(formatCountdown(NaN)).toBe("0m");
    expect(formatCountdown(Infinity)).toBe("0m");
  });
});
