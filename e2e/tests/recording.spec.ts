/**
 * Recording a track as you walk, with the browser's position set by the test.
 *
 * `localhost` is a secure origin, so the browser shares its (pretended) location here
 * as it would over HTTPS. What this cannot show is a real phone outdoors: real GPS
 * noise, a screen that locks, a browser put in the background.
 */
import fs from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";
import { api, expect, test } from "./fixtures";

const START = { lat: 54.46, lon: -3.09 };
/** One step north: 0.0002° of latitude, which is 22.24 m anywhere (6,371,008.8 m × π / 180 × 0.0002). */
const STEP_DEGREES = 0.0002;
const STEP_METERS = 22.239;

const north = (steps: number) => ({ latitude: Number((START.lat + steps * STEP_DEGREES).toFixed(6)), longitude: START.lon, accuracy: 5 });

async function openMap(page: Page, context: BrowserContext) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(north(0));
  await page.goto(`/maps?lat=${START.lat}&lon=${START.lon}&z=15`);
  await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
}

async function startRecording(page: Page) {
  await page.getByRole("button", { name: "Record a track", exact: true }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  // The first position has arrived and is the first point, before the device is moved anywhere.
  await expect(page.getByRole("region", { name: "Recording", exact: true })).toContainText("Position good to 5 m.");
  await expect.poll(async () => (await onDevice(page)).points).toBe(1);
}

const card = (page: Page) => page.getByRole("region", { name: /^(Recording|Paused)$/ });

/** A distance as the map writes it: kept to a tenth of a metre, as it is stored, then shown in whole metres. */
const shown = (meters: number) => `${Math.round(Math.round(meters * 10) / 10)} m`;

/** Moves the device and waits until the recording shows the distance that position makes it. */
async function walkTo(page: Page, context: BrowserContext, steps: number, expectedMeters: number) {
  await context.setGeolocation(north(steps));
  await expect(card(page).locator("p").first()).toContainText(`${shown(expectedMeters)} (`);
}

/** What this browser holds of recordings, read straight from its storage. */
async function onDevice(page: Page): Promise<{ recordings: Array<{ status: string; name: string }>; points: number }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("outpost-recordings");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["recordings", "points"], "readonly");
          const recordings = transaction.objectStore("recordings").getAll();
          const points = transaction.objectStore("points").count();
          transaction.oncomplete = () => {
            db.close();
            resolve({ recordings: recordings.result.map((item) => ({ status: item.status, name: item.name })), points: points.result });
          };
        };
      }),
  );
}

const RECORDED_HERE = ["Round the tarn", "After the reload", "What there was", "Out of reach", "Sent twice"];

interface SavedTrack {
  id: string;
  name: string;
  distanceMeters: number;
  pointCount: number;
}
const tracksNamed = async (page: Page, name: string) =>
  (await api<{ tracks: SavedTrack[] }>(page, "GET", "/api/maps/tracks")).tracks.filter((track) => track.name === name);

function readGpx(text: string) {
  const segments = [...text.matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)].map((segment) =>
    [...segment[1]!.matchAll(/<trkpt lat="(-?[\d.]+)" lon="(-?[\d.]+)">([\s\S]*?)<\/trkpt>/g)].map((point) => ({
      lat: Number(point[1]),
      lon: Number(point[2]),
      time: /<time>([^<]+)<\/time>/.exec(point[3]!)?.[1],
    })),
  );
  return { segments, points: segments.flat() };
}

async function nameAndSave(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name: "Save the recording" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("button", { name: "Save to routes" }).click();
}

