import type { MarkdownBlock } from "@outpost/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownDocument, plainText, sectionsOf } from "./document-markdown";

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
