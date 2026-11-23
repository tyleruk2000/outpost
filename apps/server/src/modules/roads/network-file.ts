/**
 * A road network on disk: one binary file per network, `roads/<id>.roads` in the data
 * directory. A file rather than SQLite rows because the network is read whole and used
 * whole: routing needs every edge in memory as typed arrays, and a file of those arrays
 * loads in one read with no parsing (Great Britain's in well under a second on a Pi),
 * where millions of rows would be slower to write, to read and to vacuum away on update.
 *
 * Layout: "OPROADS1", a little-endian u32 length, a JSON header (strings, crossings,
 * the array lengths), padding to 8 bytes, then each array in `ARRAYS` order, each padded
 * to 8 bytes. Numbers are little-endian, as every machine Outpost runs on is.
 */
import fs from "node:fs";
import type { PbfHeader } from "../layers/adapters/pbf.ts";
import type { CrossingInfo, RoadNetworkData } from "./build.ts";

const MAGIC = "OPROADS1";
export const FORMAT_VERSION = 1;

type ArrayKey =
  | "nodeId"
  | "nodeLat"
  | "nodeLon"
  | "junctionNode"
  | "junctionRef"
  | "junctionName"
  | "edgeFrom"
  | "edgeTo"
  | "edgeLength"
  | "edgeFixed"
  | "edgeClass"
  | "edgeFlags"
  | "edgeMaxspeed"
  | "edgeRef"
  | "edgeIntRef"
  | "edgeName"
  | "edgeSignF"
  | "edgeSignB"
  | "shapeStart"
  | "shape"
  | "edgeCrossing";

const ARRAYS: Array<[ArrayKey, new (buffer: ArrayBuffer, offset: number, length: number) => ArrayBufferView]> = [
  ["nodeId", Float64Array],
  ["nodeLat", Int32Array],
  ["nodeLon", Int32Array],
  ["junctionNode", Uint32Array],
  ["junctionRef", Uint32Array],
  ["junctionName", Uint32Array],
  ["edgeFrom", Uint32Array],
  ["edgeTo", Uint32Array],
  ["edgeLength", Float32Array],
  ["edgeFixed", Float32Array],
  ["edgeClass", Uint8Array],
  ["edgeFlags", Uint8Array],
  ["edgeMaxspeed", Uint8Array],
  ["edgeRef", Uint32Array],
  ["edgeIntRef", Uint32Array],
  ["edgeName", Uint32Array],
  ["edgeSignF", Uint32Array],
  ["edgeSignB", Uint32Array],
  ["shapeStart", Uint32Array],
  ["shape", Int32Array],
  ["edgeCrossing", Int32Array],
];

/** What the file says about itself, beside the arrays. */
export interface NetworkFileMeta {
  version: number;
  /** ISO alpha-2 of the country the network is for, used for its typical speeds; null when not known. */
  country: string | null;
  name: string;
  header: PbfHeader;
}

export interface LoadedNetwork extends Omit<RoadNetworkData, "stats" | "header"> {
  meta: NetworkFileMeta;
}

const pad8 = (n: number) => (8 - (n % 8)) % 8;

export async function writeNetworkFile(
  filePath: string,
  data: RoadNetworkData,
  meta: Omit<NetworkFileMeta, "version" | "header">,
): Promise<number> {
  const header = JSON.stringify({
    meta: { version: FORMAT_VERSION, header: data.header, ...meta },
    strings: data.strings,
    crossings: data.crossings,
    lengths: Object.fromEntries(ARRAYS.map(([key]) => [key, (data[key] as unknown as { length: number }).length])),
  });
  const json = Buffer.from(header, "utf8");
  const head = Buffer.alloc(8 + 4);
  head.write(MAGIC, 0, "ascii");
  head.writeUInt32LE(json.length, 8);
  const tmp = `${filePath}.part`;
  const handle = await fs.promises.open(tmp, "w");
  let written = 0;
  const put = async (bytes: Uint8Array) => {
    await handle.write(bytes);
    written += bytes.length;
  };
  try {
    await put(head);
    await put(json);
    await put(new Uint8Array(pad8(written)));
    for (const [key] of ARRAYS) {
      const array = data[key] as unknown as ArrayBufferView;
      await put(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      await put(new Uint8Array(pad8(written)));
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.rename(tmp, filePath);
  return written;
}

export async function readNetworkFile(filePath: string): Promise<LoadedNetwork> {
  const file = await fs.promises.readFile(filePath);
  // Typed arrays need their offsets aligned: a buffer from a shared pool may not be.
  const bytes = file.byteOffset % 8 === 0 ? file : Buffer.from(file);
  if (bytes.toString("ascii", 0, 8) !== MAGIC) throw new Error("This is not an Outpost routes file.");
  const jsonLength = bytes.readUInt32LE(8);
  const parsed = JSON.parse(bytes.toString("utf8", 12, 12 + jsonLength)) as {
    meta: NetworkFileMeta;
    strings: string[];
    crossings: CrossingInfo[];
    lengths: Record<ArrayKey, number>;
  };
  if (parsed.meta.version !== FORMAT_VERSION) throw new Error("These routes were built by another version of Outpost: build them again.");
  let at = 12 + jsonLength;
  at += pad8(at);
  const out: Record<string, unknown> = { meta: parsed.meta, strings: parsed.strings, crossings: parsed.crossings };
  for (const [key, Kind] of ARRAYS) {
    const length = parsed.lengths[key];
    const per = (Kind as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
    if (at + length * per > bytes.length) throw new Error("The routes file is cut short: build it again.");
    out[key] = new Kind(bytes.buffer as ArrayBuffer, bytes.byteOffset + at, length);
    at += length * per;
    at += pad8(at);
  }
  return out as unknown as LoadedNetwork;
}
