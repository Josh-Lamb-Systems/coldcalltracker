import { describe, expect, it } from "vitest";
import { groupByBucket, groupByCaller, perHour, sessionFromRecord, summarize, type Session } from "./stats";
import type { Counts } from "./metrics";

function session(
  user: string,
  startedAt: Date,
  minutes: number | null,
  counts: Partial<Counts> = {},
): Session {
  return {
    id: Math.random().toString(36).slice(2),
    user,
    startedAt,
    endedAt: minutes === null ? null : new Date(startedAt.getTime() + minutes * 60_000),
    updated: "",
    notes: "",
    dials: 0,
    owners: 0,
    attempts: 0,
    booked: 0,
    ...counts,
  };
}

const now = new Date(2026, 9, 23, 17, 0);

describe("summarize", () => {
  it("adds counts and durations, measuring open sessions up to now", () => {
    const summary = summarize(
      [
        session("a", new Date(2026, 9, 23, 9, 0), 90, { dials: 60, owners: 6, attempts: 3, booked: 1 }),
        session("a", new Date(2026, 9, 23, 16, 30), null, { dials: 20, owners: 2 }),
      ],
      now,
    );
    expect(summary).toMatchObject({ dials: 80, owners: 8, attempts: 3, booked: 1, sessions: 2 });
    expect(summary.durationMs).toBe(120 * 60_000);
  });
});

describe("perHour", () => {
  it("needs at least a minute of data", () => {
    expect(perHour(5, 30_000)).toBeNull();
    expect(perHour(30, 30 * 60_000)).toBe(60);
  });
});

describe("groupByBucket", () => {
  it("buckets by the local day a session started, keeping empty days", () => {
    const late = new Date(2026, 9, 21, 23, 30); // already Oct 22 in UTC
    const buckets = groupByBucket(
      [
        session("a", late, 20, { dials: 10 }),
        session("b", new Date(2026, 9, 23, 10), 30, { dials: 5, booked: 1 }),
        session("a", new Date(2026, 8, 1), 30, { dials: 99 }), // outside the range
      ],
      { from: new Date(2026, 9, 21), to: new Date(2026, 9, 24) },
      "day",
      now,
    );
    expect(buckets.map((b) => [b.key, b.dials, b.sessions])).toEqual([
      ["2026-10-21", 10, 1],
      ["2026-10-22", 0, 0],
      ["2026-10-23", 5, 1],
    ]);
  });

  it("groups by week", () => {
    const buckets = groupByBucket(
      [
        session("a", new Date(2026, 9, 19, 9), 60, { dials: 1 }),
        session("a", new Date(2026, 9, 25, 9), 60, { dials: 2 }),
        session("a", new Date(2026, 9, 26, 9), 60, { dials: 4 }),
      ],
      { from: new Date(2026, 9, 19), to: new Date(2026, 10, 2) },
      "week",
      now,
    );
    expect(buckets.map((b) => [b.key, b.dials])).toEqual([
      ["2026-10-19", 3],
      ["2026-10-26", 4],
    ]);
  });
});

describe("groupByCaller", () => {
  it("includes idle callers and ranks by bookings, then attempts, then dials", () => {
    const rows = groupByCaller(
      [
        session("a", new Date(2026, 9, 23, 9), 60, { dials: 100, booked: 1 }),
        session("b", new Date(2026, 9, 23, 9), 60, { dials: 50, attempts: 4, booked: 1 }),
        session("c", new Date(2026, 9, 23, 9), 60, { dials: 80 }),
      ],
      ["a", "b", "c", "d"],
      now,
    );
    expect(rows.map((r) => r.user)).toEqual(["b", "a", "c", "d"]);
    expect(rows[3]).toMatchObject({ dials: 0, sessions: 0 });
  });
});

describe("sessionFromRecord", () => {
  it("parses PocketBase records", () => {
    const parsed = sessionFromRecord({
      id: "s1",
      collectionId: "c",
      collectionName: "sessions",
      user: "u1",
      started_at: "2026-10-23 13:00:00.000Z",
      ended_at: "",
      updated: "2026-10-23 13:05:00.000Z",
      notes: "Dentists",
      dials: 3,
      owners: 1,
      attempts: 0,
      booked: 0,
    });
    expect(parsed.startedAt.toISOString()).toBe("2026-10-23T13:00:00.000Z");
    expect(parsed.endedAt).toBeNull();
    expect(parsed).toMatchObject({ user: "u1", dials: 3, owners: 1, notes: "Dentists" });
  });
});
