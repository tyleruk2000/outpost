import type { APIRequestContext } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { buildPdf } from "./pdf";

/**
 * Search by meaning with the model that ships in the packaged app, on a phone 390 pixels
 * wide: one switch in Settings is turned on, from nothing; the library is read without
 * anything more being pressed; and a document is found by a question that shares no
 * word with it. Like every test here it runs with the internet cut off.
 *
 * The model is fetched when the app is built (`node scripts/fetch-embedding-model.mjs`,
 * then `node scripts/build-app.mjs`). Without it the test is skipped, and says so.
 */
test.describe("search by meaning, built in", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

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

  test("is one switch: turned on from nothing, it reads the library by itself, says when it is ready, and finds by meaning", async ({
    page,
  }) => {
    test.skip(!installed, "The packaged app was built without the model. Run `node scripts/fetch-embedding-model.mjs`, then build again.");
    test.setTimeout(300_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

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

    // Off to begin with: one switch, what it will cost in plain words, and nothing else to decide.
    await page.goto("/settings#semantic-title");
    const section = page.getByRole("region", { name: "Search by meaning" });
    const toggle = section.getByRole("switch", { name: "Search by meaning" });
    await expect(toggle).not.toBeChecked();
    await expect(section.getByText("Off", { exact: true })).toBeVisible();
    await expect(
      section.getByText(/Turn it on and Outpost reads your library once, on this computer: about .+ of disk\. Nothing leaves/),
    ).toBeVisible();
    await expect(section.getByRole("switch")).toHaveCount(1);
    await expect(section.getByRole("button")).toHaveCount(0);
    await expect(section.getByRole("radio")).toHaveCount(0);
    expect((await api(page, "GET", "/api/semantic/status")).embeddedChunks).toBe(0);

    // One press. Nothing else is asked for: the built-in model is used and the library is read.
    await toggle.click();
    await expect(section.getByText("Ready", { exact: true })).toBeVisible({ timeout: 240_000 });
    await expect(section.getByText(/Search now also finds things by meaning/)).toBeVisible();
    const built = await api(page, "GET", "/api/semantic/status");
    expect(built).toMatchObject({ ready: true, provider: "built-in", dimensions: 384, indexing: false });
    expect(built.modelId).toMatch(/^built-in:all-MiniLM-L6-v2-q8-[0-9a-f]{8}$/);
    expect(built.embeddedChunks).toBe(built.totalChunks);
    expect(built.build.state).toBe("succeeded");
    expect(await overflow()).toBeLessThanOrEqual(1);

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
    // And the ordinary search, which now uses both, finds it too. On a phone the switch is folded with the
    // explanations of the results, under "About these results", once there are results.
    await page.getByText("About these results").click();
    await page.getByRole("radio", { name: "Best of both" }).click();
    await expect(page).toHaveURL(/mode=hybrid/);
    await expect(page.getByRole("main").getByRole("link", { name: "Kennel notes" })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("reads what is added afterwards without being asked", async ({ page }) => {
    test.skip(!installed, "The packaged app was built without the model.");
    test.setTimeout(120_000);
    const before = (await status(page.request)).totalChunks;
    const upload = await page.request.post("/api/documents", {
      headers,
      multipart: {
        file: {
          name: "Larder notes.pdf",
          mimeType: "application/pdf",
          buffer: buildPdf([["Shelves", "Keep flour and oats in tins with tight lids so that mice and damp stay out."]]),
        },
      },
    });
    expect(upload.ok()).toBe(true);
    const id = (await upload.json()).results[0].document.id;
    documents.push(id);
    // Nothing is pressed: a few seconds after the document has been read, its passages are read for meaning too.
    await expect
      .poll(
        async () => {
          const now = await status(page.request);
          return now.totalChunks > before && now.embeddedChunks === now.totalChunks && !now.indexing;
        },
        { timeout: 90_000, intervals: [1000] },
      )
      .toBe(true);
    // A search by meaning only ever finds what has been read for meaning.
    const found = await api(
      page,
      "GET",
      `/api/search?q=${encodeURIComponent("keeping mice out of the flour")}&mode=semantic&kinds=document`,
    );
    expect(found.mode).toBe("semantic");
    expect(found.results.map((result: { entityId: string }) => result.entityId)).toContain(id);
  });

  test("everything else is behind one line, fits the screen, and is large enough to press; switching off keeps what was read", async ({
    page,
  }) => {
    test.skip(!installed, "The packaged app was built without the model.");
    await page.goto("/settings#semantic-title");
    const section = page.getByRole("region", { name: "Search by meaning" });
    await expect(section.getByText("Ready", { exact: true })).toBeVisible();
    await expect(section.getByRole("link", { name: "Set-up guide" })).toHaveAttribute("href", "/help/search-and-answers#search-by-meaning");

    await section.getByText("More options").click();
    await expect(section.getByRole("radio", { name: "Built in" })).toBeChecked();
    await expect(section.getByText(/The built-in model is all-MiniLM-L6-v2/)).toBeVisible();
    await expect(section.getByText(/Apache-2.0 licence/)).toBeVisible();
    await expect(section.getByText("Index is up to date")).toBeVisible();
    await expect(section.getByLabel("Weight of matching meaning")).toHaveValue("1");
    // Nothing pushes the page wider than the screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const control of [
      section.getByRole("switch", { name: "Search by meaning" }),
      section.getByText("More options"),
      section.getByRole("radio", { name: "Built in" }),
      section.getByRole("radio", { name: "Local server" }),
      section.getByRole("link", { name: "Save vectors to a file" }),
      section.getByRole("button", { name: "Load vectors from a file" }),
    ]) {
      const box = await control.boundingBox();
      // The switch is a small picture of a switch; everything else is a full-height target.
      const least = (await control.getAttribute("role")) === "switch" ? 24 : 40;
      expect(box?.height ?? 0, (await control.textContent()) ?? "").toBeGreaterThanOrEqual(least);
    }

    // Off again: it says that what was read is kept, and searches go back to words.
    await section.getByRole("switch", { name: "Search by meaning" }).click();
    await expect(
      section.getByText(/What Outpost read before is kept \(\d+ passages, .+\), so turning it on again takes no time\./),
    ).toBeVisible();
    const off = await api(page, "GET", "/api/semantic/status");
    expect(off).toMatchObject({ enabled: false, embeddedChunks: 0 });
    expect(off.keptChunks).toBe(off.totalChunks);
  });
});
