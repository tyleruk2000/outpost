/**
 * A socket's "data" chunk as bytes. Node's types say a chunk may be a string, which it is
 * only after `setEncoding`; Outpost never sets one on a socket that speaks a binary
 * protocol, so this only narrows the type, and turns a string back into its UTF-8 bytes
 * should one ever arrive.
 */
export function socketBytes(chunk: string | Buffer): Buffer {
  return typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
}
