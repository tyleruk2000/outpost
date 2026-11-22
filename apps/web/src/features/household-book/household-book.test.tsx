/**
 * The household book: what its pages say from the answers and from what Outpost holds
 * (the number to call, the people and their medicines, help near home with distance and
 * direction, a site upwind of home, a journey with a stop for each night, the water worked
 * out for the days), what it says when something is not held, what changed since the last
 * book, and the screen's first state.
 */
import { type BookFacts, DEFAULT_BOOK_ANSWERS, emptyMedicalRecord, type Household, type MedicalSheet } from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Sheet } from "@/features/maps/print/sheet";
import { type BookInputs, emergencyNumberFor, makeBook } from "./book";
import { BookHomeLine } from "./book-line";
import BookPage from "./book-page";
import { FIRST_AID_PAGES, NHS_CREDIT } from "./first-aid";

afterEach(() => {
  vi.unstubAllGlobals();
});

const texts = (pages: Sheet[]) =>
  pages.flatMap((page) => page.items.flatMap((item) => (item.kind === "text" && !item.hidden ? [item.text] : []))).join(" ");

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
    { id: "m3", kind: "pet", name: "Rex", band: null, sex: null, kcalPerDay: 900, drinkingLitres: 1, allUsesLitres: 1, note: "Dog" },
  ],
};

const anaSheet: MedicalSheet = {
  id: "s1",
  memberId: "m1",
  name: "Ana",
  encrypted: false,
  record: {
    ...emptyMedicalRecord(),
    medicines: [
      {
        id: "x",
        name: "Salbutamol",
        dose: "Two puffs",
        when: "When needed",
        keptWhere: "Coat pocket",
        held: null,
        unit: "",
        perDay: null,
        countedOn: null,
      },
    ],
  },
  armor: null,
  createdAt: 1,
  updatedAt: 2,
};

const facts: BookFacts = {
  home: { name: "Home", lat: 51.5, lon: -1, country: "GB" },
  help: [
    {
      id: "hospitals",
      label: "Hospitals",
      layer: "hospitals",
      held: true,
      places: [{ name: "Town Hospital", kindLabel: "Hospital", lat: 51.52, lon: -1, distanceMeters: 2224, bearingDegrees: 0 }],
    },
    { id: "pharmacies", label: "Pharmacies", layer: "food", held: false, places: [] },
    { id: "water", label: "Drinking water points", layer: "food", held: false, places: [] },
  ],
  keepAway: [
    {
      id: "nuclear",
      label: "Nuclear facilities",
      layer: "nuclear",
      held: true,
      places: [
        { name: "Old Reactor", kindLabel: "Nuclear power station", lat: 51.5, lon: -1.2, distanceMeters: 13_900, bearingDegrees: 270 },
      ],
    },
  ],
  floodZones: null,
  planningZones: null,
  climate: {
    months: Array(12).fill({ meanC: 5, precipMmPerDay: 2, precipMmMonth: 60, windMs: 5, windFromDeg: 250, sunKwhLevel: 1 }),
    period: "2001 to 2025",
    fetchedAt: Date.UTC(2026, 10, 1),
    placeName: "Home",
    wind: { fromDegrees: 246, months: Array(12).fill(250), fetchedAt: Date.UTC(2026, 10, 1), period: "2001 to 2025" },
  },
  terrain: false,
  journeys: [
    {
      destinationId: "d1",
      name: "Gran's",
      lat: 51.5,
      lon: -1.6,
      distanceMeters: 41_600,
      bearingDegrees: 270,
      ground: null,
      walks: [
        {
          pace: "standard",
          hours: 9.1,
          days: 2,
          stops: [{ day: 1, lat: 51.5, lon: -1.37, alongMeters: 27_500, near: "Midway", nearMeters: 4_000 }],
        },
        { pace: "slowest", hours: 18.2, days: 4, stops: [] },
      ],
      towns: [{ name: "Midway", lat: 51.5, lon: -1.3 }],
    },
  ],
  notMeasured: [],
};

const inputs = (over: Partial<BookInputs> = {}): BookInputs => ({
  answers: {
    ...DEFAULT_BOOK_ANSWERS,
    householdName: "The Rowans",
    emergencyNumber: "",
    days: 4,
    people: [{ memberId: "m2", needs: "Hard of hearing", carries: "", childCard: true }],
    destinations: [{ id: "d1", name: "Gran's", markerId: "g", contactId: null, note: "" }],
    vehicles: [{ id: "v", name: "The van", rangeKm: 30, seats: 3, note: "" }],
    receivers: ["portable"],
  },
  facts,
  household,
  outlook: null,
  missing: [],
  people: [{ memberId: "m1", name: "Ana", sheet: anaSheet }],
  opened: new Map(),
  medicalContacts: {},
  plans: [],
  emergencyContacts: [],
  comms: null,
  markers: [],
  destinationContacts: {},
  entries: RADIO_FREQUENCIES,
  made: new Date(Date.UTC(2026, 10, 21)),
  today: "2026-11-21",
  previous: null,
  ...over,
});

