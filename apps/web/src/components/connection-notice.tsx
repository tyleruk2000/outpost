/**
 * The line that says Outpost's server cannot be reached, at the top of every screen, and the
 * lamp on More that says the same on a phone.
 *
 * It was only in the status line at the foot of the sidebar, which a phone does not show:
 * with the server stopped, nothing on a phone's screen changed for as long as anyone
 * watched (owner's review, 24 Nov 2026). The live stream dropping (lib/events.tsx), or a
 * request that had no answer at all (lib/api.ts), is the first sign; a plain question to the
 * server settles it, so a restart that takes a second does not flash the line. While the
 * line is shown the server is asked again every few seconds, and once it answers the live
 * stream is opened at once and what is on screen is fetched again: nothing needs pressing.
 *
 * Where the app can go on without the server (a phone that keeps things, with the service
 * worker in charge) the out-of-reach notice of features/kept says it instead.
 */
import { WifiOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { probeServer } from "@/features/kept/reach";
import { canOpenOutOfReach } from "@/features/kept/register";
import { UNREACHABLE_EVENT } from "@/lib/api";
import { useReconnect, useServerConnection } from "@/lib/events";
import { cn } from "@/lib/utils";
import { ownsTopBar } from "./shell-bars";
import { Button } from "./ui/button";

/** How long the stream may be down before the server is asked whether it is there. */
export const ASK_AFTER_MS = 1_500;
/** How often a server that did not answer is asked again while the line is shown. */
export const ASK_EVERY_MS = 5_000;

// One answer for the notice and the lamp on More, which are drawn in different places.
let down = false;
const listeners = new Set<() => void>();
function setDown(next: boolean) {
  if (next === down) return;
  down = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether the server has been found not to answer (and not yet found answering again). */
export function useServerDown(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => down,
    () => false,
  );
}

export function ConnectionNotice() {
  const connected = useServerConnection();
  const reconnect = useReconnect();
  const { pathname } = useLocation();
  const isDown = useServerDown();
  // A request with no answer while the stream still looked open: a server that is stuck rather than stopped.
  const [suspect, setSuspect] = useState(false);
  const [asking, setAsking] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const heard = () => setSuspect(true);
    window.addEventListener(UNREACHABLE_EVENT, heard);
    return () => window.removeEventListener(UNREACHABLE_EVENT, heard);
  }, []);

  useEffect(() => {
    if (connected && !suspect) {
      setDown(false);
      return;
    }
    let stopped = false;
    let timer: number | undefined;
    const ask = async () => {
      timer = undefined;
      if (document.visibilityState !== "visible") return;
      const answers = await probeServer();
      if (stopped) return;
      setChecking(false);
      if (answers) {
        setDown(false);
        setSuspect(false);
        reconnect();
      } else {
        setDown(true);
      }
      timer = window.setTimeout(ask, ASK_EVERY_MS);
    };
    const shown = () => {
      if (document.visibilityState === "visible" && timer === undefined) void ask();
    };
    timer = window.setTimeout(ask, asking > 0 ? 0 : ASK_AFTER_MS);
    document.addEventListener("visibilitychange", shown);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", shown);
    };
  }, [connected, suspect, reconnect, asking]);

  useEffect(() => () => setDown(false), []);

  // The same box whether shown or not, so that its words are read out when they appear.
  if (!isDown || canOpenOutOfReach()) return <div role="status" className="sr-only" />;
  return (
    <div
      role="status"
      data-sticky-top
      className={cn(
        "z-(--z-sticky) flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-4 py-2 text-small text-ink md:px-6",
        !ownsTopBar(pathname) && "sticky top-13 md:top-0",
      )}
    >
      <WifiOff aria-hidden className="size-4 shrink-0 text-danger" strokeWidth={1.8} />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Can't reach Outpost.</span> What is on screen may be out of date. It comes back by itself when the
        server answers.
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="-my-1"
        loading={checking}
        onClick={() => {
          setChecking(true);
          setAsking((count) => count + 1);
        }}
      >
        Try now
      </Button>
    </div>
  );
}
