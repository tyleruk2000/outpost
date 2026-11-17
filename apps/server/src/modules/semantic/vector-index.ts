/**
 * Where vectors live and how the nearest ones are found.
 *
 * `VectorIndex` is the seam for other back ends (sqlite-vec, pgvector, a dedicated
 * vector database). The built-in implementation is a flat index over the `embeddings`
 * table: every query compares against every stored vector for the model. That is exact,
 * needs no extra native code, never holds more than one batch in memory, and is fast
 * enough for the libraries a single device holds (roughly 100,000 passages in well
 * under a second on a Raspberry Pi 5). An approximate index only starts to matter far
 * beyond that.
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

  return {
    upsert: (modelId, items) => upsertMany(modelId, items),

    query(modelId, vector, limit, kinds, within) {
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
      const removed = sqlite.prepare("DELETE FROM embeddings WHERE model_id = ?").run(modelId).changes;
      sqlite.prepare("DELETE FROM embedding_models WHERE id = ?").run(modelId);
      return removed;
    },
  };
}
