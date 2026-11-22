/**
 * The household book: what its pages say from the answers and from what Outpost holds
 * (the number to call, the people and their medicines, help near home with distance and
 * direction, a site upwind of home, a journey with a stop for each night, the water worked
 * out for the days), what it says when something is not held, what changed since the last
 * book, and the screen's first state.
 */

import fs from "node:fs";
import path from "node:path";
import {
  type BookFacts,
  DEFAULT_BOOK_ANSWERS,
  type EmergencyPlan,
  type EmergencyPlanResponse,
  emptyMedicalRecord,
  emptyPlanBody,
  type Household,
  type MedicalSheet,
  planFromTemplate,
  type RepeaterDto,
  type SuppliesResponse,
  templateById,
} from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { type BookInputs, emergencyNumberFor, type MadeBook, makeBook } from "./book";
import { BookHomeLine, BookPlansLine } from "./book-line";
import BookPage from "./book-page";
import { FIRST_AID_PAGES, NHS_CREDIT, RECOVERY_POSITION } from "./first-aid";
import { FM_21_76 } from "./water-words";
import { BookWizard } from "./wizard";

afterEach(() => {
  vi.unstubAllGlobals();
});

const texts = (book: MadeBook) => contentText(book.document.content);

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
  supplies: {
    items: [{ id: "i1", name: "Bottled water", category: "water", quantity: 24, unit: "litres", location: "Cellar", date: "2027-05-01" }],
    locations: [],
    household,
  } as unknown as SuppliesResponse,
  grab: {
    people: [
      { name: "Ana", bloodGroup: "O+", allergies: ["Penicillin"], needs: [], medicines: ["Salbutamol"], contacts: [], sheetLocked: false },
    ],
    household: {
      emergencyNumber: "999",
      contacts: [{ label: "Gran", phone: "01632 960002" }],
      places: ["Village hall"],
      comms: [],
      home: { name: "Home", lat: 51.5, lon: -1 },
    },
  },
  repeaters: [
    {
      callsign: "GB3XX",
      outputHz: 145_725_000,
      inputHz: 145_125_000,
      ctcssHz: 77,
      dcsCode: null,
      place: "Hilltop",
      distanceMeters: 12_000,
      bearingDegrees: 90,
    } as unknown as RepeaterDto,
  ],
  ...over,
});

describe("the book's pages", () => {
  const book = makeBook(inputs());
  const all = texts(book);

  it("has a cover with the number to call, a contents page, and the sections numbered in order", () => {
    expect(all).toContain("Household book The Rowans Made on 21 November 2026");
    expect(all).toMatch(/In an emergency, call .{0,80}999/);
    expect(all).toContain("Contents");
    expect(book.contents.map((entry) => entry.label)).toContain("First aid");
    expect(book.contents.map((entry) => entry.number)).toEqual(book.contents.map((_, index) => index + 1));
    expect(book.contents.at(-2)?.label).toBe("Sources");
    expect(book.contents.at(-1)?.label).toBe("Pages for notes");
    expect(all).toMatch(/1 The first few minutes What to do at once/);
    expect(all).toContain("This is the first book made");
  });

  it("draws what its sources say: the filter, the rain catch, boiling, the recovery position and where to press", () => {
    expect(all).toContain("crushed rock");
    expect(all).toContain(FM_21_76.rain);
    expect(all).toContain("Rolling boil");
    expect(all).toContain("Top arm: hand on bicep of bottom arm");
    expect(all).toContain(`“${RECOVERY_POSITION.parts[2]}”`);
    expect(all).toContain("lower third of the breastbone");
  });

  it("has checklists with a box to tick for what you have and what to get", () => {
    expect(all).toMatch(/What How much Got it To get Water and food Drinking water 28 litres/);
  });

  it("is a PDF a reader can search, on A4 and US Letter", async () => {
    for (const paper of ["a4", "letter"] as const) {
      const made = makeBook(inputs({ answers: { ...inputs().answers, paper } }));
      const printed = await renderPdf(made.document);
      const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
      expect(pdf.numPages).toBe(printed.pages);
      const first = await (await pdf.getPage(1)).getViewport({ scale: 1 });
      expect(Math.round(first.width)).toBe(paper === "a4" ? 595 : 612);
      let words = "";
      for (let number = 1; number <= pdf.numPages; number += 1)
        words += `${(await (await pdf.getPage(number)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`;
      expect(words).toContain("The Rowans: household book");
      expect(words).toContain("Salbutamol");
      expect(words).toContain("Got it");
      if (process.env.OUTPOST_PRINT_SAMPLES)
        fs.writeFileSync(path.join(process.env.OUTPOST_PRINT_SAMPLES, `book-${paper}.pdf`), printed.bytes);
    }
  }, 60_000);

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
    const words = texts(next);
    expect(words).toMatch(/Changed since the book of 1 November 2026/);
    expect(words).toMatch(/Our household: new .*Kit: Hard of hearing.* gone Sam/);
  });

  it("takes the emergency number from the answers, then from home's country", () => {
    expect(emergencyNumberFor({ ...DEFAULT_BOOK_ANSWERS, emergencyNumber: "111" }, "GB", [])).toBe("111");
    expect(emergencyNumberFor(DEFAULT_BOOK_ANSWERS, "FR", [])).toBe("112");
  });

  it("says plainly what it cannot do without a home", () => {
    const homeless = texts(makeBook(inputs({ facts: { ...facts, home: null, journeys: [] } })));
    expect(homeless).toMatch(/No saved place has the home icon/);
  });
});

