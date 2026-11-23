/**
 * The household book's radio plans and drawings: each radio plan chosen goes in with its
 * stations, its hours in local time and UTC and its bands best first, one left out does
 * not, an emergency plan's own words on keeping in touch are named and point at the radio
 * plan, the wizard asks which radio plans go in, and every new drawing is in the PDF as
 * words a reader can find, with its caption.
 *
 * Set OUTPOST_PRINT_SAMPLES to a folder to have the book written there, to look at.
 */
import {
  type BookFacts,
  type CommunicationPlan,
  DEFAULT_BOOK_ANSWERS,
  type EmergencyPlanResponse,
  emptyPlanBody,
  type Household,
  type PlanResult,
  type SuppliesResponse,
  type SupplyOutlook,
} from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { matrixOf, planOf } from "@/features/propagation/print-fixtures";
import { type BookInputs, makeBook } from "./book";
import { goFlow, lastingDrawing, powerCutTimeline, safeWaterFlow, waterNeedsDrawing } from "./book-figures";
import { localClock, localRanges, scheduleDrawing, zoneName } from "./book-radio";
import { BookWizard } from "./wizard";

afterEach(() => {
  vi.unstubAllGlobals();
});

const svgWords = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]).join(" | ");

const household: Household = {
  daysWanted: 3,
  energyTable: "uk",
  drinkingLitres: 3,
  allUsesLitres: 7.5,
  waterBasis: "drinking",
  updatedAt: 1,
  members: [
    {
      id: "m1",
      kind: "person",
      name: "Ana",
      band: "19-64",
      sex: "female",
      kcalPerDay: null,
      drinkingLitres: null,
      allUsesLitres: null,
      note: "",
    },
    {
      id: "m2",
      kind: "person",
      name: "Kit",
      band: "7-10",
      sex: null,
      kcalPerDay: null,
      drinkingLitres: null,
      allUsesLitres: null,
      note: "",
    },
  ],
};

const facts: BookFacts = {
  home: { name: "Home", lat: 51.5, lon: -1, country: "GB" },
  help: [],
  keepAway: [],
  floodZones: null,
  planningZones: null,
  climate: null,
  terrain: false,
  journeys: [],
  notMeasured: [],
};

const day = <T,>(value: T) => Array.from({ length: 24 }, () => value);
/** A share of days that rises through the day on 20 m and falls on 80 m, so the first and second bands change with the hour. */
const curve = (peak: number, at: number) => Array.from({ length: 24 }, (_, index) => Math.max(0, peak - Math.abs(index + 1 - at) * 0.08));

const stations = planOf().stations;
const third = { ...stations[0]!, id: "gran", name: "G4ABC", lat: 52.2, lon: 0.12 };
const family: CommunicationPlan = planOf({
  id: "rp1",
  name: "Family net",
  stations: [...stations, third],
  fromUtc: 7,
  toUtc: 19,
  bands: ["80m", "40m", "20m"],
});
const pair = (a: string, b: string, km: number) => ({
  a,
  b,
  distanceKm: km,
  bearingDeg: 330,
  backBearingDeg: 150,
  problem: null,
  bands: [
    {
      bandId: "80m",
      mhz: 3.65,
      forward: { reliability: curve(0.7, 20), snrDbHz: day(40) },
      back: { reliability: curve(0.7, 20), snrDbHz: day(40) },
    },
    {
      bandId: "40m",
      mhz: 7.1,
      forward: { reliability: curve(0.85, 11), snrDbHz: day(48) },
      back: { reliability: curve(0.8, 11), snrDbHz: day(46) },
    },
    {
      bandId: "20m",
      mhz: 14.18,
      forward: { reliability: curve(0.6, 13), snrDbHz: day(44) },
      back: { reliability: curve(0.55, 13), snrDbHz: day(42) },
    },
  ],
});
const familyMatrix: PlanResult = matrixOf({
  planId: "rp1",
  pairs: [pair("home", "shelter", 383), pair("home", "gran", 90), pair("shelter", "gran", 420)],
});
const spare: CommunicationPlan = planOf({ id: "rp2", name: "Spare net", workedOut: false, bands: ["60m", "40m"] });

const floodPlan: EmergencyPlanResponse = {
  plan: {
    id: "e1",
    name: "Our flood plan",
    kind: "flooding",
    kindText: "",
    templateId: null,
    emergencyNumber: "999",
    reviewEveryDays: null,
    body: {
      ...emptyPlanBody(),
      comms: { text: "Meet at the church at noon", commPlanId: "rp1", frequency: "PMR446 channel 3", schedule: "On the hour" },
    },
    createdAt: 1,
    updatedAt: 1,
  },
  resolved: { contacts: {}, places: {}, people: {}, commPlan: { id: "rp1", name: "Family net" }, powerPlan: null },
} as unknown as EmergencyPlanResponse;

