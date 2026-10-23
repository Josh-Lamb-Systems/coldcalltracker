import { describe, expect, it } from "vitest";
import { columnPath, countTicks, labelEvery, linePath, niceMax } from "./chart";

describe("niceMax", () => {
  it("rounds up to clean numbers", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(3)).toBe(3);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(17)).toBe(20);
    expect(niceMax(112)).toBe(150);
    expect(niceMax(240)).toBe(250);
    expect(niceMax(556)).toBe(600);
    expect(niceMax(0.07)).toBe(0.08);
  });
});

describe("countTicks", () => {
  it("only adds a midpoint when it is a whole number", () => {
    expect(countTicks(10)).toEqual([0, 5, 10]);
    expect(countTicks(25)).toEqual([0, 25]);
    expect(countTicks(1)).toEqual([0, 1]);
  });
});

describe("columnPath", () => {
  it("rounds the top and keeps the baseline square", () => {
    expect(columnPath(10, 20, 24, 40)).toBe("M10,60V24A4,4 0 0 1 14,20H30A4,4 0 0 1 34,24V60Z");
  });

  it("shrinks the radius for tiny columns and skips empty ones", () => {
    expect(columnPath(0, 0, 4, 1)).toBe("M0,1V1A1,1 0 0 1 1,0H3A1,1 0 0 1 4,1V1Z");
    expect(columnPath(0, 0, 10, 0)).toBe("");
  });
});

describe("linePath", () => {
  it("lifts the pen over gaps", () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, null, { x: 3, y: 4 }, { x: 4, y: 5 }])).toBe(
      "M0,1L1,2M3,4L4,5",
    );
  });
});

describe("labelEvery", () => {
  it("thins labels on narrow charts", () => {
    expect(labelEvery(7, 700)).toBe(1);
    expect(labelEvery(30, 320)).toBe(6);
  });
});
