/**
 * Names each screen for the browser and for a screen reader. The tab, the history list and a
 * screen reader's list of windows read "Settings / Outpost", not "Outpost" on every screen
 * (WCAG 2.4.2); and moving to another screen is said aloud, politely, by the name of its
 * heading, since in an app of one page nothing else tells a person who cannot see it that the
 * screen changed. The name is the screen's own top-level heading, read once it has been drawn.
 *
 * A screen that names the tab itself (a document, the reader) keeps its name: what it set is
 * neither "Outpost" nor the name set here, and is left alone.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

export const APP_NAME = "Outpost";

/** How long the screen may go on changing before its heading is read: it is often drawn in steps. */
const SETTLE_MS = 120;

export function RouteAnnouncer({ within = "content" }: { within?: string }) {
  const { pathname } = useLocation();
  const [said, setSaid] = useState("");
  const firstScreen = useRef(true);
  const setHere = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again for each screen, which is what the address names
  useEffect(() => {
    const area = document.getElementById(within);
    if (!area) return;
    // The first screen is announced by the browser as the page loads; only moves after it are said here.
    const announce = !firstScreen.current;
    firstScreen.current = false;
    let announced = false;
    setSaid("");
    // The last screen's name does not stay on a screen with no heading of its own.
    if (document.title === setHere.current) document.title = APP_NAME;
    setHere.current = APP_NAME;
    let timer: number | undefined;
    const read = () => {
      timer = undefined;
      const name = area.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim();
      if (!name) return;
      const wanted = `${name} / ${APP_NAME}`;
      const current = document.title;
      if (current === APP_NAME || current === setHere.current) {
        if (current !== wanted) document.title = wanted;
        setHere.current = wanted;
      }
      if (announce && !announced) {
        announced = true;
        setSaid(name);
      }
    };
    const watch = new MutationObserver(() => {
      if (timer === undefined) timer = window.setTimeout(read, SETTLE_MS);
    });
    watch.observe(area, { childList: true, subtree: true, characterData: true });
    timer = window.setTimeout(read, SETTLE_MS);
    return () => {
      watch.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname, within]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-route-announcer>
      {said}
    </div>
  );
}
