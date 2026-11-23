/**
 * The reference layers on the Maps screen, as a person uses them with no internet: a file
 * of shelters imported through the dialog, switched on in the Layers tab and drawn, a
 * mark pressed for its source, and a historical record that says what it is.
 */
import fs from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { api, expect } from "./fixtures";

/** The made-up hillside the map tests look at (see map-fixture.ts). */
export const VIEW = { lat: 54.52, lon: -3.05, zoom: 11 };

const SHELTERS = [
  "name,latitude,longitude,layer,kind,country,provenance,publisher,license,source_url,published,accuracy",
  "Rest centre (test),54.52,-3.05,shelters,Rest centre,GB,public-record,A made-up council,Open Government Licence v3.0,https://example.org/rest-centres,2026-01-10,To the building",
  "Assembly point (test),54.525,-3.04,shelters,Assembly point,GB,public-record,A made-up council,Open Government Licence v3.0,,,To the gate",
].join("\n");

const HISTORICAL = [
  "record_id,name,latitude,longitude,location_text,country,period,record_type,document_title,document_publisher,document_date,archive_ref,classification,target_category,evidence_quality,geographic_precision,citations,document_url,library_document_id,publisher,license,notes",
  "E2E-1,Made-up record,54.515,-3.06,,GB,1960,assessment,A made-up planning paper,A made-up archive,1960,REF 1,Declassified,Test category,Stated in the paper,About 5 km,p. 4,,,The tests,Made up for the tests,",
].join("\n");

export async function removeReferencePacks(page: Page) {
  const { packs } = await api<{ packs: Array<{ id: string }> }>(page, "GET", "/api/reference/packs");
  for (const pack of packs) await api(page, "DELETE", `/api/reference/packs/${pack.id}?deleteFiles=0`);
}

const idle = (page: Page) => page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

export async function referenceLayersFlow(page: Page, testInfo: TestInfo, phone: boolean) {
  const file = testInfo.outputPath("shelters.csv");
  fs.writeFileSync(file, SHELTERS);

  // Imported through Add a place on Offline maps: nothing is fetched; who published it and under what licence is kept with each row.
  await page.goto("/maps/data");
  await page.getByRole("button", { name: "Add a place" }).first().click();
  await page
    .getByRole("dialog", { name: "Add a place" })
    .getByRole("button", { name: /Import a file/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Import a file" });
  await dialog.getByLabel("File", { exact: true }).setInputFiles(file);
  // A drop-down inside the dialog.
  await dialog.getByRole("combobox", { name: "Provenance" }).click();
  await page.getByRole("option", { name: "A published public record" }).click();
  await dialog.getByLabel("Name").fill("Rest centres (test)");
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByText("Imported 2.")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  // Listed by place on Offline maps, where it can be updated or removed.
  await expect
    .poll(async () =>
      (await api<{ places?: Array<{ items: Array<{ title: string }> }> }>(page, "GET", "/api/maps/data")).places?.some((place) =>
        place.items.some((item) => item.title === "Rest centres (test)"),
      ),
    )
    .toBe(true);

  await page.goto(`/maps?lat=${VIEW.lat}&lon=${VIEW.lon}&z=${VIEW.zoom}`);
  await idle(page);

  // A historical record too, by the API: it is drawn as a ring marked H and says what kind of record it is.
  const historical = testInfo.outputPath("historical.csv");
  fs.writeFileSync(historical, HISTORICAL);
  const form = await page.request.post("/api/reference/imports", {
    headers: { "X-Outpost-Request": "1" },
    multipart: {
      format: "historical-csv",
      title: "Made-up history",
      options: "{}",
      file: { name: "historical.csv", mimeType: "text/csv", buffer: fs.readFileSync(historical) },
    },
  });
  expect(form.ok()).toBe(true);
  await expect
    .poll(async () => (await api<{ packs: unknown[] }>(page, "GET", "/api/reference/packs")).packs.length, { timeout: 15_000 })
    .toBe(2);

  // Switched on in the Layers tab, the shelters are drawn: the map changes where they are.
  await page.getByRole("tab", { name: "Layers" }).click();
  if (phone) await page.getByRole("tab", { name: "Layers" }).click();
  const shelters = page.getByRole("switch", { name: "Shelters and assembly points" });
  await expect(shelters).not.toBeChecked();
  const map = page.locator(".outpost-map canvas").first();
  await idle(page);
  const plain = await map.screenshot();
  await shelters.click();
  await page.getByRole("switch", { name: "Historical records" }).click();
  await expect.poll(async () => (await map.screenshot()).equals(plain), { timeout: 10_000 }).toBe(false);
  const legend = page.getByRole("region", { name: "Where things come from" });
  await expect(legend.getByText("Historical document: a ring marked H")).toBeVisible();

  // Found by name in the layers, and opened: its card says where it comes from.
  await page.getByRole("searchbox", { name: "Find in the reference layers" }).fill("Rest centre");
  await page
    .getByRole("list", { name: "Found in the reference layers" })
    .getByRole("button", { name: /Rest centre \(test\)/ })
    .click();
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Rest centre (test)" }) });
  await expect(card).toContainText("Published public record");
  await expect(card).toContainText("Open Government Licence v3.0");
  await card.getByRole("button", { name: "Close this record" }).click();

  // A press on the historical record's mark opens it, and it says it is history.
  if (!phone) {
    await page.goto("/maps?lat=54.515&lon=-3.06&z=12");
    await idle(page);
    const box = (await page.locator(".outpost-map").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const record = page.locator("section").filter({ has: page.getByRole("heading", { name: "Made-up record" }) });
    await expect(record).toContainText("A historical assessment of likely targets");
    await expect(record).toContainText("It says nothing about this place today");
  }
}
