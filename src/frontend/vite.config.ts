import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minimal ambient for the one env var read below, so the config type-checks
// without pulling in @types/node.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // GitHub Pages project sites serve under /<repo>/. The deploy workflow sets
  // VITE_BASE (e.g. "/skillcurrent/"); local/dev and full-mode builds use "/".
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
