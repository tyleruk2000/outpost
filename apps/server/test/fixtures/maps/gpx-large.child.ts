/**
 * Test-only: reads one of the files in `gpx-large.ts` the way the server does, in a
 * worker, with that worker held to a small heap, and prints what happened as JSON.
 *
 * It is run as a process of its own. If the reader ever needed more memory than it is
 * given here, this process is the one that dies, not the one running the tests.
 *
 *   node gpx-large.child.ts <name> [megabytes of heap, instead of the file's own]
 */
import { type GpxWorkerUsage, parseGpxSafely, trackStats } from "../../../src/modules/maps/gpx.ts";
import { LARGE_GPX } from "./gpx-large.ts";

const file = LARGE_GPX[process.argv[2] ?? ""];
if (!file) throw new Error(`No such file: ${process.argv[2]}`);
// Through bytes and back, as an upload arrives.
const source = Buffer.from(file.build()).toString("utf8");
let usage: GpxWorkerUsage | undefined;
const report: Record<string, unknown> = { megabytes: Buffer.byteLength(source) / 1e6 };
try {
  const parsed = await parseGpxSafely(source, {
    heapMb: Number(process.argv[3]) || file.heapMb,
    onUsage: (told) => {
      usage = told;
    },
  });
  Object.assign(report, { imported: true, lines: parsed.lines, waypoints: parsed.waypoints, stats: trackStats(parsed.collection) });
} catch (error) {
  Object.assign(report, { imported: false, message: (error as Error).message });
}
console.log(JSON.stringify({ ...report, usage, peakProcessBytes: process.resourceUsage().maxRSS * 1024 }));
