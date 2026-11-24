/**
 * The persona fixes for a parent in a hurry and an older relative (24 Nov 2026), by touch
 * on an iPhone (WebKit): Use now leads with what to do now and holds where things are and
 * what to do if the phones fail; the grab card reads on the phone, with the address before
 * the coordinates.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { homeAt, putBack, shot } from "./persona-household";

test.afterEach(async ({ page }) => {
  await putBack(page);
});

test("Use now opens on what to do now, with where things are and if the phones fail a tap away", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/prepare/plans");
  await page.getByRole("button", { name: "New plan" }).first().tap();
  const choose = page.getByRole("dialog", { name: "New emergency plan" });
  await choose.getByRole("radio", { name: /^Power cut/ }).tap();
  await choose.getByLabel("Name").fill("E2E Power cut");
  await choose.getByRole("button", { name: "Make the plan" }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Power cut" })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const { plan } = await api(page, "GET", `/api/emergency-plans/${id}`);
  plan.body.where[0].where = "Kitchen drawer by the back door";
  plan.body.comms.text = "Meet at home by 6 pm.";
  const { name, kind, kindText, templateId, emergencyNumber, reviewEveryDays, body } = plan;
  await api(page, "PUT", `/api/emergency-plans/${id}`, {
    ...{ name, kind, kindText, templateId, emergencyNumber, reviewEveryDays, body },
    baseUpdatedAt: plan.updatedAt,
  });

  await page.goto(`/prepare/plans/${id}/use`);
  const firstHeading = page.locator("main h2").first();
  await expect(firstHeading).toHaveText("What to do now");
  await shot(page, "iphone-use-now-top");
  await page.getByRole("navigation", { name: "In this plan" }).getByRole("link", { name: "Where things are" }).tap();
  await expect(page.getByText("Kitchen drawer by the back door")).toBeInViewport();
  await shot(page, "iphone-use-now-where");
  await page.getByRole("navigation", { name: "In this plan" }).getByRole("link", { name: "If the phones fail" }).tap();
  await expect(page.getByText("Meet at home by 6 pm.")).toBeVisible();
  // Before is last, folded, with how many are done.
  const before = page.getByRole("heading", { name: "Before: things to have done ahead" });
  await expect(before).toBeAttached();
  await before.tap();
  await expect(page.locator("details[open]")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the grab card reads on the phone first, the address before the coordinates", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/");
  const household = await homeAt(page, "E2E Cottage", 54.4721, -2.3525);
  await api(page, "PUT", `/api/households/${household}`, { address: "3 Mill Lane\nKirkby Stephen" });
  await api(page, "POST", "/api/people", { kind: "person", name: "E2E Sam", band: "19-64", householdIds: [household] });
  await page.goto("/prepare/grab-cards");
  const card = page.getByRole("article", { name: "Grab card: E2E Sam" });
  await expect(card).toBeVisible();
  await expect(card.getByText("3 Mill Lane")).toBeVisible();
  const address = (await card.getByText("3 Mill Lane").boundingBox())!;
  const position = (await card.getByText("54.47210, -2.35250")).boundingBox();
  expect(address.y).toBeLessThan((await position)!.y);
  // Reading it comes before printing it.
  const print = (await page.getByRole("heading", { name: "To print" }).boundingBox())!;
  expect((await card.boundingBox())!.y).toBeLessThan(print.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, "iphone-grab-card");
  expect(errors).toEqual([]);
});
