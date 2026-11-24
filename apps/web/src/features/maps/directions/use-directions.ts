/**
 * Directions on a phone: where the route goes from and to, how, and the plan, held for the
 * bar, the picker and the sheet that show it (bar, map, sheet: route-redesign DESIGN.md §3).
 *
 * There is no Plan route button. The route is planned as soon as every point is known and the
 * roads it needs are there, and again whenever a point, the way of travelling, the units or
 * the crossing changes. A plan is a query kept by its request for the visit, so swapping the
 * ends and swapping back is instant; Cancel aborts the request in flight and stops it being
 * asked again until the person asks.
 */
import type { RoadCrossingChoice, RoadDistanceUnit, RoadRouteResult, StreetsRouteResult } from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api } from "@/lib/api";
import { useStoredState } from "../hooks";
import type { LatLon } from "../lib/geo";
import { countryName } from "../lib/search";
import type { MapEngine } from "../map/engine";
import { useRoadCoverage, useRoadCrossings, useRoadNetworks } from "../road-route/data";
import { pointName } from "../road-route/point-field";
import { routeNeeds } from "../road-route/route-needs";
import { isRouteMode, modeAvailable, type RouteMode, streetsMissFor } from "../road-route/street-words";
import { useStreetsStatus } from "../road-route/streets-data";
import { crossingOptions, type RoutePointChoice } from "../road-route/words";
import {
  type DirectionsRoute,
  defaultStart,
  directionsBounds,
  type HomeStart,
  planKey,
  pointsBounds,
  routeSteps,
  samePlace,
} from "./words";

/** The same keys as the panel on a wide screen: one choice of units and way of travelling on this device. */
const UNITS_KEY = "outpost.maps.roadRoute.units";
const MODE_KEY = "outpost.maps.roadRoute.mode";
const isUnits = (value: unknown): value is RoadDistanceUnit => value === "km" || value === "miles";

/** Ten stops at most: twelve points in all, as the server takes. */
export const MAX_STOPS = 10;

/** What the sheet shows: the route's summary, its steps, the page to print, or its stops and options. */
export type DirectionsView = "route" | "steps" | "print" | "options";

/** The point the picker is choosing: its place in the list, and whether it is a new stop put in there. */
export interface PickerTarget {
  index: number;
  adding: boolean;
}

export type DirectionsMap = Pick<MapEngine, "getCenter" | "fitBounds">;

/** How a route is started: a point handed in at one end, or nothing (the end is asked). */
export interface DirectionsStart {
  from?: RoutePointChoice | null;
  to?: RoutePointChoice | null;
  /** Where the device is, while it is being followed. */
  here?: LatLon | null;
}

