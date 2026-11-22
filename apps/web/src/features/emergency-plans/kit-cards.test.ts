/** The plan's cards laid out with the print kit. Everyone here is made up. */
import { type EmergencyPlan, PLAN_TEMPLATES, type PlanResolved, planFromTemplate } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { kitCanSetAll } from "@/features/contacts/kit-letters";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { CARD_HEIGHT, CARD_WIDTH } from "./cards";
import { fridgeDocument, grabDocument, planTexts, walletDocument } from "./kit-cards";
import { readableOf } from "./printable";

const MADE = new Date(2026, 10, 16, 14, 5);

function plan(people = 2): EmergencyPlan {
  const template = PLAN_TEMPLATES.find((each) => each.id === "power-cut")!;
  let n = 0;
  const input = planFromTemplate(template, () => `s${++n}`, "999");
  const names = ["Maya Okafor", "Sam Okafor", "Zoë Łukasiewicz", "Ana Silva", "Wei Chen"];
  return {
    ...input,
    id: "p1",
    use: { startedAt: null, ticks: {} },
    reviewedAt: MADE.getTime(),
    openedAt: null,
    createdAt: MADE.getTime(),
    updatedAt: MADE.getTime(),
    body: {
      ...input.body,
      people: names.slice(0, people).map((name, index) => ({
        id: `p${index}`,
        name,
        remember: "",
        medical: index === 0 ? "Penicillin allergy" : "",
        contactId: null,
      })),
      contacts: [
        { id: "c1", contactId: "k1", name: "Ana Silva", phone: "", note: "Has a key", outOfArea: false },
        { id: "c2", contactId: null, name: "Uncle Wei", phone: "+44 7700 900123", note: "", outOfArea: true },
        { id: "c3", contactId: "gone", name: "Old neighbour", phone: "", note: "", outOfArea: false },
      ],
      places: [
        { id: "m1", role: "near", markerId: "hall", name: "Village hall", note: "Side door" },
        { id: "m2", role: "away", markerId: "lost", name: "Church", note: "" },
      ],
    },
  };
}
const resolved: PlanResolved = {
  contacts: { k1: { displayName: "Ana Silva", phones: [{ value: "+44 (0)1632 960 188", label: "home" }], callsign: "" }, gone: null },
  places: { hall: { name: "Village hall", lat: 54.3, lon: -2.2 }, lost: null },
  commPlan: undefined,
  powerPlan: undefined,
  links: [],
};

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

describe("the cards with the print kit", () => {
  const read = readableOf(plan(), resolved);

  it("can set this plan's words in the kit's typeface, and not a name in Greek", () => {
    expect(kitCanSetAll(planTexts(read))).toBe(true);
    const greek = { ...read, people: [{ ...read.people[0]!, name: "Ελένη Παπαδοπούλου" }] };
    expect(kitCanSetAll(planTexts(greek))).toBe(false);
  });

  it("draws each wallet card at the size of a bank card, with the numbers whole and medical words only on the person's own", () => {
    const { doc, cards } = walletDocument(read, read.people, { made: MADE, paper: "a4" });
    expect(cards.map((card) => card.overflow)).toEqual([false, false]);
    // The strip's edge: 85.6 mm wide, two halves of 53.98 mm.
    for (const card of cards)
      expect(card.svg).toContain(`width="${Math.round(CARD_WIDTH * 100) / 100}" height="${Math.round(2 * CARD_HEIGHT * 100) / 100}"`);
    // The sheet's drawing is placed at its own size: one point of it is one point of paper.
    const placed: Array<{ svg: string; width: number }> = [];
    JSON.stringify(doc.content, (_key, value) => {
      if (value && typeof value === "object" && "absolutePosition" in value) placed.push(value);
      return value;
    });
    expect(placed).toHaveLength(1);
    expect(placed[0]!.width).toBeCloseTo(595.28, 2);
    expect(placed[0]!.svg).toMatch(/^<svg [^>]*width="595.28"/);
    const words = contentText(doc.content);
    expect(words).toContain("+44 (0)1632 960 188");
    expect(words).toContain("+44 7700 900123");
    expect(words).toContain("Out-of-area contact");
    expect(words).toContain("Village hall");
    expect(words).not.toContain("Church");
    expect(cards[0]!.svg).toContain("Penicillin allergy");
    expect(cards[1]!.svg).not.toContain("Penicillin allergy");
  });

  it("says when a card has too much on it", () => {
    const long = { ...read.people[0]!, medical: "Takes many medicines. ".repeat(80) };
    expect(walletDocument(read, [long], { made: MADE, paper: "letter" }).cards[0]!.overflow).toBe(true);
  });

  it("puts the fridge sheet on one page with the steps for during and after, the numbers and the places", () => {
    const words = contentText(fridgeDocument(read, { made: MADE, paper: "a4" }).content);
    expect(words).toContain("During");
    expect(words).toContain("After");
    expect(words).toContain("+44 7700 900123");
    expect(words).toContain("No longer in Contacts");
    expect(words).toContain("Church (no longer on the map)");
    expect(words).toContain("In a real emergency, follow the emergency services and official warnings.");
    expect(words.match(/Contains public sector information licensed under the Open Government Licence v3\.0\./g)).toHaveLength(1);
    expect(words).toContain("The British Red Cross has advice on a power cut");
  });

  it("lists what to take on the grab list, with the amount for the household", () => {
    const words = contentText(grabDocument(read, { made: MADE, paper: "a4" }).content);
    expect(words).toContain("Bottled water");
    expect(words).toContain("18 litre");
    expect(words).toContain("Open Government Licence v3.0");
  });

  it("makes PDFs whose words a reader finds, the fridge sheet on one page, and the same file each time", async () => {
    const four = readableOf(plan(5), resolved);
    for (const paper of ["a4", "letter"] as const) {
      const fridge = await renderPdf(fridgeDocument(read, { made: MADE, paper }));
      writeSample(`cards-fridge-${paper}-after`, fridge.bytes);
      const fridgeText = await pdfText(fridge.bytes);
      expect(fridgeText.pages).toBe(1);
      expect(fridgeText.text).toContain("+44 (0)1632 960 188");
      expect(fridgeText.text).toContain("In an emergency, call");
      const wallet = await renderPdf(walletDocument(four, four.people, { made: MADE, paper }).doc);
      writeSample(`cards-wallet-${paper}-after`, wallet.bytes);
      const walletText = await pdfText(wallet.bytes);
      expect(walletText.pages).toBe(2);
      expect(walletText.text).toContain("Zoë Łukasiewicz");
      expect(walletText.text).toContain("+44 7700 900123");
      const grab = await renderPdf(grabDocument(read, { made: MADE, paper }));
      writeSample(`cards-grab-${paper}-after`, grab.bytes);
      expect((await pdfText(grab.bytes)).text).toContain("Bottled water");
      if (paper === "a4") {
        const again = await renderPdf(fridgeDocument(read, { made: MADE, paper }));
        expect(again.bytes).toEqual(fridge.bytes);
      }
    }
  }, 30_000);
});
