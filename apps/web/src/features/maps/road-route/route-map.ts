/**
 * The route card's overview map: the whole route on the offline map drawn again off
 * screen for paper (the same off-screen map as the household book's), with the route's
 * main roads drawn bold over it, the crossing dashed, and the start, via points and end
 * marked. Where no installed map covers the ground it is the plain map of coastlines and
 * borders; where this device cannot draw a map at all, the route in an empty frame.
 *
 * Nothing is fetched from anywhere. What is installed is read before drawing
 * (`RouteMapInput`), as the household book does, so a card made before the list of
 * installed maps had loaded does not leave the map out.
 */
import type { Bbox, InstalledRegion, MapSources, RoadRouteResult } from "@outpost/shared";
import { drawWithMapLibre } from "@/features/household-papers/binder-map";
import { FALLBACK_THEME } from "@/features/maps/lib/palette";
import { buildStyle } from "@/features/maps/lib/style";
import { creditsFor } from "@/features/maps/map-footer";
import { mapCoverage } from "@/features/maps/print/coverage";
import { printedCredits } from "@/features/maps/print/credits";
import type { Frame } from "@/features/maps/print/scale";
import { mercatorX, mercatorY } from "@/features/maps/print/scale";
import { type MapFigure, mapFigureBlock } from "@/features/nuclear/print-figures";
import { frameFor, pictureSize } from "@/features/nuclear/print-frames";
import type { DrawMap } from "@/features/nuclear/print-maps";
import { PRINT_COLOURS as C, escapeSvg, PRINT_FONT, type PrintPaper, round, sheetItemsToSvg } from "@/features/print-kit";
import { measureOf } from "@/features/print-kit/tokens";
import { errorMessage } from "@/lib/api";
import { legLines, routeBounds } from "./words";

/** What the map is drawn from: what is installed, as the Maps screen reads it. */
export interface RouteMapInput {
  sources: MapSources | undefined;
  regions: InstalledRegion[];
  cacheKey: string;
  origin: string;
}

export interface RouteMap {
  /** The whole figure (picture, frame, scale, north, captions and the route over it) as SVG. */
  svg: string;
  width: number;
  /** Why no detailed map is under the route, when there is none. */
  missing: string | null;
}

const MAX_HEIGHT = 440;

/** The ground the map shows: the whole route with a margin round it. */
export function routeMapBbox(route: RoadRouteResult): Bbox {
  const [west, south, east, north] = routeBounds(route);
  const padLat = Math.max((north - south) * 0.08, 0.05);
  const padLon = Math.max((east - west) * 0.08, 0.05);
  return [west - padLon, Math.max(-85, south - padLat), east + padLon, Math.min(85, north + padLat)];
}

/** Where a point lies in a figure `size` points across, drawn at `frame`. */
function placer(frame: Frame, size: { width: number; height: number }, ptPerPx: number) {
  const world = 512 * 2 ** frame.zoom * ptPerPx;
  return ([lon, lat]: [number, number]): [number, number] => [
    size.width / 2 + (mercatorX(lon) - mercatorX(frame.center.lon)) * world,
    size.height / 2 + (mercatorY(lat) - mercatorY(frame.center.lat)) * world,
  ];
}

