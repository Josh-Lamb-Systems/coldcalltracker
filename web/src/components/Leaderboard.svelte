<script lang="ts">
  import { auth } from "../lib/auth.svelte";
  import { downloadCsv } from "../lib/csv";
  import { METRICS, METRIC_INFO, RATES, formatNumber, formatPercent, rateOf } from "../lib/metrics";
  import { perHour, type CallerSummary } from "../lib/stats";
  import { team } from "../lib/team.svelte";
  import { formatDuration } from "../lib/time";

  let {
    rows,
    filename,
    onselect,
  }: { rows: CallerSummary[]; filename: string; onselect: (user: string) => void } = $props();

  const rates = RATES.slice(0, 3);

  function exportCsv() {
    downloadCsv(filename, [
      ["Caller", "Sessions", "Hours", ...METRICS.map((m) => METRIC_INFO[m].label), "Dials per hour", ...rates.map((r) => r.label)],
      ...rows.map((row) => [
        team.name(row.user),
        row.sessions,
        +(row.durationMs / 3_600_000).toFixed(2),
        ...METRICS.map((m) => row[m]),
        perHour(row.dials, row.durationMs)?.toFixed(1),
        ...rates.map((r) => rateOf(row, r.key)?.toFixed(4)),
      ]),
    ]);
  }
</script>

<div class="panel-head">
  <h2>Leaderboard</h2>
  <button type="button" class="btn btn-secondary" onclick={exportCsv}>Download CSV</button>
</div>
<div class="table-wrap">
  <table class="data">
    <thead>
      <tr>
        <th scope="col">Caller</th>
        <th scope="col">Sessions</th>
        <th scope="col">Time</th>
        {#each METRICS as metric (metric)}
          <th scope="col">{METRIC_INFO[metric].short}</th>
        {/each}
        <th scope="col">Dials/hr</th>
        {#each rates as rate (rate.key)}
          <th scope="col">{rate.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.user)}
        {@const pace = perHour(row.dials, row.durationMs)}
        <tr class:me={row.user === auth.user?.id}>
          <td>
            <button type="button" class="caller" title="Show only this caller" onclick={() => onselect(row.user)}>
              {team.name(row.user)}
            </button>
            {#if row.user === auth.user?.id}<span class="you">You</span>{/if}
          </td>
          <td>{formatNumber(row.sessions)}</td>
          <td>{formatDuration(row.durationMs)}</td>
          {#each METRICS as metric (metric)}
            <td class:strong={metric === "booked"}>{formatNumber(row[metric])}</td>
          {/each}
          <td>{pace === null ? "—" : Math.round(pace)}</td>
          {#each rates as rate (rate.key)}
            <td>{formatPercent(rateOf(row, rate.key))}</td>
          {/each}
        </tr>
      {:else}
        <tr><td colspan="11" class="muted">No callers yet.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .caller {
    padding: 0;
    background: none;
    border: none;
    color: var(--ink);
    font-weight: 600;
    text-align: left;
  }

  .caller:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .you {
    margin-left: 8px;
    padding: 1px 6px;
    border: 1px solid var(--accent);
    border-radius: 999px;
    font-size: 0.6875rem;
    color: var(--ink-2);
  }

  tr.me td {
    background: rgb(49 196 141 / 0.06);
  }

  .strong {
    font-weight: 700;
  }
</style>
