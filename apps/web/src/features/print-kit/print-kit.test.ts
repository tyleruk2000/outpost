/**
 * The print kit: each component says what it was given, a drawing's labels are in it,
 * and a document made from them is a PDF whose words a reader can find, on A4 and US
 * Letter, with a running header on a section's later pages only and the page count known.
 *
 * Set OUTPOST_PRINT_SAMPLES to a folder to have the sample written there, to look at.
 */
import fs from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Content } from "pdfmake/interfaces";
import { describe, expect, it } from "vitest";
import {
  blocksToContent,
  boiling,
  bottleFilter,
  callout,
  checklist,
  chestCompressions,
  contents,
  contentText,
  cover,
  cutCard,
  dataTable,
  fallbackFor,
  figure,
  fontRuns,
  heading,
  licenceStatus,
  measureOf,
  NoteList,
  para,
  printCovers,
  printDocument,
  rainCatch,
  recoveryPosition,
  renderPdf,
  rich,
  sectionHeader,
  stepMark,
  steps,
  twoColumns,
  withFallbacks,
} from ".";

async function pdfWords(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const text = await (await pdf.getPage(number)).getTextContent();
    pages.push(
      text.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  return pages;
}

function sample(paper: "a4" | "letter") {
  const measure = measureOf(paper);
  const half = (measure - 16) / 2;
  const long = Array.from({ length: 70 }, (_, index) => para(`Line ${index + 1} of a section long enough to run on to a second page.`));
  return printDocument({
    paper,
    title: "Sample",
    made: new Date(Date.UTC(2026, 10, 22)),
    footerName: "Sample book",
    footerRight: "22 November 2026",
    parts: [
      {
        kind: "cover",
        content: cover({
          kicker: "Household book",
          title: "The Rowans",
          subtitle: "Made on 22 November 2026",
          call: { label: "In an emergency, call", number: "999" },
          facts: [["Home", "Elm Cottage"]],
          measure,
        }),
      },
      {
        kind: "plain",
        content: [heading("Contents"), contents([{ number: 1, label: "Water", id: "s-water", about: "How much, and making it safe" }])],
      },
      {
        kind: "section",
        running: "1 · Water",
        content: [
          sectionHeader({ number: 1, title: "Water", subtitle: "How much to keep, and making it safe", id: "s-water" }, measure),
          callout("act", "Kill the germs", para("**Boil it.** A rolling boil for 1 minute.")),
          twoColumns(
            [
              steps(["**Let it settle.** Then pour off the clear top.", "Strain it through a cloth."], { mark: "letter" }),
              steps(["Boil it.", "Or use tablets."]),
            ],
            [
              figure(bottleFilter().svg, { title: "A layered filter", caption: "Clears water; does not make it safe.", width: half * 0.8 }),
              callout("know", "Rain", para("Usually clean.")),
            ],
          ),
          callout("warn", "Not for fuel or chemicals", para("Nothing here makes them safe.")),
          figure(rainCatch().svg, { title: "Catching rain", width: 250 }),
          figure(boiling().svg, { title: "Boiling", width: 300 }),
          figure(recoveryPosition().svg, { title: "The recovery position", width: 360 }),
          figure(chestCompressions().svg, { title: "Chest compressions", width: 424 }),
          dataTable(
            ["Who", "Litres a day"],
            [
              ["Ana", "3"],
              ["Kit", "3"],
            ],
            { right: [1] },
          ),
          checklist([
            { heading: "Water", rows: [{ what: "Drinking water", amount: "28 litres" }] },
            { heading: "Light", rows: [{ what: "Torch", amount: "2" }] },
          ]),
          ...long,
        ],
      },
    ],
  });
}

describe("the print kit's parts", () => {
  it("reads **bold** runs in words", () => {
    expect(rich("plain")).toBe("plain");
    // Marks the typeface lacks are written with ones it has.
    expect(rich("51°30′36″N")).toBe("51°30'36\"N");
    expect(rich("**Boil it.** Then cool it.")).toEqual({ text: [{ text: "Boil it.", bold: true }, " Then cool it."] });
  });

  it("numbers and letters steps", () => {
    expect([0, 1, 2].map((index) => stepMark(index, "number"))).toEqual(["1", "2", "3"]);
    expect([0, 1, 2].map((index) => stepMark(index, "letter"))).toEqual(["a", "b", "c"]);
    expect(contentText(steps(["Settle it", "Strain it"], { mark: "letter" }))).toBe("a Settle it b Strain it");
  });

  it("gives a section header its number, title and subtitle, and a callout its heading and words", () => {
    expect(contentText(sectionHeader({ number: 7, title: "Water", subtitle: "Making it safe" }, 500))).toBe("7 Water Making it safe");
    expect(contentText(callout("warn", "Careful", para("Hot water scalds.")))).toContain("Careful Hot water scalds.");
  });

  it("puts a group heading over its lines and a box for each in a checklist", () => {
    const list = checklist([
      { heading: "Water", rows: [{ what: "Bottled water", amount: "28 litres" }] },
      { heading: "Empty", rows: [] },
    ]);
    const words = contentText(list);
    expect(words).toBe("What How much Got it To get Water Bottled water 28 litres");
  });

  it("labels each drawing with the words of its source", () => {
    expect(contentText({ svg: recoveryPosition().svg })).toContain("Top arm: hand on bicep of bottom arm");
    expect(contentText({ svg: recoveryPosition().svg })).toContain("Mouth: pointed downward");
    expect(contentText({ svg: chestCompressions().svg })).toContain("lower third of the breastbone");
    expect(contentText({ svg: bottleFilter().svg })).toContain("charcoal");
    expect(contentText({ svg: rainCatch().svg })).toContain("tarp or sheet");
    expect(contentText({ svg: boiling().svg })).toContain("Rolling boil");
  });

  it("brings the old blocks across, a drawing as SVG with its words under it", () => {
    const content = blocksToContent(
      [
        { kind: "title", text: "Old title" },
        { kind: "table", head: ["A", "B"], rows: [["1", "2"]] },
        {
          kind: "drawing",
          height: 20,
          draw: (x, y) => [{ kind: "text", x, y: y + 10, text: "Drawn", size: 8, color: [0, 0, 0] }],
          words: "A drawing.",
        },
      ],
      400,
    );
    expect(contentText(content as Content)).toBe("Old title A B 1 2 Drawn A drawing.");
  });
});

describe("a printed document", () => {
  for (const paper of ["a4", "letter"] as const) {
    it(`is a PDF whose words can be found, on ${paper}`, async () => {
      const made = await renderPdf(sample(paper));
      expect(new TextDecoder().decode(made.bytes.slice(0, 5))).toBe("%PDF-");
      const pages = await pdfWords(made.bytes);
      expect(made.pages).toBe(pages.length);
      expect(pages.length).toBeGreaterThanOrEqual(4);
      expect(pages[0]).toContain("The Rowans");
      expect(pages[0]).not.toContain("Sample book");
      // The contents finds the section's page.
      expect(pages[1]).toMatch(/Water How much, and making it safe 3/);
      expect(pages[2]).toContain("Boil it.");
      expect(pages.join(" ")).toContain("Got it");
      // The running header is on the section's later pages, not its first.
      expect(pages[2]).not.toContain("1 · Water");
      expect(pages.at(-1)).toContain("1 · Water");
      expect(pages.at(-1)).toContain("Sample book");
      if (process.env.OUTPOST_PRINT_SAMPLES)
        fs.writeFileSync(path.join(process.env.OUTPOST_PRINT_SAMPLES, `print-kit-${paper}.pdf`), made.bytes);
    });
  }
});

describe("licence statuses and numbered notes", () => {
  it("gives the same words one number, and a status its words and the notes it cites", () => {
    const notes = new NoteList();
    expect(notes.cite("Listening: no licence needed.")).toBe(1);
    expect(notes.cite("Transmitting: needs an amateur licence.")).toBe(2);
    expect(notes.cite("Listening: no licence needed.")).toBe(1);
    expect(notes.cite("  ")).toBe(0);
    expect(contentText(notes.content())).toBe("Listening: no licence needed. Transmitting: needs an amateur licence.");
    expect(contentText(licenceStatus("listen", [1, 1, 2]))).toBe("Listen only 1,2");
    expect(contentText(licenceStatus("free"))).toBe("No licence");
  });

  it("makes a card at its size, with the panels' words", () => {
    expect(contentText(cutCard([["Front"], ["Back"]], { width: 242, height: 153 }))).toBe("Front Back");
  });
});

describe("names in other scripts", () => {
  it("cuts words into runs for the fonts that have their letters", () => {
    expect(fontRuns("Ana")).toEqual([{ text: "Ana", font: undefined }]);
    expect(fontRuns("Ελένη Παπαδοπούλου, mum")).toEqual([
      { text: "Ελένη Παπαδοπούλου, ", font: "NotoSans" },
      { text: "mum", font: undefined },
    ]);
    expect(fontRuns("王小明").map((run) => run.font)).toEqual(["NotoSansSC"]);
    expect(fontRuns("김민수").map((run) => run.font)).toEqual(["NotoSansKR"]);
    expect(printCovers("Ł".codePointAt(0)!)).toBe(true);
    expect(fallbackFor("Ж".codePointAt(0)!)).toBe("NotoSans");
  });

  it("prints them in a fallback font, as words a reader can find", async () => {
    const doc = printDocument({
      paper: "a4",
      title: "Names",
      made: new Date(Date.UTC(2026, 10, 22)),
      footerName: "Names",
      footerRight: "",
      parts: [
        {
          kind: "plain",
          content: [
            dataTable(
              ["Name", "Phone"],
              [
                ["Ελένη Παπαδοπούλου", "+30 21 0123 4567"],
                ["Иван Петров", "+7 495 000 0000"],
                ["王小明", "+44 7700 900123"],
                ["김민수", "+82 2 000 0000"],
              ],
            ),
            para("Bożena Wiśniewska and Ĉiu"),
          ],
        },
      ],
    });
    expect(withFallbacks(doc).fonts).toEqual(new Set(["NotoSans", "NotoSansSC", "NotoSansKR"]));
    const made = await renderPdf(doc);
    const words = (await pdfWords(made.bytes)).join(" ");
    for (const name of ["Ελένη Παπαδοπούλου", "Иван Петров", "王小明", "김민수", "Bożena Wiśniewska"]) expect(words).toContain(name);
    const file = new TextDecoder("latin1").decode(made.bytes);
    expect(file).toMatch(/\/FontName \/[A-Z]{6}\+NotoSans-Regular/);
    expect(file).toMatch(/\/FontName \/[A-Z]{6}\+NotoSansSC/);
    if (process.env.OUTPOST_PRINT_SAMPLES) fs.writeFileSync(path.join(process.env.OUTPOST_PRINT_SAMPLES, "names.pdf"), made.bytes);
  }, 60_000);

  it("sets a drawing's words in a fallback font too, run by run", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40"><text x="100" y="20" font-family="Atkinson" font-size="9" text-anchor="middle">London to Москва &amp; 北京</text></svg>`;
    const doc = printDocument({
      paper: "a4",
      title: "Drawn names",
      made: new Date(Date.UTC(2026, 10, 22)),
      footerName: "Names",
      footerRight: "",
      parts: [{ kind: "plain", content: [figure(svg, { width: 200 })] }],
    });
    const fallen = withFallbacks(doc);
    expect(fallen.fonts).toEqual(new Set(["NotoSans", "NotoSansSC"]));
    expect(JSON.stringify(fallen.doc.content)).toContain('<tspan font-family=\\"NotoSans\\">Москва');
    const words = (await pdfWords((await renderPdf(doc)).bytes)).join(" ");
    for (const name of ["London", "Москва", "北京"]) expect(words).toContain(name);
  }, 60_000);
});
