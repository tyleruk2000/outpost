/**
 * Where vectors live and how the nearest ones are found.
 *
 * `VectorIndex` is the seam for other back ends (sqlite-vec, pgvector, a dedicated
 * vector database). The built-in implementation is a flat index over the `embeddings`
 * table: every query compares against every stored vector for the model. That is exact,
 * needs no extra native code, and is fast enough for the libraries a single device
 * holds. An approximate index only starts to matter far beyond that.
 *
 * Reading every vector out of SQLite for each search took over 100 ms for 60,000
 * passages on a laptop, five times that on a Raspberry Pi. So the vectors of the model in
 * use are kept in memory as one matrix of 8-bit numbers (`int8-matrix.ts`: 400 bytes a
 * passage, about 23 MB for 60,000), filled on the first search, kept up to date by
 * `upsert`, read again when the number stored differs from the number held (vectors
 * removed with their passages), and let go after `MATRIX_IDLE_MS` without a search. The
 * matrix finds candidates, a few more than wanted; their exact similarity is then worked
 * out from the stored vectors, so the scores given are those of the full vectors. A search
 * narrowed to some kinds, or to one item, still reads from SQLite, which can join to them.
 */
import type { Sqlite } from "../../db/client.ts";
import { createInt8Matrix, type Int8Matrix } from "./int8-matrix.ts";

export interface VectorHit {
  chunkId: number;
  /** Cosine similarity, -1 to 1. */
  score: number;
}

export interface VectorIndex {
  upsert(modelId: string, items: Array<{ chunkId: number; contentHash: string; vector: Float32Array }>): void;
  /** Nearest `limit` chunks to `vector`, optionally restricted to some entity kinds, or to the passages of one item. */
  query(modelId: string, vector: Float32Array, limit: number, kinds?: string[], within?: { kind: string; entityId: string }): VectorHit[];
  count(modelId: string): number;
  /** Whether any vector is stored for the model. Asked on every search, so it does not count them. */
  has(modelId: string): boolean;
  removeModel(modelId: string): number;
  /**
   * Passages given new numbers, their vectors moved with them (`from` → `to`): the rows held
   * in memory take the new numbers. Only when that cannot be done is the matrix let go, to be
   * read again (seconds on a Raspberry Pi for a large library) at the next search.
   */
  renumbered(moves: Array<[from: number, to: number]>): void;
  /** How many times the matrix has been read from the database, for tests. */
  loads(): number;
}

export function vectorToBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function blobToVector(blob: Buffer): Float32Array {
  // Copy: SQLite's buffer is not guaranteed to be aligned for a Float32Array view.
  const copy = new Uint8Array(blob.byteLength);
  copy.set(blob);
  return new Float32Array(copy.buffer);
}

/** A matrix not searched for this long is let go, as the model is. */
export const MATRIX_IDLE_MS = 5 * 60_000;

/**
 * How many candidates the 8-bit matrix gives for each result wanted: their exact
 * similarity is then worked out from the stored vectors, and the best kept.
 */
const CANDIDATES = (limit: number) => limit * 2 + 16;

interface Held {
  modelId: string;
  matrix: Int8Matrix;
}

