/**
 * Learning progress: where each learner got to in a reference archive (Khan Academy,
 * PhET and every other ZIM archive read in the reader). See docs/learning.md.
 *
 * A learner is a name chosen on a device, or "" for someone who chose "Just me". It is
 * not an account: anyone in the house can choose any name, and everyone can see
 * everyone's progress.
 */

/** The longest name a learner may have. */
export const LEARNER_NAME_MAX = 40;
/** How many different learners Outpost keeps progress for. */
export const LEARNERS_MAX = 50;
/** How many pages are kept for one learner across every archive. */
export const LEARNING_PAGES_MAX = 20_000;
/** The most seconds one write may add: the reader writes at least once a minute while a page is on show. */
export const LEARNING_SECONDS_PER_WRITE_MAX = 120;
/** A page of links counts as listing lessons only with this many links or fewer, and at least two. */
export const TOPIC_LINKS_MAX = 300;

/** The words used for the learner who chose not to give a name. */
export const JUST_ME = "Just me";

/** A learner's name as it is kept: spaces run together, trimmed, cut to length. "" is "Just me". */
export function learnerName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, LEARNER_NAME_MAX);
}

/** How a learner is named on screen and on paper. */
export const learnerLabel = (name: string) => (name === "" ? JUST_ME : name);

export type DoneHow = "marked" | "watched";

/** One page a learner opened. */
export interface LearningPage {
  path: string;
  title: string;
  firstOpenedAt: number;
  lastOpenedAt: number;
  secondsInView: number;
  doneAt: number | null;
  doneHow: DoneHow | null;
  updatedAt: number;
}

/** A page of links the learner has worked from, with how many of the pages it lists they have done. */
export interface LearningTopic {
  path: string;
  title: string;
  /** Pages it links to inside the archive, leaving out the first page's own links. */
  listed: number;
  done: number;
}

/** One learner's progress in one archive. */
export interface LearningCourse {
  learner: string;
  /** The archive's name without its date; progress is kept by this. */
  archive: string;
  title: string;
  /** The installed collection it can be read in now, or null when it is not installed. */
  collectionId: string | null;
  /** Where they got to: the page recorded last. */
  last: { path: string; title: string; at: number };
  pagesOpened: number;
  pagesDone: number;
  secondsThisWeek: number;
  secondsInAll: number;
  /** Only the topic pages whose lists could be read; empty when the archive's shape is not known. */
  topics: LearningTopic[];
}

export interface LearnerSummary {
  name: string;
  courses: number;
  pages: number;
  lastAt: number;
}

export interface LearnersResponse {
  /** Everyone with progress kept, the most recent first. */
  learners: LearnerSummary[];
  /** The household's people as Outpost holds them elsewhere (Supplies, emergency plans), to choose from. */
  household: string[];
}

export interface LearningProgressResponse {
  courses: LearningCourse[];
  /** When "this week" began: Monday at midnight, by the server's clock. */
  weekFrom: number;
}

/** A page being left, hidden, or still on show after a minute. */
export interface LearningVisitInput {
  learner: string;
  collectionId: string;
  path: string;
  title: string;
  /** Seconds it was in view since the last write for it. */
  seconds: number;
  /** The first write of this visit: the page was opened. */
  opened: boolean;
}

export interface LearningDoneInput {
  learner: string;
  collectionId: string;
  path: string;
  title: string;
  done: boolean;
  how?: DoneHow;
}

export interface LearningTopicInput {
  collectionId: string;
  path: string;
  title: string;
  links: string[];
  /** The page the reader showed for the archive's own first address. */
  home: boolean;
}

export interface LearningPageResponse {
  page: LearningPage | null;
}

/** What learning progress holds: counted for "Manage and clean up" and erased with everything else. */
export interface LearningKept {
  learners: number;
  pages: number;
}

/** Seconds as a person says them: "about 2 hours", "about 25 minutes", "under a minute". */
export function aboutTime(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? "under a minute" : "no time";
  const minutes = Math.round(seconds / 60);
  if (minutes < 55) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const halves = Math.round(seconds / 1800) / 2;
  if (halves < 1.25) return "about an hour";
  if (halves === 1.5) return "about an hour and a half";
  const whole = Number.isInteger(halves) ? String(halves) : `${Math.floor(halves)} and a half`;
  return `about ${whole} hours`;
}
