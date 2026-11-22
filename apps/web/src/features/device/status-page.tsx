import type { DeviceCheck, DeviceCheckGroup, DeviceCheckState, DeviceStatus, EventLoopDelay } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleHelp, CircleX, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Disclosure, ErrorState, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/misc";
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
  if (problems === 0 && attention === 0) return "Everything is fine.";
  const parts = [
    problems > 0 ? `${plural(problems, "problem")}` : null,
    attention > 0 ? `${attention} ${attention === 1 ? "thing needs" : "things need"} attention` : null,
  ].filter(Boolean);
  return `${parts.join(", ")}.`.replace(/^./, (first) => first.toUpperCase());
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
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4">
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
      <table className="w-full text-small">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-1 pr-4 font-medium">Minute</th>
            <th className="py-1 pr-4 text-right font-medium">Worst</th>
            <th className="py-1 text-right font-medium">Mean</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {[...eventLoop.minutes].reverse().map((minute) => (
            <tr key={minute.at}>
              <td className="py-1 pr-4">{formatTimeOfDay(minute.at)}</td>
              <td className="tabular py-1 pr-4 text-right">{minute.worstMs} ms</td>
              <td className="tabular py-1 text-right">{minute.meanMs} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Disclosure>
  );
}

export default function StatusPage() {
  const status = useQuery({
    queryKey: ["device", "status"],
    queryFn: () => api.get<DeviceStatus>("/api/device/status"),
  });
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
          <Button onClick={() => void Promise.all([status.refetch(), clock.refetch()])} disabled={status.isFetching}>
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
          <p className="mb-8 text-lead text-ink">
            {overallSentence(checks)}{" "}
            <span className="text-small text-ink-muted">Checked at {formatTimeOfDay(status.data.checkedAt)}.</span>
          </p>
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
                          <Button size="sm" variant="primary" onClick={() => setClock.mutate()} disabled={setClock.isPending}>
                            {SET_CLOCK}
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
