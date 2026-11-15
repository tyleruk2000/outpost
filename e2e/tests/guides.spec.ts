import { api, expect, test, watchForErrors } from "./fixtures";

const GUIDE = "Baofeng GT-5R Mini companion guide";

test.describe("radio guides", () => {
  test("adds a guide from Explore with no connection and reads it: contents, a diagram, a figure, links and the next chapter", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    // Other tests share this server and leave documents in it; what matters is what adding a book changes.
    const before = {
      listed: (await api(page, "GET", "/api/documents")).total as number,
      all: (await api(page, "GET", "/api/documents?chapters=true")).total as number,
    };

    // ── Explore: a book that ships with Outpost ──
    await page.goto("/explore?category=radio");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: GUIDE }) });
    await expect(card.getByText(/LogBook73/).first()).toBeVisible();
    await expect(card.getByText(/Book, 11 chapters/)).toBeVisible();
    await card.getByText("Who wrote it and how it was reviewed").click();
    await expect(card.getByText(/LogBook73 reviewed it on 17 August 2026/)).toBeVisible();
    await card.getByRole("button", { name: `Add ${GUIDE} to the library` }).click();
    await expect(card.getByText("In your library")).toBeVisible({ timeout: 20_000 });

    // ── The book's page is its contents ──
    await card.getByRole("link", { name: `Open ${GUIDE}` }).click();
    await expect(page).toHaveURL(/\/library\/collections\//);
    await expect(page.getByRole("heading", { level: 1, name: GUIDE })).toBeVisible();
    const contents = page.getByRole("region", { name: "Contents" });
    await expect(contents.getByText("11 chapters")).toBeVisible();
    await expect(contents.getByRole("heading", { name: "Menus and controls" })).toBeVisible();
    await expect(contents.getByRole("link")).toHaveCount(11);

    // Its chapters are documents, but the library does not list them one by one.
    expect((await api(page, "GET", "/api/documents")).total).toBe(before.listed);
    expect((await api(page, "GET", "/api/documents?chapters=true")).total).toBe(before.all + 11);
    await expect
      .poll(async () =>
        (await api(page, "GET", "/api/documents?chapters=true&limit=200")).documents
          .filter((document: { book: unknown }) => document.book)
          .every((document: { extraction: string }) => document.extraction === "done"),
      )
      .toBe(true);

    // ── A chapter ──
    await contents.getByRole("link", { name: /Getting started: layout, display and modes/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Getting started: layout, display and modes" })).toBeVisible();
    const place = page.getByRole("navigation", { name: "Book" });
    await expect(place.getByRole("link", { name: GUIDE })).toBeVisible();
    await expect(place).toContainText("Getting started, 2 of 11");

    // A signal figure, drawn from its description.
    const figure = page.getByRole("img", { name: /GT-5R Mini — the standby display/ }).first();
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toBeVisible();
    expect(await figure.evaluate((element) => element.tagName.toLowerCase())).toBe("svg");

    // A Mermaid diagram, shown as a picture: an image file made in the page, with its labels as its description.
    // A diagram is drawn when it comes near the screen; until then its place is held.
    await page.locator(".doc-figure-pending[role=img], .doc-figure:has(img)").first().scrollIntoViewIfNeeded();
    const diagram = page.locator(".doc-figure img").first();
    await expect(diagram).toBeVisible({ timeout: 20_000 });
    await expect(diagram).toHaveAttribute("src", /^blob:/);
    await expect(diagram).toHaveAttribute("alt", /^Flow chart\. It shows: .+/);
    await expect.poll(() => diagram.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBeGreaterThan(100);
    // The diagram's SVG is not part of the page: the only SVG pictures in the text are the signal figures.
    expect(await page.locator("article svg[aria-roledescription], article foreignObject").count()).toBe(0);
    const frame = page.locator(".doc-figure:has(img)").first();
    await frame.getByRole("button", { name: "View larger" }).click();
    const larger = page.getByRole("dialog", { name: "Diagram" });
    await expect(larger.getByRole("img")).toBeVisible();
    await larger.getByRole("button", { name: "Close" }).click();
    await frame.getByText("Diagram as text").click();
    await expect(frame.locator("pre")).toContainText("flowchart");

    // A link to the handbook, which is not in the library: its words, marked quietly, leading to Explore.
    const missing = page.getByRole("link", { name: /^Antennas/ }).first();
    await expect(missing).toHaveAttribute("href", "/explore?entry=logbook73.handbook");
    await expect(missing).toHaveAttribute("data-ref", "missing");
    await expect(page.getByText(/Some links in this text have a dotted underline/)).toBeVisible();

    // A link to another chapter of the same book opens it here, in this tab.
    const pages = page.context().pages().length;
    await page.getByRole("link", { name: "Menu Reference" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Menu reference — documented options at a glance" })).toBeVisible();
    expect(page.context().pages()).toHaveLength(pages);
    await expect(page.getByRole("navigation", { name: "Book" })).toContainText("3 of 11");

    // ── Previous, next and back to the contents ──
    const turn = page.getByRole("navigation", { name: "Chapters" });
    await turn.getByRole("link", { name: /Next/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The menu in depth, part 1" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Chapters" })
      .getByRole("link", { name: /Previous/ })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Menu reference — documented options at a glance" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Chapters" })
      .getByRole("link", { name: `Contents of ${GUIDE}` })
      .click();
    await expect(page.getByRole("region", { name: "Contents" })).toBeVisible();

    // ── Search lands on the chapter, and says which book it is from ──
    await page.goto(`/search?q=${encodeURIComponent("standby display")}`);
    const hit = page.getByRole("link", { name: /Getting started: layout, display and modes/ }).first();
    await expect(hit).toBeVisible();
    await expect(page.getByText(`${GUIDE}, chapter 01`).first()).toBeVisible();

    // ── The library keeps the book whole ──
    await page.goto("/library");
    await expect(page.getByText(/\d+ books? from the catalogue (is|are) kept whole/)).toBeVisible();
    await page.getByRole("link", { name: "See your books" }).click();
    await expect(page.getByRole("heading", { name: "Books" })).toBeVisible();
    await expect(page.getByRole("link", { name: GUIDE })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
