import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

/**
 * A reference collection that is a set of documents with a list, as openZIM's nautilus
 * makes them. The archive is a stand-in served to the tests by themselves
 * (apps/server/test/nautilus-archive.ts): its page can only draw its list with a browser
 * database, which a page in Outpost's sandbox is refused.
 */
const BOOK = "field-library_en_2026-11";
const UUID = "5d1c0b6e-2f3a-4c7d-9e8f-0a1b2c3d4e5f";
const headers = { "X-Outpost-Request": "1" };

/** Puts the archive in the library, as if it had been downloaded, and waits until it can be read. */
async function addArchive(request: APIRequestContext): Promise<string> {
  const { collections } = await (await request.get("/api/collections")).json();
  const before = collections.find((collection: { title: string; relPath?: string }) => collection.title === "Field library");
  if (before) return before.id;
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
  // Its details are read from the archive in the background; its title is one of them.
  await expect
    .poll(async () => (await (await request.get(`/api/kiwix/books/${id}`)).json()).book, { timeout: 20_000 })
    .toMatchObject({ title: "Field library", ready: true });
  await expect.poll(async () => (await (await request.get(`/api/kiwix/books/${id}/documents?limit=0`)).json()).list?.total).toBe(10);
  return id;
}

async function removeArchive(request: APIRequestContext): Promise<void> {
  // Other tests search the same library, so nothing of this one may stay behind.
  const { documents } = await (await request.get("/api/documents?limit=200")).json();
  for (const document of documents.filter((candidate: { source: string | null }) => candidate.source?.startsWith("Field library: "))) {
    await request.delete(`/api/documents/${document.id}`, { headers });
  }
  const { collections } = await (await request.get("/api/collections")).json();
  for (const collection of collections.filter((candidate: { title: string }) => candidate.title === "Field library")) {
    await request.delete(`/api/collections/${collection.id}?deleteFiles=true`, { headers });
  }
}

