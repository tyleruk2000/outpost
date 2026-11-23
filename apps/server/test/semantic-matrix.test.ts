import { describe, expect, it } from "vitest";
import { createInt8Matrix, quantise, simdAvailable } from "../src/modules/semantic/int8-matrix.ts";
import { createFlatVectorIndex } from "../src/modules/semantic/vector-index.ts";
import { createTestApp } from "./helpers.ts";

let seed = 7;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const unit = (dimensions: number) => {
  const vector = Float32Array.from({ length: dimensions }, () => random() * 2 - 1);
  const norm = Math.hypot(...vector);
  return vector.map((value) => value / norm);
};
const dot = (a: Float32Array, b: Float32Array) => a.reduce((sum, value, index) => sum + value * b[index]!, 0);

describe("the 8-bit matrix of vectors", () => {
  it("runs on WebAssembly SIMD here", () => {
    expect(simdAvailable()).toBe(true);
  });

  it("keeps a vector to within a few thousandths of each number", () => {
    const vector = unit(384);
    const bytes = new Int8Array(384);
    const scale = quantise(vector, bytes);
    for (let index = 0; index < 384; index += 1) expect(Math.abs(bytes[index]! * scale - vector[index]!)).toBeLessThan(scale);
  });

  for (const simd of [true, false]) {
    it(`finds the same nearest rows as the full vectors${simd ? "" : " without SIMD"}`, () => {
      // 300 dimensions: not a multiple of 16, so rows are padded.
      const vectors = Array.from({ length: 500 }, () => unit(300));
      const matrix = createInt8Matrix(300, 10, { simd });
      for (const [index, vector] of vectors.entries()) matrix.set(index + 1, vector);
      expect(matrix.rows).toBe(500);
      for (let trial = 0; trial < 5; trial += 1) {
        const query = unit(300);
        const exact = vectors.map((vector, index) => ({ chunkId: index + 1, score: dot(vector, query) })).sort((a, b) => b.score - a.score);
        const found = matrix.nearest(query, 40);
        expect(found).toHaveLength(40);
        // Its scores are close to the exact ones, and the ten best are among its forty.
        for (const hit of found) expect(Math.abs(hit.score - dot(vectors[hit.chunkId - 1]!, query))).toBeLessThan(0.02);
        const ids = new Set(found.map((hit) => hit.chunkId));
        for (const best of exact.slice(0, 10)) expect(ids.has(best.chunkId)).toBe(true);
      }
    });
  }

  it("writes a row again in place when its chunk's vector changes", () => {
    const matrix = createInt8Matrix(16, 1);
    matrix.set(
      1,
      Float32Array.from({ length: 16 }, (_, index) => (index === 0 ? 1 : 0)),
    );
    matrix.set(
      2,
      Float32Array.from({ length: 16 }, (_, index) => (index === 1 ? 1 : 0)),
    );
    matrix.set(
      1,
      Float32Array.from({ length: 16 }, (_, index) => (index === 2 ? 1 : 0)),
    );
    expect(matrix.rows).toBe(2);
    expect(
      matrix.nearest(
        Float32Array.from({ length: 16 }, (_, index) => (index === 2 ? 1 : 0)),
        1,
      )[0]?.chunkId,
    ).toBe(1);
  });

  it("gives the exact similarity of the full vectors from the index", async () => {
    const app = await createTestApp();
    try {
      const { search } = app.ctx.services;
      for (let index = 0; index < 30; index += 1) {
        search.upsert({
          kind: "note",
          entityId: `n${index}`,
          title: `Note ${index}`,
          url: `/notes/n${index}`,
          sections: [{ text: `text ${index}` }],
        });
      }
      const chunkIds = app.ctx.sqlite.prepare("SELECT id FROM chunks ORDER BY id").pluck().all() as number[];
      const vectors = chunkIds.map(() => unit(64));
      const index = createFlatVectorIndex(app.ctx.sqlite);
      app.ctx.sqlite
        .prepare("INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES ('m', 'test', 'm', 64, 0)")
        .run();
      index.upsert(
        "m",
        chunkIds.map((chunkId, position) => ({ chunkId, contentHash: `h${position}`, vector: vectors[position]! })),
      );
      const query = unit(64);
      const hits = index.query("m", query, 5);
      const expected = chunkIds
        .map((chunkId, position) => ({ chunkId, score: dot(vectors[position]!, query) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      expect(hits.map((hit) => hit.chunkId)).toEqual(expected.map((hit) => hit.chunkId));
      for (const [position, hit] of hits.entries()) expect(hit.score).toBeCloseTo(expected[position]!.score, 5);
    } finally {
      await app.close();
    }
  });
});
