/**
 * The household's papers: what a medical sheet says and counts down, a grab card's
 * lines, a communication plan's steps, the binder's contents page, and the medical
 * screen's honesty about who can read the sheets.
 */
import {
  type CommsPlan,
  type CommsResolved,
  emptyMedicalRecord,
  type MedicalRecord,
  type MedicalSheet,
  medicineLeft,
  staleParts,
} from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Sheet } from "@/features/maps/print/sheet";
import { type BinderSources, binderPages, partHolds } from "./binder";
import { partsWords } from "./binder-line";
import { commsBlocks, frequencyText, stepText } from "./comms-words";
import { type GrabHousehold, grabCard, grabSheets, gridLines } from "./grab-cards";
import { grabPerson } from "./household-data";
import MedicalPage from "./medical-page";
import { medicalBlocks, medicineLeftWords, recordOf } from "./medical-words";

afterEach(() => {
  vi.unstubAllGlobals();
});

const record = (over: Partial<MedicalRecord> = {}): MedicalRecord => ({
  ...emptyMedicalRecord(),
  bloodGroup: "O+",
  allergies: [{ id: "a", what: "Penicillin", reaction: "Hives" }],
  conditions: [{ id: "c", what: "Asthma", note: "" }],
  medicines: [
    {
      id: "m",
      name: "Salbutamol",
      dose: "Two puffs",
      when: "When needed",
      keptWhere: "Coat pocket",
      held: null,
      unit: "",
      perDay: null,
      countedOn: null,
    },
    {
      id: "n",
      name: "Levothyroxine",
      dose: "50 mcg",
      when: "Morning",
      keptWhere: "",
      held: 28,
      unit: "tablets",
      perDay: 1,
      countedOn: "2026-11-01",
    },
  ],
  nextOfKin: [{ id: "k", contactId: null, name: "Ana Silva", phone: "+44 7700 900123", relation: "Mother" }],
  ...over,
});

const sheet = (over: Partial<MedicalSheet> = {}): MedicalSheet => ({
  id: "s1",
  memberId: "m1",
  name: "Sam",
  encrypted: false,
  record: record(),
  armor: null,
  createdAt: 1,
  updatedAt: Date.UTC(2026, 10, 20),
  ...over,
});

const texts = (pages: Sheet[]) =>
  pages.flatMap((page) => page.items.flatMap((item) => (item.kind === "text" && !item.hidden ? [item.text] : [])));

describe("medicines counted down", () => {
  it("takes a day's use off for each day since the count, and says when it runs out", () => {
    const line = record().medicines[1]!;
    expect(medicineLeft(line, "2026-11-21")).toEqual({ left: 8, days: 8, runsOut: "2026-11-29" });
    expect(medicineLeftWords(line, "2026-11-21")).toBe("about 8 days left, runs out about 29 Nov 2026");
    expect(medicineLeftWords(line, "2026-12-30")).toBe("none left by the count");
  });

  it("does not count down a medicine taken only when needed, or not counted", () => {
    expect(medicineLeft(record().medicines[0]!, "2026-11-21")).toBeNull();
  });
});

describe("a medical sheet on paper", () => {
  it("gives the blood group, allergies, medicines, who to tell, and the caveat", () => {
    const blocks = medicalBlocks("Sam", record(), {}, "2026-11-21");
    const words = JSON.stringify(blocks);
    expect(words).toContain("Blood group: O+");
    expect(words).toContain("Penicillin: Hives");
    expect(words).toContain("about 8 days left");
    expect(words).toContain("Next of kin: Ana Silva (Mother), +44 7700 900123");
    expect(words).toContain("gives no medical advice");
  });

  it("names a linked contact as it is now, and one deleted as missing", () => {
    const linked = record({
      gp: { contactId: "gp", name: "Old surgery", phone: "" },
      nextOfKin: [{ id: "k", contactId: "gone", name: "Ana", phone: "", relation: "" }],
    });
    const words = JSON.stringify(
      medicalBlocks(
        "Sam",
        linked,
        { gp: { displayName: "Fell Surgery", phones: [{ value: "01632 960 000", label: "" }], callsign: "" }, gone: null },
        "2026-11-21",
      ),
    );
    expect(words).toContain("Doctor: Fell Surgery, 01632 960 000");
    expect(words).toContain("Ana, no longer in Contacts");
  });

  it("reads an encrypted sheet only when it was opened here from the very message stored", () => {
    const locked = sheet({ encrypted: true, record: null, armor: "A" });
    const lock = { kind: "passphrase" as const, passphrase: "x" };
    expect(recordOf(locked, new Map())).toBeNull();
    expect(recordOf(locked, new Map([["s1", { armor: "B", record: record(), lock }]]))).toBeNull();
    expect(recordOf(locked, new Map([["s1", { armor: "A", record: record(), lock }]]))?.bloodGroup).toBe("O+");
  });
});

