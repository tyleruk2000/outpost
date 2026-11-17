/**
 * Looking things up in Outpost, on a phone: the stand-in model server (not a language
 * model) asks for the nearest supermarket from a fixture layer, Outpost runs the tool on
 * the server, and the reply shows what was looked at ("the nearest places"), which opens to the question asked
 * and the answer given.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

const MODEL_URL = process.env.OUTPOST_E2E_MODEL_URL!;

const SHOPS = [
  "name,latitude,longitude,layer,kind,country,provenance,publisher,license,source_url,published,accuracy",
  "Corner shop (fixture),54.521,-3.051,shelters,Supermarket,GB,public-record,A made-up map,ODbL 1.0,https://example.org/shops,2026-11-01,To the building",
  "Big shop (fixture),54.56,-3.1,shelters,Supermarket,GB,public-record,A made-up map,ODbL 1.0,https://example.org/shops,2026-11-01,To the building",
].join("\n");

test.use({ viewport: { width: 390, height: 844 } });

test.describe("looking things up, on a phone", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.request.fetch("/api/settings", {
      method: "PATCH",
      headers: { "X-Outpost-Request": "1", "Content-Type": "application/json" },
      data: JSON.stringify({ "answers.enabled": false, "answers.model": "", "tools.enabled": false }),
    });
    await removeReferencePacks(page);
    await page.close();
  });

  test("the model asks for the nearest supermarket, and the reply says what was looked at", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    const uploaded = await page.request.post("/api/reference/imports", {
      headers: { "X-Outpost-Request": "1" },
      multipart: {
        format: "features-csv",
        title: "Shops (fixture)",
        options: JSON.stringify({ provenance: "public-record" }),
        file: { name: "shops.csv", mimeType: "text/csv", buffer: Buffer.from(SHOPS) },
      },
    });
    expect(uploaded.ok(), await uploaded.text()).toBe(true);
    await expect
      .poll(
        async () => (await api<{ packs: Array<{ title: string }> }>(page, "GET", "/api/reference/packs")).packs.map((pack) => pack.title),
        {
          timeout: 30_000,
        },
      )
      .toContain("Shops (fixture)");
    await api(page, "PATCH", "/api/settings", {
      "answers.enabled": true,
      "answers.endpoint": `${MODEL_URL}/v1`,
      "answers.model": "stand-in-tools:latest",
      "tools.enabled": true,
    });

    await page.goto("/chat");
    const box = page.getByRole("textbox", { name: "Your message" });
    await box.fill('Which is the nearest supermarket? use nearest_place {"kind":"supermarket","near":"54.52,-3.05","count":1}');
    await page.getByRole("button", { name: "Send" }).click();

    const reply = page.getByRole("article", { name: /^Reply from/ }).last();
    const lookedAt = reply.getByRole("region", { name: "What the model looked up in Outpost" });
    await expect(lookedAt).toContainText("Looked at:", { timeout: 30_000 });
    const name = lookedAt.getByRole("button", { name: /^the nearest places/ });
    await expect(name).toBeVisible();
    expect((await name.boundingBox())!.height).toBeGreaterThanOrEqual(43);
    await expect(reply.getByTestId("reply-text")).toContainText("From Outpost", { timeout: 30_000 });

    // Opened: the question asked of the tool in words, never JSON, and its answer quoted.
    await name.click();
    await expect(name).toHaveAttribute("aria-expanded", "true");
    await expect(lookedAt).toContainText("kind: supermarket");
    await expect(lookedAt).not.toContainText('{"kind"');
    await expect(lookedAt.locator("blockquote")).toContainText("Corner shop (fixture)");
    await expect(lookedAt.getByRole("link", { name: "Open it in Outpost" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // Read again later, the conversation shows the same.
    await page.reload();
    await expect(
      page
        .getByRole("article", { name: /^Reply from/ })
        .last()
        .getByRole("button", { name: /^the nearest places/ }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
