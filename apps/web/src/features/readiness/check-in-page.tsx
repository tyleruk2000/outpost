/**
 * Check-in and roll call: one press to say "I'm safe" or "I need help" (the board's own
 * check-in, which also goes by radio where a mesh link is set up), and the roll call:
 * everyone's latest check-in with its age, who has not checked in since a time chosen,
 * and a way to ask everyone to check in. Works on the home network with no internet.
 *
 * Check-ins are the board's (Messages), so this screen reads and refreshes under the
 * board's keys and posts through the board's routes; nothing is kept twice.
 */
import type { RollCallLine } from "@outpost/shared";
import { CircleAlert, Megaphone, ShieldCheck, UserRound } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Segmented, Skeleton } from "@/components/ui/misc";
import { CheckInControls } from "@/features/board/check-ins";
import { ChooseName } from "@/features/board/compose";
import { useBoardSummary, useDeviceName } from "@/features/board/data";
import { useMesh } from "@/features/mesh/data";
import { errorMessage } from "@/lib/api";
import { useClockStyle } from "@/lib/clock";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useAskRollCall, useRollCall } from "./data";
import { fromLocalInput, localInput, rollCallWords, sinceWords } from "./words";

type Since = "ask" | "hour" | "today" | "chosen";

function sinceTime(choice: Since, chosen: string): number | null {
  if (choice === "hour") return Date.now() - 60 * 60 * 1000;
  if (choice === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  if (choice === "chosen") return fromLocalInput(chosen);
  return null;
}

function RollCallRow({ line, now }: { line: RollCallLine; now: number }) {
  const help = line.latest?.status === "help" && line.answered;
  return (
    <li className="flex items-start gap-3 py-3">
      {help ? (
        <CircleAlert aria-hidden className="mt-1 size-4 shrink-0 text-danger" />
      ) : line.answered ? (
        <ShieldCheck aria-hidden className="mt-1 size-4 shrink-0 text-success" />
      ) : (
        <UserRound aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("break-words", help ? "text-danger" : "text-ink")}>
          <span className="font-semibold">{line.name}</span>
          {line.answered ? null : <span className="text-ink-muted"> · no check-in since then</span>}
        </p>
        <p className={cn("break-words text-small", line.latest ? "text-ink-muted" : "text-ink-faint")}>{rollCallWords(line, now)}</p>
      </div>
    </li>
  );
}

function AskDialog({ open, onOpenChange, name }: { open: boolean; onOpenChange: (open: boolean) => void; name: string }) {
  const ask = useAskRollCall();
  const mesh = useMesh();
  const channels = mesh.data?.channels ?? [];
  const [note, setNote] = useState("");
  const [radio, setRadio] = useState<string[]>([]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask.mutate(
      { by: name, note: note.trim(), alsoOn: radio },
      {
        onSuccess: (result) => {
          toast.success(
            result.refused.length > 0
              ? `Asked on the board. It could not go on ${result.refused.map((entry) => entry.channel).join(", ")}: ${result.refused[0]!.reason}`
              : "Everyone was asked to check in.",
          );
          setNote("");
          onOpenChange(false);
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Ask everyone to check in"
        description="Posts “Roll call: please check in” on the board under your name, and the roll call counts from now. It does not wake a locked phone: people see it when they next open Outpost."
      >
        <form onSubmit={submit}>
          <DialogBody className="grid gap-4">
            <Field label="A line to go with it" optional hint="For example “Power is off, meet in the kitchen”.">
              {(ids) => (
                <Input {...ids} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} autoComplete="off" />
              )}
            </Field>
            {channels.length > 0 ? (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-small font-medium text-ink">Also by radio</legend>
                {channels.map((channel) => (
                  <div key={channel.id} className="flex items-center gap-3 text-small text-ink">
                    <span className="grid size-11 shrink-0 place-content-center md:size-6">
                      <Checkbox
                        id={`ask-${channel.id}`}
                        checked={radio.includes(channel.id)}
                        onCheckedChange={(next) =>
                          setRadio((current) => (next === true ? [...current, channel.id] : current.filter((id) => id !== channel.id)))
                        }
                      />
                    </span>
                    <label htmlFor={`ask-${channel.id}`}>
                      {channel.label}
                      {channel.linkUp ? "" : " (the link is down: it goes when it is back)"}
                    </label>
                  </div>
                ))}
              </fieldset>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={ask.isPending}>
              Ask everyone
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CheckInPage() {
  useClockStyle();
  const name = useDeviceName();
  const [renaming, setRenaming] = useState(false);
  const [asking, setAsking] = useState(false);
  const [since, setSince] = useState<Since>("ask");
  const [chosen, setChosen] = useState(() => localInput(Date.now() - 2 * 60 * 60 * 1000));
  const summary = useBoardSummary();
  const sinceAt = useMemo(() => sinceTime(since, chosen), [since, chosen]);
  // A time chosen in the field and not yet a time asks for nothing.
  const roll = useRollCall(since === "chosen" && sinceAt === null ? null : sinceAt);
  const now = Date.now();
  const lastAsk = roll.data?.asks[0];
  const missing = roll.data?.lines.filter((line) => !line.answered) ?? [];

  return (
    <Page width="reading">
      <PageHeader
        title="Check-in and roll call"
        description="Say you are safe or need help with one press, and see who has checked in since a time you choose. Over the home network, with no internet; by radio too where a mesh link is set up."
        actions={
          name ? (
            <Button variant="primary" onClick={() => setAsking(true)}>
              <Megaphone aria-hidden /> Ask everyone to check in
            </Button>
          ) : null
        }
      />

      {name === null || renaming ? (
        <Section
          title={name === null ? "Who is using this device?" : "Change the name on this device"}
          description="Kept on this device only, and shown beside your check-ins. The same name as on Messages."
        >
          <ChooseName people={summary.data?.people ?? []} current={name} onDone={name === null ? undefined : () => setRenaming(false)} />
        </Section>
      ) : (
        <Section title="Check in" description={`From this device as ${name}.`}>
          <Button variant="link" size="sm" className="-mt-2" onClick={() => setRenaming(true)}>
            Not {name}? Change the name
          </Button>
          <CheckInControls name={name} />
        </Section>
      )}

      <Section
        title="Roll call"
        description={
          roll.data
            ? `${roll.data.answered} of ${roll.data.lines.length} checked in since ${sinceWords(roll.data.since, now)}${
                since === "ask" && lastAsk ? `, when ${lastAsk.askedBy} asked` : ""
              }.`
            : undefined
        }
      >
        <div className="grid gap-3">
          <Segmented
            label="Count check-ins since"
            value={since}
            onChange={setSince}
            options={[
              { value: "ask", label: lastAsk ? "The last ask" : "A day ago" },
              { value: "hour", label: "An hour ago" },
              { value: "today", label: "Midnight" },
              { value: "chosen", label: "A time…" },
            ]}
          />
          {since === "chosen" ? (
            <Field label="Since">
              {(ids) => (
                <Input
                  {...ids}
                  type="datetime-local"
                  value={chosen}
                  max={localInput(now)}
                  onChange={(event) => setChosen(event.target.value)}
                />
              )}
            </Field>
          ) : null}
        </div>

        {roll.isPending ? (
          <Skeleton className="mt-4 h-40" />
        ) : roll.isError ? (
          <div className="mt-4">
            <ErrorState error={roll.error} onRetry={() => void roll.refetch()} />
          </div>
        ) : roll.data.lines.length === 0 ? (
          <EmptyState
            compact
            level={3}
            title="No one to count yet"
            action={
              <Button asChild variant="primary">
                <Link to="/prepare/supplies?view=household">Add the household</Link>
              </Button>
            }
          >
            The roll call lists the household under Supplies and the people of the emergency plans, and anyone who has checked in.
          </EmptyState>
        ) : (
          <>
            {missing.length > 0 && missing.length < roll.data.lines.length ? (
              <p className="mt-4 text-body text-ink">
                Not checked in since then: <span className="font-semibold">{missing.map((line) => line.name).join(", ")}</span>.
              </p>
            ) : null}
            <Rows aria-label="Roll call" className="mt-4">
              {roll.data.lines.map((line) => (
                <RollCallRow key={line.name} line={line} now={now} />
              ))}
            </Rows>
          </>
        )}
      </Section>

      <Notice tone="info" className="mt-10">
        Outpost cannot wake a locked phone or send a notification. A check-in or an ask is seen when someone next opens Outpost. Check-ins
        are kept on{" "}
        <Link to="/messages" className="text-primary underline underline-offset-2">
          Messages
        </Link>
        , with everything else on the board.
      </Notice>

      {name ? <AskDialog open={asking} onOpenChange={setAsking} name={name} /> : null}
    </Page>
  );
}
