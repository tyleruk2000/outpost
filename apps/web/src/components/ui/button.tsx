import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-out disabled:opacity-50 aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
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
        sm: "h-8 px-2.5 text-small max-md:h-10",
        md: "h-9 px-3.5 text-small max-md:h-11",
        lg: "h-11 px-5 text-body",
        icon: "size-9 max-md:size-11",
        "icon-sm": "size-7 max-md:size-10 [&_svg]:size-[15px]",
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

export function Button({ className, variant, size, asChild, loading, disabled, children, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(button({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </Component>
  );
}
