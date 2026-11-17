import { RadioGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Choice<T extends string> {
  value: T;
  title: ReactNode;
  /** A second line: what choosing this means, or why it cannot be chosen. */
  detail?: ReactNode;
  /** A figure to compare between choices, set to the right. */
  trailing?: ReactNode;
  disabled?: boolean;
}

/**
 * One choice from a short list, as rows with hairlines. Each row is a single large
 * target; a choice that cannot be made stays in the list and says why.
 */
export function ChoiceList<T extends string>({
  label,
  value,
  onChange,
  choices,
  className,
}: {
  label: string;
  value: T | undefined;
  onChange: (value: T) => void;
  choices: Array<Choice<T>>;
  className?: string;
}) {
  return (
    // An empty string keeps the group controlled while nothing is chosen yet.
    <RadioGroup.Root
      aria-label={label}
      value={value ?? ""}
      onValueChange={(next) => onChange(next as T)}
      className={cn("divide-y divide-border border-y border-border", className)}
    >
      {choices.map((choice) => {
        const id = `choice-${label.replace(/\W+/g, "-")}-${choice.value}`;
        return (
          <div key={choice.value} className={cn("flex items-start gap-3 py-2.5 max-md:py-3", choice.disabled && "text-ink-muted")}>
            <RadioGroup.Item
              id={id}
              value={choice.value}
              disabled={choice.disabled}
              // A plain round radio, as everywhere else; on the Maps screen it reaches out to 44 px without growing (maps.css).
              className="outpost-radio-dot mt-0.5 grid size-[18px] shrink-0 place-content-center rounded-full border-[1.5px] border-border-strong bg-page transition-colors data-[state=checked]:border-primary disabled:bg-surface-strong"
            >
              <RadioGroup.Indicator className="size-2.5 rounded-full bg-primary" />
            </RadioGroup.Item>
            <label
              htmlFor={id}
              className={cn(
                "flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4",
                choice.disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
            >
              <span className="min-w-0">
                <span className={cn("block text-small font-medium", choice.disabled ? "text-ink-muted" : "text-ink")}>{choice.title}</span>
                {choice.detail ? <span className="block text-small text-ink-muted">{choice.detail}</span> : null}
              </span>
              {choice.trailing ? <span className="tabular shrink-0 text-small text-ink-muted">{choice.trailing}</span> : null}
            </label>
          </div>
        );
      })}
    </RadioGroup.Root>
  );
}
