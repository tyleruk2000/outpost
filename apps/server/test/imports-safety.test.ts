import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EXTRACT_LIMITS,
  type ExtractLimits,
  extractArchive,
  extractWithNested,
  newBudget,
  safeEntryName,
} from "../src/modules/imports/extract.ts";
import { analyse, buildZip, commit, rawZip, titleTree, uploadImport } from "./fixtures/imports/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

const stagingRoot = () => path.join(app.dir, "data", "staging");

/** Every file and folder under `dir`, relative to it. */
function everythingUnder(dir: string): string[] {
  return fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).map(String).sort() : [];
}

/** Files anywhere in the test's directory that are not where an import may put them. */
function strays(name: string): string[] {
  return everythingUnder(app.dir).filter((entry) => path.basename(entry) === name);
}

async function expectRefused(zip: Buffer, message: RegExp): Promise<void> {
  const before = (await app.api("GET", "/api/notes/tree")).body;
  const dto = await analyse(app, [{ name: "export.zip", content: zip }]);
  expect(dto.state).toBe("failed");
  expect(dto.error).toMatch(message);
  expect(dto.analysis).toBeNull();
  expect(dto.canRetry).toBe(false);
  // Nothing of a refused upload is kept, and nothing was imported.
  expect(fs.existsSync(app.ctx.services.imports.stagingDir(dto.id))).toBe(false);
  expect((await app.api("GET", "/api/notes/tree")).body).toEqual(before);
  const commitAttempt = await app.api("POST", `/api/imports/${dto.id}/commit`, { duplicates: "skip", pdfs: "library" });
  expect(commitAttempt.status).toBe(409);
}

describe("archives that try to write outside their folder", () => {
  it("refuses an entry that climbs out with ../", async () => {
    await expectRefused(
      rawZip([
        { name: "fine.md", content: "# Fine\n" },
        { name: "../../evil.md", content: "# Evil\n" },
      ]),
      /contains a file whose name points outside the archive \("\.\.\/\.\.\/evil\.md"\)/,
    );
    expect(strays("evil.md")).toEqual([]);
    expect(fs.existsSync(path.join(app.dir, "data", "evil.md"))).toBe(false);
    expect(fs.existsSync(path.join(app.dir, "evil.md"))).toBe(false);
  });

  it("refuses ../ hidden in the middle of a path and written with backslashes", async () => {
    await expectRefused(rawZip([{ name: "notes/../../../evil.md", content: "x" }]), /points outside the archive/);
    await expectRefused(rawZip([{ name: "notes\\..\\..\\..\\evil.md", content: "x" }]), /points outside the archive/);
    expect(strays("evil.md")).toEqual([]);
  });

  it("refuses absolute paths, drive letters and NUL bytes", async () => {
    const target = path.join(os.tmpdir(), `outpost-evil-${process.pid}.md`);
    await expectRefused(rawZip([{ name: target, content: "x" }]), /points outside the archive/);
    expect(fs.existsSync(target)).toBe(false);
    await expectRefused(rawZip([{ name: "C:\\Windows\\evil.md", content: "x" }]), /points outside the archive/);
    await expectRefused(rawZip([{ name: "evil.md\0.png", content: "x" }]), /points outside the archive/);
  });

  it("never creates a symbolic link, and says that it left it out", async () => {
    const dto = await analyse(app, [
      {
        name: "export.zip",
        content: rawZip([
          { name: "fine.md", content: "# Fine\n\n[secrets](secrets.md)\n" },
          { name: "secrets.md", content: "/etc/passwd", mode: 0o120777 },
          { name: "pipe", content: "", mode: 0o010644 },
        ]),
      },
    ]);
    expect(dto.state).toBe("ready");
    const tree = path.join(app.ctx.services.imports.stagingDir(dto.id), "tree");
    expect(everythingUnder(tree)).toEqual(["fine.md"]);
    expect(fs.lstatSync(path.join(tree, "fine.md")).isSymbolicLink()).toBe(false);
    expect(dto.analysis!.items.filter((item) => item.kind === "skipped")).toMatchObject([
      { path: "pipe", reason: "Symbolic links and special files are never unpacked." },
      { path: "secrets.md", reason: "Symbolic links and special files are never unpacked." },
    ]);
    expect(dto.analysis!.totals).toMatchObject({ pages: 1, skipped: 2 });
    // The link to the entry that was left out stays plain text.
    expect(dto.analysis!.items.find((item) => item.path === "fine.md")!.warnings).toHaveLength(1);
    const done = await commit(app, dto.id);
    expect(done.state).toBe("completed");
    expect(await titleTree(app)).toEqual(["Fine"]);
  });
});