const flooding = templateById("flooding")!;
function planOf(id: string, over: Partial<EmergencyPlan>): EmergencyPlanResponse {
  let n = 0;
  const input = planFromTemplate(flooding, () => `${id}-${++n}`, "999");
  return {
    plan: {
      ...input,
      id,
      use: { startedAt: null, ticks: {} },
      reviewedAt: 1,
      openedAt: null,
      createdAt: 1,
      updatedAt: 1,
      ...over,
      body: { ...input.body, ...over.body },
    },
    resolved: { contacts: {}, places: {}, commPlan: undefined, powerPlan: undefined, links: [] },
  };
}
const ownFlood = planOf("p1", { name: "Our flood plan" });
const street = planOf("p2", {
  name: "Street party gone wrong",
  templateId: null,
  kind: "other",
  kindText: "Street event",
  body: {
    ...emptyPlanBody(),
    steps: [{ id: "x1", phase: "during", text: "Walk Gran home by the back lane.", origin: null }],
    contacts: [{ id: "c1", contactId: null, name: "Jo next door", phone: "01632 960001", note: "Has a ladder", outOfArea: false }],
    supplies: [{ id: "s1", name: "Head torch", quantity: 2, unit: "", perPerson: false, perDay: false, origin: null, category: null }],
    notes: "Meet by the post box.",
  },
});

