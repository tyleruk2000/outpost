import { X } from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { FieldLabel, useSaveStatus } from "./document-field";

/** Tags are the same tag whatever their capitalisation, as on the server. */
const sameTag = (a: string, b: string) => a.normalize("NFC").toLowerCase() === b.normalize("NFC").toLowerCase();

/** Splits typed or pasted text into tags, and leaves out blanks and ones already there. */
export function addTags(existing: readonly string[], typed: string): string[] {
  const next = [...existing];
  for (const part of typed.split(",")) {
    const name = part.replace(/\s+/g, " ").trim();
    if (name && !next.some((tag) => sameTag(tag, name))) next.push(name);
  }
  return next;
}

/**
 * Tags as removable chips with a field to add more: type and press Enter or a comma.
 * Backspace in the empty field removes the last one. Every change is saved at once.
 */
export function TagEditor({
  tags,
  suggestions = [],
  onChange,
}: {
  tags: string[];
  suggestions?: string[];
  onChange: (tags: string[]) => Promise<unknown>;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  // Shown in place of the saved tags while a change is on its way to the server.
  const [pending, setPending] = useState<string[] | null>(null);
  const save = useSaveStatus();
  const shown = pending ?? tags;
  const offered = suggestions.filter((suggestion) => !shown.some((tag) => sameTag(tag, suggestion)));

  const apply = async (next: string[], typed = "") => {
    setPending(next);
    const saved = await save.run(() => onChange(next));
    setPending(null);
    // A refused tag goes back into the field, so it can be corrected rather than typed again.
    if (!saved && typed) setDraft(typed);
  };

  const addDraft = () => {
    const typed = draft.trim();
    if (!typed) return;
    setDraft("");
    const next = addTags(shown, typed);
    if (next.length !== shown.length) void apply(next, typed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addDraft();
    } else if (event.key === "Backspace" && draft === "" && shown.length > 0) {
      event.preventDefault();
      void apply(shown.slice(0, -1));
    }
  };

  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={id} label="Tags" status={save.status} />
      <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-border-strong bg-page p-1.5 transition-[border-color,box-shadow] focus-within:border-focus focus-within:ring-2 focus-within:ring-focus hover:border-ink-faint">
        {shown.length > 0 ? (
          <ul className="contents" aria-label="Tags on this document">
            {shown.map((tag) => (
              <li key={tag} className="contents">
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  title="Remove this tag"
                  onClick={() => {
                    // The chip is about to go; keep the keyboard in the field rather than nowhere.
                    inputRef.current?.focus();
                    void apply(shown.filter((other) => other !== tag));
                  }}
                  className="group inline-flex max-w-full items-center gap-1 rounded-full bg-surface-strong py-0.5 pr-1.5 pl-2.5 text-small text-ink hover:bg-danger-soft hover:text-danger max-md:min-h-9"
                >
                  <span className="truncate">{tag}</span>
                  <X aria-hidden className="size-3.5 shrink-0 text-ink-muted group-hover:text-danger" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          list={offered.length > 0 ? `${id}-list` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={addDraft}
          placeholder={shown.length === 0 ? "Add a tag" : undefined}
          aria-describedby={`${id}-hint${save.error ? ` ${id}-error` : ""}`}
          aria-invalid={save.status === "error" ? true : undefined}
          autoComplete="off"
          autoCapitalize="none"
          className="h-7 min-w-24 flex-1 bg-transparent px-1.5 text-body text-ink placeholder:text-ink-faint focus:outline-none max-md:h-9 md:text-small [&::-webkit-calendar-picker-indicator]:hidden!"
        />
        {offered.length > 0 ? (
          <datalist id={`${id}-list`}>
            {offered.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        ) : null}
      </div>
      <p id={`${id}-hint`} className="sr-only">
        Type a tag and press Enter or a comma to add it. Backspace in the empty field removes the last tag.
      </p>
      {save.error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-danger">
          {save.error}
        </p>
      ) : null}
    </div>
  );
}
