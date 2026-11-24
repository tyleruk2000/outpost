import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

/**
 * A search answers in two parts: what Outpost holds at once, and what reference
 * collections hold when they have been searched. The collection here is the tests' own
 * stand-in for kiwix-serve (apps/server/test/nautilus-archive.ts), which takes two and a
 * half seconds to find the one article that has the word "slowcoach".
 */
const BOOK = "field-library_en_2026-11";
const UUID = "5d1c0b6e-2f3a-4c7d-9e8f-0a1b2c3d4e5f";
const ARTICLE = "The slowcoach of the shelf";
const headers = { "X-Outpost-Request": "1" };

async function addArchive(request: APIRequestContext): Promise<void> {
  const { collections } = await (await request.get("/api/collections")).json();
  if (collections.some((collection: { title: string }) => collection.title === "Field library")) return;
  const { locations } = await (await request.get("/api/storage/locations")).json();
  const location = locations.find((candidate: { isDefault: boolean }) => candidate.isDefault);
  const relPath = `collections/zim/${BOOK}.zim`;
  // Bytes that pass for the start of a ZIM archive: magic number, version, UUID. The stand-in serves the rest.
  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x044d495a, 0);
  header.writeUInt16LE(6, 4);
  header.writeUInt16LE(3, 6);
  Buffer.from(UUID.replace(/-/g, ""), "hex").copy(header, 8);
  fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), header);
  const imported = await request.post("/api/kiwix/import", { headers, data: { locationId: location.id, relPath } });
  expect(imported.ok(), await imported.text()).toBe(true);
  const id = (await imported.json()).collection.id as string;
  await expect
    .poll(async () => (await (await request.get(`/api/kiwix/books/${id}`)).json()).book, { timeout: 20_000 })
    .toMatchObject({ title: "Field library", ready: true });
}

test.describe("search with a slow reference collection", () => {
  test.describe.configure({ mode: "serial" });
  let noteId: string;
  test.beforeAll(async ({ request }) => {
    await addArchive(request);
    const created = await request.post("/api/notes", { headers, data: { title: "Slowcoach checklist" } });
    expect(created.ok(), await created.text()).toBe(true);
    noteId = (await created.json()).note.id;
  });
  test.afterAll(async ({ request }) => {
    // Other tests search the same library, so nothing of this one may stay behind.
    await request.delete(`/api/notes/${noteId}?permanent=true`, { headers });
    const { collections } = await (await request.get("/api/collections")).json();
    for (const collection of collections.filter((candidate: { title: string }) => candidate.title === "Field library")) {
      await request.delete(`/api/collections/${collection.id}?deleteFiles=true`, { headers });
    }
  });

  test("the first part does not wait for the collection", async ({ page }) => {
    const started = Date.now();
    const own = await api(page, "GET", "/api/search?q=slowcoach&reference=later");
    expect(Date.now() - started).toBeLessThan(2000);
    expect(own.results.map((result: { title: string }) => result.title)).toEqual(["Slowcoach checklist"]);
    expect(own.referenceToCome).toBe(true);
  });

  test("the page shows a person's own results at once and puts the collection's article in the same list when it comes", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    await page.goto("/search?q=slowcoach");
    // The page is also in the sidebar's tree; the result is the one in the content.
    const content = page.locator("#content");
    const own = content.getByRole("link", { name: "Slowcoach checklist" });
    await expect(own).toBeVisible();
    // The collection has not answered: the page says so, and its article is not there yet.
    await expect(page.getByText("Still searching reference collections…").first()).toBeVisible();
    await expect(page.getByRole("link", { name: ARTICLE })).toHaveCount(0);
    const article = page.getByRole("link", { name: ARTICLE });
    await expect(article).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Still searching/)).toHaveCount(0);
    await expect(page.getByText("1 article from reference collections is in this list.")).toBeVisible();
    // One list, in score order: the article is a row of the same list as the page of the person's own.
    await expect(
      content
        .getByRole("list")
        .filter({ has: page.getByRole("link", { name: "Slowcoach checklist" }) })
        .getByRole("link", { name: ARTICLE }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Reference/ })).toContainText("1");

    await page.getByRole("tab", { name: /^Reference/ }).click();
    await expect(page.getByRole("link", { name: ARTICLE })).toBeVisible();
    await expect(content.getByRole("link", { name: "Slowcoach checklist" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the palette lists a person's own match first and the collection's article when it comes", async ({ page }) => {
    await page.goto("/");
    // The button in the sidebar opens the palette too, and is there only once the app is listening.
    await page.getByRole("button", { name: "Quick search" }).click();
    const palette = page.getByRole("dialog", { name: "Search and go to" });
    await expect(palette).toBeVisible();
    // A word of its own, so that nothing is remembered from the test before.
    await palette.getByRole("combobox").fill("Slowcoach");
    const own = palette.getByRole("option", { name: /Slowcoach checklist/ });
    await expect(own).toBeVisible();
    const before = await own.boundingBox();
    await expect(palette.getByRole("option", { name: new RegExp(ARTICLE) })).toBeVisible({ timeout: 15_000 });
    expect(await own.boundingBox()).toEqual(before);
    await expect(palette.getByText(/Still searching/)).toHaveCount(0);
  });
});
