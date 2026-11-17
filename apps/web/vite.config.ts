import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { precompress } from "./compress-plugin.ts";
import { guides } from "./guides-plugin.ts";
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

/**
 * OpenPGP.js is LGPL-3.0-or-later, the one library here that is not under a permissive
 * licence (docs/architecture.md says why it is used all the same). It is therefore kept
 * out of Outpost's own bundles: the file its authors publish is served as it is, under
 * /vendor/openpgp/, beside its licence and a note saying where its source is, and the
 * Encryption screen loads it at run time (`features/encryption/load-openpgp.ts`).
 * Anyone can put a build of their own in its place. Nothing else may import "openpgp"
 * except for its types.
 */
function openpgpVendor(): Plugin {
  const source = path.resolve(import.meta.dirname, "node_modules/openpgp");
  const library = "openpgp.min.mjs";
  let outDir = "";
  return {
    name: "outpost:openpgp-vendor",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(`/vendor/openpgp/${library}`, (_request, response) => {
        response.setHeader("Content-Type", "text/javascript");
        fs.createReadStream(path.join(source, "dist", library)).pipe(response);
      });
    },
    writeBundle() {
      const { version } = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")) as { version: string };
      const target = path.join(outDir, "vendor/openpgp");
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(path.join(source, "dist", library), path.join(target, library));
      fs.copyFileSync(path.join(source, "LICENSE"), path.join(target, "LGPL-3.0.txt"));
      fs.copyFileSync(path.resolve(import.meta.dirname, "third-party/openpgp/GPL-3.0.txt"), path.join(target, "GPL-3.0.txt"));
      fs.writeFileSync(
        path.join(target, "NOTICE.txt"),
        [
          `${library} in this folder is OpenPGP.js ${version}, exactly as its authors publish it`,
          `(https://www.npmjs.com/package/openpgp/v/${version}, file dist/${library}). It has not been changed.`,
          "",
          "OpenPGP.js is free software under the GNU Lesser General Public License, version 3 or",
          "(at your option) any later version. The licence is in LGPL-3.0.txt, and the GNU General",
          "Public License it builds on is in GPL-3.0.txt. It comes with no warranty.",
          "",
          `Its source code is at https://github.com/openpgpjs/openpgpjs/tree/v${version}`,
          "",
          "Outpost itself is under the MIT licence and is not part of OpenPGP.js. Outpost's",
          "Encryption screen loads this file when it is opened and calls it through its published",
          "interface. You may replace the file with another build of OpenPGP.js that offers the same",
          "interface, including one you have changed, and Outpost will use yours.",
          "",
        ].join("\n"),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets(), openpgpVendor(), guides(), serviceWorker(), precompress()],
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
