/** "Save a web page" on a phone 390 pixels wide. */
import { expect, test, watchForErrors } from "./fixtures";
import { SITE, startWebSite, type WebSite } from "./web-site";

test.use({ viewport: { width: 390, height: 844 } });

let site: WebSite;
test.beforeAll(async () => {
  site = await startWebSite();
});
test.afterAll(async () => {
  await site.close();
});

test("a page is saved and read on a phone, with nothing spilling sideways", async ({ page }) => {
  const errors = watchForErrors(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.goto("/library");
  const open = page.getByRole("button", { name: "Save a web page" }).first();
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await open.click();

  const panel = page.getByRole("region", { name: "Save a web page" });
  const field = panel.getByLabel("Address of the page");
  expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await field.fill(`${SITE}/journal/splicing`);
  const look = panel.getByRole("button", { name: "Look at the page" });
  expect((await look.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await look.click();
  await expect(panel.getByTestId("web-page-found")).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(1);

  // An earlier test on this server may have saved the same address; either way the choice is the person's.
  const keep = panel.getByRole("radio", { name: /Keep (both|them all)/ });
  if (await keep.isVisible()) await keep.click();
  const save = panel.getByRole("button", { name: "Save page" });
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await save.click();
  await expect(panel.getByText("Saved to your library")).toBeVisible({ timeout: 20_000 });
  expect(await overflow()).toBeLessThanOrEqual(1);

  await panel.getByRole("link", { name: "Open the saved page" }).click();
  await expect(page.getByText(/Saved from/)).toBeVisible();
  const picture = page.getByRole("img", { name: "A finished short splice" });
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);
  // The picture is no wider than the column it sits in.
  expect((await picture.boundingBox())!.width).toBeLessThanOrEqual(390);
  expect(await overflow()).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
