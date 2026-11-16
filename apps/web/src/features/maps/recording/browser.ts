/**
 * The recorder as it runs in a browser: the one recorder for the page, wired to the
 * real geolocation, storage, screen wake lock and server.
 *
 * There is one recorder for the whole app, not one for the Maps screen, so that
 * looking something up in the library half-way up a hill does not end the recording.
 */
import type { TrackDto } from "@outpost/shared";
import { useSyncExternalStore } from "react";
import { ApiError, api } from "@/lib/api";
import { Recorder, type RecorderEnv, type RecorderSnapshot, SendFailure } from "./recorder";
import { openRecordingStore } from "./store";

const TAB_LOCK = "outpost.maps.recording";

/**
 * Whether a failed save is worth sending again as it is. Not reaching the server at
 * all, an error of the server's own, and "busy, try again" all pass; a refusal of the
 * recording itself does not, however often it is sent.
 */
export function failureOf(error: unknown): SendFailure {
  if (error instanceof ApiError) {
    const passing = error.isUnreachable || error.status >= 500 || error.status === 408 || error.status === 409 || error.status === 429;
    return new SendFailure(error.message, passing);
  }
  return new SendFailure(error instanceof Error ? error.message : "The recording could not be sent.", true);
}

function browserEnv(): RecorderEnv {
  const locks = typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : null;
  const wakeLock = typeof navigator !== "undefined" && "wakeLock" in navigator ? navigator.wakeLock : null;
  return {
    openStore: () => openRecordingStore(),
    geolocation: typeof navigator !== "undefined" && "geolocation" in navigator ? navigator.geolocation : null,
    secure: () => window.isSecureContext,
    now: () => Date.now(),
    random: (count) => crypto.getRandomValues(new Uint8Array(count)),
    visible: () => document.visibilityState === "visible",
    onVisibility: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    onOnline: (listener) => {
      window.addEventListener("online", listener);
      return () => window.removeEventListener("online", listener);
    },
    requestWakeLock: wakeLock ? () => wakeLock.request("screen") : null,
    tabLock: locks
      ? {
          hold: () =>
            new Promise((resolve) => {
              locks
                .request(TAB_LOCK, { ifAvailable: true }, (lock) => {
                  if (!lock) {
                    resolve(null);
                    return undefined;
                  }
                  // The lock is held for as long as this promise is unsettled; closing the tab lets it go too.
                  return new Promise<void>((release) => resolve(release));
                })
                .catch(() => resolve(null));
            }),
          heldElsewhere: async () => ((await locks.query()).held ?? []).some((lock) => lock.name === TAB_LOCK),
        }
      : null,
    send: async ({ id, name, color, gpx }) => {
      const form = new FormData();
      // Fields go before the file: the server reads the parts in order.
      form.append("name", name);
      form.append("color", color);
      form.append("file", new Blob([gpx], { type: "application/gpx+xml" }), "recording.gpx");
      try {
        return (await api.put<{ track: TrackDto }>(`/api/maps/recordings/${id}`, form)).track;
      } catch (error) {
        throw failureOf(error);
      }
    },
    setTimeout: (run, milliseconds) => window.setTimeout(run, milliseconds),
    clearTimeout: (id) => window.clearTimeout(id),
  };
}

let recorder: Recorder | undefined;

/** The page's one recorder, made the first time it is asked for. */
export function getRecorder(): Recorder {
  recorder ??= new Recorder(browserEnv());
  return recorder;
}

export function useRecorder(): { recorder: Recorder; state: RecorderSnapshot } {
  const current = getRecorder();
  const state = useSyncExternalStore(current.subscribe, current.getSnapshot);
  return { recorder: current, state };
}
