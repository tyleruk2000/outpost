/**
 * The allotment's engine (packages/shared/src/games/allotment), run with the server's
 * tests as the Morse engine's are. A crop grows only in its own months and while its bed
 * is moist, and otherwise waits, keeping its growth. Nothing is lost to time, a clock that
 * jumps back un-grows nothing, every count stops at its cap, rain comes from the date
 * alone, and a year away gives exactly what a year of small steps would. A plot saved
 * before these rules loads into them losing nothing.
 */
import {
  type AllotmentAction,
  AllotmentRefusal,
  type AllotmentState,
  advance,
  applyAction,
  BASKET_CAP,
  BUTT_KEEPS_MS,
  bedAt,
  bedNow,
  COIN_CAP,
  CROP_IDS,
  CROP_NOTES,
  CROPS,
  calendarMonth,
  DAY,
  HOUR,
  ITEM_IDS,
  inSeason,
  MINUTE,
  type Month,
  monthAt,
  newAllotment,
  nextBedPrice,
  nextGrowingMonth,
  PRODUCER,
  RAIN_CHANCE,
  RAIN_SOAKS_MS,
  rainingAt,
  readAllotment,
  readyInMs,
  resolveHemisphere,
  seasonAt,
  sowingMonth,
  stageOf,
  THINGS,
  untilChangeMs,
  WATER_LASTS_MS,
  wetDay,
} from "@outpost/shared/games/allotment";
import { describe, expect, it } from "vitest";

/** 1 January 2026, winter in the north. */
const T0 = Date.UTC(2026, 0, 1);
/** 1 April 2026, spring in the north, autumn in the south. */
const APRIL = Date.UTC(2026, 3, 1);
/** 17 November 2026, the day these rules were made: autumn in the north. */
const NOV = Date.UTC(2026, 10, 17, 9);

const act = (state: AllotmentState, action: AllotmentAction, now: number, hemisphere: "north" | "south" = "north") =>
  applyAction(state, action, now, hemisphere);

/** A plot with this many coins, for buying things. */
const rich = (now: number, coins = 5000) => ({ ...newAllotment(now), coins });

const dayOf = (t: number) => Math.floor(t / DAY);
/** The first moment at or after `t` that starts a dry day (or a wet one) in this hemisphere. */
function nextDay(t: number, wet: boolean, hemisphere: "north" | "south" = "north"): number {
  for (let day = Math.ceil(t / DAY); ; day++) if (wetDay(day, hemisphere) === wet) return day * DAY;
}
/** The start of a wet day at or after `t` that follows two dry ones, so that no earlier rain is still soaking the beds. */
function freshRain(t: number, hemisphere: "north" | "south" = "north"): number {
  for (let day = Math.ceil(t / DAY) + 2; ; day++)
    if (wetDay(day, hemisphere) && !wetDay(day - 1, hemisphere) && !wetDay(day - 2, hemisphere)) return day * DAY;
}
/** The first moment at or after `t` with a dry day and the day before it dry too: no rain is soaking any bed. */
function dryStretch(t: number, days = 2, hemisphere: "north" | "south" = "north"): number {
  for (let day = Math.ceil(t / DAY) + 1; ; day++) {
    let dry = true;
    for (let back = -2; back < days; back++) if (wetDay(day + back, hemisphere)) dry = false;
    if (dry) return day * DAY;
  }
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AllotmentRefusal);
    return (error as Error).message;
  }
  throw new Error("It was not refused.");
}

/** Every number in the plot, with where it is. */
function numbers(value: unknown, at = "plot"): Array<[string, number]> {
  if (typeof value === "number") return [[at, value]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, inner]) => numbers(inner, `${at}.${key}`));
  return [];
}

/** Waters a bed every time its water runs out until it is ripe; returns the plot and the time. */
function tend(plot: AllotmentState, bed: number, at: number, hemisphere: "north" | "south" = "north"): [AllotmentState, number] {
  let t = at;
  for (let i = 0; i < 400 && stageOf(bedAt(advance(plot, t, hemisphere), bed)!) !== "ripe"; i++) {
    plot = act(plot, { type: "water", bed }, t, hemisphere);
    t += WATER_LASTS_MS;
  }
  return [plot, t];
}

describe("a new plot", () => {
  it("has 10 coins, four empty beds and nothing else, and is small", () => {
    const plot = newAllotment(T0);
    expect(plot.v).toBe(2);
    expect(plot.coins).toBe(10);
    expect(plot.beds).toHaveLength(4);
    expect(plot.beds.every((bed) => stageOf(bed) === "empty" && bed.wetUntil === 0)).toBe(true);
    expect(plot.glassBeds).toEqual([]);
    expect(Object.values(plot.things).some(Boolean)).toBe(false);
    expect(readAllotment(plot)).toEqual(plot);
    expect(JSON.stringify(plot).length).toBeLessThan(4096);
  });
});

