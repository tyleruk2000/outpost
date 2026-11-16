/** "Move to…": the keyboard and touch way to put a page somewhere else in the tree. */
import type { NoteRef } from "@outpost/shared";
import { Command } from "cmdk";
import { CornerLeftUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsTouch } from "./editor/use-touch";
import { displayTitle, useNoteActions } from "./notes-data";
import { PageIcon } from "./page-bits";
import { moveDestinations, pathLabel, type TreeIndex } from "./tree-model";

/** Rows shown at once. With more pages than this, typing narrows the list. */
const SHOWN = 60;

export const pickerItemClass =
  "flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-small text-ink data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-ink max-md:py-3 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted";

export function MoveDialog({ page, index, onClose }: { page: NoteRef; index: TreeIndex; onClose(): void }) {
  const actions = useNoteActions();
  const touch = useIsTouch();
  const [query, setQuery] = useState("");
  const destinations = useMemo(
    () => moveDestinations(index, page.id).map((item) => ({ item, path: pathLabel(index, item.id) })),
    [index, page.id],
  );
  const parentId = index.byId.get(page.id)?.parentId ?? null;

  const needle = query.trim().toLowerCase();
  const matches = needle ? destinations.filter(({ item }) => displayTitle(item.title).toLowerCase().includes(needle)) : destinations;
  const showTop = !needle || "top level".includes(needle);

  const moveTo = async (target: string | null) => {
    onClose();
    // Choosing the place the page is already in changes nothing.
    if (target === parentId) return;
    await actions.moveWithUndo(index, page.id, { parentId: target });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Move “${displayTitle(page.title)}”`}
        description="Choose the page to put it inside. Its sub-pages move with it."
        size="sm"
      >
        <Command shouldFilter={false} loop label="Move to">
          <div className="flex items-center gap-3 border-b border-border px-5">
            <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <Command.Input
              // On a touch screen the list comes first: focusing the field would cover half of it with the keyboard.
              autoFocus={!touch}
              value={query}
              onValueChange={setQuery}
              placeholder="Find a page"
              className="h-11 flex-1 bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          <Command.List className="scroll-quiet max-h-[min(50dvh,22rem)] overflow-y-auto p-1.5">
            {showTop ? (
              <Command.Item value="__top" onSelect={() => void moveTo(null)} className={pickerItemClass}>
                <CornerLeftUp aria-hidden />
                <span className="flex-1">Top level</span>
                {parentId === null ? <span className="text-micro text-ink-muted">It is here now</span> : null}
              </Command.Item>
            ) : null}
            {matches.slice(0, SHOWN).map(({ item, path }) => (
              <Command.Item key={item.id} value={item.id} onSelect={() => void moveTo(item.id)} className={pickerItemClass}>
                <PageIcon icon={item.icon} className="text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{displayTitle(item.title)}</span>
                  {path ? <span className="block truncate text-micro text-ink-muted">{path}</span> : null}
                </span>
                {item.id === parentId ? <span className="shrink-0 text-micro text-ink-muted">It is here now</span> : null}
              </Command.Item>
            ))}
            {matches.length > SHOWN ? (
              <p className="px-3 py-2 text-micro text-ink-muted">
                Showing the first {SHOWN} of {matches.length} pages. Type to narrow the list.
              </p>
            ) : null}
            {matches.length === 0 && !showTop ? (
              <p className="px-3 py-6 text-small text-ink-muted">No page is called “{query.trim()}”.</p>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
