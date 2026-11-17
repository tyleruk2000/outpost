/**
 * Compresses the API's larger JSON answers on the way out (the catalogue is about 390 kB
 * as JSON, a tenth of that compressed), with Node's own zlib.
 *
 * Only a whole JSON answer is compressed: one the route returned as an object or a
 * string. A stream (the live-events stream, a download, a document's file), a tile or
 * a picture, an answer that already carries a Content-Encoding and anything under
 * `MIN_BYTES` go out as they are. Brotli at a low quality is used where the browser
 * takes it, because it is both smaller and quicker than gzip at that level; gzip
 * otherwise. Done on the thread pool, not on the request's own thread.
 */
import { promisify } from "node:util";
import zlib from "node:zlib";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** Below this an answer is sent as it is: the saving would be a few hundred bytes at most. */
export const MIN_BYTES = 1024;

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const BROTLI_OPTIONS = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } };
const GZIP_OPTIONS = { level: 6 };

/** The encoding to use for this request, from its Accept-Encoding, or undefined for none. */
export function chooseEncoding(accept: string | undefined): "br" | "gzip" | undefined {
  if (!accept) return undefined;
  const offered = new Map<string, number>();
  for (const part of accept.toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    const q = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)?.[1]).find(Boolean);
    if (name) offered.set(name.trim(), q === undefined ? 1 : Number(q));
  }
  const takes = (name: string) => (offered.get(name) ?? offered.get("*") ?? 0) > 0;
  if (takes("br")) return "br";
  if (takes("gzip")) return "gzip";
  return undefined;
}

async function compressPayload(request: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> {
  if (request.method === "HEAD" || reply.hasHeader("content-encoding")) return payload;
  if (typeof payload !== "string" && !Buffer.isBuffer(payload)) return payload;
  const type = String(reply.getHeader("content-type") ?? "");
  if (!type.startsWith("application/json")) return payload;
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (bytes.length < MIN_BYTES) return payload;
  // A cache between here and the browser must keep the two forms apart.
  reply.header("vary", "accept-encoding");
  const encoding = chooseEncoding(request.headers["accept-encoding"]);
  if (!encoding) return payload;
  const packed = encoding === "br" ? await brotli(bytes, BROTLI_OPTIONS) : await gzip(bytes, GZIP_OPTIONS);
  reply.header("content-encoding", encoding);
  reply.removeHeader("content-length");
  return packed;
}

export function registerJsonCompression(app: FastifyInstance): void {
  app.addHook("onSend", async (request, reply, payload) => compressPayload(request, reply, payload));
}
