import { ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useActiveJobs } from "@/lib/queries";
import { cn, modKey } from "@/lib/utils";
import { Lamp } from "./lamp";
import { LogoMark } from "./logo";
import { isAt, isInGroup, isOwnScreen, knowledgeNav, type NavItem, upkeepNav } from "./nav";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "./ui/menu";
import { Tooltip } from "./ui/misc";

const rowClass =
  "group flex h-9 items-center gap-3 rounded-control px-2.5 text-[0.9375rem] text-spine-ink-muted transition-colors duration-150 hover:bg-spine-raised hover:text-spine-ink focus-visible:outline-spine-ink";
const litClass = "bg-spine-active font-medium text-spine-ink hover:bg-spine-active";

/** What a person opened or closed, by the path of the screen the group is under. Kept on this device. */
const GROUPS_KEY = "outpost.sidebar.groups";

function readGroups(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Which groups of the sidebar are open. The group of the screen in view opens by itself each
 * time it is entered. Any other is as the person last left it on this device; one they never
 * touched is open when every group fits with room for the page tree, and closed when not.
 */
function useGroups(groups: NavItem[], pathname: string) {
  const [remembered, setRemembered] = useState(readGroups);
  const [here, setHere] = useState<boolean | undefined>(undefined);
  const [roomForAll, setRoomForAll] = useState(false);
  const current = groups.find((group) => isInGroup(pathname, group))?.to;

  // Entering a group opens it again, even if it was closed the last time it was left.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the group in view changes, by design
  useEffect(() => setHere(undefined), [current]);

  const isOpen = (to: string) => (to === current ? (here ?? true) : (remembered[to] ?? roomForAll));
  const toggle = (to: string) => {
    const next = !isOpen(to);
    if (to === current) setHere(next);
    setRemembered((previous) => {
      const updated = { ...previous, [to]: next };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(updated));
      } catch {
        // Storage can be unavailable; the choice then lasts for this visit.
      }
      return updated;
    });
  };
  return { isOpen, toggle, setRoomForAll };
}

/** Tall enough to keep the upkeep list at the foot of the sidebar while the rest scrolls. */
const TALL = "(min-height: 880px)";

