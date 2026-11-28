/**
 * Directions in the way a driver writes them for themselves:
 *
 *     M25
 *     M20 - Folkestone
 *     Eurotunnel, Folkestone – Calais
 *     A26 (E17) - Reims (A4)
 *     A26 (E17) - Troyes
 *
 * A line is a road (its number, the European route numbers it carries in brackets) and the
 * place its signs say to follow, with the road the sign gives beside the place when it is
 * another one. A new line starts where the road changes or the place to follow changes.
 * Under each line, quieter: the junction to join at and to leave at, the sign at the exit,
 * the distance and the time.
 *
 * How a path becomes lines:
 *  1. each edge driven is a step; slip roads, roundabouts and the short joins to a
 *     crossing are not roads of their own but the way from one road to the next, and the
 *     signs on them are the signs for the road they lead to;
 *  2. steps on the same road (a road keeps its number while the next piece still carries
 *     it, so "A1;A26" then "A26" is one road) make a leg;
 *  3. a leg's signs (destination tags on the slip road that led to it and on its own
 *     carriageway, in the direction driven) are split where the place followed changes:
 *     the place kept is the one that stays on the signs longest;
 *  4. legs too short to be worth a line are folded into the one before (a dog-leg
 *     through a town, a few hundred metres of another road at a junction), and if there
 *     are still more than `MAX_LINES`, the shortest go the same way.
 */
import type { RoadCrossingOnRoute, RoadDistanceUnit, RoadJunction, RoadLeg } from "@outpost/shared";
import { roadDistanceText, roadDurationText, roadLegTitle } from "@outpost/shared";
import { CLASS, isCrossing, isLink, SIGN_SEPARATOR } from "./build.ts";
import { type Graph, meters } from "./graph.ts";
import type { Step } from "./route.ts";

/** Lines a route is held to, at most, besides crossings and via points. */
export const MAX_LINES = 28;
/** A sign followed for less than this is not a line of its own. */
const MIN_SIGN_STRETCH_M = 12_000;
/** A junction this near where a road is joined or left is the one named. */
const JUNCTION_NEAR_M = 1_500;

/** A start or end nearer the network than this is not worth a distance. */
const NEAR_ENOUGH_M = 100;

const UK_STYLE = new Set(["GB", "IE", "IM", "JE", "GG"]);

/** Orbital roads, by number and country, with their middles: driven round them is "clockwise" or "anticlockwise". */
const RINGS: Array<{ ref: string; country: string; lat: number; lon: number }> = [
  { ref: "M25", country: "GB", lat: 51.5, lon: -0.12 },
  { ref: "M60", country: "GB", lat: 53.48, lon: -2.24 },
  { ref: "A10", country: "DE", lat: 52.52, lon: 13.4 },
  { ref: "R0", country: "BE", lat: 50.85, lon: 4.35 },
  { ref: "BP", country: "FR", lat: 48.857, lon: 2.352 },
];

export type CountryLookup = (lat: number, lon: number, hint: string | null) => string | null;

/** One stretch of driving between two points (start, via points, end). */
export interface DrivenSegment {
  steps: Step[];
}

interface StepInfo {
  edge: number;
  backward: boolean;
  start: number;
  end: number;
  lengthM: number;
  seconds: number;
  kind: "road" | "join" | "crossing";
  refs: string[];
  name: string;
  intRefs: string[];
  /** Places, roads with them, junction number of the sign in the direction driven. */
  sign: { places: string[]; refs: string[]; junction: string } | null;
  country: string | null;
}

interface Draft {
  kind: "road" | "crossing" | "via";
  road: string | null;
  steps: StepInfo[];
  /** The slip roads and roundabouts that led onto it. */
  approach: StepInfo[];
  towards: string | null;
  towardsRef: string | null;
  leaveAt: RoadJunction | null;
  joinAt: RoadJunction | null;
  exitSign: string | null;
  via: { index: number; name: string | null } | null;
  distanceM: number;
  durationS: number;
}

