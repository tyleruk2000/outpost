/**
 * The sheet at the foot of the map while Directions is in hand on a phone: what you have got.
 * As tall as what it says (planning, the answer, a step), or the whole room under the bar (the
 * steps, the page to print, the stops and options). Its first line is always the answer, so
 * the route is in view above it and nothing is typed in it.
 */
import { type RoadRouteResult, roadDistanceText, type StreetLine, type StreetsRouteResult } from "@outpost/shared";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Ellipsis,
  Flag,
  List,
  Map as MapIcon,
  MapPin,
  Plus,
  Printer,
  Save,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Segmented, Select, Skeleton, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSaveRoadRoute } from "../road-route/data";
import { DirectionsList, RouteCredit, RouteWarnings } from "../road-route/directions";
import { PlainTextBox } from "../road-route/plain-text";
import { RouteCardPdf } from "../road-route/route-card-pdf";
import { AddRoadsButton, problemCountries, problemOf, RouteNeedsNotice } from "../road-route/route-needs";
import { DoorToDoorList, StreetLinesList, StreetsCredit } from "../road-route/street-directions";
import { addStreetsLabel, ROUTE_MODES, type RouteMode, streetsTitle, unavailableLine } from "../road-route/street-words";
import { routeTitle, suggestedName } from "../road-route/words";
import { type Directions, MAX_STOPS } from "./use-directions";
import { type DirectionsRoute, pointLabel, routeSummary } from "./words";

const sheetPad = "px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]";

/** The four actions under the answer: 52 px each, their words kept at any width. */
const action = "h-auto min-h-13 flex-col gap-0.5 px-1 py-1.5 text-micro [&_svg]:size-5";

const titleOf = (route: DirectionsRoute) => ("mode" in route ? streetsTitle(route) : routeTitle(route));

export function DirectionsSheet({
  directions,
  onHeight,
  onOpenNetworks,
  onOpenStreets,
  onFitLine,
}: {
  directions: Directions;
  /** Told the sheet's height whenever it changes, for the map to keep the route clear of it. */
  onHeight: (height: number) => void;
  onOpenNetworks: (countries?: readonly string[]) => void;
  onOpenStreets: (country?: string | null) => void;
  /** Brings one turn of a walk, a ride or a door's streets into view. */
  onFitLine: (line: StreetLine) => void;
}) {
  const sheet = useRef<HTMLElement>(null);
  const { view, result, choosing } = directions;
  const full = !choosing && view !== "route" && (view === "options" || result !== null);
  const latest = useRef(onHeight);
  latest.current = onHeight;
  useLayoutEffect(() => {
    const element = sheet.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const area = element.parentElement;
    const report = () => {
      const height = Math.round(element.getBoundingClientRect().height);
      latest.current(height);
      // What floats over the map (its buttons, the readout) stands above the sheet, and messages above that.
      area?.style.setProperty("--sheet-height", `${height}px`);
      document.documentElement.style.setProperty("--sheet-toast-lift", `${height}px`);
    };
    report();
    // Told on the next frame: what it moves (the map's buttons, the readout) is watched by observers of its own.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(report);
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      area?.style.removeProperty("--sheet-height");
      document.documentElement.style.removeProperty("--sheet-toast-lift");
    };
  }, []);

  return (
    <section
      ref={sheet}
      aria-label="Directions"
      data-full={full ? "" : undefined}
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 flex flex-col border-t border-border bg-page",
        full ? "top-0" : "max-h-[70%] rounded-t-[14px] shadow-float",
      )}
    >
      {choosing ? (
        <ChooseFoot directions={directions} />
      ) : view === "options" ? (
        <OptionsPage directions={directions} />
      ) : result && view === "steps" ? (
        <StepsPage directions={directions} route={result} onOpenNetworks={onOpenNetworks} onFitLine={onFitLine} />
      ) : result && view === "print" ? (
        <PrintPage directions={directions} route={result} />
      ) : (
        <div className={cn("scroll-quiet min-h-0 overflow-y-auto", sheetPad)}>
          <SheetBody directions={directions} onOpenNetworks={onOpenNetworks} onOpenStreets={onOpenStreets} />
        </div>
      )}
    </section>
  );
}

