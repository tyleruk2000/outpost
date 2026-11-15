import type { PageFile } from "@outpost/shared";
import { isSavableLink } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { fileKey, fileLabel, fileTitle, hostsOf } from "./linked-files";

const inside = (path: string, text = ""): PageFile => ({ kind: "archive", path, text });
const outside = (href: string, text = ""): PageFile => ({ kind: "internet", href, text });

describe("files a reference page links to", () => {
  it("names a file by the link's words, or by its file name when the link says nothing", () => {
    expect(fileLabel(inside("irp.fas.org/doddir/milmed/dosimetry.pdf", "Personnel Dosimetry Guidance"))).toBe(
      "Personnel Dosimetry Guidance",
    );
    expect(fileLabel(inside("irp.fas.org/doddir/milmed/first%20aid.pdf"))).toBe("first aid.pdf");
    expect(fileLabel(outside("https://example.org/a/b/manual.pdf?x=1#page=2", "https://example.org/a/b/manual.pdf"))).toBe("manual.pdf");
  });

  it("only uses the link's words as the document's title when they would mean something on their own", () => {
    expect(fileTitle(inside("x/sfhandbook-pt2.pdf", "Part 2"))).toBeUndefined();
    expect(fileTitle(inside("x/sfhandbook.pdf", "Full Text in One File"))).toBeUndefined();
    expect(fileTitle(inside("x/a.pdf", "PDF"))).toBeUndefined();
    expect(fileTitle(outside("https://example.org/a.pdf", "https://example.org/a.pdf"))).toBeUndefined();
    expect(fileTitle(inside("x/bandage.pdf", "Bandaging and Splinting"))).toBe("Bandaging and Splinting");
  });

  it("tells the two kinds apart and says where internet files come from", () => {
    expect(fileKey(inside("a/b.pdf"))).toBe("archive:a/b.pdf");
    expect(fileKey(outside("https://example.org/b.pdf"))).toBe("https://example.org/b.pdf");
    expect(hostsOf([outside("https://irp.fas.org/a.pdf"), outside("https://irp.fas.org/b.pdf"), inside("x/c.pdf")])).toBe("irp.fas.org");
    expect(hostsOf([outside("https://a.example/a.pdf"), outside("https://b.example/b.pdf")])).toBe("2 websites");
  });

  it("offers saving only for web addresses of files the library keeps", () => {
    expect(isSavableLink("https://example.org/docs/manual.pdf")).toBe(true);
    expect(isSavableLink("http://example.org/book.EPUB?download=1")).toBe(true);
    expect(isSavableLink("https://example.org/page.html")).toBe(false);
    expect(isSavableLink("https://example.org/")).toBe(false);
    expect(isSavableLink("javascript:alert(1)//.pdf")).toBe(false);
    expect(isSavableLink("file:///etc/passwd.pdf")).toBe(false);
    expect(isSavableLink("not a link")).toBe(false);
  });
});
