#!/usr/bin/env node
/**
 * Builds the vectors for search by meaning on this computer, for another Outpost that is
 * slower (a Raspberry Pi), and sends them to it. One command, from a checkout of Outpost with
 * the model fetched (node scripts/fetch-embedding-model.mjs):
 *
 *   node scripts/build-vectors.mjs http://192.168.1.134:8080
 *
 * It asks that Outpost for the passages it has no vector for yet (GET
 * /api/semantic/passages), reads them here with the same built-in model, using several
 * copies of it at once, and sends the vectors back as an embeddings export (POST
 * /api/semantic/import). The vectors are the ones that Outpost would have made itself:
 * the model's arithmetic is the same on every computer. Its own build, if one is running,
 * carries on with whatever is still missing after the import.
 *
 *   --out <file>    keep the export here too (default: a file in the system's temporary folder)
 *   --no-send       write the file and stop; import it in Settings, under More options
 *   --copies <n>    copies of the model to run at once (default: one per four processor threads)
 *
 * Every passage's text comes to this computer, contacts and notes included, so run it on a
 * computer of your own, on your own network. Nothing is sent anywhere else.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { createBuiltInEmbedder } from "../apps/server/src/modules/semantic/built-in.ts";
import {
  BUILT_IN_MODEL,
  BUILT_IN_MODEL_ID,
  builtInInstallation,
  defaultModelDir,
} from "../apps/server/src/modules/semantic/built-in-model.ts";

const args = process.argv.slice(2);
const base = args.find((arg) => /^https?:\/\//.test(arg))?.replace(/\/$/, "");
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
if (!base) {
  console.error("node scripts/build-vectors.mjs <address of the other Outpost> [--out file] [--no-send] [--copies n]");
  process.exit(2);
}
const found = builtInInstallation(defaultModelDir());
if (!found.installed) {
  console.error(`${found.reason}\nFetch it once with: node scripts/fetch-embedding-model.mjs`);
  process.exit(1);
}
const out = option("--out") ?? path.join(os.tmpdir(), `outpost-embeddings-${Date.now()}.jsonl.gz`);
const copies = Math.max(1, Number(option("--copies") ?? Math.max(1, Math.floor(os.availableParallelism() / 4))));

// 1. What it has no vector for.
const response = await fetch(`${base}/api/semantic/passages?model=${encodeURIComponent(BUILT_IN_MODEL_ID)}`);
if (!response.ok) {
  console.error(`${base} answered ${response.status}: ${await response.text()}`);
  process.exit(1);
}
let header;
const passages = [];
let rest = "";
const decoder = new TextDecoder();
for await (const chunk of Readable.fromWeb(response.body).pipe(createGunzip())) {
  rest += decoder.decode(chunk, { stream: true });
  let newline = rest.indexOf("\n");
  while (newline !== -1) {
    const line = rest.slice(0, newline);
    rest = rest.slice(newline + 1);
    newline = rest.indexOf("\n");
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (!header) header = record;
    else passages.push(record);
  }
}
if (header?.format !== "outpost-passages") {
  console.error(`${base} did not send a list of passages. Is it an Outpost, and a version with this script?`);
  process.exit(1);
}
if (passages.length === 0) {
  console.log("Every passage there already has a vector. Nothing to do.");
  process.exit(0);
}

// 2. Read them here, several at a time.
console.log(`${passages.length} passages to read, with ${copies} ${copies === 1 ? "copy" : "copies"} of ${BUILT_IN_MODEL.name}.`);
const models = Array.from({ length: copies }, () => createBuiltInEmbedder());
const vectors = new Array(passages.length);
const started = Date.now();
let next = 0;
let done = 0;
const report = setInterval(() => {
  const perSecond = done / ((Date.now() - started) / 1000);
  const left = perSecond > 0 ? Math.round((passages.length - done) / perSecond / 60) : null;
  process.stdout.write(`\r${done} of ${passages.length}${left === null ? "" : `, about ${left} min left`}   `);
}, 2000);
const BATCH = 16;
await Promise.all(
  models.map(async (model) => {
    for (;;) {
      const from = next;
      if (from >= passages.length) return;
      next += BATCH;
      const batch = passages.slice(from, from + BATCH);
      const made = await model.embed(
        batch.map((passage) => passage.t),
        "passage",
      );
      made.forEach((vector, index) => {
        vectors[from + index] = vector;
      });
      done += batch.length;
    }
  }),
);
clearInterval(report);
await Promise.all(models.map((model) => model.close()));
console.log(`\r${passages.length} passages read in ${Math.round((Date.now() - started) / 1000)} s.          `);

// 3. Written as an embeddings export, the same file Settings' Export makes.
function* lines() {
  yield `${JSON.stringify({
    format: "outpost-embeddings",
    version: 1,
    modelId: BUILT_IN_MODEL_ID,
    provider: "built-in",
    model: BUILT_IN_MODEL.name,
    dimensions: BUILT_IN_MODEL.dimensions,
    exportedAt: new Date().toISOString(),
  })}\n`;
  for (const [index, passage] of passages.entries()) {
    const vector = vectors[index];
    yield `${JSON.stringify({ h: passage.h, v: Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString("base64") })}\n`;
  }
}
await pipeline(Readable.from(lines()), createGzip(), fs.createWriteStream(out));
console.log(`Written to ${out}.`);
if (args.includes("--no-send")) {
  console.log("Import it there in Settings → Search by meaning → More options → Import.");
  process.exit(0);
}

// 4. Sent back.
const sent = await fetch(`${base}/api/semantic/import`, {
  method: "POST",
  headers: { "Content-Type": "application/gzip", "X-Outpost-Request": "1" },
  body: fs.readFileSync(out),
});
const answer = await sent.json().catch(() => ({}));
if (!sent.ok) {
  console.error(
    `${base} did not take the vectors (${answer.error?.message ?? sent.status}). Import ${out} there in Settings → Search by meaning → More options → Import.`,
  );
  process.exit(1);
}
console.log(`Imported: ${answer.passagesUpdated} passages there now have a vector.`);
process.exit(0);
