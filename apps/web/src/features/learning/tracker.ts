/**
 * What the reader records of where a learner got to (docs/learning.md).
 *
 * The reader is told which page of an archive is on show by the archive's page itself
 * (the proxy's bridge script); this keeps the visit to that page: how long it has been in
 * view while the tab is visible, counted on the device. It writes to the server:
 *
 * - when the page is left (another page, another learner, the reader closed),
 * - when the tab is hidden (a phone locked, another tab, the browser closed),
 * - and at most once a minute while one page stays on show in a visible tab.
 *
 * Never per second. Nothing runs while no archive page is on show, while the tab is
 * hidden, while recording is off on this device, or before anyone has said who is
 * learning: then nothing is written at all.
 */
import { TOPIC_LINKS_MAX } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { postTopic, postVisit } from "./data";
import { useLearningDevice } from "./device";

/** How often a page that stays on show is written: once a minute, and only while the tab is visible. */
export const WRITE_EVERY_MS = 60_000;
/** A video counts as watched when this share of it was played. */
export const WATCHED_SHARE = 0.9;

interface Visit {
  path: string;
  title: string;
  /** Milliseconds in view not yet written. */
  ms: number;
  /** When it came into view, while it is in view. */
  since: number | null;
  /** Something has been written for this visit: the first write says the page was opened. */
  written: boolean;
}

export interface LearningTracker {
  /** Who is recorded, or null when nothing is (no one chosen, or recording off). */
  learner: string | null;
  /** The page on show and its title. */
  page: { path: string; title: string } | null;
  /** The page on show is the one the reader was told about. */
  shown(path: string, title: string): void;
  /** The page lists these other pages of the archive; `home` when it is the archive's first page. */
  listed(path: string, links: string[], home: boolean): void;
  /** A video on the page played to its end, with the share of it that was played. */
  ended(path: string, played: number): boolean;
}

/** Counts the time since a visit came into view; it stays in view. */
function settle(current: Visit | null, at = performance.now()): void {
  if (current?.since != null) {
    current.ms += at - current.since;
    current.since = at;
  }
}

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

export function useLearningTracker(collectionId: string, active: boolean): LearningTracker {
  const device = useLearningDevice();
  const learner = active && device.recording && device.learner !== null ? device.learner : null;
  const client = useQueryClient();
  const visit = useRef<Visit | null>(null);
  const who = useRef<string | null>(learner);
  const listedOnce = useRef(new Set<string>());
  const [page, setPage] = useState<{ path: string; title: string } | null>(null);
  const [inView, setInView] = useState(visible);

  /** Writes what is not yet written for the page on show, under whoever it was being recorded for. */
  const flush = useCallback(
    (keepalive = false) => {
      const current = visit.current;
      const learnerNow = who.current;
      if (!current || learnerNow === null) return;
      settle(current);
      const seconds = Math.floor(current.ms / 1000);
      if (seconds === 0 && current.written) return;
      current.ms -= seconds * 1000;
      const opened = !current.written;
      current.written = true;
      void postVisit({ learner: learnerNow, collectionId, path: current.path, title: current.title, seconds, opened }, keepalive).then(
        (ok) => {
          if (ok) void client.invalidateQueries({ queryKey: ["learning", "progress"], refetchType: "none" });
        },
      );
    },
    [collectionId, client],
  );

  // Another learner chosen, or recording turned off: what was counted goes to the one it was counted for.
  useEffect(() => {
    if (who.current === learner) return;
    flush();
    who.current = learner;
    const current = visit.current;
    if (current) {
      current.ms = 0;
      current.since = visible() ? performance.now() : null;
      current.written = false;
    }
  }, [learner, flush]);

  // The tab hidden or shown: time counts only while it is visible, and hiding it writes.
  useEffect(() => {
    const onVisibility = () => {
      const now = visible();
      const current = visit.current;
      if (!now) {
        settle(current);
        if (current) current.since = null;
        flush(true);
      } else if (current) {
        current.since = performance.now();
      }
      setInView(now);
    };
    const onPageHide = () => flush(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flush]);

  // Once a minute while a page stays on show, the tab is visible and someone is being recorded.
  useEffect(() => {
    if (!inView || learner === null || page === null) return;
    const timer = window.setInterval(() => flush(), WRITE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [inView, learner, page, flush]);

  // The reader closed, or another archive opened in it: the page is left.
  useEffect(
    () => () => {
      flush(true);
      visit.current = null;
    },
    [flush],
  );

  // Not reading an archive's pages (still loading, a list of documents): no visit.
  useEffect(() => {
    if (active) return;
    flush();
    visit.current = null;
    setPage(null);
  }, [active, flush]);

  const shown = useCallback(
    (path: string, title: string) => {
      if (!active) return;
      const current = visit.current;
      if (current?.path === path) {
        if (title && title !== current.title) {
          current.title = title;
          setPage({ path, title });
        }
        return;
      }
      flush();
      visit.current = { path, title, ms: 0, since: visible() ? performance.now() : null, written: false };
      setPage({ path, title });
    },
    [active, flush],
  );

  const listed = useCallback(
    (path: string, links: string[], home: boolean) => {
      if (who.current === null || listedOnce.current.has(path)) return;
      listedOnce.current.add(path);
      // A page of more links than a list of lessons holds is an index; the first page is kept for what it shares with the rest.
      if (!home && (links.length < 2 || links.length > TOPIC_LINKS_MAX)) return;
      void postTopic({ collectionId, path, title: visit.current?.path === path ? visit.current.title : "", links, home });
    },
    [collectionId],
  );

  const ended = useCallback((path: string, played: number) => {
    return who.current !== null && visit.current?.path === path && played >= WATCHED_SHARE;
  }, []);

  return { learner, page, shown, listed, ended };
}
