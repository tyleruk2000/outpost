/** How much a map shows, in plain words, by the deepest zoom it was downloaded to. */

const DETAIL_LABELS: Array<[maxZoom: number, label: string]> = [
  [5, "Continents and countries"],
  [7, "Countries and cities"],
  [9, "Main roads and large towns"],
  [11, "Roads and towns"],
  [13, "Villages and tracks"],
  [14, "Footpaths and buildings"],
  [15, "Everything"],
];

/** What a map downloaded to this zoom shows, in plain words. */
export function detailLabel(maxZoom: number): string {
  return DETAIL_LABELS.find(([limit]) => maxZoom <= limit)?.[1] ?? "Everything";
}

/** The detail levels offered: the standard four, plus the area's recommended one when it is not among them. */
export function detailChoices(recommended: number | undefined): number[] {
  const zooms = new Set([10, 12, 14, 15]);
  if (recommended !== undefined) zooms.add(recommended);
  return [...zooms].sort((a, b) => a - b);
}
