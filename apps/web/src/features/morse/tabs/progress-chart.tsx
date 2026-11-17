/**
 * Accuracy over time, one line per kind of practice (receive, send, QSO practice, echo),
 * with the 90% line at which a Koch lesson moves on. Drawn by hand in SVG like every
 * chart in Outpost (docs/development/web-screens.md, "Charts"): thin marks, the chart
 * tokens in their fixed order, a direct label on each line, a crosshair that answers
 * the pointer and the arrow keys, and the same numbers as a table for a screen reader.
 */
import type { MorseSession, MorseSessionKind } from "@outpost/shared";
import { type KeyboardEvent, type PointerEvent, useId, useState } from "react";
import { useWidth } from "@/features/radio/use-width";
import { formatDate, formatDateTime } from "@/lib/utils";

export const KIND_LABELS: Record<MorseSessionKind, string> = {
  receive: "Receive",
  send: "Send",
  qso: "QSO practice",
  echo: "Echo",
};

/** Always in this order and with these colours on the Progress tab. */
const KINDS: { kind: MorseSessionKind; color: string }[] = [
  { kind: "receive", color: "var(--chart-1)" },
  { kind: "send", color: "var(--chart-2)" },
  { kind: "qso", color: "var(--chart-3)" },
  { kind: "echo", color: "var(--chart-4)" },
];

const ADVANCE = 90;
const AXIS_TEXT = "tabular fill-ink-muted text-[11px]";
const LABEL_TEXT = "fill-ink text-[11px] font-medium";
const HALF_DAY = 43_200_000;

const pct = (accuracy: number) => Math.round(accuracy * 100);

export function sessionWords(session: MorseSession): string {
  const speed = session.charWpm ? ` at ${Math.round(session.charWpm)} wpm` : "";
  return `${KIND_LABELS[session.kind]}, ${formatDateTime(session.at)}: ${pct(session.accuracy)}%${speed}`;
}

export function AccuracyChart({ sessions, height = 220 }: { sessions: readonly MorseSession[]; height?: number }) {
  const [ref, width] = useWidth();
  const [chosen, setChosen] = useState<number | null>(null);
  const tableId = useId();
  if (sessions.length === 0) return null;

  const sorted = [...sessions].sort((a, b) => a.at - b.at);
  const series = KINDS.map(({ kind, color }) => ({ kind, color, points: sorted.filter((s) => s.kind === kind) })).filter(
    (line) => line.points.length > 0,
  );
  let first = sorted[0]!.at;
  let last = sorted[sorted.length - 1]!.at;
  if (last - first < HALF_DAY) {
    first -= HALF_DAY / 2;
    last += HALF_DAY / 2;
  }
  const left = 36;
  const right = 92;
  const top = 10;
  const bottom = 22;
  const plotWidth = Math.max(40, width - left - right);
  const x = (t: number) => left + ((t - first) / (last - first)) * plotWidth;
  const y = (value: number) => top + (1 - value / 100) * (height - top - bottom);

  // Each line is named at its end; the names are pushed apart so that none lies over another.
  const labels = series.map((line) => ({ ...line, at: y(pct(line.points[line.points.length - 1]!.accuracy)) })).sort((a, b) => a.at - b.at);
  for (let i = 1; i < labels.length; i++) labels[i]!.at = Math.max(labels[i]!.at, labels[i - 1]!.at + 13);
  const overflow = (labels.at(-1)?.at ?? 0) - (height - bottom);
  if (overflow > 0) for (const label of labels) label.at -= overflow;

  const index = Math.min(chosen ?? sorted.length - 1, sorted.length - 1);
  const shown = sorted[index]!;
  const shownColor = KINDS.find((entry) => entry.kind === shown.kind)!.color;
  const nearest = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const t = first + ((event.clientX - box.left - left) / plotWidth) * (last - first);
    let best = 0;
    sorted.forEach((session, candidate) => {
      if (Math.abs(session.at - t) < Math.abs(sorted[best]!.at - t)) best = candidate;
    });
    return best;
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setChosen(Math.min(sorted.length - 1, Math.max(0, index + (event.key === "ArrowLeft" ? -1 : 1))));
    }
  };

  return (
    <div className="min-w-0">
      {series.length > 1 ? (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-ink" aria-label="Kinds of practice">
          {series.map((line) => (
            <li key={line.kind} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ background: line.color }} />
              {KIND_LABELS[line.kind]}
            </li>
          ))}
        </ul>
      ) : null}
      <section
        ref={ref}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is read with the arrow keys, like the other charts
        tabIndex={0}
        aria-label="Accuracy of each session over time. Left and right arrow keys move from session to session."
        aria-describedby={tableId}
        onKeyDown={onKey}
        className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg
          width={width}
          height={height}
          className="block touch-pan-y select-none"
          aria-hidden
          onPointerMove={(event) => setChosen(nearest(event))}
          onPointerDown={(event) => setChosen(nearest(event))}
        >
          {[0, 50, 100].map((tick) => (
            <g key={tick}>
              <line x1={left} x2={left + plotWidth} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--chart-grid)" }} />
              <text x={left - 6} y={y(tick) + 4} textAnchor="end" className={AXIS_TEXT}>
                {tick}%
              </text>
            </g>
          ))}
          <line
            x1={left}
            x2={left + plotWidth}
            y1={y(ADVANCE)}
            y2={y(ADVANCE)}
            strokeDasharray="4 3"
            style={{ stroke: "var(--chart-axis)" }}
          />
          <text x={left - 6} y={y(ADVANCE) + 4} textAnchor="end" className={AXIS_TEXT}>
            {ADVANCE}%
          </text>
          <text x={left} y={height - 6} className={AXIS_TEXT}>
            {formatDate(sorted[0]!.at)}
          </text>
          {formatDate(sorted[0]!.at) !== formatDate(sorted[sorted.length - 1]!.at) ? (
            <text x={left + plotWidth} y={height - 6} textAnchor="end" className={AXIS_TEXT}>
              {formatDate(sorted[sorted.length - 1]!.at)}
            </text>
          ) : null}
          {series.map((line) => (
            <g key={line.kind}>
              {line.points.length > 1 ? (
                <path
                  d={line.points.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.at).toFixed(1)},${y(pct(s.accuracy)).toFixed(1)}`).join("")}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={{ stroke: line.color }}
                />
              ) : null}
              {line.points.map((s) => (
                <circle key={s.id} cx={x(s.at)} cy={y(pct(s.accuracy))} r={4} style={{ fill: line.color }} />
              ))}
            </g>
          ))}
          {labels.map((label) => (
            <text key={label.kind} x={left + plotWidth + 8} y={label.at + 4} className={LABEL_TEXT}>
              {KIND_LABELS[label.kind]}
            </text>
          ))}
          <line x1={x(shown.at)} x2={x(shown.at)} y1={top} y2={height - bottom} className="stroke-ink" strokeWidth={1} opacity={0.5} />
          <circle
            cx={x(shown.at)}
            cy={y(pct(shown.accuracy))}
            r={5.5}
            strokeWidth={2}
            className="stroke-page"
            style={{ fill: shownColor }}
          />
        </svg>
        <p aria-live="polite" className="tabular min-h-[1.3125rem] text-small text-ink">
          {sessionWords(shown)}
        </p>
      </section>
      <div id={tableId} className="sr-only">
        <table>
          <caption>Accuracy of each session</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Kind</th>
              <th scope="col">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((session) => (
              <tr key={session.id}>
                <th scope="row">{formatDateTime(session.at)}</th>
                <td>{KIND_LABELS[session.kind]}</td>
                <td>{pct(session.accuracy)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
