/**
 * What the household book's repeaters need from this Outpost before the book is made: the
 * repeaters round every place (from Outpost's own list), the lists' names and dates, each
 * chosen repeater's typical range over the terrain installed (`/api/maps/sight-range`,
 * worked out on this Outpost from the heights installed), and the offline map under each
 * place's repeaters. Every request goes to this Outpost; none goes to the internet.
 */
import {
  type InstalledRegion,
  type MapSources,
  RANGE_DEFAULT_AERIAL_METERS,
  type RepeaterDto,
  type RepeaterListResponse,
  type RepeatersOverview,
  type SightRange,
  typicalRangeMeters,
} from "@outpost/shared";
import { creditsFor } from "@/features/maps/map-footer";
import { mapCoverage } from "@/features/maps/print/coverage";
import { printedCredits } from "@/features/maps/print/credits";
import { GET_A_MAP } from "@/features/nuclear/print-figures";
import { api } from "@/lib/api";
import {
  type BookRepeaterRange,
  HANDHELD_METERS,
  horizonRange,
  mappedGroups,
  type RepeaterGroup,
  type RepeaterLocation,
  repeaterMapFrame,
  repeaterQueries,
} from "./book-repeaters";
import type { BookRepeaterMap } from "./repeater-figure";

/** The most ranges worked out over terrain for one book: each is a viewshed on this Outpost, a second or so apiece. */
const RANGES_MOST = 30;

/** Every repeater the list holds round the places, once each. Null when the list could not be read. */
export async function gatherRepeaters(
  locations: readonly RepeaterLocation[],
): Promise<{ repeaters: RepeaterDto[]; lists: RepeatersOverview["lists"] } | null> {
  try {
    const seen = new Map<string, RepeaterDto>();
    for (const query of repeaterQueries(locations)) {
      const list = await api.get<RepeaterListResponse>("/api/repeaters", {
        near: `${query.lat},${query.lon}`,
        withinKm: query.withinKm,
        hideOffAir: "1",
        limit: 60,
      });
      for (const repeater of list.repeaters) seen.set(repeater.id, repeater);
    }
    const overview = await api.get<RepeatersOverview>("/api/repeaters/overview").catch(() => null);
    return { repeaters: [...seen.values()], lists: overview?.lists ?? [] };
  } catch {
    return null;
  }
}

/** Each chosen repeater's typical range from the terrain installed; one with no terrain under it, or none in sight, is left to its radio horizon. */
export async function gatherRanges(groups: readonly RepeaterGroup[]): Promise<Record<string, BookRepeaterRange>> {
  const ranges: Record<string, BookRepeaterRange> = {};
  const chosen = groups.flatMap((group) => group.chosen.map((each) => each.repeater)).slice(0, RANGES_MOST);
  for (const repeater of chosen) {
    const aerial = repeater.antennaMeters ?? RANGE_DEFAULT_AERIAL_METERS;
    try {
      const range = await api.get<SightRange>("/api/maps/sight-range", {
        at: `${repeater.lat},${repeater.lon}`,
        aerial: String(aerial),
        station: String(HANDHELD_METERS),
      });
      if (range.coverage === "none" || range.bearings.length === 0) continue;
      const typical = range.typicalMeters ?? typicalRangeMeters(range.bearings);
      if (typical && typical > 0) ranges[repeater.id] = { ...horizonRange(repeater), meters: typical, basis: "terrain" };
    } catch {
      // Left to its radio horizon.
    }
  }
  return ranges;
}

/** The offline map under each place's repeaters, at the frame the book draws it in. */
export async function gatherMaps(
  groups: readonly RepeaterGroup[],
  input: { sources: MapSources | undefined; regions: InstalledRegion[]; cacheKey: string; origin: string },
  measure: number,
): Promise<{ maps: Record<string, BookRepeaterMap>; missing: string | null }> {
  const maps: Record<string, BookRepeaterMap> = {};
  const hasTiles = input.sources?.hasTiles ?? false;
  if (!hasTiles)
    return { maps, missing: `No offline map is installed, so the places and repeaters are drawn to scale on a plain grid. ${GET_A_MAP}` };
  const { drawWithMapLibre, placesStyle } = await import("@/features/household-papers/binder-map");
  const attributions = input.sources?.attributions ?? [];
  const credits = printedCredits(creditsFor(attributions, { hasTiles, terrain: false }), attributions);
  let missing: string | null = null;
  for (const group of mappedGroups(groups)) {
    const { bbox, size, frame } = repeaterMapFrame(group, measure);
    if (mapCoverage(bbox, input.regions, frame.zoom).none > 0.995) {
      missing = `No offline map region covers some of these places, so they are drawn on a plain grid. ${GET_A_MAP}`;
      continue;
    }
    try {
      const drawn = await drawWithMapLibre(placesStyle(input), frame, size.pixels);
      const scale = size.width / size.pixels.width;
      const pictures = new Map<string, string>();
      const pieces = drawn.pieces.map((piece, index) => {
        const id = `repeaters-${group.location.key}-${index + 1}`;
        pictures.set(id, `data:image/jpeg;base64,${base64Of(piece.jpeg)}`);
        return { id, x: piece.x * scale, y: piece.y * scale, width: piece.width * scale, height: piece.height * scale };
      });
      maps[group.location.key] = { pieces, pictures, credits };
    } catch {
      missing = "This device could not draw the offline map under some of these places, so they are drawn on a plain grid.";
    }
  }
  return { maps, missing };
}

function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