/** What the sheet says at its summary height: what stops the route, its planning, its answer or the step in hand. */
function SheetBody({
  directions,
  onOpenNetworks,
  onOpenStreets,
}: {
  directions: Directions;
  onOpenNetworks: (countries?: readonly string[]) => void;
  onOpenStreets: (country?: string | null) => void;
}) {
  const { result, step, steps, mode, streets, routeCountry } = directions;
  if (!directions.complete) {
    return (
      <p className="py-2 text-small text-ink-muted">
        {directions.points[0]
          ? "Choose where to, and the route is planned at once."
          : "Choose where from, and the route is planned at once."}
      </p>
    );
  }
  if (result && step !== null && steps[step]) return <StepCard directions={directions} />;
  if (result) return <Summary directions={directions} route={result} />;
  if (directions.planning) {
    return (
      <div className="grid gap-2" aria-busy>
        <div className="flex items-center gap-3">
          <Spinner delay label="Planning" className="size-5 text-lamp" />
          <p className="min-w-0 flex-1 text-body font-semibold text-ink" role="status">
            Planning the route
          </p>
          <Button size="sm" onClick={directions.cancel}>
            Cancel
          </Button>
        </div>
        <p className="text-small text-ink-muted">
          {mode === "drive"
            ? "On the roads kept on this Outpost. The first route in a while can take up to a minute on a small computer. Nothing is sent anywhere."
            : "On the streets built on this Outpost. Nothing is sent anywhere."}
        </p>
      </div>
    );
  }
  if (directions.stopped) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-body text-ink" role="status">
          Planning stopped.
        </p>
        <Button variant="primary" onClick={directions.retry}>
          Plan the route
        </Button>
      </div>
    );
  }
  if (directions.error) {
    const problem = mode === "drive" ? problemOf(directions.error) : null;
    const wanted = problem ? problemCountries(problem) : [];
    const message = errorMessage(directions.error);
    return (
      <div className="grid gap-3">
        <Notice tone="danger" icon={<CircleAlert />} title="The route could not be planned">
          {message}
        </Notice>
        <div className="flex flex-wrap gap-2">
          {wanted.length > 0 ? (
            <AddRoadsButton countries={wanted} onAdd={onOpenNetworks} all={problem !== null && problem.missing.length === 0} />
          ) : mode !== "drive" && /not installed for/i.test(message) ? (
            <Button variant="primary" onClick={() => onOpenStreets(routeCountry?.code)}>
              {addStreetsLabel(routeCountry)}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => directions.openPicker({ index: directions.points.length - 1, adding: false })}>
              Change the end
            </Button>
          )}
          <Button onClick={directions.retry}>Try again</Button>
        </div>
      </div>
    );
  }
  if (mode !== "drive" && streets && directions.blocked) {
    // A way that cannot be used yet still shows; chosen, it says why and what puts it right.
    const { text, action: fix } = unavailableLine(streets, { way: mode, country: routeCountry });
    return (
      <div className="grid justify-items-start gap-3" role="status">
        <p className="text-body text-ink">{text}</p>
        {fix === "add" ? (
          <Button variant="primary" onClick={() => onOpenStreets(routeCountry?.code)}>
            {addStreetsLabel(routeCountry)}
          </Button>
        ) : fix === "progress" ? (
          <Button onClick={() => onOpenStreets()}>See its progress</Button>
        ) : null}
        <Button variant="ghost" onClick={() => directions.setMode("drive")}>
          Drive instead
        </Button>
      </div>
    );
  }
  if (mode === "drive" && directions.blocked) {
    return <RouteNeedsNotice coverage={directions.coverage} onAdd={(codes) => onOpenNetworks(codes)} />;
  }
  // Both ends known, the roads they need being looked up: a moment, said only if it is more than one.
  return (
    <p className="flex items-center gap-2.5 py-2 text-small text-ink-muted" role="status">
      <Spinner delay label="Checking" /> Checking which roads this route needs
    </p>
  );
}

function Summary({ directions, route }: { directions: Directions; route: DirectionsRoute }) {
  const { distance, time, how } = routeSummary(route);
  const save = useSaveRoadRoute();
  const [saved, setSaved] = useState<{ plannedAt: number; name: string } | null>(null);
  const savedNow = saved?.plannedAt === route.plannedAt ? saved : null;
  const drive = !("mode" in route);
  const warnings = route.warnings;
  const heading = useRef<HTMLHeadingElement>(null);
  // A person who chose a result lands on the totals.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each route planned
  useEffect(() => heading.current?.focus({ preventScroll: true }), [route.plannedAt]);
  return (
    <div className="grid gap-3">
      <div>
        <h2 ref={heading} tabIndex={-1} className="flex flex-wrap items-baseline gap-x-2.5 focus:outline-none">
          <span className="tabular text-title font-bold text-ink">{distance}</span>
          <span className="tabular text-lead text-ink-muted">{time}</span>
        </h2>
        <p className="text-small text-ink">{how}</p>
        {warnings.length > 0 ? (
          <p className="mt-1 flex items-start gap-1.5 text-small text-warning">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {/* Said in full at the head of the steps; here, that there is something to read before setting off. */}
            <span>
              {warnings.length === 1
                ? "One thing to know before you go, in Steps."
                : `${warnings.length} things to know before you go, in Steps.`}
            </span>
          </p>
        ) : null}
        <p className="sr-only" role="status">
          Route planned: {distance}, {time}.
        </p>
      </div>
      <div className={cn("grid gap-2", drive ? "grid-cols-4" : "grid-cols-3")}>
        <Button variant="primary" className={action} onClick={() => directions.setView("steps")}>
          <List aria-hidden /> Steps
        </Button>
        {drive ? (
          <Button
            className={action}
            loading={save.isPending}
            aria-pressed={savedNow !== null}
            onClick={() => {
              if (savedNow) return;
              const name = suggestedName(route);
              save.mutate({ name, route }, { onSuccess: (done) => setSaved({ plannedAt: route.plannedAt, name: done.name }) });
            }}
          >
            {savedNow ? <Check aria-hidden /> : <Save aria-hidden />} {savedNow ? "Saved" : "Save"}
          </Button>
        ) : null}
        <Button className={action} onClick={() => directions.setView("print")}>
          <Printer aria-hidden /> Print
        </Button>
        <Button className={action} onClick={() => directions.setView("options")}>
          <Ellipsis aria-hidden /> Options
        </Button>
      </div>
      {savedNow ? (
        <p className="flex items-start gap-2 text-small text-ink" role="status">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          <span>Saved as “{savedNow.name}”, with its directions.</span>
        </p>
      ) : save.isError ? (
        <p className="text-small text-danger" role="alert">
          {errorMessage(save.error)}
        </p>
      ) : null}
    </div>
  );
}

