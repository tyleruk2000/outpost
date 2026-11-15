import type { MarkdownBlock, MarkdownInline } from "@outpost/shared";
import { render as renderBare, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { MarkdownDocument, missingRefs, plainText, refTarget, sectionsOf } from "./document-markdown";

/** Links inside Outpost are router links, so the document is drawn inside a router, as it is in the app. */
const render = (ui: ReactElement, at = "/library/documents/01HERE") => renderBare(<MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter>);

const words = (v: string) => [{ t: "text" as const, v }];
const heading = (depth: number, v: string): MarkdownBlock => ({ t: "heading", depth, c: words(v) });
const paragraph = (v: string): MarkdownBlock => ({ t: "paragraph", c: words(v) });

describe("sectionsOf", () => {
  it("starts a section at each main heading and leaves out an opening heading that repeats the title", () => {
    const blocks = [
      heading(1, "UK amateur bands"),
      paragraph("Intro."),
      heading(2, "HF"),
      paragraph("a"),
      heading(3, "80 m"),
      heading(2, "VHF"),
    ];
    expect(sectionsOf(blocks, " uk amateur bands ").map((section) => section.length)).toEqual([1, 3, 1]);
    expect(sectionsOf(blocks, "Renamed by its owner").map((section) => section.length)).toEqual([2, 3, 1]);
    expect(sectionsOf([], "Anything")).toEqual([]);
  });
});

describe("plainText", () => {
  it("reads the words through any formatting", () => {
    expect(
      plainText([
        {
          t: "strong",
          c: [
            { t: "text", v: "2 m" },
            { t: "em", c: words(" band") },
          ],
        },
        { t: "break" },
        { t: "code", v: "145.500" },
        { t: "link", href: "https://example.org/", c: words(" calling") },
      ]),
    ).toBe("2 m band 145.500 calling");
  });
});

describe("a Markdown document", () => {
  it("draws bold, italic, code and links as written, and opens links away from Outpost", () => {
    render(
      <MarkdownDocument
        title="Water"
        blocks={[
          heading(1, "Water"),
          {
            t: "paragraph",
            c: [
              { t: "text", v: "Boil " },
              { t: "strong", c: words("hard") },
              { t: "text", v: " for " },
              { t: "em", c: words("one") },
              { t: "text", v: " minute, lid " },
              { t: "code", v: "on" },
              { t: "text", v: ". " },
              { t: "link", href: "https://www.who.int/water", c: words("WHO guidance") },
            ],
          },
          heading(2, "Filters"),
          heading(3, "Ceramic"),
        ]}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Water" })).not.toBeInTheDocument();
    expect(screen.getByText("hard").tagName).toBe("STRONG");
    expect(screen.getByText("one").tagName).toBe("EM");
    expect(screen.getByText("on").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "WHO guidance" });
    expect(link).toHaveAttribute("href", "https://www.who.int/water");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("heading", { name: "Filters", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ceramic", level: 4 })).toBeInTheDocument();
  });

  it("draws lists, ticked and unticked tasks, quotes, code and tables", () => {
    render(
      <MarkdownDocument
        title="Kit"
        blocks={[
          { t: "list", ordered: true, start: 3, items: [{ c: [paragraph("Fill")] }, { c: [paragraph("Light")] }] },
          {
            t: "list",
            ordered: false,
            items: [
              { checked: true, c: [paragraph("Jet")] },
              { checked: false, c: [paragraph("Pump"), { t: "list", ordered: false, items: [{ c: [paragraph("Seal")] }] }] },
            ],
          },
          { t: "quote", c: [paragraph("Keep it dry.")] },
          { t: "code", v: "echo <b>hi</b>" },
          { t: "rule" },
          {
            t: "table",
            rows: [
              [words("Band"), words("Use")],
              [[{ t: "strong", c: words("2 m") }], [{ t: "link", href: "https://example.org/2m", c: words("Calling") }]],
            ],
          },
        ]}
      />,
    );
    const [ordered, tasks, nested] = screen.getAllByRole("list");
    expect(ordered?.tagName).toBe("OL");
    expect(ordered).toHaveAttribute("start", "3");
    expect(tasks).toHaveAttribute("data-type", "taskList");
    expect(nested).not.toHaveAttribute("data-type");
    expect(screen.getByRole("checkbox", { name: "Done" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Not done" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Done" })).toBeDisabled();
    expect(screen.getByText("Keep it dry.").closest("blockquote")).not.toBeNull();
    // Whatever a file says is shown as characters, never built into the page.
    expect(screen.getByText("echo <b>hi</b>").tagName).toBe("CODE");
    const table = screen.getByRole("region", { name: "Table: Band, Use" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Band", "Use"]);
    expect(within(table).getByText("2 m").tagName).toBe("STRONG");
    expect(within(table).getByRole("link", { name: "Calling" })).toHaveAttribute("href", "https://example.org/2m");
  });

  it("says so when the file is empty", () => {
    render(<MarkdownDocument title="Empty" blocks={[]} />);
    expect(screen.getByText("This document has no text.")).toBeInTheDocument();
  });
});

describe("links that stay inside Outpost", () => {
  const ref = (extra: Partial<Extract<MarkdownInline, { t: "ref" }>>, label: string): MarkdownInline => ({
    t: "ref",
    entryId: "logbook73.handbook",
    entryName: "Radio Engineering Handbook",
    c: words(label),
    ...extra,
  });

  it("open the chapter, or the book, in this tab", () => {
    render(
      <MarkdownDocument
        title="Menus"
        blocks={[
          {
            t: "paragraph",
            c: [
              ref({ collectionId: "01BOOK", documentId: "01CHAPTER", anchor: "the-3-db-rule" }, "Decibels"),
              { t: "text", v: " and " },
              ref({ collectionId: "01BOOK", documentId: "01OTHER" }, "RF power"),
              { t: "text", v: " in " },
              ref({ collectionId: "01BOOK" }, "the handbook"),
            ],
          },
        ]}
      />,
    );
    const chapter = screen.getByRole("link", { name: "Decibels" });
    expect(chapter).toHaveAttribute("href", "/library/documents/01CHAPTER#h-the-3-db-rule");
    expect(chapter).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "RF power" })).toHaveAttribute("href", "/library/documents/01OTHER");
    expect(screen.getByRole("link", { name: "the handbook" })).toHaveAttribute("href", "/library/collections/01BOOK");
    // Nothing is missing, so nothing is said about missing books.
    expect(screen.queryByText(/dotted underline/)).not.toBeInTheDocument();
  });

  it("keep their words and point quietly at Explore when the book is not in the library", () => {
    render(
      <MarkdownDocument
        title="Menus"
        blocks={[
          { t: "paragraph", c: [{ t: "text", v: "Theory is in " }, ref({}, "Decibels"), { t: "text", v: " and " }, ref({}, "RF power")] },
          {
            t: "list",
            ordered: false,
            items: [{ c: [{ t: "paragraph", c: [ref({ entryId: "logbook73.guide.g90", entryName: "Xiegu G90" }, "G90")] }] }],
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /^Decibels/ });
    expect(link).toHaveAttribute("href", "/explore?entry=logbook73.handbook");
    expect(link).toHaveAttribute("data-ref", "missing");
    expect(link).toHaveAttribute("title", "In “Radio Engineering Handbook”, which is not in your library. Find it in Explore.");
    expect(link).not.toHaveAttribute("target");
    // Said once at the top, however many such links there are, with the way to get each book.
    const note = screen.getByText(/dotted underline/);
    expect(within(note).getByRole("link", { name: "Radio Engineering Handbook" })).toHaveAttribute(
      "href",
      "/explore?entry=logbook73.handbook",
    );
    expect(within(note).getByRole("link", { name: "Xiegu G90" })).toHaveAttribute("href", "/explore?entry=logbook73.guide.g90");
    expect(note).toHaveTextContent("which are not in your library");
  });

  it("build an address only from ids, whatever arrives in their place", () => {
    const hostile = [
      "../../api/system",
      "01CHAPTER/../../settings",
      "01CHAPTER?download=1",
      "01CHAPTER#x",
      "//evil.example",
      "https://evil.example/x",
      "javascript:alert(1)",
      "01 CHAPTER",
      "",
      "a".repeat(41),
    ];
    for (const id of hostile) {
      expect(refTarget({ entryId: "logbook73.handbook", documentId: id }), id).toBeNull();
      expect(refTarget({ entryId: "logbook73.handbook", collectionId: id }), id).toBeNull();
    }
    for (const entryId of ["../x", "a b", "A.B", "x/y", "x?y=1", "https://evil.example", "", "a".repeat(121), "x%2Fy", "x..y"]) {
      expect(refTarget({ entryId }), entryId).toBeNull();
    }
    // A heading that is not a heading id is dropped; the chapter is still linked.
    expect(refTarget({ entryId: "logbook73.handbook", documentId: "01CHAPTER", anchor: 'x" onclick="alert(1)' })).toEqual({
      to: { pathname: "/library/documents/01CHAPTER" },
      inLibrary: true,
    });
    expect(refTarget({ entryId: "logbook73.handbook", documentId: "01CHAPTER", anchor: "a/b" })?.to).toEqual({
      pathname: "/library/documents/01CHAPTER",
    });
    expect(refTarget({ entryId: "logbook73.guide.rt-950-pro" })).toEqual({
      to: { pathname: "/explore", search: "?entry=logbook73.guide.rt-950-pro" },
      inLibrary: false,
    });

    render(
      <MarkdownDocument
        title="Hostile"
        blocks={[
          {
            t: "paragraph",
            c: [
              ref({ documentId: "../../api/system" }, "first words"),
              ref({ entryId: "javascript:alert(1)" }, "second words"),
              { t: "jump", to: 'x"><img src=x>', c: words("third words") },
            ],
          },
        ]}
      />,
    );
    expect(screen.queryAllByRole("link")).toEqual([]);
    for (const text of ["first words", "second words", "third words"]) expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(missingRefs([{ t: "paragraph", c: [ref({ entryId: "javascript:alert(1)" }, "x")] }])).toEqual([]);
  });

  it("jump to a heading of the same document, whose id cannot name anything else in the page", () => {
    render(
      <MarkdownDocument
        title="Antennas"
        blocks={[
          { t: "paragraph", c: [{ t: "jump", to: "height-matters", c: words("Height") }] },
          { t: "heading", depth: 2, id: "height-matters", c: words("Height matters") },
          { t: "heading", depth: 2, id: "root", c: words("Root") },
          { t: "heading", depth: 2, id: "bad id", c: words("No id") },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Height" })).toHaveAttribute("href", "/library/documents/01HERE#h-height-matters");
    expect(screen.getByRole("heading", { name: "Height matters" })).toHaveAttribute("id", "h-height-matters");
    // A heading called "Root" does not become the element the app itself is mounted in.
    expect(screen.getByRole("heading", { name: "Root" })).toHaveAttribute("id", "h-root");
    expect(screen.getByRole("heading", { name: "No id" })).not.toHaveAttribute("id");
  });
});

describe("a picture in a Markdown document", () => {
  it("is not drawn: its description and caption stand in for it", () => {
    const { container } = render(
      <MarkdownDocument
        title="Antennas"
        blocks={[{ t: "paragraph", c: [{ t: "image", alt: "Six antennas compared.", caption: "There is no best antenna." }] }]}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/Picture, not shown here/)).toBeInTheDocument();
    expect(screen.getByText(/Six antennas compared\./)).toBeInTheDocument();
    expect(screen.getByText(/There is no best antenna\./)).toBeInTheDocument();
    expect(plainText([{ t: "image", alt: "Six antennas compared." }])).toBe("Six antennas compared.");
  });
});
