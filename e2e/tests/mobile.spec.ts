import { api, expect, test, watchForErrors } from "./fixtures";

test.describe("on a phone", () => {
  test("uses the bottom bar and the More sheet instead of the sidebar", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Main" })).toBeHidden();

    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("heading", { name: "Storage", level: 1 })).toBeVisible();

    // Nothing spills sideways at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Search everything" }).click();
    await expect(page.getByRole("dialog", { name: "Search and go to" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("keeps a diagram and a figure legible in a chapter, scrolling inside their own boxes", async ({ page }) => {
    const errors = watchForErrors(page);
    const added = await api(page, "POST", "/api/catalog/entries/logbook73.guide.td-h3/add", {});
    const contents = await api(page, "GET", `/api/collections/${added.collectionId}/chapters`);
    const chapter = contents.sections
      .flatMap((section: { chapters: Array<{ key: string; documentId: string }> }) => section.chapters)
      .find((item: { key: string }) => item.key === "getting-started");
    await page.goto(`/library/documents/${chapter.documentId}`);
    await expect(page.getByRole("navigation", { name: "Book" })).toBeVisible();

    // A diagram is drawn when it comes near the screen; until then its place is held.
    await page.locator(".doc-figure-pending[role=img], .doc-figure:has(img)").first().scrollIntoViewIfNeeded();
    const diagram = page.locator(".doc-figure img").first();
    await expect(diagram).toBeVisible({ timeout: 20_000 });
    const figure = page.locator(".doc-figure svg[role=img]").first();
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toBeVisible();

    // Neither is squeezed to fit: lettering made for 14 and 12 pixels stays above 10.
    const shown = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".doc-figure-drawing")].map((drawing) => {
        const image = drawing.querySelector("img");
        const svg = drawing.querySelector("svg");
        const natural = image ? image.naturalWidth : (svg?.viewBox.baseVal.width ?? 0);
        const box = drawing.parentElement!;
        return {
          scale: drawing.getBoundingClientRect().width / natural,
          scrolls: box.scrollWidth > box.clientWidth,
          fits: box.clientWidth <= window.innerWidth,
        };
      }),
    );
    expect(shown.length).toBeGreaterThanOrEqual(2);
    for (const item of shown) {
      expect(item.scale).toBeGreaterThanOrEqual(0.8);
      expect(item.fits).toBe(true);
    }
    expect(shown.some((item) => item.scrolls)).toBe(true);
    // And the page itself never scrolls sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("fits the manage screen and its list of everything installed at phone width", async ({ page }) => {
    const errors = watchForErrors(page);
    for (const view of ["", "?view=installed", "?view=leftovers", "?view=clean-up"]) {
      await page.goto(`/storage/manage${view}`);
      await expect(page.getByRole("heading", { name: "Manage and clean up", level: 1 })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Clean up" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `sideways overflow on ${view || "the space view"}`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });

  test("gives controls a comfortable touch size", async ({ page }) => {
    await page.goto("/storage");
    const button = page.getByRole("button", { name: "Add location" });
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("moves a page with a long press and a drag, and with Move to… without dragging", async ({ page }) => {
    const errors = watchForErrors(page);
    const kit = (await api(page, "POST", "/api/notes", { title: "Kit" })).note;
    const ropes = (await api(page, "POST", "/api/notes", { title: "Ropes" })).note;
    const parentOf = async (id: string) =>
      (await api(page, "GET", "/api/notes/tree")).notes.find((note: { id: string }) => note.id === id).parentId as string | null;

    await page.goto("/notes");
    const tree = page.getByRole("main").getByRole("tree", { name: "Pages" });
    const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
    await row("Ropes").scrollIntoViewIfNeeded();
    const from = (await row("Ropes").boundingBox())!;
    const onto = (await row("Kit").boundingBox())!;

    // Touches through the browser's own input, as a finger makes them.
    const session = await page.context().newCDPSession(page);
    const touch = (type: string, x?: number, y?: number) =>
      session.send("Input.dispatchTouchEvent", {
        type: type as "touchStart",
        touchPoints: x === undefined || y === undefined ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }],
      });
    const start = { x: from.x + 120, y: from.y + from.height / 2 };
    const end = { x: onto.x + 120, y: onto.y + onto.height / 2 };
    const scrolledBefore = await page.evaluate(() => window.scrollY);

    await touch("touchStart", start.x, start.y);
    const lifted = page.locator("[data-page-lifted]");
    await expect(lifted).toBeVisible();
    for (let step = 1; step <= 10; step += 1) {
      await touch("touchMove", start.x + ((end.x - start.x) * step) / 10, start.y + ((end.y - start.y) * step) / 10);
      await page.waitForTimeout(20);
    }
    // The chip says in words where the page will land, and the list has not scrolled under the finger.
    await expect(lifted).toContainText("Inside “Kit”");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolledBefore);
    await touch("touchEnd");

    await expect.poll(() => parentOf(ropes.id)).toBe(kit.id);
    await expect(lifted).toBeHidden();
    await expect(page).toHaveURL(/\/notes$/);
    await page.getByRole("button", { name: "Undo" }).tap();
    await expect.poll(() => parentOf(ropes.id)).toBe(null);

    // The same move with no dragging at all.
    const actions = row("Ropes").getByRole("button", { name: "Actions for Ropes" });
    expect((await actions.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await actions.tap();
    await page.getByRole("menuitem", { name: "Move to…" }).tap();
    const picker = page.getByRole("dialog", { name: "Move “Ropes”" });
    await expect(picker).toBeVisible();
    const choice = picker.getByRole("option", { name: "Kit", exact: true });
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await choice.tap();
    await expect.poll(() => parentOf(ropes.id)).toBe(kit.id);
    expect(errors).toEqual([]);
  });
});
