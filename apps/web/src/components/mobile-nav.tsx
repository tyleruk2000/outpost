import { ChevronRight, Ellipsis, Search, X } from "lucide-react";
import { Dialog as Sheet } from "radix-ui";
import { useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { HouseholdSwitcher } from "@/features/households/switcher";
import { useActiveJobs } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useFocusClearOfBars } from "./focus-clear";
import { Lamp } from "./lamp";
import { LogoMark } from "./logo";
import { useMobileNavHeight } from "./mobile-nav-height";
import { isInGroup, isOwnScreen, knowledgeNav, type NavItem, upkeepNav } from "./nav";
import { ownsTopBar, useBottomBarHidden } from "./shell-bars";

/** The phone's four tabs, the screens used most. Everything else is in the More sheet. */
const TABS = ["/", "/library", "/notes", "/maps"];

const rowClass =
  "flex min-h-11 items-center gap-3.5 rounded-control px-3 py-1.5 text-body text-spine-ink-muted aria-[current=page]:bg-spine-active aria-[current=page]:text-spine-ink";

/**
 * One part of the More sheet, as the sidebar has it: a screen with others under it is a heading, its
 * screens folded under it until asked for (the group of the screen in view is open); screens with none
 * under them, side by side two to a line while they fit, so that Storage and Settings are in sight
 * without scrolling on a phone.
 */
