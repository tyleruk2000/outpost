/**
 * APRS stations, aircraft and ships on the map (outpost-ywbh.2, .6, .7), drawn to the one
 * design of `heard.tsx`, and the card for anything heard, mesh radios included.
 *
 * Each source has a switch in the "Heard on the radio" group, remembered on this device,
 * off to begin with. A source's stations are asked for only while its switch is on and
 * the map is open, and kept fresh by `heard.changed`: marks move as reports arrive, with
 * no reload and no polling. Labels are drawn again each minute while the page is in view,
 * so that the ages in them stay true.
 */
import { type HeardSourceId, type HeardStation, type MeshPosition, RECEIVER_KINDS, type ReceiverKind } from "@outpost/shared";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useStoredState } from "@/features/maps/hooks";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY, type FeatureCollection } from "@/features/maps/map/overlays";
import { radioName } from "@/features/mesh/map";
import { usePageVisible } from "@/lib/page-visible";
import { HeardCard, type HeardTools } from "./card";
import { useReceivers, useStation, useStations } from "./data";
import {
  HEARD_COUNT_LAYERS,
  HEARD_PINNED,
  HEARD_POINT_LAYERS,
  HEARD_SOURCES,
  HEARD_TRAIL,
  type HeardSource,
  heardFeature,
  rememberHeard,
} from "./heard";
import { meshItem, stationItem } from "./items";
import { displayName, type Home, sourceName } from "./words";

/** How much of the foot of the map a card covers, as the reference layers' records allow for. */
const cardCover = () => (window.matchMedia("(min-width: 48rem)").matches ? 340 : 290);

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** The marks of one source's stations, and of those pinned among them. */
export function stationFeatures(stations: HeardStation[], now = Date.now()): { marks: FeatureCollection; pinned: FeatureCollection } {
  const marks: FeatureCollection = { type: "FeatureCollection", features: [] };
  const pinned: FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const station of stations) {
    if (station.lat === null || station.lon === null || station.details.killed) continue;
    const feature = heardFeature(
      {
        source: station.source,
        id: station.id,
        name: displayName(station),
        at: station.positionAt ?? station.lastAt,
        lat: station.lat,
        lon: station.lon,
        pinned: station.pinned,
      },
      now,
    );
    (station.pinned ? pinned : marks).features.push(feature);
  }
  return { marks, pinned };
}

function useMinuteTick(on: boolean): number {
  const visible = usePageVisible();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!visible || !on) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [visible, on]);
  return tick;
}

function useSourceSwitch(source: ReceiverKind) {
  return useStoredState(`outpost.maps.heard.${source}`, isBoolean, false);
}

type Selected = { source: HeardSourceId; id: string } | null;

