import type { CleanupResult, UsageRow } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  filterItems,
  groupRows,
  personalWords,
  planSentences,
  resultSentences,
  sortItems,
  stateOf,
  tallyOf,
  usageGroups,
  usageNote,
  usageTotal,
} from "./manage-text";
import { item, plan, sampleItems, usage } from "./test-support";

describe("the list of everything installed", () => {
  it("filters by name, kind, location and where it came from, all together", () => {
    const all = { text: "", kind: "all", locationId: "all", origin: "all" } as const;
    expect(filterItems(sampleItems, { ...all, text: "  RADIO ref " }).map((entry) => entry.id)).toEqual(["c3"]);
    expect(filterItems(sampleItems, { ...all, kind: "map" }).map((entry) => entry.id)).toEqual(["c2"]);
    expect(filterItems(sampleItems, { ...all, locationId: "usb" }).map((entry) => entry.id)).toEqual(["c2"]);
    expect(filterItems(sampleItems, { ...all, origin: "own" }).map((entry) => entry.id)).toEqual(["d1"]);
    expect(filterItems(sampleItems, { ...all, origin: "own", kind: "zim" })).toEqual([]);
    // A catalogue item is found by the name of a document it holds.
    const book = item({ id: "b1", title: "Logbook", documents: [{ id: "x", title: "Chapter on antennas" }] });
    expect(filterItems([book], { ...all, text: "antennas" })).toHaveLength(1);
  });

  it("sorts by size, date, name, kind and location without changing the list it was given", () => {
    const ids = (order: Parameters<typeof sortItems>[1]) => sortItems(sampleItems, order).map((entry) => entry.id);
    expect(ids("largest")).toEqual(["c1", "c2", "d1", "c3"]);
    expect(ids("smallest")).toEqual(["c3", "d1", "c2", "c1"]);
    expect(ids("newest")).toEqual(["c3", "d1", "c2", "c1"]);
    expect(ids("oldest")).toEqual(["c1", "c2", "d1", "c3"]);
    expect(ids("name")).toEqual(["c3", "d1", "c2", "c1"]);
    expect(ids("kind")).toEqual(["c1", "c2", "c3", "d1"]);
    expect(ids("location")[0]).toBe("c2");
    expect(sampleItems.map((entry) => entry.id)).toEqual(["c1", "c2", "c3", "d1"]);
  });

  it("adds a selection up, and names a state only when something is the matter", () => {
    expect(tallyOf(sampleItems.slice(0, 2))).toEqual({ count: 2, bytes: 2_400_000_000 });
    expect(stateOf(item())).toBeNull();
    expect(stateOf(item({ locationAvailable: false }))?.label).toBe("Not connected");
    expect(stateOf(item({ state: "missing" }))?.label).toBe("File missing");
    expect(stateOf(item({ state: "busy", busyReason: "It is being moved." }))?.label).toBe("Being moved or checked");
  });
});

describe("what a removal says before it happens", () => {
  it("states what is deleted, what goes with it, and what cannot be fetched again", () => {
    const lines = planSentences(plan({ own: { count: 1, bytes: 5_000_000 }, downloads: { count: 1, bytes: 10 } }), {
      files: "delete",
      disconnected: "leave",
    });
    expect(lines[0]).toBe("2 items will be deleted, files and all: 1.80 GB.");
    expect(lines).toContain("1 document in the library is the same file as a catalogue item here, and goes with it.");
    expect(lines).toContain("1 item (5.00 MB) is your own and cannot be downloaded again.");
    expect(lines).toContain("1 unfinished download will be cancelled and its partial file deleted.");
  });

  it("says plainly when no file is deleted", () => {
    const kept = plan({
      remove: { count: 0, bytes: 0 },
      byKind: [],
      byLocation: [
        {
          locationId: "loc1",
          name: "Internal storage",
          path: "/srv",
          available: true,
          remove: { count: 0, bytes: 0 },
          stays: { count: 2, bytes: 9 },
        },
      ],
    });
    expect(planSentences(kept, { files: "keep", disconnected: "leave" })[0]).toMatch(/^Outpost will forget 2 items\. No file is deleted/);
    expect(planSentences(plan({ remove: { count: 0, bytes: 0 } }), { files: "delete", disconnected: "leave" })[0]).toBe(
      "Nothing will be deleted.",
    );
  });

  it("lists the person's own things an erase takes, leaving out what there is none of", () => {
    const words = personalWords({
      pages: 3,
      attachments: { count: 2, bytes: 1_500_000 },
      places: 1,
      routes: 0,
      contacts: 2,
      conversations: 4,
      repeaters: 340,
      repeaterLists: 2,
      settings: 0,
      vectors: 0,
      previous: { count: 1, bytes: 6_400_000 },
    });
    expect(words).toBe(
      "Also erased: 3 pages of notes with 2 attachments (1.50 MB), 1 saved place, 2 contacts, 4 chat conversations, 340 repeaters in 2 lists, the history of downloads and other work and 1 copy of earlier data set aside by a restore (6.40 MB).",
    );
    expect(words).not.toMatch(/\b0 (routes|changed|semantic)/);
    expect(
      personalWords({
        pages: 0,
        attachments: { count: 0, bytes: 0 },
        places: 0,
        routes: 0,
        contacts: 0,
        conversations: 0,
        repeaters: 0,
        repeaterLists: 0,
        settings: 0,
        vectors: 0,
        previous: { count: 0, bytes: 0 },
      }),
    ).toBe("Also erased: the history of downloads and other work.");
  });
});

