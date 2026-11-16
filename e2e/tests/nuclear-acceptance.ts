/**
 * The specification's acceptance sentence, with the internet cut off: "a user can
 * download a country pack, disconnect from the internet, open its map, inspect
 * documented historical and public infrastructure records, create an educational
 * nuclear-effects scenario, and save a preparedness plan". The pack is a small one
 * installed from fixtures (a file of shelters, a historical record and a WorldPop
 * population grid), as a person would import files they had downloaded.
 */
import type { Page } from "@playwright/test";
import { buildTiff } from "../../apps/server/test/fixtures/layers/builders.ts";
import { api, expect } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

/** Where the fixtures are: a made-up corner of Cumbria. */
export const GROUND_ZERO = { lat: 54.5, lon: -3.05 };

const SHELTERS = [
  "name,latitude,longitude,layer,kind,country,provenance,publisher,license,source_url,published,accuracy",
  "Rest centre (fixture),54.52,-3.05,shelters,Rest centre,GB,public-record,A made-up council,Open Government Licence v3.0,https://example.org/rest-centres,2026-01-10,To the building",
].join("\n");

const HISTORICAL = [
  "record_id,name,latitude,longitude,location_text,country,period,record_type,document_title,document_publisher,document_date,archive_ref,classification,target_category,evidence_quality,geographic_precision,citations,document_url,library_document_id,publisher,license,notes",
  "FIX-1,Made-up historical record,54.45,-3.1,,GB,1960,assessment,A made-up planning paper,A made-up archive,1960,REF 1,Declassified,Test category,Stated in the paper,About 5 km,p. 4,https://example.org/paper,,The tests,Made up for the tests,",
].join("\n");

