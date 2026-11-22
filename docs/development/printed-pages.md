# Printed pages: the print kit

The household book is laid out with the print kit, `apps/web/src/features/print-kit/`:
pdfmake (MIT) in its browser build, Atkinson Hyperlegible Next (OFL) in four styles, and a
small set of components. pdfmake and the fonts load only when a PDF is made. So is every
other paper Outpost makes, except the printed map page, which keeps the hand-written
writer in `features/maps/print/pdf.ts` to place its picture at exact scale.

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
| `licenceStatus(kind, notes)`, `licenceKey()` | "No licence", "Listen only", "Licence needed", each with its own mark (ring, half ring, square), and the numbers of the notes behind it. |
| `NoteList` | Numbered notes at the end of a section: `cite(words)` gives the number, the same words one number; `content()` prints them. Keep legal and source detail here, not in table cells. |
| `cutCard(panels, { width, height })` | A card at its real size with corner marks to cut along; two panels are a folded wallet card. |
| `bookCover(input)` | A cover: a band of the accent with `contourArt` in it, the name large, the number to call, facts and a small map. Give its `background` to the cover part. |
| `cover`, `notesPage`, `para`, `note`, `heading`, `label`, `bullets`, `quote`, `rich` | The rest. |

Footer (book name, page number, date) and the running header on a section's later pages
come from `printDocument`. A part may have a `background` (drawn from the page's corner),
`orientation: "landscape"` and `margins` of its own.

## Drawings (`diagrams.ts`)

SVG strings drawn by code, labelled in the book's typeface. A drawing shows what the words
beside it say and no more; a caption says what the words leave open. Text in a drawing is
real text in the PDF. Callout symbols are shapes, not letters, so a search finds only words.

## Moving an old paper across

- `blocksToContent(blocks, measure)` prints a `Block[]` (propagation/plans/document.ts) in
  the kit's look; `sheetItemsToSvg(items, box, pictures)` turns a drawing's `SheetItem`s
  into SVG, with map pictures as data addresses.
- Then replace blocks with components where they read better.
- Glyphs: the typeface covers Latin, Latin-1 and Latin Extended-A. `renderPdf` sets any
  word it cannot in Noto Sans (`fallback.ts`): Latin, Greek and Cyrillic in full, Arabic,
  Hebrew, Devanagari, Thai, Chinese (GB 2312 level 1 and kana) and Korean (KS X 1001
  syllables), each font loaded only when a document uses it. Text inside SVG drawings is
  not split, so keep names out of drawings. Arabic and Hebrew are not reordered right to
  left. `printable()` writes ′ ″ arrows and ⅓ with marks the typeface has.

## Charts, drawing helpers and making a PDF on a screen

- `chart(input)` (`chart.ts`) draws lines, bands between two lines and bars over a numeric
  x axis, with shaded spans (night, say), rules across at a value, and a key. It uses
  d3-scale and d3-shape (ISC) and returns a `Drawing` for `figure`. A null is a gap, never
  joined across. Give every series its own dash as well as its colour.
- `drawing`, `svgText`, `svgLeader`, `svgArrowHead`, `svgKeyItem` (`draw.ts`) are the
  helpers `diagrams.ts` uses, exported for drawings kept beside their feature. pdfmake draws
  paths, shapes, text, dashes, clip paths and fill opacity; not filters, masks or CSS.
- `useKitPdf(make, { title, kind, from })` (`use-kit-pdf.ts`, not in the index) renders a
  maker's document on a screen and answers `making`, `made` (with `pdf`, `bytes`, `pages`)
  or `failed`; `kitPdfOf(made)` is what `PdfActions` takes. Give `make` with `useCallback`
  or `useMemo` (null makes nothing). The made-PDF guard (`lib/made-pdf-rule.test.ts`) counts
  `renderPdf` and `useKitPdf` as making a PDF.
- `writeSample(name, bytes)` (`samples.ts`, tests only) writes a made PDF to the folder named
  by `OUTPOST_PRINT_SAMPLES`, to look at.
- Radio papers keep their drawings in `features/propagation/print/`: the ionosphere's
  regions, sky wave and skip zone, near-vertical sky wave, a path in section, and day and
  night on the world (`greyLineSketch`, over `public/world/land.json`).
- Names in any script need nothing from a paper: `renderPdf` sets each word the typeface
  lacks in its fallback font, in text and in a drawing's `<text>` alike. In a drawing the
  font changes only at a space (pdfmake's SVG drawing leaves a gap where it changes next to
  a letter), so a name with its brackets is set whole in the fallback.
- A cut-out at exact size (the sundial and nocturnal templates): put each drawn page down
  whole with `{ svg, width: page.width, height: page.height, absolutePosition: { x: 0, y: 0 } }`,
  so one point of the drawing is one point of paper (see `solar-clock/templates-kit.ts`).
  The printed map keeps the old writer, which places its picture at an exact size.
- Guidance sheets (water, cooking, rations, the sight form) use `guidanceDocument`
  (`tools/kit/sheet.ts`) and its paper choice; map pictures go in through
  `sheetItemsToSvg` with data addresses, at the kit's measure (`nuclear/print.ts`).
