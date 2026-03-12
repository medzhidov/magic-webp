import { defineConfig } from "vite";

export default defineConfig({
  // Prevent esbuild from pre-bundling the WASM glue
  optimizeDeps: {
    exclude: ["../lib"],
  },

  // The demo folder IS the web root, so assets resolve from there
  root: ".",
  base: "./",

  server: {
    port: 3737,
    open: false,
  },

  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Use 'es' format for workers to support code-splitting
        format: 'es',
      },
    },
  },

  worker: {
    format: 'es',
  },
});

