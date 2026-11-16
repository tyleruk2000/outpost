import { describe, expect, it, vi } from "vitest";
import { progressUntilDone } from "./progress";

describe("progress of a file's encryption", () => {
  it("passes reports on until the work is done, and none after", () => {
    const set = vi.fn();
    const report = progressUntilDone(set);
    report.progress(64_000);
    report.done();
    // A piece the stream had already taken in, reported after the decryption failed.
    report.progress(300_000);
    expect(set.mock.calls).toEqual([[64_000], [null]]);
  });
});
