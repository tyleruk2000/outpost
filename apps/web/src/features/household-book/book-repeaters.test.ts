/**
 * The book's repeaters: the places it lists them round (home, or where a portable household
 * was, the meeting points, the people we would go to, each journey), the nearest useful ones
 * for each, each listed once, the map of each place with its ranges, and a PDF whose words
 * hold the callsigns.
 */
import { type BookFacts, DEFAULT_BOOK_ANSWERS, type MarkerDto, type RepeaterDto, type RepeaterListDto } from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { type BookInputs, bookRepeaterGroups, makeBook } from "./book";
import {
  chooseRepeaters,
  horizonRange,
  mappedGroups,
  REPEATERS_PER_PLACE,
  repeaterLocations,
  repeaterQueries,
  searchRadiusKm,
} from "./book-repeaters";
import { repeaterMapSvg } from "./repeater-figure";

const KM_LON = 111.32 * Math.cos((54.5 * Math.PI) / 180);
/** A point `east` and `north` kilometres from (54.5, −3). */
const off = (east: number, north: number) => ({ lat: 54.5 + north / 111.32, lon: -3 + east / KM_LON });

let next = 0;
function repeater(callsign: string, east: number, north: number, over: Partial<RepeaterDto> = {}): RepeaterDto {
  next += 1;
  return {
    id: `r${next}`,
    listId: "ukr",
    callsign,
    outputHz: 145_600_000,
    inputHz: 145_000_000,
    band: "2m",
    modes: ["fm"],
    ctcssHz: 77,
    dcsCode: null,
    dmrColourCode: null,
    talkgroups: "",
    accessNote: "",
    channel: "",
    place: `${callsign} site`,
    region: "",
    country: "GB",
    ...off(east, north),
    locator: "",
    positionPrecisionMeters: 50,
    antennaMeters: null,
    keeper: "",
    status: "operational",
    statusText: "",
    notes: "",
    edited: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const home = { name: "Home", ...off(0, 0), country: "GB" };
const hall: MarkerDto = { id: "hall", name: "Village hall", ...off(2, 0), icon: "pin" } as never;
const gran: MarkerDto = { id: "gran", name: "Gran's", ...off(60, 0), icon: "pin" } as never;

const facts: BookFacts = {
  home,
  help: [],
  keepAway: [],
  floodZones: null,
  planningZones: null,
  climate: null,
  terrain: false,
  journeys: [
    {
      destinationId: "d1",
      name: "Gran's",
      lat: gran.lat,
      lon: gran.lon,
      distanceMeters: 60_000,
      bearingDegrees: 90,
      ground: null,
      walks: [],
      towns: [],
    },
  ],
  notMeasured: [],
};

const answers = {
  ...DEFAULT_BOOK_ANSWERS,
  sections: ["frequencies" as const],
  meetingPoints: [{ id: "m", markerId: "hall", role: "near" as const, note: "" }],
  destinations: [{ id: "d1", name: "Gran's", markerId: "gran", contactId: null, note: "" }],
};

const pool = [
  repeater("GB3NEAR", 3, 4),
  repeater("GB3UHF", -6, 1, { outputHz: 433_050_000, inputHz: 434_650_000, band: "70cm", ctcssHz: null, dcsCode: "023" }),
  repeater("GB3DMR", 1, 1, { modes: ["dmr"], ctcssHz: null }),
  repeater("GB3OFF", 0.5, 0, { status: "off-air" }),
  repeater("GB3FAR", 0, 70),
  repeater("GB3SIX", 0, 70, { outputHz: 51_810_000, inputHz: 51_310_000, band: "6m", ctcssHz: null }),
  repeater("GB3A", 8, -3),
  repeater("GB3B", -9, -9),
  repeater("GB3C", 12, 12),
  repeater("GB3D", -15, 15),
  repeater("GB3E", 20, -2),
  repeater("GB3MID", 30, 5, { antennaMeters: 30 }),
  repeater("GB3GRAN", 61, 1),
  repeater("GB3NOPOS", 0, 0, { lat: null, lon: null }),
];
// A second list's copy of a repeater already held: listed once.
pool.push({ ...pool[0]!, id: "copy", listId: "other" });

const lists: RepeaterListDto[] = [
  {
    id: "ukr",
    name: "UK repeaters",
    source: "A club's list",
    dataDate: Date.UTC(2026, 9, 30),
  } as RepeaterListDto,
];

const locations = repeaterLocations({
  answers,
  markers: [hall, gran],
  mapped: [
    { number: 1, role: "Home", name: "Home", lat: home.lat, lon: home.lon, note: "" },
    { number: 2, role: "Meet near home", name: "Village hall", lat: hall.lat, lon: hall.lon, note: "" },
  ],
  first: { role: "Home", name: "Home", lat: home.lat, lon: home.lon },
  journeys: facts.journeys,
});

describe("the places the book lists repeaters round", () => {
  it("takes home, the meeting points, the people we would go to, then each journey", () => {
    expect(locations.map((each) => `${each.kind}: ${each.name}`)).toEqual([
      "home: Home",
      "meet: Village hall",
      "place: Gran's",
      "journey: Gran's",
    ]);
  });

  it("asks the list about each place, and about points along a journey", () => {
    const queries = repeaterQueries(locations);
    expect(queries).toHaveLength(3 + 2);
    expect(queries.every((query) => query.withinKm === 80)).toBe(true);
  });
});

describe("choosing the repeaters", () => {
  const groups = chooseRepeaters(locations, pool);
  const callsigns = (index: number) => groups[index]!.chosen.map((each) => each.repeater.callsign);

  it("takes the nearest useful ones round home, FM first, at most six, nearest first", () => {
    expect(callsigns(0)).toHaveLength(REPEATERS_PER_PLACE);
    expect(callsigns(0)).toEqual(["GB3NEAR", "GB3UHF", "GB3A", "GB3B", "GB3C", "GB3E"]);
    // Off the air, without a position or digital only behind six FM ones: left out.
    expect(callsigns(0)).not.toContain("GB3OFF");
    expect(callsigns(0)).not.toContain("GB3NOPOS");
    expect(callsigns(0)).not.toContain("GB3DMR");
    const distances = groups[0]!.chosen.map((each) => each.distanceMeters);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("lists each repeater once: a meeting point next to home names home's as also near", () => {
    const all = groups.flatMap((group) => group.chosen.map((each) => each.repeater.callsign));
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((callsign) => callsign === "GB3NEAR")).toHaveLength(1);
    expect(groups[1]!.also.map((each) => each.listedUnder)).toContain("Home");
  });

  it("looks for each band within its own radius", () => {
    expect(searchRadiusKm("2m")).toBe(50);
    expect(searchRadiusKm("70cm")).toBe(40);
    expect(searchRadiusKm("6m")).toBe(80);
    // 70 km north: too far for 2 m, near enough for 6 m.
    const far = pool.filter((each) => each.callsign === "GB3FAR" || each.callsign === "GB3SIX");
    const [home] = chooseRepeaters(locations.slice(0, 1), far);
    expect(home!.chosen.map((each) => each.repeater.callsign)).toEqual(["GB3SIX"]);
  });

  it("chooses along a journey in order along the way, measured from the line", () => {
    const journey = groups[3]!;
    const along = [...journey.chosen, ...journey.also].sort((a, b) => (a.alongMeters ?? 0) - (b.alongMeters ?? 0));
    expect(along.map((each) => each.repeater.callsign)).toContain("GB3MID");
    const mid = along.find((each) => each.repeater.callsign === "GB3MID")!;
    expect(mid.distanceMeters).toBeLessThan(6_000);
    expect(mid.alongMeters).toBeGreaterThan(25_000);
    expect(journey.chosen.length + journey.also.length).toBeLessThanOrEqual(8);
  });

  it("measures from a portable household's position as its home", () => {
    const van = bookRepeaterGroups({
      answers: { ...answers, meetingPoints: [], destinations: [] },
      markers: [],
      plans: [],
      facts: { ...facts, home: { name: "Where The van is now", ...off(60, 0), country: "GB", kind: "here", at: 1 }, journeys: [] },
      which: { name: "The van", kind: "portable", several: false },
      repeaters: pool,
    });
    expect(van).toHaveLength(1);
    expect(van[0]!.location.role).toBe("Last position");
    expect(van[0]!.chosen[0]!.repeater.callsign).toBe("GB3GRAN");
  });

  it("gives a plain circle at the radio horizon where no range was worked out", () => {
    const range = horizonRange({ antennaMeters: null });
    expect(range.basis).toBe("horizon");
    expect(range.aerialListed).toBe(false);
    // A 10 m mast and a handheld at 1.5 m over a smooth Earth of 4/3 radius: about 18 km.
    expect(Math.round(range.meters / 1000)).toBe(18);
  });
});

const bookInputs = (over: Partial<BookInputs> = {}): BookInputs => ({
  answers,
  facts,
  household: null,
  outlook: null,
  missing: [],
  people: [],
  opened: new Map(),
  medicalContacts: {},
  plans: [],
  emergencyContacts: [],
  comms: null,
  markers: [hall, gran],
  destinationContacts: {},
  entries: RADIO_FREQUENCIES,
  made: new Date(Date.UTC(2026, 10, 22)),
  today: "2026-11-22",
  previous: null,
  supplies: null,
  grab: null,
  repeaters: pool,
  repeaterLists: lists,
  repeaterRanges: { [pool[0]!.id]: { meters: 24_000, basis: "terrain", aerialMeters: 10, aerialListed: false } },
  ...over,
});

describe("the repeaters in the book", () => {
  const book = makeBook(bookInputs());
  const words = contentText(book.document.content);

  it("groups the table by place with compact columns, and says which list and its date", () => {
    expect(words).toMatch(
      /Home Callsign Output Input \(shift\) Tone Mode Where From here Likely range GB3NEAR 145\.6000 145\.0000 \(−0\.6\) 77 Hz FM/,
    );
    expect(words).toMatch(/GB3UHF 433\.0500 434\.6500 \(\+1\.6\) DCS 023 FM/);
    expect(words).toContain("Meet near home: Village hall");
    expect(words).toContain("On the way to Gran's");
    expect(words).toMatch(/GB3MID 5\.0 km N of the line, 30 km along/);
    expect(words).toMatch(/UK repeaters \(A club's list\), data of 30 October 2026/);
    expect(words).toContain("2 m repeaters within 50 km");
  });

  it("draws a map for each place with its own repeaters, captioned as a rough guide", () => {
    const mapped = mappedGroups(bookRepeaterGroups(bookInputs()));
    expect(mapped.length).toBeGreaterThanOrEqual(2);
    expect(words).toContain("Repeaters: Home");
    expect(words).toContain("A rough guide, not a coverage prediction.");
    expect(words).toContain("Hills and buildings block VHF and UHF");
    expect(words).toMatch(/GB3NEAR \(24 km\): the typical range worked out from the terrain installed/);
    expect(words).toMatch(/smooth-Earth radio horizon/);
    expect(words).toContain("drawn to scale on a plain grid");
  });

  it("draws each band's circle with its own dash, the callsigns and the key", () => {
    const groups = bookRepeaterGroups(bookInputs());
    const { svg } = repeaterMapSvg({
      group: groups[0]!,
      locations: groups.map((each) => each.location),
      ranges: {},
      map: null,
      missing: null,
      measure: 499,
    });
    expect(svg).toContain('stroke-dasharray="7 3"');
    expect(svg).toContain('stroke-dasharray="2 2"');
    expect(svg).toContain(">GB3NEAR<");
    expect(svg).toContain("2 m: likely range");
    expect(svg).toContain("Grid lines");
  });

  it("is a PDF whose words hold the callsigns", async () => {
    const printed = await renderPdf(book.document);
    const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
    let text = "";
    for (let number = 1; number <= pdf.numPages; number += 1)
      text += `${(await (await pdf.getPage(number)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`;
    for (const callsign of ["GB3NEAR", "GB3UHF", "GB3MID", "GB3GRAN"]) expect(text).toContain(callsign);
    writeSample("book-repeaters", printed.bytes);
  }, 60_000);
});