async function upload(page: Page, format: string, title: string, name: string, mimeType: string, buffer: Buffer, options = {}) {
  const response = await page.request.post("/api/reference/imports", {
    headers: { "X-Outpost-Request": "1" },
    multipart: { format, title, options: JSON.stringify(options), file: { name, mimeType, buffer } },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Removes what earlier tests left that this flow counts on being absent. */
export async function clearNuclear(page: Page) {
  await page.goto("/");
  await removeReferencePacks(page);
  for (const scenario of (await api(page, "GET", "/api/nuclear/scenarios")).scenarios as Array<{ id: string }>)
    await page.request.delete(`/api/nuclear/scenarios/${scenario.id}`, { headers: { "X-Outpost-Request": "1" } });
  for (const set of (await api(page, "GET", "/api/nuclear/sets")).sets as Array<{ id: string }>)
    await page.request.delete(`/api/nuclear/sets/${set.id}`, { headers: { "X-Outpost-Request": "1" } });
  for (const plan of (await api(page, "GET", "/api/emergency-plans")).plans as Array<{ id: string }>)
    await api(page, "DELETE", `/api/emergency-plans/${plan.id}`);
}

/** The country pack: shelters, a historical record and a population grid, from fixtures. */
export async function installCountryPack(page: Page) {
  await upload(page, "features-csv", "Rest centres (fixture)", "shelters.csv", "text/csv", Buffer.from(SHELTERS), {
    provenance: "public-record",
  });
  await upload(page, "historical-csv", "History (fixture)", "historical.csv", "text/csv", Buffer.from(HISTORICAL));
  const grid = buildTiff({
    width: 60,
    height: 60,
    values: new Float32Array(60 * 60).fill(100),
    originLon: -3.3,
    originLat: 54.75,
    pixel: 1 / 120,
    nodata: -99999,
  });
  await upload(page, "worldpop-tif", "Population, fixture", "gbr_ppp_2020_1km_Aggregated_UNadj.tif", "image/tiff", grid, { country: "GB" });
  await expect
    .poll(async () => (await api<{ packs: unknown[] }>(page, "GET", "/api/reference/packs")).packs.length, { timeout: 20_000 })
    .toBe(3);
}

export const openTab = async (page: Page, name: string | RegExp) => {
  await page.getByRole("tab", { name }).click();
};

/** The flow itself, at whatever width the page is. */
export async function acceptanceFlow(page: Page, phone: boolean) {
  await page.goto("/prepare/nuclear");
  await expect(page.getByTestId("offline-line")).toContainText("nothing here uses the internet");

  // A public infrastructure record, found in the workspace's Layers tab, and its source.
  await openTab(page, "Layers");
  await page.getByRole("searchbox", { name: "Find in the reference layers" }).fill("Rest centre");
  await page
    .getByRole("list", { name: "Found in the reference layers" })
    .getByRole("button", { name: /Rest centre \(fixture\)/ })
    .click();
  const card = page.getByRole("region", { name: "The record pressed" });
  await expect(card).toContainText("Published public record");
  await expect(card).toContainText("Open Government Licence v3.0");
  await expect(card.getByRole("link", { name: /The record at its source/ })).toHaveAttribute("href", "https://example.org/rest-centres");
  await expect(page.getByText(/Nothing here marks a place as a likely target or ranks places/)).toBeVisible();
  await card.getByRole("button", { name: "Close this record" }).click();

  // A historical record, from the records browser: what kind of record it is, and its document.
  await openTab(page, "Records");
  const records = page.getByRole("list", { name: "Historical records found" });
  await expect(records).toContainText("A historical assessment of likely targets");
  await expect(records.getByRole("link", { name: /The document at its archive/ })).toHaveAttribute("href", "https://example.org/paper");
  await records.getByRole("button", { name: /Open the record/ }).click();
  const historical = page.getByRole("region", { name: "The record pressed" });
  await expect(historical).toContainText("It says nothing about this place today");
  await expect(historical).toContainText("A historical assessment of likely targets");

  // A scenario, with the people the grid counts inside its rings: a count, never a casualty figure.
  await openTab(page, "Scenario");
  await page.getByLabel("Name", { exact: true }).fill("Fifteen kilotons at the fixture");
  await page.getByLabel("Ground zero", { exact: true }).fill(`${GROUND_ZERO.lat}, ${GROUND_ZERO.lon}`);
  await page.getByRole("radio", { name: "W", exact: true }).click();
  await page.getByLabel("Wind speed", { exact: true }).fill("24");
  await expect(page.getByTestId("fallout-state")).toHaveText("Drawn: wind from the west, so the pattern runs east, at 24 km/h.");
  await expect(page.getByRole("list", { name: "How the map draws each kind of effect" })).toContainText("Fallout (idealised)");
  const people = page.getByRole("region", { name: "People inside each ring" });
  await expect(people).toContainText(
    /About [\d,]+ people live inside this ring, by WorldPop's 2020 estimate\. This is who lives there, not a prediction of harm\./,
    {
      timeout: 15_000,
    },
  );
  await expect(people).toContainText("No count is given for the fallout pattern");
  await page.getByRole("button", { name: "Save scenario" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();

  // A plan from the radiation emergency template, made from the workspace.
  await openTab(page, "Plans");
  await page.getByRole("button", { name: /Make a plan from the template/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Radiation emergency" })).toBeVisible();
  await expect(page.locator("summary", { hasText: /^From UK Health Security Agency/ }).first()).toBeVisible();

  // The scenario attached to it as an illustration, from the workspace.
  await page.goto("/prepare/nuclear");
  await openTab(page, "Plans");
  await page.getByRole("button", { name: /Attach “Fifteen kilotons at the fixture” to Radiation emergency/ }).click();
  await expect(page.getByRole("button", { name: /is attached to Radiation emergency/ })).toBeVisible();

  // Found again on the emergency plans screen, with its picture and caveat; its steps are the template's.
  await page.goto("/prepare/plans");
  await page.getByRole("link", { name: "Radiation emergency" }).first().click();
  await expect(page.getByRole("heading", { name: "Scenarios attached as illustrations" })).toBeVisible();
  await expect(page.getByRole("img", { name: /rings to scale/ })).toBeVisible();
  await expect(page.getByText(/It is not a forecast and not instructions/).first()).toBeVisible();

  if (phone) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
}
