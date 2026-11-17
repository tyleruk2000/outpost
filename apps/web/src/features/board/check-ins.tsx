/**
 * Check-ins: each person's latest in a strip at the top, so that "is everyone all
 * right?" is one glance, and one press to check in: "I'm safe", "I need help", or words
 * of your own with a place and, where the browser gives it, a position.
 *
 * A position is asked of the browser only when the person ticks it, and only on a secure
 * page; on a plain http page the browser has no way to give it, and the screen says so
 * and where to set up HTTPS.
 */
import type { BoardCheckInInput, BoardSummaryResponse, CheckInStatus } from "@outpost/shared";
import { CircleAlert, MapPin, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox, Segmented, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useClockStyle } from "@/lib/clock";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { currentPosition, positionAvailable, useCheckIn } from "./data";
import { checkInWords, needsHelp } from "./words";

export function CheckInStrip({ summary }: { summary: BoardSummaryResponse | undefined }) {
  useClockStyle();
  if (!summary) return <Skeleton className="h-16" />;
  if (summary.checkIns.length === 0) {
    return <p className="text-small text-ink-muted">No one has checked in yet. A check-in shows here, with the newest from each person.</p>;
  }
  const now = Date.now();
  return (
    <ul aria-label="Latest check-ins" className="divide-y divide-border border-y border-border">
      {summary.checkIns.map((line) => {
        const help = needsHelp(line, now);
        const fresh = line.latest && line.latest.status === "safe" && !checkInWords(line, now).startsWith("no check-in");
        return (
          <li key={line.name} className="flex items-baseline gap-2 py-2">
            {help ? (
              <CircleAlert aria-hidden className="size-4 shrink-0 translate-y-0.5 text-danger" />
            ) : fresh ? (
              <ShieldCheck aria-hidden className="size-4 shrink-0 translate-y-0.5 text-success" />
            ) : (
              <MapPin aria-hidden className="size-4 shrink-0 translate-y-0.5 text-ink-muted" />
            )}
            <p className={cn("min-w-0 break-words", help ? "text-danger" : "text-ink")}>
              <span className="font-semibold">{line.name}:</span>{" "}
              <span className={cn(!line.latest && "text-ink-muted")}>{checkInWords(line, now)}</span>
              {line.latest?.hasPosition ? <span className="text-ink-muted"> (with a position)</span> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

const said: Record<CheckInStatus, string> = {
  safe: "You checked in as safe.",
  help: "You checked in as needing help.",
  other: "You checked in.",
};

/** The place field and the two one-press check-ins, with "More" for words of your own and a position. */
export function CheckInControls({ name }: { name: string }) {
  const checkIn = useCheckIn();
  const [place, setPlace] = useState("");
  const [more, setMore] = useState(false);

  const send = (input: Omit<BoardCheckInInput, "author">, after?: () => void) =>
    checkIn.mutate(
      { author: name, ...input },
      {
        onSuccess: () => {
          toast.success(said[input.status]);
          setPlace("");
          after?.();
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );

  const quick = (status: CheckInStatus) => (event?: FormEvent) => {
    event?.preventDefault();
    send({ status, place: place.trim() || null });
  };

  return (
    <>
      <form onSubmit={quick("safe")} className="mt-4 grid gap-3">
        <Field label="Where you are, in a few words" optional hint="For example “gone to Mum's” or “at work”. Goes with the check-in.">
          {(ids) => <Input {...ids} value={place} maxLength={120} onChange={(event) => setPlace(event.target.value)} autoComplete="off" />}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="lg" loading={checkIn.isPending && checkIn.variables?.status === "safe"}>
            <ShieldCheck aria-hidden /> I'm safe
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="text-danger"
            onClick={() => quick("help")()}
            loading={checkIn.isPending && checkIn.variables?.status === "help"}
          >
            <CircleAlert aria-hidden /> I need help
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setMore(true)}>
            Words of my own…
          </Button>
        </div>
      </form>
      {/* Outside the form above: a submit inside a dialog would otherwise reach it too, through the portal. */}
      <CheckInDialog
        open={more}
        onOpenChange={setMore}
        initialPlace={place}
        pending={checkIn.isPending}
        onSend={(input) => send(input, () => setMore(false))}
      />
    </>
  );
}

function CheckInDialog({
  open,
  onOpenChange,
  initialPlace,
  pending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPlace: string;
  pending: boolean;
  onSend: (input: Omit<BoardCheckInInput, "author">) => void;
}) {
  const [status, setStatus] = useState<CheckInStatus>("other");
  const [words, setWords] = useState("");
  const [place, setPlace] = useState(initialPlace);
  const [withPosition, setWithPosition] = useState(false);
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const secure = positionAvailable();

  const reset = (next: boolean) => {
    if (next) {
      setPlace(initialPlace);
      setProblem(null);
    } else {
      setWords("");
      setStatus("other");
      setWithPosition(false);
    }
    onOpenChange(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (status === "other" && !words.trim()) {
      setProblem("Write a few words, or choose Safe or Need help.");
      return;
    }
    let position = null;
    if (withPosition && secure) {
      setFinding(true);
      try {
        position = await currentPosition();
      } catch (error) {
        setFinding(false);
        setProblem(`${errorMessage(error)} Untick the position to check in without it.`);
        return;
      }
      setFinding(false);
    }
    onSend({ status, body: words.trim(), place: place.trim() || null, position });
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent title="Check in" description="Goes on the board for everyone in the household, and in the strip at the top.">
        <form onSubmit={(event) => void submit(event)}>
          <DialogBody className="grid gap-4">
            <Segmented
              label="How you are"
              value={status}
              onChange={setStatus}
              options={[
                { value: "safe", label: "Safe" },
                { value: "help", label: "Need help" },
                { value: "other", label: "Just my words" },
              ]}
            />
            <Field label="Your words" optional={status !== "other"}>
              {(ids) => <Textarea {...ids} value={words} maxLength={2000} rows={3} onChange={(event) => setWords(event.target.value)} />}
            </Field>
            <Field label="Where you are, in a few words" optional>
              {(ids) => (
                <Input {...ids} value={place} maxLength={120} onChange={(event) => setPlace(event.target.value)} autoComplete="off" />
              )}
            </Field>
            {secure ? (
              <div className="flex items-start gap-3 text-small text-ink">
                <span className="grid size-11 shrink-0 place-content-center md:size-6">
                  <Checkbox id="board-position" checked={withPosition} onCheckedChange={(next) => setWithPosition(next === true)} />
                </span>
                <label htmlFor="board-position" className="pt-2.5 md:pt-0.5">
                  Add this device's position. The browser will ask first. Anyone on the home network can see it on the board.
                </label>
              </div>
            ) : (
              <p className="text-small text-ink-muted">
                A position can only be added on a secure page, and this page was opened over plain http, so the browser does not offer it.{" "}
                <Link to="/settings#https" className="text-primary underline underline-offset-2">
                  Settings, HTTPS on your network
                </Link>{" "}
                sets that up. The place in words still goes with the check-in.
              </p>
            )}
            {problem ? (
              <p role="alert" className="text-small text-danger">
                {problem}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => reset(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending || finding}>
              {finding ? "Finding the position" : "Check in"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
