/**
 * How the workspace writes a scenario's figures: metres or kilometres first with miles
 * beside them, each to two significant figures, so that nothing claims more precision
 * than the curves it came from.
 */
import { type EffectRing, type EffectsInput, type FalloutContour, MILE, roundDistance } from "@outpost/shared";

const sig2 = (value: number) => {
  if (!(value > 0)) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
};
const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 3 });

/** "4.5 km (2.8 mi)", "640 m (0.4 mi)". The metres are already rounded by the caller or are rounded here. */
export function distanceText(metres: number): string {
  const rounded = roundDistance(metres);
  const metric = rounded >= 1000 ? `${number(rounded / 1000)} km` : `${number(rounded)} m`;
  return `${metric} (${number(sig2(metres / MILE))} mi)`;
}

/** "15 kilotons", "1.2 megatons". */
export function yieldText(yieldKt: number): string {
  if (yieldKt >= 1000) {
    const mt = yieldKt / 1000;
    return `${number(mt)} megaton${mt === 1 ? "" : "s"}`;
  }
  return `${number(yieldKt)} kiloton${yieldKt === 1 ? "" : "s"}`;
}

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const compass = (degrees: number) => POINTS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]!;

/** The burst as typed: "surface burst", "air burst at 500 m", "air burst at the height that carries 5 psi farthest". */
export function burstText(effects: EffectsInput, heightM?: number): string {
  const { burst } = effects;
  if (burst.kind === "surface") return "surface burst";
  if (burst.kind === "height") return `air burst at ${distanceText(burst.metres).replace(/ \(.*$/, "")}`;
  return `air burst at the height that carries ${burst.psi} psi farthest${heightM ? ` (${distanceText(heightM).replace(/ \(.*$/, "")})` : ""}`;
}

export function windText(effects: EffectsInput): string {
  if (!effects.wind) return "no wind given";
  const mph = effects.wind.kmh / 1.609344;
  return `wind from the ${compass(effects.wind.fromDegrees)} (${Math.round(effects.wind.fromDegrees)}°) at ${Math.round(effects.wind.kmh)} km/h (${Math.round(mph)} mph)`;
}

/** One saved place against a scenario, in a sentence. */
export function placeSentence(distance: number, rings: EffectRing[], contours: FalloutContour[]): string {
  const where = `${distanceText(distance)} from ground zero.`;
  const damage = rings.filter((ring) => ring.family !== "fireball" && ring.family !== "crater");
  const inside =
    rings.some((ring) => ring.family === "fireball") || rings.some((ring) => ring.family === "crater")
      ? " Inside the fireball or crater."
      : damage.length === 0
        ? " Outside every ring this model draws."
        : ` Inside the ${listText(damage.map((ring) => ring.label.replace(/^./, (c) => c.toLowerCase())))} ${damage.length === 1 ? "ring" : "rings"}.`;
  const fallout =
    contours.length > 0
      ? ` Inside the idealised fallout contour of ${Math.max(...contours.map((contour) => contour.rate)).toLocaleString("en-GB")} rads per hour at one hour.`
      : "";
  return `${where}${inside}${fallout}`;
}

export function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
