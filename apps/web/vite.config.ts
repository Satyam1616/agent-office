import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const COLLECTOR = `127.0.0.1:${process.env.COLLECTOR_PORT ?? 4747}`;

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // Preserve the browser Host and Origin so the collector's dev-only 5173 allowlist applies.
      "/ws": { target: `ws://${COLLECTOR}`, ws: true },
      "/api": { target: `http://${COLLECTOR}` },
    },
  },
});
