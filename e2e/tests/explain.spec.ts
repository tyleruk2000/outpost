import { expect, test, watchForErrors } from "./fixtures";
import { buildPdf } from "./pdf";

test.describe("how search works", () => {
  test.describe.configure({ mode: "serial" });

  test("explains itself before there is a question, without reaching for the internet", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/search/how-it-works");
    await expect(page.getByRole("heading", { name: "How search works", level: 1 })).toBeVisible();
    await expect(page.getByText(/retrieval-augmented generation/).first()).toBeVisible();
    for (const stage of [
      "The whole journey",
      "Reading and cutting",
      "Search by words",
      "Search by meaning",
      "Combining the two",
      "Building the context",
      "The language model",
      "What can go wrong",
    ]) {
      await expect(page.getByRole("link", { name: new RegExp(stage) }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("follows a real question through every stage with numbers from this library", async ({ page }) => {
    const errors = watchForErrors(page);
    // Something to search: a three-page PDF about treating water.
    const upload = await page.request.post("/api/documents", {
      headers: { "X-Outpost-Request": "1" },
      multipart: {
        file: {
          name: "Treating water on the hill.pdf",
          mimeType: "application/pdf",
          buffer: buildPdf([
            ["Boiling", "Bring water to a rolling boil for one minute.", "At altitude boil for three minutes."],
            ["Tablets", "Chlorine dioxide tablets take thirty minutes in cold water."],
            ["Filters", "A ceramic filter removes protozoa and bacteria but not viruses."],
          ]),
        },
      },
    });
    expect(upload.ok()).toBe(true);
    const id = (await upload.json()).results[0].document.id;
    await expect
      .poll(async () => (await (await page.request.get(`/api/documents/${id}`)).json()).document.extraction, { timeout: 20_000 })
      .toBe("done");

    await page.goto("/search/how-it-works");
    await page.getByRole("textbox").first().fill("boil water at altitude");
    await page.getByRole("button", { name: "Trace this question" }).click();
    await expect(page).toHaveURL(/q=boil/);
    await expect(page.getByText(/Traced “boil water at altitude” in/)).toBeVisible();

    // Words: each word of the question, and how rare it is.
    const rarity = page.locator("#fig-rarity");
    await rarity.scrollIntoViewIfNeeded();
    for (const word of ["boil", "water", "altitude"]) await expect(rarity.getByText(word, { exact: true }).first()).toBeVisible();

    // No model is set up here, so the page says plainly that its vectors are a demonstration.
    await expect(page.getByText(/word-count vectors/i).first()).toBeVisible();

    // Context: the numbered sources come from the document, with its words.
    const sources = page.locator("#fig-sources");
    await sources.scrollIntoViewIfNeeded();
    await expect(sources.getByText("[1]")).toBeVisible();
    await expect(sources.getByText(/Treating water on the hill/).first()).toBeVisible();
    await expect(sources.getByText(/rolling boil for one minute/).first()).toBeVisible();

    // The prompt is shown, not sent: nothing left this machine (the fixture checks).
    await expect(page.getByText(/Question: boil water at altitude/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("is one click from a search result", async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent("rolling boil")}`);
    await page.getByRole("link", { name: "How were these found?" }).click();
    await expect(page).toHaveURL(/\/search\/how-it-works\?q=rolling/);
    await expect(page.getByText(/Traced “rolling boil” in/)).toBeVisible();
  });
});
