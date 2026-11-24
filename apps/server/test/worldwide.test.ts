/**
 * What the server takes from where the household is and who is reading: a new plan's
 * emergency number from Home's country, the energy table Supplies works to, and dates
 * written in the reader's English.
 */
import { energyTableFor, internationalKcal, type SupplyOutlookResponse, tableKcal } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dateInWords, localeFromLanguages, readerLocale, withReaderLocale } from "../src/core/locale.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app?.close();
});

// biome-ignore lint/suspicious/noExplicitAny: tests read response bodies loosely and assert on them
const ok = async <T = any>(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<T> => {
  const response = await app.api(method, url, body, headers ? { headers } : {});
  expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
  return response.body as T;
};

const plan = (extra: Record<string, unknown> = {}) => ({ name: "Power cut", kind: "power-cut", body: {}, ...extra });
let homeId: string | null = null;
const setHome = async (lat: number, lon: number) => {
  if (homeId) await ok("DELETE", `/api/maps/markers/${homeId}`);
  homeId = (await ok<{ marker: { id: string } }>("POST", "/api/maps/markers", { name: "Home", lat, lon, icon: "home" })).marker.id;
};

describe("a new plan's emergency number", () => {
  it("is none with no home place, then the one for Home's country, none where it is not known, and a change that names none keeps the plan's", async () => {
    expect((await ok("POST", "/api/emergency-plans", plan())).plan.emergencyNumber).toBe("");
    await setHome(42.36, -71.06); // Boston: in the United States, though Canada's box reaches it
    expect((await ok("POST", "/api/emergency-plans", plan())).plan.emergencyNumber).toBe("911");
    await setHome(-23.55, -46.63); // São Paulo: no published source in Outpost, so no guess
    expect((await ok("POST", "/api/emergency-plans", plan())).plan.emergencyNumber).toBe("");
    await setHome(40.71, -74.0); // New York
    expect((await ok("POST", "/api/emergency-plans", plan())).plan.emergencyNumber).toBe("911");
    await setHome(51.5, -1.0); // Oxfordshire
    const made = await ok("POST", "/api/emergency-plans", plan());
    expect(made.plan.emergencyNumber).toBe("999");
    expect((await ok("POST", "/api/emergency-plans", plan({ emergencyNumber: "112" }))).plan.emergencyNumber).toBe("112");

    await setHome(48.85, 2.35); // Paris
    const changed = await ok("PUT", `/api/emergency-plans/${made.plan.id}`, { ...plan({ name: "Power cut at home" }) });
    expect(changed.plan.emergencyNumber).toBe("999");
  });
});

describe("the energy table for Supplies", () => {
  it("reads the international figures by year over each UK age band", () => {
    // 19 to 64: one year at the 15-19 figure, forty at 20-59, five at 60 and over.
    expect(internationalKcal("19-64", "male")).toBe(Math.round((2700 + 40 * 2460 + 5 * 2010) / 46));
    expect(internationalKcal("2-3", "female")).toBe(Math.round((1330 + 1440) / 2));
    expect(internationalKcal("under-1", "unstated")).toBe(820);
    expect(tableKcal("under-1", "unstated", "uk")).toBeNull();
    expect(tableKcal("19-64", "male")).toBe(2500);
    expect([energyTableFor("GB"), energyTableFor("us"), energyTableFor(null)]).toEqual(["uk", "international", "international"]);
  });

  it("takes the table from Home's country until the household chooses one", async () => {
    const household = (energyTable?: string) => ({
      daysWanted: 3,
      ...(energyTable ? { energyTable } : {}),
      drinkingLitres: 3,
      allUsesLitres: 7.5,
      waterBasis: "drinking",
      members: [{ kind: "person", name: "Sam", band: "19-64", sex: "male" }],
    });
    const perDay = async () => (await ok<SupplyOutlookResponse>("GET", "/api/supplies/outlook")).outlook.food.perDay;

    await setHome(51.5, -1.0);
    await ok("PUT", "/api/supplies/household", household());
    expect((await ok("GET", "/api/supplies")).household).toMatchObject({ energyTable: null, energyBasis: { table: "uk", country: "GB" } });
    expect(await perDay()).toBe(2500);

    await setHome(-33.87, 151.21); // Sydney
    expect((await ok("GET", "/api/supplies")).household.energyBasis).toEqual({ table: "international", country: "AU" });
    expect(await perDay()).toBe(internationalKcal("19-64", "male"));
    const words = (await ok<SupplyOutlookResponse>("GET", "/api/supplies/outlook")).energy;
    expect(JSON.stringify(words)).toContain("Food and Nutrition Needs in Emergencies");

    await ok("PUT", "/api/supplies/household", household("uk"));
    expect(await perDay()).toBe(2500);
    expect((await app.api("PUT", "/api/supplies/household", household("martian"))).status).toBe(400);
  });
});

describe("dates the server writes", () => {
  it("follow the region of the browser's language, in English, and British English otherwise", () => {
    expect(localeFromLanguages("en-US,en;q=0.9")).toBe("en-US");
    expect(localeFromLanguages("de-DE")).toBe("en-DE");
    expect(localeFromLanguages("en")).toBe("en-GB");
    expect(localeFromLanguages(undefined)).toBe("en-GB");
    expect(localeFromLanguages("zh-Hant-TW")).toBe("en-TW");
    const day = Date.UTC(2026, 10, 21, 12);
    expect(dateInWords(day, { timeZone: "UTC" })).toBe("21 Nov 2026");
    expect(withReaderLocale("en-US", () => dateInWords(day, { timeZone: "UTC" }))).toBe("Nov 21, 2026");
    expect(readerLocale()).toBe("en-GB");
  });

  it("are written for the browser that asked, also in what it saves", async () => {
    await ok("POST", "/api/event-log", { author: "Ana", text: "Power went off" });
    const us = await ok("POST", "/api/event-log/to-notes", {}, { "accept-language": "en-US,en;q=0.9" });
    const gb = await ok("POST", "/api/event-log/to-notes", {}, { "accept-language": "en-GB" });
    const today = new Date();
    expect(us.note.title).toBe(
      `Log of events, ${new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(today)}`,
    );
    expect(gb.note.title).toBe(
      `Log of events, ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(today)}`,
    );
  });
});
