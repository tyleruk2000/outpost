/**
 * The Maps screen: an offline map that fills the content area, with search, saved
 * places, routes (drawn here or imported as GPX), a measuring tool and the download
 * manager for map regions.
 *
 * This file holds the screen's state and wires it to the map engine. The engine
 * (MapLibre) is loaded on demand; until it arrives, and if it cannot start at all, the
 * lists in the panel still work.
 */
import "./maps.css";
import {
  ACTIVE_DOWNLOAD_STATES,
  formatDecimal,
  haversineMeters,
  homeLabel,
  type MarkerDto,
  type TrackDto,
  type TrackWithGeometryDto,
} from "@outpost/shared";
import { CircleAlert, Crosshair, FileUp, PanelLeftOpen } from "lucide-react";
import { type DragEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { useCelnavOnMap } from "@/features/celestial-navigation/on-map";
import { CentreLines } from "@/features/compass/magnetic-glance";
import { useDownloads } from "@/features/downloads/use-downloads";
import type { HeardTools } from "@/features/heard/card";
import { HeardGroup } from "@/features/heard/heard";
import { useHeardOnMap } from "@/features/heard/use-heard-on-map";
import { useRangeOnMap } from "@/features/heard/use-range-on-map";
import { useHome } from "@/features/households/home";
import { useHouseholdsOnMap } from "@/features/households/map";
import { useReferenceLayers } from "@/features/layers/use-reference-layers";
import { useMeshOnMap } from "@/features/mesh/map";
import { type SightStart, useRepeatersOnMap } from "@/features/repeaters/map/use-repeaters-on-map";
import { SatellitesLayerPanel, useSatellitesOnMap } from "@/features/satellites/map";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn, plural } from "@/lib/utils";
import { CentreMark } from "./centre-mark";
import {
  useDeleteMarker,
  useMapOverview,
  useMapSources,
  useMarkers,
  useSaveMarker,
  useSaveRoute,
  useTrackGeometries,
  useTracks,
} from "./data";
import { FindRoutePanel } from "./find-route/find-route-panel";
import { anyFoundRoute, ROUTE_CREDIT } from "./find-route/source-credit";
import { PREVIEW_TRACK_ID } from "./find-route/words";
import { useGreyLine } from "./grey-line/grey-line";
import { setNightShading, useGeolocation, useIsDesktop, useMapTheme, useStoredState } from "./hooks";
import { useSatellite } from "./imagery/use-satellite";
import { type ContourReach, contourReach, contoursSupported } from "./lib/contours";
import { formatPosition, isReadoutFormat, type ReadoutFormat } from "./lib/coords";
import { formatDistance, type LatLon } from "./lib/geo";
import { isMapFile } from "./lib/map-files";
import {
  DEFAULT_MAP_STYLE,
  isMapStyleId,
  MAP_STYLE_KEY,
  MAP_STYLES,
  type MapStyleId,
  NIGHT_STYLE_NOTE,
  ROAD_NUMBERS_KEY,
} from "./lib/map-styles";
import { MARKER_HEX } from "./lib/palette";
import { iconOf, pinGlyphOf } from "./lib/place-icons";
import { pressWord } from "./lib/press";
import {
  addPoint,
  insertPoint,
  isStoredRouteDraft,
  movePoint,
  redo,
  removePoint,
  type StoredRouteDraft,
  startEdit,
  undo,
} from "./lib/route-edit";
import type { SearchResult } from "./lib/search";
import type { StyleInput } from "./lib/style";
import { regionsCacheKey } from "./lib/tiles";
import { useUtmGrid } from "./lib/use-utm-grid";
import {
  type CameraView,
  DEFAULT_VIEW,
  isCameraView,
  parseView,
  ROUTE_DRAFT_KEY,
  readStored,
  STORAGE_KEYS,
  withView,
  writeStored,
} from "./lib/view";
import { useMagneticLines } from "./magnetic/use-magnetic-lines";
import type { MapEngine, MapHit } from "./map/engine";
import { coverageData, EMPTY, locationData, markersData, measureData, pointData, tracksData } from "./map/overlays";
import {
  CONTOUR_NOTES,
  ContextMenu,
  DrawCard,
  MapCard,
  MapControls,
  MapToolColumn,
  MeasureCard,
  MoveCard,
  mapTools,
  PinCard,
  type Tool,
} from "./map-chrome";
import { creditsFor, MapFooter } from "./map-footer";
import { type ClearSpace, MapFurniture } from "./map-furniture";
import { ImportMapFilesDialog } from "./panels/import-map-files";
import type { OfflineIntent } from "./panels/offline";
import { draftOf, type PlaceDraft, PlaceEditor, PlacesList } from "./panels/places";
import { hasUnsavedWork, type RouteDraft, RouteEditor } from "./panels/route-editor";
import { RouteDetail, RoutesList } from "./panels/routes";
import { SunGlance } from "./panels/sun-glance";
import { SunPanel } from "./panels/sun-panel";
import { locatorOf } from "./radio/locator";
import { readPointRangePath, usePointRange } from "./radio/point-range";
import { SightCard } from "./radio/sight-card";
import { SightPanel } from "./radio/sight-panel";
import { useLocatorGrid } from "./radio/use-locator-grid";
import { useSight } from "./radio/use-sight";
import { useReach } from "./reach/reach-tool";
import { foldRecordingCard, TrackRecording, useRecordTool } from "./recording/record-ui";
import { useResection } from "./resection/resection-card";
import { ROAD_ROUTE_SOURCE, shownRouteData } from "./road-route/layers";
import { pointName } from "./road-route/point-field";
import { type RoadRouteIntent, RoadRoutePanel, type ShownRoute } from "./road-route/road-route-panel";
import { addRoadsLink } from "./road-route/route-needs";
import { SearchBox } from "./search-box";
import { DesktopPanel, type Detent, detentHeight, MobileSheet, PANEL_TABS, type PanelTab, PanelTabs, PEEK_HEIGHT } from "./side-panel";
import { PanelLoading } from "./ui";
import { useWalkReach } from "./walk/walk-reach";

/** "Print or save as PDF", fetched when it is first asked for. */
const PrintTool = lazy(() => import("./print/print-tool"));
/** The Offline maps tab, with downloads, satellite imagery and reference data: fetched when the tab is first opened. */
const OfflinePanel = lazy(() => import("./panels/offline").then((module) => ({ default: module.OfflinePanel })));

interface PanelState {
  open: boolean;
  tab: PanelTab;
}

const isPanelState = (value: unknown): value is PanelState =>
  Boolean(value) &&
  typeof (value as PanelState).open === "boolean" &&
  (PANEL_TABS as readonly unknown[]).includes((value as PanelState).tab);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

/** A saved place being moved on the map without being opened: where its pin is now. Nothing is kept until it is saved. */
interface PlaceMove {
  id: string;
  lat: number;
  lon: number;
}

/** A found position that has not been saved. */
interface Pin {
  title: string;
  detail?: string;
  position: LatLon;
  /** Dropped to see its sun times, so they start unfolded. */
  sun?: boolean;
  /** Chosen from the search list, which has gone: its card takes the keyboard. */
  focus?: boolean;
}

type MapStatus = "loading" | "ready" | "unsupported" | "failed";

/**
 * A route that was being drawn when the screen was last left or reloaded in this tab.
 * Unsaved points are the person's work: going to look something up in the library and
 * coming back must not lose them.
 */
function restoreRouteDraft(): RouteDraft | null {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(ROUTE_DRAFT_KEY) ?? "null");
    if (!isStoredRouteDraft(stored) || stored.points.length === 0) return null;
    // What it looked like before the changes is not kept, so every point counts as unsaved.
    const edit = { ...startEdit(stored.points), original: [] };
    return {
      trackId: stored.trackId,
      name: stored.name,
      color: stored.color,
      edit,
      selected: null,
      replacesRecording: stored.replacesRecording,
    };
  } catch {
    return null;
  }
}

function keepRouteDraft(draft: RouteDraft | null): void {
  try {
    if (!draft || !hasUnsavedWork(draft)) {
      sessionStorage.removeItem(ROUTE_DRAFT_KEY);
      return;
    }
    const stored: StoredRouteDraft = {
      trackId: draft.trackId,
      name: draft.name,
      color: draft.color,
      points: draft.edit.points,
      replacesRecording: draft.replacesRecording,
    };
    sessionStorage.setItem(ROUTE_DRAFT_KEY, JSON.stringify(stored));
  } catch {
    // Storage refused (a private window): the route then lasts only while this screen is open.
  }
}

