/**
 * A journey drawn for the book: the straight line from home to the place the household
 * would go to, each night's stop numbered along it, and the towns of the reference layers
 * near it, with north and a scale. Not a map: a drawing to hold beside a map, which says
 * what it is. Laid out on a plane round the middle of the line (east and north in
 * kilometres), which is near enough true for the few hundred kilometres a walk can be.
 */
import type { BookJourney, BookStop } from "@outpost/shared";
import { INK, MUTED, type Rgb, type SheetItem } from "@/features/maps/print/sheet";

const DEG = Math.PI / 180;
const EARTH_KM = 6371.0088;
const LINE: Rgb = [0.16, 0.32, 0.78];
const FAINT: Rgb = [0.75, 0.78, 0.79];
const NICE_KM = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export function routeDrawing(
  route: { home: { name: string; lat: number; lon: number }; journey: BookJourney; stops: BookStop[] },
  frame: { x: number; y: number; width: number; height: number },
): SheetItem[] {
  const { home, journey, stops } = route;
  const midLat = (home.lat + journey.lat) / 2;
  const midLon = (home.lon + journey.lon) / 2;
  const toKm = (lat: number, lon: number) => ({
    x: (lon - midLon) * DEG * EARTH_KM * Math.cos(midLat * DEG),
    y: (lat - midLat) * DEG * EARTH_KM,
  });
  const points = [toKm(home.lat, home.lon), toKm(journey.lat, journey.lon), ...stops.map((stop) => toKm(stop.lat, stop.lon))];
  const towns = journey.towns.map((town) => ({ ...town, at: toKm(town.lat, town.lon) }));
  const all = [...points, ...towns.map((town) => town.at)];
  const minX = Math.min(...all.map((point) => point.x));
  const maxX = Math.max(...all.map((point) => point.x));
  const minY = Math.min(...all.map((point) => point.y));
  const maxY = Math.max(...all.map((point) => point.y));
  const pad = 28;
  const spanX = Math.max(maxX - minX, 0.5);
  const spanY = Math.max(maxY - minY, 0.5);
  const scale = Math.min((frame.width - 2 * pad) / spanX, (frame.height - 2 * pad - 18) / spanY);
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + (frame.height - 18) / 2;
  const at = (point: { x: number; y: number }) => ({
    x: cx + (point.x - (minX + maxX) / 2) * scale,
    y: cy - (point.y - (minY + maxY) / 2) * scale,
  });

  const items: SheetItem[] = [
    { kind: "rect", x: frame.x, y: frame.y, width: frame.width, height: frame.height, stroke: FAINT, lineWidth: 0.6 },
  ];
  for (const town of towns) {
    const p = at(town.at);
    items.push(
      { kind: "rect", x: p.x - 1.5, y: p.y - 1.5, width: 3, height: 3, fill: MUTED },
      { kind: "text", x: p.x + 4, y: p.y - 4, text: town.name, size: 7, color: MUTED },
    );
  }
  const start = at(points[0]!);
  const end = at(points[1]!);
  items.push({ kind: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y, color: LINE, width: 1.6 });
  for (const [index, stop] of stops.entries()) {
    const p = at(points[index + 2]!);
    items.push(
      { kind: "rect", x: p.x - 6, y: p.y - 6, width: 12, height: 12, fill: [1, 1, 1], stroke: LINE, lineWidth: 1 },
      { kind: "text", x: p.x, y: p.y + 3, text: String(stop.day), size: 7, bold: true, color: INK, anchor: "middle" },
    );
  }
  items.push(
    { kind: "rect", x: start.x - 4, y: start.y - 4, width: 8, height: 8, fill: INK },
    { kind: "text", x: start.x + 7, y: start.y - 6, text: home.name || "Home", size: 9, bold: true, color: INK },
    { kind: "rect", x: end.x - 4, y: end.y - 4, width: 8, height: 8, fill: LINE },
    { kind: "text", x: end.x + 7, y: end.y - 6, text: journey.name, size: 9, bold: true, color: INK },
  );

  // North, at the top right.
  const nx = frame.x + frame.width - 16;
  const ny = frame.y + 12;
  items.push(
    { kind: "line", x1: nx, y1: ny + 20, x2: nx, y2: ny + 4, color: INK, width: 1 },
    {
      kind: "polygon",
      points: [
        [nx, ny],
        [nx - 3.5, ny + 7],
        [nx + 3.5, ny + 7],
      ],
      fill: INK,
    },
    { kind: "text", x: nx, y: ny + 31, text: "N", size: 8, bold: true, color: INK, anchor: "middle" },
  );

  // A scale bar about a quarter of the frame wide, at the foot.
  const wanted = frame.width / 4 / scale;
  const km = [...NICE_KM].reverse().find((value) => value <= wanted) ?? NICE_KM[0]!;
  const length = km * scale;
  const sx = frame.x + 10;
  const sy = frame.y + frame.height - 12;
  items.push(
    { kind: "line", x1: sx, y1: sy, x2: sx + length, y2: sy, color: INK, width: 1.2 },
    { kind: "line", x1: sx, y1: sy - 3, x2: sx, y2: sy + 1, color: INK, width: 1 },
    { kind: "line", x1: sx + length, y1: sy - 3, x2: sx + length, y2: sy + 1, color: INK, width: 1 },
    { kind: "text", x: sx + length + 5, y: sy + 3, text: `${km} km`, size: 7, color: INK },
    {
      kind: "text",
      x: frame.x + frame.width - 10,
      y: sy + 3,
      text: "A straight line, not a road: a drawing to use with a map",
      size: 7,
      color: MUTED,
      anchor: "end",
    },
  );
  return items;
}
