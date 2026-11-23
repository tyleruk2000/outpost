/**
 * "Road route" in the Routes tab: planned, high-level road directions worked out on this
 * Outpost from the road networks installed. Never live: a route is planned once, read as
 * the main roads and the places on their signs ("M20 - Folkestone", "A26 (E17) - Reims
 * (A4)"), saved, and printed. Nothing here reaches the internet.
 *
 * Three views: the form (start, via points, end, the crossing, Plan route), with the saved
 * routes under it; a planned route (directions, save, print, plain text); and a saved one
 * (the same, with rename and delete).
 */
import type { MarkerDto, RoadCrossingChoice, RoadDistanceUnit, RoadRouteResult, SavedRoadRouteDto } from "@outpost/shared";
import { roadDistanceText, roadDurationText } from "@outpost/shared";
import { ArrowLeft, CircleAlert, Plus, Route, Save, Scan, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select, Skeleton, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatDate, plural } from "@/lib/utils";
import { useStoredState } from "../hooks";
import type { LatLon } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import {
  useDeleteRoadRoute,
  usePlanRoadRoute,
  useRenameRoadRoute,
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
import {
  crossingOptions,
  legBounds,
  legLines,
  type RoutePointChoice,
  routeBounds,
  routeTitle,
  suggestedName,
  wantsANetwork,
} from "./words";

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
const isUnits = (value: unknown): value is RoadDistanceUnit => value === "km" || value === "miles";

const header = (label: string, onBack: () => void) => (
  <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
    <Button variant="ghost" size="sm" onClick={onBack} className="max-md:min-h-11 md:pointer-coarse:min-h-11">
      <ArrowLeft /> {label}
    </Button>
  </div>
);

type View = { kind: "plan" } | { kind: "planned" } | { kind: "saved"; id: string };

export function RoadRoutePanel({
  engine,
  markers,
  intent,
  onIntentHandled,
  onClose,
  onShow,
  onNeedMap,
  onOpenNetworks,
}: {
  engine: RoadRouteMap | null;
  markers: readonly MarkerDto[];
  intent: RoadRouteIntent | null;
  onIntentHandled: () => void;
  onClose: () => void;
  /** Draws a route on the map with one leg picked out, or takes it off. */
  onShow: (route: RoadRouteResult | null, selected: number | null) => void;
  /** On a phone, lowers the sheet so the map can be seen. */
  onNeedMap: () => void;
  /** Opens Offline maps at the road networks. */
  onOpenNetworks: () => void;
}) {
  const networks = useRoadNetworks();
  const installed = networks.data?.networks ?? [];
  const crossings = useRoadCrossings(installed.length > 0);
  const plan = usePlanRoadRoute();
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

  const options = useMemo(() => crossingOptions(crossings.data ?? []), [crossings.data]);
  const chosenCrossing = options.some((option) => option.value === crossing) ? crossing : "any";

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (points.some((point) => point === null)) return setMissing(true);
    setMissing(false);
    setSelected(null);
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
        onOpenNetworks={onOpenNetworks}
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

  return (
    <div key="plan" className="flex min-h-0 flex-1 flex-col">
      {header("Routes", onClose)}
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-4 py-4">
        <div>
          <h3 className="font-title text-lead text-ink">Road route</h3>
          <p className="mt-1 text-small text-ink-muted">
            Planned directions for a drive: the main roads, which way, the junctions and the places on the signs. Not turn by turn, and
            never live. Worked out on this device from the road networks installed.
          </p>
        </div>

        {networks.isPending ? (
          <div className="grid gap-3" aria-busy>
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : networks.isError ? (
          <ErrorState error={networks.error} onRetry={() => networks.refetch()} />
        ) : installed.length === 0 ? (
          <EmptyState
            compact
            level={3}
            title="No road networks yet"
            action={
              <Button variant="primary" onClick={onOpenNetworks}>
                Add road networks
              </Button>
            }
          >
            Routes are planned from road networks installed on this device, one country (or part of one) at a time: a one-off download from
            Geofabrik, after which planning works offline. Add every country you will drive through.
            {networks.data.building.length > 0
              ? ` ${plural(networks.data.building.length, "network")} being added now: ${networks.data.building.map((each) => each.name).join(", ")}.`
              : ""}
          </EmptyState>
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

            <Field label="Crossing the Channel" hint="Used only where the route crosses the sea. The time given is time on board.">
              {(ids) =>
                crossings.isError ? (
                  <p className="text-small text-danger">{errorMessage(crossings.error)}</p>
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

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" loading={plan.isPending}>
                <Route /> Plan route
              </Button>
            </div>

            {plan.isPending ? (
              <div className="grid gap-2" aria-busy>
                <p className="flex items-center gap-2.5 text-small text-ink" role="status">
                  <Spinner label="Planning" /> Planning the route on the road networks installed.
                </p>
                <p className="text-small text-ink-muted">
                  The first route in a while takes longest, up to a minute on a small computer, while the networks are read. Nothing is sent
                  anywhere.
                </p>
              </div>
            ) : plan.isError ? (
              <Notice tone="danger" icon={<CircleAlert />} title="The route could not be planned">
                {errorMessage(plan.error)}
                <span className="mt-2 flex flex-wrap gap-2">
                  {wantsANetwork(errorMessage(plan.error)) ? (
                    <Button size="sm" onClick={onOpenNetworks}>
                      Add a road network
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => submit()}>
                    Try again
                  </Button>
                </span>
              </Notice>
            ) : null}
          </form>
        )}

        <SavedRoutesList onOpen={(id) => setView({ kind: "saved", id })} />
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
}: {
  route: RoadRouteResult;
  name: string;
  selected: number | null;
  onLeg: (index: number) => void;
  onFit: () => void;
  onOpenNetworks?: () => void;
  from: { what: string; path: string };
}) {
  return (
    <>
      <RouteTotals route={route} />
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
      {header("Road route", onBack)}
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
                road networks are removed.
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
