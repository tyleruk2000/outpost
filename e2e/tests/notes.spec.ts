import { api, clearPages, expect, test, watchForErrors } from "./fixtures";

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
    await page
      .getByRole("button", { name: /Restore/ })
      .first()
      .click();
    await expect(page.getByRole("treeitem", { name: /Stove maintenance/ })).toBeVisible();
  });

  test("moves a page into another by dragging it in the sidebar, and takes it back from the toast", async ({ page }) => {
    const errors = watchForErrors(page);
    await clearPages(page);
    const hut = (await api(page, "POST", "/api/notes", { title: "Hut log" })).note;
    const visit = (await api(page, "POST", "/api/notes", { title: "First visit" })).note;
    const parentOf = async (id: string) =>
      (await api(page, "GET", "/api/notes/tree")).notes.find((note: { id: string }) => note.id === id).parentId as string | null;

    await page.goto("/notes");
    const tree = page.getByRole("complementary", { name: "Main" }).getByRole("tree", { name: "Pages" });
    const from = (await tree.getByRole("treeitem", { name: "First visit", exact: true }).boundingBox())!;
    const onto = (await tree.getByRole("treeitem", { name: "Hut log", exact: true }).boundingBox())!;

    // A real press, move and release. The middle of a row means "inside it".
    await page.mouse.move(from.x + 60, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 64, from.y + from.height / 2 + 5, { steps: 4 });
    await page.mouse.move(onto.x + 70, onto.y + onto.height / 2, { steps: 10 });
    await page.mouse.move(onto.x + 72, onto.y + onto.height / 2, { steps: 2 });
    await page.mouse.up();

    await expect.poll(() => parentOf(visit.id)).toBe(hut.id);
    await expect(page.getByText("Moved “First visit” into “Hut log”.")).toBeVisible();
    // The page it went into opens to show it, one level down.
    await expect(tree.getByRole("treeitem", { name: "First visit", exact: true })).toHaveAttribute("aria-level", "2");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => parentOf(visit.id)).toBe(null);
    await expect(tree.getByRole("treeitem", { name: "First visit", exact: true })).toHaveAttribute("aria-level", "1");
    expect(errors).toEqual([]);
  });

  test("drags one list item to another list by the handle beside it, as one step of undo", async ({ page }) => {
    const errors = watchForErrors(page);
    const text = (value: string) => ({ type: "paragraph", content: [{ type: "text", text: value }] });
    const item = (value: string) => ({ type: "listItem", content: [text(value)] });
    const { note } = await api(page, "POST", "/api/notes", {
      title: "Packing",
      content: {
        type: "doc",
        content: [
          { type: "bulletList", content: [item("Rope"), item("Stove"), item("Tent")] },
          text("In this order:"),
          { type: "orderedList", attrs: { start: 1 }, content: [item("Pack"), item("Leave a note")] },
        ],
      },
    });
    await page.goto(`/notes/${note.id}`);
    const editor = page.getByRole("textbox", { name: "Page content" });
    const lines = () => editor.locator("li").allTextContents();
    await expect.poll(lines).toEqual(["Rope", "Stove", "Tent", "Pack", "Leave a note"]);

    // Hover the item: the handle comes to it, not to the whole list.
    const tent = (await editor.getByText("Tent", { exact: true }).boundingBox())!;
    await page.mouse.move(tent.x + 20, tent.y + tent.height / 2, { steps: 3 });
    const handle = page.getByRole("button", { name: /^List item actions/ });
    await expect(handle).toBeVisible();
    // The handle is placed a moment after it appears: wait until it stands on this item's line.
    await expect.poll(async () => Math.abs(((await handle.boundingBox())?.y ?? -100) - tent.y)).toBeLessThan(12);
    const grip = (await handle.boundingBox())!;
    const target = (await editor.getByText("Leave a note", { exact: true }).boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 6, grip.y + grip.height / 2 + 6, { steps: 3 });
    // The start of a line means "before it".
    await page.mouse.move(target.x + 2, target.y + target.height / 2 - 2, { steps: 10 });
    await page.mouse.move(target.x + 2, target.y + target.height / 2, { steps: 2 });
    await page.mouse.up();

    // It left the bullets and became the second numbered item.
    await expect.poll(lines).toEqual(["Rope", "Stove", "Pack", "Tent", "Leave a note"]);
    await expect(editor.locator("ol > li")).toHaveCount(3);
    await expect(editor.locator("ul > li")).toHaveCount(2);

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(lines).toEqual(["Rope", "Stove", "Tent", "Pack", "Leave a note"]);
    await expect(editor.locator("ul > li")).toHaveCount(3);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(lines).toEqual(["Rope", "Stove", "Pack", "Tent", "Leave a note"]);

    // What is saved is ordinary lists, and exports as such.
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
    const markdown = await (await page.request.get(`/api/notes/${note.id}/export.md`)).text();
    expect(markdown).toContain("- Rope\n- Stove\n");
    expect(markdown).toContain("1. Pack\n2. Tent\n3. Leave a note\n");
    expect(errors).toEqual([]);
  });
});
