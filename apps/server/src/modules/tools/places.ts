/**
 * Places: the household's saved places and every reference layer held, with where each
 * is and how far.
 *
 * Records are read through the layers' own store (`ctx.services.layers.store`): which
 * layers and kinds are held comes from its summary, a place's records from the same
 * spatial index the map's view asks, a name from the same full-text search, and a
 * record's address and source from the same record card. No layer is named here, so a
 * layer added later (shops, drinking water and pharmacies, say) is found with no change.
 * Saved places come from the map's annotations.
 */
import {
  MARKER_ICONS,
  type MarkerDto,
  plainWords,
  REFERENCE_LAYER_INFO,
  type ReferenceFeatureDetail,
  type ReferenceLayerId,
  type ReferencePoint,
  singular,
} from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { dayOf, defineTool, pageOf, type ToolAnswer, type ToolDefinition } from "./types.ts";
import { at4, distanceFrom, resolveNear, unknownPlace, type Where } from "./where.ts";

const GET_LAYERS = "Maps → Layers → Get reference data";

/** A layer's name as the map shows it; the id itself for a layer this file has not heard of. */
const layerLabel = (id: string) => (REFERENCE_LAYER_INFO as Record<string, { label: string } | undefined>)[id]?.label ?? id;

interface HeldKind {
  layer: ReferenceLayerId;
  kind: string;
  label: string;
  count: number;
}

/** Every kind of record held, layer by layer, from the store's own summary. */
function heldKinds(ctx: AppContext): HeldKind[] {
  return ctx.services.layers.store
    .summary(new Map())
    .flatMap((layer) => layer.kinds.map((kind) => ({ layer: layer.id, kind: kind.kind, label: kind.label, count: kind.count })));
}

/**
 * Words that mean much the same thing to someone asking. A kind asked for is first
 * looked for as given; only when no kind held matches it are the other words of its
 * group tried, so "supermarket" finds supermarkets and not every shop, and "grocery"
 * still finds them when no kind is called that.
 */
const GROUPS: string[][] = [
  ["supermarket", "grocery", "groceries", "grocer", "greengrocer", "convenience", "shop", "store", "corner shop", "food shop"],
  ["drinking water", "water point", "water tap", "tap", "fountain", "water", "spring"],
  ["pharmacy", "chemist", "drugstore", "medicine"],
  ["hospital", "a e", "accident and emergency", "emergency department"],
  ["doctor", "gp", "surgery", "clinic", "health centre"],
  ["police", "police station"],
  ["fire station", "fire"],
  ["ambulance", "ambulance station"],
  ["shelter", "fallout shelter", "bomb shelter", "bunker", "assembly point", "meeting point", "meeting", "rest centre"],
  ["airport", "airfield", "aerodrome", "heliport", "airstrip"],
  ["nuclear", "reactor", "nuclear power station"],
  ["town", "city", "village", "populated place", "settlement"],
  ["fuel", "petrol", "diesel", "petrol station", "filling station"],
];

/** Lower-case words, each made singular: "Supermarkets" and "supermarket" read alike. */
const wordsOf = (text: string) => plainWords(text).map(singular).join(" ");
const hasPhrase = (haystack: string, phrase: string) => phrase !== "" && ` ${haystack} `.includes(` ${phrase} `);

/** The phrases a kind asked for may be matched by: itself first, then its group's. */
function phrasesFor(kind: string): { own: string; others: string[] } {
  const own = wordsOf(kind);
  const others = GROUPS.filter((group) => group.some((word) => wordsOf(word) === own || hasPhrase(own, wordsOf(word))))
    .flat()
    .map(wordsOf);
  return { own, others: [...new Set(others)].filter((phrase) => phrase !== own) };
}

/** The kinds held that match what was asked for, and the saved places' icons that do. */
function matchKinds(kind: string, held: HeldKind[]): { kinds: HeldKind[]; icons: Set<string> } {
  const { own, others } = phrasesFor(kind);
  const text = (entry: HeldKind) => wordsOf(`${entry.label} ${entry.kind.replace(/^import:/, "").replace(/[=_:]/g, " ")}`);
  // A kind by its own name first ("fire station"), then a whole layer by its name ("food and supplies"), then the group's words.
  let kinds = held.filter((entry) => hasPhrase(text(entry), own));
  if (kinds.length === 0) kinds = held.filter((entry) => hasPhrase(wordsOf(layerLabel(entry.layer)), own));
  if (kinds.length === 0) kinds = held.filter((entry) => others.some((phrase) => hasPhrase(text(entry), phrase)));
  const icons = new Set<string>();
  for (const icon of MARKER_ICONS) {
    if (icon === "pin") continue;
    const name = wordsOf(icon.replace("-", " "));
    if (hasPhrase(name, own) || hasPhrase(own, name) || others.includes(name)) icons.add(icon);
  }
  return { kinds, icons };
}

