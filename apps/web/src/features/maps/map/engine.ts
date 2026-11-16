/**
 * The only module that talks to MapLibre. The rest of the maps screen describes what
 * should be on the map (a style, overlay data, a camera) and listens for what the
 * person did; this turns that into MapLibre calls and back.
 *
 * It is loaded on demand, so the rest of the app never pays for the map library.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import type { Bbox } from "@outpost/shared";
import {
  AJAXError,
  addProtocol,
  type GeoJSONSource,
  type LngLat,
  Map as MapLibreMap,
  type MapMouseEvent,
  type MapTouchEvent,
  Marker,
  setWorkerUrl,
} from "maplibre-gl";
// Served from Outpost's own origin, as the content security policy requires.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import {
  BOX_HANDLES,
  type BoxHandle,
  boxHandleName,
  boxHandlePosition,
  edgeHandleFits,
  edgeValue,
  isCornerHandle,
  moveBoxHandle,
} from "../lib/box-handles";
import { CONTOUR_PROTOCOL } from "../lib/contours";
import { type BoxResult, boxFromCorners, type LatLon, wrapLongitude } from "../lib/geo";
import { arrowNudge } from "../lib/nudge";
import { midpoints } from "../lib/route-edit";
import { buildStyle, countryLabelPoints, SOURCE_IDS, type StyleInput } from "../lib/style";
import { createTileLoader, TILE_PROTOCOL } from "../lib/tiles";
import type { CameraView } from "../lib/view";
import { loadContourTile } from "./contours";
import {
  boxData,
  type DrawState,
  drawData,
  EMPTY,
  type FeatureCollection,
  middleMinZoom,
  OVERLAY_LAYERS,
  type OverlaySource,
  overlayLayers,
  overlaySources,
} from "./overlays";

setWorkerUrl(workerUrl);
addProtocol(
  TILE_PROTOCOL,
  createTileLoader(
    (input, init) => fetch(input, init),
    (url) => new AJAXError(404, "No tile here", url, new Blob()),
  ),
);
// Contour lines are traced in a worker of our own from installed terrain; see contours.ts.
addProtocol(CONTOUR_PROTOCOL, loadContourTile);

export class MapUnsupportedError extends Error {
  constructor() {
    super("This browser cannot draw the map: it needs WebGL 2, which is switched off or not supported here.");
    this.name = "MapUnsupportedError";
  }
}

export interface MapHit {
  type: "marker" | "track";
  id: string;
}

export interface MapEvents {
  /** Every frame while the camera moves. Listeners must stay cheap and out of React state. */
  move: undefined;
  /** The camera came to rest. */
  moveend: CameraView;
  /** The pointer's position over the map, or null when it leaves (and on touch screens). */
  pointer: LatLon | null;
  click: { position: LatLon; point: { x: number; y: number }; hit: MapHit | null };
  /** Right-click or long press. `hit` is the saved place or route under it, if any. */
  context: { position: LatLon; point: { x: number; y: number }; hit: MapHit | null };
  /** True while the map is turned away from north. */
  rotated: boolean;
  /** The pin of the place being edited or moved was put somewhere new: dropped after a drag, or stepped with an arrow key. */
  pindrag: LatLon;
  /** Enter was pressed on the pin: the person has finished moving it. */
  pinconfirm: undefined;
  /** A saved place was pressed and held. It is now being carried, and should become the pin. */
  placepick: { id: string };
  /** The download box was drawn, or one of its handles was moved by a drag or an arrow key. */
  box: BoxResult;
  /** A point of the route being drawn was pressed and let go without being moved. */
  routepoint: { index: number };
  /** A point of the route being drawn was dragged somewhere new. */
  routemove: { index: number; position: LatLon };
  /** The handle in the middle of a leg was dragged or pressed: a new point there, to become number `index`. */
  routeinsert: { index: number; position: LatLon };
  /** A map tile or data file could not be loaded. */
  loaderror: string;
  idle: undefined;
}

type Listener<K extends keyof MapEvents> = (payload: MapEvents[K]) => void;

/** A point or a mid-leg handle of the route being drawn, while it is held. */
interface HeldHandle {
  kind: "point" | "middle";
  index: number;
  /** Where on screen it was taken hold of. */
  start: { x: number; y: number };
  position: LatLon;
  /** False until it has been dragged far enough to mean it. */
  moved: boolean;
}

/** A saved place under a press, before it has been held long enough to be picked up. */
interface PlaceHold {
  id: string;
  position: LatLon;
  /** Where on screen the press began. */
  at: { x: number; y: number };
  touch: boolean;
  timer: number;
}

/** A saved place that has been picked up and follows the pointer until it is let go. */
interface PlaceCarry {
  id: string;
  /** Where the pointer was when the place was picked up, and where the place was on screen. */
  from: { x: number; y: number };
  origin: { x: number; y: number };
  /** Where it has been carried to; null until it has moved far enough to mean it. */
  position: LatLon | null;
}

const MAP_LABEL = "Map. Arrow keys pan, plus and minus zoom.";
const MAP_LABEL_DRAWING = `${MAP_LABEL} Enter adds a point of the route at the centre.`;

