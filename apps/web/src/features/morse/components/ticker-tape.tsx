/**
 * The decode strip: decoded characters print along it like a paper tape, the character
 * being keyed shows as its dits and dahs so far, and the speed heard sits at the end.
 * Used by the Send, QSO practice and On the air tabs.
 */
import { toDisplay } from "@outpost/shared";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface TickerTapeProps {
  text: string;
  /** The character being keyed, as '.' and '-'. */
  pending: string;
  /** The speed heard (not shown until something has been decoded). */
  wpm?: number;
  placeholder?: string;
  className?: string;
}

export function TickerTape({ text, pending, wpm, placeholder, className }: TickerTapeProps) {
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scroller.current;
    if (element && text + pending !== "") element.scrollLeft = element.scrollWidth;
  }, [text, pending]);

  const empty = text === "" && pending === "";

  return (
    <div className={cn("flex items-start gap-3 rounded-panel border border-dashed border-border-strong bg-surface px-4 py-3", className)}>
      {/* role="log" announces each decoded character as it lands; the dits and dahs in progress change on every press and stay visual. */}
      <div
        ref={scroller}
        role="log"
        aria-label="Decoded Morse"
        className="scroll-quiet min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-lead tracking-widest"
      >
        {empty ? (
          <span className="whitespace-normal font-sans text-body tracking-normal text-ink-muted">
            {placeholder ?? "What you key is decoded here."}
          </span>
        ) : (
          <>
            <span className="text-ink">{text}</span>
            {pending ? (
              <span className="text-primary" aria-hidden>
                {toDisplay(pending)}
              </span>
            ) : null}
            <span className="ml-0.5 inline-block h-5 w-0.5 bg-primary align-middle motion-safe:animate-pulse" aria-hidden />
          </>
        )}
      </div>
      {wpm !== undefined && text !== "" ? <span className="tabular shrink-0 pt-1 text-small text-ink-muted">about {wpm} wpm</span> : null}
    </div>
  );
}
