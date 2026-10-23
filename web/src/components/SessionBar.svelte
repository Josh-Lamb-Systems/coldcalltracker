<script lang="ts">
  import { untrack } from "svelte";
  import { formatNumber, formatPercent, rateOf, METRICS } from "../lib/metrics";
  import { errorMessage } from "../lib/pb";
  import { perHour } from "../lib/stats";
  import { tally } from "../lib/tally.svelte";
  import { formatClock, formatDuration, formatTime } from "../lib/time";
  import { toasts } from "../lib/toasts.svelte";

  let now = $state(Date.now());
  let notes = $state("");
  let busy = $state(false);
  let error = $state("");

  const active = $derived(tally.active);
  const activeId = $derived(tally.active?.id);
  const elapsed = $derived(active ? now - active.startedAt.getTime() : 0);
  const pace = $derived(perHour(tally.counts.dials, elapsed));
  const unsaved = $derived(METRICS.reduce((sum, metric) => sum + Math.abs(tally.pending[metric]), 0));

  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  // When a different session becomes active (or ends), show its note. Only
  // the session id is tracked, so taps and reloads never clobber typing. A
  // note typed before the session started was sent along, so keep that text.
  $effect(() => {
    void activeId;
    untrack(() => {
      notes = tally.active ? tally.active.notes || notes : tally.notesDraft;
    });
  });

  async function run(action: () => Promise<unknown>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (err) {
      error = errorMessage(err);
    } finally {
      busy = false;
    }
  }

  function start() {
    return run(() => tally.start(notes.trim()));
  }

  function end() {
    return run(async () => {
      const counts = { ...tally.counts };
      const duration = elapsed;
      await tally.end();
      toasts.show(
        counts.dials || counts.owners || counts.attempts || counts.booked
          ? `Session saved: ${formatNumber(counts.dials)} dials, ${formatNumber(counts.booked)} booked in ${formatDuration(duration)}.`
          : "Empty session discarded.",
      );
    });
  }

  function saveNotes() {
    // Not via run(): End must stay clickable while the note saves (clicking
    // End blurs the input, which fires this first).
    tally.saveNotes(notes.trim()).catch((err) => (error = errorMessage(err)));
  }
</script>

<section class="session card" aria-label="Calling session">
  <div class="status">
    <span class="dot" class:live={active}></span>
    {#if active}
      <div>
        <strong>Session live</strong>
        <span class="muted">since {formatTime(active.startedAt)}</span>
      </div>
    {:else}
      <div>
        <strong>No session running</strong>
        <span class="muted">Tapping + on a counter starts one.</span>
      </div>
    {/if}
  </div>

  {#if active}
    <dl class="stats">
      <div>
        <dt>Time</dt>
        <dd class="tabular">{formatClock(elapsed)}</dd>
      </div>
      <div>
        <dt>Pace</dt>
        <dd class="tabular">{pace === null ? "—" : Math.round(pace)} <span class="unit">dials/hr</span></dd>
      </div>
      <div>
        <dt>Dial to booking</dt>
        <dd class="tabular">{formatPercent(rateOf(tally.counts, "overall"))}</dd>
      </div>
    </dl>
  {/if}

  <div class="actions">
    <input
      class="input notes"
      type="text"
      maxlength="500"
      placeholder={active ? "Session note: list, niche, script…" : "Session note (optional)"}
      aria-label="Session note"
      bind:value={notes}
      oninput={() => {
        if (!tally.active) tally.notesDraft = notes.trim();
      }}
      onchange={saveNotes}
    />
    {#if active}
      <button type="button" class="btn btn-secondary" disabled={busy} onclick={end}>End session</button>
    {:else}
      <button type="button" class="btn btn-primary" disabled={busy} onclick={start}>Start session</button>
    {/if}
  </div>

  {#if tally.offline}
    <p class="warning" role="status">
      Can't reach the server. {unsaved}
      {unsaved === 1 ? "tap is" : "taps are"} waiting and will save automatically.
    </p>
  {/if}
  {#if error || tally.error || tally.loadError}
    <p class="error-text" role="alert">{error || tally.error || tally.loadError}</p>
  {/if}
</section>

<style>
  .session {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 32px;
    margin-bottom: 16px;
    padding: 16px 20px;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.9375rem;
  }

  .status div {
    display: grid;
  }

  .status .muted {
    font-size: 0.8125rem;
  }

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--icon);
  }

  .dot.live {
    background: var(--accent);
    box-shadow: 0 0 0 0 rgb(49 196 141 / 0.6);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    70% {
      box-shadow: 0 0 0 8px rgb(49 196 141 / 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgb(49 196 141 / 0);
    }
  }

  .stats {
    display: flex;
    gap: 28px;
    margin: 0;
  }

  .stats div {
    display: grid;
    gap: 2px;
  }

  dt {
    font-size: 0.75rem;
    color: var(--ink-3);
  }

  dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
  }

  .unit {
    font-size: 0.8125rem;
    font-weight: 400;
    color: var(--ink-3);
  }

  .actions {
    display: flex;
    flex: 1;
    gap: 12px;
    min-width: 280px;
    justify-content: flex-end;
  }

  .notes {
    flex: 1;
    max-width: 360px;
  }

  .warning {
    width: 100%;
    font-size: 0.875rem;
    color: var(--warning);
  }

  .error-text {
    width: 100%;
  }

  @media (max-width: 720px) {
    .session {
      gap: 12px 20px;
      padding: 14px 16px;
    }

    .stats {
      gap: 20px;
    }

    .actions {
      min-width: 100%;
    }

    .notes {
      max-width: none;
    }
  }
</style>
