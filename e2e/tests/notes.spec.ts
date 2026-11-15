import { api, expect, test, watchForErrors } from "./fixtures";

test.describe("notes", () => {
  test.describe.configure({ mode: "serial" });

  test("writes a page with Markdown shortcuts and the slash menu, and it is still there after a reload", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/notes");
    await page.getByRole("button", { name: "New page" }).first().click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-z]+/);

    const title = page.getByLabel("Page title");
    await title.fill("Stove maintenance");
    await title.press("Enter");

    const editor = page.getByRole("textbox", { name: "Page content" });
    await page.keyboard.type("Clean the jet before every trip.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## Parts");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- Spare o-ring");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Jet pricker");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("[] Check the gas seal");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // The slash menu inserts a block by name.
    await page.keyboard.type("/call");
    await expect(page.getByRole("option", { name: /Callout/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Never service a hot stove.");

    await expect(editor.getByRole("heading", { name: "Parts", level: 2 })).toBeVisible();
    await expect(editor.locator("ul li").filter({ hasText: "Jet pricker" })).toBeVisible();
    await expect(editor.getByRole("checkbox")).toHaveCount(1);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByLabel("Page title")).toHaveValue("Stove maintenance");
    const reloaded = page.getByRole("textbox", { name: "Page content" });
    await expect(reloaded.getByText("Clean the jet before every trip.")).toBeVisible();
    await expect(reloaded.getByText("Never service a hot stove.")).toBeVisible();
    await expect(reloaded.getByRole("heading", { name: "Parts", level: 2 })).toBeVisible();
    // The page is in the tree in the sidebar.
    await expect(page.getByRole("treeitem", { name: /Stove maintenance/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("finds the page from search by words inside it", async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent("jet pricker")}`);
    const result = page.getByRole("link", { name: /Stove maintenance/ }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page.getByLabel("Page title")).toHaveValue("Stove maintenance");
  });

  test("exports the page as Markdown that says what was written", async ({ page }) => {
    const found = await api(page, "GET", `/api/notes/lookup?q=${encodeURIComponent("Stove maintenance")}`);
    const stove = found.notes.find((item: { title: string }) => item.title === "Stove maintenance");
    expect(stove).toBeTruthy();
    const response = await page.request.get(`/api/notes/${stove.id}/export.md`);
    expect(response.ok()).toBe(true);
    const markdown = await response.text();
    expect(markdown).toContain("# Stove maintenance");
    expect(markdown).toContain("## Parts");
    expect(markdown).toMatch(/[-*] Spare o-ring/);
    expect(markdown).toMatch(/[-*] \[ \] Check the gas seal/);
    expect(markdown).toContain("Never service a hot stove.");
  });

  test("moves a page to the trash and brings it back", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("treeitem", { name: /Stove maintenance/ }).click();
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("menuitem", { name: "Move to trash" }).click();
    await expect(page.getByRole("treeitem", { name: /Stove maintenance/ })).toBeHidden();

    await page.goto("/notes?view=trash");
    await expect(page.getByText("Stove maintenance").first()).toBeVisible();
    await page.getByRole("button", { name: /Restore/ }).first().click();
    await expect(page.getByRole("treeitem", { name: /Stove maintenance/ })).toBeVisible();
  });
});
