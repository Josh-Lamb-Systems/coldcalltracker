<script lang="ts">
  import { labelEvery, linePath } from "../lib/chart";
  import { formatNumber, formatPercent, RATES, ratio, type RateKey } from "../lib/metrics";
  import type { BucketSummary, Summary } from "../lib/stats";
  import { bucketLabel, type Grouping } from "../lib/time";

  let { buckets, grouping, total }: { buckets: BucketSummary[]; grouping: Grouping; total: Summary } = $props();

  // Categorical slots 1-3, validated against the card surface (dark mode).
  const SERIES: { key: RateKey; color: string }[] = [
    { key: "contact", color: "#3987e5" },
    { key: "attempt", color: "#d95926" },
    { key: "booking", color: "#199e70" },
  ];
  const TICKS = [0, 0.25, 0.5, 0.75, 1];
  const LEFT = 44;
  const RIGHT = 24;
  const TOP = 8;
  const PLOT = 200;
  const AXIS = 24;
  const height = TOP + PLOT + AXIS;

  let width = $state(0);
  let active = $state<number | null>(null);

  const plotWidth = $derived(Math.max(0, width - LEFT - RIGHT));
  const band = $derived(buckets.length ? plotWidth / buckets.length : 0);
  const every = $derived(labelEvery(buckets.length, plotWidth));
  const x = (index: number) => LEFT + band * index + band / 2;
  const y = (value: number) => TOP + PLOT - Math.min(1, value) * PLOT;

  const series = $derived(
    SERIES.map(({ key, color }) => {
      const rate = RATES.find((r) => r.key === key)!;
      const values = buckets.map((bucket) => ratio(bucket[rate.numerator], bucket[rate.denominator]));
      const points = values.map((value, index) => (value === null ? null : { x: x(index), y: y(value) }));
      // Points without a neighbour would be invisible as a line; draw them as dots.
      const lonely = points.filter((point, index) => point && !points[index - 1] && !points[index + 1]);
      return { rate, color, values, points, lonely, path: linePath(points) };
    }),
  );

  function onKeydown(event: KeyboardEvent) {
    if (!buckets.length) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      active = Math.min(buckets.length - 1, Math.max(0, (active ?? (step > 0 ? -1 : buckets.length)) + step));
    } else if (event.key === "Escape") {
      active = null;
    }
  }

  function track(event: PointerEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const left = event.clientX - svg.getBoundingClientRect().left;
    if (band > 0) active = Math.min(buckets.length - 1, Math.max(0, Math.floor((left - LEFT) / band)));
  }
</script>

<ul class="legend">
  {#each series as { rate, color } (rate.key)}
    <li>
      <span class="key" style:background={color}></span>
      <span>{rate.label}</span>
      <strong>{formatPercent(ratio(total[rate.numerator], total[rate.denominator]))}</strong>
    </li>
  {/each}
</ul>

<!-- Focusable so arrow keys can step through periods, mirroring hover. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="chart"
  bind:clientWidth={width}
  tabindex="0"
  role="group"
  aria-label="Conversion rates per {grouping}. Arrow keys step through periods; the breakdown table below lists every value."
  onkeydown={onKeydown}
  onblur={() => (active = null)}
>
  {#if width > 0}
    <svg
      {width}
      {height}
      aria-hidden="true"
      onpointermove={track}
      onpointerdown={track}
      onpointerleave={(event) => {
        if (event.pointerType !== "touch") active = null;
      }}
    >
      {#each TICKS as tick (tick)}
        <line class={tick === 0 ? "baseline" : "grid"} x1={LEFT} x2={LEFT + plotWidth} y1={y(tick)} y2={y(tick)} />
        <text class="tick" x={LEFT - 8} y={y(tick)} dy="0.32em" text-anchor="end">{tick * 100}%</text>
      {/each}

      {#each buckets as bucket, index (bucket.key)}
        {#if index % every === 0}
          <text class="tick" x={x(index)} y={TOP + PLOT + 16} text-anchor="middle">{bucketLabel(bucket.start, grouping)}</text>
        {/if}
      {/each}

      {#if active !== null}
        <line class="crosshair" x1={x(active)} x2={x(active)} y1={TOP} y2={TOP + PLOT} />
      {/if}

      {#each series as line (line.rate.key)}
        <path class="line" d={line.path} stroke={line.color} />
        {#each line.lonely as point, index (index)}
          <circle class="dot" cx={point!.x} cy={point!.y} r="4" fill={line.color} />
        {/each}
        {#if active !== null && line.points[active]}
          <circle class="dot" cx={line.points[active]!.x} cy={line.points[active]!.y} r="4.5" fill={line.color} />
        {/if}
      {/each}

      <rect class="hit" x={LEFT} y={TOP} width={plotWidth} height={PLOT} />
    </svg>

    {#if active !== null && buckets[active]}
      {@const bucket = buckets[active]}
      {@const left = x(active)}
      <div class="tooltip" style:left="{left}px" class:flip={left > width / 2}>
        <p class="when">{bucketLabel(bucket.start, grouping, true)}</p>
        {#each series as line (line.rate.key)}
          <p class="row">
            <span class="key" style:background={line.color}></span>
            <strong>{formatPercent(line.values[active])}</strong>
            <span>
              {line.rate.label}
              <span class="counts">
                ({formatNumber(bucket[line.rate.numerator])} / {formatNumber(bucket[line.rate.denominator])})
              </span>
            </span>
          </p>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
    font-size: 0.8125rem;
    color: var(--ink-3);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .legend strong {
    color: var(--ink);
  }

  .key {
    width: 16px;
    height: 2px;
    border-radius: 1px;
  }

  .chart {
    position: relative;
    border-radius: var(--radius);
  }

  svg {
    display: block;
    overflow: visible;
    touch-action: pan-y;
  }

  .tick {
    font-size: 11px;
    fill: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .grid {
    stroke: var(--hairline);
    shape-rendering: crispEdges;
  }

  .baseline {
    stroke: var(--axis);
    shape-rendering: crispEdges;
  }

  .crosshair {
    stroke: var(--ink-3);
    shape-rendering: crispEdges;
  }

  .line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  /* 2px surface ring keeps dots legible where lines cross. */
  .dot {
    stroke: var(--card);
    stroke-width: 2;
  }

  .hit {
    fill: transparent;
  }

  .tooltip {
    position: absolute;
    top: 0;
    z-index: 2;
    display: grid;
    gap: 4px;
    min-width: 180px;
    margin-left: 16px;
    padding: 10px 12px;
    background: var(--card-deep);
    border: 1px solid var(--axis);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 0.8125rem;
    pointer-events: none;
  }

  .tooltip.flip {
    transform: translateX(-100%);
    margin-left: -16px;
  }

  .when {
    margin-bottom: 2px;
    color: var(--ink-3);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .row strong {
    min-width: 3em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .counts {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
</style>