const outlook = {
  daysWanted: 4,
  food: { days: 6.5 },
  water: { days: 2, daysDrinking: 2, daysAllUses: 0.8 },
  petFood: null,
} as unknown as SupplyOutlook;

const inputs = (over: Partial<BookInputs> = {}): BookInputs => ({
  answers: {
    ...DEFAULT_BOOK_ANSWERS,
    householdName: "The Rowans",
    days: 4,
    meetingPoints: [
      { id: "mp1", markerId: "k1", role: "near", note: "" },
      { id: "mp2", markerId: "k2", role: "near", note: "" },
      { id: "mp3", markerId: "k3", role: "away", note: "" },
    ],
    destinations: [{ id: "d1", name: "Gran's", markerId: "k4", contactId: null, note: "" }],
  },
  facts,
  household,
  outlook,
  missing: [],
  people: [],
  opened: new Map(),
  medicalContacts: {},
  plans: [floodPlan],
  emergencyContacts: [],
  comms: null,
  markers: [
    { id: "k1", name: "The oak on the green", lat: 51.501, lon: -1, icon: "pin" },
    { id: "k2", name: "Village hall", lat: 51.502, lon: -1, icon: "pin" },
    { id: "k3", name: "Church in Abingdon", lat: 51.67, lon: -1.28, icon: "pin" },
    { id: "k4", name: "Gran's house", lat: 51.75, lon: -1.25, icon: "pin" },
  ] as unknown as BookInputs["markers"],
  destinationContacts: {},
  entries: RADIO_FREQUENCIES,
  made: new Date(Date.UTC(2026, 10, 21)),
  today: "2026-11-21",
  previous: null,
  supplies: {
    items: [{ id: "i1", name: "Bottled water", category: "water", quantity: 24, unit: "litres", location: "Cellar", date: "2027-05-01" }],
    locations: [],
    household,
  } as unknown as SuppliesResponse,
  grab: null,
  repeaters: [],
  radioPlans: [
    { plan: family, result: familyMatrix },
    { plan: spare, result: null },
  ],
  timeZone: "Europe/Paris",
  ...over,
});

