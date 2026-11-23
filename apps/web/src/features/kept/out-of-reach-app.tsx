/**
 * The app while the server is out of reach: the same spine and the same pages, holding
 * only what can be true without a server. Kept things open; everything else says where
 * it is instead of trying to load.
 */
import { ownValue } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Map as MapIcon, PenLine, RefreshCw, WifiOff } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, Route, Routes, useLocation } from "react-router";
import { LogoMark } from "@/components/logo";
import { useMobileNavHeight } from "@/components/mobile-nav-height";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { PageIcon } from "@/features/notes/page-bits";
import { cn } from "@/lib/utils";
import { DEVICE, DeviceIcon, ON_THIS_DEVICE } from "./device";
import KeptNoteScreen from "./kept-note-screen";
import KeptPage from "./kept-page";
import { everyWhileShown, probeServer } from "./reach";
import { tellWorkerReach } from "./register";
import { useKept } from "./store";

const KeptMapScreen = lazy(() => import("./kept-map-screen"));
const KeptPlanScreen = lazy(() => import("./kept-plan-screen"));
const KeptMedicalScreen = lazy(() => import("./kept-medical-screen"));
const WriteScreen = lazy(() => import("./write-screen"));
const KeptDrillScreen = lazy(() => import("./kept-drill-screen"));

/** On the server's own computer "out of reach" can only mean the server is not running, and the line says what to do about that. */
const ON_THE_SERVER_ITSELF = typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

const NAV = [
  { to: "/kept", label: ON_THIS_DEVICE, icon: DeviceIcon },
  { to: "/maps", label: "Maps", icon: MapIcon },
  { to: "/kept/write", label: "Write", icon: PenLine },
];

const spineLink =
  "flex h-9 items-center gap-3 rounded-control px-2.5 text-[0.9375rem] text-spine-ink-muted transition-colors duration-150 hover:bg-spine-raised hover:text-spine-ink focus-visible:outline-spine-ink";
const tab =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[0.6875rem] font-medium text-ink-muted aria-[current=page]:text-primary";

/** Screens that live on the server, by the first part of their address. */
const SCREENS: Record<string, string> = {
  search: "Search",
  explore: "Explore",
  library: "The library",
  notes: "The list of your pages",
  import: "Importing",
  downloads: "Downloads and tasks",
  storage: "Storage",
  settings: "Settings",
  prepare: "Preparedness",
  tools: "Tools",
};

function NeedsServer() {
  const { pathname } = useLocation();
  const screen = ownValue(SCREENS, pathname.split("/")[1] ?? "") ?? "This screen";
  return (
    <Page width="reading">
      <h1 className="font-title text-title text-ink">{screen} needs the server</h1>
      <p className="mt-2 max-w-[60ch] text-ink-muted">
        It is on the Outpost server, which is out of reach from here, and it is not something that is kept on this {DEVICE}. What you chose
        to keep still opens.
      </p>
      <Button asChild variant="primary" className="mt-5">
        <Link to="/kept">See what is kept</Link>
      </Button>
    </Page>
  );
}

