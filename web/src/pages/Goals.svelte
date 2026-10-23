<script lang="ts">
  import { auth } from "../lib/auth.svelte";
  import { METRICS, METRIC_INFO, emptyCounts, type Counts } from "../lib/metrics";
  import { errorMessage, pb } from "../lib/pb";
  import { team } from "../lib/team.svelte";
  import { toasts } from "../lib/toasts.svelte";

  let name = $state(auth.user?.name ?? "");
  let goals = $state<Counts>(
    Object.fromEntries(METRICS.map((metric) => [metric, auth.user?.[`goal_${metric}`] ?? 0])) as Counts,
  );
  let savingProfile = $state(false);
  let profileError = $state("");

  let oldPassword = $state("");
  let password = $state("");
  let passwordConfirm = $state("");
  let savingPassword = $state(false);
  let passwordError = $state("");

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    const user = auth.user;
    if (!user) return;
    savingProfile = true;
    profileError = "";
    try {
      const data: Record<string, string | number> = { name: name.trim() };
      for (const metric of METRICS) data[`goal_${metric}`] = Math.max(0, Math.floor(Number(goals[metric]) || 0));
      await pb.collection("users").update(user.id, data);
      toasts.show("Goals saved.");
      void team.load().catch(() => {});
    } catch (err) {
      profileError = errorMessage(err, "Couldn't save your goals.");
    } finally {
      savingProfile = false;
    }
  }

  async function changePassword(event: SubmitEvent) {
    event.preventDefault();
    const user = auth.user;
    if (!user?.email) return;
    savingPassword = true;
    passwordError = "";
    try {
      await pb.collection("users").update(user.id, { oldPassword, password, passwordConfirm });
      // Changing the password signs out every device, including this one.
      await auth.login(user.email, password);
      oldPassword = password = passwordConfirm = "";
      toasts.show("Password changed.");
    } catch (err) {
      passwordError = errorMessage(err, "Couldn't change your password.");
    } finally {
      savingPassword = false;
    }
  }

  const placeholders: Counts = { ...emptyCounts(), dials: 100, owners: 10, attempts: 5, booked: 2 };
</script>

<h1>Goals</h1>

<form class="card panel" onsubmit={saveProfile}>
  <div class="intro">
    <h2>Daily goals</h2>
    <p class="muted">Your targets per day. Progress shows under each counter; leave a goal at 0 to hide it.</p>
  </div>
  <div class="goals">
    {#each METRICS as metric (metric)}
      <div class="field">
        <label for="goal-{metric}">{METRIC_INFO[metric].label}</label>
        <input
          id="goal-{metric}"
          class="input"
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          placeholder={String(placeholders[metric])}
          bind:value={goals[metric]}
        />
      </div>
    {/each}
  </div>
  <div class="field name">
    <label for="name">Your name</label>
    <input id="name" class="input" type="text" maxlength="255" autocomplete="name" bind:value={name} />
    <p class="muted small">Shown to your team on the stats leaderboard.</p>
  </div>
  {#if profileError}
    <p class="error-text" role="alert">{profileError}</p>
  {/if}
  <div>
    <button type="submit" class="btn btn-primary" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save"}</button>
  </div>
</form>

<form class="card panel" onsubmit={changePassword}>
  <div class="intro">
    <h2>Change password</h2>
    <p class="muted">You'll stay signed in here; other devices will need the new password.</p>
  </div>
  <div class="passwords">
    <div class="field">
      <label for="old-password">Current password</label>
      <input id="old-password" class="input" type="password" autocomplete="current-password" required bind:value={oldPassword} />
    </div>
    <div class="field">
      <label for="new-password">New password</label>
      <input id="new-password" class="input" type="password" autocomplete="new-password" minlength="8" required bind:value={password} />
    </div>
    <div class="field">
      <label for="confirm-password">Confirm new password</label>
      <input id="confirm-password" class="input" type="password" autocomplete="new-password" minlength="8" required bind:value={passwordConfirm} />
    </div>
  </div>
  {#if passwordError}
    <p class="error-text" role="alert">{passwordError}</p>
  {/if}
  <div>
    <button type="submit" class="btn btn-secondary" disabled={savingPassword}>
      {savingPassword ? "Changing…" : "Change password"}
    </button>
  </div>
</form>

<style>
  h1 {
    margin-bottom: 16px;
    font-size: 1.5rem;
    font-weight: 800;
  }

  .panel {
    display: grid;
    gap: 20px;
    margin-bottom: 16px;
    padding: 24px;
  }

  .intro {
    display: grid;
    gap: 4px;
  }

  h2 {
    font-size: 1.125rem;
    font-weight: 700;
  }

  .goals {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: end;
    gap: 16px;
  }

  .passwords {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .name {
    max-width: 360px;
  }

  .small {
    font-size: 0.8125rem;
  }

  @media (max-width: 860px) {
    .goals {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .passwords {
      grid-template-columns: 1fr;
    }
  }
</style>
