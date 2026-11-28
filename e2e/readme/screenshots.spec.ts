/**
 * The README's pictures (docs/screenshots/*.webp), made again from nothing:
 *
 *   node scripts/build-app.mjs
 *   cd e2e && pnpm exec playwright test -c readme-screenshots.config.ts
 *
 * Photographed: Home; a catalogue sheet in the reader; a route on the map; an HF prediction;
 * the Radio hub; Settings; Preparedness's Getting ready; an emergency plan; a chat reply that
 * looked things up; Households, with a portable household; search results with their reasons
 * and "Also searched"; How search by meaning works (switched on, the library read by the built-in
 * model); a power plan's battery bank; the household book's page of repeaters (a page of its
 * PDF, drawn by pdf.js); Plan a route saying a country has no roads yet, then a drive with its
 * directions, its route card (also a PDF page) and the page of the task that read a country's
 * roads; Offline maps with its places and the Add a place sheet; Reachable from here, 30
 * minutes' drive; a page of notes (dark). On a phone: Messages. Only what the README shows is
 * photographed: a picture nothing names is not made (docs/screenshots holds exactly these).
 *
 * Everything shown is demonstration data written here for the purpose: made-up notes,
 * places on the test suite's made-up map (tests/map-fixture.ts, a hill and a lake with
 * invented names, drawn where Snowdonia is), contacts with invented names and the
 * telephone numbers Ofcom keeps for drama (07700 900xxx, 01632 960xxx), a household of three
 * with invented names and its supplies, a power plan, a plan from a template,
 * check-ins and messages on the board from invented people, and a handful of made-up shops and
 * water taps around the test map's villages for the food and supplies layer, which the spec
 * serves itself as a stand-in Overpass server. The households are Tŷ Prawf, at home on the test
 * map, and a caravan that has been to two made-up places there; the repeaters have callsigns
 * with the QZ prefix, which no country holds. The routes are read from the server tests' made-up
 * source files (apps/server/test/fixtures/roads/channel-trip.ts), shaped like the main roads from
 * London to the Alps, and the README says they are not OpenStreetMap's. Reachable from here is
 * the streets stand-in's recorded answer from a real Valhalla (see readme-screenshots.config.ts),
 * drawn on a real map of the United Kingdom when OUTPOST_README_MAPS names one. The HF prediction is VOACAP's real answer on the
 * suite's copy of its data. Answers and chat are
 * written by the stand-in model server (apps/server/test/model-server.ts), which repeats
 * the first sentence of each source it is given, or calls the tool its message names: it is
 * not a language model, and the README says so under those pictures.
 *
 * Each picture is cropped to what matters and written as WebP by the browser's own
 * encoder, so that nothing beyond the suite's Playwright is needed.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { type Browser, type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { franceNorth, franceSouth, greatBritain } from "../../apps/server/test/fixtures/roads/channel-trip.ts";
import { newPowerPlan, type PowerLoad } from "../../packages/shared/src/power.ts";
import { api } from "../tests/fixtures";
import { CENTRE, installTestMaps, removeTestMaps } from "../tests/map-fixture";
import { pdfPages } from "../tests/pdf";
import { choosePlace } from "../tests/road-routes";

const OUT = path.resolve(import.meta.dirname, "../../docs/screenshots");
const MODEL_URL = process.env.OUTPOST_README_MODEL_URL!;
const OVERPASS_URL = process.env.OUTPOST_README_OVERPASS_URL!;
/** Pictures written by this run, with their sizes, for the summary at the end. */
const written: Array<{ name: string; bytes: number }> = [];

const DESKTOP = { width: 1360, height: 860 };
const PHONE = { width: 390, height: 844 };

type Look = { theme?: "light" | "dark"; phone?: boolean };

/** A browser context as a person would open the app: no internet, the theme chosen, a phone if asked. */
async function open(browser: Browser, look: Look = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: look.phone ? PHONE : DESKTOP,
    deviceScaleFactor: look.phone ? 2 : 1,
    isMobile: look.phone ?? false,
    hasTouch: look.phone ?? false,
    colorScheme: look.theme ?? "light",
    locale: "en-GB",
    timezoneId: "Europe/London",
    serviceWorkers: "block",
  });
  // As in the suite: anything that is not this Outpost is refused, and the run fails if it was tried.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(url.hostname) || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    throw new Error(`the app tried to reach ${url.href}`);
  });
  const page = await context.newPage();
  return { context, page };
}

/**
 * Lets fonts, map tiles and anything animating settle before a picture is taken, and scrolls
 * the sidebar so that the screen's own entry stands in the middle of it, not under its fade.
 */
async function settle(page: Page, ms = 600): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    const marked = [...document.querySelectorAll<HTMLElement>('nav [aria-current="page"]')].filter(
      (element) => element.offsetParent !== null,
    );
    const scroll = window.scrollY;
    marked.at(-1)?.scrollIntoView({ block: "center" });
    window.scrollTo(0, scroll);
  });
  // No toast left over from what was pressed.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(ms);
}

/** Writes the picture as WebP, encoded by the browser, cropped to `clip` when given. */
async function shot(
  page: Page,
  name: string,
  options: { clip?: { x: number; y: number; width: number; height: number }; fullPage?: boolean } = {},
) {
  const png = await page.screenshot({ clip: options.clip, fullPage: options.fullPage, animations: "disabled", caret: "hide" });
  const encoder = await page.context().newPage();
  const webp = await encoder.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas.toDataURL("image/webp", 0.86);
  }, png.toString("base64"));
  await encoder.close();
  const bytes = Buffer.from(webp.split(",")[1]!, "base64");
  expect(webp.startsWith("data:image/webp"), "the browser can write WebP").toBe(true);
  fs.writeFileSync(path.join(OUT, `${name}.webp`), bytes);
  written.push({ name: `${name}.webp`, bytes: bytes.length });
}

