/**
 * Builds `/sw.js`, the service worker, after the app itself has been built.
 *
 * The worker has to know two things that only exist once the build is done: the name
 * of the build (its fingerprinted entry script, the same name `/api/health` reports)
 * and which files a phone must hold for the app to open with the server out of reach.
 * That is not every file. A phone out of reach can show what was kept on it and
 * nothing else, so the PDF viewer, the diagram renderer and the screens that only talk
 * to the server are left out: what is kept is the app's entry, everything the
 * out-of-reach screens (`src/features/kept/`) load however late they load it, the
 * styles, the fonts, and the outline of the world the map draws under everything.
 *
 * The worker is then bundled on its own into one classic script, with those two
 * things written into it. Any change to a kept file changes the script, and a changed
 * script is what makes a browser install the new worker.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { build, type Plugin } from "vite";

/** The app as it is with the server out of reach. Its chunk, and whatever that chunk goes on to load, is what a phone must hold. */
const OUT_OF_REACH_APP = /\/src\/features\/kept\/out-of-reach-app\.tsx$/;
/** Files from `public/` that the shell needs. Map lettering and icons are kept with a map area instead: they are 20 MB. */
const PUBLIC_FILES = [
  "outpost.svg",
  "pre-paint.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "world/land.json",
  "world/countries.json",
];
/** Workers are separate files a chunk names only as text, so the build cannot say which chunk needs them. */
const WORKERS = [/^assets\/maplibre-gl-worker-[\w-]+\.m?js$/, /^assets\/contour\.worker-[\w-]+\.m?js$/];

interface BundledChunk {
  type: "chunk";
  fileName: string;
  isEntry: boolean;
  facadeModuleId: string | null;
  moduleIds: string[];
  imports: string[];
  dynamicImports: string[];
  viteMetadata?: { importedCss?: Set<string>; importedAssets?: Set<string> };
}

export function serviceWorker(): Plugin {
  let root = "";
  let outDir = "";
  let files: string[] = [];
  let buildName = "";

  return {
    name: "outpost:service-worker",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },

    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === "chunk") as unknown as BundledChunk[];
      const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const wanted = new Set<string>();

      const stylesOnly = new Set<string>();
      /** A chunk, with everything it needs before it can run. */
      const take = (fileName: string): void => {
        if (wanted.has(fileName) || stylesOnly.has(fileName)) return;
        const chunk = byFile.get(fileName);
        // A chunk of nothing but styles: Vite writes its CSS and leaves its empty script out of the build, so only the CSS is kept.
        if (chunk && chunk.moduleIds.length > 0 && chunk.moduleIds.every((id) => /\.css($|\?)/.test(id))) stylesOnly.add(fileName);
        else wanted.add(fileName);
        if (!chunk) return;
        for (const file of chunk.viteMetadata?.importedCss ?? []) wanted.add(file);
        for (const file of chunk.viteMetadata?.importedAssets ?? []) wanted.add(file);
        for (const file of chunk.imports) take(file);
      };

      const entry = chunks.find((chunk) => chunk.isEntry);
      if (!entry) throw new Error("The service worker could not be built: the app has no entry script.");
      buildName = path.basename(entry.fileName);
      // The entry loads every screen on demand; only the screens below are followed that far.
      take(entry.fileName);

      const root = chunks.find((chunk) => chunk.moduleIds.some((id) => OUT_OF_REACH_APP.test(id.replaceAll("\\", "/"))));
      if (!root || root.isEntry) {
        throw new Error(
          "The service worker could not be built: the out-of-reach app is not a chunk of its own. Is it still loaded with lazy()?",
        );
      }
      // What the out-of-reach app loads later (its map, and the map engine after that) is needed out of reach too.
      const later = [root.fileName];
      const followed = new Set<string>();
      for (let index = 0; index < later.length; index += 1) {
        const fileName = later[index]!;
        if (followed.has(fileName)) continue;
        followed.add(fileName);
        take(fileName);
        later.push(...(byFile.get(fileName)?.dynamicImports ?? []));
      }

      for (const fileName of Object.keys(bundle)) {
        // Styles and fonts are small and shared; a missing one would leave the kept app unstyled.
        if (/\.(css|woff2)$/.test(fileName)) wanted.add(fileName);
      }
      for (const pattern of WORKERS) {
        const found = Object.keys(bundle).filter((fileName) => pattern.test(fileName));
        if (found.length === 0) throw new Error(`The service worker could not be built: no file matches ${pattern}. Was a worker renamed?`);
        for (const fileName of found) wanted.add(fileName);
      }
      files = [...wanted].sort();
    },

    async closeBundle() {
      if (!buildName) return;
      const shell = ["index.html", ...files, ...PUBLIC_FILES];
      const hash = createHash("sha256");
      for (const file of shell) {
        const full = path.join(outDir, file);
        if (!fs.existsSync(full)) throw new Error(`The service worker could not be built: ${file} is not in the build.`);
        hash.update(file).update(fs.readFileSync(full));
      }
      const bytes = shell.reduce((total, file) => total + fs.statSync(path.join(outDir, file)).size, 0);
      await build({
        configFile: false,
        root,
        publicDir: false,
        logLevel: "warn",
        define: {
          __OUTPOST_BUILD__: JSON.stringify(buildName),
          // Changes when any kept file does, including the ones whose names do not (index.html, the icons).
          __OUTPOST_SHELL_VERSION__: JSON.stringify(hash.digest("hex").slice(0, 12)),
          __OUTPOST_SHELL_FILES__: JSON.stringify(shell.map((file) => `/${file}`)),
        },
        build: {
          outDir,
          emptyOutDir: false,
          target: "es2022",
          sourcemap: false,
          copyPublicDir: false,
          lib: {
            entry: path.resolve(root, "src/sw/sw.ts"),
            formats: ["iife"],
            name: "outpostServiceWorker",
            fileName: () => "sw.js",
          },
        },
      });
      console.log(
        `[service worker] ${shell.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB, kept for when the server is out of reach`,
      );
    },
  };
}
