/**
 * Maps' "Nearest": the nearest hospital, pharmacy, shelter, drinking water or fuel, from the
 * reference layers held on this Outpost, without switching a layer on. Each is listed with its
 * distance and bearing from home (or the middle of the map) and two actions: Directions, and
 * Show on the map. Worked out by Outpost from what is held; nothing is asked of any source.
 */
import {
  homeLabel,
  NEAREST_KINDS,
  type NearestHit,
  type NearestKind,
  type ReferenceLayerId,
  type ReferenceLayersResponse,
} from "@outpost/shared";
import { Route as RouteIcon } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Select, Skeleton } from "@/components/ui/misc";
import { useLayersSummary, useNearest } from "@/features/layers/data";
import { cn } from "@/lib/utils";
import { useStoredState } from "../hooks";
import { formatBearing, formatDistanceWithMiles, type LatLon } from "../lib/geo";

/** Where each kind is held: a layer, and the kind within it (or any record of the layer). */
export const NEAREST_SPECS: Record<NearestKind, { label: string; one: string; layer: ReferenceLayerId; kind: string | null }> = {
  hospital: { label: "Hospital", one: "hospital", layer: "hospitals", kind: null },
  pharmacy: { label: "Pharmacy", one: "pharmacy", layer: "food", kind: "food:pharmacy" },
  shelter: { label: "Shelter", one: "shelter", layer: "shelters", kind: null },
  water: { label: "Water", one: "drinking water", layer: "food", kind: "food:water" },
  fuel: { label: "Fuel", one: "fuel station", layer: "food", kind: "food:fuel" },
};

export const isNearestKind = (value: unknown): value is NearestKind => (NEAREST_KINDS as readonly unknown[]).includes(value);

/** The kinds this Outpost holds anything of, in the order they are offered. */
export function heldKinds(summary: ReferenceLayersResponse | undefined): NearestKind[] {
  const layers = summary?.layers ?? [];
  return NEAREST_KINDS.filter((kind) => {
    const spec = NEAREST_SPECS[kind];
    const layer = layers.find((entry) => entry.id === spec.layer);
    if (!layer || layer.count === 0) return false;
    return spec.kind === null || layer.kinds.some((entry) => entry.kind === spec.kind && entry.count > 0);
  });
}

type From = "home" | "map";
const isFrom = (value: unknown): value is From => value === "home" || value === "map";

