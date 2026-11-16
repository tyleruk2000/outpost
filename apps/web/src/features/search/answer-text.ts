/**
 * Reading an answer as text. An answer is what a language model wrote, and a model
 * can be made to write anything, so nothing here ever produces markup or a link: the
 * answer is cut into plain words, emphasis and citation markers, and the screen draws
 * each of those with its own elements. A web address in an answer stays words.
 */
import type { AnswerSource } from "@outpost/shared";

export type AnswerPiece =
  | { kind: "text"; text: string; strong: boolean }
  /** A citation marker. `source` is missing when the number matches nothing the model was given. */
  | { kind: "marker"; marker: number; source: AnswerSource | undefined };

/** "[2]", and "[1, 3]" as some models write it. The same rule as the server's `checkCitations`. */
const MARKER = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;

function withMarkers(text: string, strong: boolean, sources: ReadonlyMap<number, AnswerSource>, out: AnswerPiece[]): void {
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at), strong });
    for (const number of match[1]!.split(/[,;]/)) {
      const marker = Number(number);
      out.push({ kind: "marker", marker, source: sources.get(marker) });
    }
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last), strong });
}

/**
 * An answer as paragraphs of pieces. Blank lines separate paragraphs. `**words**` is
 * the one piece of formatting kept, as emphasis, because small models write it whatever
 * they are told; everything else is shown exactly as written.
 */
export function readAnswer(text: string, sources: readonly AnswerSource[]): AnswerPiece[][] {
  const byMarker = new Map(sources.map((source) => [source.marker, source]));
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^\n+|\s+$/g, ""))
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => {
      const pieces: AnswerPiece[] = [];
      let last = 0;
      for (const match of paragraph.matchAll(/\*\*([^*\n]+)\*\*/g)) {
        const at = match.index ?? 0;
        if (at > last) withMarkers(paragraph.slice(last, at), false, byMarker, pieces);
        withMarkers(match[1]!, true, byMarker, pieces);
        last = at + match[0].length;
      }
      if (last < paragraph.length) withMarkers(paragraph.slice(last), false, byMarker, pieces);
      return pieces;
    });
}

/** Where a source is, as a person would say it: "Water treatment, Boiling, page 3". */
export function whereOf(source: Pick<AnswerSource, "title" | "heading" | "page">): string {
  return [
    source.title,
    source.heading && source.heading !== source.title ? source.heading : null,
    source.page ? `page ${source.page}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Where the model runs, for a sentence: "on this computer", "at 192.168.1.20:11434 on your network". */
export function placeWords(place: "this-computer" | "local-network" | "elsewhere" | null, server: string | null): string {
  if (place === "this-computer") return "on this computer";
  if (place === "local-network") return `at ${server} on your network`;
  return `at ${server ?? "the address in Settings"}`;
}
