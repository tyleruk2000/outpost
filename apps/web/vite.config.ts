import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { serviceWorker } from "./sw-plugin.ts";

const server = process.env.OUTPOST_DEV_SERVER ?? "http://127.0.0.1:8080";

/**
 * pdf.js loads character maps, the standard fonts, colour profiles and image decoders
 * at run time, by name. Outpost works offline, so they are served from the app's own
 * origin under /pdfjs/: straight from the package in development, copied into the build.
 */
function pdfjsAssets(): Plugin {
  const source = path.resolve(import.meta.dirname, "node_modules/pdfjs-dist");
  const folders = ["cmaps", "standard_fonts", "wasm", "iccs"];
  let outDir = "";
  return {
    name: "outpost:pdfjs-assets",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use("/pdfjs", (request, response, next) => {
        const relative = decodeURIComponent((request.url ?? "").split("?")[0] ?? "").replace(/^\/+/, "");
        const file = path.join(source, relative);
        const inside = folders.some((folder) => file.startsWith(path.join(source, folder) + path.sep));
        if (!inside || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return next();
        if (file.endsWith(".wasm")) response.setHeader("Content-Type", "application/wasm");
        else if (file.endsWith(".js")) response.setHeader("Content-Type", "text/javascript");
        fs.createReadStream(file).pipe(response);
      });
    },
    writeBundle() {
      for (const folder of folders) fs.cpSync(path.join(source, folder), path.join(outDir, "pdfjs", folder), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets(), serviceWorker()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Mermaid's optional ELK layout engine (elkjs, EPL-2.0) is not shipped; see the file this points at.
      "elkjs/lib/elk.bundled.js": path.resolve(import.meta.dirname, "src/features/library/figures/no-elk.ts"),
    },
  },
  server: {
    port: Number(process.env.OUTPOST_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": { target: server, changeOrigin: false },
      "/kiwix": { target: server, changeOrigin: false },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
