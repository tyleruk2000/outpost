/**
 * Layout for the journey diagram. The same nodes are placed left to right on a wide
 * figure and top to bottom on a narrow one, so the text stays at a readable size.
 */

export type NodeId =
  | "library"
  | "passages"
  | "index"
  | "question"
  | "words"
  | "vector"
  | "keyword"
  | "meaning"
  | "fusion"
  | "context"
  | "model"
  | "answer";

export interface PlacedNode {
  id: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedEdge {
  from: NodeId;
  to: NodeId;
  path: string;
  /** Leads to or from something Outpost does not do. */
  outside: boolean;
}

export interface PipelineLayout {
  direction: "across" | "down";
  width: number;
  height: number;
  nodes: Record<NodeId, PlacedNode>;
  edges: PlacedEdge[];
  /** Captions for the two bands: what happens beforehand, and what happens for each question. */
  bands: Array<{ id: "before" | "question"; x: number; y: number }>;
}

export const NODE_HEIGHT = 62;
/** Room under a node for its timing. */
export const TIMING_ROOM = 16;
const BAND_LABEL = 22;

const FLOW: Array<[NodeId, NodeId]> = [
  ["library", "passages"],
  ["passages", "index"],
  ["question", "words"],
  ["question", "vector"],
  ["words", "keyword"],
  ["vector", "meaning"],
  ["keyword", "fusion"],
  ["meaning", "fusion"],
  ["fusion", "context"],
  ["context", "model"],
  ["model", "answer"],
];

const r = (value: number) => Math.round(value * 10) / 10;

export function layoutPipeline(width: number): PipelineLayout {
  const direction = width >= 700 ? "across" : "down";
  const nodes = {} as Record<NodeId, PlacedNode>;
  const place = (id: NodeId, x: number, y: number, nodeWidth: number) => {
    nodes[id] = { id, x: r(x), y: r(y), width: r(nodeWidth), height: NODE_HEIGHT };
  };
  const bands: PipelineLayout["bands"] = [];
  let height: number;

  if (direction === "across") {
    // Six columns. What Outpost does not do sits in the last one: the model above, its answer below.
    const column = width / 6;
    const nodeWidth = column - 10;
    const at = (index: number) => index * column + 5;
    bands.push({ id: "before", x: 5, y: 14 });
    const beforeY = BAND_LABEL;
    place("library", at(0), beforeY, nodeWidth);
    place("passages", at(1), beforeY, nodeWidth);
    place("index", at(2), beforeY, nodeWidth);

    const flowLabelY = beforeY + NODE_HEIGHT + 30;
    bands.push({ id: "question", x: 5, y: flowLabelY + 14 });
    const lane = NODE_HEIGHT + TIMING_ROOM + 12;
    const top = flowLabelY + BAND_LABEL;
    const middle = top + lane / 2;
    const bottom = top + lane;
    place("question", at(0), middle, nodeWidth);
    place("words", at(1), top, nodeWidth);
    place("vector", at(1), bottom, nodeWidth);
    place("keyword", at(2), top, nodeWidth);
    place("meaning", at(2), bottom, nodeWidth);
    place("fusion", at(3), middle, nodeWidth);
    place("context", at(4), middle, nodeWidth);
    place("model", at(5), top, nodeWidth);
    place("answer", at(5), bottom, nodeWidth);
    height = bottom + NODE_HEIGHT + TIMING_ROOM + 4;
  } else {
    const third = width / 3;
    bands.push({ id: "before", x: 0, y: 14 });
    const beforeY = BAND_LABEL;
    place("library", 0, beforeY, third - 10);
    place("passages", third + 5, beforeY, third - 10);
    place("index", 2 * third + 10, beforeY, third - 10);

    const flowLabelY = beforeY + NODE_HEIGHT + 26;
    bands.push({ id: "question", x: 0, y: flowLabelY + 14 });
    const half = width / 2;
    const nodeWidth = Math.min(168, half - 12);
    const left = half - nodeWidth - 8;
    const right = half + 8;
    const centre = half - nodeWidth / 2;
    const step = NODE_HEIGHT + TIMING_ROOM + 22;
    const row = (index: number) => flowLabelY + BAND_LABEL + index * step;
    place("question", centre, row(0), nodeWidth);
    place("words", left, row(1), nodeWidth);
    place("vector", right, row(1), nodeWidth);
    place("keyword", left, row(2), nodeWidth);
    place("meaning", right, row(2), nodeWidth);
    place("fusion", centre, row(3), nodeWidth);
    place("context", centre, row(4), nodeWidth);
    place("model", centre, row(5), nodeWidth);
    place("answer", centre, row(6), nodeWidth);
    height = row(6) + NODE_HEIGHT + TIMING_ROOM + 4;
  }

  const edges = FLOW.map(([from, to]): PlacedEdge => {
    const a = nodes[from];
    const b = nodes[to];
    const outside = to === "model" || to === "answer";
    // Side by side: join the facing edges. One above the other: run down from the first to the second.
    const stacked = Math.abs(a.x - b.x) < 1 || (direction === "down" && a.y !== b.y);
    if (!stacked) {
      const x0 = a.x + a.width;
      const y0 = a.y + a.height / 2;
      const x1 = b.x - 5;
      const y1 = b.y + b.height / 2;
      const mid = (x0 + x1) / 2;
      return { from, to, outside, path: `M${r(x0)},${r(y0)} C${r(mid)},${r(y0)} ${r(mid)},${r(y1)} ${r(x1)},${r(y1)}` };
    }
    const x0 = a.x + a.width / 2;
    // In the downward layout a timing is printed under each box, so lines start below it.
    const y0 = a.y + a.height + (direction === "down" ? TIMING_ROOM : 0);
    const x1 = b.x + b.width / 2;
    const y1 = b.y - 5;
    const mid = (y0 + y1) / 2;
    return { from, to, outside, path: `M${r(x0)},${r(y0)} C${r(x0)},${r(mid)} ${r(x1)},${r(mid)} ${r(x1)},${r(y1)}` };
  });

  return { direction, width, height: r(height), nodes, edges, bands };
}
