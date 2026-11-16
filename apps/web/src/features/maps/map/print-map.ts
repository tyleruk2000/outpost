/**
 * The map a printed page is drawn from: a second MapLibre map that is never shown.
 *
 * It is given a style and asked for a view at a size and a resolution; it answers with
 * its canvas once that view is complete. "Complete" is MapLibre's own word for it: the
 * `idle` event comes only when every tile in view has arrived and been laid out (which
 * includes the glyphs and icons its names need), the sprite is in, every name has been
 * placed, and nothing is left to redraw. A tile that fails for any reason other than
 * not existing is an error here, never a hole in the print.
 *
 * Like the map on screen it reads only from Outpost's own origin, through the same tile
 * and contour protocols, which `engine.ts` registers when it is loaded.
 */
import "./engine";
import { Map as MapLibreMap } from "maplibre-gl";
import type { LatLon } from "../lib/geo";
import { countryLabelPoints, SOURCE_IDS } from "../lib/style";
import type { StyleSpecification } from "../lib/style-types";

export type PrintMapFailure =
  /** The browser took the graphics context away, as it does when memory runs short. */
  | "context-lost"
  /** The canvas came out at another size than asked for, or with nothing drawn on it: past what this device can make. */
  | "too-large"
  /** Part of the map could not be read. */
  | "load-error"
  | "timeout"
  /** The person stopped it. */
  | "stopped";

export class PrintMapError extends Error {
  readonly failure: PrintMapFailure;
  constructor(failure: PrintMapFailure, message: string) {
    super(message);
    this.name = "PrintMapError";
    this.failure = failure;
  }
}

export interface PrintView {
  center: LatLon;
  zoom: number;
  /** The size of the picture, in the map's own pixels. */
  width: number;
  height: number;
  /** Device pixels drawn to each of those. */
  pixelRatio: number;
}

/** A view of a region with many tiles on a slow disk takes a while; past this something is stuck. */
const TIMEOUT_MS = 120_000;

let countryLabels: Promise<unknown> | undefined;
/** The names of countries for the outline map, read once. Without them the outline still draws. */
function loadCountryLabels(): Promise<unknown> {
  countryLabels ??= fetch("/world/countries.json")
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => (json ? countryLabelPoints(json as { features: unknown[] }) : null))
    .catch(() => null);
  return countryLabels;
}

/** The style with the countries' names put into the source that waits for them (the map on screen fills it in afterwards). */
function withCountryLabels(style: StyleSpecification, labels: unknown): StyleSpecification {
  const source = style.sources[SOURCE_IDS.countryLabels];
  if (!labels || !source || source.type !== "geojson") return style;
  return { ...style, sources: { ...style.sources, [SOURCE_IDS.countryLabels]: { ...source, data: labels as never } } };
}

export class PrintMap {
  private readonly host: HTMLDivElement;
  private readonly map: MapLibreMap;
  private loadErrors: string[] = [];
  private contextLost = false;
  private fail: ((error: PrintMapError) => void) | undefined;
  private readonly labels: unknown;

  /** `maxSide` is the longest canvas side that will be asked for; MapLibre silently draws smaller past its own default. */
  static async create(style: StyleSpecification, first: PrintView, maxSide: number): Promise<PrintMap> {
    return new PrintMap(style, first, maxSide, await loadCountryLabels());
  }

