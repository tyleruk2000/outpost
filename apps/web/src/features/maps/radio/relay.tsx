/**
 * The relay planner, in the line-of-sight panel: with A and B chosen, high ground in sight of both, where a relay
 * could stand, ranked by height and by distance; on the map, the ground in sight of both shaded as a range is, the
 * places numbered, and the line of sight from the one chosen to each end.
 *
 * It asks the server once a person presses for it (`GET /api/maps/relay`), which reads the two places' viewsheds
 * together; see the server's relay.ts.
 */
import type { RelayCandidate, RelayPlan } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented, Spinner } from "@/components/ui/misc";
import { RANGE_SHADE_OPACITY, rangeShade } from "@/features/repeaters/map/range";
import { api, errorMessage } from "@/lib/api";
import { cn, formatNumber as formatDecimal } from "@/lib/utils";
import { useShadeColour, useStoredState } from "../hooks";
import { formatDistance, formatHeight, type LatLon } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { EMPTY, type FeatureCollection } from "../map/overlays";
import { canShade } from "../map/shades";
import { useShades } from "../map/use-shades";
import { NumberField } from "./sight-panel";

export const RELAY_SOURCE = "o-relay";
const RELAY_KEY = "outpost.maps.relay";
/** A radio held up on the hilltop, unless told otherwise. */
const RELAY_DEFAULT_METERS = 1.5;

const isRelayHeight = (value: unknown): value is number => typeof value === "number" && value >= 0 && value <= 1000;
const text = (position: LatLon) => `${position.lat.toFixed(5)},${position.lon.toFixed(5)}`;

export type RelayOrder = "height" | "distance";

/** The places in an order: the highest first (to the 10 m), or those with the shorter longer leg first. */
export function orderCandidates(candidates: RelayCandidate[], order: RelayOrder): RelayCandidate[] {
  const longer = (cell: RelayCandidate) => Math.max(cell.fromAMeters, cell.fromBMeters);
  return [...candidates].sort((x, y) =>
    order === "height"
      ? Math.round(y.groundMeters / 10) - Math.round(x.groundMeters / 10) || longer(x) - longer(y)
      : longer(x) - longer(y) || y.groundMeters - x.groundMeters,
  );
}

/** The places as map data, numbered as listed, with the line of sight from the one chosen to each end. */
export function relayData(plan: RelayPlan | undefined, listed: RelayCandidate[], chosen: number | null): FeatureCollection {
  if (!plan) return EMPTY;
  const features: FeatureCollection["features"] = [];
  const pick = chosen === null ? undefined : listed[chosen];
  if (pick) {
    for (const end of [plan.a, plan.b])
      features.push({
        type: "Feature",
        properties: { kind: "leg" },
        geometry: {
          type: "LineString",
          coordinates: [
            [end.lon, end.lat],
            [pick.at.lon, pick.at.lat],
          ],
        },
      });
  }
  listed.forEach((cell, index) => {
    features.push({
      type: "Feature",
      properties: { kind: "relay", label: String(index + 1), chosen: index === chosen },
      geometry: { type: "Point", coordinates: [cell.at.lon, cell.at.lat] },
    });
  });
  return { type: "FeatureCollection", features };
}

const ORDER_OPTIONS: Array<{ value: RelayOrder; label: string }> = [
  { value: "height", label: "Highest first" },
  { value: "distance", label: "Nearest first" },
];

