/**
 * A person's own file, moved into the library or recorded where it is, is never lost,
 * replaced or followed through a link: not when a link is swapped in for it, not when it
 * cannot be put back, not when it changes while it is copied between drives.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identityOf, moveOriginal } from "../src/modules/documents/staging.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

const exdev = () => Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" });
const documentFolders = (root: string) => fs.readdirSync(path.join(root, "documents")).filter((name) => name !== ".incoming");

describe("putting back what was swapped in", () => {
  it("never replaces what has since been saved at the old name", async () => {
    const { documents, storage } = app.ctx.services;
    const location = storage.getDefault();
    const secret = path.join(app.dir, "private-notes.txt");
    fs.writeFileSync(secret, "Someone else's notes.");
    const moving = path.join(location.path, "moving.txt");
    fs.writeFileSync(moving, "Read and checked as this.");
    const rename = fs.promises.rename;
    vi.spyOn(fs.promises, "rename").mockImplementation(async (from, to) => {
      if (String(from) !== moving) return rename(from, to);
      fs.rmSync(moving);
      fs.symlinkSync(secret, moving);
      await rename(from, to);
      // A newer save lands at the old name before anything is put back.
      fs.writeFileSync(moving, "A newer save.");
    });
    const error = await documents.ingestFile({ sourcePath: moving, originalName: "moving.txt", move: true }).catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "conflict",
      message: expect.stringMatching(/left at .*documents\/.*moving\.txt.*Nothing was added/s),
    });
    expect(fs.readFileSync(moving, "utf8")).toBe("A newer save.");
    // What was swapped in stays where it was moved to, untouched, in a folder that was not removed.
    const [folder] = documentFolders(location.path);
    expect(fs.lstatSync(path.join(location.path, "documents", folder!, "moving.txt")).isSymbolicLink()).toBe(true);
    expect(documents.list().total).toBe(0);
  });

  it("leaves it where it is, and says where, when it cannot be put back", async () => {
    const { documents, storage } = app.ctx.services;
    const location = storage.getDefault();
    const moving = path.join(location.path, "moving.txt");
    fs.writeFileSync(moving, "Read and checked as this.");
    const rename = fs.promises.rename;
    vi.spyOn(fs.promises, "rename").mockImplementation(async (from, to) => {
      if (String(from) === moving) {
        // Replaced by another file of the same name in the instant before the rename.
        fs.rmSync(moving);
        fs.writeFileSync(moving, "Another file altogether.");
      }
      return rename(from, to);
    });
    // A drive with no hard links (FAT, exFAT): the safe way back is not there.
    vi.spyOn(fs.promises, "link").mockRejectedValue(Object.assign(new Error("operation not permitted"), { code: "EPERM" }));
    const error = await documents.ingestFile({ sourcePath: moving, originalName: "moving.txt", move: true }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "conflict", message: expect.stringContaining("left at") });
    const [folder] = documentFolders(location.path);
    expect(fs.readFileSync(path.join(location.path, "documents", folder!, "moving.txt"), "utf8")).toBe("Another file altogether.");
    expect(documents.list().total).toBe(0);
  });
});

describe("moving between drives", () => {
  it("keeps the original when it was replaced while it was being copied, and says so", async () => {
    const { documents, storage } = app.ctx.services;
    const location = storage.getDefault();
    const source = path.join(app.dir, "from-a-stick.txt");
    fs.writeFileSync(source, "The version that was read.");
    const incoming = path.join(location.path, "documents", ".incoming");
    const stat = fs.promises.stat;
    vi.spyOn(fs.promises, "stat").mockImplementation((async (file: fs.PathLike, ...rest: unknown[]) => {
      const result = await stat(file, ...(rest as []));
      // The source is on another drive.
      if (String(file) === incoming) return Object.assign(result, { dev: result.dev + 1 });
      // Copied: a newer version is saved over the original before it would be removed.
      if (String(file).endsWith(".part")) {
        fs.writeFileSync(`${source}.new`, "A newer version.");
        fs.renameSync(`${source}.new`, source);
      }
      return result;
    }) as typeof fs.promises.stat);
    const outcome = await documents.ingestFile({ sourcePath: source, originalName: "from-a-stick.txt", move: true });
    expect(outcome.status).toBe("created");
    expect(outcome.note).toMatch(/left where it was/);
    expect(fs.readFileSync(source, "utf8")).toBe("A newer version.");
    expect(fs.readFileSync(path.join(location.path, outcome.document.relPath), "utf8")).toBe("The version that was read.");
  });
});

describe("moveOriginal across drives", () => {
  const files = () => {
    const dir = path.join(app.dir, "move");
    fs.mkdirSync(dir, { recursive: true });
    const from = path.join(dir, "original.txt");
    fs.writeFileSync(from, "The original.");
    return { from, to: path.join(dir, "copy.txt"), identity: identityOf(fs.lstatSync(from, { bigint: true })) };
  };

  it("copies through the file it opened and removes the original by name only while it is still that file", async () => {
    const { from, to, identity } = files();
    vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(exdev());
    expect(await moveOriginal(from, to, identity, "original.txt", "the test folder")).toEqual({ leftAtSource: false });
    expect(fs.readFileSync(to, "utf8")).toBe("The original.");
    expect(fs.existsSync(from)).toBe(false);
  });

  it("keeps the original when it changed after it was copied", async () => {
    const { from, to, identity } = files();
    vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(exdev());
    const lstat = fs.promises.lstat;
    vi.spyOn(fs.promises, "lstat").mockImplementation((async (file: fs.PathLike, ...rest: unknown[]) => {
      if (String(file) === from && fs.existsSync(to)) fs.writeFileSync(from, "Saved again, longer than before.");
      return lstat(file, ...(rest as []));
    }) as typeof fs.promises.lstat);
    expect(await moveOriginal(from, to, identity, "original.txt", "the test folder")).toEqual({ leftAtSource: true });
    expect(fs.readFileSync(from, "utf8")).toBe("Saved again, longer than before.");
    expect(fs.readFileSync(to, "utf8")).toBe("The original.");
  });

  it("refuses a link in the original's place, copying nothing", async () => {
    const { from, to, identity } = files();
    fs.rmSync(from);
    fs.symlinkSync(path.join(app.dir, "elsewhere.txt"), from);
    vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(exdev());
    await expect(moveOriginal(from, to, identity, "original.txt", "the test folder")).rejects.toMatchObject({ code: "conflict" });
    expect(fs.existsSync(to)).toBe(false);
    expect(fs.lstatSync(from).isSymbolicLink()).toBe(true);
  });
});
