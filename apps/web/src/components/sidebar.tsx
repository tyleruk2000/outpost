import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useActiveJobs } from "@/lib/queries";
import { cn, modKey } from "@/lib/utils";
import { Lamp } from "./lamp";
import { LogoMark } from "./logo";
import { knowledgeNav, type NavItem, upkeepNav } from "./nav";
import { Tooltip } from "./ui/misc";

function SpineLink({ item, collapsed, trailing }: { item: NavItem; collapsed: boolean; trailing?: ReactNode }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "group flex h-9 items-center gap-3 rounded-control px-2.5 text-[0.9375rem] text-spine-ink-muted transition-colors duration-150 hover:bg-spine-raised hover:text-spine-ink",
          "focus-visible:outline-spine-ink",
          isActive && "bg-spine-active font-medium text-spine-ink hover:bg-spine-active",
          collapsed && "justify-center px-0",
        )
      }
    >
      <item.icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.6} />
      <span className={cn("flex-1 truncate", collapsed && "sr-only")}>{item.label}</span>
      {!collapsed ? trailing : null}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip label={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
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
  const jobs = useActiveJobs();
  const downloads = jobs.data?.filter((job) => job.queue === "download" && job.state !== "paused").length ?? 0;
  // The field above opens the quick search from anywhere. The full search screen (every result, the filters, and
  // how search works) is listed with the other screens too: left to a keystroke, it could not be found.
  const primary = knowledgeNav.map((item) => (item.to === "/search" ? { ...item, label: "Search page" } : item));

  return (
    <aside
      aria-label="Main"
      className={cn(
        "sticky top-0 z-(--z-nav) hidden h-dvh shrink-0 flex-col bg-spine text-spine-ink transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[60px]" : "w-64",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
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

      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
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

      <nav aria-label="Knowledge" className={cn("grid gap-0.5 px-3", collapsed && "px-2")}>
        {primary.map((item) => (
          <SpineLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="scroll-quiet mt-1 min-h-0 flex-1 overflow-y-auto px-3 [scrollbar-color:var(--spine-border)_transparent]">
        {!collapsed ? notesTree : null}
      </div>

      <div className={cn("border-t border-spine-border px-3 py-2", collapsed && "px-2")}>
        <nav aria-label="Upkeep" className="grid gap-0.5">
          {upkeepNav.map((item) => (
            <SpineLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              trailing={
                item.to === "/downloads" && downloads > 0 ? (
                  <span className="tabular rounded-full bg-lamp px-1.5 text-micro font-semibold text-[oklch(0.25_0.05_70)]">
                    {downloads}
                  </span>
                ) : null
              }
            />
          ))}
        </nav>
        <div className="mt-1 border-t border-spine-border pt-1">
          <Lamp collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}
