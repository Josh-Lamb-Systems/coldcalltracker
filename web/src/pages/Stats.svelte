<script lang="ts">
  import type { UnsubscribeFunc } from "pocketbase";
  import { untrack } from "svelte";
  import ActivityChart from "../components/ActivityChart.svelte";
  import BreakdownTable from "../components/BreakdownTable.svelte";
  import FunnelChart from "../components/FunnelChart.svelte";
  import Leaderboard from "../components/Leaderboard.svelte";
  import RateChart from "../components/RateChart.svelte";
  import SessionsTable from "../components/SessionsTable.svelte";
  import StatTile from "../components/StatTile.svelte";
  import { auth, displayName, type Caller } from "../lib/auth.svelte";
  import { METRICS, formatNumber, formatPercent, rateOf, type Counts } from "../lib/metrics";
  import { errorMessage, filterValue, pb } from "../lib/pb";
  import { groupByBucket, groupByCaller, perHour, sessionFromRecord, summarize, type Session } from "../lib/stats";
  import { team } from "../lib/team.svelte";
  import {
    RANGE_PRESETS,
    addDays,
    dateKey,
    defaultGrouping,
    formatDuration,
    presetRange,
    toPbDate,
    type Grouping,
    type RangePreset,
  } from "../lib/time";

  const GROUPINGS: Grouping[] = ["day", "week", "month"];

  let preset = $state<RangePreset>("7d");
  let caller = $state("");
  let groupingChoice = $state<Grouping | null>(null);
  let sessions = $state<Session[]>([]);
  let loading = $state(true);
  let loaded = $state(false);
  let error = $state("");
  let now = $state(new Date());

  // Sessions are sorted newest first, so the last one is the earliest.
  const range = $derived(presetRange(preset, now, sessions.at(-1)?.startedAt));
  const grouping = $derived(groupingChoice ?? defaultGrouping(range));
  // Loaded sessions can fall outside the range once the clock passes midnight.
  const inRange = $derived(sessions.filter((s) => s.startedAt >= range.from && s.startedAt < range.to));
  const selected = $derived(caller ? inRange.filter((session) => session.user === caller) : inRange);
  const summary = $derived(summarize(selected, now));
  const buckets = $derived(groupByBucket(selected, range, grouping, now));
  const leaderboard = $derived(groupByCaller(inRange, team.members.map((member) => member.id), now));
  const selectedCaller = $derived(caller ? team.find(caller) : undefined);
  // A daily goal only means something on a per-day chart for one caller.
  const goals = $derived(selectedCaller && grouping === "day" ? goalsOf(selectedCaller) : null);
  const pace = $derived(perHour(summary.dials, summary.durationMs));
  const fileSuffix = $derived(
    `${dateKey(range.from)}-to-${dateKey(addDays(range.to, -1))}${selectedCaller ? `-${slug(displayName(selectedCaller))}` : ""}`,
  );

  function goalsOf(member: Caller): Counts {
    return Object.fromEntries(METRICS.map((metric) => [metric, member[`goal_${metric}`] ?? 0])) as Counts;
  }

  function slug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  let latestRequest = 0;

  /** Background refreshes (live updates, midnight) don't dim the page. */
  async function load(background = false) {
    const request = ++latestRequest;
    if (!background) loading = true;
    try {
      const { from, to } = presetRange(preset, new Date());
      const filters = [`started_at < ${filterValue(toPbDate(to))}`];
      if (preset !== "all") filters.push(`started_at >= ${filterValue(toPbDate(from))}`);
      const records = await pb.collection("sessions").getFullList({
        filter: filters.join(" && "),
        sort: "-started_at",
        batch: 1000,
      });
      if (request !== latestRequest) return;
      sessions = records.map(sessionFromRecord);
      now = new Date();
      error = "";
      loaded = true;
    } catch (err) {
      if (request === latestRequest) error = errorMessage(err, "Couldn't load the stats.");
    } finally {
      if (request === latestRequest) loading = false;
    }
  }

  $effect(() => {
    void preset;
    untrack(() => void load());
  });

  // Live: refresh when anyone on the team logs a call.
  $effect(() => {
    let unsubscribe: UnsubscribeFunc | undefined;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    pb.collection("sessions")
      .subscribe("*", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void load(true), 1000);
      })
      .then((fn) => (cancelled ? void fn() : (unsubscribe = fn)))
      .catch(() => {});
    void team.load().catch(() => {});
    const tick = setInterval(() => {
      const previous = now;
      now = new Date();
      // A new day shifts ranges like "Today": fetch the sessions for it.
      if (dateKey(now) !== dateKey(previous)) void load(true);
    }, 30_000);
    return () => {
      cancelled = true;
      void unsubscribe?.();
      clearTimeout(debounce);
      clearInterval(tick);
    };
  });
</script>

