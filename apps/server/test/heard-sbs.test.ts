/**
 * Aircraft from BaseStation (SBS) text: lines recorded from readsb 3.16 (installed with
 * Homebrew on the development Mac), which was given four Mode S messages on its raw input
 * port: the worked examples of Junzi Sun's "The 1090MHz Riddle" (an identification, an
 * airborne position pair and a velocity). fixtures/heard/readsb-sbs.txt is what its SBS
 * port wrote. Then untrusted input.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSbs, type SbsUpdate } from "../src/modules/heard/sbs.ts";

const recorded = readFileSync(new URL("./fixtures/heard/readsb-sbs.txt", import.meta.url), "utf8").split("\n");

describe("SBS lines recorded from readsb", () => {
  const updates = recorded.map(parseSbs).filter((update): update is SbsUpdate => update !== null && !("error" in update));

  it("reads every line", () => {
    expect(updates).toHaveLength(4);
  });

  it("reads the callsign, the altitude, the position and the velocity", () => {
    expect(updates[0]).toEqual({ icao: "4840D6", callsign: "KLM1023", onGround: false });
    expect(updates[1]!.altitude).toBeCloseTo(38000 * 0.3048, 3);
    expect(updates[2]).toMatchObject({ icao: "40621D", lat: 52.26578, lon: 3.938913 });
    expect(updates[3]).toMatchObject({ icao: "485020", speed: 159, course: 183, verticalRate: -832 });
  });
});

describe("untrusted input", () => {
  it("passes over lines that are not messages, and refuses ones that do not read", () => {
    expect(parseSbs("")).toBeNull();
    expect(parseSbs("SEL,,496,2286,4CA4E5,27215,2010/02/19,18:06:07.710,2010/02/19,18:06:07.710,RYR1427")).toBeNull();
    expect(parseSbs("MSG,3,1,1,ZZZZZZ,1,,,,,,38000,,,52.2,3.9,,,0,,0,0")).toEqual({ error: "hex ident" });
    expect(parseSbs("MSG,9,1,1,40621D,1,,,,,,38000,,,52.2,3.9,,,0,,0,0")).toEqual({ error: "transmission type" });
    expect(parseSbs("MSG,3,1,1,40621D")).toEqual({ error: "too few fields" });
    expect(parseSbs(`MSG,3,${"1,".repeat(200)}`)).toEqual({ error: "line too long" });
    expect(parseSbs("HELLO")).toEqual({ error: "not SBS" });
  });

  it("leaves out values that are out of range", () => {
    const update = parseSbs("MSG,3,1,1,40621D,1,,,,,,9999999,,,95.0,3.9,,9,0,,0,0") as SbsUpdate;
    expect(update.altitude).toBeUndefined();
    expect(update.lat).toBeUndefined();
    expect(update.squawk).toBeUndefined();
  });
});