/**
 * A picture of the page from the top of `top` to the bottom of `bottom`, across the main
 * column (the sidebar left out), the page scrolled as a whole.
 */
async function shotBetween(page: Page, name: string, top: Locator, bottom: Locator, pad = 24) {
  const viewport = page.viewportSize()!;
  if (viewport.width < 600) {
    // On a phone the header and the tab bar are fixed, and a whole-page picture paints them over the middle of
    // it. The window is made as tall as the page instead, so that they sit at its ends, outside the picture.
    const tall = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: viewport.width, height: tall });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const a = (await top.boundingBox())!;
    const b = (await bottom.boundingBox())!;
    const main = (await page.locator("main").first().boundingBox())!;
    await shot(page, name, { clip: { x: main.x, y: a.y - pad, width: main.width, height: b.y + b.height - a.y + 2 * pad } });
    await page.setViewportSize(viewport);
    return;
  }
  await top.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  const a = (await top.boundingBox())!;
  const b = (await bottom.boundingBox())!;
  const main = (await page.locator("main").first().boundingBox())!;
  const y = a.y + scroll - pad;
  await shot(page, name, {
    fullPage: true,
    clip: { x: main.x, y, width: main.width, height: b.y + b.height - a.y + 2 * pad },
  });
}

/** Waits until no background work is running (text extraction, indexing), as the sidebar says. */
async function idle(page: Page) {
  await expect.poll(async () => ((await api(page, "GET", "/api/jobs?active=true")).jobs as unknown[]).length, { timeout: 180_000 }).toBe(0);
  await expect(page.getByText("Ready offline").first()).toBeVisible({ timeout: 30_000 });
}

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (...parts: unknown[]) => ({ type: "paragraph", content: parts });
const heading = (level: number, value: string) => ({ type: "heading", attrs: { level }, content: [text(value)] });
const todo = (value: string, checked = false) => ({
  type: "taskItem",
  attrs: { checked },
  content: [paragraph(text(value))],
});

/** Made-up notes, a tree of a few pages. */
async function writeNotes(page: Page): Promise<string> {
  const home = (
    await api(page, "POST", "/api/notes", {
      title: "Household",
      content: {
        type: "doc",
        content: [paragraph(text("Plans and lists for the house. Kept here so that everyone at home can read them on a phone."))],
      },
    })
  ).note;
  const kit = (
    await api(page, "POST", "/api/notes", {
      parentId: home.id,
      title: "Kit for a power cut",
      content: {
        type: "doc",
        content: [
          paragraph(text("Everything is in the blue crate under the stairs. Check it on the first Sunday of the month.")),
          heading(2, "Light and power"),
          {
            type: "taskList",
            content: [todo("Two LED torches and spare AA cells", true), todo("Head torch", true), todo("Power bank, charged")],
          },
          heading(2, "Water"),
          paragraph(
            text(
              "Store 3 litres a person a day for drinking, for at least three days. If the tap water is not safe, boil it at a rolling boil for one minute and let it cool.",
            ),
          ),
          heading(2, "Radio"),
          paragraph(text("The wind-up radio is on the kitchen shelf. Local news on FM; long wave for the shipping forecast.")),
        ],
      },
    })
  ).note;
  await api(page, "POST", "/api/notes", {
    parentId: home.id,
    title: "Meeting points",
    content: {
      type: "doc",
      content: [
        paragraph(text("If we cannot go home: the village hall. If the village is closed off: the car park at the foot of Bryn Prawf.")),
      ],
    },
  });
  await api(page, "POST", "/api/notes", {
    parentId: home.id,
    title: "Water and food store",
    content: {
      type: "doc",
      content: [paragraph(text("Rotate the tins: oldest to the front. Bottled water is replaced every year in March."))],
    },
  });
  const hills = (
    await api(page, "POST", "/api/notes", {
      title: "Hill days",
      content: { type: "doc", content: [paragraph(text("Routes walked, and what to take."))] },
    })
  ).note;
  await api(page, "POST", "/api/notes", {
    parentId: hills.id,
    title: "Round of Bryn Prawf",
    content: {
      type: "doc",
      content: [
        paragraph(text("About 9 km and 700 m of climbing. Water from the spring below the bothy; boil or filter it.")),
        paragraph(text("Turn back at the bothy if the cloud is down to the lake.")),
      ],
    },
  });
  await api(page, "POST", "/api/notes", {
    title: "Radio net, Sunday mornings",
    content: {
      type: "doc",
      content: [paragraph(text("Check in at 09:00 on the club repeater, then 145.500 MHz simplex if it is off the air."))],
    },
  });
  return kit.id;
}

