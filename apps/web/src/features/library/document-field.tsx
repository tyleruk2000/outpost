import { Check } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Follows one save from start to finish, and lets "Saved" fade after a moment. */
export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    status,
    error,
    /** Runs a save. Resolves to true when it worked; on failure the message is kept for showing. */
    async run(save: () => Promise<unknown>): Promise<boolean> {
      window.clearTimeout(timer.current);
      setStatus("saving");
      setError(null);
      try {
        await save();
        setStatus("saved");
        timer.current = window.setTimeout(() => setStatus("idle"), 2500);
        return true;
      } catch (caught) {
        setStatus("error");
        setError(errorMessage(caught));
        return false;
      }
    },
  };
}

/** The label row of a field that saves itself, with a quiet word when it has. */
export function FieldLabel({ htmlFor, label, status }: { htmlFor: string; label: string; status: SaveStatus }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-small font-medium text-ink">
        {label}
      </label>
      <span role="status" className="flex h-4 items-center gap-1 text-micro text-success">
        {status === "saving" ? <Spinner className="size-3.5" label={`Saving ${label.toLowerCase()}`} /> : null}
        {status === "saved" ? (
          <>
            <Check aria-hidden className="size-3.5" /> Saved
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * A text field that saves when the person leaves it or presses Enter. A failed save
 * says why underneath and keeps what was typed, so nothing has to be typed twice.
 */
export function SavedField({
  label,
  value,
  onSave,
  multiline,
  suggestions,
  placeholder,
  maxLength,
}: {
  label: string;
  /** The saved value. An empty field is `null` on the server. */
  value: string | null;
  onSave: (value: string) => Promise<unknown>;
  multiline?: boolean;
  /** Existing values to offer while typing. */
  suggestions?: string[];
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  const saved = value ?? "";
  const [draft, setDraft] = useState(saved);
  const editing = useRef(false);
  const save = useSaveStatus();

  // Follow changes made elsewhere (another tab, another person), but never while this field is being typed in.
  useEffect(() => {
    if (!editing.current) setDraft(saved);
  }, [saved]);

  const commit = async () => {
    editing.current = false;
    const next = draft.trim();
    if (next === saved) return setDraft(saved);
    // After a failure the field is still "being edited": what was typed stays put.
    if (!(await save.run(() => onSave(next)))) editing.current = true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape" && draft !== saved) {
      // Stops here so that Escape puts the old value back without also closing anything around the field.
      event.stopPropagation();
      editing.current = false;
      setDraft(saved);
    }
  };

  const shared = {
    id,
    value: draft,
    placeholder,
    maxLength,
    "aria-invalid": save.status === "error" ? true : undefined,
    "aria-describedby": save.error ? `${id}-error` : undefined,
    onFocus: () => {
      editing.current = true;
    },
    onBlur: () => void commit(),
    onKeyDown,
  };

  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={id} label={label} status={save.status} />
      {multiline ? (
        <Textarea {...shared} rows={3} onChange={(event) => setDraft(event.target.value)} className="leading-[1.45] md:text-small" />
      ) : (
        <>
          <Input
            {...shared}
            list={suggestions?.length ? `${id}-list` : undefined}
            onChange={(event) => setDraft(event.target.value)}
            className="md:text-small [&::-webkit-calendar-picker-indicator]:hidden!"
          />
          {suggestions?.length ? (
            <datalist id={`${id}-list`}>
              {suggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          ) : null}
        </>
      )}
      {save.error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-danger">
          {save.error}
        </p>
      ) : null}
    </div>
  );
}
