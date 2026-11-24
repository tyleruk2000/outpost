import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
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
/** The list's count, said as it changes. The screen's own status, not the app's announcement of the screen's name (outside main),
 * nor the shell's box for when the server stops answering, which is in main and empty while it answers. */
const listStatus = (page: Page) => page.getByRole("main").getByRole("status").filter({ hasText: /\S/ });

/** The stand-in archive itself, for making its files slow to arrive or one of them absent. */
const ARCHIVE = process.env.OUTPOST_E2E_KIWIX_URL!;
const archiveAs = (how = "") => fetch(`${ARCHIVE}/control${how}`);

/** Takes the documents added from the archive out of the library again, and puts away any "add all" that is still going. */
async function removeAdded(request: APIRequestContext, id?: string): Promise<void> {
  if (id) {
    const { job } = await (await request.get(`/api/kiwix/books/${id}/files/add-all`)).json();
    if (job && ["queued", "running", "paused"].includes(job.state)) await request.post(`/api/jobs/${job.id}/cancel`, { headers });
    await expect
      .poll(async () => (await (await request.get(`/api/kiwix/books/${id}/files/add-all`)).json()).job?.state ?? "none")
      .not.toMatch(/queued|running|paused/);
  }
  const { documents } = await (await request.get("/api/documents?limit=200")).json();
  for (const document of documents.filter((candidate: { source: string | null }) => candidate.source?.startsWith("Field library: "))) {
    await request.delete(`/api/documents/${document.id}`, { headers });
  }
}

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
  await archiveAs();
  await removeAdded(request);
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
    await expect(listStatus(page)).toHaveText("10 documents");
    // The collection's own page is not loaded at all.
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sütterlin für Anfänger — 初級" })).toBeVisible();
    // An entry whose file name climbs out of the collection is left out, and the list says so.
    await expect(page.getByText("Climbs out")).toHaveCount(0);
    await expect(page.getByText(/1 entry in the collection's list names no file that can be opened/)).toBeVisible();

    // The reader's search box looks through the documents as it is typed into.
    const search = page.getByRole("combobox", { name: "Search the documents in Field library" });
    await search.fill("water");
    await expect(page.getByRole("heading", { name: "Documents matching “water”", level: 1 })).toBeVisible();
    await expect(listStatus(page)).toHaveText("2 of 10 documents");
    await expect(page.getByRole("list", { name: "Documents" }).getByRole("heading", { level: 2 })).toHaveText([
      "Boiling water to make it safe",
      "Purifying water with bleach",
    ]);
    await search.fill("zebra");
    await expect(listStatus(page)).toContainText("None of the 10 documents has those words");
    await search.fill("rocket");
    await expect(listStatus(page)).toHaveText("1 of 10 documents");

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
    await expect(listStatus(page)).toHaveText("10 documents");

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

  test("shows a page that is a small web app, and opens it from its own address", async ({ page }) => {
    // Archives of video channels are like this: a module script that draws the page from a
    // data file. In the sandbox both are cross-origin requests, and nothing showed.
    const id = await addArchive(page.request);
    // Opened by its address, as a reload or a saved link does; many end in ".html".
    const answer = await page.request.get(`/library/read/${id}/index.html`);
    expect(answer.status()).toBe(200);
    expect(answer.headers()["content-type"]).toContain("text/html");
    await page.goto(`/library/read/${id}/app`);
    await expect(page.frameLocator("iframe").getByRole("heading", { name: "Winter prepping videos" })).toBeVisible();
    // The page still has an origin of its own, and Outpost's API still refuses it.
    const sandbox = await page.locator("iframe").getAttribute("sandbox");
    expect(sandbox).not.toContain("allow-same-origin");
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

  test("says plainly when a file the collection's list names is not in the collection", async ({ page }) => {
    await archiveAs("?missing=north.pdf");
    try {
      await page.goto(`/library/read/${id}/home?file=files%2Fnorth.pdf`);
      await expect(page.getByRole("heading", { name: "This collection does not have that file" })).toBeVisible({ timeout: 15_000 });
      // It is not a document of the library, so nothing is said about a record or a storage location.
      await expect(page.getByText(/storage location|has a record/)).toHaveCount(0);
      await page.getByRole("button", { name: "Back to the list" }).click();
      await expect(page.getByRole("heading", { name: "Documents in this collection", level: 1 })).toBeVisible();
    } finally {
      await archiveAs();
    }
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
      await page.getByRole("combobox", { name: "Search the documents in Field library" }).fill("grain");
      await expect(listStatus(page)).toHaveText("1 of 10 documents");
      // Pressing the description opens the document, not only its title.
      const words = (await page.getByText('Food: "dry, dark and cool"').boundingBox())!;
      await page.touchscreen.tap(words.x + words.width / 2, words.y + words.height / 2);
      await expect(page.getByRole("button", { name: "Back to the list" })).toBeVisible();
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      expect(errors).toEqual([]);
    });

    test("ends on the bottom bar as measured, with the text larger", async ({ page }) => {
      await page.addInitScript(() => {
        const apply = () => document.documentElement.style.setProperty("font-size", "24px", "important");
        if (document.documentElement) apply();
        document.addEventListener("DOMContentLoaded", apply);
      });
      await page.goto(`/library/read/${id}/`);
      await expect(page.getByRole("heading", { name: "Documents in this collection", level: 1 })).toBeVisible();
      // The bar's names grow with the text, so its height is measured (--mobile-nav-height), not guessed.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const bar = document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect().height;
            const screen = document.querySelector("main h1")!.closest(".h-dvh")!;
            return Math.round(Math.abs(Number.parseFloat(getComputedStyle(screen).paddingBottom) - bar) * 10) / 10;
          }),
        )
        .toBeLessThan(0.5);
    });
  });
  // The tests from here on add documents in bulk. How that turned out stays on the list for a while,
  // so they come after the tests that read the list as it is before anything was added to it.
  test.describe("adding every document to the library", () => {
    test.afterEach(async ({ request }) => {
      await archiveAs();
      await removeAdded(request, id);
    });

    test("says what adding does, and adds them all as a job that goes on when the page is left", async ({ page }) => {
      const errors = watchForErrors(page);
      await removeAdded(page.request, id);
      await api(page, "POST", `/api/kiwix/books/${id}/files/save`, { path: "files/grain.pdf", title: "Storing grain for a year" });
      // The collection is looked at once while every file is there, so Outpost knows how large each one is
      // (it keeps what it learnt). Without this the answer depends on which tests ran first: a file it has never
      // seen and cannot reach makes the size "at least" so much, which is right but not what is checked here.
      await page.goto(`/library/read/${id}/`);
      await expect(page.getByText(/so adding the other 7 uses [\d.]+ kB more/)).toBeVisible();
      // Each file takes a while to arrive, and one of them is not in the collection after all.
      await archiveAs("?delay=1200&missing=north.pdf");
      await page.reload();

      // What "Add to library" does is said where the choice is made: a copy, where to, nothing from the internet, how much room.
      const words = page.getByText(/copies a document out of this collection into your library/);
      await expect(words).toContainText("on “Internal storage”");
      await expect(words).toContainText("Nothing is downloaded from the internet.");
      await expect(words).toContainText(/The collection keeps its copy, so adding the other 7 uses [\d.]+ kB more \([\d.]+ [GT]B free\)\./);
      // Each line says how large its file is.
      await expect(page.getByRole("listitem").filter({ hasText: "Boiling water to make it safe" })).toContainText(/PDF\s*·[\s,]*\d+ bytes/);

      await page.getByRole("button", { name: "Add the other 7 to library" }).click();
      const dialog = page.getByRole("dialog", { name: "Add 7 documents to your library?" });
      await expect(dialog).toContainText(
        /They are copied out of this collection onto “Internal storage”: [\d.]+ kB, of [\d.]+ [GT]B free\./,
      );
      await expect(dialog).toContainText(
        "Nothing is downloaded from the internet. The collection keeps its own copy, so this space is used a second time.",
      );
      await expect(dialog).toContainText("1 document is in your library already and will be left alone.");
      await expect(dialog).toContainText("What has been added stays in your library, also if this collection is removed later.");
      await dialog.getByRole("button", { name: "Add 7 documents" }).click();
      await expect(dialog).toHaveCount(0);

      // It counts as it goes, and the lines of the list say which is being added and which are waiting.
      const going = page.getByRole("region", { name: "Adding to your library" });
      await expect(going).toContainText(/[1-5] of 7/, { timeout: 20_000 });
      await expect(page.getByText("Waiting its turn").first()).toBeVisible();
      await expect(page.getByRole("list", { name: "Documents" }).getByText("Adding…")).toHaveCount(1);
      await expect(page.getByRole("button", { name: /to library$/ })).toHaveCount(0);

      // Leaving the page does not stop it: Downloads shows it, counted the same way.
      await page.goto("/downloads");
      const row = page.getByRole("listitem").filter({ hasText: "Adding documents from “Field library” to your library" });
      await expect(row).toContainText(/[1-6] of 7/);
      await expect(row.getByRole("button", { name: /^Cancel Adding documents from “Field library”/ })).toBeVisible();

      await page.goto(`/library/read/${id}/`);
      // How it turned out: how many were added, and which one was not, and why.
      const outcome = listStatus(page).filter({ hasText: "could not be added" });
      await expect(outcome).toContainText("Added 6 documents to your library; 1 could not be added", { timeout: 30_000 });
      await expect(outcome).toContainText("They are on “Internal storage”");
      await expect(outcome).toContainText("stay there if this collection is removed");
      await expect(outcome.getByRole("list", { name: "Could not be added" })).toContainText(
        'Finding north without a compass: "north.pdf" is not in this collection.',
      );
      const north = page.getByRole("listitem").filter({ hasText: "Finding north without a compass" }).last();
      await expect(north.getByRole("alert")).toContainText('Not added. "north.pdf" is not in this collection.');
      await expect(page.getByRole("link", { name: /^In your library: / })).toHaveCount(7);

      // The one that failed can be tried again, on its own line, once the file is there.
      await archiveAs();
      await north.getByRole("button", { name: "Try again: Finding north without a compass" }).click();
      await expect(page.getByRole("link", { name: "In your library: Finding north without a compass" })).toBeVisible();
      await expect(page.getByText(/All 8 here are in your library, and stay there if this collection is removed\./)).toBeVisible();
      await expect(page.getByRole("button", { name: /to library$/ })).toHaveCount(0);

      const { documents } = await api(page, "GET", "/api/documents?limit=200");
      const added = documents.filter((document: { source: string | null }) => document.source?.startsWith("Field library: "));
      expect(added).toHaveLength(8);
      // Their text is read, so that search finds them to the page. (Other tests' documents share this library.)
      await expect
        .poll(
          async () =>
            (await api(page, "GET", "/api/documents?limit=200")).documents
              .filter((d: { source: string | null }) => d.source?.startsWith("Field library: "))
              .map((d: { extraction: string }) => d.extraction),
          { timeout: 30_000 },
        )
        .toEqual(Array(8).fill("done"));
      expect(errors).toEqual([]);
    });

    test("adds only what a search is showing, and can be stopped part of the way", async ({ page }) => {
      const errors = watchForErrors(page);
      await removeAdded(page.request, id);
      await page.goto(`/library/read/${id}/`);
      await page.getByRole("combobox", { name: "Search the documents in Field library" }).fill("water");
      await page.getByRole("button", { name: "Add these 2 to library" }).click();
      await page
        .getByRole("dialog", { name: "Add these 2 documents to your library?" })
        .getByRole("button", { name: "Add 2 documents" })
        .click();
      await expect(listStatus(page).filter({ hasText: "Added 2 documents to your library" })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /^In your library: / })).toHaveCount(2);

      // The rest, slowly, and stopped before the end.
      await archiveAs("?delay=900");
      await page.getByRole("combobox", { name: "Search the documents in Field library" }).fill("");
      await page.getByRole("button", { name: "Add the other 6 to library" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Add 6 documents" }).click();
      const going = page.getByRole("region", { name: "Adding to your library" });
      await expect(going).toContainText(/[1-4] of 6/, { timeout: 20_000 });
      await going.getByRole("button", { name: "Stop" }).click();
      const stopped = listStatus(page).filter({ hasText: "Stopped after" });
      await expect(stopped).toContainText(/Stopped after [1-5] of 6 documents/, { timeout: 15_000 });
      await expect(stopped).toContainText(/[1-5] documents? (was|were) not reached\./);
      // What was added stays, and what is left is offered again.
      await expect(page.getByRole("button", { name: /^Add the other (one|[2-5]) to library$/ })).toBeVisible();
      const { documents } = await api(page, "GET", "/api/documents?limit=200");
      const added = documents.filter((document: { source: string | null }) => document.source?.startsWith("Field library: ")).length;
      expect(added).toBeGreaterThanOrEqual(3);
      expect(added).toBeLessThan(8);
      expect(errors).toEqual([]);
    });

    test("adds the files an ordinary page links to by the same job", async ({ page }) => {
      const errors = watchForErrors(page);
      await removeAdded(page.request, id);
      await page.goto(`/library/read/${id}/guide`);
      await expect(page.frameLocator("iframe").getByRole("heading", { name: "Where to start" })).toBeVisible();
      await expect(page.getByText("This page links to 3 files.")).toBeVisible();
      await page.getByRole("button", { name: "Add them to your library" }).click();
      const dialog = page.getByRole("dialog", { name: "Files this page links to" });
      await expect(dialog).toContainText("adding one copies it out into your library, and nothing is downloaded from the internet");
      await expect(dialog).toContainText(/3 files are copied onto “Internal storage”: [\d.]+ kB, of [\d.]+ [GT]B free\./);
      await expect(dialog.getByRole("listitem").filter({ hasText: "Splinting a forearm" })).toContainText(/In this collection, \d+ bytes/);
      // One of the three is left out.
      await dialog.getByRole("checkbox", { name: "Storing grain for a year" }).uncheck();
      await dialog.getByRole("button", { name: "Add 2 files" }).click();
      await expect(dialog.getByRole("status").filter({ hasText: "Added 2 files to your library" })).toBeVisible({ timeout: 20_000 });
      await expect(dialog.getByRole("link", { name: "In your library" })).toHaveCount(2);
      await dialog.getByRole("button", { name: "Keep reading" }).click();
      await expect(page.getByText("This page links to 3 files; 2 already in your library.")).toBeVisible();
      const { documents } = await api(page, "GET", "/api/documents?limit=200");
      expect(
        documents
          .filter((document: { source: string | null }) => document.source?.startsWith("Field library: "))
          .map((document: { title: string }) => document.title)
          .sort(),
      ).toEqual(["Finding north without a compass", "Splinting a forearm"]);
      expect(errors).toEqual([]);
    });

    test.describe("on a phone", () => {
      test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

      test("the words, the dialog and the progress fit the screen and can be pressed", async ({ page }) => {
        const errors = watchForErrors(page);
        await removeAdded(page.request, id);
        const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        await page.goto(`/library/read/${id}/`);
        const words = page.getByText(/copies a document out of this collection into your library/);
        await expect(words).toContainText(/so adding all 8 uses [\d.]+ kB more/);
        const text = (await words.boundingBox())!;
        expect(text.x).toBeGreaterThanOrEqual(0);
        expect(text.x + text.width).toBeLessThanOrEqual(390);
        expect(await fits()).toBe(true);

        const all = page.getByRole("button", { name: "Add all 8 to library" });
        expect((await all.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await all.tap();
        const dialog = page.getByRole("dialog", { name: "Add 8 documents to your library?" });
        await expect(dialog).toContainText("Nothing is downloaded from the internet.");
        // On a phone the dialog is a sheet that rises from the foot of the screen; it is measured once it has risen.
        await expect
          .poll(async () => {
            const box = (await dialog.boundingBox())!;
            return box.y + box.height;
          })
          .toBeLessThanOrEqual(780);
        const frame = (await dialog.boundingBox())!;
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(390);
        for (const name of ["Cancel", "Add 8 documents"]) {
          // The dialog grows to its size as it opens; measured once it has.
          await expect
            .poll(async () => (await dialog.getByRole("button", { name }).boundingBox())!.height, name)
            .toBeGreaterThanOrEqual(44);
        }
        await archiveAs("?delay=600");
        await dialog.getByRole("button", { name: "Add 8 documents" }).tap();
        const going = page.getByRole("region", { name: "Adding to your library" });
        await expect(going).toContainText(/[1-6] of 8/, { timeout: 20_000 });
        expect((await going.getByRole("button", { name: "Stop" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
        expect(
          (await page
            .getByRole("link", { name: /^In your library: / })
            .first()
            .boundingBox())!.height,
        ).toBeGreaterThanOrEqual(44);
        expect(await fits()).toBe(true);
        await archiveAs();
        await expect(listStatus(page).filter({ hasText: "Added 8 documents to your library" })).toBeVisible({ timeout: 30_000 });
        expect(await fits()).toBe(true);
        expect(errors).toEqual([]);
      });
    });
  });
});
