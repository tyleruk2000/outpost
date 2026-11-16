/**
 * The message box. One box for every way of saying something: a first message, the
 * next one, and the last one written again.
 *
 * Enter sends and Shift+Enter makes a new line. On a touch keyboard, which has no
 * Shift+Enter worth the name, Enter makes a new line and the button sends. The box
 * grows with what is typed, up to a part of the screen. While a reply is being written
 * the button in the same place is Stop, and the next message can already be typed.
 *
 * Under the box, always, one sentence that says exactly what the model will be given.
 */
import type { ChatScope } from "@outpost/shared";
import { ArrowUp, Pencil, Square, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, type Ref, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import "./chat.css";

export interface ComposerHandle {
  focus(): void;
}

export interface ComposerProps {
  value: string;
  onChange(text: string): void;
  onSend(): void;
  /** Present while a reply is being written here: the button becomes Stop. */
  onStop?: () => void;
  /** The message is on its way to the server. */
  sending?: boolean;
  /** Why a message cannot be sent just now, in a few words. Typing is still possible. */
  blocked?: string | null;
  useLibrary: boolean;
  onUseLibrary?: (on: boolean) => void;
  /** The one item this conversation is about; the library switch is then not offered. */
  scope?: Pick<ChatScope, "kind" | "title" | "url"> | null;
  /** The last message is being written again; sending replaces it and its reply. */
  editing?: boolean;
  onCancelEdit?: () => void;
  /** Something to say above the box: a refusal from the server, for one. */
  notice?: ReactNode;
  autoFocus?: boolean;
  ref?: Ref<ComposerHandle>;
}

/** A touch keyboard: Enter is the only way to make a new line. */
const touchKeyboard = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

export const MESSAGE_MAX = 16_000;

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  sending = false,
  blocked = null,
  useLibrary,
  onUseLibrary,
  scope = null,
  editing = false,
  onCancelEdit,
  notice,
  autoFocus = false,
  ref,
}: ComposerProps) {
  const box = useRef<HTMLTextAreaElement>(null);
  const switchId = useId();
  const modeId = useId();
  const writing = onStop !== undefined;
  const tooLong = value.length > MESSAGE_MAX;
  const canSend = value.trim().length > 0 && !tooLong && !sending && !writing && !blocked;

  // Not on a phone: focusing there throws the keyboard up over the screen the person came to read.
  useImperativeHandle(ref, () => ({ focus: () => (touchKeyboard() ? undefined : box.current?.focus()) }), []);

  // The box is as tall as what is in it; the stylesheet stops it at a part of the screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever the text changes
  useLayoutEffect(() => {
    const area = box.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus && !touchKeyboard()) box.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (editing) {
      const area = box.current;
      area?.focus();
      area?.setSelectionRange(area.value.length, area.value.length);
    }
  }, [editing]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && editing) {
      event.preventDefault();
      onCancelEdit?.();
      return;
    }
    // Enter while choosing a character in an input method belongs to the input method.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || touchKeyboard()) return;
    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <div>
      {notice ? <div className="mb-2">{notice}</div> : null}
      <form
        aria-label="Message"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSend();
        }}
        className={cn(
          "rounded-panel border border-border-strong bg-page transition-[border-color,box-shadow] duration-150",
          "focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/30",
        )}
      >
        {editing ? (
          <p className="flex items-center gap-2 border-b border-border py-1 pr-1 pl-3.5 text-small text-ink-muted">
            <Pencil aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">Writing your last message again. Sending replaces it and its reply.</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-md:size-11"
              aria-label="Keep the message as it was"
              onClick={onCancelEdit}
            >
              <X />
            </Button>
          </p>
        ) : null}
        <textarea
          ref={box}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Your message"
          aria-describedby={modeId}
          aria-invalid={tooLong || undefined}
          placeholder={scope ? `Ask about ${scope.kind === "note" ? "this page" : "this document"}` : "Write a message"}
          enterKeyHint={touchKeyboard() ? "enter" : "send"}
          className="chat-box block w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-body text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-1.5 pl-3.5">
          {scope ? null : (
            <label htmlFor={switchId} className="flex cursor-pointer items-center gap-2.5 text-small text-ink select-none max-md:min-h-11">
              <Switch id={switchId} checked={useLibrary} onCheckedChange={onUseLibrary} disabled={!onUseLibrary} />
              Use my library
            </label>
          )}
          <span className="ml-auto flex items-center gap-3">
            {tooLong ? (
              <span role="alert" className="tabular text-small text-danger">
                {(value.length - MESSAGE_MAX).toLocaleString("en-GB")} characters too long
              </span>
            ) : blocked && !writing ? (
              <span className="text-small text-ink-muted">{blocked}</span>
            ) : (
              <span aria-hidden className="text-micro text-ink-muted max-md:hidden [@media(pointer:coarse)]:hidden">
                {writing ? "You can type the next message meanwhile" : "Enter to send, Shift+Enter for a new line"}
              </span>
            )}
            {writing ? (
              <Button size="sm" className="max-md:h-11" onClick={onStop}>
                <Square aria-hidden /> Stop
              </Button>
            ) : (
              <Button type="submit" variant="primary" size="sm" className="max-md:h-11" disabled={!canSend} loading={sending}>
                {sending ? null : <ArrowUp aria-hidden />} {editing ? "Send again" : "Send"}
              </Button>
            )}
          </span>
        </div>
      </form>
      <p id={modeId} className="mt-2 text-small text-ink-muted" data-testid="chat-mode">
        {scope ? (
          <>
            Each message is answered from passages of{" "}
            <Link
              to={scope.url}
              className="font-medium text-ink underline decoration-border-strong decoration-1 underline-offset-[0.2em] hover:decoration-primary"
            >
              {scope.title || (scope.kind === "note" ? "this page" : "this document")}
            </Link>{" "}
            alone, which are sent to the model with it.
          </>
        ) : useLibrary ? (
          "From your library: each message is answered from passages found in your documents, notes and books, which are sent to the model with it."
        ) : (
          "A plain conversation: the model answers from what it learned, and nothing from your library is sent."
        )}
      </p>
    </div>
  );
}
