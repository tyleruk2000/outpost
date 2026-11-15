import type { CatalogEntryDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { entry } from "../downloads/test-support";
import {
  countByCategory,
  entryAction,
  entrySituation,
  fetchSize,
  fetchSizeText,
  filterEntries,
  formatLabel,
  isIncluded,
  licenceText,
  matchesQuery,
  openTarget,
  packLine,
  packSummary,
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

  it("opens anything that became a document as that document, and anything else as its collection", () => {
    expect(openTarget({ ...sheet, collectionId: "c4", documentId: "d7" })).toBe("/library/documents/d7");
    expect(openTarget({ ...sheet, collectionId: "c4" })).toBe("/library/collections/c4");
    // A PDF fetched from its publisher is read in the document viewer too: its collection page cannot show it.
    expect(openTarget(entry({ format: "pdf", collectionId: "c9", documentId: "d1" }))).toBe("/library/documents/d1");
    expect(openTarget(entry({ collectionId: "c2" }))).toBe("/library/collections/c2");
  });
});

describe("packs", () => {
  const sheet = entry({
    id: "sheet",
    name: "Radio channels",
    source: { type: "bundled", file: "radio/channels.md", version: "1" },
    sizeBytes: 9_000,
    sizeIsEstimate: false,
  });
  const guide = entry({ id: "guide", name: "First aid guide", sizeBytes: 4_000_000, sizeIsEstimate: false });
  const archive = entry({ id: "archive", name: "Medical library", sizeBytes: 70_000_000, sizeIsEstimate: true });
  const unsized = entry({ id: "unsized", name: "Unknown", sizeBytes: null });
  const all = [sheet, guide, archive, unsized];
  const pack = { entryIds: ["guide", "sheet", "archive", "gone"] };

  it("keeps the pack's own order and leaves out what the catalogue no longer lists", () => {
    expect(packSummary(pack, all).items.map((item) => item.id)).toEqual(["guide", "sheet", "archive"]);
  });

  it("separates what is here, what is on its way and what is missing", () => {
    const summary = packSummary(pack, [sheet, { ...guide, status: "installed" }, { ...archive, status: "downloading" }]);
    expect(summary).toMatchObject({ installed: 1, underWay: 1 });
    expect(summary.missing.map((item) => item.id)).toEqual(["sheet"]);
  });

  it("counts only what has to be fetched: sheets that come with Outpost cost nothing", () => {
    expect(fetchSize([sheet, guide, archive])).toEqual({ bytes: 74_000_000, approximate: true, unknown: 0, online: 2, included: 1 });
    expect(fetchSizeText(fetchSize([sheet]))).toBe("nothing to fetch");
    expect(fetchSizeText(fetchSize([guide]))).toBe("4.00 MB to fetch");
    expect(fetchSizeText(fetchSize([guide, archive]))).toBe("about 74.0 MB to fetch");
    expect(fetchSizeText(fetchSize([guide, unsized]))).toBe("4.00 MB to fetch, plus 1 of unknown size");
    expect(fetchSizeText(fetchSize([unsized]))).toBe("size not known yet");
  });

  it("says where a pack stands in one line", () => {
    expect(packLine(packSummary(pack, all))).toBe("3 items, about 74.0 MB to fetch");
    expect(packLine(packSummary(pack, [sheet, { ...guide, status: "installed" }, { ...archive, status: "queued" }]))).toBe(
      "3 items, nothing to fetch, 1 already here, 1 on its way",
    );
    expect(
      packLine(
        packSummary(
          pack,
          all.map((item) => ({ ...item, status: "installed" as const })),
        ),
      ),
    ).toBe("All 3 already in your library");
  });
});
