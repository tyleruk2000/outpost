import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";
import { cn } from "@/lib/utils";

// A label stays on one line while it fits, and wraps, with the button growing taller, only when it is wider than
// the room it is in (a phone with large text): `max-w-full` caps the width, and the heights are least heights.
const button = cva(
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-control text-center font-medium select-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-out disabled:opacity-50 aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink hover:bg-primary-hover active:bg-primary-hover",
        secondary: "border border-border-strong bg-page text-ink hover:bg-surface active:bg-surface-strong",
        ghost: "text-ink-muted hover:bg-surface-strong hover:text-ink active:bg-surface-strong",
        soft: "bg-primary-soft text-primary-soft-ink hover:bg-primary-soft/70",
        danger: "bg-danger text-white hover:bg-danger-hover dark:text-page",
        "danger-ghost": "text-danger hover:bg-danger-soft",
        link: "h-auto! px-0! text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2",
      },
      size: {
        sm: "min-h-8 px-2.5 py-1 text-small max-md:min-h-11",
        md: "min-h-9 px-3.5 py-1.5 text-small max-md:min-h-11",
        lg: "min-h-11 px-5 py-2 text-body",
        icon: "size-9 max-md:size-11",
        "icon-sm": "size-7 max-md:size-11 [&_svg]:size-[15px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  /** Shows a spinner and blocks further presses while an action is in flight. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * While `loading`, the button is marked unavailable (`aria-disabled`) and its presses are stopped here, but it is not
 * `disabled`: a disabled button drops the keyboard's focus to the top of the page, just after it was pressed from the
 * keyboard (WCAG 2.4.3). A submit button stops the form being sent again the same way.
 */
export function Button({ className, variant, size, asChild, loading, disabled, children, type, onClick, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  const busy = !asChild && Boolean(loading) && !disabled;
  return (
    <Component
      className={cn(button({ variant, size }), className)}
      disabled={asChild ? undefined : disabled}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
      aria-disabled={busy || props["aria-disabled"] || undefined}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (busy) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    >
      {/* With asChild the single child is the element itself, so nothing may sit beside it. */}
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Component>
  );
}
