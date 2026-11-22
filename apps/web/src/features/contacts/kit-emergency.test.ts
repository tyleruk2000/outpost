/** The emergency sheet laid out with the print kit. Every person here is made up. */
import { type ContactDto, emptyContactFields } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { emergencyDocument } from "./kit-emergency";

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
  emails: [{ value: "maya.okafor@fellside-surgery.example", label: "work" }],
  addresses: [
    { label: "home", street: "The Old Forge\n4 Kästner Lane", locality: "Ambleside", region: "Cumbria", postcode: "LA22 9ZZ", country: "" },
  ],
  place: { id: "p1", name: "Fellside Surgery", lat: 54.43218, lon: -2.96311 },
});
const zoe = contact({ id: "c3", displayName: "Zoë Łukasiewicz", phones: [{ value: "+48 22 123 45 67", label: "" }] });
const council = contact({
  id: "c4",
  kind: "organisation",
  displayName: "Parish council",
  department: "Flood wardens",
  phones: [{ value: "01632 960000", label: "duty warden" }],
});
const eleni = contact({ id: "c2", displayName: "Ελένη Παπαδοπούλου", phones: [{ value: "+30 21 0123 4567", label: "κινητό" }] });

const MADE = new Date(2026, 10, 16, 14, 5);

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const loading = getDocument({ data: bytes.slice() });
  const pdf = await loading.promise;
  const out: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1)
    out.push(...((await (await pdf.getPage(number)).getTextContent()).items as Array<{ str: string }>).map((item) => item.str));
  const pages = pdf.numPages;
  await loading.destroy();
  return { text: out.join(" ").replace(/\s+/g, " "), pages };
}

describe("the emergency sheet with the print kit", () => {
  it("prints names in Greek, Cyrillic and Chinese as words a reader finds", async () => {
    const sasha = contact({ id: "c5", displayName: "Саша Иванова", phones: [{ value: "+7 495 123 45 67", label: "" }] });
    const wang = contact({ id: "c6", displayName: "王小明", department: "北京", phones: [{ value: "+86 10 1234 5678", label: "" }] });
    const made = await renderPdf(emergencyDocument([maya, eleni, sasha, wang], { made: MADE, style: "24", paper: "a4" }));
    writeSample("contacts-emergency-names-after", made.bytes);
    const read = (await pdfText(made.bytes)).text;
    for (const word of ["Ελένη Παπαδοπούλου", "κινητό", "Саша Иванова", "王小明", "+30 21 0123 4567", "Dr. Maya Okafor"])
      expect(read.replace(/\s/g, "")).toContain(word.replace(/\s/g, ""));
  }, 30_000);

  it("has every entry's rows in order, each value exactly as kept", () => {
    const words = contentText(emergencyDocument([maya, zoe, council], { made: MADE, style: "24", paper: "a4" }).content);
    expect(words).toContain("In an emergency");
    expect(words).toContain("3 contacts, as kept in Outpost on 16 November 2026 at 14:05.");
    const order = ["Dr. Maya Okafor", "GP, Fellside Surgery", "+44 7700 900123", "01632 960188", "M0ZOE", "145.500 MHz", "433.500 MHz"];
    const at = order.map((word) => words.indexOf(word));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(words).toContain("The Old Forge, 4 Kästner Lane, Ambleside, Cumbria LA22 9ZZ");
    expect(words).toContain("54.43218, -2.96311");
    expect(words.indexOf("Zoë Łukasiewicz")).toBeGreaterThan(words.indexOf("Dr. Maya Okafor"));
    expect(words).toContain("Flood wardens");
  });

  it("makes a PDF whose words a reader finds, each entry whole, the same file each time", async () => {
    for (const paper of ["a4", "letter"] as const) {
      const made = await renderPdf(emergencyDocument([maya, zoe, council], { made: MADE, style: "24", paper }));
      writeSample(`contacts-emergency-${paper}-after`, made.bytes);
      const read = await pdfText(made.bytes);
      expect(read.pages).toBe(1);
      for (const word of ["Dr. Maya Okafor", "+44 7700 900123", "01632 960188", "Zoë Łukasiewicz", "+48 22 123 45 67", "M0ZOE"])
        expect(read.text).toContain(word);
      const again = await renderPdf(emergencyDocument([maya, zoe, council], { made: MADE, style: "24", paper }));
      expect(again.bytes).toEqual(made.bytes);
    }
    const many = Array.from({ length: 12 }, (_, index) => ({ ...maya, id: `m${index}`, displayName: `Person ${index + 1}` }));
    const long = await renderPdf(emergencyDocument(many, { made: MADE, style: "24", paper: "a4" }));
    writeSample("contacts-emergency-many-after", long.bytes);
    expect((await pdfText(long.bytes)).pages).toBeGreaterThan(1);
  }, 30_000);
});
