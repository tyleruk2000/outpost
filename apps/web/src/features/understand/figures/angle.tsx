import { type PointerEvent, useId, useState } from "react";
import { COLOR } from "../charts/colors";
import { Legend } from "../charts/figure";
import { angleFromPointer, arrowTip, cosineOfAngle, describeCosine } from "../lib/cosine";
import { linear } from "../lib/scale";

const WIDTH = 300;
const HEIGHT = 176;
const ORIGIN = { x: WIDTH / 2, y: HEIGHT - 22 };
const LENGTH = 118;

function arcPath(degrees: number, radius: number): string {
  const end = arrowTip(degrees, radius);
  return `M${ORIGIN.x + radius},${ORIGIN.y} A${radius},${radius} 0 0 0 ${(ORIGIN.x + end.x).toFixed(1)},${(ORIGIN.y + end.y).toFixed(1)}`;
}

function Arrow({ degrees, color, id }: { degrees: number; color: string; id: string }) {
  const tip = arrowTip(degrees, LENGTH);
  return (
    <>
      <marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M0,1 L9,5 L0,9 z" fill={color} />
      </marker>
      <line
        x1={ORIGIN.x}
        y1={ORIGIN.y}
        x2={ORIGIN.x + tip.x}
        y2={ORIGIN.y + tip.y}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        markerEnd={`url(#${id})`}
      />
    </>
  );
}

/**
 * Two arrows from the same point. Dragging one changes the angle between them; the
 * cosine of that angle is the similarity. Real vectors have hundreds of dimensions,
 * but the angle between two of them is this same idea.
 */
export function AngleFigure() {
  const [angle, setAngle] = useState(35);
  const id = useId();
  const cosine = cosineOfAngle(angle);
  const scale = linear([-1, 1], [12, WIDTH - 12]);

  const drag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.type === "pointermove" && event.buttons === 0 && event.pointerType === "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    const scaleX = WIDTH / box.width;
    setAngle(angleFromPointer((event.clientX - box.left) * scaleX - ORIGIN.x, Math.min(0, (event.clientY - box.top) * scaleX - ORIGIN.y)));
  };

  return (
    <div className="grid items-start gap-x-10 gap-y-4 md:grid-cols-[300px_1fr]">
      <div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
          height={HEIGHT}
          aria-hidden
          className="block max-w-full touch-none cursor-grab select-none active:cursor-grabbing"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag(event);
          }}
          onPointerMove={drag}
        >
          <path d={`M${ORIGIN.x - LENGTH - 8},${ORIGIN.y} H${ORIGIN.x + LENGTH + 8}`} stroke={COLOR.grid} strokeWidth={1} />
          <path
            d={`M${ORIGIN.x - LENGTH},${ORIGIN.y} A${LENGTH},${LENGTH} 0 0 1 ${ORIGIN.x + LENGTH},${ORIGIN.y}`}
            fill="none"
            stroke={COLOR.grid}
            strokeWidth={1}
          />
          {angle > 0 ? <path d={arcPath(angle, 34)} fill="none" stroke={COLOR.axis} strokeWidth={1.25} /> : null}
          <text
            x={ORIGIN.x + arrowTip(angle / 2, 52).x}
            y={ORIGIN.y + arrowTip(angle / 2, 52).y + 4}
            textAnchor="middle"
            className="tabular fill-ink text-[0.8125rem] font-medium"
          >
            {angle}°
          </text>
          <Arrow degrees={0} color={COLOR.query} id={`${id}-q`} />
          <Arrow degrees={angle} color={COLOR.meaning} id={`${id}-p`} />
          <circle cx={ORIGIN.x + arrowTip(angle, LENGTH).x} cy={ORIGIN.y + arrowTip(angle, LENGTH).y} r={14} fill="transparent" />
          <circle cx={ORIGIN.x} cy={ORIGIN.y} r={3} fill={COLOR.ink} />
        </svg>
        <Legend
          className="mt-1"
          items={[
            { label: "A question", color: COLOR.query, swatch: "line" },
            { label: "A passage (drag it)", color: COLOR.meaning, swatch: "line" },
          ]}
        />
      </div>
      <div className="min-w-0">
        <p className="tabular text-body text-ink">
          Angle <span className="font-semibold">{angle}°</span>, cosine similarity{" "}
          <span className="font-semibold">{cosine.toFixed(2)}</span>
        </p>
        <p aria-live="polite" className="mt-0.5 text-small text-ink-muted">
          The arrows are {describeCosine(cosine)}.
        </p>
        <label htmlFor={`${id}-angle`} className="mt-4 block text-small font-medium text-ink">
          Angle between the two arrows
        </label>
        <input
          id={`${id}-angle`}
          type="range"
          min={0}
          max={180}
          step={1}
          value={angle}
          onChange={(event) => setAngle(Number(event.target.value))}
          aria-valuetext={`${angle} degrees, cosine ${cosine.toFixed(2)}`}
          className="understand-range mt-1 w-full max-w-[300px]"
          style={{ accentColor: COLOR.meaning }}
        />
        <svg viewBox={`0 0 ${WIDTH} 46`} width={WIDTH} height={46} aria-hidden className="mt-3 block max-w-full">
          <line x1={scale(-1)} x2={scale(1)} y1={12} y2={12} stroke={COLOR.axis} strokeWidth={1} />
          {[-1, 0, 1].map((tick) => (
            <g key={tick}>
              <line x1={scale(tick)} x2={scale(tick)} y1={7} y2={17} stroke={COLOR.axis} strokeWidth={1} />
              <text
                x={scale(tick)}
                y={32}
                textAnchor={tick === -1 ? "start" : tick === 1 ? "end" : "middle"}
                className="tabular fill-ink-muted text-[0.6875rem]"
              >
                {tick === -1 ? "−1 opposite" : tick === 0 ? "0 unrelated" : "1 the same"}
              </text>
            </g>
          ))}
          <circle cx={scale(cosine)} cy={12} r={5} fill={COLOR.meaning} stroke={COLOR.page} strokeWidth={2} />
        </svg>
      </div>
    </div>
  );
}
