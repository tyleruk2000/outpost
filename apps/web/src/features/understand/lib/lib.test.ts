import { describe, expect, it } from "vitest";
import { inverseDocumentFrequency, saturationCurve, termFrequencyCeiling, termFrequencyPart } from "./bm25";
import { foundBy, layoutBump, linkPath } from "./bump";
import { agreement, angleFromPointer, arrowTip, cosine, cosineOfAngle, describeCosine, peak } from "./cosine";
import { fitFrame, keptShare, nearestPoint, tourOrder } from "./map";
import { layoutPipeline } from "./pipeline";
import { extents, layoutRibbon, placeLabel, type RibbonChunk, splitOverlap, stepIndex } from "./ribbon";
import { fuse, movement, rankPairs, reciprocal, reciprocalCurve } from "./rrf";
import { fitText, formatMs, formatShare, formatValue, linear, niceMax, niceStep, niceTicks } from "./scale";
import { approxTokens, buildExamples, checkMarkers, layoutBudget, readLengths, splitMarkers } from "./text";

describe("scales and ticks", () => {
  it("maps a domain onto a range and back", () => {
    const x = linear([0, 10], [100, 300]);
    expect(x(0)).toBe(100);
    expect(x(5)).toBe(200);
    expect(x.invert(250)).toBe(7.5);
    // A flat domain does not divide by zero.
    expect(linear([3, 3], [0, 50])(3)).toBe(0);
  });

  it("chooses steps of 1, 2 or 5 and ends on or past the largest value", () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(7, 5)).toBe(1);
    expect(niceTicks(0, 52, 3)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(0, 52, 4)).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(niceTicks(0, 0.0315, 4)).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceMax(8.45, 4)).toBe(10);
    expect(niceMax(0)).toBe(1);
  });

  it("formats numbers for people", () => {
    expect(formatValue(8.4512)).toBe("8.45");
    expect(formatValue(0.01639)).toBe("0.0164");
    expect(formatValue(1234.5)).toBe("1,235");
    expect(formatValue(0)).toBe("0");
    expect(formatMs(0.04)).toBe("under 0.1 ms");
    expect(formatMs(0.9)).toBe("0.9 ms");
    expect(formatMs(14.9)).toBe("15 ms");
    expect(formatMs(1840)).toBe("1.8 s");
    expect(formatShare(0.004)).toBe("under 1%");
    expect(formatShare(0.093)).toBe("9.3%");
    expect(formatShare(0.83)).toBe("83%");
    expect(fitText("Keyword search", 200)).toBe("Keyword search");
    expect(fitText("Keyword search", 50)).toBe("Keywor…");
    expect(fitText("Keyword search", 5)).toBe("");
  });
});

