export const METRICS = ["dials", "owners", "attempts", "booked"] as const;

export type Metric = (typeof METRICS)[number];
export type Counts = Record<Metric, number>;

export const METRIC_INFO: Record<Metric, { label: string; short: string; color: string }> = {
  // Funnel stages wear one green ramp, dimmest (first stage) to brightest
  // (the outcome). Validated as an ordinal ramp against the card surface.
  dials: { label: "Dials", short: "Dials", color: "#008050" },
  owners: { label: "Owners Reached", short: "Owners", color: "#009664" },
  attempts: { label: "Booking Attempts", short: "Attempts", color: "#12ac79" },
  booked: { label: "Appointments Booked", short: "Booked", color: "#31c48d" },
};

export type RateKey = "contact" | "attempt" | "booking" | "overall";

export const RATES: {
  key: RateKey;
  label: string;
  numerator: Metric;
  denominator: Metric;
  description: string;
}[] = [
  {
    key: "contact",
    label: "Contact rate",
    numerator: "owners",
    denominator: "dials",
    description: "Owners reached per dial",
  },
  {
    key: "attempt",
    label: "Attempt rate",
    numerator: "attempts",
    denominator: "owners",
    description: "Booking attempts per owner reached",
  },
  {
    key: "booking",
    label: "Booking rate",
    numerator: "booked",
    denominator: "attempts",
    description: "Appointments booked per booking attempt",
  },
  {
    key: "overall",
    label: "Dial to booking",
    numerator: "booked",
    denominator: "dials",
    description: "Appointments booked per dial",
  },
];

export function emptyCounts(): Counts {
  return { dials: 0, owners: 0, attempts: 0, booked: 0 };
}

export function addCounts(a: Counts, b: Counts): Counts {
  return {
    dials: a.dials + b.dials,
    owners: a.owners + b.owners,
    attempts: a.attempts + b.attempts,
    booked: a.booked + b.booked,
  };
}

/** Returns null when the denominator is zero, so callers can show "—". */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function rateOf(counts: Counts, key: RateKey): number | null {
  const rate = RATES.find((r) => r.key === key)!;
  return ratio(counts[rate.numerator], counts[rate.denominator]);
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  const percent = value * 100;
  if (percent > 0 && percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}
