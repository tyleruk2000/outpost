/**
 * The README's pictures (docs/screenshots/*.webp), made again from nothing:
 *
 *   node scripts/build-app.mjs
 *   cd e2e && pnpm exec playwright test -c readme-screenshots.config.ts
 *
 * Everything shown is demonstration data written here for the purpose: made-up notes,
 * places on the test suite's made-up map (tests/map-fixture.ts, a hill and a lake with
 * invented names, drawn where Snowdonia is), contacts with invented names and the
 * telephone numbers Ofcom keeps for drama (07700 900xxx, 01632 960xxx), a household's
 * supplies, a power plan, a plan from a template, and a scenario in the nuclear
 * workspace. The HF prediction is VOACAP's real answer on the suite's copy of its data.
 * The network list is the made-up network the suite stands in with. Answers and chat are
 * written by the stand-in model server (apps/server/test/model-server.ts), which repeats
 * the first sentence of each source it is given: it is not a language model, and the
 * README says so under those pictures.
 *
 * Each picture is cropped to what matters and written as WebP by the browser's own
 * encoder, so that nothing beyond the suite's Playwright is needed.
 */
import fs from "node:fs";
import path from "node:path";
import { type Browser, type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { newPowerPlan, type PowerLoad } from "../../packages/shared/src/power.ts";
import { api } from "../tests/fixtures";
import { CENTRE, installTestMaps } from "../tests/map-fixture";

const OUT = path.resolve(import.meta.dirname, "../../docs/screenshots");
const MODEL_URL = process.env.OUTPOST_README_MODEL_URL!;
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

/** Lets fonts, map tiles and anything animating settle before a picture is taken. */
async function settle(page: Page, ms = 600): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
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
  await expect(page.getByText("Ready offline").first()).toBeVisible({ timeout: 180_000 });
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
async function writePlaces(page: Page) {
  const places = [
    { name: "Car park", lat: 53.058, lon: -4.112, icon: "parking", color: "blue" },
    { name: "Bothy", lat: 53.098, lon: -4.03, icon: "shelter", color: "red", isFavorite: true },
    { name: "Spring", lat: 53.093, lon: -4.04, icon: "water", color: "blue" },
    { name: "Village hall", lat: 53.091, lon: -4.112, icon: "meeting", color: "green", isFavorite: true },
    { name: "Summit cairn", lat: 53.105, lon: -4.01, icon: "summit", color: "amber" },
  ];
  for (const place of places) await api(page, "POST", "/api/maps/markers", place);
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
}

async function writeSupplies(page: Page) {
  await api(page, "PUT", "/api/supplies/household", {
    daysWanted: 7,
    drinkingLitres: 3,
    allUsesLitres: 7.5,
    waterBasis: "drinking",
    members: [
      { kind: "person", name: "Adult", band: "19-64", sex: "female" },
      { kind: "person", name: "Adult", band: "19-64", sex: "male" },
      { kind: "person", name: "Child", band: "7-10", sex: "unstated" },
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
  plan.battery.ampHours = 100;
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

test("the README's pictures", async ({ browser }) => {
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
  await installTestMaps(page);
  await writePlaces(page);
  await writeSupplies(page);
  const powerId = await writePowerPlan(page);
  await api(page, "POST", "/api/nuclear/scenarios", {
    name: "Educational example: 10 kilotons",
    notes: "An idealised case on the test map, for the picture.",
    lat: CENTRE.lat + 0.006,
    lon: CENTRE.lon + 0.02,
    effects: { yieldKt: 10, burst: { kind: "surface" }, wind: { fromDegrees: 250, kmh: 24 } },
  });
  await api(page, "POST", "/api/nuclear/scenarios", {
    name: "Educational example: 2 kilotons, in the air",
    notes: "A second idealised case, to show two on the map.",
    lat: CENTRE.lat,
    lon: CENTRE.lon,
    effects: { yieldKt: 2, burst: { kind: "optimum", psi: 5 }, wind: null },
  });
  await api(page, "PATCH", "/api/settings", {
    "answers.enabled": true,
    "answers.endpoint": `${MODEL_URL}/v1`,
    "answers.model": "stand-in:latest",
  });
  // Text extraction and indexing are jobs: wait for the library to be searchable.
  await expect
    .poll(async () => (await api(page, "GET", "/api/search?q=frequency")).results?.length ?? 0, { timeout: 60_000 })
    .toBeGreaterThan(0);

  // ── Home ──
  await page.goto("/");
  await idle(page);
  await settle(page);
  await shot(page, "home");

  // ── Search, with an answer written by the stand-in ──
  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Search your library" }).fill("how long should water be boiled?");
  await page.getByRole("button", { name: "Answer from my library" }).click();
  await expect(page.getByRole("region", { name: "Generated answer" }).getByRole("button", { name: "Ask again" })).toBeVisible();
  await settle(page);
  await shot(page, "answer-stand-in");

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

  // ── Tools ──
  await page.goto(`/tools/power/plans/${powerId}`);
  await settle(page, 1000);
  await shotBetween(page, "power-plan", page.getByRole("heading", { level: 1 }), page.getByText("Every assumption behind these answers"));

  await page.goto("/tools/network");
  await page
    .getByRole("button", { name: /Look for devices|Look again/ })
    .first()
    .click();
  await expect(page.getByTestId("network-device").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Last looked .*probes sent in/)).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await shot(page, "network-stand-in");

  // ── Preparedness ──
  await page.goto("/prepare/supplies?view=days");
  await settle(page);
  await shot(page, "supplies");

  await page.goto("/prepare/plans");
  await page.getByRole("button", { name: "New plan" }).first().click();
  const choose = page.getByRole("dialog", { name: "New emergency plan" });
  await choose.getByRole("radio", { name: /^Power cut/ }).click();
  await choose.getByRole("button", { name: "Make the plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Power cut" })).toBeVisible();
  const planUrl = page.url();
  await settle(page);
  await page
    .getByRole("heading", { name: "Steps", exact: true })
    .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 24));
  await page.waitForTimeout(300);
  await shot(page, "emergency-plan");

  await page.goto("/prepare/nuclear");
  await page.getByRole("tab", { name: /Saved/ }).click();
  // Both saved scenarios on the map. The air burst is selected, so that the map is fitted to its rings and they can
  // be read; the surface burst beside it is drawn fainter, with its fallout pattern running off downwind.
  for (const name of ["10 kilotons", "2 kilotons, in the air"]) {
    await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Put it on the map" }).click();
    await page.getByRole("tab", { name: /Saved/ }).click();
  }
  await page.getByRole("tab", { name: "Scenario" }).click();
  await page.getByRole("button", { name: "Fit the map to it" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 2500);
  await shot(page, "nuclear");

  await page.goto("/contacts");
  await page.getByText("Morwenna Example", { exact: true }).click();
  await settle(page);
  await shot(page, "contacts");

  await page.goto("/explore");
  await settle(page);
  await shot(page, "explore");

  await context.close();

  // ── Phone ──
  {
    const { context: phone, page: p } = await open(browser, { phone: true });
    await p.goto(`${planUrl}/use`);
    await settle(p);
    await shot(p, "phone-plan-in-use");
    await p.goto("/tools/water");
    await settle(p);
    await p
      .getByText("Whose planning figure")
      .first()
      .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 140));
    await p.waitForTimeout(300);
    await shot(p, "phone-water");
    await p.goto(`/maps?lat=${CENTRE.lat + 0.03}&lon=${CENTRE.lon + 0.05}&zoom=12`);
    await settle(p, 2500);
    await shot(p, "phone-maps");
    await phone.close();
  }

  // ── Dark ──
  {
    const { context: dark, page: d } = await open(browser, { theme: "dark" });
    await d.goto(`/notes/${kitId}`);
    await settle(d);
    await shot(d, "notes-dark");
    await d.goto("/radio/propagation");
    await d.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await expect(d.getByRole("heading", { name: /7\.10 MHz at \d\d:00 UTC/ })).toBeVisible({ timeout: 60_000 });
    await settle(d, 1500);
    await shotBetween(
      d,
      "propagation-dark",
      d.getByRole("heading", { name: "Bands", exact: true }),
      d.getByRole("heading", { name: /The steep path/ }),
    );
    await dark.close();
  }

  console.log(written.map((item) => `${item.name} ${(item.bytes / 1024).toFixed(0)} kB`).join("\n"));
  console.log(`total ${(written.reduce((sum, item) => sum + item.bytes, 0) / 1024).toFixed(0)} kB`);
});
