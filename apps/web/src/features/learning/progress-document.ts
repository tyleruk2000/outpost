/**
 * Learning progress as pages of a PDF, through the same blocks and writer as the other
 * documents Outpost makes (propagation/plans/document.ts, maps/print/pdf.ts): a record
 * of what a learner has covered, to keep on paper. It says the day it was written out,
 * and is dated by that day, so the same record unchanged, made twice in a day, is the same file.
 */
import { aboutTime, type LearningCourse, learnerLabel } from "@outpost/shared";
import { writePdfPages } from "@/features/maps/print/pdf";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { appLocale } from "@/lib/region";

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" });

/** Whose record it is: a learner's name, "Just me", or everyone. */
export const progressWhose = (learner: string | null) => (learner === null ? "everyone" : learnerLabel(learner));

export const progressTitle = (learner: string | null, now: number) =>
  `Learning progress, ${progressWhose(learner)}, ${shortDate.format(now)}`;

/** "7 of 12 done in Fractions; 2 of 5 done in Shapes", or null when no topic's list could be read. */
export function topicsWords(course: LearningCourse): string | null {
  if (course.topics.length === 0) return null;
  return course.topics.map((topic) => `${topic.done} of ${topic.listed} done in ${topic.title}`).join("; ");
}

export function progressDocument(courses: LearningCourse[], learner: string | null, now: number): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: `Learning progress: ${progressWhose(learner)}` },
    {
      kind: "para",
      text: `Written out on ${longDate.format(now)} from what Outpost's reader recorded: the pages each learner opened in the reference collections, those they marked done or whose video they watched to the end, and the time those pages were on screen. A name is chosen on the device and proves nothing about who was holding it.`,
    },
  ];
  const learners = [...new Set(courses.map((course) => course.learner))];
  for (const name of learners) {
    const theirs = courses.filter((course) => course.learner === name);
    if (learner === null) blocks.push({ kind: "heading", text: learnerLabel(name) });
    blocks.push({
      kind: "table",
      head: ["Course", "Where they got to", "Opened", "Done", "This week"],
      rows: theirs.map((course) => [
        course.title,
        `${course.last.title}, ${shortDate.format(course.last.at)}`,
        String(course.pagesOpened),
        String(course.pagesDone),
        aboutTime(course.secondsThisWeek),
      ]),
      right: [2, 3],
    });
    const topics = theirs.map((course) => ({ course, words: topicsWords(course) })).filter((entry) => entry.words);
    if (topics.length > 0) blocks.push({ kind: "list", items: topics.map((entry) => `${entry.course.title}: ${entry.words}`) });
  }
  blocks.push({
    kind: "para",
    text: "“Done in” counts the pages a topic page links to inside the same collection, leaving out the links every page carries. It is shown only where the reader could read such a list.",
  });
  return blocks;
}

export function progressPdf(courses: LearningCourse[], learner: string | null, now: number): Uint8Array {
  return writePdfPages({
    pages: toSheets(progressDocument(courses, learner, now), "Learning progress · Outpost"),
    title: progressTitle(learner, now),
    created: new Date(new Date(now).setHours(0, 0, 0, 0)),
  });
}
