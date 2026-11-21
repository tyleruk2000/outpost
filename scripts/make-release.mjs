#!/usr/bin/env node
/**
 * Makes the files of an Outpost release for one platform. See docs/development/releases.md.
 *
 *   node scripts/make-release.mjs --release 0.2.0 --platform linux/arm64 --image image.tar.gz [--notes "…"] [--latest URL]
 *       writes release.json (or latest.json with --latest, the release file's address), to sign with minisign -S
 *   node scripts/make-release.mjs --bundle --release 0.2.0 --platform linux/arm64 --image image.tar.gz
 *       checks release.json.minisig against deploy/release-key.pub, then writes outpost-0.2.0-linux-arm64.outpost-update
 *
 * It signs nothing itself: the release key's secret half is used only by minisign.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { parsePublicKey, verifyBytes } from "../apps/server/src/modules/update/minisign.ts";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "apps/server/package.json"));
const { ZipArchive } = require("archiver");

const { values } = parseArgs({
  options: {
    release: { type: "string" },
    platform: { type: "string" },
    image: { type: "string" },
    notes: { type: "string" },
    latest: { type: "string" },
    bundle: { type: "boolean", default: false },
    out: { type: "string", default: "." },
  },
});
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
if (!values.release || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(values.release)) fail("--release 0.2.0 is needed.");
if (!values.platform || !/^linux\/(arm64|amd64)$/.test(values.platform)) fail("--platform linux/arm64 or linux/amd64 is needed.");
if (!values.image || !fs.existsSync(values.image)) fail("--image, the gzipped output of docker save, is needed.");
const out = path.resolve(values.out);

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

if (!values.bundle) {
  const manifest = {
    format: "outpost-release",
    version: 1,
    release: values.release,
    publishedAt: new Date().toISOString(),
    notes: values.notes ?? null,
    platforms: {
      [values.platform]: {
        file: "image.tar.gz",
        bytes: fs.statSync(values.image).size,
        sha256: await sha256(values.image),
        image: `outpost:${values.release}`,
        ...(values.latest ? { url: values.latest } : {}),
      },
    },
  };
  const name = values.latest ? "latest.json" : "release.json";
  fs.writeFileSync(path.join(out, name), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${name}. Sign it: minisign -S -s outpost-release.key -m ${name} -t "outpost ${values.release}"`);
} else {
  const text = fs.readFileSync(path.join(out, "release.json"));
  const signature = fs.readFileSync(path.join(out, "release.json.minisig"), "utf8");
  const keyText = fs.readFileSync(path.join(root, "deploy/release-key.pub"), "utf8");
  if (!keyText.trim()) fail("deploy/release-key.pub is empty: make the release key first.");
  verifyBytes(text, signature, parsePublicKey(keyText));
  const manifest = JSON.parse(text.toString("utf8"));
  const entry = manifest.platforms?.[values.platform];
  if (manifest.release !== values.release || !entry) fail("release.json is not for this release and platform.");
  if (entry.sha256 !== (await sha256(values.image))) fail("The image is not the one release.json describes.");
  const file = path.join(out, `outpost-${values.release}-${values.platform.replace("/", "-")}.outpost-update`);
  const archive = new ZipArchive({ store: true });
  const written = fs.createWriteStream(file);
  const done = new Promise((resolve, reject) => {
    written.on("close", resolve);
    archive.on("error", reject);
  });
  archive.pipe(written);
  archive.append(text, { name: "release.json" });
  archive.append(signature, { name: "release.json.minisig" });
  archive.file(values.image, { name: entry.file });
  await archive.finalize();
  await done;
  console.log(`Wrote ${path.relative(process.cwd(), file)}.`);
}