describe("reciprocal rank fusion in the browser", () => {
  const keyword = [
    { chunkId: 1, rank: 1 },
    { chunkId: 2, rank: 2 },
    { chunkId: 3, rank: 3 },
  ];
  const semantic = [
    { chunkId: 4, rank: 1 },
    { chunkId: 3, rank: 2 },
    { chunkId: 1, rank: 3 },
  ];
  const pairs = rankPairs(keyword, semantic);

  it("joins the two lists by passage", () => {
    expect(pairs.map((pair) => [pair.chunkId, pair.keywordRank, pair.semanticRank])).toEqual([
      [1, 1, 3],
      [2, 2, null],
      [3, 3, 2],
      [4, null, 1],
    ]);
  });

  it("adds weight ÷ (k + rank) from each list and sorts by the total", () => {
    const fused = fuse(pairs, { k: 60, keywordWeight: 1, semanticWeight: 1 });
    expect(fused.map((row) => row.chunkId)).toEqual([1, 3, 4, 2]);
    expect(fused[0]!.keywordPart).toBeCloseTo(1 / 61, 10);
    expect(fused[0]!.semanticPart).toBeCloseTo(1 / 63, 10);
    expect(fused[0]!.score).toBeCloseTo(1 / 61 + 1 / 63, 10);
    expect(fused.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
    // A passage one search missed gets nothing from that search.
    expect(fused.find((row) => row.chunkId === 2)!.semanticPart).toBe(0);
    expect(reciprocal(1, 60, null)).toBe(0);
  });

  it("breaks ties the way the server does: keyword results first", () => {
    const fused = fuse(pairs, { k: 60, keywordWeight: 1, semanticWeight: 1 });
    // Passage 4 (meaning, 1st) and passage 2 would tie with a keyword 1st; here 4 beats 2 on score.
    const tie = fuse(
      [
        { chunkId: 9, keywordRank: null, semanticRank: 1 },
        { chunkId: 8, keywordRank: 1, semanticRank: null },
      ],
      { k: 60, keywordWeight: 1, semanticWeight: 1 },
    );
    expect(tie.map((row) => row.chunkId)).toEqual([8, 9]);
    expect(fused).toHaveLength(4);
  });

  it("changes the order when k or a weight changes", () => {
    // With a tiny k, first place in either list dominates.
    expect(fuse(pairs, { k: 0, keywordWeight: 1, semanticWeight: 1 }).map((row) => row.chunkId)).toEqual([1, 4, 3, 2]);
    // With the keyword weight at zero, the order is the meaning list's order; the rest follow with nothing.
    expect(fuse(pairs, { k: 60, keywordWeight: 0, semanticWeight: 1 }).map((row) => row.chunkId)).toEqual([4, 3, 1, 2]);
    const before = fuse(pairs, { k: 60, keywordWeight: 1, semanticWeight: 1 });
    const after = fuse(pairs, { k: 60, keywordWeight: 0, semanticWeight: 1 });
    expect(Object.fromEntries(movement(before, after))).toEqual({ 4: 2, 3: 0, 1: -2, 2: 0 });
  });

  it("draws the curve of what each place is worth", () => {
    const curve = reciprocalCurve(60, 3);
    expect(curve.map((point) => point.rank)).toEqual([1, 2, 3]);
    expect(curve[2]!.value).toBeCloseTo(1 / 63, 10);
  });
});

describe("BM25", () => {
  it("gives rare words more weight than common ones", () => {
    const rare = inverseDocumentFrequency(210, 13);
    const common = inverseDocumentFrequency(210, 58);
    expect(rare).toBeCloseTo(2.683, 3);
    expect(common).toBeCloseTo(0.9581, 3);
    // In more than half of everything: almost nothing, never negative.
    expect(inverseDocumentFrequency(210, 210)).toBe(1e-6);
    expect(inverseDocumentFrequency(210, 150)).toBe(1e-6);
  });

  it("saturates: each further mention adds less, towards a ceiling of k1 + 1", () => {
    expect(termFrequencyPart(0)).toBe(0);
    expect(termFrequencyPart(1)).toBeCloseTo(1, 10);
    expect(termFrequencyPart(2)).toBeCloseTo(1.375, 10);
    expect(termFrequencyPart(8)).toBeCloseTo(1.913, 3);
    expect(termFrequencyPart(10)).toBeCloseTo(1.964, 3);
    expect(termFrequencyPart(1000)).toBeLessThan(termFrequencyCeiling());
    expect(termFrequencyCeiling()).toBeCloseTo(2.2, 10);
    const curve = saturationCurve(10);
    for (let index = 2; index < curve.length; index += 1) {
      expect(curve[index]!.value - curve[index - 1]!.value).toBeLessThan(curve[index - 1]!.value - curve[index - 2]!.value);
    }
  });

  it("marks long passages down and short ones up", () => {
    expect(termFrequencyPart(1, 2)).toBeLessThan(termFrequencyPart(1, 1));
    expect(termFrequencyPart(1, 0.5)).toBeGreaterThan(termFrequencyPart(1, 1));
  });
});

describe("cosine similarity", () => {
  it("goes from 1 through 0 to -1 as the angle opens", () => {
    expect(cosineOfAngle(0)).toBe(1);
    expect(cosineOfAngle(60)).toBeCloseTo(0.5, 10);
    expect(cosineOfAngle(90)).toBe(0);
    expect(cosineOfAngle(180)).toBe(-1);
  });

  it("turns a pointer position into an angle and an angle into an arrow", () => {
    expect(angleFromPointer(10, 0)).toBe(0);
    expect(angleFromPointer(0, -10)).toBe(90);
    expect(angleFromPointer(-10, 0)).toBe(180);
    expect(angleFromPointer(10, -10)).toBe(45);
    expect(angleFromPointer(0, 0)).toBe(0);
    const tip = arrowTip(90, 100);
    expect(tip.x).toBeCloseTo(0, 10);
    expect(tip.y).toBeCloseTo(-100, 10);
  });

  it("measures real vectors and says where they agree", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 0], [-2, 0])).toBe(-1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    const result = agreement([0.5, 0, -0.5, 0.5], [0.5, 0.9, -0.5, -0.5]);
    expect(result.products).toEqual([0.25, 0, 0.25, -0.25]);
    expect(result.agreeing).toBe(2);
    expect(result.sum).toBeCloseTo(0.25, 10);
    expect(peak([0.1, -0.7, 0.3])).toBe(0.7);
    expect(describeCosine(1)).toMatch(/same way/);
    expect(describeCosine(0)).toMatch(/unrelated/);
    expect(describeCosine(-1)).toMatch(/opposite/);
  });
});

