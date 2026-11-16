#!/usr/bin/env node
/**
 * Draws the app's Home Screen icons from the same shapes as `apps/web/public/outpost.svg`
 * and writes them as PNG files into `apps/web/public/icons/`. Run it again only when the
 * mark changes; the files it writes are committed.
 *
 *   node e2e/tools/make-icons.mjs
 *
 * A browser does the drawing, so the icons are exactly what the SVG looks like on screen.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const out = path.resolve(import.meta.dirname, "../../apps/web/public/icons");
fs.mkdirSync(out, { recursive: true });

/** The hut, on a 32-unit square. `inset` shrinks it towards the middle; `radius` rounds the background. */
const mark = (radius, inset) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
  <rect width="32" height="32" rx="${radius}" fill="#1d3a3f"/>
  <g transform="translate(16 16) scale(${inset}) translate(-16 -16)">
    <path d="M7 24V14.5L16 7l9 7.5V24Z" fill="none" stroke="#e8f1f1" stroke-width="2" stroke-linejoin="round"/>
    <rect x="13.5" y="16" width="5" height="5" rx="1" fill="#f0b040"/>
  </g>
</svg>`;

const icons = [
  // "any": the mark as it is in the browser tab, with its own rounded corners.
  { file: "icon-192.png", size: 192, svg: mark(7, 1), transparent: true },
  { file: "icon-512.png", size: 512, svg: mark(7, 1), transparent: true },
  // "maskable": the launcher cuts its own shape out, so the colour runs to the edge and the hut stays inside the safe middle.
  { file: "icon-maskable-512.png", size: 512, svg: mark(0, 0.72), transparent: false },
  // iOS rounds the corners itself and does not want transparency.
  { file: "apple-touch-icon.png", size: 180, svg: mark(0, 0.86), transparent: false },
];

const browser = await chromium.launch();
try {
  for (const icon of icons) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${icon.svg}`);
    await page.screenshot({ path: path.join(out, icon.file), omitBackground: icon.transparent });
    await page.close();
    console.log(`wrote ${icon.file}`);
  }
} finally {
  await browser.close();
}
