import { expect, test, watchForErrors } from "./fixtures";
import { installRidges } from "./ground-height";

const idle = (page: import("@playwright/test").Page) => page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

test.use({ viewport: { width: 1280, height: 800 } });

test("the readout gives the height of the ground at the centre and under a moving pointer, in metres and then in feet", async ({
  page,
}) => {
  const errors = watchForErrors(page);
  const remove = await installRidges(page);
  try {
    const asked: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/maps/height")) asked.push(request.url());
    });
    // The plain between the two ridges, at 100 m.
    await page.goto("/maps?lat=57.0&lon=-3.4&z=11");
    await idle(page);
    const readout = page.getByRole("button", { name: "Copy these coordinates" });
    const height = readout.locator("[data-ground-height]");
    // With the mouse nowhere near the map: the centre's height, as the coordinates are the centre's.
    await expect(readout).toContainText("Centre");
    await expect(height).toHaveText("· 100 m");
    expect(asked).toHaveLength(1);

    const box = (await page.locator(".outpost-map").boundingBox())!;
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // A sweep of the pointer: the figure stays and follows it, asking a few times and not once per movement.
    for (let step = 0; step < 20; step += 1) {
      await page.mouse.move(middle.x - 100 + step * 5, middle.y, { steps: 1 });
      await expect(height).toBeVisible();
    }
    await expect(readout).toContainText("Pointer");
    await expect(height).toHaveText("· 100 m");
    expect(asked.length).toBeGreaterThan(1);
    expect(asked.length).toBeLessThan(15);
    await expect(height).toHaveAttribute("title", /not a surveyed spot height\. Above mean sea level, as the terrain data gives it\./);

    // Feet, chosen in Settings, and the same ground again.
    await page.goto("/settings#heights");
    await page.getByRole("radio", { name: "Feet" }).click();
    await page.goto("/maps?lat=57.0&lon=-3.4&z=11");
    await idle(page);
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.move(middle.x + 2, middle.y);
    // 100 m is 328 ft: 330 to the nearest 5 feet.
    await expect(height).toHaveText("· 330 ft");
    expect(errors).toEqual([]);
  } finally {
    await remove();
  }
});