const splitList = (text: string) =>
  text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

function stepInfo(graph: Graph, step: Step, country: CountryLookup): StepInfo {
  const { edge, backward } = step;
  const cls = graph.cls[edge]!;
  const start = backward ? graph.to[edge]! : graph.from[edge]!;
  const end = backward ? graph.from[edge]! : graph.to[edge]!;
  const roundabout = (graph.flags[edge]! & 2) !== 0;
  const kind = isCrossing(cls) ? "crossing" : cls === CLASS.connector || isLink(cls) || roundabout ? "join" : "road";
  const signText = graph.strings[backward ? graph.signB[edge]! : graph.signF[edge]!] ?? "";
  let sign: StepInfo["sign"] = null;
  if (signText) {
    const [places = "", refs = "", junction = ""] = signText.split(SIGN_SEPARATOR);
    sign = { places: splitList(places), refs: splitList(refs), junction };
  }
  const s = graph.network[edge]!;
  const hint = s >= 0 ? (graph.networks[s]?.country ?? null) : null;
  const mid = (a: number, b: number) => (a + b) / 2;
  return {
    edge,
    backward,
    start,
    end,
    lengthM: graph.length[edge]!,
    seconds: graph.seconds[edge]!,
    kind,
    refs: splitList(graph.strings[graph.ref[edge]!] ?? ""),
    name: graph.strings[graph.name[edge]!] ?? "",
    intRefs: splitList(graph.strings[graph.intRef[edge]!] ?? ""),
    sign,
    country: country(mid(graph.lat[start]!, graph.lat[end]!), mid(graph.lon[start]!, graph.lon[end]!), hint),
  };
}

function junctionLabel(ref: string | null, name: string | null, country: string | null): string {
  const number = ref ? (country && UK_STYLE.has(country) ? `J${ref}` : `exit ${ref}`) : null;
  if (number && name) return `${number} (${name})`;
  return number ?? name ?? "";
}

function junctionAt(graph: Graph, node: number, country: string | null): RoadJunction | null {
  const found = graph.junctions.get(node);
  if (!found || (!found.ref && !found.name)) return null;
  return {
    ref: found.ref || null,
    name: found.name || null,
    label: junctionLabel(found.ref || null, found.name || null, country),
    at: [graph.lon[node]!, graph.lat[node]!],
  };
}

/** The junction nearest a node, within `JUNCTION_NEAR_M`: where a slip road leaves or joins is near the junction's mapped node. */
function junctionNear(graph: Graph, node: number, country: string | null, prefer: number[] = []): RoadJunction | null {
  for (const candidate of prefer) {
    const at = junctionAt(graph, candidate, country);
    if (at) return at;
  }
  const lat = graph.lat[node]!;
  const lon = graph.lon[node]!;
  let best: number | null = null;
  let bestD = JUNCTION_NEAR_M;
  for (const [junction, info] of graph.junctions) {
    if (!info.ref && !info.name) continue;
    const dLat = Math.abs(graph.lat[junction]! - lat);
    if (dLat > 0.02) continue;
    const d = meters(lat, lon, graph.lat[junction]!, graph.lon[junction]!);
    if (d < bestD) {
      bestD = d;
      best = junction;
    }
  }
  return best === null ? null : junctionAt(graph, best, country);
}

const BEARINGS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

function directionWord(graph: Graph, road: string | null, from: number, to: number, country: string | null): string | null {
  const aLat = graph.lat[from]!;
  const aLon = graph.lon[from]!;
  const bLat = graph.lat[to]!;
  const bLon = graph.lon[to]!;
  const k = Math.cos((aLat * Math.PI) / 180);
  const ring = RINGS.find((r) => r.ref === road && r.country === country);
  if (ring) {
    const sx = (aLon - ring.lon) * k;
    const sy = aLat - ring.lat;
    const z = sx * (bLat - aLat) - sy * (bLon - aLon) * k;
    return z < 0 ? "clockwise" : "anticlockwise";
  }
  const dx = (bLon - aLon) * k;
  const dy = bLat - aLat;
  if (Math.hypot(dx, dy) < 0.02) return null;
  const angle = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return BEARINGS[Math.round(angle / 45) % 8]!;
}

