<script lang="ts">
  import CounterCard from "../components/CounterCard.svelte";
  import Dialog from "../components/Dialog.svelte";
  import SessionBar from "../components/SessionBar.svelte";
  import { auth } from "../lib/auth.svelte";
  import { METRICS, METRIC_INFO, formatPercent, rateOf, type Metric } from "../lib/metrics";
  import { errorMessage } from "../lib/pb";
  import { perHour, summarize } from "../lib/stats";
  import { tally } from "../lib/tally.svelte";
  import { formatDuration } from "../lib/time";
  import { toasts } from "../lib/toasts.svelte";

  let now = $state(new Date());
  let editing = $state<Metric>("dials");
  let editValue = $state(0);
  let dialogOpen = $state(false);
  let dialogError = $state("");

  $effect(() => {
    const timer = setInterval(() => (now = new Date()), 30_000);
    return () => clearInterval(timer);
  });

  const todaySummary = $derived.by(() => {
    const sessions = [...tally.finished];
    if (tally.active && tally.active.startedAt >= tally.todayStart) sessions.push(tally.active);
    return summarize(sessions, now);
  });

  function detail(metric: Metric): string {
    const counts = tally.counts;
    switch (metric) {
      case "dials": {
        const elapsed = tally.active ? now.getTime() - tally.active.startedAt.getTime() : 0;
        const pace = perHour(counts.dials, elapsed);
        return `${pace === null ? "—" : Math.round(pace)} per hour`;
      }
      case "owners":
        return `${formatPercent(rateOf(counts, "contact"))} of dials`;
      case "attempts":
        return `${formatPercent(rateOf(counts, "attempt"))} of owners`;
      case "booked":
        return `${formatPercent(rateOf(counts, "booking"))} of attempts`;
    }
  }

  function openSetValue(metric: Metric) {
    editing = metric;
    editValue = tally.counts[metric];
    dialogError = "";
    dialogOpen = true;
  }

  /** Returns an error message, or null on success. */
  async function setValue(metric: Metric, value: number): Promise<string | null> {
    try {
      await tally.setValue(metric, value);
      return null;
    } catch (err) {
      return errorMessage(err, "Couldn't update the counter.");
    }
  }

  async function saveValue(event: SubmitEvent) {
    event.preventDefault();
    dialogError = (await setValue(editing, Math.max(0, Math.floor(Number(editValue) || 0)))) ?? "";
    if (!dialogError) dialogOpen = false;
  }

  async function reset(metric: Metric) {
    if (tally.counts[metric] === 0) return;
    if (!confirm(`Reset ${METRIC_INFO[metric].label} to 0 for this session?`)) return;
    const error = await setValue(metric, 0);
    if (error) toasts.show(error);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    if (document.querySelector("dialog[open]")) return;
    // event.code, so Shift+1 still reads as "1" on every keyboard layout.
    const match = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
    if (!match) return;
    event.preventDefault();
    tally.tap(METRICS[Number(match[1]) - 1], event.shiftKey ? -1 : 1);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<h1 class="visually-hidden">Counter</h1>

<SessionBar />

<div class="grid" class:loading={!tally.loaded}>
  {#each METRICS as metric, index (metric)}
    <CounterCard
      label={METRIC_INFO[metric].label}
      count={tally.counts[metric]}
      detail={detail(metric)}
      today={tally.today[metric]}
      goal={auth.user?.[`goal_${metric}`] ?? 0}
      shortcut={String(index + 1)}
      onadd={() => tally.tap(metric, 1)}
      onsubtract={() => tally.tap(metric, -1)}
      onset={() => openSetValue(metric)}
      onreset={() => reset(metric)}
    />
  {/each}
</div>

<p class="footer">
  <span>
    Today: {todaySummary.sessions}
    {todaySummary.sessions === 1 ? "session" : "sessions"} · {formatDuration(todaySummary.durationMs)} on the phone
  </span>
  <span class="keys">
    Keyboard: <kbd>1</kbd>–<kbd>4</kbd> add · <kbd>Shift</kbd> + <kbd>1</kbd>–<kbd>4</kbd> subtract
  </span>
</p>

<Dialog bind:open={dialogOpen} title="Set {METRIC_INFO[editing].label}">
  <form class="set-value" onsubmit={saveValue}>
    <div class="field">
      <label for="set-value">Count for this session</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="set-value" class="input" type="number" min="0" step="1" required autofocus bind:value={editValue} />
    </div>
    {#if dialogError}
      <p class="error-text" role="alert">{dialogError}</p>
    {/if}
    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" onclick={() => (dialogOpen = false)}>Cancel</button>
      <button type="submit" class="btn btn-primary">Save</button>
    </div>
  </form>
</Dialog>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    transition: opacity 0.2s;
  }

  .grid.loading {
    opacity: 0.5;
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px 24px;
    margin-top: 20px;
    font-size: 0.875rem;
    color: var(--ink-2);
  }

  kbd {
    padding: 0 5px;
    border: 1px solid var(--axis);
    border-radius: 4px;
    font-family: var(--font);
    font-size: 0.75rem;
  }

  .set-value {
    display: grid;
    gap: 16px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  @media (max-width: 1023px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .grid {
      gap: 12px;
    }

    .keys {
      display: none;
    }
  }
</style>
