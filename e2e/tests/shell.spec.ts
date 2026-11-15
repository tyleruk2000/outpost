import path from "node:path";
import { expect, test, watchForErrors } from "./fixtures";

test.describe("the shell", () => {
  test("opens on Home with every asset served locally and a strict content policy", async ({ page }) => {
    const errors = watchForErrors(page);
    const response = await page.goto("/");
    const policy = response!.headers()["content-security-policy"];
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain("http");
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Knowledge" })).toBeVisible();
    await expect(page.getByText("Ready offline")).toBeVisible();
    // The interface fonts are bundled, not fetched from a font service.
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family.replace(/"/g, ""));
    });
    expect(fonts.join(",")).toContain("Atkinson Hyperlegible Next");
    expect(errors).toEqual([]);
  });

  test("navigates by sidebar, by keyboard shortcut and by the command palette", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("heading", { name: "Storage", level: 1 })).toBeVisible();

    await page.keyboard.press("g");
    await page.keyboard.press("h");
    await expect(page).toHaveURL(/\/$/);

    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Search and go to" });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("sett");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  });

  test("remembers the theme and the collapsed sidebar", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await page.getByRole("radio", { name: "System" }).click();
  });

  test("answers unknown addresses with a page, and unknown API routes with JSON", async ({ page }) => {
    await page.goto("/no/such/place");
    await expect(page.getByRole("heading", { name: "There is nothing at this address" })).toBeVisible();
    const response = await page.request.get("/api/no-such-route");
    expect(response.status()).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });
});

test.describe("request safety", () => {
  test("refuses requests that claim another host or come from another site", async ({ page }) => {
    const rebinding = await page.request.get("/api/health", { headers: { Host: "attacker.example" } });
    expect(rebinding.status()).toBe(403);
    const forged = await page.request.patch("/api/settings", {
      data: { "downloads.concurrency": 3 },
      headers: { Origin: "https://evil.example", "X-Outpost-Request": "1" },
    });
    expect(forged.status()).toBe(403);
    const missingHeader = await page.request.patch("/api/settings", { data: { "downloads.concurrency": 3 } });
    expect(missingHeader.status()).toBe(403);
  });
});

test.describe("storage", () => {
  test("shows the internal location and adds an external one from the folder browser", async ({ page }) => {
    await page.goto("/storage");
    await expect(page.getByRole("heading", { name: "Internal storage" })).toBeVisible();
    await expect(page.getByText("Connected").first()).toBeVisible();

    await page.getByRole("button", { name: "Add location" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a storage location" });
    await dialog.getByRole("list", { name: "Folders" }).getByRole("button").first().click();
    await dialog.getByRole("button", { name: "New folder" }).click();
    await dialog.getByLabel("Name of the new folder").fill("field-ssd");
    await dialog.getByLabel("Name", { exact: true }).fill("Field SSD");
    await dialog.getByRole("button", { name: "Add location" }).click();
    await expect(page.getByRole("heading", { name: "Field SSD" })).toBeVisible();

    // Nothing outside the storage roots can be reached through the browser.
    const outside = await page.request.get(`/api/storage/browse?path=${encodeURIComponent(path.resolve("/etc"))}`);
    expect(outside.status()).toBe(403);
  });
});
