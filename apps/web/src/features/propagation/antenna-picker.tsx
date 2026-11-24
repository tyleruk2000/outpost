/**
 * Choosing an antenna: the person's own profiles first, then the generic antennas under
 * headings (by wire length, then how it is put up), with a box to find one by typing when
 * the list is long. It opens in the shared floating layer, so it works inside a dialog.
 */
import { ANTENNA_PRESETS, type AntennaProfile, antennaModelLabel, PRESET_GROUPS } from "@outpost/shared";
import { Check, ChevronDown, Search } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { searchRowFocus } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface AntennaChoice {
  value: string;
  /** The words in the list, under its heading. */
  label: string;
  /** The words on the closed control: the whole name. */
  name: string;
  description?: string;
  group: string;
  /** More words it is found by. */
  also?: string;
}

/** The heading the person's own antennas are listed under. */
export const OWN_GROUP = "Your antennas";

/** Every antenna a person can choose: `first` (an antenna kept with something saved), then their profiles, then the generic ones. */
export function antennaChoices(profiles: AntennaProfile[], first: AntennaChoice[] = []): AntennaChoice[] {
  return [
    ...first,
    ...profiles.map((antenna) => ({
      value: antenna.id,
      label: antenna.name,
      name: antenna.name,
      description: antennaModelLabel(antenna.kind, antenna.lengthM),
      group: OWN_GROUP,
    })),
    ...ANTENNA_PRESETS.map((preset) => ({
      value: `preset:${preset.id}`,
      label: preset.short,
      name: preset.name,
      group: preset.group,
      also: `${preset.name} ${preset.also ?? ""}`,
    })),
  ];
}

/** Shown with a box to type in once the list is longer than this. */
const SEARCH_FROM = 10;
const ORDER = [OWN_GROUP, ...PRESET_GROUPS];

export function AntennaPicker({
  value,
  onChange,
  choices,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  choices: AntennaChoice[];
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const chosen = choices.find((choice) => choice.value === value);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return choices.filter((choice) => {
      const text = `${choice.label} ${choice.name} ${choice.description ?? ""} ${choice.group} ${choice.also ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [choices, query]);
  // A heading of its own (an antenna kept with something saved) comes first; then the person's, then the generic ones.
  const rank = (group: string) => ORDER.indexOf(group);
  const groups = [...new Set(shown.map((choice) => choice.group))].sort((a, b) => rank(a) - rank(b));

  const options = () => [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };
  const move = (event: KeyboardEvent, from: number | null) => {
    const all = options();
    if (all.length === 0) return;
    const to =
      event.key === "ArrowDown"
        ? from === null
          ? 0
          : Math.min(all.length - 1, from + 1)
        : event.key === "ArrowUp"
          ? from === null
            ? all.length - 1
            : Math.max(0, from - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? all.length - 1
              : null;
    if (to === null) return;
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
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-control border border-border-strong bg-page px-3 text-left text-small text-ink transition-colors hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus max-md:h-11 md:pointer-coarse:h-11"
        >
          <span className={cn("min-w-0 truncate", !chosen && "text-ink-faint")}>{chosen?.name ?? "Choose an antenna"}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[min(20rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(event) => {
          // Into the box to type in, where there is one; otherwise onto the antenna chosen.
          if (choices.length > SEARCH_FROM) return;
          event.preventDefault();
          const all = options();
          (all.find((item) => item.getAttribute("aria-selected") === "true") ?? all[0])?.focus();
        }}
      >
        {choices.length > SEARCH_FROM ? (
          <div className={cn("flex items-center gap-2 border-b border-border px-2.5", searchRowFocus)}>
            <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <input
              type="search"
              aria-label="Find an antenna"
              aria-controls={listId}
              placeholder="Find an antenna: 20 m, sloping…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") move(event, null);
                if (event.key === "Enter" && shown.length === 1) {
                  event.preventDefault();
                  pick(shown[0]!.value);
                }
              }}
              className="h-10 w-full bg-transparent text-small text-ink placeholder:text-ink-faint focus:outline-none max-md:h-11 md:pointer-coarse:h-11"
            />
          </div>
        ) : null}
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Antennas"
          className="scroll-quiet max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-3rem))] overflow-y-auto p-1"
        >
          {shown.length === 0 ? <p className="px-2.5 py-2 text-small text-ink-muted">No antenna has those words.</p> : null}
          {groups.map((group) => {
            const headingId = `${listId}-${rank(group) + 1}`;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a group of options in a listbox, as ARIA has it; a fieldset is for form controls.
              <div key={group} role="group" aria-labelledby={headingId} className="pb-1">
                <div id={headingId} className="px-2.5 pt-1.5 pb-1 text-micro font-medium text-ink-faint">
                  {group}
                </div>
                {shown
                  .filter((choice) => choice.group === group)
                  .map((choice) => {
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
                        className="relative flex cursor-default items-start gap-2 rounded-[4px] py-1.5 pr-8 pl-2.5 text-small text-ink outline-none select-none hover:bg-surface-strong focus:bg-surface-strong max-md:min-h-12 max-md:py-2.5"
                      >
                        <div className="min-w-0">
                          <div>{choice.label}</div>
                          {choice.description ? <div className="text-micro text-ink-muted">{choice.description}</div> : null}
                        </div>
                        {selected ? <Check aria-hidden className="absolute top-2 right-2.5 size-4 text-primary" /> : null}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