export function RelaySection({
  engine,
  from,
  to,
  heightA,
  heightB,
}: {
  engine: MapEngine | null;
  from: LatLon;
  to: LatLon;
  /** The aerials' heights above the ground at A and B, as the check uses them. */
  heightA: number;
  heightB: number;
}) {
  const [relayHeight, setRelayHeight] = useStoredState(RELAY_KEY, isRelayHeight, RELAY_DEFAULT_METERS);
  const [order, setOrder] = useState<RelayOrder>("height");
  const [chosen, setChosen] = useState<number | null>(null);
  const question = { a: text(from), b: text(to), aHeight: String(heightA), bHeight: String(heightB), relay: String(relayHeight) };
  const key = JSON.stringify(question);
  // Asked only when pressed; a new question (another end, another height) waits for the next press.
  const [asked, setAsked] = useState<string | null>(null);
  const plan = useQuery({
    queryKey: ["maps", "relay", key],
    queryFn: ({ signal }) => api.get<RelayPlan>("/api/maps/relay", question, signal),
    enabled: asked === key,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const shown = asked === key ? plan.data : undefined;
  const listed = useMemo(() => (shown ? orderCandidates(shown.candidates, order) : []), [shown, order]);

  // The map: the ground in sight of both, the places numbered, and the lines of sight from the one chosen.
  useEffect(() => {
    engine?.setOverlay(RELAY_SOURCE, relayData(shown, listed, chosen));
  }, [engine, shown, listed, chosen]);
  useEffect(() => () => engine?.setOverlay(RELAY_SOURCE, EMPTY), [engine]);
  const colour = useShadeColour("range");
  const pictures = useMemo(
    () => (engine && canShade() && shown?.both ? [rangeShade(shown.both, colour)].flatMap((one) => (one ? [one] : [])) : []),
    [engine, shown, colour],
  );
  useShades(engine, "relay", pictures, RANGE_SHADE_OPACITY);

  return (
    <section aria-labelledby="relay-title" className="grid gap-2.5 border-t border-border pt-3">
      <div>
        <h3 id="relay-title" className="text-small font-medium text-ink">
          A relay between A and B
        </h3>
        <p className="text-small text-ink-muted">
          High ground in sight of both, where a relay could stand: worked out from the ground each can see over the terrain, out to 100 km
          from each.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="w-40">
          <NumberField label="Relay aerial" value={relayHeight} min={0} max={1000} unit="m" onChange={setRelayHeight} />
        </div>
        <Button
          onClick={() => {
            setChosen(null);
            setAsked(key);
          }}
          disabled={asked === key && plan.isFetching}
        >
          Find high ground in sight of both
        </Button>
      </div>

      <div aria-live="polite" className="grid gap-2">
        {asked !== key ? null : plan.isPending ? (
          <p className="flex items-center gap-2 text-small text-ink-muted">
            <Spinner label="Looking for high ground" /> Looking at the ground each end can see. This takes a few seconds.
          </p>
        ) : plan.isError ? (
          <Notice
            tone="danger"
            icon={<CircleAlert />}
            title="High ground in sight of both could not be found"
            action={
              <Button size="sm" variant="ghost" onClick={() => plan.refetch()}>
                Try again
              </Button>
            }
          >
            {errorMessage(plan.error)}
          </Notice>
        ) : shown?.coverage === "none" ? (
          <p className="text-small text-ink-muted">No terrain is held under A or B, so there is no saying what either can see.</p>
        ) : shown && listed.length === 0 ? (
          <p className="text-small text-ink">
            No ground within reach is in sight of both with these heights. A taller aerial at either end or at the relay may find some.
          </p>
        ) : shown ? (
          <>
            <p className="text-small text-ink">
              {listed.length === 1 ? "One place" : `${formatDecimal(listed.length)} places`} in sight of both, shaded green on the map with
              the rest of the ground in sight of both. Choose one to see its lines of sight to A and B.
              {shown.coverage === "partial" ? " Terrain covers only part of the area, so there may be more." : ""}
            </p>
            <Segmented label="Order" value={order} onChange={setOrder} options={ORDER_OPTIONS} />
            <ol className="grid border-t border-border">
              {listed.map((cell, index) => (
                <li key={`${cell.at.lat},${cell.at.lon}`} className="border-b border-border">
                  <button
                    type="button"
                    aria-pressed={chosen === index}
                    onClick={() => setChosen(chosen === index ? null : index)}
                    className={cn(
                      "tabular flex min-h-11 w-full items-center gap-3 py-1.5 text-left text-small text-ink hover:bg-surface-strong",
                      chosen === index && "bg-primary-soft",
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-content-center rounded-full bg-[var(--map-range)] text-micro font-semibold text-page"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">Ground {formatHeight(cell.groundMeters)} above sea level</span>
                      <span className="block text-ink-muted">
                        {formatDistance(cell.fromAMeters)} from A, {formatDistance(cell.fromBMeters)} from B
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="text-small text-ink-muted">
              Line of sight only, for a relay aerial {formatHeight(relayHeight)} above the ground, as the estimated range works it out: no
              woods, buildings, power or band. Check a place with the line-of-sight tool before relying on it.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
