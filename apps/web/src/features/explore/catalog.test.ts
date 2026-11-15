import type { CatalogEntryDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { entry } from "../downloads/test-support";
import { countByCategory, entryAction, entrySituation, filterEntries, licenceText, matchesQuery, sizeText, sortEntries } from "./catalog";

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
});

describe("the state and action of an entry", () => {
  const cases: Array<[Partial<CatalogEntryDto>, string, string | null, string | null]> = [
    // entry, situation, admin's action, member's action
    [{ status: "not_installed" }, "available", "Download", null],
    [{ status: "not_installed", availability: "unavailable" }, "unavailable", null, null],
    [{ status: "queued" }, "queued", null, null],
    [{ status: "downloading" }, "downloading", null, null],
    [{ status: "paused" }, "paused", null, null],
    [{ status: "failed" }, "failed", "Retry", null],
    [{ status: "installed" }, "installed", "Open", "Open"],
    [{ status: "installed", updateAvailable: true }, "update", "Update", "Open"],
    [{ status: "installed", updateAvailable: true, availability: "unavailable" }, "installed", "Open", "Open"],
  ];

  it.each(cases)("%j is %s", (over, situation, adminLabel, memberLabel) => {
    const state = entrySituation(entry(over));
    expect(state).toBe(situation);
    expect(entryAction(state, true).label).toBe(adminLabel);
    expect(entryAction(state, false).label).toBe(memberLabel);
  });

  it("lets only administrators manage a download that is under way", () => {
    expect(entryAction("downloading", true).kind).toBe("manage");
    expect(entryAction("downloading", false).kind).toBe("none");
  });
});