function StepCard({ directions }: { directions: Directions }) {
  const { steps, step } = directions;
  const at = step ?? 0;
  const current = steps[at]!;
  return (
    <div className="grid gap-3">
      <div aria-live="polite">
        <p className="text-small text-ink-muted">
          Step {at + 1} of {steps.length}
        </p>
        <p className="text-lead leading-snug font-bold break-words text-ink">{current.title}</p>
        {current.detail ? <p className="text-small text-ink-muted">{current.detail}</p> : null}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
        <Button aria-label="Previous step" disabled={at === 0} onClick={() => directions.setStep(at - 1)}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          onClick={() => {
            directions.setStep(null);
            directions.setView("steps");
          }}
        >
          <List aria-hidden /> All steps
        </Button>
        <Button variant="primary" disabled={at >= steps.length - 1} onClick={() => directions.setStep(at + 1)}>
          Next <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** The pinned first line of a page: the answer, and Map, the way back to it. */
function PageHead({ route, onMap }: { route: DirectionsRoute; onMap: () => void }) {
  const { distance, time, how } = routeSummary(route);
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="tabular text-body font-bold text-ink">
          {distance} · {time}
        </p>
        <p className="truncate text-small text-ink-muted">{how}</p>
      </div>
      <Button onClick={onMap}>
        <MapIcon aria-hidden /> Map
      </Button>
    </div>
  );
}

function StepsPage({
  directions,
  route,
  onOpenNetworks,
  onFitLine,
}: {
  directions: Directions;
  route: DirectionsRoute;
  onOpenNetworks: (countries?: readonly string[]) => void;
  onFitLine: (line: StreetLine) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const toMap = () => {
    directions.setStep(null);
    directions.setView("route");
  };
  /** A line pressed: the sheet drops to that step, and the map shows it. */
  const openLeg = (leg: number) => {
    const index = directions.steps.findIndex((each) => each.leg === leg);
    if (index >= 0) {
      directions.setStep(index);
      directions.setView("route");
    }
  };
  const streets = "mode" in route ? route : null;
  const road: RoadRouteResult | null = streets ? streets.road : (route as RoadRouteResult);
  const openLine = (line: StreetLine) => {
    const index = streets?.streets?.lines.indexOf(line) ?? -1;
    if (streets && !streets.road && index >= 0) {
      directions.setStep(index);
      directions.setView("route");
    } else {
      onFitLine(line);
      toMap();
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead route={route} onMap={toMap} />
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 ref={heading} tabIndex={-1} className="sr-only">
          Steps
        </h2>
        {streets ? (
          streets.warnings.length > 0 ? (
            <div className="grid gap-2 px-4">
              {streets.warnings.map((warning) => (
                <Notice key={warning} tone="warning" icon={<CircleAlert />}>
                  {warning}
                </Notice>
              ))}
            </div>
          ) : null
        ) : (
          <div className="px-4 empty:hidden">
            <RouteWarnings route={route as RoadRouteResult} onOpenNetworks={() => onOpenNetworks()} />
          </div>
        )}
        <div>
          {streets?.mode === "drive-door" && road ? (
            <DoorToDoorList result={streets} selected={null} onLeg={openLeg} onLine={openLine} />
          ) : streets?.streets ? (
            <div className="border-y border-border">
              <StreetLinesList directions={streets.streets} label="Directions" onLine={openLine} />
            </div>
          ) : road ? (
            <DirectionsList route={road} selected={null} onLeg={openLeg} />
          ) : null}
        </div>
        <div className="grid gap-4 px-4">
          {streets ? <StreetsCredit result={streets} /> : <RouteCredit route={route as RoadRouteResult} />}
          <Button className="justify-self-start" onClick={() => directions.setView("print")}>
            <Printer aria-hidden /> Print or copy as text
          </Button>
        </div>
      </div>
    </div>
  );
}

function PrintPage({ directions, route }: { directions: Directions; route: DirectionsRoute }) {
  const title = titleOf(route);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead route={route} onMap={() => directions.setView("route")} />
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <RouteCardPdf
          route={route}
          name={title}
          defaultOpen
          from={{ what: "a route planned on the map", path: "/maps?tab=routes&road=1" }}
        />
        <PlainTextBox route={route as RoadRouteResult | StreetsRouteResult} title={title} />
      </div>
    </div>
  );
}

/** Choosing a point on the map: the foot says what will be used, and one button uses it. */
function ChooseFoot({ directions }: { directions: Directions }) {
  const target = directions.choosing!;
  const count = directions.points.length;
  const role = target.adding ? "stop" : target.index === 0 ? "start" : target.index === count - 1 ? "end" : "stop";
  return (
    <div className={cn("grid gap-3", sheetPad)}>
      <p className="text-small text-ink-muted">The point under the cross in the middle of the map.</p>
      <Button variant="primary" size="lg" onClick={() => directions.takeCentre()}>
        Use this point as the {role}
      </Button>
    </div>
  );
}

function OptionsPage({ directions }: { directions: Directions }) {
  const { points } = directions;
  const count = points.length;
  const stops = count - 2;
  return (
    <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-6 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
      <section aria-label="Stops">
        <ul className="divide-y divide-border border-b border-border">
          {points.map((point, index) => {
            const label = pointLabel(index, count);
            const icon: ReactNode =
              index === count - 1 ? (
                <Flag aria-hidden className="size-5 shrink-0 text-ink-muted" />
              ) : (
                <MapPin aria-hidden className="size-5 shrink-0 text-ink-muted" />
              );
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: a point is its place in the order
              <li key={index} className="flex items-center">
                <button
                  type="button"
                  onClick={() => directions.openPicker({ index, adding: false })}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left hover:bg-surface focus-visible:-outline-offset-2"
                >
                  {icon}
                  <span className="min-w-0">
                    <span className="block text-body font-semibold break-words text-ink">{point?.name ?? "Not chosen"}</span>
                    <span className="block text-small text-ink-muted">{label}</span>
                  </span>
                </button>
                {index > 0 && index < count - 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${label.toLowerCase()}`}
                    className="mr-2"
                    onClick={() => directions.removeStop(index)}
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {stops < MAX_STOPS ? (
          <Button
            variant="ghost"
            className="mx-2 mt-1 text-primary"
            onClick={() => directions.openPicker({ index: count - 1, adding: true })}
          >
            <Plus aria-hidden /> Add a stop
          </Button>
        ) : (
          <p className="px-4 pt-2 text-small text-ink-muted">Ten stops is as many as a route takes.</p>
        )}
      </section>
      <div className="grid gap-5 px-4">
        {directions.streetsInstalled ? (
          <div className="grid justify-items-start gap-1.5">
            <p aria-hidden className="text-small font-medium text-ink">
              Way of travelling
            </p>
            <Segmented<RouteMode> label="Way of travelling" value={directions.mode} onChange={directions.setMode} options={ROUTE_MODES} />
          </div>
        ) : null}
        <div className="grid justify-items-start gap-1.5">
          <p aria-hidden className="text-small font-medium text-ink">
            Distances in
          </p>
          <Segmented
            label="Distances in"
            value={directions.units}
            onChange={directions.setUnits}
            options={[
              { value: "km", label: "Kilometres" },
              { value: "miles", label: "Miles" },
            ]}
          />
        </div>
        {directions.seaCrossing ? (
          <Field
            label="Sea crossing"
            hint="This route crosses the sea. Choose how, or let Outpost choose; the time given is time on board."
          >
            {(ids) =>
              directions.crossings.isError ? (
                <p className="text-small text-danger">{errorMessage(directions.crossings.error)}</p>
              ) : directions.crossings.isPending ? (
                <Skeleton className="h-11" />
              ) : (
                <Select
                  {...ids}
                  value={directions.crossing}
                  onChange={(value) => directions.setCrossing(value)}
                  options={directions.crossingOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                    description: option.description,
                    disabled: option.disabled,
                  }))}
                />
              )
            }
          </Field>
        ) : null}
        {directions.result ? (
          <p className="text-small text-ink-muted">
            {roadDistanceText(directions.result.summary.distanceM, directions.units)} as planned. A change here plans the route again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
