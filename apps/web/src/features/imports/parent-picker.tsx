/** "Put the pages under…": the top level, or any existing page found by typing part of its title. */
import type { NoteLookupItem } from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, CornerLeftUp, FileText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { lookupPages } from "./import-data";

export interface ChosenParent {
  id: string;
  title: string;
  /** Titles of the pages above it, joined with " / ". */
  path: string;
}

const titleOf = (title: string) => title.trim() || "Untitled";

const itemClass =
  "flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-small text-ink data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-ink max-md:py-3 [&_svg]:size-4 [&_svg]:shrink-0";

/** The typed text, once the person has paused: one request per pause rather than per key. */
function useSettled(value: string, delay = 180): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function ParentPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: ChosenParent | null;
  onChange: (parent: ChosenParent | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const settled = useSettled(query.trim());
  const pages = useQuery({
    queryKey: ["notes", "lookup", settled],
    queryFn: ({ signal }) => lookupPages(settled, signal),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const choose = (parent: ChosenParent | null) => {
    onChange(parent);
    setOpen(false);
    setQuery("");
  };
  const showTop = !settled || "top level".includes(settled.toLowerCase());
  const found: NoteLookupItem[] = pages.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-control border border-border-strong bg-page px-3 py-1.5 text-left text-small text-ink transition-colors hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 max-md:min-h-11"
      >
        <span className="min-w-0">
          <span className="block truncate">{value ? titleOf(value.title) : "Top level of your notes"}</span>
          {value?.path ? <span className="block truncate text-micro text-ink-muted">in {value.path}</span> : null}
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command shouldFilter={false} loop label="Put the pages under">
          <div className="flex items-center gap-2.5 border-b border-border px-3">
            <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Find a page"
              className="h-10 min-w-0 flex-1 bg-transparent text-small text-ink placeholder:text-ink-faint focus:outline-none max-md:h-11 max-md:text-body"
            />
          </div>
          <Command.List className="scroll-quiet max-h-[min(45dvh,18rem)] overflow-y-auto p-1.5">
            {showTop ? (
              <Command.Item value="__top" onSelect={() => choose(null)} className={itemClass}>
                <CornerLeftUp aria-hidden className="text-ink-muted" />
                <span className="flex-1">Top level of your notes</span>
                {value === null ? <Check aria-hidden className="text-primary" /> : null}
              </Command.Item>
            ) : null}
            {found.map((page) => (
              <Command.Item
                key={page.id}
                value={page.id}
                onSelect={() => choose({ id: page.id, title: page.title, path: page.path })}
                className={itemClass}
              >
                <FileText aria-hidden className="text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{titleOf(page.title)}</span>
                  {page.path ? <span className="block truncate text-micro text-ink-muted">{page.path}</span> : null}
                </span>
                {value?.id === page.id ? <Check aria-hidden className="text-primary" /> : null}
              </Command.Item>
            ))}
            {pages.isError ? <p className="px-3 py-3 text-small text-danger">{errorMessage(pages.error)}</p> : null}
            {pages.isPending && open ? <p className="px-3 py-3 text-small text-ink-muted">Looking…</p> : null}
            {pages.isSuccess && found.length === 0 ? (
              <p className={cn("px-3 text-small text-ink-muted", showTop ? "py-2" : "py-5")}>
                {settled ? `No page is called “${settled}”.` : "You have no pages yet. The import will start your notes."}
              </p>
            ) : null}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
