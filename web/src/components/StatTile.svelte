<script lang="ts">
  let { label, value, detail = "" }: { label: string; value: string; detail?: string } = $props();
</script>

<div class="tile card">
  <p class="label">{label}</p>
  <p class="value">{value}</p>
  {#if detail}
    <p class="detail">{detail}</p>
  {/if}
</div>

<style>
  .tile {
    display: grid;
    align-content: start;
    gap: 4px;
    min-width: 0;
    padding: 16px 20px;
  }

  .label {
    font-size: 0.8125rem;
    color: var(--ink-3);
  }

  .value {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--ink);
  }

  .detail {
    font-size: 0.8125rem;
    color: var(--ink-3);
  }
</style>
