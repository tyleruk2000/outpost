import { orbitFacts, type SatelliteAbout, type SatelliteTransmitter } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { setDeviceRegion } from "@/lib/region";
import { aboutSentences, carriesWords, countryWords, orbitWords } from "./about";

// The ISS's elements on 21 November 2026 (CelesTrak).
const ISS = { MEAN_MOTION: 15.4952737, ECCENTRICITY: 0.0007384, INCLINATION: 51.6319 };
// A geostationary weather satellite: one turn a sidereal day, round and over the equator.
const GEO = { MEAN_MOTION: 1.00271, ECCENTRICITY: 0.0001, INCLINATION: 0.05 };
// A sun-synchronous orbit like NOAA 19's.
const NOAA19 = { MEAN_MOTION: 14.1297, ECCENTRICITY: 0.0013, INCLINATION: 99.0 };
// A Molniya orbit: half a sidereal day, very eccentric.
const MOLNIYA = { MEAN_MOTION: 2.0057, ECCENTRICITY: 0.72, INCLINATION: 63.4 };

const about: SatelliteAbout = {
  noradId: 25544,
  name: "ISS",
  otherNames: ["ZARYA", "RS0ISS", "NA1SS"],
  status: "in orbit",
  launched: "1998-11-20T00:00:00Z",
  deployed: null,
  decayed: null,
  website: "https://www.nasa.gov/",
  operator: null,
  countries: ["RU", "US"],
  citation: null,
  frequencyViolator: false,
  associated: [],
};

const transmitter = (fields: Partial<SatelliteTransmitter>): SatelliteTransmitter => ({
  id: Math.random().toString(36),
  noradId: 25544,
  description: "",
  alive: true,
  status: "active",
  type: "Transmitter",
  mode: null,
  uplinkLowHz: null,
  uplinkHighHz: null,
  downlinkLowHz: 145_800_000,
  downlinkHighHz: null,
  invert: false,
  baud: null,
  updatedAt: null,
  ...fields,
});

afterEach(() => setDeviceRegion("GB"));

describe("the orbit from its elements", () => {
  it("puts the ISS about 420 km up, round every 93 minutes", () => {
    const orbit = orbitFacts(ISS);
    expect(orbit.periodMinutes).toBeCloseTo(92.93, 1);
    expect(orbit.meanHeightKm).toBeGreaterThan(410);
    expect(orbit.meanHeightKm).toBeLessThan(425);
    expect(orbit.sunSynchronous).toBe(false);
    expect(orbit.geostationary).toBe(false);
    expect(orbitWords(ISS)).toBe(
      "about 420 km up, going round every 93 minutes at 51.6° to the equator, so it passes over places between 51.6° N and 51.6° S.",
    );
  });

  it("knows a geostationary orbit, 35,786 km up", () => {
    const orbit = orbitFacts(GEO);
    expect(orbit.geostationary).toBe(true);
    expect(orbit.meanHeightKm).toBeGreaterThan(35_780);
    expect(orbit.meanHeightKm).toBeLessThan(35_792);
    expect(orbitWords(GEO)).toBe(
      "about 35,790 km up, going round once a day as the Earth turns: it is geostationary, so it stays over one point on the equator.",
    );
  });

  it("knows a sun-synchronous orbit, and one that goes against the Earth's turning", () => {
    const orbit = orbitFacts(NOAA19);
    expect(orbit.sunSynchronous).toBe(true);
    expect(orbit.retrograde).toBe(true);
    expect(orbit.latitudeReachDeg).toBeCloseTo(81, 5);
    expect(orbit.periodMinutes).toBeCloseTo(101.9, 1);
    expect(orbitWords(NOAA19)).toBe(
      "about 850 km up, going round every 102 minutes at 99.0° to the equator, against the way the Earth turns, so it passes over places between 81.0° N and 81.0° S. Its orbit is sun-synchronous: it crosses each latitude at about the same local time every day.",
    );
  });

  it("gives an eccentric orbit's lowest and highest heights, and a long period in hours", () => {
    expect(orbitWords(MOLNIYA)).toMatch(/^between [\d,]+ km and [\d,]+ km up, going round every 11 h 58 min at 63\.4° to the equator/);
  });
});

describe("the description", () => {
  it("says the ISS's names, launch, countries and orbit", () => {
    expect(aboutSentences(about, ISS, [])).toEqual([
      "Also called ZARYA, RS0ISS and NA1SS.",
      "Launched 20 November 1998, from Russia and the United States.",
      "In orbit, about 420 km up, going round every 93 minutes at 51.6° to the equator, so it passes over places between 51.6° N and 51.6° S.",
    ]);
  });

  it("writes the day as the device's region does", () => {
    setDeviceRegion("US");
    expect(aboutSentences(about, null, [])[1]).toBe("Launched November 20, 1998, from Russia and the United States.");
  });

  it("names countries in words", () => {
    expect(countryWords("DE")).toBe("Germany");
    expect(countryWords("GB")).toBe("the United Kingdom");
  });

  it("says when it was set free, who runs it, and a satellite not yet launched or come down", () => {
    expect(
      aboutSentences({ ...about, otherNames: [], deployed: "1998-12-01T00:00:00Z", operator: "ESA", countries: [] }, null, []),
    ).toEqual(["Launched 20 November 1998, and set free in orbit 1 December 1998.", "Run by ESA."]);
    expect(aboutSentences({ ...about, otherNames: [], status: "future", launched: null }, ISS, [])).toEqual([
      "Not launched yet.",
      "From Russia and the United States.",
    ]);
    expect(
      aboutSentences({ ...about, otherNames: [], countries: [], status: "re-entered", decayed: "2026-06-20T00:00:00Z" }, ISS, []),
    ).toEqual(["Launched 20 November 1998.", "It re-entered the atmosphere on 20 June 2026."]);
  });

  it("describes the orbit alone when SatNOGS DB does not list it", () => {
    expect(aboutSentences(null, ISS, [])[0]).toMatch(/^About 420 km up/);
  });
});

describe("what it carries", () => {
  it("names the kinds SatNOGS lists in use, and says when there are others", () => {
    expect(
      carriesWords([
        transmitter({ type: "Transceiver", mode: "FM", uplinkLowHz: 145_990_000, description: "Mode V/U FM - Voice Repeater" }),
        transmitter({ type: "Transceiver", mode: "AFSK", uplinkLowHz: 145_825_000, description: "Mode V APRS" }),
        transmitter({ mode: "CW", description: "CW beacon" }),
        transmitter({ mode: "FM", description: "Old one", alive: false }),
      ]),
    ).toBe("SatNOGS DB lists 3 transmitters in use: an FM voice repeater, an APRS digipeater and a CW beacon.");
    expect(
      carriesWords([transmitter({ mode: "BPSK", description: "Telemetry" }), transmitter({ mode: "QPSK", description: "Data" })]),
    ).toBe("SatNOGS DB lists 2 transmitters in use, among them telemetry.");
    expect(carriesWords([transmitter({ type: "Transponder", mode: "USB", uplinkLowHz: 435_000_000, invert: true })])).toBe(
      "SatNOGS DB lists 1 transmitter in use: a linear transponder.",
    );
    expect(carriesWords([transmitter({ mode: "LRPT", description: "LRPT 1" })])).toBe(
      "SatNOGS DB lists 1 transmitter in use: LRPT weather pictures.",
    );
    expect(carriesWords([transmitter({ alive: false })])).toBeNull();
  });
});
