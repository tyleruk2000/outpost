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

test.describe("backups protected by a passphrase", () => {
  // Left as it was found: nothing staged, no stored backups, automatic backups off, and no passphrase set.
  test.afterAll(async ({ request }) => {
    const headers = { "X-Outpost-Request": "1", "Content-Type": "application/json" };
    await request.delete("/api/backup/restore", { headers });
    const { backups } = await (await request.get("/api/backup/stored")).json();
    for (const backup of backups) await request.delete(`/api/backup/stored/${backup.name}`, { headers });
    await request.patch("/api/backup/schedule", { headers, data: JSON.stringify({ locationId: null }) });
    await request.delete("/api/backup/protection", { headers });
  });

  test("sets a passphrase, makes a protected backup, restores it only with the passphrase, and stops protecting after asking", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    const passphrase = "seven tall ships at anchor";
    await page.goto("/settings");
    const backup = page.getByRole("region", { name: "Backup", exact: true });
    await expect(backup.getByText(/^Off\. A backup is a zip file that anyone who has it can read\./)).toBeVisible();

    // Before the passphrase is set: one sentence on what losing it means. Then typed twice.
    await backup.getByRole("button", { name: "Set a passphrase" }).click();
    const setting = page.getByRole("dialog", { name: "Set a passphrase for backups" });
    await expect(
      setting.getByText("A protected backup cannot be opened without this passphrase, and Outpost cannot recover it for you."),
    ).toBeVisible();
    await setting.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await expect(setting.getByRole("button", { name: "Protect backups" })).toBeDisabled();
    await setting.getByLabel("Passphrase, again").fill("seven tall ships at anchos");
    await expect(setting.getByText("The two do not match.")).toBeVisible();
    await setting.getByLabel("Passphrase, again").fill(passphrase);
    await setting.getByRole("button", { name: "Protect backups" }).click();
    await expect(setting).toHaveCount(0);
    await expect(backup.getByText(/^On since .+\. Every backup made since then, by hand or on the schedule, is encrypted/)).toBeVisible();
    // The server holds a public key and a wrapped private key, and says nothing of either to the browser.
    expect(await api(page, "GET", "/api/backup/status")).toMatchObject({
      protection: { on: true, right: { allowed: true, reason: "local" } },
    });
    expect(JSON.stringify(await api(page, "GET", "/api/settings"))).not.toContain("protection");

    // A backup made now is protected: the list says so, and the file is not a zip.
    const section = page.getByRole("region", { name: "Automatic backups" });
    await section.getByRole("combobox", { name: "Keep backups on" }).click();
    await page.getByRole("option", { name: "Internal storage" }).click();
    await expect(section.getByText(/Backups are encrypted with your passphrase/)).toBeVisible();
    await section.getByRole("button", { name: "Back up now" }).click();
    const row = section.getByRole("listitem");
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await expect(row.getByText("Verified")).toBeVisible({ timeout: 30_000 });
    await expect(row.getByText("Protected", { exact: true })).toBeVisible();
    const { backups } = await api(page, "GET", "/api/backup/stored");
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ protected: true, currentPassphrase: true, check: "verified" });
    expect(backups[0].name).toMatch(/\.zip\.enc$/);
    const stored = await page.request.get(`/api/backup/stored/${backups[0].name}/download`);
    expect(stored.headers()["content-type"]).toBe("application/vnd.outpost.backup");
    expect((await stored.body()).subarray(0, 8).toString("ascii")).toBe("OPBACKUP");
    const downloaded = await page.request.get("/api/backup/download");
    expect(downloaded.headers()["content-disposition"]).toMatch(/\.zip\.enc"$/);
    expect((await downloaded.body()).subarray(0, 8).toString("ascii")).toBe("OPBACKUP");

    // Restore this one: the passphrase is asked for, a wrong one is said to be wrong, the right one stages it.
    await row.getByRole("button", { name: /^Actions for the backup of/ }).click();
    await page.getByRole("menuitem", { name: "Restore this one" }).click();
    const asking = page.getByRole("alertdialog", { name: "Restore from this backup?" });
    const field = asking.getByLabel("Passphrase of this backup");
    await asking.getByRole("button", { name: "Check and stage restore" }).click();
    await expect(asking.getByText("Type the passphrase this backup was made under.")).toBeVisible();
    await field.fill("seven tall ships at anchos");
    await asking.getByRole("button", { name: "Check and stage restore" }).click();
    await expect(asking.getByText(/^That passphrase does not open this backup\./)).toBeVisible({ timeout: 15_000 });
    expect((await api(page, "GET", "/api/backup/status")).restorePending).toBe(false);
    await field.fill(passphrase);
    await asking.getByRole("button", { name: "Check and stage restore" }).click();
    await expect(backup.getByText("A restore is waiting for a restart")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Cancel restore" }).click();
    await expect(backup.getByText("A restore is waiting for a restart")).toHaveCount(0);

    // Stopping is asked about first, and does not decrypt what was made.
    await backup.getByRole("button", { name: "Stop protecting" }).click();
    const stopping = page.getByRole("alertdialog", { name: "Stop protecting backups?" });
    await expect(stopping.getByText(/they stay encrypted and still need the passphrase they were made under/)).toBeVisible();
    await stopping.getByRole("button", { name: "Stop protecting" }).click();
    await expect(backup.getByText(/^Off\. A backup is a zip file/)).toBeVisible();
    await expect(row.getByText("Protected", { exact: true })).toBeVisible();
    await expect(row.getByText("Opens with the passphrase that was in use when it was made, not the one in use now.")).toBeVisible();

    // The one refusal the browser was sent on purpose is the only thing it complained of.
    expect(errors.filter((error) => !/the server responded with a status of 400/.test(error))).toEqual([]);
  });
});
