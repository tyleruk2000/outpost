/**
 * Finding a place to measure from by typing: saved places, place names installed, and a
 * position written any way the map reads one (coordinates, a grid reference, a
 * locator). Answered by this server with no internet, as the map's own search is.
 *
 * The list of answers stays open until one is chosen, Escape is pressed or a press lands
 * elsewhere. It does not close when the box loses focus: on an iPhone a tap on an answer
 * takes the focus away from the box before the tap arrives, and the answer would be gone
 * before it could be chosen.
 */
import type { MarkerDto } from "@outpost/shared";
import { MapPin, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { usePlaceSearch } from "@/features/maps/data";
import { buildSearchResults } from "@/features/maps/lib/search";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

export interface FoundPlace {
  name: string;
  lat: number;
  lon: number;
}

const MAX_LISTED = 8;

export function PlaceSearch({
  label,
  markers,
  near,
  onChoose,
  autoFocus,
  className,
}: {
  label: string;
  markers: readonly MarkerDto[];
  /** Where to rank place names from: those nearer come first. */
  near: { lat: number; lon: number } | null;
  onChoose: (place: FoundPlace) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Opened from a dropdown, which hands the focus back to itself as it closes: the cursor goes to the box after that,
  // so that what is typed next goes in the box and not nowhere.
  useEffect(() => {
    if (!autoFocus) return;
    const take = () => {
      const now = document.activeElement;
      // Only from the dropdown, or from nowhere: never from somewhere the person has gone since.
      if (now === document.body || now?.getAttribute("role") === "combobox" || now === inputRef.current) inputRef.current?.focus();
    };
    inputRef.current?.focus();
    // Once after the dropdown's own hand-back, and once after its closing animation, whichever is later.
    const timers = [window.setTimeout(take, 0), window.setTimeout(take, 200)];
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [autoFocus]);
  const query = useDebounced(text.trim(), 200);
  const search = usePlaceSearch(query, near ?? undefined);
  const results = useMemo(
    () =>
      query.length >= 2
        ? buildSearchResults({
            query,
            coordinate: search.data && search.data.query === query ? search.data.coordinate : null,
            otherReadings: search.data?.otherReadings,
            places: search.data?.places ?? [],
            markers: [...markers],
            tracks: [],
            center: near,
          })
            .filter((result) => result.position !== null)
            .slice(0, MAX_LISTED)
        : [],
    [query, search.data, markers, near],
  );

  // A press anywhere outside the box and its list closes the list.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const choose = (index: number) => {
    const result = results[index];
    if (!result?.position) return;
    onChoose({
      name: result.title,
      lat: result.position.lat,
      lon: result.position.lon,
    });
    setText("");
    setOpen(false);
  };

  const showing = open && query.length >= 2;
  return (
    <div ref={box} className={cn("relative grid gap-1.5", className)}>
      <label htmlFor={inputId} className="text-small font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          id={inputId}
          type="search"
          aria-controls={showing ? listId : undefined}
          value={text}
          ref={inputRef}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && showing) {
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === "ArrowDown" && results.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActive((current) => (current + 1) % results.length);
            } else if (event.key === "ArrowUp" && results.length > 0) {
              event.preventDefault();
              setActive((current) => (current - 1 + results.length) % results.length);
            } else if (event.key === "Enter" && showing && results.length > 0) {
              event.preventDefault();
              choose(active);
            }
          }}
          placeholder="Town, grid ref or locator"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="pl-9"
        />
      </div>
      {showing ? (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-panel border border-border bg-raised shadow-float">
          {results.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-2.5 text-small text-ink-muted" role="status">
              {search.isFetching ? (
                <>
                  <Spinner label="Searching" delay /> Searching
                </>
              ) : (
                "Nothing found called that. Try a saved place, a town with place names installed, or a position such as 51.46, -0.19 or IO91VK."
              )}
            </p>
          ) : (
            <ul id={listId} aria-label={`Places for ${label.toLowerCase()}`} className="max-h-72 overflow-y-auto py-1">
              {results.map((result, index) => (
                <li key={result.key}>
                  <button
                    type="button"
                    // Keeps the focus in the box, so the keyboard stays up on a phone and nothing closes under the finger.
                    onPointerDown={(event) => event.preventDefault()}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(index)}
                    onPointerEnter={() => setActive(index)}
                    className={cn(
                      "flex min-h-11 w-full cursor-default items-start gap-2.5 px-3 py-2 text-left text-small transition-colors duration-(--duration-fast) focus-visible:-outline-offset-2 md:min-h-9 md:pointer-coarse:min-h-11",
                      index === active ? "bg-surface-strong" : "hover:bg-surface",
                    )}
                  >
                    <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                    <span className="min-w-0">
                      <span className="block text-ink">{result.title}</span>
                      {result.detail ? <span className="block text-micro break-words text-ink-muted">{result.detail}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
