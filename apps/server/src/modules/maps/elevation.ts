/**
 * Heights from the terrain that is installed.
 *
 * Terrain tiles are images whose colours are heights. The browser uses them for hill
 * shading; this reads the same tiles on the server to give a drawn route its heights, a
 * point its height and an aerial its estimated range. The reading itself is the shared
 * package's (`terrain-sampler.ts`), so that a phone out of reach reads its kept tiles to
 * the same answer; this file gives it the installed archives as the source of tiles.
 * Nothing is ever downloaded for this: where no terrain is installed, the answer is "not
 * known".
 */

import zlib from "node:zlib";
import { createTileSampler, type ElevationSampler, type HeightTile, terrariumHeights } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { decodePng } from "./terrain/png.ts";
import { decodeLosslessWebp } from "./terrain/webp-lossless.ts";
import type { ServedTile, TileServer } from "./tile-server.ts";

export type { ElevationSampler, GridHeights, SampledHeights } from "@outpost/shared";
export { terrainCellMeters, terrariumHeights } from "@outpost/shared";

/**
 * Decoded tiles kept from one request to the next: for the height at a single point,
 * asked again and again over the same few tiles as a pointer rests here and there, and
 * for an estimated range, which reads about 40 tiles (decoding them was most of its two
 * seconds on a Raspberry Pi), so that a range from a point nearby, or the relay planner's
 * second end, reads most of them from here. Each is about 1 MB at 512 px, so this is
 * about 48 MB at most. Kept by the archive that served them, so a tile from terrain that
 * has since been replaced is never read again.
 */
const KEPT_TILES = 48;

function decodeTile(tile: ServedTile): HeightTile | null {
  let data: Uint8Array = tile.data;
  if (tile.contentEncoding === "gzip") data = zlib.gunzipSync(tile.data);
  else if (tile.contentEncoding === "br") data = zlib.brotliDecompressSync(tile.data);
  else if (tile.contentEncoding) return null;
  if (tile.contentType === "image/webp") return terrariumHeights(decodeLosslessWebp(data));
  if (tile.contentType === "image/png") return terrariumHeights(decodePng(data));
  return null;
}

export function createElevationSampler(ctx: AppContext, tiles: TileServer): ElevationSampler {
  /** Tiles decoded by earlier requests, least recently used first, keyed by archive and tile. */
  const kept = new Map<string, HeightTile>();
  const decodeKept = (served: ServedTile, key: string): HeightTile | null => {
    const keptKey = `${served.etag}|${key}`;
    const found = kept.get(keptKey);
    if (found) {
      kept.delete(keptKey);
      kept.set(keptKey, found);
      return found;
    }
    const tile = decodeTile(served);
    if (tile) {
      kept.set(keptKey, tile);
      for (const oldest of kept.keys()) {
        if (kept.size <= KEPT_TILES) break;
        kept.delete(oldest);
      }
    }
    return tile;
  };
  return createTileSampler({
    terrain: () => tiles.sources().sources.terrain ?? null,
    async getTile(z, x, y) {
      const key = `${z}/${x}/${y}`;
      try {
        const served = await tiles.getTile("terrain", z, x, y);
        return served ? decodeKept(served, key) : null;
      } catch (error) {
        // A tile that cannot be read is a gap in the heights, not a failed request.
        ctx.log.warn({ err: error, tile: key }, "terrain tile could not be read for heights");
        return null;
      }
    },
    // Decoding a tile is tens of milliseconds of arithmetic: other requests get a turn between one tile and the next.
    pause: yieldToEventLoop,
  });
}
