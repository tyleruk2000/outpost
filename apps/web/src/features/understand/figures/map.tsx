import type { ProjectionPoint, ProjectionResponse } from "@outpost/shared";
import { type KeyboardEvent, memo, type PointerEvent, useMemo, useRef, useState } from "react";
import { kindMeta } from "@/components/search-hit";
import { formatNumber, plural } from "@/lib/utils";
import { COLOR } from "../charts/colors";
import { AxisNote, HiddenTable, Legend, type Swatch, useMeasure } from "../charts/figure";
import { Tip, TipBody, useTip } from "../charts/tip";
import { fitFrame, keptShare, type MapFrame, nearestPoint, tourOrder } from "../lib/map";
import { formatShare } from "../lib/scale";

type Mark = "document" | "note" | "other";
const markOf = (kind: string): Mark => (kind === "document" ? "document" : kind === "note" ? "note" : "other");
const MARKS: Record<Mark, { label: string; swatch: Swatch }> = {
  document: { label: "A passage from a document", swatch: "dot" },
  note: { label: "A passage from one of your pages", swatch: "square" },
  other: { label: "Something else in the index", swatch: "triangle" },
};

function Glyph({
  mark,
  x,
  y,
  size,
  fill,
  stroke = COLOR.page,
  strokeWidth = 1,
}: {
  mark: Mark;
  x: number;
  y: number;
  size: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  if (mark === "note")
    return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  if (mark === "other") {
    const s = size * 1.25;
    return (
      <path
        d={`M${x},${y - s} L${x + s},${y + s * 0.8} L${x - s},${y + s * 0.8} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  return <circle cx={x} cy={y} r={size} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

/** Every point, drawn once. Hovering never re-renders this layer. */
const Points = memo(function Points({ points, placed }: { points: ProjectionPoint[]; placed: Array<{ x: number; y: number }> }) {
  return (
    <g>
      {points.map((point, index) => (
        <Glyph key={point.chunkId} mark={markOf(point.kind)} x={placed[index]!.x} y={placed[index]!.y} size={4} fill={COLOR.other} />
      ))}
    </g>
  );
});

export function mapReading(data: ProjectionResponse): string {
  const kept = keptShare(data.explained);
  const drawn =
    data.shown < data.total
      ? `${formatNumber(data.shown)} of the ${formatNumber(data.total)} passages are drawn, evenly sampled.`
      : `All ${plural(data.shown, "passage")} are drawn.`;
  return `${drawn} Each vector has ${formatNumber(data.dimensions ?? 0)} numbers; the two axes here keep ${formatShare(kept)} of how the vectors differ and lose the other ${formatShare(1 - kept)}.`;
}

/**
 * Passage vectors flattened to two dimensions. Marks that are close together have
 * similar vectors, as far as two axes can show it.
 */
export function VectorMap({ data }: { data: ProjectionResponse }) {
  const [ref, width] = useMeasure<HTMLDivElement>(720);
  const tip = useTip();
  const frameRequest = useRef(0);
  const [active, setActive] = useState<number | null>(null);
  const height = Math.round(Math.max(280, Math.min(480, width * 0.62)));
  const { points, query } = data;

  const frame: MapFrame = useMemo(() => fitFrame(query ? [...points, query] : points, width, height, 26), [points, query, width, height]);
  const placed = useMemo(() => points.map((point) => ({ x: frame.toX(point.x), y: frame.toY(point.y) })), [points, frame]);
  const order = useMemo(() => tourOrder(points), [points]);
  const marks = useMemo(
    () => (["document", "note", "other"] as const).filter((mark) => points.some((point) => markOf(point.kind) === mark)),
    [points],
  );
  const queryAt = query ? { x: frame.toX(query.x), y: frame.toY(query.y) } : null;
  const nearest = points.map((point, index) => ({ point, index })).filter((item) => item.point.nearest);

  const describe = (index: number) => {
    const point = points[index]!;
    return (
      <TipBody value={point.similarity !== null ? `cosine ${point.similarity.toFixed(2)}` : undefined} label={point.title}>
        <p>
          {kindMeta[point.kind]?.label ?? point.kind}
          {point.nearest ? " · one of the nearest to your question" : ""}
        </p>
        <p className="mt-1 line-clamp-4 text-ink">{point.excerpt}</p>
      </TipBody>
    );
  };
  const show = (index: number, svg: Element) => {
    const box = svg.getBoundingClientRect();
    setActive(index);
    tip.show({ clientX: box.left + placed[index]!.x, clientY: box.top + placed[index]!.y - 8 }, describe(index));
  };
  const clear = () => {
    setActive(null);
    tip.hide();
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(() => {
      const box = svg.getBoundingClientRect();
      const index = nearestPoint(placed, clientX - box.left, clientY - box.top, 24);
      if (index === -1) clear();
      else if (index !== active) show(index, svg);
    });
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") return clear();
    const move =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!move || order.length === 0) return;
    event.preventDefault();
    const position = active === null ? -1 : order.indexOf(active);
    show(order[(position + move + order.length) % order.length]!, event.currentTarget);
  };

  const activePoint = active !== null ? points[active] : undefined;

  return (
    <div ref={tip.boxRef} className="relative">
      <Legend
        className="mb-3"
        items={[
          ...marks.map((mark) => ({ label: MARKS[mark].label, color: COLOR.other, swatch: MARKS[mark].swatch })),
          ...(queryAt ? [{ label: "Your question", color: COLOR.query, swatch: "diamond" as const }] : []),
          ...(nearest.length > 0
            ? [{ label: "The nearest passages by cosine similarity", color: COLOR.meaning, swatch: "ring" as const }]
            : []),
        ]}
      />
      <div ref={ref} className="rounded-panel border border-border">
        <svg
          width={width}
          height={height}
          role="img"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the points can be visited with the arrow keys
          tabIndex={0}
          aria-label={`A map of ${plural(points.length, "passage")}. Use the arrow keys to visit them${query ? ", starting with those most similar to your question" : ""}.`}
          className="understand-plot block max-w-full rounded-panel"
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            cancelAnimationFrame(frameRequest.current);
            clear();
          }}
          onFocus={(event) => order.length > 0 && show(active ?? order[0]!, event.currentTarget)}
          onBlur={clear}
          onKeyDown={onKeyDown}
        >
          {queryAt
            ? nearest.map(({ point, index }) => (
                <line
                  key={`link-${point.chunkId}`}
                  x1={queryAt.x}
                  y1={queryAt.y}
                  x2={placed[index]!.x}
                  y2={placed[index]!.y}
                  stroke={COLOR.meaning}
                  strokeWidth={1}
                  opacity={0.7}
                />
              ))
            : null}
          <Points points={points} placed={placed} />
          {nearest.map(({ point, index }) => (
            <circle
              key={`ring-${point.chunkId}`}
              cx={placed[index]!.x}
              cy={placed[index]!.y}
              r={8}
              fill="none"
              stroke={COLOR.meaning}
              strokeWidth={2}
            />
          ))}
          {activePoint
            ? points.map((point, index) =>
                point.title === activePoint.title && index !== active ? (
                  <Glyph
                    key={`same-${point.chunkId}`}
                    mark={markOf(point.kind)}
                    x={placed[index]!.x}
                    y={placed[index]!.y}
                    size={4}
                    fill={COLOR.inkMuted}
                  />
                ) : null,
              )
            : null}
          {queryAt ? (
            <path
              d={`M${queryAt.x},${queryAt.y - 8} L${queryAt.x + 8},${queryAt.y} L${queryAt.x},${queryAt.y + 8} L${queryAt.x - 8},${queryAt.y} Z`}
              fill={COLOR.query}
              stroke={COLOR.page}
              strokeWidth={2}
            />
          ) : null}
          {active !== null ? (
            <Glyph
              mark={markOf(points[active]!.kind)}
              x={placed[active]!.x}
              y={placed[active]!.y}
              size={5.5}
              fill={COLOR.ink}
              strokeWidth={2}
            />
          ) : null}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-6 gap-y-1">
        <AxisNote>
          Across: the direction in which the vectors differ most ({formatShare(data.explained[0])} of the variation). Up: the next (
          {formatShare(data.explained[1])}). The units mean nothing by themselves; only nearness does.
        </AxisNote>
      </div>
      <p aria-live="polite" className="mt-1 min-h-5 text-small text-ink-muted">
        {activePoint
          ? `Darker marks are other passages from “${activePoint.title}”.`
          : "Point at a mark, or focus the map and use the arrow keys, to read a passage."}
      </p>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption={query ? "The passages nearest the question, of those drawn on the map" : "The first passages drawn on the map"}
        columns={["Passage from", "Kind", "Cosine similarity to the question", "Starts"]}
        rows={(nearest.length > 0 ? nearest.map((item) => item.point) : points.slice(0, 12)).map((point) => [
          point.title,
          kindMeta[point.kind]?.label ?? point.kind,
          point.similarity === null ? null : point.similarity.toFixed(2),
          point.excerpt,
        ])}
      />
    </div>
  );
}
