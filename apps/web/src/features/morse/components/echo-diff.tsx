/**
 * What was asked for, marked against what the decoder heard, character by character:
 * used wherever keying is graded (Quick targets, Echo, CQ conversations, On the air).
 * A missed character is red, underlined and named for screen readers, so the colour is
 * never the only sign.
 */
import { copyDiff } from "@outpost/shared";
import { cn } from "@/lib/utils";

/** Upper case, single spaces, no spaces at the ends: how targets and replies are compared. */
export const normalizeMorseText = (text: string): string => text.toUpperCase().replace(/\s+/g, " ").trim();

export function MarkedDiff({ target, decoded, className }: { target: string; decoded: string; className?: string }) {
  const diff = copyDiff(normalizeMorseText(target), normalizeMorseText(decoded));
  return (
    <p className={cn("break-all font-mono text-lead tracking-widest", className)}>
      {diff.map((item, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: characters repeat; their place is their identity
          key={index}
          className={item.ok ? "text-success" : "rounded-[3px] bg-danger-soft font-semibold text-danger underline underline-offset-4"}
        >
          {item.char}
          {!item.ok && item.char !== " " ? <span className="sr-only"> (missed)</span> : null}
        </span>
      ))}
    </p>
  );
}