/** Contacts with invented names and numbers from Ofcom's ranges for drama. */
async function writeContacts(page: Page) {
  const person = (given: string, family: string, extra: Record<string, unknown>) =>
    api(page, "POST", "/api/contacts", { kind: "person", name: { prefix: "", given, additional: "", family, suffix: "" }, ...extra });
  await person("Morwenna", "Example", {
    phones: [{ value: "07700 900101", label: "mobile" }],
    isEmergency: true,
    emergencyNote: "Next door. Has a spare key and a generator.",
    tags: ["Neighbours"],
  });
  await person("Idris", "Specimen", {
    phones: [
      { value: "07700 900202", label: "mobile" },
      { value: "01632 960303", label: "home" },
    ],
    isEmergency: true,
    emergencyNote: "Out-of-area contact: ring him if we are split up.",
    tags: ["Family"],
  });
  await person("Ffion", "Placeholder", {
    phones: [{ value: "07700 900404", label: "mobile" }],
    emails: [{ value: "ffion@example.org", label: "home" }],
    tags: ["Family"],
  });
  await api(page, "POST", "/api/contacts", {
    kind: "organisation",
    name: { prefix: "", given: "", additional: "", family: "", suffix: "" },
    organisation: "Village hall",
    phones: [{ value: "01632 960505", label: "work" }],
    isEmergency: true,
    emergencyNote: "Rest centre in a long power cut. Key with the warden.",
  });
}

/** Places and a route on the made-up map. */
async function writePlaces(page: Page): Promise<Record<string, string>> {
  const places = [
    { name: "Home", lat: 53.0835, lon: -4.1065, icon: "home", color: "green" },
    { name: "Car park", lat: 53.058, lon: -4.112, icon: "parking", color: "blue" },
    { name: "Bothy", lat: 53.098, lon: -4.03, icon: "shelter", color: "red", isFavorite: true },
    { name: "Spring", lat: 53.093, lon: -4.04, icon: "water", color: "blue" },
    { name: "Village hall", lat: 53.091, lon: -4.112, icon: "meeting", color: "green", isFavorite: true },
    { name: "Summit cairn", lat: 53.105, lon: -4.01, icon: "summit", color: "amber" },
  ];
  const ids: Record<string, string> = {};
  for (const place of places) ids[place.name] = (await api(page, "POST", "/api/maps/markers", place)).marker.id;
  await api(page, "POST", "/api/maps/tracks", {
    name: "Round of Bryn Prawf",
    color: "red",
    points: [
      { lat: 53.058, lon: -4.112 },
      { lat: 53.07, lon: -4.09 },
      { lat: 53.085, lon: -4.055 },
      { lat: 53.093, lon: -4.04 },
      { lat: 53.098, lon: -4.03 },
      { lat: 53.105, lon: -4.01 },
      { lat: 53.094, lon: -3.99 },
      { lat: 53.075, lon: -4.0 },
      { lat: 53.062, lon: -4.03 },
      { lat: 53.055, lon: -4.07 },
      { lat: 53.058, lon: -4.112 },
    ],
  });
  return ids;
}

async function writeSupplies(page: Page) {
  await api(page, "PUT", "/api/supplies/household", {
    daysWanted: 7,
    drinkingLitres: 3,
    allUsesLitres: 7.5,
    waterBasis: "drinking",
    members: [
      { kind: "person", name: "Gwen", band: "19-64", sex: "female" },
      { kind: "person", name: "Sam", band: "19-64", sex: "male" },
      { kind: "person", name: "Nia", band: "7-10", sex: "unstated" },
    ],
  });
  const year = new Date().getFullYear();
  const items = [
    {
      name: "Baked beans",
      category: "food",
      quantity: 12,
      unit: "tin",
      location: "Pantry",
      dateKind: "best-before",
      date: `${year + 1}-08-31`,
      kcalPer100g: 84,
      gramsPerUnit: 415,
    },
    {
      name: "Porridge oats",
      category: "food",
      quantity: 3,
      unit: "bag",
      location: "Pantry",
      dateKind: "best-before",
      date: `${year + 1}-02-28`,
      kcalPer100g: 375,
      gramsPerUnit: 1000,
    },
    {
      name: "Tinned soup",
      category: "food",
      quantity: 8,
      unit: "tin",
      location: "Pantry",
      dateKind: "best-before",
      date: `${year}-12-31`,
      kcalPer100g: 45,
      gramsPerUnit: 400,
    },
    {
      name: "Rice",
      category: "food",
      quantity: 2,
      unit: "bag",
      location: "Pantry",
      dateKind: "best-before",
      date: `${year + 2}-05-31`,
      kcalPer100g: 350,
      gramsPerUnit: 1000,
    },
    {
      name: "Bottled water",
      category: "water",
      quantity: 24,
      unit: "bottle",
      location: "Garage",
      dateKind: "best-before",
      date: `${year + 1}-03-31`,
      litresPerUnit: 2,
    },
    { name: "AA batteries", category: "batteries", quantity: 16, location: "Blue crate" },
    { name: "First aid kit", category: "medical", quantity: 1, location: "Kitchen", minimum: 1 },
    { name: "Camping gas", category: "fuel", quantity: 4, unit: "canister", location: "Garage", minimum: 2 },
  ];
  for (const item of items) await api(page, "POST", "/api/supplies/items", item);
}

