import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { UpdateStatus } from "@outpost/shared";
import { ZipArchive } from "archiver";
import { afterEach, describe, expect, it } from "vitest";
import { VERSION } from "../src/core/version.ts";
import { parsePublicKey, publicKeyText, signBytes, verifyBytes } from "../src/modules/update/minisign.ts";
import { compareReleases } from "../src/modules/update/release.ts";
import { RELEASE_KEY } from "../src/modules/update/release-key.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const apps: TestApp[] = [];
const servers: http.Server[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve));
});

function testKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const keyId = crypto.randomBytes(8);
  return { secret: privateKey, keyId, text: publicKeyText(publicKey, keyId) };
}
const KEY = testKey();
const PLATFORM = `linux/${process.arch === "x64" ? "amd64" : process.arch}`;
const IMAGE = Buffer.from("not really a docker image, but bytes to hash");

function manifest(release: string, change: Record<string, unknown> = {}, image = IMAGE) {
  return Buffer.from(
    JSON.stringify({
      format: "outpost-release",
      version: 1,
      release,
      publishedAt: "2026-12-01T00:00:00Z",
      notes: "Fixes and a new screen.",
      platforms: {
        [PLATFORM]: {
          file: "image.tar.gz",
          bytes: image.length,
          sha256: crypto.createHash("sha256").update(image).digest("hex"),
          image: `outpost:${release}`,
        },
      },
      ...change,
    }),
  );
}

async function bundle(release: string, options: { key?: typeof KEY; image?: Buffer; manifestText?: Buffer } = {}): Promise<Buffer> {
  const text = options.manifestText ?? manifest(release);
  const signature = signBytes(text, (options.key ?? KEY).secret, (options.key ?? KEY).keyId, `outpost ${release}`);
  const file = path.join(tempDir("outpost-release-"), `outpost-${release}.outpost-update`);
  const archive = new ZipArchive({ store: true });
  const done = new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(file);
    out.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(out);
  });
  archive.append(text, { name: "release.json" });
  archive.append(signature, { name: "release.json.minisig" });
  archive.append(options.image ?? IMAGE, { name: "image.tar.gz" });
  await archive.finalize();
  await done;
  return fs.readFileSync(file);
}

async function world(env: Record<string, string> = {}) {
  const app = await createTestApp({ OUTPOST_RELEASE_KEY: KEY.text, ...env });
  apps.push(app);
  const update = path.join(app.ctx.config.dataDir, "update");
  return {
    app,
    update,
    status: async (extra = {}): Promise<UpdateStatus> => (await app.api("GET", "/api/update/status", undefined, extra)).body,
    async upload(body: Buffer, extra = {}) {
      const response = await app.api("POST", "/api/update/upload", body, {
        ...extra,
        headers: { "content-type": "application/vnd.outpost.update" },
      });
      await app.ctx.jobs.whenIdle();
      return response;
    },
    /** As install.sh leaves it on a Docker install with the update service. */
    asDockerWithHelper() {
      app.ctx.services.update.deps.inContainer = true;
      fs.writeFileSync(path.join(update, "helper"), "test");
    },
    lastJobError: () => app.ctx.jobs.findBySubject("update").at(-1)?.error ?? null,
  };
}

const NEXT = "9.0.0";

