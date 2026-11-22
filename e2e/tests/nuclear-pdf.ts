/**
 * Making the nuclear workspace's PDF with its maps, over the suite's test map, as a
 * person would: the scenarios typed in, "Make the PDF" pressed, the file saved by its
 * link. Shared by the desktop and phone tests.
 */
import fs from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { api, expect } from "./fixtures";
import { CENTRE, keep, readPdf } from "./map-fixture";

export { pdfWords } from "./pdf";

/** Every scenario and saved place taken away, so that each test starts from an empty workspace. */
export async function clearWorkspace(page: Page): Promise<void> {
  const headers = { "X-Outpost-Request": "1" };
  for (const scenario of (await api(page, "GET", "/api/nuclear/scenarios")).scenarios as Array<{ id: string }>)
    await page.request.delete(`/api/nuclear/scenarios/${scenario.id}`, { headers });
  for (const marker of (await api(page, "GET", "/api/maps/markers")).markers as Array<{ id: string }>)
    await page.request.delete(`/api/maps/markers/${marker.id}`, { headers });
}

/** Types the selected scenario's figures into the form. */
export async function fillScenario(
  page: Page,
  scenario: { name: string; lat: number; lon: number; yieldKt: number; wind?: { from: number; kmh: number } },
): Promise<void> {
  await page.getByLabel("Name", { exact: true }).fill(scenario.name);
  await page.getByLabel("Ground zero", { exact: true }).fill(`${scenario.lat}, ${scenario.lon}`);
  await page.getByLabel("Yield", { exact: true }).fill(String(scenario.yieldKt));
  if (scenario.wind) {
    await page.getByLabel("Wind from, degrees", { exact: true }).fill(String(scenario.wind.from));
    await page.getByLabel("Wind speed", { exact: true }).fill(String(scenario.wind.kmh));
  }
}

/** The one scenario with a fallout pattern, at the lake in the middle of the test map. */
export const WITH_PLUME = { name: "One kiloton at the lake", lat: CENTRE.lat, lon: CENTRE.lon, yieldKt: 1, wind: { from: 250, kmh: 24 } };
export const SECOND = { name: "Two kilotons to the east", lat: CENTRE.lat + 0.01, lon: CENTRE.lon + 0.06, yieldKt: 2 };
export const THIRD = { name: "One kiloton to the south-west", lat: CENTRE.lat - 0.04, lon: CENTRE.lon - 0.07, yieldKt: 1 };

/** Puts the three scenarios on the map: A with its pattern, B and C as air bursts. */
export async function threeScenarios(page: Page): Promise<void> {
  await fillScenario(page, WITH_PLUME);
  for (const scenario of [SECOND, THIRD]) {
    await page.getByRole("button", { name: "Add another scenario" }).click();
    await fillScenario(page, scenario);
    await page.getByRole("radio", { name: "Farthest reach" }).click();
  }
  await expect(page.getByRole("heading", { name: "The 3 scenarios shown, on paper" })).toBeVisible();
}

/** Presses "Make the PDF", follows what it says while it draws, saves the file and reads it. */
export async function makeAndSave(page: Page, testInfo: TestInfo, name: string, { drawing = true } = {}) {
  const section = page.getByTestId("scenario-export");
  await section.scrollIntoViewIfNeeded();
  const started = Date.now();
  await section.getByRole("button", { name: "Make the PDF" }).click();
  // It says in words which map it is drawing, while the rest of the page stays as it was. With no map to draw it is done at once.
  if (drawing)
    await expect(section.getByTestId("pdf-progress")).toContainText(/Drawing the map|Getting the map ready|Putting the PDF together/);
  const save = section.getByRole("link", { name: "Save as PDF" });
  await expect(save).toBeVisible({ timeout: 150_000 });
  const seconds = (Date.now() - started) / 1000;
  const downloading = page.waitForEvent("download");
  await save.click();
  const download = await downloading;
  const bytes = fs.readFileSync(await download.path());
  await keep(testInfo, name, bytes, "application/pdf");
  testInfo.annotations.push({ type: "made", description: `${name}: ${bytes.length} bytes in ${seconds.toFixed(1)} s` });
  return { bytes, pdf: readPdf(bytes), name: download.suggestedFilename(), seconds };
}