test.describe("recording a track", () => {
  // The other map tests count the routes there are; what is saved here is taken away again.
  test.afterEach(async ({ page }) => {
    const { tracks } = await api<{ tracks: SavedTrack[] }>(page, "GET", "/api/maps/tracks");
    for (const track of tracks.filter((item) => RECORDED_HERE.includes(item.name)))
      await api(page, "DELETE", `/api/maps/tracks/${track.id}`);
  });

  test("says what a browser will and will not do, before anything is recorded", async ({ page, context }) => {
    await openMap(page, context);
    await page.getByRole("button", { name: "Record a track", exact: true }).click();
    const intro = page.getByRole("region", { name: "Record a track" });
    await expect(intro).toContainText("A recording runs only while this screen is on and Outpost is in front.");
    await expect(intro).toContainText("No browser gives a web page positions with the screen locked");
    await expect(intro).toContainText("If Outpost is out of reach then, the track waits here until it is back.");
    // Looking is not starting.
    expect((await onDevice(page)).recordings).toEqual([]);
  });

  test("records a walk, leaves out what should not count, saves it and exports it as GPX with the time of every point", async ({
    page,
    context,
  }) => {
    const began = Date.now();
    await openMap(page, context);
    await startRecording(page);

    // Five steps north, 22.24 m each. The distance shown is the distance walked.
    await expect(card(page)).toContainText("Position good to 5 m.");
    for (let step = 1; step <= 5; step += 1) await walkTo(page, context, step, step * STEP_METERS);
    await expect(card(page)).toContainText(/since the first point/);
    await expect(card(page)).toContainText("no heights from this device");

    // A position 2 m on is not a move: nothing is added.
    await context.setGeolocation({ ...north(5), latitude: north(5).latitude + 0.00002 });
    // A position the device calls good only to 80 m is not recorded at all, and the card says so.
    await context.setGeolocation({ ...north(40), accuracy: 80 });
    await expect(card(page)).toContainText("The position is only good to 80 m, so it is not being recorded. It needs 30 m or better.");
    await expect(card(page).locator("p").first()).toContainText(`${shown(5 * STEP_METERS)} (`);

    // Paused, the device is carried 445 m. None of that is recorded, and the line is not joined across it.
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(card(page)).toContainText("Nothing is being recorded while paused.");
    await context.setGeolocation(north(25));
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.getByRole("region", { name: "Recording", exact: true })).toBeVisible();
    // Where the device is on resuming is the first point of a new stretch.
    await expect(card(page)).toContainText("Position good to 5 m.");
    await walkTo(page, context, 26, 6 * STEP_METERS);
    await walkTo(page, context, 27, 7 * STEP_METERS);

    await page.getByRole("button", { name: "Stop" }).click();
    await nameAndSave(page, "Round the tarn");
    await expect(page.getByText("“Round the tarn” is saved to your routes.")).toBeVisible();

    // It is a route like any other, and says where it came from.
    await expect(page.getByRole("heading", { name: "Round the tarn" })).toBeVisible();
    await expect(page.getByText("Recorded", { exact: true })).toBeVisible();
    await expect(page.getByText("9 points", { exact: true })).toBeVisible();
    const [saved] = await tracksNamed(page, "Round the tarn");
    expect(saved!.pointCount).toBe(9);
    expect(saved!.distanceMeters).toBeCloseTo(7 * STEP_METERS, 0);
    // Outpost has it, so the device's copy is gone.
    expect(await onDevice(page)).toEqual({ recordings: [], points: 0 });

    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export as GPX" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("Round the tarn.gpx");
    const gpx = readGpx(fs.readFileSync(await download.path(), "utf8"));
    // Two stretches: before the pause and after it.
    expect(gpx.segments.map((segment) => segment.length)).toEqual([6, 3]);
    expect(gpx.points.map((point) => point.lat)).toEqual([0, 1, 2, 3, 4, 5, 25, 26, 27].map((step) => north(step).latitude));
    expect(gpx.points.every((point) => point.lon === START.lon)).toBe(true);
    // Every point carries the time it was taken: during this test, and in order.
    const times = gpx.points.map((point) => Date.parse(point.time ?? ""));
    expect(times.every((time) => time >= began - 1000 && time <= Date.now() + 1000)).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(times).size).toBe(times.length);
  });

  test("a recording survives a reload, is offered back, and carries on as a new stretch", async ({ page, context }) => {
    await openMap(page, context);
    await startRecording(page);
    await walkTo(page, context, 1, STEP_METERS);
    await walkTo(page, context, 2, 2 * STEP_METERS);
    expect(await onDevice(page)).toEqual({ recordings: [{ status: "active", name: "" }], points: 3 });

    // The page goes away in the middle of it. Nothing was stopped and nothing was saved.
    await page.reload();
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    const offer = page.getByRole("region", { name: "An unfinished recording" });
    await expect(offer).toContainText(`${shown(2 * STEP_METERS)} in 3 points`);
    await expect(offer).toContainText("Nothing has been recorded since that last point.");
    // It is not recording again by itself, and nothing has been sent.
    await expect(page.getByRole("region", { name: "Recording", exact: true })).toHaveCount(0);
    expect(await tracksNamed(page, "After the reload")).toEqual([]);

    // Discarding asks first, and keeping it keeps it.
    await offer.getByRole("button", { name: "Discard" }).click();
    const question = page.getByRole("alertdialog", { name: "Discard this recording?" });
    await expect(question).toContainText(`Its 3 points (${shown(2 * STEP_METERS)}) are on this device only`);
    await question.getByRole("button", { name: "Keep it" }).click();
    expect((await onDevice(page)).points).toBe(3);

    await offer.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("region", { name: "Recording", exact: true })).toBeVisible();
    // The time the page was away is written down as not recorded.
    await expect(card(page)).toContainText(
      /Not recorded: \d+ seconds, from \d\d:\d\d to \d\d:\d\d, while this page was closed or out of sight\./,
    );
    // The next position is the first of the new stretch: kept, with nothing counted from the old stretch to it.
    await context.setGeolocation(north(3));
    await expect.poll(async () => (await onDevice(page)).points).toBe(4);
    await expect(card(page).locator("p").first()).toContainText(`${shown(2 * STEP_METERS)} (`);
    await walkTo(page, context, 4, 3 * STEP_METERS);

    await page.getByRole("button", { name: "Stop" }).click();
    await nameAndSave(page, "After the reload");
    await expect(page.getByText("“After the reload” is saved to your routes.")).toBeVisible();
    const [saved] = await tracksNamed(page, "After the reload");
    const exported = await page.request.get(`/api/maps/tracks/${saved!.id}/export.gpx`);
    const gpx = readGpx(await exported.text());
    // What was recorded before the reload is all there, and what came after is a stretch of its own.
    expect(gpx.segments[0]!.map((point) => point.lat)).toEqual([0, 1, 2].map((step) => north(step).latitude));
    expect(gpx.segments[1]!.map((point) => point.lat)).toEqual([3, 4].map((step) => north(step).latitude));
    expect(gpx.segments).toHaveLength(2);
    expect(saved!.distanceMeters).toBeCloseTo(3 * STEP_METERS, 0);
    expect(gpx.points.every((point) => point.time)).toBe(true);
    expect(await onDevice(page)).toEqual({ recordings: [], points: 0 });
  });

  test("after a reload, what there is can be saved without recording any more", async ({ page, context }) => {
    await openMap(page, context);
    await startRecording(page);
    await walkTo(page, context, 1, STEP_METERS);
    await page.reload();
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    await page.getByRole("region", { name: "An unfinished recording" }).getByRole("button", { name: "Save what there is" }).click();
    await nameAndSave(page, "What there was");
    await expect(page.getByText("“What there was” is saved to your routes.")).toBeVisible();
    const [saved] = await tracksNamed(page, "What there was");
    expect(saved).toMatchObject({ pointCount: 2 });
    expect(saved!.distanceMeters).toBeCloseTo(STEP_METERS, 0);
  });

  test("goes on recording with Outpost out of reach, waits to save, and saves by itself when Outpost is back", async ({
    page,
    context,
  }) => {
    await openMap(page, context);
    await startRecording(page);
    await walkTo(page, context, 1, STEP_METERS);

    // The network goes: nothing the page asks of Outpost gets an answer.
    await context.setOffline(true);
    // Recording is on the device alone, so it carries on.
    await walkTo(page, context, 2, 2 * STEP_METERS);
    await walkTo(page, context, 3, 3 * STEP_METERS);

    await page.getByRole("button", { name: "Stop" }).click();
    await nameAndSave(page, "Out of reach");
    await expect(
      page.getByText("Outpost is out of reach. “Out of reach” is kept on this device and will be saved when Outpost is back."),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Recordings waiting to be saved" })).toContainText("A recording is waiting to be saved");
    // Every point is still on the device, under its name.
    expect(await onDevice(page)).toEqual({ recordings: [{ status: "queued", name: "Out of reach" }], points: 4 });

    // Without Outpost, the walk can still be got off the device as a file.
    await page.getByRole("button", { name: "Show the recordings that are waiting" }).click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download GPX" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("Out of reach.gpx");
    const local = readGpx(fs.readFileSync(await download.path(), "utf8"));
    expect(local.points.map((point) => point.lat)).toEqual([0, 1, 2, 3].map((step) => north(step).latitude));
    expect(local.points.every((point) => point.time)).toBe(true);

    // The network comes back. Nothing is pressed.
    await context.setOffline(false);
    await expect(page.getByText("“Out of reach” is saved to your routes.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Recordings waiting to be saved" })).toHaveCount(0);
    const saved = await tracksNamed(page, "Out of reach");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ pointCount: 4 });
    expect(await onDevice(page)).toEqual({ recordings: [], points: 0 });
  });

  test("a recording that is waiting to be saved is still waiting after a reload, and is saved once, not twice", async ({
    page,
    context,
  }) => {
    await openMap(page, context);
    await startRecording(page);
    await walkTo(page, context, 1, STEP_METERS);
    await walkTo(page, context, 2, 2 * STEP_METERS);

    // Outpost takes the recording, but its answer never arrives: the worst moment for a connection to drop.
    let delivered = 0;
    await page.route("**/api/maps/recordings/**", async (route) => {
      delivered += 1;
      if (delivered === 1) {
        await route.fetch();
        return route.abort("connectionreset");
      }
      return route.abort("connectionrefused");
    });
    await page.getByRole("button", { name: "Stop" }).click();
    await nameAndSave(page, "Sent twice");
    await expect(page.getByText(/“Sent twice” is kept on this device/)).toBeVisible();
    // The device cannot know it arrived, so it keeps its copy.
    expect(await onDevice(page)).toEqual({ recordings: [{ status: "queued", name: "Sent twice" }], points: 3 });

    await page.reload();
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    const waiting = page.getByRole("region", { name: "Recordings waiting to be saved" });
    await expect(waiting).toContainText("A recording is waiting to be saved");
    expect((await onDevice(page)).points).toBe(3);

    // Outpost is back in reach. The same recording is sent again, and is not saved a second time.
    await page.unroute("**/api/maps/recordings/**");
    await waiting.getByRole("button", { name: "Try now" }).click();
    await expect(page.getByText("“Sent twice” is saved to your routes.")).toBeVisible();
    expect(await tracksNamed(page, "Sent twice")).toHaveLength(1);
    expect(await onDevice(page)).toEqual({ recordings: [], points: 0 });
  });

  test("says so on another screen while a recording is running, and leads back to it", async ({ page, context }) => {
    await openMap(page, context);
    await startRecording(page);
    await walkTo(page, context, 1, STEP_METERS);
    // Looking something up in the library does not end the recording.
    await page.getByRole("link", { name: "Library" }).first().click();
    const notice = page.getByRole("status").filter({ hasText: "Recording a track" });
    await expect(notice).toContainText(`${shown(STEP_METERS)} so far`);
    await context.setGeolocation(north(2));
    await expect(notice).toContainText(`${shown(2 * STEP_METERS)} so far`);
    await notice.getByRole("link", { name: "Open the map" }).click();
    await expect(card(page).locator("p").first()).toContainText(`${shown(2 * STEP_METERS)} (`);
    await page.getByRole("button", { name: "Stop" }).click();
    await page.getByRole("dialog", { name: "Save the recording" }).getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("region", { name: "Recording stopped" }).getByRole("button", { name: "Discard" }).click();
    await page.getByRole("alertdialog", { name: "Discard this recording?" }).getByRole("button", { name: "Discard recording" }).click();
    await expect(page.getByRole("region", { name: "Recording stopped" })).toHaveCount(0);
    expect(await onDevice(page)).toEqual({ recordings: [], points: 0 });
  });
});