/** What is held, in a line: "Hospitals (12), Airports and airfields (40)". */
function heldLine(held: HeldKind[]): string {
  const byLayer = new Map<string, number>();
  for (const entry of held) byLayer.set(entry.layer, (byLayer.get(entry.layer) ?? 0) + entry.count);
  if (byLayer.size === 0) return "No reference layers are held yet.";
  return `Layers held: ${[...byLayer].map(([layer, count]) => `${layerLabel(layer)} (${count})`).join(", ")}.`;
}

/** A box round a point, `km` each way. */
function boxAround(where: Where, km: number): [number, number, number, number] {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.max(0.05, Math.cos((where.lat * Math.PI) / 180)));
  return [
    Math.max(-180, where.lon - dLon),
    Math.max(-90, where.lat - dLat),
    Math.min(180, where.lon + dLon),
    Math.min(90, where.lat + dLat),
  ];
}

/** Records within `km` of a point through the map's own spatial index; null when there are more than the map would draw one by one. */
function recordsNear(ctx: AppContext, where: Where, km: number, layers: ReferenceLayerId[], kinds?: string[]): ReferencePoint[] | null {
  if (layers.length === 0) return [];
  const view = ctx.services.layers.store.overlay({ bbox: boxAround(where, km), zoom: 0, layers, ...(kinds ? { kinds } : {}) });
  if (view.cells.length > 0) return null;
  return view.points.filter((point) => distanceFrom(where, point).meters <= km * 1000);
}

type Found = { type: "saved"; marker: MarkerDto; meters: number | null } | { type: "record"; point: ReferencePoint; meters: number | null };

const ADDRESS_KEYS = [
  ["addr:housenumber", "addr:street"],
  ["addr:city", "addr:town", "town", "city"],
  ["addr:postcode", "postcode"],
  ["address"],
];

function addressOf(detail: ReferenceFeatureDetail | null): string {
  if (!detail) return "";
  const parts = ADDRESS_KEYS.map((keys) =>
    keys
      .map((key) => detail.props[key])
      .filter(Boolean)
      .join(keys[0] === "addr:housenumber" ? " " : ", "),
  ).filter(Boolean);
  return parts.join(", ");
}

/**
 * The lines for a page of what was found, with the records' details read from their
 * cards. Where every record shown came from the same pack, its source is said once at the
 * end rather than on every line: a model's context is small.
 */
function describe(ctx: AppContext, found: Found[], where: Where | null): { lines: string[]; layers: Set<string>; oldest: number | null } {
  const packs = ctx.services.layers.packTitles();
  const layers = new Set<string>();
  let oldest: number | null = null;
  const rows = found.map((item, index) => {
    const n = `${index + 1}.`;
    if (item.type === "saved") {
      const m = item.marker;
      const away = where ? `, ${distanceFrom(where, m).words}` : "";
      const note = m.note ? ` Note: ${m.note.replace(/\s+/g, " ").slice(0, 120)}` : "";
      return {
        line: `${n} ${m.name} (saved place${m.icon !== "pin" ? `, ${m.icon.replace("-", " ")}` : ""}) at ${at4(m.lat, m.lon)}${away}.${note}`,
        source: "saved on this Outpost",
      };
    }
    const detail = ctx.services.layers.store.detail(item.point.id, packs);
    const kind = detail?.kindLabel ?? item.point.kind;
    const address = addressOf(detail);
    const away = where ? `, ${distanceFrom(where, item.point).words}` : "";
    const layer = layerLabel(item.point.layer);
    layers.add(layer);
    let source = `${layer} layer`;
    if (detail) {
      const s = detail.source;
      oldest = oldest === null ? s.retrievedAt : Math.min(oldest, s.retrievedAt);
      source = `${layer} layer, ${s.publisher || s.providerName}${s.packTitle ? ` ("${s.packTitle}")` : ""}, fetched ${dayOf(s.retrievedAt)}`;
    }
    return {
      line: `${n} ${item.point.name || "(no name)"} (${kind}) at ${at4(item.point.lat, item.point.lon)}${address ? `, ${address}` : ""}${away}.`,
      source,
    };
  });
  const sources = new Set(rows.map((row) => row.source));
  const lines =
    sources.size === 1
      ? [...rows.map((row) => row.line), `From: ${[...sources][0]}.`]
      : rows.map((row) => `${row.line} From: ${row.source}.`);
  return { lines, layers, oldest };
}