  private constructor(style: StyleSpecification, first: PrintView, maxSide: number, labels: unknown) {
    this.labels = labels;
    this.host = document.createElement("div");
    // Laid out at its real size, since the canvas takes its size from it, but out of sight and out of the way.
    Object.assign(this.host.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: `${first.width}px`,
      height: `${first.height}px`,
      visibility: "hidden",
      pointerEvents: "none",
      zIndex: "-1",
      contain: "strict",
    });
    this.host.setAttribute("aria-hidden", "true");
    this.host.dataset.printMap = "";
    document.body.append(this.host);
    try {
      this.map = new MapLibreMap({
        container: this.host,
        style: withCountryLabels(style, labels),
        center: [first.center.lon, first.center.lat],
        zoom: first.zoom,
        pixelRatio: first.pixelRatio,
        maxCanvasSize: [maxSide, maxSide],
        interactive: false,
        attributionControl: false,
        maplibreLogo: false,
        maxPitch: 0,
        maxZoom: 22,
        trackResize: false,
        refreshExpiredTiles: false,
        // Names appear at once, fully drawn, instead of fading in over frames that would have to be waited out.
        fadeDuration: 0,
        // The picture is read back after the frame that drew it has been shown.
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } catch (error) {
      this.host.remove();
      throw new PrintMapError("too-large", error instanceof Error ? error.message : "The map for the page could not be started.");
    }
    this.map.on("error", (event) => {
      const error = event.error as { message?: string; status?: number } | undefined;
      // A tile that does not exist is how the edge of a region is found; the map draws the coarser one instead.
      if (error?.status === 404) return;
      this.loadErrors.push(error?.message ?? "Part of the map could not be loaded.");
    });
    this.map.getCanvas().addEventListener("webglcontextlost", () => {
      this.contextLost = true;
      this.fail?.(new PrintMapError("context-lost", "This device ran out of room to draw the page."));
    });
  }

  /** Changes what is drawn. The view is kept; the next `draw` waits for the new style to be complete. */
  setStyle(style: StyleSpecification): void {
    this.map.setStyle(withCountryLabels(style, this.labels), { diff: true });
  }

  /**
   * Draws a view and resolves with the canvas holding it, complete. The canvas is the
   * map's own and is drawn over by the next call, so it must be read before then.
   */
  async draw(view: PrintView, signal?: AbortSignal): Promise<HTMLCanvasElement> {
    if (this.contextLost) throw new PrintMapError("context-lost", "This device ran out of room to draw the page.");
    this.loadErrors = [];
    this.host.style.width = `${view.width}px`;
    this.host.style.height = `${view.height}px`;
    if (this.map.getPixelRatio() !== view.pixelRatio) this.map.setPixelRatio(view.pixelRatio);
    this.map.resize();
    this.map.jumpTo({ center: [view.center.lon, view.center.lat], zoom: view.zoom });
    await this.complete(signal);

    const canvas = this.map.getCanvas();
    const [width, height] = [Math.round(view.width * view.pixelRatio), Math.round(view.height * view.pixelRatio)];
    if (canvas.width !== width || canvas.height !== height) {
      throw new PrintMapError("too-large", `The page needs a picture ${width} × ${height} pixels, which this device cannot draw.`);
    }
    if (this.loadErrors.length > 0) {
      throw new PrintMapError(
        "load-error",
        "Part of the map could not be read, so the page was not made. If the map's files are on an external drive, check that it is connected, then try again.",
      );
    }
    return canvas;
  }

  /** Resolves once the view asked for is fully loaded, laid out and drawn. */
  private complete(signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      const { map } = this;
      let timer = 0;
      const done = (error?: PrintMapError) => {
        window.clearTimeout(timer);
        map.off("idle", onIdle);
        signal?.removeEventListener("abort", onAbort);
        this.fail = undefined;
        if (error) reject(error);
        else resolve();
      };
      const onIdle = () => {
        // `idle` already means all of this; asked again so that a change in MapLibre cannot quietly weaken it.
        if (map.loaded() && map.areTilesLoaded() && !map.isMoving()) done();
        else map.triggerRepaint();
      };
      const onAbort = () => done(new PrintMapError("stopped", "Stopped."));
      if (signal?.aborted) return onAbort();
      this.fail = done;
      map.on("idle", onIdle);
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = window.setTimeout(
        () =>
          done(
            new PrintMapError("timeout", "Drawing the map took too long. Keep this tab in front while the page is drawn, then try again."),
          ),
        TIMEOUT_MS,
      );
      // Nothing may have changed since the last view (the same page drawn again): ask for a frame so that `idle` comes.
      map.triggerRepaint();
    });
  }

  destroy(): void {
    this.fail?.(new PrintMapError("stopped", "Stopped."));
    // Frees the graphics context now instead of when the browser gets round to it; phones count every canvas against a page.
    this.map.remove();
    this.host.remove();
  }
}
