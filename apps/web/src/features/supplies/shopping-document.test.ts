import type { ShoppingLine, SupplyItem } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { shoppingDocument, shoppingGroups, shoppingTitle } from "./shopping-document";

const lines: ShoppingLine[] = [
  { id: "l1", source: "worked", itemId: "i1", name: "Baked beans", quantity: 5, unit: "tin", reasons: ["energy"], note: "" },
  { id: "l2", source: "worked", itemId: null, name: "Water", quantity: null, unit: "", reasons: ["water"], note: "About 21 litres more" },
  { id: "l3", source: "worked", itemId: "i3", name: "AA batteries", quantity: 2, unit: "pack", reasons: ["minimum"], note: "" },
  { id: "l4", source: "worked", itemId: "i4", name: "Milk powder", quantity: 1, unit: "bag", reasons: ["expired"], note: "" },
  { id: "l5", source: "own", itemId: null, name: "Matches", quantity: 2, unit: "", reasons: ["own"], note: "" },
];
const items = [
  { id: "i1", category: "food" },
  { id: "i3", category: "batteries" },
  { id: "i4", category: "food" },
] as unknown as SupplyItem[];

const workedOutAt = Date.UTC(2026, 10, 16, 12);
const input = { lines, items, workedOutAt, now: Date.UTC(2026, 10, 22), paper: "a4" as const };

describe("shopping list PDF", () => {
  it("groups the lines by what they top up, the person's own last", () => {
    const groups = shoppingGroups(lines, items);
    expect(groups.map((group) => group.heading)).toEqual(["Food", "Water", "Batteries", "Added by you"]);
    expect(groups[0]?.rows).toEqual([
      { what: "**Baked beans**: for the days wanted", amount: "5 tins" },
      { what: "**Milk powder**: to replace what is past its use-by", amount: "1 bag" },
    ]);
    expect(groups[1]?.rows[0]?.amount).toBe("about 21 litres more");
    expect(groups[3]?.rows[0]).toEqual({ what: "**Matches**", amount: "2" });
  });

  it("is a checklist with boxes to tick, and its words can be found in the PDF", async () => {
    const doc = shoppingDocument(input);
    const words = contentText(doc.content);
    expect(words).toContain("Shopping list");
    expect(words).toContain("Got it");
    expect(words).toContain("To get");
    expect(words).toContain("Baked beans: for the days wanted");
    expect(doc.info?.title).toBe(shoppingTitle(workedOutAt, input.now));

    const printed = await renderPdf(doc);
    writeSample("shopping-after", printed.bytes);
    const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
    expect(pdf.numPages).toBe(printed.pages);
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ");
    expect(text).toContain("Milk powder");
    expect(text).toContain("Added by you");
    // The same list made twice is the same file.
    const again = await renderPdf(shoppingDocument(input));
    expect(again.bytes).toEqual(printed.bytes);
  }, 60_000);
});