function Shell({ checking, onCheck }: { checking: boolean; onCheck: () => void }) {
  const kept = useKept();
  const pages = (kept ?? []).filter((item) => item.kind === "note");
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  // The bar's height for the map, which ends on it (--mobile-nav-height, as the app's own bar says it).
  const bar = useRef<HTMLElement>(null);
  useMobileNavHeight(bar);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every path change by design
  useEffect(() => {
    main.current?.scrollTo?.({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-page max-md:flex-col">
      <aside aria-label="Main" className="sticky top-0 z-(--z-nav) hidden h-dvh w-64 shrink-0 flex-col bg-spine text-spine-ink md:flex">
        <div className="flex h-14 items-center px-3">
          <Link to="/kept" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-1.5 py-1 focus-visible:outline-spine-ink">
            <LogoMark />
            <span className="font-title text-[1.1875rem] tracking-[-0.01em]">Outpost</span>
          </Link>
        </div>
        <nav aria-label={`Kept on this ${DEVICE}`} className="grid gap-0.5 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  spineLink,
                  (isActive || (item.to === "/kept" && pathname === "/")) &&
                    "bg-spine-active font-medium text-spine-ink hover:bg-spine-active",
                )
              }
            >
              <item.icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.6} />
              <span className="flex-1 truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="scroll-quiet mt-3 min-h-0 flex-1 overflow-y-auto px-3 [scrollbar-color:var(--spine-border)_transparent]">
          {pages.length > 0 ? (
            <nav aria-label="Kept pages" className="grid gap-0.5">
              <p className="px-2.5 pb-1 text-small text-spine-ink-muted">Kept pages</p>
              {pages.map((page) => (
                <NavLink
                  key={page.id}
                  to={`/notes/${page.id}`}
                  className={({ isActive }) =>
                    cn(spineLink, "h-8 text-small", isActive && "bg-spine-active text-spine-ink hover:bg-spine-active")
                  }
                >
                  <PageIcon icon={page.icon} />
                  <span className="truncate">{page.title.trim() || "Untitled"}</span>
                </NavLink>
              ))}
            </nav>
          ) : null}
        </div>
        <div className="border-t border-spine-border px-3 py-2">
          <p className="flex items-center gap-3 px-2.5 py-2 text-small text-spine-ink-muted">
            <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-spine-ink-muted/60" />
            Server out of reach
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-(--z-nav) flex h-13 items-center gap-2 bg-spine px-4 text-spine-ink md:hidden">
        <Link to="/kept" className="flex flex-1 items-center gap-2.5">
          <LogoMark />
          <span className="font-title text-lead">Outpost</span>
        </Link>
      </header>
      <nav
        ref={bar}
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-(--z-nav) flex border-t border-border bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end className={tab}>
            <item.icon aria-hidden className="size-[22px]" strokeWidth={1.6} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* A column, so that the map can take exactly the height the line above it leaves. */}
      <main id="content" ref={main} tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2.5 text-small text-ink md:px-6"
        >
          <WifiOff aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
          <p className="min-w-0 flex-1 basis-56">
            <span className="font-medium">The server is out of reach.</span> Showing what is kept on this {DEVICE}. What is written or
            changed here is sent when it is back in reach.
            {ON_THE_SERVER_ITSELF
              ? " This is the computer Outpost runs on, so the server is stopped or still starting: give it a few seconds, or check that the Outpost service or container is running."
              : null}
          </p>
          <Button size="sm" loading={checking} onClick={onCheck}>
            <RefreshCw /> Try again
          </Button>
        </div>
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-[70rem] px-5 pt-12 md:px-10" aria-busy>
              <Skeleton className="h-8 w-56" />
              <Skeleton className="mt-4 h-4 w-96 max-w-full" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export default function OutOfReachApp({ onReachable }: { onReachable: () => void }) {
  // Nothing here asks the server for anything: a query a shared component declares stays idle instead of failing.
  const client = useMemo(() => new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }), []);
  const [checking, setChecking] = useState(false);
  const back = useRef(onReachable);
  back.current = onReachable;

  const check = useCallback(async (shown: boolean) => {
    if (shown) setChecking(true);
    const reachable = await probeServer();
    if (shown) setChecking(false);
    // Said each time: the worker forgets after a while, and would then make every kept tile wait for the server again.
    tellWorkerReach(reachable);
    if (reachable) back.current();
  }, []);

  // The server is asked again now and then while the app is in front (never while it is hidden),
  // and at once when the device says it has a network again or the app comes back to the front.
  useEffect(() => {
    tellWorkerReach(false);
    const stop = everyWhileShown(() => void check(false), 10_000);
    const now = () => {
      if (document.visibilityState === "visible") void check(false);
    };
    window.addEventListener("online", now);
    return () => {
      stop();
      window.removeEventListener("online", now);
    };
  }, [check]);

  return (
    <QueryClientProvider client={client}>
      <Routes>
        <Route element={<Shell checking={checking} onCheck={() => void check(true)} />}>
          <Route index element={<KeptPage outOfReach />} />
          <Route path="kept" element={<KeptPage outOfReach />} />
          <Route path="notes/:id" element={<KeptNoteScreen />} />
          <Route path="maps" element={<KeptMapScreen />} />
          <Route path="prepare/plans/:id/use" element={<KeptPlanScreen />} />
          <Route path="prepare/medical" element={<KeptMedicalScreen />} />
          <Route path="kept/write" element={<WriteScreen />} />
          <Route path="prepare/offline-drill" element={<KeptDrillScreen />} />
          <Route path="*" element={<NeedsServer />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}
