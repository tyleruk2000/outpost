/**
 * What each colour means on this page. The meanings are fixed: a colour never stands
 * for two things, and text never wears one of them.
 */
export const COLOR = {
  /** Search by words. */
  keyword: "var(--chart-1)",
  /** The fused, final result. */
  fused: "var(--chart-2)",
  /** Search by meaning. */
  meaning: "var(--chart-3)",
  /** The reader's question. */
  query: "var(--chart-4)",
  /** Everything else. */
  other: "var(--chart-other)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  ink: "var(--ink)",
  inkMuted: "var(--ink-muted)",
  page: "var(--page)",
  surface: "var(--surface)",
  borderStrong: "var(--border-strong)",
} as const;

/** Where a passage is, in a few words: its title, then its page or heading. */
export function passageName(passage: { title: string; page: number | null; heading: string | null }): string {
  const where = [
    passage.page !== null ? `page ${passage.page}` : null,
    passage.heading && passage.heading !== passage.title ? passage.heading : null,
  ]
    .filter(Boolean)
    .join(", ");
  return where ? `${passage.title} · ${where}` : passage.title;
}

export function passageWhere(passage: { title?: string; page: number | null; heading: string | null }): string {
  return [
    passage.page !== null ? `Page ${passage.page}` : null,
    passage.heading && passage.heading !== passage.title ? passage.heading : null,
  ]
    .filter(Boolean)
    .join(", ");
}
