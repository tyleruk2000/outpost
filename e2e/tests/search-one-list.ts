import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "./fixtures";

/**
 * The tests of one ranked list on the Search screen. The stand-in for kiwix-serve
 * (apps/server/test/nautilus-archive.ts) answers "lantern wick" at once with one article,
 * "Lantern wick trimming", whose title holds both words. A page of the person's own holds
 * the words too, far apart. The article must come above it in Everything, by itself.
 */
const BOOK = "field-library_en_2026-11";
const UUID = "5d1c0b6e-2f3a-4c7d-9e8f-0a1b2c3d4e5f";
export const ARTICLE = "Lantern wick trimming";
export const OWN = "Shed notes";
const headers = { "X-Outpost-Request": "1" };

/** Adds the stand-in's archive as a collection, once. */
export async function addArchive(request: APIRequestContext): Promise<void> {
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

/** Takes the archive away again: other tests search the same library. */
export async function removeArchive(request: APIRequestContext): Promise<void> {
  const { collections } = await (await request.get("/api/collections")).json();
  for (const collection of collections.filter((candidate: { title: string }) => candidate.title === "Field library")) {
    await request.delete(`/api/collections/${collection.id}?deleteFiles=true`, { headers });
  }
}

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

/** A page of the person's own that says "lantern" at its start and "wick" at its end. Returns its id. */
export async function addOwnPage(request: APIRequestContext): Promise<string> {
  const filler =
    "The shed holds the mower, two spades, a fork, the hose reel, seed trays stacked by size, garden twine, a box of screws, " +
    "the stepladder, paint tins on the top shelf, the bicycle pump, spare fence panels leaning on the back wall and a tarpaulin.";
  const created = await request.post("/api/notes", {
    headers,
    data: {
      title: OWN,
      content: { type: "doc", content: [paragraph(`The lantern hangs by the door. ${filler} ${filler} A spare wick is in the drawer.`)] },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  return (await created.json()).note.id;
}

export async function removeOwnPage(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`/api/notes/${id}?permanent=true`, { headers });
}

/** Searches on the Search screen and waits for the article to join the list, with nothing pressed. */
export async function searchAndSeeOneList(page: Page): Promise<void> {
  await page.goto("/search?q=lantern%20wick");
  const content = page.locator("#content");
  const own = content.getByRole("link", { name: OWN });
  await expect(own).toBeVisible();
  const article = content.getByRole("link", { name: ARTICLE });
  await expect(article).toBeVisible({ timeout: 15_000 });
  // One list: both are rows of it, the article first.
  // `has` looks inside each list, so it takes a locator of its own, not one that starts at #content.
  const list = content.getByRole("list").filter({ has: page.getByRole("link", { name: OWN }) });
  await expect(list.getByRole("link", { name: ARTICLE })).toHaveCount(1);
  const rows = await list.locator(":scope > li h2").allTextContents();
  expect(rows.indexOf(ARTICLE)).toBeGreaterThanOrEqual(0);
  expect(rows.indexOf(ARTICLE)).toBeLessThan(rows.indexOf(OWN));
  // Nothing to press to see it, and no section of its own.
  await expect(page.getByRole("heading", { name: "In reference collections" })).toHaveCount(0);
  await expect(page.getByText("1 article from reference collections is in this list.")).toBeVisible();
  // The reason under the page of the person's own says its words are far apart.
  await expect(list.locator(":scope > li").filter({ has: page.getByRole("link", { name: OWN }) })).toContainText("far apart");
}
