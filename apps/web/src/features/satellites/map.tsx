/**
 * Satellites on the offline map (Maps → Layers → Satellites), as LogBook73's map overlay
 * drew them: where each amateur satellite and crewed station is now, the footprint (the
 * ground that can hear it) of the ISS and of any satellite above Home's horizon, and for
 * the satellite chosen on the Satellites screen its ground track and the part of it where
 * its next pass over Home is. Worked out in the browser from the kept elements; moved
 * every 10 seconds while the map is open and in view (once a minute with reduced
 * motion), never while it is hidden. Off until switched on, remembered on this device.
 */
import { homePlaceOf, type SatelliteElements } from "@outpost/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { Switch } from "@/components/ui/misc";
import { useMarkers } from "@/features/maps/data";
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

/** The marks for one moment: positions, footprints, and the chosen satellite's track and next pass. */
export function satelliteFeatures(
  satellites: readonly SatelliteElements[],
  at: Date,
  home: { lat: number; lon: number } | null,
  chosen: number | null,
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
    if (satellite.noradId === ISS || overhead || isChosen) {
      features.push({
        type: "Feature",
        properties: { kind: "footprint", overhead },
        geometry: { type: "Polygon", coordinates: [footprintRing(state, footprintRadiusKm(state.altitudeKm))] },
      });
    }
    features.push({
      type: "Feature",
      properties: { kind: "satellite", label: overhead ? `${satellite.name}\nabove Home now` : satellite.name, chosen: isChosen },
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
      if (next) {
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
        "circle-radius": ["case", ["==", ["get", "chosen"], true], 7, 5],
        "circle-color": ["case", ["==", ["get", "kind"], "rise"], theme.page, theme.primary],
        "circle-stroke-color": ["case", ["==", ["get", "kind"], "rise"], theme.primary, theme.page],
        "circle-stroke-width": 2,
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
  const [on, setOn] = useStoredState(ON_KEY, isBoolean, false);
  const [chosen] = useChosenSatellite();
  const data = useSatellites(on);
  const markers = useMarkers();
  const home = markers.data ? homePlaceOf(markers.data) : null;
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
        ? satelliteFeatures(satellites, new Date(now), lat !== undefined && lon !== undefined ? { lat, lon } : null, chosen)
        : EMPTY,
    );
  }, [engine, on, satellites, now, lat, lon, chosen]);
  const picked = satellites.find((satellite) => satellite.noradId === chosen);
  return {
    on,
    setOn,
    count: data.data ? satellites.length : null,
    note: data.isError
      ? errorMessage(data.error)
      : data.data && data.data.satellites.length === 0
        ? "No orbital elements are kept yet. Get them on Radio → Satellites."
        : picked
          ? `The track drawn is ${picked.name}'s${home ? ", with its next pass over Home in a heavier line" : ""}. Choose another on Radio → Satellites.`
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
        </p>
      ) : null}
    </section>
  );
}