const household: GrabHousehold = {
  emergencyNumber: "999",
  contacts: [{ label: "Grandma (out of area)", phone: "+44 1632 960 111" }],
  places: ["If the home cannot be used: Number 12's porch"],
  comms: ["Phones down: Phone call, then Mesh radio message"],
  home: { name: "Home", lat: 54.3, lon: -2.2 },
};

describe("grab cards", () => {
  it("writes home in each grid format asked for, leaving out a grid that does not reach it", () => {
    // 54.3 N, 2.2 W: field IO, square 84, subsquare VH (2.2 W is 21 five-minute steps into the square, 54.3 N is 7 steps up).
    expect(gridLines(54.3, -2.2, ["decimal", "osgb", "maidenhead"])).toEqual([
      "54.30000, -2.20000",
      "OS grid SD 87081 89394",
      "Locator IO84VH52",
    ]);
    const paris = gridLines(48.85, 2.35, ["osgb", "maidenhead"]);
    expect(paris).toHaveLength(1);
    expect(paris[0]).toMatch(/^Locator JN18/);
  });

  it("puts the person's medical lines, who to call, where to meet and home on the card, and it fits", () => {
    const person = grabPerson({ memberId: "m1", name: "Sam", sheet: sheet() }, new Map(), {});
    const card = grabCard(person, household, { size: "wallet", formats: ["decimal"], made: new Date(2026, 10, 20) });
    expect(card.overflow).toBe(false);
    const words = card.items.flatMap((item) => (item.kind === "text" ? [item.text] : [])).join(" ");
    for (const expected of [
      "Sam",
      "Blood group: O+",
      "Penicillin (Hives)",
      "Asthma",
      "Salbutamol",
      "Ana Silva (Mother)",
      "Number 12",
      "54.30000, -2.20000",
    ])
      expect(words).toContain(expected);
  });

  it("says a locked sheet is not on the card instead of leaving the card silently empty", () => {
    const person = grabPerson({ memberId: "m1", name: "Sam", sheet: sheet({ encrypted: true, record: null, armor: "A" }) }, new Map(), {});
    expect(person.sheetLocked).toBe(true);
    const { pages } = grabSheets([person], household, { size: "a6", formats: ["decimal"], made: new Date(2026, 10, 20), paper: "a4" });
    expect(texts(pages).join(" ")).toContain("Medical sheet kept encrypted: not on this card.");
  });

  it("lays A6 cards two to a sheet turned sideways, and wallet cards four to a sheet", () => {
    const people = Array.from({ length: 4 }, (_, index) => grabPerson({ memberId: null, name: `P${index}`, sheet: null }, new Map(), {}));
    for (const paper of ["a4", "letter"] as const) {
      const a6 = grabSheets(people, household, { size: "a6", formats: [], made: new Date(), paper }).pages;
      expect(a6).toHaveLength(2);
      expect(a6[0]!.width).toBeGreaterThan(a6[0]!.height);
      expect(grabSheets(people, household, { size: "wallet", formats: [], made: new Date(), paper }).pages).toHaveLength(1);
    }
  });
});

const comms: CommsPlan = {
  checkIns: "Every day at 12:00",
  people: [{ id: "p", memberId: "m1", name: "Sam", note: "Wait at the school office" }],
  notes: "",
  updatedAt: 1,
  situations: [
    {
      id: "s",
      name: "Phones down",
      checkIn: "On the hour",
      contactIds: ["k1", "gone"],
      steps: [
        {
          id: "3",
          level: "contingency",
          means: "radio",
          contactId: null,
          frequency: { entryId: "lf-pmr446-analogue", channel: "3" },
          repeaterId: null,
          meshChannel: null,
          markerId: null,
          when: "on the hour",
          text: "",
        },
        {
          id: "1",
          level: "primary",
          means: "phone",
          contactId: "k1",
          frequency: null,
          repeaterId: null,
          meshChannel: null,
          markerId: null,
          when: "",
          text: "",
        },
        {
          id: "4",
          level: "emergency",
          means: "meet",
          contactId: null,
          frequency: null,
          repeaterId: null,
          meshChannel: null,
          markerId: "gone-place",
          when: "noon",
          text: "",
        },
      ],
    },
  ],
};
const resolvedComms: CommsResolved = {
  contacts: { k1: { displayName: "Ana Silva", phones: [{ value: "+44 7700 900123", label: "" }], callsign: "" }, gone: null },
  places: { "gone-place": null },
  repeaters: {},
  mesh: {},
};