const sumLength = (steps: StepInfo[]) => steps.reduce((sum, s) => sum + s.lengthM, 0);
const sumSeconds = (steps: StepInfo[]) => steps.reduce((sum, s) => sum + s.seconds, 0);

/** A road's number for a step, kept as `current` while the step still carries it. */
function roadOf(step: StepInfo, current: string | null): string | null {
  if (current && step.refs.includes(current)) return current;
  if (step.refs.length > 0) return step.refs[0]!;
  if (current && !step.refs.length && step.name === current) return current;
  return step.name || null;
}

/**
 * How good a sign's entry is as a place to follow: 0 for a road number given as a place
 * ("M6(N)", "(M20, M23)"), 1 for a direction or a part of town ("The SOUTH", "City
 * Centre"), 2 for a place.
 */
export function placeQuality(place: string): number {
  const text = place.trim();
  if (/^\(.*\)$/.test(text) || /^[A-Z]{1,3}\s?\d+[A-Z]?(\s*\(?[NSEW]\)?|\s+(north|south|east|west))?$/i.test(text)) return 0;
  if (/^the\s+(north|south|east|west|midlands)/i.test(text) || /^(city\s+)?cent(re|er)$/i.test(text) || /^centre[- ]ville$/i.test(text))
    return 1;
  return 2;
}

/** A place's first word, folded: "Chamonix-Mont Blanc" and "Chamonix-Mᵗ Blanc" are one place to follow. */
const placeKey = (place: string) =>
  place
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .find((word) => word.length >= 3) ?? place.toLowerCase();

/** Whether two signed places are the same place, however each sign spells it. */
export function samePlace(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return placeKey(a) === placeKey(b);
}

