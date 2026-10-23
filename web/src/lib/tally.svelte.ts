import { ClientResponseError, type RecordModel, type RecordSubscription } from "pocketbase";
import { auth } from "./auth.svelte";
import { METRICS, emptyCounts, type Counts, type Metric } from "./metrics";
import { errorMessage, filterValue, isRetryable, pb } from "./pb";
import { sessionFromRecord, type Session } from "./stats";
import { addDays, startOfDay, toPbDate } from "./time";

const MAX_DELTA = 1000;
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000];
const REQUEST_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

/** Random id; unlike crypto.randomUUID this also works over plain http. */
function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasStatus(err: unknown, ...statuses: number[]): boolean {
  return err instanceof ClientResponseError && statuses.includes(err.status);
}

/** Thrown when work started before a sign-out finishes after it. */
class Superseded extends Error {}

interface TapBatch {
  metric: Metric;
  delta: number;
  /** Lets the server recognise a resent batch and count it only once. */
  op: string;
}

/**
 * The signed-in caller's live session and today's totals.
 *
 * Taps show up immediately and are sent in the background. Writes run one at
 * a time (taps coalesced per metric), so every server response is the newest
 * state of the session and can simply replace the local copy.
 */
class Tally {
  active = $state<Session | null>(null);
  /** Ended sessions that started today, for the daily goals. */
  finished = $state<Session[]>([]);
  /** Taps on screen that the server hasn't confirmed yet. */
  pending = $state<Counts>(emptyCounts());
  todayStart = $state(startOfDay(new Date()));
  loaded = $state(false);
  /** The last action that failed (tap, set, end…). */
  error = $state<string | null>(null);
  /** Set while the session can't be loaded; cleared once it is. */
  loadError = $state<string | null>(null);
  /** True while taps can't reach the server; they're retried until they do. */
  offline = $state(false);
  /** A note typed before any session exists, used when one starts. */
  notesDraft = "";

  counts: Counts = $derived.by(() => {
    const counts = emptyCounts();
    for (const metric of METRICS) {
      counts[metric] = Math.max(0, (this.active?.[metric] ?? 0) + this.pending[metric]);
    }
    return counts;
  });

  today: Counts = $derived.by(() => {
    const today = emptyCounts();
    // Pending taps go to the active session, or to one that's about to start.
    const activeIsToday = !this.active || this.active.startedAt >= this.todayStart;
    const sessions = this.active && activeIsToday ? [...this.finished, this.active] : this.finished;
    for (const session of sessions) {
      for (const metric of METRICS) today[metric] += session[metric];
    }
    if (activeIsToday) {
      for (const metric of METRICS) today[metric] = Math.max(0, today[metric] + this.pending[metric]);
    }
    return today;
  });

  hasUnsavedTaps = $derived(METRICS.some((metric) => this.pending[metric] !== 0));

  private queued = emptyCounts();
  /** The batch being sent. It's resent unchanged until it settles. */
  private inflight: TapBatch | null = null;
  private flushScheduled = false;
  private chain: Promise<unknown> = Promise.resolve();
  private running = 0;
  private missedEvents = false;
  private reloadQueued = false;
  /** Bumped on sign-out so work belonging to the previous caller stops. */
  private epoch = 0;
  private connected = false;
  private live = false;
  private subscribing = false;
  private midnightTimer: ReturnType<typeof setTimeout> | undefined;

  connect() {
    if (!auth.user || this.connected) return;
    this.connected = true;
    this.scheduleMidnight();
    addEventListener("online", this.wake);
    document.addEventListener("visibilitychange", this.wake);
    void this.loadUntilDone(this.epoch);
    void this.subscribe();
  }

  disconnect() {
    this.epoch += 1;
    this.connected = false;
    this.live = false;
    void this.unsubscribe();
    removeEventListener("online", this.wake);
    document.removeEventListener("visibilitychange", this.wake);
    clearTimeout(this.midnightTimer);
    // Jobs from the old chain notice the new epoch and stop; start afresh.
    this.chain = Promise.resolve();
    this.running = 0;
    this.flushScheduled = false;
    this.missedEvents = false;
    this.reloadQueued = false;
    this.inflight = null;
    this.queued = emptyCounts();
    this.active = null;
    this.finished = [];
    this.pending = emptyCounts();
    this.loaded = false;
    this.error = null;
    this.loadError = null;
    this.offline = false;
    this.notesDraft = "";
  }

