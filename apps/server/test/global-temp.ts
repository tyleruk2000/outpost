/**
 * Gives a run of the server's tests a temporary directory of its own, and fails the run
 * if a test left anything in it.
 *
 * Every test process is started with TMPDIR (and TMP and TEMP) pointing at a new folder,
 * so that what a test leaves behind can be told from what other programs on the machine
 * are doing in the system's temporary directory at the same time. At the end the folder
 * is removed, and anything that was still in it is named, and the run fails.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export default function setup(): () => void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-server-tests-"));
  const before = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };
  process.env.TMPDIR = root;
  process.env.TMP = root;
  process.env.TEMP = root;
  return () => {
    Object.assign(process.env, before);
    for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name];
    const left = fs.readdirSync(root);
    // What is in each, a few paths deep, so that the test that left it can be found.
    const inside = left.flatMap((name) => {
      try {
        return (fs.readdirSync(path.join(root, name), { recursive: true }) as string[]).slice(0, 8).map((entry) => `${name}/${entry}`);
      } catch {
        return [];
      }
    });
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    if (left.length > 0) {
      throw new Error(
        `The server's tests left ${left.length} ${left.length === 1 ? "thing" : "things"} in the temporary directory: ${left.slice(0, 20).join(", ")}${left.length > 20 ? ", …" : ""}${inside.length ? ` (holding ${inside.join(", ")})` : ""}. Make folders with tempDir (test/temp.ts), which removes them.`,
      );
    }
  };
}
