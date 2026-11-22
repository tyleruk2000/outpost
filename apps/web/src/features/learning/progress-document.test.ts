import type { LearningCourse } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { kitCanWriteProgress, progressBar, progressKitDocument, progressTitle } from "./progress-document";

const NOW = new Date(2026, 10, 17, 15).getTime();
const course = (over: Partial<LearningCourse> = {}): LearningCourse => ({
  learner: "Sam",
  archive: "number-school_en_all",
  title: "Number school",
  collectionId: "c1",
  last: { path: "lessons/quarters", title: "Quarters", at: NOW - 3_600_000 },
  pagesOpened: 4,
  pagesDone: 2,
  secondsThisWeek: 2 * 3600 + 120,
  secondsInAll: 3 * 3600,
  topics: [{ path: "topics/fractions", title: "Fractions", listed: 3, done: 2 }],
  ...over,
});
const COURSES = [
  course(),
  course({
    archive: "first-aid_en_all",
    title: "First aid basics",
    last: { path: "burns", title: "Burns and scalds", at: NOW - 86_400_000 },
    pagesOpened: 12,
    pagesDone: 9,
    secondsThisWeek: 40 * 60,
    secondsInAll: 5 * 3600,
    topics: [
      { path: "t/bleeding", title: "Bleeding", listed: 6, done: 6 },
      { path: "t/burns", title: "Burns", listed: 5, done: 3 },
    ],
  }),
  course({
    learner: "Robin",
    title: "Plants of the British Isles",
    archive: "plants_en",
    pagesOpened: 7,
    pagesDone: 1,
    secondsThisWeek: 0,
    topics: [],
  }),
];

describe("learning progress on paper", () => {
  it("draws a bar as long as the share done, and none for nothing done", () => {
    expect(progressBar(1, 4, 100, "#000000")).toContain('width="25.00"');
    expect(progressBar(6, 6, 100, "#000000")).toContain('width="100.00"');
    expect(progressBar(0, 4, 100, "#000000").match(/<rect/g)).toHaveLength(1);
    expect(progressBar(3, 0, 100, "#000000").match(/<rect/g)).toHaveLength(1);
  });

  it("names each learner and course, where they got to, the pages done and each topic", () => {
    const words = contentText(progressKitDocument(COURSES, null, NOW, "a4").content);
    expect(words).toContain("Everyone");
    expect(words).toContain("Sam");
    expect(words).toContain("Robin");
    expect(words).toContain("Got to “Quarters”, 17 Nov 2026");
    expect(words).toContain("9 of 12 pages opened done");
    expect(words).toContain("Bleeding 6 of 6 done");
    expect(words).toContain("about 2 hours this week about 3 hours in all");
    expect(contentText(progressKitDocument([COURSES[0]!], "Sam", NOW, "a4").content)).not.toContain("Robin");
  });

  it("leaves a record with a name in another script to the old writer", () => {
    expect(kitCanWriteProgress(COURSES, null)).toBe(true);
    expect(kitCanWriteProgress([course({ learner: "Саша" })], null)).toBe(false);
    expect(kitCanWriteProgress([course({ title: "数学" })], "Sam")).toBe(false);
  });

  it("is a PDF whose words can be found, the same when made twice", async () => {
    const printed = await renderPdf(progressKitDocument(COURSES, null, NOW, "a4"));
    writeSample("progress-after", printed.bytes);
    const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
    expect(pdf.numPages).toBe(1);
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ");
    expect(text).toContain("First aid basics");
    expect((await pdf.getMetadata()).info).toMatchObject({ Title: progressTitle(null, NOW) });
    const again = await renderPdf(progressKitDocument(COURSES, null, NOW, "a4"));
    expect(again.bytes).toEqual(printed.bytes);
  }, 60_000);
});