  /** Optimistically counts a tap; it's saved in the background. */
  tap(metric: Metric, delta: 1 | -1) {
    if (this.counts[metric] + delta < 0) return;
    this.error = null;
    this.pending[metric] += delta;
    this.queued[metric] += delta;
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      void this.enqueue((epoch) => this.flush(epoch));
    }
  }

  start(notes = this.notesDraft) {
    return this.enqueue((epoch) => this.startNow(epoch, notes));
  }

  /** Ends the active session once its pending taps are saved. */
  end() {
    return this.enqueue(async (epoch) => {
      const session = this.active;
      if (!session) return;
      try {
        // 204 (an empty body) means the session had no counts and was deleted.
        const result: Partial<RecordModel> = await pb.send(`/api/tally/sessions/${session.id}/end`, {
          method: "POST",
          signal: timeout(),
        });
        this.guard(epoch);
        this.active = null;
        if (result.id) this.keepFinished(sessionFromRecord(result as RecordModel));
      } catch (err) {
        if (!hasStatus(err, 404)) throw err;
        this.guard(epoch);
        this.forget(session.id); // already deleted, e.g. from another device
      }
    });
  }

  setValue(metric: Metric, value: number) {
    return this.enqueue(async (epoch) => {
      this.show(await this.withSession(epoch, (id) => this.update(epoch, id, { [metric]: value })));
    });
  }

  saveNotes(notes: string) {
    return this.enqueue(async (epoch) => {
      const session = this.active;
      if (!session) {
        this.notesDraft = notes;
        return;
      }
      if (session.notes === notes) return;
      try {
        this.show(await this.update(epoch, session.id, { notes }));
      } catch (err) {
        if (!hasStatus(err, 404)) throw err;
        this.guard(epoch);
        this.forget(session.id);
      }
    });
  }

  /** Re-reads the active session and today's sessions. Resolves to success. */
  reload(): Promise<boolean> {
    if (this.reloadQueued || !auth.user) return Promise.resolve(false);
    this.reloadQueued = true;
    return this.enqueue(async (epoch) => {
      this.reloadQueued = false;
      const user = auth.user;
      if (!user) return false;
      const todayStart = startOfDay(new Date());
      let records: RecordModel[];
      try {
        records = await pb.collection("sessions").getFullList({
          filter: `user = ${filterValue(user.id)} && (ended_at = "" || started_at >= ${filterValue(toPbDate(todayStart))})`,
          sort: "started_at",
          signal: timeout(),
        });
      } catch (err) {
        this.guard(epoch);
        this.loadError = errorMessage(err, "Couldn't load your session.");
        return false;
      }
      this.guard(epoch);
      const sessions = records.map(sessionFromRecord);
      this.todayStart = todayStart;
      this.active = sessions.find((session) => !session.endedAt) ?? null;
      this.finished = sessions.filter((session) => session.endedAt && session.startedAt >= todayStart);
      this.loaded = true;
      this.loadError = null;
      return true;
    }).then((ok) => ok === true);
  }

  /** Runs server writes strictly one after another. */
  private enqueue<T>(job: (epoch: number) => Promise<T>): Promise<T | undefined> {
    const epoch = this.epoch;
    this.running += 1;
    const run = this.chain.then(() => {
      if (epoch !== this.epoch) throw new Superseded();
      return job(epoch);
    });
    this.chain = run.catch(() => {}).finally(() => {
      if (epoch !== this.epoch) return;
      this.running -= 1;
      // Realtime events that arrived mid-write may be older than the write's
      // response, so they were skipped; re-read once everything settles.
      if (this.running === 0 && this.missedEvents) {
        this.missedEvents = false;
        void this.reload();
      }
    });
    return run.catch((err) => {
      if (err instanceof Superseded) return undefined;
      throw err;
    });
  }

  private guard(epoch: number) {
    if (epoch !== this.epoch) throw new Superseded();
  }

  private async flush(epoch: number) {
    try {
      let attempt = 0;
      for (;;) {
        if (epoch !== this.epoch) return;
        if (!this.inflight) {
          const metric = METRICS.find((m) => this.queued[m] !== 0);
          if (!metric) return;
          const delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, this.queued[metric]));
          this.queued[metric] -= delta;
          this.inflight = { metric, delta, op: randomId() };
        }
        const batch = this.inflight;
        try {
          const session = await this.withSession(epoch, (id) => this.postTap(id, batch));
          this.guard(epoch);
          this.show(session);
          this.offline = false;
          attempt = 0;
        } catch (err) {
          if (err instanceof Superseded) return;
          if (isRetryable(err)) {
            // The batch may or may not have arrived; resending the same op is safe.
            this.offline = true;
            await sleep(RETRY_DELAYS_MS[Math.min(attempt++, RETRY_DELAYS_MS.length - 1)]);
            continue;
          }
          this.error = errorMessage(err, "Couldn't save that tap.");
        }
        this.pending[batch.metric] -= batch.delta;
        this.inflight = null;
      }
    } finally {
      if (epoch === this.epoch) this.flushScheduled = false;
    }
  }

  /**
   * Runs a write against the active session, starting one if needed. If that
   * session has ended or been deleted meanwhile (timed out, or ended on
   * another device), the write goes to a fresh session instead.
   */
  private async withSession(epoch: number, write: (id: string) => Promise<Session>): Promise<Session> {
    const session = this.active ?? (await this.startNow(epoch));
    try {
      return await write(session.id);
    } catch (err) {
      if (!hasStatus(err, 404, 409)) throw err;
      this.guard(epoch);
      await this.settle(epoch, session.id);
      return await write((await this.startNow(epoch)).id);
    }
  }

  private async postTap(id: string, { metric, delta, op }: TapBatch): Promise<Session> {
    const record = await pb.send(`/api/tally/sessions/${id}/tap`, {
      method: "POST",
      body: { metric, delta, op },
      signal: timeout(),
    });
    return sessionFromRecord(record);
  }

  private async update(epoch: number, id: string, changes: Partial<Counts> & { notes?: string }): Promise<Session> {
    const record = await pb.send(`/api/tally/sessions/${id}/update`, {
      method: "POST",
      body: changes,
      signal: timeout(),
    });
    this.guard(epoch);
    return sessionFromRecord(record);
  }

  private async startNow(epoch: number, notes = this.notesDraft): Promise<Session> {
    const record = await pb.send("/api/tally/sessions/start", {
      method: "POST",
      body: { notes },
      signal: timeout(),
    });
    this.guard(epoch);
    this.notesDraft = "";
    this.active = sessionFromRecord(record);
    return this.active;
  }

  /** Re-reads a session the server says is no longer open. */
  private async settle(epoch: number, id: string) {
    if (this.active?.id === id) this.active = null;
    try {
      const session = sessionFromRecord(await pb.collection("sessions").getOne(id, { signal: timeout() }));
      this.guard(epoch);
      if (session.endedAt) this.keepFinished(session);
    } catch (err) {
      if (!hasStatus(err, 404)) throw err;
      this.guard(epoch);
      this.forget(id);
    }
  }

  /** Applies the server's copy of one of this caller's sessions. */
  private show(session: Session) {
    if (!session.endedAt) {
      this.active = session;
      return;
    }
    if (this.active?.id === session.id) this.active = null;
    this.keepFinished(session);
  }

  private onRealtime(event: RecordSubscription<RecordModel>) {
    // Guards against a listener left behind by a previous sign-in.
    if (event.record.user !== auth.user?.id) return;
    if (this.running > 0) {
      this.missedEvents = true;
      return;
    }
    const session = sessionFromRecord(event.record);
    if (event.action === "delete") {
      this.forget(session.id);
      return;
    }
    const known = this.active?.id === session.id ? this.active : this.finished.find((s) => s.id === session.id);
    if (known && known.updated > session.updated) return; // a late, older event
    this.show(session);
  }

  private keepFinished(session: Session) {
    if (session.startedAt < this.todayStart) return;
    this.finished = [...this.finished.filter((s) => s.id !== session.id), session];
  }

  private forget(id: string) {
    if (this.active?.id === id) this.active = null;
    this.finished = this.finished.filter((s) => s.id !== id);
  }

  private async loadUntilDone(epoch: number) {
    for (let attempt = 0; epoch === this.epoch && !this.loaded; attempt++) {
      if (await this.reload()) return;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    }
  }

  /** Live updates from other devices. Retried on wake-up if it fails. */
  private async subscribe() {
    const user = auth.user;
    if (!user || this.live || this.subscribing) return;
    const epoch = this.epoch;
    this.subscribing = true;
    try {
      // A failed first attempt leaves its listeners registered in the SDK.
      await this.unsubscribe();
      await pb.collection("sessions").subscribe("*", (event) => this.onRealtime(event), {
        filter: `user = ${filterValue(user.id)}`,
      });
      // Fires on every reconnect: catch up on anything missed while away.
      await pb.realtime.subscribe("PB_CONNECT", () => void this.reload());
      if (epoch === this.epoch) this.live = true;
    } catch {
      // Offline or unreachable: counting still works, and wake() retries.
    } finally {
      this.subscribing = false;
    }
  }

  private unsubscribe() {
    // The stats page subscribes to sessions without options, so this prefix
    // only matches this store's (filtered) listener.
    return Promise.allSettled([
      pb.realtime.unsubscribeByPrefix("sessions/*?options="),
      pb.realtime.unsubscribe("PB_CONNECT"),
    ]);
  }

  /** Coming back online or to the tab: catch up and restore live updates. */
  private wake = () => {
    if (document.visibilityState !== "visible") return;
    void this.reload();
    void this.subscribe();
  };

  private scheduleMidnight() {
    clearTimeout(this.midnightTimer);
    const now = new Date();
    const untilMidnight = addDays(startOfDay(now), 1).getTime() - now.getTime();
    this.midnightTimer = setTimeout(() => {
      void this.reload();
      this.scheduleMidnight();
    }, untilMidnight + 1000);
  }
}

export const tally = new Tally();
