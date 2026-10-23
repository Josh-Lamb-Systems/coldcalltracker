import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// PocketBase serves the built app from pb_public in production. During
// development Vite serves the app and proxies API calls to PocketBase.
const pocketbase = process.env.PB_URL ?? "http://127.0.0.1:8090";

export default defineConfig({
  root: "web",
  plugins: [svelte({ configFile: "../svelte.config.js" })],
  build: {
    outDir: "../pb_public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": pocketbase,
      "/_": pocketbase,
    },
  },
});
