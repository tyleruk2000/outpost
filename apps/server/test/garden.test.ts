/**
 * Garden: the RHS calendar for a month, with tender crops kept back until after the
 * household's last frost; the calendar held to the Allotment game's own; and the record
 * of sowings and the last-frost date, kept, changed, refused when wrong, and erased.
 */
import {
  GARDEN_CROP_IDS,
  GARDEN_CROPS,
  type GardenResponse,
  type GardenSettings,
  type GardenSowing,
  gardenMonth,
  monthsText,
} from "@outpost/shared";
import { CROPS } from "@outpost/shared/games/allotment";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

const names = (crops: Array<{ name: string } | { crop: { name: string } }>) =>
  crops.map((item) => ("crop" in item ? item.crop.name : item.name));

describe("the calendar for a month", () => {
  it("gives the RHS months as they are with no last frost", () => {
    const may = gardenMonth(5, null);
    expect(names(may.plant)).toContain("Squash");
    expect(names(may.plant)).toContain("Potatoes");
    expect(may.heldBack).toEqual([]);
    expect(names(gardenMonth(11, null).sow)).toEqual(["Broad beans"]);
    expect(names(gardenMonth(11, null).plant)).toEqual(["Garlic", "Onions"]);
  });

  it("keeps tender crops back until the day after a late last frost, and leaves hardy ones", () => {
    const may = gardenMonth(5, "06-10");
    expect(names(may.heldBack)).toEqual(["Courgettes", "Cucumbers", "French beans", "Runner beans", "Squash", "Sweetcorn", "Tomatoes"]);
    expect(may.heldBack[0]?.from).toBe("06-11");
    expect(names(may.plant)).toContain("Kale");
    expect(names(may.plant)).not.toContain("Squash");
    // Sowing is not moved: the RHS sows tender crops indoors before the frost.
    expect(names(may.sow)).toContain("Squash");

    const june = gardenMonth(6, "06-10");
    expect(june.plant.find((line) => line.crop.id === "squash")).toEqual({ crop: GARDEN_CROPS.squash, fromDay: 11 });
    expect(gardenMonth(7, "06-10").plant.find((line) => line.crop.id === "runnerBeans")).toEqual({ crop: GARDEN_CROPS.runnerBeans });
  });

  it("starts on the first of the next month after a frost on the last day of one", () => {
    expect(gardenMonth(5, "05-31").heldBack.map((held) => held.from)).toContain("06-01");
    expect(gardenMonth(6, "05-31").plant.find((line) => line.crop.id === "sweetcorn")?.fromDay).toBeUndefined();
  });

  it("does not bring planting forward for an early last frost", () => {
    const april = gardenMonth(4, "03-20");
    expect(names(april.plant)).not.toContain("Squash");
    expect(names(gardenMonth(5, "03-20").plant)).toContain("Squash");
  });

  it("says when the last frost is after every planting month", () => {
    const june = gardenMonth(6, "07-15");
    const squash = june.heldBack.find((held) => held.crop.id === "squash");
    expect(squash).toEqual({ crop: GARDEN_CROPS.squash, from: null });
    // Runner beans are planted out into July, so there is still time for them.
    expect(june.heldBack.find((held) => held.crop.id === "runnerBeans")?.from).toBe("07-16");
  });

  it("writes months as a phrase, joining a run over the new year", () => {
    expect(monthsText([4, 5, 6])).toBe("April to June");
    expect(monthsText([1, 2, 3, 10, 11, 12])).toBe("October to March");
    expect(monthsText([2, 3, 10, 11, 12])).toBe("February to March and October to December");
    expect(monthsText([1, 2, 3, 8, 9, 10, 11, 12])).toBe("August to March");
    expect(monthsText([1, 2, 3, 4, 8, 9])).toBe("January to April and August to September");
  });

  it("agrees with the Allotment game's calendar, which holds sowing and planting together", () => {
    for (const id of GARDEN_CROP_IDS) {
      const crop = GARDEN_CROPS[id];
      if (!crop.allotment) continue;
      const game = CROPS[crop.allotment];
      const sowOrPlant = new Set([...crop.sow, ...crop.plant]);
      for (const month of game.sow) expect(sowOrPlant.has(month), `${id} sown in month ${month}`).toBe(true);
      for (const month of game.harvest) expect(crop.harvest.includes(month), `${id} harvested in month ${month}`).toBe(true);
    }
  });
});

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

