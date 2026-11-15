import { describe, expect, it } from "vitest";
import {
  describeEvents,
  fetcherWords,
  finishWords,
  integrityVerdict,
  ordinal,
  planSentence,
  queuePosition,
  queuePositions,
  regionDetail,
  regionExtent,
  retryWords,
  stalledWords,
  startWords,
  stateWords,
  unscheduledReason,
} from "./plan-text";
import { download, plan, planItem } from "./test-support";

const now = new Date(2026, 10, 15, 14, 0, 0).getTime();

describe("the plan, as a sentence", () => {
  it("states what is queued and when it will finish at the measured speed", () => {
    const words = planSentence(plan(), { now });
    expect(words.lead).toBe("3 downloads, 4.20 GB to go. At the present speed they will finish in about 1 hour 10 minutes.");
    expect(words.notes).toEqual(["That is about 15:10."]);
  });

  it("uses the singular for one download", () => {
    const words = planSentence(
      plan({ counts: { active: 1, waiting: 0, paused: 0, failed: 0 }, remainingBytes: 412_000_000, finishesInSeconds: 240 }),
      { now },
    );
    expect(words.lead).toBe("1 download, 412 MB to go. At the present speed it will finish in about 4 minutes.");
  });

  it("says so when a limit is in force", () => {
    const words = planSentence(plan({ rateLimitBytesPerSecond: 500_000 }), { now });
    expect(words.lead).toBe(
      "3 downloads, 4.20 GB to go. At the present speed, limited to 500 kB/s, they will finish in about 1 hour 10 minutes.",
    );
    expect(words.notes).toEqual(["That is about 15:10."]);
  });

  it("is honest when the estimate rests on the limit and not on a measurement", () => {
    const words = planSentence(
      plan({
        basis: "limit",
        bytesPerSecond: null,
        rateLimitBytesPerSecond: 500_000,
        finishesInSeconds: 8400,
        counts: { active: 0, waiting: 3, paused: 0, failed: 0 },
      }),
      { now },
    );
    expect(words.lead).toBe(
      "3 downloads, 4.20 GB to go. Nothing is moving yet. At the limit you set, 500 kB/s, they would finish in about 2 hours 20 minutes.",
    );
    expect(words.notes).toEqual(["That would be about 16:20."]);
  });

  it("gives no estimate before any speed is known", () => {
    const words = planSentence(plan({ basis: null, bytesPerSecond: null, assumedBytesPerSecond: null, finishesInSeconds: null }), { now });
    expect(words.lead).toBe("3 downloads, 4.20 GB to go. Estimates appear once a transfer is under way.");
    expect(words.notes).toEqual([]);
  });

  it("counts downloads of unknown size apart and gives no finish time", () => {
    const words = planSentence(plan({ unknownSizes: 1, finishesInSeconds: null }), { now });
    expect(words.lead).toBe(
      "2 downloads, 4.20 GB to go, plus 1 whose size is not known yet. A finish time cannot be given until every size is known.",
    );
    const all = planSentence(plan({ unknownSizes: 3, remainingBytes: 0, finishesInSeconds: null }), { now });
    expect(all.lead).toBe("3 downloads whose size is not known yet. A finish time cannot be given until every size is known.");
  });

  it("says when everything is waiting for a connection", () => {
    const words = planSentence(
      plan({ basis: "limit", rateLimitBytesPerSecond: 500_000, counts: { active: 0, waiting: 2, paused: 0, failed: 0 } }),
      { now, waitingForConnection: 2 },
    );
    expect(words.lead).toBe(
      "2 downloads, 4.20 GB to go. Waiting for a connection: they will carry on by themselves when the network is back.",
    );
    expect(words.notes).toEqual(["Transfers are limited to 500 kB/s."]);
  });

  it("describes a queue that is only paused", () => {
    const queue = [
      planItem({ id: "a", phase: "paused", state: "paused", remainingBytes: 700_000_000, startsInSeconds: null, finishesInSeconds: null }),
      planItem({ id: "b", phase: "paused", state: "paused", remainingBytes: 500_000_000, startsInSeconds: null, finishesInSeconds: null }),
    ];
    const words = planSentence(
      plan({ queue, counts: { active: 0, waiting: 0, paused: 2, failed: 0 }, remainingBytes: 0, finishesInSeconds: null, basis: null }),
      { now },
    );
    expect(words.lead).toBe("2 downloads paused, 1.20 GB still to fetch. Nothing will arrive until they are resumed.");
    const one = planSentence(
      plan({ queue: queue.slice(0, 1), counts: { active: 0, waiting: 0, paused: 1, failed: 0 }, basis: null, finishesInSeconds: null }),
      { now },
    );
    expect(one.lead).toBe("1 download paused, 700 MB still to fetch. Nothing will arrive until it is resumed.");
  });

  it("mentions what is left out: paused downloads and ones that need attention", () => {
    const words = planSentence(plan({ counts: { active: 1, waiting: 2, paused: 2, failed: 1 } }), { now });
    expect(words.notes).toEqual([
      "That is about 15:10.",
      "2 more are paused and not counted.",
      "1 stopped and needs attention, further down.",
    ]);
  });

  it("says a download has arrived when only checking is left", () => {
    const words = planSentence(plan({ counts: { active: 1, waiting: 0, paused: 0, failed: 0 }, remainingBytes: 0, finishesInSeconds: 0 }), {
      now,
    });
    expect(words.lead).toBe("1 download has arrived and is being checked.");
    expect(words.notes).toEqual([]);
  });

  it("says a finish after midnight is tomorrow", () => {
    const words = planSentence(plan({ finishesInSeconds: 12 * 3600 }), { now });
    expect(words.notes[0]).toBe("That is about tomorrow at 02:00.");
  });
});

