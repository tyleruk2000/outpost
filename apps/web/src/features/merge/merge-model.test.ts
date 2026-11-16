import { describe, expect, it } from "vitest";
import { analysis, item } from "./merge-fixtures";
import { actionLabel, choiceOf, contextLines, describeTally, diffLines, groupItems, listKinds, tally, toCommitBody } from "./merge-model";

describe("what a preview adds up to", () => {
  const items = analysis().items;

  it("groups the items, with what needs deciding first and what cannot come last", () => {
    expect(groupItems(items).map((group) => [group.id, group.items.length])).toEqual([
      ["conflicts", 2],
      ["added", 3],
      ["edited", 2],
      ["deleted", 2],
      ["collections", 1],
      ["blocked", 1],
    ]);
    expect(groupItems([])).toEqual([]);
  });

  it("by default adds and updates, keeps both sides of a conflict, and removes and copies nothing", () => {
    const result = tally(items, {});
    expect(result.add.map((entry) => entry.title)).toEqual(["Trip notes", "Trip day two", "Pilot notes"]);
    expect(result.update.map((entry) => entry.title)).toEqual(["Kit list"]);
    expect(result.beside.map((entry) => entry.title)).toEqual(["Anchorages", "Harbour"]);
    expect(result.move).toHaveLength(1);
    expect(result.remove).toEqual([]);
    expect(result.copy).toEqual([]);
    expect(result.keep.map((entry) => entry.title)).toEqual(["Old plans", "Charts"]);
    expect(result.later.map((entry) => entry.title)).toEqual(["Knots"]);
    expect(result.changes).toBe(7);
    expect(result.bytes).toBe(2_400_000);
    expect(actionLabel(result)).toBe("Bring back 7 changes");
    expect(describeTally(result)).toEqual([
      "Adds 2 pages and 1 document.",
      "Updates 1 page. What each was is kept in the record.",
      "Keeps both versions of 1 page and 1 saved place.",
      "Moves 1 page.",
      "Leaves 1 page and 1 document as they are at home.",
      "Leaves 1 collection on the drive for now.",
    ]);
    expect(toCommitBody(items, {}, false)).toEqual({ choices: {}, deletionsConfirmed: false });
  });

  it("follows the choices, and sends only those that differ from the defaults", () => {
    const choices = {
      "page:anchorages": "drive",
      "place:harbour": "home",
      "page:old": "apply",
      "collection:knots": "apply",
      "page:day2": "skip",
      "page:kit": "apply",
    } as const;
    const result = tally(items, choices);
    expect(result.update.map((entry) => entry.title)).toEqual(["Kit list", "Anchorages"]);
    expect(result.remove.map((entry) => entry.title)).toEqual(["Old plans"]);
    expect(result.copy.map((entry) => entry.title)).toEqual(["Knots"]);
    expect(result.bytes).toBe(1_202_400_000);
    expect(describeTally(result)).toContain("Removes 1 page here.");
    expect(toCommitBody(items, choices, true)).toEqual({
      choices: {
        "page:anchorages": "drive",
        "place:harbour": "home",
        "page:old": "apply",
        "collection:knots": "apply",
        "page:day2": "skip",
      },
      deletionsConfirmed: true,
    });
  });

  it("never lets a blocked item or a choice it does not offer through", () => {
    const blocked = items.find((entry) => entry.blocked)!;
    expect(choiceOf(blocked, { [blocked.key]: "apply" })).toBe("skip");
    const added = items[0]!;
    expect(choiceOf(added, { [added.key]: "drive" })).toBe("apply");
    expect(tally(items, { [blocked.key]: "apply" }).add).not.toContain(blocked);
  });

  it("names the button for what it does when nothing would change", () => {
    const conflict = item({ key: "page:a", kind: "page", change: "conflict", title: "A" });
    expect(actionLabel(tally([conflict], { "page:a": "home" }))).toBe("Keep home as it is");
    expect(actionLabel(tally([], {}))).toBe("Nothing to bring back");
    const brought = item({
      key: "page:b",
      kind: "page",
      change: "conflict",
      title: "B",
      conflict: "deleted-at-home",
      choices: ["both", "home"],
    });
    expect(tally([brought], {}).add).toEqual([brought]);
  });

  it("writes lists and the lines about what is not listed in plain words", () => {
    expect(listKinds([])).toBe("nothing");
    expect(listKinds(items.filter((entry) => entry.kind === "place"))).toBe("1 saved place");
    expect(contextLines(analysis({ alreadyMerged: 1 }))).toEqual([
      "56 things are the same on the drive and at home.",
      "2 things were changed or removed only at home. There is nothing to bring back for them; updating the drive afterwards carries them over.",
      "1 change was dealt with when this drive was brought back before.",
    ]);
  });
});

describe("comparing two texts", () => {
  it("marks the lines each side has that the other does not", () => {
    const { left, right, marked } = diffLines(
      "Shelter from the west.\nGood holding in sand.\nWater ashore.",
      "Shelter from the west.\nPoor holding.\nWater ashore.\nNo fuel.",
    );
    expect(marked).toBe(true);
    expect(left.filter((line) => line.differs).map((line) => line.text)).toEqual(["Good holding in sand."]);
    expect(right.filter((line) => line.differs).map((line) => line.text)).toEqual(["Poor holding.", "No fuel."]);
    expect(left.map((line) => line.text).join("\n")).toBe("Shelter from the west.\nGood holding in sand.\nWater ashore.");
  });

  it("marks nothing in equal texts, and everything when nothing is shared", () => {
    expect(diffLines("a\nb", "a\nb").left.some((line) => line.differs)).toBe(false);
    const apart = diffLines("a", "b");
    expect([apart.left[0]!.differs, apart.right[0]!.differs]).toEqual([true, true]);
  });

  it("gives up on marking texts too long to compare, and says so", () => {
    const long = Array.from({ length: 2100 }, (_, index) => `line ${index}`).join("\n");
    expect(diffLines(long, `${long}\nmore`).marked).toBe(false);
  });
});
