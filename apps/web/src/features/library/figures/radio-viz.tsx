/**
 * Signal figures: the shapes radio is about, drawn as SVG from the small JSON
 * specification in a ```viz block. Waveforms, spectra, response curves, radiation
 * patterns, IQ constellations, stylised waterfalls, and a radio's display or front
 * panel with numbered callouts. A Mermaid diagram covers boxes and arrows; this covers
 * the rest.
 *
 * Ported from LogBook73 (frontend/src/features/handbook/RadioViz.tsx), copyright (c)
 * 2026 Tyler Allen, MIT licence: the same author's figures, so that the handbook and
 * the radio guides read here as they do there. The drawing is his and is unchanged.
 * What differs in Outpost: colours and type come from Outpost's design tokens; the
 * figure sits in Outpost's frame, which keeps it legible on a phone; and the
 * specification is checked and bounded first (viz-spec.ts), because here it may come
 * from any Markdown file. Everything is deterministic: the noise is seeded.
 */
// biome-ignore-all lint/suspicious/noArrayIndexKey: marks of one drawing, in a fixed order, with no identity of their own
import { Component, type ReactNode } from "react";
import { Figure, FigureSource } from "./figure-frame";
import {
  type Callout,
  CONSTELLATION_PRESETS,
  mulberry32,
  polarRadius,
  responseShape,
  sampleTrace,
  type TraceSpec,
  type VizSpec,
} from "./radio-viz-maths";
import { readVizSpec } from "./viz-spec";

const TONE: Record<NonNullable<TraceSpec["tone"]>, string> = {
  primary: "var(--primary)",
  ink: "var(--ink)",
  muted: "var(--ink-muted)",
  success: "var(--success)",
  danger: "var(--danger)",
};

function polyline(points: [number, number][], toX: (x: number) => number, toY: (y: number) => number): string {
  return points.map(([x, y]) => `${toX(x).toFixed(1)},${toY(y).toFixed(1)}`).join(" ");
}

function strokeFor(t?: TraceSpec["tone"]): string {
  return TONE[t ?? "primary"];
}

function dashFor(style?: TraceSpec["style"]): string | undefined {
  return style === "dashed" ? "6 5" : undefined;
}

/** Rough advance width of an Inter glyph as a share of the font size. SVG text
 * can't be measured before it renders, and the figure scales as one image, so
 * an estimate in user units is enough to keep labels inside the viewBox. */
const GLYPH_W = 0.56;
const EDGE = 4;

/** Centre x for a middle-anchored label, pulled in from the figure edge so a
 * label on a component near either side isn't cut off (lb-v73o.12). */
export function fitLabelX(x: number, label: string, fontSize: number, W: number): number {
  const half = (label.length * fontSize * GLYPH_W) / 2;
  if (half * 2 >= W - EDGE * 2) return W / 2;
  return Math.min(Math.max(x, EDGE + half), W - EDGE - half);
}

/** Greedy word wrap to fit `width` user units; a single over-long word keeps
 * its own line rather than being split mid-word (lb-v73o.12). With `maxLines`
 * the wrap stops there and the last kept line ends in an ellipsis, so an
 * over-long callout cannot run into its neighbour's slot (lb-ydyw). */
