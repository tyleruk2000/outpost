/** The address field for a link, used inline in the selection toolbar and in the touch dialog. */
import type { Editor } from "@tiptap/react";
import { Check, ExternalLink, Unlink } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { isInAppHref, normaliseHref, setLink, unsetLink } from "./link";

export const toolButton =
  "grid size-8 shrink-0 place-content-center rounded-[4px] text-ink-muted transition-colors duration-(--duration-fast) hover:bg-surface-strong hover:text-ink aria-pressed:bg-primary-soft aria-pressed:text-primary-soft-ink disabled:opacity-40 max-md:size-10 md:pointer-coarse:size-10 [&_svg]:size-4";

export const LINK_HELP = "Use a web address, an e-mail address, or a path inside Outpost such as /library.";

export function LinkField({
  editor,
  href,
  onDone,
  className,
}: {
  editor: Editor;
  href: string | null;
  onDone(): void;
  className?: string;
}) {
  const [value, setValue] = useState(href ?? "");
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);

  // The field appears because the person asked for it, so the cursor goes straight in.
  useEffect(() => input.current?.focus(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      if (href) unsetLink(editor);
      onDone();
      return;
    }
    const next = normaliseHref(value);
    if (!next) {
      setInvalid(true);
      return;
    }
    setLink(editor, next);
    onDone();
  };

  return (
    <form onSubmit={submit} className={cn("grid gap-1", className)}>
      <div className="flex items-center gap-0.5">
        <input
          ref={input}
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Link address"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              editor.commands.focus();
              onDone();
            }
          }}
          placeholder="Paste or type an address"
          className="h-8 min-w-0 flex-1 rounded-[4px] bg-transparent px-2 text-small text-ink placeholder:text-ink-faint focus-visible:outline-offset-0 max-md:h-10 md:pointer-coarse:h-10 max-md:text-body md:pointer-coarse:text-body"
        />
        <Tooltip label="Apply link">
          <button type="submit" aria-label="Apply link" className={toolButton}>
            <Check aria-hidden />
          </button>
        </Tooltip>
        {href ? (
          <>
            <Tooltip label="Open link">
              <a
                href={href}
                target={isInAppHref(href) ? undefined : "_blank"}
                rel="noopener noreferrer"
                aria-label="Open link"
                className={toolButton}
              >
                <ExternalLink aria-hidden />
              </a>
            </Tooltip>
            <Tooltip label="Remove link">
              <button
                type="button"
                aria-label="Remove link"
                className={toolButton}
                onClick={() => {
                  unsetLink(editor);
                  onDone();
                }}
              >
                <Unlink aria-hidden />
              </button>
            </Tooltip>
          </>
        ) : null}
      </div>
      {invalid ? (
        <p id={errorId} role="alert" className="max-w-72 px-2 pb-1 text-micro text-danger">
          That is not an address a link can go to. {LINK_HELP}
        </p>
      ) : null}
    </form>
  );
}
