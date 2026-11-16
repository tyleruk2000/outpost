import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { api, expect, test, watchForErrors } from "./fixtures";

const para = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

/** Every file on the drive with its checksum, to show that bringing changes back writes nothing to it. */
function fingerprint(root: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    found[path.relative(root, file)] = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  }
  return found;
}

test("brings a portable drive's changes back from the Storage screen", async ({ page }) => {
  const status = await api(page, "GET", "/api/portable/status");
  test.skip(!status.packagedAppAvailable, "needs the packaged app (dist/app)");
  const errors = watchForErrors(page);

  // Home: two pages, then a drive written from it. The runtime comes from the suite's own stand-in, not the internet.
  const kit = (await api(page, "POST", "/api/notes", { title: "Kit list for the merge", content: para("Stove, fuel, matches.") })).note;
  const untouched = (await api(page, "POST", "/api/notes", { title: "Left alone by the merge", content: para("Nothing happens to this.") }))
    .note;
  const root = (await api(page, "GET", "/api/storage/browse")).entries[0].path as string;
  const drive = path.join(root, "Homecoming drive");
  const build = await api(page, "POST", "/api/portable/build", {
    targetPath: drive,
    platforms: ["win-x64"],
    collectionIds: [],
    documents: "none",
  });
  await expect.poll(async () => (await api(page, "GET", `/api/jobs/${build.job.id}`)).job.state, { timeout: 60_000 }).toBe("succeeded");

  // Away: a page is edited and a page is written on the drive. (The drive's own Outpost is stood in for by
  // writing to its database, since the suite's stand-in runtime cannot run; the server tests run it for real.)
  const away = new DatabaseSync(path.join(drive, "data", "outpost.db"));
  const now = Date.now() + 1000;
  away
    .prepare("UPDATE notes SET content = ?, content_text = ?, updated_at = ? WHERE id = ?")
    .run(
      JSON.stringify(para("Stove, fuel, matches, and a spare gas canister.")),
      "Stove, fuel, matches, and a spare gas canister.",
      now,
      kit.id,
    );
  away
    .prepare("INSERT INTO notes (id, title, content, content_text, position, created_at, updated_at) VALUES (?, ?, ?, ?, 99, ?, ?)")
    .run(
      "01e2emergedrivepage0000000",
      "Written while away",
      JSON.stringify(para("At anchor, the second night.")),
      "At anchor, the second night.",
      now,
      now,
    );
  away.close();
  const before = fingerprint(drive);

  // Storage → Bring back changes from a drive → the drive's folder.
  await page.goto("/storage");
  await page.getByRole("link", { name: "Bring back changes from a drive" }).click();
  await expect(page.getByRole("heading", { name: "Which drive?" })).toBeVisible();
  const folders = page.getByRole("list", { name: "Folders" });
  await folders.getByRole("button").first().click();
  // A folder that is not a drive says so, and offers nothing to press.
  await expect(page.getByText(/This folder is not an Outpost drive/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Look for changes" })).toBeDisabled();
  await folders.getByRole("button", { name: "Homecoming drive" }).click();
  await expect(page.getByText("This is an Outpost drive")).toBeVisible();
  await page.getByRole("button", { name: "Look for changes" }).click();

  // The preview: what changed, in groups, with nothing done yet.
  await expect(page.getByRole("heading", { name: /What changed on .*Homecoming drive/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "New on the drive 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Changed on the drive 1" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Written while away" })).toBeChecked();
  expect((await api(page, "GET", `/api/notes/${kit.id}`)).note.content).toEqual(para("Stove, fuel, matches."));

  // Both versions of the edited page can be read before deciding.
  await page.getByRole("list", { name: "Changed on the drive" }).getByRole("button", { name: "Compare the two versions" }).click();
  await expect(
    page.getByRole("region", { name: "On the drive" }).getByText("Stove, fuel, matches, and a spare gas canister."),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "At home" }).getByText("Stove, fuel, matches.")).toBeVisible();

  await page.getByRole("button", { name: "Bring back 2 changes" }).click();
  await expect(page.getByText(/Brought back from .*Homecoming drive/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("1 added, 1 updated. Nothing on the drive was changed.")).toBeVisible();

  // Home has both changes; the page nobody touched is as it was; the drive is byte for byte what it was.
  expect((await api(page, "GET", `/api/notes/${kit.id}`)).note.content).toEqual(para("Stove, fuel, matches, and a spare gas canister."));
  expect((await api(page, "GET", `/api/notes/${untouched.id}`)).note.updatedAt).toBe(untouched.updatedAt);
  // The sidebar's page tree shows it already; the record links to it too.
  await expect(page.getByRole("tree", { name: "Pages" }).getByRole("link", { name: "Written while away" })).toBeVisible();
  await page.locator("#content").getByRole("link", { name: "Written while away" }).click();
  await expect(page.getByText("At anchor, the second night.")).toBeVisible();
  expect(fingerprint(drive)).toEqual(before);

  // The record is kept, and from it the drive can be updated (not done for you) or the merge undone.
  await page.goto("/storage/merge");
  await page.getByRole("link", { name: /Homecoming drive/ }).click();
  await expect(page.getByRole("button", { name: "Undo this merge" })).toBeVisible();
  await page.getByRole("link", { name: "Update this drive" }).click();
  const wizard = page.getByRole("dialog", { name: "Make a portable drive" });
  await expect(wizard.getByText(/Outpost will use/)).toContainText("Homecoming drive");
  await wizard.getByRole("button", { name: "Cancel" }).click();

  // Looking again finds nothing new.
  await page.goto("/storage/merge");
  await page.getByRole("list", { name: "Folders" }).getByRole("button").first().click();
  await page.getByRole("list", { name: "Folders" }).getByRole("button", { name: "Homecoming drive" }).click();
  await page.getByRole("button", { name: "Look for changes" }).click();
  await expect(page.getByRole("heading", { name: "Nothing to bring back" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Which drive?" })).toBeVisible();
  expect(fingerprint(drive)).toEqual(before);
  expect(errors).toEqual([]);
});
