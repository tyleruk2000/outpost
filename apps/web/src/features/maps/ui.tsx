/** Small pieces of chrome the maps screen uses in several places. */
import type { MarkerColor } from "@outpost/shared";
import { MARKER_COLORS } from "@outpost/shared";
import { Check } from "lucide-react";
import { RadioGroup } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { floating } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { MARKER_COLOR_NAMES, MARKER_HEX } from "./lib/palette";

/** The project's floating surface, for things that sit over the map. */
export const mapSurface = cn(floating, "z-auto min-w-0 p-0");

/** A group of icon buttons on one floating surface, stacked with hairlines between them. */
export function ControlGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(mapSurface, "flex flex-col divide-y divide-border overflow-hidden", className)} {...props} />;
}

/** One icon button in a control group. With `pressed` it is a toggle and shows its state. */
export function ControlButton({
  label,
  pressed,
  shortcut,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label" | "aria-pressed"> & { label: string; pressed?: boolean; shortcut?: string }) {
  return (
    <Tooltip label={label} shortcut={shortcut} side="left">
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          "rounded-none text-ink focus-visible:-outline-offset-2",
          pressed && "bg-primary-soft text-primary-soft-ink hover:bg-primary-soft",
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

export function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-b-0">
      <dt className="shrink-0 text-small text-ink-muted">{label}</dt>
      <dd className={cn("tabular min-w-0 text-right text-small text-ink", mono && "font-mono text-[0.8125rem]")}>{children}</dd>
    </div>
  );
}

/** A dot in a marker colour. Decorative: the colour's name is always written beside it or on the control. */
export function ColorDot({ color, className }: { color: MarkerColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3 shrink-0 rounded-full border border-page", className)}
      style={{ background: MARKER_HEX[color] }}
    />
  );
}

/** Choose one of the marker colours. Each swatch is named, and the chosen one carries a tick as well as a ring. */
export function ColorPicker({ value, onChange, label }: { value: MarkerColor; onChange: (color: MarkerColor) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <RadioGroup.Root
        aria-label={label}
        value={value}
        onValueChange={(next) => onChange(next as MarkerColor)}
        className="flex flex-wrap gap-1.5"
      >
        {MARKER_COLORS.map((color) => (
          <RadioGroup.Item
            key={color}
            value={color}
            aria-label={MARKER_COLOR_NAMES[color]}
            title={MARKER_COLOR_NAMES[color]}
            className="grid size-7 place-content-center rounded-full border-2 border-page shadow-[0_0_0_1px_var(--border-strong)] data-[state=checked]:shadow-[0_0_0_2px_var(--ink)] max-md:size-10"
            style={{ background: MARKER_HEX[color] }}
          >
            <RadioGroup.Indicator>
              <Check className="size-3.5 text-white" strokeWidth={3.5} />
            </RadioGroup.Indicator>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <span className="text-small text-ink-muted">{MARKER_COLOR_NAMES[value]}</span>
    </div>
  );
}

/** A quiet heading inside the side panel. */
export function PanelHeading({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-9 items-center justify-between gap-3", className)}>
      <h3 className="text-body font-semibold text-ink">{children}</h3>
      {actions}
    </div>
  );
}
