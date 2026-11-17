/**
 * At an address browsers do not treat as secure (http://192.168.x.x:8080 from a phone, here
 * a made-up name pointed at the test server: see playwright.config.ts), the browser has no
 * Cache Storage, no service worker, no location, no clipboard API and no SubtleCrypto. Each
 * screen that uses one of them has its main action pressed: each must say what it needs
 * and where to set it up, and nothing may throw. Run only by the "not-secure desktop" project.
 */
import type { Page } from "@playwright/test";
import { failing } from "./every-screen";
import { api, expect, test, watchForErrors } from "./fixtures";

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
/** The test server's own address: the made-up name is known inside the browser only, not to the requests made from here. */
const direct = (path: string) => `http://localhost:${process.env.OUTPOST_E2E_PORT ?? 8471}${path}`;
const NEEDS_HTTPS = /needs Outpost opened at an HTTPS address.+Settings, “HTTPS on your network”/;

test.describe("at an address that is not secure", () => {
  const made: { note?: string; track?: string; marker?: string } = {};

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    const headers = { "X-Outpost-Request": "1" };
    if (made.note) await page.request.delete(direct(`/api/notes/${made.note}`), { headers });
    if (made.track) await page.request.delete(direct(`/api/maps/tracks/${made.track}`), { headers });
    if (made.marker) await page.request.delete(direct(`/api/maps/markers/${made.marker}`), { headers });
    await page.close();
  });

  const toast = (page: Page, text: RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

  test("every action that needs a secure page says so, and where to set one up, and nothing throws", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    made.note = (await api(page, "POST", direct("/api/notes"), { title: "Hill kit", content: doc("Spare laces.") })).note.id;
    made.track = (
      await api(page, "POST", direct("/api/maps/tracks"), {
        name: "Ridge walk",
        points: [
          { lat: 54.5, lon: -3.18 },
          { lat: 54.47, lon: -3.2 },
        ],
      })
    ).track.id;
    made.marker = (await api(page, "POST", direct("/api/maps/markers"), { name: "Sheepfold", lat: 54.48, lon: -3.19 })).marker.id;

    await page.goto("/");
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    expect(await page.evaluate(() => typeof caches)).toBe("undefined");

    // ── Kept on this device: the screen says why nothing can be kept, and where HTTPS is set up.
    await page.goto("/kept");
    await expect(page.getByText(/^Nothing can be kept on this \w+ over plain HTTP/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings → HTTPS on your network" })).toHaveAttribute("href", "/settings#https");

    // ── A page of notes: "Keep" in its menu.
    await page.goto(`/notes/${made.note}`);
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("menuitem", { name: /^Keep on this / }).click();
    await expect(toast(page, NEEDS_HTTPS)).toBeVisible();
    await toast(page, NEEDS_HTTPS).getByRole("button", { name: "Open Settings" }).click();
    await expect(page).toHaveURL(/\/settings#https$/);

    // ── A route, saved places, and an area of the map.
    await page.goto(`/maps?track=${made.track}`);
    await page.getByRole("button", { name: /^Keep on this / }).click();
    await expect(toast(page, NEEDS_HTTPS)).toBeVisible();
    await page.getByRole("tab", { name: /Places/ }).click();
    await page.getByRole("button", { name: /^Keep on this / }).click();
    await expect(toast(page, NEEDS_HTTPS).nth(1)).toBeVisible();
    await page.getByRole("tab", { name: "Offline maps" }).click();
    await expect(page.getByText(/^Keeping a map area on this \w+ needs Outpost opened at an HTTPS address/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings, HTTPS on your network" })).toHaveAttribute("href", "/settings#https");

    // ── Where I am, on the map, and recording a track: both need the device's location.
    await page.getByRole("button", { name: "Show where I am" }).first().click();
    await expect(page.getByText(/Turn on Settings → HTTPS on your network, then open Outpost at its https address/).first()).toBeVisible();
    await page.getByRole("button", { name: "Record a track" }).first().click();
    const record = page.getByRole("region", { name: "Record a track" });
    await expect(record.getByText(/This page was opened over plain HTTP, so it cannot record/)).toBeVisible();
    await expect(record.getByRole("link", { name: "Settings → HTTPS on your network" })).toBeVisible();

    // ── Encryption: keys, text and files need SubtleCrypto; the screen says so and offers what works.
    await page.goto("/encryption?tab=keys");
    await expect(page.getByText("Keys, text, files and encrypted pages need HTTPS")).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings, HTTPS on your network" })).toBeVisible();

    // ── Messages: a check-in can carry a position only on a secure page; the board says so, and the rest works.
    await page.goto("/messages");
    await page.evaluate(() => localStorage.setItem("outpost.board.name", "Sam"));
    await page.reload();
    await page.getByRole("button", { name: "Words of my own…" }).click();
    const checkIn = page.getByRole("dialog", { name: "Check in" });
    await expect(checkIn.getByText(/opened over plain http, so the browser does not offer it/)).toBeVisible();
    await expect(checkIn.getByRole("link", { name: "Settings, HTTPS on your network" })).toHaveAttribute("href", "/settings#https");
    await page.keyboard.press("Escape");

    expect(failing(errors)).toEqual([]);
  });

  test("the Morse trainer says a wired key needs a secure page, and keys and sounds without one", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/morse?tab=send");
    await page.getByRole("button", { name: "Use a real key or paddle" }).click();
    const panel = page.locator("#real-key-panel");
    await expect(panel.getByText(/needs Web Serial, which browsers offer only on a secure page/)).toBeVisible();
    await expect(panel.getByRole("link", { name: "Settings → HTTPS on your network" }).first()).toHaveAttribute("href", "/settings#https");
    await expect(panel.getByRole("button", { name: "Connect a wired key" })).toHaveCount(0);
    // The on-screen paddles need nothing secure.
    const paddles = page.getByTestId("morse-paddles");
    await paddles.scrollIntoViewIfNeeded();
    const box = (await paddles.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.up();
    await expect(page.getByRole("log", { name: "Decoded Morse" })).toContainText("E", { timeout: 5000 });
    expect(failing(errors)).toEqual([]);
  });
});
