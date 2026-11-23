import type { ExplainHit, ExplainResponse } from "@outpost/shared";
import { RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWidth } from "@/lib/use-width";
import { cn, plural } from "@/lib/utils";
import { COLOR, passageName } from "../charts/colors";
import { AxisNote, HiddenTable, Legend } from "../charts/figure";
import { LinePlot } from "../charts/line-plot";
import { Tip, TipBody, useTip } from "../charts/tip";
import { foundBy, layoutBump, linkPath } from "../lib/bump";
import { type Fused, type FusionSettings, fuse, movement, type RankPair, rankPairs, reciprocalCurve } from "../lib/rrf";
import { formatShare, niceMax } from "../lib/scale";

export type FusedRow = RankPair & Fused & { hit: ExplainHit };

export interface WhatIf {
  settings: FusionSettings;
  /** The values in force on the server, from the trace. */
  actual: FusionSettings;
  changed: boolean;
  set: (patch: Partial<FusionSettings>) => void;
  reset: () => void;
  /** The fused order under `settings`, recomputed in the browser. */
  rows: FusedRow[];
  /** Places each passage moved compared with the real settings: positive means it rose. */
  moved: Map<number, number>;
}

/** The fusion settings as sliders can change them, and the order that results. Nothing is sent to the server. */
export function useWhatIf(trace: ExplainResponse): WhatIf {
  const actual = useMemo<FusionSettings>(
    () => ({ k: trace.fusion.k, keywordWeight: trace.fusion.keywordWeight, semanticWeight: trace.fusion.semanticWeight }),
    [trace.fusion.k, trace.fusion.keywordWeight, trace.fusion.semanticWeight],
  );
  const [override, setOverride] = useState<Partial<FusionSettings>>({});
  const settings = useMemo(() => ({ ...actual, ...override }), [actual, override]);
  const pairs = useMemo(() => rankPairs<ExplainHit>(trace.keyword.hits, trace.semantic.hits), [trace.keyword.hits, trace.semantic.hits]);
  const rows = useMemo(() => fuse(pairs, settings), [pairs, settings]);
  const baseline = useMemo(() => fuse(pairs, actual), [pairs, actual]);
  const moved = useMemo(() => movement(baseline, rows), [baseline, rows]);
  const changed =
    settings.k !== actual.k || settings.keywordWeight !== actual.keywordWeight || settings.semanticWeight !== actual.semanticWeight;
  return {
    settings,
    actual,
    changed,
    rows,
    moved,
    set: (patch) => setOverride((current) => ({ ...current, ...patch })),
    reset: () => setOverride({}),
  };
}

const score = (value: number) => value.toFixed(4);

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  color,
  actual,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  color: string;
  actual: number;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="flex items-center gap-2 text-small font-medium text-ink">
          <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
          {label}
        </label>
        <output htmlFor={id} className="tabular text-small font-semibold text-ink">
          {value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="understand-range mt-1 w-full"
        style={{ accentColor: color }}
      />
      <p className="tabular text-micro text-ink-muted">{value === actual ? "Your setting" : `Your setting is ${actual}`}</p>
    </div>
  );
}

