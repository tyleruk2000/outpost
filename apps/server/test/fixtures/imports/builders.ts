/**
 * Fixtures for the import tests, built in memory so every byte a test depends on is
 * visible in the test: a Notion-style export, and ZIP archives written by hand so
 * that entry names, file modes and declared sizes can be as hostile as a test needs
 * (the usual ZIP libraries rightly refuse to write such things).
 */
import zlib from "node:zlib";
import type { ImportDto, ImportOptions } from "@outpost/shared";
import type { TestApp } from "../../helpers.ts";
import { buildZip, multipart, tinyPng, type UploadFile } from "../documents/builders.ts";

export { buildPdf, buildZip, tinyPng } from "../documents/builders.ts";

export interface RawEntry {
  name: string;
  content?: string | Buffer;
  /** Unix file mode including the type bits, e.g. 0o120777 for a symbolic link. */
  mode?: number;
  /** Compress with DEFLATE instead of storing. */
  deflate?: boolean;
}

/** A ZIP archive written field by field. Names are written exactly as given. */
export function rawZip(entries: RawEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content ?? "");
    const data = entry.deflate ? zlib.deflateRawSync(content, { level: 9 }) : content;
    const method = entry.deflate ? 8 : 0;
    const crc = zlib.crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE((3 << 8) | 20, 4); // made on Unix, so the mode below is meaningful
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(content.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + name.length + data.length;
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

// ── A Notion "Markdown & CSV" export ────────────────────────────────────────

export const NOTION = {
  trip: "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
  packing: "11111111111111111111111111111111",
  route: "22222222222222222222222222222222",
  tasks: "33333333333333333333333333333333",
  huts: "44444444444444444444444444444444",
  maps: "55555555555555555555555555555555",
} as const;

const enc = (value: string) => encodeURIComponent(value);

/**
 * A page with two sub-pages, a picture, a database with two row pages (the plain CSV
 * holds one row, as a filtered view would; `_all` holds both), a callout and maths.
 */
export function notionEntries(): Array<{ name: string; content: string | Buffer }> {
  const root = `Trip plan ${NOTION.trip}`;
  const tasks = `Tasks ${NOTION.tasks}`;
  return [
    {
      name: `${root}.md`,
      content: [
        "# Trip plan",
        "",
        "Three days across the ridge.",
        "",
        `![The map](${enc(root)}/map.png)`,
        "",
        `Before leaving, read the [packing list](${enc(root)}/${enc(`Packing list ${NOTION.packing}`)}.md).`,
        "",
        "<aside>",
        "💡 Check the weather the night before.",
        "</aside>",
        "",
        "$$",
        "E = mc^2",
        "$$",
        "",
        "Walking speed is $v = d/t$ on the flat.",
        "",
        `[Tasks](${enc(root)}/${enc(tasks)}.csv)`,
        "",
      ].join("\n"),
    },
    {
      name: `${root}/Packing list ${NOTION.packing}.md`,
      content: `# Packing list\n\n- Stove\n- Map\n\nBack to the [plan](../${enc(root)}.md).\n`,
    },
    { name: `${root}/Route ${NOTION.route}.md`, content: "# Route\n\nHut to hut, north to south.\n" },
    { name: `${root}/map.png`, content: tinyPng },
    { name: `${root}/${tasks}.csv`, content: "Name,Status\nBook huts,Done\n" },
    { name: `${root}/${tasks}_all.csv`, content: "Name,Status\nBook huts,Done\nBuy maps,To do\n" },
    { name: `${root}/${tasks}/Book huts ${NOTION.huts}.md`, content: "# Book huts\n\nStatus: Done\n\nCall the warden.\n" },
    { name: `${root}/${tasks}/Buy maps ${NOTION.maps}.md`, content: "# Buy maps\n\nStatus: To do\n" },
  ];
}

export const notionZip = (): Promise<Buffer> => buildZip(notionEntries());

// ── Driving an import through the API ───────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests, as in helpers.ts
type Json = Record<string, any>;

export async function uploadImport(app: TestApp, files: UploadFile[]): Promise<{ status: number; body: Json }> {
  const { payload, headers } = multipart({}, files);
  return app.api("POST", "/api/imports", payload, { headers });
}

export async function getImport(app: TestApp, id: string): Promise<ImportDto> {
  return (await app.api("GET", `/api/imports/${id}`)).body.import as ImportDto;
}

/** Uploads the files and waits for the analysis to end, whatever its outcome. */
export async function analyse(app: TestApp, files: UploadFile[]): Promise<ImportDto> {
  const uploaded = await uploadImport(app, files);
  if (uploaded.status !== 200) throw new Error(`Upload was refused: ${JSON.stringify(uploaded.body)}`);
  await app.ctx.jobs.whenIdle();
  return getImport(app, uploaded.body.import.id);
}

export const DEFAULTS: ImportOptions = { duplicates: "skip", pdfs: "library" };

/** Commits an analysed import and waits for it to end. */
export async function commit(app: TestApp, id: string, options: Partial<ImportOptions> = {}): Promise<ImportDto> {
  const started = await app.api("POST", `/api/imports/${id}/commit`, { ...DEFAULTS, ...options });
  if (started.status !== 200) throw new Error(`Commit was refused: ${JSON.stringify(started.body)}`);
  await app.ctx.jobs.whenIdle();
  return getImport(app, id);
}

/** The page tree as nested titles, in order: `["Trip plan", ["Packing list", "Route"]]`. */
export async function titleTree(app: TestApp, parentId: string | null = null): Promise<unknown[]> {
  const notes = (await app.api("GET", "/api/notes/tree")).body.notes as Array<{
    id: string;
    parentId: string | null;
    title: string;
    position: number;
  }>;
  const under = (parent: string | null): unknown[] =>
    notes
      .filter((note) => note.parentId === parent)
      .sort((a, b) => a.position - b.position)
      .flatMap((note) => {
        const children = under(note.id);
        return children.length > 0 ? [note.title, children] : [note.title];
      });
  return under(parentId);
}

export async function findNote(app: TestApp, title: string): Promise<Json> {
  const notes = (await app.api("GET", "/api/notes/tree")).body.notes as Array<{ id: string; title: string }>;
  const matches = notes.filter((note) => note.title === title);
  if (matches.length !== 1) throw new Error(`Expected one page titled "${title}", found ${matches.length}.`);
  return (await app.api("GET", `/api/notes/${matches[0]!.id}`)).body.note;
}
