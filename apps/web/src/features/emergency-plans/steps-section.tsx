/**
 * The plan's steps for before, during and after. Each step says whose words it is: a
 * named source's, as the template gave them; a source's, changed here (with the
 * source's words a press away); or the household's own. Steps of the template that
 * were taken out are listed, and can be put back.
 */
import {
  PLAN_PHASES,
  type PlanPhase,
  type PlanStep,
  sourceById,
  stepStanding,
  stepsTakenOut,
  type TemplateStep,
  termsOf,
} from "@outpost/shared";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { localId, plural } from "@/lib/utils";
import { RowTools, removeAt, replaceAt } from "./list-edit";
import { onlyInWords } from "./words";

export function SourceLine({ source }: { source: string }) {
  const found = sourceById(source);
  if (!found) return <span>From a source no longer listed in Outpost</span>;
  return (
    <span>
      {found.publisher}, “{found.title}”{found.pageDate ? ` (${found.pageDate.charAt(0).toLowerCase()}${found.pageDate.slice(1)})` : ""}
    </span>
  );
}

function Standing({ step }: { step: PlanStep }) {
  const standing = stepStanding(step);
  if (standing.kind === "own") return <p className="mt-1 text-small text-ink-muted">Your own words.</p>;
  if (standing.kind === "pointer")
    return (
      <p className="mt-1 text-small text-ink-muted">
        A pointer, not advice: read the page and put what your household will do in its place, in your own words.
      </p>
    );
  const attribution = termsOf(standing.source)?.attribution;
  return (
    <details className="mt-1 text-small text-ink-muted">
      <summary className="cursor-pointer select-none py-1">
        {standing.kind === "official" ? "From " : "Changed from the words of "}
        <SourceLine source={standing.step.source} />
      </summary>
      <div className="mt-1 grid gap-1.5 pb-1">
        {standing.kind === "changed" ? <p>The template said: “{standing.step.text}”</p> : null}
        <blockquote className="font-title text-ink">“{standing.step.quote}”</blockquote>
        {standing.source ? (
          <p>
            {standing.source.url}, read {standing.source.checked}.
          </p>
        ) : null}
        {attribution ? <p>{attribution}</p> : null}
      </div>
    </details>
  );
}

function Phase({
  phase,
  steps,
  all,
  first,
  onChange,
}: {
  phase: { id: PlanPhase; label: string };
  steps: Array<{ step: PlanStep; at: number }>;
  all: PlanStep[];
  first: boolean;
  onChange: (steps: PlanStep[]) => void;
}) {
  const [draft, setDraft] = useState("");
  // Each phase folds, with its count: a plan's steps run to a long page on a phone. The first starts open there, and
  // every one on a wider screen.
  const [open, setOpen] = useState(() => first || !window.matchMedia?.("(width < 48rem)").matches);
  const add = () => {
    if (!draft.trim()) return;
    onChange([...all, { id: localId(), phase: phase.id, text: draft.trim(), origin: null }]);
    setDraft("");
  };
  /** Moves a step past the next one of the same phase. */
  const shift = (index: number, by: -1 | 1) => {
    const order = steps.map((entry) => entry.at);
    const here = order.indexOf(index);
    const other = order[here + by];
    if (other === undefined) return;
    const next = [...all];
    [next[index], next[other]] = [next[other]!, next[index]!];
    onChange(next);
  };
  return (
    <details className="group mt-6 first:mt-0" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 select-none md:min-h-8 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        <h3 className="text-body font-semibold text-ink">{phase.label}</h3>
        <span className="text-small text-ink-muted">{plural(steps.length, "step")}</span>
      </summary>
      {steps.length === 0 ? <p className="mt-1 text-small text-ink-muted">No steps for {phase.label.toLowerCase()} yet.</p> : null}
      <ol className="mt-2 divide-y divide-border border-y border-border">
        {steps.map(({ step, at }, index) => (
          // With large text on a small phone the step takes the row and its tools go under it, rather than the step
          // being squeezed to a letter's width beside them.
          <li key={step.id} className="flex flex-wrap justify-end gap-x-2 gap-y-1 py-2.5">
            <div className="flex min-w-[min(100%,12rem)] flex-1 gap-2">
              <span className="tabular w-6 shrink-0 pt-2 text-right text-small text-ink-muted">{index + 1}.</span>
              <div className="min-w-0 flex-1">
                <Textarea
                  aria-label={`${phase.label}, step ${index + 1}`}
                  value={step.text}
                  rows={2}
                  className="min-h-0"
                  maxLength={600}
                  onChange={(event) => onChange(replaceAt(all, at, { ...step, text: event.target.value }))}
                />
                <Standing step={step} />
              </div>
            </div>
            <RowTools
              name={step.text.slice(0, 40)}
              first={index === 0}
              last={index === steps.length - 1}
              onMove={(by) => shift(at, by)}
              onRemove={() => onChange(removeAt(all, at))}
            />
          </li>
        ))}
      </ol>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Textarea
          aria-label={`A new step for ${phase.label.toLowerCase()}`}
          placeholder="A step in your own words"
          value={draft}
          rows={1}
          className="min-h-11 flex-1 basis-56"
          maxLength={600}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" disabled={!draft.trim()}>
          Add step
        </Button>
      </form>
    </details>
  );
}

function TakenOut({ out, onPutBack }: { out: TemplateStep[]; onPutBack: (step: TemplateStep) => void }) {
  if (out.length === 0) return null;
  return (
    <details className="mt-6 text-small">
      <summary className="cursor-pointer select-none py-1 text-ink-muted">
        {plural(out.length, "step")} of the template {out.length === 1 ? "was" : "were"} taken out of this plan
      </summary>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {out.map((step) => (
          <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 flex-1 basis-56">
              <span className="block text-ink">{step.text}</span>
              <span className="text-ink-muted">
                {PLAN_PHASES.find((phase) => phase.id === step.phase)?.label}. <SourceLine source={step.source} />
              </span>
              {onlyInWords(step.onlyIn) ? <span className="block text-ink-muted">{onlyInWords(step.onlyIn)}.</span> : null}
            </span>
            <Button onClick={() => onPutBack(step)}>Put back</Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function StepsSection({
  steps,
  templateId,
  onChange,
}: {
  steps: PlanStep[];
  templateId: string | null;
  onChange: (steps: PlanStep[]) => void;
}) {
  const out = stepsTakenOut(templateId, steps);
  return (
    <Section
      title="Steps"
      description="Short, in order, in plain words: someone who did not write this may be reading it by torchlight. Tick them when the plan is in use."
    >
      {PLAN_PHASES.map((phase, index) => (
        <Phase
          key={phase.id}
          phase={phase}
          first={index === 0}
          all={steps}
          onChange={onChange}
          steps={steps.map((step, at) => ({ step, at })).filter(({ step }) => step.phase === phase.id)}
        />
      ))}
      <TakenOut
        out={out}
        onPutBack={(step) => onChange([...steps, { id: localId(), phase: step.phase, text: step.text, origin: step.id }])}
      />
    </Section>
  );
}
