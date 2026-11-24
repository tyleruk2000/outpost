/**
 * Satellites on the offline map (Maps → Layers → Satellites), as LogBook73's map overlay
 * drew them: where each amateur satellite and crewed station is now, the footprint (the
 * ground that can hear it) of the ISS and of any satellite above Home's horizon, and for
 * the satellite chosen on the Satellites screen its ground track and the part of it where
 * its next pass over Home is. Worked out in the browser from the kept elements; moved
 * every 10 seconds while the map is open and in view (once a minute with reduced
 * motion), never while it is hidden. Off until switched on, remembered on this device.
 *
 * "Show on the map" opens /maps?satellite=<NORAD number>: the layer is switched on, the
 * satellite chosen, the map fitted to where it is and its next pass over Home, and the
 * other satellites drawn small and unlabelled until the layer is switched off.
 */
import type { Bbox, SatelliteElements } from "@outpost/shared";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/misc";
import { useHome } from "@/features/households/home";
import { useStoredState } from "@/features/maps/hooks";
import type { MapTheme } from "@/features/maps/lib/style";
import { MAP_FONTS } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY, type FeatureCollection } from "@/features/maps/map/overlays";
import { errorMessage } from "@/lib/api";
import { usePageVisible } from "@/lib/page-visible";
import { ISS, useSatellites } from "./data";
import { footprintRadiusKm, footprintRing, groundTrack, predictPasses, satelliteState } from "./engine";
import { utcTime } from "./words";

export const SATELLITES_SOURCE = "o-satellites";
const ON_KEY = "outpost.maps.satellites";
/** The satellite whose track is drawn: set by "Show on the map" on the Satellites screen. */
export const CHOSEN_KEY = "outpost.satellites.chosen";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

export const useChosenSatellite = () => useStoredState<number>(CHOSEN_KEY, isNumber, ISS);

type Feature = FeatureCollection["features"][number];