export function useHeardOnMap({
  engine,
  browsing,
  meshRadios,
  home,
  tools,
}: {
  engine: MapEngine | null;
  browsing: boolean;
  meshRadios: MeshPosition[];
  home: Home | null;
  tools: HeardTools;
}): { sources: HeardSource[]; card: ReactNode | null } {
  const receivers = useReceivers();
  const [aprsOn, setAprs] = useSourceSwitch("aprs");
  const [adsbOn, setAdsb] = useSourceSwitch("adsb");
  const [aisOn, setAis] = useSourceSwitch("ais");
  const on: Record<ReceiverKind, boolean> = { aprs: aprsOn, adsb: adsbOn, ais: aisOn };
  const set: Record<ReceiverKind, (value: boolean) => void> = { aprs: setAprs, adsb: setAdsb, ais: setAis };
  const aprs = useStations("aprs", aprsOn);
  const adsb = useStations("adsb", adsbOn);
  const ais = useStations("ais", aisOn);
  const lists: Record<ReceiverKind, HeardStation[] | undefined> = { aprs: aprs.data, adsb: adsb.data, ais: ais.data };
  const tick = useMinuteTick(aprsOn || adsbOn || aisOn);

  const drawn = useMemo(() => {
    void tick;
    const now = Date.now();
    return {
      aprs: stationFeatures(aprsOn ? (aprs.data ?? []) : [], now),
      adsb: stationFeatures(adsbOn ? (adsb.data ?? []) : [], now),
      ais: stationFeatures(aisOn ? (ais.data ?? []) : [], now),
    };
  }, [tick, aprsOn, adsbOn, aisOn, aprs.data, adsb.data, ais.data]);

  useEffect(() => {
    if (!engine) return;
    const pinned: FeatureCollection = { type: "FeatureCollection", features: [] };
    for (const kind of RECEIVER_KINDS) {
      engine.setOverlay(HEARD_SOURCES[kind], drawn[kind].marks);
      rememberHeard(HEARD_SOURCES[kind], drawn[kind].marks);
      pinned.features.push(...drawn[kind].pinned.features);
    }
    engine.setOverlay(HEARD_PINNED, pinned);
    rememberHeard(HEARD_PINNED, pinned);
  }, [engine, drawn]);

  // ── Opening one ──

  const [selected, setSelected] = useState<Selected>(null);
  const latest = useRef({ browsing });
  latest.current = { browsing };
  useEffect(() => {
    if (!engine) return;
    return engine.on("click", ({ point, position, hit }) => {
      if (!latest.current.browsing || hit) return;
      const found = engine.renderedAt(point, [...HEARD_POINT_LAYERS, ...HEARD_COUNT_LAYERS], 12);
      const mark = found.find((entry) => HEARD_POINT_LAYERS.includes(entry.layer));
      if (mark && typeof mark.properties.id === "string" && typeof mark.properties.source === "string") {
        setSelected({ source: mark.properties.source as HeardSourceId, id: mark.properties.id });
        return;
      }
      // A count: closer in, where it comes apart.
      if (found.length > 0) engine.flyTo(position, Math.min(engine.getZoom() + 2, 13));
    });
  }, [engine]);

  useEffect(() => {
    if (!browsing) setSelected(null);
  }, [browsing]);

  // Links from the Heard on the radio screen: /maps?heard=<id>.
  const location = useLocation();
  const linked = new URLSearchParams(location.search).get("heard");
  const handled = useRef<string | undefined>(undefined);
  const stationId = selected && selected.source !== "mesh" ? selected.id : linked && handled.current !== location.key ? linked : null;
  const detail = useStation(stationId);
  useEffect(() => {
    if (!linked || handled.current === location.key || !detail.data || !engine) return;
    handled.current = location.key;
    const station = detail.data.station;
    if (station.source === "aprs") setAprs(true);
    else if (station.source === "adsb") setAdsb(true);
    else if (station.source === "ais") setAis(true);
    setSelected({ source: station.source, id: station.id });
    if (station.lat !== null && station.lon !== null)
      engine.flyTo({ lat: station.lat, lon: station.lon }, Math.max(engine.getZoom(), 12), cardCover());
  }, [linked, location.key, detail.data, engine, setAprs, setAdsb, setAis]);

  // The trail of the one opened, under the marks.
  const trail = selected && selected.source !== "mesh" && detail.data?.station.id === selected.id ? detail.data.trail : null;
  useEffect(() => {
    if (!engine) return;
    if (!trail || trail.length === 0) {
      engine.setOverlay(HEARD_TRAIL, EMPTY);
      return;
    }
    const coordinates = trail.map((point) => [point.lon, point.lat]);
    engine.setOverlay(HEARD_TRAIL, {
      type: "FeatureCollection",
      features: [
        ...(coordinates.length > 1 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString", coordinates } }] : []),
        ...coordinates.map((point) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point", coordinates: point } })),
      ],
    });
  }, [engine, trail]);

  const close = useCallback(() => setSelected(null), []);
  const allReceivers = receivers.data?.receivers ?? [];

  let card: ReactNode | null = null;
  if (selected?.source === "mesh") {
    const radio = meshRadios.find((entry) => entry.id === selected.id);
    if (radio) card = <HeardCard item={meshItem(radio, radioName(radio))} home={home} tools={tools} onClose={close} />;
  } else if (selected && detail.data?.station.id === selected.id) {
    card = <HeardCard item={stationItem(detail.data.station, allReceivers, detail.data.trail)} home={home} tools={tools} onClose={close} />;
  }

  // ── The rows of the group ──

  const sources: HeardSource[] = [];
  for (const kind of RECEIVER_KINDS) {
    const hasReceiver = allReceivers.some((receiver) => receiver.kind === kind);
    const known = receivers.data?.space.bySource[kind].stations ?? 0;
    if (!hasReceiver && known === 0 && !on[kind]) continue;
    const list = lists[kind];
    sources.push({
      id: kind,
      label: sourceName(kind),
      count: on[kind] && list ? drawn[kind].marks.features.length + drawn[kind].pinned.features.length : null,
      on: on[kind],
      onChange: set[kind],
      below:
        on[kind] && list && list.length === 0 ? (
          <p className="text-small text-ink-muted">
            Nothing heard yet.{" "}
            <Link to="/radio/heard" className="text-primary underline underline-offset-2">
              See the receivers
            </Link>
          </p>
        ) : undefined,
    });
  }
  return { sources, card };
}
