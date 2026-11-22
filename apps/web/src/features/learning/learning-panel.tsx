/**
 * The Library's Learning tab: for the learner chosen, or for everyone, the courses they
 * have opened in the reference collections, where they got to, how many pages are done
 * and how long they spent this week. Printable, for a household that wants a record on
 * paper. See docs/learning.md.
 */
import { aboutTime, type LearningCourse, learnerLabel } from "@outpost/shared";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Joined, Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { deviceRegion, likelyPaperFor } from "@/lib/region";
import { plural, timeAgo } from "@/lib/utils";
import { readerAt, useProgress } from "./data";
import { useLearningDevice } from "./device";
import { WhoseSwitch } from "./learner-switch";
import { progressKitDocument, progressTitle, topicsWords } from "./progress-document";
import { choose } from "./reader-controls";

function Facts({ parts }: { parts: ReactNode[] }) {
  return (
    <p className="mt-0.5 text-small text-ink-muted">
      <Joined parts={parts} />
    </p>
  );
}

/** One learner's progress in one course. `heading` is what the row is named by: the course, or the learner. */
function CourseRow({ course, heading }: { course: LearningCourse; heading: "course" | "learner" }) {
  const topics = topicsWords(course);
  const name = learnerLabel(course.learner);
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5">
      <div className="min-w-0 flex-1 basis-64">
        <h3 className="font-title text-lead text-ink">{heading === "course" ? course.title : name}</h3>
        <p className="mt-0.5 text-small text-ink">
          Got to “{course.last.title}”, {timeAgo(course.last.at)}
        </p>
        <Facts
          parts={[
            <span key="opened" className="tabular">
              {plural(course.pagesOpened, "page")} opened
            </span>,
            <span key="done" className="tabular">
              {course.pagesDone} done
            </span>,
            course.secondsThisWeek === 0 ? "not opened this week" : `${aboutTime(course.secondsThisWeek)} this week`,
          ]}
        />
        {topics ? <p className="mt-1 text-small text-ink-muted">{topics}</p> : null}
        {course.collectionId ? null : (
          <p className="mt-1 text-small text-ink-muted">
            Not installed now. The progress is kept, and carries on if it is installed again.
          </p>
        )}
      </div>
      {course.collectionId ? (
        <Button asChild size="sm">
          <Link
            to={readerAt(course.collectionId, course.last.path)}
            onClick={() => choose(course.learner)}
            aria-label={`Carry on where ${name} left off in ${course.title}: ${course.last.title}`}
          >
            Carry on
          </Link>
        </Button>
      ) : null}
    </li>
  );
}

function Loading() {
  return (
    <ul className="mt-5 divide-y divide-border border-y border-border" aria-busy aria-label="Loading progress">
      {[0, 1, 2].map((row) => (
        <li key={row} className="grid gap-2 py-4" aria-hidden>
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-3.5 w-80 max-w-[80%]" />
        </li>
      ))}
    </ul>
  );
}

export default function LearningPanel() {
  const device = useLearningDevice();
  // This device's learner first; everyone where no one has been chosen here.
  const [whose, setWhose] = useState<string | null>(() => device.learner);
  const progress = useProgress(whose === null ? { everyone: true } : { learner: whose });
  const [now] = useState(() => Date.now());
  const courses = progress.data?.courses ?? [];
  // Made on this device with the print kit.
  const make = useCallback(() => progressKitDocument(courses, whose, now, likelyPaperFor(deviceRegion())), [courses, whose, now]);
  const made = useKitPdf(courses.length > 0 ? make : null, {
    title: progressTitle(whose, now),
    kind: "Learning progress",
    from: { what: "the Library's learning progress", path: "/library?tab=learning" },
  });
  const byCourse = useMemo(() => {
    const groups = new Map<string, LearningCourse[]>();
    for (const course of courses) groups.set(course.archive, [...(groups.get(course.archive) ?? []), course]);
    return [...groups.values()];
  }, [courses]);

  const deviceLine = !device.recording
    ? "Recording is off on this device: the reader keeps nothing here until it is turned on again from its bar."
    : device.learner === null
      ? "No one has said who is learning on this device, so nothing is recorded here yet. Choose a name in the reader's bar."
      : `This device records progress for ${learnerLabel(device.learner)}.`;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <WhoseSwitch value={whose} onChange={setWhose} />
        <p className="min-w-0 flex-1 basis-64 text-small text-ink-muted">{deviceLine}</p>
      </div>
      <p className="mt-3 max-w-[70ch] text-small text-ink-muted">
        Where each learner got to in the reference collections, as the reader recorded it. Anyone in the house can see everyone's progress,
        and a name is not proof of who was holding the device. It is not searched and never sent to a model.
      </p>

      {progress.isPending ? (
        <Loading />
      ) : progress.isError ? (
        <div className="mt-6">
          <ErrorState error={progress.error} onRetry={() => progress.refetch()} />
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          title={whose === null ? "No progress recorded yet" : `Nothing recorded for ${learnerLabel(whose)} yet`}
          seed={14}
          compact
          className="mt-6"
          action={
            <Button asChild variant="primary">
              <Link to="/library?tab=collections">Open a collection</Link>
            </Button>
          }
        >
          Open a course such as Khan Academy or PhET from Collections, and choose who is learning in the reader's bar. The pages opened, and
          those marked done, are listed here.
        </EmptyState>
      ) : whose !== null ? (
        <Rows className="mt-5" aria-label={`Courses ${learnerLabel(whose)} has opened`}>
          {courses.map((course) => (
            <CourseRow key={course.archive} course={course} heading="course" />
          ))}
        </Rows>
      ) : (
        byCourse.map((group) => (
          <section key={group[0]!.archive} className="mt-7 first-of-type:mt-5" aria-labelledby={`learning-${group[0]!.archive}`}>
            <h2 id={`learning-${group[0]!.archive}`} className="mb-2 text-lead font-semibold text-ink">
              {group[0]!.title}
            </h2>
            <Rows>
              {group.map((course) => (
                <CourseRow key={course.learner} course={course} heading="learner" />
              ))}
            </Rows>
          </section>
        ))
      )}

      {courses.length > 0 ? (
        <Section className="mt-8" title="On paper" description="A record of what has been covered, as a PDF to print or keep.">
          {made.status === "making" ? <p className="mb-3 text-small text-ink-muted">Making the PDF…</p> : null}
          {made.status === "failed" ? (
            <Notice tone="danger" className="mb-3">
              The PDF could not be made: {made.error}
            </Notice>
          ) : null}
          <PdfActions
            pdf={kitPdfOf(made)}
            confirm={{
              title: "Add this record to the library?",
              description:
                "Progress itself is kept out of search. A PDF in the library is searched like any other document, goes into every backup and onto portable drives, and does not change when the progress does.",
            }}
          />
        </Section>
      ) : null}
    </div>
  );
}
