/**
 * The map while the server is out of reach: the kept areas, routes and saved places,
 * drawn by the same map code from the copies on this phone. It is for finding your
 * way, not for changing anything: there is no drawing, saving or downloading here.
 *
 * The phone's own position still works, because that comes from the phone.
 */
import type { Bbox, InstalledRegion, MapSources, MarkerDto, TrackWithGeometryDto } from "@outpost/shared";
import { CircleAlert, LocateFixed, Minus, Plus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import "@/features/maps/maps.css";
import { Notice } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { useGeolocation, useIsDesktop, useMapTheme, useStoredState } from "@/features/maps/hooks";
import { formatPosition, isReadoutFormat, type ReadoutFormat } from "@/features/maps/lib/coords";
import { bboxUnion, formatDistance } from "@/features/maps/lib/geo";
import type { StyleInput } from "@/features/maps/lib/style";
import { DEFAULT_VIEW, readStored, STORAGE_KEYS } from "@/features/maps/lib/view";
import type { MapEngine } from "@/features/maps/map/engine";
import { coverageData, locationData, markersData, tracksData } from "@/features/maps/map/overlays";
import { creditsFor, MapFooter } from "@/features/maps/map-footer";
import { type Detent, MobileSheet } from "@/features/maps/side-panel";
import { ColorDot, ControlButton, ControlGroup, PanelHeading } from "@/features/maps/ui";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { DEVICE } from "./device";
import { MARKERS_PATH, PLACES_ID, trackPath } from "./keep";
import { type KeptArea, type KeptTrack, readKeptJson, useKept } from "./store";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** The newest kept area's account of the map, with terrain left out unless some kept area holds it. */
function keptSources(areas: KeptArea[]): MapSources | undefined {
  const newest = [...areas].sort((a, b) => b.refreshedAt - a.refreshedAt)[0];
  if (!newest) return undefined;
  if (areas.some((area) => area.terrainMaxZoom !== null)) return newest.sources;
  const { terrain: _terrain, ...sources } = newest.sources.sources;
  return { ...newest.sources, hasTerrain: false, sources };
}

const row = "flex w-full min-w-0 items-start gap-3 px-4 py-2.5 text-left hover:bg-surface focus-visible:-outline-offset-2 max-md:py-3";

function List({ heading, count, children }: { heading: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <PanelHeading className="px-4">{heading}</PanelHeading>
      <ul className="mt-1 divide-y divide-border border-y border-border">{children}</ul>
    </section>
  );
}

export default function KeptMapScreen() {
  const kept = useKept();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const { flavour, theme } = useMapTheme();
  const [format, setFormat] = useStoredState<ReadoutFormat>(STORAGE_KEYS.coordinateFormat, isReadoutFormat, "decimal");
  const [detent, setDetent] = useState<Detent>("peek");

  const areas = useMemo(() => (kept ?? []).filter((item): item is KeptArea => item.kind === "area"), [kept]);
  const keptTracks = useMemo(() => (kept ?? []).filter((item): item is KeptTrack => item.kind === "track"), [kept]);
  const hasPlaces = (kept ?? []).some((item) => item.kind === "places");

  const [tracks, setTracks] = useState<TrackWithGeometryDto[]>([]);
  const [markers, setMarkers] = useState<MarkerDto[]>([]);
  useEffect(() => {
    let current = true;
    void Promise.all(keptTracks.map((item) => readKeptJson<{ track: TrackWithGeometryDto }>("track", item.id, trackPath(item.id)))).then(
      (answers) => current && setTracks(answers.flatMap((answer) => (answer ? [answer.track] : []))),
    );
    return () => {
      current = false;
    };
  }, [keptTracks]);
  useEffect(() => {
    let current = true;
    if (!hasPlaces) return setMarkers([]);
    void readKeptJson<{ markers: MarkerDto[] }>("places", PLACES_ID, MARKERS_PATH).then(
      (answer) => current && setMarkers(answer?.markers ?? []),
    );
    return () => {
      current = false;
    };
  }, [hasPlaces]);

  const [selected, setSelected] = useState<{ type: "track" | "marker"; id: string } | null>(() => {
    const track = new URLSearchParams(location.search).get("track");
    return track ? { type: "track", id: track } : null;
  });

  // ── The map ──

  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [problem, setProblem] = useState<string>();
  const sources = useMemo(() => keptSources(areas), [areas]);
  const terrainKept = Boolean(sources?.hasTerrain);
  const styleInput = useMemo<Omit<StyleInput, "overlays">>(
    () => ({
      sources,
      flavour,
      theme,
      // The same choices as on the map at home; with no terrain kept there is nothing to draw them from.
      hillshade: terrainKept && readStored(STORAGE_KEYS.hillshade, isBoolean, true),
      contours: terrainKept && readStored(STORAGE_KEYS.contours, isBoolean, false),
      origin: window.location.origin,
      cacheKey: "",
    }),
    [sources, flavour, theme, terrainKept],
  );
  const latestStyle = useRef(styleInput);
  latestStyle.current = styleInput;
  const applied = useRef<typeof styleInput | undefined>(undefined);
  const startBox = useRef<Bbox | null>(null);
  startBox.current = bboxUnion([...areas.map((area) => area.bbox), ...keptTracks.flatMap((track) => (track.bounds ? [track.bounds] : []))]);

  const ready = kept !== undefined;
  useEffect(() => {
    if (!ready || !container.current) return;
    let cancelled = false;
    let created: MapEngine | undefined;
    import("@/features/maps/map/engine")
      .then(({ MapEngine }) => {
        if (cancelled || !container.current) return;
        try {
          created = new MapEngine(container.current, DEFAULT_VIEW, latestStyle.current);
        } catch (error) {
          setStatus("failed");
          setProblem(errorMessage(error));
          return;
        }
        applied.current = latestStyle.current;
        if (startBox.current) created.fitBounds(startBox.current, { animate: false, maxZoom: 13 });
        setEngine(created);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("failed");
        setProblem(`The map's own program is not on this ${DEVICE}. Open Outpost once within reach of the server and it will be kept.`);
      });
    return () => {
      cancelled = true;
      created?.destroy();
      setEngine(null);
    };
  }, [ready]);

  useEffect(() => {
    if (!engine || applied.current === styleInput) return;
    applied.current = styleInput;
    engine.setStyle(styleInput);
  }, [engine, styleInput]);

  useEffect(() => {
    engine?.setOverlay("o-markers", markersData(markers, null));
  }, [engine, markers]);
  useEffect(() => {
    if (!engine) return;
    const data = tracksData(tracks, selected?.type === "track" ? selected.id : null);
    engine.setOverlay("o-tracks", data.lines);
    engine.setOverlay("o-track-ends", data.ends);
  }, [engine, tracks, selected]);
  useEffect(() => {
    // The kept boxes are outlined: inside them the map is detailed, outside it is only as fine as the coarse tiles that came along.
    const outlines = areas.map((area) => ({ id: area.id, name: area.title, tileType: "vector", bounds: area.bbox }) as InstalledRegion);
    engine?.setOverlay("o-coverage", coverageData(outlines));
  }, [engine, areas]);

  useEffect(() => {
    if (!engine) return;
    return engine.on("click", ({ hit }) => {
      setSelected(hit ? { type: hit.type, id: hit.id } : null);
      if (hit) setDetent((current) => (current === "peek" ? "half" : current));
    });
  }, [engine]);

  const locate = useGeolocation(
    (fix, first) => {
      if (first) engine?.flyTo(fix, Math.max(engine.getZoom(), 14));
    },
    (message) => toast.error(message),
  );
  useEffect(() => {
    engine?.setOverlay("o-location", locationData(locate.fix));
  }, [engine, locate.fix]);

  const credits = useMemo(
    () => creditsFor(sources?.attributions ?? [], { hasTiles: Boolean(sources?.hasTiles), terrain: terrainKept }),
    [sources, terrainKept],
  );

  const nothing = ready && areas.length === 0 && keptTracks.length === 0 && !hasPlaces;
  const chosenMarker = selected?.type === "marker" ? markers.find((marker) => marker.id === selected.id) : undefined;

  const lists = (
    <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-5 overflow-y-auto py-3">
      {nothing ? (
        <p className="px-4 text-small text-ink-muted">
          No map area, route or saved place is kept on this {DEVICE}, so the map shows only the outline of the world. They are kept from the
          map while the server is in reach.
        </p>
      ) : null}
      {chosenMarker ? (
        <section className="px-4" aria-label="Chosen place">
          <h3 className="font-title text-lead text-ink">{chosenMarker.name}</h3>
          <p className="tabular mt-0.5 font-mono text-[0.8125rem] text-ink-muted">
            {formatPosition(chosenMarker.lat, chosenMarker.lon, format).text}
          </p>
          {chosenMarker.note ? <p className="mt-2 whitespace-pre-wrap text-small text-ink">{chosenMarker.note}</p> : null}
        </section>
      ) : null}
      <List heading="Map areas" count={areas.length}>
        {areas.map((area) => (
          <li key={area.id}>
            <button type="button" className={row} onClick={() => engine?.fitBounds(area.bbox, { maxZoom: area.maxZoom })}>
              <span className="min-w-0">
                <span className="block truncate text-small font-medium text-ink">{area.title}</span>
                <span className="tabular block text-small text-ink-muted">
                  Detailed to zoom {area.maxZoom}
                  {area.complete ? "" : ", not finished"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </List>
      <List heading="Routes" count={keptTracks.length}>
        {keptTracks.map((track) => (
          <li key={track.id}>
            <button
              type="button"
              aria-pressed={selected?.type === "track" && selected.id === track.id}
              className={row}
              onClick={() => {
                setSelected({ type: "track", id: track.id });
                if (track.bounds) engine?.fitBounds(track.bounds);
              }}
            >
              <ColorDot color={track.color} className="mt-1.5" />
              <span className="min-w-0">
                <span className="block truncate text-small font-medium text-ink">{track.title}</span>
                <span className="tabular block text-small text-ink-muted">{formatDistance(track.distanceMeters)}</span>
              </span>
            </button>
          </li>
        ))}
      </List>
      <List heading={`Saved places (${plural(markers.length, "place")})`} count={markers.length}>
        {[...markers]
          .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name, "en"))
          .map((marker) => (
            <li key={marker.id}>
              <button
                type="button"
                aria-pressed={selected?.type === "marker" && selected.id === marker.id}
                className={row}
                onClick={() => {
                  setSelected({ type: "marker", id: marker.id });
                  engine?.flyTo({ lat: marker.lat, lon: marker.lon });
                }}
              >
                <ColorDot color={marker.color} className="mt-1.5" />
                <span className="min-w-0">
                  <span className="block truncate text-small font-medium text-ink">{marker.name}</span>
                  {marker.note ? <span className="block truncate text-small text-ink-muted">{marker.note.split("\n")[0]}</span> : null}
                </span>
              </button>
            </li>
          ))}
      </List>
    </div>
  );

  return (
    // Whatever height the line saying the server is out of reach leaves; on a phone, clear of the bottom bar.
    <div className="relative isolate flex min-h-0 flex-1 overflow-hidden max-md:pb-14">
      {isDesktop ? (
        <aside aria-label={`Kept on this ${DEVICE}`} className="flex w-[22rem] shrink-0 flex-col border-r border-border bg-page">
          <div className="flex h-14 shrink-0 items-center px-4">
            <h1 className="font-title text-heading text-ink">Maps</h1>
          </div>
          {lists}
        </aside>
      ) : (
        <h1 className="sr-only">Maps</h1>
      )}
      <div className="relative min-w-0 flex-1 bg-surface">
        <div className="absolute inset-0">
          <div ref={container} className="outpost-map size-full" />
        </div>
        {status === "loading" ? (
          <div className="absolute inset-0 grid place-content-center" aria-busy>
            <Skeleton className="h-2 w-40" />
            <span className="sr-only">Loading the map</span>
          </div>
        ) : status === "failed" ? (
          <div className="absolute inset-0 grid place-content-center p-6">
            <Notice tone="warning" icon={<CircleAlert />} title="The map could not be started" className="max-w-md">
              {problem}
            </Notice>
          </div>
        ) : null}

        <div className="pointer-events-none absolute top-3 right-3 z-10">
          <ControlGroup className="pointer-events-auto">
            <ControlButton label="Zoom in" disabled={!engine} onClick={() => engine?.zoomIn()}>
              <Plus />
            </ControlButton>
            <ControlButton label="Zoom out" disabled={!engine} onClick={() => engine?.zoomOut()}>
              <Minus />
            </ControlButton>
            {locate.supported ? (
              <ControlButton
                label={locate.state === "off" ? "Show where this device is" : "Stop showing where this device is"}
                pressed={locate.state !== "off"}
                disabled={!engine}
                onClick={() => (locate.state === "off" ? locate.start() : locate.stop())}
              >
                <LocateFixed />
              </ControlButton>
            ) : null}
          </ControlGroup>
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-[calc(var(--sheet-height,0px)+0.625rem)] z-10">
          <MapFooter engine={engine} format={format} onFormatChange={setFormat} credits={engine ? credits : []} className="w-full" />
        </div>

        {!isDesktop ? (
          <MobileSheet detent={detent} onDetentChange={setDetent}>
            {lists}
          </MobileSheet>
        ) : null}
      </div>
    </div>
  );
}
