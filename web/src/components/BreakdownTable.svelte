<script lang="ts">
  import { downloadCsv } from "../lib/csv";
  import { METRICS, METRIC_INFO, RATES, formatNumber, formatPercent, rateOf } from "../lib/metrics";
  import type { BucketSummary } from "../lib/stats";
  import { bucketLabel, dateKey, formatDuration, type Grouping } from "../lib/time";

  // The table view of the charts: every period and value, newest first.
  let { buckets, grouping, filename }: { buckets: BucketSummary[]; grouping: Grouping; filename: string } = $props();

  const rows = $derived([...buckets].reverse());

  function exportCsv() {
    downloadCsv(filename, [
      [`${grouping[0].toUpperCase()}${grouping.slice(1)} starting`, "Sessions", "Hours", ...METRICS.map((m) => METRIC_INFO[m].label), ...RATES.map((r) => r.label)],
      ...buckets.map((bucket) => [
        dateKey(bucket.start),
        bucket.sessions,
        +(bucket.durationMs / 3_600_000).toFixed(2),
        ...METRICS.map((m) => bucket[m]),
        ...RATES.map((r) => rateOf(bucket, r.key)?.toFixed(4)),
      ]),
    ]);
  }
</script>

<div class="panel-head">
  <h2>By {grouping}</h2>
  <button type="button" class="btn btn-secondary" onclick={exportCsv}>Download CSV</button>
</div>
<div class="table-wrap">
  <table class="data">
    <thead>
      <tr>
        <th scope="col">{grouping === "day" ? "Day" : grouping === "week" ? "Week of" : "Month"}</th>
        <th scope="col">Sessions</th>
        <th scope="col">Time</th>
        {#each METRICS as metric (metric)}
          <th scope="col">{METRIC_INFO[metric].short}</th>
        {/each}
        {#each RATES as rate (rate.key)}
          <th scope="col">{rate.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as bucket (bucket.key)}
        <tr class:empty={bucket.sessions === 0}>
          <td>{bucketLabel(bucket.start, grouping, grouping !== "week")}</td>
          <td>{formatNumber(bucket.sessions)}</td>
          <td>{formatDuration(bucket.durationMs)}</td>
          {#each METRICS as metric (metric)}
            <td>{formatNumber(bucket[metric])}</td>
          {/each}
          {#each RATES as rate (rate.key)}
            <td>{formatPercent(rateOf(bucket, rate.key))}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  tr.empty td {
    color: var(--ink-3);
  }
</style>
