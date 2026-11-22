import { ArrowLeft, ChevronRight } from "lucide-react";
import { type ComponentProps, Fragment, type MouseEvent, type ReactNode } from "react";
import { Link, useInRouterContext, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { Contour } from "./contour";
import { allNav } from "./nav";
import { ScreensUnder } from "./screens-under";

/** Standard screen frame: a width, consistent gutters, and room for the mobile bar. */
export function Page({ width = "wide", className, ...props }: ComponentProps<"div"> & { width?: "reading" | "wide" | "full" }) {
  const max = { reading: "max-w-[46rem]", wide: "max-w-[70rem]", full: "max-w-none" }[width];
  return <div className={cn("mx-auto w-full px-5 pt-8 pb-24 md:px-10 md:pt-12 md:pb-16", max, className)} {...props} />;
}

/**
 * The way back from a screen to the one it was reached from, above its title: one glyph,
 * one look, everywhere. `PageHeader` draws it by itself for a screen under another in the
 * navigation; a screen of its own (a plan, an item) gives it with `back`.
 */
export function BackLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "-ml-1 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-control px-1 text-small text-ink-muted transition-colors hover:text-ink md:min-h-8",
        className,
      )}
    >
      <ArrowLeft aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

export interface Back {
  to: string;
  label: string;
}

/** The screen a path sits under in the navigation (Storage for /storage/manage), if any. */
export function parentInNav(pathname: string): Back | null {
  for (const item of allNav) {
    if (item.children?.some((child) => child.to === pathname)) return { to: item.to, label: item.label };
  }
  return null;
}

/** The parent from the navigation, read only where there is a router to read the address from. */
function NavBack({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const parent = parentInNav(pathname.replace(/\/+$/, "") || "/");
  return parent ? (
    <BackLink to={parent.to} className={className}>
      {parent.label}
    </BackLink>
  ) : null;
}

export function PageHeader({
  title,
  description,
  actions,
  under,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** The path of this screen in the navigation: the screens under it are linked beneath the title. */
  under?: string;
  /**
   * The way back, above the title. Left out, a screen under another in the navigation links back to it by
   * itself; `false` draws none, for a screen that has its own (a bar of its own, a step in a flow).
   */
  back?: Back | false;
  className?: string;
}) {
  const routed = useInRouterContext();
  const backLink =
    back === false ? null : back ? (
      <BackLink to={back.to} className="mb-2">
        {back.label}
      </BackLink>
    ) : routed ? (
      <NavBack className="mb-2" />
    ) : null;
  return (
    <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-[60ch]">
        {backLink ? <div>{backLink}</div> : null}
        {/* A long word ("Communication") in the title's size is wider than a narrow phone with large text: it is broken. */}
        <h1 className="font-title text-title text-ink hyphens-auto break-words">{title}</h1>
        {description ? <p className="mt-2 text-body text-ink-muted">{description}</p> : null}
        {under ? <ScreensUnder parent={under} className="mt-2" /> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  className,
  level = 2,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** The heading's level: 3 for a section inside a part of the screen that has a heading of its own. */
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <section className={cn("mt-10 first:mt-0", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading className="text-lead font-semibold text-ink">{title}</Heading>
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
  level = 2,
  className,
}: {
  title: string;
  children?: ReactNode;
  /** The first thing to do, as a button (or two, the main one last). */
  action?: ReactNode;
  seed?: number;
  /** Smaller, for a list inside a section or a dialog rather than a whole screen. */
  compact?: boolean;
  /** The level of its heading: 3 inside a `Section`, whose own title is a level 2. */
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-panel border border-border",
        compact ? "px-6 py-8" : "px-6 py-12 md:px-10 md:py-16",
        className,
      )}
    >
      <Contour
        seed={seed}
        className="absolute inset-0 -z-10 size-full opacity-70 [mask-image:linear-gradient(100deg,transparent_18%,black_78%)]"
      />
      <div className="max-w-[44ch]">
        <Heading className="font-title text-heading text-ink">{title}</Heading>
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
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-panel px-4 py-3 text-small", tones[tone], className)}
    >
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
          <button
            type="button"
            onClick={onRetry}
            // 44 px tall for a finger, without making the notice round it taller.
            className="shrink-0 font-medium underline underline-offset-2 max-md:-my-3 max-md:min-h-11"
          >
            Try again
          </button>
        ) : undefined
      }
    >
      {message}
    </Notice>
  );
}

/**
 * Facts about one thing on one line ("12 tins · Pantry · Best before 31 Aug 2027"), with the one
 * separator the app uses. Empty parts are left out. The dot is not read aloud; a comma is.
 */
export function Joined({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== false && part !== "");
  return (
    <>
      {shown.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list of facts
        <Fragment key={index}>
          {index > 0 ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
            </>
          ) : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Links to the sections of a screen that shows them all at once (Water, Settings). A screen that
 * shows one section at a time uses tabs instead (`Tabs` in `ui/misc`).
 */
export function JumpLinks({
  label,
  items,
  onJump,
  className,
}: {
  label: string;
  items: { id: string; label: ReactNode }[];
  /** Instead of following the link: a screen whose address the router owns moves to the section itself. */
  onJump?: (id: string, event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("-mt-4 mb-6", className)}>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-small">
        {items.map((item) => (
          // A long name (a file's path in a heading) wraps inside the screen rather than run past it.
          <li key={item.id} className="min-w-0 max-w-full">
            <a
              href={`#${item.id}`}
              onClick={onJump ? (event) => onJump(item.id, event) : undefined}
              className="inline-flex min-h-11 items-center text-primary underline decoration-1 [overflow-wrap:anywhere] underline-offset-[0.2em] hover:decoration-2 md:min-h-8"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Detail most people do not need, closed until asked for: the formula behind a figure, the field
 * names a file is read by, how a scan works. The summary says what is inside.
 */
export function Disclosure({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cn("group", className)}>
      <summary className="flex min-h-11 cursor-default items-center gap-2 py-2 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
        {summary}
      </summary>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-2 pl-6 text-small text-ink">{children}</div>
    </details>
  );
}
