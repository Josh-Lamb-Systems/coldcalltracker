import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["web/src/**/*.test.ts"],
          // Bucketing is local-time based; pin a zone with DST so the
          // tests are deterministic and cover the transitions.
          env: { TZ: "America/New_York" },
        },
      },
      {
        // Each API test file starts its own PocketBase (see tests/helpers),
        // so the `pocketbase` binary from mise must be on PATH.
        test: {
          name: "api",
          include: ["tests/**/*.test.ts"],
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
