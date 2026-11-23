import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-control border border-border-strong bg-page px-3 text-body text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-danger";

/**
 * For a row that holds a borderless search field and its icon (in a popover, a dialog, the command palette):
 * the field draws no outline of its own, so the row takes the fields' full-strength 2 px focus ring, inside its
 * edges so a rounded or clipped container does not cut it off. Only the field lights the row: a button beside it
 * (clear, close) shows its own ring. Never drop the field's outline without this.
 */
export const searchRowFocus = "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-focus has-[input:focus-visible]:ring-inset";

export function Input({ className, ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(control, "h-9 max-md:h-11 md:pointer-coarse:h-11", className)} {...props} />;
}

export function Textarea({ className, ref, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(control, "min-h-20 py-2 leading-6", className)} {...props} />;
}

/**
 * A labelled control with optional help and error text, wired together for assistive
 * technology. `children` receives the ids to put on the control.
 */
export function Field({
  label,
  optional,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  /** Says "optional" after the label, in words, for a field that may be left empty in a form where others may not. */
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (ids: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    // One column that may be narrower than the control's words: a select whose choice is long cuts it short instead
    // of holding the field, and the form round it, wider than a phone's screen when the text is large.
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-1.5", className)}>
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
        {optional ? <span className="font-normal text-ink-muted"> (optional)</span> : null}
      </label>
      {children({
        id,
        "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-small text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
