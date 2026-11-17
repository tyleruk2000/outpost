/**
 * The allotment's words: how long things take, how long the household was away, what a
 * bed is called aloud, and what an action did. Plain functions, tested on their own.
 */
import {
  type AllotmentAction,
  type AllotmentState,
  bedAt,
  bedName,
  CROPS,
  DAY,
  type Hemisphere,
  HOUR,
  ITEM_IDS,
  isGlassBed,
  itemName,
  KEEPING_IDS,
  KEEPING_NAMES,
  MINUTE,
  readyInMs,
  type Season,
  stageOf,
  THINGS,
} from "@outpost/shared/games/allotment";
import { formatNumber, plural } from "@/lib/utils";

/** A crop's time to grow, as the stall says it: "4 minutes", "2 hours", "1 day". */
export function growWords(ms: number): string {
  if (ms < HOUR) return plural(Math.round(ms / MINUTE), "minute");
  if (ms < DAY) return plural(Math.round(ms / HOUR), "hour");
  return plural(Math.round(ms / DAY), "day");
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

/** "Bed 5, peas, growing, ready in about 40 minutes, watered", "Bed 3, carrots, ripe", "Bed 2, empty". */
export function bedLabel(plot: AllotmentState, index: number, hemisphere: Hemisphere): string {
  const bed = bedAt(plot, index);
  if (!bed) return bedName(index);
  const where = isGlassBed(index) ? `${bedName(index)}, under glass` : bedName(index);
  if (!bed.crop) return `${where}, empty`;
  const stage = stageOf(bed);
  const parts = [where, CROPS[bed.crop].name, stage === "sown" ? "just sown" : stage];
  if (stage !== "ripe") parts.push(`ready in ${aboutWords(readyInMs(plot, index, hemisphere) ?? 0)}`);
  if (bed.watered && stage !== "ripe") parts.push("watered");
  if (bed.composted) parts.push("with compost");
  return parts.join(", ");
}

export const SEASON_WORDS: Record<Season, string> = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };

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
export function doneWords(action: AllotmentAction, before: AllotmentState, after: AllotmentState): string {
  const coins = after.coins - before.coins;
  const gained = ITEM_IDS.filter((item) => after.basket[item] > before.basket[item]).map((item) =>
    itemCount(item, after.basket[item] - before.basket[item]),
  );
  const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "nothing") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
  switch (action.type) {
    case "sow":
      return `Sowed ${CROPS[action.crop].name} in ${bedName(action.bed).toLowerCase()}${coins < 0 ? ` for ${plural(-coins, "coin")}` : ""}.`;
    case "water":
      return `Watered ${bedName(action.bed).toLowerCase()}.`;
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