/** The marks for one moment: positions, footprints, and the chosen satellite's track and next pass; `thin` draws the others small and unlabelled. */
export function satelliteFeatures(
  satellites: readonly SatelliteElements[],
  at: Date,
  home: { lat: number; lon: number } | null,
  chosen: number | null,
  thin = false,
): FeatureCollection {
  const features: Feature[] = [];
  for (const satellite of satellites) {
    let state: ReturnType<typeof satelliteState>;
    try {
      state = satelliteState(satellite, home ?? { lat: 0, lon: 0 }, at);
    } catch {
      continue;
    }
    if (![state.lat, state.lon, state.altitudeKm].every(Number.isFinite)) continue;
    const overhead = home !== null && state.elevationDeg > 0;
    const isChosen = satellite.noradId === chosen;
    const faint = thin && !isChosen;
    if (isChosen || (!faint && (satellite.noradId === ISS || overhead))) {
      features.push({
        type: "Feature",
        properties: { kind: "footprint", overhead },
        geometry: { type: "Polygon", coordinates: [footprintRing(state, footprintRadiusKm(state.altitudeKm))] },
      });
    }
    features.push({
      type: "Feature",
      properties: faint
        ? { kind: "satellite", chosen: false, thin: true }
        : { kind: "satellite", label: overhead ? `${satellite.name}\nabove Home now` : satellite.name, chosen: isChosen, thin: false },
      geometry: { type: "Point", coordinates: [state.lon, state.lat] },
    });
  }
  const picked = satellites.find((satellite) => satellite.noradId === chosen);
  if (picked) {
    try {
      for (const segment of groundTrack(picked, at)) {
        features.push({
          type: "Feature",
          properties: { kind: "track" },
          geometry: { type: "LineString", coordinates: segment.map((point) => [point.lon, point.lat]) },
        });
      }
      const next = home ? predictPasses(picked, home, at, 24, 1)[0] : undefined;
      // A satellite always above Home has no pass to draw: its dot and footprint say it all.
      if (next && !next.alwaysUp) {
        for (const segment of groundTrack(picked, next.aos, 0, Math.ceil(next.durationSeconds / 60), 15)) {
          features.push({
            type: "Feature",
            properties: { kind: "pass" },
            geometry: { type: "LineString", coordinates: segment.map((point) => [point.lon, point.lat]) },
          });
        }
        const rise = groundTrack(picked, next.aos, 0, 1, 60)[0]?.[0];
        if (rise)
          features.push({
            type: "Feature",
            properties: { kind: "rise", label: `Rises over Home ${utcTime(next.aos)} UTC` },
            geometry: { type: "Point", coordinates: [rise.lon, rise.lat] },
          });
      }
    } catch {
      // Elements that will not propagate: positions only.
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * What to fit the map to for the chosen satellite: where it is now and, when its next pass
 * over Home begins within 3 hours, that pass and Home; else its next 20 minutes. Longitudes
 * are unwrapped from where it is, so a track over the date line stays in one piece.
 */
export function chosenBounds(picked: SatelliteElements, at: Date, home: { lat: number; lon: number } | null): Bbox | null {
  let now: { lat: number; lon: number };
  try {
    now = satelliteState(picked, home ?? { lat: 0, lon: 0 }, at);
  } catch {
    return null;
  }
  const points: Array<{ lat: number; lon: number }> = [now];
  try {
    const next = home ? predictPasses(picked, home, at, 3, 1)[0] : undefined;
    if (next && !next.alwaysUp) {
      for (const segment of groundTrack(picked, next.aos, 0, Math.ceil(next.durationSeconds / 60), 30)) points.push(...segment);
      points.push(home!);
    } else if (!next) {
      for (const segment of groundTrack(picked, at, 0, 20, 60)) points.push(...segment);
    }
  } catch {
    // Its position alone.
  }
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = 90;
  let north = -90;
  for (const point of points) {
    let lon = point.lon;
    while (lon - now.lon > 180) lon -= 360;
    while (lon - now.lon < -180) lon += 360;
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }
  if (east - west > 300) return [-180, -70, 180, 75];
  // Room round a lone dot, so the fit does not dive to street level.
  const padLon = Math.max(8, (east - west) * 0.1);
  const padLat = Math.max(6, (north - south) * 0.1);
  return [west - padLon, Math.max(-85, south - padLat), east + padLon, Math.min(85, north + padLat)];
}

export function satelliteLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-satellites-footprint",
      type: "fill",
      source: SATELLITES_SOURCE,
      filter: ["==", ["get", "kind"], "footprint"],
      paint: { "fill-color": theme.primary, "fill-opacity": ["case", ["get", "overhead"], 0.14, 0.06] },
    },
    {
      id: "o-satellites-footprint-edge",
      type: "line",
      source: SATELLITES_SOURCE,
      filter: ["==", ["get", "kind"], "footprint"],
      paint: { "line-color": theme.primary, "line-width": 1.2, "line-dasharray": [3, 2] },
    },
    {
      id: "o-satellites-track",
      type: "line",
      source: SATELLITES_SOURCE,
      filter: ["==", ["get", "kind"], "track"],
      paint: { "line-color": theme.inkMuted, "line-width": 1.5, "line-dasharray": [2, 2] },
    },
    {
      id: "o-satellites-pass",
      type: "line",
      source: SATELLITES_SOURCE,
      filter: ["==", ["get", "kind"], "pass"],
      layout: { "line-cap": "round" },
      paint: { "line-color": theme.primary, "line-width": 4 },
    },
    {
      id: "o-satellites-point",
      type: "circle",
      source: SATELLITES_SOURCE,
      filter: ["any", ["==", ["get", "kind"], "satellite"], ["==", ["get", "kind"], "rise"]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "chosen"], true], 7, ["==", ["get", "thin"], true], 3, 5],
        "circle-color": ["case", ["==", ["get", "kind"], "rise"], theme.page, ["==", ["get", "thin"], true], theme.inkMuted, theme.primary],
        "circle-stroke-color": ["case", ["==", ["get", "kind"], "rise"], theme.primary, theme.page],
        "circle-stroke-width": ["case", ["==", ["get", "thin"], true], 1, 2],
        "circle-opacity": ["case", ["==", ["get", "thin"], true], 0.6, 1],
      },
    },
    {
      id: "o-satellites-label",
      type: "symbol",
      source: SATELLITES_SOURCE,
      filter: ["has", "label"],
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": [0, 0.8],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.5 },
    },
  ];
}

const shown = (satellite: SatelliteElements, chosen: number) =>
  satellite.noradId === chosen || satellite.groups.includes("amateur") || satellite.groups.includes("stations");

