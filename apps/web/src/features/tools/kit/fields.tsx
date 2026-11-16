/**
 * The inputs of a calculator: a figure with its unit, and a choice between a few things.
 * Each remembers, on this device, what was last typed or chosen and in which unit, so a
 * calculator opens as it was left. The answer follows as the person types; there is no
 * button to press.
 */
import { type ReactNode, useCallback, useId, useMemo, useState } from "react";
import { Field } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { readPref, writePref } from "./device-pref";
import { type NumberLimits, readNumber } from "./read-number";
import type { Unit } from "./units";

export interface NumberSpec extends NumberLimits {
  /** Remembered on this device under this name: "water.storage.people". Unique across Tools. */
  id: string;
  label: string;
  /** The figure it starts with, in the first unit of `units`. */
  initial: number | string;
  /** The units offered, the default first. None for a count or a ratio. */
  units?: readonly Unit[];
  /** Said after the figure when there is no unit choice: "%", "people". */
  suffix?: string;
  hint?: ReactNode;
  /** May be left empty: its value is then null and nothing is said to be wrong. */
  optional?: boolean;
}

export interface NumberInput {
  spec: NumberSpec;
  text: string;
  setText: (text: string) => void;
  unit: Unit | undefined;
  setUnit: (id: string) => void;
  /** The figure in the base unit of its quantity, or null while what is typed is not usable. */
  value: number | null;
  error: string | null;
}

interface Stored {
  text: string;
  unit?: string;
}

function readStored(id: string): Stored | null {
  const raw = readPref(`input.${id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stored;
    return typeof parsed.text === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function useNumber(spec: NumberSpec): NumberInput {
  const [state, setState] = useState<Stored>(() => {
    const stored = readStored(spec.id);
    const unitOk = !spec.units || spec.units.some((unit) => unit.id === stored?.unit);
    return stored && unitOk ? stored : { text: String(spec.initial), unit: spec.units?.[0]?.id };
  });
  const save = useCallback(
    (next: Stored) => {
      setState(next);
      writePref(`input.${spec.id}`, JSON.stringify(next));
    },
    [spec.id],
  );
  const unit = spec.units?.find((item) => item.id === state.unit) ?? spec.units?.[0];
  const reading = useMemo(
    () => (spec.optional && state.text.trim() === "" ? ({ ok: false, error: "" } as const) : readNumber(state.text, spec, unit)),
    [state.text, spec, unit],
  );
  return {
    spec,
    text: state.text,
    setText: (text) => save({ ...state, text }),
    unit,
    setUnit: (id) => save({ ...state, unit: id }),
    value: reading.ok ? reading.value : null,
    error: reading.ok || reading.error === "" ? null : reading.error,
  };
}

/** A figure, with its unit beside it and what is wrong with it under it. */
export function NumberField({ input, className }: { input: NumberInput; className?: string }) {
  const { spec } = input;
  const units = spec.units ?? [];
  return (
    <Field label={spec.label} hint={spec.hint} error={input.error} className={className}>
      {(ids) => (
        <div className="flex min-w-0 items-center gap-2">
          <input
            {...ids}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={input.text}
            onChange={(event) => input.setText(event.target.value)}
            className="h-9 w-full min-w-[5rem] flex-1 rounded-control border border-border-strong bg-page px-3 text-body text-ink tabular transition-[border-color,box-shadow] duration-150 placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 aria-invalid:border-danger aria-invalid:ring-danger/25 max-md:h-11"
          />
          {units.length > 2 ? (
            <Select
              aria-label={`Unit for ${spec.label.toLowerCase()}`}
              value={input.unit?.id}
              onChange={input.setUnit}
              options={units.map((unit) => ({ value: unit.id, label: unit.symbol, description: unit.name }))}
              className="w-auto min-w-[5.5rem] shrink-0"
            />
          ) : units.length === 2 ? (
            <Segmented
              label={`Unit for ${spec.label.toLowerCase()}`}
              value={input.unit?.id ?? units[0]!.id}
              onChange={input.setUnit}
              options={units.map((unit) => ({ value: unit.id, label: unit.symbol }))}
              className="shrink-0"
            />
          ) : units.length === 1 ? (
            <span className="shrink-0 text-small text-ink-muted">{units[0]!.symbol}</span>
          ) : spec.suffix ? (
            <span className="shrink-0 text-small text-ink-muted">{spec.suffix}</span>
          ) : null}
        </div>
      )}
    </Field>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** A choice remembered on this device. */
export function useChoice<T extends string>(id: string, options: readonly ChoiceOption<T>[], initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = readPref(`choice.${id}`);
    return options.some((option) => option.value === stored) ? (stored as T) : initial;
  });
  return [
    value,
    (next: T) => {
      setValue(next);
      writePref(`choice.${id}`, next);
    },
  ];
}

/** A choice between things: side by side when there are two or three short ones, a list otherwise. */
export function ChoiceField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  placeholder,
  className,
}: {
  label: string;
  /** Undefined shows the placeholder (a list only). */
  value: T | undefined;
  onChange: (next: T) => void;
  options: readonly ChoiceOption<T>[];
  hint?: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const short = value !== undefined && options.length <= 3 && options.every((option) => option.label.length <= 14 && !option.description);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span id={`${id}-label`} className="text-small font-medium text-ink">
        {label}
      </span>
      {short ? (
        <Segmented
          label={label}
          value={value as T}
          onChange={onChange}
          options={options.map(({ value, label }) => ({ value, label }))}
          className="w-fit max-w-full flex-wrap"
        />
      ) : (
        <Select aria-label={label} value={value} onChange={onChange} options={[...options]} placeholder={placeholder} />
      )}
      {hint ? <p className="text-small text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** Inputs side by side where there is room, one above another on a phone. */
export function Inputs({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

/** The figures of several inputs, or null if any is not usable yet. */
export function allValues<const T extends readonly NumberInput[]>(...inputs: T): { [K in keyof T]: number } | null {
  if (inputs.some((input) => input.value === null)) return null;
  return inputs.map((input) => input.value) as { [K in keyof T]: number };
}

/** A line of text remembered on this device: a place, a list. */
export function useText(id: string, initial: string): [string, (next: string) => void] {
  const [value, setValue] = useState<string>(() => readPref(`text.${id}`) ?? initial);
  return [
    value,
    (next: string) => {
      setValue(next);
      writePref(`text.${id}`, next);
    },
  ];
}
