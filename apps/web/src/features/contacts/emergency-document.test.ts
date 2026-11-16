/** The emergency sheet as a PDF. Every person here is made up. */
import { type ContactDto, emptyContactFields } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { textWidth } from "@/features/maps/print/helvetica";
import { cannotDraw, type DrawLine, writeLettered } from "@/features/maps/print/lettering";
import type { Sheet } from "@/features/maps/print/sheet";
import { emergencySheets, emergencyTitle, entriesWithUnwritable, entryOf, wrapLine } from "./emergency-document";

const contact = (over: Partial<ContactDto>): ContactDto => ({
  ...emptyContactFields(),
  id: "c1",
  displayName: "Maya Okafor",
  place: null,
  pages: [],
  otherFields: [],
  source: "manual",
  createdAt: 1_000,
  updatedAt: 2_000,
  isEmergency: true,
  ...over,
});

const maya = contact({
  displayName: "Dr. Maya Okafor",
  kind: "person",
  title: "GP",
  organisation: "Fellside Surgery",
  emergencyNote: "Two doors up. Has a spare key and a generator.",
  phones: [
    { value: "+44 7700 900123", label: "mobile" },
    { value: "01632 960188", label: "out of hours, ask for the duty doctor" },
  ],
  callsign: "M0ZOE",
  channels: [
    { frequency: "145.500 MHz", mode: "FM calling, on the hour" },
    { frequency: "433.500 MHz", mode: "FM" },
  ],
  emails: [
    {
      value: "maya.okafor-featherstonehaugh@a-very-long-domain-name-for-a-surgery-and-cottage-hospital-in-the-lakes.example",
      label: "work",
    },
  ],
  addresses: [
    { label: "home", street: "The Old Forge\n4 Kästner Lane", locality: "Ambleside", region: "Cumbria", postcode: "LA22 9ZZ", country: "" },
  ],
  place: { id: "p1", name: "Fellside Surgery", lat: 54.43218, lon: -2.96311 },
});
const eleni = contact({
  id: "c2",
  displayName: "Ελένη Παπαδοπούλου",
  phones: [{ value: "+30 21 0123 4567", label: "κινητό" }],
  addresses: [{ label: "", street: "Οδός Ερμού 12", locality: "Αθήνα", region: "", postcode: "105 63", country: "Greece" }],
});
const zoe = contact({ id: "c3", displayName: "Zoë Łukasiewicz", phones: [{ value: "+48 22 123 45 67", label: "" }] });
const council = contact({ id: "c4", kind: "organisation", displayName: "Parish council", department: "Flood wardens", phones: [] });

const MADE = new Date(2026, 10, 16, 14, 5);

/** The words a person sees on the pages, in order: hidden words left out. */
const seen = (pages: Sheet[]) =>
  pages.flatMap((page) => page.items.flatMap((item) => (item.kind === "text" && !item.hidden ? [item.text] : [])));

/** A device that draws a line as a picture the width the typeface would give it. */
const draws: DrawLine = async (item) => ({
  picture: { jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), width: 10, height: 4 },
  width: textWidth(item.text, item.size, item.bold) * 1.1,
  height: item.size * 1.5,
  baseline: item.size * 1.1,
});

async function readPdf(bytes: Uint8Array): Promise<string[]> {
  const reading = getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
  });
  const document = await reading.promise;
  const out: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1)
    out.push(...((await (await document.getPage(number)).getTextContent()).items as Array<{ str: string }>).map((item) => item.str));
  await reading.destroy();
  return out;
}

