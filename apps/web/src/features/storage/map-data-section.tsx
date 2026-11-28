/**
 * Offline maps on the Storage screen: one row, "Offline maps · 7.9 GB · Internal storage ›
 * Manage", among the kinds of content, that opens to its places (a country, a drawn area, the
 * world's basics) with the same state marks as Offline maps. Everything is added, updated, moved
 * and removed on Offline maps, the one place for map data.
 */
import { formatBytes, type MapDataPlace } from "@outpost/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { StateMark, touchSize } from "@/features/maps/data-page/pattern";
import { useMapData } from "@/features/maps/data-page/use-map-data";
import { BUNDLE_NAMES, namesText, placesIn, stalePlacesLine } from "@/features/maps/data-page/words";
import { cn, plural } from "@/lib/utils";

const link = "text-primary underline decoration-1 underline-offset-2";

/** One place in the opened row: its name, the marks of what it holds, where and how big. */
export function StoragePlace({ place }: { place: MapDataPlace }) {
  const held = place.bundles.filter((bundle) => bundle.state !== "none");
  return (
    <li data-pattern="row" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
      <Link to="/maps/data" className={cn("inline-flex min-h-6 min-w-0 items-center font-medium", link)}>
        {place.name}
      </Link>
      <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
        {held.map((bundle) => (
          <StateMark key={bundle.kind} bundle={bundle} name={BUNDLE_NAMES[bundle.kind]} place={place.name} labelled />
        ))}
      </span>
      <span className="ml-auto flex min-w-0 items-baseline justify-between gap-3 text-small @max-[28rem]:basis-full">
        <span className="min-w-0 text-ink-muted">{place.locations.join(", ")}</span>
        <span className="tabular font-medium whitespace-nowrap text-ink">{formatBytes(place.sizeBytes)}</span>
      </span>
    </li>
  );
}

/**
 * The Offline maps row of "What is taking the space": its swatch and name (a button that opens it to
 * its places), how many places, where and how big, and Manage. `bytes`: what Storage counted of the
 * kinds Offline maps holds, until Offline maps' own figure (with routes and nearby places) is read.
 */
export function OfflineMapsRows({ color, bytes }: { color: string; bytes: number }) {
  const data = useMapData();
  const [open, setOpen] = useState(false);
  const id = useId();
  const places = data.data ? placesIn(data.data).filter((place) => place.sizeBytes > 0) : [];
  const total = data.data?.summary.totalBytes ?? bytes;
  const held = data.data?.summary.locations.filter((location) => location.bytes > 0) ?? [];
  const where = held.map((location) => location.name);
  /**
   * Routes, walking and cycling and the records of nearby places are in Outpost's own data, on its own disk, which no
   * location's bar above counts: said, so that the bars and this figure can be told apart.
   */
  const own = held.find((location) => location.locationId === null)?.bytes ?? 0;
  const stale = places.filter((place) => place.stale > 0).length;
  const count = data.data ? plural(places.length, "place") : null;
  return (
    <>
      <tr data-pattern="storage-row" className={cn(own > 0 && "border-b-0")}>
        <td className="py-2.5 pr-4">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {places.length > 0 ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((value) => !value)}
                className={cn(
                  "-mx-1 inline-flex min-h-6 items-center gap-2.5 rounded-sm px-1 text-ink transition-colors hover:bg-surface-strong",
                  touchSize,
                )}
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
                Offline maps
                {open ? (
                  <ChevronDown aria-hidden className="size-4 text-ink-muted" />
                ) : (
                  <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                )}
              </button>
            ) : (
              <span className="flex items-center gap-2.5 text-ink">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
                Offline maps
              </span>
            )}
            <span className="text-small text-ink-muted">
              {where.length > 0 ? `${namesText(where)} · ` : ""}
              <Link to="/maps/data" className={cn("inline-flex min-h-6 items-center gap-0.5", link, touchSize)}>
                Manage <ChevronRight aria-hidden className="size-4" />
              </Link>
            </span>
          </span>
          {count ? <span className="tabular block pl-5 text-ink-muted @min-[20rem]:hidden">{count}</span> : null}
        </td>
        <td className="tabular py-2.5 pr-4 text-right whitespace-nowrap text-ink-muted @max-[20rem]:hidden">{count}</td>
        <td className="tabular py-2.5 text-right font-medium whitespace-nowrap text-ink">{total > 0 ? formatBytes(total) : "None yet"}</td>
      </tr>
      {own > 0 ? (
        // A row of its own, the table's whole width: in the first cell beside the size it was a column of a word or two on a phone.
        <tr className={cn(open && places.length > 0 && "border-b-0")}>
          <td colSpan={3} className="pb-2.5 pl-5 @max-[20rem]:pl-0">
            <p className="max-w-[60ch] text-small text-ink-muted" data-testid="maps-own-data">
              {held.length > 1
                ? `${held
                    .filter((location) => location.locationId !== null)
                    .map((location) => `${formatBytes(location.bytes)} on ${location.name}`)
                    .join(", ")}, as in its bar above; `
                : ""}
              {formatBytes(own)} of routes and nearby places in Outpost's own data, which the bars above do not show.
            </p>
          </td>
        </tr>
      ) : null}
      {open && places.length > 0 ? (
        <tr id={id}>
          <td colSpan={3} className="pb-3 pl-5 @max-[20rem]:pl-0">
            <ul aria-label="Offline maps by place" className="divide-y divide-border">
              {places.map((place) => (
                <StoragePlace key={place.key} place={place} />
              ))}
            </ul>
            {stale > 0 ? (
              <p className="pt-1 text-small text-ink-muted">
                {stalePlacesLine(stale)}{" "}
                <Link to="/maps/data" className={link}>
                  Check for updates under Offline maps
                </Link>
                .
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
