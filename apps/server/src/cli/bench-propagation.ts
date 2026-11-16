/**
 * Times the HF propagation engine on this machine, so that figures for a Raspberry Pi
 * or anything else can be measured rather than guessed:
 *
 *   node apps/server/src/cli/bench-propagation.ts
 *
 * It runs the acceptance path (London to Birmingham) and prints, in milliseconds, how
 * long the engine takes to load, to work out a day on every band, to work out
 * everything one screen of the planner asks for, and to work out one day at one
 * frequency, which is the unit a coverage map is made of. Nothing is written.
 */
import os from "node:os";
import path from "node:path";
import { ANTENNA_PRESETS, HF_BANDS } from "@outpost/shared";
import type { CircuitRequest } from "../modules/propagation/engine.ts";
import { createVoacapEngine } from "../modules/propagation/voacap/engine.ts";
import { voacapPaths } from "../modules/propagation/voacap/files.ts";

const dipole = ANTENNA_PRESETS[0]!.spec;
const base: CircuitRequest = {
  tx: { name: "London", lat: 51.51, lon: -0.13 },
  rx: { name: "Birmingham", lat: 52.49, lon: -1.89 },
  year: 2026,
  month: 11,
  ssn: 83,
  powerWatts: 5,
  frequenciesMhz: HF_BANDS.map((band) => band.mhz),
  requiredSnrDbHz: 45,
  noiseDbwAt3Mhz: -140.4,
  txAntenna: dipole,
  rxAntenna: dipole,
};

function time(runs: number, work: (run: number) => void): { median: number; worst: number } {
  const taken: number[] = [];
  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    work(run);
    taken.push(performance.now() - start);
  }
  taken.sort((a, b) => a - b);
  return { median: taken[Math.floor(taken.length / 2)]!, worst: taken[taken.length - 1]! };
}
const show = (label: string, result: { median: number; worst: number }) =>
  console.log(`${label.padEnd(58)} median ${result.median.toFixed(1).padStart(7)} ms   worst ${result.worst.toFixed(1).padStart(7)} ms`);

console.log(
  `${os.cpus()[0]?.model ?? "unknown processor"}, ${os.cpus().length} cores, ${os.arch()}, ${os.platform()}, Node ${process.version}`,
);
const paths = voacapPaths(path.join(os.tmpdir(), "outpost-bench-no-data"));
const loadStart = performance.now();
let engine = createVoacapEngine(paths);
engine.circuit(base);
console.log(
  `${"Load the engine and its data, and answer once".padEnd(58)}        ${(performance.now() - loadStart).toFixed(1).padStart(7)} ms`,
);

engine = createVoacapEngine(paths);
// Each run changes the sunspot number so that nothing can be reused from the run before.
show(
  "One day on all nine bands (24 hours x 9 frequencies)",
  time(40, (run) => engine.circuit({ ...base, ssn: 40 + run })),
);
const sweep = Array.from({ length: 29 }, (_, index) => 2 + index);
show(
  "Everything one planner screen asks for",
  time(20, (run) => {
    const ssn = 40 + run;
    engine.circuit({ ...base, ssn, frequenciesMhz: [7.1, ...base.frequenciesMhz, ...sweep] });
    for (const required of [24, 15.2, 10]) engine.circuit({ ...base, ssn, frequenciesMhz: [7.1], requiredSnrDbHz: required });
    engine.ionosphere({ ...base, ssn });
  }),
);
const cell = time(200, (run) =>
  engine.circuit({ ...base, frequenciesMhz: [7.1], rx: { name: "", lat: 45 + (run % 20), lon: -10 + (run % 17) * 2 } }),
);
show("One day at one frequency to one place (a coverage cell)", cell);
console.log(`A coverage grid of 30 x 30 places at that rate: about ${((cell.median * 900) / 1000).toFixed(1)} s on one core.`);
