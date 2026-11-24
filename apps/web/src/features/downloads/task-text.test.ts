import type { JobDto, JobWaiting } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  currentRate,
  describeTaskEvents,
  failureAdvice,
  filterOf,
  progressText,
  rateReadings,
  rateWords,
  secondsLeft,
  systemFailure,
  taskStateWords,
  timeLeftWords,
  waitingWords,
} from "./task-text";

const job = (over: Partial<JobDto> = {}): JobDto => ({
  id: "j1",
  type: "semantic.index",
  queue: "index",
  state: "running",
  title: "Build semantic search index",
  subject: null,
  progress: { current: 1200, total: 6000, message: null, unit: "passages" },
  error: null,
  errorKind: null,
  attempts: 1,
  maxAttempts: 1,
  result: null,
  createdAt: 0,
  startedAt: 0,
  finishedAt: null,
  updatedAt: 0,
  ...over,
});

const none: JobWaiting = { reason: null, slots: 1, running: [], ahead: [], aheadCount: 0, held: null, retryAt: null };

describe("a task in words", () => {
  it("counts in the unit the job reports, or the one its kind usually counts", () => {
    expect(progressText(job())).toBe("1,200 of 6,000 passages");
    expect(progressText(job({ progress: { current: 1, total: 1, message: null, unit: "pages" } }))).toBe("1 of 1 page");
    expect(progressText(job({ type: "collection.verify", progress: { current: 412_000_000, total: 1_900_000_000, message: null } }))).toBe(
      "412 MB of 1.90 GB",
    );
    expect(progressText(job({ type: "database.check", progress: { current: 3, total: 10, message: null } }))).toBe("3 of 10");
    // Without a total it says what it has done when it knows what it counts, and nothing otherwise.
    expect(progressText(job({ progress: { current: 40, total: null, message: null, unit: "books" } }))).toBe("40 books so far");
    expect(progressText(job({ type: "database.check", progress: { current: 0, total: null, message: null } }))).toBeNull();
  });

  it("works out the rate between samples, leaving out a change of stage and a count that starts again", () => {
    const readings = rateReadings([
      { at: 0, current: 0, total: 100, unit: "bytes" },
      { at: 10_000, current: 50_000, total: 100, unit: "bytes" },
      { at: 20_000, current: 10, total: 100, unit: "ways" },
      { at: 80_000, current: 70, total: 100, unit: "ways" },
      { at: 90_000, current: 5, total: 100, unit: "ways" },
    ]);
    expect(readings).toEqual([
      { at: 10_000, value: 5_000 },
      { at: 80_000, value: 60 },
    ]);
  });

  it("smooths the rate over the last few minutes, and has none until there is enough to go on", () => {
    const samples = Array.from({ length: 30 }, (_, n) => ({ at: n * 10_000, current: n * 50, total: 6000, unit: "passages" }));
    // 50 passages every ten seconds is 300 a minute; the live figure is the newest point.
    expect(
      currentRate(samples, job({ progress: { current: 1500, total: 6000, message: null, unit: "passages" }, updatedAt: 300_000 })),
    ).toBe(300);
    expect(currentRate(samples.slice(0, 1), job({ updatedAt: 0 }))).toBeNull();
    expect(currentRate(samples, job({ state: "paused" }))).toBeNull();
  });

  it("gives the time left only with a total and a rate, and says about", () => {
    expect(secondsLeft(job(), 300)).toBe(960);
    expect(secondsLeft(job({ progress: { current: 10, total: null, message: null } }), 300)).toBeNull();
    expect(secondsLeft(job(), 0)).toBeNull();
    expect(timeLeftWords(960)).toBe("about 16 minutes left");
    expect(timeLeftWords(20)).toBe("less than a minute left");
  });

  it("says a rate in the job's own unit", () => {
    expect(rateWords(312.4, "passages")).toBe("312 passages a minute");
    expect(rateWords(1, "pages")).toBe("1 page a minute");
    expect(rateWords(2.46, null)).toBe("2.5 a minute");
    expect(rateWords(2_100_000, "bytes")).toBe("2.10 MB/s");
  });

  it("names the state and the filter it comes under", () => {
    expect(taskStateWords(job()).label).toBe("Running");
    expect(taskStateWords(job({ state: "queued", error: "Busy" })).label).toBe("Trying again soon");
    expect(filterOf(job({ state: "paused" }))).toBe("waiting");
    expect(filterOf(job({ state: "cancelled" }))).toBe("finished");
    expect(filterOf(job({ state: "failed" }))).toBe("failed");
  });

  it("says what a task is waiting for", () => {
    const now = new Date(2026, 10, 23, 9, 0).getTime();
    expect(waitingWords(none, now)).toBeNull();
    expect(waitingWords({ ...none, reason: "paused" }, now)).toBe("Paused. Nothing more happens until it is resumed.");
    expect(waitingWords({ ...none, reason: "turn", slots: 2, aheadCount: 3 }, now)).toBe(
      "Waiting for its turn. 2 tasks of this kind run at a time. 3 more are ahead of it.",
    );
    expect(waitingWords({ ...none, reason: "held", held: "Space is being reclaimed in the database." }, now)).toBe(
      "Other work waits while this runs: space is being reclaimed in the database.",
    );
    expect(waitingWords({ ...none, reason: "retry", retryAt: new Date(2026, 10, 23, 9, 5).getTime() }, now)).toBe(
      "It stopped with an error and tries again by itself at 09:05.",
    );
  });

  it("says what to do about a failure", () => {
    expect(failureAdvice(job({ state: "failed" }))).toBe("Press Retry to run it again.");
    expect(failureAdvice(job({ type: "document.extract", state: "failed" }))).toBe("Start it again from where it began (the library).");
    expect(failureAdvice(job({ state: "failed", errorKind: "offline" }))).toMatch(/^The server could not reach the internet/);
  });

  it("tells the history as steps", () => {
    const lines = describeTaskEvents([
      { at: 1, kind: "state", state: "queued", message: null },
      { at: 2, kind: "state", state: "running", message: null },
      { at: 3, kind: "stage", state: "running", message: "Sorting the junctions" },
      { at: 4, kind: "retry", state: "queued", message: "The disk was busy" },
      { at: 5, kind: "state", state: "running", message: "Attempt 2 of 3" },
      { at: 6, kind: "state", state: "succeeded", message: null },
    ]);
    expect(lines.map((line) => [line.title, line.detail, line.tone])).toEqual([
      ["Added to the queue", null, "normal"],
      ["Started", null, "normal"],
      ["Sorting the junctions", null, "normal"],
      ["Stopped with an error; it will try again", "The disk was busy", "warning"],
      ["Started again", "Attempt 2 of 3", "normal"],
      ["Finished", null, "success"],
    ]);
  });
});

describe("a failure the system reported in its own terms", () => {
  it("is said in words, with what to do, and the system's own words are left for the details", () => {
    const said = systemFailure("EACCES: permission denied, open '/valhalla/request.json.part'");
    expect(said?.words).toBe("Outpost was not allowed to write a file it needs.");
    expect(said?.advice).toMatch(/until then it fails the same way/);
    expect(systemFailure("ENOSPC: no space left on device, write")?.words).toBe("The drive is full.");
    expect(systemFailure("The download stopped: the server said 404.")).toBeNull();
    expect(systemFailure(null)).toBeNull();
  });
});
