/**
 * Choosing one satellite from the hundred or more kept: a button with the name chosen,
 * opening a list with a box to find one by name or NORAD number. Type a few letters and
 * press Enter to take the first; arrow keys move through the list.
 */
import { Check, ChevronDown, Search } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { searchRowFocus } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface SatelliteChoice {
  value: string;
  name: string;
  noradId: number;
}

/** The list stops here, with a line saying how many more a few letters would find. */
const SHOWN_AT_MOST = 80;

export function SatellitePicker({
  value,
  onChange,
  choices,
  placeholder,
  id,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  choices: SatelliteChoice[];
  placeholder: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const chosen = choices.find((choice) => choice.value === value);
  const matching = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return choices.filter((choice) => {
      const text = `${choice.name} ${choice.noradId}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [choices, query]);
  const shown = matching.slice(0, SHOWN_AT_MOST);

  const options = () => [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };
  const move = (event: KeyboardEvent, from: number | null) => {
    const all = options();
    if (all.length === 0) return;
    const keys: Record<string, number> = {
      ArrowDown: from === null ? 0 : Math.min(all.length - 1, from + 1),
      ArrowUp: from === null ? all.length - 1 : Math.max(0, from - 1),
      Home: 0,
      End: all.length - 1,
    };
    const to = keys[event.key];
    if (to === undefined) return;
    event.preventDefault();
    all[to]!.focus();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-control border border-border-strong bg-page px-3 text-left text-small text-ink transition-colors hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus max-md:h-11 max-md:text-body md:pointer-coarse:h-11"
        >
          <span className={cn("min-w-0 truncate", !chosen && "text-ink-faint")}>
            {chosen ? `${chosen.name} · ${chosen.noradId}` : placeholder}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[min(20rem,calc(100vw-2rem))] p-0">
        <div className={cn("flex items-center gap-2 border-b border-border px-2.5", searchRowFocus)}>
          <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <input
            type="search"
            aria-label="Find a satellite"
            aria-controls={listId}
            placeholder="Name or NORAD number"
            enterKeyHint="go"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") move(event, null);
              if (event.key === "Enter" && shown.length > 0) {
                event.preventDefault();
                pick(shown[0]!.value);
              }
            }}
            className="h-10 w-full bg-transparent text-small text-ink placeholder:text-ink-faint focus:outline-none max-md:h-11 max-md:text-body"
          />
        </div>
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Satellites"
          className="scroll-quiet max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-3rem))] overflow-y-auto p-1"
        >
          {shown.length === 0 ? <p className="px-2.5 py-2 text-small text-ink-muted">No kept satellite has that name or number.</p> : null}
          {shown.map((choice) => {
            const selected = choice.value === value;
            return (
              <div
                key={choice.value}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onClick={() => pick(choice.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    pick(choice.value);
                  } else move(event, options().indexOf(event.currentTarget));
                }}
                className="relative flex cursor-default items-baseline justify-between gap-3 rounded-[4px] py-1.5 pr-8 pl-2.5 text-small text-ink outline-none select-none hover:bg-surface-strong focus:bg-surface-strong max-md:min-h-11 max-md:py-2.5"
              >
                <span className="min-w-0">{choice.name}</span>
                <span className="shrink-0 text-micro text-ink-muted tabular">{choice.noradId}</span>
                {selected ? <Check aria-hidden className="absolute top-2 right-2.5 size-4 text-primary max-md:top-3" /> : null}
              </div>
            );
          })}
          {matching.length > shown.length ? (
            <p className="px-2.5 py-2 text-small text-ink-muted">
              {matching.length - shown.length} more: type part of a name or a number to find them.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
