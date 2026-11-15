import { type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { allNav } from "./nav";
import { Sidebar } from "./sidebar";
import { Skeleton } from "./ui/misc";

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
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
      if (mod || event.altKey || isTyping(event.target)) return;
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

  // Move focus to the content on navigation so keyboard and screen-reader users land in the new screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every path change by design
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-page max-md:flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--z-tooltip) focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-ink">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} onOpenSearch={() => setPaletteOpen(true)} notesTree={notesTree} />
      <MobileNav onOpenSearch={() => setPaletteOpen(true)} />
      <main id="content" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNewPage={onNewPage} />
    </div>
  );
}
