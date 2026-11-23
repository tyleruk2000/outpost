import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import { type ButtonHTMLAttributes, Children, isValidElement, type MouseEvent, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

// A label stays on one line while it fits, and wraps, with the button growing taller, only when it is wider than
// the room it is in (a phone with large text): `max-w-full` caps the width, and the heights are least heights.
// Heights: 44 px wherever the pointer is a finger (a phone, and a tablet at any width: `pointer-coarse`) and on any
// screen narrower than 768 px; the desktop's own sizes with a mouse. A press answers at once: the fill darkens and
// the button gives a little (98%), at once both ways: its size is never caught part-way, by a finger or a measure.
// (Not a shift by a pixel: a button placed by a translation, centred in a field, jumped by half its height.)
const button = cva(
  "relative inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-control text-center font-medium select-none transition-[background-color,border-color,color,box-shadow] duration-(--duration-fast) active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50 disabled:active:scale-100 aria-disabled:opacity-50 aria-disabled:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink hover:bg-primary-hover active:bg-primary-hover",
        secondary: "border border-border-strong bg-page text-ink hover:bg-surface active:bg-surface-strong",
        ghost: "text-ink-muted hover:bg-surface-strong hover:text-ink active:bg-surface-strong",
        // Darker on hover, as every other button is: the lighter fill it had was all but white on the light page.
        soft: "bg-primary-soft text-primary-soft-ink hover:bg-[color-mix(in_oklch,var(--primary-soft),var(--primary)_12%)] active:bg-[color-mix(in_oklch,var(--primary-soft),var(--primary)_18%)]",
        danger: "bg-danger text-white hover:bg-danger-hover active:bg-danger-hover dark:text-page",
        "danger-ghost": "text-danger hover:bg-danger-soft active:bg-danger-soft",
        link: "h-auto! px-0! text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 active:scale-100",
      },
      size: {
        sm: "min-h-8 px-2.5 py-1 text-small max-md:min-h-11 md:pointer-coarse:min-h-11",
        md: "min-h-9 px-3.5 py-1.5 text-small max-md:min-h-11 md:pointer-coarse:min-h-11",
        lg: "min-h-11 px-5 py-2 text-body",
        // An icon button is its size, never capped: `max-w-full` measured against a parent that the button's own negative
        // margin had shrunk cut a 28 px button to 22 (a card's close button pulled into its corner).
        icon: "size-9 max-w-none max-md:size-11 md:pointer-coarse:size-11",
        "icon-sm": "size-7 max-w-none max-md:size-11 md:pointer-coarse:size-11 [&_svg]:size-[15px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

/** The look of a button, for an element that must look like one without being a `Button` (a file input's label). */
export const buttonClasses = button;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  /**
   * Shows a spinner and blocks further presses while an action is in flight. The button keeps its width: the
   * spinner takes the place of a leading icon or, with none, sits over the words, which keep their room and stay
   * the button's name for a screen reader.
   */
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
      {asChild ? children : loading ? <Busy>{children}</Busy> : children}
    </Component>
  );
}

/** An element drawn by a component of its own (a Lucide icon), not a tag of the page's or a run of words. */
function isIcon(node: ReactNode): boolean {
  return isValidElement(node) && typeof node.type !== "string";
}

/**
 * What a button shows while its action is under way, at the width it had before. A leading icon is swapped for the
 * spinner; without one, the words are kept, unseen, under it.
 */
function Busy({ children }: { children: ReactNode }) {
  const parts = Children.toArray(children);
  if (parts.length > 0 && isIcon(parts[0])) {
    return (
      <>
        <LoaderCircle data-slot="spinner" className="animate-spin" aria-hidden />
        {parts.slice(1)}
      </>
    );
  }
  return (
    <>
      <span className="inline-flex items-center gap-2 opacity-0">{children}</span>
      <LoaderCircle data-slot="spinner" className="absolute inset-0 m-auto animate-spin" aria-hidden />
    </>
  );
}
