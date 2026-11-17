/**
 * An audiobook on a phone: a small book is added as a zip, played from the server a
 * range at a time, left, and resumed where it was left.
 *
 * The book is three chapters of WAV silence written by the test
 * (apps/server/test/fixtures/audio/builders.ts), which every browser plays, zipped
 * without compression as LibriVox's zips are.
 */

import zlib from "node:zlib";
import { wav } from "../../apps/server/test/fixtures/audio/builders.ts";
import { expect, test, watchForErrors } from "./fixtures";

/** A zip whose entries are stored, not compressed, as LibriVox's are. */
function storedZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, content } of entries) {
    const fileName = Buffer.from(name, "utf8");
    const crc = zlib.crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    locals.push(local, fileName, content);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(content.length, 20);
    header.writeUInt32LE(content.length, 24);
    header.writeUInt16LE(fileName.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, fileName);
    offset += 30 + fileName.length + content.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const book = () =>
  storedZip([
    { name: "01 Kindling.wav", content: wav(4, { title: "Kindling", artist: "A. Woodsman", album: "Fires for Damp Days", track: 1 }) },
    { name: "02 Tinder.wav", content: wav(6, { title: "Tinder", artist: "A. Woodsman", album: "Fires for Damp Days", track: 2 }) },
    { name: "03 Banking.wav", content: wav(4, { title: "Banking up", artist: "A. Woodsman", album: "Fires for Damp Days", track: 3 }) },
  ]);

const currentTime = (page: import("@playwright/test").Page) =>
  page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime);

test.describe("an audiobook, on a phone", () => {
  test("is added from a zip, plays, and picks up where it was left", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const ranges: number[] = [];
    page.on("response", (response) => {
      if (/\/api\/documents\/[^/]+\/file/.test(response.url())) ranges.push(response.status());
    });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // ── Add it under Library, Type: Audiobooks ──
    await page.goto("/library?type=audio");
    await page.getByRole("button", { name: "Add audiobook" }).first().tap();
    const dialog = page.getByRole("dialog", { name: "Add an audiobook" });
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Choose files" }).tap();
    await (await chooser).setFiles([{ name: "fires_for_damp_days.zip", mimeType: "application/zip", buffer: book() }]);
    await expect(dialog.getByText(/fires_for_damp_days\.zip/)).toBeVisible();
    await dialog.getByRole("button", { name: "Add audiobook" }).tap();
    await expect(dialog.getByText("“Fires for Damp Days” is in your library")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("3 chapters, in order.")).toBeVisible();
    await dialog.getByRole("link", { name: "Listen" }).tap();

    // ── Its page: the player, with the chapters in order ──
    await expect(page.getByRole("heading", { level: 1, name: "Fires for Damp Days" })).toBeVisible();
    await expect(page.getByText("By A. Woodsman.")).toBeVisible();
    const chapters = page.getByRole("region", { name: "Chapters" }).getByRole("listitem");
    await expect(chapters).toHaveText([/Kindling/, /Tinder/, /Banking up/]);
    await expect(page.getByText("Chapter 1 of 3")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (const name of ["Play", "Back 30 seconds", "Forward 30 seconds"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box?.height, name).toBeGreaterThanOrEqual(44);
    }

    // ── Play the second chapter for a moment, then pause ──
    await page.getByRole("button", { name: /Tinder/ }).tap();
    await expect(page.getByText("Chapter 2 of 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect.poll(() => currentTime(page), { timeout: 10_000 }).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Pause", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    const left = await currentTime(page);
    // The file came from the server a range at a time.
    expect(ranges).toContain(206);

    // ── Leave, and come back ──
    await page.getByRole("link", { name: "Audiobooks" }).first().tap();
    await expect(page).toHaveURL(/\/library\?type=audio/);
    const row = page.getByRole("link", { name: /Fires for Damp Days/ });
    await expect(row).toContainText("started on this device");
    await row.tap();
    await expect(page.getByText("Chapter 2 of 3. Picks up where you left off.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveText(/Resume/);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(left - 0.5);

    // Resumed, it plays on from there and follows on to the last chapter.
    await page.getByRole("button", { name: "Play", exact: true }).tap();
    await expect(page.getByText("Chapter 3 of 3")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).tap();

    // ── Search finds it by its author ──
    await page.goto("/search?q=Woodsman");
    await expect(page.getByRole("link", { name: /Fires for Damp Days/ }).first()).toBeVisible();

    expect(errors).toEqual([]);
  });
});
