import type PocketBase from "pocketbase";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessions, startPocketBase, statusOf, type TestServer } from "./helpers/pocketbase";

let server: TestServer;
let alice: { pb: PocketBase; id: string; email: string };
let bob: { pb: PocketBase; id: string; email: string };

beforeAll(async () => {
  server = await startPocketBase();
  alice = await server.caller("Alice");
  bob = await server.caller("Bob");
});

afterAll(async () => {
  await server?.stop();
});

describe("accounts", () => {
  it("only an admin can create callers", async () => {
    const data = { email: "eve@test.local", password: "password-123", passwordConfirm: "password-123" };
    expect(await statusOf(server.anonymous().collection("users").create(data))).toBe(403);
    expect(await statusOf(alice.pb.collection("users").create(data))).toBe(403);
  });

  it("callers can't delete their own account", async () => {
    expect(await statusOf(alice.pb.collection("users").delete(alice.id))).toBe(403);
  });

  it("everyone signed in sees the team, but not each other's emails", async () => {
    const team = await bob.pb.collection("users").getFullList({ sort: "name" });
    expect(team.map((user) => user.name)).toEqual(["Alice", "Bob"]);
    expect(team.find((user) => user.id === alice.id)?.email).toBeFalsy();
    expect(await server.anonymous().collection("users").getFullList()).toEqual([]);
  });

  it("callers set their own goals only", async () => {
    const updated = await alice.pb.collection("users").update(alice.id, { goal_dials: 120, goal_booked: 3 });
    expect(updated).toMatchObject({ goal_dials: 120, goal_booked: 3 });
    expect(await statusOf(bob.pb.collection("users").update(alice.id, { goal_dials: 1 }))).toBe(404);
    expect(await statusOf(alice.pb.collection("users").update(alice.id, { goal_dials: -5 }))).toBe(400);
  });
});

describe("static files", () => {
  it("makes browsers revalidate the app page but not hashed assets", async () => {
    expect((await fetch(`${server.url}/`)).headers.get("cache-control")).toBe("no-cache");
    expect((await fetch(`${server.url}/counter`)).headers.get("cache-control")).toBe("no-cache");
    expect((await fetch(`${server.url}/assets/app-1234.js`)).headers.get("cache-control")).toBeNull();
  });

  it("serves the home screen manifest with its proper type", async () => {
    const response = await fetch(`${server.url}/manifest.webmanifest`);
    expect(response.headers.get("content-type")).toBe("application/manifest+json");
  });
});

