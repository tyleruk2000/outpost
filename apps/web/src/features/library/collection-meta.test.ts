import type { JobDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { collection } from "../downloads/test-support";
import {
  collectionNote,
  filesReachable,
  groupCollections,
  jobOutcome,
  MOVE_JOB,
  openTarget,
  removeChoices,
  removeLabel,
  VERIFY_JOB,
} from "./collection-meta";

const job = (over: Partial<JobDto>): Pick<JobDto, "type" | "state" | "result" | "error"> => ({
  type: VERIFY_JOB,
  state: "succeeded",
  result: null,
  error: null,
  ...over,
});

describe("grouping installed collections", () => {
  it("puts each kind under its heading, in a fixed order, and leaves out empty groups", () => {
    const groups = groupCollections([
      collection({ id: "t", kind: "terrain", title: "Alps terrain" }),
      collection({ id: "z2", title: "Wikipedia 100" }),
      collection({ id: "m", kind: "map", title: "Scotland" }),
      collection({ id: "z1", title: "appropedia" }),
      collection({ id: "p", kind: "places", title: "Place names" }),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["Reference collections", "Maps", "Place names"]);
    expect(groups[0]?.collections.map((item) => item.id)).toEqual(["z1", "z2"]);
    expect(groups[1]?.collections.map((item) => item.id)).toEqual(["t", "m"]);
  });

  it("sends reference collections to the reader and maps to the map", () => {
    expect(openTarget(collection())).toEqual({ to: "/library/read/c1/", label: "Read" });
    expect(openTarget(collection({ kind: "terrain" }))?.to).toBe("/maps");
    expect(openTarget(collection({ kind: "model" }))).toBeNull();
  });

  it("sends a file that became a document (a PDF or a reference sheet) to that document, where it can be read", () => {
    expect(openTarget(collection({ kind: "file", meta: { format: "markdown", documentId: "d7" } }))).toEqual({
      to: "/library/documents/d7",
      label: "Read",
    });
    expect(openTarget(collection({ kind: "file", meta: { format: "pdf", documentId: "d8" } }))?.to).toBe("/library/documents/d8");
    // A file the library could not take stays a plain file, with nothing to open it with.
    expect(openTarget(collection({ kind: "file", meta: { format: "other" } }))).toBeNull();
  });
});

describe("the state of a collection", () => {
  it("says nothing when it is simply fine", () => {
    expect(collectionNote(collection())).toBeNull();
    expect(filesReachable(collection())).toBe(true);
  });

  it("puts a disconnected location before everything else", () => {
    const away = collection({ locationAvailable: false, status: "missing", updateAvailable: true });
    expect(collectionNote(away)).toMatchObject({ kind: "disconnected", text: "Unavailable: “USB drive” is not connected" });
    expect(filesReachable(away)).toBe(false);
  });

  it("names missing, damaged, moving and update available", () => {
    expect(collectionNote(collection({ status: "missing" }))?.kind).toBe("missing");
    expect(collectionNote(collection({ status: "damaged" }))?.kind).toBe("damaged");
    expect(collectionNote(collection({ status: "moving" }))?.kind).toBe("moving");
    expect(collectionNote(collection({ updateAvailable: true }))?.kind).toBe("update");
    expect(filesReachable(collection({ status: "moving" }))).toBe(true);
    expect(filesReachable(collection({ status: "missing" }))).toBe(false);
  });
});

describe("removing a collection", () => {
  it("makes the person choose while the files can be reached", () => {
    expect(removeChoices(collection())).toEqual({ canDeleteFiles: true, initial: undefined });
  });

  it("only allows removing the record while the location is disconnected", () => {
    expect(removeChoices(collection({ locationAvailable: false }))).toEqual({ canDeleteFiles: false, initial: "keep" });
  });

  it("names the confirm button after the choice", () => {
    expect(removeLabel(undefined)).toBe("Remove collection");
    expect(removeLabel("delete")).toBe("Delete collection and files");
    expect(removeLabel("keep")).toBe("Remove from Outpost");
  });
});

describe("how a check or move turned out", () => {
  it("tells the four results of a check apart", () => {
    expect(jobOutcome(job({ result: { outcome: "ok", message: "The file is intact." } }))).toEqual({
      tone: "success",
      title: "The files match",
      body: "The file is intact.",
    });
    expect(jobOutcome(job({ result: { outcome: "recorded", message: "Recorded." } })).title).toBe(
      "A checksum was recorded for the first time",
    );
    expect(jobOutcome(job({ result: { outcome: "damaged", message: "Corrupted." } }))).toMatchObject({
      tone: "danger",
      title: "The file is damaged",
    });
    expect(jobOutcome(job({ result: { outcome: "missing", message: "Gone." } }))).toMatchObject({
      tone: "warning",
      title: "The file is missing",
    });
  });

  it("reports a failed or cancelled job with what happened to the files", () => {
    expect(jobOutcome(job({ type: MOVE_JOB, state: "failed", error: "The copy did not match the original." }))).toEqual({
      tone: "danger",
      title: "The collection was not moved",
      body: "The copy did not match the original.",
    });
    expect(jobOutcome(job({ type: MOVE_JOB, state: "cancelled" })).body).toContain("still where it was");
    expect(jobOutcome(job({ state: "cancelled" })).title).toBe("The check was cancelled");
  });

  it("warns when a move finished but the original could not be deleted", () => {
    expect(jobOutcome(job({ type: MOVE_JOB, result: { message: 'Moved to "NAS".', originalRemoved: true } })).tone).toBe("success");
    expect(jobOutcome(job({ type: MOVE_JOB, result: { message: "Moved, but…", originalRemoved: false } })).tone).toBe("warning");
  });
});