/** Splits a road leg where the place followed changes (step 3 above). */
function splitBySigns(draft: Draft, hint: string[]): Draft[] {
  // Signs along the leg, in order, with how far along each is.
  const signs: Array<{ at: number; index: number; places: string[]; refs: string[] }> = [];
  for (const s of draft.approach) if (s.sign?.places.length) signs.push({ at: 0, index: 0, places: s.sign.places, refs: s.sign.refs });
  let at = 0;
  draft.steps.forEach((s, index) => {
    if (s.sign?.places.length) signs.push({ at, index, places: s.sign.places, refs: s.sign.refs });
    at += s.lengthM;
  });
  if (signs.length === 0) return [draft];
  // From each sign, the place that stays on the signs that follow longest.
  const runs: Array<{ place: string | null; ref: string | null; fromIndex: number; untilSign: number }> = [];
  const preferred = (place: string) => (hint.some((word) => place.toLowerCase().includes(word.toLowerCase())) ? 1 : 0);
  const mentions = (place: string) => signs.filter((sign) => sign.places.includes(place)).length;
  let i = 0;
  while (i < signs.length) {
    let bestPlace = signs[i]!.places[0]!;
    let bestEnd = i;
    let bestScore: number[] = [-1];
    for (const place of signs[i]!.places) {
      let j = i;
      while (j + 1 < signs.length && signs[j + 1]!.places.includes(place)) j += 1;
      // How far the place stays on the signs; then the place that leads to the crossing next; then the most mentioned.
      const kind = placeQuality(place);
      const score = [kind > 0 ? 1 : 0, Math.round(signs[j]!.at / 20_000), preferred(place), kind, mentions(place)];
      const better = score.findIndex((value, k) => value !== bestScore[k]!);
      if (better >= 0 && score[better]! > (bestScore[better] ?? -1)) {
        bestScore = score;
        bestEnd = j;
        bestPlace = place;
      }
    }
    const first = signs[i]!;
    const position = first.places.indexOf(bestPlace);
    const ref =
      first.refs.length === first.places.length ? (first.refs[position] ?? null) : first.refs.length === 1 ? first.refs[0]! : null;
    const sameRoad = ref && draft.road && ref.replace(/\s+/g, "").toUpperCase().startsWith(draft.road.replace(/\s+/g, "").toUpperCase());
    runs.push({
      place: placeQuality(bestPlace) === 0 ? null : bestPlace,
      ref: sameRoad ? null : ref,
      fromIndex: first.index,
      untilSign: bestEnd,
    });
    i = bestEnd + 1;
  }
  // Consecutive runs of the same place are one; a run shorter than MIN_SIGN_STRETCH_M joins the one before.
  const pieces: Draft[] = [];
  runs.forEach((run, r) => {
    const fromIndex = r === 0 ? 0 : run.fromIndex;
    const toIndex = r + 1 < runs.length ? runs[r + 1]!.fromIndex : draft.steps.length;
    if (toIndex <= fromIndex) return;
    const steps = draft.steps.slice(fromIndex, toIndex);
    const last = pieces.at(-1);
    if (last && (samePlace(last.towards, run.place) || sumLength(steps) < MIN_SIGN_STRETCH_M)) {
      last.steps.push(...steps);
      return;
    }
    if (last && sumLength(last.steps) < MIN_SIGN_STRETCH_M && pieces.length === 1 && r > 0) {
      // A first sign kept only briefly gives way to the one that follows.
      last.steps.push(...steps);
      last.towards = run.place;
      last.towardsRef = run.ref;
      return;
    }
    pieces.push({
      ...draft,
      steps,
      approach: pieces.length === 0 ? draft.approach : [],
      towards: run.place,
      towardsRef: run.ref,
      joinAt: pieces.length === 0 ? draft.joinAt : null,
      leaveAt: null,
      exitSign: null,
    });
  });
  if (pieces.length === 0) return [draft];
  const last = pieces.at(-1)!;
  last.leaveAt = draft.leaveAt;
  last.exitSign = draft.exitSign;
  return pieces;
}

/** Words of a sign that lead to the crossing after a road: the terminal or the port. */
function crossingHint(graph: Graph, next: Draft | undefined): string[] {
  if (next?.kind !== "crossing") return [];
  const info = graph.crossings[graph.crossing[next.steps[0]!.edge]!];
  if (!info) return [];
  if (info.kind === "shuttle") return ["Channel Tunnel", "Eurotunnel", "Tunnel sous la Manche", "Le Shuttle"];
  return [info.from, info.to, "ferry", "ferries", "port"].filter((word): word is string => Boolean(word));
}

function merge(into: Draft, from: Draft): void {
  into.steps.push(...from.approach, ...from.steps);
  // A short piece folded in leaves the exit of the road before it as the one to say.
  into.leaveAt = from.leaveAt ?? into.leaveAt;
  into.exitSign = from.exitSign ?? into.exitSign;
}

export interface DirectionsInput {
  graph: Graph;
  segments: DrivenSegment[];
  /** Names of the via points, in order (segments.length - 1 of them). */
  viaNames: Array<string | null>;
  /** Where each segment ends (a via point or the end), by name: a sign naming it is the one to follow. */
  targetNames?: Array<string | null>;
  units: RoadDistanceUnit;
  country: CountryLookup;
  /** Straight-line distances from each point asked to where it joined the network. */
  snapDistances: number[];
  /** Road at each join, for the first and last lines. */
}

