/**
 * How the built-in model reads a text that is longer than it can take in at once.
 *
 * The model reads at most 256 word pieces. Outpost's passages are often a little longer
 * (about a quarter of those in the bundled books, as measured), and cutting them off
 * left their last lines out of the vector altogether. So a longer text is read in
 * consecutive stretches, each as long as the model allows and the last one whatever
 * remains, and the text's vector is the mean of the stretches' vectors, each counted by
 * its length. Every word piece then counts once, as it does in a text read in one go.
 *
 * This layout was chosen by measurement over others (one longer read of 512 word
 * pieces, equal halves, overlapping windows): it found text from the end of a long
 * passage about as well as text from its middle, without making long passages turn up
 * for questions that belong to short ones. docs/search.md has the figures.
 *
 * Kept free of imports: the worker uses it, and the tests check it without a model.
 */

/** One stretch of a text's word pieces: from `start` up to, not including, `end`. */
export interface Stretch {
  start: number;
  end: number;
}

/**
 * The stretches that `count` word pieces are read in when at most `limit` fit at once.
 * A text that fits is one stretch, which is the whole of it.
 */
export function stretchesOf(count: number, limit: number): Stretch[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("The limit must be a whole number of word pieces, at least one.");
  if (count <= limit) return [{ start: 0, end: Math.max(0, count) }];
  const stretches: Stretch[] = [];
  for (let start = 0; start < count; start += limit) stretches.push({ start, end: Math.min(count, start + limit) });
  return stretches;
}
