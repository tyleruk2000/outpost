# Printed pages: the print kit

The household book is laid out with the print kit, `apps/web/src/features/print-kit/`:
pdfmake (MIT) in its browser build, Atkinson Hyperlegible Next (OFL) in four styles, and a
small set of components. pdfmake and the fonts load only when a PDF is made. The other
papers still use the hand-written writer in `features/maps/print/pdf.ts`; this page is
for moving them.

## Making a document

```ts
import { callout, para, printDocument, renderPdf, sectionHeader, measureOf } from "@/features/print-kit";

const measure = measureOf(paper);
const doc = printDocument({
  paper, title, made, footerName: "Our papers", footerRight: "Made 22 November 2026",
  parts: [
    { kind: "cover", content: cover({ ... , measure }) },
    { kind: "section", running: "1 · Water", content: [sectionHeader({ number: 1, title: "Water", subtitle, id: "s-water" }, measure), ...] },
  ],
});
const { bytes, pages } = await renderPdf(doc);
madePdf(bytes, title, kind, from); // then PdfActions, as before
```

Keep the maker pure (data in, document out) and call `renderPdf` from the screen. Test
the words with `contentText(doc.content)`; render once with pdfjs-dist to check the PDF's
text can be found.

## Tokens (`tokens.ts`)

- Colours: `ink`, `muted`, `rule`, `shade`, `accent` (Outpost's teal), and a strong and a
  soft colour for each callout: `act` (red), `know` (blue), `warn` (amber, with `warnInk`
  for words on it). Each prints as a distinct grey; never let colour alone carry meaning.
- Type: body 9.5 pt, tables 8.5, small 7.5, headings 12, section titles 19, section
  numbers 30. Margins 48 pt at the sides, 54 top and bottom; `measureOf(paper)` is the
  text width for A4 or US Letter.

## Components (`components.ts`)

| Component | Use |
| --- | --- |
| `sectionHeader` | Large number in the accent, bold title, grey subtitle, rule under it. Give it an `id` for the contents. |
| `callout(kind, title, body)` | `act` do this now, `know` know this, `warn` a warning. Kept on one page unless `{ keep: false }`. Symbol and border differ by kind, so greyscale keeps them apart. |
| `steps(items, { mark })` | Numbered or lettered discs (`"number"`, `"letter"`). |
| `checklist(groups)` | What, how much, **Got it** and **To get** boxes, groups headed in the accent. |
| `dataTable(head, rows)` | Shaded head, hairlines. `right` for figures, `bold` for name columns. `**bold**` runs in cells. |
| `twoColumns(left, right)` | Two stacks side by side. |
| `figure(svg, { title, caption, width })` | A drawing with its caption, kept on one page. |
| `card(lines, width)` | A cut-out card with a broken border. |
| `contents(entries)` | Numbers, names and page numbers found by each header's `id`. |
| `cover`, `notesPage`, `para`, `note`, `heading`, `label`, `bullets`, `quote`, `rich` | The rest. |

Footer (book name, page number, date) and the running header on a section's later pages
come from `printDocument`.

## Drawings (`diagrams.ts`)

SVG strings drawn by code, labelled in the book's typeface. A drawing shows what the words
beside it say and no more; a caption says what the words leave open. Text in a drawing is
real text in the PDF. Callout symbols are shapes, not letters, so a search finds only words.

## Moving an old paper across

- `blocksToContent(blocks, measure)` prints a `Block[]` (propagation/plans/document.ts) in
  the kit's look; `sheetItemsToSvg(items, box, pictures)` turns a drawing's `SheetItem`s
  into SVG, with map pictures as data addresses.
- Then replace blocks with components where they read better.
- Glyphs: the typeface covers Latin, Latin-1 and Latin Extended-A, but not Greek, Cyrillic
  or CJK, and not arrows or ⅓. The old writer drew such letters as pictures
  (`maps/print/lettering.ts`); the kit does not yet, so a paper that may hold such names
  (the emergency contacts sheet) needs a fallback font or that approach before it moves.