export function buildDirections(input: DirectionsInput): RoadLeg[] {
  const { graph, units, country } = input;
  const drafts: Draft[] = [];
  input.segments.forEach((segment, segmentIndex) => {
    if (segmentIndex > 0) {
      drafts.push({
        kind: "via",
        road: null,
        steps: [],
        approach: [],
        towards: null,
        towardsRef: null,
        leaveAt: null,
        joinAt: null,
        exitSign: null,
        via: { index: segmentIndex, name: input.viaNames[segmentIndex - 1] ?? null },
        distanceM: 0,
        durationS: 0,
      });
    }
    const infos = segment.steps.map((step) => stepInfo(graph, step, country));
    const legs: Draft[] = [];
    let pending: StepInfo[] = [];
    let current: Draft | null = null;
    const close = () => {
      current = null;
    };
    for (const info of infos) {
      if (info.kind === "join") {
        pending.push(info);
        continue;
      }
      if (info.kind === "crossing") {
        const key = graph.crossings[graph.crossing[info.edge]!]?.key ?? "crossing";
        const last = legs.at(-1);
        if (current && current.kind === "crossing" && current.road === key) {
          current.steps.push(...pending, info);
          pending = [];
          continue;
        }
        if (last && pending.length > 0) last.steps.push(...pending);
        pending = [];
        current = {
          kind: "crossing",
          road: key,
          steps: [info],
          approach: [],
          towards: null,
          towardsRef: null,
          leaveAt: null,
          joinAt: null,
          exitSign: null,
          via: null,
          distanceM: 0,
          durationS: 0,
        };
        legs.push(current);
        continue;
      }
      const cur = current as Draft | null;
      const road = roadOf(info, cur?.kind === "road" ? cur.road : null);
      if (
        cur &&
        cur.kind === "road" &&
        cur.road === road &&
        pending.every((p) => p.kind === "join" && p.lengthM < 400 && !isLink(graph.cls[p.edge]!))
      ) {
        // A roundabout on the same road, or nothing between: the same leg.
        cur.steps.push(...pending, info);
        pending = [];
        continue;
      }
      // A new road: what led here is its approach; where the last road was left is its exit.
      if (cur && cur.kind === "road") {
        const leftAt = pending[0]?.start ?? info.start;
        const tail = cur.steps.slice(-4).map((s) => s.end);
        cur.leaveAt = junctionNear(graph, leftAt, cur.steps.at(-1)?.country ?? null, [leftAt, ...tail.reverse()]);
        const exitSign = pending.find((p) => p.sign?.places.length)?.sign;
        cur.exitSign = exitSign ? exitSign.places[0]! : null;
      }
      close();
      const joined = pending.length > 0 ? info.start : null;
      current = {
        kind: "road",
        road,
        steps: [info],
        approach: pending,
        towards: null,
        towardsRef: null,
        leaveAt: null,
        joinAt: joined !== null && graph.cls[info.edge] === CLASS.motorway ? junctionNear(graph, joined, info.country) : null,
        exitSign: null,
        via: null,
        distanceM: 0,
        durationS: 0,
      };
      pending = [];
      legs.push(current);
    }
    // What is left (slip roads off the last road): where it is left and the sign followed.
    const last = legs.at(-1);
    if (last && pending.length > 0) {
      if (last.kind === "road") {
        const leftAt = pending[0]!.start;
        last.leaveAt = junctionNear(graph, leftAt, last.steps.at(-1)?.country ?? null, [leftAt]);
        const sign = pending.find((p) => p.sign?.places.length)?.sign;
        last.exitSign = sign ? sign.places[0]! : null;
      }
      last.steps.push(...pending);
    } else if (!last && pending.length > 0) {
      legs.push({
        kind: "road",
        road: null,
        steps: pending,
        approach: [],
        towards: null,
        towardsRef: null,
        leaveAt: null,
        joinAt: null,
        exitSign: null,
        via: null,
        distanceM: 0,
        durationS: 0,
      });
    }
    // Places to follow, then folding.
    const target = input.targetNames?.[segmentIndex];
    const split = legs.flatMap((leg, index) =>
      leg.kind === "road" ? splitBySigns(leg, [...crossingHint(graph, legs[index + 1]), ...(target ? [target] : [])]) : [leg],
    );
    drafts.push(...placesFromNext(graph, fold(split)));
  });
  // A via point with no name of its own takes the place the road before it was signed for.
  drafts.forEach((draft, index) => {
    if (draft.kind !== "via" || draft.via?.name) return;
    const before = drafts
      .slice(0, index)
      .reverse()
      .find((d) => d.kind === "road" && d.towards);
    if (before?.towards && draft.via) draft.via = { ...draft.via, name: before.towards };
  });
  // Too many lines still: the shortest road lines join the one before.
  let roads = drafts.filter((d) => d.kind === "road");
  while (roads.length > MAX_LINES) {
    let shortest: Draft | null = null;
    for (const d of roads)
      if (!shortest || sumLength([...d.approach, ...d.steps]) < sumLength([...shortest.approach, ...shortest.steps])) shortest = d;
    const at = drafts.indexOf(shortest!);
    const before = drafts[at - 1];
    if (before && before.kind === "road") merge(before, shortest!);
    else {
      const after = drafts[at + 1];
      if (after?.kind !== "road") break;
      after.approach = [...shortest!.approach, ...shortest!.steps, ...after.approach];
      after.joinAt = shortest!.joinAt;
    }
    drafts.splice(at, 1);
    roads = drafts.filter((d) => d.kind === "road");
  }
  return drafts.map((draft, index) =>
    finish(
      graph,
      draft,
      units,
      index === 0 ? input.snapDistances[0] : undefined,
      index === drafts.length - 1 ? input.snapDistances.at(-1) : undefined,
    ),
  );
}

