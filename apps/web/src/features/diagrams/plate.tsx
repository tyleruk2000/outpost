/**
 * Diagrams: the plates of a field guide, drawn as SVG in React from the app's tokens.
 * Every diagram in Outpost is made of these few parts, so that the next one matches.
 *
 * The language, once:
 *
 * - **Size.** A plate is drawn at the width it is given, in CSS pixels, not scaled from a
 *   fixed picture, so a label is always the size of the text beside it. Its layout reads
 *   the root font size too (`box.rem`): at 150% or 200% text the words grow and the
 *   drawing makes room for them.
 * - **Lines, by what they are.** `object` (1.5 px, ink): a thing you hold or build, a
 *   stick, a dial, a gnomon. `guide` (1 px, muted ink): a line of construction, a ray, an
 *   axis. `sight` (1 px, muted ink, dashed 4 3): an imagined line, a line of sight, a
 *   direction to something off the plate. `subject` (2 px, the one accent): what the
 *   plate is about, the reading taken or the answer. Ends are round.
 * - **Arrowheads** are open, two strokes at 28° either side, in the stroke of their line.
 * - **An angle** is an arc in the accent from one line to the other, its value outside
 *   the arc on the bisector.
 * - **Ground** is a line with short hatching under it, as in a technical drawing.
 * - **The sun** is the astronomer's sign ☉: a ring with a dot. Stars are dots sized by
 *   brightness; Polaris has a ring.
 * - **Labels** are real text in the app's face at the small size (never smaller), muted
 *   ink for names and ink for figures, upright, haloed in the page colour where they sit
 *   on a line. Each plate keeps its labels apart itself; the end-to-end suite checks it.
 * - **A spread** (how far a result can be out) is a band in the accent's soft tint with
 *   its edges dashed, never a single point.
 * - **Numbers** only where the parts are steps in order.
 * - **Words.** Every plate is a `figure` with a caption a person would want to read and,
 *   for a screen reader, a description of what the picture shows that the caption does
 *   not already say.
 *
 * Nothing moves. There is no canvas, no image and no timer; a plate costs nothing at rest.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type Anchor, arcPath, bisector, chevron, type Point, polar } from "./geometry";

export interface PlateBox {
  /** The width of the plate in CSS pixels. */
  width: number;
  /** The root font size in CSS pixels: 16 at ordinary text size. */
  rem: number;
  /** The size of a label in CSS pixels (the small text size). */
  font: number;
}

const FALLBACK_WIDTH = 358;

