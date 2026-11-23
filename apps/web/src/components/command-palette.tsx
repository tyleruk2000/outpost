/**
 * The palette ("quick search"): one box to go anywhere or find anything. Empty, it lists
 * places and actions. With text, places (screens and sections of Settings, found by their
 * names and everyday words: find-places.ts) and actions whose names match stay at the top,
 * and the whole library is searched underneath as you type. What would have to be
 * downloaded comes last of all.
 */
import type { SearchResponse, SearchResult } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { CornerDownLeft, Eraser, FolderInput, Globe, ListChecks, type LucideIcon, Moon, Plus, Search, Sun, Upload, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { searchRowFocus } from "@/components/ui/input";
import { findGuides, useGuideIndex } from "@/features/help/guide-places";
import { api } from "@/lib/api";
import { referenceProgress, useReferenceSearch } from "@/lib/reference-search";
import { useTheme } from "@/lib/theme";
import { useDebounced } from "@/lib/use-debounced";
import { modKey } from "@/lib/utils";
import { everyPlace, findPlaces, matchesWords } from "./find-places";
import { Highlighted, kindOf, resultHref } from "./search-hit";
import { useFocusReturn } from "./ui/dialog";
import { Kbd, Spinner } from "./ui/misc";

interface PaletteAction {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
  /** Other words it is found by. */
  keywords?: string;
}

/** Kept here too for those that look for it here. */
export { matchesWords };

const itemClass =
  "flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-small text-ink data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-ink max-md:py-3 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted";
/** How many reference articles the palette lists: the best match of each of the first collections to answer. */
const REFERENCE_SHOWN = 5;

function ResultItem({ result, onSelect }: { result: SearchResult; onSelect: () => void }) {
  const kind = kindOf(result.kind);
  const passage = result.passages[0];
  return (
    <Command.Item value={`${result.kind}:${result.entityId}`} onSelect={onSelect} className={`${itemClass} items-start`}>
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
      <span className="mt-0.5 max-w-[40%] shrink-0 truncate text-micro text-ink-faint">
        {result.kind === "reference" && result.collection ? result.collection : kind.label}
        {passage?.page ? `, p. ${passage.page}` : ""}
      </span>
    </Command.Item>
  );
}

const groupClass =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-faint";

export function CommandPalette({
  open,
  onOpenChange,
  onNewPage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewPage: () => void;
}) {
  const navigate = useNavigate();
  const { resolved, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 140);
  const focusReturn = useFocusReturn();

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = useQuery({
    queryKey: ["search", "palette", debounced],
    // Reference collections are asked separately (below), so that these results never wait on them.
    queryFn: ({ signal }) => api.get<SearchResponse>("/api/search", { q: debounced, limit: 8, reference: "later" }, signal),
    enabled: open && debounced.length > 1,
    placeholderData: (previous) => previous,
    staleTime: 10_000,
  });
  const reference = useReferenceSearch(debounced, open && debounced.length > 1 && results.data?.referenceToCome === true);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  const typed = query.trim();
  const searching = debounced.length > 1 && typed.length > 1;
  const stillSearching = searching && reference.status === "searching";
  const referenceShown = searching ? reference.best.slice(0, REFERENCE_SHOWN) : [];
  // What would have to be downloaded comes after everything on this device, the reference collections included. It is
  // added once they have answered, so that nothing above it moves when it comes.
  const matches = results.data?.results.filter((result) => result.kind !== "catalog") ?? [];
  // Places and repeaters come apart from the results: first when the words are one of their names, otherwise a couple after.
  const named = (results.data?.places ?? []).slice(0, 2);
  const own = results.data?.placesFirst ? [...named, ...matches] : [...matches, ...named];
  const toDownload = stillSearching ? [] : (results.data?.results.filter((result) => result.kind === "catalog") ?? []);

  const everyAction: PaletteAction[] = [
    { id: "new-page", label: "New page", icon: Plus, run: () => run(onNewPage) },
    { id: "add-documents", label: "Add documents", icon: Upload, run: () => go("/library?upload=1") },
    { id: "save-web-page", label: "Save a web page", icon: Globe, run: () => go("/library?save=page") },
    { id: "import", label: "Import pages from Markdown or Notion", icon: FolderInput, run: () => go("/import") },
    { id: "free-space", label: "Free up space and clean up", icon: Eraser, run: () => go("/storage/manage") },
    { id: "manage-downloaded", label: "Manage what is downloaded", icon: ListChecks, run: () => go("/storage/manage?view=installed") },
    {
      id: "theme",
      label: `Switch to ${resolved === "dark" ? "light" : "dark"} theme`,
      icon: resolved === "dark" ? Sun : Moon,
      run: () => run(() => setTheme(resolved === "dark" ? "light" : "dark")),
    },
  ];
  // Every screen, those under another with its name first ("Radio: Repeaters"); with words typed, the sections of
  // Settings too. Nothing typed lists the screens alone.
  const guides = useGuideIndex(open);
  const places = typed ? [...findPlaces(typed), ...findGuides(typed, guides)] : everyPlace.filter((place) => !place.section);
  const actions = everyAction.filter((action) => matchesWords(`${action.label}${action.keywords ? ` ${action.keywords}` : ""}`, typed));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay data-[state=open]:animate-fade" />
        <Dialog.Content
          ref={focusReturn.ref}
          onCloseAutoFocus={focusReturn.onCloseAutoFocus}
          aria-describedby={undefined}
          className="fixed top-[12dvh] left-1/2 z-(--z-dialog) w-[calc(100vw-1.5rem)] max-w-[40rem] -translate-x-1/2 overflow-hidden rounded-panel border border-border bg-raised shadow-dialog focus:outline-none data-[state=open]:animate-enter max-md:top-3"
        >
          <Dialog.Title className="sr-only">Search and go to</Dialog.Title>
          {/* Nothing is left to cmdk's fuzzy filter: places and actions are matched here by word, the library by the server. */}
          <Command shouldFilter={false} loop label="Search and go to">
            <div className={`flex items-center gap-3 border-b border-border px-4 ${searchRowFocus}`}>
              <Search aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search your library, or type a place to go"
                className="h-13 flex-1 bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none"
              />
              {(results.isFetching || stillSearching) && searching ? <Spinner label="Searching" /> : null}
              {/* On a touch screen, where there is no Escape key: a way out a screen reader can reach too. */}
              <Dialog.Close
                aria-label="Close quick search"
                className="-mr-2 grid size-11 shrink-0 place-content-center rounded-control text-ink-muted hover:text-ink pointer-fine:hidden"
              >
                <X aria-hidden className="size-5" strokeWidth={1.6} />
              </Dialog.Close>
            </div>
            <Command.List className="scroll-quiet max-h-[min(60dvh,26rem)] overflow-y-auto p-1.5">
              {/* Places come first, so typing the name of a screen and pressing Enter always goes there. */}
              {places.length > 0 ? (
                <Command.Group heading="Go to" className={groupClass}>
                  {places.map((item) => (
                    <Command.Item key={item.to} value={`go ${item.to}`} onSelect={() => go(item.to)} className={itemClass}>
                      <item.icon aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        {item.parent ? <span className="text-ink-muted">{item.parent.label}:</span> : null}
                        {item.parent ? " " : null}
                        {item.label}
                      </span>
                      {/* The keys are for a keyboard: on a touch screen, where there is none, they are not shown. */}
                      {item.key ? (
                        <span className="hidden gap-1 pointer-fine:flex">
                          <Kbd>g</Kbd>
                          <Kbd>{item.key}</Kbd>
                        </span>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {actions.length > 0 ? (
                <Command.Group heading="Do" className={groupClass}>
                  {actions.map((action) => (
                    <Command.Item key={action.id} value={`do ${action.id}`} onSelect={action.run} className={itemClass}>
                      <action.icon aria-hidden />
                      {action.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {typed.length > 0 ? (
                <>
                  <Command.Group heading={places.length + actions.length > 0 ? "In your library" : undefined} className={groupClass}>
                    <Command.Item
                      value={`__all ${typed}`}
                      onSelect={() => go(`/search?q=${encodeURIComponent(typed)}`)}
                      className={itemClass}
                    >
                      <Search aria-hidden />
                      <span className="flex-1 truncate">
                        See all results for <span className="font-semibold">“{typed}”</span>
                      </span>
                      <CornerDownLeft aria-hidden />
                    </Command.Item>
                  </Command.Group>
                  {searching && results.data && results.data.results.length > 0 ? (
                    own.length > 0 ? (
                      <Command.Group heading={results.data.relaxed ? "Closest matches" : "Top matches"} className={groupClass}>
                        {own.map((result) => (
                          <ResultItem key={`${result.kind}:${result.entityId}`} result={result} onSelect={() => go(resultHref(result))} />
                        ))}
                      </Command.Group>
                    ) : null
                  ) : searching && results.isSuccess && results.data?.didYouMean ? (
                    <Command.Group heading={`Nothing matches “${debounced}”`} className={groupClass}>
                      <Command.Item
                        value={`__suggest ${results.data.didYouMean.query}`}
                        onSelect={() => setQuery(results.data!.didYouMean!.query)}
                        className={itemClass}
                      >
                        <Search aria-hidden />
                        <span className="flex-1 truncate">
                          Did you mean <span className="font-semibold">{results.data.didYouMean.query}</span>?
                        </span>
                      </Command.Item>
                    </Command.Group>
                  ) : searching && results.isSuccess && !stillSearching && referenceShown.length === 0 ? (
                    <p className="px-3 py-4 text-small text-ink-muted">
                      Nothing in your library matches “{debounced}”. Check the spelling, or try fewer words.
                    </p>
                  ) : searching && results.isError ? (
                    <p className="px-3 py-4 text-small text-danger">Search is not available right now. The server may be restarting.</p>
                  ) : null}
                  {/* Last, and only ever added to at its end, so nothing above moves under a finger or the selection. */}
                  {referenceShown.length > 0 ? (
                    <Command.Group heading="In reference collections" className={groupClass}>
                      {referenceShown.map((result) => (
                        <ResultItem key={`${result.kind}:${result.entityId}`} result={result} onSelect={() => go(resultHref(result))} />
                      ))}
                    </Command.Group>
                  ) : null}
                  {toDownload.length > 0 ? (
                    <Command.Group heading="Available to download" className={groupClass}>
                      {toDownload.map((result) => (
                        <ResultItem key={`${result.kind}:${result.entityId}`} result={result} onSelect={() => go(resultHref(result))} />
                      ))}
                    </Command.Group>
                  ) : null}
                  {stillSearching ? (
                    <p role="status" className="tabular px-3 py-2 text-micro text-ink-muted">
                      {referenceProgress(reference)}
                    </p>
                  ) : null}
                </>
              ) : null}
            </Command.List>
          </Command>
          {/* The keys, where someone with a keyboard will look for them. A phone has none of them. */}
          <p className="hidden flex-wrap gap-x-5 gap-y-1 border-t border-border px-4 py-2.5 text-micro text-ink-muted md:flex">
            <span>
              <Kbd>{modKey} K</Kbd> or <Kbd>/</Kbd> opens this
            </span>
            <span>
              <Kbd>g</Kbd> then a letter goes to a screen
            </span>
            <span>
              <Kbd>{modKey} \</Kbd> folds the sidebar
            </span>
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