/** Whether a leg is on a numbered road ("A16"), not only a named street. */
const numbered = (leg: Draft) => leg.steps.some((s) => s.refs.length > 0);

/** Folding short legs into their neighbours (step 4). */
function fold(legs: Draft[]): Draft[] {
  const total = legs.reduce((sum, leg) => sum + sumLength([...leg.approach, ...leg.steps]), 0);
  const short = Math.min(10_000, Math.max(3_000, total * 0.008));
  const out: Draft[] = [];
  for (const leg of legs) {
    const prev = out.at(-1);
    if (prev && leg.kind === "road" && prev.kind === "road") {
      const sameLine = prev.road === leg.road && (samePlace(prev.towards, leg.towards) || !leg.towards);
      if (sameLine) {
        merge(prev, leg);
        continue;
      }
      // An A-B-A dog-leg: B goes, and the second A joins the first.
      const beforePrev = out.at(-2);
      if (
        beforePrev &&
        beforePrev.kind === "road" &&
        beforePrev.road === leg.road &&
        sumLength([...prev.approach, ...prev.steps]) < short
      ) {
        merge(beforePrev, prev);
        out.pop();
        merge(beforePrev, leg);
        continue;
      }
    }
    out.push(leg);
  }
  // Legs too short to be a line join the one before (or the one after, at the start).
  const kept: Draft[] = [];
  for (let i = 0; i < out.length; i += 1) {
    const leg = out[i]!;
    const length = sumLength([...leg.approach, ...leg.steps]);
    const prev = kept.at(-1);
    if (leg.kind === "road" && (length < short || (!numbered(leg) && length < short * 3))) {
      if (prev && prev.kind === "road") {
        merge(prev, leg);
        continue;
      }
      const next = out[i + 1];
      if (next && next.kind === "road") {
        next.approach = [...leg.approach, ...leg.steps, ...next.approach];
        next.joinAt = next.joinAt ?? leg.joinAt;
        if (!next.towards && leg.towards) next.towards = leg.towards;
        continue;
      }
    }
    if (prev && prev.kind === "road" && leg.kind === "road" && prev.road === leg.road && samePlace(prev.towards, leg.towards)) {
      merge(prev, leg);
      continue;
    }
    // The same road on, signed for a place its earlier signs already gave ("Birmingham;Preston",
    // then "Preston"), or after signs that gave no place at all ("M6(N)"): one line, for that
    // place, its European routes together ("M6 (E05 - E22)"). A place the signs had not given
    // before ("A26 (E17) - Reims (A4)" then "A26 (E17) - Troyes") is a line of its own, as the
    // owner writes it.
    if (
      prev &&
      prev.kind === "road" &&
      leg.kind === "road" &&
      prev.road &&
      prev.road === leg.road &&
      leg.towards &&
      (!prev.towards || signedPlaces(prev).some((place) => samePlace(place, leg.towards)))
    ) {
      merge(prev, leg);
      prev.towards = leg.towards;
      prev.towardsRef = leg.towardsRef;
      continue;
    }
    kept.push(leg);
  }
  return kept;
}

