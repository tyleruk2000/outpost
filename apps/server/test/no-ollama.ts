/**
 * Keeps the test suite off the address a real Ollama listens on.
 *
 * A machine that runs these tests may have Ollama installed, running or not, with
 * whatever models its owner fetched. No test may depend on that, so here every
 * connection to port 11434, on any host, is refused before it is made, exactly as if
 * nothing were listening, and the test that tried it fails. A test that needs a model
 * server starts the stand-in (model-server.ts) and names its address.
 *
 * Loaded for every test file (see vitest.config.ts).
 */
import net from "node:net";
import { afterEach, expect } from "vitest";

/** The port Ollama listens on unless told otherwise. */
const OLLAMA_PORT = 11434;

const attempts: string[] = [];
const connect = net.Socket.prototype.connect;

// biome-ignore lint/suspicious/noExplicitAny: the arguments are passed through as they came
net.Socket.prototype.connect = function guarded(this: net.Socket, ...args: any[]) {
  // `net.connect` hands its arguments over already gathered into one list; a direct call gives them loose.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const port = first && typeof first === "object" ? first.port : first;
  const host = first && typeof first === "object" ? first.host : args[1];
  if (Number(port) === OLLAMA_PORT) {
    attempts.push(`${typeof host === "string" && host ? host : "localhost"}:${OLLAMA_PORT}`);
    const refused = Object.assign(new Error(`connect ECONNREFUSED ${OLLAMA_PORT} (refused by the test suite, see test/no-ollama.ts)`), {
      code: "ECONNREFUSED",
    });
    process.nextTick(() => this.destroy(refused));
    return this;
  }
  return connect.apply(this, args as never);
} as typeof connect;

afterEach(() => {
  const made = attempts.splice(0);
  expect(made, "a test contacted the address a real Ollama listens on; point it at the stand-in or at a port nothing uses").toEqual([]);
});
