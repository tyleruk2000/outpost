import { type ReactNode, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid gap-x-10 gap-y-4 border-t border-border py-8 first:border-t-0 first:pt-0 lg:grid-cols-[15rem_1fr]"
    >
      <div>
        <h2 id={`${id}-title`} className="text-lead font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-small text-ink-muted">{description}</p> : null}
      </div>
      <div className="grid max-w-[40rem] gap-5">{children}</div>
    </section>
  );
}

export function SettingRow({
  label,
  hint,
  control,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  control: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-48 flex-1">
        <label htmlFor={htmlFor} className="text-small font-medium text-ink">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-small text-ink-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** A text field that saves when the person leaves it or presses Enter. */
export function TextSetting({
  id,
  value,
  disabled,
  onSave,
  placeholder,
  mono,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onSave: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      id={id}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
      className={mono ? "w-72 max-w-full font-mono text-small" : "w-72 max-w-full"}
    />
  );
}

/** A number field that saves when the person leaves it or presses Enter, and reverts if invalid. */
export function NumberSetting({
  id,
  value,
  min,
  max,
  disabled,
  onSave,
  unit,
  decimals = false,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onSave: (value: number) => void;
  unit?: string;
  /** Accept one decimal place (a weight such as 1.5) instead of whole numbers only. */
  decimals?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const typed = Number(draft);
    const parsed = decimals ? Math.round(typed * 10) / 10 : typed;
    if (draft.trim() === "" || !Number.isFinite(typed) || (!decimals && !Number.isInteger(typed)) || parsed < min || parsed > max) {
      return setDraft(String(value));
    }
    if (parsed !== typed) setDraft(String(parsed));
    if (parsed !== value) onSave(parsed);
  };
  return (
    <span className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode={decimals ? "decimal" : "numeric"}
        step={decimals ? 0.1 : 1}
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
        className="tabular w-24 text-right"
      />
      {unit ? <span className="w-16 text-small text-ink-muted">{unit}</span> : null}
    </span>
  );
}
