/**
 * "Plan a route" in the Routes tab. Drive: planned, high-level road directions worked out on
 * this Outpost from the road networks installed, read as the main roads and the places on
 * their signs ("M20 - Folkestone", "A26 (E17) - Reims (A4)"), saved and printed. Where the
 * optional streets service is installed, three more ways: Door to door (the same lines with
 * the streets from and to the door folded in at each end), Walk and Cycle (turn by turn on
 * streets). Never live; nothing here reaches the internet.
 *
 * Where the streets service is not installed (most installations) there is nothing to
 * choose, so no choice is shown: a single line under the form says the other ways exist and
 * how to add them. Where it is installed but cannot answer a way yet, that way still shows,
 * and choosing it says why in one line with the step that puts it right.
 *
 * Four views: the form (way, start, via points, end, the crossing, Plan route), with the
 * saved routes under it; a planned drive (directions, save, print, plain text); a route
 * planned on streets (the same, without saving); and a saved drive (rename and delete).
 */
import type {
  MarkerDto,
  RoadCrossingChoice,
  RoadDistanceUnit,
  RoadRouteResult,
  SavedRoadRouteDto,
  StreetLine,
  StreetsRouteResult,
  StreetsStatusResponse,
} from "@outpost/shared";
import { roadDistanceText, roadDurationText } from "@outpost/shared";
import { ArrowLeft, CircleAlert, Plus, Route, Save, Scan, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select, Skeleton, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useStoredState } from "../hooks";
import type { LatLon } from "../lib/geo";
import { countryName } from "../lib/search";
import type { MapEngine } from "../map/engine";
import {
  useDeleteRoadRoute,
  usePlanRoadRoute,
  useRenameRoadRoute,
  useRoadCoverage,
  useRoadCrossings,
  useRoadNetworks,
  useSavedRoadRoute,
  useSavedRoadRoutes,
  useSaveRoadRoute,
} from "./data";
import { DirectionsList, RouteCredit, RouteTotals, RouteWarnings } from "./directions";
import { PlainTextBox } from "./plain-text";
import { PointField } from "./point-field";
import { RouteCardPdf } from "./route-card-pdf";
import { AddRoadsButton, problemCountries, problemOf, RouteNeedsNotice, routeNeeds } from "./route-needs";
import { DoorToDoorList, StreetLinesList, StreetsCredit, StreetsTotals } from "./street-directions";
import {
  addStreetsLabel,
  type CountryRef,
  geometryBounds,
  isRouteMode,
  MODE_LINES,
  modeAvailable,
  ROUTE_MODES,
  type RouteMode,
  streetsMissFor,
  streetsTitle,
  unavailableLine,
} from "./street-words";
import { usePlanStreetsRoute, useStreetsStatus } from "./streets-data";
import { crossingOptions, legBounds, legLines, type RoutePointChoice, routeBounds, routeTitle, suggestedName } from "./words";

export type RoadRouteMap = Pick<MapEngine, "getCenter" | "fitBounds">;

/** A point pressed on the map, handed to the panel: "Road route from here", "… to here". */
export interface RoadRouteIntent {
  role: "from" | "to";
  point: RoutePointChoice;
  /** Changes with each press, so the same point twice is still a press. */
  at: number;
}

/** Ten via points at most: twelve points in all, as the server takes. */
const MAX_VIAS = 10;
const UNITS_KEY = "outpost.maps.roadRoute.units";
const MODE_KEY = "outpost.maps.roadRoute.mode";
const isUnits = (value: unknown): value is RoadDistanceUnit => value === "km" || value === "miles";

const header = (label: string, onBack: () => void) => (
  // The sheet's first line on a phone while this has the sheet (its tabs put away): what shows when it is lowered.
  <div data-sheet-peek className="flex items-center gap-1 border-b border-border px-2 py-1.5">
    <Button variant="ghost" size="sm" onClick={onBack} className="max-md:min-h-11 md:pointer-coarse:min-h-11">
      <ArrowLeft /> {label}
    </Button>
  </div>
);

