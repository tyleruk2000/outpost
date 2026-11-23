/**
 * The diagrams of "How search was tuned", drawn with the shared plate parts
 * (features/diagrams). Each lays itself out for the width it is given and the text size,
 * wraps its words, and keeps its labels apart. Colours are chart tokens: what was
 * measured before is the neutral `chart-other`, what came after `chart-1`.
 */
import type { ReactNode } from "react";
import { type Anchor, type Point, textWidth } from "@/features/diagrams/geometry";
import { Arrow, Line, Mark, Path, Plate, type PlateBox } from "@/features/diagrams/plate";
import { cn } from "@/lib/utils";
import { BM25_LIBRARY, bm25Part, discount, OWNER_RESULTS, PI_P95, QUANTISE_EXAMPLE, quantise, WEIGHTS } from "./data";

/** Breaks a text into lines no wider than `width` at the label size. */
export function wrap(text: string, width: number, font: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, font) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function Text({
  at,
  anchor = "start",
  tone = "name",
  children,
}: {
  at: Point;
  anchor?: Anchor;
  tone?: "name" | "read" | "strong";
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
        "text-small stroke-page [paint-order:stroke] [stroke-linejoin:round] [stroke-width:4px]",
        tone === "name" ? "fill-ink-muted" : tone === "read" ? "fill-ink" : "fill-ink font-semibold",
      )}
    >
      {children}
    </text>
  );
}

const FILL = { before: "fill-chart-other", after: "fill-chart-1", plain: "fill-chart-1", other: "fill-chart-3" } as const;

// ── Rows of bars, one scale ────────────────────────────────────────────────

interface BarRow {
  label: string;
  value: number;
  shown: string;
  tone?: keyof typeof FILL;
}

function layoutBars(box: PlateBox, rows: BarRow[], max: number) {
  const f = box.font;
  const line = f * 1.4;
  const valueRoom = Math.max(...rows.map((row) => textWidth(row.shown, f))) + f * 0.8;
  const barRoom = Math.max(f * 3, box.width - valueRoom - 2);
  let y = f * 0.4;
  const laid = rows.map((row) => {
    const lines = wrap(row.label, box.width - 2, f);
    const top = y + f * 0.5;
    y += lines.length * line;
    const bar = { y: y + f * 0.1, height: f * 0.9, width: Math.max(1.5, (row.value / max) * barRoom) };
    y += f * 0.9 + f * 1.1;
    return { ...row, lines, top, bar };
  });
  return { f, line, laid, height: y };
}

function BarPlate({
  name,
  rows,
  max,
  caption,
  description,
}: {
  name: string;
  rows: BarRow[];
  max: number;
  caption: ReactNode;
  description: string;
}) {
  return (
    <Plate name={name} maxWidth={36} caption={caption} description={description} height={(box) => layoutBars(box, rows, max).height}>
      {(box) => {
        const { f, line, laid } = layoutBars(box, rows, max);
        return (
          <g>
            {laid.map((row) => (
              <g key={row.label}>
                {row.lines.map((text, at) => (
                  <Text key={text} at={[0, row.top + at * line]} tone="read">
                    {text}
                  </Text>
                ))}
                <rect x={0} y={row.bar.y} width={row.bar.width} height={row.bar.height} rx={2} className={FILL[row.tone ?? "plain"]} />
                <Text at={[row.bar.width + f * 0.4, row.bar.y + row.bar.height / 2]} tone="strong">
                  {row.shown}
                </Text>
              </g>
            ))}
          </g>
        );
      }}
    </Plate>
  );
}

/** The owner's eight results and the score each was shown: place in its own list, not how good it was. */
export function OldScoresPlate() {
  return (
    <BarPlate
      name="tuned-old-scores"
      max={1}
      rows={OWNER_RESULTS.map((result) => ({ label: result.title, value: result.shown, shown: result.shown.toFixed(3), tone: "before" }))}
      caption="The scores shown before tuning, for “How to change car battery”. They fall by about 1.6% a place whatever the result is about, because they were made from places, not from what the results held."
      description="Eight horizontal bars of almost the same length, one for each result: a physics textbook and a 3D-printing question both at 1.000, a radio menu and a question about a car charger at 0.984, then 0.968, 0.953, 0.938 and 0.924. None of the eight is about changing a car battery."
    />
  );
}

/** How much each of the first five places counts in nDCG. */
export function DiscountPlate() {
  const rows = [1, 2, 3, 4, 5].map((place) => ({
    label: `Place ${place}: 1 ÷ log₂(${place + 1})`,
    value: discount(place),
    shown: discount(place).toFixed(2),
  }));
  return (
    <BarPlate
      name="tuned-discount"
      max={1}
      rows={rows}
      caption="The discount: how much a result counts at each place. First place counts in full; fifth place counts for less than half."
      description="Five bars getting shorter: place 1 counts 1.00, place 2 0.63, place 3 0.50, place 4 0.43 and place 5 0.39."
    />
  );
}

