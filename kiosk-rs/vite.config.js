import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";
import { readFileSync } from "node:fs";

// The About screen shows this, and the seven-tap unlock hangs off it. Read from package.json
// rather than retyped in the UI: three copies of a version number is three chances to drift.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [tailwindcss(), sveltekit()],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // Logic tests run in plain Node: the modules under test are deliberately free of DOM and
  // Supabase dependencies, and browser globals they do touch (localStorage) are stubbed by
  // the test itself, which also lets the quota-failure path be exercised. Mirrors the web
  // app's "server" vitest project.
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