/** Every place a leg's signs name, in the direction driven. */
const signedPlaces = (leg: Draft) => [...leg.approach, ...leg.steps].flatMap((s) => s.sign?.places ?? []);

/** Whether a leg is mostly on motorways: those read by their number alone ("M25"), as the owner writes them. */
const onMotorway = (graph: Graph, leg: Draft) => {
  let motorway = 0;
  for (const s of leg.steps) if (s.kind === "road" && graph.cls[s.edge] === CLASS.motorway) motorway += s.lengthM;
  return motorway >= sumLength(leg.steps) / 2;
};

/**
 * A road that is not a motorway and has no sign of its own ("A5103", "A501") takes the place
 * the next road is signed for, or the name of the junction it is left at; with neither it
 * stays as its number alone.
 */
function placesFromNext(graph: Graph, legs: Draft[]): Draft[] {
  legs.forEach((leg, index) => {
    if (leg.kind !== "road" || leg.towards || !leg.road || onMotorway(graph, leg)) return;
    const next = legs[index + 1];
    const place = (next?.kind === "road" ? next.towards : null) ?? leg.leaveAt?.name ?? null;
    if (place && !samePlace(place, leg.road)) leg.towards = place;
  });
  return legs;
}

function crossingOf(graph: Graph, draft: Draft): RoadCrossingOnRoute {
  const info = graph.crossings[graph.crossing[draft.steps.find((s) => s.kind === "crossing")!.edge]!]!;
  const first = draft.steps[0]!;
  const last = draft.steps.at(-1)!;
  let from = info.from;
  let to = info.to;
  if (info.kind === "shuttle") {
    // The shuttle's terminals: Folkestone (Cheriton) and Calais (Coquelles).
    const startLat = graph.lat[first.start]!;
    const endLat = graph.lat[last.end]!;
    from = startLat > endLat ? "Folkestone" : "Calais";
    to = startLat > endLat ? "Calais" : "Folkestone";
  } else {
    // A ferry's name gives its ends in the order of its way; driven the other way, they swap.
    const crossingSteps = draft.steps.filter((s) => s.kind === "crossing");
    const against = crossingSteps.filter((s) => s.backward).length > crossingSteps.length / 2;
    if (against) [from, to] = [to, from];
  }
  const onBoard = draft.steps.filter((s) => s.kind === "crossing").reduce((sum, s) => sum + s.seconds, 0);
  return {
    id: info.id,
    kind: info.kind,
    name: info.kind === "shuttle" ? "Eurotunnel Le Shuttle" : info.name,
    operator: info.operator,
    from,
    to,
    durationS: Math.round(onBoard),
    durationSource: info.durationS !== null ? "tagged" : "assumed",
  };
}