describe("the book's pages", () => {
  const book = makeBook(inputs());
  const all = texts(book.pages);

  it("has a cover with the number to call, a contents page, and every page numbered", () => {
    expect(all).toContain("The Rowans: household book");
    expect(all).toContain("999");
    expect(all).toContain("Contents");
    expect(book.contents.map((entry) => entry.label)).toContain("First aid");
    expect(book.contents.at(-1)?.label).toBe("Pages for notes");
    // Numbered from the cover to the last notes page.
    const last = book.pages
      .at(-1)!
      .items.filter((item) => item.kind === "text")
      .at(-1);
    expect(last && last.kind === "text" ? last.text : "").toBe(String(book.pages.length));
    expect(all).toContain("This is the first book made");
  });

  it("puts each person with their needs and medicines, and the pets", () => {
    expect(all).toContain("Hard of hearing");
    expect(all).toContain("Salbutamol");
    expect(all).toContain("Rex");
  });

  it("measures help from home, and says how to get what is not held", () => {
    expect(all).toContain("Town Hospital");
    expect(all).toMatch(/2\.2 km/);
    expect(all).toMatch(/N \(0°\)/);
    expect(all).toMatch(/Not held: no food and supplies layer is installed/);
  });

  it("marks a site upwind of home from the wind's average direction, and says what an average cannot", () => {
    expect(all).toContain("Old Reactor");
    expect(all).toMatch(/WSW \(246°\)/);
    expect(all).toMatch(/An average says nothing about any one day/);
    expect(all).toMatch(/COMAH/);
  });

  it("quotes the NHS website unchanged, credited, and says what it cannot hold", () => {
    expect(all).toContain(FIRST_AID_PAGES[0]!.parts[0]!.lines[0]!.slice(0, 40));
    expect(all).toContain(NHS_CREDIT.slice(0, 30));
    expect(all).toMatch(/St John Ambulance/);
  });

  it("works out the water for the people, the pet and the days", () => {
    // Ana 3 l, Kit 3 l, Rex 1 l: 7 litres a day, 28 for 4 days.
    expect(all).toContain("28 l");
  });

  it("walks the journey with a stop for each night, and says the van cannot get there on one tank", () => {
    expect(all).toContain("To Gran's");
    expect(all).toContain("Midway");
    expect(all).toMatch(/Outpost has no road routing/);
    expect(all).toMatch(/The van: about 30 km.*cannot get there on one/s);
  });

  it("makes a card for each child asked for, and lists the stations the household's radio can hear", () => {
    expect(all).toContain("My name is Kit.");
    expect(all).toContain("BBC Radio 4");
  });

  it("lists its sources with the dates read", () => {
    expect(all).toContain("Sources");
    expect(all).toMatch(/read 16 November 2026/);
    expect(all).toMatch(/Tobler/);
    expect(all).toMatch(/NASA/);
  });

  it("says what changed since the last book", () => {
    const next = makeBook(
      inputs({
        previous: {
          madeAt: Date.UTC(2026, 10, 1),
          pages: 30,
          sections: book.sections,
          summary: { ...book.summary, people: ["Ana", "Sam"] },
        },
      }),
    );
    const words = texts(next.pages);
    expect(words).toMatch(/Changed since the book of 1 November 2026/);
    expect(words).toMatch(/Our household: new .*Kit: Hard of hearing.* gone Sam/);
  });

  it("takes the emergency number from the answers, then from home's country", () => {
    expect(emergencyNumberFor({ ...DEFAULT_BOOK_ANSWERS, emergencyNumber: "111" }, "GB", [])).toBe("111");
    expect(emergencyNumberFor(DEFAULT_BOOK_ANSWERS, "FR", [])).toBe("112");
  });

  it("says plainly what it cannot do without a home", () => {
    const homeless = texts(makeBook(inputs({ facts: { ...facts, home: null, journeys: [] } })).pages);
    expect(homeless).toMatch(/No saved place has the home icon/);
  });
});

describe("the household book screen", () => {
  it("starts with the questions when nothing is saved yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const { pathname } = new URL(String(input), "http://outpost.test");
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        if (pathname === "/api/household-book") return json({ answers: DEFAULT_BOOK_ANSWERS, answersAt: null, made: null });
        if (pathname === "/api/household-book/facts") return json({ ...facts, journeys: [] });
        if (pathname === "/api/supplies") return json({ items: [], locations: [], household });
        if (pathname === "/api/medical-sheets") return json({ sheets: [], inSearch: false, inTools: false });
        if (pathname === "/api/emergency-plans") return json({ plans: [] });
        if (pathname === "/api/maps/markers") return json({ markers: [] });
        if (pathname === "/api/contacts/emergency") return json({ contacts: [] });
        if (pathname === "/api/keeping-in-touch")
          return json({ plan: { situations: [], checkIns: "", people: [], notes: "", updatedAt: null }, resolved: {} });
        return json({});
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BookPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Start with the questions" })).toBeTruthy();
    screen.getByRole("button", { name: /Start the questions/ }).click();
    expect(await screen.findByText(/Step 1 of 6: People and pets/)).toBeTruthy();
    expect(screen.getByText("Kit")).toBeTruthy();
  });
});

describe("Home's line about the book", () => {
  it("says what the book last made is older than, and nothing when it is not", () => {
    const show = (stale: string[]) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
      client.setQueryData(["household-book", "answers"], {
        answers: DEFAULT_BOOK_ANSWERS,
        answersAt: 1,
        made: { madeAt: Date.UTC(2026, 10, 17, 12), pages: 30, sections: [], summary: {} },
        fingerprints: {},
        stale,
      });
      return render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <BookHomeLine />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    };
    const { container, unmount } = show(["answers", "places", "medical"]);
    expect(container.textContent).toContain(
      "The household book made on 17 Nov 2026 is older than its answers, saved places and medical sheets: make it again",
    );
    expect(screen.getByRole("link", { name: "make it again" }).getAttribute("href")).toBe("/prepare/book");
    unmount();
    expect(show([]).container.textContent).toBe("");
  });
});
