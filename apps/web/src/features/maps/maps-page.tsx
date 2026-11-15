/**
 * The Maps screen: an offline map that fills the content area, with search, saved
 * places, GPX routes, a measuring tool and the download manager for map regions.
 *
 * This file holds the screen's state and wires it to the map engine. The engine
 * (MapLibre) is loaded on demand; until it arrives, and if it cannot start at all, the
 * lists in the panel still work.
 */
import "./maps.css";
import { ACTIVE_DOWNLOAD_STATES, type MarkerDto, type TrackDto } from "@outpost/shared";
import { CircleAlert, FileUp, PanelLeftOpen } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { useDownloads } from "@/features/downloads/use-downloads";
import { errorMessage } from "@/lib/api";
import { useIsAdmin } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useDeleteMarker, useMapOverview, useMapSources, useMarkers, useSaveMarker, useTrackGeometries, useTracks } from "./data";
import { useGeolocation, useIsDesktop, useMapTheme, useStoredState } from "./hooks";
import { formatPosition, isReadoutFormat, type ReadoutFormat } from "./lib/coords";
import type { LatLon } from "./lib/geo";
import { MARKER_HEX } from "./lib/palette";
import type { SearchResult } from "./lib/search";
import type { StyleInput } from "./lib/style";
import { regionsCacheKey } from "./lib/tiles";
import { type CameraView, DEFAULT_VIEW, isCameraView, parseView, readStored, STORAGE_KEYS, withView, writeStored } from "./lib/view";
import type { MapEngine } from "./map/engine";
import { coverageData, EMPTY, locationData, markersData, measureData, pointData, tracksData } from "./map/overlays";
import { ContextMenu, MapCard, MapControls, MeasureCard, PinCard, type Tool } from "./map-chrome";
import { creditsFor, MapFooter } from "./map-footer";
import { type OfflineIntent, OfflinePanel } from "./panels/offline";
import { draftOf, type PlaceDraft, PlaceEditor, PlacesList } from "./panels/places";
import { ImportGpxDialog, RouteDetail, RoutesList } from "./panels/routes";
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

/** A found position that has not been saved. */
interface Pin {
  title: string;
  detail?: string;
  position: LatLon;
}

type MapStatus = "loading" | "ready" | "unsupported" | "failed";

