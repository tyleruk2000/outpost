/**
 * Where Outpost's own files live.
 *
 * Two layouts exist. From source (development and tests) the server runs as TypeScript
 * inside the repository. Packaged (Docker image and portable drives) it is a bundle:
 *
 *   app/server/outpost.mjs   bundled server and workers
 *   app/server/migrations/   SQL migrations
 *   app/web/                 built web app
 *   app/catalog/             catalogue manifests
 */
import path from "node:path";

const here = import.meta.dirname;

/** True when running from the packaged bundle rather than from source. */
export const isBundled = !import.meta.filename.endsWith(".ts");

/** Root of the app directory (packaged) or of the repository (source). */
export const appRoot = isBundled ? path.resolve(here, "..") : path.resolve(here, "../../../..");

export const migrationsDir = isBundled
  ? path.join(here, "migrations")
  : path.resolve(here, "../db/migrations");

export const defaultCatalogDir = path.join(appRoot, "catalog");

export const defaultWebDir = isBundled
  ? path.join(appRoot, "web")
  : path.join(appRoot, "apps/web/dist");

/**
 * Location of a worker-thread entry point. Workers are separate files in both layouts:
 * `<name>.worker.ts` next to the module that owns them in source, and
 * `workers/<name>.mjs` in the bundle.
 */
export function workerUrl(sourceUrl: URL, name: string): URL {
  if (isBundled) return new URL(`./workers/${name}.mjs`, `file://${here}/`);
  return sourceUrl;
}
