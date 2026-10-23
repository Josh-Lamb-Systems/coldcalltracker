<script lang="ts">
  import Logo from "../components/Logo.svelte";
  import { auth } from "../lib/auth.svelte";
  import { errorMessage } from "../lib/pb";

  let email = $state("");
  let password = $state("");
  let error = $state("");
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    try {
      await auth.login(email.trim(), password);
    } catch (err) {
      error = errorMessage(err, "Couldn't sign you in.");
    } finally {
      busy = false;
    }
  }
</script>

<main class="login">
  <Logo />
  <form class="card" onsubmit={submit}>
    <h1>Sign in to log your calls</h1>
    <div class="field">
      <label for="email">Email</label>
      <input id="email" class="input" type="email" autocomplete="username" required bind:value={email} />
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input
        id="password"
        class="input"
        type="password"
        autocomplete="current-password"
        required
        bind:value={password}
      />
    </div>
    {#if error}
      <p class="error-text" role="alert">{error}</p>
    {/if}
    <button class="btn btn-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    <p class="hint">No account yet? Ask your team admin to add you.</p>
  </form>
</main>

<style>
  .login {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 32px;
    min-height: 100vh;
    padding: 24px 16px;
  }

  form {
    display: grid;
    gap: 16px;
    width: min(400px, 100%);
    padding: 32px;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .hint {
    font-size: 0.8125rem;
    color: var(--ink-3);
    text-align: center;
  }
</style>
