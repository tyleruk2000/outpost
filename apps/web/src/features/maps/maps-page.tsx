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
import { ACTIVE_DOWNLOAD_STATES, formatDecimal, haversineMeters, type MarkerDto, type TrackDto } from "@outpost/shared";
import { CircleAlert, FileUp, PanelLeftOpen } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { useDownloads } from "@/features/downloads/use-downloads";
import { errorMessage } from "@/lib/api";
import { cn, plural } from "@/lib/utils";
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
import { useGeolocation, useIsDesktop, useMapTheme, useStoredState } from "./hooks";
import { type ContourReach, contourReach, contoursSupported } from "./lib/contours";
import { formatPosition, isReadoutFormat, type ReadoutFormat } from "./lib/coords";
import { formatDistance, type LatLon } from "./lib/geo";
import { MARKER_HEX } from "./lib/palette";
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
import type { MapEngine, MapHit } from "./map/engine";
import { coverageData, EMPTY, locationData, markersData, measureData, pointData, tracksData } from "./map/overlays";
import { CONTOUR_NOTES, ContextMenu, DrawCard, MapCard, MapControls, MeasureCard, MoveCard, PinCard, type Tool } from "./map-chrome";
import { creditsFor, MapFooter } from "./map-footer";
import { type OfflineIntent, OfflinePanel } from "./panels/offline";
import { draftOf, type PlaceDraft, PlaceEditor, PlacesList } from "./panels/places";
import { hasUnsavedWork, type RouteDraft, RouteEditor } from "./panels/route-editor";
import { ImportGpxDialog, RouteDetail, RoutesList } from "./panels/routes";
import { locatorOf } from "./radio/locator";
import { SightCard } from "./radio/sight-card";
import { SightPanel } from "./radio/sight-panel";
import { useLocatorGrid } from "./radio/use-locator-grid";
import { useSight } from "./radio/use-sight";
import { RecordButton, TrackRecording } from "./recording/record-ui";
import { SearchBox } from "./search-box";
import { DesktopPanel, type Detent, detentHeight, MobileSheet, PANEL_TABS, type PanelTab, PanelTabs } from "./side-panel";

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

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export default function MapsPage() {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const { flavour, theme } = useMapTheme();

  const sources = useMapSources();
  const overview = useMapOverview();
  const markers = useMarkers();
  const tracks = useTracks();
  const downloads = useDownloads();
  const saveMarker = useSaveMarker();
  const deleteMarker = useDeleteMarker();
  const saveRoute = useSaveRoute();

  const [format, setFormat] = useStoredState<ReadoutFormat>(STORAGE_KEYS.coordinateFormat, isReadoutFormat, "decimal");
  const [hillshade, setHillshade] = useStoredState(STORAGE_KEYS.hillshade, isBoolean, true);
  const [contours, setContours] = useStoredState(STORAGE_KEYS.contours, isBoolean, false);
  const [hiddenTracks, setHiddenTracks] = useStoredState(STORAGE_KEYS.hiddenTracks, isStringArray, []);
  const [panel, setPanel] = useStoredState<PanelState>(STORAGE_KEYS.panel, isPanelState, { open: true, tab: "places" });
  const [detent, setDetent] = useState<Detent>("peek");

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
  /** The two ends a line-of-sight check starts with, when it is taken up from a measured path. */
  const [sightStart, setSightStart] = useState<[LatLon, LatLon] | null>(null);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [moving, setMoving] = useState<PlaceMove | null>(null);
  /** What had the keyboard when a move began from the list, to give it back when the move ends. */
  const moveReturnFocus = useRef<HTMLElement | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [profilePoint, setProfilePoint] = useState<LatLon | null>(null);
  const [contextMenu, setContextMenu] = useState<{ position: LatLon; point: { x: number; y: number }; hit: MapHit | null } | null>(null);
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
  const sight = useSight({ engine, active: tool === "sight", markers: markers.data ?? [], start: sightStart });
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapError, setMapError] = useState<string>();

  // ── The map itself ──

  const cacheKey = useMemo(() => regionsCacheKey(overview.data?.regions ?? []), [overview.data]);
  const styleInput = useMemo<Omit<StyleInput, "overlays">>(
    () => ({ sources: sources.data, flavour, theme, hillshade, contours, origin: window.location.origin, cacheKey }),
    [sources.data, flavour, theme, hillshade, contours, cacheKey],
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
      setDraft({ name, note: "", color: "teal", isFavorite: false, lat: position.lat, lon: position.lon });
      showPanel("places");
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
      else toast.error("That saved place no longer exists.");
    } else if (linkedTrack) {
      if (!tracks.data) return;
      handledLink.current = location.key;
      const track = tracks.data.find((item) => item.id === linkedTrack);
      if (track) openTrack(track);
      else toast.error("That route no longer exists.");
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
    const data = tracksData(current, trackId);
    engine.setOverlay("o-tracks", data.lines);
    engine.setOverlay("o-track-ends", data.ends);
  }, [engine, geometries, tracks.data, trackId, reshapingId]);

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
        draggable: true,
        label: `${movingMarker.name}. ${howToMove} Enter saves the new position.`,
      });
    else if (draft)
      engine.setPin({
        position: { lat: draft.lat, lon: draft.lon },
        color: MARKER_HEX[draft.color],
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
    engine?.setCursor(tool === "browse" ? "" : "crosshair");
  }, [engine, tool]);

  // "Fit" and "fly" should land in the part of the map that is not under the chrome.
  useEffect(() => {
    if (!engine) return;
    // On a phone: the sheet (at most half the height, as "full" hides the map anyway) and the readout above it.
    const sheet = isDesktop ? 0 : detentHeight(detent === "peek" ? "peek" : "half", area.current?.clientHeight ?? 0) + 88;
    engine.setPadding({ top: isDesktop ? 16 : 64, right: isDesktop ? 56 : 0, bottom: sheet, left: 0 });
  }, [engine, isDesktop, detent]);

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
      // The line-of-sight card hears presses on the map for itself.
      if (now.tool === "sight") return;
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
      // In a text field these keys belong to the text.
      if (tool !== "draw" || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      const onMap = event.target instanceof HTMLElement && event.target.classList.contains("maplibregl-canvas");
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
  }, [tool, moving, endMove, leaveTool, closeDrawing, stepRoute, addAtCentre]);

  const takeUpTool = (next: Tool) => {
    if (next === "browse") return leaveTool();
    if (next === "draw") return startDrawing();
    setMeasurePoints([]);
    setMoving(null);
    setTool(next);
    // On a phone the sheet would cover the map being clicked on.
    setDetent("peek");
    if (next === "add-place") toast("Click or tap the map where the place is.");
  };
  const changeTool = (next: Tool) => {
    setContextMenu(null);
    // Putting the drawing tool down for another one must not lose points without asking.
    if (tool === "draw") closeDrawing(next === "browse" || next === "draw" ? undefined : () => takeUpTool(next));
    else takeUpTool(next);
  };

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
    (message) => toast.error(message),
  );
  useEffect(() => {
    engine?.setOverlay("o-location", locationData(locate.fix));
  }, [engine, locate.fix]);

  const chooseResult = (result: SearchResult) => {
    setContextMenu(null);
    if (result.kind === "marker") return openMarker(result.marker);
    if (result.kind === "track") return openTrack(result.track);
    if (!result.position) return;
    setDraft(null);
    setMoving(null);
    setTrackId(null);
    setPin({ title: result.title, detail: result.detail, position: result.position });
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
        isFavorite: draft.isFavorite,
        lat: draft.lat,
        lon: draft.lon,
      },
      {
        onSuccess: ({ marker }) => {
          toast.success(draft.id ? `Saved “${marker.name}”.` : `“${marker.name}” is saved to your places.`);
          setDraft(null);
        },
      },
    );
  };

  // ── Dropping GPX files on the map ──

  const hasFiles = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDropping(false);
    const files = [...event.dataTransfer.files];
    const gpx = files.filter((file) => /\.gpx$/i.test(file.name));
    if (gpx.length === 0) toast.error("Only GPX files can be dropped on the map.");
    else setImportFiles(gpx);
  };

  // ── Layout ──

  const hasTiles = sources.data?.hasTiles ?? false;
  const mapDownloading = (downloads.data ?? []).some(
    (download) => download.kind === "map" && ACTIVE_DOWNLOAD_STATES.includes(download.state),
  );
  const credits = useMemo(
    // Contour lines are drawn from the same terrain as the hill shading, and credit it the same way.
    () =>
      creditsFor(sources.data?.attributions ?? [], { hasTiles, terrain: (hillshade || contours) && (sources.data?.hasTerrain ?? false) }),
    [sources.data, hasTiles, hillshade, contours],
  );
  const firstUse = sources.isSuccess && !hasTiles && !mapDownloading && !firstUseDismissed && !offlineVisible;
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

  const changeContours = (on: boolean) => {
    if (!on) return setContours(false);
    if (!contoursSupported()) {
      toast.error("This browser cannot draw contour lines. An up-to-date browser can.");
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
  const terrainBounds = sources.data?.sources.terrain?.bounds ?? null;
  /** Whether the drawing tool's panel is on screen; when it is not, a card over the map stands in for it. */
  const editorVisible = panel.tab === "routes" && (isDesktop ? panel.open : detent !== "peek");

  /** The saved place under a right-click, when places can be moved: the menu offers to move it. */
  const contextPlace =
    placesMovable && contextMenu?.hit?.type === "marker" ? markers.data?.find((marker) => marker.id === contextMenu.hit?.id) : undefined;

  const tabs = (
    <PanelTabs
      tab={panel.tab}
      onTabChange={(tab) => setPanel({ open: true, tab })}
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
          />
        ) : (
          <PlacesList
            markers={markers}
            onOpen={(marker) => openMarker(marker)}
            onToggleFavourite={(marker) => saveMarker.mutate({ id: marker.id, isFavorite: !marker.isFavorite })}
            onMove={engine ? moveFromList : undefined}
            onAdd={() => changeTool("add-place")}
            canAddOnMap={Boolean(engine)}
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
            canDraw={Boolean(engine)}
          />
        ),
        offline: (
          <OfflinePanel
            overview={overview}
            engine={engine}
            intent={offlineIntent}
            onIntentHandled={clearIntent}
            onNeedMap={lowerSheet}
            onNeedRoom={raiseSheet}
          />
        ),
      }}
    </PanelTabs>
  );

  const panelVisible = isDesktop ? panel.open : detent !== "peek";
  /** What the panel beside the map holds: its three tabs, or the tool that has taken it over. */
  const panelBody =
    tool === "sight" ? (
      <SightPanel
        sight={sight}
        format={format}
        mapReady={Boolean(engine)}
        onDone={leaveTool}
        onOpenOffline={() => {
          leaveTool();
          openOffline({ type: "add" });
        }}
      />
    ) : (
      tabs
    );

  const card =
    tool === "measure" ? (
      <MeasureCard
        points={measurePoints}
        onUndo={() => setMeasurePoints((points) => points.slice(0, -1))}
        onClear={() => setMeasurePoints([])}
        onDone={leaveTool}
        onSaveAsRoute={() => startDrawing(measurePoints)}
        onSight={() => {
          setSightStart([measurePoints[0]!, measurePoints.at(-1)!]);
          setMeasurePoints([]);
          setTool("sight");
        }}
      />
    ) : tool === "sight" ? (
      // The whole answer is in the panel; the card stands in for it while a point is chosen and while the panel is out of sight.
      sight.picking || !panelVisible ? (
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
    ) : pin ? (
      <PinCard
        // A pin dropped for its sun times opens them, even when the pin before it had them folded.
        key={pin.sun ? "sun" : "pin"}
        title={pin.title}
        detail={pin.detail}
        position={pin.position}
        format={format}
        sunOpen={pin.sun}
        onSave={() => startPlace(pin.position, /^[-\d.,\s]+$/.test(pin.title) ? "" : pin.title)}
        onClose={() => setPin(null)}
      />
    ) : locate.fix && !hereDismissed ? (
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
          What you see is an outline of the world that comes with Outpost. Detailed maps are downloaded one region at a time, and then work
          with no connection.
        </p>
        {/* Both lead to the choices before a download, which include where it is kept: nothing starts from here. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => openOffline({ type: "add", presetId: "world" })}>
            World overview (about 45 MB)
          </Button>
          <Button size="sm" onClick={() => openOffline({ type: "add" })}>
            Choose a region
          </Button>
        </div>
      </MapCard>
    ) : null;

  return (
    <div className="relative isolate flex h-dvh overflow-hidden max-md:h-[calc(100dvh-3.25rem)] max-md:pb-14">
      {isDesktop && panel.open ? (
        <DesktopPanel onCollapse={() => setPanel((current) => ({ ...current, open: false }))}>{panelBody}</DesktopPanel>
      ) : null}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: a place to drop files, not a control; the same import is a button in the Routes tab */}
      <div
        ref={area}
        className="relative min-w-0 flex-1 bg-surface"
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

        {/* Middle of the map on touch screens, where there is no pointer to read a position from, and while
            drawing from the keyboard, where it is where the next point will go. */}
        {engine && (detent === "peek" || (tool === "draw" && mapHasKeyboard)) ? (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2",
              tool === "draw" && mapHasKeyboard ? "block" : "hidden [@media(pointer:coarse)]:block",
            )}
          >
            <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-ink shadow-[0_0_0_1px_var(--page)]" />
            <span className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-ink shadow-[0_0_0_1px_var(--page)]" />
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start gap-2 max-md:flex-col max-md:items-stretch">
          <SearchBox
            className="pointer-events-auto w-full md:max-w-[24rem]"
            markers={markers.data ?? []}
            tracks={allTracks}
            placesInstalled={(overview.data?.places.length ?? 0) > 0}
            getCenter={() => engine?.getCenter() ?? null}
            onChoose={chooseResult}
            onAddPlaceNames={() => openOffline({ type: "places" })}
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
          <MapControls
            className="pointer-events-auto md:ml-auto max-md:self-end"
            tool={tool}
            onToolChange={changeTool}
            onZoomIn={() => engine?.zoomIn()}
            onZoomOut={() => engine?.zoomOut()}
            rotated={rotated}
            onResetNorth={() => engine?.resetNorth()}
            locate={locate.supported ? locate.state : undefined}
            onLocate={() => {
              setHereDismissed(false);
              if (locate.state === "off") locate.start();
              else locate.stop();
            }}
            hillshade={sources.data?.hasTerrain ? hillshade : undefined}
            onHillshadeChange={setHillshade}
            contours={contours}
            contourReach={reach}
            onContoursChange={changeContours}
            locatorGrid={locatorGrid}
            onLocatorGridChange={setLocatorGrid}
            record={<RecordButton />}
            disabled={!engine}
          />
        </div>

        {loadError || sources.isError ? (
          <div className="absolute inset-x-3 top-[4.25rem] z-10 flex justify-center max-md:top-[7.5rem] max-md:justify-start max-md:pr-14">
            <Notice
              tone="warning"
              icon={<CircleAlert />}
              className="max-w-lg shadow-float"
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
          </div>
        ) : null}

        <div
          className={cn(
            "pointer-events-none absolute inset-x-3 bottom-[calc(var(--sheet-height,0px)+0.625rem)] z-10 flex flex-col items-center gap-2",
            !isDesktop && detent === "full" && "hidden",
          )}
        >
          <TrackRecording engine={engine} onShowTrack={(track) => openTrack(track, false)} />
          {card}
          {/* No map drawn, nothing to credit. */}
          <MapFooter engine={engine} format={format} onFormatChange={setFormat} credits={engine ? credits : []} className="w-full" />
        </div>

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
            onSun={() => {
              const { lat, lon } = contextMenu.position;
              setContextMenu(null);
              setDraft(null);
              setMoving(null);
              setPin({ title: formatDecimal(lat, lon, 5), detail: "A point chosen on the map", position: { lat, lon }, sun: true });
              setDetent("peek");
            }}
            onClose={() => setContextMenu(null)}
          />
        ) : null}

        {dropping ? (
          <div className="pointer-events-none absolute inset-3 z-30 grid place-content-center rounded-panel border-2 border-dashed border-primary bg-page/80">
            <p className="flex items-center gap-2.5 text-lead font-semibold text-ink">
              <FileUp aria-hidden className="size-5 text-primary" /> Drop GPX files to import them
            </p>
          </div>
        ) : null}

        {!isDesktop ? (
          <MobileSheet detent={detent} onDetentChange={setDetent}>
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

      <ImportGpxDialog
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
