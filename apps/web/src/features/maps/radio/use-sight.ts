/**
 * The state of the line-of-sight tool: the two ends picked on the map, the antenna
 * heights and the frequency, the ground between the ends as the server read it, and
 * the answer.
 *
 * The ground comes from the server, which reads it from installed terrain. Everything
 * after that (the ray, the Earth's curve, the Fresnel zone, the verdict) is worked out
 * here in the browser, so changing a height or the band answers at once without asking
 * for the same ground again.
 */
import { analyseSight, greatCirclePoint, type MarkerDto, type SightResult, type SightSample, sightSamples } from "@outpost/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStoredState } from "../hooks";
import type { LatLon } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { EMPTY } from "../map/overlays";
import { useTerrainProfile } from "./data";
import { sightData } from "./layers";
import {
  DEFAULT_SIGHT_SETTINGS,
  frequencyOf,
  isSightSettings,
  readSight,
  SIGHT_SETTINGS_KEY,
  type SightReading,
  type SightSettings,
} from "./sight";

/** One end of the path: where it is, and the saved place it was taken from, if it was. */
export interface SightEnd {
  position: LatLon;
  name?: string;
}

export type SightEndName = "from" | "to";

export interface Sight {
  from: SightEnd | null;
  to: SightEnd | null;
  /** The end the next press on the map sets, or null when both are where they should be. */
  picking: SightEndName | null;
  /** Asks for an end to be chosen again on the map. */
  pick(end: SightEndName): void;
  /** Puts the end being chosen at a position: what a press on the map does. */
  place(end: SightEnd): void;
  swap(): void;
  restart(): void;
  settings: SightSettings;
  setSettings(next: (current: SightSettings) => SightSettings): void;
  frequencyMHz: number;
  profile: ReturnType<typeof useTerrainProfile>;
  result: SightResult | null;
  /** Null until the ground is read, and when there is no ground under an end to draw a ray from. */
  samples: SightSample[] | null;
  reading: SightReading | null;
  /** The share of the way along the path that the chart is being read at, to show on the map. */
  setScrub(share: number | null): void;
}

const EMPTY_ENDS = { from: null as SightEnd | null, to: null as SightEnd | null, picking: "from" as SightEndName | null };

export function useSight({
  engine,
  active,
  markers,
  start,
}: {
  engine: MapEngine | null;
  /** Whether the tool is in hand. Putting it down forgets the ends and clears the map. */
  active: boolean;
  /** Saved places: pressing one while choosing an end puts the end exactly on it. */
  markers: MarkerDto[];
  /**
   * The ends to begin with, when the tool is taken up from a measured path or from a
   * repeater. A first end of null is still to be chosen on the map.
   */
  start: [SightEnd | null, SightEnd] | null;
}): Sight {
  const [ends, setEnds] = useState(EMPTY_ENDS);
  const [settings, setSettings] = useStoredState(SIGHT_SETTINGS_KEY, isSightSettings, DEFAULT_SIGHT_SETTINGS);
  const [scrub, setScrub] = useState<number | null>(null);
  const { from, to, picking } = ends;

  // Taken up: start from the measured path, or from nothing. Put down: forget.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the starting points are read once, when the tool is taken up
  useEffect(() => {
    setEnds(active && start ? { from: start[0], to: start[1], picking: start[0] ? null : "from" } : EMPTY_ENDS);
    setScrub(null);
  }, [active]);

  const place = useCallback((end: SightEnd) => {
    const placed = { ...end, position: { lat: Number(end.position.lat.toFixed(6)), lon: Number(end.position.lon.toFixed(6)) } };
    setEnds((current) => {
      if (current.picking === "from") return { ...current, from: placed, picking: current.to ? null : "to" };
      if (current.picking === "to") return { ...current, to: placed, picking: null };
      return current;
    });
  }, []);

  const latest = useRef(markers);
  latest.current = markers;
  useEffect(() => {
    if (!engine || !active) return;
    return engine.on("click", ({ position, hit }) => {
      const marker = hit?.type === "marker" ? latest.current.find((item) => item.id === hit.id) : undefined;
      place(marker ? { position: { lat: marker.lat, lon: marker.lon }, name: marker.name } : { position });
    });
  }, [engine, active, place]);

  const profile = useTerrainProfile(active ? (from?.position ?? null) : null, active ? (to?.position ?? null) : null);
  const frequencyMHz = frequencyOf(settings);
  const input = useMemo(
    () =>
      profile.data
        ? {
            distanceMeters: profile.data.distanceMeters,
            heights: profile.data.heights,
            antennaFromMeters: settings.antennaFrom,
            antennaToMeters: settings.antennaTo,
            frequencyMHz,
          }
        : null,
    [profile.data, settings.antennaFrom, settings.antennaTo, frequencyMHz],
  );
  const result = useMemo(() => (input ? analyseSight(input) : null), [input]);
  const samples = useMemo(() => (input ? sightSamples(input) : null), [input]);
  const reading = useMemo(() => (profile.data && result ? readSight(profile.data, result) : null), [profile.data, result]);

  // The path on the map, with the place the answer turns on and the place the chart is being read at.
  const mark = reading?.mark;
  const total = profile.data?.distanceMeters;
  useEffect(() => {
    if (!engine) return;
    if (!active) {
      engine.setOverlay("o-sight", EMPTY);
      return;
    }
    const both = from && to ? ([from.position, to.position] as const) : null;
    engine.setOverlay(
      "o-sight",
      sightData({
        from: from?.position ?? null,
        to: to?.position ?? null,
        mark:
          both && mark && total ? { position: greatCirclePoint(both[0], both[1], mark.distanceMeters / total), label: mark.label } : null,
        scrub: both && scrub !== null ? greatCirclePoint(both[0], both[1], scrub) : null,
      }),
    );
  }, [engine, active, from, to, mark, total, scrub]);

  return {
    from,
    to,
    picking,
    pick: useCallback((end) => setEnds((current) => ({ ...current, picking: end })), []),
    place,
    swap: useCallback(() => {
      setEnds((current) => ({ ...current, from: current.to, to: current.from }));
      setSettings((current) => ({ ...current, antennaFrom: current.antennaTo, antennaTo: current.antennaFrom }));
    }, [setSettings]),
    restart: useCallback(() => setEnds(EMPTY_ENDS), []),
    settings,
    setSettings,
    frequencyMHz,
    profile,
    result,
    samples,
    reading,
    setScrub,
  };
}
