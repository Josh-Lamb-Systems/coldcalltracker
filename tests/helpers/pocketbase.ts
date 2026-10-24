import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import PocketBase from "pocketbase";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BIN = process.env.POCKETBASE_BIN ?? "pocketbase";
const ADMIN = { email: "admin@test.local", password: "admin-password-123" };
const PASSWORD = "caller-password-123";

export interface TestServer {
  url: string;
  /** Authenticated as a superuser. */
  admin: PocketBase;
  /** Creates a caller (as the admin) and returns a client signed in as them. */
  caller(name: string): Promise<{ pb: PocketBase; id: string; email: string }>;
  anonymous(): PocketBase;
  stop(): Promise<void>;
}

function client(url: string): PocketBase {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  return pb;
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  return port;
}

async function waitForHealth(url: string, output: () => string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PocketBase didn't start:\n${output()}`);
}

/** Starts a throwaway PocketBase with this repo's migrations and hooks. */
export async function startPocketBase(env: Record<string, string> = {}): Promise<TestServer> {
  const dir = await mkdtemp(join(tmpdir(), "coldcalltracker-test-"));
  const dataDir = join(dir, "pb_data");
  // A stand-in for the built app, to check how static files are served.
  const publicDir = join(dir, "pb_public");
  await mkdir(join(publicDir, "assets"), { recursive: true });
  await writeFile(join(publicDir, "index.html"), "<!doctype html><title>test</title>");
  await writeFile(join(publicDir, "assets", "app-1234.js"), "console.log(1)");
  await writeFile(join(publicDir, "manifest.webmanifest"), "{}");
  await promisify(execFile)(BIN, ["superuser", "upsert", ADMIN.email, ADMIN.password, "--dir", dataDir]);

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    BIN,
    [
      "serve",
      "--http", `127.0.0.1:${port}`,
      "--dir", dataDir,
      "--publicDir", publicDir,
      "--hooksDir", join(ROOT, "pb_hooks"),
      "--migrationsDir", join(ROOT, "pb_migrations"),
      "--hooksWatch=false",
      "--automigrate=false",
    ],
    { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  await waitForHealth(url, () => output);

  const admin = client(url);
  await admin.collection("_superusers").authWithPassword(ADMIN.email, ADMIN.password);

  return {
    url,
    admin,
    async caller(name) {
      const email = `${name.toLowerCase()}@test.local`;
      const record = await admin.collection("users").create({ email, name, password: PASSWORD, passwordConfirm: PASSWORD });
      const pb = client(url);
      await pb.collection("users").authWithPassword(email, PASSWORD);
      return { pb, id: record.id, email };
    },
    anonymous: () => client(url),
    async stop() {
      child.kill();
      await once(child, "exit");
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Wraps the custom session routes from pb_hooks/sessions.pb.js. */
export function sessions(pb: PocketBase) {
  return {
    start: (notes = "") => pb.send("/api/tally/sessions/start", { method: "POST", body: { notes } }),
    end: (id: string) => pb.send(`/api/tally/sessions/${id}/end`, { method: "POST" }),
    tap: (id: string, metric: string, delta: number, op?: string) =>
      pb.send(`/api/tally/sessions/${id}/tap`, { method: "POST", body: { metric, delta, op } }),
    update: (id: string, changes: Record<string, unknown>) =>
      pb.send(`/api/tally/sessions/${id}/update`, { method: "POST", body: changes }),
  };
}

/** Resolves to the HTTP status of a rejected SDK call (or 200 if it succeeded). */
export async function statusOf(request: Promise<unknown>): Promise<number> {
  try {
    await request;
    return 200;
  } catch (err) {
    return (err as { status: number }).status;
  }
}