function useTallWindow(): boolean {
  const [tall, setTall] = useState(() => window.matchMedia(TALL).matches);
  useEffect(() => {
    const media = window.matchMedia(TALL);
    const onChange = (event: MediaQueryListEvent) => setTall(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return tall;
}

/** Room left for the page tree when every group is open, below which groups start closed. About eight pages. */
const TREE_ROOM_REM = 16;

function ParentRow({
  item,
  label,
  lit,
  open,
  onToggle,
  trailing,
}: {
  item: NavItem;
  label: string;
  lit: boolean;
  open?: boolean;
  onToggle?: () => void;
  trailing?: ReactNode;
}) {
  const children = item.children ?? [];
  const listId = `spine-under-${item.to.replace(/\W+/g, "-")}`;
  return (
    <li>
      <div className="relative">
        <Link
          to={item.to}
          aria-current={lit ? "page" : undefined}
          className={cn(rowClass, lit && litClass, children.length > 0 && "pr-10")}
        >
          <item.icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.6} />
          <span className="flex-1 truncate">{label}</span>
          {trailing}
        </Link>
        {children.length > 0 ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-label={`${open ? "Hide" : "Show"} the screens under ${label}`}
            className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-content-center rounded-[4px] text-spine-ink-muted hover:bg-spine-raised hover:text-spine-ink focus-visible:outline-spine-ink"
          >
            <ChevronRight
              aria-hidden
              className={cn("size-4 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
              strokeWidth={1.8}
            />
          </button>
        ) : null}
      </div>
      {children.length > 0 && open ? (
        <ul id={listId} aria-label={`Under ${label}`} className="mt-0.5 mb-1 grid gap-0.5">
          {children.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                data-child
                className={({ isActive }) =>
                  cn(
                    // Indented so that the name starts under its parent's name.
                    "flex h-8 items-center rounded-control pr-2.5 pl-10 text-[0.875rem] text-spine-ink-muted transition-colors duration-150 hover:bg-spine-raised hover:text-spine-ink focus-visible:outline-spine-ink",
                    isActive && litClass,
                  )
                }
              >
                <span className="truncate">{child.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Collapsed to icons: a screen with others under it opens a short menu of them all, itself first. */
function IconRow({ item, label, lit, pathname }: { item: NavItem; label: string; lit: boolean; pathname: string }) {
  const navigate = useNavigate();
  const children = item.children ?? [];
  const icon = <item.icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.6} />;
  const inGroup = isInGroup(pathname, item);
  if (children.length === 0) {
    return (
      <li>
        <Tooltip label={label} side="right">
          <Link to={item.to} aria-current={lit ? "page" : undefined} className={cn(rowClass, "justify-center px-0", lit && litClass)}>
            {icon}
            <span className="sr-only">{label}</span>
          </Link>
        </Tooltip>
      </li>
    );
  }
  return (
    <li>
      <Menu>
        <Tooltip label={label} side="right">
          <MenuTrigger
            aria-label={`${label}, and the screens under it`}
            className={cn(rowClass, "relative w-full justify-center px-0 data-[state=open]:bg-spine-raised", inGroup && litClass)}
          >
            {icon}
            {/* Says, without a word, that a press opens more than one way on. */}
            <ChevronRight aria-hidden className="absolute right-0.5 size-3 opacity-70" strokeWidth={2} />
          </MenuTrigger>
        </Tooltip>
        <MenuContent side="right" align="start" sideOffset={10}>
          <MenuItem onSelect={() => navigate(item.to)} aria-current={lit ? "page" : undefined} className="font-medium">
            <item.icon /> {label}
          </MenuItem>
          <MenuSeparator />
          {children.map((child) => (
            <MenuItem key={child.to} onSelect={() => navigate(child.to)} aria-current={isAt(pathname, child.to) ? "page" : undefined}>
              <child.icon /> {child.label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </li>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  onOpenSearch,
  notesTree,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSearch: () => void;
  /** The page tree, shown under Notes when the spine is expanded. */
  notesTree?: ReactNode;
}) {
  const { pathname } = useLocation();
  const jobs = useActiveJobs();
  const downloads = jobs.data?.filter((job) => job.queue === "download" && job.state !== "paused").length ?? 0;
  const groups = useGroups([...knowledgeNav, ...upkeepNav], pathname);
  const { setRoomForAll } = groups;
  // On a tall window the upkeep list stays at the foot, as it always has. On a short one (a 13-inch laptop) it
  // scrolls with the rest, so that the screens and the page tree are not squeezed between it and the top.
  const tall = useTallWindow();

  // Whether every group fits open with room left for the page tree: measured, since text size and window height vary.
  const regionRef = useRef<HTMLDivElement>(null);
  const knowledgeRef = useRef<HTMLElement>(null);
  const upkeepRef = useRef<HTMLDivElement>(null);
  const measure = useCallback(() => {
    const region = regionRef.current;
    if (collapsed || !region || !knowledgeRef.current || !upkeepRef.current) return;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const shown = region.ownerDocument.querySelectorAll("aside [data-child]").length;
    const total = [...knowledgeNav, ...upkeepNav].reduce((sum, item) => sum + (item.children?.length ?? 0), 0);
    const childRow = 2.125 * rem;
    // The upkeep list is inside the scrolling part on a short window, and below it on a tall one.
    const needed =
      knowledgeRef.current.offsetHeight + (tall ? 0 : upkeepRef.current.offsetHeight) + (total - shown) * childRow + TREE_ROOM_REM * rem;
    setRoomForAll(region.clientHeight >= needed);
  }, [collapsed, setRoomForAll, tall]);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // The screen in view is never out of sight in the sidebar: on a short window Storage and Settings are below the page
  // tree. The tree arrives a moment after the screen, and pushes them down, so for a short while it is looked at again.
  const treeRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the screen changes, by design
  useEffect(() => {
    const show = () => regionRef.current?.querySelector<HTMLElement>('nav [aria-current="page"]')?.scrollIntoView?.({ block: "nearest" });
    show();
    if (typeof ResizeObserver === "undefined" || !treeRef.current) return;
    const watch = new ResizeObserver(show);
    watch.observe(treeRef.current);
    const done = window.setTimeout(() => watch.disconnect(), 1500);
    return () => {
      window.clearTimeout(done);
      watch.disconnect();
    };
  }, [pathname]);

  const row = (item: NavItem, trailing?: ReactNode) => {
    const label = item.sidebarLabel ?? item.label;
    const lit = isOwnScreen(pathname, item);
    return collapsed ? (
      <IconRow key={item.to} item={item} label={label} lit={lit} pathname={pathname} />
    ) : (
      <ParentRow
        key={item.to}
        item={item}
        label={label}
        lit={lit}
        open={groups.isOpen(item.to)}
        onToggle={() => groups.toggle(item.to)}
        trailing={trailing}
      />
    );
  };

  const upkeep = (
    <nav aria-label="Upkeep">
      <ul className="grid gap-0.5">
        {upkeepNav.map((item) =>
          row(
            item,
            item.to === "/downloads" && downloads > 0 ? (
              <span className="tabular rounded-full bg-lamp px-1.5 text-micro font-semibold text-[oklch(0.25_0.05_70)]">{downloads}</span>
            ) : null,
          ),
        )}
      </ul>
    </nav>
  );
  return (
    <aside
      aria-label="Main"
      className={cn(
        "sticky top-0 z-(--z-nav) hidden h-dvh shrink-0 flex-col bg-spine text-spine-ink transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[60px]" : "w-64",
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        {!collapsed ? (
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-1.5 py-1 focus-visible:outline-spine-ink">
            <LogoMark />
            <span className="font-title text-[1.1875rem] tracking-[-0.01em]">Outpost</span>
          </Link>
        ) : null}
        <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} shortcut={`${modKey} \\`} side="right">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="grid size-8 place-content-center rounded-control text-spine-ink-muted hover:bg-spine-raised hover:text-spine-ink focus-visible:outline-spine-ink"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px]" strokeWidth={1.6} />
            ) : (
              <PanelLeftClose className="size-[18px]" strokeWidth={1.6} />
            )}
          </button>
        </Tooltip>
      </div>

      <div className={cn("shrink-0 px-3 pb-2", collapsed && "px-2")}>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search everything"
          className={cn(
            "flex h-9 w-full items-center gap-2.5 rounded-control border border-spine-border bg-spine-raised/60 px-2.5 text-[0.9375rem] text-spine-ink-muted transition-colors hover:border-spine-ink-muted/40 hover:text-spine-ink focus-visible:outline-spine-ink",
            collapsed && "justify-center border-transparent bg-transparent px-0",
          )}
        >
          <Search aria-hidden className="size-[17px] shrink-0" strokeWidth={1.6} />
          {!collapsed ? (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="font-mono text-micro text-spine-ink-muted/80">{modKey} K</kbd>
            </>
          ) : null}
        </button>
      </div>

      {/* One scrolling part: the screens, the page tree under Notes, and on a short window the upkeep list. */}
      <div
        ref={regionRef}
        className={cn(
          "scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto px-3 [scrollbar-color:var(--spine-border)_transparent]",
          collapsed && "px-2",
        )}
      >
        <nav ref={knowledgeRef} aria-label="Knowledge">
          <ul className="grid gap-0.5">{knowledgeNav.map((item) => row(item))}</ul>
        </nav>
        <div ref={treeRef} className="mt-1 flex-1">
          {!collapsed ? notesTree : null}
        </div>
        {!tall ? (
          <div ref={upkeepRef} className="mt-2 border-t border-spine-border py-2">
            {upkeep}
          </div>
        ) : null}
      </div>

      <div className={cn("shrink-0 border-t border-spine-border px-3 py-2", collapsed && "px-2")}>
        {tall ? (
          <div ref={upkeepRef} className="mb-1 border-b border-spine-border pb-2">
            {upkeep}
          </div>
        ) : null}
        <Lamp collapsed={collapsed} />
      </div>
    </aside>
  );
}
