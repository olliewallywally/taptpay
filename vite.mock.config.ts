// Dedicated build config for the DOWNLOADABLE VISUAL/DEMO build only.
//
// Identical to vite.config.ts EXCEPT it does not use the custom manualChunks
// splitter, which puts React core and React-DOM in separate chunks and creates a
// circular chunk dependency (React-DOM initialises before React exists →
// "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED" crash). Default chunking
// keeps them together. Build with: VITE_MOCK=1 vite build --config vite.mock.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
  },
  server: {
    fs: { strict: true, deny: ["**/.*"] },
  },
});
