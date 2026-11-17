/**
 * The allotment's words: how long things take, how long the household was away, what a
 * bed is called aloud and what it is doing, the months a crop is sown and grown in, and
 * what an action did. Plain functions, tested on their own.
 */
import {
  type AllotmentAction,
  type AllotmentState,
  bedAt,
  bedName,
  bedNow,
  CROPS,
  type CropId,
  calendarMonth,
  DAY,
  type Hemisphere,
  HOUR,
  ITEM_IDS,
  inSeason,
  isGlassBed,
  itemName,
  KEEPING_IDS,
  KEEPING_NAMES,
  lastGrowingMonth,
  MINUTE,
  MONTH_NAMES,
  type Month,
  monthAt,
  nextGrowingMonth,
  readyInMs,
  type Season,
  sowingMonth,
  stageOf,
  THINGS,
  WATER_LASTS_MS,
} from "@outpost/shared/games/allotment";
import { formatNumber, plural } from "@/lib/utils";

/** A crop's time to grow, as the stall says it: "4 minutes", "2 hours", "1 day". */
export function growWords(ms: number): string {
  if (ms < HOUR) return plural(Math.round(ms / MINUTE), "minute");
  if (ms < DAY) return plural(Math.round(ms / HOUR), "hour");
  return plural(Math.round((ms / DAY) * 2) / 2, "day");
}

/** "about 40 minutes", "about 3 hours", "about 2 days", or "less than a minute". */
export function aboutWords(ms: number): string {
  if (ms < MINUTE) return "less than a minute";
  if (ms < HOUR) return `about ${plural(Math.max(1, Math.round(ms / MINUTE)), "minute")}`;
  if (ms < 2 * DAY) return `about ${plural(Math.round(ms / HOUR), "hour")}`;
  return `about ${plural(Math.round(ms / DAY), "day")}`;
}

