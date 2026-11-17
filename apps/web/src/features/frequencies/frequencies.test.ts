/**
 * The helpers behind the list of frequencies: how a frequency is written (kHz below
 * 30 MHz, MHz above, as radios show them), when a schedule has run out, which entries
 * apply to a place, what a set of each kind can receive, and the search box.
 */
import {
  appliesTo,
  checkedOn,
  type FrequencyEntry,
  filterFrequencies,
  formatFrequency,
  formatKhz,
  heardFromAfar,
  isDay,
  matchesText,
  placesIn,
  receiverById,
  receives,
  scheduleState,
  setChecked,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { countryAt, homeCountry } from "./home-country";

const source = { publisher: "Test", title: "A page", url: "https://example.org/page", checked: "2026-11-17" };
const entry = (over: Partial<FrequencyEntry> & Pick<FrequencyEntry, "id">): FrequencyEntry => ({
  kind: "time-signals",
  name: over.id,
  what: "What it is.",
  expect: "Ticks.",
  frequencies: [{ khz: 10_000 }],
  modes: ["AM"],
  bands: ["hf"],
  where: ["US"],
  status: "on-air",
  sources: [source],
  ...over,
});

describe("writing a frequency", () => {
  it("in kHz below 30 MHz, keeping only the decimals it has", () => {
    expect(formatKhz(77.5)).toBe("77.5 kHz");
    expect(formatKhz(518)).toBe("518 kHz");
    expect(formatKhz(4209.5)).toBe("4209.5 kHz");
    expect(formatKhz(2182)).toBe("2182 kHz");
    expect(formatKhz(29_999)).toBe("29999 kHz");
  });

  it("in MHz from 30 MHz, with at least three decimals, as a radio shows a channel", () => {
    expect(formatKhz(162_400)).toBe("162.400 MHz");
    expect(formatKhz(121_500)).toBe("121.500 MHz");
    expect(formatKhz(446_006.25)).toBe("446.00625 MHz");
    expect(formatKhz(30_000)).toBe("30.000 MHz");
    expect(formatKhz(145_500)).toBe("145.500 MHz");
  });

  it("writes a stretch in the unit of its edges", () => {
    expect(formatFrequency({ khz: 5900, toKhz: 6200 })).toBe("5900 to 6200 kHz");
    expect(formatFrequency({ khz: 87_500, toKhz: 108_000 })).toBe("87.5 to 108 MHz");
    expect(formatFrequency({ khz: 1600, toKhz: 30_000 })).toBe("1600 to 30000 kHz");
    expect(formatFrequency({ khz: 26_500, toKhz: 28_000 })).toBe("26500 to 28000 kHz");
    expect(formatFrequency({ khz: 1600, toKhz: 54_000 })).toBe("1600 kHz to 54 MHz");
  });

  it("writes a checked day and a closing month in words", () => {
    expect(checkedOn("2026-11-17")).toBe("17 November 2026");
    expect(checkedOn("2024-03")).toBe("March 2024");
  });
});

describe("a schedule that runs out", () => {
  const scheduled = entry({ id: "s", schedule: { season: "B26", from: "2026-10-25", until: "2027-03-27" } });

  it("is current between its first and last days, both included", () => {
    expect(scheduleState(scheduled, "2026-10-25")).toBe("current");
    expect(scheduleState(scheduled, "2027-03-27")).toBe("current");
  });

  it("is expired the day after its last day, and not yet before its first", () => {
    expect(scheduleState(scheduled, "2027-03-28")).toBe("expired");
    expect(scheduleState(scheduled, "2026-10-24")).toBe("not-yet");
  });

  it("has nothing to run out without a schedule", () => {
    expect(scheduleState(entry({ id: "n" }), "2030-01-01")).toBe("none");
  });

  it("knows a real day from one that only looks like one", () => {
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2027-02-29")).toBe(false);
    expect(isDay("2027-3-1")).toBe(false);
  });
});

describe("places", () => {
  it("an entry applies to a country it names, to a country inside a region it names, and everywhere if worldwide", () => {
    expect(appliesTo(entry({ id: "a", where: ["GB"] }), "GB")).toBe(true);
    expect(appliesTo(entry({ id: "b", where: ["itu-1"] }), "GB")).toBe(true);
    expect(appliesTo(entry({ id: "c", where: ["itu-2"] }), "GB")).toBe(false);
    expect(appliesTo(entry({ id: "d", where: ["world"] }), "JP")).toBe(true);
    expect(appliesTo(entry({ id: "e", where: ["north-atlantic"] }), "GB")).toBe(false);
    expect(appliesTo(entry({ id: "f", where: ["north-atlantic"] }), "north-atlantic")).toBe(true);
  });

  it("lists the regions and then the countries by name", () => {
    const places = placesIn([entry({ id: "a", where: ["US", "GB", "north-atlantic"] })]);
    const codes = places.map((place) => place.code);
    expect(codes.indexOf("north-atlantic")).toBeLessThan(codes.indexOf("GB"));
    expect(codes.slice(-2)).toEqual(["GB", "US"]);
    expect(places.find((place) => place.code === "GB")?.name).toBe("United Kingdom");
  });

  it("finds the home place's country from the smallest box that holds it", () => {
    const countries = [
      { code: "GB", bbox: [-8.7, 49.8, 1.8, 60.9] as [number, number, number, number] },
      { code: "IE", bbox: [-10.7, 51.3, -5.3, 55.5] as [number, number, number, number] },
    ];
    expect(countryAt({ lat: 53.35, lon: -6.26 }, countries)).toBe("IE");
    expect(countryAt({ lat: 51.5, lon: -0.12 }, countries)).toBe("GB");
    expect(countryAt({ lat: 0, lon: 0 }, countries)).toBeNull();
    const markers = [{ id: "m", icon: "home", createdAt: 1, lat: 51.5, lon: -0.12 }];
    expect(homeCountry(markers, countries)).toBe("GB");
    expect(homeCountry([{ ...markers[0]!, icon: "pin" }], countries)).toBeNull();
    expect(homeCountry(undefined, countries)).toBeNull();
  });
});

describe("what a set like mine can receive", () => {
  it("an FM and MW portable hears medium wave AM and broadcast FM, not shortwave or sideband", () => {
    const portable = receiverById("portable")!;
    expect(receives(portable, { khz: 909 }, "AM")).toBe(true);
    expect(receives(portable, { khz: 93_500 }, "FM")).toBe(true);
    expect(receives(portable, { khz: 9410 }, "AM")).toBe(false);
    expect(receives(portable, { khz: 198 }, "AM")).toBe(true);
  });

  it("a shortwave portable without SSB does not hear sideband; one with it does", () => {
    expect(receives(receiverById("shortwave")!, { khz: 5450 }, "USB")).toBe(false);
    expect(receives(receiverById("shortwave-ssb")!, { khz: 5450 }, "USB")).toBe(true);
    expect(receives(receiverById("shortwave")!, { khz: 10_000 }, "AM")).toBe(true);
  });

  it("a marine set hears the marine channels and the weather channels, a scanner the air band", () => {
    expect(receives(receiverById("marine-vhf")!, { khz: 156_800 }, "NFM")).toBe(true);
    expect(receives(receiverById("marine-vhf")!, { khz: 162_400 }, "NFM")).toBe(true);
    expect(receives(receiverById("scanner")!, { khz: 121_500 }, "AM")).toBe(true);
    expect(receives(receiverById("pmr446")!, { khz: 446_006.25 }, "NFM")).toBe(true);
  });

  it("a digital mode needs a decoder, and a beacon cannot be listened to on anything", () => {
    expect(receives(receiverById("shortwave-ssb")!, { khz: 518 }, "NAVTEX")).toBe(false);
    expect(receives(receiverById("sdr")!, { khz: 518 }, "NAVTEX")).toBe(true);
    expect(receives(receiverById("sdr")!, { khz: 406_025 }, "BEACON")).toBe(false);
  });

  it("a stretch counts when any of it is in the set's range", () => {
    expect(receives(receiverById("portable")!, { khz: 65_800, toKhz: 108_000 }, "FM")).toBe(true);
  });
});

describe("filtering and finding", () => {
  const all = [
    entry({ id: "wwv", name: "WWV", frequencies: [{ khz: 5000 }, { khz: 10_000 }], where: ["US", "world"] }),
    entry({
      id: "msf",
      name: "MSF",
      kind: "time-signals",
      frequencies: [{ khz: 60 }],
      bands: ["lf"],
      where: ["GB"],
      modes: ["TIME-CODE-DIGITAL"],
    }),
    entry({
      id: "ch16",
      name: "Marine channel 16",
      kind: "distress",
      frequencies: [{ khz: 156_800, channel: "16" }],
      bands: ["marine-vhf"],
      where: ["world"],
      modes: ["NFM"],
    }),
    entry({ id: "old", name: "Unchecked", status: "not-verified", where: ["GB"] }),
  ];

  it("filters by kind, place, band and set together", () => {
    expect(filterFrequencies(all, { kind: "distress" }).map((item) => item.id)).toEqual(["ch16"]);
    expect(filterFrequencies(all, { place: "GB" }).map((item) => item.id)).toEqual(["wwv", "msf", "ch16"]);
    expect(filterFrequencies(all, { band: "lf" }).map((item) => item.id)).toEqual(["msf"]);
    expect(filterFrequencies(all, { receiver: "marine-vhf" }).map((item) => item.id)).toEqual(["ch16"]);
    expect(filterFrequencies(all, { kind: "time-signals", place: "JP" }).map((item) => item.id)).toEqual(["wwv"]);
  });

  it("offers shortwave time signals and broadcasts filed elsewhere, and nothing else the place filter left out", () => {
    const set = [
      entry({ id: "wwv", name: "WWV", kind: "time-signals", frequencies: [{ khz: 5000 }, { khz: 10_000 }], where: ["US", "itu-2"] }),
      entry({ id: "msf", name: "MSF", kind: "time-signals", frequencies: [{ khz: 60 }], where: ["GB"] }),
      entry({ id: "wwvb", name: "WWVB", kind: "time-signals", frequencies: [{ khz: 60 }], where: ["US"] }),
      entry({ id: "chu", name: "CHU", kind: "time-signals", status: "closed", frequencies: [{ khz: 7850 }], where: ["CA"] }),
      entry({ id: "ppe", name: "PPE", kind: "time-signals", status: "not-verified", frequencies: [{ khz: 10_000 }], where: ["BR"] }),
      entry({ id: "sw", name: "A broadcaster", kind: "broadcasters", frequencies: [{ khz: 9500 }], where: ["IN"] }),
      entry({ id: "mw", name: "A medium wave station", kind: "broadcasters", frequencies: [{ khz: 525, toKhz: 1705 }], where: ["US"] }),
      entry({ id: "cb", name: "CB channel 9", kind: "licence-free", frequencies: [{ khz: 27_065 }], where: ["US"] }),
    ];
    // From Britain: the American time signal on shortwave and the Indian broadcaster, not the one on long wave,
    // the closed one, the unchecked one, medium wave, or another country's CB.
    expect(heardFromAfar(set, { place: "GB" }).map((item) => item.id)).toEqual(["wwv", "sw"]);
    expect(heardFromAfar(set, { place: "GB", kind: "time-signals" }).map((item) => item.id)).toEqual(["wwv"]);
    // Already listed for the place: not offered twice.
    expect(heardFromAfar(set, { place: "US" }).map((item) => item.id)).toEqual(["sw"]);
    // No place chosen: everything is already in the list.
    expect(heardFromAfar(set, {})).toEqual([]);
  });

  it("keeps entries not checked against a primary source out unless asked", () => {
    expect(filterFrequencies(all, {}).map((item) => item.id)).not.toContain("old");
    expect(filterFrequencies(all, { showUnverified: true }).map((item) => item.id)).toContain("old");
  });

  it("finds by name, by a frequency's first figures in kHz or MHz, and by channel", () => {
    expect(matchesText(all[0]!, "wwv")).toBe(true);
    expect(matchesText(all[0]!, "10000")).toBe(true);
    expect(matchesText(all[2]!, "156.8")).toBe(true);
    expect(matchesText(all[2]!, "16")).toBe(true);
    expect(matchesText(all[2]!, "marine 16")).toBe(true);
    expect(matchesText(all[1]!, "wwv")).toBe(false);
    expect(matchesText(all[1]!, "united kingdom")).toBe(true);
  });

  it("says how fresh a set is from its oldest and newest checks", () => {
    const older = entry({ id: "o", sources: [{ ...source, checked: "2026-11-15" }] });
    expect(setChecked([older, all[0]!])).toEqual({ from: "2026-11-15", to: "2026-11-17" });
  });
});
