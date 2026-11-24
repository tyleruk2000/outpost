import { api, expect, test, watchForErrors } from "./fixtures";
import { addArchive } from "./search-one-list";

/**
 * The reading screens from the keyboard alone, after the review of 24 Nov 2026: a new page that lost what was typed
 * to the "g then a letter" shortcuts, the reader's list of titles that Tab took away, full-text results that stopped
 * at thirty, and quick search giving focus back to nothing the first time it closed.
 */
async function fieldLibrary(request: Parameters<typeof addArchive>[0]): Promise<string> {
  await addArchive(request);
  const { collections } = await (await request.get("/api/collections")).json();
  return collections.find((collection: { title: string }) => collection.title === "Field library").id as string;
}

test.describe("reading from the keyboard", () => {
  test("a new page has its title ready, so typing straight away names it and goes nowhere", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/notes");
    await page.getByRole("button", { name: "New page" }).first().click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-z]{26}$/);
    const title = page.getByRole("textbox", { name: "Page title" });
    await expect(title).toBeFocused();
    const at = page.url();
    // "g" then "h" would have gone Home.
    await page.keyboard.type("Lighting the stove", { delay: 20 });
    await expect(title).toHaveValue("Lighting the stove");
    expect(page.url()).toBe(at);
    const id = at.split("/").pop()!;
    await expect.poll(async () => (await api(page, "GET", `/api/notes/${id}`)).note.title).toBe("Lighting the stove");
    await api(page, "DELETE", `/api/notes/${id}`);
    expect(errors).toEqual([]);
  });

  test("the reader's list of titles is a combobox: the arrows choose, Enter opens, Tab and Escape close it", async ({ page, request }) => {
    const id = await fieldLibrary(request);
    await page.goto(`/library/read/${id}/app`);
    const field = page.getByRole("combobox", { name: /Search in Field library/ });
    await field.focus();
    await page.keyboard.type("kin");
    const list = page.getByRole("listbox", { name: "Article titles" });
    await expect(list.getByRole("option")).toHaveCount(3);
    await expect(field).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const second = list.getByRole("option", { name: "Kindling a fire in the wet" });
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(field).toHaveAttribute("aria-activedescendant", (await second.getAttribute("id"))!);
    // Still there 500 ms on: the list is not taken away by a timer.
    await page.waitForTimeout(500);
    await expect(list).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("reader-combobox.png") });
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(field).toHaveValue("kin");
    await page.keyboard.type("d");
    await expect(list.getByRole("option")).toHaveCount(2);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/library/read/${id}/guide$`));
    await expect(list).toBeHidden();

    // Tab past the field closes the list.
    await field.focus();
    await page.keyboard.type("kin");
    await expect(list).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(list).toBeHidden();
  });

  test("full-text results in the reader are links, and Show more reaches every one", async ({ page, request }) => {
    const id = await fieldLibrary(request);
    await page.goto(`/library/read/${id}/app`);
    const field = page.getByRole("combobox", { name: /Search in Field library/ });
    await field.fill("kindling");
    await field.press("Enter");
    await expect(page.getByText("45 articles in Field library, showing 30")).toBeVisible();
    const results = page.getByRole("main").locator("ol").getByRole("link");
    await expect(results).toHaveCount(30);
    await expect(results.first()).toHaveAttribute("href", `/library/read/${id}/guide`);
    const more = page.getByRole("button", { name: "Show 15 more" });
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(results).toHaveCount(45);
    await expect(page.getByRole("button", { name: /^Show \d+ more$/ })).toHaveCount(0);
    await expect(page.getByText("45 articles in Field library", { exact: true })).toBeVisible();
    await results.nth(40).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/library/read/${id}/guide$`));
  });

  test("quick search gives focus back to what opened it, the first time as after", async ({ page }) => {
    await page.goto("/library");
    const opener = page.getByRole("tab", { name: "Collections" });
    await opener.focus();
    for (const time of ["first", "second"]) {
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.getByRole("dialog", { name: "Search and go to" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Search and go to" })).toBeHidden();
      await expect(opener, `${time} time`).toBeFocused();
    }
  });
});
