/**
 * The barcode scanner at an address browsers do not treat as secure, as the owner's
 * iPhone reaches Outpost (http://192.168.x.x:8080). There the live camera is missing:
 * the screen must say so and what to do, and typing the number (or a scanner that types
 * like a keyboard) must still work. A made-up name is pointed at the test server inside
 * Chromium, as the "not-secure" projects in playwright.config.ts do.
 */
import { failing, NOT_SECURE_HOST } from "./every-screen";
import { expect, test, watchForErrors } from "./fixtures";

const port = Number(process.env.OUTPOST_E2E_PORT ?? 8471);
test.use({
  baseURL: `http://${NOT_SECURE_HOST}:${port}`,
  launchOptions: { args: [`--host-resolver-rules=MAP ${NOT_SECURE_HOST} 127.0.0.1`] },
  viewport: { width: 390, height: 844 },
});

test("the scanner at a plain http address says the camera is not available, and a typed barcode starts a new item", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/prepare/supplies");
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await page.getByRole("button", { name: "Scan" }).tap();
  const scanner = page.getByRole("dialog", { name: "Scan a barcode" });
  await expect(scanner.getByText("The camera is not available at this address")).toBeVisible();
  await expect(scanner.getByText(`This page was opened over plain HTTP (${NOT_SECURE_HOST}:${port})`, { exact: false })).toBeVisible();
  await expect(scanner.getByRole("link", { name: "Settings → HTTPS on your network" })).toBeVisible();
  await expect(scanner.getByRole("button", { name: "Use the camera" })).toHaveCount(0);
  // A photo needs no secure page: it is offered.
  await expect(scanner.getByText("Take or choose a photo of it")).toBeVisible();

  // A keyboard-like scanner types the digits and presses Enter.
  await scanner.getByLabel("Barcode number", { exact: true }).pressSequentially("96385074\n");
  await expect(scanner.getByText("Not in your supplies yet")).toBeVisible();
  await scanner.getByRole("button", { name: "New item with this barcode" }).tap();
  const form = page.getByRole("dialog", { name: "Add to supplies" });
  await form.getByLabel("Name").fill("Tealights");
  await form.getByRole("button", { name: "Add", exact: true }).tap();
  await expect(form).toBeHidden();

  // Known from then on, with nothing looked up anywhere else (the suite fails on any request off this server).
  // Asked from the page: the test's own HTTP client cannot resolve the made-up name.
  const items = await page.evaluate(async () => {
    const response = await fetch("/api/supplies/barcodes/96385074");
    return ((await response.json()) as { items: Array<{ id: string; name: string }> }).items;
  });
  expect(items.map((item) => item.name)).toEqual(["Tealights"]);
  await page.evaluate(
    async (ids) => {
      for (const id of ids) await fetch(`/api/supplies/items/${id}`, { method: "DELETE", headers: { "X-Outpost-Request": "1" } });
    },
    items.map((item) => item.id),
  );
  expect(failing(errors)).toEqual([]);
});
