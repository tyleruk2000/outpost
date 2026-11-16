/**
 * Worker-thread entry point for the built-in embedding model.
 *
 * Turning one passage into a vector is tens of milliseconds to seconds of
 * uninterruptible arithmetic, so none of it happens in the server's own thread. The
 * model (all-MiniLM-L6-v2, 8-bit ONNX) is run by ONNX Runtime compiled to WebAssembly:
 * no native code, so the same files work wherever Node does. The worker stays loaded
 * between requests, because a search has to embed its question quickly; the server ends
 * it after a spell of nothing to do.
 *
 * How a text becomes a vector is fixed here and must match what the model was trained
 * with (the test suite compares against the model's own library):
 *   1. the model's tokenizer cuts the text into word pieces, with its markers at both ends;
 *   2. the model gives one vector per word piece, and their mean is the text's vector;
 *   3. that is scaled to length 1, so a dot product of two vectors is their cosine similarity.
 * A text longer than the model can read at once is read in consecutive stretches, and
 * its vector is the mean of theirs, each counted by its length (see `stretches.ts`). A
 * text that fits, which every search question does, is one stretch and is unaffected.
 * Texts are run one at a time. Batching would be no faster here, and an 8-bit model
 * picks its number ranges from the whole batch, so a passage's vector would depend on
 * its neighbours.
 *
 * Nothing in this file, or in the libraries it loads, is given a way to reach the
 * network: the runtime and the model are read from the paths handed over.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-web";
import type { EmbedReply, EmbedRequest, EmbedWorkerData } from "./embed-types.ts";
import { stretchesOf } from "./stretches.ts";

const send = (message: EmbedReply, transfer: ArrayBuffer[] = []) => parentPort?.postMessage(message, transfer);

/** A problem a person can do something about; its message is shown as it is. */
class EmbedError extends Error {}

/**
 * No real passage or question comes near this many characters; it only stops a freak
 * input from being cut into a million word pieces that are then thrown away.
 */
const MAX_CHARACTERS = 50_000;

interface Loaded {
  dimensions: number;
  embed(text: string): Promise<Float32Array>;
}

async function load(data: EmbedWorkerData): Promise<Loaded> {
  const { model } = data;
  const read = (file: { path: string; sha256: string }): Buffer => {
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(path.join(data.modelDir, file.path));
    } catch {
      throw new EmbedError(`The built-in model's file ${file.path} could not be read.`);
    }
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      throw new EmbedError(
        `The built-in model's file ${file.path} does not match its checksum, so it is damaged or is not the file Outpost was built with. Install Outpost again.`,
      );
    }
    return bytes;
  };

  const tokenizer = new Tokenizer(
    JSON.parse(read(model.files.tokenizer).toString("utf8")),
    JSON.parse(read(model.files.tokenizerConfig).toString("utf8")),
  );

  ort.env.wasm.numThreads = data.threads;
  // Both files are named outright, so the runtime never has to guess where they are, and
  // never falls back to the address it would use in a browser.
  ort.env.wasm.wasmPaths = { mjs: pathToFileURL(data.runtime.loader).href, wasm: pathToFileURL(data.runtime.binary).href };
  ort.env.wasm.wasmBinary = fs.readFileSync(data.runtime.binary);
  ort.env.logLevel = "error";
  const session = await ort.InferenceSession.create(read(model.files.model), { executionProviders: ["wasm"] });
  const wantsTypes = session.inputNames.includes("token_type_ids");

  /** One run of the model: these word pieces, markers included, to their mean vector at length 1. */
  async function runModel(ids: number[]): Promise<Float32Array> {
    const length = ids.length;
    const shape = [1, length];
    const inputIds = new BigInt64Array(length);
    for (let token = 0; token < length; token += 1) inputIds[token] = BigInt(ids[token]!);
    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor("int64", inputIds, shape),
      attention_mask: new ort.Tensor("int64", new BigInt64Array(length).fill(1n), shape),
    };
    if (wantsTypes) feeds.token_type_ids = new ort.Tensor("int64", new BigInt64Array(length), shape);
    const output = (await session.run(feeds)).last_hidden_state;
    if (!output || output.dims[2] !== model.dimensions) throw new Error("The model answered in a shape that was not expected.");
    const hidden = output.data as Float32Array;
    const vector = new Float32Array(model.dimensions);
    for (let token = 0; token < length; token += 1) {
      const base = token * model.dimensions;
      for (let index = 0; index < model.dimensions; index += 1) vector[index] = vector[index]! + hidden[base + index]!;
    }
    for (let index = 0; index < model.dimensions; index += 1) vector[index] = vector[index]! / length;
    output.dispose();
    return toLengthOne(vector);
  }

  return {
    dimensions: model.dimensions,
    async embed(text) {
      const ids = tokenizer.encode(text.length > MAX_CHARACTERS ? text.slice(0, MAX_CHARACTERS) : text).ids;
      // The first and last ids are the model's opening and closing markers; every stretch gets its own pair.
      const stretches = stretchesOf(ids.length - 2, model.maxTokens - 2);
      if (stretches.length === 1) return runModel(ids);
      const opening = ids[0]!;
      const closing = ids[ids.length - 1]!;
      const vector = new Float32Array(model.dimensions);
      for (const stretch of stretches) {
        const part = await runModel([opening, ...ids.slice(1 + stretch.start, 1 + stretch.end), closing]);
        const weight = stretch.end - stretch.start;
        for (let index = 0; index < model.dimensions; index += 1) vector[index] = vector[index]! + weight * part[index]!;
      }
      return toLengthOne(vector);
    },
  };
}

