import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The readout that follows the pointer or the keyboard focus on a chart. It sits inside
 * the chart's own (relatively positioned) frame, on whichever side of the mark has room,
 * and never takes the pointer itself. On a narrow chart it spans the frame instead.
 */
export function ChartTooltip({
  x,
  y,
  frameWidth,
  above,
  className,
  children,
}: {
  /** Where the mark is, in pixels from the frame's left and top edges. */
  x: number;
  y: number;
  frameWidth: number;
  /** Sit above `y` rather than below it. */
  above?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const narrow = frameWidth > 0 && frameWidth < 440;
  const toLeft = x > frameWidth / 2;
  return (
    <div
      role="presentation"
      className={cn(
        "pointer-events-none absolute z-(--z-sticky) rounded-control border border-border bg-raised px-2.5 py-1.5 text-small text-ink shadow-float",
        narrow ? "inset-x-1" : "w-max max-w-80",
        className,
      )}
      style={{
        top: y,
        ...(narrow ? {} : toLeft ? { right: frameWidth - x + 12 } : { left: x + 12 }),
        transform: above ? "translateY(calc(-100% - 8px))" : "translateY(8px)",
      }}
    >
      {children}
    </div>
  );
}

/** One line of a tooltip: the value leads, what it is follows. */
export function TooltipValue({ value, label }: { value: ReactNode; label?: ReactNode }) {
  return (
    <p className="tabular">
      <span className="font-semibold text-ink">{value}</span>
      {label ? <span className="ml-2 text-ink-muted">{label}</span> : null}
    </p>
  );
}
