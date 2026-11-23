/**
 * The frame every figure on the page shares: a title that says what it shows, a line
 * that reads it, a legend when there is more than one series, and a table of the same
 * numbers for screen readers.
 */
import type { ExplainResponse } from "@outpost/shared";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/page";
import { cn } from "@/lib/utils";
import { useTraceState } from "../data";

export function Figure({
  id,
  title,
  reading,
  legend,
  footnote,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  /** One line that reads the figure for the reader: what its numbers say right now. */
  reading?: ReactNode;
  legend?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure id={id} aria-labelledby={`${id}-title`} className={cn("understand-figure", className)}>
      <figcaption className="mb-4">
        <p id={`${id}-title`} className="text-body font-semibold text-ink">
          {title}
        </p>
        {reading ? <p className="mt-1 max-w-[68ch] text-small text-ink-muted">{reading}</p> : null}
      </figcaption>
      {legend ? <div className="mb-3">{legend}</div> : null}
      {children}
      {footnote ? <p className="mt-3 max-w-[68ch] text-small text-ink-muted">{footnote}</p> : null}
    </figure>
  );
}

export type Swatch = "bar" | "line" | "dot" | "ring" | "diamond" | "square" | "dashed" | "triangle";

/** A key for the marks. Names stay in ink; the coloured mark beside each carries identity. */
export function Legend({
  items,
  className,
  label = "Key",
}: {
  items: Array<{ label: ReactNode; color: string; swatch?: Swatch }>;
  className?: string;
  label?: string;
}) {
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-muted", className)}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered key
        <li key={index} className="flex items-center gap-2">
          <LegendMark color={item.color} swatch={item.swatch ?? "bar"} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function LegendMark({ color, swatch }: { color: string; swatch: Swatch }) {
  const style = { background: color };
  switch (swatch) {
    case "line":
      return <span aria-hidden className="h-0.5 w-4 shrink-0 rounded-full" style={style} />;
    case "dashed":
      return <span aria-hidden className="h-0 w-4 shrink-0 border-t-2 border-dashed" style={{ borderColor: color }} />;
    case "dot":
      return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={style} />;
    case "ring":
      return <span aria-hidden className="size-3 shrink-0 rounded-full border-2" style={{ borderColor: color }} />;
    case "diamond":
      return <span aria-hidden className="size-2.5 shrink-0 rotate-45 rounded-[1px]" style={style} />;
    case "square":
      return <span aria-hidden className="size-2.5 shrink-0" style={style} />;
    case "triangle":
      return (
        <span
          aria-hidden
          className="size-0 shrink-0 border-x-[5px] border-b-[9px] border-x-transparent"
          style={{ borderBottomColor: color }}
        />
      );
    default:
      return <span aria-hidden className="h-2.5 w-3.5 shrink-0 rounded-[2px]" style={style} />;
  }
}

/** The figure's numbers as a table, for people who cannot see the drawing. */
export function HiddenTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
}) {
  return (
    // A table ignores the width that hides it, so the hiding goes on a wrapper.
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are a fixed, ordered list
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells follow the columns
                <td key={cellIndex}>{cell ?? "none"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type Shape = "bars" | "strip" | "scatter" | "bump" | "bar" | "text" | "ribbon" | "columns";

function ShapeBlocks({ shape, block }: { shape: Shape; block: string }) {
  switch (shape) {
    case "bar":
      return <div className={cn("h-7 w-full", block)} />;
    case "ribbon":
      return (
        <div className="grid gap-1">
          <div className={cn("h-3 w-full", block)} />
          <div className={cn("h-3 w-[94%] justify-self-end", block)} />
        </div>
      );
    case "strip":
      return (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className={cn("h-6 w-full", block)} />
          ))}
        </div>
      );
    case "scatter":
      return <div className={cn("aspect-[16/10] max-h-[26rem] w-full", block)} />;
    case "bump":
      return (
        <div className="grid grid-cols-[2rem_1fr_2rem] gap-10">
          {[0, 1, 2].map((column) => (
            <div key={column} className="grid gap-2">
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div key={row} className={cn("h-4", block)} />
              ))}
            </div>
          ))}
        </div>
      );
    case "columns":
      return (
        <div className="flex h-32 items-end gap-1">
          {[20, 34, 52, 78, 100, 64, 30, 12].map((height, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder bars
            <div key={index} className={cn("flex-1", block)} style={{ height: `${height}%` }} />
          ))}
        </div>
      );
    case "text":
      return (
        <div className="grid gap-2">
          {[100, 96, 88, 97, 60].map((width, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder lines
            <div key={index} className={cn("h-3.5", block)} style={{ width: `${width}%` }} />
          ))}
        </div>
      );
    default:
      return (
        <div className="grid gap-3">
          {[92, 74, 61, 43, 30].map((width, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder bars
            <div key={index} className={cn("h-4", block)} style={{ width: `${width}%` }} />
          ))}
        </div>
      );
  }
}

/** A figure while it loads: shimmering blocks in the figure's own shape. */
export function FigureSkeleton({ shape }: { shape: Shape }) {
  return (
    <div aria-busy className="py-1">
      <span className="sr-only">Loading</span>
      <div aria-hidden>
        <ShapeBlocks shape={shape} block="skeleton" />
      </div>
    </div>
  );
}

/** A figure before any question has been traced: its outline, and what will fill it. */
export function FigureInvitation({ shape, children, empty }: { shape: Shape; children: ReactNode; empty?: boolean }) {
  const link = "font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";
  return (
    <div className="relative py-1">
      <div aria-hidden className="opacity-70">
        <ShapeBlocks shape={shape} block="rounded-control border border-dashed border-border-strong" />
      </div>
      <p className="mt-3 text-small text-ink-muted">
        {children}{" "}
        {empty ? (
          <>
            <a href="#question" className={link}>
              Add something to your library
            </a>{" "}
            and this will be drawn from it.
          </>
        ) : (
          <>
            <a href="#question" className={link}>
              Trace a question
            </a>{" "}
            to fill this in.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Wraps a figure drawn from the traced question. Before a question: the outline and an
 * invitation. While loading: a skeleton. On failure: the error and a retry, for this
 * figure only. While a new question is loading, the previous drawing stays, dimmed.
 */
export function FromTrace({
  shape,
  invitation,
  children,
}: {
  shape: Shape;
  invitation: ReactNode;
  children: (trace: ExplainResponse) => ReactNode;
}) {
  const { query, trace, empty } = useTraceState();
  if (!query || empty) {
    return (
      <FigureInvitation shape={shape} empty={empty}>
        {invitation}
      </FigureInvitation>
    );
  }
  if (trace.isError && !trace.isFetching) return <ErrorState error={trace.error} onRetry={() => void trace.refetch()} />;
  if (!trace.data) return <FigureSkeleton shape={shape} />;
  return <div className={cn("transition-opacity", trace.isPlaceholderData && "opacity-50")}>{children(trace.data)}</div>;
}

/** Reading prose: the serif, the reading measure. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("prose", className)}>{children}</div>;
}

/** An axis caption in the functional face. */
export function AxisNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-micro text-ink-muted", className)}>{children}</p>;
}
