/**
 * Clearing barometer readings: all of them, those before a day, or those between two
 * days. The count is stated before the press, the readings can be saved as a CSV file
 * first, and nothing but readings is removed. Days are the device's own calendar days.
 */
import { inReadingsRange, type PressureReading, type ReadingsRange } from "@outpost/shared";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatDate, plural } from "@/lib/utils";
import { readingsExportUrl, useClearReadings } from "./data";

type Choice = "all" | "before" | "between";

/** "2026-11-16" for a date input, in the device's own time. */
const dayInput = (at: number) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/** The start of a calendar day in the device's time, `days` after the one given; null for no day. */
function startOfDay(value: string, days = 0): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days).getTime();
}

/** The range a choice and its days make, or a sentence saying what is missing. */
export function rangeOf(choice: Choice, before: string, from: string, to: string): ReadingsRange | string {
  if (choice === "all") return { range: "all" };
  if (choice === "before") {
    const at = startOfDay(before);
    return at === null ? "Choose the day." : { range: "before", before: at };
  }
  const start = startOfDay(from);
  const end = startOfDay(to, 1);
  if (start === null || end === null) return "Choose the first and the last day.";
  if (start >= end) return "The first day must not be after the last.";
  return { range: "between", from: start, to: end };
}

export function ClearReadingsDialog({ readings, onClose }: { readings: PressureReading[]; onClose: () => void }) {
  const clear = useClearReadings();
  const first = readings[0]?.takenAt ?? Date.now();
  const last = readings.at(-1)?.takenAt ?? Date.now();
  const [choice, setChoice] = useState<Choice>("all");
  const [before, setBefore] = useState(() => dayInput(last));
  const [from, setFrom] = useState(() => dayInput(first));
  const [to, setTo] = useState(() => dayInput(last));
  const [error, setError] = useState<string | null>(null);

  const range = rangeOf(choice, before, from, to);
  const count = typeof range === "string" ? 0 : readings.filter((reading) => inReadingsRange(reading.takenAt, range)).length;
  const day = (value: string) => formatDate(startOfDay(value) ?? 0);
  const which = choice === "before" ? ` taken before ${day(before)}` : choice === "between" ? ` taken from ${day(from)} to ${day(to)}` : "";
  const question =
    typeof range === "string"
      ? range
      : count === 0
        ? "No reading is in that range."
        : `Remove ${choice === "all" && count > 1 ? "all " : ""}${plural(count, "reading")}${which}? This cannot be undone.`;

  const run = () => {
    if (typeof range === "string" || count === 0) return;
    setError(null);
    clear.mutate(
      { range, expected: count },
      {
        onSuccess: (result) => {
          toast.success(`${plural(result.removed, "reading")} removed.`);
          onClose();
        },
        onError: (failure) => setError(errorMessage(failure)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Clear readings"
        description="Removes barometer readings from this server, for every device. Saved places and fetched forecasts are not touched."
      >
        <DialogBody className="grid gap-4">
          <Segmented<Choice>
            label="Which readings"
            value={choice}
            onChange={(next) => {
              setChoice(next);
              setError(null);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "before", label: "Before a day" },
              { value: "between", label: "Between two days" },
            ]}
          />
          {choice === "before" ? (
            <Field label="Remove readings taken before" hint="Readings on this day are kept.">
              {(ids) => <Input {...ids} type="date" value={before} onChange={(event) => setBefore(event.target.value)} />}
            </Field>
          ) : null}
          {choice === "between" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From">
                {(ids) => <Input {...ids} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />}
              </Field>
              <Field label="To" hint="Both days are included.">
                {(ids) => <Input {...ids} type="date" value={to} onChange={(event) => setTo(event.target.value)} />}
              </Field>
            </div>
          ) : null}
          <p className="text-body text-ink" role="status" data-testid="clear-question">
            {question}
          </p>
          {typeof range !== "string" && count > 0 ? (
            <div>
              <Button asChild variant="secondary">
                <a href={readingsExportUrl(range)} download>
                  <Download />
                  Save {count === 1 ? "it" : "them"} as a CSV file first
                </a>
              </Button>
              <p className="mt-1 text-small text-ink-muted">Bring in a CSV file reads it back, as it was.</p>
            </div>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={typeof range === "string" || count === 0} loading={clear.isPending} onClick={run}>
            {count > 0 ? `Remove ${plural(count, "reading")}` : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
