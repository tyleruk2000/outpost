/**
 * The offline drill: what would stop working if the internet went off now. First, a line
 * for each thing the household would need, read from what Outpost holds (and, for this
 * phone, what it keeps), each held, missing or out of date with a link to the screen that
 * fixes it. Then the drill itself: steps to follow with the internet off, answered on a
 * phone, and the result kept here. Nothing is fetched from outside.
 */
import type { DrillLine, DrillState } from "@outpost/shared";
import { DRILL_STEPS } from "@outpost/shared";
import { CircleAlert, CircleCheck, CircleDashed, Clock3 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { useDeviceName } from "@/features/board/data";
import { ForHousehold } from "@/features/households/for-household";
import { keepingSupported, useKept } from "@/features/kept/store";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn, formatDate, plural } from "@/lib/utils";
import { useOfflineDrill, useRecordDrill } from "./data";
import { DrillSteps, setDrillProgress, useDrillProgress } from "./drill-steps";

const STATE: Record<DrillState, { words: string; icon: typeof CircleCheck; tone: string }> = {
  held: { words: "Held", icon: CircleCheck, tone: "text-success" },
  missing: { words: "Missing", icon: CircleAlert, tone: "text-danger" },
  stale: { words: "Out of date", icon: Clock3, tone: "text-warning" },
  untried: { words: "Not checked", icon: CircleDashed, tone: "text-ink-muted" },
};

/** This phone's own line: what it keeps, from the browser's own record. */
export function thisDeviceLine(supported: boolean, kept: Array<{ kind: string }> | undefined): DrillLine {
  const link = { to: "/kept", label: "On this device" };
  if (!supported)
    return {
      id: "this-device",
      title: "What this device keeps",
      state: "missing",
      summary: "Nothing: this page is not on HTTPS, so this browser cannot keep anything for when the server is out of reach.",
      link: { to: "/settings#https", label: "Settings, HTTPS on your network" },
    };
  if (!kept) return { id: "this-device", title: "What this device keeps", state: "untried", summary: "Reading what is kept…", link };
  const count = (kind: string) => kept.filter((item) => item.kind === kind).length;
  const parts = [
    count("area") > 0 ? plural(count("area"), "map area") : null,
    count("plan") > 0 ? plural(count("plan"), "plan") : null,
    count("note") > 0 ? plural(count("note"), "page") : null,
  ].filter(Boolean);
  return parts.length > 0
    ? { id: "this-device", title: "What this device keeps", state: "held", summary: `${parts.join(", ")}.`, link }
    : { id: "this-device", title: "What this device keeps", state: "missing", summary: "Nothing is kept on this device yet.", link };
}

function LineRow({ line }: { line: DrillLine }) {
  const state = STATE[line.state];
  const Icon = state.icon;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon aria-hidden className={cn("mt-1 size-4 shrink-0", state.tone)} />
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink">
          <span className="font-medium">{line.title}</span> <span className={cn("text-small", state.tone)}>{state.words}</span>
        </p>
        <p className="text-small text-ink-muted">
          {line.summary}{" "}
          {line.link && line.state !== "held" ? (
            <Link to={line.link.to} className="text-primary underline underline-offset-2">
              {line.link.label}
            </Link>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function KeepResult() {
  const name = useDeviceName();
  const progress = useDrillProgress();
  const record = useRecordDrill();
  const [notes, setNotes] = useState(progress?.notes ?? "");
  const answered = Object.keys(progress?.answers ?? {}).length;
  if (!progress || answered === 0) return null;
  const failed = DRILL_STEPS.filter((step) => progress.answers[step.id] === "failed").length;

  const keep = () =>
    record.mutate(
      { by: name ?? "Someone", startedAt: progress.startedAt, answers: progress.answers, notes },
      {
        onSuccess: () => {
          setDrillProgress(null);
          setNotes("");
          toast.success("The drill's result is kept.");
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );

  return (
    <div className="mt-6 grid gap-3">
      <p className="text-body text-ink">
        {answered} of {DRILL_STEPS.length} steps answered{failed > 0 ? `, ${failed} did not work` : ""}.
      </p>
      <Field label="What to put right" optional>
        {(ids) => (
          <Textarea
            {...ids}
            rows={3}
            value={notes}
            maxLength={4000}
            onChange={(event) => {
              setNotes(event.target.value);
              setDrillProgress({ ...progress, notes: event.target.value });
            }}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={keep} loading={record.isPending}>
          Keep the result
        </Button>
        <Button variant="secondary" onClick={() => setDrillProgress(null)}>
          Start again
        </Button>
      </div>
    </div>
  );
}

export default function DrillPage() {
  const drill = useOfflineDrill();
  const kept = useKept();
  const supported = keepingSupported();
  const lines = drill.data ? [...drill.data.lines] : [];
  // This device's line goes after the server's "what each phone holds".
  const phones = lines.findIndex((line) => line.id === "phones");
  if (drill.data) lines.splice(phones >= 0 ? phones + 1 : lines.length, 0, thisDeviceLine(supported, kept));
  const missing = lines.filter((line) => line.state === "missing" || line.state === "stale").length;
  const last = drill.data?.lastRun;

  return (
    <Page width="reading">
      <PageHeader
        title="Offline drill"
        description="What would stop working if the internet went off now: what this household has kept, against what Outpost can do without it. Then a drill to follow with the internet off."
      />
      <ForHousehold className="-mt-6 mb-6" />

      <Section
        title="What Outpost holds"
        description={
          drill.data ? (missing > 0 ? `${plural(missing, "thing")} missing or out of date.` : "Everything here is held.") : undefined
        }
      >
        {drill.isPending ? (
          <Skeleton className="h-72" />
        ) : drill.isError ? (
          <ErrorState error={drill.error} onRetry={() => void drill.refetch()} />
        ) : (
          <Rows aria-label="What Outpost holds">
            {lines.map((line) => (
              <LineRow key={line.id} line={line} />
            ))}
          </Rows>
        )}
      </Section>

      <Section
        title="The drill"
        description="Follow it on a phone, with the internet off. The answers are kept on that phone as you go, also with the server out of reach; keep the result here when everything is back on."
      >
        {last ? (
          <p className="mb-3 text-small text-ink-muted">
            Last done {formatDate(last.finishedAt)} by {last.by}:{" "}
            {Object.values(last.answers).filter((answer) => answer === "worked").length} worked,{" "}
            {Object.values(last.answers).filter((answer) => answer === "failed").length} did not.
            {last.notes ? ` “${last.notes}”` : ""}
          </p>
        ) : null}
        <DrillSteps />
        <KeepResult />
      </Section>

      <Notice tone="info" className="mt-10">
        This screen reads only what Outpost holds and what this browser keeps; it fetches nothing. The status screen under Settings is about
        the machine itself: its storage, temperature and power.
      </Notice>
    </Page>
  );
}
