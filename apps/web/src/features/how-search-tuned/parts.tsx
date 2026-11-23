/** The small parts every section of "How search was tuned" is made of. */
import type { ReactNode } from "react";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";

export const linkClass = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

/** A part of the page: a level-2 heading over a hairline. */
export function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 scroll-mt-24 border-t border-border pt-8 first:mt-0">
      <h2 id={`${id}-title`} className="mb-4 font-title text-heading text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Sub({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mt-8 mb-3 scroll-mt-24 text-lead font-semibold text-ink">
      {children}
    </h3>
  );
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `prose ${className}` : "prose"}>{children}</div>;
}

/** A formula or a sum, set apart in the functional face, wrapping on a phone. */
export function Sum({ children }: { children: ReactNode }) {
  return (
    <p className="tabular my-4 max-w-[62ch] rounded-panel bg-surface px-4 py-3 text-body text-ink [overflow-wrap:anywhere]">{children}</p>
  );
}

/** A table of figures: a row per line, each cell named by its column for the phone's stacked rows. */
export function Figures({
  label,
  head,
  rows,
  numeric = [],
  prose = false,
}: {
  label: string;
  head: string[];
  rows: ReactNode[][];
  /** Columns of figures, set right. */
  numeric?: number[];
  /** Cells of sentences: on a phone, each column's name above its text rather than beside it. */
  prose?: boolean;
}) {
  return (
    <div className="my-5">
      <Table label={label} stack>
        <TableHead>
          <Tr>
            {head.map((name, index) => (
              <Th key={name} numeric={numeric.includes(index)}>
                {name}
              </Th>
            ))}
          </Tr>
        </TableHead>
        <tbody>
          {rows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed rows, never reordered
            <Tr key={index}>
              {row.map((cell, column) => (
                <Td
                  key={head[column]}
                  label={head[column]}
                  numeric={numeric.includes(column)}
                  className={prose ? "max-sm:!block max-sm:!text-left max-sm:before:!block" : undefined}
                >
                  {cell}
                </Td>
              ))}
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/** One change: what was wrong, how it was known, what was done, and what was measured after. */
export function Step({
  id,
  title,
  problem,
  evidence,
  change,
  result,
  children,
}: {
  id: string;
  title: string;
  problem: ReactNode;
  evidence: ReactNode;
  change: ReactNode;
  result: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-8 scroll-mt-24 border-t border-border pt-6 first:mt-4">
      <h3 id={`${id}-title`} className="mb-3 text-lead font-semibold text-ink">
        {title}
      </h3>
      <dl className="grid gap-y-3 text-body text-ink">
        {(
          [
            ["Problem", problem],
            ["Evidence", evidence],
            ["Change", change],
            ["Measured after", result],
          ] as const
        ).map(([name, body]) => (
          <div key={name} className="grid gap-x-6 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="font-semibold text-ink-muted">{name}</dt>
            <dd className="min-w-0 max-w-[62ch] [&_p+p]:mt-2 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">{body}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}
