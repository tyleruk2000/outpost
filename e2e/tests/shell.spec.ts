import path from "node:path";
import { api, expect, test, watchForErrors } from "./fixtures";

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

  test("shows the focus on quick search's field as a ring, not only the caret", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Search and go to" });
    const field = palette.getByRole("combobox");
    // The row round the field draws the ring: the field's own outline is off.
    const row = field.locator("xpath=..");
    const ring = () => row.evaluate((element) => getComputedStyle(element).boxShadow);
    const focus = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--focus)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });

    // With a fine pointer the field is the only stop in the dialog, so Tab keeps the keyboard on it.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(field).toBeFocused();
    expect(await field.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
    await expect.poll(ring).toContain("inset");
    expect(await ring()).toContain(`${focus} 0px 0px 0px 2px`);
  });

  test("goes from quick search to a place inside a screen: a section of Settings, the map's Layers tab", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const open = async (words: string) => {
      await page.getByRole("button", { name: "Quick search" }).click();
      const palette = page.getByRole("dialog", { name: "Search and go to" });
      await palette.getByRole("combobox").fill(words);
      await expect(palette.getByRole("option").first()).toBeVisible();
      await page.keyboard.press("Enter");
    };
    await open("mesh");
    await expect(page).toHaveURL(/\/settings#mesh$/);
    await expect(page.getByRole("heading", { name: "Mesh radio", level: 2 })).toBeInViewport();
    await open("text size");
    await expect(page).toHaveURL(/\/settings#text-size$/);
    await open("supermarket");
    await expect(page).toHaveURL(/\/maps\?tab=layers$/);
    await expect(page.getByRole("tab", { name: "Layers" })).toHaveAttribute("aria-selected", "true");
    // A tool of the map, not only its tab: Directions opens in Routes, and the page to print is taken up.
    await open("directions");
    await expect(page).toHaveURL(/\/maps\?tab=routes&road=1$/);
    await expect(page.getByRole("tab", { name: "Routes" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Directions", exact: true })).toBeVisible();
    await open("print");
    await expect(page).toHaveURL(/\/maps\?print=1$/);
    await expect(page.getByRole("heading", { name: "Print or save as PDF" })).toBeVisible({ timeout: 20_000 });
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

  test("sends the app's files compressed, fingerprinted ones cached for good, and the page itself never cached", async ({ page }) => {
    const response = await page.goto("/");
    expect(response!.headers()["cache-control"]).toBe("no-cache");
    const entry = /\/assets\/index-[\w-]+\.js/.exec(await response!.text())![0];
    const script = await page.request.get(entry, { headers: { "accept-encoding": "gzip" } });
    expect(script.headers()["content-encoding"]).toBe("gzip");
    expect(script.headers()["cache-control"]).toContain("immutable");
    const worker = await page.request.get("/sw.js", { headers: { "accept-encoding": "gzip" } });
    expect(worker.headers()["cache-control"]).toBe("no-cache");
  });

  test("answers unknown addresses with a page, and unknown API routes with JSON", async ({ page }) => {
    await page.goto("/no/such/place");
    await expect(page.getByRole("heading", { name: "There is nothing at this address" })).toBeVisible();
    await page.getByRole("link", { name: "Go to Home" }).click();
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
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

  test("offers to connect a network share, and is honest about what it can do here", async ({ page }) => {
    await page.goto("/storage");
    await expect(page.getByRole("heading", { name: "Network shares" })).toBeVisible();
    const { mode } = await api<{ mode: string }>(page, "GET", "/api/storage/shares");
    test.skip(mode === "unsupported", "this platform has nothing to offer for shares");

    await page.getByRole("button", { name: "Connect a network share" }).click();
    const dialog = page.getByRole("dialog", { name: "Connect a network share" });

    if (mode === "macos") {
      // A Mac run directly connects the share itself, in steps: the server, a sign-in,
      // then the shared folders the server offers. Only servers on the home network are
      // ever asked: 8.8.8.8 is refused before anything is contacted, so this needs no network.
      await expect(dialog.getByText("Step 1 of 4")).toBeVisible();
      await dialog.getByLabel(/type its name or address|^Server$/).fill("8.8.8.8");
      await dialog.getByRole("button", { name: "Continue" }).click();
      await expect(dialog.getByText("Step 2 of 4")).toBeVisible();
      await dialog.getByLabel("User name").fill("walker");
      await dialog.getByLabel("Password", { exact: true }).fill("not a real password");
      await dialog.getByRole("button", { name: "Show shared folders" }).click();
      await expect(dialog.getByRole("alert")).toContainText("only connects to file servers on your own network");
      // Nothing was remembered, and the password is not echoed anywhere on the page.
      expect((await api<{ shares: unknown[] }>(page, "GET", "/api/storage/shares")).shares).toEqual([]);
      await expect(page.getByText("not a real password")).toHaveCount(0);
      // The way back keeps the server and asks for the password again.
      await dialog.getByRole("button", { name: "Back" }).click();
      await expect(dialog.getByLabel(/type its name or address|^Server$/)).toHaveValue("8.8.8.8");
    } else {
      // In a container or on Linux it cannot, says so, and writes out what to do instead.
      await expect(dialog.getByText("Outpost cannot connect this share for you here")).toBeVisible();
      await expect(dialog.getByLabel("Password")).toHaveCount(0);
      await dialog.getByLabel("Server").fill("192.168.1.20");
      await dialog.getByLabel("Share", { exact: true }).fill("media");
      await dialog.getByLabel("User name").fill("walker");
      await expect(dialog.getByRole("heading", { name: "What to do" })).toBeVisible();
      await expect(dialog.getByText(mode === "docker" ? "type: cifs" : "//192.168.1.20/media", { exact: false }).first()).toBeVisible();
      await expect(dialog.getByRole("button", { name: /Copy the text/ }).first()).toBeVisible();
    }
  });
});