describe("the household's emergency plans in the book", () => {
  it("puts every plan in, in full and as written, as their plan, with general advice only for a hazard with no plan", () => {
    const words = texts(
      makeBook(inputs({ plans: [ownFlood, street], answers: { ...inputs().answers, hazards: ["flooding", "power-cut"] } })),
    );
    expect(words).toContain("Your plan Our flood plan");
    expect(words).toContain("Your plan Street party gone wrong");
    expect(words).toContain("Walk Gran home by the back lane.");
    expect(words).toMatch(/Jo next door 01632 960001 \(phone\) Has a ladder/);
    expect(words).toMatch(/Head torch 2/);
    expect(words).toContain("Meet by the post box.");
    expect(words).toMatch(/General advice Power cut General advice; you have no plan for this yet/);
    expect(words).not.toMatch(/General advice Flooding/);
  });

  it("puts in only the plans chosen, and general advice for a hazard whose plan is left out", () => {
    const words = texts(
      makeBook(
        inputs({ plans: [ownFlood, street], answers: { ...inputs().answers, hazards: ["flooding"], planChoice: "some", planIds: ["p2"] } }),
      ),
    );
    expect(words).not.toContain("Our flood plan");
    expect(words).toContain("Street party gone wrong");
    expect(words).toMatch(/General advice Flooding General advice; you have no plan for this yet/);
  });

  it("ticks the hazards that have a plan, says so, and offers to make a plan for one that has none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const { pathname } = new URL(String(input), "http://outpost.test");
        const body =
          pathname === "/api/emergency-plans"
            ? { plans: [{ id: "p1", name: "Our flood plan", templateId: "flooding", kind: "flooding", kindText: "" }] }
            : {};
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BookWizard
            answers={{ ...DEFAULT_BOOK_ANSWERS, hazards: ["power-cut"] }}
            household={household}
            markers={[]}
            country="GB"
            sheets={new Set()}
            saving={false}
            save={async () => {}}
            onDone={() => {}}
            startAt="readiness"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/One hazard is ticked because you have a plan for it/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Flooding/ }) as HTMLElement).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Your plan: Our flood plan")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Make a plan for this/ })).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "All 1" })).toBeTruthy();
  });

  it("offers to put a plan in the book from the plan, when the book takes only some", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") sent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const response = {
      answers: { ...DEFAULT_BOOK_ANSWERS, planChoice: "some", planIds: [] },
      answersAt: 5,
      made: { madeAt: 1, pages: 30, sections: [], summary: {} },
      fingerprints: {},
      stale: ["plans"],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
    client.setQueryData(["household-book", "answers"], response);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BookPlansLine planId="p2" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("This plan is not in the household book.")).toBeTruthy();
    screen.getByRole("button", { name: "Put in the household book" }).click();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ planChoice: "some", planIds: ["p2"], baseAnswersAt: 5 });
  });

  it("says a plan is in the book and the book is older than the plans", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
    client.setQueryData(["household-book", "answers"], {
      answers: DEFAULT_BOOK_ANSWERS,
      answersAt: 5,
      made: { madeAt: Date.UTC(2026, 10, 17, 12), pages: 30, sections: [], summary: {} },
      fingerprints: {},
      stale: ["plans"],
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BookPlansLine />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.textContent).toContain("Every plan goes in the household book, made on 17 Nov 2026, before the plans last changed.");
    expect(screen.getByRole("link", { name: "Make the book again" }).getAttribute("href")).toBe("/prepare/book");
  });
});

