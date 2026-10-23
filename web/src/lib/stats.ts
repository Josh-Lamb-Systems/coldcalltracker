import type { RecordModel } from "pocketbase";
import { METRICS, emptyCounts, type Counts } from "./metrics";
import { bucketStart, dateKey, enumerateBuckets, parsePbDate, type DateRange, type Grouping } from "./time";

export interface Session extends Counts {
  id: string;
  user: string;
  startedAt: Date;
  endedAt: Date | null;
  updated: string;
  notes: string;
}

export interface Summary extends Counts {
  sessions: number;
  durationMs: number;
}

export interface BucketSummary extends Summary {
  key: string;
  start: Date;
}

export interface CallerSummary extends Summary {
  user: string;
}

export function sessionFromRecord(record: RecordModel): Session {
  return {
    id: record.id,
    user: record.user,
    startedAt: parsePbDate(record.started_at)!,
    endedAt: parsePbDate(record.ended_at),
    updated: record.updated,
    notes: record.notes ?? "",
    dials: record.dials ?? 0,
    owners: record.owners ?? 0,
    attempts: record.attempts ?? 0,
    booked: record.booked ?? 0,
  };
}

/** Open sessions are measured up to `now`. */
export function sessionDurationMs(session: Session, now: Date): number {
  const end = session.endedAt ?? now;
  return Math.max(0, end.getTime() - session.startedAt.getTime());
}

export function emptySummary(): Summary {
  return { ...emptyCounts(), sessions: 0, durationMs: 0 };
}

function addSession(summary: Summary, session: Session, now: Date) {
  for (const metric of METRICS) summary[metric] += session[metric];
  summary.sessions += 1;
  summary.durationMs += sessionDurationMs(session, now);
}

export function summarize(sessions: Session[], now: Date): Summary {
  const summary = emptySummary();
  for (const session of sessions) addSession(summary, session, now);
  return summary;
}

/** Rate per hour on the phone; null until there's at least a minute of data. */
export function perHour(count: number, durationMs: number): number | null {
  return durationMs >= 60_000 ? count / (durationMs / 3_600_000) : null;
}

/** Sessions belong to the bucket they started in. Empty buckets are kept. */
export function groupByBucket(
  sessions: Session[],
  range: DateRange,
  grouping: Grouping,
  now: Date,
): BucketSummary[] {
  const buckets = enumerateBuckets(range, grouping).map((start) => ({
    ...emptySummary(),
    key: dateKey(start),
    start,
  }));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const session of sessions) {
    const bucket = byKey.get(dateKey(bucketStart(session.startedAt, grouping)));
    if (bucket) addSession(bucket, session, now);
  }
  return buckets;
}

/** One row per caller (including callers with no sessions), best first. */
export function groupByCaller(sessions: Session[], userIds: string[], now: Date): CallerSummary[] {
  const byUser = new Map<string, CallerSummary>();
  for (const user of userIds) byUser.set(user, { ...emptySummary(), user });
  for (const session of sessions) {
    let row = byUser.get(session.user);
    if (!row) {
      row = { ...emptySummary(), user: session.user };
      byUser.set(session.user, row);
    }
    addSession(row, session, now);
  }
  return [...byUser.values()].sort(
    (a, b) => b.booked - a.booked || b.attempts - a.attempts || b.dials - a.dials,
  );
}
