import { Ellipsis, Search } from "lucide-react";
import { Dialog as Sheet } from "radix-ui";
import { useState } from "react";
import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { Lamp } from "./lamp";
import { LogoMark } from "./logo";
import { knowledgeNav, tuckedAwayNav, upkeepNav } from "./nav";

const tab =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[0.6875rem] font-medium text-ink-muted aria-[current=page]:text-primary";

/** Top bar and bottom tabs for phones. The spine does not fit, so its job is split in two. */
export function MobileNav({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = knowledgeNav.filter((item) => ["/", "/library", "/notes", "/maps"].includes(item.to));
  // Everything the four tabs do not hold, in the order of the sidebar, with the screens a
  // wide display tucks inside others listed beside the one they belong to.
  const tabbed = new Set(tabs.map((item) => item.to));
  const tucked = (to: string) => tuckedAwayNav.filter((item) => item.to.startsWith(`${to}/`));
  const withTucked = (items: typeof knowledgeNav) =>
    items.filter((item) => !tabbed.has(item.to)).flatMap((item) => [item, ...tucked(item.to)]);
  const more = [
    ...withTucked(knowledgeNav),
    ...tuckedAwayNav.filter((item) => item.to === "/import" || item.to.startsWith("/radio/")),
    ...withTucked(upkeepNav),
  ];

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
              <Sheet.Description className="sr-only">
                Every other screen: search, explore, chat, downloads, storage, importing and settings
              </Sheet.Description>
              <div aria-hidden className="mx-auto mb-2 h-1 w-9 rounded-full bg-spine-border" />
              <ul className="grid gap-0.5">
                {more.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      // Exact: Storage is not lit while its neighbour, Manage and clean up, is open.
                      end
                      onClick={() => setMoreOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex h-12 items-center gap-3.5 rounded-control px-3 text-body text-spine-ink-muted",
                          isActive && "bg-spine-active text-spine-ink",
                        )
                      }
                    >
                      <item.icon aria-hidden className="size-5" strokeWidth={1.6} />
                      {item.label}
                    </NavLink>
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