async function writePowerPlan(page: Page): Promise<string> {
  const plan = newPowerPlan("Shed radio station in a power cut");
  plan.notes = "Figures typed for the demonstration; take real ones from each label.";
  plan.battery.ampHours = 50;
  plan.battery.series = 2;
  plan.battery.parallel = 2;
  plan.battery.maxDischargeA = 100;
  plan.cableRatingA = 60;
  const loads: PowerLoad[] = [
    {
      id: "pi",
      kind: "device",
      name: "Raspberry Pi 5 running Outpost",
      supply: "dc",
      quantity: 1,
      startHour: 0,
      watts: 8,
      hoursPerDay: 24,
    },
    { id: "lights", kind: "device", name: "LED lights", supply: "dc", quantity: 2, startHour: 17, watts: 5, hoursPerDay: 5 },
    { id: "router", kind: "device", name: "Wi-Fi router", supply: "dc", quantity: 1, startHour: 0, watts: 6, hoursPerDay: 24 },
    {
      id: "hf",
      kind: "radio",
      name: "HF transceiver",
      supply: "dc",
      quantity: 1,
      startHour: 8,
      transmitW: 220,
      receiveW: 15,
      standbyW: 5,
      onAirHours: 3,
      standbyHours: 4,
      transmitShare: 0.5,
      modeFactor: 0.2,
      mode: "ssb",
    },
  ];
  plan.loads = loads;
  plan.solar.arrayWatts = 200;
  plan.solar.sunHours = [0.7, 1.4, 2.4, 3.6, 4.4, 4.7, 4.6, 3.9, 2.9, 1.8, 0.9, 0.6];
  return (await api(page, "POST", "/api/power/plans", plan)).plan.id;
}

/** A household's check-ins and messages on the board, from made-up people. */
async function writeBoard(page: Page) {
  await api(page, "POST", "/api/board/messages", {
    author: "Sam",
    body: "Power's off on our side of the village too. Torches are in the blue crate.",
  });
  await api(page, "POST", "/api/board/check-ins", { author: "Gwen", status: "safe", place: "at the village hall" });
  await api(page, "POST", "/api/board/messages", {
    author: "Gwen",
    body: "The hall has heat and a kettle. Bring the flasks if you come down.",
  });
  await api(page, "POST", "/api/board/check-ins", { author: "Sam", status: "safe", place: "at home" });
  await api(page, "POST", "/api/board/check-ins", {
    author: "Rhys",
    status: "other",
    place: "car park at Pont Arbrawf",
    body: "Road closed, walking back",
  });
  await api(page, "POST", "/api/board/messages", { author: "Alex", body: "I'll meet you at the bridge with the big torch, Rhys." });
}

/**
 * Road networks for Great Britain and France, built from the server tests' made-up extracts (shaped like
 * the main roads from London to the Alps), put in storage as a person's own files; and the trip's ends as
 * saved places. Nothing is downloaded.
 */
async function installRoadNetworks(page: Page, countries: readonly string[]) {
  const { locations } = await api<{ locations: Array<{ id: string; path: string; isDefault: boolean }> }>(
    page,
    "GET",
    "/api/storage/locations",
  );
  const location = locations.find((each) => each.isDefault) ?? locations[0]!;
  fs.mkdirSync(path.join(location.path, "roads"), { recursive: true });
  const chosen = (
    [
      ["Great Britain", greatBritain(), "GB", "great-britain"],
      ["France, north", franceNorth(), "FR", "france-north"],
      ["France, south", franceSouth(), "FR", "france-south"],
    ] as const
  ).filter(([, , country]) => countries.includes(country));
  const before = (await api<{ networks: unknown[] }>(page, "GET", "/api/roads/networks")).networks.length;
  for (const [name, body, country, file] of chosen) {
    fs.writeFileSync(path.join(location.path, "roads", `${file}.osm.pbf`), body);
    await api(page, "POST", "/api/roads/networks", { locationId: location.id, relPath: `roads/${file}.osm.pbf`, name, country });
  }
  await expect
    .poll(async () => (await api<{ networks: unknown[] }>(page, "GET", "/api/roads/networks")).networks.length, { timeout: 60_000 })
    .toBe(before + chosen.length);
}

/** The trip's ends and the town it goes by, as saved places. */
async function writeTripPlaces(page: Page) {
  for (const place of [
    { name: "Leatherhead", lat: 51.296, lon: -0.33 },
    { name: "Reims", lat: 49.27, lon: 4.06 },
    { name: "Chamonix", lat: 45.9237, lon: 6.8694 },
  ])
    await api(page, "POST", "/api/maps/markers", place);
}

/**
 * A real map and terrain of the United Kingdom, when OUTPOST_README_MAPS names a folder holding
 * them: linked into storage (not copied: they are large) and imported as a person's own files.
 */
async function installRealMaps(page: Page): Promise<boolean> {
  const folder = process.env.OUTPOST_README_MAPS;
  if (!folder) return false;
  const { locations } = await api<{ locations: Array<{ id: string; path: string; isDefault: boolean }> }>(
    page,
    "GET",
    "/api/storage/locations",
  );
  const location = locations.find((each) => each.isDefault) ?? locations[0]!;
  fs.mkdirSync(path.join(location.path, "imports"), { recursive: true });
  for (const [file, name, tileType] of [
    ["uk-map.pmtiles", "United Kingdom", undefined],
    ["uk-terrain.pmtiles", "United Kingdom, hills", "terrain"],
  ] as const) {
    fs.linkSync(path.join(folder, file), path.join(location.path, "imports", file));
    await api(page, "POST", "/api/maps/import", {
      locationId: location.id,
      relPath: `imports/${file}`,
      name,
      ...(tileType ? { tileType } : {}),
    });
  }
  return true;
}

/** The first household named and given its home on the test map; answers its id. */
async function nameHome(page: Page, homeId: string): Promise<string> {
  const { households } = await api<{ households: Array<{ id: string }> }>(page, "GET", "/api/households");
  const id = households[0]!.id;
  await api(page, "PUT", `/api/households/${id}`, { name: "Tŷ Prawf", homePlaceId: homeId });
  return id;
}

