<script lang="ts">
  import { formatNumber } from "../lib/metrics";
  import Meter from "./Meter.svelte";

  let {
    label,
    count,
    detail,
    today,
    goal,
    shortcut,
    onadd,
    onsubtract,
    onset,
    onreset,
  }: {
    label: string;
    count: number;
    detail: string;
    today: number;
    goal: number;
    shortcut: string;
    onadd: () => void;
    onsubtract: () => void;
    onset: () => void;
    onreset: () => void;
  } = $props();

  let menuOpen = $state(false);
  let menu: HTMLDivElement;

  function closeMenuOutside(event: PointerEvent) {
    if (menuOpen && !menu.contains(event.target as Node)) menuOpen = false;
  }

  function choose(action: () => void) {
    menuOpen = false;
    action();
  }
</script>

<svelte:window
  onpointerdown={closeMenuOutside}
  onkeydown={(event) => {
    if (event.key === "Escape") menuOpen = false;
  }}
/>

<section class="counter card" aria-label={label}>
  <div class="body">
    <div class="menu" bind:this={menu}>
      <button
        type="button"
        class="menu-button"
        aria-label="More options for {label}"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="currentColor">
          <circle cx="10" cy="4" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="10" cy="16" r="1.6" />
        </svg>
      </button>
      {#if menuOpen}
        <div class="menu-list" role="menu">
          <button type="button" role="menuitem" onclick={() => choose(onset)}>Set value…</button>
          <button type="button" role="menuitem" onclick={() => choose(onreset)}>Reset to 0</button>
        </div>
      {/if}
    </div>
    <h2>{label}</h2>
    <p class="count" aria-live="polite" aria-atomic="true">
      {#key count}<span class="bump">{formatNumber(count)}</span>{/key}
    </p>
    <p class="detail">{detail}</p>
    <Meter value={today} {goal} {label} />
  </div>
  <div class="buttons">
    <button type="button" class="tap" aria-label="Subtract one from {label}" disabled={count === 0} onclick={onsubtract}>
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
        <circle cx="12" cy="12" r="9" /><path d="M8 12h8" stroke-linecap="round" />
      </svg>
    </button>
    <button type="button" class="tap" aria-label="Add one to {label}" aria-keyshortcuts={shortcut} onclick={onadd}>
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
        <circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" stroke-linecap="round" />
      </svg>
      <kbd>{shortcut}</kbd>
    </button>
  </div>
</section>

<style>
  .counter {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .body {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 28px 20px 20px;
    text-align: center;
  }

  h2 {
    min-height: 2.6em;
    display: flex;
    align-items: center;
    padding: 0 24px;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.3;
  }

  .count {
    font-size: clamp(3.5rem, 6.5vw, 6rem);
    font-weight: 800;
    line-height: 1;
    color: var(--accent);
  }

  .bump {
    display: inline-block;
    animation: bump 0.18s ease-out;
  }

  @keyframes bump {
    from {
      transform: scale(1.08);
    }
  }

  .detail {
    min-height: 1.4em;
    font-size: 0.875rem;
    color: var(--ink-3);
  }

  .menu {
    position: absolute;
    top: 12px;
    right: 8px;
    z-index: 5;
  }

  .menu-button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius);
    color: var(--icon);
  }

  .menu-button:hover {
    background: var(--card-deep);
    color: var(--ink-2);
  }

  .menu-list {
    position: absolute;
    top: 36px;
    right: 0;
    display: grid;
    min-width: 160px;
    padding: 4px;
    background: var(--card-deep);
    border: 1px solid var(--axis);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .menu-list button {
    padding: 8px 12px;
    background: none;
    border: none;
    border-radius: 4px;
    text-align: left;
    font-size: 0.875rem;
  }

  .menu-list button:hover {
    background: var(--card);
  }

  .buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--hairline);
  }

  .tap {
    position: relative;
    display: grid;
    place-items: center;
    height: 72px;
    background: none;
    border: none;
    color: var(--icon);
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }

  .tap + .tap {
    border-left: 1px solid var(--hairline);
  }

  @media (hover: hover) {
    .tap:hover:not(:disabled) {
      background: var(--card-deep);
      color: var(--ink-2);
    }
  }

  .tap:active:not(:disabled) {
    background: var(--card-deeper);
    color: var(--accent);
  }

  .tap:focus-visible {
    outline-offset: -3px;
  }

  .tap:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .tap:first-child {
    border-bottom-left-radius: var(--radius);
  }

  .tap:last-child {
    border-bottom-right-radius: var(--radius);
  }

  kbd {
    position: absolute;
    right: 10px;
    bottom: 8px;
    min-width: 18px;
    padding: 0 4px;
    border: 1px solid var(--axis);
    border-radius: 4px;
    font-family: var(--font);
    font-size: 0.6875rem;
    line-height: 16px;
    color: var(--ink-3);
  }

  @media (max-width: 720px) {
    .body {
      padding: 20px 12px 14px;
      gap: 6px;
    }

    h2 {
      padding: 0 20px;
      font-size: 0.9375rem;
    }

    .count {
      font-size: 3.25rem;
    }

    .detail {
      font-size: 0.8125rem;
    }

    .tap {
      height: 64px;
    }

    kbd {
      display: none;
    }
  }
</style>
