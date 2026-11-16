import type { APIRequestContext } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { buildPdf } from "./pdf";

/**
 * Search by meaning with the model that ships in the packaged app: switched on from
 * Settings, the index built in the background, and a document found by a question that
 * shares no word with it. Like every test here it runs with the internet cut off.
 *
 * The model is fetched when the app is built (`node scripts/fetch-embedding-model.mjs`,
 * then `node scripts/build-app.mjs`). Without it the test is skipped, and says so.
 */
test.describe("search by meaning, built in", () => {
  test.describe.configure({ mode: "serial" });

  const documents: string[] = [];
  let installed = false;

  const headers = { "X-Outpost-Request": "1" };
  const status = async (request: APIRequestContext) => (await request.get("/api/semantic/status")).json();

  test.beforeAll(async ({ request }) => {
    installed = (await status(request)).builtIn.installed;
  });

  // Other tests expect search by meaning to be off, as it is in a new installation.
  test.afterAll(async ({ request }) => {
    const { build, modelId } = await status(request);
    if (build && ["queued", "running", "paused"].includes(build.state)) await request.post(`/api/jobs/${build.id}/cancel`, { headers });
    await request.patch("/api/settings", { headers, data: { "search.semantic.enabled": false } });
    if (modelId) await request.delete(`/api/semantic/models/${encodeURIComponent(modelId)}`, { headers });
    for (const id of documents) await request.delete(`/api/documents/${id}`, { headers });
  });

  test("is switched on in Settings, builds its index, and finds a document that shares no word with the question", async ({ page }) => {
    test.skip(!installed, "The packaged app was built without the model. Run `node scripts/fetch-embedding-model.mjs`, then build again.");
    test.setTimeout(300_000);
    const errors = watchForErrors(page);

    // Two short documents about quite different things.
    for (const [name, lines] of [
      ["Kennel notes.pdf", ["Winter", "Trim the hair between the pads and rinse off grit and road salt after each walk."]],
      ["Workshop notes.pdf", ["Edges", "Hold the bevel flat on the stone and draw the chisel back with even strokes."]],
    ] as const) {
      const upload = await page.request.post("/api/documents", {
        headers,
        multipart: { file: { name, mimeType: "application/pdf", buffer: buildPdf([[...lines]]) } },
      });
      expect(upload.ok()).toBe(true);
      const id = (await upload.json()).results[0].document.id;
      documents.push(id);
      await expect
        .poll(async () => (await (await page.request.get(`/api/documents/${id}`)).json()).document.extraction, { timeout: 20_000 })
        .toBe("done");
    }

    // Off to begin with, and the cost is stated before anything is switched on.
    await page.goto("/settings#semantic-title");
    const section = page.getByRole("region", { name: "Search by meaning" });
    const toggle = section.getByRole("switch", { name: "Search by meaning" });
    await expect(toggle).not.toBeChecked();
    await expect(section.getByText("Time to build the index")).toBeVisible();
    await expect(section.getByText(/for every thousand passages on a recent laptop/)).toBeVisible();
    await expect(section.getByText("Disk for the index")).toBeVisible();

    // Switching it on is all it takes: the built-in model is the choice already made.
    await toggle.click();
    await expect(section.getByRole("radio", { name: "Built in" })).toBeChecked();
    await expect(section.getByText(/The built-in model is all-MiniLM-L6-v2/)).toBeVisible();
    await expect(section.getByText(/Apache-2.0 licence/)).toBeVisible();
    await expect(section.getByText("Index not built yet")).toBeVisible();
    // Nothing is embedded until a person asks.
    expect((await api(page, "GET", "/api/semantic/status")).embeddedChunks).toBe(0);

    await section.getByRole("button", { name: "Build index" }).click();
    await expect(section.getByText("Index is up to date")).toBeVisible({ timeout: 240_000 });
    const built = await api(page, "GET", "/api/semantic/status");
    expect(built).toMatchObject({ ready: true, provider: "built-in", dimensions: 384, indexing: false });
    expect(built.modelId).toMatch(/^built-in:all-MiniLM-L6-v2-q8-[0-9a-f]{8}$/);
    expect(built.embeddedChunks).toBe(built.totalChunks);
    expect(built.build.state).toBe("succeeded");

    // No word of the question is in the document, its title or its heading, so searching
    // by words cannot find it, even when asked for any word rather than all of them.
    const question = "dog paws snow ice";
    const kennel = documents[0];
    const byWords = await api(page, "GET", `/api/search?q=${encodeURIComponent(question)}&mode=keyword&kinds=document`);
    expect(byWords.results.map((result: { entityId: string }) => result.entityId)).not.toContain(kennel);

    await page.goto(`/search?q=${encodeURIComponent(question)}&kind=document&mode=keyword`);
    await expect(page.getByRole("radio", { name: "Exact words" })).toBeChecked();
    await page.getByRole("radio", { name: "By meaning" }).click();
    await expect(page).toHaveURL(/mode=semantic/);
    const first = page.getByRole("main").getByRole("listitem").first();
    await expect(first.getByRole("link", { name: "Kennel notes" })).toBeVisible();
    await expect(first).toContainText("Trim the hair between the pads");
    // And the ordinary search, which now uses both, finds it too.
    await page.getByRole("radio", { name: "Best of both" }).click();
    await expect(page).toHaveURL(/mode=hybrid/);
    await expect(page.getByRole("main").getByRole("link", { name: "Kennel notes" })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("the settings section fits the screen and its controls are large enough to press", async ({ page }) => {
      test.skip(!installed, "The packaged app was built without the model.");
      await page.goto("/settings#semantic-title");
      const section = page.getByRole("region", { name: "Search by meaning" });
      await expect(section.getByText("Index is up to date")).toBeVisible();
      // Nothing pushes the page wider than the screen.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      for (const control of [
        section.getByRole("radio", { name: "Built in" }),
        section.getByRole("radio", { name: "Local server" }),
        section.getByRole("link", { name: "Save vectors to a file" }),
        section.getByRole("button", { name: "Load vectors from a file" }),
      ]) {
        const box = await control.boundingBox();
        expect(box?.height ?? 0, (await control.textContent()) ?? "").toBeGreaterThanOrEqual(40);
      }
    });
  });
});
