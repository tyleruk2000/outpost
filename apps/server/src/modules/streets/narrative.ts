/**
 * Valhalla's manoeuvres as short lines in plain British English: "Turn right onto School
 * Lane", "At the roundabout, take the 2nd exit onto A24 (Leatherhead Road)", "Take exit 16
 * (Denham) onto M40 towards Birmingham, Oxford". Written here from the manoeuvre's type,
 * street names and sign rather than taken from Valhalla's own sentence, so that:
 *
 *  - a European route alone ("E 05", Valhalla's name for a stretch of the M6) never stands
 *    for a road a British driver knows by its number: it is dropped where the road has
 *    another name, and written "E05" where it has none;
 *  - "stay on" steps that change nothing (a lane, a bend in the same street) fold into the
 *    line before, and leaving a roundabout folds into entering it;
 *  - distances are in the units asked for: metres and kilometres, or yards and miles.
 */
import type { RoadDistanceUnit, StreetDirections, StreetFerry, StreetLine, StreetLineKind } from "@outpost/shared";
import { roadDistanceText } from "@outpost/shared";
import { simplifyIndices } from "../roads/build.ts";
import { ownName } from "../roads/plan.ts";
import { type Costing, decodePolyline6, type Maneuver, type RouteReply } from "./client.ts";

const EROUTE = /^E ?\d{1,3}$/;
/** A road number: "A24", "B2122", "M25", "A1(M)", "D243". */
const ROAD_REF = /^[A-Z]{1,3}\d{1,5}[A-Z]?(\(M\))?$/;
const GEOMETRY_TOLERANCE_M = 5;

const BEARINGS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const bearingWord = (degrees: number | undefined) =>
  degrees === undefined ? null : BEARINGS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]!;

const ORDINALS = ["first", "1st", "2nd", "3rd"];
export const ordinal = (n: number) => (n < ORDINALS.length && n > 0 ? ORDINALS[n]! : `${n}th`);

/** A street's name as written in a line: "Guildford Road (B2122)", "A24", "Bell Lane"; null when it has none. */
export function wayName(names: string[] | undefined): string | null {
  const clean = (names ?? []).map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const eroutes = clean.filter((n) => EROUTE.test(n)).map((n) => n.replace(/\s+/g, ""));
  const rest = clean.filter((n) => !EROUTE.test(n));
  if (rest.length === 0) return eroutes.join(" ");
  const refs = rest.filter((n) => ROAD_REF.test(n));
  const words = rest.filter((n) => !ROAD_REF.test(n));
  if (words.length > 0 && refs.length > 0) return `${words[0]} (${refs[0]})`;
  if (refs.length > 0) return eroutes.length > 0 ? `${refs[0]} (${eroutes.join(" ")})` : refs[0]!;
  return words[0]!;
}

/** "300 m", "1.2 km"; "200 yards", "0.4 miles". */
export function streetDistanceText(meters: number, units: RoadDistanceUnit): string {
  if (meters <= 0) return "";
  if (units === "miles") {
    const yards = meters * 1.093613;
    if (yards < 440) return `${Math.max(10, Math.round(yards / 10) * 10)} yards`;
    return roadDistanceText(meters, "miles");
  }
  if (meters < 1000) return `${Math.max(10, meters < 100 ? Math.round(meters / 10) * 10 : Math.round(meters / 50) * 50)} m`;
  return roadDistanceText(meters, "km");
}

const texts = (elements: Array<{ text: string }> | undefined) => (elements ?? []).map((e) => e.text.trim()).filter(Boolean);

const VERB: Record<Costing, string> = { auto: "Drive", bicycle: "Cycle", pedestrian: "Walk" };

interface Draft {
  kind: StreetLineKind;
  text: string;
  name: string | null;
  distanceM: number;
  durationS: number;
  at: [number, number];
}

/** Where a ferry leaves from (the street before it) and lands (the street after it). */
function ferryEnds(previous: Draft | undefined, next: Maneuver | undefined): { from: string | null; to: string | null } {
  return {
    from: previous && previous.kind !== "ferry" ? previous.name : null,
    to: next ? wayName(next.begin_street_names ?? next.street_names) : null,
  };
}

/** A manoeuvre on the water: Valhalla's "enter the ferry", or one it marks as having a ferry (not the landing). */
const onFerry = (m: Maneuver) => m.type === 28 || (m.ferry === true && m.type !== 29);