/** A portable household, the caravan, with the people of the first and the places it has been. */
async function writeCaravan(page: Page, firstId: string) {
  const { household } = await api<{ household: { id: string } }>(page, "POST", "/api/households", {
    name: "Caravan",
    kind: "portable",
    copyPeopleFrom: firstId,
  });
  await api(page, "PUT", `/api/households/${household.id}/here`, {
    lat: 53.0571,
    lon: -4.1281,
    name: "Pont Arbrawf",
    source: "map",
  });
  await api(page, "PUT", `/api/households/${household.id}/here`, {
    lat: 53.046,
    lon: -4.035,
    name: "Campsite at Nant",
    source: "map",
  });
}

/** Two repeaters with invented callsigns (the QZ prefix is given to no country), on the hill and by the village. */
async function writeRepeaters(page: Page) {
  await api(page, "POST", "/api/repeaters", {
    callsign: "QZ3BRP",
    outputHz: 145_712_500,
    inputHz: 145_112_500,
    ctcssHz: 77,
    lat: 53.103,
    lon: -4.012,
    place: "Bryn Prawf",
  });
  await api(page, "POST", "/api/repeaters", {
    callsign: "QZ7CPR",
    outputHz: 433_150_000,
    inputHz: 434_750_000,
    ctcssHz: 110.9,
    lat: 53.0915,
    lon: -4.1105,
    place: "Capel Prawf",
  });
}

/**
 * One page of a PDF the app made, drawn by pdf.js in the browser (the suite's own copy, served
 * from this Outpost's address so that nothing is fetched from elsewhere) and written as WebP.
 */
async function pdfPageShot(context: BrowserContext, bytes: Buffer, pageNumber: number, name: string, share = 1, scale = 1.6) {
  const build = path.resolve(import.meta.dirname, "../node_modules/pdfjs-dist/build");
  const page = await context.newPage();
  await page.route("**/__readme/**", (route) => {
    const file = path.join(build, path.basename(new URL(route.request().url()).pathname));
    return route.fulfill({ body: fs.readFileSync(file), contentType: "text/javascript" });
  });
  await page.route("**/__readme-page", (route) => route.fulfill({ body: "<!doctype html><title>page</title>", contentType: "text/html" }));
  await page.goto("/__readme-page");
  const webp = await page.evaluate(
    async ({ base64, number, scale, share }) => {
      const module = "/__readme/pdf.min.mjs";
      const pdfjs = await import(module);
      pdfjs.GlobalWorkerOptions.workerSrc = "/__readme/pdf.worker.min.mjs";
      const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const document = await pdfjs.getDocument({ data }).promise;
      const pdfPage = await document.getPage(number);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
      // The top of the page only, when asked: the part that matters, not the notes under it.
      const cropped = window.document.createElement("canvas");
      cropped.width = canvas.width;
      cropped.height = Math.round(canvas.height * share);
      cropped.getContext("2d")!.drawImage(canvas, 0, 0);
      return cropped.toDataURL("image/webp", 0.86);
    },
    { base64: bytes.toString("base64"), number: pageNumber, scale, share },
  );
  await page.close();
  const body = Buffer.from(webp.split(",")[1]!, "base64");
  fs.writeFileSync(path.join(OUT, `${name}.webp`), body);
  written.push({ name: `${name}.webp`, bytes: body.length });
}

/** The pages of a PDF, numbered from 1, whose words include `words`. */
async function pagesWith(bytes: Buffer, words: RegExp): Promise<number[]> {
  return (await pdfPages(bytes)).flatMap((page, index) => (page.items.some((item) => words.test(item)) ? [index + 1] : []));
}

/**
 * A stand-in for an Overpass server, for the food and supplies layer: it answers the layer's
 * questions with a handful of made-up shops and a water tap around the test map's villages.
 */
const FOOD_PLACES: Array<{ id: number; lat: number; lon: number; tags: Record<string, string> }> = [
  { id: 1, lat: 53.0905, lon: -4.1135, tags: { shop: "convenience", name: "Siop y Capel", opening_hours: "Mo-Sa 07:00-20:00" } },
  { id: 2, lat: 53.0928, lon: -4.1172, tags: { shop: "bakery", name: "Popty Prawf" } },
  { id: 3, lat: 53.0912, lon: -4.1098, tags: { amenity: "pharmacy", name: "Fferyllfa Capel Prawf" } },
  { id: 4, lat: 53.0935, lon: -4.1121, tags: { amenity: "drinking_water" } },
  { id: 5, lat: 53.0598, lon: -4.1238, tags: { shop: "farm", name: "Fferm Arbrawf farm shop" } },
  { id: 6, lat: 53.0571, lon: -4.1281, tags: { amenity: "fuel", shop: "convenience", name: "Garej Pont Arbrawf" } },
  { id: 7, lat: 53.0462, lon: -4.0372, tags: { shop: "general", name: "Siop Nant" } },
  { id: 8, lat: 53.0448, lon: -4.0331, tags: { man_made: "water_tap", drinking_water: "yes" } },
  { id: 9, lat: 53.0757, lon: -4.0921, tags: { shop: "supermarket", name: "Made-up Stores" } },
];

