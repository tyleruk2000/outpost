/**
 * The reading and people screens (Library, the reader, audiobooks, learning, Notes, Kept,
 * Contacts, Messages), seeded so their full states show, then walked at a size and in both
 * themes. Shared by study-reading.spec.ts (desktop), .mobile.spec.ts and .iphone.spec.ts.
 *
 * It writes what it finds to a JSON file and screenshots of every screen when
 * OUTPOST_STUDY_OUT is set, so the screens can be looked at by eye; with it unset it only
 * asserts the floor: no serious axe finding, nothing wider than the screen.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { APIRequestContext, Page } from "@playwright/test";
import { wav } from "../../apps/server/test/fixtures/audio/builders.ts";
import { accessibilityFindings } from "./a11y";
import { lampRoomBook } from "./epub";
import { expect } from "./fixtures";
import { auditLayout, type Finding } from "./layout-audit";
import { buildPdf } from "./pdf";

const headers = { "X-Outpost-Request": "1" };
const BOOK = "field-library_en_2026-11";
const UUID = "5d1c0b6e-2f3a-4c7d-9e8f-0a1b2c3d4e5f";

export interface Seeded {
  pdf: string;
  epub: string;
  text: string;
  markdown: string;
  /** Where the audiobook's own page is. */
  audio: string | null;
  collection: string;
  note: string;
  contact: string;
}

