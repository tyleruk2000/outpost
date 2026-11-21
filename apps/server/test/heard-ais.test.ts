/**
 * AIS from NMEA: the sentences in gpsd's "AIVDM/AIVDO protocol decoding", and sentences
 * made with pyais 3.3.1's encoder, each with what pyais decodes from it
 * (fixtures/heard/ais-pyais.json, made once on the development computer). Outpost's own
 * decoder must agree with it. Then untrusted input.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AisReader, type AisReport, nmeaChecksumOk, parseSentence, shipTypeWords } from "../src/modules/heard/ais.ts";

interface Case {
  label: string;
  sentences: string[];
  pyais: Record<string, string | number | null>;
}
const cases = JSON.parse(readFileSync(new URL("./fixtures/heard/ais-pyais.json", import.meta.url), "utf8")) as Case[];

function readAll(sentences: string[]): AisReport[] {
  const reader = new AisReader();
  return sentences.flatMap((line) => {
    const report = reader.read(line);
    return report ? [report] : [];
  });
}

const notAvailable = (value: unknown, limit: number) => (typeof value === "number" && value >= limit ? null : value);

describe("AIS sentences, against pyais", () => {
  for (const sample of cases) {
    it(`reads ${sample.label} as pyais does`, () => {
      const [report] = readAll(sample.sentences);
      expect(report).toBeDefined();
      const p = sample.pyais;
      expect(report!.mmsi).toBe(String(p.mmsi).padStart(9, "0"));
      if (typeof p.lat === "number" && "lat" in p) {
        if (p.lat === 91) expect(report!.lat).toBeNull();
        else expect(report!.lat!).toBeCloseTo(p.lat, 4);
      }
      if (typeof p.lon === "number" && p.lon !== 181) expect(report!.lon!).toBeCloseTo(p.lon, 4);
      if ("speed" in p) expect(report!.speed).toBe(notAvailable(p.speed, 102.3));
      if ("course" in p) expect(report!.course).toBe(notAvailable(p.course, 360));
      if ("heading" in p) expect(report!.heading).toBe(notAvailable(p.heading, 360));
      const name = (p.shipname ?? p.name ?? null) as string | null;
      if (name) expect(report!.name).toBe(name);
      if (p.callsign) expect(report!.callsign).toBe(p.callsign);
      if (p.imo) expect(report!.imo).toBe(p.imo);
      if (p.ship_type) expect(report!.shipType).toBe(p.ship_type);
      if (typeof p.to_bow === "number" && p.to_bow + Number(p.to_stern) > 0) expect(report!.lengthM).toBe(p.to_bow + Number(p.to_stern));
      if (p.draught) expect(report!.draughtM).toBe(p.draught);
      if (p.destination) expect(report!.destination).toBe(p.destination);
    });
  }

  it("names what each kind of message is", () => {
    const [moored] = readAll(cases.find((sample) => sample.label === "gpsd type 1")!.sentences);
    expect(moored).toMatchObject({ kind: "vessel", aisClass: "A", status: "Moored" });
    const [base] = readAll(cases.find((sample) => sample.label === "type 4")!.sentences);
    expect(base!.kind).toBe("base");
    const [aid] = readAll(cases.find((sample) => sample.label === "type 21")!.sentences);
    expect(aid).toMatchObject({ kind: "aid", name: "NAB TOWER" });
    const [classB] = readAll(cases.find((sample) => sample.label === "type 18")!.sentences);
    expect(classB!.aisClass).toBe("B");
    expect(shipTypeWords(99)).toBe("Other vessel");
    expect(shipTypeWords(37)).toBe("Pleasure craft");
    expect(shipTypeWords(0)).toBeNull();
  });

  it("takes off a tag block in front of a sentence", () => {
    const line = "\\g:1-2-73874,n:157036,s:r003669945,c:1241544035*4A\\!AIVDM,1,1,,B,15N4cJ`005Jrek0H@9n`DW5608EP,0*13";
    expect(readAll([line])[0]!.mmsi).toBe("367078250");
  });
});

describe("untrusted input", () => {
  const [first, second] = cases.find((sample) => sample.label === "gpsd type 5")!.sentences as [string, string];

  it("needs the checksum to match", () => {
    expect(nmeaChecksumOk(first)).toBe(true);
    const reader = new AisReader();
    expect(reader.read(first.replace("*3E", "*3F"))).toBeNull();
    expect(reader.malformed).toBe(1);
  });

  it("puts parts together only in order, and drops a second part with no first", () => {
    expect(readAll([second])).toHaveLength(0);
    expect(readAll([second, first])).toHaveLength(0);
    expect(readAll([first, second])).toHaveLength(1);
  });

  it("drops a first part whose second does not come in time", () => {
    const reader = new AisReader();
    reader.read(first, 0);
    expect(reader.read(second, 60_000)).toBeNull();
  });

  it("refuses lines too long, bad armouring and part numbers out of range", () => {
    expect(parseSentence(`!AIVDM,1,1,,A,${"0".repeat(300)},0*00`)).toEqual({ error: "line too long" });
    expect(parseSentence("!AIVDM,1,1,,A,1{{{,0*12")).toHaveProperty("error");
    expect(parseSentence("!AIVDM,9,1,,A,1,0*00")).toHaveProperty("error");
    expect(parseSentence("$GPRMC,whatever")).toBeNull();
  });

  it("never throws on noise", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const reader = new AisReader();
    const all = cases.flatMap((sample) => sample.sentences);
    for (let round = 0; round < 3000; round += 1) {
      const line = all[round % all.length]!;
      const chars = [...line];
      for (let i = 0; i < 2; i += 1) chars[Math.floor(random() * chars.length)] = String.fromCharCode(32 + Math.floor(random() * 95));
      // With the checksum made right again, so that the payload's damage reaches the decoder.
      const body = chars.join("").replace(/\*[0-9A-F]{2}$/i, "");
      let sum = 0;
      for (let i = 1; i < body.length; i += 1) sum ^= body.charCodeAt(i);
      const fixed = `${body}*${sum.toString(16).toUpperCase().padStart(2, "0")}`;
      expect(() => {
        const report = reader.read(fixed);
        if (report?.lat != null) expect(Math.abs(report.lat)).toBeLessThanOrEqual(90);
      }).not.toThrow();
    }
  });
});