async function ok<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await app.api<T>(method, url, body);
  if (response.status !== 200) throw new Error(`${method} ${url}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body;
}

describe("the record of sowings", () => {
  let carrots: GardenSowing;

  it("starts empty", async () => {
    expect(await ok<GardenResponse>("GET", "/api/garden")).toEqual({ settings: { lastFrost: null, updatedAt: null }, sowings: [] });
  });

  it("keeps a sowing, named after its crop when no name is given", async () => {
    carrots = (
      await ok<{ sowing: GardenSowing }>("POST", "/api/garden/sowings", { cropId: "carrots", sownOn: "2026-04-12", place: "Bed 3" })
    ).sowing;
    expect(carrots).toMatchObject({
      cropId: "carrots",
      name: "Carrots",
      sownOn: "2026-04-12",
      place: "Bed 3",
      amount: "",
      plantedOutOn: null,
      harvestedOn: null,
    });
    await ok("POST", "/api/garden/sowings", { cropId: null, name: "Sunflowers", sownOn: "2026-05-01" });
    const { sowings } = await ok<GardenResponse>("GET", "/api/garden");
    expect(sowings.map((sowing) => sowing.name)).toEqual(["Sunflowers", "Carrots"]);
  });

  it("changes a sowing", async () => {
    const changed = (
      await ok<{ sowing: GardenSowing }>("PUT", `/api/garden/sowings/${carrots.id}`, {
        cropId: "carrots",
        name: "Carrots, Nantes 2",
        sownOn: "2026-04-12",
        place: "Bed 3",
        harvestedOn: "2026-07-20",
      })
    ).sowing;
    expect(changed.name).toBe("Carrots, Nantes 2");
    expect(changed.harvestedOn).toBe("2026-07-20");
    expect(changed.updatedAt).toBeGreaterThan(carrots.updatedAt - 1);
  });

  it("refuses a sowing with no crop and no name, or a day that is not one", async () => {
    const nameless = await app.api("POST", "/api/garden/sowings", { cropId: null, name: "  ", sownOn: "2026-04-12" });
    expect(nameless.status).toBe(400);
    const badDay = await app.api("POST", "/api/garden/sowings", { cropId: "peas", sownOn: "2026-02-30" });
    expect(badDay.status).toBe(400);
    const unknown = await app.api("POST", "/api/garden/sowings", { cropId: "triffids", sownOn: "2026-02-03" });
    expect(unknown.status).toBe(400);
  });

  it("says when a sowing has gone", async () => {
    const response = await app.api<{ error: { message: string } }>("DELETE", "/api/garden/sowings/nothing-here");
    expect(response.status).toBe(404);
  });

  it("keeps the last-frost date, and refuses a day that is not one", async () => {
    expect((await ok<{ settings: GardenSettings }>("PUT", "/api/garden/settings", { lastFrost: "05-12" })).settings.lastFrost).toBe(
      "05-12",
    );
    expect((await app.api("PUT", "/api/garden/settings", { lastFrost: "02-29" })).status).toBe(400);
    expect((await app.api("PUT", "/api/garden/settings", { lastFrost: "May 12" })).status).toBe(400);
    expect((await ok<GardenResponse>("GET", "/api/garden")).settings.lastFrost).toBe("05-12");
  });

  it("removes a sowing on request", async () => {
    await ok("DELETE", `/api/garden/sowings/${carrots.id}`);
    expect((await ok<GardenResponse>("GET", "/api/garden")).sowings.map((sowing) => sowing.name)).toEqual(["Sunflowers"]);
  });

  it("is counted and erased with everything else", async () => {
    expect(app.ctx.services.garden.kept.count()).toEqual({ sowings: 1, settings: 1 });
    expect(app.ctx.services.garden.kept.eraseAll()).toEqual({ sowings: 1, settings: 1 });
    expect(await ok<GardenResponse>("GET", "/api/garden")).toEqual({ settings: { lastFrost: null, updatedAt: null }, sowings: [] });
  });
});
