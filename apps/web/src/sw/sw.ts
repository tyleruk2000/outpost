/**
 * Outpost's service worker: what lets the app open on a phone that cannot reach the
 * server, and what answers for the things a person chose to keep on that phone.
 *
 * It is small and hand-written on purpose. What it does is specific to Outpost (see
 * `rules.ts` for the rules, and docs/offline.md for the reasons), a general caching
 * library would have to be configured out of most of what it does, and a worker that
 * goes wrong keeps people on an old app, so every line of it should be readable here.
 *
 * Built by `sw-plugin.ts` into `/sw.js`, with the build's name and the list of the
 * app's own files written into it. A new build is therefore a different script, which
 * is how a browser knows to install it.
 */
import {
  DOWN_FOR_MS,
  handlingOf,
  isTilePath,
  KEPT_PREFIX,
  keptKey,
  NETWORK_TIMEOUT_MS,
  PAGE_TIMEOUT_WHEN_DOWN_MS,
  SHELL_PAGE,
  SHELL_PREFIX,
  shellCacheName,
  TILE_ENCODING_HEADER,
  type WorkerMessage,
} from "./rules";

declare const self: ServiceWorkerGlobalScope;
/** The name of the build's entry script, the same name `/api/health` reports. */
declare const __OUTPOST_BUILD__: string;
/** Changes whenever any file of the shell does, including those whose names stay the same. */
declare const __OUTPOST_SHELL_VERSION__: string;
/** Every file of the app that must be on the phone for it to open out of reach. */
declare const __OUTPOST_SHELL_FILES__: string[];

const BUILD = __OUTPOST_BUILD__;
const SHELL = shellCacheName(`${BUILD}:${__OUTPOST_SHELL_VERSION__}`);
const precached = new Set(__OUTPOST_SHELL_FILES__);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Straight from the server, past the browser's own cache: a shell assembled from stale parts would not start.
      await cache.addAll(__OUTPOST_SHELL_FILES__.map((file) => new Request(file, { cache: "reload" })));
    })(),
  );
  // An older worker stays in charge until a page running this build asks for the change (see "message"):
  // a tab still on the old build keeps the files it was started from. With no older worker there is nothing to wait for.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(SHELL_PREFIX) && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** When a request to the server last failed. Lost when the worker is stopped, and learnt again from the next failure. */
let downSince = 0;
const believedDown = () => Date.now() - downSince < DOWN_FOR_MS;

self.addEventListener("message", (event) => {
  const message = event.data as WorkerMessage | undefined;
  if (message?.type === "activate" && message.build === BUILD) void self.skipWaiting();
  if (message?.type === "reach") downSince = message.reachable ? 0 : Date.now();
});

async function fromServer(request: Request, timeoutMs: number): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: abort.signal });
    downSince = 0;
    return response;
  } catch (error) {
    downSince = Date.now();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function page(request: Request): Promise<Response> {
  // Always asked of the server, even when it was out of reach a moment ago: this is the rule that keeps a phone from
  // being left on an old build. Believing it out of reach only shortens the wait before the kept app is shown.
  try {
    return await fromServer(request, believedDown() ? PAGE_TIMEOUT_WHEN_DOWN_MS : NETWORK_TIMEOUT_MS);
  } catch {
    // Out of reach: the kept shell.
  }
  const shell = await (await caches.open(SHELL)).match(SHELL_PAGE);
  if (shell) return shell;
  return fetch(request);
}

async function shellFile(request: Request): Promise<Response> {
  const kept = await (await caches.open(SHELL)).match(request, { ignoreSearch: true });
  // A file of another build, or of a screen that is not kept: the server has it or nobody does.
  return kept ?? fetch(request);
}

/** The kept copy as the page expects it: a tile stored gzipped is unpacked on the way out. */
function serveKept(copy: Response): Response {
  if (copy.headers.get(TILE_ENCODING_HEADER) !== "gzip" || !copy.body) return copy;
  const headers = new Headers({ "Content-Type": copy.headers.get("Content-Type") ?? "application/octet-stream" });
  return new Response(copy.body.pipeThrough(new DecompressionStream("gzip")), { status: 200, headers });
}

async function findKept(request: Request): Promise<Response | undefined> {
  const key = keptKey(request.url, self.location.origin);
  // Pictures belong to kept pages; tiles, lettering and map icons to kept areas.
  const prefix = `${KEPT_PREFIX}${key.startsWith("/api/attachments/") ? "note" : "area"}:`;
  for (const name of await caches.keys()) {
    if (!name.startsWith(prefix)) continue;
    const copy = await (await caches.open(name)).match(key);
    if (copy) return copy;
  }
  return undefined;
}

const anAreaIsKept = async () => (await caches.keys()).some((name) => name.startsWith(`${KEPT_PREFIX}area:`));

async function keptThing(request: Request): Promise<Response> {
  const copy = await findKept(request);
  const tile = isTilePath(new URL(request.url).pathname);
  // Outside a kept area there is no tile to give. Saying so, as the server does for a place no
  // installed region covers, lets the map draw the coarser kept tiles there instead of an error.
  const noTile = async () => (tile && (await anAreaIsKept()) ? new Response(null, { status: 204 }) : undefined);

  if (!copy) {
    if (believedDown()) {
      const empty = await noTile();
      if (empty) return empty;
    }
    try {
      const response = await fetch(request);
      downSince = 0;
      return response;
    } catch (error) {
      downSince = Date.now();
      const empty = await noTile();
      if (empty) return empty;
      throw error;
    }
  }
  if (believedDown()) return serveKept(copy);
  try {
    return await fromServer(request, NETWORK_TIMEOUT_MS);
  } catch {
    return serveKept(copy);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const handling = handlingOf(request, self.location.origin, precached);
  if (handling === "page") event.respondWith(page(request));
  else if (handling === "shell") event.respondWith(shellFile(request));
  else if (handling === "kept") event.respondWith(keptThing(request));
  // Anything else, and every request under /api/ or /kiwix/ that is not listed in rules.ts, goes to the server untouched.
});
