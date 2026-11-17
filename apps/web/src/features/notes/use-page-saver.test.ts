/**
 * The draft a tab keeps of changes not yet saved. When the page was saved again after
 * the version the draft was made on (in another tab, on another device), restoring the
 * draft would put it over newer work, so the page has to be able to tell.
 */
import { afterEach, describe, expect, it } from "vitest";
import { clearDraft, draftIsBehind, readDraft, writeDraft } from "./use-page-saver";

afterEach(() => sessionStorage.clear());

describe("page drafts", () => {
  it("keeps the version of the page the changes were made on", () => {
    writeDraft("n1", { title: "Mine" }, 1_000);
    expect(readDraft("n1")).toMatchObject({ base: 1_000, fields: { title: "Mine" } });
    clearDraft("n1");
    expect(readDraft("n1")).toBeNull();
  });

  it("is behind once the page was saved after that version", () => {
    writeDraft("n1", { title: "Mine" }, 1_000);
    const draft = readDraft("n1")!;
    expect(draftIsBehind(draft, 1_000)).toBe(false);
    expect(draftIsBehind(draft, 1_500)).toBe(true);
  });

  it("treats a draft from before the version was recorded as behind", () => {
    sessionStorage.setItem("outpost.notes.draft.n1", JSON.stringify({ at: 5, fields: { title: "Old" } }));
    const draft = readDraft("n1")!;
    expect(draft.base).toBeUndefined();
    expect(draftIsBehind(draft, 1)).toBe(true);
  });
});
