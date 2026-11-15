/**
 * Regression tests for defects found by security review. Each one describes the
 * attack it guards against.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { afterEach, describe, expect, it } from "vitest";
import { scanConstructs } from "../src/modules/imports/convert.ts";
import { markdownToDoc } from "../src/modules/notes/content/index.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const raw = (method: string, url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  app!.app.inject({ method: method as "GET", url, headers: { host: "localhost", ...headers }, payload: payload as never });

describe("sign-in cannot be sidestepped by disguising the address", () => {
  const disguises = ["/%61pi", "/a%70i", "/ap%69", "/%61%70%69", "/API", "//api", "/./api", "/api/../api"];
  const targets = ["/documents", "/search?q=secret", "/settings", "/storage/locations", "/collections", "/downloads", "/jobs", "/events", "/catalog", "/system", "/notes/tree", "/retrieval/overview"];

  it("requires a session for every API route however the path is written", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    await app.api("POST", "/api/auth/setup", { username: "keeper", password: "lantern on the north shelf" });
    app.ctx.services.search.upsert({ kind: "note", entityId: "n", title: "Private", url: "/notes/n", sections: [{ text: "the secret passphrase" }] });

    for (const target of targets) {
      const plain = await raw("GET", `/api${target}`);
      expect(plain.statusCode, `/api${target}`).toBe(401);
      for (const disguise of disguises) {
        const response = await raw("GET", `${disguise}${target}`);
        // Either the router does not take it for an API route at all (and answers with the
        // web app's page or an error), or it does and sign-in is enforced. It never answers with data.
        const servedData = response.statusCode === 200 && String(response.headers["content-type"]).includes("json");
        expect(servedData, `${disguise}${target} -> ${response.statusCode}`).toBe(false);
        expect(response.body).not.toContain("secret passphrase");
      }
    }
  });

  it("applies the cross-site checks to disguised addresses too", async () => {
    app = await createTestApp();
    for (const prefix of ["/%61pi", "/a%70i"]) {
      const forged = await raw("PATCH", `${prefix}/settings`, { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json" }, { "downloads.concurrency": 7 });
      expect(forged.statusCode).toBe(403);
      const noHeader = await raw("PATCH", `${prefix}/settings`, { "content-type": "application/json" }, { "downloads.concurrency": 7 });
      expect(noHeader.statusCode).toBe(403);
    }
    expect((await app.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(2);
  });

  it("still serves the few routes that must work before signing in", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    expect((await raw("GET", "/api/health")).statusCode).toBe(200);
    expect((await raw("GET", "/api/auth/session")).statusCode).toBe(200);
    expect((await raw("GET", "/%61pi/health")).statusCode).toBe(200);
  });
});

describe("guessing passwords", () => {
  const guess = (username: string, password: string) => app!.api("POST", "/api/auth/login", { username, password });

  it("counts a burst of guesses sent together, not just the ones that finish first", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    await app.api("POST", "/api/auth/setup", { username: "keeper", password: "lantern on the north shelf" });
    const burst = await Promise.all(Array.from({ length: 12 }, (_, index) => guess("keeper", `wrong guess number ${index}`)));
    const refused = burst.filter((response) => response.status === 403).length;
    // Five misses are allowed per account; the rest of the burst is turned away unchecked.
    expect(refused).toBeGreaterThanOrEqual(6);
    expect((await guess("keeper", "lantern on the north shelf")).status).toBe(403);
  });

  it("does not let a sign-in to one account reset the count for another", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    const setup = await app.api("POST", "/api/auth/setup", { username: "keeper", password: "lantern on the north shelf" });
    const cookie = String(setup.headers["set-cookie"]).split(";")[0]!;
    await app.api("POST", "/api/users", { username: "guest", password: "a long enough password", role: "member" }, { headers: { cookie } });
    let evaluated = 0;
    for (let round = 0; round < 4; round += 1) {
      for (let attempt = 0; attempt < 3; attempt += 1) if ((await guess("keeper", `guess ${round}-${attempt}`)).status === 401) evaluated += 1;
      await guess("guest", "a long enough password");
    }
    // Twelve guesses at the administrator were sent; only the first few were even checked.
    expect(evaluated).toBeLessThanOrEqual(5);
  });

  it("asks for the current password before changing your own", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    const setup = await app.api("POST", "/api/auth/setup", { username: "keeper", password: "lantern on the north shelf" });
    const cookie = String(setup.headers["set-cookie"]).split(";")[0]!;
    const id = setup.body.user.id as string;
    const without = await app.api("POST", `/api/users/${id}/password`, { password: "a brand new password" }, { headers: { cookie } });
    expect(without.status).toBe(403);
    const wrong = await app.api("POST", `/api/users/${id}/password`, { password: "a brand new password", currentPassword: "not it at all" }, { headers: { cookie } });
    expect(wrong.status).toBe(403);
    const right = await app.api("POST", `/api/users/${id}/password`, { password: "a brand new password", currentPassword: "lantern on the north shelf" }, { headers: { cookie } });
    expect(right.status).toBe(200);
  });
});

describe("smaller hardening", () => {
  it("never lists an unbounded number of jobs", async () => {
    app = await createTestApp();
    for (const limit of ["-1", "0", "abc", "999999"]) {
      const response = await app.api("GET", `/api/jobs?limit=${limit}`);
      expect(response.status).toBe(200);
    }
  });
});

describe("large uploads", () => {
  it("are refused before the body is read unless an administrator sends the right kind of file", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    const setup = await app.api("POST", "/api/auth/setup", { username: "keeper", password: "lantern on the north shelf" });
    const admin = String(setup.headers["set-cookie"]).split(";")[0]!;
    await app.api("POST", "/api/users", { username: "guest", password: "a long enough password", role: "member" }, { headers: { cookie: admin } });
    const member = String((await app.api("POST", "/api/auth/login", { username: "guest", password: "a long enough password" })).headers["set-cookie"]).split(";")[0]!;
    const big = Buffer.alloc(2 * 1024 * 1024, 65);

    for (const url of ["/api/backup/restore", "/api/semantic/import"]) {
      // A member, with a type the server would otherwise buffer whole.
      const asMember = await raw("POST", url, { cookie: member, "x-outpost-request": "1", "content-type": "text/plain" }, big);
      expect(asMember.statusCode, url).toBe(403);
      // Nobody signed in.
      expect((await raw("POST", url, { "x-outpost-request": "1", "content-type": "text/plain" }, big)).statusCode).toBe(401);
      // An administrator, but not one of the streamed types.
      const wrongType = await raw("POST", url, { cookie: admin, "x-outpost-request": "1", "content-type": "text/plain" }, big);
      expect(wrongType.statusCode, url).toBe(415);
    }
  });
});

describe("restoring a backup someone else made", () => {
  it("does not bring their sign-ins, their queued work or their download hosts", async () => {
    // The "attacker's" Outpost: an account, a session, a queued job and a manifest of their choosing.
    const theirs = await createTestApp({ OUTPOST_AUTH: "on" });
    const setup = await theirs.api("POST", "/api/auth/setup", { username: "mallory", password: "a perfectly fine password" });
    const theirCookie = String(setup.headers["set-cookie"]).split(";")[0]!;
    fs.mkdirSync(path.join(theirs.ctx.config.dataDir, "catalog"), { recursive: true });
    fs.writeFileSync(path.join(theirs.ctx.config.dataDir, "catalog", "evil.json"), JSON.stringify({ schemaVersion: 1, id: "evil", name: "Evil", description: "x", maintainers: [], downloadHosts: ["evil.example"], entries: [] }));
    theirs.ctx.sqlite.prepare("INSERT INTO jobs (id, type, queue, state, title, payload, created_at, updated_at) VALUES ('j1', 'documents.move', 'transfer', 'queued', 'Planted', '{}', 1, 1)").run();
    const backup = (await theirs.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost", cookie: theirCookie } })).rawPayload;
    await theirs.close();

    // The victim restores it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-restore-sec-"));
    let mine = await createTestApp({ OUTPOST_AUTH: "on" }, dir);
    const mySetup = await mine.api("POST", "/api/auth/setup", { username: "keeper", password: "lantern on the north shelf" });
    const myCookie = String(mySetup.headers["set-cookie"]).split(";")[0]!;
    const staged = await mine.app.inject({ method: "POST", url: "/api/backup/restore", headers: { host: "localhost", cookie: myCookie, "x-outpost-request": "1", "content-type": "application/zip" }, payload: backup });
    expect(staged.statusCode).toBe(200);
    await mine.close();
    mine = await createTestApp({ OUTPOST_AUTH: "on" }, dir);
    app = mine;

    // Their session cookie is not a way in.
    expect((await mine.app.inject({ method: "GET", url: "/api/settings", headers: { host: "localhost", cookie: theirCookie } })).statusCode).toBe(401);
    expect(mine.ctx.sqlite.prepare("SELECT count(*) AS n FROM sessions").get()).toEqual({ n: 0 });
    expect(mine.ctx.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE id = 'j1'").get()).toEqual({ n: 0 });
    expect(fs.existsSync(path.join(mine.ctx.config.dataDir, "catalog", "evil.json"))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses an archive that expands far beyond its size", async () => {
    app = await createTestApp();
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "outpost-bomb-")), "bomb.zip");
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const done = new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(file);
      out.on("close", () => resolve());
      archive.on("error", reject);
      archive.pipe(out);
    });
    archive.append(JSON.stringify({ format: "outpost-backup", version: 1, appVersion: "0.1.0", createdAt: "2026-01-01T00:00:00Z", migrations: 1 }), { name: "manifest.json" });
    archive.append(Buffer.alloc(300 * 1024 * 1024), { name: "attachments/zeros.bin" });
    await archive.finalize();
    await done;
    const payload = fs.readFileSync(file);
    expect(payload.length).toBeLessThan(1024 * 1024);
    const response = await app.app.inject({ method: "POST", url: "/api/backup/restore", headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" }, payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/expands far more/);
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "restore-pending"))).toBe(false);
  });
});

describe("hostile files cannot freeze or exhaust the server", () => {
  it("scans Markdown made of unclosed code fences in linear time", () => {
    const hostile = "```x\n".repeat(60_000);
    const started = performance.now();
    scanConstructs("markdown", hostile);
    // The old pattern took about nine seconds on a file this size.
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("converts Markdown full of unclosed <summary> tags in linear time", () => {
    const hostile = `<details>${"<summary>".repeat(60_000)}\n\ntext\n\n</details>`;
    const started = performance.now();
    const { doc } = markdownToDoc(hostile);
    expect(doc.type).toBe("doc");
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it("still reads fenced code and summaries correctly", () => {
    expect(scanConstructs("markdown", "text\n```\n$$ not maths $$\n```\nmore")).toEqual(scanConstructs("markdown", "text\nmore"));
    const { doc } = markdownToDoc("<details>\n<summary>Kit <b>list</b></summary>\n\nStove and gas.\n\n</details>");
    expect(JSON.stringify(doc)).toContain("detailsSummary");
    expect(JSON.stringify(doc)).toContain("Stove and gas.");
  });

  it("refuses a GPX file that would balloon in memory, and keeps answering other requests", async () => {
    app = await createTestApp();
    const hostile = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${'<a b="1"/>'.repeat(900_000)}</trkseg></trk></gpx>`;
    const form = new FormData();
    form.set("file", new Blob([hostile], { type: "application/gpx+xml" }), "bomb.gpx");
    const encoded = new Response(form);
    const pending = app.app.inject({
      method: "POST",
      url: "/api/maps/tracks/import",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
    // While that file is being chewed on, the server still answers.
    const started = performance.now();
    expect((await app.api("GET", "/api/health")).status).toBe(200);
    expect(performance.now() - started).toBeLessThan(1000);
    const response = await pending;
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/too complex/);
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
  }, 60_000);
});
