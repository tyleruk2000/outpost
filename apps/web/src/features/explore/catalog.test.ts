import type { CatalogEntryDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { entry } from "../downloads/test-support";
import {
  countByCategory,
  entryAction,
  entrySituation,
  filterEntries,
  formatLabel,
  isIncluded,
  licenceText,
  matchesQuery,
  openTarget,
  sizeText,
  sortEntries,
} from "./catalog";

const knots = entry();
const medicines = entry({
  id: "nhs",
  name: "NHS Medicines A to Z",
  description: "How each medicine works.",
  category: "medicine",
  publisher: "NHS",
  tags: ["medicine"],
  sizeBytes: 15_300_000,
  status: "installed",
});
const wikipedia = entry({
  id: "wp",
  name: "Wikipedia (complete, with images)",
  description: "All of the English Wikipedia.",
  category: "encyclopedias",
  tags: [],
  sizeBytes: 127_000_000_000,
});
const unknown = entry({
  id: "odd",
  name: "A thing of unknown size",
  description: "Nobody has measured it.",
  publisher: "Small Press",
  category: "reference",
  sizeBytes: null,
  tags: undefined,
});
const all = [wikipedia, knots, unknown, medicines];
const sheet = entry({
  id: "outpost.radio.uk-amateur-bands",
  name: "Amateur radio bands in the United Kingdom",
  description: "Every band in the Ofcom licence.",
  category: "radio",
  publisher: "Outpost",
  format: "markdown",
  tags: ["ham radio"],
  source: { type: "bundled", file: "radio/uk-amateur-bands.md", version: "2026-11-15" },
  sizeBytes: 13_539,
  sizeIsEstimate: false,
});

describe("filtering the catalogue", () => {
  it("matches name, description, publisher and tags, whatever the case", () => {
    expect(matchesQuery(knots, "KNOTS")).toBe(true);
    expect(matchesQuery(knots, "small archive")).toBe(true);
    expect(matchesQuery(medicines, "nhs")).toBe(true);
    expect(matchesQuery(knots, "rope")).toBe(true);
    expect(matchesQuery(knots, "sailing")).toBe(false);
  });

  it("needs every typed word to appear somewhere", () => {
    expect(matchesQuery(knots, "wikipedia rope")).toBe(true);
    expect(matchesQuery(knots, "wikipedia medicine")).toBe(false);
    expect(matchesQuery(knots, "   ")).toBe(true);
  });

  it("narrows to installed or not installed", () => {
    expect(filterEntries(all, { query: "", show: "installed" }).map((item) => item.id)).toEqual(["nhs"]);
    expect(filterEntries(all, { query: "", show: "not_installed" }).map((item) => item.id)).toEqual(["wp", "kiwix.knots", "odd"]);
    expect(filterEntries(all, { query: "wikipedia", show: "all" }).map((item) => item.id)).toEqual(["wp", "kiwix.knots"]);
  });

  it("narrows to what is included with Outpost", () => {
    expect(isIncluded(sheet)).toBe(true);
    expect(isIncluded(knots)).toBe(false);
    expect(filterEntries([...all, sheet], { query: "", show: "included" }).map((item) => item.id)).toEqual([
      "outpost.radio.uk-amateur-bands",
    ]);
    expect(filterEntries([...all, sheet], { query: "ham", show: "all" }).map((item) => item.id)).toEqual([
      "outpost.radio.uk-amateur-bands",
    ]);
  });

  it("counts what is left per category, with the total under all", () => {
    expect(countByCategory(all)).toEqual({ all: 4, encyclopedias: 1, survival: 1, reference: 1, medicine: 1 });
    expect(countByCategory(filterEntries(all, { query: "wikipedia", show: "all" }))).toEqual({ all: 2, encyclopedias: 1, survival: 1 });
  });
});

describe("ordering the catalogue", () => {
  it("sorts by name without minding case", () => {
    expect(sortEntries(all, "name").map((item) => item.id)).toEqual(["odd", "kiwix.knots", "nhs", "wp"]);
  });

  it("sorts by size either way and keeps unknown sizes last", () => {
    expect(sortEntries(all, "smallest").map((item) => item.id)).toEqual(["kiwix.knots", "nhs", "wp", "odd"]);
    expect(sortEntries(all, "largest").map((item) => item.id)).toEqual(["wp", "nhs", "kiwix.knots", "odd"]);
  });

  it("leaves the list it was given untouched", () => {
    sortEntries(all, "smallest");
    expect(all[0]).toBe(wikipedia);
  });
});

describe("wording", () => {
  it("says about while the size is an estimate and gives the exact figure after", () => {
    expect(sizeText(knots)).toBe("about 14.0 MB");
    expect(sizeText(entry({ sizeBytes: 14_100_000, sizeIsEstimate: false }))).toBe("14.1 MB");
    expect(sizeText(unknown)).toBe("Size not known yet");
  });

  it("says plainly when the licence has not been verified", () => {
    expect(licenceText(knots)).toBe("Licence: CC BY-SA 4.0.");
    expect(licenceText(entry({ license: "See source", licenseNote: "The publisher's terms have not been verified." }))).toBe(
      "Licence: see the source. Not verified by the catalogue maintainers.",
    );
  });

  it("does not call a licence unverified just because a note explains its terms", () => {
    expect(licenceText(entry({ license: "CC BY-NC-SA 4.0", licenseNote: "Stated inside the file. Non-commercial use only." }))).toBe(
      "Licence: CC BY-NC-SA 4.0.",
    );
    expect(
      licenceText(
        entry({ license: "CC BY-SA 4.0", licenseNote: "Taken from the feed; the terms have not been verified by the maintainers." }),
      ),
    ).toBe("Licence: CC BY-SA 4.0. Not verified by the catalogue maintainers.");
  });

  it("names the kind of file for anything that is not a reference collection", () => {
    expect(formatLabel("zim")).toBeNull();
    expect(formatLabel("pdf")).toBe("PDF document");
    expect(formatLabel("epub")).toBe("EPUB book");
    expect(formatLabel("html")).toBe("Web page");
    expect(formatLabel("markdown")).toBe("Text document");
  });
});

describe("the state and action of an entry", () => {
  const cases: Array<[Partial<CatalogEntryDto>, string, string | null]> = [
    // entry, situation, the action offered
    [{ status: "not_installed" }, "available", "Download"],
    [{ status: "not_installed", availability: "unavailable" }, "unavailable", null],
    [{ status: "queued" }, "queued", null],
    [{ status: "downloading" }, "downloading", null],
    [{ status: "paused" }, "paused", null],
    [{ status: "failed" }, "failed", "Retry"],
    [{ status: "installed" }, "installed", "Open"],
    [{ status: "installed", updateAvailable: true }, "update", "Update"],
    [{ status: "installed", updateAvailable: true, availability: "unavailable" }, "installed", "Open"],
  ];

  it.each(cases)("%j is %s", (over, situation, label) => {
    const state = entrySituation(entry(over));
    expect(state).toBe(situation);
    expect(entryAction(state).label).toBe(label);
  });

  it("manages a download that is under way", () => {
    expect(entryAction("downloading").kind).toBe("manage");
  });

  it("adds what ships with Outpost instead of downloading it", () => {
    expect(entryAction(entrySituation(sheet), isIncluded(sheet))).toEqual({ kind: "add", label: "Add to library" });
    expect(entryAction("update", true)).toEqual({ kind: "update", label: "Update" });
    expect(entryAction("installed", true)).toEqual({ kind: "open", label: "Open" });
  });

  it("opens an added sheet as its document and anything else as its collection", () => {
    expect(openTarget({ ...sheet, collectionId: "c4", documentId: "d7" })).toBe("/library/documents/d7");
    expect(openTarget({ ...sheet, collectionId: "c4" })).toBe("/library/collections/c4");
    expect(openTarget(entry({ format: "pdf", collectionId: "c9", documentId: "d1" }))).toBe("/library/collections/c9");
  });
});
