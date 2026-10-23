<script lang="ts">
  import { formatNumber } from "../lib/metrics";

  let { value, goal, label }: { value: number; goal: number; label: string } = $props();

  const progress = $derived(goal > 0 ? Math.min(1, value / goal) : 0);
  const met = $derived(goal > 0 && value >= goal);
</script>

<div class="meter">
  <div class="caption">
    <span>Today <strong class="tabular">{formatNumber(value)}</strong>{#if goal > 0}&nbsp;/ {formatNumber(goal)}{/if}</span>
    {#if met}
      <span class="met">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Goal hit
      </span>
    {:else if goal > 0}
      <span class="tabular">{Math.floor(progress * 100)}%</span>
    {/if}
  </div>
  {#if goal > 0}
    <div
      class="track"
      role="progressbar"
      aria-label="{label}: today's progress toward your goal"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(value, goal)}
    >
      <div class="fill" style:width="{progress * 100}%"></div>
    </div>
  {/if}
</div>

<style>
  .meter {
    display: grid;
    gap: 6px;
    width: 100%;
  }

  .caption {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.8125rem;
    color: var(--ink-3);
  }

  strong {
    color: var(--ink-2);
  }

  .met {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ink-2);
    font-weight: 600;
  }

  .met svg {
    color: var(--accent);
  }

  /* Track is a dim step of the same green as the fill. */
  .track {
    height: 6px;
    overflow: hidden;
    background: rgb(49 196 141 / 0.16);
    border-radius: 3px;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.25s ease-out;
  }
</style>
