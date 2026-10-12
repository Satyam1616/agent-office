import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The connect screen bundled into the Android app; the office itself is loaded from the hub.
export default defineConfig({
  plugins: [tailwindcss()],
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
});