/** The five weights of the final score, as bars of one scale. */
export function WeightsPlate() {
  return (
    <BarPlate
      name="tuned-weights"
      max={0.5}
      rows={WEIGHTS.map((part) => ({
        label: `${part.name}: ${part.what.toLowerCase()}`,
        value: part.weight,
        shown: part.weight.toFixed(2),
      }))}
      caption="The five parts of a result’s score and the weight of each. They add up to 1, and coverage alone is half."
      description="Five bars. Coverage 0.50 is the longest, then title 0.20, closeness 0.15, frequency 0.10 and side by side 0.05."
    />
  );
}

/** Own results' slowest searches on the Pi, at each point measured. */
export function SpeedPlate() {
  return (
    <BarPlate
      name="tuned-p95"
      max={888}
      rows={PI_P95.map((point, index) => ({
        label: point.label,
        value: point.ms,
        shown: `${point.ms} ms`,
        tone: index === 0 ? "before" : "after",
      }))}
      caption="The p95 time of the library’s own results on the Raspberry Pi: 95 of every 100 searches took no longer than this."
      description="Three bars: 888 ms before tuning, 393 ms after the fourth package of changes, 122 ms after the fifth."
    />
  );
}

/** Memory for the meaning index, as 32-bit and as 8-bit numbers. */
export function MemoryPlate() {
  return (
    <BarPlate
      name="tuned-memory"
      max={90}
      rows={[
        { label: "60,000 passages, 384 numbers each, 4 bytes a number", value: 90, shown: "≈ 90 MB", tone: "before" },
        { label: "The same, 1 byte a number and one scale a row", value: 23, shown: "≈ 23 MB", tone: "after" },
      ]}
      caption="Memory for the numbers of 60,000 passages. Eight bits instead of thirty-two take a quarter of the room."
      description="Two bars: about 90 megabytes as 32-bit numbers, about 23 megabytes as 8-bit numbers."
    />
  );
}

/** nDCG@5 on the Pi at each point it was measured live. */
export function ProgressPlate() {
  return (
    <BarPlate
      name="tuned-progress"
      max={1}
      rows={[
        { label: "Before", value: 0.393, shown: "0.393", tone: "before" },
        { label: "After package 4", value: 0.863, shown: "0.863", tone: "after" },
        { label: "After package 5, with search by meaning", value: 0.873, shown: "0.873", tone: "after" },
      ]}
      caption="nDCG@5 of the evaluation set on the Raspberry Pi, measured live: how good the order of the first five results was, 1 being the best order possible."
      description="Three bars: 0.393 before tuning, 0.863 after the fourth package, 0.873 after the fifth."
    />
  );
}

// ── The way through a search ───────────────────────────────────────────────

const STEPS = [
  "Read the question: leave out “how” and “to”; add “replace” and “fit” for “change”, because a part (a battery) is named.",
  "Find every passage that holds every word, in the full-text index.",
  "Group the passages into their items. Score the best 200 items again, on one scale from 0 to 1.",
  "Adjust a little for the kind of question: at most × 1.3 for a fitting source, × 0.75 for another meaning of a word.",
  "Add search by meaning: it lifts what the words found, and adds what they missed, below them.",
  "Ask the six reference collections most likely to hold the answer. Score their articles on the same scale.",
  "Show one list, each result with the reason it is there.",
];

function layoutSteps(box: PlateBox) {
  const f = box.font;
  const line = f * 1.45;
  const indent = f * 2.4;
  let y = f * 0.8;
  const steps = STEPS.map((text, index) => {
    const lines = wrap(text, box.width - indent - 2, f);
    const top = y;
    y += lines.length * line + f * 0.9;
    return { index, lines, top };
  });
  return { f, line, indent, steps, height: y - f * 0.3 };
}

export function PipelinePlate() {
  return (
    <Plate
      name="tuned-pipeline"
      maxWidth={38}
      caption="What happens to “How to change car battery” now, in order. Each step is explained further down the page."
      description="Seven numbered steps down a line: reading the question, finding passages, scoring items, adjusting for the kind of question, adding search by meaning, asking reference collections, and showing one list with reasons."
      height={(box) => layoutSteps(box).height}
    >
      {(box) => {
        const { f, line, indent, steps } = layoutSteps(box);
        const x = f * 0.8;
        const last = steps[steps.length - 1]!;
        return (
          <g>
            <Line from={[x, steps[0]!.top]} to={[x, last.top]} stroke="guide" />
            {steps.map((step) => (
              <g key={step.index}>
                <circle cx={x} cy={step.top} r={f * 0.72} className="fill-page stroke-ink" strokeWidth={1.5} />
                <text
                  x={x}
                  y={step.top}
                  textAnchor="middle"
                  dominantBaseline="central"
                  data-label
                  className="fill-ink text-small font-semibold"
                >
                  {step.index + 1}
                </text>
                {step.lines.map((text, at) => (
                  <Text key={text} at={[indent, step.top + at * line]} tone="read">
                    {text}
                  </Text>
                ))}
              </g>
            ))}
          </g>
        );
      }}
    </Plate>
  );
}

