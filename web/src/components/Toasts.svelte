<script lang="ts">
  import { toasts } from "../lib/toasts.svelte";
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <div class="toast">{toast.text}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    bottom: max(16px, env(safe-area-inset-bottom));
    left: 50%;
    z-index: 50;
    display: grid;
    gap: 8px;
    width: min(420px, calc(100vw - 32px));
    transform: translateX(-50%);
    pointer-events: none;
  }

  .toast {
    padding: 12px 16px;
    background: var(--card-deep);
    border: 1px solid var(--axis);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 0.9375rem;
    color: var(--ink);
    animation: rise 0.2s ease-out;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
