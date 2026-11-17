import type { ExplainResponse } from "@outpost/shared";
import { type KeyboardEvent, useState } from "react";
import { useWidth } from "@/lib/use-width";
import { formatNumber } from "@/lib/utils";
import { COLOR, passageName } from "../charts/colors";
import { HiddenTable, Legend } from "../charts/figure";
import { Tip, TipBody, useTip } from "../charts/tip";
import { agreement, peak } from "../lib/cosine";
import { clamp } from "../lib/scale";

const STRIP = 34;
const HALF = STRIP / 2;
const TICKS = 7;

export function stripsReading(trace: ExplainResponse): string {
  const { queryVector, dimensions, hits } = trace.semantic;
  const lit = queryVector.filter((value) => value !== 0).length;
  const first = hits[0];
  const start = `These are the first ${queryVector.length} of the ${formatNumber(dimensions ?? queryVector.length)} numbers in each vector. ${lit} of the question’s are not zero.`;
  if (!first) return start;
  const shared = agreement(queryVector, first.vector).agreeing;
  return `${start} The closest passage agrees with the question at ${shared} of these positions.`;
}

/**
 * The start of the question's vector, and of the closest passages' vectors, as rows of
 * small bars: up for a positive number, down for a negative one. Rows are aligned, so a
 * column where two rows both rise (or both fall) is a place where the two vectors agree.
 */
export function VectorStrips({ trace, rows = 4 }: { trace: ExplainResponse; rows?: number }) {
  const [ref, width] = useWidth(720);
  const tip = useTip();
  const [cursor, setCursor] = useState<number | null>(null);
  const query = trace.semantic.queryVector;
  const hits = trace.semantic.hits.slice(0, rows);
  const count = query.length;
  const column = width / Math.max(1, count);
  const bar = Math.max(1.5, column - 2);
  const total = trace.semantic.dimensions ?? count;

  const series = [
    { key: "query", name: "Your question", similarity: null as number | null, values: query, color: COLOR.query },
    ...hits.map((hit) => ({
      key: String(hit.chunkId),
      name: `${hit.rank}. ${passageName(hit)}`,
      similarity: hit.similarity as number | null,
      values: hit.vector,
      color: COLOR.meaning,
    })),
  ];

  const showColumn = (index: number, element: Element, row: number) => {
    const box = element.getBoundingClientRect();
    const item = series[row]!;
    const value = item.values[index] ?? 0;
    const product = row === 0 ? null : value * (query[index] ?? 0);
    setCursor(index);
    tip.show(
      { clientX: box.left + (index + 0.5) * column, clientY: box.top },
      <TipBody label={`Position ${index + 1} of ${formatNumber(total)}`}>
        <ul className="grid gap-0.5 text-small">
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: COLOR.query }} />
            <span className="tabular font-semibold text-ink">{(query[index] ?? 0).toFixed(3)}</span> your question
          </li>
          {row > 0 ? (
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: COLOR.meaning }} />
              <span className="tabular font-semibold text-ink">{value.toFixed(3)}</span> this passage
            </li>
          ) : null}
        </ul>
        {product !== null ? (
          <p className="mt-1">
            Multiplied together: <span className="tabular text-ink">{product.toFixed(3)}</span>
            {product > 0
              ? ", which pulls the two together."
              : product < 0
                ? ", which pushes them apart."
                : ", so this position adds nothing."}
          </p>
        ) : null}
      </TipBody>,
    );
  };
  const clear = () => {
    setCursor(null);
    tip.hide();
  };
  const onKeyDown = (row: number) => (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") return clear();
    const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    event.preventDefault();
    showColumn(clamp((cursor ?? -1) + move, 0, count - 1), event.currentTarget, row);
  };

  return (
    <div ref={tip.boxRef} className="relative">
      <Legend
        className="mb-4"
        items={[
          { label: "Your question’s numbers", color: COLOR.query },
          { label: "A passage’s numbers", color: COLOR.meaning },
          { label: "Both lean the same way here", color: COLOR.ink, swatch: "dot" },
        ]}
      />
      <div ref={ref} className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {series.map((item, row) => {
          const top = peak(item.values) || 1;
          const agree = row === 0 ? null : agreement(query, item.values);
          return (
            <div key={item.key} className="min-w-0">
              <p className="mb-1 flex items-baseline justify-between gap-4 text-small">
                <span className="min-w-0 truncate font-medium text-ink">{item.name}</span>
                {item.similarity !== null ? (
                  <span className="tabular shrink-0 text-ink-muted">cosine {item.similarity.toFixed(2)}</span>
                ) : null}
              </p>
              <svg
                width={width}
                height={STRIP + (row === 0 ? 0 : TICKS)}
                role="img"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so each number can be read with the arrow keys
                tabIndex={0}
                aria-label={`${item.name}: the first ${count} numbers of its vector. Use the left and right arrow keys to read them.`}
                className="understand-plot block max-w-full"
                onPointerMove={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  showColumn(clamp(Math.floor((event.clientX - box.left) / column), 0, count - 1), event.currentTarget, row);
                }}
                onPointerLeave={clear}
                onFocus={(event) => showColumn(cursor ?? 0, event.currentTarget, row)}
                onBlur={clear}
                onKeyDown={onKeyDown(row)}
              >
                {cursor !== null ? (
                  <rect x={cursor * column} y={0} width={column} height={STRIP + (row === 0 ? 0 : TICKS)} fill={COLOR.surface} />
                ) : null}
                <line x1={0} x2={width} y1={HALF} y2={HALF} stroke={COLOR.grid} strokeWidth={1} />
                {item.values.map((value, index) => {
                  if (value === 0) return null;
                  const height = Math.max(1.5, (Math.abs(value) / top) * (HALF - 1));
                  return (
                    <rect
                      // biome-ignore lint/suspicious/noArrayIndexKey: positions in a vector are their own identity
                      key={index}
                      x={index * column + (column - bar) / 2}
                      y={value > 0 ? HALF - height : HALF}
                      width={bar}
                      height={height}
                      fill={item.color}
                    />
                  );
                })}
                {agree?.products.map((product, index) =>
                  product > 0 ? (
                    <circle
                      // biome-ignore lint/suspicious/noArrayIndexKey: positions in a vector are their own identity
                      key={index}
                      cx={(index + 0.5) * column}
                      cy={STRIP + 3}
                      r={Math.min(2.5, Math.max(1.5, column / 3))}
                      fill={COLOR.ink}
                    />
                  ) : null,
                )}
              </svg>
            </div>
          );
        })}
      </div>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption={`The first ${count} numbers of the question's vector and of the closest passages' vectors`}
        columns={["Position", ...series.map((item) => item.name)]}
        rows={Array.from({ length: count }, (_, index) => [index + 1, ...series.map((item) => (item.values[index] ?? 0).toFixed(3))])}
      />
    </div>
  );
}
