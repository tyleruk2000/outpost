/**
 * The owner's rule: anything Outpost can print, or make a PDF of, can also be added to
 * the library. Every screen that does either offers the same three things through the
 * shared buttons (features/library/made/pdf-actions.tsx): Save as PDF, Add to library
 * and Share. This guard reads the source and fails when a file prints or makes a PDF
 * and no screen that uses it offers them.
 *
 * What counts as printing or making a PDF: asking the browser to print (`usePrinting`,
 * `window.print`), and writing pages as a PDF (`writePdfPages`, `writePdf`, `toSheets`,
 * `writeLettered`, and the print kit's `renderPdf` and `useKitPdf`). A screen (a .tsx file) that does so must use the shared actions
 * itself (`useMadePdf`, `<PdfActions>`, `<PdfButtons>`). A module (.ts) that does so must
 * be imported, directly or through other modules, by a screen that uses them.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Files that are the means and not a thing to keep, each for the reason given. Keep
 * this list short: a new entry is a decision that something printed or made as a PDF
 * cannot be added to the library.
 */
const ALLOWED: Record<string, string> = {
  // Defines `usePrinting` and is where `window.print` is called; the screens that use it are checked themselves.
  "lib/printing.ts": "the browser's print, for the screens that use it",
  // The PDF writer itself: `writePdf` is a one-page call of `writePdfPages`.
  "features/maps/print/pdf.ts": "the PDF writer",
  // Draws lines as pictures and hands the pages to the writer; the screens that call it are checked themselves.
  "features/maps/print/lettering.ts": "the writer's lettering",
  // Hands a print-kit PDF to a screen; the screens that call it are checked themselves.
  "features/print-kit/use-kit-pdf.ts": "the print kit's hook; the screens that call it are checked themselves",
};

const MAKES = /(?<!function\s+)\b(usePrinting|writePdfPages|writePdf|toSheets|writeLettered|renderPdf|useKitPdf)\s*\(|\bwindow\.print\s*\(/;
const OFFERS = /\buseMadePdf\s*\(|<PdfActions\b|<PdfButtons\b/;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [file] : [];
  });
}

/** Where an import leads, if it is a file of the web app. */
function resolve(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")])
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return null;
}

/** Comments taken out, so that a mention of `window.print()` in prose is not a call. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function survey() {
  const files = sources(root);
  const text = new Map(files.map((file) => [file, code(fs.readFileSync(file, "utf8"))]));
  const importers = new Map<string, Set<string>>();
  for (const [file, body] of text) {
    for (const match of body.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
      const target = resolve(file, match[1]!);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target)!.add(file);
    }
  }
  const relative = (file: string) => path.relative(root, file).split(path.sep).join("/");
  const makers = files.filter((file) => MAKES.test(text.get(file)!) && !(relative(file) in ALLOWED));

  /** The screens that use a file, found by going up through the modules that import it. */
  const screensOf = (file: string): string[] => {
    const seen = new Set([file]);
    const queue = [file];
    const screens: string[] = [];
    while (queue.length > 0) {
      for (const by of importers.get(queue.shift()!) ?? []) {
        if (seen.has(by)) continue;
        seen.add(by);
        if (by.endsWith(".tsx")) screens.push(by);
        else queue.push(by);
      }
    }
    return screens;
  };
  const offers = (file: string) => OFFERS.test(text.get(file)!);
  const broken = makers.flatMap((file) => {
    if (file.endsWith(".tsx")) return offers(file) ? [] : [`${relative(file)} prints or makes a PDF without the shared library actions`];
    const screens = screensOf(file);
    return screens.some(offers)
      ? []
      : [
          `${relative(file)} makes a PDF or prints, and no screen that uses it offers the shared library actions (used by: ${screens.map(relative).join(", ") || "nothing"})`,
        ];
  });
  return { makers: makers.map(relative), broken };
}

describe("whatever Outpost prints or makes a PDF of", () => {
  const { makers, broken } = survey();

  it("can be added to the library from the screen that makes it", () => {
    expect(broken).toEqual([]);
  });

  it("is found by this guard: the places known to print or make a PDF are among those it checks", () => {
    for (const known of [
      "features/contacts/emergency-sheet.tsx",
      "features/maps/lib/sun-document.ts",
      "features/maps/print/export.ts",
      "features/maps/print/print-dialog.tsx",
      "features/encryption/print-view.tsx",
      "features/propagation/prediction-export.tsx",
      "features/propagation/coverage-map/coverage-picture.ts",
      "features/propagation/plans/plan-export.tsx",
      "features/frequencies/frequencies-page.tsx",
      // The nuclear workspace's scenarios, with or without their maps (print-maps.ts hands its pages to this one, laid out with the print kit).
      "features/nuclear/print.ts",
    ])
      expect(makers).toContain(known);
  });

  it("tells a screen that prints without the actions from one that offers them", () => {
    expect(MAKES.test("const printing = usePrinting();")).toBe(true);
    expect(MAKES.test("window.print();")).toBe(true);
    expect(MAKES.test("export function toSheets(blocks: Block[]) {")).toBe(false);
    expect(OFFERS.test("<PdfActions pdf={made.pdf} />")).toBe(true);
    expect(OFFERS.test("<PdfStatus made={made} />")).toBe(false);
  });
});