function toLengthOne(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let index = 0; index < vector.length; index += 1) sum += vector[index]! * vector[index]!;
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let index = 0; index < vector.length; index += 1) vector[index] = vector[index]! / norm;
  return vector;
}

interface Task {
  id: number;
  texts: string[];
  urgent: boolean;
  next: number;
  vectors: Float32Array;
}

const tasks: Task[] = [];
let working = false;

/**
 * Works through what has been asked for, one text at a time. A question somebody is
 * waiting on goes ahead of passages being indexed, and between any two texts the worker
 * looks for new messages, so a request can be withdrawn part of the way through.
 */
async function work(model: Loaded): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (;;) {
      const task = tasks.find((candidate) => candidate.urgent) ?? tasks[0];
      if (!task) break;
      try {
        if (task.next < task.texts.length) {
          task.vectors.set(await model.embed(task.texts[task.next]!), task.next * model.dimensions);
          task.next += 1;
          // Says "still working" during a long request, so that slow is never mistaken for stuck.
          send({ kind: "alive" });
        }
        if (task.next >= task.texts.length && tasks.includes(task)) {
          tasks.splice(tasks.indexOf(task), 1);
          send({ kind: "vectors", id: task.id, dimensions: model.dimensions, data: task.vectors }, [task.vectors.buffer as ArrayBuffer]);
        }
      } catch (error) {
        if (tasks.includes(task)) tasks.splice(tasks.indexOf(task), 1);
        send({ kind: "failed", id: task.id, message: error instanceof Error ? error.message : String(error) });
      }
      // The runtime computes without yielding; this is where messages get their turn.
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    working = false;
  }
}

try {
  const started = performance.now();
  const model = await load(workerData as EmbedWorkerData);
  // One run before saying "ready": it proves the model answers, and the first run is the slow one.
  await model.embed("outpost");
  parentPort?.on("message", (message: EmbedRequest) => {
    if (message.kind === "cancel") {
      const index = tasks.findIndex((task) => task.id === message.id);
      if (index !== -1) tasks.splice(index, 1);
      return;
    }
    tasks.push({
      id: message.id,
      texts: message.texts,
      urgent: message.urgent,
      next: 0,
      vectors: new Float32Array(message.texts.length * model.dimensions),
    });
    void work(model);
  });
  send({ kind: "ready", dimensions: model.dimensions, loadMs: Math.round(performance.now() - started) });
} catch (error) {
  send({ kind: "fatal", message: error instanceof Error ? error.message : String(error), friendly: error instanceof EmbedError });
}