describe("sessions", () => {
  it("start returns the caller's open session instead of opening a second one", async () => {
    const first = await sessions(alice.pb).start("Dentists");
    const second = await sessions(alice.pb).start();
    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({ user: alice.id, notes: "Dentists", ended_at: "", dials: 0 });
    await sessions(alice.pb).tap(first.id, "dials", 1);
    await sessions(alice.pb).end(first.id);
  });

  it("never loses taps, even when they arrive at the same time", async () => {
    const session = await sessions(alice.pb).start();
    await Promise.all(Array.from({ length: 40 }, () => sessions(alice.pb).tap(session.id, "dials", 1)));
    await Promise.all(Array.from({ length: 6 }, () => sessions(alice.pb).tap(session.id, "owners", 1)));
    const saved = await alice.pb.collection("sessions").getOne(session.id);
    expect(saved).toMatchObject({ dials: 40, owners: 6, attempts: 0, booked: 0 });
    await sessions(alice.pb).end(session.id);
  });

  it("never counts below zero", async () => {
    const session = await sessions(alice.pb).start();
    await sessions(alice.pb).tap(session.id, "booked", 1);
    const result = await sessions(alice.pb).tap(session.id, "booked", -3);
    expect(result.booked).toBe(0);
    await sessions(alice.pb).tap(session.id, "dials", 1);
    await sessions(alice.pb).end(session.id);
  });

  it("rejects unknown metrics and odd deltas", async () => {
    const session = await sessions(alice.pb).start();
    expect(await statusOf(sessions(alice.pb).tap(session.id, "voicemails", 1))).toBe(400);
    expect(await statusOf(sessions(alice.pb).tap(session.id, "dials", 0.5))).toBe(400);
    expect(await statusOf(sessions(alice.pb).tap(session.id, "dials", 0))).toBe(400);
    expect(await statusOf(sessions(alice.pb).tap(session.id, "dials", 5000))).toBe(400);
    expect(await statusOf(sessions(alice.pb).tap("missing00000000", "dials", 1))).toBe(404);
    expect(await statusOf(sessions(server.anonymous()).tap(session.id, "dials", 1))).toBe(401);
    await sessions(alice.pb).end(session.id);
  });

  it("doesn't count a retried tap twice", async () => {
    const session = await sessions(alice.pb).start();
    const op = "retry-op-0001";
    await sessions(alice.pb).tap(session.id, "dials", 3, op);
    const retried = await sessions(alice.pb).tap(session.id, "dials", 3, op);
    expect(retried.dials).toBe(3);
    expect(retried.recent_ops).toBeUndefined(); // bookkeeping stays server-side
    await sessions(alice.pb).tap(session.id, "dials", 1, "retry-op-0002");

    // A retry that arrives after the session ended is acknowledged, not refused.
    await sessions(alice.pb).end(session.id);
    expect((await sessions(alice.pb).tap(session.id, "dials", 3, op)).dials).toBe(4);
    expect(await statusOf(sessions(alice.pb).tap(session.id, "dials", 1, "retry-op-0003"))).toBe(409);
    expect(await statusOf(sessions(alice.pb).tap(session.id, "dials", 1, "bad op!"))).toBe(400);
  });

  it("keeps callers out of each other's sessions, while letting them view them", async () => {
    const session = await sessions(alice.pb).start();
    await sessions(alice.pb).tap(session.id, "dials", 2);
    expect(await statusOf(sessions(bob.pb).tap(session.id, "dials", 1))).toBe(403);
    expect(await statusOf(sessions(bob.pb).update(session.id, { dials: 99 }))).toBe(403);
    expect(await statusOf(sessions(bob.pb).end(session.id))).toBe(403);
    expect(await statusOf(bob.pb.collection("sessions").update(session.id, { dials: 99 }))).toBe(403);
    expect(await statusOf(bob.pb.collection("sessions").delete(session.id))).toBe(404);
    expect((await bob.pb.collection("sessions").getOne(session.id)).dials).toBe(2);
    expect(await server.anonymous().collection("sessions").getFullList()).toEqual([]);
    await sessions(alice.pb).end(session.id);
  });

  it("lets owners correct counts and notes through the update route only", async () => {
    const session = await sessions(bob.pb).start();
    await sessions(bob.pb).tap(session.id, "dials", 1);
    const corrected = await sessions(bob.pb).update(session.id, { dials: 25, notes: "HVAC" });
    expect(corrected).toMatchObject({ dials: 25, owners: 0, notes: "HVAC" });
    // Times and ownership can't be changed, and the collection API is admin-only.
    const unchanged = await sessions(bob.pb).update(session.id, { notes: "HVAC", started_at: "2020-01-01 00:00:00.000Z", user: alice.id });
    expect(unchanged).toMatchObject({ user: bob.id, started_at: session.started_at });
    expect(await statusOf(bob.pb.collection("sessions").update(session.id, { dials: 30 }))).toBe(403);
    for (const bad of [{ dials: -1 }, { dials: 1.5 }, { owners: "lots" }, { notes: "x".repeat(501) }, {}]) {
      expect(await statusOf(sessions(bob.pb).update(session.id, bad))).toBe(400);
    }
    await sessions(bob.pb).end(session.id);
  });

  it("only changes the fields an edit sends, so taps in between survive", async () => {
    const session = await sessions(bob.pb).start();
    await Promise.all([
      ...Array.from({ length: 20 }, () => sessions(bob.pb).tap(session.id, "dials", 1)),
      ...Array.from({ length: 5 }, (_, i) => sessions(bob.pb).update(session.id, { notes: `note ${i}` })),
    ]);
    expect((await bob.pb.collection("sessions").getOne(session.id)).dials).toBe(20);
    await sessions(bob.pb).end(session.id);
  });

  it("only starts sessions through the start route", async () => {
    const create = bob.pb.collection("sessions").create({ user: bob.id, started_at: "2026-01-01 09:00:00.000Z" });
    expect(await statusOf(create)).toBe(403);
  });

  it("allows one open session per caller, even for an admin", async () => {
    const session = await sessions(bob.pb).start();
    const duplicate = server.admin
      .collection("sessions")
      .create({ user: bob.id, started_at: "2026-01-01 09:00:00.000Z" });
    expect(await statusOf(duplicate)).toBe(400);
    await sessions(bob.pb).tap(session.id, "dials", 1);
    await sessions(bob.pb).end(session.id);
  });

  it("ends sessions, discarding ones where nothing was counted", async () => {
    const empty = await sessions(bob.pb).start();
    expect(await sessions(bob.pb).end(empty.id)).toEqual({});
    expect(await statusOf(bob.pb.collection("sessions").getOne(empty.id))).toBe(404);

    const session = await sessions(bob.pb).start();
    await sessions(bob.pb).tap(session.id, "attempts", 1);
    const ended = await sessions(bob.pb).end(session.id);
    expect(ended.ended_at).not.toBe("");
    expect(ended.attempts).toBe(1);
    // Ending again is harmless; tapping an ended session is refused.
    expect((await sessions(bob.pb).end(session.id)).ended_at).toBe(ended.ended_at);
    expect(await statusOf(sessions(bob.pb).tap(session.id, "dials", 1))).toBe(409);
  });

  it("lets callers delete their own sessions only", async () => {
    const session = await sessions(bob.pb).start();
    await sessions(bob.pb).tap(session.id, "dials", 1);
    expect(await statusOf(alice.pb.collection("sessions").delete(session.id))).toBe(404);
    await bob.pb.collection("sessions").delete(session.id);
    expect(await statusOf(sessions(bob.pb).tap(session.id, "dials", 1))).toBe(404);
  });

  it("protects history: a caller with sessions can't be deleted", async () => {
    expect(await statusOf(server.admin.collection("users").delete(alice.id))).toBe(400);
  });
});
