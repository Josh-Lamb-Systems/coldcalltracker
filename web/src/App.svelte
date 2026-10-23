<script lang="ts">
  import { untrack } from "svelte";
  import Header from "./components/Header.svelte";
  import Toasts from "./components/Toasts.svelte";
  import { auth } from "./lib/auth.svelte";
  import { router } from "./lib/router.svelte";
  import { tally } from "./lib/tally.svelte";
  import { team } from "./lib/team.svelte";
  import Counter from "./pages/Counter.svelte";
  import Goals from "./pages/Goals.svelte";
  import Login from "./pages/Login.svelte";
  import Stats from "./pages/Stats.svelte";

  const AUTH_REFRESH_MS = 6 * 60 * 60 * 1000;

  const userId = $derived(auth.user?.id);

  $effect(() => {
    if (!userId) return;
    untrack(() => {
      void auth.refresh();
      void tally.connect();
      void team.load().catch(() => {});
    });
    // Keep long-open tabs signed in.
    const refresh = setInterval(() => void auth.refresh(), AUTH_REFRESH_MS);
    return () => {
      clearInterval(refresh);
      tally.disconnect();
    };
  });

  function warnUnsaved(event: BeforeUnloadEvent) {
    if (tally.hasUnsavedTaps) event.preventDefault();
  }
</script>

<svelte:window onbeforeunload={warnUnsaved} />

{#if auth.user}
  <Header />
  <main class="container">
    {#if router.route === "stats"}
      <Stats />
    {:else if router.route === "goals"}
      <Goals />
    {:else}
      <Counter />
    {/if}
  </main>
{:else}
  <Login />
{/if}
<Toasts />

<style>
  main {
    padding-bottom: 48px;
  }
</style>