/** The toast that asks for a press on the map while saving a place. */
const ADD_PLACE_HINT = "add-place-hint";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export default function MapsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  /** A finger, not a mouse (a tablet at any width): the map's own controls are 44 px each. */
  const coarse = useMediaQuery("(pointer: coarse)");
  const { flavour, theme } = useMapTheme();

  const sources = useMapSources();
  const overview = useMapOverview();
  const markers = useMarkers();
  const tracks = useTracks();
  const downloads = useDownloads();
  const recordTool = useRecordTool();
  const saveMarker = useSaveMarker();
  const deleteMarker = useDeleteMarker();
  const saveRoute = useSaveRoute();

  const [format, setFormat] = useStoredState<ReadoutFormat>(STORAGE_KEYS.coordinateFormat, isReadoutFormat, "decimal");
  const [hillshade, setHillshade] = useStoredState(STORAGE_KEYS.hillshade, isBoolean, true);
  const [contours, setContours] = useStoredState(STORAGE_KEYS.contours, isBoolean, false);
  /** The map's style and road numbers (lib/map-styles.ts): the standard map without numbers unless chosen. */
  const [mapStyle, setMapStyle] = useStoredState<MapStyleId>(MAP_STYLE_KEY, isMapStyleId, DEFAULT_MAP_STYLE);
  const [roadNumbers, setRoadNumbers] = useStoredState(ROAD_NUMBERS_KEY, isBoolean, false);
  // The night style paints the shading (the range, the walk) in its own reds; the pictures are painted in the page.
  useEffect(() => {
    setNightShading(mapStyle === "night");
    return () => setNightShading(false);
  }, [mapStyle]);
  const [hiddenTracks, setHiddenTracks] = useStoredState(STORAGE_KEYS.hiddenTracks, isStringArray, []);
  const [panel, setPanel] = useStoredState<PanelState>(STORAGE_KEYS.panel, isPanelState, { open: true, tab: "places" });
  const [detent, setDetent] = useState<Detent>("peek");
  /** How tall the lowered sheet is: its handle and the whole row of tab names, as the sheet measured them. */
  const [peekHeight, setPeekHeight] = useState(PEEK_HEIGHT);
  /** On a phone: how much of the map the search box and the readout take, as `MapFurniture` measured them. */
  const [clear, setClear] = useState<ClearSpace & { held: number }>({ top: 64, bottom: 98, held: 98 });
  /** On a phone: from the foot of the map up to just below its centre, the room a card in the sheet's place may take. */
  const [dockRoom, setDockRoom] = useState<number | undefined>(undefined);
  /**
   * On a wide screen whose map is too narrow (large text on a computer, the panel open on a small laptop) or too short
   * for the column of tools: the phone's layout over the map, with as many tools as fit and the rest under More, and the
   * card of what is in hand docked at the foot. Worked out from the map's measured size (below), not the window's.
   */
  const [compact, setCompact] = useState(false);
  /** Something is in hand on the map (a tool, a found point, a place being moved): set further down, read when a measurement arrives. */
  const inHand = useRef(false);
  const onClear = useCallback(
    (next: ClearSpace) =>
      setClear((current) => {
        // While something is in hand, the room the camera keeps at the foot may only grow, not shrink. What steps
        // aside for a tool (the line of sun times) would otherwise let the centre of the map slide down towards
        // the tool's card as it came up, and the map would move under the finger about to touch it.
        const held = inHand.current ? Math.max(next.bottom, current.held) : next.bottom;
        // A few pixels more or less (a credit that takes a second line) are not worth sliding the map for.
        const near = (a: number, b: number) => Math.abs(a - b) < 12;
        return near(current.top, next.top) && near(current.bottom, next.bottom) && near(current.held, held) ? current : { ...next, held };
      }),
    [],
  );

  const [restoredDraft] = useState(restoreRouteDraft);
  const [routeDraft, setRouteDraft] = useState<RouteDraft | null>(restoredDraft);
  const [tool, setTool] = useState<Tool>(restoredDraft ? "draw" : "browse");
  /** Set while asking whether to throw away unsaved points; `then` is what was being done when the question came up. */
  const [discarding, setDiscarding] = useState<{ then?: () => void; reshaping?: string; points: number } | null>(null);
  // What the question was about, kept so its words do not change while the dialog closes.
  const lastDiscarding = useRef(discarding);
  if (discarding) lastDiscarding.current = discarding;
  const [mapHasKeyboard, setMapHasKeyboard] = useState(false);
  const [nameRequested, setNameRequested] = useState(false);
  const nameShown = useCallback(() => setNameRequested(false), []);
  const [measurePoints, setMeasurePoints] = useState<LatLon[]>([]);
  /** A position to bring into the clear part of the map once the sheet has moved: a place being saved. */
  const [reveal, setReveal] = useState<LatLon | null>(null);
  /** The two ends a line-of-sight check starts with, when it is taken up from a measured path. */
  const [sightStart, setSightStart] = useState<SightStart | null>(null);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [moving, setMoving] = useState<PlaceMove | null>(null);
  /** What had the keyboard when a move began from the list, to give it back when the move ends. */
  const moveReturnFocus = useRef<HTMLElement | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  /** "Find a route" is open in the Routes tab; `routePreview` is the route it is showing on the map, if any. */
  const [finding, setFinding] = useState(false);
  const [routePreview, setRoutePreview] = useState<TrackWithGeometryDto | null>(null);
  /** "Road route" is open in the Routes tab; `roadShown` is the planned route it draws, with the leg picked out. */
  const [roadRouting, setRoadRouting] = useState(false);
  /** The page to print was asked for in the address (/maps?print=1, from the quick search): taken up once the map is drawn. */
  const [printAsked, setPrintAsked] = useState(false);
  const [roadIntent, setRoadIntent] = useState<RoadRouteIntent | null>(null);
  const [roadShown, setRoadShown] = useState<{ route: ShownRoute; selected: number | null } | null>(null);
  const showRoadRoute = useCallback(
    (route: ShownRoute | null, selected: number | null) => setRoadShown(route ? { route, selected } : null),
    [],
  );
  const clearRoadIntent = useCallback(() => setRoadIntent(null), []);
  const [profilePoint, setProfilePoint] = useState<LatLon | null>(null);
  /** The menu for a point on the map; `keyboard` when it was opened for the centre from the keyboard, which then has it back. */
  const [contextMenu, setContextMenu] = useState<{
    position: LatLon;
    point: { x: number; y: number };
    hit: MapHit | null;
    keyboard?: boolean;
  } | null>(null);
  const [importFiles, setImportFiles] = useState<File[] | null>(null);
  const [dropping, setDropping] = useState(false);
  const [offlineIntent, setOfflineIntent] = useState<OfflineIntent>(null);
  const [firstUseDismissed, setFirstUseDismissed] = useState(false);
  const [hereDismissed, setHereDismissed] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const area = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [locatorGrid, setLocatorGrid] = useLocatorGrid(engine);
  const [magneticLines, setMagneticLines] = useMagneticLines(engine);
  const [utmGridOn, setUtmGrid] = useUtmGrid(engine);
  const greyLine = useGreyLine(engine, isDesktop ? "over" : "flow");
  const satellite = useSatellite({ engine, imagery: sources.data?.imagery, onGetImagery: () => openOffline({ type: "imagery" }) });
  const sight = useSight({ engine, active: tool === "sight", markers: markers.data ?? [], start: sightStart });
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapError, setMapError] = useState<string>();

  // ── The map itself ──

  const cacheKey = useMemo(() => regionsCacheKey(overview.data?.regions ?? []), [overview.data]);
  const styleInput = useMemo<Omit<StyleInput, "overlays">>(
    () => ({
      sources: sources.data,
      flavour,
      theme,
      hillshade,
      contours,
      satellite: satellite.on,
      mapStyle,
      roadNumbers,
      origin: window.location.origin,
      cacheKey,
    }),
    [sources.data, flavour, theme, hillshade, contours, satellite.on, mapStyle, roadNumbers, cacheKey],
  );
  const latestStyle = useRef(styleInput);
  latestStyle.current = styleInput;
  const appliedStyle = useRef<typeof styleInput | undefined>(undefined);

  /** Where the map opens: the address, else where it was last left. Null means "wherever the installed maps are". */
  const [startView] = useState<CameraView | null>(
    () =>
      parseView(new URLSearchParams(window.location.search)) ??
      readStored<CameraView | null>(STORAGE_KEYS.view, (value): value is CameraView => isCameraView(value), null),
  );
  const startBounds = useRef(sources.data?.bounds ?? null);
  startBounds.current = sources.data?.bounds ?? null;

  // The first style needs to know what is installed; wait for that, but not for ever: a failed answer still gets the outline map.
  const settled = !sources.isPending && !overview.isPending;
  useEffect(() => {
    if (!settled || !container.current) return;
    let cancelled = false;
    let created: MapEngine | undefined;
    import("./map/engine")
      .then(({ MapEngine, MapUnsupportedError }) => {
        if (cancelled || !container.current) return;
        try {
          created = new MapEngine(container.current, startView ?? DEFAULT_VIEW, latestStyle.current);
        } catch (error) {
          setMapStatus(error instanceof MapUnsupportedError ? "unsupported" : "failed");
          setMapError(errorMessage(error));
          return;
        }
        appliedStyle.current = latestStyle.current;
        // First visit with maps installed: open on them rather than on a default view.
        const bounds = startBounds.current;
        if (!startView && bounds && bounds[2] - bounds[0] < 300) created.fitBounds(bounds, { animate: false, maxZoom: 11 });
        setEngine(created);
        setMapStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setMapStatus("failed");
        setMapError("The map library could not be loaded. Check that the Outpost server is running, then reload.");
      });
    return () => {
      cancelled = true;
      created?.destroy();
      setEngine(null);
    };
  }, [settled, startView]);

  useEffect(() => {
    if (!engine || appliedStyle.current === styleInput) return;
    appliedStyle.current = styleInput;
    engine.setStyle(styleInput);
  }, [engine, styleInput]);

  // Camera → address bar and storage, once the map comes to rest. Written straight to
  // the history entry so that panning does not re-render the app through the router.
  useEffect(() => {
    if (!engine) return;
    let timer: number | undefined;
    const off = engine.on("moveend", (view) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        writeStored(STORAGE_KEYS.view, view);
        if (window.location.pathname !== "/maps") return;
        const params = new URLSearchParams(window.location.search);
        params.delete("marker");
        params.delete("track");
        for (const key of ["range", "station", "name"]) params.delete(key);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?${withView(params, view).toString()}`);
      }, 250);
    });
    return () => {
      window.clearTimeout(timer);
      off();
    };
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    const offRotated = engine.on("rotated", setRotated);
    let quiet: number | undefined;
    const offError = engine.on("loaderror", (message) => {
      // A screenful of tiles fails together; say it once.
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => setLoadError(message), 400);
    });
    return () => {
      offRotated();
      offError();
      window.clearTimeout(quiet);
    };
  }, [engine]);

  // ── Opening things ──

  const showPanel = useCallback(
    (tab: PanelTab) => {
      setPanel({ open: true, tab });
      setDetent((current) => (current === "peek" ? "half" : current));
    },
    [setPanel],
  );

  const openMarker = useCallback(
    (marker: MarkerDto, fly = true) => {
      setPin(null);
      setTrackId(null);
      setMoving(null);
      setDraft(draftOf(marker));
      showPanel("places");
      if (fly) engine?.flyTo({ lat: marker.lat, lon: marker.lon });
    },
    [engine, showPanel],
  );

  const openTrack = useCallback(
    (track: TrackDto, fit = true) => {
      setDraft(null);
      setMoving(null);
      setPin(null);
      setTrackId(track.id);
      setFinding(false);
      // Opening a route is asking to see it.
      setHiddenTracks((current) => current.filter((id) => id !== track.id));
      showPanel("routes");
      if (fit && track.bounds) engine?.fitBounds(track.bounds);
    },
    [engine, showPanel, setHiddenTracks],
  );

  const startPlace = useCallback(
    (position: LatLon, name = "") => {
      setPin(null);
      setTrackId(null);
      setMoving(null);
      setContextMenu(null);
      setTool("browse");
      setDraft({ name, note: "", color: "teal", icon: "pin", isFavorite: false, lat: position.lat, lon: position.lon });
      showPanel("places");
      setReveal(position);
    },
    [showPanel],
  );

  // ── Drawing a route ──

  const resetSaveRoute = saveRoute.reset;
  /**
   * Takes up the drawing tool: with nothing for a new route, with points to carry on
   * from (a measured path, a point from the context menu), or with a saved route's line
   * to change its shape or to start a copy from.
   */
  const startDrawing = useCallback(
    (points: LatLon[] = [], from?: { track: TrackDto; asCopy: boolean; replacesRecording: boolean }) => {
      setContextMenu(null);
      setPin(null);
      setDraft(null);
      setMoving(null);
      setMeasurePoints([]);
      resetSaveRoute();
      const reshaping = from && !from.asCopy ? from.track : undefined;
      setRouteDraft({
        trackId: reshaping?.id,
        name: from ? (from.asCopy ? `${from.track.name} (copy)` : from.track.name) : "",
        color: from?.track.color ?? "teal",
        edit: startEdit(points),
        selected: null,
        replacesRecording: reshaping ? from?.replacesRecording : undefined,
      });
      setTool("draw");
      setPanel({ open: true, tab: "routes" });
      // On a phone: out of the map's way while points are placed; in view when the next step is a name.
      const naming = points.length >= 2 && !from;
      setDetent(naming ? "half" : "peek");
      // The button that started this is about to go. Focus moves to where the next step is: the
      // name for a path that is already there, otherwise the map, where the arrow keys aim and Enter places a point.
      if (naming) setNameRequested(true);
      else engine?.focus();
    },
    [engine, setPanel, resetSaveRoute],
  );

  const stopDrawing = useCallback(() => {
    setRouteDraft(null);
    setTool("browse");
    setDiscarding(null);
    resetSaveRoute();
  }, [resetSaveRoute]);

  const latestDraft = useRef(routeDraft);
  latestDraft.current = routeDraft;
  /** Puts the drawing tool down, asking first if that would lose points that have not been saved. */
  const closeDrawing = useCallback(
    (then?: () => void) => {
      const current = latestDraft.current;
      if (current && hasUnsavedWork(current)) {
        return setDiscarding({ then, reshaping: current.trackId ? current.name : undefined, points: current.edit.points.length });
      }
      stopDrawing();
      then?.();
    },
    [stopDrawing],
  );

  const addRoutePoint = useCallback(
    (position: LatLon) =>
      setRouteDraft((current) => (current ? { ...current, edit: addPoint(current.edit, position), selected: null } : current)),
    [],
  );
  const addAtCentre = useCallback(() => {
    const centre = engine?.getCenter();
    if (centre) addRoutePoint(centre);
  }, [engine, addRoutePoint]);
  const stepRoute = useCallback(
    (step: typeof undo) => setRouteDraft((current) => (current ? { ...current, edit: step(current.edit), selected: null } : current)),
    [],
  );

  useEffect(() => keepRouteDraft(routeDraft), [routeDraft]);
  useEffect(() => {
    if (restoredDraft) toast("The route you were drawing is back as you left it. It has not been saved yet.");
  }, [restoredDraft]);

  // A tab named in the address (/maps?tab=layers, from the quick search) is opened, once for each arrival; with
  // road=1, the Routes tab opens at Road route, and print=1 takes up the page to print once the map is drawn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each arrival, not on every change of the panel
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab === "routes" && params.get("road") === "1") {
      setFinding(false);
      setRoadRouting(true);
    }
    if (tab && (PANEL_TABS as readonly string[]).includes(tab)) showPanel(tab as PanelTab);
    if (params.get("print") === "1") setPrintAsked(true);
    // /maps?offline=region&preset=… opens Offline maps at that region, offline=draw at drawing one, offline=imagery at
    // satellite pictures. Place names and roads for routes are on Map data now: the older links lead there.
    const offline = new URLSearchParams(location.search).get("offline");
    if (offline === "places") navigate("/maps/data?names=1", { replace: true });
    else if (offline === "roads") navigate("/maps/data?add=1&kinds=roads", { replace: true });
    else if (offline === "region" || offline === "draw" || offline === "imagery") {
      const preset = new URLSearchParams(location.search).get("preset");
      setOfflineIntent(
        offline === "imagery"
          ? { type: "imagery" }
          : { type: "add", ...(preset ? { presetId: preset } : {}), ...(offline === "draw" ? { draw: true } : {}) },
      );
      showPanel("offline");
    }
  }, [location.key]);

  // Links from the app-wide search: /maps?marker=… and /maps?track=…, and plain camera links.
  const handledLink = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!engine || handledLink.current === location.key) return;
    const params = new URLSearchParams(location.search);
    const markerId = params.get("marker");
    const linkedTrack = params.get("track");
    if (markerId) {
      if (!markers.data) return;
      handledLink.current = location.key;
      const marker = markers.data.find((item) => item.id === markerId);
      if (marker) openMarker(marker);
      else notify.error("That saved place no longer exists.");
    } else if (linkedTrack) {
      if (!tracks.data) return;
      handledLink.current = location.key;
      const track = tracks.data.find((item) => item.id === linkedTrack);
      if (track) openTrack(track);
      else notify.error("That route no longer exists.");
    } else {
      const first = handledLink.current === undefined;
      handledLink.current = location.key;
      const view = parseView(params);
      // The first address was already used to place the map.
      if (view && !first) engine.jumpTo(view);
    }
  }, [engine, location.key, location.search, markers.data, tracks.data, openMarker, openTrack]);

  // ── What is drawn over the map ──

  const allTracks = tracks.data ?? [];
  const visibleIds = useMemo(
    () => (tracks.data ?? []).filter((track) => !hiddenTracks.includes(track.id)).map((track) => track.id),
    [tracks.data, hiddenTracks],
  );
  const geometries = useTrackGeometries(visibleIds);
  const selectedTrack = allTracks.find((track) => track.id === trackId) ?? null;

  useEffect(() => {
    // The place being edited or moved is shown as a pin instead of its dot.
    engine?.setOverlay("o-markers", markersData(markers.data ?? [], moving?.id ?? draft?.id ?? null));
  }, [engine, markers.data, draft?.id, moving?.id]);

  // The route whose shape is being changed is drawn by the drawing tool instead, with its points.
  const reshapingId = routeDraft?.trackId ?? null;
  useEffect(() => {
    if (!engine) return;
    // Colour and name come from the list, which is refreshed first when a route is changed.
    const current = geometries
      .filter((geometry) => geometry.id !== reshapingId)
      .map((geometry) => ({ ...geometry, ...(tracks.data?.find((track) => track.id === geometry.id) ?? {}) }));
    // A route being previewed in "Find a route" is drawn like a chosen one, though it is not saved yet.
    const data = tracksData(routePreview ? [...current, routePreview] : current, routePreview ? PREVIEW_TRACK_ID : trackId);
    engine.setOverlay("o-tracks", data.lines);
    engine.setOverlay("o-track-ends", data.ends);
  }, [engine, geometries, tracks.data, trackId, reshapingId, routePreview]);

  useEffect(() => {
    engine?.setOverlay(ROAD_ROUTE_SOURCE, shownRouteData(roadShown?.route ?? null, roadShown?.selected ?? null));
  }, [engine, roadShown]);

  const routePoints = routeDraft?.edit.points;
  const routeColor = routeDraft?.color;
  const routeSelected = routeDraft?.selected ?? null;
  useEffect(() => {
    engine?.setRoute(routePoints && routeColor ? { points: routePoints, color: MARKER_HEX[routeColor], selected: routeSelected } : null);
  }, [engine, routePoints, routeColor, routeSelected]);

  useEffect(() => {
    if (!engine) return;
    const change = (apply: (draft: RouteDraft) => RouteDraft) => setRouteDraft((current) => (current ? apply(current) : current));
    const offs = [
      engine.on("routepoint", ({ index }) => change((draft) => ({ ...draft, selected: draft.selected === index ? null : index }))),
      engine.on("routemove", ({ index, position }) =>
        change((draft) => ({ ...draft, edit: movePoint(draft.edit, index, position), selected: index })),
      ),
      engine.on("routeinsert", ({ index, position }) =>
        change((draft) => ({ ...draft, edit: insertPoint(draft.edit, index, position), selected: index })),
      ),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [engine]);

  // The middle of the map is marked while the map itself has the keyboard, so "add a point at the centre" can be aimed.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const onFocus = (event: FocusEvent) => setMapHasKeyboard(event.target instanceof HTMLElement && event.target.matches(":focus-visible"));
    const onBlur = () => setMapHasKeyboard(false);
    element.addEventListener("focusin", onFocus);
    element.addEventListener("focusout", onBlur);
    return () => {
      element.removeEventListener("focusin", onFocus);
      element.removeEventListener("focusout", onBlur);
    };
  }, []);

  useEffect(() => {
    engine?.setOverlay("o-measure", tool === "measure" ? measureData(measurePoints) : EMPTY);
  }, [engine, tool, measurePoints]);

  useEffect(() => {
    engine?.setOverlay("o-profile", pointData(selectedTrack ? profilePoint : null));
  }, [engine, profilePoint, selectedTrack]);

  const offlineVisible = panel.tab === "offline" && (isDesktop ? panel.open : detent !== "peek");
  useEffect(() => {
    engine?.setOverlay("o-coverage", offlineVisible ? coverageData(overview.data?.regions ?? []) : EMPTY);
  }, [engine, offlineVisible, overview.data]);

  const movingMarker = moving ? markers.data?.find((marker) => marker.id === moving.id) : undefined;
  useEffect(() => {
    if (!engine) return;
    const howToMove = "Drag to move, or use the arrow keys; Shift moves it further.";
    if (moving && movingMarker)
      engine.setPin({
        position: { lat: moving.lat, lon: moving.lon },
        color: MARKER_HEX[movingMarker.color],
        glyph: pinGlyphOf(iconOf(movingMarker), movingMarker.color),
        draggable: true,
        label: `${movingMarker.name}. ${howToMove} Enter saves the new position.`,
      });
    else if (draft)
      engine.setPin({
        position: { lat: draft.lat, lon: draft.lon },
        color: MARKER_HEX[draft.color],
        glyph: pinGlyphOf(draft.icon, draft.color),
        draggable: true,
        label: `${draft.name || "New place"}. ${howToMove}`,
      });
    else if (pin) engine.setPin({ position: pin.position, color: theme.primary, draggable: false, label: pin.title });
    else engine.setPin(null);
  }, [engine, draft, moving, movingMarker, pin, theme.primary]);

  useEffect(() => {
    if (!engine) return;
    return engine.on("pindrag", (position) => {
      const at = { lat: Number(position.lat.toFixed(6)), lon: Number(position.lon.toFixed(6)) };
      // Only one of the two has the pin at a time.
      setMoving((current) => (current ? { ...current, ...at } : current));
      setDraft((current) => (current ? { ...current, ...at } : current));
    });
  }, [engine]);

  // ── Moving a saved place without opening it ──

  /**
   * Turns a saved place into a pin that can be dragged or stepped with the arrow keys.
   * It starts from a press held on the place, from the map's menu, or from the list.
   */
  const startMove = useCallback(
    (marker: MarkerDto, from: "map" | "list") => {
      moveReturnFocus.current = from === "list" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setContextMenu(null);
      setPin(null);
      setDraft(null);
      setMoving({ id: marker.id, lat: marker.lat, lon: marker.lon });
      if (from === "list") {
        // The list may be covering the place, or the place may be somewhere else entirely.
        setDetent("peek");
        engine?.flyTo({ lat: marker.lat, lon: marker.lon });
      }
    },
    [engine],
  );

  const endMove = useCallback(() => {
    const pinHadKeyboard = document.activeElement?.classList.contains("outpost-pin") ?? false;
    const back = moveReturnFocus.current;
    moveReturnFocus.current = null;
    setMoving(null);
    // The pin is about to go; the keyboard goes back to where the move began, or to the map.
    if (back?.isConnected) back.focus();
    else if (pinHadKeyboard) engine?.focus();
  }, [engine]);

  const saveMove = () => {
    if (!moving || !movingMarker || saveMarker.isPending) return;
    const { id, name } = movingMarker;
    const from = { lat: movingMarker.lat, lon: movingMarker.lon };
    const meters = haversineMeters(from.lat, from.lon, moving.lat, moving.lon);
    if (meters < 1) return;
    // The same request that "Save changes" on an opened place makes, with only the position in it.
    saveMarker.mutate(
      { id, lat: moving.lat, lon: moving.lon },
      {
        onSuccess: () => {
          endMove();
          toast.success(`Moved “${name}” ${formatDistance(meters)}.`, {
            action: {
              label: "Undo",
              onClick: () => saveMarker.mutate({ id, ...from }, { onSuccess: () => toast.success(`“${name}” is back where it was.`) }),
            },
          });
        },
      },
    );
  };

  // The pin exists once the effect above has run; give it the keyboard so the arrow keys work at once.
  const movingId = moving?.id;
  const movingReady = Boolean(movingMarker);
  useEffect(() => {
    if (engine && movingId && movingReady) engine.focusPin();
  }, [engine, movingId, movingReady]);

  // A place deleted from somewhere else while it was being moved has nothing left to move.
  useEffect(() => {
    if (moving && markers.data && !movingMarker) setMoving(null);
  }, [moving, markers.data, movingMarker]);

  // Places can be picked up only while nothing else is in hand: not mid-route, not while another place is open.
  const placesMovable = tool === "browse" && !draft && !moving;
  useEffect(() => {
    engine?.setPlacesMovable(placesMovable);
  }, [engine, placesMovable]);

  useEffect(() => {
    engine?.setCursor(tool === "browse" || tool === "print" ? "" : "crosshair");
  }, [engine, tool]);

  // "Fit" and "fly" should land in the part of the map that is not under the chrome.
  useEffect(() => {
    if (!engine) return;
    // On a phone the search box is across the top; what it takes is measured, as larger text makes it taller.
    const top = isDesktop && !compact ? 16 : clear.top;
    const height = area.current?.clientHeight ?? 0;
    // On a phone: the sheet (at most half the height, as "full" hides the map anyway) and, above it, the readout
    // with whatever is written under it (while the sheet is lowered, today's sunrise and sunset) and the credits.
    // A page being laid out on a phone has the sheet, not a card: no room is kept for a card to come up into, nor for
    // the coordinates that have stepped aside for it. The box then has all of the clear map, and the centre its middle.
    const cardless = !isDesktop && tool === "print";
    const foot = cardless ? clear.bottom : clear.held;
    // A compact wide screen has no sheet: only the readout at the foot.
    const under = isDesktop ? (compact ? foot : 0) : detentHeight(detent === "peek" ? "peek" : "half", height, peekHeight) + foot;
    // The centre is kept two fifths of the way down the clear part of the map, not half way: a card that comes up
    // from the foot of it (which may take three fifths, less a margin; see maps.css) then never covers the centre,
    // and the map does not have to move when a card appears or grows.
    const fifth = (isDesktop && !compact) || cardless ? 0 : Math.max(0, height - top - under) * 0.2;
    const sheet = under + fifth;
    // Room kept at the foot that nothing lies over: the fifth for a card, and what is held while something is in hand.
    const spare = fifth + (foot - clear.bottom);
    // A short screen (a phone on its side) keeps some map clear whatever lies over it.
    const bottom = Math.max(0, Math.min(sheet, height - top - 96));
    // A phone's sheet covers the lower part of the map, so there the camera keeps the space all the time and the
    // centre of the map is in the part that shows. On a wide screen nothing lies over the middle of the map.
    engine.setPadding({ top, right: isDesktop && !compact ? 56 : 0, bottom, left: 0 }, !isDesktop || compact, spare);
    // The cross that marks the centre is 20 px across: a card at the foot stops 12 px short of it.
    const centre = top + Math.max(0, height - top - bottom) / 2;
    setDockRoom(isDesktop && !compact ? undefined : Math.max(0, Math.round(height - centre - 22)));
  }, [engine, isDesktop, compact, detent, peekHeight, clear, tool]);

  // A place being saved is slid into the clear map if it is where the sheet, the readout or a card would hide it.
  useEffect(() => {
    if (!engine || !reveal) return;
    setReveal(null);
    if (!engine.isInView(reveal)) engine.panTo(reveal);
  }, [engine, reveal]);

  // The hint to tap the map goes as soon as the map has been tapped (or the tool put down): it lay over the form.
  useEffect(() => {
    if (tool !== "add-place") toast.dismiss(ADD_PLACE_HINT);
  }, [tool]);

  // ── What the person does on the map ──

  const latest = useRef({
    tool,
    markers: markers.data,
    tracks: tracks.data,
    openMarker,
    openTrack,
    startPlace,
    addRoutePoint,
    startMove,
    saveMove,
  });
  latest.current = {
    tool,
    markers: markers.data,
    tracks: tracks.data,
    openMarker,
    openTrack,
    startPlace,
    addRoutePoint,
    startMove,
    saveMove,
  };

  useEffect(() => {
    if (!engine) return;
    const offClick = engine.on("click", ({ position, hit }) => {
      const now = latest.current;
      setContextMenu(null);
      if (now.tool === "measure") {
        setMeasurePoints((points) => [...points, position]);
        return;
      }
      if (now.tool === "add-place") {
        now.startPlace(position);
        return;
      }
      // The line-of-sight and resection cards hear presses on the map for themselves.
      if (now.tool === "sight" || now.tool === "resection") return;
      // While a page is being laid out the map is only moved about; a press opens nothing.
      if (now.tool === "print") return;
      // While drawing, a press on a saved place or another route is still a press on the map.
      if (now.tool === "draw") {
        now.addRoutePoint(position);
        return;
      }
      if (hit?.type === "marker") {
        const marker = now.markers?.find((item) => item.id === hit.id);
        if (marker) now.openMarker(marker, false);
      } else if (hit?.type === "track") {
        const track = now.tracks?.find((item) => item.id === hit.id);
        if (track) now.openTrack(track, false);
      }
    });
    const offContext = engine.on("context", (event) => {
      if (latest.current.tool === "browse") setContextMenu(event);
    });
    const offPick = engine.on("placepick", ({ id }) => {
      const marker = latest.current.markers?.find((item) => item.id === id);
      if (marker) latest.current.startMove(marker, "map");
    });
    const offConfirm = engine.on("pinconfirm", () => latest.current.saveMove());
    return () => {
      offClick();
      offContext();
      offPick();
      offConfirm();
    };
  }, [engine]);

  const leaveTool = useCallback(() => {
    setTool("browse");
    setMeasurePoints([]);
    setSightStart(null);
  }, []);

  // Escape puts down whatever tool is in hand. Dialogs and menus handle their own.
  // While drawing, the keyboard also undoes, redoes, removes the chosen point and adds
  // one at the middle of the map.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]')) return;
      if (event.key === "Escape") {
        if (moving) {
          event.preventDefault();
          endMove();
          return;
        }
        if (tool === "browse") return;
        event.preventDefault();
        if (tool === "draw") closeDrawing();
        else leaveTool();
        return;
      }
      const onMap = event.target instanceof HTMLElement && event.target.classList.contains("maplibregl-canvas");
      // From the keyboard, the point is the centre of the map, which the cross marks: Shift F10 (or the menu key) opens
      // the menu a right-click or a long press opens, and Enter is a press there for the tool in hand (WCAG 2.1.1).
      if (onMap && engine && !moving) {
        const centre = engine.getCenter();
        if (tool === "browse" && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
          event.preventDefault();
          setContextMenu({ position: centre, point: engine.project(centre), hit: null, keyboard: true });
          return;
        }
        if (event.key === "Enter" && (tool === "measure" || tool === "add-place")) {
          event.preventDefault();
          if (tool === "measure") setMeasurePoints((points) => [...points, centre]);
          else startPlace(centre);
          return;
        }
      }
      // In a text field these keys belong to the text.
      if (tool !== "draw" || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      if (command && key === "z") stepRoute(event.shiftKey ? redo : undo);
      else if (command && key === "y") stepRoute(redo);
      else if (key === "enter" && onMap) addAtCentre();
      else if ((key === "delete" || key === "backspace") && latestDraft.current?.selected != null) {
        const index = latestDraft.current.selected;
        setRouteDraft((current) => (current ? { ...current, edit: removePoint(current.edit, index), selected: null } : current));
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, moving, endMove, leaveTool, closeDrawing, stepRoute, addAtCentre, engine, startPlace]);

  // The map's name says what Enter does at the centre with the tool in hand.
  useEffect(() => {
    engine?.setKeyHint(
      tool === "measure" ? "Enter adds a point at the centre." : tool === "add-place" ? "Enter saves a place at the centre." : null,
    );
  }, [engine, tool]);

  const takeUpTool = (next: Tool) => {
    if (next === "browse") return leaveTool();
    if (next === "draw") return startDrawing();
    setMeasurePoints([]);
    setMoving(null);
    setTool(next);
    // The page's box and the box of a region being downloaded are the same box on the map: one at a time.
    if (next === "print" && panel.tab === "offline") setPanel((current) => ({ ...current, tab: "places" }));
    // On a phone the sheet would cover the map being clicked on. The page to print is laid out in the sheet itself,
    // which is raised for it: its settings do not fit in a card over a phone's map.
    setDetent(next === "print" ? "half" : "peek");
    // On a phone the hint is a card in the sheet's place (below); a message there lay over the sheet's tabs.
    if (next === "add-place" && isDesktop) toast(`${pressWord()} the map where the place is.`, { id: ADD_PLACE_HINT });
  };
  /** Road route opened in the Routes tab with one end set: from the menu at a point, or a found place's card. */
  const startRoadRoute = (role: RoadRouteIntent["role"], point: RoadRouteIntent["point"]) => {
    setContextMenu(null);
    setPin(null);
    if (tool === "draw") closeDrawing();
    setFinding(false);
    setRoadRouting(true);
    setRoadIntent({ role, point, at: Date.now() });
    setPanel({ open: true, tab: "routes" });
    setDetent((current) => (current === "peek" ? "half" : current));
  };

  const changeTool = (next: Tool) => {
    setContextMenu(null);
    // Putting the drawing tool down for another one must not lose points without asking.
    if (tool === "draw") closeDrawing(next === "browse" || next === "draw" ? undefined : () => takeUpTool(next));
    else takeUpTool(next);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the map is there to print from
  useEffect(() => {
    if (!printAsked || !engine) return;
    setPrintAsked(false);
    changeTool("print");
  }, [printAsked, engine]);

  const saveDrawnRoute = () => {
    const draft = routeDraft;
    if (!draft) return;
    saveRoute.mutate(
      { id: draft.trackId, name: draft.name.trim(), color: draft.color, points: draft.edit.points },
      {
        onSuccess: ({ track, elevation }) => {
          stopDrawing();
          const heights =
            elevation === "terrain"
              ? " Its heights were read from the installed terrain."
              : elevation === "partial"
                ? " Heights were read where terrain is installed."
                : "";
          toast.success(
            draft.trackId ? `Saved the new shape of “${track.name}”.${heights}` : `“${track.name}” is saved to your routes.${heights}`,
          );
          openTrack(track, false);
        },
      },
    );
  };

  const locate = useGeolocation(
    (fix, first) => {
      if (first) engine?.flyTo(fix, Math.max(engine.getZoom(), 14));
    },
    (message) => notify.error(message),
  );
  useEffect(() => {
    engine?.setOverlay("o-location", locationData(locate.fix));
  }, [engine, locate.fix]);
  const toggleLocate = () => {
    setHereDismissed(false);
    if (locate.state === "off") locate.start();
    else locate.stop();
  };

  // Repeaters held on this device: drawn when switched on, opened by a press, handed to the line-of-sight check.
  // "Estimated radio range from here", from the menu a long press or a right-click opens: drawn with the repeaters' ranges.
  // Where you are from compass bearings to landmarks: its card hears presses on the map for itself.
  const resection = useResection({
    engine,
    active: tool === "resection",
    markers: markers.data ?? [],
    where: (position) => formatPosition(position.lat, position.lon, format).text,
    onSave: (position) => startPlace(position, "Found from bearings"),
    onDone: () => setTool("browse"),
  });
  // Lines of position from Celestial navigation, when the map is opened from it (?celnav=1).
  const celnav = useCelnavOnMap({ engine });
  const pointRange = usePointRange({
    engine,
    where: (position) => formatPosition(position.lat, position.lon, format, engine?.getZoom()).text,
    onOpenOffline: () => openOffline({ type: "add" }),
  });
  // A shared estimated range (/maps?lat=…&lon=…&range=1.5&station=handheld, from its QR code): drawn from the point with
  // the heights it came with, once for each arrival. The camera link above has already put the map there.
  const handledRange = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!engine || handledRange.current === location.key) return;
    handledRange.current = location.key;
    const shared = readPointRangePath(new URLSearchParams(location.search));
    if (shared) pointRange.start(shared);
  }, [engine, location.key, location.search, pointRange.start]);
  // "How far on foot from here", from the same menu.
  const walk = useWalkReach({
    engine,
    where: (position) => formatPosition(position.lat, position.lon, format, engine?.getZoom()).text,
    onOpenOffline: () => openOffline({ type: "add" }),
  });
  // "Reachable from here", from the same menu and the quick search (/maps?reach=1, from the middle of the map).
  const reachable = useReach({
    engine,
    where: (position) => formatPosition(position.lat, position.lon, format, engine?.getZoom()).text,
    onOpenStreets: (country) => navigate(`/maps/data?streets=1${country ? `&country=${country}` : ""}`),
    onOpenNetworks: (countries) => navigate(addRoadsLink(countries)),
  });
  const handledReach = useRef<string | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each arrival, when the map is there
  useEffect(() => {
    if (!engine || handledReach.current === location.key) return;
    handledReach.current = location.key;
    if (new URLSearchParams(location.search).get("reach") !== "1") return;
    walk.stop();
    pointRange.stop();
    reachable.start(engine.getCenter());
    setDetent("peek");
  }, [engine, location.key]);
  const repeaters = useRepeatersOnMap({
    extraRange: pointRange.outline,
    engine,
    browsing: tool === "browse" && !moving && !draft,
    here: locate.fix,
    onSight: useCallback((start: SightStart) => {
      setSightStart(start);
      setTool("sight");
    }, []),
    onOpenOffline: () => openOffline({ type: "add" }),
  });

  // Reference layers (features/layers): published data drawn when switched on in the Layers tab, opened by a press.
  // What the household's receivers heard, in its own group above the reference layers (features/heard).
  const heardMesh = useMeshOnMap({ engine });
  // Satellites now (features/satellites/map.tsx), worked out in the browser while switched on.
  const satellitesLayer = useSatellitesOnMap({ engine });
  // APRS, aircraft and ships (features/heard), and the one card for anything heard, with the map's tools from there.
  // "Near home" is the current household's home: its saved place, or where a portable household was last said to be.
  // Every household's home is drawn, labelled with its name (features/households/map.ts).
  useHouseholdsOnMap({ engine });
  const currentHome = useHome().home;
  const homeMarker = useMemo(
    () => (currentHome ? { lat: currentHome.lat, lon: currentHome.lon, name: homeLabel(currentHome, Date.now()) } : null),
    [currentHome],
  );
  const heardTools = useMemo<HeardTools>(
    () => ({
      measure: (position) => {
        setTool("measure");
        setMeasurePoints([position]);
        setDetent("peek");
      },
      sight: (position) => {
        setSightStart([null, { position }]);
        setTool("sight");
      },
      range: (position, name) => {
        setDraft(null);
        setMoving(null);
        setPin(null);
        pointRange.start({ position, name });
        setDetent("peek");
      },
      sun: (position, name) => {
        setDraft(null);
        setMoving(null);
        setPin({ title: name, detail: "Heard on the radio", position, sun: true });
        setDetent("peek");
      },
    }),
    [pointRange.start],
  );
  const heard = useHeardOnMap({
    engine,
    browsing: tool === "browse" && !moving && !draft,
    meshRadios: heardMesh.radios,
    home: homeMarker ? { lat: homeMarker.lat, lon: homeMarker.lon, name: homeMarker.name } : null,
    tools: heardTools,
  });
  const heardHome = homeMarker ? { lat: homeMarker.lat, lon: homeMarker.lon, name: homeMarker.name } : null;
  const rangeCard = useRangeOnMap({ engine, home: heardHome, tools: heardTools });
  const reference = useReferenceLayers({
    engine,
    browsing: tool === "browse" && !moving && !draft,
    // Places to find are added and looked after on Map data; an older link (/maps?reference=manage) leads there too.
    onManage: useCallback(() => {
      const fromLink = new URLSearchParams(window.location.search).get("reference") === "manage";
      navigate(fromLink ? "/maps/data" : "/maps/data?get=places", { replace: fromLink });
    }, [navigate]),
  });

  /**
   * On a phone, today's sunrise and sunset are written under the readout while the sheet is lowered and nothing
   * is being done on the map: a tool's card, the card of a point that was found or is being moved, or of a repeater
   * or a record opened on the map, needs the room and has the person's attention (and a found point's card has sun
   * times of its own). A repeater's estimated range on a phone with large text was drawn about 70 px across for
   * want of it.
   */
  const cardOpen = Boolean(heard.card ?? rangeCard ?? repeaters.card ?? reference.card);
  // On a phone, while the sheet is lowered and nothing else is in hand. On a wide screen there is room for it
  // always, except while the Sun tab itself is open beside the map and says the same and more.
  const sunLine = isDesktop ? !(panel.open && panel.tab === "sun") : detent === "peek" && tool === "browse" && !pin && !moving && !cardOpen;
  inHand.current = tool !== "browse" || Boolean(pin) || Boolean(moving);
  // A record opened from the Layers tab (found by name) comes up as a card over the map: on a phone the sheet is
  // lowered for it, as for a found place, or the card had a strip of map and showed none of an airport's frequencies.
  const recordOpen = Boolean(reference.card ?? heard.card);
  useEffect(() => {
    if (recordOpen && !isDesktop) setDetent("peek");
  }, [recordOpen, isDesktop]);

  const chooseResult = (result: SearchResult) => {
    setContextMenu(null);
    if (result.kind === "marker") return openMarker(result.marker);
    if (result.kind === "track") return openTrack(result.track);
    if (!result.position) return;
    setDraft(null);
    setMoving(null);
    setTrackId(null);
    // The list it was chosen from has gone: the card it opens has the keyboard.
    setPin({ title: result.title, detail: result.detail, position: result.position, focus: true });
    setDetent("peek");
    engine?.flyTo(result.position, result.kind === "place" ? Math.max(engine.getZoom(), 12) : Math.max(engine.getZoom(), 14));
  };

  // ── Saving places ──

  const savedDraft = draft?.id ? markers.data?.find((marker) => marker.id === draft.id) : undefined;
  const saveDraft = () => {
    if (!draft) return;
    saveMarker.mutate(
      {
        id: draft.id,
        name: draft.name.trim(),
        note: draft.note,
        color: draft.color,
        icon: draft.icon,
        isFavorite: draft.isFavorite,
        lat: draft.lat,
        lon: draft.lon,
      },
      {
        onSuccess: ({ marker }) => {
          toast.success(draft.id ? `Saved “${marker.name}”.` : `“${marker.name}” is saved to your places.`);
          setDraft(null);
          if (!draft.id) {
            // The sheet may have been raised for the keyboard: lower it so that the new place can be seen.
            if (!isDesktop) setDetent((current) => (current === "full" ? "half" : current));
            setReveal({ lat: marker.lat, lon: marker.lon });
          }
        },
      },
    );
  };

  // ── Dropping map files on the map ──

  const hasFiles = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDropping(false);
    const files = [...event.dataTransfer.files];
    const mapFiles = files.filter(isMapFile);
    if (mapFiles.length === 0) notify.error("Only GPX, KML, KMZ and GeoJSON files can be dropped on the map.");
    else setImportFiles(mapFiles);
  };

  // ── Layout ──

  const hasTiles = sources.data?.hasTiles ?? false;
  const mapDownloading = (downloads.data ?? []).some(
    (download) => download.kind === "map" && ACTIVE_DOWNLOAD_STATES.includes(download.state),
  );
  const credits = useMemo(() => {
    // Contour lines are drawn from the same terrain as the hill shading, and credit it the same way.
    const base = creditsFor(sources.data?.attributions ?? [], {
      hasTiles,
      terrain: (hillshade || contours) && (sources.data?.hasTerrain ?? false),
    });
    // A route found in OpenStreetMap is credited while it is on the map, whatever the map beneath it is.
    const withImagery = [...satellite.credits, ...reference.credits, ...base];
    return routePreview || roadShown || anyFoundRoute(geometries) ? [...withImagery, ROUTE_CREDIT] : withImagery;
  }, [sources.data, hasTiles, hillshade, contours, geometries, routePreview, roadShown, satellite.credits, reference.credits]);
  // Not while a route is being planned: that panel says what it needs itself.
  const firstUse = sources.isSuccess && !hasTiles && !mapDownloading && !firstUseDismissed && !offlineVisible && !roadRouting;
  const openOffline = (intent: OfflineIntent) => {
    setOfflineIntent(intent);
    showPanel("offline");
  };
  const clearIntent = useCallback(() => setOfflineIntent(null), []);

  // ── Contour lines ──

  /** The boxes of the terrain that can be read right now: what contour lines can be drawn from. */
  const terrainBoxes = useMemo(
    () =>
      (overview.data?.regions ?? [])
        .filter(
          (region) => region.tileType === "terrain" && region.available && (region.status === "installed" || region.status === "moving"),
        )
        .map((region) => region.bounds),
    [overview.data],
  );
  const [reach, setReach] = useState<ContourReach>("drawn");
  useEffect(() => {
    if (!engine) return;
    const update = () => setReach(contourReach({ bounds: engine.getBounds(), zoom: engine.getZoom() }, terrainBoxes));
    update();
    return engine.on("moveend", update);
  }, [engine, terrainBoxes]);

  /** A style may switch on what it is made to show (the walking map its hill shading and contours); each can be switched off again. */
  const changeMapStyle = (next: MapStyleId) => {
    setMapStyle(next);
    // The night style is dim on purpose, its names under the contrast the rest of the app keeps (docs/testing-status.md):
    // said when it is chosen, with the readable style a press away.
    if (next === "night" && mapStyle !== "night")
      toast(NIGHT_STYLE_NOTE, {
        id: NIGHT_STYLE_NOTE,
        duration: 12_000,
        action: { label: "Use High contrast", onClick: () => setMapStyle("high-contrast") },
      });
    const turnsOn = MAP_STYLES[next].turnsOn;
    if (turnsOn?.hillshade) setHillshade(true);
    if (turnsOn?.contours && sources.data?.hasTerrain && contoursSupported()) setContours(true);
    if (turnsOn?.roadNumbers) setRoadNumbers(true);
  };

  const changeContours = (on: boolean) => {
    if (!on) return setContours(false);
    if (!contoursSupported()) {
      notify.error("This browser cannot draw contour lines. An up-to-date browser can.");
      return;
    }
    const now = engine ? contourReach({ bounds: engine.getBounds(), zoom: engine.getZoom() }, terrainBoxes) : reach;
    // With no terrain at all there is nothing to switch on yet; the control says what it needs instead.
    if (now !== "no-terrain") setContours(true);
    if (now === "drawn") return;
    toast(
      CONTOUR_NOTES[now].message,
      now === "too-far-out" ? undefined : { action: { label: "Offline maps", onClick: () => openOffline({ type: "add" }) } },
    );
  };

  /** From the list: whatever tool is in hand is put down first, asking if that would lose a route. */
  const moveFromList = (marker: MarkerDto) => {
    if (tool === "draw") return closeDrawing(() => startMove(marker, "list"));
    leaveTool();
    startMove(marker, "list");
  };
  const lowerSheet = useCallback(() => setDetent("peek"), []);
  const raiseSheet = useCallback(() => setDetent("full"), []);
  /** Opens the Sun tab: from the line under the readout on a phone, and from the Places tab. */
  const showSun = useCallback(() => {
    setPanel({ open: true, tab: "sun" });
    setDetent((current) => (current === "peek" ? "half" : current));
  }, [setPanel]);
  const terrainBounds = sources.data?.sources.terrain?.bounds ?? null;
  /** Whether the drawing tool's panel is on screen; when it is not, a card over the map stands in for it. */
  const editorVisible = panel.tab === "routes" && (isDesktop ? panel.open : detent !== "peek");

  /** The saved place under a right-click, when places can be moved: the menu offers to move it. */
  const contextPlace =
    placesMovable && contextMenu?.hit?.type === "marker" ? markers.data?.find((marker) => marker.id === contextMenu.hit?.id) : undefined;

  const tabs = (
    <PanelTabs
      tab={panel.tab}
      onTabChange={(tab) => {
        setPanel({ open: true, tab });
        if (tab === "offline" && tool === "print") leaveTool();
      }}
      onTabPress={() => setDetent((current) => (current === "peek" ? "half" : current))}
      counts={{ places: markers.data?.length, routes: tracks.data?.length }}
    >
      {{
        places: draft ? (
          <PlaceEditor
            draft={draft}
            saved={savedDraft}
            format={format}
            saving={saveMarker.isPending}
            deleting={deleteMarker.isPending}
            mapReady={Boolean(engine)}
            onChange={setDraft}
            onSave={saveDraft}
            onClose={() => setDraft(null)}
            onDelete={() => draft.id && deleteMarker.mutate(draft.id, { onSuccess: () => setDraft(null) })}
            onNeedRoom={raiseSheet}
          />
        ) : (
          <PlacesList
            markers={markers}
            onOpen={(marker) => openMarker(marker)}
            onToggleFavourite={(marker) => saveMarker.mutate({ id: marker.id, isFavorite: !marker.isFavorite })}
            onMove={engine ? moveFromList : undefined}
            onAdd={() => changeTool("add-place")}
            canAddOnMap={Boolean(engine)}
            onShowSun={showSun}
          />
        ),
        routes: routeDraft ? (
          <RouteEditor
            draft={routeDraft}
            terrain={terrainBounds}
            mapReady={Boolean(engine)}
            saving={saveRoute.isPending}
            error={saveRoute.isError ? errorMessage(saveRoute.error) : undefined}
            nameRequested={nameRequested}
            onNameShown={nameShown}
            onChange={setRouteDraft}
            onAddAtCentre={addAtCentre}
            onMoveToCentre={(index) => {
              const centre = engine?.getCenter();
              if (centre) setRouteDraft((current) => (current ? { ...current, edit: movePoint(current.edit, index, centre) } : current));
            }}
            onSave={saveDrawnRoute}
            onClose={() => closeDrawing()}
          />
        ) : roadRouting ? (
          <RoadRoutePanel
            engine={engine}
            markers={markers.data ?? []}
            intent={roadIntent}
            onIntentHandled={clearRoadIntent}
            onClose={() => setRoadRouting(false)}
            onShow={showRoadRoute}
            onNeedMap={() => setDetent((current) => (current === "full" ? "half" : current))}
            onOpenNetworks={(countries) => navigate(addRoadsLink(countries))}
            onOpenStreets={(country) => navigate(`/maps/data?streets=1${country ? `&country=${country}` : ""}`)}
          />
        ) : finding ? (
          <FindRoutePanel
            engine={engine}
            terrain={terrainBounds}
            onClose={() => setFinding(false)}
            onPreview={setRoutePreview}
            onAdded={(track) => {
              setFinding(false);
              openTrack(track, false);
            }}
            onNeedMap={() => setDetent((current) => (current === "full" ? "half" : current))}
          />
        ) : selectedTrack ? (
          <RouteDetail
            track={selectedTrack}
            visible={!hiddenTracks.includes(selectedTrack.id)}
            mapReady={Boolean(engine)}
            onVisibleChange={(visible) =>
              setHiddenTracks((current) => (visible ? current.filter((id) => id !== selectedTrack.id) : [...current, selectedTrack.id]))
            }
            onFit={() => {
              if (selectedTrack.bounds) engine?.fitBounds(selectedTrack.bounds);
              if (!isDesktop) setDetent("half");
            }}
            onClose={() => setTrackId(null)}
            onDeleted={() => setTrackId(null)}
            onScrub={setProfilePoint}
            terrain={terrainBounds}
            onEditShape={(points, options) => startDrawing(points, { track: selectedTrack, ...options })}
          />
        ) : (
          <RoutesList
            tracks={tracks}
            markerCount={markers.data?.length ?? 0}
            hidden={hiddenTracks}
            onVisibleChange={(id, visible) =>
              setHiddenTracks((current) => (visible ? current.filter((item) => item !== id) : [...current, id]))
            }
            onOpen={(track) => openTrack(track)}
            onImport={setImportFiles}
            onDraw={() => startDrawing()}
            onFind={() => setFinding(true)}
            onRoadRoute={() => setRoadRouting(true)}
            canDraw={Boolean(engine)}
          />
        ),
        layers: (
          <>
            <HeardGroup
              sources={[...(heardMesh.source ? [heardMesh.source] : []), ...heard.sources]}
              footer={
                <p className="mt-1 text-small">
                  <Link to="/radio/heard" className="text-primary underline underline-offset-2">
                    Receivers, and the list of what was heard
                  </Link>
                </p>
              }
            />
            <SatellitesLayerPanel layer={satellitesLayer} />
            {reference.panel}
          </>
        ),
        offline: (
          <Suspense fallback={<PanelLoading />}>
            <OfflinePanel
              overview={overview}
              engine={engine}
              intent={offlineIntent}
              onIntentHandled={clearIntent}
              onNeedMap={lowerSheet}
              onNeedRoom={raiseSheet}
            />
          </Suspense>
        ),
        sun: <SunPanel engine={engine} format={format} locate={locate.supported ? locate.state : undefined} onLocate={toggleLocate} />,
      }}
    </PanelTabs>
  );

  const panelVisible = isDesktop ? panel.open : detent !== "peek";
  /** On a phone, where in the sheet the print tool draws its first step, and whether it has. */
  const [printSheet, setPrintSheet] = useState<HTMLElement | null>(null);
  const [printInSheet, setPrintInSheet] = useState(false);
  // Put away, the page to print gives the sheet back lowered, as it was when the tool was taken up.
  const wasPrinting = useRef(false);
  useEffect(() => {
    if (wasPrinting.current && tool !== "print" && !isDesktop) setDetent("peek");
    wasPrinting.current = tool === "print";
  }, [tool, isDesktop]);
  // On a phone the sheet would cover the map a point is about to be chosen on, and says the same as the card does.
  const pickingSight = tool === "sight" && Boolean(sight.picking);
  useEffect(() => {
    if (!isDesktop && pickingSight) setDetent("peek");
  }, [isDesktop, pickingSight]);
  /** What the panel beside the map holds: its three tabs, or the tool that has taken it over. */
  const panelBody =
    tool === "sight" ? (
      <SightPanel
        sight={sight}
        format={format}
        mapReady={Boolean(engine)}
        engine={engine}
        onDone={leaveTool}
        onOpenOffline={() => {
          leaveTool();
          openOffline({ type: "add" });
        }}
      />
    ) : tool === "print" && !isDesktop ? (
      // The print tool draws its first step here (print-tool.tsx): on a phone it has the sheet, not a card.
      <div ref={setPrintSheet} className="flex min-h-0 flex-1 flex-col" />
    ) : (
      tabs
    );

  /** The card of what is in hand: a tool, a point found, a place being moved. On a phone it takes the sheet's place. */
  const handCard =
    celnav.card ??
    heard.card ??
    rangeCard ??
    repeaters.card ??
    reference.card ??
    (tool === "resection" ? (
      resection.card
    ) : tool === "measure" ? (
      <MeasureCard
        points={measurePoints}
        onAddAtCentre={engine ? () => setMeasurePoints((points) => [...points, engine.getCenter()]) : undefined}
        onUndo={() => setMeasurePoints((points) => points.slice(0, -1))}
        onClear={() => setMeasurePoints([])}
        onDone={leaveTool}
        onSaveAsRoute={() => startDrawing(measurePoints)}
        onSight={() => {
          setSightStart([{ position: measurePoints[0]! }, { position: measurePoints.at(-1)! }]);
          setMeasurePoints([]);
          setTool("sight");
        }}
      />
    ) : tool === "add-place" && !isDesktop ? (
      <MapCard title="Save a place" onClose={leaveTool} closeLabel="Stop saving a place">
        <p className="mt-1 text-small text-ink-muted">{pressWord()} the map where the place is.</p>
        {engine ? (
          <Button size="sm" className="mt-3" onClick={() => startPlace(engine.getCenter())}>
            <Crosshair /> Use the centre of the map
          </Button>
        ) : null}
      </MapCard>
    ) : tool === "sight" ? (
      // The whole answer is in the panel; the card stands in for it while a point is chosen and while the panel is out of sight.
      // On a phone the panel is the sheet, which says what the card would while it is raised; lowered, the card has its place.
      (isDesktop && sight.picking) || !panelVisible ? (
        <SightCard
          sight={sight}
          onUseCentre={engine ? () => sight.place({ position: engine.getCenter() }) : undefined}
          onShowDetails={() => {
            setPanel((current) => ({ ...current, open: true }));
            setDetent((current) => (current === "peek" ? "half" : current));
          }}
          onDone={leaveTool}
        />
      ) : null
    ) : tool === "print" && engine && isDesktop ? (
      <Suspense fallback={null}>
        <PrintTool engine={engine} style={styleInput} format={format} onClose={leaveTool} />
      </Suspense>
    ) : moving && movingMarker ? (
      <MoveCard
        name={movingMarker.name}
        movedMeters={haversineMeters(movingMarker.lat, movingMarker.lon, moving.lat, moving.lon)}
        saving={saveMarker.isPending}
        onSave={saveMove}
        onCancel={endMove}
      />
    ) : routeDraft && !editorVisible ? (
      <DrawCard
        edit={routeDraft.edit}
        reshaping={Boolean(routeDraft.trackId)}
        onUndo={() => stepRoute(undo)}
        onRedo={() => stepRoute(redo)}
        onAddAtCentre={addAtCentre}
        onOpenPanel={() => {
          showPanel("routes");
          // On a phone, all the room there is: a name is about to be typed, with the keyboard up.
          setDetent("full");
          setNameRequested(true);
        }}
        onClose={() => closeDrawing()}
      />
    ) : reachable.card ? (
      reachable.card
    ) : walk.card ? (
      walk.card
    ) : pointRange.card ? (
      pointRange.card
    ) : pin ? (
      <PinCard
        // A pin dropped for its sun times opens them, even when the pin before it had them folded.
        key={pin.sun ? "sun" : pin.focus ? `found ${pin.position.lat},${pin.position.lon}` : "pin"}
        title={pin.title}
        detail={pin.detail}
        position={pin.position}
        format={format}
        sunOpen={pin.sun}
        focusOnOpen={pin.focus}
        onSave={() => startPlace(pin.position, /^[-\d.,\s]+$/.test(pin.title) ? "" : pin.title)}
        onRoadRoute={() =>
          startRoadRoute("to", {
            name: /^[-\d.,\s]+$/.test(pin.title) ? pointName(pin.position) : pin.title,
            lat: pin.position.lat,
            lon: pin.position.lon,
            from: pin.focus ? "search" : "map",
          })
        }
        onClose={() => setPin(null)}
      />
    ) : null);
  /** A card that is there while nothing is in hand: where the device is, while it is followed; the first use. */
  const restingCard =
    locate.fix && !hereDismissed ? (
      // Where the device is, while it is being followed: its position to copy or save, and its sun times.
      <PinCard
        title="Where you are"
        detail={`To within about ${formatDistance(locate.fix.accuracy)}`}
        position={locate.fix}
        format={format}
        closeLabel="Hide this card"
        onSave={() => locate.fix && startPlace({ lat: locate.fix.lat, lon: locate.fix.lon })}
        onClose={() => setHereDismissed(true)}
      />
    ) : firstUse ? (
      <MapCard title="No detailed maps on this device yet" onClose={() => setFirstUseDismissed(true)} closeLabel="Dismiss">
        <p className="mt-1 text-small text-ink-muted">
          What you see is an outline of the world that comes with Outpost. Add a place, anywhere, and its map works with no connection.
        </p>
        {/* Add a place on Offline maps: where, then what for it, then its size. Nothing starts from here. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => navigate("/maps/data?add=1")}>
            Add a place
          </Button>
        </div>
      </MapCard>
    ) : null;
  const card = handCard ?? restingCard;
  /**
   * On a phone, a card of what is in hand takes the place of the lowered sheet at the foot of the map: one thing at a
   * time, with the room it needs. The sheet's tabs come back when the card is closed. Not for the page to print, which
   * has the sheet itself, nor while the sheet has been raised (line of sight's whole answer, a route being named).
   */
  const docked = (!isDesktop && Boolean(handCard) && detent === "peek" && tool !== "print") || (compact && Boolean(handCard));
  // The map does not move for it: the room kept at the foot is what it was before the card came up.
  if (docked) inHand.current = true;

  // Every place the map's tools are shown is drawn from this one list.
  const toolsInput = {
    tool,
    onToolChange: changeTool,
    rotated,
    onResetNorth: () => engine?.resetNorth(),
    locate: locate.supported ? locate.state : undefined,
    onLocate: toggleLocate,
    hillshade: sources.data?.hasTerrain ? hillshade : undefined,
    onHillshadeChange: setHillshade,
    contours,
    contourReach: reach,
    onContoursChange: changeContours,
    locatorGrid,
    onLocatorGridChange: setLocatorGrid,
    greyLine: greyLine.on,
    onGreyLineChange: greyLine.setOn,
    satellite: satellite.on,
    satelliteLabel: satellite.label,
    onSatelliteChange: satellite.setOn,
    repeaters: repeaters.on,
    onRepeatersChange: repeaters.setOn,
    mapStyle,
    onMapStyleChange: changeMapStyle,
    roadNumbers,
    onRoadNumbersChange: setRoadNumbers,
    magneticLines,
    onMagneticLinesChange: setMagneticLines,
    utmGrid: utmGridOn,
    onUtmGridChange: setUtmGrid,
    record: recordTool,
    disabled: !engine,
  };
  const tools = mapTools(toolsInput);

  // Whether the wide screen's map is compact (see `compact`): narrower than 30rem, or shorter than its column of tools
  // (zoom and every tool, about 2.17rem each with the hairlines and the gaps between blocks, or 45 px each under a
  // finger, where they are 44 px whatever the size of the text) above the line of credits.
  const toolCount = tools.length + 2;
  useEffect(() => {
    const element = area.current;
    if (!isDesktop || !element || typeof ResizeObserver === "undefined") {
      setCompact(false);
      return;
    }
    const measure = () => {
      // Out of sight (the browser's own Print shows only the sheet being printed): nothing to measure, and a layout
      // changed now would put away the print dialog that is printing.
      if (element.clientWidth === 0 || element.clientHeight === 0) return;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const narrow = element.clientWidth < 30 * rem;
      const short = element.clientHeight - 3 * rem < toolCount * (coarse ? 45 : 2.17 * rem);
      setCompact(narrow || short);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isDesktop, toolCount, coarse]);

  const mapNotice =
    loadError || sources.isError ? (
      <Notice
        tone="warning"
        icon={<CircleAlert />}
        className="pointer-events-auto max-w-lg shadow-float"
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLoadError(undefined);
              void sources.refetch();
              void overview.refetch();
            }}
          >
            Try again
          </Button>
        }
      >
        {sources.isError
          ? `What is installed could not be read, so only the outline map is shown. ${errorMessage(sources.error)}`
          : "Part of the map could not be loaded. If its files are on an external drive, check that the drive is connected."}
      </Notice>
    ) : undefined;

  // On a phone, a recording's open card gives way to the card of whatever is taken up next, by folding to its one line.
  const cardUp = Boolean(card);
  useEffect(() => {
    if (cardUp && !isDesktop) foldRecordingCard();
  }, [cardUp, isDesktop]);

  return (
    <div
      data-map-style={mapStyle}
      className="outpost-fill relative isolate flex h-dvh overflow-hidden max-md:h-[calc(100dvh-3.25rem)] max-md:pb-[var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-bottom)))]"
    >
      {isDesktop && panel.open ? (
        <DesktopPanel onCollapse={() => setPanel((current) => ({ ...current, open: false }))}>{panelBody}</DesktopPanel>
      ) : null}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: a place to drop files, not a control; the same import is a button in the Routes tab */}
      <div
        ref={area}
        data-compact={compact ? "" : undefined}
        className="outpost-touch relative min-w-0 flex-1 bg-surface"
        onDragEnter={(event) => hasFiles(event) && setDropping(true)}
        onDragOver={(event) => hasFiles(event) && event.preventDefault()}
        onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setDropping(false)}
        onDrop={onDrop}
      >
        {!isDesktop || !panel.open ? <h1 className="sr-only">Maps</h1> : null}
        {/* MapLibre makes its container position: relative, so the sizing lives on a wrapper. */}
        <div className="absolute inset-0">
          <div ref={container} className="outpost-map size-full" />
        </div>

        {mapStatus === "loading" ? (
          <div className="absolute inset-0 grid place-content-center" aria-busy>
            <Skeleton className="h-2 w-40" />
            <span className="sr-only">Loading the map</span>
          </div>
        ) : mapStatus !== "ready" ? (
          <div className="absolute inset-0 grid place-content-center p-6">
            <Notice
              tone="warning"
              icon={<CircleAlert />}
              title={mapStatus === "unsupported" ? "The map cannot be drawn in this browser" : "The map could not be started"}
              className="max-w-md"
            >
              <p>{mapError}</p>
              <p className="mt-1 text-ink-muted">
                Your saved places, routes and downloaded regions are still listed{isDesktop ? " in the panel" : " below"}, and search still
                finds them.
              </p>
            </Notice>
          </div>
        ) : null}

        {/* The point "the centre of the map" means, wherever something on screen is reading it: the readout while it
            says "Centre", the Sun tab, and a route drawn from the keyboard, where it is where the next point will go. */}
        {engine && (isDesktop || detent !== "full") ? (
          <CentreMark
            engine={engine}
            always={(panel.tab === "sun" && (isDesktop ? panel.open : detent !== "peek")) || (tool === "draw" && mapHasKeyboard)}
          />
        ) : null}

        <MapFurniture
          phone={!isDesktop || compact}
          covered={!isDesktop && detent === "full"}
          docked={docked}
          dockRoom={dockRoom}
          onClear={onClear}
          search={
            <SearchBox
              className="pointer-events-auto w-full min-w-0 md:max-w-[24rem]"
              markers={markers.data ?? []}
              tracks={allTracks}
              placesInstalled={(overview.data?.places.length ?? 0) > 0}
              getCenter={() => engine?.getCenter() ?? null}
              onChoose={chooseResult}
              onAddPlaceNames={() => navigate("/maps/data?names=1")}
              leading={
                isDesktop && !panel.open ? (
                  <Tooltip label="Show places, routes and offline maps" side="bottom">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Show places, routes and offline maps"
                      onClick={() => setPanel((current) => ({ ...current, open: true }))}
                    >
                      <PanelLeftOpen />
                    </Button>
                  </Tooltip>
                ) : undefined
              }
            />
          }
          tools={
            isDesktop && !compact ? (
              <MapControls
                className="pointer-events-auto ml-auto"
                {...toolsInput}
                onZoomIn={() => engine?.zoomIn()}
                onZoomOut={() => engine?.zoomOut()}
              />
            ) : (
              <MapToolColumn tools={tools} />
            )
          }
          notice={
            // On a phone the grey line's legend is one of the things in the column, under the search box, so that
            // nothing lies over it; on a wide screen it is laid over the map (below).
            mapNotice || (!isDesktop && greyLine.legend) ? (
              <>
                {mapNotice}
                {isDesktop ? null : greyLine.legend}
              </>
            ) : undefined
          }
          cards={
            <>
              <TrackRecording engine={engine} onShowTrack={(track) => openTrack(track, false)} />
              {card}
            </>
          }
          footer={
            // No map drawn, nothing to credit.
            <MapFooter
              engine={engine}
              format={format}
              onFormatChange={setFormat}
              credits={engine ? credits : []}
              heights={{ terrain: sources.data?.hasTerrain ?? false, onGetTerrain: () => openOffline({ type: "add" }) }}
              underReadout={
                engine && (sunLine || isDesktop) ? (
                  <CentreLines
                    engine={engine}
                    sun={sunLine ? <SunGlance engine={engine} onOpen={showSun} where={isDesktop ? "At the centre" : undefined} /> : null}
                  />
                ) : undefined
              }
              // On a phone the credits always have a line of their own under the readout, never the space beside it:
              // what the readout has room for is worked out from their height, which must not depend on the answer.
              // While a repeater's estimated range is drawn on a phone, the coordinates of the centre step aside (they are
              // in the Sun tab and under a long press) so that the outline has the room: at large text it was 70 px across.
              // The same while a page to print is laid out, when the sheet is raised and the box has what map is left:
              // with the coordinates there, the box on a phone in a browser was 55 px across, too small to take hold of.
              className={cn(
                "w-full max-md:flex-col max-md:flex-nowrap max-md:items-stretch",
                (repeaters.ranging || tool === "print") && "max-md:[&_.outpost-readout-row]:hidden",
              )}
            />
          }
        />

        {isDesktop ? greyLine.legend : null}

        {contextMenu && area.current ? (
          <ContextMenu
            point={contextMenu.point}
            bounds={{ width: area.current.clientWidth, height: area.current.clientHeight }}
            coordinates={formatPosition(contextMenu.position.lat, contextMenu.position.lon, format, engine?.getZoom()).text}
            locator={format === "maidenhead" ? undefined : locatorOf(contextMenu.position)}
            place={contextPlace ? { name: contextPlace.name, onMove: () => startMove(contextPlace, "map") } : undefined}
            onSave={() => startPlace(contextMenu.position)}
            onMeasure={() => {
              setContextMenu(null);
              setTool("measure");
              setMeasurePoints([contextMenu.position]);
              setDetent("peek");
            }}
            onDraw={() => startDrawing([contextMenu.position])}
            onRoadRoute={(role) => {
              const { lat, lon } = contextMenu.position;
              startRoadRoute(role, { name: contextPlace?.name ?? pointName({ lat, lon }), lat, lon, from: "map" });
            }}
            onSun={() => {
              const { lat, lon } = contextMenu.position;
              setContextMenu(null);
              setDraft(null);
              setMoving(null);
              setPin({ title: formatDecimal(lat, lon, 5), detail: "A point chosen on the map", position: { lat, lon }, sun: true });
              setDetent("peek");
            }}
            onRange={() => {
              setContextMenu(null);
              setDraft(null);
              setMoving(null);
              setPin(null);
              walk.stop();
              reachable.stop();
              pointRange.start({ position: contextMenu.position, name: contextPlace?.name });
              setDetent("peek");
            }}
            onWalk={() => {
              setContextMenu(null);
              setDraft(null);
              setMoving(null);
              setPin(null);
              pointRange.stop();
              reachable.stop();
              walk.start(contextMenu.position);
              setDetent("peek");
            }}
            onReach={() => {
              setContextMenu(null);
              setDraft(null);
              setMoving(null);
              setPin(null);
              pointRange.stop();
              walk.stop();
              reachable.start(contextMenu.position, contextPlace?.name ?? null);
              setDetent("peek");
            }}
            onClose={() => {
              setContextMenu(null);
              if (contextMenu.keyboard) engine?.focus();
            }}
          />
        ) : null}

        {dropping ? (
          <div className="pointer-events-none absolute inset-3 z-30 grid place-content-center rounded-panel border-2 border-dashed border-primary bg-page/80">
            <p className="flex items-center gap-2.5 text-lead font-semibold text-ink">
              <FileUp aria-hidden className="size-5 text-primary" /> Drop GPX, KML or GeoJSON files to import them
            </p>
          </div>
        ) : null}

        {/* On a phone the page to print is laid out in the sheet, not in a card over the map. It is held here, not with the
            cards: those are taken away while the sheet covers the map, and the raised sheet was left empty. */}
        {!isDesktop && tool === "print" && engine ? (
          <Suspense fallback={null}>
            <PrintTool
              engine={engine}
              style={styleInput}
              format={format}
              onClose={leaveTool}
              sheet={printSheet}
              onInSheet={setPrintInSheet}
            />
          </Suspense>
        ) : null}

        {!isDesktop ? (
          <MobileSheet
            detent={detent}
            onDetentChange={setDetent}
            onPeekHeight={setPeekHeight}
            hidden={docked}
            first={tool === "sight" ? "sight" : tool === "print" && printInSheet ? "print" : "tabs"}
          >
            {panelBody}
          </MobileSheet>
        ) : null}
      </div>

      <ConfirmDialog
        open={discarding !== null}
        onOpenChange={(open) => !open && setDiscarding(null)}
        title={lastDiscarding.current?.reshaping ? `Discard the changes to “${lastDiscarding.current.reshaping}”?` : "Discard this route?"}
        description={
          lastDiscarding.current?.reshaping
            ? "The route stays as it was last saved. The changes you made to its shape are lost."
            : `The ${plural(lastDiscarding.current?.points ?? 0, "point")} you placed ${lastDiscarding.current?.points === 1 ? "has" : "have"} not been saved and will be lost.`
        }
        confirmLabel={lastDiscarding.current?.reshaping ? "Discard changes" : "Discard route"}
        cancelLabel={lastDiscarding.current?.reshaping ? "Keep editing" : "Keep drawing"}
        onConfirm={() => {
          const then = discarding?.then;
          stopDrawing();
          then?.();
        }}
      />

      <ImportMapFilesDialog
        files={importFiles}
        onClose={() => setImportFiles(null)}
        onShow={(track, saved) => {
          setImportFiles(null);
          if (track) openTrack(track);
          else if (saved[0]) openMarker(saved[0]);
        }}
      />
    </div>
  );
}