function labelOf(layers: Set<string>, oldest: number | null, savedOnly: boolean): string | undefined {
  if (layers.size === 0) return savedOnly ? "saved places" : undefined;
  return `${[...layers].join(", ")}${oldest !== null ? `, fetched ${dayOf(oldest).replace(/ \d{4}$/, "")}` : ""}`;
}

const urlOf = (found: Found[]) => (found.length === 1 && found[0]!.type === "saved" ? `/maps?marker=${found[0]!.marker.id}` : "/maps");

const nearLine = (where: Where) =>
  `Near ${where.name} (${where.how}), ${at4(where.lat, where.lon)}; distances and directions are from there.`;

const textMatches = (query: string | undefined, ...texts: string[]) =>
  !query || texts.some((text) => wordsOf(text).includes(wordsOf(query)));

export const findPlaces = defineTool({
  name: "find_places",
  title: "places on the map",
  area: "places",
  description:
    'Find saved places and records in the map\'s reference layers (shops, hospitals, airports, water and the rest) by name or kind, near a place. Give kind (e.g. "supermarket") and near (a place name or "lat,lon").',
  input: z.object({
    query: z.string().trim().min(1).max(120).optional().describe("Words in the name, e.g. Tesco. Leave out to list by kind."),
    kind: z.string().trim().min(1).max(60).optional().describe('What it is, e.g. "supermarket", "hospital", "drinking water".'),
    near: z.string().trim().min(1).max(120).optional().describe('A place name, a postcode, "home", or "lat,lon".'),
    radius_km: z.number().min(0.1).max(100).optional().describe("How far from near to look, in km. Default 10."),
    page: z.number().int().min(1).max(50).optional().describe("Which page of results, from 1."),
  }),
  run({ query: asked, kind: givenKind, near, radius_km, page }, { ctx }): ToolAnswer {
    const held = heldKinds(ctx);
    // A model often puts the kind in query as well, or only there: bonsai-2:2b asked for query "supermarket" with kind
    // "supermarket" and was told none were held (docs/ai.md, "Tried with a real model: tools"). A query that names a kind
    // held is read as that kind, not as words in a name.
    let query = asked;
    let kind = givenKind;
    if (query && ((kind && wordsOf(query) === wordsOf(kind)) || (!kind && matchKinds(query, held).kinds.length > 0))) {
      kind ??= query;
      query = undefined;
    }
    const markers = ctx.services.maps.annotations.listMarkers();
    if (!query && !kind && !near) {
      return {
        held: held.length > 0 || markers.length > 0,
        label: "what is held",
        url: "/maps",
        text: `${heldLine(held)} Saved places: ${markers.length}. Ask again with kind and near, or with query.`,
      };
    }
    let where: Where | null = null;
    if (near) {
      where = resolveNear(ctx, near);
      if (!where) return { held: false, text: unknownPlace(near), url: "/maps" };
    }
    const radius = radius_km ?? 10;
    const match = kind ? matchKinds(kind, held) : null;
    const layers = [...new Set((match ? match.kinds : held).map((entry) => entry.layer))];
    const kindCodes = match ? [...new Set(match.kinds.map((entry) => entry.kind))] : undefined;

    const saved = markers
      .filter((marker) => (match ? match.icons.has(marker.icon) : true))
      .filter((marker) => textMatches(query, marker.name, marker.note))
      .map((marker): Found => ({ type: "saved", marker, meters: where ? distanceFrom(where, marker).meters : null }))
      .filter((item) => !where || (item.meters as number) <= radius * 1000);

    let records: Found[] = [];
    let tooMany = false;
    if (where) {
      const points = match && match.kinds.length === 0 ? [] : recordsNear(ctx, where, radius, layers, kindCodes);
      if (points === null) tooMany = true;
      else
        records = points
          .filter((point) => textMatches(query, point.name))
          .map((point): Found => ({ type: "record", point, meters: distanceFrom(where as Where, point).meters }));
    } else if (query) {
      records = ctx.services.layers.store
        .search(query, kindCodes ? { kinds: kindCodes } : {}, 100)
        .filter((hit) => hit.lat !== null && hit.lon !== null)
        .map(
          (hit): Found => ({
            type: "record",
            point: {
              id: hit.id,
              layer: hit.layer,
              provenance: hit.provenance,
              name: hit.name,
              kind: hit.kindLabel,
              lat: hit.lat!,
              lon: hit.lon!,
            },
            meters: null,
          }),
        );
    } else if (match) {
      // A kind with nowhere to look: say how many are held, and ask where.
      const count = match.kinds.reduce((sum, entry) => sum + entry.count, 0);
      if (count === 0 && saved.length === 0) {
        return {
          held: false,
          url: "/maps",
          text: `No "${kind}" records are held in any layer: fetch them under ${GET_LAYERS}. ${heldLine(held)}`,
        };
      }
      const kinds = match.kinds.map((entry) => `${entry.label} (${entry.count}, ${layerLabel(entry.layer)})`).join(", ");
      return {
        held: true,
        url: "/maps",
        label: "what is held",
        text: `Held of "${kind}": ${kinds || "none in the layers"}${saved.length > 0 ? `; ${saved.length} saved places` : ""}. Ask again with near (a place) to list them.`,
      };
    }

    if (tooMany) {
      return {
        held: true,
        url: "/maps",
        text: `More records are held within ${radius} km of ${where!.name} than can be listed. Ask again with kind, query, or a smaller radius_km.`,
      };
    }
    const found = [...saved, ...records].sort((a, b) => (a.meters !== null && b.meters !== null ? a.meters - b.meters : 0));
    if (found.length === 0) {
      const what = kind ? `"${kind}"` : query ? `called "${query}"` : "of any kind";
      const there = where ? ` within ${radius} km of ${where.name}` : "";
      const none = match && match.kinds.length === 0 ? ` No layer held has that kind at all. ${heldLine(held)}` : "";
      return {
        held: false,
        url: "/maps",
        text: `Nothing ${what} is held${there}: fetch that area under ${GET_LAYERS}.${none}`,
      };
    }
    const { shown, line } = pageOf(found, page ?? 1);
    const { lines, layers: used, oldest } = describe(ctx, shown, where);
    return {
      held: true,
      label: labelOf(used, oldest, used.size === 0),
      url: urlOf(shown),
      text: [where ? nearLine(where) : null, ...lines, line].filter(Boolean).join("\n"),
    };
  },
});

