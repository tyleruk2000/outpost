import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import {
  Checkbox as CheckboxPrimitive,
  Popover as PopoverPrimitive,
  Progress as ProgressPrimitive,
  Select as SelectPrimitive,
  Switch as SwitchPrimitive,
  Tabs as TabsPrimitive,
  ToggleGroup as TogglePrimitive,
  Tooltip as TooltipPrimitive,
} from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { floating } from "./menu";

// ── Tooltip ────────────────────────────────────────────────────────────────

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ label, shortcut, side, children }: { label: ReactNode; shortcut?: string; side?: "top" | "right" | "bottom" | "left"; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-(--z-tooltip) flex items-center gap-2 rounded-control bg-ink px-2 py-1 text-micro font-medium text-page shadow-float data-[state=delayed-open]:animate-fade"
        >
          {label}
          {shortcut ? <kbd className="font-mono text-page/70">{shortcut}</kbd> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ── Popover ────────────────────────────────────────────────────────────────

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, sideOffset = 6, align = "start", ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content sideOffset={sideOffset} align={align} collisionPadding={8} className={cn(floating, "p-3", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("scroll-quiet flex gap-5 overflow-x-auto border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 border-transparent pt-1 pb-2.5 text-small font-medium whitespace-nowrap text-ink-muted transition-colors hover:text-ink data-[state=active]:border-primary data-[state=active]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

// ── Segmented control ──────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  label: string;
  className?: string;
}) {
  return (
    <TogglePrimitive.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
      aria-label={label}
      className={cn("inline-flex rounded-control border border-border-strong bg-surface p-0.5", className)}
    >
      {options.map((option) => (
        <TogglePrimitive.Item
          key={option.value}
          value={option.value}
          className="flex h-8 items-center gap-1.5 rounded-[3px] px-3 text-small font-medium text-ink-muted transition-colors hover:text-ink data-[state=on]:bg-page data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--border-strong)] max-md:h-10 [&_svg]:size-4"
        >
          {option.icon}
          {option.label}
        </TogglePrimitive.Item>
      ))}
    </TogglePrimitive.Root>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  ...props
}: {
  value: T | undefined;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; description?: ReactNode; disabled?: boolean }>;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(next) => onChange(next as T)} disabled={props.disabled}>
      <SelectPrimitive.Trigger
        id={props.id}
        aria-label={props["aria-label"]}
        aria-describedby={props["aria-describedby"]}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-control border border-border-strong bg-page px-3 text-left text-small text-ink transition-colors hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 disabled:opacity-60 data-placeholder:text-ink-faint max-md:h-11",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-ink-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} collisionPadding={8} className={cn(floating, "max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) min-w-(--radix-select-trigger-width) overflow-hidden p-0")}>
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex cursor-default items-start gap-2 rounded-[4px] py-1.5 pr-8 pl-2.5 outline-none select-none data-highlighted:bg-surface-strong data-disabled:opacity-45 max-md:py-2.5"
              >
                <div className="min-w-0">
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.description ? <div className="text-micro text-ink-muted">{option.description}</div> : null}
                </div>
                <SelectPrimitive.ItemIndicator className="absolute top-2 right-2.5">
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// ── Switch and checkbox ────────────────────────────────────────────────────

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border-strong bg-surface-strong transition-colors duration-150 data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4.5 translate-x-0.5 rounded-full bg-page shadow-[0_1px_2px_oklch(0.2_0.02_220/0.3)] transition-transform duration-150 ease-out data-[state=checked]:translate-x-[1.125rem] dark:bg-ink data-[state=checked]:dark:bg-primary-ink" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "grid size-[18px] shrink-0 place-content-center rounded-[4px] border-[1.5px] border-border-strong bg-page transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3.5 text-primary-ink" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// ── Progress ───────────────────────────────────────────────────────────────

/**
 * A progress bar that only ever shows real progress. With no `value` it shows that
 * work is happening without pretending to know how far along it is.
 */
export function Progress({ value, tone = "primary", className, label }: { value?: number | null; tone?: "primary" | "lamp" | "success" | "danger" | "muted"; className?: string; label: string }) {
  const fill = { primary: "bg-primary", lamp: "bg-lamp", success: "bg-success", danger: "bg-danger", muted: "bg-ink-faint" }[tone];
  const known = typeof value === "number" && Number.isFinite(value);
  const percent = known ? Math.max(0, Math.min(100, value * 100)) : null;
  return (
    <ProgressPrimitive.Root value={percent} aria-label={label} className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-strong", className)}>
      {percent === null ? (
        <div className={cn("absolute inset-y-0 w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full", fill)} />
      ) : (
        <ProgressPrimitive.Indicator className={cn("h-full rounded-full transition-[width] duration-300 ease-out", fill)} style={{ width: `${percent}%` }} />
      )}
    </ProgressPrimitive.Root>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

const badge = cva("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-micro font-medium whitespace-nowrap [&_svg]:size-3.5", {
  variants: {
    tone: {
      neutral: "bg-surface-strong text-ink-muted",
      primary: "bg-primary-soft text-primary-soft-ink",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-danger-soft text-danger",
      lamp: "bg-lamp-soft text-lamp-ink",
    },
  },
  defaultVariants: { tone: "neutral" },
});

/** State is always text, optionally with an icon; colour only supports it. */
export function Badge({ tone, className, ...props }: ComponentProps<"span"> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <LoaderCircle role="status" aria-label={label} className={cn("size-4 animate-spin text-ink-muted", className)} />;
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd className={cn("rounded-[4px] border border-border bg-surface px-1.5 py-px font-mono text-micro text-ink-muted", className)} {...props} />;
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("skeleton h-4", className)} {...props} />;
}
