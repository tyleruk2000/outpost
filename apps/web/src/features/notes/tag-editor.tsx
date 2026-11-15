/** The tags of a page, edited in place: type and press Enter or a comma; Backspace takes the last one back. */
import { X } from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const MAX_TAGS = 50;
export const MAX_TAG_LENGTH = 50;

const key = (tag: string) => tag.normalize("NFC").toLowerCase();

/**
 * Adds what was typed to the list. Commas separate tags; blanks and tags already there
 * (in any capitalisation) are skipped; long ones are cut to the length the server keeps.
 */
export function addTags(current: readonly string[], typed: string): string[] {
  const next = [...current];
  const seen = new Set(current.map(key));
  for (const part of typed.split(",")) {
    const tag = part.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH).trim();
    if (!tag || seen.has(key(tag)) || next.length >= MAX_TAGS) continue;
    seen.add(key(tag));
    next.push(tag);
  }
  return next;
}

export function TagEditor({
  tags,
  onChange,
  onBlur,
  readOnly,
  className,
}: {
  tags: readonly string[];
  onChange(tags: string[]): void;
  onBlur?(): void;
  readOnly?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const full = tags.length >= MAX_TAGS;

  const commit = (text: string) => {
    const next = addTags(tags, text);
    if (next.length !== tags.length) onChange(next);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      event.preventDefault();
      onChange(tags.slice(0, -1));
    } else if (event.key === "Escape" && draft !== "") {
      event.preventDefault();
      setDraft("");
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!/[,\n]/.test(text)) return;
    event.preventDefault();
    commit(`${draft}${text.replace(/\n/g, ",")}`);
  };

  if (readOnly && tags.length === 0) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking the empty part of the row focuses its input, which is the real control
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users reach the input directly
    <div
      className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-small", className)}
      onClick={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.focus();
      }}
    >
      <ul aria-label="Tags" className="contents">
        {tags.map((tag) => (
          <li key={tag} className="flex h-6 items-center rounded-full bg-surface-strong pl-2.5 text-ink-muted max-md:h-8 max-md:pl-3">
            <span className={cn("max-w-56 truncate", readOnly && "pr-2.5")}>{tag}</span>
            {readOnly ? null : (
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => {
                  onChange(tags.filter((existing) => existing !== tag));
                  inputRef.current?.focus();
                }}
                className="grid h-6 w-6 place-content-center rounded-full text-ink-muted hover:text-ink max-md:size-8"
              >
                <X aria-hidden className="size-3" strokeWidth={2.25} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {readOnly ? null : (
        <>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => {
              if (draft.trim()) commit(draft);
              onBlur?.();
            }}
            disabled={full}
            maxLength={MAX_TAG_LENGTH + 1}
            enterKeyHint="done"
            autoCapitalize="off"
            aria-label="Add a tag"
            aria-describedby={hintId}
            placeholder={full ? "No more tags fit" : tags.length === 0 ? "Add tags" : "Add tag"}
            className="h-6 min-w-24 flex-1 rounded-control bg-transparent text-small text-ink placeholder:text-ink-faint focus:outline-none max-md:h-8 max-md:text-body"
          />
          <span id={hintId} className="sr-only">
            Press Enter or a comma to add the tag. Backspace removes the last one.
          </span>
        </>
      )}
    </div>
  );
}