describe("the emergency sheet as pages", () => {
  it("has every entry's rows in the order the sheet on screen has them, each value exactly as kept", () => {
    expect(entryOf(maya)).toEqual({
      name: "Dr. Maya Okafor",
      lines: ["GP, Fellside Surgery", "Two doors up. Has a spare key and a generator."],
      rows: [
        { label: "mobile", value: "+44 7700 900123", number: true },
        { label: "out of hours, ask for the duty doctor", value: "01632 960188", number: true },
        { label: "callsign", value: "M0ZOE", number: true },
        { label: "radio", lead: "145.500 MHz", value: "FM calling, on the hour" },
        { label: "", lead: "433.500 MHz", value: "FM" },
        {
          label: "email",
          value: "maya.okafor-featherstonehaugh@a-very-long-domain-name-for-a-surgery-and-cottage-hospital-in-the-lakes.example",
        },
        { label: "home", value: "The Old Forge, 4 Kästner Lane, Ambleside, Cumbria LA22 9ZZ" },
        { label: "on the map", value: "Fellside Surgery", quiet: "54.43218, -2.96311" },
      ],
    });
    expect(entryOf(council)).toMatchObject({ name: "Parish council", lines: ["Flood wardens"], rows: [] });

    const pages = emergencySheets([maya, eleni, zoe], { made: MADE, style: "24", paper: "a4" });
    const words = seen(pages);
    expect(words[0]).toBe("In an emergency");
    expect(words[1]).toBe("3 contacts, as kept in Outpost on 16 November 2026 at 14:05.");
    const order = ["Dr. Maya Okafor", "GP, Fellside Surgery", "+44 7700 900123", "01632 960188", "M0ZOE", "145.500 MHz", "433.500 MHz"];
    const at = order.map((word) => words.indexOf(word));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // Phone numbers whole, on one line each, never broken.
    for (const number of ["+44 7700 900123", "01632 960188", "+30 21 0123 4567", "+48 22 123 45 67"]) expect(words).toContain(number);
    expect(words.indexOf("Ελένη Παπαδοπούλου")).toBeGreaterThan(words.indexOf("Dr. Maya Okafor"));
    expect(words.indexOf("Zoë Łukasiewicz")).toBeGreaterThan(words.indexOf("Ελένη Παπαδοπούλου"));
    expect(words).toContain("Οδός Ερμού 12, Αθήνα 105 63, Greece");
    expect(words.at(-2)).toBe("Emergency sheet, made 16 November 2026 at 14:05 · Outpost");
    expect(words.at(-1)).toBe("Page 1 of 1");
    // Nothing invented: no "?" put in for a letter, and no word the contacts and the sheet's own sentences do not have.
    expect(words.join(" ")).not.toContain("?");
  });

  it("wraps what is too wide for its column, and keeps every line inside the page", () => {
    const pages = emergencySheets([maya], { made: MADE, style: "12", paper: "letter" });
    const words = seen(pages);
    expect(words).toContain("1 contact, as kept in Outpost on 16 November 2026 at 2:05 pm.");
    // The long email address is broken inside itself, and put back together it is the address.
    const address = "maya.okafor-featherstonehaugh@a-very-long-domain-name-for-a-surgery-and-cottage-hospital-in-the-lakes.example";
    const start = words.findIndex((word) => word.startsWith("maya.okafor"));
    expect(words[start]).not.toBe(address);
    expect(words.slice(start, start + 2).join("")).toBe(address);
    // The long label wraps in its own column.
    expect(words).toContain("out of hours, ask for");
    for (const page of pages) {
      expect(page.width).toBe(612);
      for (const item of page.items) {
        if (item.kind !== "text" || item.anchor === "end") continue;
        expect(item.x + textWidth(item.text, item.size, item.bold), item.text).toBeLessThanOrEqual(page.width - 42 + 0.01);
      }
    }
    expect(wrapLine("one two three", 10, textWidth("one two", 10) + 0.1)).toEqual(["one two", "three"]);
  });

  it("starts an entry on a new page rather than splitting it, and numbers the pages", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...maya, id: `m${index}`, displayName: `Person ${index + 1}` }));
    const pages = emergencySheets(many, { made: MADE, style: "24" });
    expect(pages.length).toBeGreaterThan(1);
    for (const [index, page] of pages.entries()) {
      const words = seen([page]);
      expect(words.at(-1)).toBe(`Page ${index + 1} of ${pages.length}`);
      // Each page's entries are whole: as many names as there are places on the map, which is the last row of each.
      const names = words.filter((word) => /^Person \d+$/.test(word)).length;
      const lasts = words.filter((word) => word === "54.43218, -2.96311").length;
      expect(names).toBe(lasts);
    }
  });

  it("draws names the typeface lacks as pictures, with the names kept in the file for search", async () => {
    expect(entriesWithUnwritable([maya, eleni, zoe, council])).toBe(2);
    const pages = emergencySheets([maya, eleni, zoe], { made: MADE, style: "24" });
    const written = await writeLettered(pages, emergencyTitle([maya, eleni, zoe], MADE), MADE, draws);
    // Eleni's name, label and address, and Zoë's name.
    expect(written.drawn).toBe(4);
    expect(written.marked).toBe(0);
    const file = Array.from(written.bytes, (byte) => String.fromCharCode(byte)).join("");
    expect(file).toContain("/Subtype /Image");
    expect(file).not.toMatch(/\(\?+\)/);
    const read = await readPdf(written.bytes);
    for (const word of [
      "Ελένη Παπαδοπούλου",
      "κινητό",
      "Οδός Ερμού 12, Αθήνα 105 63, Greece",
      "Zoë Łukasiewicz",
      "+30 21 0123 4567",
      "+44 7700 900123",
    ])
      expect(read).toContain(word);
    expect(emergencyTitle([maya, eleni, zoe], MADE)).toBe("Emergency sheet, 3 contacts, made 16 Nov 2026");
  });

  it("where the device will not draw, marks each run it cannot write, says how many entries, and still keeps the names for search", async () => {
    const pages = emergencySheets([maya, eleni, zoe], { made: MADE, style: "24", marked: 2 });
    expect(seen(pages).join(" ")).toContain(
      "2 entries have letters this device could not put on the page; each place they belong is marked [?]. The Contacts screen in Outpost has them in full.",
    );
    const written = await writeLettered(pages, "Sheet", MADE, cannotDraw);
    expect(written.drawn).toBe(0);
    expect(written.marked).toBe(4);
    const read = await readPdf(written.bytes);
    expect(read).toContain("[?] [?]");
    expect(read).toContain("Zoë [?]ukasiewicz");
    expect(read).toContain("Ελένη Παπαδοπούλου");
    expect(read).toContain("+30 21 0123 4567");
  });
});
