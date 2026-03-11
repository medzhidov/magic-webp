import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    // Enables .wasm file streaming instantiation
    wasm(),
    // Allows top-level `await` in the wasm-pack JS glue code
    topLevelAwait(),
  ],

  // Prevent esbuild from pre-bundling the WASM glue (it would break .wasm imports)
  optimizeDeps: {
    exclude: ["../pkg"],
  },

  // The demo folder IS the web root, so assets resolve from there
  root: ".",
  base: "./",

  server: {
    port: 5173,
    open: true,
  },

  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});

