import { api, expect, test, watchForErrors } from "./fixtures";
import { buildPdf } from "./pdf";

test.describe("documents", () => {
  test.describe.configure({ mode: "serial" });

  test("adds documents, reads their text, and finds a phrase on the right page", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();

    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add documents" }).first().click();
    await (await chooser).setFiles([
      {
        name: "Field water treatment.pdf",
        mimeType: "application/pdf",
        buffer: buildPdf([
          ["Water treatment in the field", "Boiling is the most reliable method."],
          ["Chemical treatment", "Chlorine dioxide tablets take thirty minutes."],
          ["Filters", "A ceramic filter removes protozoa."],
        ]),
      },
      {
        name: "kit-list.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Kit list\n\n## Cooking\n\nStove, gas, lighter and a pan for boiling water.\n"),
      },
    ]);

    await expect(page.getByRole("link", { name: /Field water treatment/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /kit-list|Kit list/ }).first()).toBeVisible();

    // Text is read in the background; wait for both to finish.
    // Other tests add documents to the same library, so look for these two by name.
    await expect
      .poll(
        async () =>
          (await api(page, "GET", "/api/documents")).documents
            .filter((document: { originalName: string; extraction: string }) =>
              ["Field water treatment.pdf", "kit-list.md"].includes(document.originalName),
            )
            .map((document: { extraction: string }) => document.extraction),
        { timeout: 20_000 },
      )
      .toEqual(["done", "done"]);

    // Unified search finds the phrase and points at the page it is on.
    await page.goto(`/search?q=${encodeURIComponent('"chlorine dioxide"')}`);
    const result = page.getByRole("link", { name: /Field water treatment/ }).first();
    await expect(result).toBeVisible();
    await expect(page.locator("mark").first()).toHaveText(/chlorine/i);
    await expect(page.getByText(/Page 2/).first()).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/library\/documents\/[^?]+\?page=2/);

    // The PDF opens in the built-in viewer, on that page, drawn from local files only.
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("label", { hasText: "of 3" }).locator("input")).toHaveValue("2");
    expect(errors).toEqual([]);
  });

  test("refuses a file that is not what its name says", async ({ page }) => {
    const before = (await api(page, "GET", "/api/documents")).total;
    await page.goto("/library");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add documents" }).first().click();
    await (await chooser).setFiles([
      { name: "not-really.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ this is a program, not a PDF") },
    ]);
    await expect(page.getByText(/not-really\.pdf/).first()).toBeVisible();
    await expect(page.getByText("1 not added")).toBeVisible();
    await expect(page.getByText(/is named like a PDF, but its contents are not one/)).toBeVisible();
    expect((await api(page, "GET", "/api/documents")).total).toBe(before);
  });

  test("serves originals in a sandbox so an uploaded page can never run script here", async ({ page }) => {
    const upload = await page.request.post("/api/documents", {
      headers: { "X-Outpost-Request": "1" },
      multipart: {
        file: {
          name: "page.html",
          mimeType: "text/html",
          buffer: Buffer.from("<html><body><script>document.title='pwned'</script>hello</body></html>"),
        },
      },
    });
    expect(upload.ok()).toBe(true);
    const created = (await upload.json()).results[0].document;
    const file = await page.request.get(created.fileUrl);
    expect(file.headers()["content-security-policy"]).toContain("sandbox");
    expect(file.headers()["content-disposition"]).toContain("attachment");
    expect(file.headers()["x-content-type-options"]).toBe("nosniff");
  });
});

test.describe("the catalogue", () => {
  test("can be browsed and filtered with no connection", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "Explore", level: 1 })).toBeVisible();
    await expect(page.getByText("Knots by Wikipedia")).toBeVisible();
    await page.getByPlaceholder(/Filter by name/).fill("vikidia");
    await expect(page.getByText(/Vikidia/).first()).toBeVisible();
    await expect(page.getByText("Knots by Wikipedia")).toBeHidden();
    // Refreshing needs the internet, which these tests do not have: the app says so and carries on.
    const catalog = await api(page, "GET", "/api/catalog");
    expect(catalog.entries.length).toBeGreaterThanOrEqual(61);
    expect(catalog.entries.every((entry: { license: string }) => entry.license.length > 0)).toBe(true);
  });
});
