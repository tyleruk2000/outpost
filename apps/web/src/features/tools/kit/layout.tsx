/**
 * A screen of calculators: its title, a line of links to each calculator on it (a phone
 * scrolls a long way otherwise), and the calculators one under another, each a section
 * with a hairline above it.
 */
import type { ReactNode } from "react";
import { Page, PageHeader } from "@/components/page";
import { cn } from "@/lib/utils";

export interface CalculatorLink {
  id: string;
  title: string;
}

export function ToolScreen({
  title,
  description,
  calculators,
  footer,
  children,
}: {
  title: string;
  description: ReactNode;
  calculators: readonly CalculatorLink[];
  /** A caution for the whole screen, said at its foot. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Page width="reading">
      <PageHeader title={title} description={description} />
      <nav aria-label="Calculators on this screen" className="-mt-4 mb-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small">
          {calculators.map((calculator) => (
            <li key={calculator.id}>
              <a
                href={`#${calculator.id}`}
                onClick={(event) => {
                  // The app's router owns the address; move to the section without changing it.
                  event.preventDefault();
                  document.getElementById(calculator.id)?.scrollIntoView({ block: "start" });
                  document.getElementById(`${calculator.id}-title`)?.focus({ preventScroll: true });
                }}
                className="inline-flex min-h-11 items-center text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 md:min-h-8"
              >
                {calculator.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid">{children}</div>
      {footer ? <div className="mt-10 border-t border-border pt-4 text-small text-ink-muted">{footer}</div> : null}
    </Page>
  );
}

/** One calculator: a heading, a line on what it is for, its inputs, its answer and how it is worked out. */
export function Calculator({
  id,
  title,
  intro,
  className,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-16 border-t border-border py-8 first:border-t-0 first:pt-2", className)}
    >
      <h2 id={`${id}-title`} tabIndex={-1} className="font-title text-heading text-ink outline-none">
        {title}
      </h2>
      {intro ? <div className="mt-1.5 mb-5 max-w-[60ch] text-body text-ink-muted">{intro}</div> : <div className="mb-5" />}
      {children}
    </section>
  );
}
