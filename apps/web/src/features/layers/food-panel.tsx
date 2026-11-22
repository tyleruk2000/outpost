/**
 * Under the food and supplies switch in the Layers tab: the kinds with their marks (each
 * a button that shows that kind alone), what the layer is and how far to trust it, and
 * the nearest of each kind to the current household's home or the middle of the map, with distance and
 * bearing. The nearest list is worked out by Outpost from what is held; nothing is asked
 * of any source.
 */
import { FOOD_KINDS, FOOD_WORDS, homeLabel, type ReferenceLayerSummary } from "@outpost/shared";
import { Select, Skeleton } from "@/components/ui/misc";
import { useHome } from "@/features/households/home";
import { useStoredState } from "@/features/maps/hooks";
import { formatBearing, formatDistanceWithMiles, type LatLon } from "@/features/maps/lib/geo";
import { cn, formatNumber } from "@/lib/utils";
import { useNearest } from "./data";
import { FoodMark } from "./food-symbols";

type From = "home" | "map";
const isFrom = (value: unknown): value is From => value === "home" || value === "map";
const ORDER = FOOD_KINDS.map((entry) => entry.kind as string);

export function FoodSection({
  summary,
  colour,
  kind,
  onKind,
  centre,
  onOpen,
}: {
  summary: ReferenceLayerSummary;
  colour: string;
  /** The kind shown alone, or null for every kind. */
  kind: string | null;
  onKind: (kind: string | null) => void;
  /** The middle of the map, or null before it is drawn. */
  centre: LatLon | null;
  onOpen: (id: number, at: LatLon) => void;
}) {
  const kinds = [...summary.kinds].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const alone = kind && kinds.some((entry) => entry.kind === kind) ? kind : null;
  const home = useHome().home;
  const [stored, setFrom] = useStoredState<From>("outpost.maps.food-nearest-from", isFrom, "home");
  const from: From = stored === "home" && !home ? "map" : stored;
  const origin = from === "home" && home ? { lat: home.lat, lon: home.lon } : centre;
  const originName = from === "home" && home ? homeLabel({ name: home.name || "home", at: home.at }, Date.now()) : "the middle of the map";
  const nearest = useNearest(origin, "food", alone);
  const aloneLabel = kinds.find((entry) => entry.kind === alone)?.label.toLowerCase();

  return (
    <div className="mt-2 grid gap-3 pl-[30px]">
      <div>
        <p className="text-small text-ink-muted">Press a kind to show it alone.</p>
        <ul className="mt-1 grid" aria-label="Kinds of place">
          {kinds.map((entry) => {
            const pressed = alone === entry.kind;
            return (
              <li key={entry.kind}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onKind(pressed ? null : entry.kind)}
                  className={cn(
                    "-mx-1.5 flex min-h-11 w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-control px-1.5 text-left text-small text-ink hover:bg-surface md:min-h-9",
                    pressed && "bg-primary-soft font-medium hover:bg-primary-soft",
                    alone && !pressed && "text-ink-muted",
                  )}
                >
                  <FoodMark kind={entry.kind} colour={colour} className={cn("size-[22px] shrink-0", alone && !pressed && "opacity-45")} />
                  <span className="min-w-0 flex-1">{entry.label}</span>
                  <span className="tabular shrink-0 text-ink-muted">{formatNumber(entry.count)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {alone ? (
          <button
            type="button"
            onClick={() => onKind(null)}
            className="mt-1 min-h-11 text-small text-primary underline underline-offset-2 md:min-h-0"
          >
            Show every kind
          </button>
        ) : null}
      </div>

      <section aria-label="Nearest">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h4 className="text-small font-semibold text-ink">{alone ? `Nearest ${aloneLabel}` : "Nearest of each kind"}</h4>
          <Select
            aria-label="Measured from"
            value={from}
            onChange={(value) => setFrom(value as From)}
            options={[
              ...(home ? [{ value: "home", label: `From ${home.name || "home"}` }] : []),
              { value: "map", label: "From the middle of the map" },
            ]}
            className="w-auto min-w-0"
          />
        </div>
        {!origin ? (
          <p className="mt-1 text-small text-ink-muted">The map is not drawn yet, so there is no middle to measure from.</p>
        ) : nearest.isPending ? (
          <div className="mt-1 grid gap-1.5" aria-busy>
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <span className="sr-only">Finding the nearest</span>
          </div>
        ) : nearest.isError ? (
          <p className="mt-1 text-small text-danger">The nearest could not be worked out. Try again in a moment.</p>
        ) : nearest.data.hits.length === 0 ? (
          <p className="mt-1 text-small text-ink-muted">
            {alone ? `No ${aloneLabel} is held` : "Nothing is held"} within {formatDistanceWithMiles(nearest.data.withinMeters)} of{" "}
            {originName}. Fetch the area under Manage reference data.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-border" aria-label={`Nearest to ${originName}`}>
            {nearest.data.hits.map((hit) => (
              <li key={`${hit.kind}:${hit.id}`}>
                <button
                  type="button"
                  onClick={() => onOpen(hit.id, { lat: hit.lat, lon: hit.lon })}
                  className="flex min-h-11 w-full items-center gap-2.5 py-1.5 text-left text-small hover:text-primary"
                >
                  <FoodMark kind={hit.kind} colour={colour} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{hit.name || hit.kindLabel}</span>
                    {!alone && hit.name ? <span className="block truncate text-ink-muted">{hit.kindLabel}</span> : null}
                  </span>
                  <span className="tabular shrink-0 text-right text-ink">
                    {formatDistanceWithMiles(hit.distanceMeters)}
                    <span className="block text-ink-muted">{formatBearing(hit.bearingDegrees)}</span>
                    <span className="sr-only"> from {originName}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {origin ? <p className="mt-1 text-micro text-ink-muted">In a straight line, from what is held on this device.</p> : null}
      </section>

      <div className="grid gap-1 text-small text-ink-muted">
        <p>{FOOD_WORDS.coverage}</p>
        <p>
          Volunteers' mapping and the Food Standards Agency's list, as of the day each was fetched. Neither says a place is open, stocked or
          still there. {FOOD_WORDS.emergency}
        </p>
      </div>
    </div>
  );
}