/** The formula with the numbers in force, and sliders that change them on this page only. */
export function FusionControls({ whatIf }: { whatIf: WhatIf }) {
  const { settings, actual, changed, set, reset } = whatIf;
  return (
    <div>
      <p className="sr-only">
        Score equals {settings.keywordWeight} divided by ({settings.k} plus the rank by words), plus {settings.semanticWeight} divided by (
        {settings.k} plus the rank by meaning).
      </p>
      <p aria-hidden className="font-mono text-[0.8125rem] leading-relaxed break-words text-ink">
        score = <span className="font-semibold">{settings.keywordWeight}</span> ÷ (<span className="font-semibold">{settings.k}</span> +
        rank by words) + <span className="font-semibold">{settings.semanticWeight}</span> ÷ (
        <span className="font-semibold">{settings.k}</span> + rank by meaning)
      </p>
      <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-3">
        <Slider
          label="k"
          value={settings.k}
          actual={actual.k}
          min={1}
          max={200}
          step={1}
          color={COLOR.fused}
          onChange={(k) => set({ k })}
        />
        <Slider
          label="Weight of words"
          value={settings.keywordWeight}
          actual={actual.keywordWeight}
          min={0}
          max={3}
          step={0.1}
          color={COLOR.keyword}
          onChange={(keywordWeight) => set({ keywordWeight })}
        />
        <Slider
          label="Weight of meaning"
          value={settings.semanticWeight}
          actual={actual.semanticWeight}
          min={0}
          max={3}
          step={0.1}
          color={COLOR.meaning}
          onChange={(semanticWeight) => set({ semanticWeight })}
        />
      </div>
      <div className="mt-3 flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1">
        <p aria-live="polite" className="text-small text-ink-muted">
          {changed
            ? "This is a what-if on this page. Your settings have not changed, and search everywhere else still uses them."
            : "Move a slider to see the order below change. Nothing is saved."}
        </p>
        {changed ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw aria-hidden /> Back to your settings
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PassageTip({ row, settings }: { row: FusedRow; settings: FusionSettings }) {
  return (
    <TipBody value={`Final place ${row.rank}`} label={passageName(row.hit)}>
      <ul className="mt-1 grid gap-0.5 text-small">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: COLOR.keyword }} />
          {row.keywordRank === null ? (
            "not found by words"
          ) : (
            <span className="tabular">
              by words: place {row.keywordRank}, {settings.keywordWeight} ÷ ({settings.k} + {row.keywordRank}) ={" "}
              <span className="font-semibold text-ink">{score(row.keywordPart)}</span>
            </span>
          )}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: COLOR.meaning }} />
          {row.semanticRank === null ? (
            "not found by meaning"
          ) : (
            <span className="tabular">
              by meaning: place {row.semanticRank}, {settings.semanticWeight} ÷ ({settings.k} + {row.semanticRank}) ={" "}
              <span className="font-semibold text-ink">{score(row.semanticPart)}</span>
            </span>
          )}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: COLOR.fused }} />
          <span className="tabular">
            together: <span className="font-semibold text-ink">{score(row.score)}</span>
          </span>
        </li>
      </ul>
    </TipBody>
  );
}

export function bumpReading(rows: FusedRow[], shown: number): string {
  const top = rows.slice(0, shown);
  if (top.length === 0) return "Neither search found anything, so there is nothing to combine.";
  const both = top.filter((row) => row.keywordRank !== null && row.semanticRank !== null).length;
  const first = rows[0]!;
  const lead = `${both} of the top ${top.length} ${both === 1 ? "was" : "were"} found by both searches.`;
  const winner =
    first.keywordRank !== null && first.semanticRank !== null
      ? `First place went to a passage that words put ${ordinal(first.keywordRank)} and meaning put ${ordinal(first.semanticRank)}.`
      : `First place went to a passage ${foundBy(first)}.`;
  return `${lead} ${winner}`;
}

export function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}

const ROW_HEIGHT = 26;
export const BUMP_SHOWN = 10;

/**
 * Three columns: the order by words, the final order, the order by meaning. A line
 * joins each passage's place in a search to its final place.
 */