/** One manoeuvre in words; null when it adds nothing to the line before (and its distance joins that line). */
function lineFor(
  m: Maneuver,
  next: Maneuver | undefined,
  previous: Draft | undefined,
  costing: Costing,
): Omit<Draft, "distanceM" | "durationS" | "at"> | null {
  const name = wayName(m.street_names);
  // The street turned into, as signed where the manoeuvre is ("Church Street (B2450)"), before it becomes another.
  const atTurn = wayName(m.begin_street_names) ?? name;
  const onto = atTurn ? ` onto ${atTurn}` : "";
  const towardsList = texts(m.sign?.exit_toward_elements);
  const towards = towardsList.length > 0 ? ` towards ${towardsList.slice(0, 3).join(", ")}` : "";
  // The same road: the same name, or a European route alone on the road it was given with ("E05" after "M42 (E05)").
  const same = name !== null && (previous?.name === name || (EROUTE.test(name) && (previous?.name ?? "").includes(`(${name})`)));
  switch (m.type) {
    case 1:
    case 2:
    case 3: {
      const way = bearingWord(m.bearing_after);
      return { kind: "start", text: `${VERB[costing]}${way ? ` ${way}` : ""}${name ? ` on ${name}` : ""}`, name };
    }
    case 4:
      return { kind: "arrive", text: "Arrive at the end", name: null };
    case 5:
      return { kind: "arrive", text: "Arrive at the end, on the right", name: null };
    case 6:
      return { kind: "arrive", text: "Arrive at the end, on the left", name: null };
    case 7:
    case 8:
      return same ? null : { kind: "continue", text: name ? `Continue on ${name}` : "Continue", name };
    case 9:
    case 16: {
      if (same && m.length < 0.1) return null;
      const side = m.type === 9 ? "right" : "left";
      return { kind: "turn", text: same ? `Bear ${side} to stay on ${name}` : `Bear ${side}${onto}`, name };
    }
    case 10:
    case 15: {
      const side = m.type === 10 ? "right" : "left";
      return { kind: "turn", text: same ? `Turn ${side} to stay on ${name}` : `Turn ${side}${onto}`, name };
    }
    case 11:
    case 14:
      return { kind: "turn", text: `Turn sharp ${m.type === 11 ? "right" : "left"}${onto}`, name };
    case 12:
    case 13:
      return { kind: "turn", text: `Make a U-turn${onto}`, name };
    case 17:
    case 18:
    case 19: {
      const side = m.type === 18 ? " on the right" : m.type === 19 ? " on the left" : "";
      const branch = texts(m.sign?.exit_branch_elements)[0];
      return { kind: "exit", text: `Take the slip road${side}${name ? onto : branch ? ` onto ${branch}` : ""}${towards}`, name };
    }
    case 20:
    case 21: {
      const number = texts(m.sign?.exit_number_elements)[0];
      const exitName = texts(m.sign?.exit_name_elements)[0];
      const branch = texts(m.sign?.exit_branch_elements)[0];
      const target = name ?? branch ?? null;
      return {
        kind: "exit",
        text: `Take ${number ? `exit ${number}` : `the exit on the ${m.type === 20 ? "right" : "left"}`}${exitName ? ` (${exitName})` : ""}${target ? ` onto ${target}` : ""}${towards}`,
        name,
      };
    }
    case 22:
    case 23:
    case 24: {
      const side = m.type === 23 ? "right" : m.type === 24 ? "left" : "straight on";
      const number = texts(m.sign?.exit_number_elements)[0];
      if (same && !towards && !number) return null;
      const lead = m.type === 22 ? "Keep straight on" : `Keep ${side}`;
      if (number) return { kind: "exit", text: `${lead} for exit ${number}${onto}${towards}`, name };
      return { kind: "keep", text: same ? `${lead} to stay on ${name}${towards}` : `${lead}${onto}${towards}`, name };
    }
    case 25:
    case 37:
    case 38:
      return { kind: "join", text: name ? `Join ${name}` : "Merge", name };
    case 26: {
      const exitNames = next?.type === 27 ? wayName(next.begin_street_names ?? next.street_names) : null;
      const count = m.roundabout_exit_count;
      return {
        kind: "roundabout",
        text: `At the roundabout, take the ${count ? ordinal(count) : "next"} exit${exitNames ? ` onto ${exitNames}` : ""}`,
        name: next?.type === 27 ? wayName(next.street_names) : null,
      };
    }
    case 27:
      return previous?.kind === "roundabout" ? null : { kind: "roundabout", text: `Leave the roundabout${onto}`, name };
    case 28: {
      const { from, to } = ferryEnds(previous, next);
      return {
        kind: "ferry",
        text: `Take the ferry${name ? ` (${name})` : ""}${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}. Check it is running: it may not be in a power cut`,
        name,
      };
    }
    case 29:
      return { kind: "ferry", text: `Leave the ferry${onto}`, name };
    case 39:
      return { kind: "steps", text: "Take the lift", name: null };
    case 40:
      return { kind: "steps", text: "Take the steps", name: null };
    case 41:
      return { kind: "steps", text: "Take the escalator", name: null };
    case 42:
      return { kind: "other", text: "Go into the building", name: null };
    case 43:
      return { kind: "other", text: "Leave the building", name: null };
    default: {
      const said = m.instruction.trim().replace(/\.$/, "");
      return said ? { kind: "other", text: said, name } : null;
    }
  }
}

