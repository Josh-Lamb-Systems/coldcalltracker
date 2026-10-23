import { describe, expect, it } from "vitest";
import { formatPercent, rateOf, ratio } from "./metrics";

describe("ratio", () => {
  it("is null when nothing to divide by", () => {
    expect(ratio(3, 0)).toBeNull();
    expect(ratio(0, 10)).toBe(0);
  });
});

describe("rateOf", () => {
  it("follows the funnel", () => {
    const counts = { dials: 53, owners: 7, attempts: 4, booked: 2 };
    expect(rateOf(counts, "contact")).toBeCloseTo(7 / 53);
    expect(rateOf(counts, "attempt")).toBeCloseTo(4 / 7);
    expect(rateOf(counts, "booking")).toBe(0.5);
    expect(rateOf(counts, "overall")).toBeCloseTo(2 / 53);
  });
});

describe("formatPercent", () => {
  it("keeps a decimal for small rates only", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(2 / 53)).toBe("3.8%");
    expect(formatPercent(7 / 53)).toBe("13%");
    expect(formatPercent(1)).toBe("100%");
  });
});
