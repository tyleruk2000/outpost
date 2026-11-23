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
 * use are kept in memory as one matrix (1.5 KB a passage: about 90 MB for 60,000), filled
 * on the first search, kept up to date by `upsert`, read again when the number stored
 * differs from the number held (vectors removed with their passages), and let go after
 * `MATRIX_IDLE_MS` without a search. A search narrowed to some kinds, or to one item,
 * still reads from SQLite, which can join to them.
 */
import type { Sqlite } from "../../db/client.ts";

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

interface Matrix {
  modelId: string;
  dimensions: number;
  rows: number;
  ids: Int32Array;
  values: Float32Array;
  /** Row of each chunk. */
  rowOf: Map<number, number>;
}

/** The `limit` best rows of `matrix` for `vector`, best first. */
function nearestRows(matrix: Matrix, vector: Float32Array, limit: number): VectorHit[] {
  const best: VectorHit[] = [];
  let floor = Number.NEGATIVE_INFINITY;
  const { values, dimensions, rows, ids } = matrix;
  for (let row = 0; row < rows; row += 1) {
    const offset = row * dimensions;
    let dot = 0;
    for (let index = 0; index < dimensions; index += 1) dot += values[offset + index]! * vector[index]!;
    if (best.length === limit && dot <= floor) continue;
    let position = best.length;
    while (position > 0 && best[position - 1]!.score < dot) position -= 1;
    best.splice(position, 0, { chunkId: ids[row]!, score: dot });
    if (best.length > limit) best.pop();
    floor = best.length === limit ? best[best.length - 1]!.score : Number.NEGATIVE_INFINITY;
  }
  return best;
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

  let matrix: Matrix | null = null;
  let idle: ReturnType<typeof setTimeout> | null = null;
  const letGo = () => {
    matrix = null;
    if (idle) clearTimeout(idle);
    idle = null;
  };
  const used = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(letGo, MATRIX_IDLE_MS);
    idle.unref();
  };
  const grow = (held: Matrix, rows: number) => {
    if (rows <= held.ids.length) return;
    const capacity = Math.max(rows, Math.ceil(held.ids.length * 1.25) + 256);
    const ids = new Int32Array(capacity);
    ids.set(held.ids.subarray(0, held.rows));
    const values = new Float32Array(capacity * held.dimensions);
    values.set(held.values.subarray(0, held.rows * held.dimensions));
    held.ids = ids;
    held.values = values;
  };
  const load = (modelId: string, expected: number): Matrix | null => {
    const first = sqlite.prepare("SELECT vector FROM embeddings WHERE model_id = ? LIMIT 1").pluck().get(modelId) as Buffer | undefined;
    if (!first) return null;
    const dimensions = first.byteLength / 4;
    const held: Matrix = {
      modelId,
      dimensions,
      rows: 0,
      ids: new Int32Array(expected),
      values: new Float32Array(expected * dimensions),
      rowOf: new Map(),
    };
    for (const [chunkId, blob] of sqlite
      .prepare("SELECT chunk_id, vector FROM embeddings WHERE model_id = ?")
      .raw()
      .iterate(modelId) as Iterable<[number, Buffer]>) {
      if (blob.byteLength !== dimensions * 4) continue;
      grow(held, held.rows + 1);
      held.ids[held.rows] = chunkId;
      held.values.set(new Float32Array(blob.buffer, blob.byteOffset, dimensions), held.rows * dimensions);
      held.rowOf.set(chunkId, held.rows);
      held.rows += 1;
    }
    return held;
  };
  /** The model's matrix, up to date with what is stored. */
  const matrixFor = (modelId: string): Matrix | null => {
    const stored = (counted.get(modelId) as { n: number }).n;
    if (!matrix || matrix.modelId !== modelId || matrix.rows !== stored) matrix = load(modelId, stored);
    used();
    return matrix;
  };

  return {
    upsert(modelId, items) {
      upsertMany(modelId, items);
      const held = matrix;
      if (!held || held.modelId !== modelId) return;
      for (const item of items) {
        if (item.vector.length !== held.dimensions) {
          letGo();
          return;
        }
        let row = held.rowOf.get(item.chunkId);
        if (row === undefined) {
          grow(held, held.rows + 1);
          row = held.rows;
          held.rows += 1;
          held.ids[row] = item.chunkId;
          held.rowOf.set(item.chunkId, row);
        }
        held.values.set(item.vector, row * held.dimensions);
      }
    },

    query(modelId, vector, limit, kinds, within) {
      if (!kinds?.length && !within) {
        const held = matrixFor(modelId);
        return held && held.dimensions === vector.length ? nearestRows(held, vector, limit) : [];
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
      if (matrix?.modelId === modelId) letGo();
      const removed = sqlite.prepare("DELETE FROM embeddings WHERE model_id = ?").run(modelId).changes;
      sqlite.prepare("DELETE FROM embedding_models WHERE id = ?").run(modelId);
      return removed;
    },
  };
}
