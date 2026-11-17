/**
 * The allotment's engine (packages/shared/src/games/allotment), run with the server's
 * tests as the Morse engine's are. It never punishes: nothing is lost to time, a clock
 * that jumps back un-grows nothing, every count stops at its cap, and a year away gives
 * exactly what a year of small steps would.
 */
import {
  type AllotmentAction,
  AllotmentRefusal,
  type AllotmentState,
  advance,
  applyAction,
  BASKET_CAP,
  bedAt,
  COIN_CAP,
  CROP_IDS,
  CROPS,
  DAY,
  HOUR,
  ITEM_IDS,
  MINUTE,
  newAllotment,
  nextBedPrice,
  PRODUCER,
  readAllotment,
  readyInMs,
  resolveHemisphere,
  seasonAt,
  stageOf,
  THINGS,
} from "@outpost/shared/games/allotment";
import { describe, expect, it } from "vitest";

/** 1 January 2026, winter in the north. */
const T0 = Date.UTC(2026, 0, 1);
/** 1 April 2026, spring in the north, autumn in the south. */
const APRIL = Date.UTC(2026, 3, 1);

const act = (state: AllotmentState, action: AllotmentAction, now: number, hemisphere: "north" | "south" = "north") =>
  applyAction(state, action, now, hemisphere);

/** A plot with this many coins, for buying things. */
const rich = (now: number, coins = 5000) => ({ ...newAllotment(now), coins });

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

describe("a new plot", () => {
  it("has 10 coins, four empty beds and nothing else, and is small", () => {
    const plot = newAllotment(T0);
    expect(plot.coins).toBe(10);
    expect(plot.beds).toHaveLength(4);
    expect(plot.beds.every((bed) => stageOf(bed) === "empty")).toBe(true);
    expect(plot.glassBeds).toEqual([]);
    expect(Object.values(plot.things).some(Boolean)).toBe(false);
    expect(readAllotment(plot)).toEqual(plot);
    expect(JSON.stringify(plot).length).toBeLessThan(4096);
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
  });

  it("take the hemisphere from the setting, then the home place, then the north", () => {
    expect(resolveHemisphere("south", 51)).toEqual({ hemisphere: "south", from: "setting" });
    expect(resolveHemisphere("auto", -33.9)).toEqual({ hemisphere: "south", from: "home place" });
    expect(resolveHemisphere("auto", 0)).toEqual({ hemisphere: "north", from: "home place" });
    expect(resolveHemisphere("auto", null)).toEqual({ hemisphere: "north", from: "default" });
  });
});

describe("growing", () => {
  it("ripens radishes in 4 minutes out of season, through the stages", () => {
    let plot = act(newAllotment(T0), { type: "sow", bed: 0, crop: "radishes" }, T0);
    expect(plot.coins).toBe(10);
    expect(stageOf(plot.beds[0]!)).toBe("sown");
    expect(stageOf(advance(plot, T0 + MINUTE, "north").beds[0]!)).toBe("shoots");
    expect(stageOf(advance(plot, T0 + 3 * MINUTE, "north").beds[0]!)).toBe("growing");
    expect(stageOf(advance(plot, T0 + 4 * MINUTE - 1, "north").beds[0]!)).toBe("growing");
    plot = advance(plot, T0 + 4 * MINUTE, "north");
    expect(stageOf(plot.beds[0]!)).toBe("ripe");
    expect(plot.beds[0]!.grown).toBe(4 * MINUTE);
  });

  it("grows ×1.25 in season and ×1.5 watered, multiplied, and under glass every crop is in season", () => {
    const sown = act(newAllotment(APRIL), { type: "sow", bed: 0, crop: "radishes" }, APRIL);
    // Spring is the radishes' season in the north: 4 minutes ÷ 1.25.
    expect(readyInMs(sown, 0, "north")).toBe(3.2 * MINUTE);
    const watered = act(sown, { type: "water", bed: 0 }, APRIL);
    expect(readyInMs(watered, 0, "north")).toBeCloseTo((4 * MINUTE) / 1.875, 6);
    // In January peas are out of season, but not under glass.
    let plot = act(rich(T0), { type: "buy", thing: "greenhouse" }, T0);
    plot = act(plot, { type: "sow", bed: 0, crop: "peas" }, T0);
    plot = act(plot, { type: "sow", bed: 12, crop: "peas" }, T0);
    expect(readyInMs(plot, 0, "north")).toBe(2 * HOUR);
    expect(readyInMs(plot, 12, "north")).toBe((2 * HOUR) / 1.25);
  });

  it("works out the time to ripe across a change of season", () => {
    // Squash sown a day before the end of May in the north (spring, out of season), then summer (in season).
    const start = Date.UTC(2026, 5, 1) - DAY;
    const plot = act(rich(start), { type: "sow", bed: 0, crop: "squash" }, start);
    // One day at ×1, then the remaining two days at ×1.25.
    expect(readyInMs(plot, 0, "north")).toBeCloseTo(DAY + (2 * DAY) / 1.25, 3);
    expect(stageOf(advance(plot, start + DAY + (2 * DAY) / 1.25, "north").beds[0]!)).toBe("ripe");
  });
});

