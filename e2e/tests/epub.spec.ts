import type { Page } from "@playwright/test";
import { lampRoomBook } from "./epub";
import { api, expect, test, watchForErrors } from "./fixtures";

/** How far down the text has been scrolled. The text scrolls inside its own region, not the page. */
const scrolled = (page: Page) => page.getByRole("region", { name: "Text of The Lamp Room" }).evaluate((region) => region.scrollTop);

async function waitUntilRead(page: Page, originalName: string): Promise<string> {
  let id = "";
  await expect
    .poll(
      async () => {
        const found = (await api(page, "GET", "/api/documents?limit=200")).documents.find(
          (document: { originalName: string }) => document.originalName === originalName,
        );
        id = found?.id ?? "";
        return found?.extraction;
      },
      { timeout: 20_000 },
    )
    .toMatch(/done|failed/);
  return id;
}

test.describe("an EPUB book", () => {
  test.describe.configure({ mode: "serial" });

  test("is added, opened, read chapter by chapter, and found again where it was left", async ({ page }) => {
    const errors = watchForErrors(page);

    // ── Add it to the library ──
    await page.goto("/library");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add documents" }).first().click();
    await (await chooser).setFiles([{ name: "lamp-room.epub", mimeType: "application/epub+zip", buffer: lampRoomBook() }]);
    const id = await waitUntilRead(page, "lamp-room.epub");

    // ── The front of the book: what it says about itself, and its contents ──
    await page
      .getByRole("link", { name: /The Lamp Room|lamp-room/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/library/documents/${id}$`));
    await expect(page.getByRole("heading", { level: 2, name: "The Lamp Room" })).toBeVisible();
    await expect(page.getByText("Edda Marsh")).toBeVisible();
    const cover = page.getByRole("img", { name: "Cover of The Lamp Room" });
    await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBeGreaterThan(0);
    const contents = page.getByRole("region", { name: "Contents" });
    await expect(contents.getByRole("link")).toHaveText(["Keeping the light", "The lamp", "Trimming the wick", "Fog"]);

    // ── The first chapter ──
    await page.getByRole("link", { name: "Start reading" }).click();
    await expect(page).toHaveURL(/\?chapter=1$/);
    await expect(page.getByRole("heading", { level: 1, name: "Keeping the light" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Book" })).toContainText("1 of 3");
    await expect(page.getByRole("link", { name: "Back to the contents of The Lamp Room" })).toHaveAttribute(
      "href",
      `/library/documents/${id}`,
    );
    // A picture from inside the book is shown; one on the web is described and never fetched.
    const picture = page.getByRole("img", { name: "The lantern seen from the gallery" });
    await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBeGreaterThan(0);
    await expect(picture).toHaveAttribute("src", new RegExp(`^/api/documents/${id}/epub/file\\?path=OEBPS%2Fimages%2Fcover\\.png$`));
    await expect(page.getByText("the tower from the sea")).toBeVisible();
    // A link to the web opens away from Outpost, as in any document.
    const outside = page.getByRole("link", { name: "list of lights" });
    await expect(outside).toHaveAttribute("href", "https://example.org/lights");
    await expect(outside).toHaveAttribute("target", "_blank");
    await expect(outside).toHaveAttribute("rel", /noopener/);
    // Nothing of the book's own page is in this one: its script did not run and its styles hide nothing.
    expect(await page.evaluate(() => (window as unknown as { bookScriptRan?: boolean }).bookScriptRan)).toBeUndefined();
    expect(await page.title()).toBe("Keeping the light / Outpost");
    expect(await page.locator("article script, article style, article [onerror], article iframe").count()).toBe(0);

    // The marker of a note goes to the note, and stays in this chapter.
    await page.getByRole("link", { name: "1", exact: true }).click();
    await expect(page).toHaveURL(/\?chapter=1#h-n1$/);
    await expect(page.getByText("1. Sleep when the lamp is out.")).toBeInViewport();

    // ── A link to a place in another chapter ──
    const pages = page.context().pages().length;
    await page.getByRole("link", { name: "trimming the wick" }).click();
    await expect(page).toHaveURL(/\?chapter=2#h-the_wick$/);
    expect(page.context().pages()).toHaveLength(pages);
    await expect(page.getByRole("heading", { level: 1, name: "The lamp" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trimming the wick" })).toBeInViewport();
    expect(await scrolled(page)).toBeGreaterThan(300);

    // ── Turning pages ──
    await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/\?chapter=3$/);
    await expect(page.getByRole("heading", { level: 1, name: "Fog" })).toBeVisible();
    await expect(page.getByText("This is the last chapter.")).toBeVisible();
    expect(await scrolled(page)).toBe(0);
    await page
      .getByRole("navigation", { name: "Chapters" })
      .getByRole("link", { name: /Previous/ })
      .click();
    await expect(page).toHaveURL(/\?chapter=2$/);
    await expect(page.getByRole("heading", { level: 1, name: "The lamp" })).toBeVisible();

    // ── Back to the contents, and in again by a line of it ──
    await page.getByRole("link", { name: "Back to the contents of The Lamp Room" }).click();
    await expect(page).toHaveURL(new RegExp(`/library/documents/${id}$`));
    await page.getByRole("region", { name: "Contents" }).getByRole("link", { name: "Trimming the wick" }).click();
    await expect(page).toHaveURL(/\?chapter=2#h-the_wick$/);
    await expect(page.getByRole("heading", { name: "Trimming the wick" })).toBeInViewport();

    // ── Read on, reload, and be where you were ──
    const mark = page.getByText("(52)", { exact: false });
    await mark.scrollIntoViewIfNeeded();
    await page.getByRole("region", { name: "Text of The Lamp Room" }).hover();
    await page.mouse.wheel(0, 240);
    // Once the reader has moved on, the address no longer names the place the link went to.
    await expect(page).toHaveURL(/\?chapter=2$/);
    expect(await scrolled(page)).toBeGreaterThan(600);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("outpost.epub.places") ?? "{}")))
      .toMatchObject({ [id]: { chapter: 2 } });
    // The place is the paragraph at the top of the window, so that is what is compared: the same words, at the same height.
    const height = () => mark.evaluate((element) => Math.round(element.getBoundingClientRect().top));
    await page.waitForTimeout(400);
    const kept = await height();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "The lamp" })).toBeVisible();
    await expect(mark).toBeInViewport();
    await expect.poll(height).toBeGreaterThan(kept - 12);
    expect(await height()).toBeLessThan(kept + 12);

    // Opened afresh, the book offers to carry on from there.
    await page.goto(`/library/documents/${id}`);
    await expect(page.getByText("You were in “The lamp”, 2 of 3.")).toBeVisible();
    await page.getByRole("link", { name: "Continue reading" }).click();
    await expect(page).toHaveURL(/\?chapter=2$/);
    await expect(mark).toBeInViewport();

    // ── Search opens the chapter the words are in ──
    await page.goto(`/search?q=${encodeURIComponent("foghorn compressor")}`);
    const hit = page.getByRole("link", { name: /The Lamp Room/ }).first();
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page).toHaveURL(/\?chapter=3$/);
    await expect(page.getByRole("heading", { level: 1, name: "Fog" })).toBeVisible();
    await expect(page.getByText("When the headland goes, start the foghorn compressor.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("serves a book's pictures in a sandbox, and nothing from the book that is not a picture", async ({ page }) => {
    const id = (await api(page, "GET", "/api/documents?limit=200")).documents.find(
      (document: { originalName: string }) => document.originalName === "lamp-room.epub",
    ).id;
    const file = (path: string) => page.request.get(`/api/documents/${id}/epub/file?path=${encodeURIComponent(path)}`);
    const picture = await file("OEBPS/images/cover.png");
    expect(picture.status()).toBe(200);
    expect(picture.headers()["content-type"]).toBe("image/png");
    expect(picture.headers()["content-security-policy"]).toContain("sandbox");
    expect(picture.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await file("OEBPS/text/keeping.xhtml")).status()).toBe(415);
    expect((await file("../../../etc/passwd")).status()).toBe(400);
    expect((await file("OEBPS/images/../book.opf")).status()).toBe(400);
  });

  test("says plainly when a book is copy-protected, and does not open it", async ({ page }) => {
    await page.goto("/library");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add documents" }).first().click();
    await (await chooser).setFiles([
      { name: "locked-lamp-room.epub", mimeType: "application/epub+zip", buffer: lampRoomBook({ rights: true }) },
    ]);
    const id = await waitUntilRead(page, "locked-lamp-room.epub");

    await page.goto(`/library/documents/${id}?chapter=1`);
    await expect(page.getByRole("heading", { name: "This book is copy-protected" })).toBeVisible();
    await expect(
      page.getByText(/It is locked by a rights scheme \(DRM\), so Outpost cannot read it, and Outpost does not remove copy protection/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Download original" }).first()).toHaveAttribute("href", /\/file\?download=1$/);
    // Not a word of it is shown or searchable.
    await expect(page.getByText("A keeper's day is short on sleep.")).toHaveCount(0);
    const record = (await api(page, "GET", `/api/documents/${id}`)).document;
    expect(record).toMatchObject({ extraction: "failed", textChars: 0 });
    expect(record.extractionDetail).toContain("copy-protected (DRM)");
  });
});
