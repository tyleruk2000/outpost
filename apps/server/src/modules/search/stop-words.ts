/**
 * Words that shape a question and say nothing about its subject. Kept short on
 * purpose: "not", "without", "off" and "no" change what is meant and are never dropped.
 * On their own here so that the table of other ways of saying things (synonyms.ts) can
 * read them too: query.ts, which drops them, reads that table.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    "a an the and or of to in on at by for from with into onto as about " +
    "how what when where why which who whom whose " +
    "do does did doing done is are was were be been being am " +
    "can could should would will shall may might must " +
    "i me my mine we us our you your he him his she her it its they them their there " +
    "this that these those if so than then also just please "
  ).split(" "),
);