/** How near a press must be to a point of the route to take hold of it, in pixels. */
const HANDLE_REACH_MOUSE = 9;
const HANDLE_REACH_TOUCH = 22;

/**
 * Moving a saved place straight from the map takes a press held this long on it. A drag
 * that merely starts on a place pans the map as it always did, so a place is never
 * moved by accident; a hold is deliberate with a finger and with a mouse alike.
 */
const PLACE_HOLD_MS = 500;
const PLACE_REACH_MOUSE = 8;
const PLACE_REACH_TOUCH = 18;
/** A held pointer is never quite still. Further than this and it was the start of a pan, not a hold. */
const PLACE_HOLD_SLOP_MOUSE = 4;
const PLACE_HOLD_SLOP_TOUCH = 10;

export interface PinState {
  position: LatLon;
  /** Hex colour of the pin's head. */
  color: string;
  draggable: boolean;
  label: string;
}

const lngLatOf = (position: LngLat): LatLon => ({ lat: position.lat, lon: wrapLongitude(position.lng) });

function supportsWebGL2(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class MapEngine {
  private readonly map: MapLibreMap;
  private readonly listeners = new Map<keyof MapEvents, Set<Listener<never>>>();
  private readonly overlayData: Partial<Record<OverlaySource, FeatureCollection>> = {};
  private styleInput: Omit<StyleInput, "overlays">;
  private countryLabels: FeatureCollection | undefined;
  private pin: Marker | undefined;
  private pinState: PinState | undefined;
  private readonly boxHandles = new Map<BoxHandle, Marker>();
  private box: Bbox | null = null;
  private boxShape: ((bbox: Bbox, handle: BoxHandle) => Bbox) | null = null;
  private placesMovable = false;
  private placeHold: PlaceHold | undefined;
  private carry: PlaceCarry | undefined;
  private drawStart: LatLon | undefined;
  private drawing = false;
  private rotated = false;
  private longPress: number | undefined;
  private lastContextAt = 0;
  private route: DrawState | null = null;
  private held: HeldHandle | undefined;
  private ignoreClickUntil = 0;
  private baseCursor: "" | "crosshair" = "";
  private readonly abort = new AbortController();
  private destroyed = false;

  constructor(container: HTMLElement, view: CameraView, style: Omit<StyleInput, "overlays">) {
    if (!supportsWebGL2()) throw new MapUnsupportedError();
    this.styleInput = style;
    try {
      this.map = new MapLibreMap({
        container,
        style: this.composeStyle(),
        center: [view.lon, view.lat],
        zoom: view.zoom,
        // Outpost draws its own controls and credits, in its own type.
        attributionControl: false,
        maplibreLogo: false,
        // A flat map: no tilting, on any device.
        maxPitch: 0,
        pitchWithRotate: false,
        touchPitch: false,
        maxZoom: 19,
        keyboard: true,
        reduceMotion: prefersReducedMotion() ? true : undefined,
      });
    } catch (error) {
      // MapLibre throws when the browser reports WebGL 2 but cannot create a context.
      throw error instanceof Error && /webgl/i.test(error.message) ? new MapUnsupportedError() : error;
    }
    container.dataset.mapIdle = "false";
    this.bind();
    void this.loadCountryLabels();
  }

  // ── Events ──

  on<K extends keyof MapEvents>(type: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  private emit<K extends keyof MapEvents>(type: K, payload: MapEvents[K]): void {
    for (const listener of this.listeners.get(type) ?? []) (listener as Listener<K>)(payload);
  }

  private bind(): void {
    const { map } = this;
    const container = map.getContainer();

    map.on("move", () => this.emit("move", undefined));
    map.on("movestart", () => {
      container.dataset.mapIdle = "false";
      this.cancelLongPress();
      // The map moved under the press: it was a pan, not a hold on a place.
      this.cancelPlaceHold();
    });
    // How long the edges of the download box are on screen decides whether they have room for a handle.
    map.on("zoom", () => {
      if (this.box && this.boxHandles.size > 0) this.fitEdgeHandles(this.box);
    });
    map.on("moveend", () => this.emit("moveend", this.getView()));
    map.on("dataloading", () => {
      container.dataset.mapIdle = "false";
    });
    map.on("idle", () => {
      container.dataset.mapIdle = "true";
      this.emit("idle", undefined);
    });
    map.on("rotate", () => {
      const rotated = Math.abs(map.getBearing()) > 0.5;
      if (rotated !== this.rotated) {
        this.rotated = rotated;
        this.emit("rotated", rotated);
      }
    });
    map.on("load", () => this.flushOverlays());
    map.on("error", (event) => {
      const error = event.error as { message?: string; status?: number } | undefined;
      // A tile that does not exist is normal: it is how the edge of a region is found.
      if (error?.status === 404) return;
      this.emit("loaderror", error?.message ?? "Part of the map could not be loaded.");
    });

    map.on("mousemove", (event) => {
      if (this.drawStart) this.updateDraw(lngLatOf(event.lngLat));
      if (this.held) this.dragHandle(event.point, lngLatOf(event.lngLat));
      else if (this.route) this.showHandleCursor(event.point);
      if (this.carry) this.carryPlace(event.point);
      else if (this.placeHold && this.strayed(this.placeHold, event.point, PLACE_HOLD_SLOP_MOUSE)) this.cancelPlaceHold();
      this.emit("pointer", lngLatOf(event.lngLat));
    });
    map.on("mouseout", () => this.emit("pointer", null));

    map.on("click", (event) => {
      // The press that let go of a route point is not also a press on the map.
      if (this.drawing || performance.now() < this.ignoreClickUntil) return;
      this.emit("click", {
        position: lngLatOf(event.lngLat),
        point: { x: event.point.x, y: event.point.y },
        hit: this.hitTest(event.point.x, event.point.y, 6),
      });
    });
    map.on("contextmenu", (event) => {
      event.preventDefault();
      if (this.carry) return;
      // Android reports its own long press as a context menu. On a saved place that is the hold itself, arriving early.
      if (this.placeHold?.touch) return this.pickUpPlace();
      this.cancelPlaceHold();
      this.emitContext(lngLatOf(event.lngLat), event.point);
    });

    // Drawing the download box: press, drag, release. Panning is switched off while the tool is armed.
    map.on("mousedown", (event: MapMouseEvent) => {
      if (event.originalEvent.button !== 0) return;
      if (this.drawing) {
        event.preventDefault();
        this.drawStart = lngLatOf(event.lngLat);
        return;
      }
      // Taking hold of a point of the route being drawn: the map stays still while it is dragged.
      const handle = this.handleAt(event.point, HANDLE_REACH_MOUSE);
      if (handle) {
        event.preventDefault();
        this.holdHandle(handle, event.point);
        return;
      }
      // A press on a saved place may turn out to be a hold. The map is left free to pan until it does.
      // A press on something lying over the place (a handle of the download box, a pin) belongs to that thing.
      const place = this.onMapItself(event) ? this.placeAt(event.point, PLACE_REACH_MOUSE) : null;
      if (place) this.holdPlace(place, event.point, false);
    });
    map.on("mouseup", (event) => {
      this.finishDraw(lngLatOf(event.lngLat));
      this.releaseHandle();
      this.releasePlace();
    });

    map.on("touchstart", (event: MapTouchEvent) => {
      this.cancelLongPress();
      if (event.points.length !== 1) {
        // A second finger means a pinch: whatever was held is let go where it is.
        this.releasePlace();
        return;
      }
      if (this.drawing) {
        event.preventDefault();
        this.drawStart = lngLatOf(event.lngLat);
        return;
      }
      const handle = this.handleAt(event.point, HANDLE_REACH_TOUCH);
      if (handle) {
        event.preventDefault();
        this.holdHandle(handle, event.point);
        return;
      }
      // A long press on a saved place picks it up; anywhere else it opens the menu for that point.
      const place = this.onMapItself(event) ? this.placeAt(event.point, PLACE_REACH_TOUCH) : null;
      if (place) {
        this.holdPlace(place, event.point, true);
        return;
      }
      const position = lngLatOf(event.lngLat);
      const point = { x: event.point.x, y: event.point.y };
      // iOS has no long-press "contextmenu" event, so the press is timed here.
      this.longPress = window.setTimeout(() => {
        this.longPress = undefined;
        this.emitContext(position, point);
      }, 600);
    });
    map.on("touchmove", (event) => {
      this.cancelLongPress();
      if (this.drawStart && event.points.length === 1) this.updateDraw(lngLatOf(event.lngLat));
      if (this.held) {
        // A second finger means a pinch: let go without moving anything.
        if (event.points.length === 1) this.dragHandle(event.point, lngLatOf(event.lngLat));
        else this.dropHandle();
      }
      if (this.carry) {
        if (event.points.length === 1) this.carryPlace(event.point);
        else this.releasePlace();
      } else if (this.placeHold && (event.points.length !== 1 || this.strayed(this.placeHold, event.point, PLACE_HOLD_SLOP_TOUCH))) {
        this.cancelPlaceHold();
      }
    });
    map.on("touchend", (event) => {
      this.cancelLongPress();
      this.finishDraw(lngLatOf(event.lngLat));
      this.releaseHandle();
      this.releasePlace();
    });
    map.on("touchcancel", () => {
      this.cancelLongPress();
      this.drawStart = undefined;
      this.dropHandle();
      this.releasePlace();
    });

    // The canvas hears the keyboard; MapLibre's handler pans and zooms from it.
    map.getCanvas().setAttribute("aria-label", MAP_LABEL);
  }

  private emitContext(position: LatLon, point: { x: number; y: number }): void {
    // Android fires both our timed long press and its own contextmenu; act once.
    const now = Date.now();
    if (now - this.lastContextAt < 900 || this.drawing) return;
    this.lastContextAt = now;
    this.emit("context", { position, point: { x: point.x, y: point.y }, hit: this.hitTest(point.x, point.y, 6) });
  }

  private cancelLongPress(): void {
    if (this.longPress !== undefined) window.clearTimeout(this.longPress);
    this.longPress = undefined;
  }

  private hitTest(x: number, y: number, tolerance: number): MapHit | null {
    const box: [[number, number], [number, number]] = [
      [x - tolerance, y - tolerance],
      [x + tolerance, y + tolerance],
    ];
    const layers = [OVERLAY_LAYERS.markers, OVERLAY_LAYERS.tracksHit].filter((id) => this.map.getLayer(id));
    if (layers.length === 0) return null;
    const features = this.map.queryRenderedFeatures(box, { layers });
    const marker = features.find((feature) => feature.layer.id === OVERLAY_LAYERS.markers);
    const found = marker ?? features[0];
    const id = found?.properties?.id;
    if (!found || typeof id !== "string") return null;
    return { type: found.layer.id === OVERLAY_LAYERS.markers ? "marker" : "track", id };
  }

  // ── Style and overlays ──

  private composeStyle() {
    return buildStyle({
      ...this.styleInput,
      overlays: { sources: overlaySources(this.overlayData), layers: overlayLayers(this.styleInput.theme) },
    });
  }

  /** Applies a new style in place: the camera, the overlays and loaded tiles that still apply are kept. */
  setStyle(input: Omit<StyleInput, "overlays">): void {
    this.styleInput = input;
    this.map.setStyle(this.composeStyle(), { diff: true });
    this.applyCountryLabels();
  }

  setOverlay(id: OverlaySource, data: FeatureCollection): void {
    this.overlayData[id] = data;
    this.map.getSource<GeoJSONSource>(id)?.setData(data as never);
  }

  private flushOverlays(): void {
    for (const [id, data] of Object.entries(this.overlayData)) this.map.getSource<GeoJSONSource>(id)?.setData(data as never);
    this.applyCountryLabels();
  }

  private async loadCountryLabels(): Promise<void> {
    try {
      const response = await fetch("/world/countries.json", { signal: this.abort.signal });
      if (!response.ok) return;
      this.countryLabels = countryLabelPoints((await response.json()) as { features: unknown[] }) as FeatureCollection;
      this.applyCountryLabels();
    } catch {
      // The outline map still draws without names.
    }
  }

  private applyCountryLabels(): void {
    if (this.countryLabels && !this.destroyed)
      this.map.getSource<GeoJSONSource>(SOURCE_IDS.countryLabels)?.setData(this.countryLabels as never);
  }

  // ── Camera ──

  getView(): CameraView {
    const center = this.map.getCenter();
    return { lat: center.lat, lon: wrapLongitude(center.lng), zoom: this.map.getZoom() };
  }

  /** Centre and size, for things that follow the camera frame by frame (scale bar, readout). */
  getCenter(): LatLon {
    return lngLatOf(this.map.getCenter());
  }

  getZoom(): number {
    return this.map.getZoom();
  }

  getBounds(): Bbox {
    const bounds = this.map.getBounds();
    return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  }

  /** Space the floating chrome takes at each edge, so "fit" and "fly" land in the clear part of the map. */
  setPadding(padding: { top: number; right: number; bottom: number; left: number }): void {
    this.padding = padding;
  }
  private padding = { top: 0, right: 0, bottom: 0, left: 0 };

  flyTo(position: LatLon, zoom?: number): void {
    const target = zoom === undefined ? Math.max(this.map.getZoom(), 12) : zoom;
    this.map.flyTo({ center: [position.lon, position.lat], zoom: target, padding: this.padding, essential: false });
  }

  jumpTo(view: CameraView): void {
    this.map.jumpTo({ center: [view.lon, view.lat], zoom: view.zoom });
  }

  fitBounds(bbox: Bbox, options: { maxZoom?: number; animate?: boolean } = {}): void {
    const pad = 48;
    const { top, right, bottom, left } = this.padding;
    this.map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      {
        padding: { top: top + pad, right: right + pad, bottom: bottom + pad, left: left + pad },
        maxZoom: options.maxZoom ?? 15,
        animate: options.animate ?? true,
      },
    );
  }

  zoomIn(): void {
    this.map.zoomIn();
  }

  zoomOut(): void {
    this.map.zoomOut();
  }

  resetNorth(): void {
    this.map.resetNorth();
  }

  focus(): void {
    this.map.getCanvas().focus({ preventScroll: true });
  }

  resize(): void {
    this.map.resize();
  }

  /** Where a position is on screen, relative to the map's top-left corner. */
  project(position: LatLon): { x: number; y: number } {
    const point = this.map.project([position.lon, position.lat]);
    return { x: point.x, y: point.y };
  }

  setCursor(cursor: "" | "crosshair"): void {
    this.baseCursor = cursor;
    this.map.getCanvas().style.cursor = cursor;
  }

  // ── The route being drawn ──

  /**
   * Shows the route being drawn or reshaped, or clears it. While one is shown, its
   * points can be dragged, the handle in the middle of each leg adds a point there, and
   * what the person did is reported as `routepoint`, `routemove` and `routeinsert`.
   * Presses on the map itself still arrive as `click`.
   */
  setRoute(state: DrawState | null): void {
    const was = this.route !== null;
    this.route = state;
    if (!state) this.dropHandle();
    if (!this.held) this.setOverlay("o-draw", drawData(state));
    if (was === (state !== null)) return;
    this.map.getCanvas().setAttribute("aria-label", state ? MAP_LABEL_DRAWING : MAP_LABEL);
    // Two quick points close together must not zoom the map.
    if (state) this.map.doubleClickZoom.disable();
    else {
      this.map.doubleClickZoom.enable();
      this.map.getCanvas().style.cursor = this.baseCursor;
    }
  }

  /** The point or mid-leg handle of the route under a place on screen, a point winning over a handle. */
  private handleAt(at: { x: number; y: number }, reach: number): Pick<HeldHandle, "kind" | "index" | "position"> | null {
    const route = this.route;
    if (!route || route.points.length === 0) return null;
    let best: Pick<HeldHandle, "kind" | "index" | "position"> | null = null;
    let nearest = reach;
    const consider = (kind: HeldHandle["kind"], index: number, position: LatLon, handicap: number) => {
      const point = this.map.project([position.lon, position.lat]);
      const distance = Math.hypot(point.x - at.x, point.y - at.y);
      if (distance <= reach && distance + handicap < nearest) {
        nearest = distance + handicap;
        best = { kind, index, position };
      }
    };
    route.points.forEach((position, index) => {
      consider("point", index, position, 0);
    });
    const zoom = Math.floor(this.map.getZoom());
    midpoints(route.points).forEach((position, index) => {
      // Hidden while its leg is too short on screen to hold one: the same rule the layer draws by.
      if (zoom >= middleMinZoom(route.points[index]!, route.points[index + 1]!)) consider("middle", index + 1, position, reach / 2);
    });
    return best;
  }

  private showHandleCursor(at: { x: number; y: number }): void {
    const handle = this.handleAt(at, HANDLE_REACH_MOUSE);
    this.map.getCanvas().style.cursor = handle ? (handle.kind === "point" ? "move" : "copy") : this.baseCursor;
  }

  private holdHandle(handle: Pick<HeldHandle, "kind" | "index" | "position">, at: { x: number; y: number }): void {
    this.cancelLongPress();
    this.held = { ...handle, start: { x: at.x, y: at.y }, moved: false };
    // The pointer may be let go outside the map, where the map's own events do not reach.
    window.addEventListener("mouseup", this.releaseHandle);
  }

  private dragHandle(at: { x: number; y: number }, position: LatLon): void {
    const held = this.held;
    const route = this.route;
    if (!held || !route) return;
    if (!held.moved && Math.hypot(at.x - held.start.x, at.y - held.start.y) < 4) return;
    held.moved = true;
    held.position = position;
    const points =
      held.kind === "point"
        ? route.points.map((point, index) => (index === held.index ? position : point))
        : [...route.points.slice(0, held.index), position, ...route.points.slice(held.index)];
    this.setOverlay("o-draw", drawData({ ...route, points, selected: held.index }));
    this.map.getCanvas().style.cursor = "grabbing";
  }

  /** Lets go of the held handle and reports what was done with it. */
  private readonly releaseHandle = (): void => {
    const held = this.held;
    if (!held) return;
    this.endHold();
    this.ignoreClickUntil = performance.now() + 350;
    if (held.kind === "middle") this.emit("routeinsert", { index: held.index, position: held.position });
    else if (held.moved) this.emit("routemove", { index: held.index, position: held.position });
    else this.emit("routepoint", { index: held.index });
  };

  /** Lets go of the held handle as if it had never been touched. */
  private dropHandle(): void {
    if (this.held) this.endHold();
  }

  private endHold(): void {
    this.held = undefined;
    window.removeEventListener("mouseup", this.releaseHandle);
    this.setOverlay("o-draw", drawData(this.route));
    this.map.getCanvas().style.cursor = this.baseCursor;
  }

  // ── The pin: a search result, a place about to be saved, or the place being edited or moved ──

  setPin(state: PinState | null): void {
    if (!state) {
      this.pin?.remove();
      this.pin = undefined;
      this.pinState = undefined;
      return;
    }
    if (!this.pin) {
      const element = document.createElement("div");
      element.className = "outpost-pin";
      element.append(document.createElement("span"));
      element.addEventListener("keydown", this.onPinKey);
      this.pin = new Marker({ element, anchor: "bottom", draggable: state.draggable })
        .setLngLat([state.position.lon, state.position.lat])
        .addTo(this.map);
      this.pin.on("dragend", () => {
        const position = this.pin?.getLngLat();
        if (position) this.emit("pindrag", lngLatOf(position));
      });
    }
    const element = this.pin.getElement();
    element.style.setProperty("--pin-color", state.color);
    element.setAttribute("aria-label", state.label);
    element.dataset.draggable = String(state.draggable);
    // A pin that can be moved can be moved from the keyboard, so it takes focus; one that only marks a spot does not.
    if (state.draggable) {
      element.tabIndex = 0;
      // No ARIA role describes something moved in two directions; "application" hands the arrow keys to the page.
      element.setAttribute("role", "application");
      element.setAttribute("aria-roledescription", "movable pin");
    } else {
      element.removeAttribute("tabindex");
      element.removeAttribute("role");
      element.removeAttribute("aria-roledescription");
    }
    if (this.pinState?.draggable !== state.draggable) this.pin.setDraggable(state.draggable);
    const current = this.pinState?.position;
    if (!current || current.lat !== state.position.lat || current.lon !== state.position.lon)
      this.pin.setLngLat([state.position.lon, state.position.lat]);
    this.pinState = state;
    // A place that was picked up may already have been carried on by the time its pin arrives.
    if (this.carry && state.draggable) {
      element.dataset.carried = "true";
      if (this.carry.position) this.pin.setLngLat([this.carry.position.lon, this.carry.position.lat]);
    }
  }

  /** Gives the keyboard to the pin, so the arrow keys move it. */
  focusPin(): void {
    this.pin?.getElement().focus({ preventScroll: true });
  }

  /** Arrow keys step a pin that can be moved; Shift steps further; Enter says it is where it should be. */
  private readonly onPinKey = (event: KeyboardEvent): void => {
    if (!this.pin || !this.pinState?.draggable || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      this.emit("pinconfirm", undefined);
      return;
    }
    const step = arrowNudge(event.key, event.shiftKey);
    if (!step) return;
    // Otherwise the map underneath would pan with the same key.
    event.preventDefault();
    event.stopPropagation();
    const at = this.map.project(this.pin.getLngLat());
    const next = this.map.unproject([at.x + step.x, at.y + step.y]);
    this.pin.setLngLat(next);
    this.keepInView(next);
    this.emit("pindrag", lngLatOf(next));
  };

  /** Brings a position that has been stepped to the edge of the map, or past it, back into view. */
  private keepInView(position: LngLat): void {
    const point = this.map.project(position);
    const canvas = this.map.getCanvas();
    const margin = 56;
    const { top, right, bottom, left } = this.padding;
    const inside =
      point.x >= left + margin &&
      point.x <= canvas.clientWidth - right - margin &&
      point.y >= top + margin &&
      point.y <= canvas.clientHeight - bottom - margin;
    if (!inside) this.map.panTo(position, { duration: prefersReducedMotion() ? 0 : 200 });
  }

  // ── Picking a saved place up from the map ──

  /**
   * While set, a press held on a saved place picks it up: `placepick` says which, the
   * place then follows the pointer as the pin, and where it is let go arrives as
   * `pindrag`. Nothing is saved here; the screen asks before keeping the new position.
   */
  setPlacesMovable(movable: boolean): void {
    this.placesMovable = movable;
    if (!movable) this.cancelPlaceHold();
  }

  /** The saved place nearest a point on screen, within `reach` pixels. */
  private placeAt(at: { x: number; y: number }, reach: number): Pick<PlaceHold, "id" | "position"> | null {
    if (!this.placesMovable || this.carry || !this.map.getLayer(OVERLAY_LAYERS.markers)) return null;
    const found = this.map.queryRenderedFeatures(
      [
        [at.x - reach, at.y - reach],
        [at.x + reach, at.y + reach],
      ],
      { layers: [OVERLAY_LAYERS.markers] },
    );
    let best: Pick<PlaceHold, "id" | "position"> | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const feature of found) {
      const id = feature.properties?.id;
      // The position as it was given, not as the map's tiles have rounded it.
      const source = typeof id === "string" ? this.overlayData["o-markers"]?.features.find((item) => item.properties.id === id) : undefined;
      const coordinates = source?.geometry.coordinates as [number, number] | undefined;
      if (typeof id !== "string" || !coordinates) continue;
      const point = this.map.project(coordinates);
      const distance = Math.hypot(point.x - at.x, point.y - at.y);
      if (distance < nearest) {
        nearest = distance;
        best = { id, position: { lat: coordinates[1], lon: coordinates[0] } };
      }
    }
    return best;
  }

  /** Whether a press landed on the map's own surface, rather than on a pin or handle that floats over it. */
  private onMapItself(event: MapMouseEvent | MapTouchEvent): boolean {
    return event.originalEvent.target === this.map.getCanvas();
  }

  private strayed(hold: PlaceHold, at: { x: number; y: number }, slop: number): boolean {
    return Math.hypot(at.x - hold.at.x, at.y - hold.at.y) > slop;
  }

  private holdPlace(place: Pick<PlaceHold, "id" | "position">, at: { x: number; y: number }, touch: boolean): void {
    this.cancelPlaceHold();
    this.placeHold = { ...place, at: { x: at.x, y: at.y }, touch, timer: window.setTimeout(() => this.pickUpPlace(), PLACE_HOLD_MS) };
    // The pointer may be let go outside the map, where the map's own events do not reach.
    window.addEventListener("mouseup", this.releasePlace);
  }

  private cancelPlaceHold(): void {
    if (this.placeHold) window.clearTimeout(this.placeHold.timer);
    this.placeHold = undefined;
    if (!this.carry) window.removeEventListener("mouseup", this.releasePlace);
  }

  /** The press was held long enough: the place leaves the map and follows the pointer. */
  private pickUpPlace(): void {
    const hold = this.placeHold;
    if (!hold) return;
    window.clearTimeout(hold.timer);
    this.placeHold = undefined;
    const origin = this.map.project([hold.position.lon, hold.position.lat]);
    this.carry = { id: hold.id, from: hold.at, origin: { x: origin.x, y: origin.y }, position: null };
    // The same finger or button would otherwise drag the map along with the place.
    this.map.dragPan.disable();
    // The hold is not also a long press for the menu.
    this.cancelLongPress();
    this.lastContextAt = Date.now();
    this.map.getCanvas().style.cursor = "grabbing";
    this.emit("placepick", { id: hold.id });
  }

  private carryPlace(at: { x: number; y: number }): void {
    const carry = this.carry;
    if (!carry) return;
    if (!carry.position && Math.hypot(at.x - carry.from.x, at.y - carry.from.y) < 4) return;
    // It moves as far as the pointer has, from where it was: no jump to the pointer when it is picked up.
    carry.position = lngLatOf(this.map.unproject([carry.origin.x + at.x - carry.from.x, carry.origin.y + at.y - carry.from.y]));
    if (this.pin && this.pinState?.draggable) this.pin.setLngLat([carry.position.lon, carry.position.lat]);
  }

  /** Lets go of a place being carried and reports where; or gives up on a hold that had not got that far. */
  private readonly releasePlace = (): void => {
    const carry = this.carry;
    this.carry = undefined;
    this.cancelPlaceHold();
    if (!carry) return;
    if (!this.drawing) this.map.dragPan.enable();
    this.map.getCanvas().style.cursor = this.baseCursor;
    this.pin?.getElement().removeAttribute("data-carried");
    // Letting go is not also a press on the map, which would open the place or whatever lies under it.
    this.ignoreClickUntil = performance.now() + 350;
    if (carry.position) this.emit("pindrag", carry.position);
  };

  // ── The download box ──

  /** Arms or disarms drawing: while armed, a drag on the map draws a box instead of panning. */
  setDrawing(drawing: boolean): void {
    this.drawing = drawing;
    this.drawStart = undefined;
    if (drawing) this.map.dragPan.disable();
    else this.map.dragPan.enable();
    this.setCursor(drawing ? "crosshair" : "");
  }

  /**
   * Holds the box to a shape while its handles are moved: each box a drag or an arrow key
   * asks for is passed through `shape` first, with the handle that asked. The page being
   * laid out for printing uses this to keep the box the shape of the paper.
   */
  setBoxShape(shape: ((bbox: Bbox, handle: BoxHandle) => Bbox) | null): void {
    this.boxShape = shape;
  }

  private shaped(result: BoxResult, handle: BoxHandle): BoxResult {
    return result.ok && this.boxShape ? { ok: true, bbox: this.boxShape(result.bbox, handle) } : result;
  }

  /**
   * Shows a box. With `handles` it can be adjusted: a handle on each corner and in the
   * middle of each edge, moved by dragging or, once focused, with the arrow keys.
   */
  setBox(bbox: Bbox | null, handles: boolean): void {
    this.box = bbox;
    this.setOverlay("o-box", boxData(bbox));
    if (!bbox || !handles) {
      for (const handle of this.boxHandles.values()) handle.remove();
      this.boxHandles.clear();
      return;
    }
    // Made once and then moved, so a handle keeps the keyboard while the box changes under it.
    if (this.boxHandles.size === 0) for (const id of BOX_HANDLES) this.boxHandles.set(id, this.createBoxHandle(id, bbox));
    this.placeBoxHandles(bbox);
  }

  private createBoxHandle(id: BoxHandle, bbox: Bbox): Marker {
    const element = document.createElement("div");
    element.className = "outpost-box-handle";
    element.dataset.handle = id;
    element.tabIndex = 0;
    if (isCornerHandle(id)) {
      // No ARIA role describes something moved in two directions; "application" hands the arrow keys to the page.
      element.setAttribute("role", "application");
      element.setAttribute("aria-roledescription", "corner handle");
      element.setAttribute("aria-label", `${boxHandleName(id)} of the box. Drag to adjust, or use the arrow keys; Shift moves it further.`);
    } else {
      // An edge moves along one line: a slider, whose value is the edge's latitude or longitude.
      element.setAttribute("role", "slider");
      element.setAttribute("aria-orientation", id === "n" || id === "s" ? "vertical" : "horizontal");
      element.setAttribute("aria-label", `${boxHandleName(id)} of the box. Drag to adjust, or use the arrow keys; Shift moves it further.`);
    }
    const start = boxHandlePosition(bbox, id);
    const handle = new Marker({ element, draggable: true }).setLngLat([start.lon, start.lat]).addTo(this.map);

    /** The box as it was when the drag began: the other edges are measured from it, not from handles that follow along. */
    let from: Bbox | null = null;
    const dragged = () => this.shaped(moveBoxHandle(from ?? this.box ?? bbox, id, lngLatOf(handle.getLngLat())), id);
    handle.on("dragstart", () => {
      from = this.box;
    });
    handle.on("drag", () => {
      const result = dragged();
      if (!result.ok) return;
      this.setOverlay("o-box", boxData(result.bbox));
      // A box held to a shape does not follow the pointer freely, so its handle is put back on it.
      this.placeBoxHandles(result.bbox, this.boxShape ? undefined : id);
    });
    handle.on("dragend", () => {
      const result = dragged();
      from = null;
      // A box that cannot be (too small, across the 180° meridian) leaves the old one, handles and all.
      if (!result.ok && this.box) {
        this.setOverlay("o-box", boxData(this.box));
        this.placeBoxHandles(this.box);
      }
      this.emit("box", result);
    });
    element.addEventListener("keydown", (event) => this.nudgeBoxHandle(id, event));
    return handle;
  }

  /** Puts every handle where it belongs on a box. The one being dragged is left under the pointer. */
  private placeBoxHandles(bbox: Bbox, dragging?: BoxHandle): void {
    for (const [id, handle] of this.boxHandles) {
      const at = boxHandlePosition(bbox, id);
      if (id !== dragging) handle.setLngLat([at.lon, at.lat]);
      else if (!isCornerHandle(id)) {
        // An edge handle slides across its edge only, staying in the middle of it.
        const held = handle.getLngLat();
        handle.setLngLat(id === "n" || id === "s" ? [at.lon, held.lat] : [held.lng, at.lat]);
      }
      if (id === "n" || id === "e" || id === "s" || id === "w") {
        const value = edgeValue(bbox, id);
        const element = handle.getElement();
        element.setAttribute("aria-valuemin", String(value.min));
        element.setAttribute("aria-valuemax", String(value.max));
        element.setAttribute("aria-valuenow", String(value.now));
        element.setAttribute("aria-valuetext", value.text);
      }
    }
    this.fitEdgeHandles(bbox, dragging);
  }

  /**
   * An edge too short on screen to hold a handle between its corners goes without one,
   * so that no two touch targets overlap; the corners can do everything an edge can.
   */
  private fitEdgeHandles(bbox: Bbox, dragging?: BoxHandle): void {
    const [west, south, east, north] = bbox;
    const topLeft = this.map.project([west, north]);
    const topRight = this.map.project([east, north]);
    const bottomLeft = this.map.project([west, south]);
    const across = edgeHandleFits(Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y));
    const down = edgeHandleFits(Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y));
    for (const [id, handle] of this.boxHandles) {
      if (isCornerHandle(id)) continue;
      const element = handle.getElement();
      // One in use is never taken out of the person's hands.
      if (id === dragging || element === document.activeElement) continue;
      element.hidden = !(id === "n" || id === "s" ? across : down);
    }
  }

  /** An arrow key on a focused handle moves it a few pixels; with Shift, further. */
  private nudgeBoxHandle(id: BoxHandle, event: KeyboardEvent): void {
    if (!this.box || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = arrowNudge(event.key, event.shiftKey);
    if (!step) return;
    // Otherwise the map underneath would pan with the same key.
    event.preventDefault();
    event.stopPropagation();
    // An edge moves across itself only; the keys along it do nothing.
    if ((id === "n" || id === "s") && step.y === 0) return;
    if ((id === "e" || id === "w") && step.x === 0) return;
    const at = boxHandlePosition(this.box, id);
    const point = this.map.project([at.lon, at.lat]);
    const target = this.map.unproject([point.x + step.x, point.y + step.y]);
    const result = this.shaped(moveBoxHandle(this.box, id, lngLatOf(target)), id);
    if (result.ok) {
      this.box = result.bbox;
      this.setOverlay("o-box", boxData(result.bbox));
      this.placeBoxHandles(result.bbox);
      this.keepInView(target);
    }
    this.emit("box", result);
  }

  private updateDraw(position: LatLon): void {
    if (!this.drawStart) return;
    const result = boxFromCorners(this.drawStart, position);
    this.setOverlay("o-box", result.ok ? boxData(result.bbox) : EMPTY);
  }

  private finishDraw(position: LatLon): void {
    if (!this.drawStart) return;
    const start = this.drawStart;
    this.drawStart = undefined;
    const result = boxFromCorners(start, position);
    if (!result.ok) this.setOverlay("o-box", boxData(this.box));
    this.emit("box", result);
  }

  destroy(): void {
    this.destroyed = true;
    this.abort.abort();
    this.cancelLongPress();
    window.removeEventListener("mouseup", this.releaseHandle);
    this.cancelPlaceHold();
    window.removeEventListener("mouseup", this.releasePlace);
    this.listeners.clear();
    this.pin?.remove();
    for (const handle of this.boxHandles.values()) handle.remove();
    // Removes every source, layer, listener and the WebGL context.
    this.map.remove();
  }
}