describe("archives that are too much", () => {
  it("refuses more files than the limit", async () => {
    app.ctx.services.imports.limits.maxEntries = 3;
    const entries = Array.from({ length: 5 }, (_, index) => ({ name: `page-${index}.md`, content: `# Page ${index}\n` }));
    await expectRefused(await buildZip(entries), /holds more than 3 files, which is more than Outpost imports at once/);
  });

  it("refuses a file that inflates like a zip bomb", async () => {
    const zeros = Buffer.alloc(4 * 1024 * 1024);
    const zip = rawZip([
      { name: "fine.md", content: "# Fine\n" },
      { name: "bomb.md", content: zeros, deflate: true },
    ]);
    expect(zip.length).toBeLessThan(20_000);
    await expectRefused(zip, /"bomb\.md" unpacks to 4\.19 MB from .* which is how an archive built to fill a disk looks/);
  });

  it("refuses an archive that unpacks to more than the total allowed", async () => {
    app.ctx.services.imports.limits.maxTotalBytes = 1000;
    await expectRefused(
      rawZip([
        { name: "a.md", content: "a".repeat(600) },
        { name: "b.md", content: "b".repeat(600) },
      ]),
      /unpacks to more than 1\.00 kB, which is more than Outpost imports at once/,
    );
  });

  it("leaves out a single file over the per-file limit and imports the rest", async () => {
    app.ctx.services.imports.limits.maxFileBytes = 100;
    const dto = await analyse(app, [
      {
        name: "export.zip",
        content: rawZip([
          { name: "small.md", content: "# Small\n" },
          { name: "huge.md", content: "x".repeat(500) },
        ]),
      },
    ]);
    expect(dto.state).toBe("ready");
    expect(dto.analysis!.items.find((item) => item.path === "huge.md")).toMatchObject({
      kind: "skipped",
      reason: "It is larger than the 100 bytes this server accepts for one file.",
    });
    expect(dto.analysis!.totals.pages).toBe(1);
  });

  it("refuses a password-protected archive in words", async () => {
    const zip = rawZip([{ name: "secret.md", content: "secret ".repeat(40), deflate: true }]);
    // Set the "encrypted" bit of the entry in the central directory (general purpose flags, bit 0).
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt16LE(zip.readUInt16LE(central + 8) | 1, central + 8);
    await expectRefused(zip, /is protected with a password/);
  });
});

describe("archives that are damaged or nested", () => {
  it("fails cleanly on a file that is not a ZIP at all", async () => {
    await expectRefused(
      Buffer.from("this is not a zip archive, whatever its name says"),
      /"export\.zip" could not be read as a ZIP archive\. It may be damaged/,
    );
  });

  it("fails cleanly on an archive cut short", async () => {
    const whole = await buildZip([{ name: "a.md", content: "# A\n".repeat(2000) }]);
    await expectRefused(whole.subarray(0, whole.length - 40), /could not be read as a ZIP archive/);
  });

  it("fails cleanly when an entry's data does not match what the archive declares", async () => {
    const zip = rawZip([{ name: "a.md", content: "# A page with some text in it\n", deflate: true }]);
    // Corrupt the compressed bytes of the entry, leaving the directory intact.
    zip.fill(0xff, 30 + "a.md".length, 30 + "a.md".length + 8);
    await expectRefused(zip, /could not be read as a ZIP archive/);
  });

  it("unpacks the archives inside an archive, as Notion splits large exports", async () => {
    const part1 = await buildZip([
      { name: "Plan.md", content: "# Plan\n\nSee [the notes](Plan/Notes.md).\n" },
      { name: "Plan/Notes.md", content: "# Notes\n" },
    ]);
    const part2 = await buildZip([{ name: "Plan/More.md", content: "# More\n" }]);
    const deeper = await buildZip([{ name: "deep.md", content: "# Deep\n" }]);
    const part3 = await buildZip([{ name: "inner.zip", content: deeper }]);
    const outer = await buildZip([
      { name: "Export-Part-1.zip", content: part1, store: true },
      { name: "Export-Part-2.zip", content: part2, store: true },
      { name: "Export-Part-3.zip", content: part3, store: true },
      { name: "Export-Part-4.zip", content: Buffer.from("damaged"), store: true },
    ]);
    const dto = await analyse(app, [{ name: "Export.zip", content: outer }]);
    expect(dto.state).toBe("ready");
    // The parts' contents sit side by side, as if they had been one archive.
    expect(dto.analysis!.items.filter((item) => item.kind === "page").map((item) => [item.title, item.parentPath])).toEqual([
      ["Plan", null],
      ["More", "Plan.md"],
      ["Notes", "Plan.md"],
    ]);
    // One level only: an archive inside a part is left as a file, and a damaged part costs only itself.
    expect(dto.analysis!.items.filter((item) => item.kind === "skipped").map((item) => [item.path, item.reason])).toEqual([
      ["Export-Part-4.zip", "This archive inside the upload is damaged and could not be opened."],
      ["inner.zip", "Archives inside an archive are only unpacked one level deep."],
    ]);
    const done = await commit(app, dto.id);
    expect(done.state).toBe("completed");
    expect(await titleTree(app)).toEqual(["Plan", ["More", "Notes"]]);
  });

  it("refuses the whole upload when a nested archive is hostile", async () => {
    const outer = await buildZip([
      { name: "ok.md", content: "# Ok\n" },
      { name: "part.zip", content: rawZip([{ name: "../../../evil.md", content: "x" }]), store: true },
    ]);
    await expectRefused(outer, /"part\.zip" contains a file whose name points outside the archive/);
    expect(strays("evil.md")).toEqual([]);
  });
});

