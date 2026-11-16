#!/usr/bin/env node
/**
 * Builds the web app a second time with one line added to its entry, into a folder of
 * its own. To the server and to a browser the result is what a new release is: an
 * entry script under a new name, every chunk that names it renamed in turn, and a new
 * service worker. The end-to-end tests serve it to check that a phone holding the old
 * app moves on to the new one.
 *
 *   node e2e/tools/next-build.mjs <out dir>
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const web = path.resolve(import.meta.dirname, "../../apps/web");
const out = process.argv[2];
if (!out) throw new Error("Give the folder to build into.");

const { build } = await import(pathToFileURL(createRequire(path.join(web, "package.json")).resolve("vite")).href);
await build({
  root: web,
  configFile: path.join(web, "vite.config.ts"),
  logLevel: "warn",
  build: { outDir: path.resolve(out), emptyOutDir: true },
  plugins: [
    {
      name: "outpost-e2e:next-build",
      enforce: "pre",
      transform(code, id) {
        if (!id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return null;
        return { code: `${code}\nglobalThis.__outpostNextBuild = true;\n`, map: null };
      },
    },
  ],
});