function finish(graph: Graph, draft: Draft, units: RoadDistanceUnit, fromStartM?: number, toEndM?: number): RoadLeg {
  const all = [...draft.approach, ...draft.steps];
  const distanceM = Math.round(sumLength(all));
  const durationS = Math.round(sumSeconds(all));
  const first = all[0];
  const last = all.at(-1);
  const at = (node: number | undefined): [number, number] => (node === undefined ? [0, 0] : [graph.lon[node]!, graph.lat[node]!]);
  const countries: string[] = [];
  for (const s of all) if (s.country && countries.at(-1) !== s.country) countries.push(s.country);
  const base = {
    distanceM,
    durationS,
    countries: [...new Set(countries)],
    start: at(first?.start),
    end: at(last?.end),
  };
  if (draft.kind === "via") {
    const name = draft.via?.name;
    return {
      kind: "via",
      road: null,
      europeanRoutes: [],
      towards: null,
      towardsRef: null,
      direction: null,
      joinAt: null,
      leaveAt: null,
      exitSign: null,
      ...base,
      crossing: null,
      via: draft.via,
      title: name ? `Via ${name}` : `Via point ${draft.via?.index ?? ""}`.trim(),
      detail: `Via point ${draft.via?.index ?? ""}`.trim(),
    };
  }
  if (draft.kind === "crossing") {
    const crossing = crossingOf(graph, draft);
    const label = crossing.kind === "shuttle" ? "Eurotunnel" : "Ferry";
    const ends = crossing.from && crossing.to ? `, ${crossing.from} – ${crossing.to}` : `, ${crossing.name}`;
    const operator = crossing.kind === "ferry" && crossing.operator ? `${crossing.operator.split(/\s*;\s*/).join(", ")}. ` : "";
    const time = `${roadDurationText(crossing.durationS)} on board${crossing.durationSource === "assumed" ? " (Outpost's estimate)" : ""}`;
    return {
      kind: "crossing",
      road: null,
      europeanRoutes: [],
      towards: crossing.to,
      towardsRef: null,
      direction: null,
      joinAt: null,
      leaveAt: null,
      exitSign: null,
      ...base,
      crossing,
      via: null,
      title: `${label}${ends}`,
      detail: `${operator}Booked and timetabled: ${time}, check-in not included`,
    };
  }
  // European routes along the leg: numbers grouped by where each first appears ("E17 - E54", "E21 E62"); short pieces not counted.
  const europeanRoutes: string[][] = [];
  const counted = new Set<string>();
  for (const s of draft.steps) {
    if (s.lengthM < 300) continue;
    const fresh = s.intRefs.filter((e) => !counted.has(e));
    if (fresh.length === 0) continue;
    for (const e of fresh) counted.add(e);
    europeanRoutes.push(fresh);
  }
  const startNode = draft.steps[0]?.start ?? first?.start ?? 0;
  const endNode = draft.steps.at(-1)?.end ?? last?.end ?? 0;
  const legCountry = draft.steps[0]?.country ?? null;
  const direction = directionWord(graph, draft.road, startNode, endNode, legCountry);
  const leg = {
    road: draft.road,
    europeanRoutes: europeanRoutes.slice(0, 3),
    towards: draft.towards,
    towardsRef: draft.towardsRef,
    direction,
  };
  const parts: string[] = [];
  if (direction) parts.push(direction === "clockwise" || direction === "anticlockwise" ? direction : `heading ${direction}`);
  if (fromStartM !== undefined && fromStartM >= NEAR_ENOUGH_M) parts.push(`${roadDistanceText(fromStartM, units)} from the start`);
  if (draft.joinAt) parts.push(`join at ${draft.joinAt.label}`);
  if (draft.leaveAt) parts.push(`leave at ${draft.leaveAt.label}${draft.exitSign ? ` for ${draft.exitSign}` : ""}`);
  else if (draft.exitSign) parts.push(`leave for ${draft.exitSign}`);
  parts.push(roadDistanceText(distanceM, units), roadDurationText(durationS));
  if (toEndM !== undefined)
    parts.push(toEndM >= NEAR_ENOUGH_M ? `then local roads, ${roadDistanceText(toEndM, units)} to the end` : "then local roads to the end");
  const detail = parts.join(", ");
  return {
    kind: "road",
    ...leg,
    joinAt: draft.joinAt,
    leaveAt: draft.leaveAt,
    exitSign: draft.exitSign,
    ...base,
    crossing: null,
    via: null,
    title: roadLegTitle(leg),
    detail: detail.charAt(0).toUpperCase() + detail.slice(1),
  };
}
