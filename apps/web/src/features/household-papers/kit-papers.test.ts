/** The household's papers laid out with the print kit. Everyone here is made up. */
import type { MedicalSheet } from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { grabPerson } from "./household-data";
import { comms, household, MADE, record, resolvedComms, TODAY } from "./kit-fixtures.test-data";
import { commsDocument, grabCardsDocument, grabOverflow, medicalSheetDocument } from "./kit-papers";

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

const sheet = (over: Partial<MedicalSheet> = {}): MedicalSheet => ({
  id: "s1",
  memberId: "m1",
  name: "Sam Okafor",
  encrypted: false,
  record: record(),
  armor: null,
  createdAt: 1,
  updatedAt: MADE.getTime(),
  ...over,
});

describe("the medical sheet with the print kit", () => {
  const make = (name = "Sam Okafor") => medicalSheetDocument({ name, record: record(), contacts: {}, today: TODAY, made: MADE });

  it("puts the allergies in a warning, the medicines with what is left, who to tell, and the caveat", () => {
    const words = contentText(make().content);
    for (const expected of [
      "Medical sheet",
      "Sam Okafor",
      "Blood group",
      "O+",
      "Allergies",
      "Penicillin",
      "Hives and swelling of the face",
      "Levothyroxine",
      "about 8 days left",
      "Fell Surgery",
      "Next of kin (Mother)",
      "+44 7700 900123",
      "Wears glasses",
      "gives no medical advice",
    ])
      expect(words).toContain(expected);
  });

  it("names a linked contact as it is now, and one deleted as gone", () => {
    const linked = record({
      gp: { contactId: "gp", name: "Old surgery", phone: "" },
      nextOfKin: [{ id: "k", contactId: "gone", name: "Ana", phone: "", relation: "" }],
    });
    const words = contentText(
      medicalSheetDocument({
        name: "Sam",
        record: linked,
        contacts: { gp: { displayName: "Fell Surgery", phones: [{ value: "01632 960 000", label: "" }], callsign: "" }, gone: null },
        today: TODAY,
        made: MADE,
      }).content,
    );
    expect(words).toContain("01632 960 000");
    expect(words).toContain("No longer in Contacts");
  });

  it("prints on one page, a name in Greek as words a reader finds, and the same file each time", async () => {
    const first = await renderPdf(make("Ελένη Παπαδοπούλου"));
    const again = await renderPdf(make("Ελένη Παπαδοπούλου"));
    expect(Buffer.from(first.bytes).equals(Buffer.from(again.bytes))).toBe(true);
    const { text, pages } = await pdfText(first.bytes);
    expect(pages).toBe(1);
    expect(text).toContain("Ελένη Παπαδοπούλου");
    expect(text).toContain("Penicillin");
    writeSample("medical-sheet-after", (await renderPdf(make())).bytes);
  });
});

describe("keeping in touch with the print kit", () => {
  const make = () =>
    commsDocument({ plan: comms, resolved: resolvedComms, people: comms.people, entries: RADIO_FREQUENCIES, checkIn: true, made: MADE });

  it("gives each person a page, the steps in PACE order, and says what has gone", () => {
    const words = contentText(make().content);
    expect(words).toContain("For Sam");
    expect(words).toContain("Wait at the school office");
    expect(words).toContain("Every day at 12:00");
    const order = ["Primary", "Alternate", "Contingency", "Emergency"].map((level) => words.indexOf(`${level}  `));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(words).toContain("Phone call: Ana Silva, +44 7700 900123");
    expect(words).toContain("the saved place is no longer on the map");
    expect(words).toContain("A contact no longer in Contacts");
    expect(words).toContain("send a check-in".replace("send", "Send"));
  });

  it("prints a page a person, with a name in Greek as words a reader finds", async () => {
    const printed = await renderPdf(make());
    writeSample("comms-after", printed.bytes);
    const { text, pages } = await pdfText(printed.bytes);
    expect(pages).toBe(2);
    expect(text).toContain("For Ελένη Παπαδοπούλου");
    expect(text).toContain("What you try first.");
    expect(text).toContain("446.03125 MHz");
  });

  it("prints one page for everyone when no one is listed", async () => {
    const doc = commsDocument({ plan: comms, resolved: resolvedComms, people: [], entries: RADIO_FREQUENCIES, checkIn: false, made: MADE });
    expect(contentText(doc.content)).toContain("For everyone");
    expect((await renderPdf(doc)).pages).toBe(1);
  });
});

describe("grab cards with the print kit", () => {
  const people = [
    grabPerson({ memberId: "m1", name: "Sam Okafor", sheet: sheet() }, new Map(), {}),
    grabPerson({ memberId: "m2", name: "王小明", sheet: null }, new Map(), {}),
    grabPerson({ memberId: "m3", name: "Zoë Łukasiewicz", sheet: sheet({ encrypted: true, record: null, armor: "A" }) }, new Map(), {}),
  ];
  const formats = ["decimal", "osgb", "maidenhead"] as const;

  it("puts the medical lines, who to call, where to meet and home on a card, and says a locked sheet is not on it", () => {
    const words = contentText(grabCardsDocument(people, household, { size: "wallet", formats, made: MADE, paper: "a4" }).content);
    for (const expected of [
      "In an emergency",
      "999",
      "Penicillin (Hives and swelling of the face)",
      "Salbutamol",
      "Ana Silva (Mother)",
      "Number 12",
      "54.30000, -2.20000",
      "Locator IO84VH52",
      "Medical sheet kept encrypted: not on this card.",
    ])
      expect(words).toContain(expected);
    expect(grabOverflow(people, household, { size: "wallet", formats, made: MADE })).toEqual([]);
  });

  it("says which card holds too much", () => {
    const long = { ...people[0]!, needs: ["Takes many medicines and has a long history to tell. ".repeat(20)] };
    expect(grabOverflow([long], household, { size: "wallet", formats, made: MADE })).toEqual(["Sam Okafor"]);
  });

  it("lays wallet cards four to a sheet and A6 cards two to a sheet laid across, names in any script found", async () => {
    for (const paper of ["a4", "letter"] as const) {
      const wallet = await renderPdf(grabCardsDocument([...people, people[0]!], household, { size: "wallet", formats, made: MADE, paper }));
      expect(wallet.pages).toBe(1);
      const a6 = await renderPdf(grabCardsDocument(people, household, { size: "a6", formats, made: MADE, paper }));
      if (paper === "a4") writeSample("grab-cards-a6-after", a6.bytes);
      expect(a6.pages).toBe(2);
      const loading = getDocument({ data: a6.bytes.slice() });
      const pdf = await loading.promise;
      const page = await pdf.getPage(1);
      const [, , width, height] = page.view;
      expect(width).toBeGreaterThan(height!);
      await loading.destroy();
      if (paper === "a4") {
        writeSample("grab-cards-wallet-after", wallet.bytes);
        const { text } = await pdfText(wallet.bytes);
        expect(text).toContain("王小明");
        expect(text).toContain("Zoë Łukasiewicz");
      }
    }
  });
});
