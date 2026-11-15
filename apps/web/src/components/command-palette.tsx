/**
 * The palette: one box to go anywhere or find anything. Empty, it lists places and
 * actions. With text, it searches the whole library as you type and offers the full
 * results screen as the first choice.
 */
import type { SearchResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { CornerDownLeft, FolderInput, Moon, Plus, Search, Sun, Upload, Waypoints } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { allNav } from "./nav";
import { Highlighted, kindOf } from "./search-hit";
import { Kbd, Spinner } from "./ui/misc";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const itemClass =
  "flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-small text-ink data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-ink max-md:py-3 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted";
const groupClass = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-faint";

export function CommandPalette({ open, onOpenChange, onNewPage }: { open: boolean; onOpenChange: (open: boolean) => void; onNewPage: () => void }) {
  const navigate = useNavigate();
  const { resolved, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 140);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = useQuery({
    queryKey: ["search", "palette", debounced],
    queryFn: ({ signal }) => api.get<SearchResponse>("/api/search", { q: debounced, limit: 8 }, signal),
    enabled: open && debounced.length > 1,
    placeholderData: (previous) => previous,
    staleTime: 10_000,
  });

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  const searching = debounced.length > 1;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay data-[state=open]:animate-fade" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12dvh] left-1/2 z-(--z-dialog) w-[calc(100vw-1.5rem)] max-w-[40rem] -translate-x-1/2 overflow-hidden rounded-panel border border-border bg-raised shadow-dialog focus:outline-none data-[state=open]:animate-enter max-md:top-3"
        >
          <Dialog.Title className="sr-only">Search and go to</Dialog.Title>
          {/* Filtering is done by the server for search results and by cmdk for commands. */}
          <Command shouldFilter={!searching} loop label="Search and go to">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search your library, or type a place to go"
                className="h-13 flex-1 bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none"
              />
              {results.isFetching && searching ? <Spinner /> : null}
            </div>
            <Command.List className="scroll-quiet max-h-[min(60dvh,26rem)] overflow-y-auto p-1.5">
              {searching ? (
                <>
                  <Command.Group className={groupClass}>
                    <Command.Item value={`__all ${debounced}`} onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)} className={itemClass}>
                      <Search aria-hidden />
                      <span className="flex-1 truncate">
                        See all results for <span className="font-semibold">“{query.trim()}”</span>
                      </span>
                      <CornerDownLeft aria-hidden />
                    </Command.Item>
                  </Command.Group>
                  {results.data && results.data.results.length > 0 ? (
                    <Command.Group heading={results.data.relaxed ? "Closest matches" : "Top matches"} className={groupClass}>
                      {results.data.results.map((result) => {
                        const kind = kindOf(result.kind);
                        const passage = result.passages[0];
                        return (
                          <Command.Item key={`${result.kind}:${result.entityId}`} value={`${result.kind}:${result.entityId}`} onSelect={() => go(result.url)} className={`${itemClass} items-start`}>
                            <kind.icon aria-hidden className="mt-0.5" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                <Highlighted segments={result.titleSegments.length ? result.titleSegments : [{ text: result.title, hit: false }]} />
                              </span>
                              {passage ? (
                                <span className="mt-0.5 line-clamp-1 block text-micro text-ink-muted">
                                  <Highlighted segments={passage.segments} />
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 shrink-0 text-micro text-ink-faint">
                              {kind.label}
                              {passage?.page ? `, p. ${passage.page}` : ""}
                            </span>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  ) : results.isSuccess ? (
                    <p className="px-3 py-6 text-small text-ink-muted">Nothing in your library matches “{debounced}”. Check the spelling, or try fewer words.</p>
                  ) : results.isError ? (
                    <p className="px-3 py-6 text-small text-danger">Search is not available right now. The server may be restarting.</p>
                  ) : null}
                </>
              ) : (
                <>
                  <Command.Empty className="px-3 py-6 text-small text-ink-muted">No place or action by that name. Keep typing to search your library.</Command.Empty>
                  <Command.Group heading="Do" className={groupClass}>
                    <Command.Item onSelect={() => run(onNewPage)} className={itemClass}>
                      <Plus aria-hidden />
                      New page
                    </Command.Item>
                    <Command.Item onSelect={() => go("/library?upload=1")} className={itemClass}>
                      <Upload aria-hidden />
                      Add documents
                    </Command.Item>
                    <Command.Item onSelect={() => go("/import")} className={itemClass}>
                      <FolderInput aria-hidden />
                      Import pages from Markdown or Notion
                    </Command.Item>
                    <Command.Item onSelect={() => go("/search/how-it-works")} className={itemClass}>
                      <Waypoints aria-hidden />
                      See how search works
                    </Command.Item>
                    <Command.Item onSelect={() => run(() => setTheme(resolved === "dark" ? "light" : "dark"))} className={itemClass}>
                      {resolved === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
                      Switch to {resolved === "dark" ? "light" : "dark"} theme
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Go to" className={groupClass}>
                    {allNav.map((item) => (
                      <Command.Item key={item.to} value={`go ${item.label}`} onSelect={() => go(item.to)} className={itemClass}>
                        <item.icon aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        <span className="flex gap-1">
                          <Kbd>g</Kbd>
                          <Kbd>{item.key}</Kbd>
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
