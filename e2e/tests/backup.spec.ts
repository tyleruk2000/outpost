import { api, expect, test, watchForErrors } from "./fixtures";

test.describe("automatic backups", () => {
  // Whatever happens here, the server the other tests share is left as it was found:
  // nothing staged for restore, no stored backups, automatic backups off.
  test.afterAll(async ({ request }) => {
    const headers = { "X-Outpost-Request": "1", "Content-Type": "application/json" };
    await request.delete("/api/backup/restore", { headers });
    const { backups } = await (await request.get("/api/backup/stored")).json();
    for (const backup of backups) await request.delete(`/api/backup/stored/${backup.name}`, { headers });
    await request.patch("/api/backup/schedule", { headers, data: JSON.stringify({ locationId: null }) });
  });

  test("chooses where, backs up now, sees it verified, stages a restore from the list, and deletes it after asking", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/settings");
    const section = page.getByRole("region", { name: "Automatic backups" });
    const where = section.getByRole("combobox", { name: "Keep backups on" });
    await expect(where).toHaveText("Off");
    // Said once, where the location is chosen.
    await expect(section.getByText(/not encrypted: anyone who can open that folder can read them/)).toBeVisible();
    await expect(section.getByRole("button", { name: "Back up now" })).toHaveCount(0);

    await where.click();
    await page.getByRole("option", { name: "Internal storage" }).click();
    await expect(section.getByText(/^No backup has been made yet\. Next one /)).toBeVisible();
    await expect(section.getByText(/Every day at 03:00, by the clock of the computer Outpost runs on/)).toBeVisible();
    await expect(section.getByText(/^None yet\./)).toBeVisible();

    await section.getByRole("button", { name: "Back up now" }).click();
    const row = section.getByRole("listitem");
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await expect(row.getByText("Verified")).toBeVisible({ timeout: 30_000 });
    await expect(row.getByText(/Started by hand · .+ · made by Outpost \d/)).toBeVisible();
    await expect(section.getByText(/^Last backup just now\./)).toBeVisible();

    // The file is on the location, in Outpost's own folder, and downloads as a zip.
    const { backups } = await api(page, "GET", "/api/backup/stored");
    expect(backups).toHaveLength(1);
    const download = await page.request.get(`/api/backup/stored/${backups[0].name}/download`);
    expect(download.headers()["content-type"]).toBe("application/zip");
    expect((await download.body()).length).toBe(backups[0].sizeBytes);

    // Restore this one: asked first, then checked and staged for the next start.
    await row.getByRole("button", { name: /^Actions for the backup of/ }).click();
    await page.getByRole("menuitem", { name: "Restore this one" }).click();
    const asking = page.getByRole("alertdialog", { name: "Restore from this backup?" });
    await expect(asking.getByText(/The current data is kept in a dated folder, not deleted\./)).toBeVisible();
    await asking.getByRole("button", { name: "Check and stage restore" }).click();
    const waiting = page.getByRole("region", { name: "Backup", exact: true }).getByText("A restore is waiting for a restart");
    await expect(waiting).toBeVisible();
    expect((await api(page, "GET", "/api/backup/status")).restorePending).toBe(true);
    await page.getByRole("button", { name: "Cancel restore" }).click();
    await expect(waiting).toHaveCount(0);

    // Delete: only after asking, and the dialog names what goes.
    await row.getByRole("button", { name: /^Actions for the backup of/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const deleting = page.getByRole("alertdialog", { name: "Delete this backup?" });
    await expect(deleting.getByText(/will be deleted from Internal storage\. This cannot be undone\./)).toBeVisible();
    await deleting.getByRole("button", { name: "Delete backup" }).click();
    await expect(section.getByText(/^None yet\./)).toBeVisible();

    await where.click();
    await page.getByRole("option", { name: /^Off/ }).click();
    await expect(section.getByRole("button", { name: "Back up now" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
