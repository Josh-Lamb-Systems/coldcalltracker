<script lang="ts">
  import { auth, displayName } from "../lib/auth.svelte";
  import { ROUTES, router } from "../lib/router.svelte";
  import { tally } from "../lib/tally.svelte";
  import Logo from "./Logo.svelte";

  function signOut() {
    if (tally.hasUnsavedTaps && !confirm("Some taps haven't been saved yet. Sign out anyway?")) return;
    auth.logout();
  }
</script>

<header class="container">
  <a class="brand" href="#/counter"><Logo /></a>
  <nav aria-label="Main">
    {#each ROUTES as route (route.path)}
      <a
        href="#/{route.path}"
        class:active={router.route === route.path}
        aria-current={router.route === route.path ? "page" : undefined}>{route.label}</a
      >
    {/each}
  </nav>
  <div class="account">
    <span class="who">{displayName(auth.user)}</span>
    <button type="button" class="sign-out" onclick={signOut}>Sign out</button>
  </div>
</header>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
    padding-top: 24px;
    padding-bottom: 32px;
  }

  .brand {
    text-decoration: none;
    margin-right: auto;
  }

  nav {
    display: flex;
    gap: 4px;
  }

  nav a {
    padding: 8px 16px;
    border-radius: 999px;
    color: var(--ink);
    font-size: 0.9375rem;
    font-weight: 700;
    text-decoration: none;
  }

  @media (hover: hover) {
    nav a:hover {
      background: var(--card-deep);
    }
  }

  nav a.active {
    background: var(--card);
    color: var(--accent);
  }

  .account {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.875rem;
    color: var(--ink-2);
  }

  .who {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sign-out {
    padding: 6px 10px;
    background: none;
    border: 1px solid var(--axis);
    border-radius: var(--radius);
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .sign-out:hover {
    background: var(--card-deep);
    color: var(--ink);
  }

  @media (max-width: 720px) {
    header {
      padding-top: 16px;
      padding-bottom: 20px;
    }

    nav {
      order: 3;
      width: 100%;
    }

    nav a {
      flex: 1;
      text-align: center;
    }

    .who {
      display: none;
    }
  }
</style>
