/**
 * Learning progress as pages of a PDF: a record of what a learner has covered, to keep
 * on paper. It says the day it was written out, and is dated by that day, so the same
 * record unchanged, made twice in a day, is the same file.
 *
 * `progressKitDocument` lays it out with the print kit, a bar for each course and each
 * topic. The blocks (`progressDocument`, through the old writer) stay for a record with a
 * name or title in letters the kit's typeface lacks: the old writer letters those as
 * pictures (`writeLettered`).
 */
import { aboutTime, type LearningCourse, learnerLabel } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { kitCanWrite } from "@/features/maps/lib/sun-kit";
import {
  PRINT_COLOURS as C,
  callout,
  heading,
  measureOf,
  note,
  type PrintPaper,
  para,
  printable,
  printDocument,
  PRINT_TYPE as T,
} from "@/features/print-kit";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { appLocale } from "@/lib/region";
import type { Sheet } from "../maps/print/sheet";

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

/** The blocks as pages for the old writer, for a record the kit's typeface cannot write. */
export const progressSheets = (courses: LearningCourse[], learner: string | null, now: number): Sheet[] =>
  toSheets(progressDocument(courses, learner, now), "Learning progress · Outpost");

/** The day it is dated by: midnight at the start of the day it was written out. */
export const progressDay = (now: number) => {
  const day = new Date(now);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate());
};

// ── On the print kit ────────────────────────────────────────────────────────

/** Whether the kit's typeface can write every name and title in the record. */
export const kitCanWriteProgress = (courses: LearningCourse[], learner: string | null): boolean =>
  [
    learner ?? "",
    ...courses.flatMap((course) => [course.learner, course.title, course.last.title, ...course.topics.map((topic) => topic.title)]),
  ].every((text) => kitCanWrite(text));

/** A bar of `done` out of `of`, in a colour, on a pale track: `width` by `height` points. */
export function progressBar(done: number, of: number, width: number, colour: string, height = 9): string {
  const share = of > 0 ? Math.min(1, Math.max(0, done / of)) : 0;
  const filled = share * width;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${height / 2}" fill="${C.shade}" stroke="${C.rule}" stroke-width="0.5"/>${
    filled > 0
      ? `<rect x="0" y="0" width="${Math.max(height, filled).toFixed(2)}" height="${height}" rx="${height / 2}" fill="${colour}"/>`
      : ""
  }</svg>`;
}

const BAR = 150;
const TIME = 92;

/** One course: its name and where they got to, a bar of the opened pages marked done, the time, and a bar for each topic. */
function courseBlock(course: LearningCourse): Content {
  const topics = course.topics.map(
    (topic): Content =>
      ({
        columns: [
          { width: "*", text: printable(topic.title), fontSize: T.small + 0.5, margin: [12, 0, 0, 0] },
          { width: BAR, svg: progressBar(topic.done, topic.listed, BAR, C.know, 6), margin: [0, 2.5, 0, 0] },
          { width: TIME, text: `${topic.done} of ${topic.listed} done`, fontSize: T.small, color: C.know },
        ],
        columnGap: 10,
        margin: [0, 2, 0, 0],
      }) as Content,
  );
  return {
    stack: [
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: printable(course.title), bold: true, fontSize: 10.5 },
              { text: printable(`Got to “${course.last.title}”, ${shortDate.format(course.last.at)}`), fontSize: T.small, color: C.muted },
            ],
          },
          {
            width: BAR,
            stack: [
              { svg: progressBar(course.pagesDone, course.pagesOpened, BAR, C.accent), margin: [0, 3, 0, 2] },
              { text: `${course.pagesDone} of ${course.pagesOpened} pages opened done`, fontSize: T.small, color: C.muted },
            ],
          },
          {
            width: TIME,
            stack: [
              { text: aboutTime(course.secondsThisWeek), bold: true, fontSize: 9 },
              { text: "this week", fontSize: T.small, color: C.muted },
              { text: `${aboutTime(course.secondsInAll)} in all`, fontSize: T.small, color: C.muted },
            ],
          },
        ],
        columnGap: 10,
      },
      ...(topics.length > 0 ? [{ text: "Topics", fontSize: T.small, bold: true, color: C.know, margin: [12, 5, 0, 0] }, ...topics] : []),
    ],
    unbreakable: true,
    margin: [0, 7, 0, 7],
  } as Content;
}

const hairline = (measure: number): Content => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 0.4, lineColor: C.rule }],
});

export function progressKitDocument(
  courses: LearningCourse[],
  learner: string | null,
  now: number,
  paper: PrintPaper,
): TDocumentDefinitions {
  const measure = measureOf(paper);
  const content: Content[] = [
    { text: "Learning progress", fontSize: 8, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: printable(learner === null ? "Everyone" : learnerLabel(learner)), fontSize: 22, bold: true, margin: [0, 2, 0, 2] },
    {
      text: `Written out on ${longDate.format(now)}: ${courses.length} ${courses.length === 1 ? "course" : "courses"} in the reference collections.`,
      color: C.muted,
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 8, 0, 6] },
  ];
  const learners = [...new Set(courses.map((course) => course.learner))];
  for (const name of learners) {
    const theirs = courses.filter((course) => course.learner === name);
    if (learner === null) content.push(heading(printable(learnerLabel(name))));
    theirs.forEach((course, index) => {
      if (index > 0) content.push(hairline(measure));
      content.push(courseBlock(course));
    });
  }
  content.push(
    callout("know", "What this records", [
      para(
        "What Outpost's reader recorded: the pages each learner opened in the reference collections, those they marked done or whose video they watched to the end, and the time those pages were on screen.",
      ),
      para(
        "“Done in” a topic counts the pages a topic page links to inside the same collection, leaving out the links every page carries. It is shown only where the reader could read such a list.",
      ),
    ]),
    note("A name is chosen on the device and proves nothing about who was holding it."),
  );
  return printDocument({
    paper,
    title: progressTitle(learner, now),
    made: progressDay(now),
    footerName: "Learning progress",
    footerRight: `Written out ${longDate.format(now)}`,
    parts: [{ kind: "plain", content }],
  });
}
