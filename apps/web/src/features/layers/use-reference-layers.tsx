/**
 * The reference layers on a map: which are shown (remembered on this device), keeping
 * them drawn for the view, opening a record when it is pressed, and the credits for what
 * is on screen. A screen with a map mounts it with one call and shows what it returns:
 * the panel, the card for the record that is open, and the credits.
 *
 * Nothing here is particular to the Maps screen; another screen with a map (the nuclear
 * preparedness workspace) can mount it the same way.
 */
import { type FeatureProvenance, REFERENCE_LAYERS, type ReferenceFilter, type ReferenceLayerId } from "@outpost/shared";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useStoredState } from "@/features/maps/hooks";
import type { LatLon } from "@/features/maps/lib/geo";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY } from "@/features/maps/map/overlays";
import type { Credit } from "@/features/maps/map-footer";
import { overlayBox } from "@/features/repeaters/map/layers";
import { notify } from "@/lib/notify";
import { featuresAt, useFeature, useLayersSummary, useOverlay, usePopulationGrid } from "./data";
import { FeatureCard } from "./feature-card";
import { LayersPanel } from "./layers-panel";
import {
  layerColours,
  nearestReference,
  POPULATION_SOURCE,
  populationData,
  populationShades,
  REFERENCE_SOURCE,
  referenceData,
} from "./symbols";

const KEY = "outpost.maps.reference-layers";

export interface LayerChoice {
  /** The layers drawn. */
  layers: ReferenceLayerId[];
  population: boolean;
  country: string | null;
  provider: string | null;
  kind: string | null;
}

const NONE: LayerChoice = { layers: [], population: false, country: null, provider: null, kind: null };

const isChoice = (value: unknown): value is LayerChoice => {
  const choice = value as LayerChoice;
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(choice.layers) &&
    choice.layers.every((layer) => (REFERENCE_LAYERS as readonly string[]).includes(layer)) &&
    typeof choice.population === "boolean"
  );
};

/** How much of the bottom of the map the card covers: on a phone most of the lower half; on a wide screen its own height, as it can be tall. */
const cardCover = () => (window.matchMedia("(min-width: 48rem)").matches ? 340 : 290);

export interface ReferenceLayersOnMap {
  /** The Layers panel. */
  panel: ReactNode;
  /** The card for the record that is open, or null. */
  card: ReactNode | null;
  /** Credits for the layers drawn now. */
  credits: Credit[];
  /** Whether anything is drawn. */
  shown: boolean;
  /** Opens a record by its id, switching its layer on and going to it: for a list of records elsewhere on the screen. */
  open: (id: number, layer?: ReferenceLayerId, at?: LatLon | null) => void;
}

