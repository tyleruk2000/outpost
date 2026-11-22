import { SETUP_GUIDE_PATH } from "@outpost/shared";
import { ChevronRight } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
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
      // Reached at /settings#id: on a phone it comes to rest below the top bar, not under it.
      className="@container scroll-mt-14 border-t border-border py-8 first:border-t-0 first:pt-0 md:scroll-mt-0"
    >
      {/* Two columns by the room the section has, not the window's width: with the text at 200% on a wide window the
          settings were squeezed to a word a line beside a 15rem column of titles (WCAG 1.4.4, 1.4.10). */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-4 @2xl:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <h2 id={`${id}-title`} className="text-lead font-semibold text-ink">
            {title}
          </h2>
          {description ? <p className="mt-1 text-small text-ink-muted">{description}</p> : null}
        </div>
        <div className="grid max-w-[40rem] grid-cols-[minmax(0,1fr)] gap-5">{children}</div>
      </div>
    </section>
  );
}

/** The id of the hint of the row a control is in, so that the control is described by it. */
const RowHint = createContext<string | undefined>(undefined);

/** What a control in a row is described by: its row's hint, then anything of its own (a unit, an error). */
function describedBy(hint: string | undefined, ...own: Array<string | false | undefined>): string | undefined {
  return [hint, ...own].filter(Boolean).join(" ") || undefined;
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
  const hintId = useId();
  const controlArea = useRef<HTMLDivElement>(null);
  // The hint says what the setting does, so a screen reader reads it with the control, not only when read line by line
  // (WCAG 1.3.1). The fields below take it from RowHint; any other control (a switch, a choice of several, a button)
  // is described by it here.
  useEffect(() => {
    if (!hint) return;
    const target =
      (htmlFor ? document.getElementById(htmlFor) : null) ??
      controlArea.current?.querySelector('input, select, textarea, button, [role="group"], [role="radiogroup"], [role="switch"]');
    if (!target) return;
    const ids = (target.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    if (!ids.includes(hintId)) target.setAttribute("aria-describedby", [hintId, ...ids].join(" "));
  });
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-[min(12rem,100%)] flex-1">
        <label htmlFor={htmlFor} className="text-small font-medium text-ink">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="mt-0.5 text-small text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
      {/* No wider than the row: on a narrow phone with large text a row of choices then wraps instead of running off the screen. */}
      <div ref={controlArea} className="max-w-full shrink-0">
        <RowHint.Provider value={hint ? hintId : undefined}>{control}</RowHint.Provider>
      </div>
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
  const hint = useContext(RowHint);
  return (
    <Input
      id={id}
      aria-describedby={describedBy(hint)}
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
  // A number out of range is not saved: the field goes back to the value saved, and says why, aloud too (WCAG 3.3.1).
  const [refused, setRefused] = useState<string | null>(null);
  const hint = useContext(RowHint);
  const commit = () => {
    const typed = Number(draft);
    const parsed = decimals ? Math.round(typed * 10) / 10 : typed;
    if (draft.trim() === "" || !Number.isFinite(typed) || (!decimals && !Number.isInteger(typed)) || parsed < min || parsed > max) {
      if (draft.trim() !== String(value)) setRefused(draft.trim() === "" ? "Nothing" : draft.trim());
      return setDraft(String(value));
    }
    setRefused(null);
    if (parsed !== typed) setDraft(String(parsed));
    if (parsed !== value) onSave(parsed);
  };
  const range = `${decimals ? "a number" : "a whole number"} from ${min} to ${max}`;
  return (
    <span className="grid justify-items-end gap-1">
      <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <Input
          id={id}
          aria-describedby={describedBy(hint, unit && `${id}-unit`, refused !== null && `${id}-refused`)}
          aria-invalid={refused !== null || undefined}
          type="number"
          inputMode={decimals ? "decimal" : "numeric"}
          step={decimals ? 0.1 : 1}
          min={min}
          max={max}
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            setRefused(null);
          }}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          className="tabular w-24 text-right"
        />
        {unit ? (
          <span id={`${id}-unit`} className="w-16 text-small text-ink-muted">
            {unit}
          </span>
        ) : null}
      </span>
      {refused !== null ? (
        <span id={`${id}-refused`} role="alert" className="max-w-64 text-right text-small text-danger">
          {`Not saved: ${refused} is not ${range}. It is still ${value}.`}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Everything a section can do beyond its first level, behind one quiet line. What is
 * inside is not drawn, and asks the server for nothing, until the line is opened.
 */
export function MoreOptions({ children, label = "More options" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group border-t border-border" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-default items-center gap-1.5 text-small font-medium text-ink-muted marker:content-none hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-90" />
        {label}
      </summary>
      {open ? <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pt-2 pb-1">{children}</div> : null}
    </details>
  );
}

/** The link from a section to its part of the set-up guide, which is a page inside Outpost. */
export function GuideLink({ part, children = "Set-up guide" }: { part: string; children?: ReactNode }) {
  return (
    <Link to={`${SETUP_GUIDE_PATH}#${part}`} className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2">
      {children}
    </Link>
  );
}