// ── Stems ──────────────────────────────────────────────────────────────────

const STEM_GROUPS: Array<{ stem: string; words: Array<{ word: string; other?: boolean }> }> = [
  { stem: "tyre", words: [{ word: "tyre" }, { word: "tyres" }] },
  { stem: "tire", words: [{ word: "tire" }, { word: "tires" }, { word: "tired", other: true }] },
  { stem: "batteri", words: [{ word: "battery" }, { word: "batteries" }] },
];

function layoutStems(box: PlateBox) {
  const f = box.font;
  const row = f * 1.9;
  const left = 2;
  const right = Math.min(box.width - textWidth("batteri", f) - 2, Math.max(textWidth("batteries", f) + f * 6, box.width * 0.55));
  let y = f * 2.2;
  const groups = STEM_GROUPS.map((group) => {
    const words = group.words.map((word) => {
      const at = y;
      y += row;
      return { ...word, y: at };
    });
    const centre = (words[0]!.y + words[words.length - 1]!.y) / 2;
    y += f * 0.6;
    return { ...group, words, centre };
  });
  const noteLines = wrap("“tired” is another word, but it shares the stem “tire”", box.width - 4, f);
  const noteTop = y + f * 0.2;
  return { f, row, left, right, groups, noteLines, noteTop, height: noteTop + noteLines.length * f * 1.45 };
}

export function StemsPlate() {
  return (
    <Plate
      name="tuned-stems"
      maxWidth={30}
      caption="Words as typed, on the left, and the stems the index keeps, on the right. A search finds a passage when their stems match."
      description="Lines join each word to its stem: tyre and tyres to tyre; tire, tires and tired to tire; battery and batteries to batteri. The line from tired is drawn in the accent colour: it is a different word that the stemmer has cut to the same stem as tire."
      height={(box) => layoutStems(box).height}
    >
      {(box) => {
        const { f, left, right, groups, noteLines, noteTop } = layoutStems(box);
        return (
          <g>
            <Text at={[left, f * 0.7]} tone="name">
              Typed
            </Text>
            <Text at={[right, f * 0.7]} tone="name">
              Stem
            </Text>
            {groups.map((group) => (
              <g key={group.stem}>
                {group.words.map((word) => (
                  <g key={word.word}>
                    <Arrow
                      from={[left + textWidth(word.word, f) + f * 0.4, word.y]}
                      to={[right - f * 0.5, group.centre]}
                      stroke={word.other ? "subject" : "guide"}
                    />
                    <Text at={[left, word.y]} tone={word.other ? "strong" : "read"}>
                      {word.word}
                    </Text>
                  </g>
                ))}
                <Text at={[right, group.centre]} tone="strong">
                  {group.stem}
                </Text>
              </g>
            ))}
            {noteLines.map((text, index) => (
              <Text key={text} at={[left, noteTop + index * f * 1.45]} tone="name">
                {text}
              </Text>
            ))}
          </g>
        );
      }}
    </Plate>
  );
}

// ── Diminishing returns in BM25 ────────────────────────────────────────────

function layoutSaturation(box: PlateBox) {
  const f = box.font;
  const left = textWidth("2.0", f) + f * 0.8;
  const top = f * 1.2;
  const plotHeight = Math.max(f * 9, Math.min(220, box.width * 0.5));
  const bottom = top + plotHeight;
  const right = box.width - 4;
  const caption = wrap("Times the word occurs in the passage", box.width - left, f);
  return { f, left, top, bottom, right, caption, height: bottom + f * 1.6 + caption.length * f * 1.45 };
}

