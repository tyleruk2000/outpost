/**
 * The few input pieces the power calculators are built from, kept in this one file.
 *
 * Another branch is making a shared kit for calculator inputs
 * (features/tools/kit/). These are deliberately plain (Outpost's own `Field`, `Input`
 * and `Select`) and each does one job, so that switching to the shared kit is a matter
 * of changing the imports here and in the calculators: `NumberField` is a labelled
 * number with its unit, `ChoiceField` a labelled drop-down, `Answer` one figure in a
 * sentence, `Basis` the formula and its source behind a disclosure, and
 * `CalculatorGroup` one calculator in the list.
 */
import { ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Reads a number as people type it: "1,5" and "1.5" are both one and a half; anything else is nothing. */
export function readNumber(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "" || !/^-?\d*\.?\d*(e-?\d+)?$/i.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** A figure written for a person: at most `digits` decimals, without trailing noughts. */
export function figure(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "–";
  const rounded = Number(value.toFixed(digits));
  return rounded.toLocaleString("en-GB", { maximumFractionDigits: digits });
}

/**
 * A number with a label and a unit. Holds what is typed as text, so that "1." or an
 * empty field can be on the way to a number; tells the parent the number, or null.
 */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  hint,
  min,
  max,
  className,
  placeholder,
}: {
  label: ReactNode;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: ReactNode;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const sent = useRef(value);
  // A change from outside (a preset, a reset) replaces what is shown; the value this field sent itself does not.
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value === null ? "" : String(value));
    }
  }, [value]);
  const number = readNumber(text);
  const error =
    text.trim() !== "" && number === null
      ? "Type a number."
      : number !== null && min !== undefined && number < min
        ? `At least ${min}.`
        : number !== null && max !== undefined && number > max
          ? `At most ${max}.`
          : undefined;
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(ids) => (
        <div className="relative">
          <Input
            {...ids}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            onChange={(event) => {
              setText(event.target.value);
              const next = readNumber(event.target.value);
              const fits = next === null || ((min === undefined || next >= min) && (max === undefined || next <= max));
              sent.current = fits ? next : null;
              onChange(sent.current);
            }}
            className={cn("tabular", unit && "pr-14")}
          />
          {unit ? (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-small text-ink-muted">
              {unit}
            </span>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** A per cent typed as 0 to 100 and held as a share, 0 to 1. */
export function PercentField({
  value,
  onChange,
  ...props
}: Omit<Parameters<typeof NumberField>[0], "value" | "onChange" | "unit" | "min" | "max"> & {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <NumberField
      {...props}
      unit="%"
      min={0}
      max={100}
      value={value === null ? null : Number((value * 100).toFixed(4))}
      onChange={(next) => onChange(next === null ? null : next / 100)}
    />
  );
}

export function ChoiceField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: {
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; description?: ReactNode }>;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(ids) => <Select {...ids} value={value} onChange={onChange} options={options} />}
    </Field>
  );
}

/** One answer: a label, the figure, and what it means. */
export function Answer({ label, children, detail }: { label: ReactNode; children: ReactNode; detail?: ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="min-w-0">
        <span className="tabular text-lead text-ink">{children}</span>
        {detail ? <span className="mt-0.5 block text-small text-ink-muted">{detail}</span> : null}
      </dd>
    </div>
  );
}

/** The answers of a calculator, or a line saying what is missing for there to be any. */
export function Answers({ children, missing }: { children: ReactNode; missing?: string | null }) {
  return (
    <div aria-live="polite" className="mt-4 rounded-panel bg-surface px-4 py-2">
      {missing ? <p className="py-2 text-small text-ink-muted">{missing}</p> : <dl className="divide-y divide-border">{children}</dl>}
    </div>
  );
}

/** The formula, its source, the range it is good for and what it leaves out. */
export function Basis({ children, summary = "How this is worked out" }: { children: ReactNode; summary?: string }) {
  return (
    <details className="group mt-3 text-small">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-primary md:min-h-8 md:pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="mt-1 grid max-w-[70ch] gap-2 pl-5.5 text-ink">{children}</div>
    </details>
  );
}

/** One calculator in the list: its name and what it is for, opening to the calculator itself. */
export function CalculatorGroup({ title, about, children, id }: { title: string; about: string; children: ReactNode; id: string }) {
  return (
    <li>
      <details id={id} className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-lead text-ink group-hover:text-primary">{title}</span>
            <span className="mt-0.5 block text-small text-ink-muted">{about}</span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-90" />
        </summary>
        <div className="pb-6">{children}</div>
      </details>
    </li>
  );
}

/** Fields side by side where there is room, one above another on a phone. */
export function Fields({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid items-start gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

/** Empties a calculator's fields. */
export function ClearButton({ onClear }: { onClear: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClear}>
      Clear
    </Button>
  );
}
