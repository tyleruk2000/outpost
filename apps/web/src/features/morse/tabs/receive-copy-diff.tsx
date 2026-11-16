/**
 * What was sent, with every character that was missed or mistyped marked: by colour,
 * weight and an underline on screen, and in a sentence for a screen reader.
 * Used by Receive and by QSO practice.
 */
import { copyDiff } from "@outpost/shared";
import { cn } from "@/lib/utils";

const tidy = (text: string) => text.toUpperCase().replace(/\s+/g, " ").trim();

export function CopyDiff({ sent, typed, className }: { sent: string; typed: string; className?: string }) {
  const diff = copyDiff(tidy(sent), tidy(typed));
  const missed = [...new Set(diff.filter((part) => !part.ok && part.char !== " ").map((part) => part.char))];
  return (
    <p className={cn("font-mono tracking-widest break-all text-ink", className)}>
      <span aria-hidden>
        {diff.map((part, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the characters of one fixed string, in order
            key={index}
            className={part.ok ? undefined : "rounded-[3px] bg-danger-soft font-semibold text-danger underline underline-offset-4"}
          >
            {part.char}
          </span>
        ))}
      </span>
      <span className="sr-only">
        Sent: {tidy(sent)}. {missed.length > 0 ? `Missed or mistyped: ${missed.join(", ")}.` : "Nothing missed."}
      </span>
    </p>
  );
}
