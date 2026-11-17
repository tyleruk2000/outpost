import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

/** A list of made-up stations in the layout of one of the ETCC's files; see apps/server/test/fixtures/repeaters. */
const LIST = path.join(import.meta.dirname, "../../apps/server/test/fixtures/repeaters/etcc-status.csv");

/** Where a position is on screen for a view: Web Mercator, zoom 0 is one 512 px tile, the view's centre is the map's. */
function offsetOf(view: { lat: number; lon: number; zoom: number }, position: { lat: number; lon: number }): { dx: number; dy: number } {
  const world = 512 * 2 ** view.zoom;
  const down = (lat: number) => (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;
  return { dx: ((position.lon - view.lon) / 360) * world, dy: (down(position.lat) - down(view.lat)) * world };
}

async function press(page: Page, view: { lat: number; lon: number; zoom: number }, position: { lat: number; lon: number }) {
  const box = (await page.locator(".outpost-map").boundingBox())!;
  const { dx, dy } = offsetOf(view, position);
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

const idle = (page: Page) => page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

test.describe("repeaters", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async ({ browser }) => {
    // Other tests expect a library with no repeaters in it.
    const page = await browser.newPage();
    const { lists } = await api<{ lists: Array<{ id: string }> }>(page, "GET", "/api/repeaters/overview");
    for (const list of lists) await api(page, "DELETE", `/api/repeaters/lists/${list.id}`);
    await page.close();
  });

  test("imports a list after showing how it was read, then filters it by band near a place", async ({ page, sealed }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/repeaters");
    await expect(page.getByRole("heading", { name: "Repeaters", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No repeaters yet" })).toBeVisible();
    await expect(page.getByText(/Outpost fetches one itself only where its publisher's terms allow a program to/)).toBeVisible();
    // Where lists can be had is there before anything is held: one Outpost can get, one to download by hand, one with nothing.
    const sources = page.locator("section").filter({ has: page.getByRole("heading", { name: "Get a list" }) });
    await expect(
      sources.getByText("Getting a list needs the internet for the moment it takes; nothing else on this screen does."),
    ).toBeVisible();
    await expect(sources.getByRole("button", { name: "Get the list" })).toBeVisible();
    const byHand = sources.getByRole("listitem").filter({ hasText: "Careful list" }).first();
    await expect(byHand).toContainText("To be downloaded by hand: Outpost does not fetch this one.");
    await expect(byHand.getByRole("link", { name: "Open example.org" })).toHaveAttribute("target", "_blank");
    await expect(byHand).toContainText("Save the CSV file.");
    await expect(sources.getByRole("listitem").filter({ hasText: "A map only" }).first()).toContainText("Nothing usable here.");

    await page.getByRole("button", { name: "Import a list" }).click();
    const dialog = page.getByRole("dialog", { name: "Import a list of repeaters" });
    await dialog.getByLabel("File of repeaters").setInputFiles(LIST);
    await expect(dialog.getByText(/Read as/)).toHaveText(
      "Read as RSGB ETCC list: voice repeaters and gateways, with status. 6 of 9 rows can be kept, 6 with a position.",
    );
    // The first rows as they would be kept, the rows that cannot be, and what is rough about the positions.
    const sample = dialog.getByRole("table", { name: "The first rows of the file as they would be kept" });
    await expect(sample.getByRole("row", { name: /QZ3AB/ })).toContainText("145.6625");
    await expect(sample.getByRole("row", { name: /QZ3AB/ })).toContainText("-0.6 MHz");
    await expect(dialog.getByText("3 rows cannot be kept")).toBeVisible();
    await expect(dialog.getByText("No callsign.")).toBeVisible();
    await expect(dialog.getByText(/3 of the positions are written to the nearest few kilometres/)).toBeVisible();
    // Nothing is held yet.
    expect((await api(page, "GET", "/api/repeaters/overview")).total).toBe(0);

    await dialog.getByLabel("Name of the list").fill("North list");
    await dialog.getByLabel("Who publishes it").fill("A made-up society");
    await dialog.getByLabel("Date of the data").fill("2026-10-01");
    await dialog.getByRole("button", { name: "Import 6 repeaters" }).click();
    await expect(dialog.getByText("“North list” is imported")).toBeVisible();
    await expect(dialog.getByText(/6 added; 3 rows of the file could not be kept\. The data is dated 1 Oct 2026\./)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // Every row says where it came from and the date of its data.
    const rows = page.getByRole("list", { name: "Repeaters" }).getByRole("listitem");
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText("QZ3AB");
    await expect(rows.first()).toContainText("A made-up society, data of 1 Oct 2026");
    await expect(page.getByText(/Status is what the list said on its date, not what is on the air now\./)).toBeVisible();
    await expect(page.getByText(/Transmitting through a repeater needs an amateur radio licence/)).toBeVisible();

    // Two metres, within 50 km of a locator typed in: one repeater, with its distance and bearing.
    await page.getByRole("combobox", { name: "Band" }).click();
    await page.getByRole("option", { name: /^2 m \(2\)/ }).click();
    await expect(rows).toHaveCount(2);
    await page.getByRole("combobox", { name: "Distance from" }).click();
    await page.getByRole("option", { name: "A position or locator" }).click();
    await page.getByLabel("Position or locator").fill("IO84JL");
    await expect(page.getByText(/2 repeaters of 6, nearest to IO84JL first/)).toBeVisible();
    await expect(rows.first()).toContainText(/QZ3AB.*\d\.\d\d km, \d+° [NESW]+/s);
    await page.getByRole("combobox", { name: "Within" }).click();
    await page.getByRole("option", { name: "50 km" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("QZ3AB");

    // Found by frequency, and by town.
    await page.getByRole("combobox", { name: "Band" }).click();
    await page.getByRole("option", { name: "Every band" }).click();
    await page.getByRole("combobox", { name: "Within" }).click();
    await page.getByRole("option", { name: "Any distance" }).click();
    await page.getByRole("searchbox", { name: "Find" }).fill("430.875");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("QZ3EF");
    await expect(rows.first()).toContainText("Listed as not operational");
    await page.getByRole("searchbox", { name: "Find" }).fill("marrowby");
    await expect(rows.first()).toContainText("QZ7CD");
    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });

  test("opens a repeater from the map and hands it to the line-of-sight check", async ({ page }) => {
    const errors = watchForErrors(page);
    const view = { lat: 54.52, lon: -3.05, zoom: 9.5 };
    await page.goto(`/maps?lat=${view.lat}&lon=${view.lon}&z=${view.zoom}`);
    await idle(page);
    const map = page.locator(".outpost-map canvas").first();
    const plain = await map.screenshot();

    const button = page.getByRole("button", { name: "Repeaters", exact: true });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await map.screenshot()).equals(plain), { timeout: 10_000 }).toBe(false);
    await idle(page);

    // A press on the dot opens the repeater: what to listen on, how to get in, where it came from.
    await press(page, view, { lat: 54.521, lon: -3.123 });
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "QZ3AB", exact: true }) });
    await expect(card).toContainText("145.6625 MHz, shift -0.6 MHz");
    await expect(card).toContainText("CTCSS 94.8 Hz · FM");
    await expect(card).toContainText("THORNWICK · IO84KM");
    await expect(card).toContainText("Listed as operational. A made-up society, data of 1 Oct 2026");
    await expect(card).toContainText(/km, \d+° [NESW]+ from the middle of the map/);

    // One whose position the list has blurred says so.
    await card.getByRole("button", { name: "Close this repeater" }).click();
    await press(page, view, { lat: 54.6, lon: -2.9 });
    const blurred = page.locator("section").filter({ has: page.getByRole("heading", { name: "QZ7CD", exact: true }) });
    await expect(blurred).toContainText("Its position is listed only to within about 5.56 km");
    await blurred.getByRole("button", { name: "Close this repeater" }).click();

    // Handed to the line-of-sight check as end B; the other end is chosen on the map.
    await press(page, view, { lat: 54.521, lon: -3.123 });
    await card.getByRole("button", { name: "Check line of sight" }).click();
    const panel = page.getByRole("region", { name: "Line of sight" });
    await expect(panel.getByText(/Click or tap the map where the first antenna is/)).toBeVisible();
    await expect(panel.getByText("QZ3AB: listed position")).toBeVisible();
    await press(page, view, { lat: 54.45, lon: -2.95 });
    await expect(panel.getByText("IO84KM")).toBeVisible();
    await expect(panel.getByText(/^13\.\d km \(\d\.\d+ mi\)$/)).toBeVisible();
    // No terrain is installed here, and the check says so rather than calling the path clear.
    await expect(panel.getByText(/terrain/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: /Places/ })).toBeVisible();

    // Switched off, it is off the next time too.
    await button.click();
    await page.reload();
    await idle(page);
    await expect(page.getByRole("button", { name: "Repeaters", exact: true })).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });

  test("finds a repeater in the search across everything, changes it, and keeps the change through an update", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/search?q=QZ3AB");
    const hit = page.getByRole("link", { name: /QZ3AB/ }).first();
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page.getByRole("heading", { name: "QZ3AB", level: 1 })).toBeVisible();
    await expect(page.getByText("From A made-up society, data of 1 Oct 2026 (the list “North list”).")).toBeVisible();
    await expect(page.getByText("As the list said on 1 Oct 2026. Not what is on the air now.")).toBeVisible();
    await expect(page.getByText("12 m above the ground, as listed")).toBeVisible();

    // From the detail to the map, with the line-of-sight check already holding it.
    await page.getByRole("link", { name: "Check line of sight" }).click();
    await expect(page).toHaveURL(/\/maps/);
    await expect(page.getByRole("region", { name: "Line of sight" }).getByText("QZ3AB: listed position")).toBeVisible();
    await page.goBack();

    // The person corrects the tone. The entry is then theirs.
    await page.getByRole("button", { name: "Change" }).click();
    const form = page.getByRole("dialog", { name: "Change QZ3AB" });
    await form.getByLabel("CTCSS tone, Hz").fill("77.0");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("CTCSS tone 77.0 Hz")).toBeVisible();
    const changes = page.getByRole("region", { name: "Your changes" });
    await expect(changes.getByRole("row", { name: /CTCSS tone/ })).toHaveText(/77\.0 Hz.*94\.8 Hz/);

    // The same file again, as an update: the changed entry is left alone, and the dialog says so before anything is done.
    await page.goto("/radio/repeaters");
    await page.getByRole("button", { name: "Bring up to date" }).click();
    const update = page.getByRole("dialog", { name: "Bring “North list” up to date" });
    await update.getByLabel("File of repeaters").setInputFiles(LIST);
    const plan = update.getByRole("region", { name: "What bringing the list up to date would do" });
    await expect(plan).toContainText("5the same as before");
    await expect(plan).toContainText("1changed by you: left as you have them");
    await update.getByRole("button", { name: "Bring up to date" }).click();
    await expect(update.getByText(/5 unchanged; 1 that you had changed left as you have them/)).toBeVisible();
    await update.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("list", { name: "Repeaters" }).getByRole("listitem").first()).toContainText("CTCSS 77.0 Hz");
    await expect(page.getByRole("list", { name: "Repeaters" }).getByRole("listitem").first()).toContainText("Changed by you");
    expect(errors).toEqual([]);
  });

  test("gets a list from a source, shows what is already held side by side, then finds and merges the duplicates", async ({
    page,
    sealed,
  }) => {
    const errors = watchForErrors(page);
    // As the Maps screen leaves it in this browser when it was last looking at the made-up hillside.
    await page.addInitScript(() =>
      localStorage.setItem("outpost.maps.view", JSON.stringify({ lat: 54.52, lon: -3.05, zoom: 9.5, bearing: 0, pitch: 0 })),
    );
    await page.goto("/radio/repeaters");
    const sources = page.locator("section").filter({ has: page.getByRole("heading", { name: "Get a list" }) });
    // So the sources for there come first, and nobody was asked where the device is.
    await expect(sources.getByText("The sources for where your map was last looking come first.")).toBeVisible();
    const source = sources.getByRole("listitem").filter({ hasText: "Stand-in list" }).first();
    await expect(source).toContainText("Outpost can get this list. Not held yet.");

    // One press: the server fetches the one file, and nothing is kept until it has been looked at.
    await source.getByRole("button", { name: "Get the list" }).click();
    const dialog = page.getByRole("dialog", { name: "Import a list of repeaters" });
    await expect(dialog.getByText(/Fetched from 127\.0\.0\.1:\d+ at .* Nothing is kept until you import it\./)).toBeVisible();
    await expect(dialog.getByText(/there is no checksum to hold it to/)).toBeVisible();
    await expect(dialog.getByText(/Read as/)).toHaveText(
      "Read as RSGB ETCC list: voice repeaters and gateways, with status. 6 of 9 rows can be kept, 6 with a position.",
    );
    expect((await api(page, "GET", "/api/repeaters/overview")).total).toBe(6);

    // All six are the repeaters of the list imported earlier, one of them changed by the person since.
    const held = dialog.getByRole("region", { name: "Repeaters already held" });
    await expect(held.getByRole("heading")).toHaveText("6 rows of this file are repeaters already here");
    await expect(held).toContainText("6 are held already, in another list or entered by hand (1 of them typed or changed by you).");
    // Each repeater once is what is offered first; this run keeps both, to merge them by hand below.
    await expect(held.getByRole("radio", { name: /^Show each repeater once, with the newer data/ })).toBeChecked();
    await held.getByRole("radio", { name: /^Keep both/ }).check();
    const pair = held.getByRole("table", { name: "QZ3AB, 145.6625 MHz: what is held beside what the file says" });
    await expect(pair.getByRole("row", { name: /CTCSS tone/ })).toHaveText(/77\.0 Hz.*94\.8 Hz/);

    // The date of the data is the publisher's own for the file.
    await expect(dialog.getByLabel("Date of the data")).toHaveValue("2026-10-01");
    await dialog.getByRole("button", { name: "Import 6 repeaters" }).click();
    await expect(dialog.getByText("“Stand-in list” is imported")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(source).toContainText("Held as “Stand-in list”: 6 repeaters, data of 1 Oct 2026");
    const lists = page.getByRole("list", { name: "Imported lists" });
    await expect(lists.getByRole("listitem").filter({ hasText: "Stand-in list" })).toContainText(
      /Fetched by Outpost from 127\.0\.0\.1:\d+ on /,
    );

    // Kept both, so each repeater is listed twice. Find duplicates shows them side by side and makes one of each.
    const rows = page.getByRole("list", { name: "Repeaters" }).getByRole("listitem");
    await expect(rows).toHaveCount(12);
    await page.getByRole("button", { name: "Find duplicates" }).click();
    const find = page.getByRole("dialog", { name: "Find duplicates" });
    await expect(find.getByRole("heading", { name: "6 repeaters held more than once" })).toBeVisible();
    const group = find.getByRole("table", { name: "QZ3AB, 145.6625 MHz: the entries side by side" });
    await expect(group.getByRole("row", { name: /CTCSS tone/ })).toContainText("77.0 Hz");
    // The first list was brought up to date today, so its data is the later, and its entry is the one that would be kept.
    await expect(group.getByRole("radio", { name: /North list/ })).toBeChecked();
    await expect(group.getByRole("radio", { name: /Stand-in list, data of 1 Oct 2026/ })).not.toBeChecked();
    await find.getByRole("button", { name: "Merge all 6" }).click();
    await expect(find.getByText("No duplicates are left")).toBeVisible();
    await expect(find.getByText("6 entries set aside. Each repeater is listed once.")).toBeVisible();
    await find.getByRole("button", { name: "Done" }).click();

    // Once each, in the list and in the count; and the person's tone is still there after the merge.
    await expect(rows).toHaveCount(6);
    await expect(page.getByText("6 repeaters kept in Outpost, from 2 lists.")).toBeVisible();
    await expect(rows.first()).toContainText("QZ3AB");
    await expect(rows.first()).toContainText("CTCSS 77.0 Hz");
    await expect(rows.first()).toContainText("Changed by you");
    await expect(rows.first()).toContainText("A made-up society, data of");
    expect((await api(page, "GET", "/api/repeaters/overlay?bbox=-10,49,5,61")).total).toBe(6);

    // The repeater's own screen says what was set aside for it, and can separate them again.
    await rows.first().getByRole("link").click();
    const merged = page.getByRole("region", { name: "Merged entries" });
    await expect(merged).toContainText("QZ3AB, 145.6625 MHz: from “Stand-in list”, data of 1 Oct 2026");
    await merged.getByRole("button", { name: "Separate them" }).click();
    await expect(merged).toHaveCount(0);
    expect((await api(page, "GET", "/api/repeaters/overview")).total).toBe(7);
    // Put back as it was for the tests that follow: the fetched list goes, with the entries of it that were set aside.
    const overview = await api<{ lists: Array<{ id: string; name: string }> }>(page, "GET", "/api/repeaters/overview");
    await api(page, "DELETE", `/api/repeaters/lists/${overview.lists.find((list) => list.name === "Stand-in list")!.id}`);
    expect((await api(page, "GET", "/api/repeaters/overview")).total).toBe(6);
    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });

  test("exports the filtered set for CHIRP, with a plain note to check it", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/repeaters");
    await page.getByRole("combobox", { name: "Band" }).click();
    await page.getByRole("option", { name: /^70 cm/ }).click();
    await expect(page.getByRole("list", { name: "Repeaters" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Export these" }).click();
    const dialog = page.getByRole("dialog", { name: "Export repeaters" });
    await expect(dialog.getByText("Check it before you transmit")).toBeVisible();
    await expect(dialog.getByText(/a list goes out of date/)).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: "Export 2 repeaters" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^repeaters-chirp-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = fs
      .readFileSync(await download.path(), "utf8")
      .trimEnd()
      .split("\r\n");
    expect(lines[0]).toBe(
      "Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,RxDtcsCode,CrossMode,Mode,TStep,Skip,Power,Comment,URCALL,RPT1CALL,RPT2CALL,DVCODE",
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^1,QZ3EF,430\.875000,\+,7\.600000,Tone,110\.9,110\.9,023,NN,023,Tone->Tone,FM,5\.00,,,/);
    expect(lines[2]).toMatch(/^2,QZ7CD,439\.462500,-,9\.000000,,88\.5,88\.5,023,NN,023,Tone->Tone,DMR,12\.50,,,"?MARROWBY; colour code 3/);
    expect(errors).toEqual([]);
  });
});
