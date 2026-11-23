/**
 * The reference half of a search, as a person sees it come in: `GET /api/search/reference`
 * read line by line. For each question it notes when the first article came, when the
 * first useful one did (grade 2 or 3 by the set's patterns), when the search ended, and
 * how good the list shown is.
 *
 * "As shown" is the list a person sees once the search has ended. A server that sends
 * `ranked: true` on its start line has its articles shown as one list in score order;
 * an older one had the best article of each collection shown in the order collections
 * answered, which is how it is measured for such a server.
 */
import { gradeByPattern } from "./metrics.mjs";

/** Reads one reference search to its end. */
export async function readReference(base, q, { scope } = {}) {
  const started = performance.now();
  const url = `${base}/api/search/reference?q=${encodeURIComponent(q)}${scope ? `&scope=${scope}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const lines = [];
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    for (let at = buffer.indexOf("\n"); at !== -1; at = buffer.indexOf("\n")) {
      lines.push({ ...JSON.parse(buffer.slice(0, at)), at: performance.now() - started });
      buffer = buffer.slice(at + 1);
    }
  }
  return lines;
}

/** What one reference search gave, measured against the question's patterns. */
export function measureReference(query, lines) {
  const ranked = lines.some((line) => line.type === "start" && line.ranked);
  const byId = new Map();
  const best = [];
  let firstMs = null;
  let firstGoodMs = null;
  let collections = 0;
  for (const line of lines) {
    if (line.type === "start" || line.type === "widen") collections += line.collections ?? 0;
    if (line.type !== "collection" || line.results.length === 0) continue;
    if (firstMs === null) firstMs = line.at;
    if (firstGoodMs === null && line.results.some((result) => gradeByPattern(query, result) >= 2)) firstGoodMs = line.at;
    // A newer server can send a collection twice (titles first, then its full text): the later answer counts.
    for (const result of line.results) byId.set(result.entityId, result);
    if (!best.some((result) => result.entityId.startsWith(`${line.collectionId}:`))) best.push(line.results[0]);
  }
  const end = lines.find((line) => line.type === "end");
  const shown = ranked ? [...byId.values()].sort((a, b) => b.score - a.score) : best;
  const grades = shown.map((result) => gradeByPattern(query, result));
  return {
    q: query.q,
    ranked,
    collections,
    firstMs,
    firstGoodMs,
    endMs: end?.at ?? null,
    missing: end?.missing?.length ?? 0,
    more: end?.more ?? 0,
    count: byId.size,
    grades,
    titles: shown.map((result) => `${result.collection ?? ""}: ${result.title}`),
  };
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
function percentile(values, share) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
}

/** Over the set: useful in the first three, useful share of the first five, and the times. */
export function summariseReference(rows) {
  const firstGood = rows.map((row) => row.firstGoodMs).filter((value) => value !== null);
  return {
    searches: rows.length,
    success3: mean(rows.map((row) => (row.grades.slice(0, 3).some((grade) => grade >= 2) ? 1 : 0))),
    precision5: mean(rows.map((row) => row.grades.slice(0, 5).filter((grade) => grade >= 2).length / 5)),
    collections: mean(rows.map((row) => row.collections)),
    medianFirstMs: percentile(
      rows.map((row) => row.firstMs).filter((value) => value !== null),
      0.5,
    ),
    medianFirstGoodMs: percentile(firstGood, 0.5),
    p95FirstGoodMs: percentile(firstGood, 0.95),
    noGood: rows.filter((row) => row.firstGoodMs === null).length,
    medianEndMs: percentile(
      rows.map((row) => row.endMs).filter((value) => value !== null),
      0.5,
    ),
    p95EndMs: percentile(
      rows.map((row) => row.endMs).filter((value) => value !== null),
      0.95,
    ),
  };
}

const ms = (value) => (value === null ? "–" : `${(value / 1000).toFixed(1)} s`);

export function formatReference(label, rows) {
  const lines = rows.map(
    (row) =>
      `${row.q.padEnd(36).slice(0, 36)} ${String(row.collections).padStart(3)} ${ms(row.firstMs).padStart(7)} ${ms(row.firstGoodMs).padStart(7)} ${ms(row.endMs).padStart(7)}  ${row.titles
        .slice(0, 3)
        .map((title, index) => `${row.grades[index]}·${title.slice(0, 40)}`)
        .join(" | ")}`,
  );
  const s = summariseReference(rows);
  return [
    `${"query".padEnd(36)} arc   first  useful     end  first shown (grade·collection: title)`,
    ...lines,
    "",
    `${label}: success@3 ${(s.success3 * 100).toFixed(0)}%, useful share of first 5 ${(s.precision5 * 100).toFixed(0)}%, ` +
      `archives asked ${s.collections.toFixed(1)}, first article ${ms(s.medianFirstMs)} median, first useful ${ms(s.medianFirstGoodMs)} median / ${ms(s.p95FirstGoodMs)} p95 ` +
      `(none for ${s.noGood}), all done ${ms(s.medianEndMs)} median / ${ms(s.p95EndMs)} p95 (${s.searches} searches)`,
  ].join("\n");
}