describe("what the binder held, now in the book", () => {
  const book = makeBook(
    inputs({
      plans: [street],
      markers: [{ id: "g", name: "Village hall", lat: 54.3, lon: -2.2, icon: "pin" } as never],
      answers: { ...inputs().answers, meetingPoints: [{ id: "m", markerId: "g", role: "near", note: "Side door" }] },
    }),
  );
  const words = texts(book);

  it("has the binder's parts as sections, in one contents", () => {
    const labels = book.contents.map((entry) => entry.label);
    for (const part of ["Fridge sheets", "Keeping in touch", "Home and meeting points", "Radio frequencies", "Supplies", "Grab cards"])
      expect(labels).toContain(part);
    expect(labels.indexOf("Fridge sheets")).toBeLessThan(labels.indexOf("Our household"));
  });

  it("gives each plan a fridge sheet with the number, what to do and who to call", () => {
    expect(words).toMatch(/Fridge sheet · Street event Street party gone wrong In an emergency, call 999/);
    expect(words).toMatch(/What we do 1 Walk Gran home by the back lane\./);
    expect(words).toMatch(/Who to call Jo next door: 01632 960001/);
  });

  it("puts each meeting point in several grid formats", () => {
    expect(words).toMatch(/Village hall 54\.30000, -2\.20000/);
    expect(words).toMatch(/Locator IO84/);
  });

  it("lists frequencies for home's country with whether each needs a licence, and repeaters near home", () => {
    expect(words).toMatch(/Licence-free channels/);
    expect(words).toMatch(/Licence-free radio: no licence needed, within the power and equipment limits/);
    expect(words).toMatch(/Listening: no licence needed\./);
    expect(words).toMatch(/GB3XX 145\.7250 MHz 145\.1250 MHz 77 Hz Hilltop 12 km E/);
    expect(words).toMatch(/GB3XX .* Licence needed/);
    expect(words).toMatch(/Notes .*Listening: no licence needed\. Transmitting: needs an amateur licence\./);
    // Short statuses in the tables, the legal words once each in the notes.
    expect(words).toMatch(/No licence Listen only Licence needed/);
    expect(words.match(/Licence-free radio: no licence needed/g)).toHaveLength(1);
  });

  it("lists the supplies kept, and a grab card for each person", () => {
    expect(words).toMatch(/Bottled water \(Water\) 24 litres Cellar 2027-05-01/);
    expect(words).toMatch(/In an emergency Ana Call 999 Blood group: O\+ Allergies Penicillin/);
    expect(words).toMatch(/Gran: 01632 960002/);
  });

  it.runIf(process.env.OUTPOST_PRINT_SAMPLES)(
    "writes a full sample book to look at, in colour, on A4 and US Letter",
    async () => {
      for (const paper of ["a4", "letter"] as const) {
        const full = makeBook(
          inputs({
            plans: [ownFlood, street],
            markers: [{ id: "g", name: "Village hall", lat: 51.51, lon: -1.01, icon: "pin" } as never],
            answers: {
              ...inputs().answers,
              paper,
              hazards: ["flooding", "power-cut"],
              meetingPoints: [{ id: "m", markerId: "g", role: "near", note: "Side door" }],
            },
            emergencyContacts: [
              {
                id: "k",
                displayName: "Gran Rowan",
                phones: [{ value: "01632 960002", label: "home" }],
                emergencyNote: "Has a key",
                callsign: "",
              } as never,
            ],
          }),
        );
        const printed = await renderPdf(full.document);
        fs.writeFileSync(path.join(process.env.OUTPOST_PRINT_SAMPLES!, `full-${paper}.pdf`), printed.bytes);
      }
      // Only the grab cards, at A6.
      const cards = makeBook(inputs({ answers: { ...inputs().answers, sections: ["grab-cards"], grabCardSize: "a6" } }));
      fs.writeFileSync(path.join(process.env.OUTPOST_PRINT_SAMPLES!, "cards-a6.pdf"), (await renderPdf(cards.document)).bytes);
    },
    60_000,
  );

  it("marks the communication plan's own channels first", () => {
    const comms = {
      plan: {
        situations: [
          {
            id: "s",
            name: "Phones down",
            checkIn: "",
            contactIds: [],
            steps: [
              {
                id: "x",
                level: "primary",
                means: "radio",
                contactId: null,
                frequency: { entryId: "lf-pmr446-analogue", channel: "3" },
                repeaterId: null,
                meshChannel: null,
                markerId: null,
                when: "on the hour",
                text: "",
              },
            ],
          },
        ],
        checkIns: "",
        people: [],
        notes: "",
        updatedAt: 1,
      },
      resolved: { contacts: {}, places: {}, repeaters: {}, mesh: {} },
    } as unknown as BookInputs["comms"];
    const withPlan = texts(makeBook(inputs({ comms })));
    expect(withPlan).toMatch(/Our communication plan's channels Name Frequency Licence Our plan: PMR446/);
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

describe("leaving the questions with answers not saved", () => {
  it("asks on reload or close until the answers are saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } })),
    );
    const asked = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BookWizard
            answers={{ ...DEFAULT_BOOK_ANSWERS, hazards: [] }}
            household={household}
            markers={[]}
            country="GB"
            sheets={new Set()}
            saving={false}
            save={async () => {}}
            onDone={() => {}}
            startAt="readiness"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(asked()).toBe(false);
    // The parts of a step are headed under the step's own heading.
    expect(await screen.findByRole("heading", { level: 3, name: "Which hazards matter" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Flooding/ }));
    expect(asked()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save and stop here" }));
    await vi.waitFor(() => expect(asked()).toBe(false));
  });
});
