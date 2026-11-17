/**
 * The library: search it, and read one passage or one page of a document.
 *
 * Both answer from the retrieval the Search screen and "Answer from my library" use
 * (`ctx.services.retrieval`, `ctx.services.search`), over documents and notes only: the
 * kinds of thing whose text may be given to a language model (modules/retrieval). The
 * search index also holds contacts and other things; a passage of any other kind is
 * never read out here, even when the model names its number. Encrypted pages of notes
 * have no text in the index at all (modules/notes), so nothing of them can be read.
 */
import { z } from "zod";
import { defineTool, MAX_ANSWER_CHARS, pageOf, type ToolDefinition } from "./types.ts";

/** The kinds of thing whose text may be given to a model, as in the retrieval endpoint. */
const READABLE = new Set(["document", "note"]);

const where = (record: { title: string; heading: string | null; page: number | null }) =>
  [record.title || "Untitled", record.heading || null, record.page !== null ? `page ${record.page}` : null].filter(Boolean).join(", ");

const excerpt = (text: string, most = 360) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > most ? `${flat.slice(0, most).trimEnd()}…` : flat;
};

export const searchLibrary = defineTool({
  name: "search_library",
  title: "the library",
  area: "library",
  description:
    "Search the household's own documents and notes for passages about a subject. Give a few key words, not a sentence. Each result has a passage number; use read_passage to read one in full.",
  input: z.object({
    query: z.string().trim().min(1).max(200).describe("A few key words, for example: boil water altitude"),
    page: z.number().int().min(1).max(20).optional().describe("Which page of results, from 1. Leave out for the first."),
  }),
  async run({ query, page }, { ctx, signal }) {
    const passages = (await ctx.services.retrieval.retriever.retrieve({ query, limit: 30, kinds: [...READABLE], signal })).filter(
      (passage) => READABLE.has(passage.kind),
    );
    if (passages.length === 0) {
      return {
        held: false,
        text: `Nothing in the library's documents or notes matches "${query}". Try other words, or say the library does not hold it. Documents are added under Library.`,
        url: `/search?q=${encodeURIComponent(query)}`,
      };
    }
    const { shown, line } = pageOf(passages, page ?? 1, 6);
    const lines = shown.map((passage) => `Passage ${passage.chunkId} (${passage.kind}, ${where(passage)}): ${excerpt(passage.text)}`);
    return {
      held: true,
      label: `${passages.length} passage${passages.length === 1 ? "" : "s"}`,
      url: `/search?q=${encodeURIComponent(query)}`,
      text: [`From the library, for "${query}":`, ...lines, line].filter(Boolean).join("\n"),
    };
  },
});

export const readPassage = defineTool({
  name: "read_passage",
  title: "a passage of the library",
  area: "library",
  description:
    "Read one passage of the library in full, by the passage number search_library gave. Give page as well to read that page of the same document instead.",
  input: z.object({
    passage: z.number().int().min(1).describe("The passage number from search_library."),
    page: z.number().int().min(1).max(100000).optional().describe("A page of the same document to read instead, for a PDF."),
  }),
  run({ passage, page }, { ctx }) {
    const [record] = ctx.services.search.getChunks([passage]);
    if (!record || !READABLE.has(record.kind)) {
      return {
        held: false,
        text: `There is no passage ${passage} in the library's documents and notes. Search again with search_library.`,
      };
    }
    let records = [record];
    if (page !== undefined) {
      const ids = (
        ctx.sqlite
          .prepare(
            `SELECT c.id AS id FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id
             WHERE e.kind = ? AND e.entity_id = ? AND c.page = ? ORDER BY c.ordinal LIMIT 20`,
          )
          .all(record.kind, record.entityId, page) as Array<{ id: number }>
      ).map((row) => row.id);
      records = ctx.services.search.getChunks(ids);
      if (records.length === 0) return { held: false, text: `"${record.title}" has no text on page ${page}.` };
    }
    let text = records.map((entry) => entry.text).join("\n\n");
    const cut = text.length > MAX_ANSWER_CHARS - 300;
    if (cut) text = `${text.slice(0, MAX_ANSWER_CHARS - 300).trimEnd()}…`;
    const first = records[0]!;
    const url = first.page === null ? first.url : `${first.url}${first.url.includes("?") ? "&" : "?"}page=${first.page}`;
    return {
      held: true,
      label: where(first),
      url,
      text: [
        `${first.kind === "note" ? "Note" : "Document"}: ${where(first)}`,
        text,
        cut ? "(Cut short here: the rest is longer than can be sent.)" : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
});

export const LIBRARY_TOOLS: ToolDefinition[] = [searchLibrary, readPassage];
