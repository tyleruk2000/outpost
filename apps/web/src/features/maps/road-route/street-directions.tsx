/**
 * Turn-by-turn lines on streets: a whole walk or ride as one short list, and the two ends of
 * a door-to-door drive folded round the owner's main-road lines ("From your door to the A24
 * (8 turns, 2.1 km)"), closed until opened. Each turn is a button that shows where it is.
 */
import type { StreetDirections, StreetLine, StreetsRouteResult } from "@outpost/shared";
import { ArrowUp, CornerUpLeft, CornerUpRight, Flag, MapPin, RotateCw, Ship } from "lucide-react";
import { Link } from "react-router";
import { formatDate } from "@/lib/utils";
import { DirectionsList } from "./directions";
import { climbText, endTurnsTitle, steepestText, streetsTotals, turnsSummary } from "./street-words";

const lineButton =
  "flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-surface focus-visible:-outline-offset-2 max-md:min-h-11 md:pointer-coarse:min-h-11";

function LineIcon({ line }: { line: StreetLine }) {
  const icon = "mt-0.5 size-4 shrink-0 text-ink-muted";
  if (line.kind === "start") return <MapPin aria-hidden className={icon} />;
  if (line.kind === "arrive") return <Flag aria-hidden className={icon} />;
  if (line.kind === "roundabout") return <RotateCw aria-hidden className={icon} />;
  if (line.kind === "ferry") return <Ship aria-hidden className={icon} />;
  // The way of the turn, from its words: "Turn left", "Bear right", "Keep left at the fork".
  const way = /\bleft\b/i.test(line.text) ? "left" : /\bright\b/i.test(line.text) ? "right" : null;
  if (way === "left") return <CornerUpLeft aria-hidden className={icon} />;
  if (way === "right") return <CornerUpRight aria-hidden className={icon} />;
  return <ArrowUp aria-hidden className={icon} />;
}

/** The turns, in order: what to do, and how far to the next. */
export function StreetLinesList({
  directions,
  label,
  onLine,
}: {
  directions: StreetDirections;
  label: string;
  /** Shows where a line happens on the map; left out, the lines are not buttons. */
  onLine?: (line: StreetLine) => void;
}) {
  return (
    <ol aria-label={label} className="divide-y divide-border">
      {directions.lines.map((line, index) => {
        const body = (
          <>
            <LineIcon line={line} />
            <span className="min-w-0 flex-1 text-body break-words text-ink">{line.text}</span>
            {line.distanceText ? <span className="tabular shrink-0 pt-0.5 text-small text-ink-muted">{line.distanceText}</span> : null}
          </>
        );
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a line is its place in the order
          <li key={index}>
            {onLine ? (
              <button type="button" className={lineButton} onClick={() => onLine(line)}>
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-3 px-4 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** One end of a door-to-door drive: its title and count, the turns under it once opened. */
export function EndTurns({
  title,
  directions,
  units,
  which,
  onLine,
}: {
  title: string;
  directions: StreetDirections;
  units: "km" | "miles";
  which: "start" | "end";
  onLine?: (line: StreetLine) => void;
}) {
  return (
    <li>
      <details className="group" data-testid={`door-${which}`}>
        <summary className="flex cursor-default items-start gap-3 px-4 py-2.5 marker:content-none hover:bg-surface max-md:min-h-11 md:pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          {which === "start" ? (
            <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
          ) : (
            <Flag aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-micro text-ink-muted">{which === "start" ? "Start" : "End"}</span>
            <span className="block text-body font-semibold text-ink">{title}</span>
            <span className="tabular block text-small text-ink-muted">
              {turnsSummary(directions, units)}
              <span className="group-open:hidden"> · show the turns</span>
              <span className="hidden group-open:inline"> · hide the turns</span>
            </span>
          </span>
        </summary>
        <div className="pb-1 pl-7">
          <StreetLinesList directions={directions} label={title} onLine={onLine} />
        </div>
      </details>
    </li>
  );
}

/** A door-to-door drive: the owner's lines, with the streets at each end folded in. */
export function DoorToDoorList({
  result,
  selected,
  onLeg,
  onLine,
}: {
  result: StreetsRouteResult;
  selected: number | null;
  onLeg?: (index: number) => void;
  onLine?: (line: StreetLine) => void;
}) {
  const units = result.request.units ?? "km";
  if (!result.road) return null;
  return (
    <DirectionsList
      route={result.road}
      selected={selected}
      onLeg={onLeg}
      startRow={
        result.start ? (
          <EndTurns title={endTurnsTitle(result, "start")} directions={result.start} units={units} which="start" onLine={onLine} />
        ) : undefined
      }
      endRow={
        result.end ? (
          <EndTurns title={endTurnsTitle(result, "end")} directions={result.end} units={units} which="end" onLine={onLine} />
        ) : undefined
      }
    />
  );
}

export function StreetsTotals({ result }: { result: StreetsRouteResult }) {
  const [distance, time] = streetsTotals(result).split(", about ");
  const hills = result.hills ?? null;
  const climb = hills ? climbText(hills) : null;
  const steepest = steepestText(result);
  return (
    <p className="tabular text-body text-ink">
      <span className="font-semibold">{distance}</span>, about <span className="font-semibold">{time}</span>.
      {climb ? (
        // The climb over the installed terrain, which the time allows for: "↑ 310 m ↓ 280 m".
        <span className="block text-small text-ink">
          <span aria-hidden>{climb.short}</span>
          <span className="sr-only">{climb.words}</span>
          {steepest ? <span className="text-ink-muted">. {steepest}</span> : null}
        </span>
      ) : null}
      <span className="block text-small text-ink-muted">
        Planned {formatDate(result.plannedAt)}.{" "}
        {result.mode === "drive-door"
          ? "Free-flowing traffic with no stops."
          : hills
            ? "Hills counted, no stops."
            : "At an even pace, with no stops."}
      </span>
    </p>
  );
}

export function StreetsCredit({ result }: { result: StreetsRouteResult }) {
  return (
    <p className="text-small text-ink-muted">
      Planned in advance, not live: no traffic, roadworks or closures. Follow the signs, and check closures before you go. {result.credit}{" "}
      <Link to="/help/road-routes" className="text-primary underline underline-offset-2">
        About routes
      </Link>
    </p>
  );
}
