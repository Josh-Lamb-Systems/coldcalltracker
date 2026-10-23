import { describe, expect, it } from "vitest";
import {
  addDays,
  dateKey,
  defaultGrouping,
  enumerateBuckets,
  formatClock,
  formatDuration,
  parsePbDate,
  presetRange,
  startOfWeek,
  toPbDate,
} from "./time";

describe("startOfWeek", () => {
  it("starts weeks on Monday", () => {
    expect(dateKey(startOfWeek(new Date(2026, 9, 21, 15)))).toBe("2026-10-19"); // Wednesday
    expect(dateKey(startOfWeek(new Date(2026, 9, 19, 0)))).toBe("2026-10-19"); // Monday
    expect(dateKey(startOfWeek(new Date(2026, 9, 25, 23)))).toBe("2026-10-19"); // Sunday
  });
});

describe("addDays", () => {
  it("lands on local midnight across the DST change", () => {
    const day = addDays(new Date(2026, 9, 31), 1); // US DST ends Nov 1, 2026
    expect(dateKey(day)).toBe("2026-11-01");
    expect(day.getHours()).toBe(0);
    expect(addDays(day, 1).getTime() - day.getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

describe("presetRange", () => {
  const now = new Date(2026, 9, 23, 14, 30);

  it("covers whole local days, ending at tomorrow's midnight", () => {
    const range = presetRange("7d", now);
    expect(dateKey(range.from)).toBe("2026-10-17");
    expect(dateKey(range.to)).toBe("2026-10-24");
    expect(range.from.getHours()).toBe(0);
  });

  it("handles yesterday, month and year", () => {
    expect(dateKey(presetRange("yesterday", now).from)).toBe("2026-10-22");
    expect(dateKey(presetRange("yesterday", now).to)).toBe("2026-10-23");
    expect(dateKey(presetRange("month", now).from)).toBe("2026-10-01");
    expect(dateKey(presetRange("year", now).from)).toBe("2026-01-01");
  });

  it("starts all-time at the earliest session", () => {
    expect(dateKey(presetRange("all", now, new Date(2026, 2, 5, 9)).from)).toBe("2026-03-05");
    expect(dateKey(presetRange("all", now).from)).toBe("2026-10-23");
  });
});

describe("defaultGrouping", () => {
  const now = new Date(2026, 9, 23);
  it("keeps charts to about a month of bars", () => {
    expect(defaultGrouping(presetRange("30d", now))).toBe("day");
    expect(defaultGrouping(presetRange("90d", now))).toBe("week");
    expect(defaultGrouping(presetRange("year", now))).toBe("month");
  });
});

describe("enumerateBuckets", () => {
  it("lists every day, including the 25-hour DST day", () => {
    const keys = enumerateBuckets({ from: new Date(2026, 9, 31), to: new Date(2026, 10, 4) }, "day").map(dateKey);
    expect(keys).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("aligns weeks to Monday and months to the 1st", () => {
    const range = { from: new Date(2026, 9, 21), to: new Date(2026, 10, 5) };
    expect(enumerateBuckets(range, "week").map(dateKey)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(enumerateBuckets(range, "month").map(dateKey)).toEqual(["2026-10-01", "2026-11-01"]);
  });
});

describe("PocketBase dates", () => {
  it("round-trips the PocketBase format", () => {
    const date = parsePbDate("2026-10-23 19:24:24.190Z")!;
    expect(date.toISOString()).toBe("2026-10-23T19:24:24.190Z");
    expect(toPbDate(date)).toBe("2026-10-23 19:24:24.190Z");
  });

  it("treats an empty date as null", () => {
    expect(parsePbDate("")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(59_000)).toBe("<1m");
    expect(formatDuration(12 * 60_000)).toBe("12m");
    expect(formatDuration(125 * 60_000)).toBe("2h 05m");
  });

  it("formats the live clock", () => {
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(3_723_000)).toBe("1:02:03");
  });
});
