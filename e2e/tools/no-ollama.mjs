/**
 * Loaded into every Outpost server the end-to-end suite starts (`node --import`).
 *
 * A machine that runs the suite may have a real Ollama on it. The suite must give the
 * same results whether it does or not, so a server under test is never allowed to reach
 * the port Ollama listens on: the connection is refused before it is made, as if nothing
 * were listening, and the attempt is written to a file that fails the test that caused it
 * (see tests/fixtures.ts). The stand-in model server is on a port of its own.
 */
import fs from "node:fs";
import net from "node:net";

const OLLAMA_PORT = 11434;
const record = process.env.OUTPOST_E2E_OLLAMA_ATTEMPTS;
const connect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function guarded(...args) {
  // `net.connect` hands its arguments over already gathered into one list; a direct call gives them loose.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const port = first && typeof first === "object" ? first.port : first;
  const host = first && typeof first === "object" ? first.host : args[1];
  if (Number(port) === OLLAMA_PORT) {
    if (record) {
      try {
        fs.appendFileSync(record, `${typeof host === "string" && host ? host : "localhost"}:${OLLAMA_PORT}\n`);
      } catch {
        // The connection is refused all the same.
      }
    }
    const refused = Object.assign(new Error(`connect ECONNREFUSED ${OLLAMA_PORT} (refused by the end-to-end suite)`), {
      code: "ECONNREFUSED",
    });
    process.nextTick(() => this.destroy(refused));
    return this;
  }
  return connect.apply(this, args);
};