describe("each action", () => {
  it("sows, paying for the seed from the coins, and says when it cannot", () => {
    let plot = rich(T0, 20);
    plot = act(plot, { type: "sow", bed: 1, crop: "carrots" }, T0);
    expect(plot.coins).toBe(5);
    expect(plot.beds[1]).toMatchObject({ crop: "carrots", grown: 0, watered: false, sownAt: T0 });
    expect(refusal(() => act(plot, { type: "sow", bed: 1, crop: "radishes" }, T0))).toBe("That bed already has carrots in it.");
    expect(refusal(() => act({ ...plot, coins: 12 }, { type: "sow", bed: 0, crop: "squash" }, T0))).toBe(
      "Squash seed costs 60 coins; you have 12.",
    );
    expect(refusal(() => act(plot, { type: "sow", bed: 4, crop: "radishes" }, T0))).toBe(
      "There is no bed 5 yet: more beds are at the stall.",
    );
    expect(refusal(() => act(plot, { type: "sow", bed: 12, crop: "radishes" }, T0))).toMatch(/come with the greenhouse/);
    // Radish seed is free, so there is always something to sow.
    expect(act({ ...plot, coins: 0 }, { type: "sow", bed: 0, crop: "radishes" }, T0).coins).toBe(0);
  });

  it("waters once per sowing, never an empty or ripe bed", () => {
    const plot = act(newAllotment(T0), { type: "sow", bed: 0, crop: "radishes" }, T0);
    const watered = act(plot, { type: "water", bed: 0 }, T0);
    expect(watered.beds[0]!.watered).toBe(true);
    expect(refusal(() => act(watered, { type: "water", bed: 0 }, T0))).toBe("Bed 1 has been watered already.");
    expect(refusal(() => act(plot, { type: "water", bed: 2 }, T0))).toBe("Bed 3 has nothing sown in it to water.");
    expect(refusal(() => act(plot, { type: "water", bed: 0 }, T0 + HOUR))).toBe("The radishes in bed 1 are ripe already.");
  });

  it("harvests a ripe bed into the basket and the almanac, and refuses one not ripe", () => {
    const plot = act(newAllotment(T0), { type: "sow", bed: 0, crop: "radishes" }, T0);
    expect(refusal(() => act(plot, { type: "harvest", bed: 0 }, T0 + MINUTE))).toBe("The radishes in bed 1 are not ripe yet.");
    expect(refusal(() => act(plot, { type: "harvest", bed: 1 }, T0))).toBe("Bed 2 has nothing in it to harvest.");
    const done = act(plot, { type: "harvest", bed: 0 }, T0 + 5 * MINUTE);
    expect(done.basket.radishes).toBe(3);
    expect(stageOf(done.beds[0]!)).toBe("empty");
    expect(done.almanac.crops.radishes).toEqual({ harvests: 1, produce: 3, firstAt: T0 + 5 * MINUTE });
    expect(done.almanac.harvests).toBe(1);
    expect(done.milestones.firstHarvest).toBe(T0 + 5 * MINUTE);
  });

  it("harvests everything ripe in one go, leaving what is still growing", () => {
    let plot = rich(T0);
    plot = act(plot, { type: "sow", bed: 0, crop: "radishes" }, T0);
    plot = act(plot, { type: "sow", bed: 1, crop: "radishes" }, T0);
    plot = act(plot, { type: "sow", bed: 2, crop: "squash" }, T0);
    expect(refusal(() => act(plot, { type: "harvestAll" }, T0 + MINUTE))).toBe("Nothing is ripe yet.");
    const done = act(plot, { type: "harvestAll" }, T0 + 10 * MINUTE);
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

  it("starts every sowing watered with a water butt", () => {
    let plot = act(rich(T0), { type: "buy", thing: "waterButt" }, T0);
    plot = act(plot, { type: "sow", bed: 0, crop: "radishes" }, T0);
    expect(plot.beds[0]!.watered).toBe(true);
  });

  it("makes compost from harvests, at most 8, and a bed sown with it yields 2 more", () => {
    let plot = act(rich(T0), { type: "buy", thing: "compostBin" }, T0);
    plot = act(plot, { type: "sow", bed: 0, crop: "radishes" }, T0);
    plot = act(plot, { type: "harvest", bed: 0 }, T0 + HOUR);
    expect(plot.compost).toBe(1);
    plot = act(plot, { type: "sow", bed: 0, crop: "radishes" }, T0 + HOUR);
    expect(plot.compost).toBe(0);
    expect(plot.beds[0]!.composted).toBe(true);
    plot = act(plot, { type: "harvest", bed: 0 }, T0 + 2 * HOUR);
    expect(plot.basket.radishes).toBe(3 + 5);
    plot = { ...plot, compost: 8 };
    plot = act(plot, { type: "sow", bed: 1, crop: "radishes" }, T0 + 2 * HOUR);
    plot = act(plot, { type: "sow", bed: 2, crop: "radishes" }, T0 + 2 * HOUR);
    plot = act({ ...plot, compost: 8 }, { type: "harvestAll" }, T0 + 3 * HOUR);
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
    let plot = act(newAllotment(T0), { type: "sow", bed: 0, crop: "radishes" }, T0);
    plot.basket.radishes = BASKET_CAP - 1;
    expect(refusal(() => act(plot, { type: "harvest", bed: 0 }, T0 + HOUR))).toBe(
      "The basket holds 9,998 radishes already: sell some first.",
    );
    const still = advance(plot, T0 + HOUR, "north");
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
    const plot = advance(act(rich(T0), { type: "sow", bed: 0, crop: "squash" }, T0), T0 + DAY, "north");
    const back = advance(plot, T0, "north");
    expect(back).toBe(plot);
    expect(advance(plot, Number.NaN, "north")).toBe(plot);
    // An action stamped in the past is applied at the plot's clock.
    const watered = act(plot, { type: "water", bed: 0 }, T0 - DAY);
    expect(watered.clock).toBe(T0 + DAY);
    expect(watered.beds[0]!.grown).toBe(plot.beds[0]!.grown);
    expect(watered.lastActionAt).toBe(T0 + DAY);
  });

  it("gives the same plot advanced 400 days at once as in a thousand small steps, quickly", () => {
    let plot = rich(Date.UTC(2026, 1, 20), 3000);
    const start = plot.clock;
    for (const thing of ["hens", "beehive", "appleTree", "greenhouse"] as const) plot = act(plot, { type: "buy", thing }, start);
    plot.beds.forEach((_, index) => {
      plot = act(plot, { type: "sow", bed: index, crop: "squash" }, start);
    });
    plot = act(plot, { type: "sow", bed: 12, crop: "leeks" }, start);
    plot = act(plot, { type: "water", bed: 1 }, start);
    // A short horizon, so that the crops are caught mid-growth across a change of season.
    for (const horizon of [3 * DAY + 7 * HOUR, 400 * DAY]) {
      const began = performance.now();
      const once = advance(plot, start + horizon, "south");
      expect(performance.now() - began).toBeLessThan(50);
      let stepped = plot;
      const steps = 1000;
      for (let i = 1; i <= steps; i++) stepped = advance(stepped, start + Math.round((horizon * i) / steps), "south");
      for (const index of [0, 1, 2, 3, 12, 13]) {
        expect(Math.abs(bedAt(once, index)!.grown - bedAt(stepped, index)!.grown)).toBeLessThanOrEqual(steps);
      }
      expect(once.waiting).toEqual(stepped.waiting);
      expect(once.producing).toEqual(stepped.producing);
    }
  });

  it("loses nothing in 400 days with everything sown and every producer bought", () => {
    let plot = rich(T0, 2000);
    for (const thing of ["hens", "beehive", "appleTree", "greenhouse"] as const) plot = act(plot, { type: "buy", thing }, T0);
    const crops = [...CROP_IDS, "radishes", "carrots", "squash", "leeks", "peas", "salad"] as const;
    const beds = [0, 1, 2, 3, 12, 13];
    beds.forEach((bed, i) => {
      plot = act(plot, { type: "sow", bed, crop: crops[i]! }, T0);
    });
    plot.basket = { ...plot.basket, carrots: 7, honey: 2 };
    const before = plot;
    const after = advance(plot, T0 + 400 * DAY, "north");
    beds.forEach((bed, i) => {
      expect(bedAt(after, bed)).toMatchObject({ crop: crops[i] });
      expect(stageOf(bedAt(after, bed)!)).toBe("ripe");
      expect(bedAt(after, bed)!.grown).toBe(CROPS[crops[i]!].growMs);
    });
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
    // And everything is still there to harvest.
    const harvested = act(after, { type: "harvestAll" }, T0 + 400 * DAY);
    expect(harvested.almanac.harvests).toBe(6);
  });
});

describe("milestones", () => {
  it("note ten harvests, every crop grown and 1,000 coins earned, with the date", () => {
    let plot = rich(T0, 10_000);
    let t = T0;
    for (const crop of CROP_IDS) {
      plot = act(plot, { type: "sow", bed: 0, crop }, t);
      t += 4 * DAY;
      plot = act(plot, { type: "harvest", bed: 0 }, t);
    }
    expect(plot.milestones.everyCrop).toBe(t);
    for (let i = 0; i < 2; i++) {
      plot = act(plot, { type: "sow", bed: 0, crop: "radishes" }, t);
      t += HOUR;
      plot = act(plot, { type: "harvest", bed: 0 }, t);
    }
    expect(plot.milestones.tenHarvests).toBe(t);
    expect(plot.milestones.hundredHarvests).toBeUndefined();
    plot.basket.leeks = 60;
    plot = act(plot, { type: "sell", item: "leeks", count: "all" }, t);
    expect(plot.milestones.thousandCoins).toBe(t);
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
    expect(broken((p) => (p.v = 2))).toBeNull();
    expect(broken((p) => (p.coins = -1))).toBeNull();
    expect(broken((p) => (p.coins = 1e9))).toBeNull();
    expect(broken((p) => (p.beds[0].crop = "turnips"))).toBeNull();
    expect(broken((p) => (p.beds[0].grown = 1e12))).toBeNull();
    expect(broken((p) => (p.beds = []))).toBeNull();
    expect(broken((p) => (p.glassBeds = [p.beds[1], p.beds[1]]))).toBeNull();
    expect(broken((p) => (p.basket.eggs = "many"))).toBeNull();
    expect(broken((p) => (p.milestones.bogus = 1))).toBeNull();
    expect(broken((p) => delete p.almanac)).toBeNull();
    expect(readAllotment(null)).toBeNull();
  });
});
