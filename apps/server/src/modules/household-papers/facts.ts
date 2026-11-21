/**
 * What the household book is made from that Outpost holds about the ground round home:
 * the nearest help and the places to keep away from in the installed reference layers,
 * the flood and planning zones that hold home, the climate kept for home (with the wind's
 * average direction), and, for each place the household would go to, the straight line
 * there with the ground along it from installed terrain and where each day's walking ends.
 *
 * Read from what is held and nothing else: no source is asked anything. Where something
 * is not held the answer says so (`held: false`, a null), and the book says how to get it.
 */
import {
  BOOK_WALK_PACES,
  type BookAnswers,
  type BookArea,
  type BookClimate,
  type BookFacts,
  type BookJourney,
  type BookPlace,
  type BookPlaceGroup,
  type BookWalk,
  type ClimateData,
  countryAt,
  greatCirclePoint,
  haversineMeters,
  homePlaceOf,
  initialBearingDeg,
  MAX_SIGHT_PATH_METERS,
  type NearestHit,
  type ReferenceLayerId,
  walkLine,
  walkPaceOf,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { COUNTRIES } from "../layers/countries.ts";

interface GroupSpec {
  id: string;
  label: string;
  layer: ReferenceLayerId;
  /** The kinds asked for, each up to `each`; none asks for every kind the layer holds near home (an imported file has kinds of its own). */
  kinds: string[];
  each: number;
  /** Nothing further than this is listed. */
  withinMeters: number;
  limit: number;
}

const HELP: GroupSpec[] = [
  { id: "hospitals", label: "Hospitals", layer: "hospitals", kinds: [], each: 3, withinMeters: 100_000, limit: 3 },
  { id: "pharmacies", label: "Pharmacies", layer: "food", kinds: ["food:pharmacy"], each: 3, withinMeters: 30_000, limit: 3 },
  {
    id: "emergency",
    label: "Police, fire and ambulance stations",
    layer: "emergency",
    kinds: [],
    each: 1,
    withinMeters: 50_000,
    limit: 3,
  },
  { id: "shelters", label: "Shelters and assembly points", layer: "shelters", kinds: [], each: 1, withinMeters: 30_000, limit: 4 },
  { id: "water", label: "Drinking water points", layer: "food", kinds: ["food:water"], each: 4, withinMeters: 20_000, limit: 4 },
  { id: "food-banks", label: "Food banks", layer: "food", kinds: ["food:food-bank"], each: 2, withinMeters: 30_000, limit: 2 },
  {
    id: "shops",
    label: "Food shops",
    layer: "food",
    kinds: ["food:supermarket", "food:small-shop"],
    each: 2,
    withinMeters: 20_000,
    limit: 3,
  },
];

const KEEP_AWAY: GroupSpec[] = [
  { id: "nuclear", label: "Nuclear facilities", layer: "nuclear", kinds: [], each: 1, withinMeters: 100_000, limit: 3 },
  { id: "military", label: "Military sites", layer: "military", kinds: [], each: 1, withinMeters: 20_000, limit: 4 },
  {
    id: "airports",
    label: "Large and medium airports",
    layer: "airports",
    kinds: ["large_airport", "medium_airport"],
    each: 2,
    withinMeters: 30_000,
    limit: 3,
  },
  { id: "fuel", label: "Fuel stations", layer: "food", kinds: ["food:fuel"], each: 3, withinMeters: 5_000, limit: 3 },
];

/** How far apart the samples of a line are when no terrain is read: only for placing the stops. */
const FLAT_STEP_METERS = 500;

const toPlace = (hit: NearestHit): BookPlace => ({
  name: hit.name,
  kindLabel: hit.kindLabel,
  lat: hit.lat,
  lon: hit.lon,
  distanceMeters: hit.distanceMeters,
  bearingDegrees: hit.bearingDegrees,
});

export function createBookFacts(ctx: AppContext) {
  const store = () => ctx.services.layers.store;

  const heldLayers = (): Set<string> => new Set(store().summary(new Map()).filter((layer) => layer.count > 0).map((layer) => layer.id));

  function group(spec: GroupSpec, at: { lat: number; lon: number }, held: Set<string>): BookPlaceGroup {
    const base = { id: spec.id, label: spec.label, layer: spec.layer, held: held.has(spec.layer), places: [] as BookPlace[] };
    if (!base.held) return base;
    const hits: NearestHit[] = [];
    const asks =
      spec.kinds.length > 0
        ? spec.kinds
        : [...new Set(store().nearest({ lat: at.lat, lon: at.lon, layer: spec.layer, kind: null, limit: 1 }).hits.map((hit) => hit.kind))];
    for (const kind of asks) hits.push(...store().nearest({ lat: at.lat, lon: at.lon, layer: spec.layer, kind, limit: spec.each }).hits);
    const seen = new Set<number>();
    base.places = hits
      .filter((hit) => hit.distanceMeters <= spec.withinMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.id - b.id)
      .filter((hit) => !seen.has(hit.id) && seen.add(hit.id) !== undefined)
      .slice(0, spec.limit)
      .map(toPlace);
    return base;
  }

  function areas(layer: ReferenceLayerId, at: { lat: number; lon: number }, held: Set<string>): BookArea[] | null {
    if (!held.has(layer)) return null;
    return store()
      .at({ layers: [layer], lat: at.lat, lon: at.lon })
      .map((hit) => ({ name: hit.name, kindLabel: hit.kindLabel }));
  }

  function climate(home: { lat: number; lon: number }): BookClimate | null {
    const places = ctx.services.weather.places();
    const near = [...places]
      .map((place) => ({ place, meters: place.isHome ? 0 : haversineMeters(home.lat, home.lon, place.lat, place.lon) }))
      // NASA POWER's grid is about 50 km: a place within 25 km of home has home's averages, near enough.
      .filter((entry) => entry.meters <= 25_000)
      .sort((a, b) => a.meters - b.meters);
    const kept = ctx.services.weather.kept();
    for (const { place } of near) {
      const copy = kept.find((each) => each.kind === "climate" && each.placeId === place.id);
      if (!copy) continue;
      const data = copy.data as ClimateData;
      const direction = data.windFromDeg;
      return {
        months: data.months,
        period: data.period,
        fetchedAt: copy.fetchedAt,
        placeName: place.name,
        wind:
          typeof direction === "number"
            ? { fromDegrees: direction, months: data.months.map((month) => month.windFromDeg ?? null), fetchedAt: copy.fetchedAt, period: data.period }
            : null,
      };
    }
    return null;
  }

  function nearestTown(at: { lat: number; lon: number }, held: Set<string>): { name: string; meters: number; lat: number; lon: number } | null {
    if (!held.has("towns")) return null;
    const hits = store().nearest({ lat: at.lat, lon: at.lon, layer: "towns", kind: null, limit: 20 }).hits;
    const best = hits.sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    return best ? { name: best.name, meters: best.distanceMeters, lat: best.lat, lon: best.lon } : null;
  }

  async function journey(
    destination: { id: string; name: string },
    home: { lat: number; lon: number },
    to: { lat: number; lon: number },
    hoursPerDay: number,
    held: Set<string>,
  ): Promise<BookJourney> {
    const distance = haversineMeters(home.lat, home.lon, to.lat, to.lon);
    let heights: Array<number | null> = [];
    let step = FLAT_STEP_METERS;
    let ground: BookJourney["ground"] = null;
    if (distance <= MAX_SIGHT_PATH_METERS && distance >= 1) {
      try {
        const profile = await ctx.services.maps.terrainProfile(home, to);
        if (profile.coverage !== "none") {
          heights = profile.heights;
          step = profile.stepMeters;
          let climb = 0;
          let descent = 0;
          let highest = Number.NEGATIVE_INFINITY;
          let lowest = Number.POSITIVE_INFINITY;
          for (let index = 0; index < heights.length; index += 1) {
            const here = heights[index];
            if (here === null || here === undefined) continue;
            highest = Math.max(highest, here);
            lowest = Math.min(lowest, here);
            const before = heights[index - 1];
            if (before === null || before === undefined) continue;
            if (here > before) climb += here - before;
            else descent += before - here;
          }
          ground = {
            coverage: profile.coverage,
            climbMeters: Math.round(climb),
            descentMeters: Math.round(descent),
            highestMeters: Math.round(highest),
            lowestMeters: Math.round(lowest),
          };
        }
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
      }
    }
    if (heights.length < 2) {
      const intervals = Math.max(1, Math.ceil(distance / FLAT_STEP_METERS));
      step = distance / intervals;
      heights = Array<number | null>(intervals + 1).fill(null);
    }
    const walks: BookWalk[] = BOOK_WALK_PACES.map((pace) => {
      const walked = walkLine(heights, step, walkPaceOf(pace).factor, hoursPerDay);
      return {
        pace,
        hours: walked.hours,
        days: Math.max(1, Math.ceil(walked.hours / hoursPerDay - 1e-9)),
        stops: walked.stopsAt.map((along, index) => {
          const point = greatCirclePoint(home, to, distance > 0 ? along / distance : 0);
          const town = nearestTown(point, held);
          return {
            day: index + 1,
            lat: point.lat,
            lon: point.lon,
            alongMeters: Math.round(along),
            near: town && town.meters <= 30_000 ? town.name : null,
            nearMeters: town && town.meters <= 30_000 ? town.meters : null,
          };
        }),
      };
    });
    // Towns along the way, for the drawn route: the nearest to a few points along it.
    const towns: BookJourney["towns"] = [];
    const samples = Math.min(10, Math.max(2, Math.ceil(distance / 20_000)));
    for (let index = 0; index <= samples; index += 1) {
      const point = greatCirclePoint(home, to, index / samples);
      const town = nearestTown(point, held);
      if (town && town.meters <= Math.max(10_000, distance / samples) && !towns.some((each) => each.name === town.name))
        towns.push({ name: town.name, lat: town.lat, lon: town.lon });
    }
    return {
      destinationId: destination.id,
      name: destination.name,
      lat: to.lat,
      lon: to.lon,
      distanceMeters: Math.round(distance),
      bearingDegrees: Math.round(initialBearingDeg(home, to)) % 360,
      ground,
      walks,
      towns,
    };
  }

  return async function facts(answers: BookAnswers): Promise<BookFacts> {
    const markers = ctx.services.maps.annotations.listMarkers();
    const homeMarker = homePlaceOf(markers);
    const terrain = ctx.services.maps.tiles.sources().sources.terrain !== null && ctx.services.maps.tiles.sources().sources.terrain !== undefined;
    if (!homeMarker)
      return { home: null, help: [], keepAway: [], floodZones: null, planningZones: null, climate: null, terrain, journeys: [], notMeasured: [] };
    const home = { name: homeMarker.name || "Home", lat: homeMarker.lat, lon: homeMarker.lon, country: countryAt(homeMarker, COUNTRIES) };
    const held = heldLayers();
    const journeys: BookJourney[] = [];
    const notMeasured: BookFacts["notMeasured"] = [];
    for (const destination of answers.destinations) {
      let to: { lat: number; lon: number } | null = null;
      const marker = destination.markerId ? markers.find((each) => each.id === destination.markerId) : undefined;
      if (marker) to = marker;
      else if (destination.contactId) {
        try {
          to = ctx.services.contacts.get(destination.contactId).place;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
        }
      }
      if (!to) {
        notMeasured.push({
          destinationId: destination.id,
          name: destination.name,
          why: destination.markerId ? "Its saved place is no longer on the map." : "No saved place is linked to it, so where it is is not known.",
        });
        continue;
      }
      journeys.push(await journey(destination, home, to, answers.walkHoursPerDay, held));
    }
    return {
      home,
      help: HELP.map((spec) => group(spec, home, held)),
      keepAway: KEEP_AWAY.map((spec) => group(spec, home, held)),
      floodZones: areas("flood-zones", home, held),
      planningZones: areas("planning-zones", home, held),
      climate: climate(home),
      terrain,
      journeys,
      notMeasured,
    };
  };
}