async function json<T = Record<string, unknown>>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  expect(response.ok(), `${response.url()} -> ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

async function upload(request: APIRequestContext, name: string, mimeType: string, buffer: Buffer): Promise<string> {
  const body = await json<{ results: Array<{ document: { id: string } }> }>(
    await request.post("/api/documents", { headers, multipart: { file: { name, mimeType, buffer } } }),
  );
  return body.results[0]!.document.id;
}

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

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const heading = (text: string, level: number) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });

async function addArchive(request: APIRequestContext): Promise<string> {
  const { collections } = await json<{ collections: Array<{ id: string; title: string }> }>(await request.get("/api/collections"));
  const before = collections.find((collection) => collection.title === "Field library");
  if (before) return before.id;
  const { locations } = await json<{ locations: Array<{ id: string; path: string; isDefault: boolean }> }>(
    await request.get("/api/storage/locations"),
  );
  const location = locations.find((candidate) => candidate.isDefault)!;
  const relPath = `collections/zim/${BOOK}.zim`;
  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x044d495a, 0);
  header.writeUInt16LE(6, 4);
  header.writeUInt16LE(3, 6);
  Buffer.from(UUID.replace(/-/g, ""), "hex").copy(header, 8);
  fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), header);
  const id = (
    await json<{ collection: { id: string } }>(
      await request.post("/api/kiwix/import", { headers, data: { locationId: location.id, relPath } }),
    )
  ).collection.id;
  await expect
    .poll(async () => (await (await request.get(`/api/kiwix/books/${id}`)).json()).book, { timeout: 20_000 })
    .toMatchObject({ ready: true });
  return id;
}

/** Fills the library, the notes, the contacts and the board with enough to show each screen whole. */
export async function seed(request: APIRequestContext): Promise<Seeded> {
  const existing = await json<{ documents: Array<{ id: string; originalName: string }> }>(await request.get("/api/documents?limit=200"));
  const named = (name: string) => existing.documents.find((document) => document.originalName === name)?.id;
  const pdf =
    named("water-treatment.pdf") ??
    (await upload(
      request,
      "water-treatment.pdf",
      "application/pdf",
      buildPdf([
        ["Treating water in the field", "Boil for one minute, or three above 2000 metres."],
        ["Chlorine dioxide tablets", "One tablet treats one litre. Wait thirty minutes."],
        ["Filters", "A 0.2 micron filter stops bacteria and protozoa but not viruses."],
      ]),
    ));
  const epub = named("lamp-room.epub") ?? (await upload(request, "lamp-room.epub", "application/epub+zip", lampRoomBook()));
  const text =
    named("generator-log.txt") ??
    (await upload(
      request,
      "generator-log.txt",
      "text/plain",
      Buffer.from(
        Array.from({ length: 40 }, (_, index) => `Day ${index + 1}: ran the generator for two hours, 4.2 litres used.`).join("\n"),
      ),
    ));
  const markdown =
    named("a-very-long-document-name-about-keeping-the-stove-going-through-a-long-winter-without-power.md") ??
    (await upload(
      request,
      "a-very-long-document-name-about-keeping-the-stove-going-through-a-long-winter-without-power.md",
      "text/markdown",
      Buffer.from(
        "# Keeping the stove going\n\nSplit the wood a season ahead.\n\n## Kindling\n\n- Dry birch bark\n- Pine shavings\n\n| Wood | Burn |\n| --- | --- |\n| Ash | Good green |\n| Oak | Slow |\n",
      ),
    ));

  let audio: string | null = null;
  const audiobooks = await json<{ audiobooks?: Array<{ url: string }> }>(await request.get("/api/audiobooks"));
  if (audiobooks.audiobooks?.length) audio = audiobooks.audiobooks[0]!.url;
  else {
    const zip = storedZip([
      { name: "01 Kindling.wav", content: wav(4, { title: "Kindling", artist: "A. Woodsman", album: "Fires for Damp Days", track: 1 }) },
      { name: "02 Tinder.wav", content: wav(4, { title: "Tinder", artist: "A. Woodsman", album: "Fires for Damp Days", track: 2 }) },
    ]);
    const added = await request.post("/api/audiobooks", {
      headers,
      multipart: { files: { name: "fires.zip", mimeType: "application/zip", buffer: zip } },
    });
    if (added.ok()) {
      const { job } = await added.json();
      await expect
        .poll(async () => (await (await request.get(`/api/jobs/${job.id}`)).json()).job.state, { timeout: 30_000 })
        .toMatch(/succeeded|failed/);
      const after = await json<{ audiobooks?: Array<{ url: string }> }>(await request.get("/api/audiobooks"));
      audio = after.audiobooks?.[0]?.url ?? null;
    }
  }

  // A highlight on the text, so the highlights panel has one.
  await request.post(`/api/documents/${text}/highlights`, {
    headers,
    data: { exact: "ran the generator for two hours", prefix: "Day 1: ", note: "Check this against the meter." },
  });

  const collection = await addArchive(request);

  const notes = await json<{ items?: Array<{ id: string; title: string }> }>(await request.get("/api/notes/recent"));
  let note = notes.items?.find((item) => item.title === "Water and food store")?.id;
  if (!note) {
    const made = await json<{ note: { id: string } }>(
      await request.post("/api/notes", {
        headers,
        data: {
          title: "Water and food store",
          content: {
            type: "doc",
            content: [
              heading("What is in the store", 2),
              paragraph("Forty litres of water in four jerrycans, turned every six months."),
              {
                type: "bulletList",
                content: [
                  { type: "listItem", content: [paragraph("Rice, 10 kg")] },
                  { type: "listItem", content: [paragraph("Oats, 5 kg")] },
                ],
              },
              heading("Checks", 3),
              paragraph("Look at the dates on the first Sunday of the month."),
            ],
          },
        },
      }),
    );
    note = made.note.id;
    await request.patch(`/api/notes/${note}`, { headers, data: { tags: ["stores", "monthly"] } });
    await request.post("/api/notes", {
      headers,
      data: { parentId: note, title: "Rotation dates", content: { type: "doc", content: [paragraph("March and September.")] } },
    });
    // A second version, so the versions view has something to show.
    await request.patch(`/api/notes/${note}`, {
      headers,
      data: { content: { type: "doc", content: [heading("What is in the store", 2), paragraph("Forty-five litres now.")] } },
    });
  }

  const contacts = await json<{ contacts: Array<{ id: string; displayName: string }> }>(await request.get("/api/contacts?q=Okafor"));
  let contact = contacts.contacts[0]?.id;
  if (!contact) {
    contact = (
      await json<{ contact: { id: string } }>(
        await request.post("/api/contacts", {
          headers,
          data: {
            kind: "person",
            name: { prefix: "", given: "Adaeze", additional: "", family: "Okafor", suffix: "" },
            organisation: "Fellside mountain rescue",
            title: "Team leader",
            phones: [{ label: "mobile", value: "07700 900123" }],
            emails: [{ label: "home", value: "adaeze@example.org" }],
            tags: ["rescue", "neighbours"],
            isEmergency: true,
            emergencyNote: "Ring first for anything on the fell.",
            callsign: "M7ABC",
            note: "Rings back within the hour.",
          },
        }),
      )
    ).contact.id;
    await request.post("/api/contacts", {
      headers,
      data: { kind: "organisation", organisation: "Village hall", phones: [{ label: "work", value: "01234 567890" }] },
    });
    await request.post("/api/contacts", {
      headers,
      data: {
        kind: "person",
        name: { prefix: "", given: "Zoë", additional: "", family: "Łukasiewicz", suffix: "" },
        phones: [{ label: "mobile", value: "07700 900456" }],
      },
    });
  }

  const board = await json<{ messages: unknown[] }>(await request.get("/api/board/messages"));
  if (board.messages.length === 0) {
    await request.post("/api/board/messages", { headers, data: { author: "Sam", body: "Gone to the shop for bread, back by four." } });
    await request.post("/api/board/messages", {
      headers,
      data: {
        author: "Alex",
        body: "The water butt by the shed is nearly empty; please don't use it for the garden until it rains again. This is a long message to see how it wraps across lines on a small phone.",
      },
    });
    await request.post("/api/board/check-ins", { headers, data: { author: "Sam", status: "safe", body: "At the hall." } });
  }

  return { pdf, epub, text, markdown, audio, collection, note: note!, contact: contact! };
}

/** The screens of the area, by name, with the address each is at. */
export function screens(seeded: Seeded | null): Array<[string, string]> {
  const always: Array<[string, string]> = [
    ["library", "/library"],
    ["library-collections", "/library?tab=collections"],
    ["library-learning", "/library?tab=learning"],
    ["library-audio", "/library?type=audio"],
    ["library-save-page", "/library?save=page"],
    ["calibre", "/library/calibre"],
    ["notes", "/notes"],
    ["notes-new", "/notes?new=1"],
    ["contacts", "/contacts"],
    ["contacts-new", "/contacts/new"],
    ["contacts-import", "/contacts/import"],
    ["contacts-phones", "/contacts/phones"],
    ["contacts-emergency", "/contacts/emergency"],
    ["messages", "/messages"],
    ["kept", "/kept"],
  ];
  if (!seeded) return always;
  return [
    ...always,
    ["doc-pdf", `/library/documents/${seeded.pdf}`],
    ["doc-epub", `/library/documents/${seeded.epub}`],
    ["doc-epub-chapter", `/library/documents/${seeded.epub}?chapter=1`],
    ["doc-text", `/library/documents/${seeded.text}`],
    ["doc-markdown", `/library/documents/${seeded.markdown}`],
    ...(seeded.audio ? ([["audiobook", seeded.audio]] as Array<[string, string]>) : []),
    ["collection", `/library/collections/${seeded.collection}`],
    ["reader", `/library/read/${seeded.collection}/`],
    ["note", `/notes/${seeded.note}`],
    ["note-versions", `/notes/${seeded.note}/versions`],
    ["contact", `/contacts/${seeded.contact}`],
    ["contact-edit", `/contacts/${seeded.contact}/edit`],
    ["contact-large", `/contacts/${seeded.contact}/large`],
  ];
}

export interface ScreenReport {
  name: string;
  path: string;
  size: string;
  heading: string;
  axe: string[];
  layout: Finding[];
  wide150: number;
  /** What reaches past the right of the screen at 150%, deepest first. */
  past150: string[];
  wide200: number;
  errors: string[];
}

const SHELL = ["header.bg-spine", 'nav[aria-label="Main"]', 'aside[aria-label="Main"]'];

/** Waits for a screen to settle: its heading drawn, nothing still loading. */
async function settle(page: Page): Promise<string> {
  const heading = async () =>
    (
      (await page
        .getByRole("heading", { level: 1 })
        .first()
        .textContent({ timeout: 1_000 })
        .catch(() => "")) ?? ""
    ).trim();
  await expect
    .poll(heading, { timeout: 8_000 })
    .not.toBe("")
    .catch(() => undefined);
  await page
    .locator("[aria-busy='true']")
    .first()
    .waitFor({ state: "detached", timeout: 8_000 })
    .catch(() => undefined);
  await page.waitForTimeout(500);
  return heading();
}

/** What reaches past the right of the screen and holds nothing that does too: the things to blame. */
function pastTheEdge(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const over = (element: Element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.right > width + 1;
    };
    return [...document.querySelectorAll("body *")]
      .filter((element) => !element.closest("svg") && over(element) && ![...element.children].some(over))
      .slice(0, 6)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 50)} "${(element.textContent ?? "").trim().slice(0, 30)}" to ${Math.round(element.getBoundingClientRect().right)}`,
      );
  });
}