/** "Join Kingston Road (B2430), then the main roads below": where the streets from a door meet Outpost's main-road lines. */
function joinMainRoad(street: string | null, mainRoad: string | null): string {
  // The street of the last turn, only when it is the main road ("Leatherhead Road (A24)"); a side street just short of it is not.
  const carries = street !== null && (mainRoad === null || street === mainRoad || street.includes(`(${mainRoad})`));
  const road = carries ? street : mainRoad;
  if (!road) return "Then the main roads below";
  return `Join ${ROAD_REF.test(road) ? `the ${road}` : road}, then the main roads below`;
}

/**
 * The lines for a Valhalla route. `viaNames` names the points between legs (for walks and
 * rides through via points): each leg's arrival there becomes a "Via …" line. With
 * `endsOnMainRoad` (the start of a door-to-door drive, given the main road it meets, or
 * null), the arrival is where the main-road lines take over, not the end.
 */
export function streetDirections(
  reply: RouteReply,
  options: { units: RoadDistanceUnit; costing: Costing; viaNames?: Array<string | null>; endsOnMainRoad?: string | null },
): StreetDirections {
  const lines: Draft[] = [];
  const ferries: StreetFerry[] = [];
  const coordinates: Array<[number, number]> = [];
  const legs = reply.trip.legs;
  legs.forEach((leg, legIndex) => {
    const shape = decodePolyline6(leg.shape);
    coordinates.push(...(coordinates.length > 0 ? shape.slice(1) : shape));
    const last = legIndex === legs.length - 1;
    leg.maneuvers.forEach((m, i) => {
      const at = shape[Math.min(m.begin_shape_index, shape.length - 1)] ?? shape[0] ?? [0, 0];
      const previous = lines.at(-1);
      if (onFerry(m)) {
        const { from, to } = ferryEnds(previous, leg.maneuvers[i + 1]);
        const along = shape.slice(m.begin_shape_index, m.end_shape_index + 1).map(([x, y]): [number, number] => [round5(x), round5(y)]);
        if (along.length >= 2)
          ferries.push({ from, to, name: wayName(m.street_names), distanceM: Math.round(m.length * 1000), coordinates: along });
      }
      let drafted = lineFor(m, leg.maneuvers[i + 1], previous, options.costing);
      if (drafted && !last && (m.type === 4 || m.type === 5 || m.type === 6)) {
        // Named as the main-road planner names it: a name for its role only ("via") or its position is none, and the street it is on says where.
        const viaName = ownName(options.viaNames?.[legIndex]) ?? previous?.name ?? wayName(m.street_names);
        drafted = { kind: "via", text: viaName ? `Via ${viaName}` : `Via point ${legIndex + 1}`, name: null };
      } else if (drafted && last && options.endsOnMainRoad !== undefined && (m.type === 4 || m.type === 5 || m.type === 6)) {
        const street = previous?.name ?? wayName(m.street_names);
        drafted = { kind: "arrive", text: joinMainRoad(street, options.endsOnMainRoad), name: null };
      }
      if (!drafted) {
        if (previous) {
          previous.distanceM += m.length * 1000;
          previous.durationS += m.time;
        }
        return;
      }
      lines.push({ ...drafted, distanceM: m.length * 1000, durationS: m.time, at: [round5(at[0]), round5(at[1])] });
    });
  });
  const flat: number[] = [];
  for (const [lon, lat] of coordinates) flat.push(Math.round(lat * 1e7), Math.round(lon * 1e7));
  const keep = coordinates.length > 2 ? simplifyIndices(flat, GEOMETRY_TOLERANCE_M) : coordinates.map((_, i) => i);
  const out: StreetLine[] = lines.map((line) => ({
    kind: line.kind,
    text: line.text,
    distanceM: Math.round(line.distanceM),
    durationS: Math.round(line.durationS),
    distanceText: streetDistanceText(line.distanceM, options.units),
    at: line.at,
  }));
  return {
    lines: out,
    distanceM: Math.round(reply.trip.summary.length * 1000),
    durationS: Math.round(reply.trip.summary.time),
    geometry: { type: "LineString", coordinates: keep.map((i) => [round5(coordinates[i]![0]), round5(coordinates[i]![1])]) },
    ferries,
  };
}

/**
 * What to say when a route still takes a ferry, though Outpost asks for routes without
 * them: there is no other way on the streets built, or only a far longer one.
 */
export function ferryWarnings(directions: Array<StreetDirections | null>, way: string, units: RoadDistanceUnit): string[] {
  return directions
    .flatMap((part) => part?.ferries ?? [])
    .map((ferry) => {
      const what = ferry.name ? `a ferry (${ferry.name})` : "a ferry";
      const ends = `${ferry.from ? ` from ${ferry.from}` : ""}${ferry.to ? ` to ${ferry.to}` : ""}`;
      const far = streetDistanceText(ferry.distanceM, units);
      return `${way} takes ${what}${ends}, ${far} on the water: Outpost avoids ferries, so there is no other way on the streets built, or only a much longer one. Check the ferry is running before you set off; it may not be in a power cut.`;
    });
}

const round5 = (value: number) => Math.round(value * 1e5) / 1e5;
