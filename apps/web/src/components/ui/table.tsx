/**
 * A table of figures or facts, drawn one way everywhere: a quiet head, hairlines between rows, figures in tabular
 * numerals and set right so that their places line up, a row lit faintly under the pointer when it leads somewhere.
 *
 *   <Table label="Batteries" stack sticky>
 *     <TableHead><Tr><Th>Name</Th><Th numeric>Capacity</Th></Tr></TableHead>
 *     <tbody><Tr><Td label="Name">Leisure</Td><Td label="Capacity" numeric>110 Ah</Td></Tr></tbody>
 *   </Table>
 *
 * - `stack`: on a phone (under 640 px) each row becomes a block, every cell on a line of its own with its column's
 *   name (`label`) before it, instead of a table wider than the screen. Without it, a table wider than its room
 *   scrolls sideways inside a frame that the keyboard can reach and a screen reader names.
 * - `sticky`: the head stays in view while a long table scrolls under it (and under the phone's top bar).
 * - A list of things a person opens is `Rows`, not a table: a table is for comparing across columns.
 */
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Table({
  label,
  stack,
  sticky,
  className,
  children,
  ...props
}: ComponentProps<"table"> & {
  /** What the table is, for a screen reader, and for the frame it scrolls in. */
  label: string;
  /** Each row a block of its own on a phone. Give each cell its column's name with `label`. */
  stack?: boolean;
  /** The head stays in view while the table scrolls under it. */
  sticky?: boolean;
  children: ReactNode;
}) {
  const table = (
    <table
      aria-label={label}
      data-stack={stack || undefined}
      data-sticky={sticky || undefined}
      className={cn("outpost-table w-full text-left text-small", className)}
      {...props}
    >
      {children}
    </table>
  );
  // A sticky head needs the page to scroll, not a frame round the table; a stacked table never runs wider than its room.
  if (sticky || stack) return table;
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a frame that scrolls sideways must be reachable by keyboard to be scrolled (WCAG 2.1.1)
    <section aria-label={label} tabIndex={0} className="scroll-quiet max-w-full overflow-x-auto">
      {table}
    </section>
  );
}

export function TableHead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("text-ink-muted", className)} {...props} />;
}

/** A row. `interactive` lights it under the pointer: for a row that opens something when pressed. */
export function Tr({ className, interactive, ...props }: ComponentProps<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      className={cn("border-b border-border", interactive && "transition-colors duration-(--duration-fast) hover:bg-surface", className)}
      {...props}
    />
  );
}

/** A column's name. `numeric` sets it right, over figures. */
export function Th({ className, numeric, ...props }: ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn("px-3 py-2 align-bottom font-medium first:pl-0 last:pr-0", numeric && "text-right", className)}
      {...props}
    />
  );
}

/**
 * A cell. `numeric`: tabular figures, set right. `label`: its column's name, shown before it when the table is
 * stacked on a phone (and only then).
 */
export function Td({ className, numeric, label, ...props }: ComponentProps<"td"> & { numeric?: boolean; label?: string }) {
  return (
    <td
      data-label={label}
      className={cn("px-3 py-2.5 align-top text-ink first:pl-0 last:pr-0", numeric && "tabular text-right", className)}
      {...props}
    />
  );
}
