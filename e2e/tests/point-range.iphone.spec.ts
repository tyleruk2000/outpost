/**
 * A point's estimated radio range in Safari on an iPhone (WebKit, touch), opened from a shared link as the owner did
 * (`/maps?…&range=10&station=car`): the range worked out a line at a time with a bar while it works, heights stepped
 * through quickly asked once, the last answer kept on the map while other heights are worked out, and how long the
 * drawing itself takes once the answer is in. The terrain is the two ridges of tools/terrain-fixture.mjs.
 */
import type { Page, Request } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { idle, ridgesAndRepeater } from "./repeater-range";

const SHARED = "/maps?lat=57&lon=-3.4&z=12&range=10&station=car";
const rangeAsked = (request: Request) => new URL(request.url()).pathname === "/api/maps/sight-range";

/** Counts the frames the page draws, and the longest wait between two: how long the page was too busy to draw. */
async function watchFrames(page: Page) {
  await page.evaluate(() => {
    const state = { last: performance.now(), longest: 0, running: true };
    (window as unknown as { __frames: typeof state }).__frames = state;
    const tick = (now: number) => {
      state.longest = Math.max(state.longest, now - state.last);
      state.last = now;
      if (state.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return async () =>
    page.evaluate(() => {
      const state = (window as unknown as { __frames: { longest: number; running: boolean } }).__frames;
      state.running = false;
      return Math.round(state.longest);
    });
}

test.describe("an estimated radio range on an iPhone", () => {
  let made: { repeaterId: string; collectionId: string };
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    made = await ridgesAndRepeater(page, "e2e-point-range-iphone");
    await page.close();
  });
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await api(page, "DELETE", `/api/repeaters/${made.repeaterId}`);
    await api(page, "DELETE", `/api/collections/${made.collectionId}?deleteFiles=true`);
    await page.close();
  });

  test("from a shared link: worked out a line at a time, drawn quickly, and heights tapped through asked once", async ({
    page,
    sealed,
  }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const asked: Request[] = [];
    page.on("request", (request) => {
      if (rangeAsked(request)) asked.push(request);
    });
    const answered = page.waitForResponse((response) => rangeAsked(response.request()));
    await page.goto(SHARED);
    const stopFrames = await watchFrames(page);
    const folded = page.getByRole("region", { name: "Estimated radio range" });
    const response = await answered;
    // Asked a line at a time, compressed.
    expect(await response.request().headerValue("accept")).toContain("application/x-ndjson");
    expect(response.headers()["content-type"]).toContain("application/x-ndjson");
    const body = await response.text();
    const received = performance.now();
    await expect(folded).toContainText(/in sight within 10 km/, { timeout: 20_000 });
    const shown = Math.round(performance.now() - received);
    await idle(page);
    const drawn = Math.round(performance.now() - received);
    const longestFrame = await stopFrames();
    test.info().annotations.push({
      type: "timing",
      description: `answer ${Math.round(body.length / 1024)} kB of lines; card ${shown} ms and map drawn ${drawn} ms after it came; longest frame ${longestFrame} ms`,
    });
    // Drawing the answer is not the slow part: well under the second or two the server takes for a new point.
    expect(drawn).toBeLessThan(3_000);
    const lines = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; range?: { maxMeters: number } });
    expect(lines[0]!.type).toBe("start");
    expect(lines.at(-1)!.type).toBe("end");
    expect(lines.filter((line) => line.type === "part").map((line) => line.range!.maxMeters)).toEqual([25_000, 50_000]);

    // The heights, a tap away; stepped through quickly (1, 1.5, 5, 10 again, as the owner did, then a roof aerial),
    // they are asked about once.
    await folded.getByRole("button", { name: "Show the details" }).tap();
    const card = page.locator(".outpost-map-card").filter({ has: page.getByRole("heading", { name: "Estimated radio range" }) });
    await card.getByRole("button", { name: /^Heights and details/ }).tap();
    const field = card.getByLabel("Your aerial");
    const before = asked.length;
    for (const value of ["1", "1.5", "5", "12"]) await field.fill(value);
    await card.getByRole("radio", { name: "Roof aerial" }).tap();
    await expect(card.getByText(/^In sight: /)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);
    expect(asked.slice(before).map((request) => new URL(request.url()).searchParams.get("aerial"))).toEqual(["12"]);
    expect(new URL(asked.at(-1)!.url()).searchParams.get("station")).toBe("8");

    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });

  test("while a slow answer is worked out: a bar, the time it took last, and the last answer kept on the map", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto(SHARED);
    const folded = page.getByRole("region", { name: "Estimated radio range" });
    await expect(folded).toContainText(/in sight within 10 km/, { timeout: 20_000 });
    await idle(page);
    await folded.getByRole("button", { name: "Show the details" }).tap();
    const card = page.locator(".outpost-map-card").filter({ has: page.getByRole("heading", { name: "Estimated radio range" }) });
    await card.getByRole("button", { name: /^Heights and details/ }).tap();

    // The next answer is held back, as a Raspberry Pi reading the ground for a new point would be.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname === "/api/maps/sight-range",
      async (route) => {
        await held;
        await route.continue();
      },
    );
    await card.getByLabel("Your aerial").fill("25");
    const bar = card.getByRole("progressbar", { name: "Working out the range" });
    await expect(bar).toBeVisible();
    await expect(card.getByText("The last answer stays on the map, faded, until this one is ready.", { exact: false })).toBeVisible();
    // Never a blank map: the shading of the last answer is still there.
    await expect(page.locator(".outpost-map")).toBeVisible();
    release();
    await expect(bar).toHaveCount(0, { timeout: 20_000 });
    await expect(card.getByText(/^In sight: /)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
