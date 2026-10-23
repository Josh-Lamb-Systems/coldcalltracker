<script lang="ts">
  import { columnPath, countTicks, labelEvery, niceMax } from "../lib/chart";
  import { METRICS, METRIC_INFO, formatNumber, type Counts } from "../lib/metrics";
  import type { BucketSummary } from "../lib/stats";
  import { bucketLabel, type Grouping } from "../lib/time";

  // Small multiples: one column chart per metric, each on its own scale
  // (dials outnumber bookings ~50×), sharing the x axis and one tooltip.
  let {
    buckets,
    grouping,
    goals = null,
  }: { buckets: BucketSummary[]; grouping: Grouping; goals?: Counts | null } = $props();

  const LEFT = 44;
  const RIGHT = 24;
  const TITLE = 24;
  const PLOT = 64;
  const GAP = 16;
  const AXIS = 24;
  const height = METRICS.length * (TITLE + PLOT) + (METRICS.length - 1) * GAP + AXIS;

  let width = $state(0);
  let active = $state<number | null>(null);

  const plotWidth = $derived(Math.max(0, width - LEFT - RIGHT));
  const band = $derived(buckets.length ? plotWidth / buckets.length : 0);
  const barWidth = $derived(Math.max(1, Math.min(24, band - 2)));
  const every = $derived(labelEvery(buckets.length, plotWidth));
  const axisY = height - AXIS;

  const panels = $derived(
    METRICS.map((metric, index) => {
      const goal = goals?.[metric] ?? 0;
      const max = niceMax(Math.max(goal, ...buckets.map((bucket) => bucket[metric])));
      const top = index * (TITLE + PLOT + GAP) + TITLE;
      const y = (value: number) => top + PLOT - (value / max) * PLOT;
      return { metric, goal, max, top, y, ticks: countTicks(max) };
    }),
  );

  const center = (index: number) => LEFT + band * index + band / 2;

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
</script>

<!-- Focusable so arrow keys can step through periods, mirroring hover. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="chart"
  bind:clientWidth={width}
  tabindex="0"
  role="group"
  aria-label="Activity per {grouping}. Arrow keys step through periods; the breakdown table below lists every value."
  onkeydown={onKeydown}
  onblur={() => (active = null)}
>
  {#if width > 0}
    <svg {width} {height} aria-hidden="true" onpointerleave={(e) => e.pointerType !== "touch" && (active = null)}>
      {#each panels as panel (panel.metric)}
        <text class="title" x={LEFT} y={panel.top - 9}>{METRIC_INFO[panel.metric].label}</text>
        {#each panel.ticks as tick (tick)}
          <line
            class={tick === 0 ? "baseline" : "grid"}
            x1={LEFT}
            x2={LEFT + plotWidth}
            y1={panel.y(tick)}
            y2={panel.y(tick)}
          />
          <text class="tick" x={LEFT - 8} y={panel.y(tick)} dy="0.32em" text-anchor="end">{formatNumber(tick)}</text>
        {/each}
        {#if active !== null}
          <rect class="hover-band" x={LEFT + band * active} y={panel.top} width={band} height={PLOT} />
        {/if}
        {#each buckets as bucket, index (bucket.key)}
          <path
            d={columnPath(
              center(index) - barWidth / 2,
              panel.y(bucket[panel.metric]),
              barWidth,
              panel.top + PLOT - panel.y(bucket[panel.metric]),
            )}
            fill={METRIC_INFO[panel.metric].color}
            class:lift={active === index}
          />
        {/each}
        {#if panel.goal > 0}
          <line class="goal" x1={LEFT} x2={LEFT + plotWidth} y1={panel.y(panel.goal)} y2={panel.y(panel.goal)} />
          <text class="goal-label" x={LEFT + plotWidth} y={panel.y(panel.goal) - 4} text-anchor="end">
            Goal {formatNumber(panel.goal)}
          </text>
        {/if}
      {/each}

      {#each buckets as bucket, index (bucket.key)}
        {#if index % every === 0}
          <text class="tick" x={center(index)} y={axisY + 16} text-anchor="middle">{bucketLabel(bucket.start, grouping)}</text>
        {/if}
        <!-- Pointer hit area; keyboard users step with the arrow keys. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect
          class="hit"
          x={LEFT + band * index}
          y={0}
          width={band}
          height={axisY}
          onpointerenter={() => (active = index)}
          onpointerdown={() => (active = index)}
        />
      {/each}
    </svg>

    {#if active !== null && buckets[active]}
      {@const bucket = buckets[active]}
      {@const x = center(active)}
      <div class="tooltip" style:left="{x}px" class:flip={x > width / 2}>
        <p class="when">{bucketLabel(bucket.start, grouping, true)}</p>
        {#each METRICS as metric (metric)}
          <p class="row">
            <span class="key" style:background={METRIC_INFO[metric].color}></span>
            <strong>{formatNumber(bucket[metric])}</strong>
            <span>{METRIC_INFO[metric].short}</span>
          </p>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .chart {
    position: relative;
    min-height: 200px;
    border-radius: var(--radius);
  }

  svg {
    display: block;
    overflow: visible;
  }

  .title {
    font-size: 12px;
    font-weight: 600;
    fill: var(--ink-2);
  }

  .tick {
    font-size: 11px;
    fill: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .grid {
    stroke: var(--hairline);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .baseline {
    stroke: var(--axis);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .goal {
    stroke: var(--ink-3);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .goal-label {
    font-size: 11px;
    fill: var(--ink-2);
  }

  .hover-band {
    fill: rgb(255 255 255 / 0.05);
  }

  .lift {
    filter: brightness(1.25);
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
    min-width: 140px;
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
  }

  .row strong {
    min-width: 2.5em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .key {
    width: 12px;
    height: 3px;
    border-radius: 2px;
  }
</style>