/** Walks one screen: axe in both themes, the layout audit, the page at 200% text, screenshots of each. */
export async function walk(page: Page, name: string, address: string, size: string, minTarget: number): Promise<ScreenReport> {
  const out = process.env.OUTPOST_STUDY_OUT;
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(String(error));
  page.on("pageerror", onError);
  await page.evaluate(() => document.documentElement.style.removeProperty("font-size")).catch(() => undefined);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(address);
  const title = await settle(page);
  const axe: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.locator(`html[data-theme="${theme}"]`).waitFor({ state: "attached" });
    await page.waitForTimeout(150);
    axe.push(...(await accessibilityFindings(page, address, theme)));
    if (out) await page.screenshot({ path: path.join(out, `${size}-${name}-${theme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const layout = (await page.evaluate(auditLayout, { shell: SHELL, minTarget })).filter((finding) => !finding.shell);
  // The app's own largest text size (Settings, Text size: Largest), then 200%.
  await page.evaluate(() => document.documentElement.style.setProperty("font-size", "150%", "important"));
  await page.waitForTimeout(300);
  const wide150 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const past150 = wide150 > 0 ? await pastTheEdge(page) : [];
  if (out) await page.screenshot({ path: path.join(out, `${size}-${name}-150.png`), fullPage: true });
  await page.evaluate(() => document.documentElement.style.setProperty("font-size", "200%", "important"));
  await page.waitForTimeout(300);
  const wide200 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (out) await page.screenshot({ path: path.join(out, `${size}-${name}-200.png`), fullPage: true });
  await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));
  page.off("pageerror", onError);
  return { name, path: address, size, heading: title, axe, layout, wide150, past150, wide200, errors };
}

export function writeReport(file: string, reports: ScreenReport[]): void {
  const out = process.env.OUTPOST_STUDY_OUT;
  if (!out) return;
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, file), JSON.stringify(reports, null, 2));
}
