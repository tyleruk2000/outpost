import { api, expect, test, watchForErrors } from "./fixtures";

test.describe("downloading from the catalogue", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async ({ request }) => {
    await request.patch("/api/settings", { headers: { "X-Outpost-Request": "1" }, data: { "downloads.rateLimitKbps": 0 } });
  });

  test("follows a download from Explore through the plan and its details to a checked file", async ({ page }) => {
    const errors = watchForErrors(page);
    // 300 kB at 30 kB/s is ten seconds: long enough to watch, short enough to wait for.
    await api(page, "PATCH", "/api/settings", { "downloads.rateLimitKbps": 30 });

    await page.goto("/explore");
    await page.getByPlaceholder(/Filter by name/).fill("Field manual for testing");
    const card = page
      .getByRole("article")
      .filter({ hasText: "Field manual for testing" })
      .or(
        page
          .locator("li, div")
          .filter({ has: page.getByRole("heading", { name: "Field manual for testing" }) })
          .last(),
      );
    await expect(page.getByRole("heading", { name: "Field manual for testing" })).toBeVisible();
    await expect(page.getByText(/300\skB/).first()).toBeVisible();
    await card.getByRole("button", { name: "Download" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Download/ }).click();

    // The plan says what is left, how fast, and when.
    await page.goto("/downloads");
    await expect(page.getByRole("heading", { name: "Downloads", level: 1 })).toBeVisible();
    // Figures are kept on one line with their units, so the spaces between them do not break.
    await expect(page.getByText(/1\sdownload,\s.*\sto go/)).toBeVisible();
    await expect(page.getByText(/limited to\s30\skB\/s/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Field manual for testing" })).toBeVisible();

    // Its details: where it comes from, the checksum it will be held to, what has happened.
    await page.getByRole("link", { name: "Details" }).first().click();
    await expect(page).toHaveURL(/\/downloads\/[0-9a-z]+$/);
    await expect(page.getByRole("heading", { name: "Field manual for testing", level: 1 })).toBeVisible();
    await expect(page.getByText("127.0.0.1").first()).toBeVisible();
    await expect(page.getByText("Published SHA-256")).toBeVisible();
    await expect(page.getByText("Added to the queue")).toBeVisible();
    await expect(page.getByText("Started", { exact: true })).toBeVisible();

    // It finishes, and the file that arrived is the one that was promised.
    await expect(page.getByText("Will be checked")).toBeVisible();
    await expect(page.getByText("The file received matches the checksum published by the source.")).toBeVisible({ timeout: 25_000 });
    const { downloads } = await api(page, "GET", "/api/downloads");
    const mine = downloads.find((item: { title: string }) => item.title === "Field manual for testing");
    expect(mine.state).toBe("completed");
    const detail = await api(page, "GET", `/api/downloads/${mine.id}`);
    expect(detail.integrity.verified).toBe(true);
    // One request did it: no interruption in its history.
    expect(detail.events.map((event: { state: string }) => event.state)).toEqual(["queued", "running", "verifying", "completed"]);
    expect(errors).toEqual([]);
  });

  test("lists the finished download in the history, and Explore shows it as installed", async ({ page }) => {
    await page.goto("/downloads");
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByText("Field manual for testing").first()).toBeVisible();
    await page.goto("/explore");
    await page.getByPlaceholder(/Filter by name/).fill("Field manual for testing");
    await expect(page.getByText(/Installed/).first()).toBeVisible();
  });
});
