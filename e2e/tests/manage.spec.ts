import { api, expect, test, watchForErrors } from "./fixtures";

const SHEET = "Emergency, distress and calling frequencies";

test.describe("managing and cleaning up", () => {
  test.describe.configure({ mode: "serial" });

  // Whatever happens here, the sheet must not stay installed: the packs test counts them.
  test.afterAll(async ({ request }) => {
    const { collections } = await (await request.get("/api/collections")).json();
    for (const collection of collections.filter((candidate: { title: string }) => candidate.title === SHEET)) {
      await request.delete(`/api/collections/${collection.id}?deleteFiles=true`, { headers: { "X-Outpost-Request": "1" } });
    }
  });

  test("installs a reference sheet, finds it under Storage, and removes it with its document", async ({ page }) => {
    const errors = watchForErrors(page);
    // A sheet that ships with Outpost: no connection needed, and it is a collection and a document at once.
    const { entries } = await api(page, "GET", "/api/catalog");
    const entry = entries.find((candidate: { name: string }) => candidate.name === SHEET);
    expect(entry, "the bundled sheet is in the catalogue").toBeTruthy();
    const added = await api(page, "POST", `/api/catalog/entries/${entry.id}/add`, {});
    expect(added.documentId).toBeTruthy();

    // The way in from Storage.
    await page.goto("/storage");
    // In the screen itself: the sidebar lists it under Storage too.
    await page.locator("#content").getByRole("link", { name: "Manage and clean up" }).click();
    await expect(page).toHaveURL(/\/storage\/manage$/);
    await expect(page.getByRole("heading", { name: "Manage and clean up", level: 1 })).toBeVisible();
    // What is taking the space, measured from disk once the count has finished.
    await expect(page.getByText(/^Outpost is storing/)).toBeVisible();
    await expect(page.getByText(/^Measured /)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("row", { name: /Catalogue sheets and books/ })).toBeVisible();

    // One list of everything installed: the sheet is there once, not as a collection and again as a document.
    await page.getByRole("tab", { name: "Installed" }).click();
    await page.getByRole("searchbox", { name: "Filter by name" }).fill("distress");
    const list = page.getByRole("list", { name: "Everything installed" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("link", { name: SHEET })).toBeVisible();
    await expect(list.getByText(/Catalogue sheet or book/)).toBeVisible();

    // Select it, and see what the selection adds up to before anything happens.
    await page.getByRole("checkbox", { name: `Select ${SHEET}` }).click();
    await expect(page.getByRole("region", { name: "Selection" }).getByText("1 item selected")).toBeVisible();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Remove 1 item" });
    await expect(dialog.getByText(/1 item will be deleted, files and all/)).toBeVisible();
    await expect(dialog.getByText("1 document in the library is the same file as a catalogue item here, and goes with it.")).toBeVisible();
    await expect(dialog.getByRole("row", { name: /Internal storage/ })).toBeVisible();
    // Still there: nothing happens until it is confirmed.
    expect((await api(page, "GET", `/api/documents/${added.documentId}`)).document.id).toBe(added.documentId);

    await dialog.getByRole("button", { name: "Remove 1 item" }).click();
    await expect(page.getByText(/Remove 1 item: finished/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Deleted 1 item, /)).toBeVisible();
    // "Nothing matches" beside other things installed; "Nothing is installed yet" when this spec runs by itself.
    await expect(page.getByText(/Nothing matches\.|Nothing is installed yet/)).toBeVisible();

    // Both records are gone, and Explore offers the sheet again.
    const gone = await page.request.get(`/api/documents/${added.documentId}`);
    expect(gone.status()).toBe(404);
    const after = await api(page, "GET", "/api/collections");
    expect(after.collections.some((collection: { id: string }) => collection.id === added.collectionId)).toBe(false);
    expect(errors).toEqual([]);
  });

  test("offers erase everything at the computer Outpost runs on, behind a typed phrase", async ({ page }) => {
    await page.goto("/storage/manage?view=clean-up");
    await expect(page.getByRole("heading", { name: "Erase everything and start again" })).toBeVisible();
    await page.getByRole("button", { name: "Erase everything" }).click();
    const dialog = page.getByRole("dialog", { name: "Erase everything and start again" });
    await expect(dialog.getByText("This cannot be undone.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Download a backup" })).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Erase everything" });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("textbox").fill("erase");
    await expect(confirm).toBeDisabled();
    // Not confirmed here: the rest of the suite needs its library.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("does not offer erase everything to a request that came through a proxy, and refuses one that asks anyway", async ({ page }) => {
    // The test server only listens on this computer, so another device cannot be played
    // directly. A request that says it was forwarded is the case Outpost treats the same way.
    await page.route("**/api/manage/**", (route, request) =>
      route.continue({ headers: { ...request.headers(), "x-forwarded-for": "192.168.1.20" } }),
    );
    await page.goto("/storage/manage?view=clean-up");
    await expect(page.getByText("Not offered on this device")).toBeVisible();
    await expect(page.getByText(/can only be started at the computer Outpost runs on/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Erase everything" })).toHaveCount(0);
    // Removing downloaded content is still offered, as removing one item at a time is.
    await expect(page.getByRole("button", { name: "Remove downloaded content" })).toBeEnabled();

    const refused = await page.request.post("/api/manage/cleanup/everything", {
      headers: { "X-Outpost-Request": "1", "X-Forwarded-For": "192.168.1.20", "Content-Type": "application/json" },
      data: JSON.stringify({ confirm: "erase everything" }),
    });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.message).toMatch(/only be started on the computer Outpost runs on/);
    // Nothing was started.
    expect((await api(page, "GET", "/api/manage/cleanup")).active).toBeNull();
  });
});
