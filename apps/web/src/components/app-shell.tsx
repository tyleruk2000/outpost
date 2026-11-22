import { Component, lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { AccessNotice } from "@/features/access/access-notice";
import { BoardToasts } from "@/features/board/toasts";
import { ClockNotice } from "@/features/device/clock-notice";
import { ReachNotice } from "@/features/kept/reach";
import { RecordingIndicator } from "@/features/maps/recording/indicator";
import { notify } from "@/lib/notify";
import { MobileNav } from "./mobile-nav";
import { RouteAnnouncer } from "./route-announcer";
import { allNav } from "./nav";
import { ScreenErrorBoundary } from "./screen-error";
import { Sidebar } from "./sidebar";
import { Skeleton } from "./ui/misc";
import { UpdateNotice } from "./update-notice";

/**
 * Quick search is fetched the first time it is opened, not with every page of the app.
 * Made afresh for each attempt, because a fetch that failed stays failed in the one it
 * was made for.
 */
const fetchPalette = () => lazy(() => import("./command-palette").then((module) => ({ default: module.CommandPalette })));

/**
 * Quick search sits outside the screen's own error boundary, so a failure to fetch it (the
 * server was updated since this tab was opened, or cannot be reached) would otherwise take
 * the whole app with it and leave a blank window. Here it only fails to open.
 */
class PaletteBoundary extends Component<{ onFailed: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onFailed();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Whether a key pressed here belongs to what has focus, not to the app's shortcuts: a field
 * being typed in, or an open menu, list or dialog, whose letters choose an item by its name
 * ("g" then "s" in a menu must not leave the screen).
 */
export function isTyping(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  if (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) return true;
  return element.closest('[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [role="textbox"]') !== null;
}

function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-[70rem] px-5 pt-12 md:px-10" aria-busy>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-4 h-4 w-96 max-w-full" />
      <div className="mt-10 grid gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    </div>
  );
}

export function AppShell({ notesTree, onNewPage }: { notesTree?: ReactNode; onNewPage: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Kept mounted once opened, so that it closes with its animation and opens at once the next time.
  const [paletteWanted, setPaletteWanted] = useState(false);
  if (paletteOpen && !paletteWanted) setPaletteWanted(true);
  const [Palette, setPalette] = useState(fetchPalette);
  const [paletteAttempt, setPaletteAttempt] = useState(0);
  const paletteFailed = useCallback(() => {
    setPaletteOpen(false);
    setPaletteWanted(false);
    setPalette(fetchPalette);
    setPaletteAttempt((attempt) => attempt + 1);
    notify.error("Quick search could not be loaded. Try it again, or reload the page.");
  }, []);
  // Read by the key handler, which is set up once.
  const paletteOpenNow = useRef(paletteOpen);
  paletteOpenNow.current = paletteOpen;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("outpost.sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const pendingGo = useRef<number | undefined>(undefined);
  const mainRef = useRef<HTMLElement>(null);

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      try {
        localStorage.setItem("outpost.sidebar", current ? "open" : "collapsed");
      } catch {
        // Storage can be unavailable; the choice then lasts for this visit.
      }
      return !current;
    });
  }, []);

  // Keyboard: ⌘K palette, ⌘\ sidebar, "/" search, and "g" then a letter to go somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A focused control that already used the key (the editor's link shortcut) keeps it.
      if (event.defaultPrevented) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (mod && event.key === "\\") {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      // With quick search open, or on its way, letters are for it and not for "g" then a letter.
      if (mod || event.altKey || paletteOpenNow.current || isTyping(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (pendingGo.current !== undefined) {
        window.clearTimeout(pendingGo.current);
        pendingGo.current = undefined;
        const item = allNav.find((entry) => entry.key === event.key.toLowerCase());
        if (item) {
          event.preventDefault();
          navigate(item.to);
        }
        return;
      }
      if (event.key === "g") {
        pendingGo.current = window.setTimeout(() => {
          pendingGo.current = undefined;
        }, 900);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, toggleSidebar]);

  // A new screen starts at its top. At desktop width the content area scrolls; on a phone
  // the window does, and a screen opened from a scrolled list used to open part-way down.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every path change by design
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
    // Not when the address names a place on the screen ("…#backup"): the screen goes there itself.
    const page = document.scrollingElement;
    if (page && !location.hash) page.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-page max-md:flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--z-tooltip) focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-ink"
      >
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} onOpenSearch={() => setPaletteOpen(true)} notesTree={notesTree} />
      <MobileNav onOpenSearch={() => setPaletteOpen(true)} />
      <main id="content" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <UpdateNotice />
        <ClockNotice />
        <AccessNotice />
        <RecordingIndicator />
        <ReachNotice />
        <BoardToasts />
        <ScreenErrorBoundary path={location.pathname}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </ScreenErrorBoundary>
      </main>
      <RouteAnnouncer />
      {paletteWanted ? (
        <PaletteBoundary key={paletteAttempt} onFailed={paletteFailed}>
          <Suspense fallback={null}>
            <Palette open={paletteOpen} onOpenChange={setPaletteOpen} onNewPage={onNewPage} />
          </Suspense>
        </PaletteBoundary>
      ) : null}
    </div>
  );
}
