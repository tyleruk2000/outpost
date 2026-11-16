/**
 * Knowing whether the server is in reach, and what the app does when it is not.
 *
 * Outpost runs at home and is used from a phone. Carried out of the house, the phone
 * keeps the app (the service worker holds a copy) but loses the server. The app then
 * shows what was kept on the phone, read-only, and says so in one calm line.
 *
 * A screen that is open when reach is lost is left exactly as it is: someone may be
 * half-way through a note, and the notes editor already holds unsaved changes until
 * the server answers. The switch to the kept copies happens on the next move to
 * another screen, and switches back by itself when the server answers again.
 */
import { WifiOff } from "lucide-react";
import { createContext, lazy, type ReactNode, Suspense, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useServerConnection, useServerEvent } from "@/lib/events";
import { checkAreas } from "./area";
import { DEVICE } from "./device";
import { refreshKept } from "./keep";
import { canOpenOutOfReach, tellWorkerReach } from "./register";
import { keepingSupported, listKept } from "./store";

const OutOfReachApp = lazy(() => import("./out-of-reach-app"));

/** How long a question to the server may go unanswered before it counts as out of reach. */
export const PROBE_TIMEOUT_MS = 4_000;

/** Asks the server whether it is there. Never throws. */
export async function probeServer(): Promise<boolean> {
  try {
    const response = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

/** The app as it is with the server out of reach. Loaded when needed; its files are kept with the app. */
export function OutOfReach({ onReachable }: { onReachable: () => void }) {
  return (
    <Suspense fallback={null}>
      <OutOfReachApp onReachable={onReachable} />
    </Suspense>
  );
}

const ReachContext = createContext<{ lost: boolean }>({ lost: false });

/** Brings kept copies up to date. Quiet: a failure here is the server going away again, which the app already shows. */
async function freshen(): Promise<void> {
  if (!keepingSupported()) return;
  try {
    const items = await listKept();
    if (items.length === 0) return;
    await refreshKept();
    await checkAreas(items.filter((item) => item.kind === "area"));
  } catch {
    // Tried again the next time the server is in reach or something changes.
  }
}

/**
 * Wraps the app's screens. While the server is in reach it only keeps the kept copies
 * fresh. When reach is lost, the next move to another screen shows the kept copies instead.
 */
export function ReachGate({ children }: { children: ReactNode }) {
  const connected = useServerConnection();
  const location = useLocation();
  const [lost, setLost] = useState(false);
  /** The screen that was open when reach was lost; it stays as it is. */
  const [lostAt, setLostAt] = useState<string | null>(null);
  const [away, setAway] = useState(false);

  // The live connection dropping is the first sign; a plain question to the server settles it.
  useEffect(() => {
    if (connected) {
      setLost(false);
      return;
    }
    let stopped = false;
    let timer: number | undefined;
    const check = async () => {
      const reachable = await probeServer();
      if (stopped) return;
      setLost(!reachable);
      timer = window.setTimeout(check, 5_000);
    };
    timer = window.setTimeout(check, 1_200);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [connected]);

  const key = useRef(location.key);
  key.current = location.key;
  useEffect(() => {
    tellWorkerReach(!lost);
    if (lost) {
      setLostAt((current) => current ?? key.current);
    } else {
      setLostAt(null);
      setAway(false);
    }
  }, [lost]);

  const leaving = lost && lostAt !== null && location.key !== lostAt;
  useEffect(() => {
    if (leaving) setAway(true);
  }, [leaving]);

  // Kept copies follow the server while it is in reach: at the start, when it comes back, and when something changes.
  const pending = useRef<number | undefined>(undefined);
  const soon = (delay: number) => {
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void freshen(), delay);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when reach changes, not when the helper does
  useEffect(() => {
    if (!lost) soon(1_500);
    return () => window.clearTimeout(pending.current);
  }, [lost]);
  useServerEvent("notes.changed", () => soon(3_000));
  useServerEvent("maps.changed", () => soon(3_000));

  if (lost && (away || leaving) && canOpenOutOfReach()) {
    return <OutOfReach onReachable={() => setLost(false)} />;
  }
  return <ReachContext.Provider value={{ lost: lost && canOpenOutOfReach() }}>{children}</ReachContext.Provider>;
}

/**
 * The line shown above a screen that was open when the server went out of reach. It
 * appears only where the app can go on without the server; elsewhere the status line at
 * the foot of the sidebar already says the server is not responding.
 */
export function ReachNotice() {
  const { lost } = useContext(ReachContext);
  if (!lost) return null;
  return (
    <div role="status" className="flex items-start gap-3 border-b border-border bg-surface px-4 py-2.5 text-small text-ink md:px-6">
      <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
      <p className="min-w-0">
        <span className="font-medium">The server is out of reach.</span> This screen stays as it is. Anything else you open now comes from
        what is kept on this {DEVICE}.
      </p>
    </div>
  );
}