export function BumpChart({ whatIf }: { whatIf: WhatIf }) {
  const { rows, settings, moved, changed } = whatIf;
  const [ref, width] = useWidth(720);
  const tip = useTip();
  const [active, setActive] = useState<number | null>(null);
  const layout = useMemo(() => layoutBump(rows, { shown: BUMP_SHOWN, rowHeight: ROW_HEIGHT, top: 4 }), [rows]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.chunkId, row])), [rows]);

  const gutter = 30;
  const tight = width < 380;
  const band = width < 560 ? Math.max(120, width - 2 * (gutter + 44)) : Math.min(380, width - 2 * (gutter + 110));
  const bandLeft = (width - band) / 2;
  const bandRight = bandLeft + band;
  const leftX = gutter;
  const rightX = width - gutter;

  const focus = (chunkId: number, target: Element) => {
    const row = byId.get(chunkId);
    if (!row) return;
    setActive(chunkId);
    tip.show(target, <PassageTip row={row} settings={settings} />);
  };
  const blur = () => {
    setActive(null);
    tip.hide();
  };
  const dim = (chunkId: number, base: number) => (active === null ? base : active === chunkId ? 1 : 0.12);

  return (
    <div ref={tip.boxRef} className="relative">
      <div className="mb-2 grid grid-cols-3 text-small font-medium text-ink">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: COLOR.keyword }} />{" "}
          {tight ? "Words" : "By words"}
        </span>
        <span className="flex items-center justify-center gap-2">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: COLOR.fused }} />{" "}
          {tight ? "Final" : "Final order"}
        </span>
        <span className="flex items-center justify-end gap-2">
          {tight ? "Meaning" : "By meaning"}{" "}
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: COLOR.meaning }} />
        </span>
      </div>
      <div ref={ref} className="relative" style={{ height: layout.height }}>
        <svg width={width} height={layout.height} aria-hidden className="absolute inset-0 block max-w-full">
          {layout.lines.map((line) => (
            <g key={line.chunkId} opacity={dim(line.chunkId, line.below ? 0.3 : 0.75)}>
              {line.keywordY !== null ? (
                <path
                  d={linkPath(leftX + 5, line.keywordY, bandLeft - 6, line.fusedY)}
                  fill="none"
                  stroke={COLOR.keyword}
                  strokeWidth={active === line.chunkId ? 2.5 : 1.5}
                />
              ) : null}
              {line.semanticY !== null ? (
                <path
                  d={linkPath(rightX - 5, line.semanticY, bandRight + 6, line.fusedY)}
                  fill="none"
                  stroke={COLOR.meaning}
                  strokeWidth={active === line.chunkId ? 2.5 : 1.5}
                />
              ) : null}
            </g>
          ))}
          {layout.lines.map((line) => (
            <g key={`dots-${line.chunkId}`} opacity={dim(line.chunkId, 1)}>
              {line.keywordY !== null ? (
                <>
                  <text x={leftX - 10} y={line.keywordY + 4} textAnchor="end" className="tabular fill-ink-muted text-[0.6875rem]">
                    {line.keywordRank}
                  </text>
                  <circle cx={leftX} cy={line.keywordY} r={4} fill={COLOR.keyword} stroke={COLOR.page} strokeWidth={1.5} />
                </>
              ) : null}
              {line.semanticY !== null ? (
                <>
                  <text x={rightX + 10} y={line.semanticY + 4} textAnchor="start" className="tabular fill-ink-muted text-[0.6875rem]">
                    {line.semanticRank}
                  </text>
                  <circle cx={rightX} cy={line.semanticY} r={4} fill={COLOR.meaning} stroke={COLOR.page} strokeWidth={1.5} />
                </>
              ) : null}
              {!line.below ? (
                <>
                  <circle
                    cx={bandLeft - 1}
                    cy={line.fusedY}
                    r={line.keywordY !== null ? 4 : 2.5}
                    fill={line.keywordY !== null ? COLOR.fused : COLOR.other}
                    stroke={COLOR.page}
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={bandRight + 1}
                    cy={line.fusedY}
                    r={line.semanticY !== null ? 4 : 2.5}
                    fill={line.semanticY !== null ? COLOR.fused : COLOR.other}
                    stroke={COLOR.page}
                    strokeWidth={1.5}
                  />
                </>
              ) : null}
            </g>
          ))}
        </svg>
        {/* Hit areas over the two outer columns, so the dots answer the pointer too. */}
        {layout.lines.flatMap((line) => [
          line.keywordY !== null ? (
            <span
              key={`k-${line.chunkId}`}
              className="absolute size-6 -translate-x-1/2 -translate-y-1/2"
              style={{ left: leftX, top: line.keywordY }}
              onPointerEnter={(event) => focus(line.chunkId, event.currentTarget)}
              onPointerLeave={blur}
            />
          ) : null,
          line.semanticY !== null ? (
            <span
              key={`s-${line.chunkId}`}
              className="absolute size-6 -translate-x-1/2 -translate-y-1/2"
              style={{ left: rightX, top: line.semanticY }}
              onPointerEnter={(event) => focus(line.chunkId, event.currentTarget)}
              onPointerLeave={blur}
            />
          ) : null,
        ])}
        <ol aria-label="Final order, with each passage's place in the two searches">
          {rows.slice(0, layout.fusedRows).map((row) => {
            const shift = moved.get(row.chunkId) ?? 0;
            return (
              <li
                key={row.chunkId}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so one passage can be followed across the chart from the keyboard
                tabIndex={0}
                aria-label={`Final place ${row.rank}: ${passageName(row.hit)}. ${row.keywordRank === null ? "Not found by words" : `Place ${row.keywordRank} by words`}; ${row.semanticRank === null ? "not found by meaning" : `place ${row.semanticRank} by meaning`}.`}
                className={cn(
                  "understand-mark absolute flex items-center gap-2 rounded-control px-2 text-small transition-opacity",
                  active !== null && active !== row.chunkId && "opacity-40",
                )}
                style={{ left: bandLeft + 8, width: band - 16, top: 4 + (row.rank - 1) * ROW_HEIGHT + 2, height: ROW_HEIGHT - 4 }}
                onPointerEnter={(event) => focus(row.chunkId, event.currentTarget)}
                onPointerLeave={blur}
                onFocus={(event) => focus(row.chunkId, event.currentTarget)}
                onBlur={blur}
                onKeyDown={(event) => event.key === "Escape" && blur()}
              >
                <span className="tabular w-4 shrink-0 text-right text-ink-muted">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{passageName(row.hit)}</span>
                {changed && shift !== 0 ? (
                  <span
                    className="tabular shrink-0 text-micro text-ink-muted"
                    title={`${shift > 0 ? "Up" : "Down"} ${Math.abs(shift)} from its place under your settings`}
                  >
                    {shift > 0 ? "↑" : "↓"}
                    {Math.abs(shift)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {layout.belowY !== null ? (
          <p
            className="absolute flex items-center text-small text-ink-muted"
            style={{ left: bandLeft + 8, width: band - 16, top: layout.belowY - ROW_HEIGHT / 2, height: ROW_HEIGHT }}
          >
            <span className="truncate">{plural(layout.belowCount, "more passage")} lower down</span>
          </p>
        ) : null}
      </div>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption="Each passage's place by words, by meaning, and in the final order"
        columns={["Final place", "Passage", "Place by words", "Place by meaning", "Fused score"]}
        rows={rows.map((row) => [row.rank, passageName(row.hit), row.keywordRank, row.semanticRank, score(row.score)])}
      />
    </div>
  );
}

export function contributionReading(rows: FusedRow[]): string {
  const top = rows.slice(0, BUMP_SHOWN);
  const first = top[0];
  if (!first) return "With no passages there are no scores to add up.";
  const share = first.score > 0 ? first.keywordPart / first.score : 0;
  const single = top.filter((row) => row.keywordRank === null || row.semanticRank === null).length;
  return `The top passage scores ${score(first.score)}, ${formatShare(share)} of it from words and ${formatShare(1 - share)} from meaning. ${single === 0 ? "Every passage here draws on both searches." : `${plural(single, "passage")} here ${single === 1 ? "has" : "have"} only one part, because only one search found ${single === 1 ? "it" : "them"}.`}`;
}

/** Each fused score as a stacked bar: the part from words and the part from meaning. */
export function ContributionBars({ whatIf }: { whatIf: WhatIf }) {
  const { rows, settings } = whatIf;
  const tip = useTip();
  const top = rows.slice(0, BUMP_SHOWN);
  const max = niceMax(Math.max(...top.map((row) => row.score), 1e-9), 4);
  const part = (row: FusedRow, which: "keyword" | "semantic") => {
    const value = which === "keyword" ? row.keywordPart : row.semanticPart;
    const rank = which === "keyword" ? row.keywordRank : row.semanticRank;
    const weight = which === "keyword" ? settings.keywordWeight : settings.semanticWeight;
    if (rank === null || value <= 0) return null;
    const name = which === "keyword" ? "From words" : "From meaning";
    return (
      <div
        key={which}
        role="img"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so its value can be read from the keyboard
        tabIndex={0}
        aria-label={`${name}: ${score(value)}, from place ${rank}`}
        className="understand-mark h-full min-w-[3px] last:rounded-r-[4px]"
        style={{ width: `${(value / max) * 100}%`, background: which === "keyword" ? COLOR.keyword : COLOR.meaning }}
        {...tip.bind(
          <TipBody value={score(value)} label={`${name}, place ${rank}`}>
            <span className="tabular">
              {weight} ÷ ({settings.k} + {rank}) = {score(value)}
            </span>
            <br />
            {passageName(row.hit)}
          </TipBody>,
        )}
      />
    );
  };
  return (
    <div ref={tip.boxRef} className="relative">
      <Legend
        className="mb-3"
        items={[
          { label: "From its place by words", color: COLOR.keyword },
          { label: "From its place by meaning", color: COLOR.meaning },
        ]}
      />
      <ol className="divide-y divide-border border-y border-border">
        {top.map((row) => (
          <li key={row.chunkId} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 py-2">
            <span aria-hidden className="tabular pt-px text-small text-ink-muted">
              {row.rank}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-small">
                <span className="min-w-0 truncate font-medium text-ink">{passageName(row.hit)}</span>
                <span className="tabular shrink-0 text-ink-muted">
                  {row.keywordRank !== null && row.semanticRank !== null
                    ? `${ordinal(row.keywordRank)} by words, ${ordinal(row.semanticRank)} by meaning`
                    : row.keywordRank !== null
                      ? `${ordinal(row.keywordRank)} by words only`
                      : `${ordinal(row.semanticRank ?? 0)} by meaning only`}
                </span>
              </p>
              <div className="mt-1 flex items-center gap-2.5">
                <div className="flex h-2.5 min-w-0 flex-1 gap-0.5">
                  {part(row, "keyword")}
                  {part(row, "semantic")}
                </div>
                <span className="tabular w-14 shrink-0 text-right text-small text-ink">{score(row.score)}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <AxisNote className="mt-2">
        Bar length is the fused score, from 0 to {score(max)}. The amount is small because each part is 1 divided by a number above{" "}
        {settings.k}; only the order matters.
      </AxisNote>
      <Tip tip={tip.tip} boxRef={tip.boxRef} />
      <HiddenTable
        caption="The two parts of each fused score"
        columns={["Final place", "Passage", "Place by words", "Part from words", "Place by meaning", "Part from meaning", "Fused score"]}
        rows={top.map((row) => [
          row.rank,
          passageName(row.hit),
          row.keywordRank,
          score(row.keywordPart),
          row.semanticRank,
          score(row.semanticPart),
          score(row.score),
        ])}
      />
    </div>
  );
}

const CURVE_RANKS = 20;

export function curveReading(k: number): string {
  const tenth = (k + 1) / (k + 10);
  return `With k at ${k}, tenth place still earns ${formatShare(tenth)} of what first place earns. A small k makes the top places dominate; a large k treats all the places more alike.`;
}

/** How quickly later places stop mattering: 1 ÷ (k + rank), shown as a share of first place. */
export function ReciprocalCurve({ whatIf }: { whatIf: WhatIf }) {
  const { settings, actual, changed } = whatIf;
  const relative = (k: number) => {
    const first = 1 / (k + 1);
    return reciprocalCurve(k, CURVE_RANKS).map((point) => point.value / first);
  };
  const series = [
    {
      id: "now",
      label: changed && settings.k !== actual.k ? `k = ${settings.k} (what if)` : `k = ${settings.k}`,
      endLabel: `k = ${settings.k}`,
      color: COLOR.fused,
      values: relative(settings.k),
    },
    ...(settings.k !== actual.k
      ? [
          {
            id: "actual",
            label: `k = ${actual.k} (your setting)`,
            endLabel: `k = ${actual.k}`,
            color: COLOR.other,
            values: relative(actual.k),
          },
        ]
      : []),
  ];
  return (
    <>
      <LinePlot
        ariaLabel="What each place contributes, as a share of first place."
        caption="What each place contributes, compared with first place"
        xColumn="Place in a list"
        xStart={1}
        series={series}
        xTicks={[1, 5, 10, 15, 20]}
        yTicks={[0, 0.25, 0.5, 0.75, 1]}
        formatY={(value) => `${Math.round(value * 100)}%`}
        describeX={(rank) => `${ordinal(rank)} place`}
        endLabelRoom={70}
        height={200}
      />
      <AxisNote className="mt-1">Across: place in a list. Up: what that place adds, as a share of what first place adds.</AxisNote>
    </>
  );
}