export function NearestDialog({
  open,
  onOpenChange,
  kind,
  onKind,
  home,
  centre,
  onDirections,
  onShow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: NearestKind;
  onKind: (kind: NearestKind) => void;
  home: { name: string; lat: number; lon: number; at: number | null } | null;
  /** The middle of the map, or null before it is drawn. */
  centre: LatLon | null;
  onDirections: (hit: NearestHit) => void;
  onShow: (hit: NearestHit, layer: ReferenceLayerId) => void;
}) {
  const summary = useLayersSummary(open);
  const held = heldKinds(summary.data);
  const shown: NearestKind | null = held.includes(kind) ? kind : (held[0] ?? null);
  const spec = shown ? NEAREST_SPECS[shown] : null;
  const [stored, setFrom] = useStoredState<From>("outpost.maps.nearest.from", isFrom, "home");
  const from: From = stored === "home" && !home ? "map" : stored;
  const origin = from === "home" && home ? { lat: home.lat, lon: home.lon } : centre;
  const originName = from === "home" && home ? homeLabel({ name: home.name || "home", at: home.at }, Date.now()) : "the middle of the map";
  const nearest = useNearest(origin, spec?.layer ?? "food", spec?.kind ?? null, open && spec !== null, spec?.kind === null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nearest" size="md">
        <DialogBody className="grid gap-4">
          {summary.isPending ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="h-11" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <span className="sr-only">Finding what is held</span>
            </div>
          ) : summary.isError ? (
            <div className="grid justify-items-start gap-2" role="alert">
              <p className="text-small text-danger">What is held could not be read. Try again in a moment.</p>
              <Button size="sm" onClick={() => void summary.refetch()}>
                Try again
              </Button>
            </div>
          ) : !spec || !shown ? (
            <div className="grid justify-items-start gap-3">
              <p className="text-body text-ink">No hospitals, pharmacies, shelters, drinking water or fuel are held on this Outpost yet.</p>
              <p className="text-small text-ink-muted">
                They come from Nearby places in Offline maps, for the places you choose, and then work with no connection.
              </p>
              <Button asChild variant="primary">
                <Link to="/maps/data?get=places">Add nearby places</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                {/* One press each: the kinds held, as large buttons, the one shown pressed. */}
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="sr-only">What to find</legend>
                  {held.map((each) => (
                    <button
                      key={each}
                      type="button"
                      aria-pressed={each === shown}
                      onClick={() => onKind(each)}
                      className={cn(
                        "min-h-11 rounded-control border px-3.5 text-small font-medium transition-colors duration-(--duration-fast)",
                        each === shown
                          ? "border-primary bg-primary-soft text-ink"
                          : "border-border-strong bg-surface text-ink-muted hover:bg-surface-strong hover:text-ink",
                      )}
                    >
                      {NEAREST_SPECS[each].label}
                    </button>
                  ))}
                </fieldset>
                {home ? (
                  <Select
                    aria-label="Measured from"
                    value={from}
                    onChange={(value) => setFrom(value as From)}
                    options={[
                      { value: "home", label: `From ${home.name || "home"}` },
                      { value: "map", label: "From the middle of the map" },
                    ]}
                    className="w-auto min-w-0 justify-self-start"
                  />
                ) : (
                  <p className="text-small text-ink-muted">From the middle of the map.</p>
                )}
              </div>

              <section aria-label={`Nearest ${spec.one}`} aria-busy={nearest.isFetching || undefined}>
                {!origin ? (
                  <p className="text-small text-ink-muted">The map is not drawn yet, so there is no middle to measure from.</p>
                ) : nearest.isPending ? (
                  <div className="grid gap-2" aria-busy>
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                    <span className="sr-only">Finding the nearest</span>
                  </div>
                ) : nearest.isError ? (
                  <div className="grid justify-items-start gap-2" role="alert">
                    <p className="text-small text-danger">The nearest could not be worked out. Try again in a moment.</p>
                    <Button size="sm" onClick={() => void nearest.refetch()}>
                      Try again
                    </Button>
                  </div>
                ) : nearest.data.hits.length === 0 ? (
                  <p className="text-small text-ink-muted">
                    No {spec.one} is held within {formatDistanceWithMiles(nearest.data.withinMeters)} of {originName}. Add nearby places for
                    there under{" "}
                    <Link to="/maps/data?get=places" className="text-primary underline underline-offset-2">
                      Offline maps
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="divide-y divide-border border-y border-border" aria-label={`Nearest to ${originName}`}>
                    {nearest.data.hits.map((hit) => (
                      <li key={`${hit.kind}:${hit.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => onShow(hit, spec.layer)}
                          className="min-h-11 min-w-0 rounded-control text-left hover:text-primary focus-visible:outline-offset-2"
                        >
                          <span className="block text-body font-semibold break-words text-ink">{hit.name || hit.kindLabel}</span>
                          <span className="tabular block text-small text-ink-muted">
                            {formatDistanceWithMiles(hit.distanceMeters)} · {formatBearing(hit.bearingDegrees)}
                            {hit.name ? ` · ${hit.kindLabel}` : ""}
                          </span>
                          <span className="sr-only">{`, from ${originName}. Show on the map`}</span>
                        </button>
                        <Button
                          size="sm"
                          variant="primary"
                          aria-label={`Directions to ${hit.name || hit.kindLabel}`}
                          onClick={() => onDirections(hit)}
                          className="max-md:h-11 md:pointer-coarse:h-11"
                        >
                          <RouteIcon aria-hidden /> Directions
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {origin ? (
                  <p className="mt-2 text-micro text-ink-muted">
                    In a straight line, from what is held on this device, as of the day it was fetched. It does not say a place is open.
                  </p>
                ) : null}
              </section>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