const chunk = (change: Partial<RibbonChunk>): RibbonChunk => ({
  chunkId: 1,
  text: "x".repeat(100),
  page: null,
  heading: null,
  charStart: 0,
  charEnd: 100,
  overlapWithPrevious: 0,
  ...change,
});

describe("the document ribbon", () => {
  const chunks = [
    chunk({ chunkId: 1, heading: "Boiling", charStart: 0, charEnd: 1000, text: "a".repeat(1000) }),
    chunk({ chunkId: 2, heading: "Boiling", charStart: 850, charEnd: 1800, overlapWithPrevious: 150, text: "b".repeat(950) }),
    chunk({ chunkId: 3, heading: "Chemical treatment", charStart: 1802, charEnd: 2400, text: "c".repeat(598) }),
  ];

  it("draws each passage at its true offsets, on alternate lanes", () => {
    const layout = layoutRibbon(chunks, { width: 240, chunkSize: 1000, minPassageWidth: 50 });
    expect(layout.rows).toBe(1);
    expect(layout.total).toBe(2400);
    expect(layout.pixelsPerCharacter).toBeCloseTo(0.1, 6);
    expect(layout.pieces.map((piece) => [piece.index, piece.lane, Math.round(piece.x), Math.round(piece.width)])).toEqual([
      [0, 0, 0, 100],
      [1, 1, 85, 95],
      [2, 0, 180, 60],
    ]);
  });

  it("marks the text two neighbours share, and only that", () => {
    const layout = layoutRibbon(chunks, { width: 240, chunkSize: 1000, minPassageWidth: 50 });
    expect(layout.overlaps).toHaveLength(1);
    expect(layout.overlaps[0]).toMatchObject({ index: 1, row: 0 });
    expect(Math.round(layout.overlaps[0]!.x)).toBe(85);
    expect(Math.round(layout.overlaps[0]!.width)).toBe(15);
  });

  it("marks where a new page or heading starts", () => {
    const layout = layoutRibbon(chunks, { width: 240, chunkSize: 1000, minPassageWidth: 50, labelWidth: 60 });
    expect(layout.boundaries.map((boundary) => [boundary.index, boundary.label, boundary.showLabel])).toEqual([
      [0, "Boiling", true],
      [2, "Chemical treatment", true],
    ]);
    // A label that would run into the one before it is dropped; its tick stays.
    const tight = layoutRibbon(chunks, { width: 240, chunkSize: 1000, minPassageWidth: 50, labelWidth: 400 });
    expect(tight.boundaries.map((boundary) => boundary.showLabel)).toEqual([true, false]);
  });

  it("wraps a long document onto several rows and splits a passage that crosses a row end", () => {
    const layout = layoutRibbon(chunks, { width: 120, chunkSize: 1000, minPassageWidth: 100 });
    expect(layout.rows).toBe(2);
    const second = layout.pieces.filter((piece) => piece.index === 1);
    expect(second.map((piece) => piece.row)).toEqual([0, 1]);
    expect(second.reduce((sum, piece) => sum + piece.width, 0)).toBeCloseTo(95, 0);
    // Never more rows than allowed, however long the document.
    expect(layoutRibbon(chunks, { width: 20, chunkSize: 1000, maxRows: 3 }).rows).toBe(3);
    expect(layoutRibbon([], { width: 100, chunkSize: 1000 }).rows).toBe(0);
  });

  it("falls back to laying passages end to end when offsets are missing", () => {
    const loose = [
      chunk({ charStart: null, charEnd: null, text: "a".repeat(100) }),
      chunk({ charStart: null, charEnd: null, text: "b".repeat(80), overlapWithPrevious: 20 }),
    ];
    expect(extents(loose)).toEqual([
      { start: 0, end: 100 },
      { start: 80, end: 160 },
    ]);
  });

  it("splits a passage into shared head, own middle and shared tail", () => {
    expect(splitOverlap("abcdefghij", 3, 2)).toEqual({ head: "abc", body: "defgh", tail: "ij" });
    expect(splitOverlap("abcdef", 0, 0)).toEqual({ head: "", body: "abcdef", tail: "" });
    // Overlaps never claim more than the text has.
    expect(splitOverlap("abc", 2, 5)).toEqual({ head: "ab", body: "", tail: "c" });
  });

  it("names places and steps with the keyboard", () => {
    expect(placeLabel({ page: 3, heading: "Boiling" })).toBe("Page 3, Boiling");
    expect(placeLabel({ page: null, heading: null })).toBe("");
    expect(stepIndex(0, "ArrowRight", 3)).toBe(1);
    expect(stepIndex(2, "ArrowRight", 3)).toBe(2);
    expect(stepIndex(1, "Home", 3)).toBe(0);
    expect(stepIndex(1, "End", 3)).toBe(2);
    expect(stepIndex(1, "a", 3)).toBeNull();
  });
});

