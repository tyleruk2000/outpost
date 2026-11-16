/**
 * Measuring a box of the installed map, for a phone that wants to keep it.
 *
 * A browser can keep map tiles of its own so that the map still draws when the phone
 * cannot reach this server (see docs/offline.md). Before it fetches anything it asks
 * here how much that would be. The answer is read from the directories of the
 * installed archives, tile by tile, exactly as a tile request would be answered, so
 * the number of bytes is the real one and nothing is read from the tile data itself.
 */
import {
  type Bbox,
  countRectTiles,
  MAX_KEPT_AREA_TILES,
  type MapAreaLayerSize,
  type MapAreaSize,
  type MapTileType,
  tileRects,
} from "@outpost/shared";
import { z } from "zod";
import { AppError } from "../../core/errors.ts";
import { bboxSchema } from "./regions.ts";
import type { TileServer } from "./tile-server.ts";

const flag = z
  .enum(["1", "0", "true", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");

/** The query of `GET /api/maps/area-size`: `bbox=west,south,east,north&maxZoom=14&terrain=1`. */
export const areaSizeQuery = z.object({
  bbox: z
    .string()
    .max(120)
    .transform((text) => text.split(",").map(Number))
    .pipe(bboxSchema),
  maxZoom: z.coerce.number().int().min(0).max(20),
  terrain: flag,
});

export function createAreaMeter(tiles: TileServer) {
  async function measure(tileType: MapTileType, bbox: Bbox, wanted: number): Promise<MapAreaLayerSize | null> {
    const source = tiles.sources().sources[tileType === "vector" ? "basemap" : "terrain"];
    if (!source) return null;
    const maxZoom = Math.min(wanted, source.maxzoom);
    const minZoom = Math.min(source.minzoom, maxZoom);
    const rects = tileRects(bbox, minZoom, maxZoom);
    if (countRectTiles(rects) > MAX_KEPT_AREA_TILES) {
      throw new AppError(
        "too_large",
        `That area is too large to keep at this detail: it is more than ${MAX_KEPT_AREA_TILES.toLocaleString("en-GB")} map tiles. Zoom in to a smaller area, or choose less detail.`,
      );
    }
    let count = 0;
    let bytes = 0;
    for (const rect of rects) {
      for (let x = rect.minX; x <= rect.maxX; x += 1) {
        for (let y = rect.minY; y <= rect.maxY; y += 1) {
          const length = await tiles.tileLength(tileType, rect.z, x, y);
          if (length === undefined) continue;
          count += 1;
          bytes += length;
        }
      }
    }
    return { tiles: count, bytes, minZoom, maxZoom };
  }

  return {
    async size(input: z.infer<typeof areaSizeQuery>): Promise<MapAreaSize> {
      const map = await measure("vector", input.bbox, input.maxZoom);
      const terrain = input.terrain ? await measure("terrain", input.bbox, input.maxZoom) : null;
      return {
        bbox: input.bbox,
        map,
        terrain,
        totalTiles: (map?.tiles ?? 0) + (terrain?.tiles ?? 0),
        totalBytes: (map?.bytes ?? 0) + (terrain?.bytes ?? 0),
      };
    },
  };
}
