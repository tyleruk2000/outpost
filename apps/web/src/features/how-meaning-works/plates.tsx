/**
 * The diagrams of "How search by meaning works", drawn with the shared plate parts
 * (features/diagrams). Each lays itself out for the width it is given and the text size,
 * and keeps its labels apart. The colours that stand for words, meaning, the combined
 * list and the question are the chart identities "How search works" uses for the same
 * things, so the two pages read alike.
 */
import type { ReactNode } from "react";
import { type Anchor, type Point, textWidth } from "@/features/diagrams/geometry";
import { Arrow, Line, Plate, type PlateBox } from "@/features/diagrams/plate";
import { cn } from "@/lib/utils";

/** What each identity is drawn in: chart tokens only. */
const STROKE = { words: "stroke-chart-1", together: "stroke-chart-2", meaning: "stroke-chart-3", question: "stroke-chart-4" } as const;
const FILL = {
  words: "fill-chart-1",
  together: "fill-chart-2",
  meaning: "fill-chart-3",
  question: "fill-chart-4",
  other: "fill-chart-other",
};

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

/** One line of text at the small size: muted for names, ink for what is read. */
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

/** A coloured line with an open arrowhead: the plate's arrow in a chart identity. */
function ColouredArrow({ from, to, tone }: { from: Point; to: Point; tone: keyof typeof STROKE }) {
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className={STROKE[tone]} strokeWidth={2} strokeLinecap="round" />
      <path d={chevronAt(to, from, 7)} className={STROKE[tone]} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function chevronAt(tip: Point, from: Point, size: number): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const spread = (28 * Math.PI) / 180;
  const a: Point = [tip[0] - size * Math.cos(angle - spread), tip[1] - size * Math.sin(angle - spread)];
  const b: Point = [tip[0] - size * Math.cos(angle + spread), tip[1] - size * Math.sin(angle + spread)];
  return `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${tip[0].toFixed(1)},${tip[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
}

/** The question's mark: a small diamond, as on "How search works". */
function Diamond({ at, size }: { at: Point; size: number }) {
  const [x, y] = at;
  return (
    <path
      d={`M${x},${y - size}L${x + size},${y}L${x},${y + size}L${x - size},${y}Z`}
      className={cn(FILL.question, "stroke-page")}
      strokeWidth={2}
    />
  );
}

// ── 1. Words and meaning ───────────────────────────────────────────────────

const WHY = {
  question: "You search for: car won’t start",
  branches: [
    { title: "Has your words", passage: "“If the car won’t start, check that there is fuel in the tank.”", tone: "words" as const },
    {
      title: "Has none of your words",
      passage: "“A flat battery is the commonest reason an engine will not turn over.”",
      tone: "meaning" as const,
    },
  ],
};

function layoutWhy(box: PlateBox) {
  const f = box.font;
  const line = f * 1.45;
  const trunk = f * 0.7;
  const indent = f * 2.6;
  const room = Math.max(f * 6, box.width - indent - 4);
  let y = f;
  const question = { y, lines: wrap(WHY.question, box.width - f * 2, f) };
  y += question.lines.length * line + f * 0.9;
  const branches = WHY.branches.map((branch) => {
    const top = y;
    const title = wrap(branch.title, room, f);
    const passage = wrap(branch.passage, room, f);
    y += (title.length + passage.length) * line + f * 1.1;
    return { ...branch, top, title, passage };
  });
  return { f, line, trunk, indent, question, branches, height: y };
}

/** A question, one passage that has its words and one that has its meaning. */
export function WhyPlate() {
  return (
    <Plate
      name="meaning-why"
      maxWidth={34}
      caption="Keyword search finds the first passage, because it holds the words. Search by meaning finds both, because both are about a car that will not start."
      description="A question at the top, “car won’t start”, with two branches below it. The first branch leads to a passage that holds the same words. The second leads to a passage about a flat battery that holds none of them, which only search by meaning can find."
      height={(box) => layoutWhy(box).height}
    >
      {(box) => {
        const { f, line, trunk, indent, question, branches } = layoutWhy(box);
        const last = branches[branches.length - 1]!;
        return (
          <g>
            <Diamond at={[trunk, question.y]} size={f * 0.45} />
            {question.lines.map((text, index) => (
              <Text key={text} at={[trunk + f, question.y + index * line]} tone="strong">
                {text}
              </Text>
            ))}
            <Line from={[trunk, question.y + f * 0.7]} to={[trunk, last.top]} stroke="guide" />
            {branches.map((branch) => (
              <g key={branch.tone}>
                <ColouredArrow from={[trunk, branch.top]} to={[indent - f * 0.5, branch.top]} tone={branch.tone} />
                {branch.title.map((text, index) => (
                  <Text key={text} at={[indent, branch.top + index * line]} tone="name">
                    {text}
                  </Text>
                ))}
                {branch.passage.map((text, index) => (
                  <Text key={text} at={[indent, branch.top + (branch.title.length + index) * line]} tone="read">
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

// ── 2. A passage becomes numbers ───────────────────────────────────────────

/** Fixed made-up values for the drawing: the shape of an embedding, not a real one. */
const SAMPLE = [
  0.42, -0.18, 0.07, -0.61, 0.33, 0.12, -0.27, 0.55, -0.09, 0.21, -0.44, 0.03, 0.68, -0.35, 0.15, -0.05, 0.29, -0.52, 0.38, 0.1, -0.22,
  0.47, -0.14, 0.06, -0.39, 0.25, 0.58, -0.07, 0.18, -0.31, 0.02, 0.44, -0.25, 0.13, -0.57, 0.36, 0.09, -0.12, 0.51, -0.41, 0.2, 0.04,
  -0.29, 0.62, -0.16, 0.27, -0.48, 0.11,
];

function layoutModel(box: PlateBox, modelName: string) {
  const f = box.font;
  const line = f * 1.45;
  const passage = wrap("“A flat battery is the commonest reason an engine will not turn over.”", box.width - 4, f);
  let y = f;
  const passageY = y;
  y += passage.length * line;
  const arrow1 = { from: y - f * 0.2, to: y + f * 1.8 };
  y += f * 2.4;
  const boxWidth = Math.min(box.width - 2, textWidth(modelName, f) + f * 2);
  const modelBox = { y, height: f * 2.4, width: boxWidth };
  y += modelBox.height;
  const arrow2 = { from: y + f * 0.2, to: y + f * 2.2 };
  y += f * 2.6;
  const amplitude = f * 1.4;
  const baseline = y + amplitude;
  const step = 6;
  const bars = Math.max(8, Math.min(SAMPLE.length, Math.floor((box.width - 2) / step)));
  y = baseline + amplitude + f * 1.2;
  const caption = wrap(`The first ${bars} of the 384 numbers, drawn as bars`, box.width - 4, f);
  const captionY = y;
  y += caption.length * line;
  return { f, line, passage, passageY, arrow1, modelBox, arrow2, baseline, amplitude, step, bars, caption, captionY, height: y };
}

/** A passage goes into the model and comes out as a row of numbers. */
export function ModelPlate({ modelName }: { modelName: string }) {
  return (
    <Plate
      name="meaning-model"
      maxWidth={34}
      caption="The model reads a passage and gives back a list of 384 numbers. Nobody chose what each number means; only the list as a whole stands for the passage."
      description="A passage about a flat battery at the top, an arrow down into a box for the model, and an arrow down to a row of small bars, some above a line and some below it. Each bar is one number: above the line for a positive number, below for a negative one."
      height={(box) => layoutModel(box, modelName).height}
    >
      {(box) => {
        const l = layoutModel(box, modelName);
        const x = l.f;
        return (
          <g>
            {l.passage.map((text, index) => (
              <Text key={text} at={[0, l.passageY + index * l.line]} tone="read">
                {text}
              </Text>
            ))}
            <Arrow from={[x, l.arrow1.from]} to={[x, l.arrow1.to]} stroke="guide" />
            <rect
              x={1}
              y={l.modelBox.y}
              width={l.modelBox.width}
              height={l.modelBox.height}
              rx={5}
              className="fill-surface stroke-ink"
              strokeWidth={1.5}
            />
            <Text at={[1 + l.f, l.modelBox.y + l.modelBox.height / 2]} tone="strong">
              {modelName}
            </Text>
            <Arrow from={[x, l.arrow2.from]} to={[x, l.arrow2.to]} stroke="guide" />
            <Line from={[0, l.baseline]} to={[l.bars * l.step, l.baseline]} stroke="guide" />
            {SAMPLE.slice(0, l.bars).map((value, index) => {
              const height = Math.max(1.5, Math.abs(value) * l.amplitude);
              return (
                <rect
                  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered sample
                  key={index}
                  x={index * l.step + 1}
                  y={value >= 0 ? l.baseline - height : l.baseline}
                  width={l.step - 2}
                  height={height}
                  rx={1}
                  className={FILL.meaning}
                />
              );
            })}
            {l.caption.map((text, index) => (
              <Text key={text} at={[0, l.captionY + index * l.line]} tone="name">
                {text}
              </Text>
            ))}
          </g>
        );
      }}
    </Plate>
  );
}

// ── 3 and 4. A map of meanings, and the nearest passages ───────────────────

interface Group {
  label: string;
  centre: Point;
  points: Point[];
}

/** Made-up positions on a flat map, in fractions of its size; offsets in fractions of its height. */
const GROUPS: Group[] = [
  {
    label: "Car trouble",
    centre: [0.24, 0.36],
    points: [
      [-0.07, -0.03],
      [0.05, -0.06],
      [0.0, 0.05],
      [0.08, 0.04],
      [-0.06, 0.08],
    ],
  },
  {
    label: "Drinking water",
    centre: [0.76, 0.3],
    points: [
      [-0.06, -0.02],
      [0.04, -0.06],
      [0.07, 0.05],
      [-0.02, 0.07],
    ],
  },
  {
    label: "First aid",
    centre: [0.62, 0.8],
    points: [
      [-0.07, 0.0],
      [0.03, -0.05],
      [0.06, 0.05],
      [-0.03, 0.08],
      [0.09, -0.02],
    ],
  },
];
const QUESTION: Point = [0.4, 0.5];

function layoutMap(box: PlateBox) {
  const f = box.font;
  const pad = 6;
  const top = f * 0.4;
  const height = Math.max(box.width * 0.62, f * 17);
  const place = ([u, v]: Point): Point => [pad + u * (box.width - 2 * pad), top + v * height];
  const groups = GROUPS.map((group) => {
    const centre = place(group.centre);
    const points = group.points.map(([dx, dy]) => [centre[0] + dx * height, centre[1] + dy * height] as Point);
    const highest = Math.min(...points.map((point) => point[1]));
    const half = textWidth(group.label, f) / 2;
    const labelX = Math.min(box.width - half - 2, Math.max(half + 2, centre[0]));
    return { ...group, centre, points, label: { text: group.label, at: [labelX, highest - f * 1.1] as Point } };
  });
  const question = place(QUESTION);
  const all = groups.flatMap((group) => group.points);
  const nearest = [...all]
    .sort((a, b) => Math.hypot(a[0] - question[0], a[1] - question[1]) - Math.hypot(b[0] - question[0], b[1] - question[1]))
    .slice(0, 3);
  return { f, groups, question, nearest, height: top + height + f * 0.6 };
}

/** Passages as points on a flat map, near one another when they mean similar things; with the question, its nearest three. */
export function MapPlate({ withQuestion = false }: { withQuestion?: boolean }) {
  return (
    <Plate
      name={withQuestion ? "meaning-nearest" : "meaning-map"}
      maxWidth={34}
      caption={
        withQuestion
          ? "Your question is put on the same map. The passages nearest to it are the ones search by meaning finds first: here, three about car trouble."
          : "Every passage is a point, placed by its numbers, so that passages about the same thing sit together. A simplification: the real map has 384 directions, not two."
      }
      description={
        withQuestion
          ? "The same map of three groups of points. A diamond for the question sits beside the car trouble group, with dashed lines to the three points closest to it, which are ringed."
          : "A flat map with three groups of dots: car trouble at the upper left, drinking water at the upper right and first aid at the bottom. Dots in the same group are close together; the groups are far apart."
      }
      height={(box) => layoutMap(box).height}
    >
      {(box) => {
        const { f, groups, question, nearest } = layoutMap(box);
        return (
          <g>
            {withQuestion
              ? nearest.map((point) => <Line key={`${point[0]},${point[1]}`} from={question} to={point} stroke="sight" />)
              : null}
            {groups.flatMap((group) =>
              group.points.map((point) => {
                const near = withQuestion && nearest.includes(point);
                return (
                  <g key={`${group.label}-${point[0]}-${point[1]}`}>
                    <circle
                      cx={point[0]}
                      cy={point[1]}
                      r={4.5}
                      className={cn(near ? FILL.meaning : FILL.other, "stroke-page")}
                      strokeWidth={1.5}
                    />
                    {near ? <circle cx={point[0]} cy={point[1]} r={8} className={STROKE.meaning} strokeWidth={1.5} fill="none" /> : null}
                  </g>
                );
              }),
            )}
            {groups.map((group) => (
              <Text key={group.label.text} at={group.label.at} anchor="middle" tone="name">
                {group.label.text}
              </Text>
            ))}
            {withQuestion ? (
              <>
                <Diamond at={question} size={f * 0.5} />
                <Text at={[question[0] + f * 0.9, question[1] + f * 0.2]} tone="strong">
                  Your question
                </Text>
              </>
            ) : null}
          </g>
        );
      }}
    </Plate>
  );
}

// ── 5. Two lists become one ─────────────────────────────────────────────────

export interface MergeRow {
  name: string;
  words: number | null;
  meaning: number | null;
}

function layoutMerge(box: PlateBox, words: string[], meaning: string[], together: string[]) {
  const f = box.font;
  const gap = Math.max(f * 1.4, box.width * 0.07);
  const column = (box.width - 2 * gap) / 3;
  const longest = Math.max(...[...words, ...meaning, ...together].map((name) => textWidth(`9 ${name}`, f)));
  const numbered = longest + f * 1.2 <= column;
  const pill = f * 2.1;
  const space = f * 0.7;
  const first = f * 2.4;
  const rowY = (index: number) => first + index * (pill + space);
  const xs = [0, column + gap, 2 * (column + gap)];
  const rows = Math.max(words.length, meaning.length, together.length);
  return { f, column, numbered, pill, rowY, xs, height: rowY(rows) + f * 0.2 };
}

/** The list by words and the list by meaning, each passage joined to its place in the combined list. */
export function MergePlate({ words, meaning, together }: { words: string[]; meaning: string[]; together: string[] }) {
  return (
    <Plate
      name="meaning-merge"
      maxWidth={36}
      caption={`The list by words and the list by meaning are combined into one. ${together[0]}, which is on both lists, comes first.`}
      description={`Three columns. On the left, the passages keyword search found, in order: ${words.join(", ")}. On the right, those search by meaning found: ${meaning.join(", ")}. In the middle, the combined list: ${together.join(", ")}. A line joins each passage to its place in the middle.`}
      height={(box) => layoutMerge(box, words, meaning, together).height}
    >
      {(box) => {
        const l = layoutMerge(box, words, meaning, together);
        const middle = (index: number) => l.rowY(index) + l.pill / 2;
        const pillText = (rank: number, name: string) => (l.numbered ? `${rank} ${name}` : name);
        const column = (x: number, names: string[], tone: keyof typeof STROKE) =>
          names.map((name, index) => (
            <g key={`${tone}-${name}`}>
              <rect
                x={x + 0.75}
                y={l.rowY(index)}
                width={l.column - 1.5}
                height={l.pill}
                rx={l.pill / 2}
                className={cn("fill-page", STROKE[tone])}
                strokeWidth={1.5}
              />
              <Text at={[x + l.f * 0.6, middle(index)]} tone="read">
                {pillText(index + 1, name)}
              </Text>
            </g>
          ));
        return (
          <g>
            {words.map((name, index) => {
              const to = together.indexOf(name);
              return (
                <path
                  key={`w-${name}`}
                  d={`M${l.xs[0]! + l.column},${middle(index)}C${l.xs[1]! - l.f},${middle(index)} ${l.xs[0]! + l.column + l.f},${middle(to)} ${l.xs[1]!},${middle(to)}`}
                  className={STROKE.words}
                  strokeWidth={1.5}
                  fill="none"
                />
              );
            })}
            {meaning.map((name, index) => {
              const to = together.indexOf(name);
              return (
                <path
                  key={`m-${name}`}
                  d={`M${l.xs[2]!},${middle(index)}C${l.xs[1]! + l.column + l.f},${middle(index)} ${l.xs[2]! - l.f},${middle(to)} ${l.xs[1]! + l.column},${middle(to)}`}
                  className={STROKE.meaning}
                  strokeWidth={1.5}
                  fill="none"
                />
              );
            })}
            {column(l.xs[0]!, words, "words")}
            {column(l.xs[1]!, together, "together")}
            {column(l.xs[2]!, meaning, "meaning")}
            <Text at={[l.xs[0]! + l.column / 2, l.f * 0.8]} anchor="middle" tone="strong">
              By words
            </Text>
            <Text at={[l.xs[1]! + l.column / 2, l.f * 0.8]} anchor="middle" tone="strong">
              Together
            </Text>
            <Text at={[l.xs[2]! + l.column / 2, l.f * 0.8]} anchor="middle" tone="strong">
              By meaning
            </Text>
          </g>
        );
      }}
    </Plate>
  );
}

// ── 6. Where it runs ────────────────────────────────────────────────────────

function layoutWhere(box: PlateBox, parts: string[]) {
  const f = box.font;
  const line = f * 1.45;
  const inner = f * 1.2;
  const width = box.width - 2;
  const room = width - 2 * inner - f * 1.2;
  let y = f * 1.6;
  const title = y;
  y += f * 1.4;
  const boxes = parts.map((part, index) => {
    const lines = wrap(part, room, f);
    const height = lines.length * line + f * 0.9;
    const top = y;
    y += height + (index < parts.length - 1 ? f * 1.6 : 0);
    return { lines, top, height };
  });
  y += inner;
  const outer = { top: f * 0.3, bottom: y };
  y += f * 3.2;
  const internet = y;
  y += f * 1.2;
  return { f, line, inner, width, title, boxes, outer, internet, height: y };
}

/** Everything inside one box marked "This Outpost"; the internet outside it, not reached. */
export function WherePlate({ modelLine }: { modelLine: string }) {
  const parts = ["Your documents and pages, cut into passages", modelLine, "The numbers for every passage, kept on this Outpost’s disk"];
  return (
    <Plate
      name="meaning-where"
      maxWidth={30}
      caption="Your passages, the model and the numbers it makes are all inside this Outpost. Nothing crosses to the internet, which search by meaning never needs."
      description="A large box for this Outpost holding three smaller boxes joined by arrows: your documents, the model, and the numbers it makes. Below the large box, outside it, is the internet, with the dashed line to it crossed out."
      height={(box) => layoutWhere(box, parts).height}
    >
      {(box) => {
        const l = layoutWhere(box, parts);
        const x = 1 + l.inner;
        const innerWidth = l.width - 2 * l.inner;
        const crossAt: Point = [box.width / 2, l.outer.bottom + (l.internet - l.f * 0.8 - l.outer.bottom) / 2];
        const c = l.f * 0.4;
        return (
          <g>
            <rect
              x={1}
              y={l.outer.top}
              width={l.width}
              height={l.outer.bottom - l.outer.top}
              rx={8}
              className="fill-surface stroke-ink"
              strokeWidth={1.5}
            />
            <Text at={[x, l.title]} tone="strong">
              This Outpost
            </Text>
            {l.boxes.map((part, index) => (
              <g key={part.lines.join(" ")}>
                <rect
                  x={x}
                  y={part.top}
                  width={innerWidth}
                  height={part.height}
                  rx={5}
                  className="fill-page stroke-border-strong"
                  strokeWidth={1}
                />
                {part.lines.map((text, lineIndex) => (
                  <Text key={text} at={[x + l.f * 0.6, part.top + l.f * 0.45 + l.line / 2 + lineIndex * l.line]} tone="read">
                    {text}
                  </Text>
                ))}
                {index < l.boxes.length - 1 ? (
                  <Arrow
                    from={[x + l.f * 1.2, part.top + part.height + 2]}
                    to={[x + l.f * 1.2, l.boxes[index + 1]!.top - 2]}
                    stroke="guide"
                  />
                ) : null}
              </g>
            ))}
            <Line from={[box.width / 2, l.outer.bottom + 2]} to={[box.width / 2, l.internet - l.f * 0.8]} stroke="sight" />
            <Line from={[crossAt[0] - c, crossAt[1] - c]} to={[crossAt[0] + c, crossAt[1] + c]} stroke="object" />
            <Line from={[crossAt[0] - c, crossAt[1] + c]} to={[crossAt[0] + c, crossAt[1] - c]} stroke="object" />
            <Text at={[box.width / 2, l.internet]} anchor="middle" tone="name">
              The internet: not used
            </Text>
          </g>
        );
      }}
    </Plate>
  );
}
