/**
 * The streets service's stand-in as a program of its own, for the end-to-end suite: the
 * replies recorded from a real Valhalla (valhalla-stand-in.ts) on the port given, with
 * `/health` for the runner to wait on. The suite's server is pointed at it; streets are
 * "installed" only while a test has written the service's status.json.
 *
 *   node apps/server/test/fixtures/streets/stand-in-server.ts 9708
 */
import { createValhallaStandIn } from "./valhalla-stand-in.ts";

const port = Number(process.argv[2] ?? 8478);
const standIn = await createValhallaStandIn(port);
standIn.override = (path) => (path === "/health" ? { status: 200, body: '{"ok":true}' } : null);
process.stdout.write(`Streets stand-in on ${standIn.url}\n`);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void standIn.close().then(() => process.exit(0)));