type View = { kind: "plan" } | { kind: "planned" } | { kind: "streets" } | { kind: "saved"; id: string };

/** A route the panel draws on the map: a drive, or one planned on streets. */
export type ShownRoute = RoadRouteResult | StreetsRouteResult;

export function RoadRoutePanel({
  engine,
  markers,
  intent,
  onIntentHandled,
  onClose,
  onShow,
  onNeedMap,
  onOpenNetworks,
  onOpenStreets,
}: {
  engine: RoadRouteMap | null;
  markers: readonly MarkerDto[];
  intent: RoadRouteIntent | null;
  onIntentHandled: () => void;
  onClose: () => void;
  /** Draws a route on the map with one leg picked out, or takes it off. */
  onShow: (route: ShownRoute | null, selected: number | null) => void;
  /** On a phone, lowers the sheet so the map can be seen. */
  onNeedMap: () => void;
  /** Opens Map data's add flow with roads for routes for exactly these countries (two letters each); with none, Map data itself. */
  onOpenNetworks: (countries?: readonly string[]) => void;
  /** Opens Map data at building streets for routes, for a country (two letters) when one is known. */
  onOpenStreets: (country?: string | null) => void;
}) {
  const networks = useRoadNetworks();
  const installed = networks.data?.networks ?? [];
  const plan = usePlanRoadRoute();
  const streets = useStreetsStatus();
  const streetsPlan = usePlanStreetsRoute();
  const [storedMode, setMode] = useStoredState<RouteMode>(MODE_KEY, isRouteMode, "drive");
  // Without the streets service there is one way only, whatever was chosen on another installation.
  const installed_ = streets.data?.installed ?? false;
  const mode: RouteMode = installed_ ? storedMode : "drive";
  const [view, setView] = useState<View>({ kind: "plan" });
  const [points, setPoints] = useState<Array<RoutePointChoice | null>>([null, null]);
  const [crossing, setCrossing] = useState<RoadCrossingChoice>("any");
  const [units, setUnits] = useStoredState<RoadDistanceUnit>(UNITS_KEY, isUnits, "km");
  const [selected, setSelected] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const getCenter = (): LatLon | null => engine?.getCenter() ?? null;

  // A point pressed on the map: it becomes the start or the end, and the form is shown.
  useEffect(() => {
    if (!intent) return;
    setPoints((current) => (intent.role === "from" ? [intent.point, ...current.slice(1)] : [...current.slice(0, -1), intent.point]));
    setView({ kind: "plan" });
    onIntentHandled();
  }, [intent, onIntentHandled]);

  // Leaving the panel takes the route off the map.
  const show = useRef(onShow);
  show.current = onShow;
  useEffect(() => () => show.current(null, null), []);

  // The countries the points need, worked out here as soon as any point is chosen.
  const chosen = points.filter((point): point is RoutePointChoice => point !== null);
  const complete = chosen.length === points.length;
  const coverage = useRoadCoverage(chosen);
  const needs = routeNeeds(complete ? coverage.data : undefined);
  // The country a way of travelling is wanted in: where the route starts, else where it ends.
  const routeCountry = useMemo(() => {
    const code = coverage.data?.points.find((point) => point.country)?.country ?? null;
    return code ? { code, name: countryName(code) ?? code } : null;
  }, [coverage.data]);
  // A sea crossing is asked about only when the route has one: the straight line crosses water, or the route planned did.
  const plannedCrossing = (plan.data?.summary.crossings.length ?? 0) > 0;
  const seaCrossing = (complete && coverage.data?.seaCrossing === true) || plannedCrossing || crossing !== "any";
  const crossings = useRoadCrossings(installed.length > 0 && seaCrossing);
  const options = useMemo(() => crossingOptions(crossings.data ?? []), [crossings.data]);
  const chosenCrossing = seaCrossing && options.some((option) => option.value === crossing) ? crossing : "any";
  // Only a drive waits for roads: door to door goes on streets where there are none.
  const blocked =
    mode === "drive"
      ? needs.blocked
      : streetsMissFor(streets.data, routeCountry)
        ? `Add walking and cycling for ${routeCountry?.name} first`
        : null;
  const blockedId = useId();
  // A failed plan's words belong to the points it was for.
  const pointsKey = chosen.map((point) => `${point.lat},${point.lon}`).join(";");
  const resetPlan = plan.reset;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each change of the points
  useEffect(() => {
    if (plan.isError) resetPlan();
  }, [pointsKey]);
  const openNetworks = (codes: string[]) => onOpenNetworks(codes);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (points.some((point) => point === null)) return setMissing(true);
    if (blocked) return;
    setMissing(false);
    setSelected(null);
    if (mode !== "drive") {
      streetsPlan.mutate(
        {
          points: (points as RoutePointChoice[]).map((point) => ({ lat: point.lat, lon: point.lon, name: point.name })),
          mode,
          units,
          ...(mode === "drive-door" ? { crossing: chosenCrossing } : {}),
        },
        {
          onSuccess: (route) => {
            setView({ kind: "streets" });
            show.current(route, null);
            engine?.fitBounds(geometryBounds(route));
            onNeedMap();
          },
        },
      );
      return;
    }
    plan.mutate(
      {
        points: (points as RoutePointChoice[]).map((point) => ({ lat: point.lat, lon: point.lon, name: point.name })),
        crossing: chosenCrossing,
        units,
      },
      {
        onSuccess: (route) => {
          setView({ kind: "planned" });
          show.current(route, null);
          engine?.fitBounds(routeBounds(route));
          onNeedMap();
        },
      },
    );
  };

  const fitLeg = (route: RoadRouteResult, index: number) => {
    const next = selected === index ? null : index;
    setSelected(next);
    show.current(route, next);
    const leg = route.legs[index];
    if (leg) engine?.fitBounds(next === null ? routeBounds(route) : legBounds(leg, legLines(route)[index] ?? []), { maxZoom: 12 });
    onNeedMap();
  };

  if (view.kind === "planned" && plan.data) {
    return (
      <PlannedRoute
        key={plan.data.plannedAt}
        route={plan.data}
        selected={selected}
        onLeg={(index) => fitLeg(plan.data, index)}
        onFit={() => engine?.fitBounds(routeBounds(plan.data))}
        onBack={() => {
          setView({ kind: "plan" });
          setSelected(null);
          show.current(null, null);
        }}
        onSaved={(saved) => setView({ kind: "saved", id: saved.id })}
        onOpenNetworks={() => onOpenNetworks()}
      />
    );
  }

  if (view.kind === "streets" && streetsPlan.data) {
    const result = streetsPlan.data;
    return (
      <StreetsPlanned
        key={result.plannedAt}
        result={result}
        selected={selected}
        onLeg={(index) => {
          if (result.road) {
            const next = selected === index ? null : index;
            setSelected(next);
            show.current(result, next);
            const leg = result.road.legs[index];
            if (leg)
              engine?.fitBounds(next === null ? geometryBounds(result) : legBounds(leg, legLines(result.road)[index] ?? []), {
                maxZoom: 12,
              });
            onNeedMap();
          }
        }}
        onLine={(line) => {
          const [lon, lat] = line.at;
          engine?.fitBounds([lon - 0.002, lat - 0.0013, lon + 0.002, lat + 0.0013], { maxZoom: 17 });
          onNeedMap();
        }}
        onFit={() => engine?.fitBounds(geometryBounds(result))}
        onBack={() => {
          setView({ kind: "plan" });
          setSelected(null);
          show.current(null, null);
        }}
      />
    );
  }

  if (view.kind === "saved") {
    return (
      <SavedRoute
        key={view.id}
        id={view.id}
        selected={selected}
        onLeg={(route, index) => fitLeg(route, index)}
        onShown={(route) => {
          setSelected(null);
          show.current(route, null);
          engine?.fitBounds(routeBounds(route));
        }}
        onFit={(route) => engine?.fitBounds(routeBounds(route))}
        onBack={() => {
          setView({ kind: "plan" });
          setSelected(null);
          show.current(null, null);
        }}
        onPlanAgain={(route) => {
          const again = route.snapped.map(
            (point): RoutePointChoice => ({
              name: point.input.name ?? "",
              lat: point.input.lat,
              lon: point.input.lon,
              from: "search",
            }),
          );
          setPoints(again);
          setCrossing(route.request.crossing ?? "any");
          setView({ kind: "plan" });
          setSelected(null);
          show.current(null, null);
        }}
      />
    );
  }

  // ── The form ──
  const vias = points.slice(1, -1);
  const setPoint = (index: number, point: RoutePointChoice | null) =>
    setPoints((current) => current.map((each, at) => (at === index ? point : each)));

  const intro =
    mode === "drive"
      ? "Planned directions for a drive: the main roads, which way, the junctions and the places on the signs. Not turn by turn, and never live. Worked out on this device from the roads kept for each country."
      : `${MODE_LINES[mode]} Worked out on this device; never live.`;
  return (
    <div key="plan" className="flex min-h-0 flex-1 flex-col">
      {header("Routes", onClose)}
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-4 py-4 max-md:gap-3 max-md:pt-3">
        <div>
          <h3 className="font-title text-lead text-ink">Plan a route</h3>
          {/* On a phone the fields come first and this is said under them: above them it pushed From below the keyboard. */}
          <p className="mt-1 text-small text-ink-muted max-md:hidden">{intro}</p>
        </div>

        {installed_ ? (
          <Segmented<RouteMode>
            label="Way of travelling"
            value={mode}
            onChange={setMode}
            options={ROUTE_MODES}
            className="justify-self-start"
          />
        ) : null}

        {mode !== "drive" && streets.data && !modeAvailable(streets.data, mode) ? (
          <StreetsUnavailable status={streets.data} mode={mode} country={routeCountry} onOpenStreets={onOpenStreets} />
        ) : (
          <form className="grid gap-3" onSubmit={submit} aria-label="Plan a road route">
            <PointField
              label="From"
              value={points[0] ?? null}
              onChange={(point) => setPoint(0, point)}
              markers={markers}
              getCenter={getCenter}
            />
            {vias.map((via, index) => (
              <PointField
                // biome-ignore lint/suspicious/noArrayIndexKey: a via point is its place in the order
                key={`via-${index}`}
                label={`Via ${index + 1}`}
                value={via}
                onChange={(point) => setPoint(index + 1, point)}
                onRemove={() => setPoints((current) => current.filter((_, at) => at !== index + 1))}
                markers={markers}
                getCenter={getCenter}
              />
            ))}
            <PointField
              label="To"
              value={points.at(-1) ?? null}
              onChange={(point) => setPoint(points.length - 1, point)}
              markers={markers}
              getCenter={getCenter}
            />
            {vias.length < MAX_VIAS ? (
              <Button
                className="justify-self-start"
                onClick={() => setPoints((current) => [...current.slice(0, -1), null, current.at(-1) ?? null])}
              >
                <Plus /> Add a via point
              </Button>
            ) : (
              <p className="text-small text-ink-muted">Ten via points is as many as a route takes.</p>
            )}

            {(mode === "drive" || (mode === "drive-door" && installed.length > 0)) && seaCrossing ? (
              <Field
                label="Sea crossing"
                hint="This route crosses the sea. Choose how, or let Outpost choose; the time given is time on board."
              >
                {(ids) =>
                  crossings.isError ? (
                    <p className="text-small text-danger">{errorMessage(crossings.error)}</p>
                  ) : crossings.isPending && installed.length > 0 ? (
                    <Skeleton className="h-10" />
                  ) : (
                    <Select
                      {...ids}
                      value={chosenCrossing}
                      onChange={(value) => setCrossing(value)}
                      options={options.map((option) => ({
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

            <Segmented<RoadDistanceUnit>
              label="Distances in"
              value={units}
              onChange={setUnits}
              options={[
                { value: "km", label: "Kilometres" },
                { value: "miles", label: "Miles" },
              ]}
              className="justify-self-start"
            />

            {missing ? (
              <p role="alert" className="text-small text-danger">
                Choose a start and an end{vias.length > 0 ? ", and each via point, or remove the ones not wanted" : ""}.
              </p>
            ) : null}

            {mode === "drive" && !complete && installed.length === 0 ? (
              <p className="text-small text-ink-muted">
                Choose where from and where to. Outpost then says which countries' roads it needs.
              </p>
            ) : null}
            {mode === "drive" && complete ? <RouteNeedsNotice coverage={coverage.data} onAdd={openNetworks} /> : null}
            {mode !== "drive" && streetsMissFor(streets.data, routeCountry) ? (
              <StreetsUnavailable status={streets.data!} mode={mode} country={routeCountry} onOpenStreets={onOpenStreets} />
            ) : null}

            {/* Kept in view at the foot of the panel while a notice above pushes it down (1280 × 800 with the roads notice).
                On a phone an ordinary last row of the form: kept over the foot of the sheet it lay over the suggestions
                for To, and a finger on one pressed Plan route. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 md:sticky md:bottom-0 md:z-10 md:-mx-4 md:-mb-1 md:border-t md:border-border md:bg-page md:px-4 md:py-2.5 max-md:pt-1">
              <Button
                type="submit"
                variant="primary"
                disabled={blocked !== null}
                aria-describedby={blocked ? blockedId : undefined}
                loading={mode === "drive" ? plan.isPending : streetsPlan.isPending}
              >
                <Route /> Plan route
              </Button>
              {blocked ? (
                <span id={blockedId} className="text-small text-ink-muted">
                  {blocked}
                </span>
              ) : null}
            </div>

            {mode !== "drive" ? (
              streetsPlan.isPending ? (
                <p className="flex items-center gap-2.5 text-small text-ink" role="status">
                  <Spinner label="Planning" delay /> Planning the route on the streets built on this device. Nothing is sent anywhere.
                </p>
              ) : streetsPlan.isError ? (
                <Notice tone="danger" icon={<CircleAlert />} title="The route could not be planned">
                  {errorMessage(streetsPlan.error)}
                  <span className="mt-2 flex flex-wrap gap-2">
                    {/not installed for/i.test(errorMessage(streetsPlan.error)) ? (
                      <Button size="sm" onClick={() => onOpenStreets(routeCountry?.code)}>
                        {addStreetsLabel(routeCountry)}
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={() => submit()}>
                      Try again
                    </Button>
                  </span>
                </Notice>
              ) : null
            ) : plan.isPending ? (
              <div className="grid gap-2" aria-busy>
                <p className="flex items-center gap-2.5 text-small text-ink" role="status">
                  <Spinner label="Planning" /> Planning the route on the roads kept for routes.
                </p>
                <p className="text-small text-ink-muted">
                  The first route in a while takes longest, up to a minute on a small computer, while the roads are read. Nothing is sent
                  anywhere.
                </p>
              </div>
            ) : plan.isError ? (
              <Notice tone="danger" icon={<CircleAlert />} title="The route could not be planned">
                {errorMessage(plan.error)}
                <span className="mt-2 flex flex-wrap gap-2">
                  {(() => {
                    const problem = problemOf(plan.error);
                    const wanted = problem ? problemCountries(problem) : [];
                    return wanted.length > 0 ? (
                      <AddRoadsButton
                        countries={wanted}
                        onAdd={openNetworks}
                        size="sm"
                        all={problem !== null && problem.missing.length === 0}
                      />
                    ) : null;
                  })()}
                  <Button size="sm" onClick={() => submit()}>
                    Try again
                  </Button>
                </span>
              </Notice>
            ) : null}
          </form>
        )}

        <p className="text-small text-ink-muted md:hidden">{intro}</p>

        {streets.data && !streets.data.installed ? (
          <p className="text-small text-ink-muted">
            Door to door, walking and cycling routes come with an optional add-on for the streets.{" "}
            <Link
              to="/help/road-routes#h-door-to-door-walking-and-cycling"
              // A line of its own and 44 px on a phone, where the form now has the sheet and this is in reach of a thumb.
              className="text-primary underline underline-offset-2 max-md:flex max-md:min-h-11 max-md:items-center md:pointer-coarse:inline-flex md:pointer-coarse:min-h-11 md:pointer-coarse:items-center"
            >
              How to turn it on
            </Link>
          </p>
        ) : null}

        <SavedRoutesList onOpen={(id) => setView({ kind: "saved", id })} />
      </div>
    </div>
  );
}

// ── Streets, when a way of travelling cannot be used yet ──

function StreetsUnavailable({
  status,
  mode,
  country,
  onOpenStreets,
}: {
  status: StreetsStatusResponse;
  mode: RouteMode;
  /** Where the route is, when a point is chosen: never the home country by default. */
  country: CountryRef | null;
  onOpenStreets: (country?: string | null) => void;
}) {
  const { text, action } = unavailableLine(status, { way: mode, country });
  return (
    <div className="grid justify-items-start gap-2" role="status">
      <p className="text-small text-ink">{text}</p>
      {action === "add" ? (
        <Button variant="primary" onClick={() => onOpenStreets(country?.code)}>
          {addStreetsLabel(country)}
        </Button>
      ) : action === "progress" ? (
        <Button onClick={() => onOpenStreets()}>See its progress</Button>
      ) : null}
    </div>
  );
}

// ── A route planned on streets ──

function StreetsPlanned({
  result,
  selected,
  onLeg,
  onLine,
  onFit,
  onBack,
}: {
  result: StreetsRouteResult;
  selected: number | null;
  onLeg: (index: number) => void;
  onLine: (line: StreetLine) => void;
  onFit: () => void;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const title = streetsTitle(result);
  const door = result.mode === "drive-door" && result.road;
  return (
    <div key="streets" className="flex min-h-0 flex-1 flex-col">
      {header("Change the route", onBack)}
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-4 py-4">
        <div>
          <p className="text-micro font-medium text-ink-muted">{ROUTE_MODES.find((each) => each.value === result.mode)?.label}</p>
          <h3 ref={heading} tabIndex={-1} className="font-title text-lead break-words text-ink focus:outline-none">
            {title}
          </h3>
        </div>
        <StreetsTotals result={result} />
        {result.warnings.length > 0 ? (
          <div className="grid gap-2">
            {result.warnings.map((warning) => (
              <Notice key={warning} tone="warning" icon={<CircleAlert />}>
                {warning}
              </Notice>
            ))}
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-body font-semibold text-ink">Directions</h4>
            <Button size="sm" variant="ghost" onClick={onFit} className="max-md:min-h-11 md:pointer-coarse:min-h-11">
              <Scan /> Whole route on the map
            </Button>
          </div>
          <p className="text-small text-ink-muted">
            {door ? "Choose a road to see it on the map; open the start or the end for its turns." : "Choose a turn to see it on the map."}
          </p>
          <div className="-mx-4">
            {door ? (
              <DoorToDoorList result={result} selected={selected} onLeg={onLeg} onLine={onLine} />
            ) : result.streets ? (
              <div className="border-y border-border">
                <StreetLinesList directions={result.streets} label="Directions" onLine={onLine} />
              </div>
            ) : null}
          </div>
        </div>
        <RouteCardPdf route={result} name={title} from={{ what: "a route planned on the map", path: "/maps?tab=routes" }} />
        <PlainTextBox route={result} title={title} />
        <StreetsCredit result={result} />
      </div>
    </div>
  );
}

// ── A planned route ──

function RouteBody({
  route,
  name,
  selected,
  onLeg,
  onFit,
  onOpenNetworks,
  from,
  totals = true,
}: {
  route: RoadRouteResult;
  name: string;
  selected: number | null;
  onLeg: (index: number) => void;
  onFit: () => void;
  onOpenNetworks?: () => void;
  from: { what: string; path: string };
  /** False where the distance and time are already shown above (a route just planned, before its name to save it under). */
  totals?: boolean;
}) {
  return (
    <>
      {totals ? <RouteTotals route={route} /> : null}
      <RouteWarnings route={route} onOpenNetworks={onOpenNetworks} />
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-body font-semibold text-ink">Directions</h4>
          <Button size="sm" variant="ghost" onClick={onFit} className="max-md:min-h-11 md:pointer-coarse:min-h-11">
            <Scan /> Whole route on the map
          </Button>
        </div>
        <p className="text-small text-ink-muted">Choose a line to see it on the map.</p>
        <div className="-mx-4">
          <DirectionsList route={route} selected={selected} onLeg={onLeg} />
        </div>
      </div>
      <RouteCardPdf route={route} name={name} from={from} />
      <PlainTextBox route={route} title={name} />
      <RouteCredit route={route} />
    </>
  );
}

function PlannedRoute({
  route,
  selected,
  onLeg,
  onFit,
  onBack,
  onSaved,
  onOpenNetworks,
}: {
  route: RoadRouteResult;
  selected: number | null;
  onLeg: (index: number) => void;
  onFit: () => void;
  onBack: () => void;
  onSaved: (saved: SavedRoadRouteDto) => void;
  onOpenNetworks: () => void;
}) {
  const save = useSaveRoadRoute();
  const [name, setName] = useState(() => suggestedName(route));
  const nameId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const title = routeTitle(route);
  return (
    <div key="planned" className="flex min-h-0 flex-1 flex-col">
      {header("Change the route", onBack)}
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-4 py-4">
        <h3 ref={heading} tabIndex={-1} className="font-title text-lead break-words text-ink focus:outline-none">
          {title}
        </h3>
        {/* How far and how long first: what was asked for, ahead of saving it (at half a phone's height, the name
            to save it under had been all there was to see). */}
        <RouteTotals route={route} />
        <form
          className="grid gap-2"
          aria-label="Save this route"
          onSubmit={(event) => {
            event.preventDefault();
            const wanted = name.trim();
            if (!wanted) return;
            save.mutate(
              { name: wanted, route },
              {
                onSuccess: (saved) => {
                  toast.success(`Saved “${saved.name}”.`);
                  onSaved(saved);
                },
              },
            );
          }}
        >
          <label htmlFor={nameId} className="text-small font-medium text-ink">
            Name to save it under
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              className="min-w-0 flex-[1_1_10rem]"
            />
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim()}>
              <Save /> Save route
            </Button>
          </div>
          {save.isError ? <p className="text-small text-danger">{errorMessage(save.error)}</p> : null}
        </form>
        <RouteBody
          route={route}
          name={name.trim() || title}
          selected={selected}
          onLeg={onLeg}
          onFit={onFit}
          onOpenNetworks={onOpenNetworks}
          totals={false}
          from={{ what: "a road route planned on the map", path: "/maps?tab=routes" }}
        />
      </div>
    </div>
  );
}

// ── A saved route ──

function SavedRoute({
  id,
  selected,
  onLeg,
  onShown,
  onFit,
  onBack,
  onPlanAgain,
}: {
  id: string;
  selected: number | null;
  onLeg: (route: RoadRouteResult, index: number) => void;
  onShown: (route: RoadRouteResult) => void;
  onFit: (route: RoadRouteResult) => void;
  onBack: () => void;
  onPlanAgain: (route: RoadRouteResult) => void;
}) {
  const saved = useSavedRoadRoute(id);
  const rename = useRenameRoadRoute();
  const remove = useDeleteRoadRoute();
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const nameId = useId();
  const shown = useRef<string | null>(null);
  const shownRef = useRef(onShown);
  shownRef.current = onShown;
  useEffect(() => {
    if (!saved.data) return;
    setName(saved.data.name);
    if (shown.current !== saved.data.id) {
      shown.current = saved.data.id;
      shownRef.current(saved.data.route);
    }
  }, [saved.data]);

  return (
    <div key="saved" className="flex min-h-0 flex-1 flex-col">
      {header("Plan a route", onBack)}
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-4 py-4">
        {saved.isPending ? (
          <div className="grid gap-3" aria-busy>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-40" />
          </div>
        ) : saved.isError ? (
          <ErrorState error={saved.error} onRetry={() => saved.refetch()} />
        ) : (
          <>
            <div>
              <h3 className="font-title text-lead break-words text-ink">{saved.data.name}</h3>
              <p className="text-small text-ink-muted">
                {saved.data.fromTo}. Saved {formatDate(saved.data.createdAt)}, kept with its directions: it opens and prints even if the
                routes are removed from Offline maps.
              </p>
            </div>
            <form
              className="grid gap-2"
              aria-label="Rename this route"
              onSubmit={(event) => {
                event.preventDefault();
                const wanted = name.trim();
                if (wanted && wanted !== saved.data.name)
                  rename.mutate({ id, name: wanted }, { onSuccess: (next) => toast.success(`Renamed it “${next.name}”.`) });
              }}
            >
              <label htmlFor={nameId} className="text-small font-medium text-ink">
                Name
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={nameId}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={160}
                  className="min-w-0 flex-[1_1_10rem]"
                />
                <Button type="submit" loading={rename.isPending} disabled={!name.trim() || name.trim() === saved.data.name}>
                  Rename
                </Button>
              </div>
            </form>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onPlanAgain(saved.data.route)}>
                <Route /> Plan it again
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)} className="text-danger">
                <Trash2 /> Delete
              </Button>
            </div>
            <RouteBody
              route={saved.data.route}
              name={saved.data.name}
              selected={selected}
              onLeg={(index) => onLeg(saved.data.route, index)}
              onFit={() => onFit(saved.data.route)}
              from={{ what: `the saved road route “${saved.data.name}”`, path: "/maps?tab=routes" }}
            />
            <ConfirmDialog
              open={deleting}
              onOpenChange={setDeleting}
              title={`Delete “${saved.data.name}”?`}
              description="The saved route and its directions go. A PDF of it already made is not touched."
              confirmLabel="Delete route"
              loading={remove.isPending}
              onConfirm={() =>
                remove.mutate(id, {
                  onSuccess: () => {
                    setDeleting(false);
                    toast.success(`Deleted “${saved.data.name}”.`);
                    onBack();
                  },
                })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── The saved routes ──

function SavedRoutesList({ onOpen }: { onOpen: (id: string) => void }) {
  const routes = useSavedRoadRoutes();
  return (
    <section aria-labelledby="saved-road-routes" className="grid gap-2 border-t border-border pt-4">
      <h4 id="saved-road-routes" className="text-body font-semibold text-ink">
        Saved road routes
      </h4>
      {routes.isPending ? (
        <Skeleton className="h-12" />
      ) : routes.isError ? (
        <ErrorState error={routes.error} onRetry={() => routes.refetch()} />
      ) : routes.data.length === 0 ? (
        <p className="text-small text-ink-muted">Routes you save are listed here, to open, print or plan again.</p>
      ) : (
        <ul className="-mx-4 divide-y divide-border border-y border-border">
          {routes.data.map((route) => (
            <li key={route.id}>
              <button
                type="button"
                onClick={() => onOpen(route.id)}
                className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface focus-visible:-outline-offset-2 max-md:min-h-11 md:pointer-coarse:min-h-11"
              >
                <span className="min-w-0">
                  <span className="block text-small font-medium text-ink">{route.name}</span>
                  <span className="block text-small text-ink-muted">{route.fromTo}</span>
                </span>
                <span className="tabular shrink-0 text-right text-small text-ink">
                  {roadDistanceText(route.distanceM)}
                  <span className="block text-ink-muted">{roadDurationText(route.durationS)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
