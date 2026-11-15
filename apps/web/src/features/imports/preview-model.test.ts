import type { ImportAnalysis, ImportItem, ImportOptions } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  actionLabel,
  buildPreviewTree,
  commitGate,
  describeConstruct,
  describeState,
  describeTotals,
  fileLabel,
  groupByReason,
  initiallyOpen,
  outcomeOf,
  type PreviewNode,
  sourceLabel,
  toCommitBody,
} from "./preview-model";

const item = (path: string, change: Partial<ImportItem> = {}): ImportItem => ({
  path,
  kind: "page",
  title: (path.split("/").pop() ?? path).replace(/\.[a-z]+$/, ""),
  parentPath: null,
  sizeBytes: 10,
  importKey: `path:${path}`,
  warnings: [],
  ...change,
});

function analysisWith(totals: Partial<ImportAnalysis["totals"]>, change: Partial<ImportAnalysis> = {}): ImportAnalysis {
  return {
    source: "markdown",
    items: [],
    totals: {
      pages: 0,
      databases: 0,
      attachments: 0,
      documents: 0,
      skipped: 0,
      ignored: 0,
      bytes: 0,
      importedBefore: 0,
      sameContent: 0,
      ...totals,
    },
    unsupported: [],
    converted: [],
    problems: [],
    warnings: 0,
    ...change,
  };
}

const options = (change: Partial<ImportOptions> = {}): ImportOptions => ({ duplicates: "skip", pdfs: "library", ...change });

/** The tree as nested titles: `["Trip", ["Packing", "Tasks", ["Row"]]]`. */
const shape = (nodes: PreviewNode[]): unknown[] =>
  nodes.flatMap((node) => (node.children.length > 0 ? [node.item.title, shape(node.children)] : [node.item.title]));

describe("building the preview tree from the plan's flat list", () => {
  const items = [
    item("Trip.md"),
    item("Trip/Packing.md", { parentPath: "Trip.md" }),
    item("Trip/Tasks.csv", { parentPath: "Trip.md", kind: "database" }),
    item("Trip/Tasks/Row.md", { parentPath: "Trip/Tasks.csv" }),
    item("Trip/map.png", { parentPath: "Trip.md", kind: "attachment" }),
    item("Trip/Tasks/photo.png", { parentPath: "Trip/Tasks.csv", kind: "attachment" }),
    item("manual.pdf", { kind: "document" }),
    item("old.docx", { kind: "skipped", reason: "Pages cannot hold .docx files." }),
    item("Zebra.md"),
  ];

  it("nests pages under their parents and keeps the plan's order", () => {
    const tree = buildPreviewTree(items);
    expect(shape(tree.roots)).toEqual(["Trip", ["Packing", "Tasks", ["Row"]], "Zebra"]);
    expect(tree.size).toBe(5);
  });

  it("counts what is inside each page, and the pictures attached to it", () => {
    const [trip] = buildPreviewTree(items).roots;
    expect(trip).toMatchObject({ descendants: 3, attachments: 1 });
    expect(trip!.children[1]).toMatchObject({ descendants: 1, attachments: 1 });
    expect(trip!.children[0]).toMatchObject({ descendants: 0, attachments: 0 });
  });

  it("keeps PDFs and left-out files apart from the tree", () => {
    const tree = buildPreviewTree(items);
    expect(tree.documents.map((entry) => entry.path)).toEqual(["manual.pdf"]);
    expect(tree.skipped.map((entry) => entry.path)).toEqual(["old.docx"]);
  });

  it("shows a page whose parent is missing at the top rather than losing it", () => {
    const tree = buildPreviewTree([item("a.md", { parentPath: "gone.md" }), item("self.md", { parentPath: "self.md" })]);
    expect(shape(tree.roots)).toEqual(["a", "self"]);
  });

  it("works when children are listed before their parent", () => {
    const tree = buildPreviewTree([item("Trip/Packing.md", { parentPath: "Trip.md" }), item("Trip.md")]);
    expect(shape(tree.roots)).toEqual(["Trip", ["Packing"]]);
  });

  it("opens a small tree fully and a large one only at the top", () => {
    expect([...initiallyOpen(buildPreviewTree(items))].sort()).toEqual(["Trip.md", "Trip/Tasks.csv"]);

    const many = [
      item("Book.md"),
      item("Book/Part.md", { parentPath: "Book.md" }),
      ...Array.from({ length: 60 }, (_, index) => item(`Book/Part/${index}.md`, { parentPath: "Book/Part.md" })),
    ];
    expect([...initiallyOpen(buildPreviewTree(many))]).toEqual(["Book.md"]);
  });
});

describe("what the choices will do", () => {
  const analysis = analysisWith({ pages: 9, databases: 1, documents: 2, importedBefore: 3, sameContent: 1 });

  it("skip imports only what is new", () => {
    expect(outcomeOf(analysis, options())).toEqual({ create: 6, replace: 0, keep: 4, documents: 2 });
    expect(actionLabel(outcomeOf(analysis, options()))).toBe("Import 6 pages");
  });

  it("copy imports everything again", () => {
    expect(outcomeOf(analysis, options({ duplicates: "copy" }))).toEqual({ create: 10, replace: 0, keep: 0, documents: 2 });
  });

  it("replace overwrites pages from an earlier import and never the ones written by hand", () => {
    const outcome = outcomeOf(analysis, options({ duplicates: "replace", pdfs: "skip" }));
    expect(outcome).toEqual({ create: 6, replace: 3, keep: 1, documents: 0 });
    expect(actionLabel(outcome)).toBe("Import 9 pages");
  });

  it("names the action after what is left to do", () => {
    expect(actionLabel({ create: 1, replace: 0, keep: 0, documents: 0 })).toBe("Import 1 page");
    expect(actionLabel({ create: 0, replace: 0, keep: 4, documents: 2 })).toBe("Add 2 PDFs to the library");
    expect(actionLabel({ create: 0, replace: 0, keep: 4, documents: 0 })).toBe("Nothing to import");
  });
});

