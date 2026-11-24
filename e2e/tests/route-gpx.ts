/**
 * Plan a walk with a via point, save it, open it again from Saved routes and download it as
 * GPX: on a desktop with the panel's form (clicks), and on an iPhone with Directions' bar,
 * picker and sheet (taps). The walk is answered by the streets stand-in (streets.ts); the
 * file is read back and checked.
 */
import fs from "node:fs";
import type { Page } from "@playwright/test";
import { api, expect } from "./fixtures";
import { choosePlace } from "./road-routes";
import { installStreets, removeStreets } from "./streets";

// Each project its own names, so desktop and iPhone can run side by side on the one server.
const placesFor = (tag: string) => [
  { name: `Leatherhead station ${tag}`, lat: 51.2965, lon: -0.3303 },
  { name: `Mickleham church ${tag}`, lat: 51.268, lon: -0.322 },
  { name: `Box Hill top ${tag}`, lat: 51.2556, lon: -0.3106 },
];

export async function planSaveReopenAndDownload(page: Page, touch: boolean): Promise<void> {
  const press = async (locator: ReturnType<Page["locator"]>) => {
    await locator.scrollIntoViewIfNeeded();
    await (touch ? locator.tap() : locator.click());
  };
  await page.goto("/");
  installStreets("ready");
  const ids: string[] = [];
  const tag = touch ? "T" : "D";
  const [from, via, to] = placesFor(tag).map((p) => p.name) as [string, string, string];
  for (const place of placesFor(tag)) ids.push((await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", place)).marker.id);
  let savedId: string | null = null;
  try {
    await page.goto("/maps?lat=51.28&lon=-0.32&z=12&tab=routes");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    if (touch) {
      savedId = await planAndSaveOnPhone(page, { from, via, to });
    } else {
      await press(page.getByRole("button", { name: "Directions", exact: true }).first());
      await expect(page.getByRole("heading", { name: "Directions", exact: true })).toBeVisible();
      await press(page.getByRole("radiogroup", { name: "Way of travelling" }).getByRole("radio", { name: "Walk" }));
      await choosePlace(page, "From", from, touch);
      await press(page.getByRole("button", { name: "Add a via point" }));
      await choosePlace(page, "Via 1", via, touch);
      await choosePlace(page, "To", to, touch);
      const asked = page.waitForRequest((request) => request.url().endsWith("/api/streets/route"));
      await press(page.getByRole("button", { name: "Plan route" }));
      expect((await asked).postDataJSON()).toMatchObject({ mode: "walk" });
      await expect(page.getByRole("heading", { name: `${from} to ${to}` })).toBeVisible({ timeout: 30_000 });
      // The turns are listed, one per line.
      await expect(page.getByRole("list", { name: "Directions" }).getByText("Turn left onto Church Street (B2450)")).toBeAttached();

      // Saved under a name of its own.
      const name = page.getByLabel("Name to save it under");
      await name.scrollIntoViewIfNeeded();
      await name.fill(`Box Hill by Mickleham ${tag}`);
      const saving = page.waitForResponse(
        (response) => response.url().endsWith("/api/roads/routes") && response.request().method() === "POST",
      );
      await press(page.getByRole("button", { name: "Save route" }));
      savedId = ((await (await saving).json()) as { id: string }).id;
      await expect(page.getByRole("heading", { name: `Box Hill by Mickleham ${tag}` })).toBeVisible();

      // Back to the form.
      await press(page.getByRole("button", { name: "Directions", exact: true }).first());
    }
    // Opened again from Saved routes: as planned, nothing asked of the streets.
    const saveName = touch ? `${from} to ${to}` : `Box Hill by Mickleham ${tag}`;
    // On a phone they are under the Routes tab's list, in the sheet raised by pressing the tab.
    if (touch) await page.getByRole("tab", { name: /^Routes/ }).tap();
    const list = page.getByRole("region", { name: "Saved routes" });
    const row = list.getByRole("button", { name: new RegExp(saveName) });
    await expect(row).toContainText("Walk");
    let replanned = false;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/streets/route")) replanned = true;
    });
    await press(row);
    await expect(page.getByRole("heading", { name: saveName })).toBeVisible();
    await expect(page.getByText(/Kept as it was planned/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Directions" }).getByText("Take the steps").first()).toBeAttached();

    // Kept for a person to look at, where the run was asked to (OUTPOST_E2E_SHOTS=folder).
    const shots = process.env.OUTPOST_E2E_SHOTS;
    if (shots) await page.screenshot({ path: `${shots}/route-gpx-saved-${tag}.png` });

    // Save GPX: a GPX 1.1 file with the track, the three points and every turn.
    const downloading = page.waitForEvent("download");
    await press(page.getByRole("button", { name: "Save GPX" }));
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`${saveName}.gpx`);
    const gpx = fs.readFileSync((await download.path())!, "utf8");
    expect(gpx).toContain('<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">');
    expect(gpx).toContain(`<name>Start: ${from}</name>`);
    expect(gpx).toContain(`<name>Via 1: ${via}</name>`);
    expect(gpx).toContain(`<name>End: ${to}</name>`);
    expect(gpx).toContain("<name>Turn left onto Church Street (B2450)</name>");
    expect(gpx).toMatch(/<metadata>[\s\S]*routed by Valhalla[\s\S]*<\/metadata>/);
    expect((gpx.match(/<trkpt /g) ?? []).length).toBeGreaterThan(10);
    expect(replanned).toBe(false);

    // Renamed, then deleted, from the saved route itself.
    const rename = page.getByLabel("Name", { exact: true });
    await rename.fill(`Box Hill walk ${tag}`);
    await press(page.getByRole("button", { name: "Rename" }));
    await expect(page.getByText(`Renamed it “Box Hill walk ${tag}”.`)).toBeVisible();
    await press(page.getByRole("button", { name: "Delete" }));
    await press(page.getByRole("alertdialog").getByRole("button", { name: "Delete route" }));
    // Back where it was opened from: the form on a desktop, the list of routes on a phone.
    if (!touch) await expect(page.getByRole("heading", { name: "Directions", exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Saved routes" }).getByRole("button", { name: new RegExp(`Box Hill walk ${tag}`) }),
    ).toHaveCount(0);
    savedId = null;
  } finally {
    if (savedId) await api(page, "DELETE", `/api/roads/routes/${savedId}`);
    for (const id of ids) await api(page, "DELETE", `/api/maps/markers/${id}`);
    removeStreets();
  }
}

/**
 * On a phone: Directions, the end from the list, the start it asks for, Walk in the bar, a stop from the options; the
 * walk is planned with no button to press, and saved with one press under its own name. Answers the saved route's id,
 * with Directions ended and the Routes tab open.
 */
async function planAndSaveOnPhone(page: Page, ends: { from: string; via: string; to: string }): Promise<string> {
  await page.locator('[role="tabpanel"]').getByRole("button", { name: "Directions", exact: true }).first().tap();
  await page
    .getByRole("dialog", { name: "Where to?" })
    .getByRole("option", { name: new RegExp(`^${ends.to}`) })
    .tap();
  await page
    .getByRole("dialog", { name: "Where from?" })
    .getByRole("option", { name: new RegExp(`^${ends.from}`) })
    .tap();
  const asked = page.waitForRequest((request) => request.url().endsWith("/api/streets/route"));
  await page.getByRole("radiogroup", { name: "Way of travelling" }).getByRole("radio", { name: "Walk" }).tap();
  expect((await asked).postDataJSON()).toMatchObject({ mode: "walk" });
  const sheet = page.getByRole("region", { name: "Directions" });
  await sheet.getByRole("button", { name: "Options" }).tap();
  await sheet.getByRole("button", { name: "Add a stop" }).tap();
  await page
    .getByRole("dialog", { name: "Stop 1: where?" })
    .getByRole("option", { name: new RegExp(`^${ends.via}`) })
    .tap();
  await page.getByRole("button", { name: "Done" }).tap();
  await expect(page.getByRole("button", { name: `Via ${ends.via}` })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: /\d+(\.\d)? km/ })).toBeVisible({ timeout: 30_000 });
  // The turns are listed, one per line.
  await sheet.getByRole("button", { name: "Steps" }).tap();
  await expect(sheet.getByRole("list", { name: "Directions" }).getByText("Turn left onto Church Street (B2450)")).toBeAttached();
  await sheet.getByRole("button", { name: "Map" }).tap();
  const saving = page.waitForResponse((response) => response.url().endsWith("/api/roads/routes") && response.request().method() === "POST");
  await sheet.getByRole("button", { name: "Save" }).tap();
  const id = ((await (await saving).json()) as { id: string }).id;
  await expect(sheet.getByText(`Saved as “${ends.from} to ${ends.to}”, with its directions.`)).toBeVisible();
  await page.getByRole("button", { name: "End directions" }).tap();
  return id;
}
