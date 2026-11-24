import { Search, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Component, lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { AccessNotice } from "@/features/access/access-notice";
import { BoardToasts } from "@/features/board/toasts";
import { ClockNotice } from "@/features/device/clock-notice";
import { ReachNotice } from "@/features/kept/reach";
import { RecordingIndicator } from "@/features/maps/recording/indicator";
import { notify } from "@/lib/notify";
import { TABLET, useMediaQuery } from "@/lib/use-media-query";
import { ConnectionNotice } from "./connection-notice";
import { MobileNav } from "./mobile-nav";
import { allNav } from "./nav";
import { RouteAnnouncer } from "./route-announcer";
import { ScreenErrorBoundary } from "./screen-error";
import { useScrollMemory } from "./scroll-memory";
import { Sidebar } from "./sidebar";
import { Skeleton, Spinner } from "./ui/misc";
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

/** After this long still loading, quick search says so and what to do. */
export const PALETTE_SLOW_MS = 15_000;

/**
 * Quick search's own frame while its code is fetched the first time: a press on the search
 * icon is answered at once, where before nothing at all happened until the code came (and
 * on an iPhone whose connections to the server were all taken, it never came).
 */
function PaletteLoading({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setSlow(true), PALETTE_SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay data-[state=open]:animate-fade" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12dvh] left-1/2 z-(--z-dialog) w-[calc(100vw-1.5rem)] max-w-[40rem] -translate-x-1/2 overflow-hidden rounded-panel border border-border bg-raised shadow-dialog focus:outline-none data-[state=open]:animate-enter max-md:top-3"
        >
          <Dialog.Title className="sr-only">Search and go to</Dialog.Title>
          <div className="flex h-13 items-center gap-3 border-b border-border px-4">
            <Search aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
            <p role="status" className="flex-1 text-body text-ink-muted">
              {slow ? "Quick search is taking a long time to load." : "Loading quick search…"}
            </p>
            {slow ? null : <Spinner label="Loading" delay />}
            <Dialog.Close
              aria-label="Close quick search"
              className="-mr-2 grid size-11 shrink-0 place-content-center rounded-control text-ink-muted hover:text-ink"
            >
              <X aria-hidden className="size-5" strokeWidth={1.6} />
            </Dialog.Close>
          </div>
          {slow ? (
            <p className="px-4 py-3 text-small text-ink-muted">
              The server may be busy, or this browser may have many Outpost tabs open. Close the ones not in use, then close this and try
              again.
            </p>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
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
  const tabletNow = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  // On a tablet's width the sidebar is a rail of icons, and the whole of it opens over the page when asked for and
  // closes again on the next screen: beside the page it left a map 160 px wide at 768 px. The choice kept on this
  // device (folded or not) is for wider screens.
  const tablet = useMediaQuery(TABLET);
  tabletNow.current = tablet;
  const [drawer, setDrawer] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closed on every change of screen, by design
  useEffect(() => setDrawer(false), [location.pathname, tablet]);

  const toggleSidebar = useCallback(() => {
    if (tabletNow.current) {
      setDrawer((open) => !open);
      return;
    }
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

  // A new screen starts at its top; Back and Forward return to where a screen was left (components/scroll-memory.ts).
  useScrollMemory();

  return (
    <div className="flex min-h-dvh bg-page max-md:flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--z-tooltip) focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-ink"
      >
        Skip to content
      </a>
      <Sidebar
        collapsed={tablet ? !drawer : collapsed}
        over={tablet && drawer}
        onClose={() => setDrawer(false)}
        onToggle={toggleSidebar}
        onOpenSearch={() => {
          setDrawer(false);
          setPaletteOpen(true);
        }}
        notesTree={notesTree}
      />
      <MobileNav onOpenSearch={() => setPaletteOpen(true)} />
      <main id="content" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <ConnectionNotice />
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
          <Suspense fallback={<PaletteLoading open={paletteOpen} onOpenChange={setPaletteOpen} />}>
            <Palette open={paletteOpen} onOpenChange={setPaletteOpen} onNewPage={onNewPage} />
          </Suspense>
        </PaletteBoundary>
      ) : null}
    </div>
  );
}
