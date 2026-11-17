/**
 * Choosing a country's state, Land or county by name, from Geofabrik's own list of the
 * extracts it publishes. The list is read only when the person presses for it, and kept on
 * the server; after that, finding "Ohio" or "Bayern" asks nothing of anyone. Typing finds a
 * region in any country; with nothing typed, the home place's region comes first (worked
 * out by the server from what it holds), then the countries, each opening onto its parts.
 */
import type { ReferenceRegionDto } from "@outpost/shared";
import { ArrowLeft, ChevronRight, Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { ErrorState, Joined } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useReadRegions, useRegions } from "./data";

/** Regions a pack can be fetched for at once: each is its own file. */
export const MAX_REGIONS = 3;
const MAX_FOUND = 40;

/** What the food and supplies layer will be made from in a region, in words. */
export function madeFrom(region: Pick<ReferenceRegionDto, "country">): string {
  return region.country === "GB"
    ? "OpenStreetMap; in the United Kingdom the Food Standards Agency's list can be added for the area on screen, which holds more of the shops."
    : "OpenStreetMap only: likely to be fuller in towns than in the country.";
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function RegionChooser({
  chosen,
  onChange,
  home,
}: {
  chosen: string[];
  onChange: (ids: string[]) => void;
  /** The home place, to offer its region first; null when there is none. */
  home: { lat: number; lon: number } | null;
}) {
  const regions = useRegions(home);
  const read = useReadRegions();
  const [text, setText] = useState("");
  const typed = useDeferredValue(text.trim());
  const [country, setCountry] = useState<string | null>(null);
  const list = useMemo(() => regions.data?.regions ?? [], [regions.data]);
  const byId = useMemo(() => new Map(list.map((region) => [region.id, region])), [list]);
  const countries = useMemo(() => list.filter((region) => region.depth === 0), [list]);
  const partsOf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const region of list) if (region.depth > 0 && region.country) counts.set(region.country, (counts.get(region.country) ?? 0) + 1);
    return counts;
  }, [list]);

  /** Where a region sits: "Bayern, Germany". */
  const placeOf = (region: ReferenceRegionDto) => {
    const names: string[] = [];
    for (let at = region.parent ? byId.get(region.parent) : undefined; at; at = at.parent ? byId.get(at.parent) : undefined)
      names.push(at.name);
    return names.join(", ");
  };

  const found = useMemo(() => {
    if (!typed) return [];
    const needle = fold(typed);
    const hits = list.filter((region) => fold(region.name).includes(needle));
    // Names that begin with what was typed first, then the rest, each in the list's order.
    return [
      ...hits.filter((region) => fold(region.name).startsWith(needle)),
      ...hits.filter((region) => !fold(region.name).startsWith(needle)),
    ].slice(0, MAX_FOUND);
  }, [typed, list]);

  if (regions.isPending) return <Skeleton className="h-24" />;
  if (regions.isError) return <ErrorState error={regions.error} onRetry={() => regions.refetch()} />;

  if (!regions.data.held) {
    return (
      <div className="grid gap-2">
        <p className="text-small text-ink">
          Choosing a state or region needs Geofabrik's list of the countries and parts of countries it publishes. Reading it asks
          download.geofabrik.de for one file of about 500 kB; the list is then kept on this device, and finding a region asks nothing more.
        </p>
        <div>
          <Button onClick={() => read.mutate()} loading={read.isPending}>
            Read the list of regions
          </Button>
        </div>
        {read.isError ? <p className="text-small text-danger">{errorMessage(read.error)}</p> : null}
      </div>
    );
  }

  const full = chosen.length >= MAX_REGIONS;
  const toggle = (id: string, on: boolean) => onChange(on ? [...chosen, id] : chosen.filter((entry) => entry !== id));

  const row = (region: ReferenceRegionDto, options: { place?: boolean; why?: string; indent?: boolean } = {}) => {
    const checked = chosen.includes(region.id);
    const id = `region-${region.id.replace(/[^a-z0-9-]/gi, "-")}`;
    const where = options.place ? placeOf(region) : "";
    return (
      <li key={region.id}>
        <label
          htmlFor={id}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-3 py-1.5 pr-2 text-small md:min-h-9",
            options.indent && region.depth > 1 ? "pl-6" : "pl-1",
            !checked && full && "cursor-default text-ink-muted",
          )}
        >
          <Checkbox id={id} checked={checked} disabled={!checked && full} onCheckedChange={(on) => toggle(region.id, on === true)} />
          <span className="min-w-0 flex-1">
            <span className="block text-ink">{region.depth === 0 ? `The whole of ${region.name}` : region.name}</span>
            {where || options.why ? (
              <span className="block text-micro text-ink-muted">
                <Joined parts={[where, options.why ?? ""]} />
              </span>
            ) : null}
          </span>
        </label>
      </li>
    );
  };

  const opened = country ? countries.find((entry) => entry.country === country && entry.depth === 0) : undefined;
  const suggested = (regions.data.suggested ?? [])
    .map((entry) => ({ region: byId.get(entry.id), why: entry.why }))
    .filter((entry): entry is { region: ReferenceRegionDto; why: string } => Boolean(entry.region));
  const chosenRegions = chosen.map((id) => byId.get(id)).filter((region): region is ReferenceRegionDto => Boolean(region));

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          type="search"
          aria-label="Find a country, state or region"
          placeholder="Find a country, state or region"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="pr-10 pl-8 [&::-webkit-search-cancel-button]:hidden"
          autoComplete="off"
          enterKeyHint="search"
        />
        {text ? (
          <button
            type="button"
            aria-label="Clear what is typed"
            onClick={() => setText("")}
            className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-content-center rounded-control text-ink-muted hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="max-h-72 overflow-y-auto overscroll-contain rounded-control border border-border px-2" aria-live="polite">
        {typed ? (
          found.length === 0 ? (
            <p className="py-3 text-small text-ink-muted">Nothing in Geofabrik's list is called that. Try the country's name in English.</p>
          ) : (
            <ul aria-label="Regions found" className="divide-y divide-border">
              {found.map((region) => row(region, { place: true }))}
            </ul>
          )
        ) : opened ? (
          <div>
            <button
              type="button"
              onClick={() => setCountry(null)}
              className="flex min-h-11 items-center gap-1.5 text-small text-primary underline-offset-2 hover:underline md:min-h-9"
            >
              <ArrowLeft aria-hidden className="size-4" /> All countries
            </button>
            <ul aria-label={`${opened.name} and its parts`} className="divide-y divide-border border-t border-border">
              {list.filter((region) => region.country === opened.country).map((region) => row(region, { indent: true }))}
            </ul>
          </div>
        ) : (
          <>
            {suggested.length > 0 ? (
              <section aria-label="For the home place">
                <h4 className="pt-2 text-micro font-semibold text-ink-muted">For the home place</h4>
                <ul className="divide-y divide-border">{suggested.map(({ region, why }) => row(region, { place: true, why }))}</ul>
              </section>
            ) : null}
            <h4 className={cn("pt-2 text-micro font-semibold text-ink-muted", suggested.length > 0 && "mt-1 border-t border-border")}>
              Countries
            </h4>
            <ul aria-label="Countries" className="divide-y divide-border">
              {countries.map((entry) => {
                const parts = entry.country ? (partsOf.get(entry.country) ?? 0) : 0;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setCountry(entry.country)}
                      className="flex min-h-11 w-full items-center gap-2 py-1.5 pl-1 text-left text-small text-ink hover:text-primary md:min-h-9"
                    >
                      <span className="min-w-0 flex-1">{entry.name}</span>
                      <span className="tabular shrink-0 text-micro text-ink-muted">{parts > 0 ? `${parts} parts` : "whole country"}</span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {chosenRegions.length > 0 ? (
        <ul aria-label="Chosen" className="grid gap-1 text-small">
          {chosenRegions.map((region) => (
            <li key={region.id}>
              <span className="font-medium text-ink">{region.name}</span>
              <span className="text-ink-muted">: {madeFrom(region)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-muted">Choose up to {MAX_REGIONS}; each is its own file and its own pack.</p>
      )}
      {full ? (
        <p className="text-micro text-ink-muted">That is {MAX_REGIONS}, as many as one download takes. Fetch more afterwards.</p>
      ) : null}
      <p className="text-micro text-ink-muted">
        Geofabrik's list as read on {formatDate(regions.data.readAt ?? Date.now())}.{" "}
        <button type="button" onClick={() => read.mutate()} disabled={read.isPending} className="text-primary underline underline-offset-2">
          {read.isPending ? "Reading it again…" : "Read it again"}
        </button>
        {read.isError ? <span className="text-danger"> {errorMessage(read.error)}</span> : null}
      </p>
    </div>
  );
}
