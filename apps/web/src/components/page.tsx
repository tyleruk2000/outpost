import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Contour } from "./contour";

/** Standard screen frame: a width, consistent gutters, and room for the mobile bar. */
export function Page({ width = "wide", className, ...props }: ComponentProps<"div"> & { width?: "reading" | "wide" | "full" }) {
  const max = { reading: "max-w-[46rem]", wide: "max-w-[70rem]", full: "max-w-none" }[width];
  return <div className={cn("mx-auto w-full px-5 pt-8 pb-24 md:px-10 md:pt-12 md:pb-16", max, className)} {...props} />;
}

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-[60ch]">
        <h1 className="font-title text-title text-ink">{title}</h1>
        {description ? <p className="mt-2 text-body text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, description, actions, className, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("mt-10 first:mt-0", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lead font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-small text-ink-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * Shown when a screen has nothing yet. Says what belongs here and offers the first
 * step. The contour drawing marks it as a place waiting to be filled, not an error.
 */
export function EmptyState({
  title,
  children,
  action,
  seed = 3,
  compact,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  seed?: number;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative isolate overflow-hidden rounded-panel border border-border", compact ? "px-6 py-8" : "px-6 py-12 md:px-10 md:py-16", className)}>
      <Contour seed={seed} className="absolute inset-0 -z-10 size-full opacity-70 [mask-image:linear-gradient(100deg,transparent_18%,black_78%)]" />
      <div className="max-w-[44ch]">
        <h2 className="font-title text-heading text-ink">{title}</h2>
        {children ? <div className="mt-2 text-body text-ink-muted">{children}</div> : null}
        {action ? <div className="mt-5 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

/** An inline notice. Tinted panel with an icon and plain words; no coloured stripe. */
export function Notice({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-primary-soft text-primary-soft-ink",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-panel px-4 py-3 text-small", tones[tone], className)}>
      {icon ? <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn("text-ink", title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

/** A plain list with hairlines between rows. Preferred to cards for most collections of things. */
export function Rows({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("divide-y divide-border border-y border-border", className)} {...props} />;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <Notice
      tone="danger"
      title="This could not be loaded"
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className="shrink-0 font-medium underline underline-offset-2">
            Try again
          </button>
        ) : undefined
      }
    >
      {message}
    </Notice>
  );
}
