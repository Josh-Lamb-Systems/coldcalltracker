// Geometry helpers for the hand-rolled SVG charts.

const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Rounds up to a clean axis maximum (1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10^n). */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const nice = NICE_STEPS.find((step) => value <= step * magnitude)!;
  return Math.round(nice * magnitude * 1e6) / 1e6;
}

/** Axis ticks for whole-number data: 0, the midpoint when it's whole, and max. */
export function countTicks(max: number): number[] {
  return Number.isInteger(max / 2) && max >= 2 ? [0, max / 2, max] : [0, max];
}

/**
 * A column with a 4px rounded data end and a square baseline.
 * (x, y) is the top-left corner; height grows down to the baseline.
 */
export function columnPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (height <= 0 || width <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `H${x + width - r}`,
    `A${r},${r} 0 0 1 ${x + width},${y + r}`,
    `V${y + height}`,
    "Z",
  ].join("");
}

/** A polyline that breaks wherever a point is missing (no data). */
export function linePath(points: ({ x: number; y: number } | null)[]): string {
  let path = "";
  let penDown = false;
  for (const point of points) {
    if (!point) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${point.x},${point.y}`;
    penDown = true;
  }
  return path;
}

/** Show every nth x label so they don't collide. */
export function labelEvery(count: number, width: number, minSpacing = 64): number {
  const fit = Math.max(1, Math.floor(width / minSpacing));
  return Math.max(1, Math.ceil(count / fit));
}
