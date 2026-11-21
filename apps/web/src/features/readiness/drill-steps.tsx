/**
 * The offline drill's steps, answered on this device: each "worked" or "did not work".
 * The answers are kept in this browser (localStorage) as they are given, so the list
 * goes on with the router switched off and the server out of reach; the result is sent
 * to Outpost with "Keep the result" once it is back. Nothing here asks the server.
 */
import { DRILL_STEPS } from "@outpost/shared";
import { Check, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DrillAnswers = Record<string, "worked" | "failed">;
export interface DrillProgress {
  startedAt: number;
  answers: DrillAnswers;
  notes: string;
}

const KEY = "outpost.readiness.drill";
const listeners = new Set<() => void>();
let memory: string | null = null;

function read(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

let cachedRaw: string | null | undefined;
let cached: DrillProgress | null = null;

/** The drill under way on this device, or null when none is. */
export function drillProgress(): DrillProgress | null {
  const raw = read();
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as DrillProgress) : null;
    cached = parsed && typeof parsed.startedAt === "number" && parsed.answers ? { ...parsed, notes: parsed.notes ?? "" } : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function setDrillProgress(next: DrillProgress | null): void {
  const raw = next ? JSON.stringify(next) : null;
  memory = raw;
  try {
    if (raw) localStorage.setItem(KEY, raw);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage refused: kept for this visit only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => event.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const useDrillProgress = () => useSyncExternalStore(subscribe, drillProgress, () => null);

/** Answers a step; a second press of the same answer takes it back. */
export function answerStep(id: string, answer: "worked" | "failed", now = Date.now()): void {
  const current = drillProgress() ?? { startedAt: now, answers: {}, notes: "" };
  const answers = { ...current.answers };
  if (answers[id] === answer) delete answers[id];
  else answers[id] = answer;
  setDrillProgress({ ...current, answers });
}

export function DrillSteps({ className }: { className?: string }) {
  const progress = useDrillProgress();
  const answers = progress?.answers ?? {};
  return (
    <ol aria-label="The drill" className={cn("divide-y divide-border border-y border-border", className)}>
      {DRILL_STEPS.map((step, index) => {
        const answer = answers[step.id];
        return (
          <li key={step.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
            <span className="tabular w-6 shrink-0 pt-px text-small text-ink-muted">{index + 1}.</span>
            <div className="min-w-0 flex-1 basis-56">
              <p className={cn("text-body", answer === "failed" ? "text-danger" : "text-ink")}>{step.text}</p>
              {step.hint ? <p className="text-small text-ink-muted">{step.hint}</p> : null}
              {answer ? (
                <p className={cn("text-small", answer === "worked" ? "text-success" : "text-danger")}>
                  {answer === "worked" ? "Worked" : "Did not work"}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant={answer === "worked" ? "primary" : "secondary"}
                aria-pressed={answer === "worked"}
                aria-label={`Step ${index + 1} worked`}
                onClick={() => answerStep(step.id, "worked")}
              >
                <Check aria-hidden /> Worked
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className={cn(answer === "failed" && "text-danger")}
                aria-pressed={answer === "failed"}
                aria-label={`Step ${index + 1} did not work`}
                onClick={() => answerStep(step.id, "failed")}
              >
                <X aria-hidden /> Did not
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
