import type { DeviceCheck, DeviceCheckGroup, DeviceCheckState, DeviceStatus, EventLoopDelay } from "@outpost/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleDashed, CircleHelp, CircleX, RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { Disclosure, ErrorState, JumpLinks, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatTimeOfDay } from "@/lib/clock";
import { cn, formatDateTime, plural } from "@/lib/utils";
import { DEVICE } from "../kept/device";
import { type ClockReading, clockIsWrong, offsetSentence, useServerClock } from "./clock";
import { SET_CLOCK, useSetClock } from "./clock-notice";

export const STATUS_PATH = "/settings/status";
export const STATUS_TITLE = "Server status";

const STATES: Record<
  DeviceCheckState,
  { word: string; tone: "success" | "warning" | "danger" | "neutral"; icon: typeof CircleCheck; colour: string }
> = {
  good: { word: "Fine", tone: "success", icon: CircleCheck, colour: "text-success" },
  attention: { word: "Needs attention", tone: "warning", icon: CircleAlert, colour: "text-warning" },
  problem: { word: "Problem", tone: "danger", icon: CircleX, colour: "text-danger" },
  unknown: { word: "Not reported", tone: "neutral", icon: CircleHelp, colour: "text-ink-muted" },
  unchecked: { word: "Not checked yet", tone: "neutral", icon: CircleDashed, colour: "text-ink-muted" },
};

const GROUPS: Array<{ id: DeviceCheckGroup; title: string; description: string }> = [
  { id: "storage", title: "Storage", description: "Each place Outpost keeps files, and the room left on it." },
  { id: "data", title: "Your data", description: "The database that holds pages, places and library records, and its backup." },
  { id: "device", title: "The computer", description: "The machine Outpost runs on, as far as its system says." },
  { id: "work", title: "Work", description: "What Outpost is doing in the background, and whether anything has held it up." },
];

/** "Everything is fine." or "2 things need attention, 1 problem." */
export function overallSentence(checks: Array<Pick<DeviceCheck, "state">>): string {
  const problems = checks.filter((check) => check.state === "problem").length;
  const attention = checks.filter((check) => check.state === "attention").length;
  const unchecked = checks.filter((check) => check.state === "unchecked").length;
  // Something not checked yet is not called fine.
  const notChecked = unchecked > 0 ? ` ${unchecked === 1 ? "1 thing is" : `${unchecked} things are`} not checked yet.` : "";
  if (problems === 0 && attention === 0) return unchecked > 0 ? `Nothing needs attention.${notChecked}` : "Everything is fine.";
  const parts = [
    problems > 0 ? `${plural(problems, "problem")}` : null,
    attention > 0 ? `${attention} ${attention === 1 ? "thing needs" : "things need"} attention` : null,
  ].filter(Boolean);
  return `${parts.join(", ")}.${notChecked}`.replace(/^./, (first) => first.toUpperCase());
}

/** The line for the clock, worked out here: only the browser knows the time it should be. */
export function clockCheck(reading: ClockReading): DeviceCheck {
  const { setting } = reading.server;
  const wrong = clockIsWrong(reading.offsetMs);
  return {
    id: "clock",
    group: "device",
    title: "Clock",
    state: wrong ? "attention" : "good",
    summary: wrong
      ? `${offsetSentence(reading.offsetMs)} It says ${formatDateTime(reading.server.now)}.`
      : `Agrees with this ${DEVICE}'s to within a minute.`,
    advice: wrong ? (setting.allowed ? null : setting.reason) : null,
    link: null,
  };
}

