/**
 * The streets sidecar's script (docker/valhalla/outpost-valhalla.sh): a build runs at low
 * processor and disk priority where `nice` and `ionice` are there and allowed, and still
 * runs where they are not. Run with stand-ins for the two on an otherwise empty PATH;
 * nothing of Valhalla is needed.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "./temp.ts";

const SCRIPT = path.resolve(import.meta.dirname, "../../../docker/valhalla/outpost-valhalla.sh");
const BASH = ["/bin/bash", "/usr/bin/bash"].find((file) => fs.existsSync(file));

/** A folder for PATH with the tools given: each a stand-in that runs what follows its options, or refuses. */
function tools(spec: Record<string, "works" | "refuses">): string {
  const dir = tempDir("outpost-sidecar-path-");
  for (const [name, how] of Object.entries(spec)) {
    const body =
      how === "works"
        ? // Skip the options ("-n 19", "-c 3") and run the command.
          '#!/bin/bash\nwhile [ "$#" -gt 0 ]; do case "$1" in -*) shift 2 ;; *) break ;; esac; done\n"$@"\n'
        : `#!/bin/bash\necho "${name}: ioprio_set failed: Operation not permitted" >&2\nexit 1\n`;
    fs.writeFileSync(path.join(dir, name), body, { mode: 0o755 });
  }
  return dir;
}

const priority = (pathDir: string) =>
  execFileSync(BASH!, [SCRIPT, "priority"], { env: { PATH: pathDir, VALHALLA_HOME: tempDir("outpost-sidecar-home-") } })
    .toString()
    .trim();

describe.skipIf(!BASH)("the streets sidecar's build priority", () => {
  it("builds at the lowest processor and idle disk priority where both tools work", () => {
    expect(priority(tools({ nice: "works", ionice: "works" }))).toBe("nice -n 19 ionice -c 3");
  });

  it("leaves out a tool that is not there or not allowed, and builds at normal priority with neither", () => {
    expect(priority(tools({ nice: "works", ionice: "refuses" }))).toBe("nice -n 19");
    expect(priority(tools({ nice: "works" }))).toBe("nice -n 19");
    expect(priority(tools({ ionice: "works" }))).toBe("ionice -c 3");
    expect(priority(tools({}))).toBe("");
  });
});
