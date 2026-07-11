import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  // Demo/visual build (VITE_MOCK=1) is distributed as loose static files and
  // may be opened from a subpath or file://, so emit relative asset URLs.
  // Combined with hash routing this makes the demo work on any host.
  base: process.env.VITE_MOCK === "1" ? "./" : "/",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Rollup/Vite virtual helper modules (\0commonjsHelpers.js,
          // \0vite/modulepreload-polyfill, …) are imported by nearly every
          // chunk. Left unassigned, Rollup can inline them into whichever chunk
          // it visits first — if that's a big lazy chunk, every other chunk
          // gains a static import of it and it loads eagerly. Pin them to a
          // tiny shared chunk with no imports of its own. Deliberately narrow:
          // a blanket \0 match would also catch ?commonjs-proxy modules and
          // drag whole libraries (pako, qrcode, …) into this eager chunk.
          if (id.includes("commonjsHelpers") || id.startsWith("\0vite")) return "helpers";
          if (!id.includes("node_modules")) return undefined;
          // No manual chunk for @react-pdf: pinning it (and its dep tree) to a
          // "vendor-pdf" chunk forced eager loading — a package in that chunk was
          // also reachable from the eager graph, so index.js had to import the
          // whole 1.4 MB chunk to preserve execution order. Unassigned, Rollup
          // colocates the PDF engine with its only importers: the dynamically
          // imported report generators under lib/report-pdf/reports/.
          if (id.includes("motion") || id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("@radix-ui") || id.includes("radix-ui")) return "vendor-radix";
          if (id.includes("lucide-react")) return "vendor-lucide";
          // Keep React core, react-dom and scheduler in ONE chunk. Splitting
          // react core into the catch-all "vendor" chunk creates a circular
          // cross-chunk import (react-dom -> react) that loads react-dom before
          // React initialises, crashing with a __SECRET_INTERNALS undefined error.
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("react/jsx-runtime") ||
            id.includes("react/jsx-dev-runtime")
          )
            return "vendor-react";
          if (id.includes("wouter")) return "vendor-router";
          if (id.includes("zod") || id.includes("drizzle-zod") || id.includes("@hookform")) return "vendor-forms";
          // No catch-all "vendor" bucket: it merged every remaining node_module
          // (incl. @react-pdf + yoga, recharts, stripe — ~3.5 MB) into a single
          // chunk that index.html loaded eagerly, defeating the dynamic import()
          // of the PDF generators. Returning undefined lets Rollup place each dep
          // with the chunk(s) that import it, so dynamic-only deps stay lazy.
          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
