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
      "/ws": { target: `ws://${COLLECTOR}`, ws: true },
      "/api": `http://${COLLECTOR}`,
    },
  },
});