describe("radio plans in the book", () => {
  it("gives local time and UTC for the plan's day", () => {
    // Paris is an hour ahead in November and two in July.
    expect(localClock("2026-11-16", 7, "Europe/Paris")).toBe("08:00");
    expect(localClock("2026-07-16", 7, "Europe/Paris")).toBe("09:00");
    expect(localClock("2026-11-16", 24, "Asia/Kolkata")).toBe("05:30");
    expect(zoneName("2026-11-16", 7, "Europe/London")).toBe("GMT");
    expect(localRanges("2026-11-16", [22, 23, 24, 1], "Europe/Paris")).toBe("23:00 to 02:00");
  });

  it("puts in every radio plan, with its stations, its hours in local time and UTC, and its bands best first", () => {
    const book = makeBook(inputs());
    const all = contentText(book.document.content);
    expect(book.contents.map((entry) => entry.label)).toContain("Radio plans");
    expect(all).toContain("Radio plan Family net");
    expect(all).toContain("When to listen and call");
    expect(all).toMatch(/The plan's window 07:00 to 19:00 UTC 08:00 to 20:00 CET/);
    expect(all).toMatch(/Home base and Remote shelter, first 40 m \(7\.1 MHz\), \d\d:00 to \d\d:00 UTC \d\d:00 to \d\d:00 CET/);
    expect(all).toContain("Bands, in order of preference");
    expect(all).toContain("Remote shelter");
    expect(all).toContain("G4ABC");
    expect(all).toContain("each band by the hour");
    // A plan with no matrix: its bands as listed, and how to work it out.
    expect(all).toContain("Radio plan Spare net");
    expect(all).toContain("In the order the plan lists them: 60 m (5.33 MHz), 40 m (7.1 MHz)");
    expect(all).toContain("Not worked out yet");
    expect(all).toContain("Named in our emergency plan: Our flood plan");
    expect(book.summary["radio-plans"]).toContain("Plan: Family net, 07:00 to 19:00 UTC");
    expect(all).toContain("Radio plans: worked out on this Outpost with VOACAP (VOACAP Version 16.1207W)");
  });

  it("leaves out a radio plan not chosen, and says when none is in", () => {
    const some = contentText(
      makeBook(inputs({ answers: { ...inputs().answers, radioPlanChoice: "some", radioPlanIds: ["rp2"] } })).document.content,
    );
    expect(some).toContain("Radio plan Spare net");
    expect(some).not.toContain("Radio plan Family net");
    const none = contentText(
      makeBook(inputs({ answers: { ...inputs().answers, radioPlanChoice: "some", radioPlanIds: [] } })).document.content,
    );
    expect(none).toContain("No radio plan is in the book.");
    const off = makeBook(
      inputs({ answers: { ...inputs().answers, sections: DEFAULT_BOOK_ANSWERS.sections.filter((id) => id !== "radio-plans") } }),
    );
    expect(off.contents.map((entry) => entry.label)).not.toContain("Radio plans");
  });

  it("prints an emergency plan's keeping in touch with each part named, pointing at the radio plan", () => {
    const all = contentText(makeBook(inputs()).document.content);
    expect(all).toContain("Meet at the church at noon");
    expect(all).toContain("On: PMR446 channel 3");
    expect(all).toContain("When: On the hour");
    expect(all).toContain("Radio plan: Family net, under Radio plans in this book");
    const left = contentText(
      makeBook(inputs({ answers: { ...inputs().answers, radioPlanChoice: "some", radioPlanIds: [] } })).document.content,
    );
    expect(left).toContain("Radio plan: Family net, in Outpost under Radio › Plans");
  });
});

describe("the book's drawings", () => {
  it("draws the plan's day with UTC over it and local time under it", () => {
    const words = svgWords(
      scheduleDrawing(500, {
        date: "2026-11-16",
        window: [7, 8, 9],
        rows: [{ label: "Home and Gran", first: { hours: [8, 9], words: "40 m" }, second: { hours: [7], words: "80 m" } }],
        timeZone: "Europe/Paris",
        zone: "CET",
      }).svg,
    );
    for (const label of ["UTC", "The window", "Home and Gran", "40 m", "80 m", "CET", "first band", "second band"])
      expect(words).toContain(label);
  });

  it("draws only the words and figures the book prints", () => {
    expect(svgWords(waterNeedsDrawing(240, [{ name: "Ana", drinking: 3, allUses: 7.5 }]).svg)).toBe(
      "Ana | 7.5 l | 3 l | to drink | all uses",
    );
    const safe = svgWords(safeWaterFlow(500).svg);
    for (const label of [
      "Step 1: clear it",
      "Step 2: kill the germs",
      "boil it,",
      "Keep it clean",
      "Clearing does not make water safe. Only step 2 does.",
    ])
      expect(safe).toContain(label);
    const go = svgWords(
      goFlow(500, [
        {
          kind: "near",
          when: "If we cannot get home",
          places: [
            { name: "Village hall", number: 2 },
            { name: "Oak", number: 3 },
          ],
        },
      ]).svg,
    );
    expect(go).toContain("Village hall");
    expect(go).toContain("then");
    expect(
      svgWords(
        lastingDrawing(
          500,
          [
            { label: "Food", days: 6.5 },
            { label: "Water", days: null, why: "no water counted" },
          ],
          4,
        ).svg,
      ),
    ).toContain("4 days wanted");
    const cut = svgWords(
      powerCutTimeline(500, { doors: "Keep doors closed", fridge: "throw away", freezer: "throw away", fridgeHours: 4, freezerHours: 24 })
        .svg,
    );
    expect(cut).toContain("4 hours: the fridge");
    expect(cut).toContain("24 hours: the freezer");
  });

  it("puts every new drawing in the book with its caption, as words a reader finds in the PDF", async () => {
    const book = makeBook(inputs());
    const printed = await renderPdf(book.document);
    writeSample("book-comms-and-diagrams", printed.bytes);
    const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
    let words = "";
    for (let number = 1; number <= pdf.numPages; number += 1)
      words += `${(await (await pdf.getPage(number)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`;
    const flat = words.replace(/\s+/g, " ");
    for (const title of [
      "The plan's day",
      "Making water safe, in order",
      "Litres a day",
      "Where we go",
      "How long it lasts, against the days we want",
      "Food in the fridge and freezer when the power is off",
    ])
      expect(flat).toContain(title);
    // Words inside the drawings, as text.
    for (const label of ["The window", "Step 2: kill the germs", "Village hall", "days wanted", "the freezer", "first band"])
      expect(flat).toContain(label);
    // Captions.
    expect(flat).toContain("Numbers are the map's");
    expect(flat).toContain("drawn to one scale");
    expect(flat).toContain("GOV.UK's guidance for after a flood");
  }, 60_000);
});

describe("the question of which radio plans go in", () => {
  it("offers all of them or only some, and keeps the ones ticked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const { pathname } = new URL(String(input), "http://outpost.test");
        const body = pathname === "/api/radio/communication-plans" ? { plans: [family, spare] } : { plans: [] };
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const saved: unknown[] = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BookWizard
            answers={DEFAULT_BOOK_ANSWERS}
            household={household}
            markers={[]}
            country="GB"
            sheets={new Set()}
            saving={false}
            save={async (answers) => {
              saved.push(answers);
            }}
            onDone={() => {}}
            startAt="book"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("radio", { name: "All 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Only some" }));
    const spareBox = await screen.findByRole("checkbox", { name: "Spare net" });
    expect(spareBox.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(spareBox);
    fireEvent.click(screen.getByRole("button", { name: /Save the answers/ }));
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ radioPlanChoice: "some", radioPlanIds: ["rp1"] });
  });
});
