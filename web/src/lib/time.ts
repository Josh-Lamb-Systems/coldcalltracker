// Date helpers. Everything is bucketed in the viewer's local timezone, so a
// "day" starts at the viewer's midnight.

export type Grouping = "day" | "week" | "month";

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "month" | "year" | "all";

/** Half-open range: from <= t < to. */
export interface DateRange {
  from: Date;
  to: Date;
}

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar-day arithmetic, so DST changes don't shift midnight. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Weeks start on Monday. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function presetRange(preset: RangePreset, now: Date, earliest?: Date): DateRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (preset) {
    case "today":
      return { from: today, to: tomorrow };
    case "yesterday":
      return { from: addDays(today, -1), to: today };
    case "7d":
      return { from: addDays(today, -6), to: tomorrow };
    case "30d":
      return { from: addDays(today, -29), to: tomorrow };
    case "90d":
      return { from: addDays(today, -89), to: tomorrow };
    case "month":
      return { from: startOfMonth(now), to: tomorrow };
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1), to: tomorrow };
    case "all":
      return { from: earliest && earliest < today ? startOfDay(earliest) : today, to: tomorrow };
  }
}

/** Picks a grouping that keeps charts readable: ~31 bars at most per view. */
export function defaultGrouping(range: DateRange): Grouping {
  const days = Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS);
  if (days <= 31) return "day";
  if (days <= 190) return "week";
  return "month";
}

export function bucketStart(date: Date, grouping: Grouping): Date {
  if (grouping === "day") return startOfDay(date);
  if (grouping === "week") return startOfWeek(date);
  return startOfMonth(date);
}

function nextBucket(start: Date, grouping: Grouping): Date {
  if (grouping === "day") return addDays(start, 1);
  if (grouping === "week") return addDays(start, 7);
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

/** Every bucket overlapping the range, including empty ones. */
export function enumerateBuckets(range: DateRange, grouping: Grouping): Date[] {
  const buckets: Date[] = [];
  for (let start = bucketStart(range.from, grouping); start < range.to; start = nextBucket(start, grouping)) {
    buckets.push(start);
  }
  return buckets;
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function bucketLabel(start: Date, grouping: Grouping, long = false): string {
  if (grouping === "month") {
    return start.toLocaleDateString(undefined, { month: long ? "long" : "short", year: "numeric" });
  }
  const label = start.toLocaleDateString(undefined, {
    weekday: long && grouping === "day" ? "short" : undefined,
    month: "short",
    day: "numeric",
  });
  return grouping === "week" && long ? `Week of ${label}` : label;
}

/** PocketBase stores "2026-10-23 19:24:24.190Z"; Safari can't parse the space. */
export function parsePbDate(value: string | null | undefined): Date | null {
  return value ? new Date(value.replace(" ", "T")) : null;
}

export function toPbDate(date: Date): string {
  return date.toISOString().replace("T", " ");
}

/** "2h 05m", "12m", "<1m". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  if (minutes === 0 && ms > 0) return "<1m";
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Live timer, "1:02:03" or "02:03". */
export function formatClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