export default function MapsPage() {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const isAdmin = useIsAdmin();
  const { flavour, theme } = useMapTheme();

  const sources = useMapSources();
  const overview = useMapOverview();
  const markers = useMarkers();
  const tracks = useTracks();
  const downloads = useDownloads();
  const saveMarker = useSaveMarker();
  const deleteMarker = useDeleteMarker();

  const [format, setFormat] = useStoredState<ReadoutFormat>(STORAGE_KEYS.coordinateFormat, isReadoutFormat, "decimal");
  const [hillshade, setHillshade] = useStoredState(STORAGE_KEYS.hillshade, isBoolean, true);
  const [hiddenTracks, setHiddenTracks] = useStoredState(STORAGE_KEYS.hiddenTracks, isStringArray, []);
  const [panel, setPanel] = useStoredState<PanelState>(STORAGE_KEYS.panel, isPanelState, { open: true, tab: "places" });
  const [detent, setDetent] = useState<Detent>("peek");

  const [tool, setTool] = useState<Tool>("browse");
  const [measurePoints, setMeasurePoints] = useState<LatLon[]>([]);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [profilePoint, setProfilePoint] = useState<LatLon | null>(null);
  const [contextMenu, setContextMenu] = useState<{ position: LatLon; point: { x: number; y: number } } | null>(null);
  const [importFiles, setImportFiles] = useState<File[] | null>(null);
  const [dropping, setDropping] = useState(false);
  const [offlineIntent, setOfflineIntent] = useState<OfflineIntent>(null);
  const [firstUseDismissed, setFirstUseDismissed] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const area = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapError, setMapError] = useState<string>();

  // ── The map itself ──

  const cacheKey = useMemo(() => regionsCacheKey(overview.data?.regions ?? []), [overview.data]);
  const styleInput = useMemo<Omit<StyleInput, "overlays">>(
    () => ({ sources: sources.data, flavour, theme, hillshade, origin: window.location.origin, cacheKey }),
    [sources.data, flavour, theme, hillshade, cacheKey],
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
      setDraft(draftOf(marker));
      showPanel("places");
      if (fly) engine?.flyTo({ lat: marker.lat, lon: marker.lon });
    },
    [engine, showPanel],
  );

  const openTrack = useCallback(
    (track: TrackDto, fit = true) => {
      setDraft(null);
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
      setContextMenu(null);
      setTool("browse");
      setDraft({ name, note: "", color: "teal", isFavorite: false, lat: position.lat, lon: position.lon });
      showPanel("places");
    },
    [showPanel],
  );

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
    engine?.setOverlay("o-markers", markersData(markers.data ?? [], draft?.id ?? null));
  }, [engine, markers.data, draft?.id]);

  useEffect(() => {
    if (!engine) return;
    // Colour and name come from the list, which is refreshed first when a route is changed.
    const current = geometries.map((geometry) => ({ ...geometry, ...(tracks.data?.find((track) => track.id === geometry.id) ?? {}) }));
    const data = tracksData(current, trackId);
    engine.setOverlay("o-tracks", data.lines);
    engine.setOverlay("o-track-ends", data.ends);
  }, [engine, geometries, tracks.data, trackId]);

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

  useEffect(() => {
    if (!engine) return;
    if (draft)
      engine.setPin({
        position: { lat: draft.lat, lon: draft.lon },
        color: MARKER_HEX[draft.color],
        draggable: true,
        label: `${draft.name || "New place"}. Drag to move.`,
      });
    else if (pin) engine.setPin({ position: pin.position, color: theme.primary, draggable: false, label: pin.title });
    else engine.setPin(null);
  }, [engine, draft, pin, theme.primary]);

  useEffect(() => {
    if (!engine) return;
    return engine.on("pindrag", (position) =>
      setDraft((current) =>
        current ? { ...current, lat: Number(position.lat.toFixed(6)), lon: Number(position.lon.toFixed(6)) } : current,
      ),
    );
  }, [engine]);

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

  const latest = useRef({ tool, markers: markers.data, tracks: tracks.data, openMarker, openTrack, startPlace });
  latest.current = { tool, markers: markers.data, tracks: tracks.data, openMarker, openTrack, startPlace };

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
    return () => {
      offClick();
      offContext();
    };
  }, [engine]);

  const leaveTool = useCallback(() => {
    setTool("browse");
    setMeasurePoints([]);
  }, []);

  // Escape puts down whatever tool is in hand. Dialogs and menus handle their own.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]'))
        return;
      if (tool !== "browse") {
        event.preventDefault();
        leaveTool();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, leaveTool]);

  const changeTool = (next: Tool) => {
    setContextMenu(null);
    if (next === "browse") return leaveTool();
    setMeasurePoints([]);
    setTool(next);
    // On a phone the sheet would cover the map being clicked on.
    setDetent("peek");
    if (next === "add-place") toast("Click or tap the map where the place is.");
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
    () => creditsFor(sources.data?.attributions ?? [], { hasTiles, hillshade: hillshade && (sources.data?.hasTerrain ?? false) }),
    [sources.data, hasTiles, hillshade],
  );
  const firstUse = sources.isSuccess && !hasTiles && !mapDownloading && !firstUseDismissed && !offlineVisible;
  const openOffline = (intent: OfflineIntent) => {
    setOfflineIntent(intent);
    showPanel("offline");
  };
  const clearIntent = useCallback(() => setOfflineIntent(null), []);
  const lowerSheet = useCallback(() => setDetent("peek"), []);

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
            onAdd={() => changeTool("add-place")}
            canAddOnMap={Boolean(engine)}
          />
        ),
        routes: selectedTrack ? (
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
          />
        ),
        offline: (
          <OfflinePanel
            overview={overview}
            engine={engine}
            canManage={isAdmin}
            intent={offlineIntent}
            onIntentHandled={clearIntent}
            onNeedMap={lowerSheet}
          />
        ),
      }}
    </PanelTabs>
  );

  const card =
    tool === "measure" ? (
      <MeasureCard
        points={measurePoints}
        onUndo={() => setMeasurePoints((points) => points.slice(0, -1))}
        onClear={() => setMeasurePoints([])}
        onDone={leaveTool}
      />
    ) : pin ? (
      <PinCard
        title={pin.title}
        detail={pin.detail}
        position={pin.position}
        format={format}
        onSave={() => startPlace(pin.position, /^[-\d.,\s]+$/.test(pin.title) ? "" : pin.title)}
        onClose={() => setPin(null)}
      />
    ) : firstUse ? (
      <MapCard title="No detailed maps on this device yet" onClose={() => setFirstUseDismissed(true)} closeLabel="Dismiss">
        <p className="mt-1 text-small text-ink-muted">
          What you see is an outline of the world that comes with Outpost. Detailed maps are downloaded one region at a time, and then work
          with no connection.
        </p>
        {isAdmin ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => openOffline({ type: "add", presetId: "world" })}>
              World overview (about 45 MB)
            </Button>
            <Button size="sm" onClick={() => openOffline({ type: "add" })}>
              Choose a region
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-small text-ink-muted">Only an administrator can download maps. Ask whoever looks after this Outpost.</p>
        )}
      </MapCard>
    ) : null;

  return (
    <div className="relative isolate flex h-dvh overflow-hidden max-md:h-[calc(100dvh-3.25rem)] max-md:pb-14">
      {isDesktop && panel.open ? (
        <DesktopPanel onCollapse={() => setPanel((current) => ({ ...current, open: false }))}>{tabs}</DesktopPanel>
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

        {/* Middle of the map on touch screens, where there is no pointer to read a position from. */}
        {engine && detent === "peek" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 hidden size-5 -translate-x-1/2 -translate-y-1/2 [@media(pointer:coarse)]:block"
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
            onLocate={() => (locate.state === "off" ? locate.start() : locate.stop())}
            hillshade={sources.data?.hasTerrain ? hillshade : undefined}
            onHillshadeChange={setHillshade}
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
          {card}
          {/* No map drawn, nothing to credit. */}
          <MapFooter engine={engine} format={format} onFormatChange={setFormat} credits={engine ? credits : []} className="w-full" />
        </div>

        {contextMenu && area.current ? (
          <ContextMenu
            point={contextMenu.point}
            bounds={{ width: area.current.clientWidth, height: area.current.clientHeight }}
            coordinates={formatPosition(contextMenu.position.lat, contextMenu.position.lon, format, engine?.getZoom()).text}
            onSave={() => startPlace(contextMenu.position)}
            onMeasure={() => {
              setContextMenu(null);
              setTool("measure");
              setMeasurePoints([contextMenu.position]);
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
            {tabs}
          </MobileSheet>
        ) : null}
      </div>

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
