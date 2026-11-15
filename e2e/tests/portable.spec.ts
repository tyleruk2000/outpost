import fs from "node:fs";
import path from "node:path";
import { api, expect, test } from "./fixtures";

test("writes a portable drive from the Storage screen", async ({ page }) => {
  // The packaged app is what gets copied; when the server runs from source there is none.
  const status = await api(page, "GET", "/api/portable/status");
  test.skip(!status.packagedAppAvailable, "needs the packaged app (dist/app)");

  await page.goto("/storage");
  await page.getByRole("button", { name: "Make a portable drive" }).click();
  const dialog = page.getByRole("dialog", { name: "Make a portable drive" });

  // Step 1: a new folder inside the first storage root.
  await dialog.getByRole("list", { name: "Folders" }).getByRole("button").first().click();
  await dialog.getByRole("button", { name: "New folder" }).click();
  await dialog.getByLabel("Name of the new folder").fill("Trip drive");
  const target = (await dialog
    .getByText(/Outpost will use/)
    .locator("span")
    .textContent())!;
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Step 2: this computer is preselected; add Windows.
  await expect(dialog.getByText("Computers it should start on")).toBeVisible();
  await dialog.getByLabel("Windows (64-bit PC)").check();
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Step 3: the plan is honest about size and space, then the drive is written.
  await expect(dialog.getByText("Still to write")).toBeVisible();
  await expect(dialog.getByText("Free on the drive")).toBeVisible();
  await dialog.getByRole("button", { name: "Write drive" }).click();
  await expect(dialog.getByText("The drive is ready")).toBeVisible({ timeout: 60_000 });

  for (const file of [
    "Start Outpost.command",
    "Start Outpost.bat",
    "start-outpost.sh",
    "README.txt",
    "outpost-portable.json",
    "app/server/outpost.mjs",
    "app/web/index.html",
    "data/outpost.db",
    "library/.outpost-location.json",
    "runtime/win-x64/node.exe",
  ]) {
    expect(fs.existsSync(path.join(target, file)), file).toBe(true);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(target, "outpost-portable.json"), "utf8"));
  expect(manifest.format).toBe("outpost-portable");
  expect(manifest.platforms).toContain("win-x64");

  // Pointing at the same folder again is recognised as an update that needs consent.
  await dialog.getByRole("button", { name: "Done" }).click();
  const again = await page.request.post("/api/portable/build", {
    headers: { "X-Outpost-Request": "1", "Content-Type": "application/json" },
    data: JSON.stringify({ targetPath: target, platforms: ["win-x64"], collectionIds: [], documents: "none" }),
  });
  expect(again.status()).toBe(409);
});