describe("the upload itself", () => {
  it("uses only the last part of an uploaded file's name", async () => {
    const uploaded = await uploadImport(app, [{ name: "../../../escape.md", content: "# Escaped?\n" }]);
    expect(uploaded.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(everythingUnder(stagingRoot()).filter((entry) => entry.endsWith("escape.md"))).toEqual([
      path.join(uploaded.body.import.id, "tree", "escape.md"),
      path.join(uploaded.body.import.id, "upload", "escape.md"),
    ]);
    expect(strays("escape.md")).toHaveLength(2);
  });

  it("refuses a file over the server's upload limit and keeps nothing", async () => {
    await app.close();
    app = await createTestApp({ OUTPOST_MAX_UPLOAD_MB: "1" });
    const refused = await uploadImport(app, [{ name: "big.md", content: Buffer.alloc(1024 * 1024 + 10, "a") }]);
    expect(refused.status).toBe(413);
    expect(refused.body.error.message).toBe('"big.md" is larger than the 1.05 MB this server accepts for one file.');
    expect(everythingUnder(stagingRoot())).toEqual([]);
  });

  it("needs a signed-in person when accounts are on", async () => {
    await app.close();
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    expect((await uploadImport(app, [{ name: "a.md", content: "# A\n" }])).status).toBe(401);
    expect((await app.api("GET", "/api/imports")).status).toBe(401);
  });
});

describe("the extractor on its own", () => {
  let dir: string;
  const limits: ExtractLimits = { ...DEFAULT_EXTRACT_LIMITS, maxFileBytes: 1024 * 1024 };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-extract-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, content: Buffer) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    return file;
  };

  it("judges names without touching the disk", () => {
    expect(safeEntryName("a/./b//c.md", "x.zip")).toBe("a/b/c.md");
    expect(safeEntryName("a\\b.md", "x.zip")).toBe("a/b.md");
    for (const name of ["../a", "a/../../b", "/etc/passwd", "C:/x", "a\0b", ".."])
      expect(() => safeEntryName(name, "x.zip")).toThrow(/points outside the archive/);
  });

  it("does not write over a file that is already there", async () => {
    const dest = path.join(dir, "out");
    fs.mkdirSync(dest);
    const zip = write(
      "twice.zip",
      rawZip([
        { name: "a.md", content: "first" },
        { name: "a.md", content: "second" },
        { name: "A.MD", content: "third" },
      ]),
    );
    const result = await extractArchive(zip, dest, { limits, budget: await newBudget(dest, limits), label: "twice.zip" });
    expect(fs.readFileSync(path.join(dest, "a.md"), "utf8")).toBe("first");
    expect(result.written[0]).toBe("a.md");
    expect(
      result.leftOut.filter((entry) => entry.reason === "Another file with the same name is already part of this import.").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("counts nested archives against the same limits as the outer one", async () => {
    const dest = path.join(dir, "out");
    fs.mkdirSync(dest);
    const inner = await buildZip(Array.from({ length: 4 }, (_, index) => ({ name: `in-${index}.md`, content: "x" })));
    const zip = write(
      "outer.zip",
      await buildZip([
        { name: "a.md", content: "x" },
        { name: "inner.zip", content: inner, store: true },
      ]),
    );
    const tight = { ...limits, maxEntries: 5 };
    await expect(extractWithNested(zip, dest, { limits: tight, budget: await newBudget(dest, tight), label: "outer.zip" })).rejects.toThrow(
      /holds more than 5 files/,
    );
  });

  it("stops when it is told to", async () => {
    const dest = path.join(dir, "out");
    fs.mkdirSync(dest);
    const zip = write("many.zip", await buildZip(Array.from({ length: 50 }, (_, index) => ({ name: `f-${index}.md`, content: "x" }))));
    const controller = new AbortController();
    const running = extractArchive(zip, dest, {
      limits,
      budget: await newBudget(dest, limits),
      label: "many.zip",
      signal: controller.signal,
      onProgress: (done) => {
        if (done === 5) controller.abort("cancelled");
      },
    });
    await expect(running).rejects.toBeDefined();
    expect(fs.readdirSync(dest).length).toBeLessThan(50);
  });
});
