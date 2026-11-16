/**
 * The emergency sheet's PDF and sun times on paper, on a phone 390 points wide: every
 * button on the screen, large enough for a finger, nothing wider than the screen, and
 * the route that does not depend on the phone saving a file (the library) carried
 * through to search and the reader. Every person here is made up.
 */
import type { Locator, Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { keep } from "./map-fixture";

test.use({ timezoneId: "Europe/London", viewport: { width: 390, height: 844 } });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function reachable(page: Page, controls: Array<[string, Locator]>) {
  const width = page.viewportSize()!.width;
  for (const [name, control] of controls) {
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(width);
  }
}

async function readAndOpen(page: Page, documentId: string, search: string, title: string | RegExp) {
  await expect
    .poll(async () => (await api(page, "GET", `/api/documents/${documentId}`)).document.extraction, { timeout: 30_000 })
    .toBe("done");
  await page.goto(`/search?q=${encodeURIComponent(search)}`);
  const result = page.getByRole("link", { name: title }).first();
  await expect(result).toBeVisible();
  await result.tap();
  await expect(page).toHaveURL(new RegExp(`/library/documents/${documentId}`));
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  expect(await overflow(page), "sideways overflow in the reader").toBeLessThanOrEqual(1);
}

test.describe("more PDFs made in Outpost, on a phone", () => {
  test("the emergency sheet goes to the library after the question, is found by search and opens in the reader", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const ids: string[] = [];
    for (const body of [
      {
        name: { prefix: "", given: "Tomasz", additional: "", family: "Wróblewski-Featherstonehaugh", suffix: "" },
        phones: [{ value: "+44 7700 900654", label: "mobile, after six in the evening and at weekends" }],
        emails: [{ value: "tomasz.wroblewski-featherstonehaugh@a-very-long-domain-name.example", label: "home" }],
        isEmergency: true,
        emergencyNote: "Keeps the village defibrillator and the key to the hall.",
      },
      {
        name: { prefix: "", given: "Σοφία", additional: "", family: "Νικολάου", suffix: "" },
        phones: [{ value: "+30 21 0765 4321", label: "" }],
        isEmergency: true,
      },
    ])
      ids.push((await api(page, "POST", "/api/contacts", body)).contact.id as string);
    let documentId: string | undefined;
    try {
      await page.goto("/contacts/emergency");
      const block = page.getByRole("region", { name: "The sheet as a PDF" });
      const add = block.getByRole("button", { name: "Add to library" });
      await expect(block.getByRole("link", { name: "Save as PDF" })).toBeVisible();
      await reachable(page, [
        ["Save as PDF", block.getByRole("link", { name: "Save as PDF" })],
        ["Add to library", add],
        ["Change where", block.getByRole("button", { name: "Change where" })],
      ]);
      expect(await overflow(page), "sideways overflow on the emergency sheet").toBeLessThanOrEqual(1);
      await keep(testInfo, "emergency sheet's PDF.png", await page.screenshot(), "image/png");

      await add.tap();
      const question = page.getByRole("alertdialog", { name: "Put other people’s details in the library?" });
      await expect(question).toBeVisible();
      const yes = question.getByRole("button", { name: "Add to library" });
      await reachable(page, [
        ["Cancel", question.getByRole("button", { name: "Cancel" })],
        ["Add to library, in the question", yes],
      ]);
      await keep(testInfo, "emergency sheet, the question.png", await page.screenshot(), "image/png");
      await yes.tap();
      const status = block.getByTestId("pdf-status");
      await expect(status).toContainText("Added to the library under “Made in Outpost” as");
      expect(await overflow(page), "sideways overflow once it is in the library").toBeLessThanOrEqual(1);
      const link = status.getByRole("link", { name: /^Emergency sheet, / });
      const title = (await link.textContent())!;
      documentId = (await link.getAttribute("href"))!.split("/").pop()!;
      await readAndOpen(page, documentId, "Νικολάου", title);
      await keep(testInfo, "emergency sheet in the reader.png", await page.screenshot(), "image/png");
    } finally {
      if (documentId) await api(page, "DELETE", `/api/documents/${documentId}`);
      for (const id of ids) await api(page, "DELETE", `/api/contacts/${id}`);
    }
    expect(errors).toEqual([]);
  });

  test("sun times from the Sun tab go to the library, are found by search and open in the reader", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
    await page.goto("/maps?lat=51.48&lon=0&z=9");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Sun" }).tap();
    await expect(page.getByRole("heading", { name: "Sun at the centre of the map" })).toBeVisible();

    const open = page.getByRole("button", { name: "A PDF of sun times, day by day" });
    await reachable(page, [["A PDF of sun times, day by day", open]]);
    await open.tap();
    const block = page.getByRole("region", { name: "Sun times as a PDF" });
    await expect(block.getByRole("link", { name: "Save as PDF" })).toBeVisible();
    await reachable(page, [
      ["Save as PDF", block.getByRole("link", { name: "Save as PDF" })],
      ["Add to library", block.getByRole("button", { name: "Add to library" })],
      ["Change where", block.getByRole("button", { name: "Change where" })],
    ]);
    expect(await overflow(page), "sideways overflow with the sun sheet open").toBeLessThanOrEqual(1);
    await keep(testInfo, "sun times' PDF.png", await page.screenshot(), "image/png");

    await block.getByRole("radio", { name: "Month" }).tap();
    await expect(block).toContainText("June 2026, a day to a line");
    await block.getByRole("button", { name: "Add to library" }).tap();
    const status = block.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library under “Made in Outpost” as");
    expect(await overflow(page), "sideways overflow once it is in the library").toBeLessThanOrEqual(1);
    const link = status.getByRole("link", { name: "Sun times, 51.4800, 0.0000, June 2026" });
    const documentId = (await link.getAttribute("href"))!.split("/").pop()!;
    try {
      await readAndOpen(page, documentId, '"Sun times: 51.4800, 0.0000"', /Sun times, 51\.4800, 0\.0000, June 2026/);
      await keep(testInfo, "sun times in the reader.png", await page.screenshot(), "image/png");
    } finally {
      await api(page, "DELETE", `/api/documents/${documentId}`);
    }
    expect(errors).toEqual([]);
  });
});