test.describe("a collection that is a list of documents", () => {
  test.describe.configure({ mode: "serial" });
  let id: string;
  test.beforeAll(async ({ request }) => {
    id = await addArchive(request);
  });
  test.afterAll(async ({ request }) => {
    await removeArchive(request);
  });

  test("is shown as a list, searched, and a document is opened and added to the library", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(`/library/read/${id}/`);
    await expect(page.getByRole("heading", { name: "Documents in this collection", level: 1 })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("10 documents");
    // The collection's own page is not loaded at all.
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sütterlin für Anfänger — 初級" })).toBeVisible();
    // An entry whose file name climbs out of the collection is left out, and the list says so.
    await expect(page.getByText("Climbs out")).toHaveCount(0);
    await expect(page.getByText(/1 entry in the collection's list names no file that can be opened/)).toBeVisible();

    // The reader's search box looks through the documents as it is typed into.
    const search = page.getByRole("searchbox", { name: "Search the documents in Field library" });
    await search.fill("water");
    await expect(page.getByRole("heading", { name: "Documents matching “water”", level: 1 })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("2 of 10 documents");
    await expect(page.getByRole("list", { name: "Documents" }).getByRole("heading", { level: 2 })).toHaveText([
      "Boiling water to make it safe",
      "Purifying water with bleach",
    ]);
    await search.fill("zebra");
    await expect(page.getByRole("status")).toContainText("None of the 10 documents has those words");
    await search.fill("rocket");
    await expect(page.getByRole("status")).toHaveText("1 of 10 documents");

    // A PDF opens in Outpost's own viewer, read straight out of the collection.
    await page.getByRole("button", { name: "A camper's rocket stove", exact: true }).click();
    await expect(page).toHaveURL(/file=files%2Fstoves%2Frocket\+stove\.pdf/);
    await expect(page.getByTitle("A camper's rocket stove")).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("label", { hasText: "of 1" }).locator("input")).toHaveValue("1");

    // From there it is added to the library under the title the collection gives it.
    // The list underneath keeps its place but cannot be reached while the file is open.
    await expect(page.locator("[inert]").getByRole("button", { name: "Add to library: A camper's rocket stove" })).toHaveCount(1);
    await page.getByRole("button", { name: "Add to library", exact: true }).click();
    await expect(page.getByRole("link", { name: "In your library", exact: true })).toBeVisible();
    const { documents } = await api(page, "GET", "/api/documents?limit=200");
    expect(documents.filter((document: { title: string }) => document.title === "A camper's rocket stove")).toHaveLength(1);

    await page.getByRole("button", { name: "Back to the list" }).click();
    await expect(page.getByRole("link", { name: "In your library: A camper's rocket stove" })).toBeVisible();
    await search.fill("");
    await expect(page.getByRole("status")).toHaveText("10 documents");

    // A document can be added from the list as well.
    await page.getByRole("button", { name: "Add to library: Splinting a forearm" }).click();
    await expect(page.getByRole("link", { name: "In your library: Splinting a forearm" })).toBeVisible();

    // A recording plays in the browser's own player.
    await page.getByRole("button", { name: "Signal whistle", exact: true }).click();
    const player = page.locator("audio");
    await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.readyState >= 1 && audio.duration > 0.4)).toBe(true);
    await page.getByRole("button", { name: "Back to the list" }).click();

    // A kind of file the reader has no viewer for is handed to the browser, from inside the collection.
    const sheet = page.getByRole("link", { name: "Kit list", exact: true });
    await expect(sheet).toHaveAttribute("href", `/kiwix/open/content/${BOOK}/files/kit%20list.ods`);
    await expect(sheet).toHaveAttribute("target", "_blank");
    expect(errors).toEqual([]);
  });

  test("can still show the collection's own page, which cannot draw its list in the sandbox", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(`/library/read/${id}/home`);
    await page.getByRole("button", { name: "Show the collection's own page" }).click();
    await expect(page).toHaveURL(/view=page/);
    await expect(page.getByText("This is the collection's own page. It cannot draw its list of documents here.")).toBeVisible();
    const frame = page.frameLocator("iframe");
    await expect(frame.getByRole("heading", { name: "Field library" })).toBeVisible();
    // The page's script is refused a database, as any archive page is, and so draws nothing. This is why the list is Outpost's.
    await expect.poll(() => errors.join("\n")).toMatch(/Indexed Database API is denied|IDBFactory/);
    await expect(frame.locator("#doc-list li")).toHaveCount(0);
    await expect(frame.locator("#loader")).toBeVisible();
    expect(await frame.locator("html").evaluate(() => self.origin)).toBe("null");

    await page.getByRole("button", { name: "Show the documents" }).click();
    await expect(page.getByRole("heading", { name: "Documents in this collection", level: 1 })).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("has its documents found by Outpost's search, which leads into the reader", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(`/search?q=${encodeURIComponent("north compass")}`);
    const hit = page.getByRole("link", { name: "Finding north without a compass" });
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page).toHaveURL(new RegExp(`/library/read/${id}/home\\?file=files%2Fnorth\\.pdf`));
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    // There is no list behind this file in the history, so closing it shows the list in its place.
    await page.getByRole("button", { name: "Back to the list" }).click();
    await expect(page.getByRole("heading", { name: "Documents in this collection", level: 1 })).toBeVisible();
    await expect(page).not.toHaveURL(/file=/);
    expect(errors).toEqual([]);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

    test("fits the screen, and a whole entry can be pressed", async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(`/library/read/${id}/`);
      await expect(page.getByRole("heading", { name: "Documents in this collection", level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const name of ["Add to library: Boiling water to make it safe", "First page of this collection"]) {
        const box = await page.getByRole("button", { name }).boundingBox();
        expect(box!.height, name).toBeGreaterThanOrEqual(40);
      }
      await page.getByRole("searchbox").fill("grain");
      await expect(page.getByRole("status")).toHaveText("1 of 10 documents");
      // Pressing the description opens the document, not only its title.
      const words = (await page.getByText('Food: "dry, dark and cool"').boundingBox())!;
      await page.touchscreen.tap(words.x + words.width / 2, words.y + words.height / 2);
      await expect(page.getByRole("button", { name: "Back to the list" })).toBeVisible();
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      expect(errors).toEqual([]);
    });
  });
});
