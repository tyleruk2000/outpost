/** A labelled number with a step down and a step up: the trainer's control for speeds and the tone. */
import { Minus, Plus } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface StepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** After the value: "wpm", "Hz". */
  unit?: string;
  hint?: string;
  className?: string;
}

export function Stepper({ label, value, onChange, min, max, step = 1, unit, hint, className }: StepperProps) {
  const clamp = (n: number): number => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const id = useId();
  // Icon-only, so in pixels: a finger is the same size whatever the text size (as on the map).
  const button =
    "inline-flex size-[36px] shrink-0 items-center justify-center rounded-control border border-border-strong bg-page text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 max-md:size-[44px] md:pointer-coarse:size-[44px]";
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span id={id} className="text-small font-medium text-ink">
        {label}
      </span>
      {/* biome-ignore lint/a11y/useSemanticElements: a group of two buttons and a value, named by its label */}
      <div className="flex items-center gap-2" role="group" aria-labelledby={id}>
        <button
          type="button"
          className={button}
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus aria-hidden className="size-4" />
        </button>
        <output className="tabular min-w-[4rem] text-center text-body font-medium text-ink" aria-live="polite">
          {value}
          {unit ? <span className="ml-1 text-small font-normal text-ink-muted">{unit}</span> : null}
        </output>
        <button
          type="button"
          className={button}
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
      {hint ? <p className="text-small text-ink-muted">{hint}</p> : null}
    </div>
  );
}