describe("the crops and their months", () => {
  it("has twelve crops, each with its real months and a page they come from", () => {
    expect(CROP_IDS).toHaveLength(12);
    for (const id of CROP_IDS) {
      const crop = CROPS[id];
      // Every month it is sown or harvested in is a month it grows in.
      for (const m of [...crop.sow, ...crop.harvest]) expect(crop.grows, `${id} ${m}`).toContain(m);
      expect(CROP_NOTES[id].source).toMatch(/^https:\/\/www\.rhs\.org\.uk\/vegetables\/[a-z-]+\/grow-your-own$/);
      expect(CROP_NOTES[id].facts.length).toBeGreaterThan(0);
    }
    // As the RHS gives them (read 17 November 2026).
    expect(CROPS.carrots.sow).toEqual([2, 3, 4, 5, 6, 7]);
    expect(CROPS.carrots.harvest).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(CROPS.garlic.sow).toEqual([2, 3, 10, 11, 12]);
    expect(CROPS.broadBeans.sow).toEqual([2, 3, 4, 5, 10, 11]);
    expect(CROPS.squash.grows).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it("leaves something to sow and something growing in the open in every month", () => {
    for (let m = 1 as Month; m <= 12; m = (m + 1) as Month) {
      expect(
        CROP_IDS.filter((id) => sowingMonth(id, m)),
        `sow in ${m}`,
      ).not.toEqual([]);
      expect(
        CROP_IDS.filter((id) => inSeason(id, m)),
        `grows in ${m}`,
      ).not.toEqual([]);
    }
    // Midwinter is for the hardy ones.
    expect(CROP_IDS.filter((id) => inSeason(id, 1))).toEqual(["onions", "kale", "broadBeans", "leeks", "garlic"]);
    expect(nextGrowingMonth("radishes", 11)).toBe(3);
    expect(nextGrowingMonth("carrots", 12)).toBe(2);
  });
});

describe("seasons", () => {
  it("come from the UTC month, shifted by six months in the south", () => {
    expect(seasonAt(Date.UTC(2026, 2, 1), "north")).toBe("spring");
    expect(seasonAt(Date.UTC(2026, 5, 30), "north")).toBe("summer");
    expect(seasonAt(Date.UTC(2026, 8, 1), "north")).toBe("autumn");
    expect(seasonAt(Date.UTC(2026, 11, 31), "north")).toBe("winter");
    expect(seasonAt(Date.UTC(2026, 1, 28), "north")).toBe("winter");
    expect(seasonAt(Date.UTC(2026, 2, 1), "south")).toBe("autumn");
    expect(seasonAt(Date.UTC(2026, 6, 1), "south")).toBe("winter");
    expect(seasonAt(Date.UTC(2026, 0, 1), "south")).toBe("summer");
    // A southern November is a British May; a British March falls in September there.
    expect(monthAt(Date.UTC(2026, 10, 5), "south")).toBe(5);
    expect(calendarMonth(3, "south")).toBe(9);
    expect(calendarMonth(3, "north")).toBe(3);
  });

  it("take the hemisphere from the setting, then the home place, then the north", () => {
    expect(resolveHemisphere("south", 51)).toEqual({ hemisphere: "south", from: "setting" });
    expect(resolveHemisphere("auto", -33.9)).toEqual({ hemisphere: "south", from: "home place" });
    expect(resolveHemisphere("auto", 0)).toEqual({ hemisphere: "north", from: "home place" });
    expect(resolveHemisphere("auto", null)).toEqual({ hemisphere: "north", from: "default" });
  });
});

describe("rain", () => {
  it("is the same for the same date, every time", () => {
    const days = Array.from({ length: 30 }, (_, i) => dayOf(Date.UTC(2026, 10, 1)) + i);
    const once = days.map((day) => wetDay(day, "north"));
    expect(days.map((day) => wetDay(day, "north"))).toEqual(once);
    // Pinned, so that a change to the weather is a change someone meant: November 2026 in the north.
    expect(once.map((wet) => (wet ? "w" : ".")).join("")).toBe("ww..wwww..wwww.w...www....w.ww");
    expect(rainingAt(days[3]! * DAY + 5 * HOUR, "north")).toBe(once[3]);
  });

  it("falls more often in the wetter months, the south's six months on", () => {
    const share = (month: number, hemisphere: "north" | "south") => {
      let wet = 0;
      let all = 0;
      for (let year = 2020; year < 2060; year++) {
        for (let day = dayOf(Date.UTC(year, month, 1)); day < dayOf(Date.UTC(year, month + 1, 1)); day++) {
          all++;
          if (wetDay(day, hemisphere)) wet++;
        }
      }
      return wet / all;
    };
    const north = Array.from({ length: 12 }, (_, m) => share(m, "north"));
    for (const [m, value] of north.entries()) expect(Math.abs(value - RAIN_CHANCE[m]!), `month ${m + 1}`).toBeLessThan(0.04);
    expect(north[11]!).toBeGreaterThan(north[4]! + 0.1);
    // In the south, June is wet as a British December is, and December dry as May.
    expect(share(5, "south")).toBeGreaterThan(share(11, "south") + 0.1);
  });
});

describe("growing", () => {
  it("ripens radishes in 4 minutes of moist soil in season, through the stages", () => {
    const at = dryStretch(APRIL);
    let plot = act(newAllotment(at), { type: "sow", bed: 0, crop: "radishes" }, at);
    expect(plot.coins).toBe(10);
    plot = act(plot, { type: "water", bed: 0 }, at);
    expect(stageOf(plot.beds[0]!)).toBe("sown");
    expect(stageOf(advance(plot, at + MINUTE, "north").beds[0]!)).toBe("shoots");
    expect(stageOf(advance(plot, at + 3 * MINUTE, "north").beds[0]!)).toBe("growing");
    expect(stageOf(advance(plot, at + 4 * MINUTE - 1, "north").beds[0]!)).toBe("growing");
    plot = advance(plot, at + 4 * MINUTE, "north");
    expect(stageOf(plot.beds[0]!)).toBe("ripe");
    expect(plot.beds[0]!.grown).toBe(4 * MINUTE);
  });

  it("waits in dry soil, keeping its growth, and carries on when watered", () => {
    const at = dryStretch(APRIL, 3);
    let plot = act(act(rich(at), { type: "sow", bed: 0, crop: "peas" }, at), { type: "water", bed: 0 }, at);
    plot = advance(plot, at + WATER_LASTS_MS + 6 * HOUR, "north");
    // Twelve hours of water, then six dry: twelve hours of growth, kept.
    expect(plot.beds[0]!.grown).toBe(Math.min(CROPS.peas.growMs, WATER_LASTS_MS));
    const carrots = act(act(rich(at), { type: "sow", bed: 1, crop: "squash" }, at), { type: "water", bed: 1 }, at);
    const dried = advance(carrots, at + WATER_LASTS_MS, "north");
    expect(dried.beds[1]!.grown).toBe(WATER_LASTS_MS);
    const later = advance(dried, at + WATER_LASTS_MS + 12 * HOUR, "north");
    expect(later.beds[1]!.grown).toBe(WATER_LASTS_MS);
    expect(bedNow(later, 1, "north")).toMatchObject({ waitsFor: "water", moist: null });
    const watered = act(later, { type: "water", bed: 1 }, later.clock);
    expect(bedNow(watered, 1, "north")).toMatchObject({ waitsFor: null, moist: "can", dryAt: later.clock + WATER_LASTS_MS });
    expect(readyInMs(watered, 1, "north")).toBeGreaterThan(WATER_LASTS_MS);
  });

  it("dries exactly when its water runs out", () => {
    const at = dryStretch(APRIL, 2);
    const plot = act(act(rich(at), { type: "sow", bed: 0, crop: "squash" }, at), { type: "water", bed: 0 }, at);
    expect(advance(plot, at + WATER_LASTS_MS - 1, "north").beds[0]!.grown).toBe(WATER_LASTS_MS - 1);
    expect(advance(plot, at + WATER_LASTS_MS, "north").beds[0]!.grown).toBe(WATER_LASTS_MS);
    expect(advance(plot, at + WATER_LASTS_MS + 1, "north").beds[0]!.grown).toBe(WATER_LASTS_MS);
    expect(bedNow(advance(plot, at + WATER_LASTS_MS, "north"), 0, "north").moist).toBeNull();
    expect(untilChangeMs(plot, "north")).toBe(WATER_LASTS_MS);
  });

  it("grows on a wet day and for a while after, without the can", () => {
    const wet = freshRain(APRIL);
    const plot = act(rich(wet - DAY), { type: "sow", bed: 0, crop: "squash" }, wet - DAY);
    const rainy = advance(plot, wet + HOUR, "north");
    expect(bedNow(rainy, 0, "north").moist).toBe("raining");
    expect(rainingAt(wet + HOUR, "north")).toBe(true);
    // Its day of rain and the soaking after, less the days after that were wet too.
    let end = wet + DAY;
    while (wetDay(dayOf(end), "north")) end += DAY;
    const done = advance(plot, end + RAIN_SOAKS_MS + HOUR, "north");
    expect(done.beds[0]!.grown).toBe(end + RAIN_SOAKS_MS - wet);
    expect(bedNow(advance(plot, end + HOUR, "north"), 0, "north").moist).toBe("rain");
  });

  it("is kept watered by the water butt for two days after a wet day", () => {
    const wet = freshRain(APRIL);
    let plot = act(rich(wet - DAY), { type: "buy", thing: "waterButt" }, wet - DAY);
    plot = act(plot, { type: "sow", bed: 0, crop: "squash" }, wet - DAY);
    let end = wet + DAY;
    while (wetDay(dayOf(end), "north")) end += DAY;
    const after = advance(plot, end + DAY + HOUR, "north");
    // A day and an hour after the rain: still moist, from the butt (unless it rained again).
    if (!wetDay(dayOf(end + DAY + HOUR), "north")) expect(bedNow(after, 0, "north").moist).toBe("butt");
    expect(bedNow(after, 0, "north").waitsFor).toBeNull();
    const plain = advance(act(rich(wet - DAY), { type: "sow", bed: 0, crop: "squash" }, wet - DAY), end + DAY + HOUR, "north");
    expect(after.beds[0]!.grown).toBeGreaterThan(plain.beds[0]!.grown);
    expect(after.beds[0]!.grown - plain.beds[0]!.grown).toBeLessThanOrEqual(BUTT_KEEPS_MS - RAIN_SOAKS_MS);
  });

  it("waits out of season whatever the water, and carries on when its months come round", () => {
    // Squash sown in November in the north waits for April, keeping all it had.
    let plot = act(rich(NOV), { type: "sow", bed: 0, crop: "squash" }, NOV);
    plot = act(plot, { type: "water", bed: 0 }, NOV);
    expect(bedNow(plot, 0, "north")).toMatchObject({ waitsFor: "season", resumes: 4, moist: "can" });
    const march = advance(plot, Date.UTC(2027, 2, 31), "north");
    expect(march.beds[0]!.grown).toBe(0);
    const april = advance(march, Date.UTC(2027, 4, 1), "north");
    expect(april.beds[0]!.grown).toBeGreaterThan(0);
    // Squash part-grown in late October keeps it all through the winter, watered or not.
    const oct = Date.UTC(2026, 9, 31, 12);
    let squash = act(act(rich(oct), { type: "sow", bed: 0, crop: "squash" }, oct), { type: "water", bed: 0 }, oct);
    squash = advance(squash, Date.UTC(2026, 10, 1), "north");
    const had = squash.beds[0]!.grown;
    expect(had).toBeGreaterThanOrEqual(12 * HOUR);
    squash = advance(act(squash, { type: "water", bed: 0 }, Date.UTC(2026, 11, 2)), Date.UTC(2027, 2, 31, 23), "north");
    expect(squash.beds[0]!.grown).toBe(had);
    expect(bedNow(squash, 0, "north")).toMatchObject({ waitsFor: "season", resumes: 4 });
  });

  it("is in season all year under glass, where no rain falls", () => {
    let plot = act(rich(T0), { type: "buy", thing: "greenhouse" }, T0);
    plot = act(plot, { type: "sow", bed: 12, crop: "peas" }, T0);
    plot = act(plot, { type: "sow", bed: 0, crop: "peas" }, T0);
    const wet = nextDay(T0 + DAY, true);
    const rainy = advance(plot, wet + HOUR, "north");
    expect(bedNow(rainy, 12, "north")).toMatchObject({ waitsFor: "water", moist: null, rainAt: null });
    expect(bedNow(rainy, 0, "north")).toMatchObject({ waitsFor: "season", resumes: 2 });
    expect(readyInMs(rainy, 12, "north")).toBeNull();
    const watered = act(rainy, { type: "water", bed: 12 }, wet + HOUR);
    expect(readyInMs(watered, 12, "north")).toBe(CROPS.peas.growMs);
    expect(stageOf(advance(watered, wet + HOUR + 2 * HOUR, "north").glassBeds[0]!)).toBe("ripe");
  });

  it("works out the time to ripe across a change of season", () => {
    // Squash watered on 31 March in the north waits until April starts, then grows while moist.
    const start = Date.UTC(2026, 3, 1) - 6 * HOUR;
    let plot = act(rich(start), { type: "sow", bed: 0, crop: "squash" }, start);
    plot = act(plot, { type: "water", bed: 0 }, start);
    const ready = readyInMs(plot, 0, "north");
    expect(ready).not.toBeNull();
    expect(stageOf(advance(plot, start + ready! - 1, "north").beds[0]!)).not.toBe("ripe");
    expect(stageOf(advance(plot, start + ready!, "north").beds[0]!)).toBe("ripe");
    expect(advance(plot, Date.UTC(2026, 3, 1), "north").beds[0]!.grown).toBe(0);
  });
});

describe("each action", () => {
  it("sows, paying for the seed from the coins, and says when it cannot", () => {
    let plot = rich(T0, 20);
    plot = act(plot, { type: "sow", bed: 1, crop: "carrots" }, T0);
    expect(plot.coins).toBe(5);
    expect(plot.beds[1]).toMatchObject({ crop: "carrots", grown: 0, wetUntil: 0, sownAt: T0 });
    expect(refusal(() => act(plot, { type: "sow", bed: 1, crop: "radishes" }, T0))).toBe("That bed already has carrots in it.");
    expect(refusal(() => act({ ...plot, coins: 12 }, { type: "sow", bed: 0, crop: "squash" }, T0))).toBe(
      "Squash seed costs 60 coins; you have 12.",
    );
    expect(refusal(() => act(plot, { type: "sow", bed: 4, crop: "radishes" }, T0))).toBe(
      "There is no bed 5 yet: more beds are at the stall.",
    );
    expect(refusal(() => act(plot, { type: "sow", bed: 12, crop: "radishes" }, T0))).toMatch(/come with the greenhouse/);
    // Radish seed and onion sets are free, so there is always something to sow; onions grow all year.
    expect(act({ ...plot, coins: 0 }, { type: "sow", bed: 0, crop: "radishes" }, T0).coins).toBe(0);
    expect(act({ ...plot, coins: 0 }, { type: "sow", bed: 0, crop: "onions" }, T0).coins).toBe(0);
  });

  it("waters for 12 hours from now, topping up, never an empty or ripe bed", () => {
    const plot = act(newAllotment(T0), { type: "sow", bed: 0, crop: "onions" }, T0);
    const watered = act(plot, { type: "water", bed: 0 }, T0);
    expect(watered.beds[0]!.wetUntil).toBe(T0 + WATER_LASTS_MS);
    // Watering again later tops it up from then; never refused.
    expect(act(watered, { type: "water", bed: 0 }, T0 + 30 * MINUTE).beds[0]!.wetUntil).toBe(T0 + 30 * MINUTE + WATER_LASTS_MS);
    expect(refusal(() => act(plot, { type: "water", bed: 2 }, T0))).toBe("Bed 3 has nothing sown in it to water.");
    expect(refusal(() => act(watered, { type: "water", bed: 0 }, T0 + 2 * HOUR))).toBe("The onions in bed 1 are ripe already.");
  });

  it("harvests a ripe bed into the basket and the almanac, keeping the soil's water, and refuses one not ripe", () => {
    const at = dryStretch(APRIL);
    const plot = act(act(newAllotment(at), { type: "sow", bed: 0, crop: "radishes" }, at), { type: "water", bed: 0 }, at);
    expect(refusal(() => act(plot, { type: "harvest", bed: 0 }, at + MINUTE))).toBe("The radishes in bed 1 are not ripe yet.");
    expect(refusal(() => act(plot, { type: "harvest", bed: 1 }, at))).toBe("Bed 2 has nothing in it to harvest.");
    const done = act(plot, { type: "harvest", bed: 0 }, at + 5 * MINUTE);
    expect(done.basket.radishes).toBe(3);
    expect(stageOf(done.beds[0]!)).toBe("empty");
    expect(done.beds[0]!.wetUntil).toBe(at + WATER_LASTS_MS);
    expect(done.almanac.crops.radishes).toEqual({ harvests: 1, produce: 3, firstAt: at + 5 * MINUTE });
    expect(done.almanac.harvests).toBe(1);
    expect(done.milestones.firstHarvest).toBe(at + 5 * MINUTE);
    const kale = act(act(rich(at), { type: "sow", bed: 0, crop: "kale" }, at), { type: "water", bed: 0 }, at);
    expect(refusal(() => act(kale, { type: "harvest", bed: 0 }, at + HOUR))).toBe("The kale in bed 1 is not ripe yet.");
  });

  it("harvests everything ripe in one go, leaving what is still growing", () => {
    const at = dryStretch(APRIL);
    let plot = rich(at);
    plot = act(plot, { type: "sow", bed: 0, crop: "radishes" }, at);
    plot = act(plot, { type: "sow", bed: 1, crop: "radishes" }, at);
    plot = act(plot, { type: "sow", bed: 2, crop: "squash" }, at);
    for (const bed of [0, 1, 2]) plot = act(plot, { type: "water", bed }, at);
    expect(refusal(() => act(plot, { type: "harvestAll" }, at + MINUTE))).toBe("Nothing is ripe yet.");
    const done = act(plot, { type: "harvestAll" }, at + 10 * MINUTE);
    expect(done.basket.radishes).toBe(6);
    expect(done.beds[2]!.crop).toBe("squash");
  });

  it("sells one kind or everything, earning coins", () => {
    let plot = rich(T0, 0);
    plot.basket = { ...plot.basket, radishes: 5, leeks: 2, eggs: 3 };
    plot = act(plot, { type: "sell", item: "radishes", count: 2 }, T0);
    expect(plot.basket.radishes).toBe(3);
    expect(plot.coins).toBe(2);
    expect(refusal(() => act(plot, { type: "sell", item: "radishes", count: 9 }, T0))).toBe("The basket has 3 radishes, not 9.");
    expect(refusal(() => act(plot, { type: "sell", item: "honey", count: "all" }, T0))).toBe(
      "There are no jars of honey in the basket to sell.",
    );
    plot = act(plot, { type: "sell", item: "leeks", count: "all" }, T0);
    expect(plot.coins).toBe(2 + 36);
    plot = act(plot, { type: "sellAll" }, T0);
    expect(plot.coins).toBe(38 + 3 + 9);
    expect(plot.almanac.coinsEarned).toBe(50);
    expect(ITEM_IDS.every((item) => plot.basket[item] === 0)).toBe(true);
    expect(refusal(() => act(plot, { type: "sellAll" }, T0))).toBe("The basket is empty.");
  });

  it("buys beds at 25 × (beds − 3), up to 12", () => {
    let plot = rich(T0, 5000);
    expect(nextBedPrice(plot)).toBe(25);
    const prices: number[] = [];
    for (let i = 0; i < 8; i++) {
      prices.push(nextBedPrice(plot)!);
      plot = act(plot, { type: "buyBed" }, T0);
    }
    expect(prices).toEqual([25, 50, 75, 100, 125, 150, 175, 200]);
    expect(plot.beds).toHaveLength(12);
    expect(plot.coins).toBe(5000 - 900);
    expect(nextBedPrice(plot)).toBeNull();
    expect(plot.milestones.allBeds).toBe(T0);
    expect(refusal(() => act(plot, { type: "buyBed" }, T0))).toBe("All 12 beds are dug already.");
    expect(refusal(() => act(newAllotment(T0), { type: "buyBed" }, T0))).toBe("The next bed costs 25 coins; you have 10.");
  });

  it("buys each lasting thing once", () => {
    let plot = rich(T0, 2000);
    for (const thing of Object.values(THINGS)) plot = act(plot, { type: "buy", thing: thing.id }, T0);
    expect(plot.coins).toBe(2000 - 40 - 80 - 120 - 200 - 300 - 500);
    expect(plot.glassBeds).toHaveLength(2);
    expect(plot.milestones.everyThing).toBe(T0);
    expect(refusal(() => act(plot, { type: "buy", thing: "hens" }, T0))).toBe("The plot has hens already.");
    expect(refusal(() => act(plot, { type: "buy", thing: "waterButt" }, T0))).toBe("The plot has a water butt already.");
    expect(refusal(() => act(newAllotment(T0), { type: "buy", thing: "beehive" }, T0))).toBe("The beehive costs 200 coins; you have 10.");
  });

  it("makes compost from harvests, at most 8, and a bed sown with it yields 2 more", () => {
    const at = dryStretch(APRIL);
    let plot = act(rich(at), { type: "buy", thing: "compostBin" }, at);
    plot = act(act(plot, { type: "sow", bed: 0, crop: "radishes" }, at), { type: "water", bed: 0 }, at);
    plot = act(plot, { type: "harvest", bed: 0 }, at + HOUR);
    expect(plot.compost).toBe(1);
    plot = act(plot, { type: "sow", bed: 0, crop: "radishes" }, at + HOUR);
    expect(plot.compost).toBe(0);
    expect(plot.beds[0]!.composted).toBe(true);
    plot = act(plot, { type: "harvest", bed: 0 }, at + 2 * HOUR);
    expect(plot.basket.radishes).toBe(3 + 5);
    plot = { ...plot, compost: 8 };
    plot = act(plot, { type: "sow", bed: 1, crop: "radishes" }, at + 2 * HOUR);
    plot = act(plot, { type: "sow", bed: 2, crop: "radishes" }, at + 2 * HOUR);
    plot = act(act(plot, { type: "water", bed: 1 }, at + 2 * HOUR), { type: "water", bed: 2 }, at + 2 * HOUR);
    plot = act({ ...plot, compost: 8 }, { type: "harvestAll" }, at + 3 * HOUR);
    expect(plot.compost).toBe(8);
  });

  it("collects what the hens, the hive and the tree have made, which waits at a cap", () => {
    let plot = rich(T0);
    for (const thing of ["hens", "beehive", "appleTree"] as const) plot = act(plot, { type: "buy", thing }, T0);
    expect(refusal(() => act(plot, { type: "collect", thing: "hens" }, T0 + HOUR))).toBe("No eggs are waiting yet.");
    expect(refusal(() => act(plot, { type: "collect" }, T0 + HOUR))).toBe("Nothing is waiting to be collected.");
    const later = advance(plot, T0 + 7 * HOUR, "north");
    expect(later.waiting).toEqual({ eggs: 2, honey: 0, apples: 1 });
    plot = act(plot, { type: "collect", thing: "hens" }, T0 + 7 * HOUR);
    expect(plot.basket.eggs).toBe(2);
    expect(plot.waiting.eggs).toBe(0);
    // The hour after the last egg still counts towards the next.
    expect(advance(plot, T0 + 9 * HOUR, "north").waiting.eggs).toBe(1);
    plot = act(plot, { type: "collect" }, T0 + 8 * HOUR);
    expect(plot.basket).toMatchObject({ eggs: 2, honey: 1, apples: 1 });
    const year = advance(plot, T0 + 400 * DAY, "north");
    expect(year.waiting).toEqual({ eggs: 6, honey: 4, apples: 12 });
    expect(refusal(() => act(newAllotment(T0), { type: "collect", thing: "beehive" }, T0))).toBe(
      "There is no beehive yet: it is at the stall.",
    );
  });

  it("keeps the hemisphere setting", () => {
    const plot = act(newAllotment(T0), { type: "setHemisphere", hemisphere: "south" }, T0);
    expect(plot.hemisphere).toBe("south");
  });
});

describe("caps", () => {
  it("never passes the coin cap, selling only what fits and keeping the rest", () => {
    const plot = rich(T0, COIN_CAP - 10);
    plot.basket.leeks = 5;
    plot.basket.radishes = 3;
    const sold = act(plot, { type: "sellAll" }, T0);
    // Leeks are 18 each: none fit in 10 coins of room, so they stay; radishes do.
    expect(sold.coins).toBe(COIN_CAP - 10 + 3);
    expect(sold.basket.leeks).toBe(5);
    const full = { ...rich(T0, COIN_CAP), basket: { ...plot.basket } };
    expect(refusal(() => act(full, { type: "sell", item: "radishes", count: 1 }, T0))).toBe("The coin box is full at 999,999 coins.");
  });

  it("never fills the basket past 9,999 of a kind: a harvest that would waits in its bed", () => {
    let plot = act(act(newAllotment(T0), { type: "sow", bed: 0, crop: "onions" }, T0), { type: "water", bed: 0 }, T0);
    plot.basket.onions = BASKET_CAP - 1;
    expect(refusal(() => act(plot, { type: "harvest", bed: 0 }, T0 + 2 * HOUR))).toBe(
      "The basket holds 9,998 onions already: sell some first.",
    );
    const still = advance(plot, T0 + 2 * HOUR, "north");
    expect(stageOf(still.beds[0]!)).toBe("ripe");
    plot = act(rich(T0), { type: "buy", thing: "hens" }, T0);
    plot.basket.eggs = BASKET_CAP - 1;
    plot = act(plot, { type: "collect", thing: "hens" }, T0 + DAY);
    expect(plot.basket.eggs).toBe(BASKET_CAP);
    expect(plot.waiting.eggs).toBe(5);
  });
});

describe("time", () => {
  it("never moves backwards: a clock that jumps back un-grows nothing", () => {
    const plot = advance(
      act(act(rich(APRIL), { type: "sow", bed: 0, crop: "squash" }, APRIL), { type: "water", bed: 0 }, APRIL),
      APRIL + DAY,
      "north",
    );
    const back = advance(plot, APRIL, "north");
    expect(back).toBe(plot);
    expect(advance(plot, Number.NaN, "north")).toBe(plot);
    // An action stamped in the past is applied at the plot's clock.
    const watered = act(plot, { type: "water", bed: 0 }, APRIL - DAY);
    expect(watered.clock).toBe(APRIL + DAY);
    expect(watered.beds[0]!.grown).toBe(plot.beds[0]!.grown);
    expect(watered.beds[0]!.wetUntil).toBe(APRIL + DAY + WATER_LASTS_MS);
    expect(watered.lastActionAt).toBe(APRIL + DAY);
  });

  for (const hemisphere of ["north", "south"] as const) {
    it(`gives exactly the same plot advanced at once as in a thousand small steps, across drying and rain, in the ${hemisphere}`, () => {
      const start = Date.UTC(2026, 1, 20, 7, 13);
      let plot = rich(start, 3000);
      for (const thing of ["hens", "beehive", "appleTree", "greenhouse"] as const)
        plot = act(plot, { type: "buy", thing }, start, hemisphere);
      const crops = ["squash", "garlic", "leeks", "potatoes"] as const;
      plot.beds.forEach((_, index) => {
        plot = act(plot, { type: "sow", bed: index, crop: crops[index]! }, start, hemisphere);
      });
      plot = act(plot, { type: "sow", bed: 12, crop: "garlic" }, start, hemisphere);
      plot = act(plot, { type: "sow", bed: 13, crop: "squash" }, start, hemisphere);
      for (const bed of [1, 12, 13]) plot = act(plot, { type: "water", bed }, start, hemisphere);
      // A short horizon catches the crops mid-growth as beds dry and rain comes; the long one spans every season.
      for (const horizon of [3 * DAY + 7 * HOUR, 40 * DAY, 400 * DAY]) {
        const began = performance.now();
        const once = advance(plot, start + horizon, hemisphere);
        expect(performance.now() - began).toBeLessThan(100);
        let stepped = plot;
        const steps = 1000;
        for (let i = 1; i <= steps; i++) stepped = advance(stepped, start + Math.round((horizon * i) / steps), hemisphere);
        expect(stepped).toEqual(once);
      }
    });
  }

  it("left alone for a year: the open beds ripen with the rain in their months and wait; under glass they wait for the can", () => {
    let plot = rich(T0, 2000);
    for (const thing of ["hens", "beehive", "appleTree", "greenhouse"] as const) plot = act(plot, { type: "buy", thing }, T0);
    const sown = [
      [0, "squash"],
      [1, "garlic"],
      [2, "carrots"],
      [3, "kale"],
      [12, "leeks"],
      [13, "peas"],
    ] as const;
    for (const [bed, crop] of sown) plot = act(plot, { type: "sow", bed, crop }, T0);
    plot = act(plot, { type: "water", bed: 12 }, T0);
    plot.basket = { ...plot.basket, carrots: 7, honey: 2 };
    const before = plot;
    const after = advance(plot, T0 + 400 * DAY, "north");
    for (const [bed, crop] of sown.slice(0, 4)) {
      expect(bedAt(after, bed)).toMatchObject({ crop });
      expect(stageOf(bedAt(after, bed)!), crop).toBe("ripe");
    }
    // Under glass: the leeks grew for their 12 hours of water and wait; the peas were never watered.
    expect(bedAt(after, 12)!.grown).toBe(WATER_LASTS_MS);
    expect(bedAt(after, 13)!.grown).toBe(0);
    expect(bedNow(after, 13, "north").waitsFor).toBe("water");
    expect(after.coins).toBe(before.coins);
    expect(after.basket).toEqual(before.basket);
    expect(after.waiting).toEqual({ eggs: PRODUCER.hens.cap, honey: PRODUCER.beehive.cap, apples: PRODUCER.appleTree.cap });
    expect(after.milestones.aYear).toBe(T0 + 365 * DAY);
    for (const [where, value] of numbers(after)) {
      expect(Number.isFinite(value), where).toBe(true);
      expect(value, where).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(Math.round(value)), where).toBe(true);
    }
    expect(readAllotment(after)).not.toBeNull();
    expect(act(after, { type: "harvestAll" }, T0 + 400 * DAY).almanac.harvests).toBe(4);
  });

  it("says when the next thing changes: a bed drying, the rain, the month, a ripening", () => {
    const at = dryStretch(APRIL, 2);
    const empty = newAllotment(at);
    const change = untilChangeMs(empty, "north")!;
    expect(change).toBeGreaterThan(0);
    expect(change).toBeLessThanOrEqual(Date.UTC(2026, 4, 1) - at);
    const sown = act(act(empty, { type: "sow", bed: 0, crop: "radishes" }, at), { type: "water", bed: 0 }, at);
    expect(untilChangeMs(sown, "north")).toBe(4 * MINUTE);
  });
});

describe("milestones", () => {
  it("note ten harvests, every crop grown and 1,000 coins earned, with the date", () => {
    let plot = act(rich(T0, 10_000), { type: "buy", thing: "greenhouse" }, T0);
    let t = T0;
    for (const crop of CROP_IDS) {
      plot = act(plot, { type: "sow", bed: 12, crop }, t);
      [plot, t] = tend(plot, 12, t);
      plot = act(plot, { type: "harvest", bed: 12 }, t);
    }
    expect(plot.milestones.everyCrop).toBe(t);
    expect(plot.milestones.tenHarvests).toBe(plot.almanac.crops[CROP_IDS[9]].firstAt);
    expect(plot.milestones.hundredHarvests).toBeUndefined();
    plot.basket.leeks = 60;
    plot = act(plot, { type: "sell", item: "leeks", count: "all" }, t);
    expect(plot.milestones.thousandCoins).toBe(t);
  });
});

/** A plot as the first version kept it (v 1), a year after it was last tended: from before these rules. */
function versionOne(clock: number) {
  const bed = (crop: string | null, grown: number, watered: boolean, composted = false) => ({
    crop,
    grown,
    watered,
    composted,
    sownAt: crop ? clock - DAY : null,
  });
  const crops = ["radishes", "salad", "peas", "carrots", "beetroot", "potatoes", "leeks", "squash"];
  return {
    v: 1,
    startedAt: clock - 400 * DAY,
    clock,
    lastActionAt: clock,
    hemisphere: "auto",
    coins: 317,
    beds: [
      bed("squash", 2 * HOUR, true, true),
      bed("radishes", 4 * MINUTE, false),
      bed(null, 0, false),
      bed("leeks", DAY, false),
      bed("carrots", HOUR, true),
    ],
    glassBeds: [bed("peas", 30 * MINUTE, true), bed(null, 0, false)],
    things: { waterButt: true, compostBin: true, hens: true, beehive: false, appleTree: false, greenhouse: true },
    compost: 3,
    producing: { hens: HOUR, beehive: 0, appleTree: 0 },
    waiting: { eggs: 2, honey: 0, apples: 0 },
    basket: { radishes: 4, salad: 0, peas: 0, carrots: 6, beetroot: 0, potatoes: 2, leeks: 0, squash: 1, eggs: 3, honey: 0, apples: 0 },
    almanac: {
      crops: Object.fromEntries(crops.map((id, i) => [id, { harvests: i, produce: i * 3, firstAt: i ? clock - 300 * DAY : null }])),
      harvests: 28,
      coinsEarned: 1200,
    },
    milestones: {
      firstHarvest: clock - 300 * DAY,
      tenHarvests: clock - 200 * DAY,
      thousandCoins: clock - 50 * DAY,
      aYear: clock - 35 * DAY,
    },
  };
}

describe("a plot saved before these rules", () => {
  it("loads losing nothing: coins, beds, things, growth, basket, almanac and milestones", () => {
    const clock = Date.UTC(2026, 10, 16, 20);
    const old = versionOne(clock);
    const plot = readAllotment(JSON.parse(JSON.stringify(old)))!;
    expect(plot).not.toBeNull();
    expect(plot.v).toBe(2);
    expect(plot.coins).toBe(317);
    expect(plot.beds.map((bed) => [bed.crop, bed.grown, bed.composted])).toEqual(
      old.beds.map((bed) => [bed.crop, bed.grown, bed.composted]),
    );
    // Watered beds are moist for the full time from the plot's clock; a ripe or empty one is not.
    expect(plot.beds.map((bed) => bed.wetUntil)).toEqual([clock + WATER_LASTS_MS, 0, 0, 0, clock + WATER_LASTS_MS]);
    expect(plot.glassBeds[0]).toMatchObject({ crop: "peas", grown: 30 * MINUTE, wetUntil: clock + WATER_LASTS_MS });
    expect(plot.things).toEqual(old.things);
    expect(plot.compost).toBe(3);
    expect(plot.producing).toEqual(old.producing);
    expect(plot.waiting).toEqual(old.waiting);
    expect(plot.basket).toMatchObject(old.basket);
    expect(plot.basket.garlic).toBe(0);
    expect(plot.almanac.harvests).toBe(28);
    expect(plot.almanac.coinsEarned).toBe(1200);
    expect(plot.almanac.crops.leeks).toEqual(old.almanac.crops.leeks);
    expect(plot.almanac.crops.kale).toEqual({ harvests: 0, produce: 0, firstAt: null });
    expect(plot.milestones).toEqual(old.milestones);
    expect(plot.startedAt).toBe(old.startedAt);
    expect(readAllotment(plot)).toEqual(plot);
    // And it plays on: the ripe radishes are harvested, the peas under glass grow.
    const played = act(plot, { type: "harvest", bed: 1 }, clock + MINUTE);
    expect(played.basket.radishes).toBe(7);
    expect(played.glassBeds[0]!.grown).toBe(30 * MINUTE + MINUTE);
  });

  it("loads a year after it was last tended, and is worked out to now under the new rules", () => {
    const clock = Date.UTC(2025, 10, 10, 9);
    const plot = readAllotment(versionOne(clock))!;
    const now = advance(plot, clock + 372 * DAY, "north");
    expect(now.coins).toBe(317);
    expect(now.beds.map((bed) => bed.crop)).toEqual(["squash", "radishes", null, "leeks", "carrots"]);
    for (const [index, bed] of now.beds.entries()) expect(bed.grown, `bed ${index}`).toBeGreaterThanOrEqual(plot.beds[index]!.grown);
    // A year of the rain's growth in their months has ripened the open beds.
    expect(stageOf(now.beds[0]!)).toBe("ripe");
    expect(stageOf(now.beds[3]!)).toBe("ripe");
    expect(stageOf(now.beds[4]!)).toBe("ripe");
    // Under glass the peas had their 12 hours of water and wait for more.
    expect(now.glassBeds[0]!.grown).toBe(30 * MINUTE + Math.min(WATER_LASTS_MS, CROPS.peas.growMs - 30 * MINUTE));
    expect(now.waiting.eggs).toBe(PRODUCER.hens.cap);
  });

  it("is refused, as any damaged plot is, when it is not sound", () => {
    const old = versionOne(T0) as Record<string, unknown>;
    expect(readAllotment({ ...old, coins: -1 })).toBeNull();
    expect(
      readAllotment({
        ...old,
        beds: [{ crop: "kale", grown: 0, watered: false, composted: false, sownAt: T0 }, ...(old.beds as unknown[]).slice(1)],
      }),
    ).toBeNull();
    expect(readAllotment({ ...old, v: 3 })).toBeNull();
  });
});

describe("reading a stored plot", () => {
  it("accepts a sound plot and refuses one with anything wrong", () => {
    const plot = act(rich(T0), { type: "sow", bed: 0, crop: "peas" }, T0);
    expect(readAllotment(JSON.parse(JSON.stringify(plot)))).not.toBeNull();
    // biome-ignore lint/suspicious/noExplicitAny: each case breaks one field of a copy
    const broken = (change: (copy: any) => void) => {
      const copy = JSON.parse(JSON.stringify(plot));
      change(copy);
      return readAllotment(copy);
    };
    expect(broken((p) => (p.v = 3))).toBeNull();
    expect(broken((p) => (p.coins = -1))).toBeNull();
    expect(broken((p) => (p.coins = 1e9))).toBeNull();
    expect(broken((p) => (p.beds[0].crop = "turnips"))).toBeNull();
    expect(broken((p) => (p.beds[0].grown = 1e12))).toBeNull();
    expect(broken((p) => (p.beds[0].wetUntil = -5))).toBeNull();
    expect(broken((p) => (p.beds = []))).toBeNull();
    expect(broken((p) => (p.glassBeds = [p.beds[1], p.beds[1]]))).toBeNull();
    expect(broken((p) => (p.basket.eggs = "many"))).toBeNull();
    expect(broken((p) => delete p.basket.garlic)).toBeNull();
    expect(broken((p) => (p.milestones.bogus = 1))).toBeNull();
    expect(broken((p) => delete p.almanac)).toBeNull();
    expect(readAllotment(null)).toBeNull();
  });
});