describe("the queue", () => {
  it("counts in words a person would use", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "103rd",
    ]);
    expect(queuePosition(1)).toBe("Next");
    expect(queuePosition(2)).toBe("2nd in line");
    expect(queuePosition(11)).toBe("11th in line");
  });

  it("numbers only the downloads that are waiting, in order", () => {
    const positions = queuePositions(plan().queue);
    expect(positions.get("run")).toBeUndefined();
    expect(positions.get("next")).toBe(1);
    expect(positions.get("last")).toBe(2);
  });

  it("says why a download has no bar in the schedule", () => {
    const measured = { basis: "measured" as const };
    expect(unscheduledReason(planItem(), measured)).toBeNull();
    expect(
      unscheduledReason(planItem({ phase: "paused", state: "paused", startsInSeconds: null, finishesInSeconds: null }), measured),
    ).toBe("Paused");
    expect(unscheduledReason(planItem({ remainingBytes: null, totalBytes: null, finishesInSeconds: null }), measured)).toBe(
      "Size not known yet",
    );
    expect(unscheduledReason(planItem({ finishesInSeconds: null }), { basis: null })).toBe("No speed measured yet");
    expect(
      unscheduledReason(planItem({ phase: "waiting", state: "queued", startsInSeconds: null, finishesInSeconds: null }), measured),
    ).toBe("Behind a download whose size is not known");
    expect(unscheduledReason(planItem({ state: "verifying", finishesInSeconds: 0 }), measured)).toBe("Arrived; being checked");
  });

  it("gives no forecast to a download that stopped and is waiting to try again", () => {
    const waiting = planItem({ phase: "waiting", state: "queued", startsInSeconds: 0, finishesInSeconds: 300 });
    expect(unscheduledReason(waiting, { basis: "limit" }, "Waiting for a connection")).toBe("Waiting for a connection");
    expect(stalledWords(download({ state: "queued", error: "No connection.", errorKind: "offline" }))).toBe("Waiting for a connection");
    expect(stalledWords(download({ state: "queued", error: "Interrupted.", errorKind: "transient" }))).toBe("Waiting to retry");
    expect(stalledWords(download({ state: "queued" }))).toBeNull();
    expect(stalledWords(download({ state: "failed", error: "Full." }))).toBeNull();
  });

  it("puts exact times in the tooltip", () => {
    expect(startWords(planItem({ phase: "waiting", startsInSeconds: 720 }), now)).toBe("Starts in about 12 minutes, at 14:12");
    expect(startWords(planItem(), now)).toBe("Downloading now");
    expect(startWords(planItem({ phase: "waiting", startsInSeconds: 0 }), now)).toBe("Starts as soon as a slot is free");
    expect(finishWords(4200, now)).toBe("Finishes about 15:10, in 1 hour 10 minutes");
  });
});

