import type { DownloadPlan, Settings } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, Pause, Play, Plus } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { useUpdateSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  formatMegabits,
  LIMIT_PRESETS_KBPS,
  type LimitUnit,
  limitAsTyped,
  limitLabel,
  limitWithMegabits,
  parseLimit,
} from "./charts/speed";
import { planKey, useQueueAction } from "./use-plan";

const MIN_AT_ONCE = 1;
const MAX_AT_ONCE = 8;

type PlanSettings = Pick<DownloadPlan, "concurrency" | "rateLimitBytesPerSecond" | "counts">;

const atOnceWords = (n: number) => (n === 1 ? "one transfer at a time" : `${n} transfers together`);

/** A typed speed limit with its unit. Opens when "Other…" is chosen; nothing is saved until "Set limit". */
function TypedLimit({
  kbps,
  saving,
  onSet,
  onCancel,
}: {
  kbps: number;
  saving: boolean;
  onSet: (kbps: number) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const start = limitAsTyped(kbps);
  const [text, setText] = useState(start.text);
  const [unit, setUnit] = useState<LimitUnit>(start.unit);
  const [problem, setProblem] = useState<string | null>(null);
  const parsed = parseLimit(text, unit);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if ("problem" in parsed) return setProblem(parsed.problem);
    onSet(parsed.kbps);
  };

  return (
    <form onSubmit={submit} className="mt-4 border-t border-border pt-4" noValidate>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <div className="grid gap-1.5">
          <label htmlFor={id} className="text-small font-medium text-ink">
            Limit downloads to
          </label>
          <Input
            id={id}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setProblem(null);
            }}
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${id}-note`}
            className="tabular w-28 text-right"
          />
        </div>
        <Segmented
          label="Unit"
          value={unit}
          onChange={(next) => {
            setUnit(next);
            setProblem(null);
          }}
          options={[
            { value: "kB/s", label: "kB/s" },
            { value: "MB/s", label: "MB/s" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={saving}>
            Set limit
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
      <p
        id={`${id}-note`}
        role={problem ? "alert" : undefined}
        className={cn("tabular mt-2 text-small", problem ? "text-danger" : "text-ink-muted")}
      >
        {problem ??
          ("kbps" in parsed
            ? `That is ${limitWithMegabits(parsed.kbps)}, shared by every transfer.`
            : "Shared by every transfer running at the time.")}
      </p>
    </form>
  );
}

/**
 * The three things a person can steer: how fast, how many at once, and whether the
 * queue runs at all. Each change is saved as it is made and takes effect at once,
 * including on transfers already running.
 */
export function PlanControls({ plan, className }: { plan: PlanSettings; className?: string }) {
  const client = useQueryClient();
  const update = useUpdateSettings();
  const queue = useQueueAction();
  const limitId = useId();
  const onceId = useId();
  const [typing, setTyping] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const kbps = Math.round((plan.rateLimitBytesPerSecond ?? 0) / 1000);
  const atOnce = plan.concurrency;
  const going = plan.counts.active + plan.counts.waiting;

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(null), 6000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const save = (patch: Partial<Settings>, said: string) => {
    setSaved(null);
    update.mutate(patch, {
      onSuccess: ({ settings }) => {
        // The plan is what this screen shows, so it is corrected at once and then asked for again.
        client.setQueryData<DownloadPlan>(planKey, (current) =>
          current
            ? {
                ...current,
                concurrency: settings["downloads.concurrency"],
                rateLimitBytesPerSecond: settings["downloads.rateLimitKbps"] > 0 ? settings["downloads.rateLimitKbps"] * 1000 : null,
              }
            : current,
        );
        void client.invalidateQueries({ queryKey: planKey });
        void client.invalidateQueries({ queryKey: ["downloads", "detail"] });
        setTyping(false);
        setSaved(said);
      },
    });
  };
  const saveLimit = (next: number) =>
    save(
      { "downloads.rateLimitKbps": next },
      next > 0
        ? `Saved. Downloads are limited to ${limitWithMegabits(next)}${plan.counts.active > 0 ? "; transfers already running have slowed to it" : ""}.`
        : "Saved. Downloads run as fast as the connection allows.",
    );
  const saveAtOnce = (next: number) => save({ "downloads.concurrency": next }, `Saved. Downloads run ${atOnceWords(next)}.`);

  const isPreset = (LIMIT_PRESETS_KBPS as readonly number[]).includes(kbps);
  const options = [
    ...LIMIT_PRESETS_KBPS.map((preset) => ({
      value: String(preset),
      label: limitLabel(preset),
      description: preset > 0 ? formatMegabits(preset * 1000) : "As fast as the connection allows",
    })),
    ...(isPreset ? [] : [{ value: String(kbps), label: limitLabel(kbps), description: formatMegabits(kbps * 1000) }]),
    { value: "other", label: "Other…", description: "Type a speed" },
  ];
  const savingLimit = update.isPending && update.variables?.["downloads.rateLimitKbps"] !== undefined;
  const savingAtOnce = update.isPending && update.variables?.["downloads.concurrency"] !== undefined;

  return (
    <div className={cn("border-y border-border py-4", className)}>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div className="grid gap-1.5">
          <label htmlFor={limitId} className="text-small font-medium text-ink">
            Speed limit
          </label>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Select
              id={limitId}
              className="w-40"
              value={typing ? "other" : String(kbps)}
              disabled={savingLimit}
              onChange={(next) => {
                if (next === "other") return setTyping(true);
                setTyping(false);
                if (Number(next) !== kbps) saveLimit(Number(next));
              }}
              options={options}
            />
            <span className="tabular text-small text-ink-muted">
              {typing
                ? `At present: ${kbps > 0 ? limitLabel(kbps) : "no limit"}`
                : kbps > 0
                  ? formatMegabits(kbps * 1000)
                  : "As fast as the connection allows"}
            </span>
          </div>
        </div>

        <div className="grid gap-1.5">
          <span id={onceId} className="text-small font-medium text-ink">
            At once
          </span>
          {/* biome-ignore lint/a11y/useSemanticElements: a stepper is a labelled group of two buttons and a value, not a fieldset */}
          <div role="group" aria-labelledby={onceId} className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-control border border-border-strong">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-r-none"
                aria-label="Run one fewer at once"
                disabled={atOnce <= MIN_AT_ONCE || savingAtOnce}
                onClick={() => saveAtOnce(atOnce - 1)}
              >
                <Minus />
              </Button>
              <output className="tabular w-8 text-center text-body font-medium text-ink" aria-label={`${atOnce} at once`}>
                {atOnce}
              </output>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-l-none"
                aria-label="Run one more at once"
                disabled={atOnce >= MAX_AT_ONCE || savingAtOnce}
                onClick={() => saveAtOnce(atOnce + 1)}
              >
                <Plus />
              </Button>
            </span>
            <span className="text-small text-ink-muted">{atOnce === 1 ? "transfer at a time" : "transfers together"}</span>
          </div>
        </div>

        {going > 0 || plan.counts.paused > 0 ? (
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            {going > 0 ? (
              <Button
                loading={queue.isPending && queue.variables === "pause-all"}
                disabled={queue.isPending}
                onClick={() => queue.mutate("pause-all")}
              >
                {queue.isPending && queue.variables === "pause-all" ? null : <Pause />} Pause all
              </Button>
            ) : null}
            {plan.counts.paused > 0 ? (
              <Button
                loading={queue.isPending && queue.variables === "resume-all"}
                disabled={queue.isPending}
                onClick={() => queue.mutate("resume-all")}
              >
                {queue.isPending && queue.variables === "resume-all" ? null : <Play />} Resume all
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {typing ? <TypedLimit kbps={kbps} saving={savingLimit} onSet={saveLimit} onCancel={() => setTyping(false)} /> : null}

      <p role="status" className={cn("text-small text-ink-muted", saved && "mt-3")}>
        {saved}
      </p>
    </div>
  );
}
