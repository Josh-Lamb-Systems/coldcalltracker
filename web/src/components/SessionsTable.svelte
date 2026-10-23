<script lang="ts">
  import { auth } from "../lib/auth.svelte";
  import { downloadCsv } from "../lib/csv";
  import { METRICS, METRIC_INFO, RATES, emptyCounts, formatNumber, rateOf, type Counts } from "../lib/metrics";
  import { errorMessage, pb } from "../lib/pb";
  import { sessionDurationMs, type Session } from "../lib/stats";
  import { team } from "../lib/team.svelte";
  import { dateKey, formatDate, formatDuration, formatTime } from "../lib/time";
  import { toasts } from "../lib/toasts.svelte";
  import Dialog from "./Dialog.svelte";

  const PAGE = 25;

  let { sessions, now, filename }: { sessions: Session[]; now: Date; filename: string } = $props();

  let showAll = $state(false);
  let editing = $state<Session | null>(null);
  let draft = $state<Counts & { notes: string }>({ ...emptyCounts(), notes: "" });
  let dialogOpen = $state(false);
  let saving = $state(false);
  let dialogError = $state("");

  const visible = $derived(showAll ? sessions : sessions.slice(0, PAGE));

  function localDateTime(date: Date | null): string {
    return date ? `${dateKey(date)} ${date.toTimeString().slice(0, 5)}` : "";
  }

  function exportCsv() {
    downloadCsv(filename, [
      ["Caller", "Started", "Ended", "Minutes", ...METRICS.map((m) => METRIC_INFO[m].label), ...RATES.map((r) => r.label), "Notes"],
      ...sessions.map((session) => [
        team.name(session.user),
        localDateTime(session.startedAt),
        localDateTime(session.endedAt),
        Math.round(sessionDurationMs(session, now) / 60_000),
        ...METRICS.map((m) => session[m]),
        ...RATES.map((r) => rateOf(session, r.key)?.toFixed(4)),
        session.notes,
      ]),
    ]);
  }

  function edit(session: Session) {
    editing = session;
    draft = { dials: session.dials, owners: session.owners, attempts: session.attempts, booked: session.booked, notes: session.notes };
    dialogError = "";
    dialogOpen = true;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!editing) return;
    saving = true;
    dialogError = "";
    try {
      // Send only what changed: the session may be live on another device,
      // and untouched counters must keep any taps made since this opened.
      const changes: Record<string, string | number> = {};
      for (const metric of METRICS) {
        const value = Math.max(0, Math.floor(Number(draft[metric]) || 0));
        if (value !== editing[metric]) changes[metric] = value;
      }
      if (draft.notes.trim() !== editing.notes) changes.notes = draft.notes.trim();
      if (Object.keys(changes).length > 0) {
        await pb.send(`/api/tally/sessions/${editing.id}/update`, { method: "POST", body: changes });
        toasts.show("Session updated.");
      }
      dialogOpen = false;
    } catch (err) {
      dialogError = errorMessage(err, "Couldn't update the session.");
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!editing || !confirm("Delete this session? Its counts will be removed from all stats.")) return;
    saving = true;
    try {
      await pb.collection("sessions").delete(editing.id);
      dialogOpen = false;
      toasts.show("Session deleted.");
    } catch (err) {
      dialogError = errorMessage(err, "Couldn't delete the session.");
    } finally {
      saving = false;
    }
  }
</script>

<div class="panel-head">
  <h2>Sessions</h2>
  <button type="button" class="btn btn-secondary" onclick={exportCsv}>Download CSV</button>
</div>
<div class="table-wrap">
  <table class="data">
    <thead>
      <tr>
        <th scope="col">Date</th>
        <th scope="col" class="left">Caller</th>
        <th scope="col">Time</th>
        <th scope="col">Length</th>
        {#each METRICS as metric (metric)}
          <th scope="col">{METRIC_INFO[metric].short}</th>
        {/each}
        <th scope="col" class="notes">Note</th>
        <th scope="col"><span class="visually-hidden">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      {#each visible as session (session.id)}
        <tr>
          <td>{formatDate(session.startedAt)}</td>
          <td class="caller left">{team.name(session.user)}</td>
          <td>
            {formatTime(session.startedAt)}–{#if session.endedAt}{formatTime(session.endedAt)}{:else}<span class="live">now</span>{/if}
          </td>
          <td>{formatDuration(sessionDurationMs(session, now))}</td>
          {#each METRICS as metric (metric)}
            <td>{formatNumber(session[metric])}</td>
          {/each}
          <td class="notes" title={session.notes}>{session.notes}</td>
          <td>
            {#if session.user === auth.user?.id}
              <button type="button" class="edit" onclick={() => edit(session)} aria-label="Edit session from {formatDate(session.startedAt)} {formatTime(session.startedAt)}">Edit</button>
            {/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="10" class="muted">No sessions in this range.</td></tr>
      {/each}
    </tbody>
  </table>
</div>
{#if sessions.length > PAGE}
  <button type="button" class="btn btn-secondary more" onclick={() => (showAll = !showAll)}>
    {showAll ? "Show fewer" : `Show all ${formatNumber(sessions.length)} sessions`}
  </button>
{/if}

<Dialog bind:open={dialogOpen} title="Edit session">
  <form class="edit-form" onsubmit={save}>
    <div class="counts">
      {#each METRICS as metric (metric)}
        <div class="field">
          <label for="edit-{metric}">{METRIC_INFO[metric].label}</label>
          <input id="edit-{metric}" class="input" type="number" min="0" step="1" required bind:value={draft[metric]} />
        </div>
      {/each}
    </div>
    <div class="field">
      <label for="edit-notes">Note</label>
      <input id="edit-notes" class="input" type="text" maxlength="500" bind:value={draft.notes} />
    </div>
    {#if dialogError}
      <p class="error-text" role="alert">{dialogError}</p>
    {/if}
    <div class="dialog-actions">
      <button type="button" class="btn btn-danger" disabled={saving} onclick={remove}>Delete</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn-secondary" onclick={() => (dialogOpen = false)}>Cancel</button>
      <button type="submit" class="btn btn-primary" disabled={saving}>Save</button>
    </div>
  </form>
</Dialog>

<style>
  .caller {
    color: var(--ink-2);
  }

  .notes {
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
    color: var(--ink-3);
  }

  .live {
    color: var(--accent);
    font-weight: 600;
  }

  /* Compact, so rows with the button stay the same height as the rest. */
  .edit {
    margin: -4px 0;
    padding: 2px 10px;
    background: none;
    border: 1px solid var(--axis);
    border-radius: var(--radius);
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .edit:hover {
    background: var(--card-deep);
    color: var(--ink);
  }

  .more {
    margin-top: 12px;
  }

  .edit-form {
    display: grid;
    gap: 16px;
  }

  .counts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .dialog-actions {
    display: flex;
    gap: 12px;
  }

  .spacer {
    flex: 1;
  }
</style>