describe("one download", () => {
  it("names its state", () => {
    expect(stateWords(download()).label).toBe("Downloading");
    expect(stateWords(download({ state: "verifying", message: "Installing" })).label).toBe("Installing");
    expect(stateWords(download({ state: "verifying" })).label).toBe("Checking the file");
    expect(stateWords(download({ state: "queued" })).label).toBe("Waiting for its turn");
    expect(stateWords(download({ state: "queued", error: "No connection.", errorKind: "offline" }))).toEqual({
      label: "Waiting for a connection",
      tone: "warning",
    });
    expect(stateWords(download({ state: "completed" }))).toEqual({ label: "Installed", tone: "success" });
    expect(stateWords(download({ state: "failed" }))).toEqual({ label: "Failed", tone: "danger" });
  });

  it("says which attempt is next and when", () => {
    expect(retryWords({ made: 2, allowed: 8, nextAttemptAt: now + 40_000 }, now)).toBe("Attempt 3 of 8, in 40 seconds");
    expect(retryWords({ made: 2, allowed: 8, nextAttemptAt: now + 150_000 }, now)).toBe("Attempt 3 of 8, in 3 minutes");
    expect(retryWords({ made: 2, allowed: 8, nextAttemptAt: now - 500 }, now)).toBe("Attempt 3 of 8, any moment now");
    expect(retryWords({ made: 2, allowed: 8, nextAttemptAt: null }, now)).toBeNull();
  });

  it("tells the history as a story", () => {
    const lines = describeEvents([
      { at: 1, state: "queued" },
      { at: 2, state: "running" },
      { at: 3, state: "paused" },
      { at: 4, state: "queued" },
      { at: 5, state: "running" },
      { at: 60_000, state: "queued", detail: "No connection. This download will resume when the network is back." },
      { at: 70_000, state: "running" },
      { at: 200_000, state: "verifying" },
      { at: 201_000, state: "completed" },
    ]);
    expect(lines.map((line) => line.title)).toEqual([
      "Added to the queue",
      "Started",
      "Paused",
      "Resumed — back in the queue",
      "Carried on",
      "Connection lost — waiting to retry",
      "Carried on",
      "Checking the file",
      "Installed",
    ]);
    expect(lines[5]).toMatchObject({ detail: "No connection. This download will resume when the network is back.", tone: "warning" });
    expect(lines[8]!.tone).toBe("success");
  });

  it("tells a retry that failed at once as one step, and gives the reason once", () => {
    const reason = "No connection. This download will resume when the network is back.";
    const lines = describeEvents([
      { at: 1, state: "queued" },
      { at: 2, state: "running" },
      { at: 50_000, state: "queued", detail: reason },
      { at: 60_000, state: "running" },
      { at: 60_007, state: "queued", detail: reason },
      { at: 90_000, state: "running" },
      { at: 90_004, state: "queued", detail: "The connection was interrupted." },
      { at: 120_000, state: "failed", detail: "The address did not answer after 8 attempts." },
    ]);
    expect(lines.map((line) => [line.title, line.detail])).toEqual([
      ["Added to the queue", null],
      ["Started", null],
      ["Connection lost — waiting to retry", reason],
      ["Tried again — still no connection", null],
      ["Tried again — interrupted", "The connection was interrupted."],
      ["Failed", "The address did not answer after 8 attempts."],
    ]);
    expect(lines[5]!.tone).toBe("danger");
  });

  it("names a retry and keeps states it does not know", () => {
    const lines = describeEvents([
      { at: 1, state: "queued" },
      { at: 2, state: "failed", detail: "Not found." },
      { at: 3, state: "queued" },
      { at: 4, state: "cancelled" },
      { at: 5, state: "archived" },
    ]);
    expect(lines.map((line) => line.title)).toEqual([
      "Added to the queue",
      "Failed",
      "Retried — back in the queue",
      "Cancelled",
      "Archived",
    ]);
  });

  it("gives a verdict on integrity in every case", () => {
    const sha = "a".repeat(64);
    expect(integrityVerdict({ sha256Expected: sha, sha256Actual: sha, verified: true }, "completed")).toMatchObject({
      title: "Verified",
      tone: "success",
    });
    expect(integrityVerdict({ sha256Expected: sha, sha256Actual: "b".repeat(64), verified: false }, "failed")).toMatchObject({
      title: "Mismatch",
      tone: "danger",
    });
    expect(integrityVerdict({ sha256Expected: sha, sha256Actual: null, verified: null }, "running").title).toBe("Will be checked");
    expect(integrityVerdict({ sha256Expected: sha, sha256Actual: null, verified: null }, "cancelled").title).toBe("Not checked");
    const none = integrityVerdict({ sha256Expected: null, sha256Actual: null, verified: null }, "running");
    expect(none.title).toBe("No checksum published");
    expect(none.text).toContain("recorded once it arrives");
    expect(integrityVerdict({ sha256Expected: null, sha256Actual: sha, verified: null }, "completed").text).toContain(
      "was recorded when it arrived",
    );
  });

  it("explains how the file is fetched", () => {
    expect(fetcherWords("http")).toContain("plain download");
    expect(fetcherWords("pmtiles-extract")).toContain("region cut from a larger map archive");
    expect(fetcherWords("carrier-pigeon")).toBe("Fetched by “carrier-pigeon”.");
  });

  it("describes a map region in plain words", () => {
    expect(regionExtent([6.8, 45.8, 7.4, 46.2])).toBe("45.80° N to 46.20° N, 6.80° E to 7.40° E");
    expect(regionExtent([-70.5, -33.9, -70.1, -33.2])).toBe("33.90° S to 33.20° S, 70.50° W to 70.10° W");
    expect(regionDetail({ minZoom: 0, maxZoom: 14, tileType: "vector" })).toBe(
      "Zoom 0 to 14: detailed enough for footpaths and buildings.",
    );
    expect(regionDetail({ minZoom: 0, maxZoom: 9, tileType: "vector" })).toBe(
      "Zoom 0 to 9: detailed enough for main roads and large towns.",
    );
    expect(regionDetail({ minZoom: 0, maxZoom: 15, tileType: "vector" })).toBe("Zoom 0 to 15: everything the map source has.");
    expect(regionDetail({ minZoom: 0, maxZoom: 12, tileType: "terrain" })).toBe("Zoom 0 to 12: the shape of the land, for hill shading.");
  });
});