export function useSatellitesOnMap({ engine }: { engine: MapEngine | null }) {
  const [on, setStoredOn] = useStoredState(ON_KEY, isBoolean, false);
  const [chosen, setChosen] = useChosenSatellite();
  /** Others drawn small, after "Show on the map", until the layer is switched off. */
  const [thin, setThin] = useState(false);
  /** A satellite to fit the map to once its elements are in. */
  const [fitTo, setFitTo] = useState<number | null>(null);
  const setOn = useCallback(
    (next: boolean) => {
      setStoredOn(next);
      if (!next) setThin(false);
    },
    [setStoredOn],
  );
  /** "Show on the map": the layer on, this satellite chosen and fitted, the others thinned out. */
  const focus = useCallback(
    (noradId: number) => {
      setStoredOn(true);
      setChosen(noradId);
      setThin(true);
      setFitTo(noradId);
    },
    [setStoredOn, setChosen],
  );
  const data = useSatellites(on);
  const home = useHome().home;
  const visible = usePageVisible();
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on || !visible) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), reduced ? 60_000 : 10_000);
    return () => window.clearInterval(timer);
  }, [on, visible, reduced]);
  const satellites = useMemo(() => (data.data?.satellites ?? []).filter((satellite) => shown(satellite, chosen)), [data.data, chosen]);
  const lat = home?.lat;
  const lon = home?.lon;
  useEffect(() => {
    if (!engine) return;
    engine.setOverlay(
      SATELLITES_SOURCE,
      on && satellites.length > 0
        ? satelliteFeatures(satellites, new Date(now), lat !== undefined && lon !== undefined ? { lat, lon } : null, chosen, thin)
        : EMPTY,
    );
  }, [engine, on, satellites, now, lat, lon, chosen, thin]);
  const picked = satellites.find((satellite) => satellite.noradId === chosen);
  useEffect(() => {
    if (!engine || fitTo === null || !data.data) return;
    const target = data.data.satellites.find((satellite) => satellite.noradId === fitTo);
    setFitTo(null);
    const bounds = target ? chosenBounds(target, new Date(), lat !== undefined && lon !== undefined ? { lat, lon } : null) : null;
    if (bounds) engine.fitBounds(bounds, { maxZoom: 5 });
  }, [engine, fitTo, data.data, lat, lon]);
  return {
    on,
    setOn,
    focus,
    thin,
    showAll: () => setThin(false),
    count: data.data ? satellites.length : null,
    note: data.isError
      ? errorMessage(data.error)
      : data.data && data.data.satellites.length === 0
        ? "No orbital elements are kept yet. Get them on Radio → Satellites."
        : picked
          ? `The track drawn is ${picked.name}'s${home ? ", with its next pass over Home in a heavier line" : ""}. Choose another on Radio → Satellites.`
          : data.data
            ? "The satellite chosen on Radio → Satellites is not among the kept elements now."
            : null,
  };
}

/** The Layers tab's row: one switch, the count, and what is drawn. */
export function SatellitesLayerPanel({ layer }: { layer: ReturnType<typeof useSatellitesOnMap> }) {
  const id = useId();
  return (
    <section className="px-4 pt-3" aria-label="Satellites">
      <div className="flex items-center gap-3 py-2.5">
        <label htmlFor={id} className="min-w-0 flex-1 text-body font-semibold text-ink">
          Satellites now
          {layer.on && layer.count !== null ? (
            <span className="ml-1.5 text-small font-normal text-ink-muted tabular">{layer.count}</span>
          ) : null}
        </label>
        <Switch id={id} checked={layer.on} onCheckedChange={layer.setOn} />
      </div>
      {layer.on ? (
        <p className="text-small text-ink-muted">
          Amateur satellites and crewed stations where they are now, worked out from the kept elements. A shaded ring is the ground that can
          hear one: the ISS's, the chosen satellite's, and any above Home's horizon (shaded more).{layer.note ? ` ${layer.note}` : ""}
          {layer.thin ? " The others are drawn small, without names." : ""}
        </p>
      ) : null}
      {layer.on && layer.thin ? (
        <Button className="mt-2" size="sm" variant="secondary" onClick={layer.showAll}>
          Show every satellite alike
        </Button>
      ) : null}
    </section>
  );
}