export function useDirections({
  engine,
  home,
  enabled,
  onShow,
}: {
  engine: DirectionsMap | null;
  /** The current household's home, to start from. */
  home: HomeStart | null;
  /** False on a wide screen, where the panel's own form plans routes: nothing here asks the server anything. */
  enabled: boolean;
  /** Draws a route on the map with one leg picked out, or takes it off. */
  onShow: (route: DirectionsRoute | null, selected: number | null) => void;
}) {
  const client = useQueryClient();
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState<Array<RoutePointChoice | null>>([null, null]);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerText, setPickerText] = useState("");
  const [choosing, setChoosing] = useState<PickerTarget | null>(null);
  const [view, setView] = useState<DirectionsView>("route");
  const [step, setStep] = useState<number | null>(null);
  const [crossing, setCrossing] = useState<RoadCrossingChoice>("any");
  const [units, setUnits] = useStoredState<RoadDistanceUnit>(UNITS_KEY, isUnits, "km");
  const [storedMode, setMode] = useStoredState<RouteMode>(MODE_KEY, isRouteMode, "drive");
  /** The plan the person stopped: not asked again until they ask. */
  const [stopped, setStopped] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const networks = useRoadNetworks(enabled && active);
  const streets = useStreetsStatus(enabled && active);
  // Without the streets service there is one way only, whatever was chosen on another installation.
  const streetsInstalled = streets.data?.installed ?? false;
  const mode: RouteMode = streetsInstalled ? storedMode : "drive";

  const chosen = points.filter((point): point is RoutePointChoice => point !== null);
  const complete = active && chosen.length === points.length;
  const coverage = useRoadCoverage(active && enabled ? chosen : []);
  const needs = routeNeeds(complete ? coverage.data : undefined);
  const routeCountry = useMemo(() => {
    const code = coverage.data?.points.find((point) => point.country)?.country ?? null;
    return code ? { code, name: countryName(code) ?? code } : null;
  }, [coverage.data]);
  const installed = networks.data?.networks ?? [];
  const seaCrossing = (complete && coverage.data?.seaCrossing === true) || crossing !== "any";
  const crossings = useRoadCrossings(enabled && active && installed.length > 0 && seaCrossing);
  const options = useMemo(() => crossingOptions(crossings.data ?? []), [crossings.data]);
  const chosenCrossing: RoadCrossingChoice = seaCrossing && options.some((option) => option.value === crossing) ? crossing : "any";

  /** Why the route is not planned yet, in a few words, or null when it can be. */
  const blocked: string | null = !complete
    ? null
    : mode === "drive"
      ? needs.blocked
      : streets.data && !modeAvailable(streets.data, mode)
        ? "unavailable"
        : streetsMissFor(streets.data, routeCountry)
          ? `Add walking and cycling for ${routeCountry?.name} first`
          : null;
  // A drive waits to know which countries it needs, so that no minute is spent finding out what the coverage says.
  const known = mode !== "drive" || coverage.data !== undefined || coverage.isError;
  const key = complete ? planKey({ mode, units, crossing: chosenCrossing, points: chosen }) : null;
  const ready = enabled && complete && key !== null && blocked === null && known;

  const plan = useQuery<DirectionsRoute>({
    queryKey: ["directions", key],
    queryFn: ({ signal }) => {
      const wanted = chosen.map((point) => ({ lat: point.lat, lon: point.lon, name: point.name }));
      return mode === "drive"
        ? api.post<RoadRouteResult>("/api/roads/route", { points: wanted, crossing: chosenCrossing, units }, undefined, signal)
        : api.post<StreetsRouteResult>(
            "/api/streets/route",
            { points: wanted, mode, units, ...(mode === "drive-door" ? { crossing: chosenCrossing } : {}) },
            undefined,
            signal,
          );
    },
    enabled: ready && stopped !== key,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    retry: false,
  });
  const result = ready && stopped !== key ? (plan.data ?? null) : null;
  const planning = ready && stopped !== key && plan.isFetching && !plan.data;

  // ── The map: the route, the leg in hand, or the two ends while it is being planned ──
  const show = useRef(onShow);
  show.current = onShow;
  const steps = useMemo(() => (result ? routeSteps(result) : []), [result]);
  const selectedLeg = step !== null ? (steps[step]?.leg ?? null) : null;
  useEffect(() => {
    if (!active) return;
    show.current(result, selectedLeg);
  }, [active, result, selectedLeg]);
  const fitted = useRef<string | null>(null);
  const endsKey = chosen.map((point) => `${point.lat},${point.lon}`).join(";");
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each new route or new set of ends
  useEffect(() => {
    if (!active || !engine) return;
    const at = result ? `route ${result.plannedAt}` : `ends ${endsKey}`;
    if (fitted.current === at) return;
    fitted.current = at;
    const box = result ? directionsBounds(result) : pointsBounds(chosen);
    if (box) engine.fitBounds(box);
  }, [active, engine, result, endsKey]);
  useEffect(() => {
    if (!engine || step === null) return;
    const wanted = steps[step];
    if (wanted) engine.fitBounds(wanted.bounds, { maxZoom: wanted.leg === null ? 17 : 12 });
  }, [engine, step, steps]);

  // ── What the person does ──
  const focusPicker = useCallback((target: PickerTarget) => {
    // The layer is mounted already; shown and focused inside the press, so that iOS raises the keyboard, once.
    flushSync(() => {
      setPicker(target);
      setPickerText("");
    });
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const start = useCallback(
    (input: DirectionsStart = {}) => {
      const from = defaultStart({ handed: input.from, here: input.here, home, to: input.to });
      setPoints([from, input.to ?? null]);
      setActive(true);
      setView("route");
      setStep(null);
      setStopped(null);
      setChoosing(null);
      fitted.current = null;
      if (!input.to) focusPicker({ index: 1, adding: false });
      else if (!from) focusPicker({ index: 0, adding: false });
      else setPicker(null);
    },
    [home, focusPicker],
  );

  /** Starts with these points and way of travelling, as a saved route's Plan it again hands them over. */
  const startWith = useCallback(
    (again: Array<RoutePointChoice | null>, way: RouteMode) => {
      setPoints(again.length >= 2 ? again : [again[0] ?? null, null]);
      setMode(way);
      setActive(true);
      setView("route");
      setStep(null);
      setStopped(null);
      setChoosing(null);
      setPicker(null);
      fitted.current = null;
    },
    [setMode],
  );

  const close = useCallback(() => {
    if (key && planning) void client.cancelQueries({ queryKey: ["directions", key] });
    setActive(false);
    setPicker(null);
    setChoosing(null);
    setView("route");
    setStep(null);
    show.current(null, null);
  }, [client, key, planning]);

  /** Puts a point in its place, then asks for whichever end is still wanted, or shows the route. */
  const choose = useCallback(
    (target: PickerTarget, point: RoutePointChoice) => {
      let next = target.adding ? [...points.slice(0, target.index), point, ...points.slice(target.index)] : [...points];
      if (!target.adding) next[target.index] = point;
      // The end chosen is where the route started from: the start is asked instead.
      const last = next.length - 1;
      if (target.index === last && next[0] && samePlace(next[0], point) && next[0].from !== "search") next = [null, ...next.slice(1)];
      setPoints(next);
      setStep(null);
      setChoosing(null);
      setStopped(null);
      const missing = next.findIndex((each) => each === null);
      if (missing >= 0) focusPicker({ index: missing, adding: false });
      else setPicker(null);
    },
    [points, focusPicker],
  );

  const closePicker = useCallback(() => {
    setPicker(null);
    // Nothing chosen to go to: there is no route to go back to, so Directions ends.
    if (!points.at(-1) && view === "route") close();
  }, [points, view, close]);

  const swap = useCallback(() => {
    setPoints((current) => [...current].reverse());
    setStep(null);
    setStopped(null);
  }, []);

  const removeStop = useCallback((index: number) => {
    setPoints((current) => current.filter((_, at) => at !== index));
    setStep(null);
  }, []);

  const cancel = useCallback(() => {
    if (!key) return;
    void client.cancelQueries({ queryKey: ["directions", key] });
    setStopped(key);
  }, [client, key]);

  const retry = useCallback(() => {
    setStopped(null);
    if (ready) void plan.refetch();
  }, [ready, plan]);

  return {
    active,
    home,
    points,
    picker,
    pickerText,
    setPickerText,
    inputRef,
    choosing,
    view,
    setView,
    step,
    setStep,
    steps,
    mode,
    setMode,
    units,
    setUnits,
    crossing: chosenCrossing,
    setCrossing,
    seaCrossing: seaCrossing && (mode === "drive" || (mode === "drive-door" && installed.length > 0)),
    crossings,
    crossingOptions: options,
    streets: streets.data,
    streetsInstalled,
    routeCountry,
    coverage: coverage.data,
    needs,
    blocked,
    complete,
    result,
    planning,
    stopped: key !== null && stopped === key,
    error: ready && stopped !== key && plan.isError ? plan.error : null,
    start,
    startWith,
    close,
    choose,
    openPicker: focusPicker,
    closePicker,
    startChoosing: (target: PickerTarget) => {
      setPicker(null);
      setChoosing(target);
    },
    stopChoosing: () => setChoosing(null),
    /** Uses the point under the cross in the middle of the map for the point being chosen. */
    takeCentre: () => {
      const at = engine?.getCenter();
      if (choosing && at) choose(choosing, { name: pointName(at), lat: at.lat, lon: at.lon, from: "centre" });
    },
    swap,
    removeStop,
    cancel,
    retry,
  };
}

export type Directions = ReturnType<typeof useDirections>;