/** The plate's width and the text size, measured, and measured again when either changes. */
function usePlateBox(): [React.RefObject<HTMLDivElement | null>, React.RefObject<HTMLSpanElement | null>, PlateBox] {
  const ref = useRef<HTMLDivElement | null>(null);
  const remRef = useRef<HTMLSpanElement | null>(null);
  const [box, setBox] = useState<PlateBox>({ width: FALLBACK_WIDTH, rem: 16, font: 14 });
  useEffect(() => {
    const element = ref.current;
    const unit = remRef.current;
    if (!element || !unit || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = Math.round(element.getBoundingClientRect().width);
      const rem = unit.getBoundingClientRect().width || 16;
      if (width > 0) setBox((old) => (old.width === width && old.rem === rem ? old : { width, rem, font: rem * 0.875 }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(unit);
    measure();
    return () => observer.disconnect();
  }, []);
  return [ref, remRef, box];
}

export interface PlateProps {
  /** A short name for tests and the end-to-end layout check: `data-diagram`. */
  name: string;
  /** What a person reads under the picture. */
  caption: ReactNode;
  /** What the picture shows, for a screen reader: not the caption again. */
  description: string;
  /** The plate's height for a box. */
  height: (box: PlateBox) => number;
  /** The widest the plate may be, in rem; it is as wide as its column otherwise. */
  maxWidth?: number;
  children: (box: PlateBox) => ReactNode;
  className?: string;
}

export function Plate({ name, caption, description, height, maxWidth, children, className }: PlateProps) {
  const [ref, remRef, box] = usePlateBox();
  const captionId = useId();
  const descriptionId = useId();
  const h = Math.max(1, Math.round(height(box)));
  return (
    <figure data-diagram={name} className={cn("my-5", className)}>
      <div ref={ref} className="relative" style={maxWidth ? { maxWidth: `${maxWidth}rem` } : undefined}>
        <span ref={remRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 h-0 w-[1rem]" />
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: named by the figure's caption and described by its own paragraph, through aria-labelledby and aria-describedby */}
        <svg
          role="img"
          aria-labelledby={captionId}
          aria-describedby={descriptionId}
          width={box.width}
          height={h}
          viewBox={`0 0 ${box.width} ${h}`}
          className="block h-auto max-w-full overflow-visible select-none"
          style={{ fontSize: box.font }}
        >
          {children(box)}
        </svg>
      </div>
      <figcaption id={captionId} className="mt-2 max-w-[62ch] text-small text-ink-muted">
        {caption}
      </figcaption>
      <p id={descriptionId} className="sr-only">
        {description}
      </p>
    </figure>
  );
}

// ── Strokes ─────────────────────────────────────────────────────────────────

export type Stroke = "object" | "guide" | "sight" | "subject" | "subject-sight";

const STROKES: Record<Stroke, { className: string; width: number; dash?: string }> = {
  object: { className: "stroke-ink", width: 1.5 },
  guide: { className: "stroke-ink-muted", width: 1 },
  sight: { className: "stroke-ink-muted", width: 1, dash: "4 3" },
  subject: { className: "stroke-primary", width: 2 },
  "subject-sight": { className: "stroke-primary", width: 1.5, dash: "5 3" },
};

const strokeProps = (stroke: Stroke) => {
  const style = STROKES[stroke];
  return {
    className: style.className,
    strokeWidth: style.width,
    strokeDasharray: style.dash,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
};

export function Line({ from, to, stroke = "guide" }: { from: Point; to: Point; stroke?: Stroke }) {
  return <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} {...strokeProps(stroke)} />;
}

export function Path({ d, stroke = "guide", fill }: { d: string; stroke?: Stroke; fill?: string }) {
  const props = strokeProps(stroke);
  return <path d={d} {...props} className={cn(props.className, fill)} fill={fill ? undefined : "none"} />;
}

/** A line with an open arrowhead at its end (and at its start too with `both`). */
export function Arrow({ from, to, stroke = "guide", both = false }: { from: Point; to: Point; stroke?: Stroke; both?: boolean }) {
  const size = stroke === "subject" ? 8 : 7;
  return (
    <g>
      <Line from={from} to={to} stroke={stroke} />
      <path d={chevron(to, from, size)} {...strokeProps(stroke === "sight" ? "guide" : stroke === "subject-sight" ? "subject" : stroke)} />
      {both ? (
        <path
          d={chevron(from, to, size)}
          {...strokeProps(stroke === "sight" ? "guide" : stroke === "subject-sight" ? "subject" : stroke)}
        />
      ) : null}
    </g>
  );
}

/** Ground: a level line with hatching under it. */
export function Ground({ x1, x2, y, step = 8 }: { x1: number; x2: number; y: number; step?: number }) {
  const ticks: string[] = [];
  for (let x = x1 + step / 2; x < x2; x += step) ticks.push(`M${x.toFixed(1)},${(y + 1).toFixed(1)}l-5,6`);
  return (
    <g>
      <path d={ticks.join("")} className="stroke-ink-muted" strokeWidth={1} strokeLinecap="round" fill="none" />
      <line x1={x1} y1={y} x2={x2} y2={y} className="stroke-ink-muted" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
}

/** The sun, as the astronomer's sign: a ring with a dot. */
export function SunSign({ at, r = 8, accent = false }: { at: Point; r?: number; accent?: boolean }) {
  return (
    <g>
      <circle cx={at[0]} cy={at[1]} r={r + 3} className="fill-page" />
      <circle cx={at[0]} cy={at[1]} r={r} className={cn("fill-page", accent ? "stroke-primary" : "stroke-ink")} strokeWidth={1.5} />
      <circle cx={at[0]} cy={at[1]} r={Math.max(1.5, r / 4)} className={accent ? "fill-primary" : "fill-ink"} />
    </g>
  );
}

/** A star: a dot sized by its brightness (visual magnitude); Polaris and the like get a ring. */
export function StarDot({ at, magnitude, ring = false }: { at: Point; magnitude: number; ring?: boolean }) {
  const r = Math.max(1.6, 4.2 - magnitude * 0.9);
  return (
    <g>
      <circle cx={at[0]} cy={at[1]} r={r + 2} className="fill-page" />
      <circle cx={at[0]} cy={at[1]} r={r} className="fill-ink" />
      {ring ? <circle cx={at[0]} cy={at[1]} r={r + 4} className="stroke-ink" strokeWidth={1} fill="none" /> : null}
    </g>
  );
}

/** A point marked on the ground or on a line: a filled dot with a page-coloured edge. */
export function Mark({ at, accent = false, r = 4 }: { at: Point; accent?: boolean; r?: number }) {
  return <circle cx={at[0]} cy={at[1]} r={r} strokeWidth={2} className={cn("stroke-page", accent ? "fill-primary" : "fill-ink")} />;
}

/**
 * An angle between two directions from a point (clockwise from up): an arc in the accent
 * and its value outside it on the bisector. `label` may be null to draw the arc alone.
 */
export function Angle({
  at,
  from,
  to,
  r,
  label,
  font,
  stroke = "subject",
  clockwise = false,
  labelAt,
}: {
  at: Point;
  from: number;
  to: number;
  r: number;
  label: string | null;
  font: number;
  stroke?: Stroke;
  /** Turn clockwise from `from` to `to` however far, as a bearing is measured; the short way otherwise. */
  clockwise?: boolean;
  /** Where round the arc its value goes, if not on the bisector (a long arc's value sits best near its end). */
  labelAt?: number;
}) {
  const middle = labelAt ?? bisector(from, to, clockwise);
  const [lx, ly] = polar(at[0], at[1], r + font * 0.6, middle);
  const s = Math.sin(middle * (Math.PI / 180));
  const anchor: Anchor = s > 0.35 ? "start" : s < -0.35 ? "end" : "middle";
  const c = Math.cos(middle * (Math.PI / 180));
  return (
    <g>
      <Path d={arcPath(at[0], at[1], r, from, to, clockwise)} stroke={stroke} />
      {label ? (
        <Label at={[lx, ly - (anchor === "middle" ? (c > 0 ? font * 0.35 : -font * 0.35) : 0)]} anchor={anchor} tone="figure">
          {label}
        </Label>
      ) : null}
    </g>
  );
}

/** A label: one line of real text, centred on its y. `tone` is "name" (muted), "figure" (ink, tabular) or "accent". */
export function Label({
  at,
  anchor = "start",
  tone = "name",
  halo = true,
  children,
}: {
  at: Point;
  anchor?: Anchor;
  tone?: "name" | "figure" | "accent";
  halo?: boolean;
  children: ReactNode;
}) {
  return (
    <text
      x={at[0]}
      y={at[1]}
      textAnchor={anchor}
      dominantBaseline="central"
      data-label
      className={cn(
        "text-small",
        tone === "name" ? "fill-ink-muted" : tone === "accent" ? "fill-primary font-semibold" : "fill-ink font-semibold tabular",
        halo && "stroke-page [paint-order:stroke] [stroke-linejoin:round] [stroke-width:4px]",
      )}
    >
      {children}
    </text>
  );
}

/** A spread: a band in the accent's tint with dashed edges, from x1 to x2 between y1 and y2. */
export function Spread({ x1, x2, y1, y2 }: { x1: number; x2: number; y1: number; y2: number }) {
  const left = Math.min(x1, x2);
  const width = Math.max(1, Math.abs(x2 - x1));
  return (
    <g>
      <rect x={left} y={y1} width={width} height={y2 - y1} className="fill-primary-soft" />
      {width < 10 ? null : (
        <>
          <line x1={left} x2={left} y1={y1} y2={y2} className="stroke-primary" strokeWidth={1} strokeDasharray="3 3" />
          <line x1={left + width} x2={left + width} y1={y1} y2={y2} className="stroke-primary" strokeWidth={1} strokeDasharray="3 3" />
        </>
      )}
    </g>
  );
}

/** A bar of a known length on the ground, for scale: "1 m". */
export function ScaleBar({ at, length, label, font }: { at: Point; length: number; label: string; font: number }) {
  const [x, y] = at;
  return (
    <g>
      <path
        d={`M${x},${y - 4}V${y}H${x + length}V${y - 4}`}
        className="stroke-ink-muted"
        strokeWidth={1}
        fill="none"
        strokeLinejoin="round"
      />
      <Label at={[x + length + font * 0.4, y - 2]} anchor="start">
        {label}
      </Label>
    </g>
  );
}

/** Steps in order, each a small plate and a sentence: an ordered list, numbered because the steps are a sequence. */
export function StepPlates({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <ol aria-label={label} data-diagram={name} className="my-5 grid list-none gap-5 p-0 sm:grid-cols-3 sm:gap-4">
      {children}
    </ol>
  );
}