describe("the gate in front of the import button", () => {
  const analysis = analysisWith({ pages: 5, importedBefore: 2, sameContent: 1 });

  it("lets skip and copy through without ceremony", () => {
    expect(commitGate(analysis, options())).toEqual({ allowed: true });
    expect(commitGate(analysis, options({ duplicates: "copy" }))).toEqual({ allowed: true });
  });

  it("holds replace back until it is confirmed, and says how many pages are at stake", () => {
    expect(commitGate(analysis, options({ duplicates: "replace" }))).toEqual({
      allowed: false,
      reason: "Tick the box to confirm that 2 existing pages will be overwritten.",
    });
    expect(commitGate(analysis, options({ duplicates: "replace", replaceConfirmed: false })).allowed).toBe(false);
    expect(commitGate(analysis, options({ duplicates: "replace", replaceConfirmed: true }))).toEqual({ allowed: true });
  });

  it("does not let a confirmation given for replace travel with another choice", () => {
    expect(toCommitBody(options({ duplicates: "skip", replaceConfirmed: true }))).toEqual({
      parentId: null,
      duplicates: "skip",
      pdfs: "library",
      replaceConfirmed: false,
    });
    expect(toCommitBody(options({ duplicates: "replace", replaceConfirmed: true, parentId: "n1" }))).toEqual({
      parentId: "n1",
      duplicates: "replace",
      pdfs: "library",
      replaceConfirmed: true,
    });
  });

  it("stops an import that would bring in nothing", () => {
    const allHere = analysisWith({ pages: 3, importedBefore: 3 });
    expect(commitGate(allHere, options())).toEqual({
      allowed: false,
      reason: "With these choices nothing new would be imported: everything is already here.",
    });
    expect(commitGate(allHere, options({ duplicates: "copy" })).allowed).toBe(true);
    // PDFs alone are worth importing.
    expect(commitGate(analysisWith({ pages: 3, importedBefore: 3, documents: 1 }), options()).allowed).toBe(true);
    expect(commitGate(analysisWith({ pages: 3, importedBefore: 3, documents: 1 }), options({ pdfs: "skip" })).allowed).toBe(false);
  });

  it("stops an upload the server found a problem with, and gives its reason", () => {
    const broken = analysisWith({}, { problems: ["Nothing in this upload can be imported."] });
    expect(commitGate(broken, options())).toEqual({ allowed: false, reason: "Nothing in this upload can be imported." });
  });
});

describe("words", () => {
  it("describes totals in a sentence", () => {
    expect(describeTotals(analysisWith({ pages: 6, databases: 1, attachments: 1, documents: 2 }).totals)).toBe(
      "6 pages, 1 table, 1 picture or file and 2 PDFs",
    );
    expect(describeTotals(analysisWith({ pages: 1 }).totals)).toBe("1 page");
    expect(describeTotals(analysisWith({ pages: 1, attachments: 3 }).totals)).toBe("1 page and 3 pictures and files");
    expect(describeTotals(analysisWith({}).totals)).toBe("Nothing to import");
  });

  it("names the source, and calls an upload of only PDFs what it is", () => {
    expect(sourceLabel("notion", analysisWith({ pages: 2 }).totals)).toBe("A Notion export");
    expect(sourceLabel("mixed", analysisWith({ documents: 2 }).totals)).toBe("PDF documents");
  });

  it("says what becomes of each thing that cannot come across", () => {
    expect(describeConstruct({ kind: "equation", count: 2, example: "a.md" })).toEqual({
      name: "2 equations",
      outcome: "Kept as its LaTeX text. Outpost does not draw maths.",
    });
    expect(describeConstruct({ kind: "external-image", count: 1, example: "a.md" }).name).toBe("1 picture on the web");
    expect(describeConstruct({ kind: "html", count: 3, example: "a.md" }).name).toBe("HTML on 3 pages");
  });

  it("shortens a path to a recognisable file name without Notion's id", () => {
    expect(fileLabel("Trip plan 0a1b2c3d4e5f60718293a4b5c6d7e8f9/Tasks 33333333333333333333333333333333_all.csv")).toBe("Tasks_all.csv");
    expect(fileLabel("Trip plan 0a1b2c3d4e5f60718293a4b5c6d7e8f9.md")).toBe("Trip plan.md");
    expect(fileLabel("handbook/chapters/")).toBe("chapters");
    expect(fileLabel("notes.txt")).toBe("notes.txt");
  });

  it("names states, keeping amber for work that is running", () => {
    expect(describeState("analysing", false)).toEqual({ label: "Reading the files", tone: "lamp" });
    expect(describeState("completed", false).tone).toBe("success");
    expect(describeState("completed", true)).toEqual({ label: "Imported, with some left out", tone: "warning" });
    expect(describeState("failed", true).label).toBe("Partly imported");
    expect(describeState("failed", false).tone).toBe("danger");
  });

  it("gathers entries that share a reason", () => {
    const groups = groupByReason([
      { title: "a", reason: "Already here." },
      { title: "b", reason: "Too large." },
      { title: "c", reason: "Already here." },
    ]);
    expect(groups.map((group) => [group.reason, group.entries.map((entry) => entry.title)])).toEqual([
      ["Already here.", ["a", "c"]],
      ["Too large.", ["b"]],
    ]);
  });
});
