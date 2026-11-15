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

  test("reaches every screen from the bottom bar: four tabs, and everything else in the More sheet", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar.getByRole("link")).toHaveText(["Home", "Library", "Maps", "Notes"]);

    const others: Array<[string, string]> = [
      ["Search", "/search"],
      ["How search works", "/search/how-it-works"],
      ["Explore", "/explore"],
      ["Import files", "/import"],
      ["Downloads", "/downloads"],
      ["Storage", "/storage"],
      ["Manage and clean up", "/storage/manage"],
      ["Settings", "/settings"],
    ];
    await bar.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("list").getByRole("link")).toHaveText(others.map(([name]) => name));
    // The sheet fits the screen, or scrolls inside itself.
    const box = await sheet.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Escape");

    for (const [name, path] of others) {
      await bar.getByRole("button", { name: "More" }).click();
      await page.getByRole("dialog", { name: "More" }).getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path.replace(/[/.]/g, "\\$&")}(\\?.*)?$`));
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole("dialog", { name: "More" })).toBeHidden();
    }

    // This tab runs the build the server is serving, so there is nothing to reload for.
    const health = await api(page, "GET", "/api/health");
    expect(health.web).toMatch(/^index-.+\.js$/);
    await expect(page.getByText("Outpost has been updated.")).toBeHidden();
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
});
