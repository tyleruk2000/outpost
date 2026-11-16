import { Ellipsis, Search } from "lucide-react";
import { Dialog as Sheet } from "radix-ui";
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { Lamp } from "./lamp";
import { LogoMark } from "./logo";
import { allNav, isOwnScreen, knowledgeNav } from "./nav";

const tab =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[0.6875rem] font-medium text-ink-muted aria-[current=page]:text-primary";

/** Top bar and bottom tabs for phones. The spine does not fit, so its job is split in two. */
export function MobileNav({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const tabs = knowledgeNav.filter((item) => ["/", "/library", "/notes", "/maps"].includes(item.to));
  // Everything the four tabs do not hold, in the order of the sidebar, each screen with the ones under it
  // indented beneath it as the sidebar has them. A tab with screens under it (Notes) is listed again as
  // their heading, so that Import files reads as part of Notes here as it does on a wide screen.
  const tabbed = new Set(tabs.map((item) => item.to));
  const more = allNav.filter((item) => !tabbed.has(item.to) || (item.children?.length ?? 0) > 0);

  return (
    <>
      <header className="sticky top-0 z-(--z-nav) flex h-13 items-center gap-2 bg-spine px-4 text-spine-ink md:hidden">
        <Link to="/" className="flex flex-1 items-center gap-2.5">
          <LogoMark />
          <span className="font-title text-lead">Outpost</span>
        </Link>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search everything"
          className="grid size-11 place-content-center rounded-control text-spine-ink-muted hover:text-spine-ink"
        >
          <Search className="size-5" strokeWidth={1.6} />
        </button>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-(--z-nav) flex border-t border-border bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        {tabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={tab}>
            <item.icon aria-hidden className="size-[22px]" strokeWidth={1.6} />
            {item.label}
          </NavLink>
        ))}
        <Sheet.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <Sheet.Trigger className={tab}>
            <Ellipsis aria-hidden className="size-[22px]" strokeWidth={1.6} />
            More
          </Sheet.Trigger>
          <Sheet.Portal>
            <Sheet.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay data-[state=open]:animate-fade" />
            <Sheet.Content className="scroll-quiet fixed inset-x-0 bottom-0 z-(--z-dialog) max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[14px] bg-spine px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] text-spine-ink shadow-dialog data-[state=open]:animate-sheet focus:outline-none">
              <Sheet.Title className="sr-only">More</Sheet.Title>
              <Sheet.Description className="sr-only">Every other screen, each with the screens under it</Sheet.Description>
              <div aria-hidden className="mx-auto mb-2 h-1 w-9 rounded-full bg-spine-border" />
              <ul className="grid gap-0.5">
                {more.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      // Lit only for its own screen: Storage is not lit while Manage and clean up, under it, is open.
                      aria-current={isOwnScreen(pathname, item) ? "page" : undefined}
                      onClick={() => setMoreOpen(false)}
                      className="flex h-12 items-center gap-3.5 rounded-control px-3 text-body text-spine-ink-muted aria-[current=page]:bg-spine-active aria-[current=page]:text-spine-ink"
                    >
                      <item.icon aria-hidden className="size-5 shrink-0" strokeWidth={1.6} />
                      {item.label}
                    </Link>
                    {item.children?.length ? (
                      <ul aria-label={`Under ${item.label}`} className="mb-1 grid gap-0.5">
                        {item.children.map((child) => (
                          <li key={child.to}>
                            <NavLink
                              to={child.to}
                              onClick={() => setMoreOpen(false)}
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
                ))}
              </ul>
              <div className="mt-2 border-t border-spine-border pt-2">
                <Lamp />
              </div>
            </Sheet.Content>
          </Sheet.Portal>
        </Sheet.Root>
      </nav>
    </>
  );
}
