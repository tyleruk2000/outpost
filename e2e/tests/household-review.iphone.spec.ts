/**
 * The household-and-upkeep review's fixes (24 Nov 2026), by touch on an iPhone (WebKit): what a tap adds or opens is in
 * sight, and the bars do not hide it.
 */

import { api, expect, test, watchForErrors } from "./fixtures";
import { backToOneHousehold } from "./households";

test.afterEach(async ({ page }) => {
  await backToOneHousehold(page);
});

test("Add a person brings the new person's name into view with the focus in it", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/");
  const { households } = await api<{ households: Array<{ id: string }> }>(page, "GET", "/api/households");
  for (const name of ["E2E One", "E2E Two", "E2E Three", "E2E Four"])
    await api(page, "POST", "/api/people", { kind: "person", name, band: "19-64", householdIds: [households[0]!.id] });
  await page.goto(`/prepare/households/${households[0]!.id}`);
  const add = page.getByRole("button", { name: "Add a person" });
  await add.tap();
  const names = page.getByRole("textbox", { name: /^Name/ });
  await expect(names.last()).toBeFocused();
  await expect(names.last()).toBeInViewport({ ratio: 1 });
  // Not under the save bar, which now stands at the foot as there is something to save.
  const field = (await names.last().boundingBox())!;
  const bar = (await page.locator("[data-save-bar]").boundingBox())!;
  expect(field.y + field.height).toBeLessThanOrEqual(bar.y);
  expect(errors).toEqual([]);
});

test("the household book's next step opens at its heading, and its bar is one line", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/prepare/book");
  await page.getByRole("button", { name: /^(Start the questions|Change the answers)$/ }).tap();
  await expect(page.getByText(/^Step 1 of \d+: /)).toBeVisible();
  const bar = page.locator("[data-save-bar]");
  expect((await bar.boundingBox())!.height).toBeLessThan(80);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await bar.getByRole("button", { name: /^Save and go on/ }).tap();
  const heading = page.getByRole("heading", { name: /^Step 2 of \d+: / });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});

test("the More sheet opens with the screen in view in sight and Close at its top", async ({ page }) => {
  await page.goto("/prepare/checks");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^More/ }).tap();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet.getByRole("link", { name: "Routine checks" })).toBeInViewport({ ratio: 1 });
  const close = sheet.getByRole("button", { name: "Close" });
  await expect(close).toBeInViewport({ ratio: 1 });
  await close.tap();
  await expect(sheet).toHaveCount(0);
});

test("Messages has the box to write in above the board, and says a message was posted", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.addInitScript(() => localStorage.setItem("outpost.board.name", "E2E Writer"));
  await page.goto("/messages");
  const box = page.getByRole("textbox", { name: /^Write a message as / });
  const board = page.getByRole("heading", { name: "The board", exact: true });
  expect((await box.boundingBox())!.y).toBeLessThan((await board.boundingBox())!.y);
  await box.fill("E2E written from the top");
  await page.getByRole("button", { name: "Post" }).tap();
  await expect(page.getByRole("status").filter({ hasText: "Posted. It is at the foot of the board below." })).toBeVisible();
  expect(errors).toEqual([]);
});