function CheckRow({ check, action }: { check: DeviceCheck; action?: ReactNode }) {
  const state = STATES[check.state];
  return (
    <li id={`check-${check.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4">
      <state.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", state.colour)} strokeWidth={1.6} />
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-body font-semibold text-ink">{check.title}</h3>
          <Badge tone={state.tone}>{state.word}</Badge>
        </div>
        <p className="mt-1 text-small text-ink">{check.summary}</p>
        {check.advice ? <p className="mt-1 text-small text-ink-muted">{check.advice}</p> : null}
        {action || check.link ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {action}
            {check.link ? (
              <Link
                to={check.link.to}
                className="inline-flex min-h-11 items-center text-small text-primary underline underline-offset-2 md:min-h-6"
              >
                Open {check.link.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Under the sentence, the lines that need something done, as links to them: on a phone the backup that needs
 * attention is three screens down, under storage that is fine.
 */
function NeedsALook({ checks }: { checks: DeviceCheck[] }) {
  const needing = checks.filter((check) => check.state === "problem" || check.state === "attention");
  if (needing.length === 0) return null;
  return (
    <JumpLinks
      label="What needs attention"
      items={needing.map((check) => ({ id: `check-${check.id}`, label: check.title }))}
      className="mt-1 mb-0"
    />
  );
}

/** The minutes the event-loop delay was measured, as a table: the worst and the mean hold-up in each. */
function DelayTable({ eventLoop }: { eventLoop: EventLoopDelay }) {
  if (eventLoop.minutes.length === 0) return null;
  return (
    <Disclosure summary="The hold-ups, minute by minute" className="mt-3">
      {eventLoop.worst ? (
        <p className="mb-2 text-small text-ink-muted">
          The worst since the server started: <span className="tabular text-ink">{eventLoop.worst.ms} ms</span>, at{" "}
          {formatDateTime(eventLoop.worst.at)}.
        </p>
      ) : null}
      <Table label="The hold-ups, minute by minute">
        <TableHead>
          <Tr>
            <Th>Minute</Th>
            <Th numeric>Worst</Th>
            <Th numeric>Mean</Th>
          </Tr>
        </TableHead>
        <tbody>
          {[...eventLoop.minutes].reverse().map((minute) => (
            <Tr key={minute.at}>
              <Td className="tabular">{formatTimeOfDay(minute.at)}</Td>
              <Td numeric>{minute.worstMs} ms</Td>
              <Td numeric>{minute.meanMs} ms</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Disclosure>
  );
}

/** How long the screen asks again, every two seconds, for the database check it started to be over. */
const CHECK_WAIT_MS = 120_000;

export default function StatusPage() {
  // Set while a database check started here is running: the screen asks again until the line is no longer unchecked.
  const [checkingSince, setCheckingSince] = useState<number | null>(null);
  const status = useQuery({
    queryKey: ["device", "status"],
    queryFn: () => api.get<DeviceStatus>("/api/device/status"),
    refetchInterval: (query) => {
      if (checkingSince === null || Date.now() - checkingSince > CHECK_WAIT_MS) return false;
      const database = query.state.data?.checks.find((check) => check.id === "database");
      return database?.state === "unchecked" ? 2000 : false;
    },
  });
  const checkDatabase = useMutation({
    mutationFn: () => api.post("/api/database/check", { kind: "quick" }),
    onSuccess: () => setCheckingSince(Date.now()),
  });
  const databaseChecking =
    checkDatabase.isPending ||
    (checkingSince !== null &&
      Date.now() - checkingSince <= CHECK_WAIT_MS &&
      status.data?.checks.find((check) => check.id === "database")?.state === "unchecked");
  const clock = useServerClock();
  const setClock = useSetClock();

  const clockLine = clock.data ? clockCheck(clock.data) : null;
  const checks = status.data ? [...status.data.checks, ...(clockLine ? [clockLine] : [])] : [];

  return (
    <Page width="reading">
      <PageHeader
        title={STATUS_TITLE}
        description="How the computer Outpost runs on is doing, in plain words, and what to do when something needs it."
        actions={
          <Button onClick={() => void Promise.all([status.refetch(), clock.refetch()])} loading={status.isFetching}>
            <RefreshCw /> Check again
          </Button>
        }
      />
      {status.isPending ? (
        <div className="grid gap-4" aria-busy>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <>
          <div className="mb-8">
            <p className="text-lead text-ink">
              {overallSentence(checks)}{" "}
              <span className="text-small text-ink-muted">Checked at {formatTimeOfDay(status.data.checkedAt)}.</span>
            </p>
            <NeedsALook checks={checks} />
          </div>
          {GROUPS.map((group) => {
            const inGroup = checks.filter((check) => check.group === group.id);
            if (inGroup.length === 0) return null;
            return (
              <Section key={group.id} title={group.title} description={group.description}>
                <Rows>
                  {inGroup.map((check) => (
                    <CheckRow
                      key={check.id}
                      check={check}
                      action={
                        check.id === "clock" && check.state !== "good" && clock.data?.server.setting.allowed ? (
                          <Button size="sm" variant="primary" onClick={() => setClock.mutate()} loading={setClock.isPending}>
                            {SET_CLOCK}
                          </Button>
                        ) : check.id === "database" && check.state === "unchecked" ? (
                          <Button size="sm" onClick={() => checkDatabase.mutate()} loading={Boolean(databaseChecking)}>
                            {databaseChecking ? "Checking" : "Check now"}
                          </Button>
                        ) : undefined
                      }
                    />
                  ))}
                </Rows>
                {group.id === "work" ? <DelayTable eventLoop={status.data.eventLoop} /> : null}
              </Section>
            );
          })}
        </>
      )}
    </Page>
  );
}
