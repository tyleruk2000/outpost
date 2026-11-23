/**
 * A planned route's directions on screen, read the way the owner writes them: each road's
 * line large and bold ("A26 (E17) - Reims (A4)"), the quieter part under it (which way, the
 * junctions, distance and time), a crossing in a band of its own, a via point as a rule
 * across, and the first and last lines from the door and to the end. A leg is a button:
 * pressing it shows that leg on the map.
 */
import { type RoadRouteResult, roadDistanceText, roadDurationText } from "@outpost/shared";
import { CircleAlert, Flag, MapPin, Ship, TrainFront } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { countriesText, endLine, startLine } from "./words";

const legButton =
  "flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-surface focus-visible:-outline-offset-2 aria-pressed:bg-primary-soft max-md:min-h-11 md:pointer-coarse:min-h-11";

/** The totals: distance, time, countries and the crossing, in one sentence. */
export function RouteTotals({ route }: { route: RoadRouteResult }) {
  const units = route.request.units ?? "km";
  const crossing = route.summary.crossings[0];
  return (
    <p className="tabular text-body text-ink">
      <span className="font-semibold">{roadDistanceText(route.summary.distanceM, units)}</span>, about{" "}
      <span className="font-semibold">{roadDurationText(route.summary.durationS)}</span>
      {crossing ? ` with the crossing` : " driving"}, through {countriesText(route.summary.countries)}.
      <span className="block text-small text-ink-muted">
        Planned {formatDate(route.plannedAt)}. Free-flowing traffic with no stops
        {route.summary.crossings.length > 0 ? "; check-in and waiting for the crossing not included" : ""}.
      </span>
    </p>
  );
}

/** The route's own warnings, each in plain words; one about old road data leads to Map data. */
export function RouteWarnings({ route, onOpenNetworks }: { route: RoadRouteResult; onOpenNetworks?: () => void }) {
  if (route.warnings.length === 0) return null;
  return (
    <div className="grid gap-2">
      {route.warnings.map((warning) => (
        <Notice key={warning} tone="warning" icon={<CircleAlert />}>
          {warning}
          {onOpenNetworks && /in Offline maps|in Map data|from Road networks/.test(warning) ? (
            <span className="mt-2 block">
              <Button size="sm" onClick={onOpenNetworks}>
                Open Offline maps
              </Button>
            </span>
          ) : null}
        </Notice>
      ))}
    </div>
  );
}

export function DirectionsList({
  route,
  selected,
  onLeg,
  startRow,
  endRow,
}: {
  route: RoadRouteResult;
  /** The leg shown on the map, or null. */
  selected: number | null;
  /** Shows a leg on the map; left out, the lines are not buttons. */
  onLeg?: (index: number) => void;
  /** In place of the first and last lines ("Start", "End"): the streets from and to the door, for a door-to-door drive. */
  startRow?: ReactNode;
  endRow?: ReactNode;
}) {
  const start = startLine(route);
  const end = endLine(route);
  const endLineRow = (line: NonNullable<typeof start>) => (
    <li className="flex items-start gap-3 px-4 py-2.5">
      {line.role === "start" ? (
        <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
      ) : (
        <Flag aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
      )}
      <span className="min-w-0">
        <span className="block text-micro text-ink-muted">{line.role === "start" ? "Start" : "End"}</span>
        <span className="block font-title text-lead text-ink">{line.title}</span>
        <span className="block text-small text-ink-muted">{line.detail}</span>
      </span>
    </li>
  );

  return (
    <ol aria-label="Directions" className="divide-y divide-border border-y border-border">
      {startRow ?? (start ? endLineRow(start) : null)}
      {route.legs.map((leg, index) => {
        const key = `${index}-${leg.title}`;
        if (leg.kind === "via") {
          return (
            <li key={key} className="flex items-center gap-3 bg-surface px-4 py-1.5">
              <span aria-hidden className="h-px flex-1 bg-border-strong" />
              <span className="text-small font-medium text-ink">{leg.title}</span>
              <span aria-hidden className="h-px flex-1 bg-border-strong" />
            </li>
          );
        }
        const crossing = leg.kind === "crossing";
        const body = (
          <>
            {crossing ? (
              leg.crossing?.kind === "shuttle" ? (
                <TrainFront aria-hidden className="mt-1.5 size-5 shrink-0 text-ink" />
              ) : (
                <Ship aria-hidden className="mt-1.5 size-5 shrink-0 text-ink" />
              )
            ) : (
              <span aria-hidden className="tabular mt-1.5 w-5 shrink-0 text-right text-micro text-ink-muted">
                {route.legs.slice(0, index + 1).filter((each) => each.kind === "road").length}
              </span>
            )}
            <span className="min-w-0 flex-1">
              {crossing ? <span className="block text-micro font-medium text-ink-muted">Crossing</span> : null}
              <span className="block text-lead leading-snug font-bold break-words text-ink">{leg.title}</span>
              <span className="block text-small text-ink-muted">{leg.detail}</span>
            </span>
          </>
        );
        return (
          <li key={key} className={cn(crossing && "border-y-2 border-ink bg-surface")}>
            {onLeg ? (
              <button type="button" className={legButton} aria-pressed={selected === index} onClick={() => onLeg(index)}>
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-3 px-4 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
      {endRow ?? (end ? endLineRow(end) : null)}
    </ol>
  );
}

/** The networks a route was planned on, their dates, and the credit. */
export function RouteCredit({ route }: { route: RoadRouteResult }) {
  return (
    <p className="text-small text-ink-muted">
      Planned in advance, not live: no traffic, roadworks or closures. Follow the signs, and check closures before you go.{" "}
      {route.credit.line}{" "}
      <Link to="/help/road-routes" className="text-primary underline underline-offset-2">
        About road routes
      </Link>
    </p>
  );
}