/** Distances tried in turn, km, until enough are found. */
const RINGS = [2, 5, 10, 25, 50, 100, 250];

export const nearestPlace = defineTool({
  name: "nearest_place",
  title: "the nearest places",
  area: "places",
  description:
    'The nearest few of a kind of place to somewhere, from saved places and the map\'s reference layers, with distance and direction. Use for "where is the nearest hospital to home".',
  input: z.object({
    kind: z.string().trim().min(1).max(60).describe('What it is, e.g. "supermarket", "hospital", "pharmacy".'),
    near: z.string().trim().min(1).max(120).describe('A place name, a postcode, "home", or "lat,lon".'),
    count: z.number().int().min(1).max(10).optional().describe("How many to give. Default 3."),
  }),
  run({ kind, near, count }, { ctx }): ToolAnswer {
    const want = count ?? 3;
    const where = resolveNear(ctx, near);
    if (!where) return { held: false, text: unknownPlace(near), url: "/maps" };
    const held = heldKinds(ctx);
    const match = matchKinds(kind, held);
    const layers = [...new Set(match.kinds.map((entry) => entry.layer))];
    const kindCodes = [...new Set(match.kinds.map((entry) => entry.kind))];

    let points: ReferencePoint[] = [];
    let reached = 0;
    for (const ring of RINGS) {
      const found = recordsNear(ctx, where, ring, layers, kindCodes);
      if (found === null) break;
      points = found;
      reached = ring;
      if (found.length >= want) break;
    }
    const saved = ctx.services.maps.annotations
      .listMarkers()
      .filter((marker) => match.icons.has(marker.icon))
      .map((marker): Found => ({ type: "saved", marker, meters: distanceFrom(where, marker).meters }));
    const found = [...saved, ...points.map((point): Found => ({ type: "record", point, meters: distanceFrom(where, point).meters }))]
      .sort((a, b) => (a.meters as number) - (b.meters as number))
      .slice(0, want);
    if (found.length === 0) {
      const none = match.kinds.length === 0 ? ` No layer held has that kind at all. ${heldLine(held)}` : "";
      return {
        held: false,
        url: "/maps",
        text: `Nothing of the kind "${kind}" is held within ${reached || RINGS.at(-1)} km of ${where.name}: fetch that area under ${GET_LAYERS}.${none}`,
      };
    }
    const { lines, layers: used, oldest } = describe(ctx, found, where);
    return {
      held: true,
      label: labelOf(used, oldest, used.size === 0),
      url: urlOf(found),
      text: [nearLine(where), `The nearest ${found.length} of "${kind}" held:`, ...lines].join("\n"),
    };
  },
});

export const PLACES_TOOLS: ToolDefinition[] = [findPlaces, nearestPlace];
