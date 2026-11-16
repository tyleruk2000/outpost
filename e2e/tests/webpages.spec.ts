/** Save a web page: from an address, to a document that can be opened and found with the internet cut off. */
import { api, expect, test, watchForErrors } from "./fixtures";
import { SITE, startWebSite, type WebSite } from "./web-site";

let site: WebSite;
test.beforeAll(async () => {
  site = await startWebSite();
});
test.afterAll(async () => {
  await site.close();
});

test.describe("saving a web page", () => {
  test.describe.configure({ mode: "serial" });

  test("saves a page from an address, opens it, and finds it in search", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/library");
    await page.getByRole("button", { name: "Save a web page" }).first().click();
    const panel = page.getByRole("region", { name: "Save a web page" });
    await expect(panel.getByText(/copy for your own reading: the page still belongs to whoever published it/)).toBeVisible();

    // Nothing is fetched until the page is asked for.
    expect(site.requests).toEqual([]);
    await panel.getByLabel("Address of the page").fill(`${SITE}/journal/splicing`);
    await panel.getByRole("button", { name: "Look at the page" }).click();

    const found = panel.getByTestId("web-page-found");
    await expect(found.getByRole("heading", { name: "Splicing a guy line" })).toBeVisible();
    await expect(found.getByText("By Ishbel Crane, The Bothy Journal")).toBeVisible();
    await expect(found.getByText(/\d+ words/)).toBeVisible();
    await expect(found.getByRole("checkbox", { name: "Bring its picture" })).toBeChecked();
    // Looking fetched the page and nothing else: no picture, script, frame or linked page.
    expect(site.requests).toEqual(["/journal/splicing"]);
    expect(
      (await api(page, "GET", "/api/documents")).documents.filter((document: { source: string | null }) =>
        document.source?.startsWith(SITE),
      ),
    ).toEqual([]);

    await panel.getByRole("button", { name: "Save page" }).click();
    await expect(panel.getByText("Saved to your library")).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText(/1 picture came with it/)).toBeVisible();
    // Saving used the look, and added the one picture.
    expect(site.requests).toEqual(["/journal/splicing", "/img/splice.png"]);

    await panel.getByRole("link", { name: "Open the saved page" }).click();
    await expect(page).toHaveURL(/\/library\/documents\/[0-9A-Za-z]+$/);
    await expect(page.getByRole("heading", { name: "Splicing a guy line", level: 1 })).toBeVisible();

    // Where it came from and when, with the address as a link out.
    const from = page.getByRole("link", { name: `${SITE}/journal/splicing` });
    await expect(from).toBeVisible();
    await expect(from).toHaveAttribute("href", `${SITE}/journal/splicing`);
    await expect(from).toHaveAttribute("rel", /noopener/);
    await expect(page.getByText(/Saved from .* on \d{1,2} \w{3} \d{4}/)).toBeVisible();

    const text = page.getByRole("region", { name: "Text of Splicing a guy line" });
    await expect(text.getByText("By Ishbel Crane. The Bothy Journal.")).toBeVisible();
    await expect(text.getByRole("heading", { name: "What you need" })).toBeVisible();
    await expect(text.getByRole("listitem").filter({ hasText: "Whipping twine" })).toBeVisible();
    await expect(text.getByRole("cell", { name: "Three-strand nylon" })).toBeVisible();
    await expect(text.getByText("The finished splice, before it is rolled underfoot.")).toBeVisible();
    for (const clutter of ["Gear reviews", "Subscribe now", "Share this on Chirper", "Most read this week", "Privacy policy"]) {
      await expect(text.getByText(clutter)).toHaveCount(0);
    }

    // Its picture is drawn from Outpost's own copy.
    const picture = text.getByRole("img", { name: "A finished short splice" });
    await expect(picture).toHaveAttribute("src", /^\/api\/documents\/[0-9A-Za-z]+\/pictures\/1$/);
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);

    // Nothing of the page's own came along to run or load: no script ran, no frame, and the site was not asked again.
    expect(await page.evaluate(() => (window as unknown as { ranAScript?: boolean }).ranAScript)).toBeUndefined();
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(await page.title()).toContain("Splicing a guy line");
    expect(site.requests).toEqual(["/journal/splicing", "/img/splice.png"]);

    // Search finds it by a word from the article, once its text has been read.
    await expect
      .poll(async () => (await api(page, "GET", "/api/search?q=zygodactyl")).results.map((result: { title: string }) => result.title), {
        timeout: 20_000,
      })
      .toContain("Splicing a guy line");
    await page.goto("/search?q=zygodactyl");
    const result = page.getByRole("link", { name: /Splicing a guy line/ }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page.getByRole("heading", { name: "Splicing a guy line", level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("asks before saving the same address a second time", async ({ page }) => {
    const errors = watchForErrors(page);
    const before = (await api(page, "GET", "/api/documents")).documents.length;
    // The command palette and the Import screen lead here by this address.
    await page.goto("/library?save=page");
    const panel = page.getByRole("region", { name: "Save a web page" });
    await panel.getByLabel("Address of the page").fill(`${SITE}/journal/splicing`);
    await panel.getByRole("button", { name: "Look at the page" }).click();

    await expect(panel.getByText("This address is already in your library")).toBeVisible();
    const save = panel.getByRole("button", { name: "Save page" });
    await expect(save).toBeDisabled();
    await expect(panel.getByText("Choose what happens to the earlier copy first.")).toBeVisible();

    // Replacing names what will be deleted, and can be backed out of.
    await panel.getByRole("radio", { name: /Replace the earlier copy/ }).click();
    await panel.getByRole("button", { name: "Replace with this copy" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/“Splicing a guy line”.*will be deleted from your library/)).toBeVisible();
    await dialog.getByRole("button", { name: "Keep the earlier copy" }).click();
    expect((await api(page, "GET", "/api/documents")).documents).toHaveLength(before);

    await panel.getByRole("radio", { name: /Keep both/ }).click();
    await save.click();
    await expect(panel.getByText("Saved to your library")).toBeVisible({ timeout: 20_000 });
    expect((await api(page, "GET", "/api/documents")).documents).toHaveLength(before + 1);
    expect(errors).toEqual([]);
  });

  test("says why a page drawn by a script cannot be saved, from the Import screen too", async ({ page }) => {
    await page.goto("/import");
    await expect(page.getByRole("heading", { name: "Save a web page" })).toBeVisible();
    await page.getByLabel("Address of the page").fill(`${SITE}/app`);
    await page.getByRole("button", { name: "Look at the page" }).click();
    await expect(page.getByText("This page cannot be saved")).toBeVisible();
    await expect(
      page.getByText(/No readable text was found on this page.*Outpost has no browser inside it and does not run a page's scripts/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save page" })).toHaveCount(0);

    // A mistyped address is the field's own error.
    await page.getByLabel("Address of the page").fill("ftp://example.org/file");
    await page.getByRole("button", { name: "Look at the page" }).click();
    await expect(page.getByText(/Only addresses that start with http:\/\/ or https:\/\/ can be saved/)).toBeVisible();
  });
});