function startOverpassStandIn(address: string): Promise<http.Server> {
  const { port } = new URL(address);
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const query = new URLSearchParams(Buffer.concat(chunks).toString("utf8")).get("data") ?? "";
      const osm3s = { timestamp_osm_base: `${new Date().toISOString().slice(0, 19)}Z` };
      const elements = query.includes("out count")
        ? query
            .split("out count")
            .slice(1)
            .map(() => ({
              type: "count",
              id: 0,
              tags: { nodes: String(FOOD_PLACES.length), ways: "0", relations: "0", total: String(FOOD_PLACES.length) },
            }))
        : FOOD_PLACES.map((place) => ({ type: "node", ...place }));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ version: 0.6, generator: "Outpost's README stand-in", osm3s, elements }));
    });
  });
  return new Promise((resolve) => server.listen(Number(port), "127.0.0.1", () => resolve(server)));
}

test("the README's pictures", async ({ browser }) => {
  test.setTimeout(1_200_000);
  fs.mkdirSync(OUT, { recursive: true });
  const { context, page } = await open(browser);
  await page.goto("/");

  // ── Demonstration data ──
  for (const id of [
    "outpost.radio.uk-amateur-bands",
    "outpost.radio.emergency-frequencies",
    "outpost.radio.licence-free-radio",
    "logbook73.handbook",
  ]) {
    await api(page, "POST", `/api/catalog/entries/${id}/add`, {});
  }
  const kitId = await writeNotes(page);
  await writeContacts(page);
  const testMaps = await installTestMaps(page, { map: "Bryn Prawf and around", terrain: "Bryn Prawf, hills" });
  const placeIds = await writePlaces(page);
  const homeHouseholdId = await nameHome(page, placeIds.Home!);
  await writeSupplies(page);
  await writeCaravan(page, homeHouseholdId);
  await writeRepeaters(page);
  const powerId = await writePowerPlan(page);
  await api(page, "PATCH", "/api/settings", {
    "answers.enabled": true,
    "answers.endpoint": `${MODEL_URL}/v1`,
    "answers.model": "stand-in:latest",
  });
  await writeBoard(page);
  // Food and supplies for the test map, from the spec's own Overpass stand-in.
  const overpass = await startOverpassStandIn(OVERPASS_URL);
  const estimate = await api<{ estimateId: string; items: Array<{ key: string }> }>(page, "POST", "/api/reference/estimate", {
    provider: "osm",
    clientNameAgreed: true,
    scope: { bbox: [-4.16, 53.03, -4.0, 53.11] },
    layers: ["food"],
  });
  await api(page, "POST", "/api/reference/downloads", { estimateId: estimate.estimateId, keys: estimate.items.map((item) => item.key) });
  await expect
    .poll(async () => (await api<{ packs: Array<{ records: number }> }>(page, "GET", "/api/reference/packs")).packs[0]?.records ?? 0, {
      timeout: 30_000,
    })
    .toBe(FOOD_PLACES.length);
  overpass.close();
  // Text extraction and indexing are jobs: wait for the library to be searchable.
  await expect
    .poll(async () => (await api(page, "GET", "/api/search?q=frequency")).results?.length ?? 0, { timeout: 60_000 })
    .toBeGreaterThan(0);

  // ── Home ──
  await page.goto("/");
  await idle(page);
  await settle(page);
  await shot(page, "home");

  // ── A sheet from the catalogue, in the reader ──
  await page.goto("/library");
  await page.getByRole("link", { name: "Amateur radio bands in the United Kingdom" }).first().click();
  await settle(page, 1500);
  await shot(page, "reader");

  // ── Maps: places and a route on the test map, with its profile ──
  await page.goto(`/maps?lat=${CENTRE.lat + 0.012}&lon=${CENTRE.lon + 0.03}&zoom=12.2`);
  await page.getByRole("tab", { name: /Routes/ }).click();
  await page.getByText("Round of Bryn Prawf", { exact: true }).first().click();
  await settle(page, 2500);
  await shot(page, "maps");

  // ── HF propagation: VOACAP's answer ──
  await page.goto("/radio/propagation");
  await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
  await expect(page.getByRole("heading", { name: /7\.10 MHz at \d\d:00 UTC/ })).toBeVisible({ timeout: 60_000 });
  await settle(page, 1500);
  await shotBetween(
    page,
    "propagation",
    page.getByRole("heading", { name: "London to Birmingham" }),
    page.getByRole("heading", { name: /7\.10 MHz at \d\d:00 UTC/ }),
  );

  // ── The Radio hub, its groups in order: listen, learn, plan ──
  await page.goto("/radio");
  await settle(page);
  await shotBetween(
    page,
    "radio-hub",
    page.getByRole("heading", { level: 1, name: "Radio" }),
    page
      .getByRole("main")
      .getByRole("link", { name: /^HF propagation/ })
      .first(),
    8,
  );

  // ── Settings, in groups ──
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await settle(page);
  await shot(page, "settings", { clip: { x: 256, y: 0, width: DESKTOP.width - 256, height: DESKTOP.height } });

  // ── Preparedness: Getting ready, three of five done (people, home, supplies), the plan next ──
  await page.goto("/prepare");
  await expect(page.getByText("3 of 5 done")).toBeVisible();
  await settle(page);
  await shotBetween(
    page,
    "getting-ready",
    page.getByRole("heading", { name: "Getting ready" }),
    page.getByRole("link", { name: /The household book/ }).first(),
  );

  await page.goto("/prepare/plans");
  await page.getByRole("button", { name: "New plan" }).first().click();
  const choose = page.getByRole("dialog", { name: "New emergency plan" });
  await choose.getByRole("radio", { name: /^Power cut/ }).click();
  await choose.getByRole("button", { name: "Make the plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Power cut" })).toBeVisible();
  await settle(page);
  await page
    .getByRole("heading", { name: "Steps", exact: true })
    .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 24));
  await page.waitForTimeout(300);
  await shot(page, "emergency-plan");

  // ── Chat: the stand-in asks Outpost for the nearest drinking water, and the reply says what was looked at ──
  await api(page, "PATCH", "/api/settings", { "answers.model": "stand-in-tools:latest", "tools.enabled": true });
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill('Where is the nearest drinking water to the village hall? use find_places {"kind":"drinking water","near":"53.091,-4.112"}');
  await page.getByRole("button", { name: "Send" }).click();
  const reply = page.getByRole("article", { name: /^Reply from/ }).last();
  const lookedAt = reply.getByRole("region", { name: "What the model looked up in Outpost" });
  await expect(lookedAt).toContainText("Looked at:", { timeout: 30_000 });
  await expect(reply.getByTestId("reply-text")).toContainText("From Outpost", { timeout: 30_000 });
  await lookedAt.getByRole("button").first().click();
  await expect(lookedAt.locator("blockquote")).toBeVisible();
  await settle(page);
  await shot(page, "chat-looked-at");
  await api(page, "PATCH", "/api/settings", { "answers.model": "stand-in:latest", "tools.enabled": false });

  // ── Households: Tŷ Prawf at home, and the caravan, which moves ──
  await page.goto("/prepare/households");
  await expect(page.getByRole("list", { name: "Households" }).getByRole("listitem")).toHaveCount(2);
  await settle(page);
  await shot(page, "households");

  // ── Search: reasons beside each result, and the other ways of saying a word that were searched too ──
  await page.goto("/search?q=flashlight");
  await expect(page.getByText(/Also searched:/)).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await shot(page, "search-reasons");

  // ── How search by meaning works, with it switched on and the library read by the model that comes with Outpost ──
  await api(page, "PATCH", "/api/settings", { "search.semantic.enabled": true });
  await expect
    .poll(
      async () => {
        const status = await api<{ ready: boolean; indexing: boolean; embeddedChunks: number; totalChunks: number }>(
          page,
          "GET",
          "/api/semantic/status",
        );
        return status.ready && !status.indexing && status.embeddedChunks === status.totalChunks;
      },
      { timeout: 600_000 },
    )
    .toBe(true);
  await page.goto("/search/how-meaning-works");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await settle(page, 1000);
  await shot(page, "how-meaning-works");

  // ── Power: the battery bank, drawn as it is joined ──
  await page.goto(`/tools/power/plans/${powerId}`);
  const bank = page.getByRole("heading", { name: "Battery bank", exact: true });
  await expect(bank).toBeVisible();
  await settle(page, 1000);
  await shotBetween(page, "power-bank", bank, page.getByRole("img", { name: /^Battery bank/ }));

  // ── The household book: made here, and its page of repeaters round home drawn over the terrain ──
  {
    const book = await api(page, "GET", "/api/household-book");
    await api(page, "PUT", "/api/household-book", {
      ...book.answers,
      householdName: "Tŷ Prawf",
      emergencyNumber: "999",
      paper: "a4",
      notesPages: 0,
      meetingPoints: [{ id: "m1", markerId: placeIds["Village hall"], role: "near", note: "By the front door" }],
      baseAnswersAt: book.answersAt,
    });
    await page.goto("/prepare/book");
    await page.getByRole("button", { name: "Make the book" }).click();
    const save = page.getByRole("link", { name: "Save as PDF" });
    await expect(save).toBeVisible({ timeout: 240_000 });
    const downloading = page.waitForEvent("download");
    await save.click();
    const bytes = fs.readFileSync(await (await downloading).path());
    const repeaterPages = await pagesWith(bytes, /QZ3BRP/);
    expect(repeaterPages.length, "the book has a page of repeaters").toBeGreaterThan(0);
    await pdfPageShot(context, bytes, repeaterPages.at(-1)!, "book-repeaters", 0.56);
  }

  // ── Plan a route: Great Britain's roads only at first, so France is said to be missing; then France's added ──
  {
    await installRoadNetworks(page, ["GB"]);
    await writeTripPlaces(page);
    await page.setViewportSize({ width: DESKTOP.width, height: 1100 });
    await page.goto("/maps?lat=48.6&lon=3.2&z=5.4");
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    await page.getByRole("tab", { name: /Routes/ }).click();
    await page.getByRole("button", { name: "Plan a route" }).first().click();
    await choosePlace(page, "From", "Leatherhead");
    await choosePlace(page, "To", "Chamonix");
    await expect(page.getByText("France has no roads yet")).toBeVisible();
    await settle(page, 1500);
    // The panel only, from its heading to Plan route, held back until France is added.
    {
      const top = (await page.getByRole("heading", { name: "Plan a route", exact: true }).boundingBox())!;
      const bottom = (await page.getByRole("button", { name: "Plan route" }).boundingBox())!;
      // The side panel lies between the sidebar (256 px) and the map, 352 px wide at this size.
      const panel = { x: 256, width: 352 };
      await shot(page, "route-needs-france", {
        clip: { x: panel.x, y: top.y - 20, width: panel.width, height: bottom.y + bottom.height - top.y + 40 },
      });
    }

    await installRoadNetworks(page, ["FR"]);
    await page.goto("/maps?lat=48.6&lon=3.2&z=5.4");
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    await page.getByRole("tab", { name: /Routes/ }).click();
    await page.getByRole("button", { name: "Plan a route" }).first().click();
    await choosePlace(page, "From", "Leatherhead");
    await page.getByRole("button", { name: "Add a via point" }).click();
    await choosePlace(page, "Via 1", "Reims");
    await choosePlace(page, "To", "Chamonix");
    await page.getByLabel("Sea crossing").click();
    await page.getByRole("option", { name: /Dover \(UK\) - Calais \(F\)/ }).click();
    await page.getByRole("button", { name: "Plan route" }).click();
    await expect(page.getByRole("heading", { name: "Leatherhead to Chamonix" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("list", { name: "Directions" })).toBeVisible();
    await settle(page, 2500);
    await shot(page, "road-route");
    await page.getByLabel("Name to save it under").fill("To the Alps");
    await page.getByRole("button", { name: "Save route" }).click();
    await expect(page.getByRole("heading", { name: "To the Alps" })).toBeVisible();
    await page.getByRole("button", { name: "Printable route card (PDF)" }).click();
    const save = page.getByTestId("road-route-card").getByRole("link", { name: "Save as PDF" });
    await expect(save).toBeVisible({ timeout: 60_000 });
    const downloading = page.waitForEvent("download");
    await save.click();
    const bytes = fs.readFileSync(await (await downloading).path());
    await pdfPageShot(context, bytes, 1, "route-card");
    await page.setViewportSize(DESKTOP);

    // ── Downloads and tasks: the page of one task, the building of a road network ──
    const { jobs } = await api<{ jobs: Array<{ id: string; state: string; title: string }> }>(
      page,
      "GET",
      "/api/jobs?types=roads.build&limit=10",
    );
    const built = jobs.find((job) => job.state === "succeeded" && /Great Britain|United Kingdom/.test(job.title))!;
    await page.goto(`/downloads/tasks/${built.id}`);
    await expect(page.getByRole("heading", { name: "What happened" })).toBeVisible();
    await settle(page);
    await shot(page, "task-page");
  }

  await context.close();

  // ── Phone ──
  {
    const { context: phone, page: p } = await open(browser, { phone: true });
    // Messages, as Alex reads them: the household's check-ins and what was said.
    await p.evaluate(() => localStorage.setItem("outpost.board.name", "Alex"));
    await p.goto("/messages");
    await expect(p.getByRole("list", { name: "Latest check-ins" }).getByRole("listitem").first()).toBeVisible();
    await expect(p.getByRole("list", { name: "Messages, oldest first" }).getByRole("listitem").last()).toBeVisible();
    await settle(p);
    await shotBetween(
      p,
      "phone-messages",
      p.getByRole("heading", { name: "Check-ins" }),
      p.getByRole("list", { name: "Messages, oldest first" }),
    );

    await phone.close();
  }

  // ── Offline maps: the places held, the made-up test map put away first; and Add a place, at What for ──
  {
    const { context: maps, page: m } = await open(browser);
    await m.goto("/");
    await removeTestMaps(m, testMaps);
    const real = await installRealMaps(m);
    await m.goto("/maps/data");
    await expect(m.locator('[data-place="country:GB"]')).toBeVisible();
    await settle(m);
    await shot(m, "offline-maps", { clip: { x: 256, y: 24, width: DESKTOP.width - 256, height: 520 } });
    // Tall enough that the sheet shows all of What for without scrolling.
    await m.setViewportSize({ width: DESKTOP.width, height: 1100 });
    await m.getByRole("button", { name: "Add a place" }).first().click();
    const add = m.getByRole("dialog", { name: "Add a place" });
    await add.getByLabel("Country, region or town").fill("Ireland");
    await add
      .getByRole("list", { name: "Places found" })
      .getByRole("button", { name: /^Ireland/ })
      .first()
      .click();
    await expect(add.getByRole("heading", { name: "What for Ireland?" })).toBeVisible();
    // The sheet is held to 46rem and scrolls; for the picture it is let run to its full height, so that nothing is cut.
    await add.evaluate((element) => {
      (element as HTMLElement).style.maxHeight = "none";
    });
    await settle(m);
    await shot(m, "add-a-place", { clip: (await add.boundingBox())! });
    await m.keyboard.press("Escape");
    await m.setViewportSize(DESKTOP);

    // ── Reachable from here: 30 minutes' drive from Leatherhead, over the streets ──
    await m.goto(`/maps?lat=51.296&lon=-0.33&z=${real ? 9.7 : 8}&reach=1`);
    const card = m.getByTestId("reach-card");
    await expect(card.getByRole("list", { name: "Legend" })).toContainText("Within 30 min", { timeout: 30_000 });
    await m.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    await settle(m, 2500);
    await shot(m, "reachable", { clip: { x: 256, y: 0, width: DESKTOP.width - 256, height: DESKTOP.height } });
    await maps.close();
  }

  // ── Dark ──
  {
    const { context: dark, page: d } = await open(browser, { theme: "dark" });
    await d.goto(`/notes/${kitId}`);
    await settle(d);
    await shot(d, "notes-dark");
    await dark.close();
  }

  console.log(written.map((item) => `${item.name} ${(item.bytes / 1024).toFixed(0)} kB`).join("\n"));
  console.log(`total ${(written.reduce((sum, item) => sum + item.bytes, 0) / 1024).toFixed(0)} kB`);
});
