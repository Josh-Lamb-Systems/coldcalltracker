<script lang="ts">
  import { METRICS, METRIC_INFO, RATES, formatNumber, formatPercent, ratio, type Counts } from "../lib/metrics";

  let { counts }: { counts: Counts } = $props();

  const max = $derived(Math.max(1, ...METRICS.map((metric) => counts[metric])));
  // The step from each stage to the next: contact, attempt and booking rates.
  const steps = RATES.slice(0, 3);
</script>

<ol class="funnel">
  {#each METRICS as metric, index (metric)}
    <li>
      <span class="name">{METRIC_INFO[metric].label}</span>
      <span class="track">
        <span
          class="bar"
          style:--share={counts[metric] / max}
          style:background={METRIC_INFO[metric].color}
          class:empty={counts[metric] === 0}
        ></span>
        <span class="value">{formatNumber(counts[metric])}</span>
      </span>
    </li>
    {#if index < steps.length}
      {@const step = steps[index]}
      <li class="step">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M6 1v9M2.5 6.5 6 10l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <strong>{formatPercent(ratio(counts[step.numerator], counts[step.denominator]))}</strong>
        <span>{step.label.toLowerCase()}</span>
      </li>
    {/if}
  {/each}
</ol>

<style>
  .funnel {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }

  .name {
    font-size: 0.875rem;
    color: var(--ink-2);
  }

  .track {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* Leaves room after the bar for its value label. */
  .bar {
    width: calc((100% - 64px) * var(--share));
    min-width: 3px;
    height: 20px;
    border-radius: 0 4px 4px 0;
  }

  .bar.empty {
    min-width: 0;
  }

  .value {
    font-size: 0.9375rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .step {
    display: flex;
    gap: 6px;
    padding-left: 160px;
    font-size: 0.8125rem;
    color: var(--ink-3);
  }

  .step strong {
    color: var(--ink-2);
  }

  .step svg {
    align-self: center;
  }

  @media (max-width: 560px) {
    li {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .step {
      padding-left: 0;
    }
  }
</style>