export function wrapLabel(label: string, fontSize: number, width: number, maxLines = Number.POSITIVE_INFINITY): string[] {
  const max = Math.max(4, Math.floor(width / (fontSize * GLYPH_W)));
  const lines: string[] = [];
  let line = "";
  for (const word of label.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (!lines.length) return [label];
  const cap = Math.max(1, Math.floor(maxLines));
  if (lines.length <= cap) return lines;
  const kept = lines.slice(0, cap);
  const last = kept[cap - 1] ?? "";
  kept[cap - 1] = `${last.length + 1 > max ? last.slice(0, Math.max(1, max - 1)).trimEnd() : last}…`;
  return kept;
}

/** The figure's accessible name with every callout in full, numbered: the
 * drawn labels sit inside role="img" (so a screen reader never reached
 * them), and a label capped to its slot can end in an ellipsis (lb-ydyw). */
export function withCallouts(name: string, callouts: readonly Callout[] | undefined): string {
  if (!callouts?.length) return name;
  const items = [...callouts].sort((a, b) => a.n - b.n).map((c) => `${c.n} ${c.label}`);
  return `${name}. ${items.join("; ")}`;
}

// ---------------------------------------------------------------------------
// Figure frame (title + plot + caption)
// ---------------------------------------------------------------------------

function FigureFrame({
  title,
  caption,
  viewBox,
  children,
  ariaLabel,
}: {
  title?: string;
  caption?: string;
  viewBox: string;
  children: ReactNode;
  ariaLabel: string;
}) {
  // The drawing is laid out in user units that are meant to be CSS pixels: its lettering is 11 to 13 units high.
  const width = Number(viewBox.split(" ")[2]) || 640;
  return (
    <Figure title={title} caption={caption} label={title ?? ariaLabel} width={width}>
      <svg viewBox={viewBox} role="img" aria-label={ariaLabel} className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
        {children}
      </svg>
    </Figure>
  );
}

const AXIS = "var(--border-strong)";
const GRID = "var(--border)";
const LABEL = "var(--ink-muted)";
const FONT = "var(--font-sans)";

// ---------------------------------------------------------------------------
// Renderers per type
// ---------------------------------------------------------------------------

function WavePlot({ spec }: { spec: VizSpec }) {
  const W = 640;
  const H = 240;
  const pad = { l: 16, r: 12, t: 16, b: spec.xLabel ? 34 : 18 };
  const toX = (x: number) => pad.l + x * (W - pad.l - pad.r);
  const mid = pad.t + (H - pad.t - pad.b) / 2;
  const half = (H - pad.t - pad.b) / 2;
  const toY = (y: number) => mid - y * (half - 4);
  const traces = (spec.traces ?? []).slice(0, 5);
  const legend = traces.filter((t) => t.label);
  return (
    <FigureFrame title={spec.title} caption={spec.caption} viewBox={`0 0 ${W} ${H}`} ariaLabel={spec.title ?? "Waveform diagram"}>
      <line x1={pad.l} y1={mid} x2={W - pad.r} y2={mid} stroke={GRID} strokeWidth={1} />
      {traces.map((t, i) => {
        const pts = sampleTrace(t);
        if (t.kind === "envelope") {
          // Mirror the magnitude around the axis, dashed by default.
          const upper = polyline(pts, toX, toY);
          const lower = polyline(
            pts.map(([x, y]) => [x, -y] as [number, number]),
            toX,
            toY,
          );
          const stroke = strokeFor(t.tone ?? "muted");
          const dash = dashFor(t.style ?? "dashed");
          return (
            <g key={i}>
              <polyline points={upper} fill="none" stroke={stroke} strokeWidth={1.6} strokeDasharray={dash} />
              <polyline points={lower} fill="none" stroke={stroke} strokeWidth={1.6} strokeDasharray={dash} />
            </g>
          );
        }
        return (
          <polyline
            key={i}
            points={polyline(pts, toX, toY)}
            fill="none"
            stroke={strokeFor(t.tone ?? (i === 0 ? "primary" : "muted"))}
            strokeWidth={t.style === "faint" ? 1 : 1.8}
            strokeOpacity={t.style === "faint" ? 0.45 : 1}
            strokeDasharray={dashFor(t.style)}
            strokeLinejoin="round"
          />
        );
      })}
      {spec.xLabel && (
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={LABEL} fontFamily={FONT}>
          {spec.xLabel}
        </text>
      )}
      {legend.length > 0 && (
        <g fontFamily={FONT} fontSize={12}>
          {legend.map((t, i) => (
            <g key={i} transform={`translate(${pad.l + 4 + i * 150}, ${pad.t})`}>
              <line
                x1={0}
                y1={0}
                x2={18}
                y2={0}
                stroke={strokeFor(t.tone ?? (traces.indexOf(t) === 0 ? "primary" : "muted"))}
                strokeWidth={2}
                strokeDasharray={dashFor(t.style)}
              />
              <text x={23} y={4} fill={LABEL}>
                {t.label}
              </text>
            </g>
          ))}
        </g>
      )}
    </FigureFrame>
  );
}

function SpectrumPlot({ spec }: { spec: VizSpec }) {
  const W = 640;
  const H = 240;
  const pad = { l: 16, r: 12, t: 14, b: 36 };
  const floorY = H - pad.b;
  const toX = (f: number) => pad.l + (f / 100) * (W - pad.l - pad.r);
  const toH = (a: number) => Math.max(2, a * (floorY - pad.t - 14));
  const rand = mulberry32(7);
  const noise = spec.noiseFloor ?? 0.06;
  const noisePts: string[] = [];
  for (let i = 0; i <= 160; i++) {
    const x = pad.l + (i / 160) * (W - pad.l - pad.r);
    const y = floorY - toH(noise * (0.5 + rand()));
    noisePts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const mask = spec.mask;
  const maskPath = (() => {
    if (!mask) return null;
    const y0 = pad.t + 6;
    const x1 = toX(mask.from);
    const x2 = toX(mask.to);
    const edge = 26;
    switch (mask.kind) {
      case "lowpass":
        return `M ${pad.l} ${y0} L ${x2} ${y0} L ${x2 + edge} ${floorY} L ${pad.l} ${floorY} Z`;
      case "highpass":
        return `M ${x1 - edge} ${floorY} L ${x1} ${y0} L ${W - pad.r} ${y0} L ${W - pad.r} ${floorY} Z`;
      case "bandpass":
        return `M ${x1 - edge} ${floorY} L ${x1} ${y0} L ${x2} ${y0} L ${x2 + edge} ${floorY} Z`;
      case "notch":
        return `M ${pad.l} ${y0} L ${x1 - edge / 2} ${y0} L ${x1} ${floorY} L ${x2} ${floorY} L ${x2 + edge / 2} ${y0} L ${W - pad.r} ${y0} L ${W - pad.r} ${floorY} L ${pad.l} ${floorY} Z`;
      default:
        return null;
    }
  })();
  return (
    <FigureFrame title={spec.title} caption={spec.caption} viewBox={`0 0 ${W} ${H}`} ariaLabel={spec.title ?? "Spectrum diagram"}>
      {maskPath && (
        <path d={maskPath} fill="var(--primary)" opacity={0.08} stroke="var(--primary)" strokeOpacity={0.35} strokeDasharray="5 4" />
      )}
      <polyline points={noisePts.join(" ")} fill="none" stroke={GRID} strokeWidth={1} />
      <line x1={pad.l} y1={floorY} x2={W - pad.r} y2={floorY} stroke={AXIS} strokeWidth={1.2} />
      {(spec.components ?? []).slice(0, 14).map((c, i) => {
        const x = toX(c.f);
        const h = toH(c.amp);
        const stroke = strokeFor(c.tone);
        if (c.width && c.width > 0) {
          const w = ((c.width / 100) * (W - pad.l - pad.r)) / 1;
          return (
            <g key={i}>
              <path
                d={`M ${x} ${floorY} L ${x} ${floorY - h} L ${x + w} ${floorY - h * 0.35} L ${x + w} ${floorY} Z`}
                fill={stroke}
                opacity={0.28}
                stroke={stroke}
              />
              {c.label && (
                <text
                  x={fitLabelX(x + w / 2, c.label, 12, W)}
                  y={floorY - h - 6}
                  textAnchor="middle"
                  fontSize={12}
                  fill={LABEL}
                  fontFamily={FONT}
                >
                  {c.label}
                </text>
              )}
            </g>
          );
        }
        return (
          <g key={i}>
            <line x1={x} y1={floorY} x2={x} y2={floorY - h} stroke={stroke} strokeWidth={2.5} />
            <circle cx={x} cy={floorY - h} r={3} fill={stroke} />
            {c.label && (
              <text x={fitLabelX(x, c.label, 12, W)} y={floorY - h - 8} textAnchor="middle" fontSize={12} fill={LABEL} fontFamily={FONT}>
                {c.label}
              </text>
            )}
          </g>
        );
      })}
      <text x={W / 2} y={H - 10} textAnchor="middle" fontSize={12} fill={LABEL} fontFamily={FONT}>
        {spec.xLabel ?? "frequency →"}
      </text>
    </FigureFrame>
  );
}

function ResponsePlot({ spec }: { spec: VizSpec }) {
  const W = 640;
  const H = 240;
  const pad = { l: 16, r: 12, t: 14, b: 36 };
  const toX = (f: number) => pad.l + (f / 100) * (W - pad.l - pad.r);
  const top = pad.t + 10;
  const bottom = H - pad.b;
  const c = spec.curve ?? { preset: "bandpass" as const };
  // Shared with the phone (lb-3zss.20) — the curve must be the same picture.
  const shape = responseShape(c);
  const pts: string[] = [];
  for (let i = 0; i <= 240; i++) {
    const f = (i / 240) * 100;
    const y01 = shape(f);
    const y = top + y01 * (bottom - top);
    pts.push(`${toX(f).toFixed(1)},${Math.min(bottom, Math.max(top, y)).toFixed(1)}`);
  }
  const isSwr = c.preset === "swr";
  return (
    <FigureFrame title={spec.title} caption={spec.caption} viewBox={`0 0 ${W} ${H}`} ariaLabel={spec.title ?? "Response curve"}>
      <line x1={pad.l} y1={bottom} x2={W - pad.r} y2={bottom} stroke={AXIS} strokeWidth={1.2} />
      <line x1={pad.l} y1={top} x2={W - pad.r} y2={top} stroke={GRID} strokeDasharray="3 5" />
      <text x={pad.l + 2} y={top - 3} fontSize={11} fill={LABEL} fontFamily={FONT}>
        {/* The SWR curve DIPS at resonance (every caption in the handbook
            says so), so 1:1 is at the BOTTOM of this axis and high SWR at the
            top. These labels were the other way up, which told the reader the
            dip was the bad end. */}
        {spec.yLabel ?? (isSwr ? "high SWR" : "full signal")}
      </text>
      {isSwr && (
        <text x={pad.l + 2} y={bottom - 5} fontSize={11} fill={LABEL} fontFamily={FONT}>
          SWR 1:1
        </text>
      )}
      <polyline points={pts.join(" ")} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
      {(spec.markers ?? []).map((mk, i) => (
        <g key={i}>
          <line x1={toX(mk.x)} y1={top} x2={toX(mk.x)} y2={bottom} stroke={AXIS} strokeDasharray="2 4" />
          <text x={toX(mk.x)} y={bottom + 14} textAnchor="middle" fontSize={12} fill={LABEL} fontFamily={FONT}>
            {mk.label}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={LABEL} fontFamily={FONT}>
        {spec.xLabel ?? "frequency →"}
      </text>
    </FigureFrame>
  );
}

function PolarPlot({ spec }: { spec: VizSpec }) {
  const W = 640;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = 118;
  const r = polarRadius(spec.pattern);
  const pts: string[] = [];
  for (let i = 0; i <= 360; i += 2) {
    const th = (i / 180) * Math.PI;
    const rr = r(th) * R;
    pts.push(`${(cx + rr * Math.cos(th)).toFixed(1)},${(cy + rr * Math.sin(th)).toFixed(1)}`);
  }
  return (
    <FigureFrame title={spec.title} caption={spec.caption} viewBox={`0 0 ${W} ${H}`} ariaLabel={spec.title ?? "Radiation pattern"}>
      {[0.33, 0.66, 1].map((k) => (
        <circle key={k} cx={cx} cy={cy} r={R * k} fill="none" stroke={GRID} />
      ))}
      <line x1={cx - R - 14} y1={cy} x2={cx + R + 14} y2={cy} stroke={GRID} />
      <line x1={cx} y1={cy - R - 14} x2={cx} y2={cy + R + 14} stroke={GRID} />
      <polygon points={pts.join(" ")} fill="var(--primary)" opacity={0.15} stroke="var(--primary)" strokeWidth={2} />
      <text x={cx + R + 18} y={cy + 4} fontSize={12} fill={LABEL} fontFamily={FONT}>
        0°
      </text>
      <text x={cx} y={cy - R - 18} textAnchor="middle" fontSize={12} fill={LABEL} fontFamily={FONT}>
        90°
      </text>
    </FigureFrame>
  );
}

function ConstellationPlot({ spec }: { spec: VizSpec }) {
  const W = 640;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2;
  const R = 118;
  const pts = spec.points ?? CONSTELLATION_PRESETS[spec.preset ?? "qpsk"] ?? [];
  return (
    <FigureFrame title={spec.title} caption={spec.caption} viewBox={`0 0 ${W} ${H}`} ariaLabel={spec.title ?? "IQ constellation"}>
      <line x1={cx - R - 16} y1={cy} x2={cx + R + 16} y2={cy} stroke={AXIS} />
      <line x1={cx} y1={cy - R - 16} x2={cx} y2={cy + R + 16} stroke={AXIS} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={GRID} strokeDasharray="3 5" />
      <text x={cx + R + 20} y={cy + 4} fontSize={12} fill={LABEL} fontFamily={FONT}>
        I
      </text>
      <text x={cx + 8} y={cy - R - 6} fontSize={12} fill={LABEL} fontFamily={FONT}>
        Q
      </text>
      {pts.slice(0, 32).map(([i, q, label], idx) => (
        <g key={idx}>
          <circle cx={cx + i * R} cy={cy - q * R} r={7} fill="var(--primary)" />
          {label && (
            <text x={cx + i * R} y={cy - q * R - 12} textAnchor="middle" fontSize={12} fill={LABEL} fontFamily={FONT}>
              {label}
            </text>
          )}
        </g>
      ))}
    </FigureFrame>
  );
}

function WaterfallPlot({ spec }: { spec: VizSpec }) {
  const W = 640;
  const H = 280;
  const pad = { l: 16, r: 12, t: 8, b: 34 };
  const top = pad.t;
  const bottom = H - pad.b;
  const toX = (f: number) => pad.l + (f / 100) * (W - pad.l - pad.r);
  const rand = mulberry32(1234);
  const speckles: ReactNode[] = [];
  for (let i = 0; i < 420; i++) {
    speckles.push(
      <rect
        key={i}
        x={pad.l + rand() * (W - pad.l - pad.r)}
        y={top + rand() * (bottom - top)}
        width={2.2}
        height={2.2}
        fill="var(--primary)"
        opacity={0.05 + rand() * 0.1}
      />,
    );
  }
  const sig = (s: NonNullable<VizSpec["signals"]>[number], idx: number): ReactNode => {
    const x = toX(s.f);
    const w = Math.max(2.5, ((s.width ?? 2) / 100) * (W - pad.l - pad.r));
    const kind = s.kind ?? "carrier";
    const rnd = mulberry32(idx * 97 + 5);
    if (kind === "cw") {
      const dashes: ReactNode[] = [];
      let y = top;
      while (y < bottom) {
        const seg = 6 + rnd() * 16;
        if (rnd() > 0.35) {
          dashes.push(
            <rect key={y} x={x - 1.5} y={y} width={3} height={Math.min(seg, bottom - y)} fill="var(--primary)" opacity={0.85} rx={1} />,
          );
        }
        y += seg + 5;
      }
      return <g key={idx}>{dashes}</g>;
    }
    if (kind === "ft8") {
      const rows: ReactNode[] = [];
      const slot = (bottom - top) / 4;
      for (let k = 0; k < 4; k++) {
        if (k % 2 === 0) {
          const wob: ReactNode[] = [];
          const rows2 = 9;
          for (let j = 0; j < rows2; j++) {
            wob.push(
              <rect
                key={j}
                x={x - w / 2 + rnd() * (w * 0.55)}
                y={top + k * slot + (j / rows2) * slot}
                width={w * 0.45}
                height={slot / rows2 - 1.2}
                fill="var(--primary)"
                opacity={0.7}
              />,
            );
          }
          rows.push(<g key={k}>{wob}</g>);
        }
      }
      return <g key={idx}>{rows}</g>;
    }
    if (kind === "ssb") {
      const blobs: ReactNode[] = [];
      let y = top;
      while (y < bottom) {
        const seg = 8 + rnd() * 22;
        if (rnd() > 0.3) {
          blobs.push(
            <rect
              key={y}
              x={x}
              y={y}
              width={w}
              height={Math.min(seg, bottom - y)}
              fill="var(--primary)"
              opacity={0.18 + rnd() * 0.4}
              rx={2}
            />,
          );
        }
        y += seg + 4;
      }
      return <g key={idx}>{blobs}</g>;
    }
    if (kind === "fm") {
      return <rect key={idx} x={x - w / 2} y={top} width={w} height={bottom - top} fill="var(--primary)" opacity={0.3} rx={2} />;
    }
    if (kind === "drift") {
      const drift = w * 3;
      return (
        <path
          key={idx}
          d={`M ${x} ${top} C ${x + drift} ${top + (bottom - top) / 3}, ${x - drift / 2} ${top + (2 * (bottom - top)) / 3}, ${x + drift / 2} ${bottom}`}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={3}
          opacity={0.8}
        />
      );
    }
    // carrier: solid vertical line
    return <rect key={idx} x={x - 1.5} y={top} width={3} height={bottom - top} fill="var(--primary)" opacity={0.9} />;
  };
  return (
    <FigureFrame title={spec.title} caption={spec.caption} viewBox={`0 0 ${W} ${H}`} ariaLabel={spec.title ?? "Waterfall diagram"}>
      <rect x={pad.l} y={top} width={W - pad.l - pad.r} height={bottom - top} fill="var(--ink)" opacity={0.06} rx={4} />
      {speckles}
      {(spec.signals ?? []).slice(0, 10).map((s, i) => sig(s, i))}
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={LABEL} fontFamily={FONT}>
        {spec.xLabel ?? "frequency →"}
      </text>
      <text
        x={12}
        y={(top + bottom) / 2}
        fontSize={12}
        fill={LABEL}
        fontFamily={FONT}
        transform={`rotate(-90 12 ${(top + bottom) / 2})`}
        textAnchor="middle"
      >
        {spec.yLabel ?? "time ↓"}
      </text>
    </FigureFrame>
  );
}

// ---------------------------------------------------------------------------
// Callout layer (shared by device + display figures)
// ---------------------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Numbered dots on an illustration, joined by leader lines to labels stacked
 * evenly down the left/right margins — the classic exploded-diagram look. Even
 * distribution (rather than aligning a label to its dot) keeps labels from
 * overlapping however the callouts are clustered on the device. */
function CalloutLayer({ callouts, box, W, H }: { callouts: Callout[]; box: Box; W: number; H: number }) {
  if (callouts.length === 0) return null;
  const marginTop = 26;
  const LINE_H = 15;
  const usable = H - marginTop * 2;
  const sided = callouts.map((c) => ({
    ...c,
    resolved: (c.side ?? (c.x < 50 ? "left" : "right")) as "left" | "right",
  }));
  const nodes: ReactNode[] = [];
  (["left", "right"] as const).forEach((side) => {
    const list = sided.filter((c) => c.resolved === side).sort((a, b) => a.y - b.y);
    // Small target dot on the device; the numbered bubble + label live out in the
    // margin, evenly spaced so bubbles never collide however clustered the dots.
    const bubbleX = side === "left" ? box.x - 34 : box.x + box.w + 34;
    const textX = side === "left" ? bubbleX - 16 : bubbleX + 16;
    const leaderEnd = side === "left" ? bubbleX + 10 : bubbleX - 10;
    list.forEach((c, i) => {
      const cx = box.x + (c.x / 100) * box.w;
      const cy = box.y + (c.y / 100) * box.h;
      const slotY = marginTop + ((i + 0.5) * usable) / list.length;
      // The label margin is fixed in user units, so a long label used to run
      // off the figure at every width: wrap it to the margin instead.
      // Each callout owns one evenly spaced slot, so cap its lines to what the
      // slot holds; the full text stays in the label's <title> (lb-ydyw).
      const slotLines = Math.floor(usable / list.length / LINE_H);
      const lines = wrapLabel(c.label, 13, side === "left" ? textX - EDGE : W - EDGE - textX, slotLines);
      const clipped = lines.join(" ") !== c.label.split(/\s+/).filter(Boolean).join(" ");
      nodes.push(
        <g key={`${side}-${c.n}`}>
          <polyline
            points={`${cx.toFixed(1)},${cy.toFixed(1)} ${leaderEnd},${slotY.toFixed(1)}`}
            fill="none"
            stroke={AXIS}
            strokeWidth={1}
            strokeOpacity={0.5}
          />
          <circle cx={cx} cy={cy} r={4} fill="var(--surface)" stroke="var(--primary)" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={1.6} fill="var(--primary)" />
          <circle cx={bubbleX} cy={slotY} r={10} fill="var(--surface)" stroke="var(--primary)" strokeWidth={1.8} />
          <text x={bubbleX} y={slotY + 4} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="var(--primary)" fontFamily={FONT}>
            {c.n}
          </text>
          <text
            x={textX}
            y={slotY + 4.5 - ((lines.length - 1) * LINE_H) / 2}
            textAnchor={side === "left" ? "end" : "start"}
            fontSize={13}
            fill="var(--ink)"
            fontFamily={FONT}
          >
            {clipped && <title>{c.label}</title>}
            {lines.map((ln, li) => (
              <tspan key={li} x={textX} dy={li === 0 ? 0 : LINE_H}>
                {ln}
              </tspan>
            ))}
          </text>
        </g>,
      );
    });
  });
  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------
// Device — stylised handheld front panel with numbered callouts
// ---------------------------------------------------------------------------

function DevicePlot({ spec }: { spec: VizSpec }) {
  const W = 720;
  const H = 470;
  const box: Box = { x: 300, y: 62, w: 120, h: 356 };
  const d = spec.device ?? {};
  const screenRows = Math.max(1, Math.min(4, d.screenRows ?? 3));
  const keypad = d.keypad ?? true;
  const nav = d.nav ?? "pad";
  const sideKeys = Math.max(0, Math.min(3, d.sideKeys ?? 2));

  const fill = "var(--surface)";
  const sunken = "var(--surface-strong)";

  const sx = box.x + 12;
  const sy = box.y + 30;
  const sw = box.w - 24;
  const sh = 120;
  const rowH = (sh - 14) / screenRows;
  const navCy = sy + sh + 30;
  const kx0 = box.x + (box.w - 84) / 2;

  const els: ReactNode[] = [];

  // Antenna + SMA base
  els.push(
    <g key="ant">
      <line x1={box.x + 20} y1={box.y - 6} x2={box.x + 20} y2={box.y - 46} stroke={AXIS} strokeWidth={4} strokeLinecap="round" />
      <rect x={box.x + 13} y={box.y - 8} width={14} height={12} rx={2} fill={sunken} stroke={AXIS} />
    </g>,
  );
  // Top knobs (channel + volume/power)
  [box.x + 66, box.x + 96].forEach((cx, i) => {
    els.push(
      <g key={`knob${i}`}>
        <circle cx={cx} cy={box.y - 2} r={10} fill={fill} stroke={AXIS} strokeWidth={1.4} />
        <line x1={cx} y1={box.y - 11} x2={cx} y2={box.y - 7} stroke={AXIS} strokeWidth={1.6} />
      </g>,
    );
  });

  // Body
  els.push(<rect key="body" x={box.x} y={box.y} width={box.w} height={box.h} rx={16} fill={fill} stroke={AXIS} strokeWidth={1.6} />);
  // Side keys (PTT stack) on the left edge
  for (let i = 0; i < sideKeys; i++) {
    els.push(<rect key={`side${i}`} x={box.x - 5} y={box.y + 60 + i * 30} width={7} height={22} rx={2} fill={sunken} stroke={AXIS} />);
  }
  // Indicator LED
  els.push(<circle key="led" cx={box.x + box.w / 2} cy={box.y + 14} r={3.4} fill="var(--danger)" opacity={0.8} />);

  // Screen
  els.push(<rect key="screen" x={sx} y={sy} width={sw} height={sh} rx={6} fill={sunken} stroke={AXIS} strokeWidth={1.2} />);
  for (let r = 0; r < screenRows; r++) {
    const ry = sy + 8 + r * rowH;
    els.push(
      <g key={`srow${r}`}>
        <rect x={sx + 8} y={ry} width={sw * 0.62} height={rowH - 8} rx={2} fill="var(--primary)" opacity={0.16} />
        <rect x={sx + sw - 26} y={ry + 2} width={16} height={rowH - 12} rx={2} fill={AXIS} opacity={0.3} />
      </g>,
    );
  }

  // Nav pad or up/down keys
  if (nav === "pad") {
    els.push(
      <g key="nav">
        <circle cx={box.x + box.w / 2} cy={navCy} r={22} fill={fill} stroke={AXIS} strokeWidth={1.4} />
        <circle cx={box.x + box.w / 2} cy={navCy} r={8} fill={sunken} stroke={AXIS} />
      </g>,
    );
  } else {
    els.push(
      <g key="nav">
        <rect x={box.x + box.w / 2 - 16} y={navCy - 18} width={32} height={16} rx={4} fill={fill} stroke={AXIS} />
        <rect x={box.x + box.w / 2 - 16} y={navCy + 2} width={32} height={16} rx={4} fill={fill} stroke={AXIS} />
      </g>,
    );
  }

  // Function-key row (MENU/OK, A/B/C, Exit, V/M) above the numeric keypad
  if (keypad) {
    const fLabels = ["MENU", "ABC", "EXIT", "V/M"];
    const fw = 18;
    const fgap = 4;
    const fx0 = box.x + (box.w - (fw * 4 + fgap * 3)) / 2;
    const fy = navCy + 26;
    fLabels.forEach((lab, c) => {
      const x = fx0 + c * (fw + fgap);
      els.push(
        <g key={`fk${c}`}>
          <rect x={x} y={fy} width={fw} height={15} rx={3} fill={fill} stroke={AXIS} strokeWidth={1} />
          <text x={x + fw / 2} y={fy + 10} textAnchor="middle" fontSize={6.5} fill={LABEL} fontFamily={FONT}>
            {lab}
          </text>
        </g>,
      );
    });
  }

  // Numeric keypad
  if (keypad) {
    const labels = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["*", "0", "#"],
    ];
    const kw = 24;
    const kh = 18;
    const gx = 6;
    const gy = 6;
    const ky0 = navCy + 50;
    labels.forEach((rowLabels, r) => {
      rowLabels.forEach((lab, c) => {
        const x = kx0 + c * (kw + gx);
        const y = ky0 + r * (kh + gy);
        els.push(
          <g key={`k${r}${c}`}>
            <rect x={x} y={y} width={kw} height={kh} rx={3} fill={fill} stroke={AXIS} strokeWidth={1} />
            <text x={x + kw / 2} y={y + kh / 2 + 4} textAnchor="middle" fontSize={10} fill={LABEL} fontFamily={FONT}>
              {lab}
            </text>
          </g>,
        );
      });
    });
  }

  return (
    <FigureFrame
      title={spec.title}
      caption={spec.caption}
      viewBox={`0 0 ${W} ${H}`}
      ariaLabel={withCallouts(spec.title ?? "Radio layout diagram", spec.callouts)}
    >
      {els}
      <CalloutLayer callouts={spec.callouts ?? []} box={box} W={W} H={H} />
    </FigureFrame>
  );
}

// ---------------------------------------------------------------------------
// Display — stylised radio LCD with labelled indicators
// ---------------------------------------------------------------------------

function DisplayPlot({ spec }: { spec: VizSpec }) {
  const W = 720;
  const H = 430;
  const s = spec.screen ?? {};
  const rows = (s.rows ?? []).slice(0, 3);
  const box: Box = { x: 196, y: 54, w: 328, h: 300 };
  const MONO = "var(--font-mono)";

  const pad = 14;
  const topH = 26;
  const bottomH = s.bottomTags?.length ? 30 : 0;
  const areaTop = box.y + topH;
  const areaBottom = box.y + box.h - bottomH;
  const rowH = rows.length ? (areaBottom - areaTop) / rows.length : 0;

  const els: ReactNode[] = [];

  // Screen frame
  els.push(<rect key="fill" x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill="var(--ink)" opacity={0.05} />);
  els.push(<rect key="frame" x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill="none" stroke={AXIS} strokeWidth={1.6} />);

  // Top status icons
  (s.topIcons ?? []).forEach((t, i) => {
    const x = box.x + pad + i * 52;
    els.push(
      <g key={`ti${i}`}>
        <rect x={x} y={box.y + 6} width={46} height={15} rx={3} fill="var(--surface)" stroke={AXIS} strokeWidth={0.8} />
        <text x={x + 23} y={box.y + 16.5} textAnchor="middle" fontSize={9.5} fill={LABEL} fontFamily={FONT}>
          {t}
        </text>
      </g>,
    );
  });
  els.push(<line key="topline" x1={box.x} y1={areaTop} x2={box.x + box.w} y2={areaTop} stroke={AXIS} strokeOpacity={0.4} />);

  // Frequency rows
  rows.forEach((r, i) => {
    const y = areaTop + i * rowH;
    const cy = y + rowH / 2;
    if (r.active) {
      els.push(
        <rect key={`rh${i}`} x={box.x + 2} y={y + 2} width={box.w - 4} height={rowH - 4} rx={5} fill="var(--primary)" opacity={0.1} />,
      );
    }
    if (r.vfo) {
      els.push(
        <g key={`vfo${i}`}>
          <rect x={box.x + pad} y={cy - 18} width={22} height={22} rx={4} fill="var(--surface)" stroke={AXIS} />
          <text x={box.x + pad + 11} y={cy - 2} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--ink)" fontFamily={FONT}>
            {r.vfo}
          </text>
        </g>,
      );
    }
    els.push(
      <text
        key={`f${i}`}
        x={box.x + pad + 34}
        y={cy + 2}
        fontSize={30}
        fontWeight={600}
        fill="var(--ink)"
        fontFamily={MONO}
        letterSpacing="0.5"
      >
        {r.freq}
      </text>,
    );
    const tags = [r.mode, r.power, r.bw, r.shift, r.tone].filter(Boolean) as string[];
    tags.forEach((t, ti) => {
      const tx = box.x + box.w - pad - (tags.length - ti) * 26;
      els.push(
        <g key={`tag${i}-${ti}`}>
          <rect x={tx} y={cy - 20} width={22} height={13} rx={2} fill="var(--surface)" stroke={AXIS} strokeWidth={0.8} />
          <text x={tx + 11} y={cy - 10} textAnchor="middle" fontSize={9} fill={LABEL} fontFamily={FONT}>
            {t}
          </text>
        </g>,
      );
    });
    if (r.zone) {
      els.push(
        <text key={`z${i}`} x={box.x + box.w - pad} y={cy + 16} textAnchor="end" fontSize={11} fill={LABEL} fontFamily={FONT}>
          {r.zone}
        </text>,
      );
    }
    if (i > 0) {
      els.push(<line key={`rl${i}`} x1={box.x + 8} y1={y} x2={box.x + box.w - 8} y2={y} stroke={AXIS} strokeOpacity={0.25} />);
    }
  });

  // Bottom feature tags
  if (bottomH) {
    const by = box.y + box.h - bottomH;
    els.push(<line key="botline" x1={box.x} y1={by} x2={box.x + box.w} y2={by} stroke={AXIS} strokeOpacity={0.4} />);
    (s.bottomTags ?? []).forEach((t, i) => {
      const x = box.x + pad + i * 58;
      els.push(
        <text key={`bt${i}`} x={x} y={by + 20} fontSize={11} fontWeight={600} fill={LABEL} fontFamily={FONT}>
          {t}
        </text>,
      );
    });
  }

  return (
    <FigureFrame
      title={spec.title}
      caption={spec.caption}
      viewBox={`0 0 ${W} ${H}`}
      ariaLabel={withCallouts(spec.title ?? "Radio display diagram", spec.callouts)}
    >
      {els}
      <CalloutLayer callouts={spec.callouts ?? []} box={box} W={W} H={H} />
    </FigureFrame>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const NOT_A_FIGURE = "This block is marked as a signal figure, but it is not one Outpost can draw, so it is shown as written.";

function Drawing({ spec }: { spec: VizSpec }) {
  switch (spec.type) {
    case "wave":
      return <WavePlot spec={spec} />;
    case "spectrum":
      return <SpectrumPlot spec={spec} />;
    case "response":
      return <ResponsePlot spec={spec} />;
    case "polar":
      return <PolarPlot spec={spec} />;
    case "constellation":
      return <ConstellationPlot spec={spec} />;
    case "waterfall":
      return <WaterfallPlot spec={spec} />;
    case "device":
      return <DevicePlot spec={spec} />;
    case "display":
      return <DisplayPlot spec={spec} />;
    default:
      return null;
  }
}

/** A figure that fails while it is drawn must not take the page with it: its source is shown instead. */
class DrawnOrSource extends Component<{ source: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <FigureSource reason={NOT_A_FIGURE} source={this.props.source} /> : this.props.children;
  }
}

/** The figure a ```viz block describes, or the block as written when it does not describe one. */
export default function RadioViz({ source }: { source: string }) {
  const spec = readVizSpec(source);
  if (!spec) return <FigureSource reason={NOT_A_FIGURE} source={source} />;
  return (
    <DrawnOrSource key={source} source={source}>
      <Drawing spec={spec} />
    </DrawnOrSource>
  );
}
