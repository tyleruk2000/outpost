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
import { type BoxResult, boxFromCorners, type LatLon, wrapLongitude } from "../lib/geo";
import { buildStyle, countryLabelPoints, SOURCE_IDS, type StyleInput } from "../lib/style";
import { createTileLoader, TILE_PROTOCOL } from "../lib/tiles";
import type { CameraView } from "../lib/view";
import { boxData, EMPTY, type FeatureCollection, OVERLAY_LAYERS, type OverlaySource, overlayLayers, overlaySources } from "./overlays";

setWorkerUrl(workerUrl);
addProtocol(
  TILE_PROTOCOL,
  createTileLoader(
    (input, init) => fetch(input, init),
    (url) => new AJAXError(404, "No tile here", url, new Blob()),
  ),
);

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
  /** Right-click or long press. */
  context: { position: LatLon; point: { x: number; y: number } };
  /** True while the map is turned away from north. */
  rotated: boolean;
  /** The pin of the place being edited was dropped somewhere new. */
  pindrag: LatLon;
  /** The download box was drawn or one of its corners moved. */
  box: BoxResult;
  /** A map tile or data file could not be loaded. */
  loaderror: string;
  idle: undefined;
}

type Listener<K extends keyof MapEvents> = (payload: MapEvents[K]) => void;

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
  private boxHandles: Marker[] = [];
  private box: Bbox | null = null;
  private drawStart: LatLon | undefined;
  private drawing = false;
  private rotated = false;
  private longPress: number | undefined;
  private lastContextAt = 0;
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
      this.emit("pointer", lngLatOf(event.lngLat));
    });
    map.on("mouseout", () => this.emit("pointer", null));

    map.on("click", (event) => {
      if (this.drawing) return;
      this.emit("click", {
        position: lngLatOf(event.lngLat),
        point: { x: event.point.x, y: event.point.y },
        hit: this.hitTest(event.point.x, event.point.y, 6),
      });
    });
    map.on("contextmenu", (event) => {
      event.preventDefault();
      this.emitContext(lngLatOf(event.lngLat), event.point);
    });

    // Drawing the download box: press, drag, release. Panning is switched off while the tool is armed.
    map.on("mousedown", (event: MapMouseEvent) => {
      if (!this.drawing || event.originalEvent.button !== 0) return;
      event.preventDefault();
      this.drawStart = lngLatOf(event.lngLat);
    });
    map.on("mouseup", (event) => this.finishDraw(lngLatOf(event.lngLat)));

    map.on("touchstart", (event: MapTouchEvent) => {
      this.cancelLongPress();
      if (event.points.length !== 1) return;
      if (this.drawing) {
        event.preventDefault();
        this.drawStart = lngLatOf(event.lngLat);
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
    });
    map.on("touchend", (event) => {
      this.cancelLongPress();
      this.finishDraw(lngLatOf(event.lngLat));
    });
    map.on("touchcancel", () => {
      this.cancelLongPress();
      this.drawStart = undefined;
    });

    // The canvas hears the keyboard; MapLibre's handler pans and zooms from it.
    map.getCanvas().setAttribute("aria-label", "Map. Arrow keys pan, plus and minus zoom.");
  }

  private emitContext(position: LatLon, point: { x: number; y: number }): void {
    // Android fires both our timed long press and its own contextmenu; act once.
    const now = Date.now();
    if (now - this.lastContextAt < 900 || this.drawing) return;
    this.lastContextAt = now;
    this.emit("context", { position, point: { x: point.x, y: point.y } });
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
    this.map.getCanvas().style.cursor = cursor;
  }

  // ── The pin: a search result, a place about to be saved, or the place being edited ──

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
    if (this.pinState?.draggable !== state.draggable) this.pin.setDraggable(state.draggable);
    const current = this.pinState?.position;
    if (!current || current.lat !== state.position.lat || current.lon !== state.position.lon)
      this.pin.setLngLat([state.position.lon, state.position.lat]);
    this.pinState = state;
  }

  // ── The download box ──

  /** Arms or disarms drawing: while armed, a drag on the map draws a box instead of panning. */
  setDrawing(drawing: boolean): void {
    this.drawing = drawing;
    this.drawStart = undefined;
    if (drawing) this.map.dragPan.disable();
    else this.map.dragPan.enable();
    this.setCursor(drawing ? "crosshair" : "");
  }

  /** Shows a box; with `handles`, its corners can be dragged to adjust it. */
  setBox(bbox: Bbox | null, handles: boolean): void {
    this.box = bbox;
    this.setOverlay("o-box", boxData(bbox));
    if (!bbox || !handles) {
      for (const handle of this.boxHandles) handle.remove();
      this.boxHandles = [];
      return;
    }
    const corners: Array<[number, number]> = [
      [bbox[0], bbox[3]],
      [bbox[2], bbox[3]],
      [bbox[2], bbox[1]],
      [bbox[0], bbox[1]],
    ];
    if (this.boxHandles.length === 0) {
      const names = ["North-west", "North-east", "South-east", "South-west"];
      this.boxHandles = corners.map((corner, index) => {
        const element = document.createElement("div");
        element.className = "outpost-box-handle";
        element.setAttribute("aria-label", `${names[index]} corner of the box. Drag to adjust.`);
        const handle = new Marker({ element, draggable: true }).setLngLat(corner).addTo(this.map);
        const opposite = () => this.boxHandles[(index + 2) % 4]!.getLngLat();
        handle.on("drag", () => {
          const result = boxFromCorners(lngLatOf(handle.getLngLat()), lngLatOf(opposite()));
          if (result.ok) this.setOverlay("o-box", boxData(result.bbox));
        });
        handle.on("dragend", () => this.emit("box", boxFromCorners(lngLatOf(handle.getLngLat()), lngLatOf(opposite()))));
        return handle;
      });
    } else {
      for (const [index, handle] of this.boxHandles.entries()) handle.setLngLat(corners[index]!);
    }
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
    this.listeners.clear();
    this.pin?.remove();
    for (const handle of this.boxHandles) handle.remove();
    // Removes every source, layer, listener and the WebGL context.
    this.map.remove();
  }
}
