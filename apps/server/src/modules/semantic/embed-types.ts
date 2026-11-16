/**
 * Messages between the server thread and the worker that runs the built-in embedding
 * model. Kept free of imports that run code, so both sides can load it cheaply.
 */
import type { BuiltInModel, RuntimeFiles } from "./built-in-model.ts";

/** What the worker is started with. */
export interface EmbedWorkerData {
  model: BuiltInModel;
  /** Folder holding the model's files. */
  modelDir: string;
  runtime: RuntimeFiles;
  threads: number;
}

export type EmbedRequest =
  /** `urgent` texts (a question somebody is waiting on) go ahead of passages being indexed. */
  | { kind: "embed"; id: number; texts: string[]; urgent: boolean }
  /** Forget a request that has not been answered yet. */
  | { kind: "cancel"; id: number };

export type EmbedReply =
  /** The model is loaded and has answered once. */
  | { kind: "ready"; dimensions: number; loadMs: number }
  /** One vector per text, end to end, in the order asked for. */
  | { kind: "vectors"; id: number; dimensions: number; data: Float32Array }
  | { kind: "failed"; id: number; message: string }
  /** Sent after every text, so a long request is never mistaken for a stuck worker. */
  | { kind: "alive" }
  /** The model could not be loaded at all. `friendly` messages are written for people. */
  | { kind: "fatal"; message: string; friendly: boolean };