describe("the fusion chart", () => {
  const rows = [
    { chunkId: 1, keywordRank: 1, semanticRank: 3, rank: 1 },
    { chunkId: 3, keywordRank: 3, semanticRank: 2, rank: 2 },
    { chunkId: 4, keywordRank: null, semanticRank: 1, rank: 3 },
    { chunkId: 2, keywordRank: 2, semanticRank: null, rank: 4 },
  ];

  it("places each passage in each column by its rank", () => {
    const layout = layoutBump(rows, { rowHeight: 20, top: 0 });
    expect(layout.lines[0]).toMatchObject({ keywordY: 10, semanticY: 50, fusedY: 10, below: false });
    expect(layout.lines[2]).toMatchObject({ keywordY: null, semanticY: 10, fusedY: 50 });
    expect(layout).toMatchObject({ keywordRows: 3, semanticRows: 3, fusedRows: 4, belowCount: 0, belowY: null, height: 80 });
  });

  it("sends passages below the cut to one shared row", () => {
    const layout = layoutBump(rows, { shown: 2, rowHeight: 20, top: 0 });
    expect(layout.fusedRows).toBe(2);
    expect(layout.belowCount).toBe(2);
    expect(layout.belowY).toBe(70);
    expect(layout.lines.filter((line) => line.below).map((line) => line.fusedY)).toEqual([70, 70]);
    expect(layout.height).toBe(80);
  });

  it("draws level-ended links and says who found a passage", () => {
    expect(linkPath(0, 10, 100, 50)).toBe("M0,10 C50,10 50,50 100,50");
    expect(foundBy(rows[0]!)).toBe("found by both searches");
    expect(foundBy(rows[2]!)).toBe("found by meaning only");
    expect(foundBy(rows[3]!)).toBe("found by words only");
  });
});

