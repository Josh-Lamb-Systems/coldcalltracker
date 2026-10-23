<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    title,
    children,
  }: { open: boolean; title: string; children: Snippet } = $props();

  let dialog: HTMLDialogElement;
  const titleId = `dialog-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} onclose={() => (open = false)}>
  {#if open}
    <h2 id={titleId}>{title}</h2>
    {@render children()}
  {/if}
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - 32px));
    padding: 24px;
    background: var(--card);
    border: 1px solid var(--axis);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    color: var(--ink);
  }

  dialog::backdrop {
    background: rgb(20 20 26 / 0.6);
  }

  h2 {
    margin-bottom: 16px;
    font-size: 1.125rem;
    font-weight: 700;
  }
</style>