/** The route over the picture: a white casing, the road bold in ink, the crossing dashed, and the points. */
export function routeOverlay(
  route: RoadRouteResult,
  place: (at: [number, number]) => [number, number],
  width = Number.POSITIVE_INFINITY,
): string {
  const parts = legLines(route);
  const path = (line: Array<[number, number]>) =>
    line.map((at, index) => `${index === 0 ? "M" : "L"}${place(at).map(round).join(",")}`).join(" ");
  const roads: string[] = [];
  const crossings: string[] = [];
  route.legs.forEach((leg, index) => {
    for (const line of parts[index] ?? []) (leg.kind === "crossing" ? crossings : roads).push(path(line));
  });
  const out: string[] = [];
  const all = [...roads, ...crossings].join(" ");
  if (all) out.push(`<path d="${all}" fill="none" stroke="${C.paper}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (roads.length > 0)
    out.push(
      `<path d="${roads.join(" ")}" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  if (crossings.length > 0)
    out.push(`<path d="${crossings.join(" ")}" fill="none" stroke="${C.accent}" stroke-width="2.6" stroke-dasharray="5 3"/>`);
  // Words on a pale ground of their own, so they read over any map; to the left of their mark near the right edge.
  const label = (x: number, y: number, words: string) => {
    const across = words.length * 4.4 + 3;
    const left = x + across > width - 4;
    const at = left ? x - 16 - across : x;
    return (
      `<rect x="${round(at - 1.5)}" y="${round(y - 8)}" width="${round(across)}" height="10.5" fill="${C.paper}" fill-opacity="0.85"/>` +
      `<text x="${round(at)}" y="${round(y)}" font-family="${PRINT_FONT}" font-size="8" font-weight="bold" fill="${C.ink}">${escapeSvg(words)}</text>`
    );
  };
  // The crossing: a square at the middle of its line, named.
  route.legs.forEach((leg, index) => {
    if (leg.kind !== "crossing") return;
    const line = parts[index]?.flat() ?? [leg.start, leg.end];
    const [x, y] = place(line[Math.floor(line.length / 2)] ?? leg.start);
    const name = leg.crossing?.kind === "shuttle" ? "Eurotunnel" : leg.crossing?.name ? `Ferry: ${leg.crossing.name}` : "Ferry";
    out.push(
      `<rect x="${round(x - 4)}" y="${round(y - 4)}" width="8" height="8" fill="${C.accent}" stroke="${C.paper}" stroke-width="1.2"/>`,
    );
    out.push(label(x + 7, y + 3, name));
  });
  // The points: start and end solid, via points open with their number.
  const last = route.snapped.length - 1;
  route.snapped.forEach((point, index) => {
    const [x, y] = place([point.input.lon, point.input.lat]);
    const via = index > 0 && index < last;
    out.push(
      `<circle cx="${round(x)}" cy="${round(y)}" r="5" fill="${via ? C.paper : C.ink}" stroke="${via ? C.ink : C.paper}" stroke-width="1.6"/>`,
    );
    const name = point.input.name ?? (index === 0 ? "Start" : index === last ? "End" : `Via ${index}`);
    const words = index === 0 ? `Start: ${name}` : index === last ? `End: ${name}` : `Via ${index}: ${name}`;
    out.push(label(x + 8, y + 3, words));
  });
  return `<g>${out.join("")}</g>`;
}

/**
 * The overview map for the card, `paper`'s measure wide. `draw` is the off-screen map in
 * the browser; tests give their own.
 */
export async function routeOverviewMap(
  route: RoadRouteResult,
  input: RouteMapInput,
  paper: PrintPaper,
  options: { draw?: DrawMap; signal?: AbortSignal } = {},
): Promise<RouteMap> {
  const inner = measureOf(paper);
  const bbox = routeMapBbox(route);
  const size = pictureSize(bbox, inner, MAX_HEIGHT);
  const frame = frameFor(bbox, size.pixels);
  const attributions = input.sources?.attributions ?? [];
  const hasTiles = input.sources?.hasTiles ?? false;
  const covered = mapCoverage(bbox, input.regions, frame.zoom);
  const detailed = hasTiles && covered.none < 0.995;
  const pictures = new Map<string, string>();
  const figure: MapFigure = { part: "overview", width: size.width, height: size.height, frame, pieces: [], captions: [] };
  let missing: string | null = detailed ? null : "No offline map region covers this route, so the map shows only coastlines and borders.";
  try {
    // With no region under the route, the plain map: land, sea and borders, which every Outpost has.
    const style = buildStyle({
      sources: detailed ? input.sources : undefined,
      flavour: "light",
      theme: FALLBACK_THEME.light,
      hillshade: false,
      contours: false,
      origin: input.origin,
      cacheKey: input.cacheKey,
    });
    const drawn = await (options.draw ?? drawWithMapLibre)(style, frame, size.pixels, options.signal);
    const scale = size.width / size.pixels.width;
    drawn.pieces.forEach((piece, index) => {
      const id = `route-map-${index + 1}`;
      pictures.set(id, `data:image/jpeg;base64,${base64Of(piece.jpeg)}`);
      figure.pieces.push({ id, x: piece.x * scale, y: piece.y * scale, width: piece.width * scale, height: piece.height * scale });
    });
    if (detailed) {
      figure.captions.push(printedCredits(creditsFor(attributions, { hasTiles, terrain: false }), attributions));
      if (covered.none >= 0.02)
        figure.captions.push(
          `About ${Math.max(1, Math.round(covered.none * 100))}% of this map's area has no offline map installed and shows only coastlines and borders.`,
        );
    } else figure.captions.push("Coastlines and borders: Natural Earth.");
  } catch (error) {
    if (options.signal?.aborted) throw error;
    missing = `No map under the route: this device could not draw it (${errorMessage(error).replace(/\.$/, "")}).`;
  }
  figure.captions.push(
    `${missing ? `${missing} ` : ""}Bold: the main roads of the route. Dashed: the crossing. Not a map to drive by: follow the signs.`,
  );
  const block = mapFigureBlock(figure, inner);
  if (block.kind !== "drawing") throw new Error("The overview map could not be laid out.");
  const items = block.draw(0, 0, inner);
  const svg = sheetItemsToSvg(items, { x: 0, y: 0, width: inner, height: block.height }, pictures);
  const overlay = routeOverlay(route, placer(frame, size, size.width / size.pixels.width), size.width);
  // The route goes over the picture, inside the frame: clipped to it, so a label at the edge does not run over the scale.
  const clip = `<clipPath id="route-frame"><rect x="0" y="0" width="${round(size.width)}" height="${round(size.height)}"/></clipPath>`;
  return {
    svg: svg.replace(/<\/svg>$/, `<defs>${clip}</defs><g clip-path="url(#route-frame)">${overlay}</g></svg>`),
    width: inner,
    missing,
  };
}

function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
