/**
 * Registers the service worker and settles which build of it is in charge.
 *
 * A new build of Outpost brings a new worker. The browser installs it beside the old
 * one and, left alone, would keep the old one in charge until every tab had closed,
 * which on a phone's Home Screen can be never. So a page that is itself running the
 * new build tells the waiting worker to take over. A tab still running the old build
 * says nothing, and keeps the worker and the files it was started with until it is
 * reloaded (the update notice asks for that).
 */
import { runningBuild } from "@/components/update-notice";
import type { WorkerMessage } from "@/sw/rules";

const say = (worker: ServiceWorker | null | undefined, message: WorkerMessage) => worker?.postMessage(message);

export function registerServiceWorker(): void {
  // In development there is no built worker, and over plain HTTP a browser has no service workers at all.
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  const build = runningBuild();
  if (!build) return;
  navigator.serviceWorker
    // The browser's own cache is never consulted for the worker script: a new build must be seen at once.
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => {
      if (!registration) return;
      const offer = (worker: ServiceWorker | null) => say(worker, { type: "activate", build });
      offer(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed") offer(installing);
        });
      });
    })
    .catch(() => {
      // Not registered (a private window, a blocked worker): the app works as before, without keeping.
    });
}

/** Tells the worker what this page has just learnt about the server, so kept copies are used at once, or no longer. */
export function tellWorkerReach(reachable: boolean): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  say(navigator.serviceWorker.controller, { type: "reach", reachable });
}

/**
 * True when this page was handed to the browser by the service worker's kept copy of
 * the app, or could have been: the app can then open with the server out of reach.
 */
export function canOpenOutOfReach(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && navigator.serviceWorker.controller !== null;
}
