import type { MarkdownBlock } from "@outpost/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import { MarkdownDocument, pictureAddress } from "./document-markdown";
import { SavedFromLine, webAddress } from "./saved-from";

const show = (blocks: MarkdownBlock[], documentId?: string) =>
  render(
    <ThemeProvider>
      <MemoryRouter>
        <MarkdownDocument title="Collecting rainwater" blocks={blocks} documentId={documentId} />
      </MemoryRouter>
    </ThemeProvider>,
  );

describe("where a saved page came from", () => {
  it("is said above the text, with the address as a link that leaves Outpost", () => {
    render(
      <p>
        <SavedFromLine savedFrom={{ url: "https://gazette.example/articles/rainwater", savedAt: Date.UTC(2026, 10, 16, 12) }} />
      </p>,
    );
    const link = screen.getByRole("link", { name: "https://gazette.example/articles/rainwater" });
    expect(link).toHaveAttribute("href", "https://gazette.example/articles/rainwater");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    expect(screen.getByText(/Saved from/)).toHaveTextContent(
      "Saved from https://gazette.example/articles/rainwater on 16 Nov 2026. This is a copy kept for reading offline; the page belongs to whoever published it, and may have changed since.",
    );
  });

  it("never makes a link of anything but a web address", () => {
    expect(webAddress("https://example.org/a")).toBe("https://example.org/a");
    for (const not of ["javascript:alert(1)", "data:text/html,x", "/api/documents/1/file", "file:///etc/passwd", "not an address"]) {
      expect(webAddress(not), not).toBeNull();
    }
    render(
      <p>
        <SavedFromLine savedFrom={{ url: "javascript:alert(1)", savedAt: 0 }} />
      </p>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/javascript:alert\(1\)/)).toBeInTheDocument();
  });
});

describe("a picture the file carries", () => {
  const blocks: MarkdownBlock[] = [
    { t: "paragraph", c: [{ t: "image", alt: "A barrel on blocks", picture: 2 }] },
    { t: "paragraph", c: [{ t: "image", alt: "A diverter on a downpipe" }] },
  ];

  it("is shown from this document's own pictures, and any other picture is only described", () => {
    const { container } = show(blocks, "01DOCUMENT");
    const shown = screen.getByRole("img", { name: "A barrel on blocks" });
    expect(shown).toHaveAttribute("src", "/api/documents/01DOCUMENT/pictures/2");
    expect(shown).toHaveAttribute("loading", "lazy");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText("Picture, not shown here.")).toBeInTheDocument();
    expect(screen.getByText("A diverter on a downpipe")).toBeInTheDocument();
  });

  it("falls back to its description when it cannot be loaded", () => {
    const { container } = show(blocks, "01DOCUMENT");
    fireEvent.error(screen.getByRole("img", { name: "A barrel on blocks" }));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Picture, which could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("A barrel on blocks")).toBeInTheDocument();
  });

  it("is only described where there is no document to ask for it", () => {
    const { container } = show(blocks);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText("Picture, not shown here.")).toHaveLength(2);
  });

  it("has an address built from an id and a number, and from nothing else", () => {
    expect(pictureAddress("01DOCUMENT", 1)).toBe("/api/documents/01DOCUMENT/pictures/1");
    for (const [id, picture] of [
      ["../../settings", 1],
      ["01DOC/file?x=", 1],
      ["", 1],
      [undefined, 1],
      ["01DOCUMENT", 0],
      ["01DOCUMENT", -1],
      ["01DOCUMENT", 1.5],
      ["01DOCUMENT", 10_000],
      ["01DOCUMENT", "1/../../file" as unknown as number],
      ["01DOCUMENT", undefined],
    ] as const) {
      expect(pictureAddress(id, picture), `${id} ${picture}`).toBeNull();
    }
  });
});
