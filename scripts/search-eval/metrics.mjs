/**
 * Measures for a set of searches, the standard ones of information retrieval:
 *
 * - nDCG@5: how good the first five are, graded 0 to 3, the first places counting most
 *   (gain 2^grade − 1, discounted by log2(position + 1)), as a share of the best order
 *   possible. With a fixture library the best order is known from the grades; on a real
 *   library it is the best order of what was retrieved, so it measures order, not recall.
 * - success@3: a useful result (grade 2 or 3) among the first three.
 * - zero-result rate: searches that should find something and found nothing.
 * - p95: the time 95 of 100 searches stay within.
 */
import { readFileSync } from "node:fs";

export function loadQueries() {
  return JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8")).queries;
}

/** Everything a result shows, as one string. */
export function resultText(result) {
  const passages = (result.passages ?? []).map((passage) => passage.segments.map((segment) => segment.text).join("")).join(" ");
  return [result.title, result.subtitle ?? "", passages].join(" \n ");
}

/** A fixture result's grade: from the query's grades, by item. */
export function gradeById(query, result) {
  return query.grades[result.entityId] ?? 0;
}

/** A real library's result: all patterns in the title 3, all anywhere 2, any in the title 1. */
export function gradeByPattern(query, result) {
  const patterns = query.pi.map((source) => new RegExp(source, "i"));
  if (patterns.length === 0) return 0;
  const title = result.title ?? "";
  if (patterns.every((pattern) => pattern.test(title))) return 3;
  const text = resultText(result);
  if (patterns.every((pattern) => pattern.test(text))) return 2;
  return patterns.some((pattern) => pattern.test(title)) ? 1 : 0;
}

const gain = (grade) => 2 ** grade - 1;

export function dcg(grades, depth = 5) {
  return grades.slice(0, depth).reduce((sum, grade, index) => sum + gain(grade) / Math.log2(index + 2), 0);
}

/** nDCG@depth of `grades` against the best order of `ideal` (all grades there are to have). */
export function ndcg(grades, ideal, depth = 5) {
  const best = dcg(
    [...ideal].sort((a, b) => b - a),
    depth,
  );
  return best > 0 ? dcg(grades, depth) / best : null;
}

export function percentile(values, share) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
}

/**
 * One row per search: `grades` of the results in order, `ideal` the grades there are
 * to be had, `expects` whether anything should be found, `ms` how long it took.
 */
export function summarise(rows) {
  const scored = rows.filter((row) => row.expects);
  const values = scored.map((row) => ndcg(row.grades, row.ideal)).filter((value) => value !== null);
  return {
    searches: rows.length,
    ndcg5: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    success3: scored.length ? scored.filter((row) => row.grades.slice(0, 3).some((grade) => grade >= 2)).length / scored.length : 0,
    zeroResultRate: scored.length ? scored.filter((row) => row.count === 0).length / scored.length : 0,
    p95Ms: percentile(
      rows.map((row) => row.ms),
      0.95,
    ),
  };
}

export function formatSummary(label, summary) {
  return `${label}: nDCG@5 ${summary.ndcg5.toFixed(3)}, success@3 ${(summary.success3 * 100).toFixed(0)}%, zero results ${(summary.zeroResultRate * 100).toFixed(0)}%, p95 ${Math.round(summary.p95Ms)} ms (${summary.searches} searches)`;
}

/** A plain-text table: query, nDCG@5, and the first results with their grades. */
export function formatTable(rows, shown = 3) {
  const lines = rows.map((row) => {
    const value = ndcg(row.grades, row.ideal);
    const top = row.titles
      .slice(0, shown)
      .map((title, index) => `${row.grades[index]}·${title.slice(0, 38)}`)
      .join(" | ");
    return `${row.q.padEnd(40).slice(0, 40)} ${value === null ? "  –  " : value.toFixed(2).padStart(5)}  ${top}`;
  });
  return [`${"query".padEnd(40)} nDCG5  first results (grade·title)`, ...lines].join("\n");
}
