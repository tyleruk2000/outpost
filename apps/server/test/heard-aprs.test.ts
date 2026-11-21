/**
 * APRS from KISS: the framing, the AX.25 frame and the APRS information field, read from
 * bytes recorded off Dire Wolf 1.8.1's KISS TCP port (fixtures/heard/direwolf-kiss.bin).
 * The audio was made with Dire Wolf's gen_packets from fixtures/heard/direwolf-packets.txt
 * and decoded by Dire Wolf from stdin with a receive-only configuration; the values
 * expected below are the ones Dire Wolf printed for the same packets.
 *
 * Then untrusted input: random bytes, cut frames, frames too long, and fields that do not
 * read are dropped and counted, never thrown.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type AprsPosition, decodeAprs, symbolWords, weatherFields } from "../src/modules/heard/aprs.ts";
import { type Ax25Frame, addressText, decodeAx25, encodeTnc2, pathOf } from "../src/modules/heard/ax25.ts";
import { KissReader, kissEncode, MAX_KISS_FRAME } from "../src/modules/heard/kiss.ts";

const recorded = readFileSync(new URL("./fixtures/heard/direwolf-kiss.bin", import.meta.url));
const NOW = Date.UTC(2026, 10, 21, 13, 0, 0);

function framesOf(bytes: Uint8Array): Buffer[] {
  const frames: Buffer[] = [];
  const reader = new KissReader((frame) => frames.push(frame.data));
  reader.push(bytes);
  return frames;
}

function decodeAll(bytes: Uint8Array) {
  return framesOf(bytes).map((data) => {
    const frame = decodeAx25(data) as Ax25Frame;
    const aprs = decodeAprs({ source: addressText(frame.source), destination: addressText(frame.destination), info: frame.info }, NOW);
    return { frame, aprs: aprs as AprsPosition, path: pathOf(frame.digipeaters) };
  });
}

const near = (value: number | null, expected: number, digits = 3) => {
  expect(value).not.toBeNull();
  expect(value!).toBeCloseTo(expected, digits);
};

describe("APRS packets recorded from Dire Wolf", () => {
  const packets = decodeAll(recorded);

  it("reads every frame Dire Wolf sent", () => {
    expect(packets).toHaveLength(7);
    expect(packets.map((packet) => addressText(packet.frame.source))).toEqual([
      "M0ABC-9",
      "M0ABC-7",
      "G4XYZ",
      "G4WX",
      "G4OBJ",
      "G4ITM",
      "G4WX2",
    ]);
  });

  it("reads a plain position with altitude and a comment, heard direct", () => {
    const { aprs, path } = packets[0]!;
    expect(aprs.kind).toBe("position");
    // Dire Wolf: "N 51 30.0000, W 000 10.0000, alt 100 m (328 ft)".
    near(aprs.lat, 51.5);
    near(aprs.lon, -10 / 60);
    near(aprs.altitude, 328 * 0.3048, 2);
    expect(aprs.symbol).toBe("/>");
    expect(symbolWords(aprs.symbol)).toBe("Car");
    expect(aprs.comment).toBe("Walking test");
    expect(path).toEqual({ direct: true, via: null });
  });

  it("reads Mic-E, heard through a digipeater", () => {
    const { aprs, path } = packets[1]!;
    // Dire Wolf: "MIC-E, JEEP ... N 33 25.6400, W 012 07.7400, 37 km/h (23 MPH), course 251".
    near(aprs.lat, 33 + 25.64 / 60, 5);
    near(aprs.lon, -(12 + 7.74 / 60), 5);
    expect(aprs.speed).toBe(20);
    expect(Math.round(aprs.speed! * 1.852)).toBe(37);
    expect(aprs.course).toBe(251);
    expect(symbolWords(aprs.symbol)).toBe("Jeep");
    expect(aprs.comment).toBe("Mic-E test=");
    expect(path).toEqual({ direct: false, via: "M0DIG-3" });
  });

  it("reads a compressed position with course and speed", () => {
    const { aprs } = packets[2]!;
    // Dire Wolf: "N 49 30.0000, W 072 45.0002, 67 km/h (42 MPH), course 88".
    near(aprs.lat, 49.5, 4);
    near(aprs.lon, -72.75, 4);
    expect(aprs.course).toBe(88);
    expect(Math.round(aprs.speed! * 1.852)).toBe(67);
    expect(aprs.comment).toBe("Compressed");
  });

  it("reads a weather station with its position and timestamp", () => {
    const { aprs } = packets[3]!;
    expect(aprs.kind).toBe("weather");
    near(aprs.lat, 51 + 31.5 / 60);
    near(aprs.lon, -(5.2 / 60));
    expect(aprs.timestamp).toBe(Date.UTC(2026, 10, 21, 12, 30));
    // Dire Wolf: "wind 4.6 mph, direction 220, gust 5, temperature 45, ... humidity 85, barometer 29.92".
    const weather = aprs.weather!;
    expect(weather.windDirection).toBe(220);
    expect(weather.windSpeed).toBe(4);
    near(weather.windGust, 5 * 0.868976);
    near(weather.temperatureC, ((45 - 32) * 5) / 9);
    expect(weather.humidity).toBe(85);
    expect(weather.pressureHpa).toBe(1013.2);
    expect(weather.rain1hMm).toBe(0);
    expect(aprs.comment).toBe("Home weather");
    expect(aprs.course).toBeNull();
  });

  it("reads an object and an item, named for what they are and sent by their station", () => {
    const object = packets[4]!.aprs;
    expect(object).toMatchObject({ kind: "object", name: "NET-1", sentBy: "G4OBJ", killed: false, symbol: "/-", comment: "Net here" });
    near(object.lat, 51 + 32 / 60);
    expect(object.timestamp).toBe(Date.UTC(2026, 10, 21, 12, 0));
    const item = packets[5]!.aprs;
    expect(item).toMatchObject({ kind: "item", name: "AID#2", sentBy: "G4ITM", symbol: "/a", comment: "First aid" });
    expect(symbolWords(item.symbol)).toBe("Ambulance");
  });

  it("reads weather with no position", () => {
    const { aprs } = packets[6]!;
    expect(aprs.kind).toBe("weather");
    expect(aprs.lat).toBeNull();
    // Dire Wolf: "wind 10.0 mph, direction 180, gust 15, temperature 50, rain 0.01 in last hour, ... humidity 60, barometer 29.68".
    const weather = aprs.weather!;
    expect(weather.windDirection).toBe(180);
    near(weather.windSpeed, 10 * 0.868976);
    near(weather.temperatureC, 10);
    near(weather.rain1hMm, 0.254);
    near(weather.rain24hMm, 0.508);
    near(weather.rainMidnightMm, 0.762);
    expect(weather.humidity).toBe(60);
    expect(weather.pressureHpa).toBe(1005);
  });
});

describe("APRS packets written by hand", () => {
  const decode = (packet: string) => {
    const frame = decodeAx25(encodeTnc2(packet)) as Ax25Frame;
    return decodeAprs({ source: addressText(frame.source), destination: addressText(frame.destination), info: frame.info }, NOW);
  };

  it("reads a course and speed extension, and position ambiguity", () => {
    const aprs = decode("M0ABC>APDW18:!5130.  N/00010.  W>090/015Moving") as AprsPosition;
    near(aprs.lat, 51.5);
    expect(aprs).toMatchObject({ course: 90, speed: 15, comment: "Moving" });
  });

  it("reads a negative temperature and leaves out fields that are not known", () => {
    const { weather } = weatherFields("c...s...g...t-04h00b.....");
    near(weather.temperatureC, ((-4 - 32) * 5) / 9);
    expect(weather.humidity).toBe(100);
    expect(weather.windDirection).toBeNull();
    expect(weather.pressureHpa).toBeNull();
  });

  it("marks a killed object", () => {
    const aprs = decode("G4OBJ>APRS:;NET-1    _211200z5132.00N/00011.00W-") as AprsPosition;
    expect(aprs.killed).toBe(true);
  });

  it("takes a message or a status as a packet that is not a position", () => {
    expect(decode("G4ABC>APRS::M0ABC    :Hello{1")).toEqual({ kind: "other" });
    expect(decode("G4ABC>APRS:>On the hill")).toEqual({ kind: "other" });
  });

  it("refuses positions that do not read", () => {
    expect(decode("G4ABC>APRS:!9130.00N/00010.00W>")).toHaveProperty("error");
    expect(decode("G4ABC>APRS:!5160.00N/00010.00W>")).toHaveProperty("error");
    expect(decode("G4ABC>APRS:!5130.00N/18110.00W>")).toHaveProperty("error");
    expect(decode("G4ABC>APRS:@991230z5130.00N/00010.00W>")).toHaveProperty("error");
    expect(decode("G4ABC>APRS:!/!!!")).toHaveProperty("error");
    expect(decode("G4ABC>APRS:`abc")).toHaveProperty("error");
  });
});

describe("untrusted input", () => {
  it("drops a frame that is too long, and reads the next", () => {
    const frames: Buffer[] = [];
    const reader = new KissReader((frame) => frames.push(frame.data));
    reader.push(kissEncode(Buffer.alloc(MAX_KISS_FRAME + 50, 0x41)));
    reader.push(kissEncode(encodeTnc2("G4ABC>APRS:!5130.00N/00010.00W>")));
    expect(reader.dropped).toBe(1);
    expect(frames).toHaveLength(1);
  });

  it("reads a frame split across many chunks, with escaped bytes in it", () => {
    const data = Buffer.concat([encodeTnc2("G4ABC>APRS:>status"), Buffer.from([0xc0, 0xdb])]);
    const frames: Buffer[] = [];
    const reader = new KissReader((frame) => frames.push(frame.data));
    for (const byte of kissEncode(data)) reader.push(Buffer.from([byte]));
    expect(frames).toEqual([data]);
  });

  it("drops a frame with a bad escape, and frames that are not data", () => {
    const frames: Buffer[] = [];
    const reader = new KissReader((frame) => frames.push(frame.data));
    reader.push(Buffer.from([0xc0, 0x00, 0x41, 0xdb, 0x41, 0xc0]));
    reader.push(Buffer.from([0xc0, 0x01, 0x10, 0xc0]));
    expect(frames).toHaveLength(0);
    expect(reader.dropped).toBe(1);
    expect(reader.other).toBe(1);
  });

  it("refuses AX.25 frames that do not read", () => {
    expect(decodeAx25(Buffer.alloc(10))).toHaveProperty("error");
    const good = encodeTnc2("G4ABC>APRS:!5130.00N/00010.00W>");
    const notUi = Buffer.from(good);
    notUi[14] = 0x2f;
    expect(decodeAx25(notUi)).toHaveProperty("error");
    // No last-address bit anywhere: the address field runs off the end.
    const endless = Buffer.from(good);
    endless[13] = endless[13]! & 0xfe;
    expect(decodeAx25(endless)).toHaveProperty("error");
  });

  it("never throws on random bytes, cut frames or random information fields", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const samples = [
      "M0ABC-9>APRS,WIDE1-1:!5130.00N/00010.00W>Walking",
      'M0ABC-7>S32U6T:`(_fn"Oj/]x',
      "G4XYZ>APRS:=/5L!!<*e7>7P[",
      "G4WX>APRS:@211230z5131.50N/00005.20W_220/004g005t045",
      "G4OBJ>APRS:;NET-1    *211200z5132.00N/00011.00W-",
      "G4WX2>APRS:_11211230c180s010g015t050",
    ];
    for (let round = 0; round < 3000; round += 1) {
      const base = encodeTnc2(samples[round % samples.length]!);
      const bytes = Buffer.from(base);
      // Flip a few bytes, or cut it short, or replace it with noise.
      const mode = round % 3;
      if (mode === 0) for (let i = 0; i < 3; i += 1) bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256);
      const cut = mode === 1 ? bytes.subarray(0, Math.floor(random() * bytes.length)) : bytes;
      const noise = mode === 2 ? Buffer.from(Array.from({ length: Math.floor(random() * 300) }, () => Math.floor(random() * 256))) : cut;
      expect(() => {
        for (const data of framesOf(Buffer.concat([kissEncode(noise), noise]))) {
          const frame = decodeAx25(data);
          if ("error" in frame) continue;
          const result = decodeAprs(
            { source: addressText(frame.source), destination: addressText(frame.destination), info: frame.info },
            NOW,
          );
          if ("lat" in result && result.lat !== null) {
            expect(Math.abs(result.lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(result.lon!)).toBeLessThanOrEqual(180);
          }
          if ("comment" in result && result.comment) expect(result.comment.length).toBeLessThanOrEqual(200);
        }
      }).not.toThrow();
    }
  });
});
