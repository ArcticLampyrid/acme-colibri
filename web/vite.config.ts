import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte()],
  build: { outDir: "dist", emptyOutDir: true },
  // `pnpm run dev:web` proxies the API to `wrangler dev`.
  server: { proxy: { "/api": "http://localhost:8787" } },
});
