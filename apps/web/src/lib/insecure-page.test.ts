/**
 * Outpost is mostly used at a plain http address on a home network, which browsers do
 * not count as a secure page. Some browser features exist only on secure pages and
 * simply are not there otherwise, so calling them throws and a button appears to do
 * nothing. The tests and the end-to-end suite run at localhost, which is secure, so
 * they never see it. This guard reads the source instead.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

describe("features that only a secure page has", () => {
  it("are not called where a plain http page would throw", () => {
    const found: string[] = [];
    for (const file of sources(root)) {
      const text = fs.readFileSync(file, "utf8");
      // Identifiers come from localId() in lib/utils.ts, which works everywhere.
      if (/crypto\s*\.\s*randomUUID\s*\(/.test(text)) found.push(`${path.relative(root, file)}: crypto.randomUUID() (use localId)`);
      // The camera is missing on such a page: a file that asks for it must check first, and say what to do (see supplies/barcode/camera.ts).
      if (/getUserMedia\s*\(/.test(text) && !/isSecureContext/.test(text))
        found.push(`${path.relative(root, file)}: getUserMedia() without checking window.isSecureContext first`);
    }
    expect(found).toEqual([]);
  });

  // Each of these is missing on such a page, or refuses. A file that uses one must also look before it
  // does, and the screen must then say what is needed (the end-to-end suite presses each at such an
  // address: e2e/tests/not-secure.spec.ts). The service worker is left out: it only exists on a secure page.
  // crypto.subtle is not here: only OpenPGP.js uses it, loaded after cryptoAvailable() in encryption/engine.ts,
  // and encryption-page.test.tsx checks what the screen says without it.
  const SECURE_ONLY: Array<{ what: string; use: RegExp; guard: RegExp }> = [
    // The QR screen copies a picture, which needs more than the clipboard being there: it asks canCopyPicture().
    { what: "the clipboard", use: /navigator\.clipboard\.\w+\(/, guard: /if \(navigator\.clipboard\b|if \(!canCopyPicture\(\)\)/ },
    { what: "sharing", use: /navigator\.share\(/, guard: /typeof navigator\.canShare === "function"/ },
    { what: "the device's location", use: /\.geolocation\.(getCurrentPosition|watchPosition)\(/, guard: /isSecureContext|secure\(\)/ },
    { what: "a service worker", use: /navigator\.serviceWorker\s*(\/\/[^\n]*\n\s*)*\.register\(/, guard: /isSecureContext/ },
    { what: "Cache Storage", use: /\bcaches\.(open|keys|delete|match)\(/, guard: /keepingSupported\(\)/ },
    { what: "the browser's storage manager", use: /navigator\.storage\.\w+\(/, guard: /\bcatch\b|keepingSupported\(\)/ },
    { what: "the camera or microphone", use: /getUserMedia\(|mediaDevices\./, guard: /isSecureContext/ },
    { what: "notifications", use: /new Notification\(|Notification\.requestPermission\(/, guard: /"Notification" in window/ },
    { what: "a wake lock", use: /wakeLock\.request\(/, guard: /"wakeLock" in navigator/ },
    { what: "web locks", use: /\blocks\s*\.request\(/, guard: /"locks" in navigator/ },
    // The Morse trainer's wired keys and game controllers (features/morse/input/key-sources.ts): Web Serial exists only on a secure
    // page, and some browsers list game controllers only on one. The panel says which is missing and points to Settings.
    { what: "Web Serial", use: /\.serial\b[^\n]*\.requestPort\(|serial\.requestPort\(/, guard: /isSecureContext/ },
    { what: "game controllers", use: /navigator\.getGamepads\(/, guard: /isSecureContext/ },
    // The live compass (features/compass/live-heading.ts): browsers fire orientation events only on a secure page, and iOS asks
    // permission only from a press there. The card says a live compass needs HTTPS and a phone, and points to Settings.
    {
      what: "the device's orientation",
      use: /addEventListener\(\s*"deviceorientation(absolute)?"|DeviceOrientationEvent\b[^\n]*requestPermission/,
      guard: /isSecureContext/,
    },
  ];

  it("are used only after looking for them", () => {
    const found: string[] = [];
    for (const file of sources(root)) {
      const name = path.relative(root, file);
      if (name.startsWith(`sw${path.sep}`) || name.endsWith("fake-caches.ts")) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const { what, use, guard } of SECURE_ONLY) {
        if (use.test(text) && !guard.test(text)) found.push(`${name}: ${what}, used without looking for it first`);
      }
    }
    expect(found).toEqual([]);
  });

  it("are each found where they are used: the list above is not out of date", () => {
    const all = sources(root)
      .filter((file) => !path.relative(root, file).startsWith(`sw${path.sep}`))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    const used = SECURE_ONLY.filter(({ use }) => use.test(all)).map(({ what }) => what);
    // What the app uses today. One that is no longer used can come off the list; one that is new goes on it.
    expect(used).toEqual([
      "the clipboard",
      "sharing",
      "the device's location",
      "a service worker",
      "Cache Storage",
      "the browser's storage manager",
      "the camera or microphone",
      "a wake lock",
      "web locks",
      "Web Serial",
      "game controllers",
      "the device's orientation",
    ]);
  });
});