describe("the map of vectors", () => {
  const points = [
    { x: 0, y: 0, similarity: 0.1 },
    { x: 4, y: 0, similarity: 0.9 },
    { x: 0, y: 2, similarity: 0.5 },
  ];

  it("uses one scale for both axes, so distances are not distorted", () => {
    const frame = fitFrame(points, 400, 400, 0);
    expect(frame.scale).toBe(100);
    expect(frame.toX(4) - frame.toX(0)).toBe(400);
    // Up on the page is up in the data, and the shorter axis is centred.
    expect(frame.toY(2)).toBe(100);
    expect(frame.toY(0)).toBe(300);
  });

  it("finds the point under the pointer, within reach", () => {
    const placed = [
      { x: 10, y: 10 },
      { x: 100, y: 100 },
    ];
    expect(nearestPoint(placed, 14, 12)).toBe(0);
    expect(nearestPoint(placed, 90, 95)).toBe(1);
    expect(nearestPoint(placed, 55, 55)).toBe(-1);
  });

  it("visits the most similar passages first", () => {
    expect(tourOrder(points)).toEqual([1, 2, 0]);
    expect(tourOrder(points.map((point) => ({ ...point, similarity: null })))).toEqual([0, 2, 1]);
    expect(keptShare([0.054, 0.038])).toBeCloseTo(0.092, 10);
  });
});

describe("the journey diagram", () => {
  it("runs across on a wide figure and down on a narrow one, without overlapping boxes", () => {
    for (const width of [358, 520, 760, 1000]) {
      const layout = layoutPipeline(width);
      expect(layout.direction).toBe(width >= 700 ? "across" : "down");
      const nodes = Object.values(layout.nodes);
      expect(nodes).toHaveLength(12);
      for (const node of nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x + node.width).toBeLessThanOrEqual(width + 0.5);
        expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
      }
      for (const a of nodes) {
        for (const b of nodes) {
          if (a.id >= b.id) continue;
          const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
          expect(apart, `${a.id} and ${b.id} at ${width}`).toBe(true);
        }
      }
      expect(layout.edges).toHaveLength(11);
      expect(layout.edges.filter((edge) => edge.outside).map((edge) => edge.to)).toEqual(["model", "answer"]);
    }
  });
});

describe("text helpers", () => {
  it("builds examples only from what is in the library", () => {
    const examples = buildExamples(
      [
        "Knots for camp and climbing",
        "weather.pdf",
        "A",
        "Reading mountain weather: a very long title that goes on and on past sixty characters",
      ],
      ["Water treatment in the field", "Boiling", "Boiling", "Chlorine and chlorine dioxide", null, "3"],
    );
    expect(examples).toEqual(["boiling", "chlorine and chlorine dioxide", "knots for camp and climbing", "weather"]);
    expect(buildExamples([], [])).toEqual([]);
  });

  it("checks citation markers the way the server does", () => {
    expect(checkMarkers("Boil it [1]. Cool it [3][1]. Then [12] and [x].", [1, 2, 3])).toEqual({ used: [1, 3], unsupported: [12] });
    expect(checkMarkers("No markers here.", [1])).toEqual({ used: [], unsupported: [] });
    expect(splitMarkers("Boil [1] then [9].")).toEqual([
      { text: "Boil ", marker: null },
      { text: "[1]", marker: 1 },
      { text: " then ", marker: null },
      { text: "[9]", marker: 9 },
      { text: ".", marker: null },
    ]);
  });

  it("lays the context out against its budget", () => {
    const layout = layoutBudget(
      [
        { marker: 1, characters: 1500 },
        { marker: 2, characters: 3000 },
      ],
      6000,
    );
    expect(layout.used).toBe(4500);
    expect(layout.scaleMax).toBe(6000);
    expect(layout.budgetAt).toBe(1);
    expect(layout.segments).toEqual([
      { marker: 1, characters: 1500, start: 0, width: 0.25 },
      { marker: 2, characters: 3000, start: 0.25, width: 0.5 },
    ]);
    // The first passage is always included, so the bar can run past the budget.
    const over = layoutBudget([{ marker: 1, characters: 8000 }], 6000);
    expect(over.scaleMax).toBe(8000);
    expect(over.budgetAt).toBe(0.75);
    expect(approxTokens(6276)).toBe(1569);
  });

  it("reads a histogram of passage lengths", () => {
    const read = readLengths(
      [
        { from: 0, to: 150, count: 52 },
        { from: 750, to: 900, count: 30 },
        { from: 1050, to: 1200, count: 29 },
        { from: 1200, to: 1350, count: 2 },
      ],
      1200,
    );
    expect(read).toMatchObject({ total: 113, short: 52, nearTarget: 59, over: 2 });
    expect(read.peak).toEqual({ from: 0, to: 150, count: 52 });
  });
});