/** The time left, short enough for the label on a bed: "3 min", "5 hr", "2 days". */
export function shortWords(ms: number): string {
  if (ms < MINUTE) return "<1 min";
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} hr`;
  return plural(Math.round(ms / DAY), "day");
}

/** "1 year and 35 days", "3 days and 4 hours", "7 hours". */
export function awayWords(ms: number): string {
  const hours = Math.floor(ms / HOUR);
  const days = Math.floor(hours / 24);
  const years = Math.floor(days / 365);
  const and = (a: string, b: string | null) => (b ? `${a} and ${b}` : a);
  if (years > 0) return and(plural(years, "year"), days % 365 ? plural(days % 365, "day") : null);
  if (days > 0) return and(plural(days, "day"), hours % 24 ? plural(hours % 24, "hour") : null);
  return plural(Math.max(1, hours), "hour");
}

export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const SEASON_WORDS: Record<Season, string> = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };

// ── Months ─────────────────────────────────────────────────────────────────

/** A British month as the household's calendar names it: March is "September" in the south. */
export const monthName = (month: Month, hemisphere: Hemisphere) => MONTH_NAMES[calendarMonth(month, hemisphere) - 1]!;
/** "Mar", for the label on a bed. */
export const monthShort = (month: Month, hemisphere: Hemisphere) => monthName(month, hemisphere).slice(0, 3);

/**
 * A set of British months as the household's calendar says them, in runs: "February to
 * July", "October to August", "February, March and October to December", "all year".
 */
export function monthsWords(months: readonly Month[], hemisphere: Hemisphere): string {
  if (months.length === 0) return "never";
  if (months.length >= 12) return "all year";
  const has = new Set<number>(months.map((m) => calendarMonth(m, hemisphere)));
  // Start from a month whose previous month is missing, so a run over the new year stays whole.
  let first = 1;
  while (has.has(((first + 10) % 12) + 1) || !has.has(first)) first = (first % 12) + 1;
  const runs: Array<[number, number]> = [];
  for (let step = 0; step < 12; step++) {
    const m = ((first - 1 + step) % 12) + 1;
    if (!has.has(m)) continue;
    const last = runs.at(-1);
    if (last && (last[1] % 12) + 1 === m) last[1] = m;
    else runs.push([m, m]);
  }
  runs.sort((a, b) => a[0] - b[0]);
  const name = (m: number) => MONTH_NAMES[m - 1]!;
  const parts = runs.map(([a, b]) => (a === b ? name(a) : `${name(a)} to ${name(b)}`));
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * What sowing a crop now means, said before the press: in its time, late, or waiting.
 * "Sown February to July." / "Sown now, they wait in the ground until February." Never a
 * refusal: waiting is part of it.
 */
export function sowNote(crop: CropId, month: Month, underGlass: boolean, hemisphere: Hemisphere): string {
  const c = CROPS[crop];
  // "Sown February to July": lower-cased only at its first letter, never in the month names.
  const sown = `Sown ${monthsWords(c.sow, hemisphere)}`;
  if (underGlass) return `${sown} outdoors; under glass ${c.be === "is" ? "it grows" : "they grow"} now.`;
  const they = c.be === "is" ? "it" : "they";
  if (!inSeason(crop, month))
    return `Sown now, ${they} ${c.be === "is" ? "waits" : "wait"} in the ground until ${monthName(nextGrowingMonth(crop, month), hemisphere)}.`;
  if (sowingMonth(crop, month)) return `${sown}: a good time now.`;
  const until = lastGrowingMonth(crop, month);
  if (c.grows.length >= 12)
    return `Not the usual time (s${sown.slice(1)}), but ${they} ${c.be === "is" ? "grows" : "grow"} in every month.`;
  return `Not the usual time (s${sown.slice(1)}), but ${they} would grow now, until the end of ${monthName(until, hemisphere)}.`;
}

// ── A bed ──────────────────────────────────────────────────────────────────

/** What a bed's label shows: the time left, "Ripe", or why it waits, with a mark for which. */
export interface Chip {
  mark: "ripe" | "time" | "water" | "season";
  text: string;
}

export function chip(plot: AllotmentState, index: number, hemisphere: Hemisphere): Chip | null {
  const bed = bedAt(plot, index);
  if (!bed?.crop) return null;
  const now = bedNow(plot, index, hemisphere);
  if (now.stage === "ripe") return { mark: "ripe", text: "Ripe" };
  if (now.waitsFor === "season") return { mark: "season", text: `Till ${monthShort(now.resumes!, hemisphere)}` };
  if (now.waitsFor === "water") return { mark: "water", text: "Dry" };
  const left = readyInMs(plot, index, hemisphere);
  // Under glass, a crop whose water will run out before it ripens says only that it grows.
  return { mark: "time", text: left === null ? "Growing" : shortWords(left) };
}

/** Why a bed waits, in the words of its label: "waiting for rain", "waiting for March". */
function waitingWords(plot: AllotmentState, index: number, hemisphere: Hemisphere): string | null {
  const now = bedNow(plot, index, hemisphere);
  if (now.waitsFor === "season") return `waiting for ${monthName(now.resumes!, hemisphere)}`;
  if (now.waitsFor === "water") return isGlassBed(index) ? "waiting for water" : "waiting for rain";
  return null;
}

/** "Bed 5, peas, growing, ready in about 40 minutes, moist", "Bed 2, carrots, shoots, waiting for rain, dry", "Bed 2, empty". */
export function bedLabel(plot: AllotmentState, index: number, hemisphere: Hemisphere): string {
  const bed = bedAt(plot, index);
  if (!bed) return bedName(index);
  const where = isGlassBed(index) ? `${bedName(index)}, under glass` : bedName(index);
  const now = bedNow(plot, index, hemisphere);
  const soil = now.moist ? "moist" : "dry";
  if (!bed.crop) return `${where}, empty, ${soil}`;
  const stage = stageOf(bed);
  const parts = [where, CROPS[bed.crop].name, stage === "sown" ? "just sown" : stage];
  if (stage !== "ripe") {
    const left = readyInMs(plot, index, hemisphere);
    parts.push(waitingWords(plot, index, hemisphere) ?? (left === null ? "needs more water to ripen" : `ready in ${aboutWords(left)}`));
    parts.push(soil);
  }
  if (bed.composted) parts.push("with compost");
  return parts.join(", ");
}

/** How long the soil stays moist, in words: "for about 9 hours more". */
const forMore = (plot: AllotmentState, dryAt: number | null) => (dryAt === null ? "" : `, for ${aboutWords(dryAt - plot.clock)} more`);

/** Why the soil is moist, in a clause: "watered", "it is raining", "the water butt keeps it watered". */
function moistWords(plot: AllotmentState, index: number, hemisphere: Hemisphere): string | null {
  const now = bedNow(plot, index, hemisphere);
  switch (now.moist) {
    case "can":
      // The can's own time: rain due after it may keep the bed moist for longer.
      return `the soil is moist from the can${forMore(plot, bedAt(plot, index)!.wetUntil)}`;
    case "raining":
      return "it is raining on the plot";
    case "rain":
      return `the soil is still moist from the rain${forMore(plot, now.dryAt)}`;
    case "butt":
      return `the water butt is keeping it watered${forMore(plot, now.dryAt)}`;
    default:
      return null;
  }
}

/**
 * What a bed is doing and what would change it, in one sentence, for its panel: "Growing:
 * the soil is moist from the can, for about 9 hours more." "Waiting for rain: the soil is
 * dry. Water it to grow now; rain is due in about 2 days."
 */
export function bedSentence(plot: AllotmentState, index: number, hemisphere: Hemisphere): string {
  const bed = bedAt(plot, index);
  if (!bed) return "";
  const now = bedNow(plot, index, hemisphere);
  const glass = isGlassBed(index);
  const moist = moistWords(plot, index, hemisphere);
  if (!bed.crop) return moist ? `Empty, and ${moist}.` : "Empty, and the soil is dry.";
  const crop = CROPS[bed.crop];
  const they = crop.be === "is" ? "it" : "they";
  if (now.stage === "ripe") return `Ripe, and ${crop.be === "is" ? "waits" : "wait"} to be picked for as long as it takes.`;
  if (now.waitsFor === "season") {
    const from = monthName(now.resumes!, hemisphere);
    const [grows, rests, its] = crop.be === "is" ? ["grows", "rests", "its"] : ["grow", "rest", "their"];
    return `Waiting for ${from}: ${crop.name} ${grows} ${monthsWords(crop.grows, hemisphere)}, so ${they} ${rests} in the ground with all ${its} growth until then.`;
  }
  if (now.waitsFor === "water") {
    if (glass) return "Waiting for water: no rain falls under glass. Water it and it grows for 12 hours.";
    const rain = now.rainAt === null ? "" : `; rain is due in ${aboutWords(now.rainAt - plot.clock)}`;
    return `Waiting for rain: the soil is dry. Water it to grow now${rain}.`;
  }
  return `Growing: ${moist ?? "the soil is moist"}.`;
}

/** "3 beds ripe, 4 eggs waiting", or null when nothing is ready. */
export function readyWords(plot: AllotmentState): string | null {
  const parts: string[] = [];
  const ripe = [...plot.beds, ...plot.glassBeds].filter((bed) => stageOf(bed) === "ripe").length;
  if (ripe > 0) parts.push(`${plural(ripe, "bed")} ripe`);
  for (const kind of KEEPING_IDS) {
    const n = plot.waiting[kind];
    if (n > 0) parts.push(`${formatNumber(n)} ${n === 1 ? KEEPING_NAMES[kind].one : KEEPING_NAMES[kind].many} waiting`);
  }
  return parts.length ? parts.join(", ") : null;
}

/** What the collect button gathers: "4 eggs and 1 jar of honey". */
export function collectWords(plot: AllotmentState): string {
  const parts = KEEPING_IDS.filter((kind) => plot.waiting[kind] > 0).map((kind) => itemCount(kind, plot.waiting[kind]));
  return parts.length <= 1 ? (parts[0] ?? "nothing") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** "6 carrots", "1 jar of honey". */
export const itemCount = (item: (typeof ITEM_IDS)[number], n: number) => `${formatNumber(n)} ${itemName(item, n)}`;

/** What an action did, said in the live region after it: "Sowed radishes in bed 1." */
export function doneWords(action: AllotmentAction, before: AllotmentState, after: AllotmentState, hemisphere: Hemisphere): string {
  const coins = after.coins - before.coins;
  const gained = ITEM_IDS.filter((item) => after.basket[item] > before.basket[item]).map((item) =>
    itemCount(item, after.basket[item] - before.basket[item]),
  );
  const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "nothing") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
  switch (action.type) {
    case "sow": {
      const crop = CROPS[action.crop];
      const month = monthAt(after.clock, hemisphere);
      const waits =
        !isGlassBed(action.bed) && !inSeason(action.crop, month)
          ? ` ${capital(crop.be === "is" ? "it waits" : "they wait")} in the ground until ${monthName(nextGrowingMonth(action.crop, month), hemisphere)}.`
          : "";
      return `Sowed ${crop.name} in ${bedName(action.bed).toLowerCase()}${coins < 0 ? ` for ${plural(-coins, "coin")}` : ""}.${waits}`;
    }
    case "water":
      return `Watered ${bedName(action.bed).toLowerCase()}: moist for ${growWords(WATER_LASTS_MS)}.`;
    case "harvest":
      return `Harvested ${list(gained)} from ${bedName(action.bed).toLowerCase()}.`;
    case "harvestAll":
      return `Harvested ${list(gained)}.`;
    case "collect":
      return `Collected ${list(gained)}.`;
    case "sell":
    case "sellAll":
      return `Sold for ${plural(coins, "coin")}. ${plural(after.coins, "coin")} in all.`;
    case "buyBed":
      return `Dug bed ${after.beds.length} for ${plural(-coins, "coin")}.`;
    case "buy":
      return `Bought the ${THINGS[action.thing].name.toLowerCase()} for ${plural(-coins, "coin")}.`;
    case "setHemisphere":
      return "Hemisphere changed.";
  }
}
