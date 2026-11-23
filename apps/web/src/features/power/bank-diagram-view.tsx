/**
 * The battery bank drawn live as the person sets it (bank-diagram.ts has the layout):
 * one image with its whole description as its text alternative, and the summary in
 * words under it.
 */
import { bankLayout } from "./bank-diagram";

export function BankDiagram({ volts, ampHours, series, parallel }: { volts: number; ampHours: number; series: number; parallel: number }) {
  const layout = bankLayout(volts, ampHours, series, parallel);
  const nub = 4;
  return (
    <figure className="mt-4">
      <svg
        role="img"
        aria-label={layout.alt}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        style={{ maxWidth: layout.width * 1.25 }}
        className="block h-auto"
      >
        {layout.wires.map((wire) => (
          <polyline
            key={wire.points}
            points={wire.points}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            className={wire.pole === "+" ? "stroke-danger" : "stroke-ink"}
          />
        ))}
        {layout.cells.map((cell) => {
          const mid = cell.y + cell.height / 2;
          return (
            <g key={`${cell.x},${cell.y}`}>
              <rect x={cell.x - nub} y={mid - 5} width={nub} height={10} className="fill-ink" />
              <rect x={cell.x + cell.width} y={mid - 5} width={nub} height={10} className="fill-danger" />
              <rect
                x={cell.x}
                y={cell.y}
                width={cell.width}
                height={cell.height}
                rx={4}
                strokeWidth={1}
                className="fill-surface stroke-ink-muted"
              />
              <text x={cell.x + 6} y={mid + 4} className="fill-ink text-[12px] font-semibold">
                −
              </text>
              <text x={cell.x + cell.width - 6} y={mid + 4} textAnchor="end" className="fill-danger text-[12px] font-semibold">
                +
              </text>
              {cell.lines.map((line, index) => (
                <text
                  key={line}
                  x={cell.x + cell.width / 2}
                  y={cell.y + 15 + index * 12}
                  textAnchor="middle"
                  className={`tabular text-[10px] ${index === 0 ? "fill-ink font-semibold" : "fill-ink-muted"}`}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
        <circle cx={layout.minus.x} cy={layout.minus.y} r={3.5} className="fill-ink" />
        <text x={layout.minus.x + 7} y={layout.minus.y + 4} className="fill-ink text-[10px] font-semibold">
          Bank −
        </text>
        <circle cx={layout.plus.x} cy={layout.plus.y} r={3.5} className="fill-danger" />
        <text x={layout.plus.x - 7} y={layout.plus.y + 4} textAnchor="end" className="fill-danger text-[10px] font-semibold">
          Bank +
        </text>
      </svg>
      <figcaption className="tabular mt-2 max-w-[70ch] text-small text-ink-muted">
        {layout.summary}.{layout.note ? ` ${layout.note}` : ""}
      </figcaption>
    </figure>
  );
}
