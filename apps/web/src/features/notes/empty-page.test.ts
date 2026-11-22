import type { NoteDetail } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { isEmptyPage } from "./notes-data";

const blank: NoteDetail = {
  id: "n1",
  title: "",
  icon: null,
  parentId: null,
  content: { type: "doc", content: [{ type: "paragraph" }] },
  encrypted: false,
  tags: [],
  isFavorite: false,
  isTemplate: false,
  position: 1,
  coverAttachmentId: null,
  coverUrl: null,
  breadcrumbs: [],
  backlinks: [],
  children: [],
  trashedAt: null,
  createdAt: 1,
  updatedAt: 1,
  lastViewedAt: null,
};

describe("an empty page, as a new page left untouched is", () => {
  it("is one with no title, nothing in it and no sub-pages", () => {
    expect(isEmptyPage(blank)).toBe(true);
    expect(isEmptyPage({ ...blank, content: { type: "doc", content: [{ type: "paragraph" }, { type: "paragraph" }] } })).toBe(true);
  });

  it("is not one with anything at all in it", () => {
    expect(isEmptyPage({ ...blank, title: "Stores" })).toBe(false);
    expect(isEmptyPage({ ...blank, icon: "🔥" })).toBe(false);
    expect(isEmptyPage({ ...blank, tags: ["kit"] })).toBe(false);
    expect(isEmptyPage({ ...blank, children: [{ id: "c", title: "", icon: null }] })).toBe(false);
    expect(
      isEmptyPage({ ...blank, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] } }),
    ).toBe(false);
    expect(isEmptyPage({ ...blank, content: { type: "doc", content: [{ type: "horizontalRule" }] } as NoteDetail["content"] })).toBe(false);
    expect(isEmptyPage({ ...blank, trashedAt: 5 })).toBe(false);
  });
});
