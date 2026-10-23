import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessions, startPocketBase, statusOf, type TestServer } from "./helpers/pocketbase";

// Sessions go idle after ~1.2 seconds on this server.
const IDLE_MS = 1200;
const wait = () => new Promise((resolve) => setTimeout(resolve, IDLE_MS + 800));

let server: TestServer;

beforeAll(async () => {
  server = await startPocketBase({ SESSION_IDLE_MINUTES: String(IDLE_MS / 60_000) });
});

afterAll(async () => {
  await server?.stop();
});

describe("idle sessions", () => {
  it("end at their last activity when the next tap comes in, and a new start opens a fresh one", async () => {
    const { pb } = await server.caller("Cara");
    const session = await sessions(pb).start();
    const lastTap = await sessions(pb).tap(session.id, "dials", 3);
    await wait();

    expect(await statusOf(sessions(pb).tap(session.id, "dials", 1))).toBe(409);
    const ended = await pb.collection("sessions").getOne(session.id);
    expect(ended).toMatchObject({ dials: 3, ended_at: lastTap.updated });

    const next = await sessions(pb).start();
    expect(next.id).not.toBe(session.id);
  });

  it("are closed by the cron job, and empty ones are deleted", async () => {
    const { pb } = await server.caller("Dan");
    const used = await sessions(pb).start();
    await sessions(pb).tap(used.id, "booked", 1);
    await wait();
    // The run-cron endpoint returns immediately and runs the job in the background.
    await server.admin.send("/api/crons/close_idle_sessions", { method: "POST" });
    await expect.poll(async () => (await pb.collection("sessions").getOne(used.id)).ended_at).not.toBe("");

    const empty = await sessions(pb).start();
    await wait();
    await server.admin.send("/api/crons/close_idle_sessions", { method: "POST" });
    await expect.poll(() => statusOf(pb.collection("sessions").getOne(empty.id))).toBe(404);
  });
});