<div class="title-row">
  <h1>Stats</h1>
  {#if loading && loaded}<span class="refreshing">Updating…</span>{/if}
</div>

<div class="filters" role="group" aria-label="Filters">
  <label class="filter">
    <span class="label">Range</span>
    <select class="input" bind:value={preset} onchange={() => (groupingChoice = null)}>
      {#each RANGE_PRESETS as option (option.key)}
        <option value={option.key}>{option.label}</option>
      {/each}
    </select>
  </label>
  <label class="filter">
    <span class="label">Caller</span>
    <select class="input" bind:value={caller}>
      <option value="">Whole team</option>
      {#each team.members as member (member.id)}
        <option value={member.id}>{displayName(member)}{member.id === auth.user?.id ? " (you)" : ""}</option>
      {/each}
    </select>
  </label>
  <div class="filter">
    <span class="label" id="grouping-label">Group by</span>
    <div class="segmented" role="radiogroup" aria-labelledby="grouping-label">
      {#each GROUPINGS as option (option)}
        <button
          type="button"
          role="radio"
          aria-checked={grouping === option}
          class:selected={grouping === option}
          onclick={() => (groupingChoice = option)}>{option[0].toUpperCase()}{option.slice(1)}</button
        >
      {/each}
    </div>
  </div>
</div>

{#if error}
  <p class="load-error" role="alert">{error}</p>
{/if}

<div class="content" class:stale={loading && loaded} class:first-load={!loaded}>
  <section class="kpis" aria-label="Totals">
    <StatTile label="Dials" value={formatNumber(summary.dials)} detail={pace === null ? "" : `${Math.round(pace)} per hour on the phone`} />
    <StatTile label="Owners reached" value={formatNumber(summary.owners)} detail="{formatPercent(rateOf(summary, 'contact'))} of dials" />
    <StatTile label="Booking attempts" value={formatNumber(summary.attempts)} detail="{formatPercent(rateOf(summary, 'attempt'))} of owners" />
    <StatTile label="Appointments booked" value={formatNumber(summary.booked)} detail="{formatPercent(rateOf(summary, 'booking'))} of attempts" />
    <StatTile
      label="Sessions"
      value={formatNumber(summary.sessions)}
      detail={summary.sessions ? `${Math.round(summary.dials / summary.sessions)} dials per session` : ""}
    />
    <StatTile label="Time on the phone" value={formatDuration(summary.durationMs)} />
    <StatTile label="Dial to booking" value={formatPercent(rateOf(summary, "overall"))} detail="Appointments per dial" />
    <StatTile
      label="Dials per booking"
      value={summary.booked ? formatNumber(Math.round(summary.dials / summary.booked)) : "—"}
      detail="How many dials one appointment takes"
    />
  </section>

  <div class="two-up">
    <section class="card panel">
      <h2>Funnel</h2>
      <FunnelChart counts={summary} />
    </section>
    <section class="card panel">
      <h2>Conversion rates</h2>
      {#if buckets.length > 1}
        <RateChart {buckets} {grouping} total={summary} />
      {:else}
        <p class="empty">Pick a longer range to see how your rates change over time.</p>
      {/if}
    </section>
  </div>

  {#if buckets.length > 1}
    <section class="card panel">
      <h2>Activity per {grouping}</h2>
      <ActivityChart {buckets} {grouping} {goals} />
    </section>
  {/if}

  {#if !caller}
    <section class="card panel">
      <Leaderboard rows={leaderboard} filename="leaderboard-{fileSuffix}.csv" onselect={(user) => (caller = user)} />
    </section>
  {/if}

  <section class="card panel">
    <BreakdownTable {buckets} {grouping} filename="calls-by-{grouping}-{fileSuffix}.csv" />
  </section>

  <section class="card panel">
    <SessionsTable sessions={selected} {now} filename="sessions-{fileSuffix}.csv" />
  </section>
</div>

<style>
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 16px;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 800;
  }

  .refreshing {
    font-size: 0.875rem;
    color: var(--ink-2);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 12px 16px;
    margin-bottom: 20px;
  }

  .filter {
    display: grid;
    gap: 6px;
  }

  .filter .label {
    color: var(--ink-2);
  }

  .filter select {
    min-width: 180px;
    background: var(--card);
    border-color: var(--axis);
  }

  .segmented {
    display: inline-flex;
    padding: 3px;
    background: var(--card);
    border: 1px solid var(--axis);
    border-radius: var(--radius);
  }

  .segmented button {
    min-height: 32px;
    padding: 4px 14px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--ink-2);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .segmented button.selected {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .load-error {
    margin-bottom: 16px;
    color: #ffb4a9;
  }

  .content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    transition: opacity 0.2s;
  }

  /* Refetch keeps the frame: the previous numbers stay, dimmed. */
  .content.stale,
  .content.first-load {
    opacity: 0.55;
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .two-up {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }

  .empty {
    color: var(--ink-3);
    font-size: 0.875rem;
  }

  @media (max-width: 1023px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .two-up {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 560px) {
    .kpis {
      gap: 12px;
    }

    .filter,
    .filter select {
      width: 100%;
    }
  }
</style>