describe("the account of a clean-up", () => {
  const result = (over: Partial<CleanupResult>): CleanupResult => ({
    scope: "items",
    stopped: false,
    removed: { count: 0, bytes: 0 },
    forgotten: { count: 0, bytes: 0 },
    left: { count: 0, bytes: 0 },
    leftBehind: [],
    leftBehindMore: 0,
    failed: [],
    failedMore: 0,
    notReached: 0,
    message: "",
    ...over,
  });

  it("tells deleted from forgotten from left alone from failed", () => {
    const lines = resultSentences(
      result({
        removed: { count: 3, bytes: 2_000_000 },
        forgotten: { count: 1, bytes: 500 },
        left: { count: 2, bytes: 10 },
        failed: [{ title: "Atlas", reason: "It is being moved." }],
        failedMore: 1,
      }),
    );
    expect(lines).toEqual([
      "Deleted 3 items, 2.00 MB.",
      "Forgot 1 item without deleting its file (500 bytes).",
      "Left 2 items exactly as they were, on a location that is not connected.",
      "2 items could not be removed and were not changed.",
    ]);
  });

  it("names the conversations and repeaters an erase took, and repeaters entered by hand with no list", () => {
    const personal = { pages: 0, attachments: 0, places: 0, routes: 0, contacts: 0, settings: 0 };
    expect(
      resultSentences(result({ scope: "everything", personal: { ...personal, conversations: 1, repeaters: 12, repeaterLists: 1 } }))[0],
    ).toBe("Erased 1 chat conversation, 12 repeaters in 1 list and the history.");
    expect(
      resultSentences(result({ scope: "everything", personal: { ...personal, conversations: 0, repeaters: 1, repeaterLists: 0 } }))[0],
    ).toBe("Erased 1 repeater and the history.");
  });

  it("says when it was stopped and how much it had not reached, and when there was nothing to do", () => {
    expect(resultSentences(result({ stopped: true, notReached: 4, removed: { count: 1, bytes: 1000 } })).at(-1)).toBe(
      "Stopped before reaching 4 more items. What was already removed stays removed.",
    );
    expect(resultSentences(result({}))).toEqual(["There was nothing to remove."]);
    expect(resultSentences(result({ scope: "derived", steps: [{ step: "compact", message: "Compacted the database." }] }))).toEqual([
      "Compacted the database.",
    ]);
  });
});

describe("what is taking the space", () => {
  it("totals only rows that stand for space of their own, and says when some is still being counted", () => {
    const data = usage();
    // Passages and vectors are inside the database row and are not added twice.
    expect(usageTotal(data)).toEqual({ bytes: 2_600_000_000 + 5_000_000 + 90_000_000 + 3_000_000 + 310_000_000, counting: false });
    const counting = usage({ rows: data.rows.map((row) => (row.id === "extracted" ? { ...row, bytes: null } : row)) });
    expect(usageTotal(counting).counting).toBe(true);
  });

  it("orders a group largest first, keeps parts under what they are part of, and leaves out empty rows", () => {
    const own = usageGroups.find((group) => group.title === "Outpost's own")!;
    expect(groupRows(own, usage().rows).map((row) => row.id)).toEqual(["database", "passages", "extracted"]);
    const downloaded = usageGroups.find((group) => group.title === "Downloaded")!;
    expect(groupRows(downloaded, usage().rows).map((row) => row.id)).toEqual(["zim"]);
  });

  it("notes an estimate, and what is only known from before a drive went away", () => {
    const rows = new Map(usage().rows.map((row) => [row.id, row] as [string, UsageRow]));
    expect(usageNote(rows.get("zim")!)).toBe("2 items; 800 MB of it on a location that is not connected, as last known");
    expect(usageNote(rows.get("passages")!)).toBe("4,000 passages; inside the database; an estimate");
    expect(usageNote(rows.get("extracted")!)).toBe("");
  });
});