export function SaturationPlate() {
  const curves = [
    { name: "80 words", length: 80, tone: "stroke-chart-1" },
    { name: "300 words", length: 300, tone: "stroke-chart-3" },
  ];
  const most = 10;
  const top = 2.2;
  return (
    <Plate
      name="tuned-saturation"
      maxWidth={34}
      caption="BM25’s diminishing returns. The first time a word occurs counts most; each repeat adds less; no number of repeats passes 2.2. The same count is worth less in a long passage."
      description="Two rising curves that flatten out, the share of a word plotted against how often it occurs, from 0 to 10 times. The curve for a short passage of 80 words is above the curve for a long one of 300 words. Both stay under 2.2."
      height={(box) => layoutSaturation(box).height}
    >
      {(box) => {
        const { f, left, top: y0, bottom, right, caption } = layoutSaturation(box);
        const x = (count: number) => left + (count / most) * (right - left);
        const y = (value: number) => bottom - (value / top) * (bottom - y0);
        const ends = curves.map((curve) => bm25Part(most, curve.length, BM25_LIBRARY.average));
        return (
          <g>
            <Line from={[left, bottom]} to={[right, bottom]} stroke="guide" />
            <Line from={[left, y0]} to={[left, bottom]} stroke="guide" />
            <Path d={`M${left},${y(2.2)}L${right},${y(2.2)}`} stroke="sight" />
            {[0, 1, 2].map((value) => (
              <Text key={value} at={[left - f * 0.4, y(value)]} anchor="end">
                {value.toFixed(1)}
              </Text>
            ))}
            {[0, 5, 10].map((count) => (
              <Text key={count} at={[x(count), bottom + f * 0.9]} anchor={count === 0 ? "start" : count === most ? "end" : "middle"}>
                {count}
              </Text>
            ))}
            {caption.map((text, index) => (
              <Text key={text} at={[left, bottom + f * 2.3 + index * f * 1.45]}>
                {text}
              </Text>
            ))}
            {curves.map((curve, index) => {
              const points: string[] = [];
              for (let count = 0; count <= most; count += 0.25) {
                points.push(`${x(count).toFixed(1)},${y(bm25Part(count, curve.length, BM25_LIBRARY.average)).toFixed(1)}`);
              }
              return (
                <g key={curve.name}>
                  <path d={`M${points.join("L")}`} className={curve.tone} strokeWidth={2} fill="none" strokeLinecap="round" />
                  <Text at={[right, y(ends[index]!) + (index === 0 ? -f * 0.95 : f * 0.95)]} anchor="end" tone="read">
                    {curve.name}
                  </Text>
                </g>
              );
            })}
            {[1, 2, 6].map((count) => (
              <Mark key={count} at={[x(count), y(bm25Part(count, 80, BM25_LIBRARY.average))]} r={3} />
            ))}
          </g>
        );
      }}
    </Plate>
  );
}

// ── Eight bits for a number ────────────────────────────────────────────────

function layoutQuantise(box: PlateBox) {
  const f = box.font;
  const cell = textWidth("−0.610", f) + f * 0.9;
  const columns = Math.max(2, Math.min(QUANTISE_EXAMPLE.length, Math.floor((box.width - 2) / cell)));
  const rowsOfNumbers = Math.ceil(QUANTISE_EXAMPLE.length / columns);
  const line = f * 1.5;
  const labels = ["As stored: four bytes each", "As 8 bits: one byte each, × the scale 0.00535", "Read back: byte × scale"];
  let y = f * 0.8;
  const bands = labels.map((label) => {
    const lines = wrap(label, box.width - 2, f);
    const top = y;
    y += lines.length * line;
    const numbers = y;
    y += rowsOfNumbers * line + f * 0.8;
    return { lines, top, numbers };
  });
  return { f, line, cell, columns, bands, height: y };
}

const signed = (value: number, places: number) => (value < 0 ? `−${Math.abs(value).toFixed(places)}` : value.toFixed(places));

export function QuantisePlate() {
  const { bytes, back } = quantise(QUANTISE_EXAMPLE);
  const rows = [
    QUANTISE_EXAMPLE.map((value) => signed(value, 2)),
    bytes.map((byte) => signed(byte, 0)),
    back.map((value) => signed(value, 3)),
  ];
  return (
    <Plate
      name="tuned-int8"
      maxWidth={34}
      caption="Six of a passage’s 384 numbers, kept as whole numbers from −127 to 127. The largest, 0.68, becomes 127; the rest are rounded in proportion. Read back, each is out by less than 0.003."
      description="Three rows of six numbers. As stored: 0.42, −0.18, 0.07, −0.61, 0.33, 0.68. As 8 bits: 78, −34, 13, −114, 62, 127. Read back: 0.418, −0.182, 0.070, −0.610, 0.332, 0.680."
      height={(box) => layoutQuantise(box).height}
    >
      {(box) => {
        const { f, line, cell, columns, bands } = layoutQuantise(box);
        return (
          <g>
            {bands.map((band, which) => (
              <g key={band.top}>
                {band.lines.map((text, at) => (
                  <Text key={text} at={[0, band.top + at * line]}>
                    {text}
                  </Text>
                ))}
                {rows[which]!.map((text, index) => (
                  <Text
                    key={QUANTISE_EXAMPLE[index]}
                    at={[(index % columns) * cell + cell - f * 0.9, band.numbers + Math.floor(index / columns) * line]}
                    anchor="end"
                    tone={which === 1 ? "strong" : "read"}
                  >
                    {text}
                  </Text>
                ))}
              </g>
            ))}
          </g>
        );
      }}
    </Plate>
  );
}