describe("minisign signatures", () => {
  it("checks a hashed signature, and refuses changed bytes, another key and a changed trusted comment", () => {
    const data = Buffer.from("release.json contents");
    const signature = signBytes(data, KEY.secret, KEY.keyId, "outpost 9.0.0");
    const key = parsePublicKey(KEY.text);
    expect(verifyBytes(data, signature, key)).toBe("outpost 9.0.0");
    expect(() => verifyBytes(Buffer.from("release.json contentz"), signature, key)).toThrow(/does not match/);
    expect(() => verifyBytes(data, signature, parsePublicKey(testKey().text))).toThrow(/different key/);
    expect(() => verifyBytes(data, signature.replace("outpost 9.0.0", "outpost 9.9.9"), key)).toThrow(/trusted comment/);
  });

  it("checks signatures made by minisign itself, hashed and legacy", async () => {
    // Made with minisign 0.11 (Debian bookworm): minisign -G -W, then -S, and -S -l for the legacy one.
    const fixtures = path.join(import.meta.dirname, "fixtures", "minisign");
    const key = parsePublicKey(fs.readFileSync(path.join(fixtures, "key.pub"), "utf8"));
    const data = fs.readFileSync(path.join(fixtures, "signed-file.bin"));
    expect(verifyBytes(data, fs.readFileSync(path.join(fixtures, "release.json.minisig"), "utf8"), key)).toBe("outpost 9.0.0");
    expect(verifyBytes(data, fs.readFileSync(path.join(fixtures, "legacy.minisig"), "utf8"), key)).toMatch(/^timestamp:/);
    expect(() =>
      verifyBytes(Buffer.concat([data, Buffer.from(" ")]), fs.readFileSync(path.join(fixtures, "release.json.minisig"), "utf8"), key),
    ).toThrow();
  });

  it("reads minisign's own public key format (the key on minisign's page)", () => {
    // From https://jedisct1.github.io/minisign/ (read 21 November 2026).
    const key = parsePublicKey("RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3");
    expect(key.keyId.length).toBe(8);
  });

  it("keeps deploy/release-key.pub, which the update service checks with, the same as the key built in", () => {
    const file = fs.readFileSync(path.join(import.meta.dirname, "../../../deploy/release-key.pub"), "utf8");
    expect(file.trim()).toBe(RELEASE_KEY.trim());
  });

  it("orders releases", () => {
    expect(compareReleases("0.10.0", "0.9.2")).toBe(1);
    expect(compareReleases("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(compareReleases("0.1.0", "0.1.0")).toBe(0);
  });
});

describe("updating from a release file", () => {
  it("checks an uploaded release file and keeps it, then hands it to the update service after a backup", async () => {
    const w = await world();
    w.asDockerWithHelper();
    expect((await w.status()).install).toBe("docker-helper");
    const sent = await w.upload(await bundle(NEXT));
    expect(sent.status).toBe(200);
    const status = await w.status();
    expect(status.staged).toMatchObject({
      release: NEXT,
      platform: PLATFORM,
      image: `outpost:${NEXT}`,
      source: "upload",
      signedComment: `outpost ${NEXT}`,
    });
    expect(fs.readFileSync(path.join(w.update, "staged", "image.tar.gz"))).toEqual(IMAGE);
    // The upload itself is not kept once it has been unpacked.
    expect(fs.readdirSync(path.join(w.update, "incoming"))).toEqual([]);

    expect((await w.app.api("POST", "/api/update/apply")).status).toBe(200);
    await w.app.ctx.jobs.whenIdle();
    const id = fs.readFileSync(path.join(w.update, "request"), "utf8").trim().split(" ");
    expect(id[1]).toBe(NEXT);
    expect(fs.readdirSync(w.update).filter((name) => /^before-9\.0\.0-.*\.zip$/.test(name))).toHaveLength(1);
    expect((await w.status()).waiting).toMatchObject({ release: NEXT, silent: false });
    expect((await w.app.api("POST", "/api/update/apply")).status).toBe(409);

    // The service answers; Outpost reads it.
    fs.writeFileSync(path.join(w.update, "result"), `${id[0]} ok ${NEXT} Outpost ${NEXT} started healthy\n`);
    const after = await w.status();
    expect(after.lastResult).toMatchObject({ outcome: "ok", release: NEXT, message: `Outpost ${NEXT} started healthy` });
    expect(after.waiting).toBeNull();
    expect(after.staged).toBeNull();
  });

  it("after a roll-back keeps the release, and stages the backup made before it when asked", async () => {
    const w = await world();
    w.asDockerWithHelper();
    await w.upload(await bundle(NEXT));
    await w.app.api("POST", "/api/update/apply");
    await w.app.ctx.jobs.whenIdle();
    const [id] = fs.readFileSync(path.join(w.update, "request"), "utf8").trim().split(" ");
    // An answer for another request is not this one's.
    fs.writeFileSync(path.join(w.update, "result"), `someoneelse ok ${NEXT}\n`);
    expect((await w.status()).lastResult).toBeNull();
    fs.writeFileSync(path.join(w.update, "result"), `${id} rolled-back ${NEXT} it did not report healthy\n`);
    const status = await w.status();
    expect(status.lastResult).toMatchObject({ outcome: "rolled-back" });
    expect(status.staged?.release).toBe(NEXT);
    const staged = await w.app.api("POST", "/api/update/restore-before");
    expect(staged.status).toBe(200);
    expect(staged.body).toMatchObject({ staged: true, appVersion: VERSION });
  });

  it("refuses a file not signed by the release key, one whose image was changed, one for another computer, and one not newer", async () => {
    const w = await world();
    await w.upload(await bundle(NEXT, { key: testKey() }));
    expect(w.lastJobError()).toMatch(/not a release signed by Outpost's release key/);
    await w.upload(
      await bundle(NEXT, { manifestText: manifest(NEXT), image: Buffer.from("not really a docker image, but bytes to hasX") }),
    );
    expect(w.lastJobError()).toMatch(/does not match the checksum/);
    await w.upload(
      await bundle(NEXT, { manifestText: manifest(NEXT, { platforms: { "linux/arm64": undefined, "linux/amd64": undefined } }) }),
    );
    expect(w.lastJobError()).toMatch(/not one this version|no image for this computer/);
    await w.upload(await bundle(VERSION));
    expect(w.lastJobError()).toMatch(/Only a newer release is installed/);
    await w.upload(Buffer.from("PK nonsense"));
    expect(w.lastJobError()).toMatch(/not a release file/);
    expect((await w.status()).staged).toBeNull();
    // Nothing is left behind from the files refused.
    expect(fs.readdirSync(w.update).filter((name) => name.startsWith("checking-"))).toEqual([]);
  });

  it("says plainly what a Docker install without the update service, and a build with no release key, can do", async () => {
    const w = await world();
    w.app.ctx.services.update.deps.inContainer = true;
    expect((await w.status()).install).toBe("docker");
    await w.upload(await bundle(NEXT));
    expect((await w.app.api("POST", "/api/update/apply")).body.error.message).toMatch(/cannot install it here by itself/);

    const bare = await world({ OUTPOST_RELEASE_KEY: "" });
    bare.app.ctx.services.update.deps.key = () => null;
    expect((await bare.status()).keyed).toBe(false);
    expect((await bare.upload(await bundle(NEXT))).body.error.message).toMatch(/no release key/);
  });

  it("is refused from another device, before the file is received", async () => {
    const w = await world({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" });
    const phone = { remoteAddress: "192.168.1.20" };
    const refused = await w.upload(await bundle(NEXT), phone);
    expect(refused.status).toBe(403);
    expect(fs.existsSync(path.join(w.update, "incoming"))).toBe(false);
  });

  it("keeps a release ready to install when another device asks to remove it", async () => {
    const w = await world({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" });
    expect((await w.upload(await bundle(NEXT))).status).toBe(200);
    await w.app.ctx.jobs.whenIdle();
    expect((await w.status()).staged?.release).toBe(NEXT);
    const refused = await w.app.api("DELETE", "/api/update/staged", undefined, { remoteAddress: "192.168.1.20" });
    expect(refused.status).toBe(403);
    expect((await w.status()).staged?.release).toBe(NEXT);
    expect((await w.app.api("DELETE", "/api/update/staged")).status).toBe(200);
    expect((await w.status()).staged).toBeNull();
  });

  it("finds a release file on a storage location (a USB stick) and installs from there", async () => {
    const w = await world();
    const stick = await w.app.ctx.services.storage.add({
      name: "USB stick",
      path: path.join(w.app.dir, "storage", "usb"),
      kind: "external",
    });
    fs.mkdirSync(path.join(stick.path, "outpost-updates"));
    fs.writeFileSync(path.join(stick.path, "outpost-updates", `outpost-${NEXT}-linux.outpost-update`), await bundle(NEXT));
    const files = (await w.app.api("GET", "/api/update/files")).body.files;
    expect(files).toEqual([
      expect.objectContaining({ locationName: "USB stick", relPath: `outpost-updates/outpost-${NEXT}-linux.outpost-update` }),
    ]);
    expect(
      (await w.app.api("POST", "/api/update/from-storage", { locationId: stick.id, relPath: "../../etc/passwd.outpost-update" })).status,
    ).toBeGreaterThanOrEqual(400);
    expect((await w.app.api("POST", "/api/update/from-storage", { locationId: stick.id, relPath: files[0].relPath })).status).toBe(200);
    await w.app.ctx.jobs.whenIdle();
    expect((await w.status()).staged).toMatchObject({ release: NEXT, source: "storage" });
    // The file on the stick is the person's: it is left where it was.
    expect(fs.existsSync(path.join(stick.path, files[0].relPath))).toBe(true);
  });
});

describe("checking for a newer version", () => {
  it("asks the release page only when pressed, checks what it says, and fetches the release file", async () => {
    const release = await bundle(NEXT);
    const requests: string[] = [];
    let base = "";
    const server = http.createServer((request, response) => {
      requests.push(request.url ?? "");
      const latest = manifest(NEXT, {
        platforms: {
          [PLATFORM]: {
            file: "image.tar.gz",
            bytes: IMAGE.length,
            sha256: crypto.createHash("sha256").update(IMAGE).digest("hex"),
            image: `outpost:${NEXT}`,
            url: `${base}/outpost-${NEXT}.outpost-update`,
          },
        },
      });
      if (request.url === "/latest.json") return response.end(latest);
      if (request.url === "/latest.json.minisig") return response.end(signBytes(latest, KEY.secret, KEY.keyId, `outpost ${NEXT}`));
      if (request.url === `/outpost-${NEXT}.outpost-update`) return response.end(release);
      response.statusCode = 404;
      response.end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const w = await world({ OUTPOST_UPDATE_URL: base });
    expect((await w.status()).latest).toBeNull();
    expect(requests).toEqual([]);

    const checked = (await w.app.api("POST", "/api/update/check")).body as UpdateStatus;
    expect(checked.latest).toMatchObject({ newer: true, message: null, release: { release: NEXT, notes: "Fixes and a new screen." } });
    expect((await w.app.api("POST", "/api/update/download")).status).toBe(200);
    await w.app.ctx.jobs.whenIdle();
    expect((await w.status()).staged).toMatchObject({ release: NEXT, source: "online" });
  });

  it("stops reading a release page that sends far more than a manifest, without holding it all", async () => {
    let sent = 0;
    let stopped = false;
    const server = http.createServer((_request, response) => {
      // No length given, and no end: a page that would fill the memory of a small computer.
      const chunk = Buffer.alloc(64 * 1024, 0x20);
      const pump = () => {
        while (!stopped && sent < 64 * 1024 * 1024) {
          sent += chunk.length;
          if (!response.write(chunk)) return void response.once("drain", pump);
        }
        response.end();
      };
      response.on("close", () => {
        stopped = true;
      });
      pump();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const w = await world({ OUTPOST_UPDATE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    const checked = (await w.app.api("POST", "/api/update/check")).body as UpdateStatus;
    expect(checked.latest?.message).toBe("The release page sent far more than a release manifest.");
    // Stopped soon after the most a manifest can be (256 KB), not at the end of 64 MB.
    expect(sent).toBeLessThan(8 * 1024 * 1024);
  });

  it("says why when the release page cannot be reached", async () => {
    const w = await world({ OUTPOST_UPDATE_URL: "http://127.0.0.1:9" });
    const checked = (await w.app.api("POST", "/api/update/check")).body as UpdateStatus;
    expect(checked.latest).toMatchObject({ newer: false, release: null });
    expect(checked.latest?.message).toBeTruthy();
  });
});
