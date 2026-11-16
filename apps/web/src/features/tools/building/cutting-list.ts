/** Reading a cutting list as people write one: a length a line, with "x 4" or "× 4" for several. */

export type ListReading = { ok: true; lengths: number[] } | { ok: false; error: string };

/**
 * "1.2 x 4", "600", "2.4×2"… each a length (in the unit chosen for the list)
 * and how many. Lines are also split at commas and semicolons. Empty lines are skipped.
 */
export function readLengths(text: string, toMeters: (value: number) => number, maxCount = 500): ListReading {
  const lengths: number[] = [];
  const items = text
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) return { ok: false, error: "Type at least one length." };
  for (const item of items) {
    const match = /^(\d+(?:\.\d+)?)\s*(?:[x×*]\s*(\d+))?$/i.exec(item);
    if (!match) {
      return {
        ok: false,
        error: `“${item}” is not a length. Write one a line in the unit chosen, without the unit, such as 1.2 or 1.2 x 4.`,
      };
    }
    const length = Number(match[1]);
    const count = match[2] ? Number(match[2]) : 1;
    if (!(length > 0)) return { ok: false, error: `“${item}”: a length must be more than 0.` };
    if (count < 1) return { ok: false, error: `“${item}”: the number of pieces must be at least 1.` };
    if (lengths.length + count > maxCount) return { ok: false, error: `That is more than ${maxCount} pieces: split the list.` };
    for (let index = 0; index < count; index += 1) lengths.push(toMeters(length));
  }
  return { ok: true, lengths };
}