describe("keeping in touch", () => {
  it("names a channel from the list of frequencies, with its number and frequency", () => {
    expect(frequencyText({ entryId: "lf-pmr446-analogue", channel: "3" }, RADIO_FREQUENCIES)).toMatch(
      /^PMR446.*channel 3, 446\.03125 MHz$/,
    );
    expect(frequencyText({ entryId: "not-in-the-list", channel: "1" }, RADIO_FREQUENCIES)).toBeNull();
  });

  it("puts each person's page in PACE order, with their own note first, and says what has gone", () => {
    const blocks = commsBlocks(comms, resolvedComms, comms.people[0]!, RADIO_FREQUENCIES, { checkIn: false });
    expect(blocks[0]).toEqual({ kind: "title", text: "Keeping in touch: Sam" });
    expect(blocks[1]).toEqual({ kind: "para", text: "Wait at the school office" });
    const table = blocks.find((block) => block.kind === "table");
    expect(table && table.kind === "table" ? table.rows.map((row) => row[0]) : []).toEqual(["Primary", "Contingency", "Emergency"]);
    expect(JSON.stringify(blocks)).toContain("Phone call: Ana Silva, +44 7700 900123");
    expect(JSON.stringify(blocks)).toContain("the saved place is no longer on the map");
    expect(JSON.stringify(blocks)).toContain("A contact no longer in Contacts");
  });

  it("says a step's missing link rather than dropping it", () => {
    const step = { ...comms.situations[0]!.steps[1]!, contactId: "gone" };
    expect(stepText(step, resolvedComms, RADIO_FREQUENCIES).missing).toBe("the contact is no longer in Contacts");
  });
});

describe("the household binder", () => {
  const sources: BinderSources = {
    plans: [],
    emergencyContacts: [],
    comms: { plan: comms, resolved: resolvedComms },
    people: [{ memberId: "m1", name: "Sam", sheet: sheet() }],
    opened: new Map(),
    contacts: {},
    grabPeople: [grabPerson({ memberId: "m1", name: "Sam", sheet: sheet() }, new Map(), {})],
    household,
    entries: RADIO_FREQUENCIES,
    markers: [],
    supplies: null,
    outlook: null,
  };

  it("leaves out a part with nothing in it, and numbers the contents from the page after it", () => {
    expect(partHolds("plans", sources)).toBeNull();
    const { pages, parts } = binderPages(["plans", "comms", "medical", "frequencies"], sources, {
      paper: "a4",
      made: new Date(2026, 10, 20),
      today: "2026-11-21",
      style: "24",
    });
    expect(parts).toEqual(["comms", "medical", "frequencies"]);
    const contents = texts([pages[0]!]);
    expect(contents).toContain("Household binder");
    expect(contents).toContain("Keeping in touch");
    expect(contents).toContain("page 2");
    expect(contents).not.toContain("Emergency plans");
    expect(texts(pages).join(" ")).toContain("Medical sheet: Sam");
  });

  it("is older than its contents when a part in it changed after it was made", () => {
    const changed = { plans: 5, contacts: null, comms: 20, "grab-cards": 5, medical: 5, frequencies: 20, places: null, supplies: 50 };
    expect(staleParts({ parts: ["plans", "comms"], contentAt: 10, madeAt: 11, pages: 4 }, changed)).toEqual(["comms"]);
    expect(staleParts(null, changed)).toEqual([]);
    expect(partsWords(["comms", "medical", "plans"])).toBe("keeping in touch, medical sheets and emergency plans");
  });
});

describe("the medical sheets screen", () => {
  it("says who can read the sheets, lists the household, and says the switches are off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const { pathname } = new URL(String(input), "http://outpost.test");
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        if (pathname === "/api/medical-sheets") return json({ sheets: [sheet()], inSearch: false, inTools: false });
        if (pathname === "/api/supplies")
          return json({
            items: [],
            locations: [],
            household: {
              daysWanted: 3,
              drinkingLitres: 2,
              allUsesLitres: 15,
              waterBasis: "drinking",
              updatedAt: 1,
              members: [
                {
                  id: "m1",
                  kind: "person",
                  name: "Sam",
                  band: null,
                  sex: null,
                  kcalPerDay: null,
                  drinkingLitres: null,
                  allUsesLitres: null,
                  note: "",
                },
                {
                  id: "m2",
                  kind: "person",
                  name: "Alex",
                  band: null,
                  sex: null,
                  kcalPerDay: null,
                  drinkingLitres: null,
                  allUsesLitres: null,
                  note: "",
                },
              ],
            },
          });
        return json({});
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MedicalPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Anyone who can reach it on your network can open a sheet that is not encrypted/)).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Sam" })).toBeTruthy();
    expect(screen.getByText("Alex")).toBeTruthy();
    // The switch is named by its title alone, with the long explanation as its description.
    const inSearch = screen.getByRole("switch", { name: "Find them in search" });
    expect(inSearch.getAttribute("aria-checked")).toBe("false");
    expect(inSearch).toHaveAccessibleDescription(/Medicines, allergies and conditions of sheets/);
    // Each row's button says whose it is.
    expect(screen.getByRole("link", { name: "Open Sam’s sheet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make a sheet for Alex" })).toBeTruthy();
    expect(screen.getByText(/Off: neither Chat nor other programs over MCP can read them/)).toBeTruthy();
  });
});
