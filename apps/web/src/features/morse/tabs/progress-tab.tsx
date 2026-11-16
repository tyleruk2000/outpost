/**
 * Progress: the trainer's kept history. Accuracy over time for each kind of practice,
 * how far through the Koch lessons it is, the bests, and the characters that keep
 * getting away. There are no accounts, so it is one history for this copy of Outpost,
 * and "Start again" clears it for everyone.
 */
import { KOCH_LESSON_COUNT, KOCH_ORDER, lessonCharset } from "@outpost/shared";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Progress, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatDateTime, plural } from "@/lib/utils";
import { useClearMorse, useKochLesson, useMorse } from "../data";
import { AccuracyChart, KIND_LABELS } from "./progress-chart";

const SHARED_LINE = "Progress here is shared by everyone who uses this copy of Outpost: there are no accounts.";
const RECENT = 20;
const TABLE_ROWS = 50;

const pct = (accuracy: number) => `${Math.round(accuracy * 100)}%`;

export function ProgressTab() {
  const morse = useMorse();
  const lesson = useKochLesson();
  const clear = useClearMorse();
  const [confirming, setConfirming] = useState(false);
  const data = morse.data;
  const sessions = useMemo(() => data?.sessions ?? [], [data]);

  const weak = useMemo(() => {
    const entries = Object.entries(data?.weakChars ?? {})
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const most = entries[0]?.[1] ?? 1;
    return entries.map(([char, count]) => ({ char, count, share: count / most }));
  }, [data]);

  if (morse.isPending) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-16" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  // A failed read must not pass for an empty history: there could be months of sessions behind it.
  if (morse.isError || !data) {
    return <ErrorState error={morse.error} onRetry={() => void morse.refetch()} />;
  }

  const learned = lessonCharset(lesson).length;
  const recent = sessions.slice(0, RECENT);
  const recentAverage = recent.length > 0 ? recent.reduce((sum, s) => sum + s.accuracy, 0) / recent.length : null;
  const sessionCount = Math.max(data.sessionCount, sessions.length);
  const hasSettings = Object.keys(data.progress.settings).length > 0;
  const somethingToClear = sessionCount > 0 || lesson > 1 || hasSettings;
  const best = data.progress.bestCharWpm;

  const lessonPart = (
    <Section title="Koch lesson">
      <p className="tabular text-body text-ink">
        Lesson {lesson} of {KOCH_LESSON_COUNT}: {learned} of {KOCH_ORDER.length} characters met so far.
      </p>
      <Progress value={lesson / KOCH_LESSON_COUNT} label={`Koch lesson ${lesson} of ${KOCH_LESSON_COUNT}`} className="mt-2 max-w-md" />
    </Section>
  );

  const startAgain = somethingToClear ? (
    <Section
      title="Start again"
      description="Back to lesson 1 with the first settings, and no practice sessions kept. For everyone who uses this copy of Outpost."
    >
      <Button variant="danger-ghost" onClick={() => setConfirming(true)}>
        <RotateCcw aria-hidden /> Start again
      </Button>
      {clear.isError ? (
        <Notice tone="danger" title="Nothing was cleared" className="mt-3">
          {errorMessage(clear.error)}
        </Notice>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Start the Morse trainer again?"
        description={
          <>
            This forgets the Koch lesson (lesson {lesson}), the trainer's settings, here and on the server, and{" "}
            {plural(sessionCount, "practice session")}. It is the same for everyone who uses this copy of Outpost, and it cannot be undone.
          </>
        }
        confirmLabel="Start again"
        loading={clear.isPending}
        onConfirm={() => clear.mutate(undefined, { onSettled: () => setConfirming(false) })}
      />
    </Section>
  ) : null;

  if (sessions.length === 0) {
    return (
      <div className="space-y-10">
        <p className="text-small text-ink-muted">{SHARED_LINE}</p>
        {lessonPart}
        <EmptyState
          title="No practice sessions yet"
          action={
            // The first step, not only a description of it: new learners start with Koch lesson 1.
            <Button asChild variant="primary">
              <Link to="?tab=receive">Start lesson {lesson}</Link>
            </Button>
          }
        >
          Finish a drill on Receive, or check your sending on Send, and your history builds up here.
        </EmptyState>
        {startAgain}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p className="text-small text-ink-muted">{SHARED_LINE}</p>

      <section>
        {lessonPart}
        <p className="tabular mt-3 text-body text-ink">
          {plural(sessionCount, "practice session")} kept.
          {recentAverage !== null
            ? ` ${pct(recentAverage)} accuracy on average over the last ${recent.length === 1 ? "session" : plural(recent.length, "session")}.`
            : ""}
          {best ? ` Best copy speed ${Math.round(best)} wpm.` : ""}
        </p>
      </section>

      <Section title="Accuracy over time" description="Every graded session, by kind. At 90% a Koch lesson moves on.">
        <AccuracyChart sessions={sessions} />
        {sessionCount > sessions.length ? (
          <p className="tabular mt-2 text-small text-ink-muted">The most recent {plural(sessions.length, "session")} are drawn.</p>
        ) : null}
      </Section>

      {weak.length > 0 ? (
        <Section
          title="Characters that get away"
          description="Misses counted across every kept session. These come up in new drills more often."
        >
          <ul className="max-w-xl space-y-1.5" aria-label="Characters missed most">
            {weak.map(({ char, count, share }) => (
              <li key={char} className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-3">
                <span className="font-mono text-body font-semibold text-ink">{char}</span>
                <span aria-hidden className="h-3">
                  <span
                    className="block h-full rounded-r-[4px]"
                    style={{ width: `${Math.max(2, share * 100)}%`, background: "var(--chart-1)" }}
                  />
                </span>
                <span className="tabular text-right text-small text-ink">{plural(count, "miss", "misses")}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <details className="group">
        <summary className="min-h-11 cursor-pointer py-2 text-body font-medium text-ink md:min-h-0">
          The {sessions.length > TABLE_ROWS ? `${TABLE_ROWS} most recent sessions` : "sessions"} as a table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tabular w-full text-left text-small">
            <thead>
              <tr className="border-b border-border-strong text-ink-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  When
                </th>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  Kind
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  Accuracy
                </th>
                <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                  Speed
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, TABLE_ROWS).map((session) => (
                <tr key={session.id} className="border-b border-border text-ink">
                  <td className="py-1.5 pr-3">{formatDateTime(session.at)}</td>
                  <td className="px-3 py-1.5">{KIND_LABELS[session.kind]}</td>
                  <td className="px-3 py-1.5 text-right">{pct(session.accuracy)}</td>
                  <td className="py-1.5 pl-3 text-right whitespace-nowrap">
                    {session.charWpm ? `${Math.round(session.charWpm)} wpm` : "No speed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {startAgain}
    </div>
  );
}