export function createFlatVectorIndex(sqlite: Sqlite): VectorIndex {
  const insert = sqlite.prepare(
    `INSERT INTO embeddings (chunk_id, model_id, vector, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (chunk_id, model_id) DO UPDATE SET vector = excluded.vector, content_hash = excluded.content_hash, created_at = excluded.created_at`,
  );
  const counted = sqlite.prepare("SELECT count(*) AS n FROM embeddings WHERE model_id = ?");
  const anyFor = sqlite.prepare("SELECT 1 FROM embeddings WHERE model_id = ? LIMIT 1").pluck();
  const upsertMany = sqlite.transaction((modelId: string, items: Array<{ chunkId: number; contentHash: string; vector: Float32Array }>) => {
    const now = Date.now();
    for (const item of items) insert.run(item.chunkId, modelId, vectorToBlob(item.vector), item.contentHash, now);
  });

  let held: Held | null = null;
  let idle: ReturnType<typeof setTimeout> | null = null;
  const letGo = () => {
    held = null;
    if (idle) clearTimeout(idle);
    idle = null;
  };
  const used = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(letGo, MATRIX_IDLE_MS);
    idle.unref();
  };
  let loads = 0;
  const load = (modelId: string, expected: number): Held | null => {
    loads += 1;
    const first = sqlite.prepare("SELECT vector FROM embeddings WHERE model_id = ? LIMIT 1").pluck().get(modelId) as Buffer | undefined;
    if (!first) return null;
    const dimensions = first.byteLength / 4;
    const matrix = createInt8Matrix(dimensions, expected);
    const view = new Float32Array(dimensions);
    const bytes = new Uint8Array(view.buffer);
    for (const [chunkId, blob] of sqlite
      .prepare("SELECT chunk_id, vector FROM embeddings WHERE model_id = ?")
      .raw()
      .iterate(modelId) as Iterable<[number, Buffer]>) {
      if (blob.byteLength !== dimensions * 4) continue;
      // Copied: SQLite's buffer is not guaranteed to be aligned for a Float32Array view.
      bytes.set(blob);
      matrix.set(chunkId, view);
    }
    return { modelId, matrix };
  };
  /** The model's matrix, up to date with what is stored. */
  const matrixFor = (modelId: string): Int8Matrix | null => {
    const stored = (counted.get(modelId) as { n: number }).n;
    if (!held || held.modelId !== modelId || held.matrix.rows !== stored) held = load(modelId, stored);
    used();
    return held?.matrix ?? null;
  };
  const exactly = sqlite.prepare(
    "SELECT chunk_id AS chunkId, vector FROM embeddings WHERE model_id = ? AND chunk_id IN (SELECT value FROM json_each(?))",
  );
  /** The exact similarity of each candidate, best first, the best `limit` of them. */
  const rescore = (modelId: string, vector: Float32Array, candidates: Array<{ chunkId: number }>, limit: number): VectorHit[] => {
    if (candidates.length === 0) return [];
    const rows = exactly.all(modelId, JSON.stringify(candidates.map((hit) => hit.chunkId))) as Array<{ chunkId: number; vector: Buffer }>;
    return rows
      .flatMap((row) => {
        const stored = blobToVector(row.vector);
        if (stored.length !== vector.length) return [];
        let dot = 0;
        for (let index = 0; index < stored.length; index += 1) dot += stored[index]! * vector[index]!;
        return [{ chunkId: row.chunkId, score: dot }];
      })
      .sort((a, b) => b.score - a.score || a.chunkId - b.chunkId)
      .slice(0, limit);
  };

  return {
    upsert(modelId, items) {
      upsertMany(modelId, items);
      const matrix = held?.modelId === modelId ? held.matrix : null;
      if (!matrix) return;
      for (const item of items) {
        if (item.vector.length !== matrix.dimensions) {
          letGo();
          return;
        }
        matrix.set(item.chunkId, item.vector);
      }
    },

    query(modelId, vector, limit, kinds, within) {
      if (!kinds?.length && !within) {
        const matrix = matrixFor(modelId);
        if (!matrix || matrix.dimensions !== vector.length) return [];
        return rescore(modelId, vector, matrix.nearest(vector, CANDIDATES(limit)), limit);
      }
      const kindFilter = kinds?.length ? `AND e.kind IN (${kinds.map(() => "?").join(",")})` : "";
      const itemFilter = within ? "AND e.kind = ? AND e.entity_id = ?" : "";
      const bound = [...(kinds ?? []), ...(within ? [within.kind, within.entityId] : [])];
      const statement = sqlite.prepare(
        bound.length > 0
          ? `SELECT m.chunk_id AS chunkId, m.vector AS vector FROM embeddings m
             JOIN chunks c ON c.id = m.chunk_id JOIN search_entities e ON e.id = c.entity_row_id
             WHERE m.model_id = ? ${kindFilter} ${itemFilter}`
          : "SELECT chunk_id AS chunkId, vector FROM embeddings WHERE model_id = ?",
      );
      // Keep the best `limit` seen so far in a small sorted array; `limit` is tiny
      // compared with the number of rows, so insertion is cheap.
      const best: VectorHit[] = [];
      let floor = Number.NEGATIVE_INFINITY;
      for (const row of statement.iterate(modelId, ...bound) as IterableIterator<{ chunkId: number; vector: Buffer }>) {
        const stored = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
        if (stored.length !== vector.length) continue;
        let dot = 0;
        for (let index = 0; index < stored.length; index += 1) dot += stored[index]! * vector[index]!;
        if (best.length === limit && dot <= floor) continue;
        let position = best.length;
        while (position > 0 && best[position - 1]!.score < dot) position -= 1;
        best.splice(position, 0, { chunkId: row.chunkId, score: dot });
        if (best.length > limit) best.pop();
        floor = best.length === limit ? best[best.length - 1]!.score : Number.NEGATIVE_INFINITY;
      }
      return best;
    },

    count(modelId) {
      return (counted.get(modelId) as { n: number }).n;
    },

    has(modelId) {
      return anyFor.get(modelId) !== undefined;
    },

    removeModel(modelId) {
      if (held?.modelId === modelId) letGo();
      const removed = sqlite.prepare("DELETE FROM embeddings WHERE model_id = ?").run(modelId).changes;
      sqlite.prepare("DELETE FROM embedding_models WHERE id = ?").run(modelId);
      return removed;
    },

    renumbered(moves) {
      if (!held) return;
      for (const [from, to] of moves) {
        if (!held.matrix.renumber(from, to)) {
          letGo();
          return;
        }
      }
    },

    loads: () => loads,
  };
}