export function useReferenceLayers({
  engine,
  browsing,
  onManage,
}: {
  engine: MapEngine | null;
  /** No tool is in hand, so a press on the map can open a record. */
  browsing: boolean;
  /** Opens the place where reference data is downloaded and imported. */
  onManage: () => void;
}): ReferenceLayersOnMap {
  const location = useLocation();
  const [choice, setChoice] = useStoredState<LayerChoice>(KEY, isChoice, NONE);
  const [view, setView] = useState<{ box: string; zoom: number } | null>(null);
  /** The middle of the map when it last came to rest: the nearest list measures from it. */
  const [centre, setCentre] = useState<LatLon | null>(null);
  /** Roughly where the map is (to a tenth of a degree), drawn or not: the country a layer with nothing held is offered for. */
  const [roughly, setRoughly] = useState<LatLon | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [alsoHere, setAlsoHere] = useState<Array<{ id: number; name: string; kindLabel: string; provenance: FeatureProvenance }>>([]);
  const summary = useLayersSummary();
  const installed = useMemo(() => new Set((summary.data?.layers ?? []).map((layer) => layer.id)), [summary.data]);
  // Only layers that are installed are asked about; a choice remembered from before a pack was removed is kept for when it is back.
  const drawn = useMemo(() => choice.layers.filter((layer) => installed.has(layer)), [choice.layers, installed]);
  const filter: ReferenceFilter = useMemo(
    () => ({
      layers: drawn,
      ...(choice.country ? { countries: [choice.country] } : {}),
      ...(choice.provider ? { providers: [choice.provider] } : {}),
      ...(choice.kind ? { kinds: [choice.kind] } : {}),
    }),
    [drawn, choice.country, choice.provider, choice.kind],
  );
  const populationOn = choice.population && (summary.data?.population.length ?? 0) > 0;
  const overlay = useOverlay(view?.box ?? null, view?.zoom ?? 0, filter);
  const population = usePopulationGrid(view?.box ?? null, view?.zoom ?? 0, populationOn);
  const detail = useFeature(selectedId);
  const colours = useMemo(() => layerColours(), []);
  const shades = useMemo(() => populationShades(), []);

  useEffect(() => {
    if (!engine || (drawn.length === 0 && !populationOn)) return;
    const read = () => {
      setView({ box: overlayBox(engine.getBounds()), zoom: engine.getZoom() });
      setCentre(engine.getCenter());
    };
    read();
    return engine.on("moveend", read);
  }, [engine, drawn.length, populationOn]);
  useEffect(() => {
    if (!engine) return;
    const read = () => {
      const at = engine.getCenter();
      const next = { lat: Math.round(at.lat * 10) / 10, lon: Math.round(at.lon * 10) / 10 };
      setRoughly((current) => (current && current.lat === next.lat && current.lon === next.lon ? current : next));
    };
    read();
    return engine.on("moveend", read);
  }, [engine]);

  const selected = detail.data;
  const ringLat = selected?.lat ?? undefined;
  const ringLon = selected?.lon ?? undefined;
  useEffect(() => {
    if (!engine) return;
    const ring = ringLat !== undefined && ringLon !== undefined ? { lat: ringLat, lon: ringLon } : null;
    engine.setOverlay(REFERENCE_SOURCE, drawn.length > 0 ? referenceData(overlay.data, ring, colours) : EMPTY);
  }, [engine, drawn.length, overlay.data, ringLat, ringLon, colours]);

  useEffect(() => {
    if (!engine) return;
    engine.setOverlay(POPULATION_SOURCE, populationOn ? populationData(population.data, shades) : EMPTY);
  }, [engine, populationOn, population.data, shades]);

  // A press on a record opens it; a press on a patch goes in closer; a press inside an area shows what contains it.
  const latest = useRef({ browsing, drawn, data: overlay.data, filter });
  latest.current = { browsing, drawn, data: overlay.data, filter };
  useEffect(() => {
    if (!engine) return;
    return engine.on("click", ({ point, position, hit }) => {
      const now = latest.current;
      if (!now.browsing || now.drawn.length === 0 || hit) return;
      const found = nearestReference(now.data, point, (where) => engine.project(where));
      if (found?.kind === "point" && found.id !== undefined) {
        setAlsoHere([]);
        setSelectedId(found.id);
        return;
      }
      if (found?.kind === "cell") {
        engine.flyTo({ lat: found.lat, lon: found.lon }, Math.min(engine.getZoom() + 2, 14));
        return;
      }
      featuresAt(position.lat, position.lon, now.filter)
        .then(({ hits }) => {
          if (hits.length === 0) return;
          setSelectedId(hits[0]!.id);
          setAlsoHere(hits.slice(1).map(({ id, name, kindLabel, provenance }) => ({ id, name, kindLabel, provenance })));
        })
        .catch(() => undefined);
    });
  }, [engine]);

  useEffect(() => {
    if (!browsing) setSelectedId(null);
  }, [browsing]);

  // On a phone the card covers the lower part of the map: the record it is about is kept clear of it,
  // unless the map is already flying to it (a pan would cut the flight short).
  const flying = useRef(0);
  useEffect(() => {
    if (!engine || ringLat === undefined || ringLon === undefined || Date.now() - flying.current < 2_500) return;
    const covered = cardCover();
    const position = { lat: ringLat, lon: ringLon };
    if (covered > 0 && !engine.isInView(position, covered)) engine.panTo(position, covered);
  }, [engine, ringLat, ringLon]);

  const show = useCallback(
    (layer: ReferenceLayerId) =>
      setChoice((current) => (current.layers.includes(layer) ? current : { ...current, layers: [...current.layers, layer] })),
    [setChoice],
  );

  /** Opens a record found by name: from the search in the panel, or a link from the search across everything. */
  const open = useCallback(
    (id: number, layer?: ReferenceLayerId, at?: LatLon | null) => {
      if (layer) show(layer);
      setAlsoHere([]);
      setSelectedId(id);
      if (engine && at) {
        flying.current = Date.now();
        engine.flyTo(at, Math.max(engine.getZoom(), 11), cardCover());
      }
    },
    [engine, show],
  );

  // Links from search: /maps?feature=<id>.
  const handled = useRef<string | undefined>(undefined);
  const linked = new URLSearchParams(location.search).get("feature");
  const linkedId = linked && /^\d+$/.test(linked) ? Number(linked) : null;
  const wantsManage = new URLSearchParams(location.search).get("reference") === "manage";
  useEffect(() => {
    if (wantsManage && handled.current !== location.key) {
      handled.current = location.key;
      onManage();
    }
  }, [wantsManage, location.key, onManage]);
  useEffect(() => {
    if (linkedId !== null && handled.current !== location.key) setSelectedId(linkedId);
  }, [linkedId, location.key]);
  useEffect(() => {
    if (!engine || linkedId === null || handled.current === location.key || selectedId !== linkedId) return;
    if (detail.isError) {
      handled.current = location.key;
      notify.error("That record is no longer held: its pack may have been removed or updated.");
      setSelectedId(null);
      return;
    }
    if (!detail.data) return;
    handled.current = location.key;
    show(detail.data.layer);
    flying.current = Date.now();
    if (detail.data.lat !== null && detail.data.lon !== null)
      engine.flyTo({ lat: detail.data.lat, lon: detail.data.lon }, Math.max(engine.getZoom(), 11), cardCover());
    const params = new URLSearchParams(location.search);
    params.delete("feature");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${location.pathname}${rest ? `?${rest}` : ""}`);
  }, [engine, linkedId, location.key, location.search, location.pathname, selectedId, detail.data, detail.isError, show]);

  const credits = useMemo<Credit[]>(() => {
    if (drawn.length === 0 && !populationOn) return [];
    // Only the sources of what is drawn; Natural Earth is credited by the map itself already.
    const drawing = new Set(
      (summary.data?.layers ?? [])
        .filter((layer) => drawn.includes(layer.id))
        .flatMap((layer) => layer.providers.map((provider) => provider.id)),
    );
    return (summary.data?.credits ?? [])
      .filter((credit) => credit.provider !== "natural-earth")
      .filter((credit) =>
        credit.provider === "worldpop"
          ? populationOn
          : credit.provider === "osm"
            ? drawing.has("osm") || drawing.has("osm-extract")
            : drawing.has(credit.provider),
      )
      .map((credit) => ({
        key: `reference-${credit.provider}-${credit.text}`,
        parts: [{ text: credit.text, ...(credit.url ? { href: credit.url } : {}) }],
      }));
  }, [summary.data, drawn, populationOn]);

  const card =
    selectedId !== null && (browsing || linkedId !== null) ? (
      <FeatureCard
        query={detail}
        alsoHere={alsoHere}
        onOpen={(id) => {
          setAlsoHere((current) => current.filter((entry) => entry.id !== id));
          setSelectedId(id);
        }}
        onClose={() => {
          setSelectedId(null);
          setAlsoHere([]);
        }}
      />
    ) : null;

  const panel = (
    <LayersPanel
      summary={summary}
      choice={choice}
      onChoice={setChoice}
      colours={colours}
      shades={shades}
      onOpen={open}
      floodZones={overlay.data?.floodZones ?? null}
      lines={overlay.data?.lines ?? null}
      centre={centre}
      roughly={roughly}
    />
  );

  return { panel, card, credits, shown: drawn.length > 0 || populationOn, open };
}
