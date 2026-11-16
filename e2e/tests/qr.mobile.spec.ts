/**
 * QR codes on a phone: a Wi-Fi code is made from a drop-down choice and two fields, and
 * nothing leaves the page while it is made. The network and password are made up.
 */
import type { Request } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

const NETWORK = "Bothy; upstairs";
const PASSWORD = "e2e:not-a-real-password";

test.describe("QR codes on a phone", () => {
  test("a Wi-Fi code is made on the device: no request leaves the page, and it fits a 390 px screen", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/qr");
    await expect(page.getByRole("heading", { level: 1, name: "QR codes" })).toBeVisible();
    // Let the shell finish what it asks for as it opens, then listen to everything the page sends.
    await page.waitForTimeout(1500);
    const sent: Request[] = [];
    page.on("request", (request) => sent.push(request));

    await page.getByRole("combobox", { name: "What the code holds" }).tap();
    await page.getByRole("option", { name: "Wi-Fi network" }).tap();
    await page.getByLabel("Network name").fill(NETWORK);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    const code = page.getByRole("img", { name: `QR code: Wi-Fi: ${NETWORK}` });
    await expect(code).toBeVisible();
    await expect(page.getByText("in the code, not written here")).toBeVisible();
    // The sheet as a PDF is made on the device too: its buttons come alive without asking the server.
    await expect(page.getByRole("button", { name: "Add to library" })).toBeEnabled();
    await page.waitForTimeout(500);

    // The one kind of request allowed is the browser fetching the app's own files (a typeface first used by the
    // password field): a GET of /assets/ with no query. Nothing typed can be in it.
    const own = (request: Request) => {
      const url = new URL(request.url());
      return request.method() === "GET" && url.pathname.startsWith("/assets/") && url.search === "";
    };
    const described = sent.filter((request) => !own(request)).map((request) => `${request.method()} ${request.url()}`);
    expect(described, "requests made while the Wi-Fi code was made").toEqual([]);
    for (const request of sent) {
      expect(request.url()).not.toContain(encodeURIComponent(PASSWORD));
      expect(request.postData() ?? "").not.toContain(PASSWORD);
    }
    expect(page.url()).not.toContain("password");
    const kept = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(kept).not.toContain(PASSWORD);
    expect(kept).not.toContain("Bothy");

    const box = (await code.boundingBox())!;
    expect(box.width).toBeGreaterThan(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Save as PNG", "Save as SVG", "Copy text", "Add to library"]) {
      const button = (await page.getByRole("button", { name }).boundingBox())!;
      expect(button.height, name).toBeGreaterThanOrEqual(44);
    }

    // Adding it to the library asks first, and saying no sends nothing.
    await page.getByRole("button", { name: "Add to library" }).tap();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Put a Wi-Fi password in the library?");
    await dialog.getByRole("button", { name: "Cancel" }).tap();
    expect(sent.filter((request) => !own(request)).map((request) => `${request.method()} ${request.url()}`)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