function SheetPart({ items, label, close }: { items: NavItem[]; label: string; close: () => void }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.filter((item) => isInGroup(pathname, item)).map((item) => [item.to, true])),
  );
  // Neighbours with nothing under them share a grid; each screen with screens under it is a group of its own.
  const runs: NavItem[][] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (!item.children?.length && last && !last[0]!.children?.length) last.push(item);
    else runs.push([item]);
  }
  const link = (item: NavItem) => (
    <Link
      to={item.to}
      // Lit only for its own screen: Storage is not lit while Manage and clean up, under it, is open.
      aria-current={isOwnScreen(pathname, item) ? "page" : undefined}
      onClick={close}
      className={cn(rowClass, item.children?.length && "flex-1 pr-12")}
    >
      <item.icon aria-hidden className="size-5 shrink-0" strokeWidth={1.6} />
      <span className="min-w-0 break-words">{item.label}</span>
    </Link>
  );
  return (
    <nav aria-label={label}>
      <ul className="grid gap-0.5">
        {runs.map((run) => {
          const item = run[0]!;
          if (!item.children?.length) {
            return (
              <li key={item.to}>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10.5rem),1fr))] gap-0.5">
                  {run.map((leaf) => (
                    <li key={leaf.to}>{link(leaf)}</li>
                  ))}
                </ul>
              </li>
            );
          }
          const shown = open[item.to] ?? false;
          const listId = `more-under-${item.to.replace(/\W+/g, "-")}`;
          return (
            <li key={item.to}>
              <div className="relative flex">
                {link(item)}
                <button
                  type="button"
                  onClick={() => setOpen((previous) => ({ ...previous, [item.to]: !shown }))}
                  aria-expanded={shown}
                  aria-controls={shown ? listId : undefined}
                  aria-label={`${shown ? "Hide" : "Show"} the screens under ${item.label}`}
                  className="absolute top-0 right-0 grid size-11 place-content-center rounded-control text-spine-ink-muted"
                >
                  <ChevronRight
                    aria-hidden
                    className={cn("size-5 transition-transform duration-150 motion-reduce:transition-none", shown && "rotate-90")}
                    strokeWidth={1.8}
                  />
                </button>
              </div>
              {shown ? (
                <ul id={listId} aria-label={`Under ${item.label}`} className="mb-1 grid gap-0.5">
                  {(item.children ?? []).map((child) => (
                    <li key={child.to}>
                      <NavLink
                        to={child.to}
                        onClick={close}
                        className={({ isActive }) =>
                          cn(
                            // Indented so that the name starts under its parent's name, with no icon of its own.
                            "flex min-h-11 items-center rounded-control py-2 pr-3 pl-[2.875rem] text-body text-spine-ink-muted",
                            isActive && "bg-spine-active text-spine-ink",
                          )
                        }
                      >
                        {child.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// The five names are the smallest size DESIGN.md allows (micro, 12.5 px; five fit a 320 px screen) and grow with the
// text up to 15 px and no further, as a phone's own tab bars do: at a 32 px root "More" went past the edge of a 390 px
// screen. Everything in the More sheet grows with the text.
const tab =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[min(var(--text-micro),15px)] font-medium text-ink-muted aria-[current=page]:text-primary";

/** Top bar and bottom tabs for phones. The spine does not fit, so its job is split in two. */
export function MobileNav({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  // Downloads running: the lamp on More, as the sidebar has their number beside Downloads and tasks.
  const jobs = useActiveJobs();
  const downloads = jobs.data?.filter((job) => job.queue === "download" && job.state !== "paused").length ?? 0;
  const tabs = knowledgeNav.filter((item) => TABS.includes(item.to));
  // Everything the four tabs do not hold, in the order of the sidebar and in its two parts. A tab with screens
  // under it (Notes) is listed again as their heading, so that Import reads as part of Notes here as it does on a
  // wide screen.
  const more = knowledgeNav.filter((item) => !TABS.includes(item.to) || (item.children?.length ?? 0) > 0);
  const close = () => setMoreOpen(false);
  // The screen in view is in the More sheet (Settings, a radio tool, Import files): More is lit, as a tab would be.
  const inMore = !tabs.some((item) => (item.to === "/" ? pathname === "/" : isOwnScreen(pathname, item)));
  const bar = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  useFocusClearOfBars(header, bar);
  useMobileNavHeight(bar);
  // Maps has a bar of its own at the top (its search, or the task in hand): the app's is not shown there, and quick
  // search is the first row of More. A task with a bar of its own puts the bar of screens away (shell-bars.ts).
  const ownBar = ownsTopBar(pathname);
  const taskInHand = useBottomBarHidden();

  return (
    <>
      <header
        ref={header}
        hidden={ownBar}
        className="sticky top-0 z-(--z-nav) flex h-13 items-center gap-2 bg-spine pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] text-spine-ink md:hidden"
      >
        <Link to="/" className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5">
          <LogoMark />
          <span className="font-title text-lead">Outpost</span>
        </Link>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Quick search"
          className="grid size-11 shrink-0 place-content-center rounded-control text-spine-ink-muted hover:text-spine-ink"
        >
          <Search className="size-5" strokeWidth={1.6} />
        </button>
      </header>

      <nav
        ref={bar}
        aria-label="Main"
        hidden={taskInHand}
        className="fixed inset-x-0 bottom-0 z-(--z-nav) flex border-t border-border bg-page/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur-sm md:hidden"
      >
        {tabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={tab}>
            <item.icon aria-hidden className="size-[22px]" strokeWidth={1.6} />
            {item.label}
          </NavLink>
        ))}
        <Sheet.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <Sheet.Trigger className={cn(tab, inMore && "text-primary")} aria-current={inMore ? "true" : undefined}>
            <span className="relative block">
              <Ellipsis aria-hidden className="size-[22px]" strokeWidth={1.6} />
              {downloads > 0 ? (
                <span aria-hidden data-lamp className="absolute -top-0.5 -right-1.5 size-2 rounded-full bg-lamp ring-2 ring-page" />
              ) : null}
            </span>
            More
            {downloads > 0 ? <span className="sr-only">, {downloads === 1 ? "a download" : `${downloads} downloads`} running</span> : null}
          </Sheet.Trigger>
          <Sheet.Portal>
            <Sheet.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay data-[state=open]:animate-fade" />
            <Sheet.Content className="scroll-quiet fixed inset-x-0 bottom-0 z-(--z-dialog) max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[14px] bg-spine px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] text-spine-ink shadow-dialog data-[state=open]:animate-sheet focus:outline-none">
              <Sheet.Title className="sr-only">More</Sheet.Title>
              <Sheet.Description className="sr-only">Every other screen, each with the screens under it</Sheet.Description>
              <div aria-hidden className="mx-auto mb-2 h-1 w-9 rounded-full bg-spine-border" />
              {ownBar ? (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onOpenSearch();
                  }}
                  className={cn(rowClass, "mb-2 w-full")}
                >
                  <Search aria-hidden className="size-5 shrink-0" strokeWidth={1.6} />
                  Quick search
                </button>
              ) : null}
              <HouseholdSwitcher onPicked={close} className="mb-2 px-3" />
              <SheetPart items={more} label="Knowledge" close={close} />
              <div className="mt-2 border-t border-spine-border pt-2">
                <SheetPart items={upkeepNav} label="Upkeep" close={close} />
              </div>
              <div className="mt-2 border-t border-spine-border pt-2">
                <Lamp />
              </div>
              {/* A way out a screen reader can reach on a phone: VoiceOver's and TalkBack's gestures for Escape do not reach
                  every browser, and the dimmed page behind cannot be reached while the sheet is open. */}
              <Sheet.Close className={cn(rowClass, "mt-2 w-full border-t border-spine-border")}>
                <X aria-hidden className="size-5 shrink-0" strokeWidth={1.6} />
                Close
              </Sheet.Close>
            </Sheet.Content>
          </Sheet.Portal>
        </Sheet.Root>
      </nav>
    </>
  );
}
