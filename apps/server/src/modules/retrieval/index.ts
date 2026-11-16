/**
 * Retrieval and context assembly: the parts of a question-answering pipeline that do
 * not need a language model. `modules/answers` builds on them to have a model the
 * person runs write an answer; they are also exposed over HTTP, so that any other
 * program on the machine can be given cited context from the library.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { registerExplain } from "./explain.ts";
import type { AssembledContext, Citation, ContextAssembler, ModelProvider, Reranker, RetrievedPassage, Retriever } from "./types.ts";

export interface RetrievalService {
  retriever: Retriever;
  assembler: ContextAssembler;
  /** Declared for a later release; nothing registers a reranker. */
  rerankers: Map<string, Reranker>;
  /** The model answers are written by, when one is set up in Settings (see `modules/answers`). Otherwise empty. */
  models: Map<string, ModelProvider>;
}

declare module "../../core/context.ts" {
  interface Services {
    retrieval: RetrievalService;
  }
}

/** Collections and tags whose content must be quoted rather than paraphrased. */
const safetyTerms =
  /\b(medic|first aid|health|drug|dose|dosage|wound|poison|canning|preserv|food safety|ferment|foraging|mushroom|water treatment|purif)/i;

export function isSafetyCritical(passage: Pick<RetrievedPassage, "title" | "collection">): boolean {
  return safetyTerms.test(`${passage.title} ${passage.collection ?? ""}`);
}

/**
 * Lays passages out as numbered sources. Passages from the same source are kept
 * together and in reading order so that the context reads coherently.
 */
export const contextAssembler: ContextAssembler = {
  assemble(query, passages, options = {}) {
    const maxChars = options.maxChars ?? 6000;
    const maxPassages = options.maxPassages ?? 12;
    const chosen: RetrievedPassage[] = [];
    let used = 0;
    for (const passage of passages) {
      if (chosen.length >= maxPassages) break;
      if (used + passage.text.length > maxChars && chosen.length > 0) continue;
      chosen.push(passage);
      used += passage.text.length;
    }

    const firstSeen = new Map<string, number>();
    chosen.forEach((passage, index) => {
      const key = `${passage.kind}:${passage.entityId}`;
      if (!firstSeen.has(key)) firstSeen.set(key, index);
    });
    const ordered = [...chosen].sort((a, b) => {
      const groupA = firstSeen.get(`${a.kind}:${a.entityId}`)!;
      const groupB = firstSeen.get(`${b.kind}:${b.entityId}`)!;
      return groupA - groupB || (a.charStart ?? 0) - (b.charStart ?? 0);
    });

    const citations: Citation[] = ordered.map((passage, index) => ({
      marker: index + 1,
      chunkId: passage.chunkId,
      kind: passage.kind,
      entityId: passage.entityId,
      title: passage.title,
      collection: passage.collection,
      url: passage.url,
      page: passage.page,
      heading: passage.heading,
      quote: passage.text,
      contentHash: passage.contentHash,
    }));

    const text = citations
      .map((citation) => {
        const where = [citation.title, citation.heading, citation.page ? `page ${citation.page}` : null].filter(Boolean).join(", ");
        return `[${citation.marker}] ${where}\n${citation.quote}`;
      })
      .join("\n\n");

    return {
      query,
      text,
      citations,
      omitted: passages.length - chosen.length,
      safetyCritical: ordered.some(isSafetyCritical),
    } satisfies AssembledContext;
  },
};

/**
 * The numbers inside one pair of square brackets, when the brackets hold nothing but
 * numbers: "[2]", and "[1, 3]" as some models write it. "[see 2]" and "[1994 edition]"
 * are prose, not markers.
 */
export const CITATION_MARKER = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;

/** Finds which citation markers an answer used, and which of them are not real sources. */
export function checkCitations(answer: string, citations: Citation[]): { used: number[]; unsupported: number[] } {
  const known = new Set(citations.map((citation) => citation.marker));
  const used = new Set<number>();
  for (const match of answer.matchAll(CITATION_MARKER)) {
    for (const number of match[1]!.split(/[,;]/)) used.add(Number(number));
  }
  const all = [...used].sort((a, b) => a - b);
  return { used: all.filter((marker) => known.has(marker)), unsupported: all.filter((marker) => !known.has(marker)) };
}

export async function registerRetrieval(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { search } = ctx.services;

  const retriever: Retriever = {
    id: "outpost-hybrid",
    async retrieve({ query, limit = 8, kinds, mode, within, signal }) {
      // Reference articles served by Kiwix are not chunked in Outpost's index, so
      // retrieval covers documents, notes and other locally indexed text.
      const found = await search.searchPassages({ q: query, kinds: kinds ?? ["document", "note"], mode, limit, within, signal });
      const records = new Map(search.getChunks(found.hits.map((hit) => hit.chunkId)).map((record) => [record.chunkId, record]));
      const passages: RetrievedPassage[] = [];
      for (const hit of found.hits) {
        const record = records.get(hit.chunkId);
        if (!record?.text) continue;
        passages.push({
          chunkId: record.chunkId,
          kind: record.kind,
          entityId: record.entityId,
          title: record.title,
          collection: record.collection,
          sourcePath: record.sourcePath,
          url: record.page === null ? record.url : `${record.url}${record.url.includes("?") ? "&" : "?"}page=${record.page}`,
          page: record.page,
          heading: record.heading || null,
          charStart: record.charStart,
          charEnd: record.charEnd,
          text: record.text,
          contentHash: record.contentHash,
          indexVersion: record.indexVersion,
          score: hit.score,
          retrievedBy: [hit.keywordRank !== null ? "keyword" : null, hit.semanticRank !== null ? "semantic" : null].filter(
            (layer): layer is string => layer !== null,
          ),
        });
      }
      return passages;
    },
  };

  ctx.services.retrieval = { retriever, assembler: contextAssembler, rerankers: new Map(), models: new Map() };

  const body = z.object({
    query: z.string().trim().min(1).max(1000),
    limit: z.number().int().min(1).max(30).optional(),
    maxChars: z.number().int().min(200).max(60000).optional(),
    kinds: z.array(z.string().max(40)).max(10).optional(),
    mode: z.enum(["keyword", "semantic", "hybrid"]).optional(),
  });

  /** Passages for a question, with full provenance. */
  app.post("/api/retrieval/passages", async (request) => {
    const input = body.parse(request.body);
    return { query: input.query, passages: await retriever.retrieve(input) };
  });

  registerExplain(app, ctx);

  /** The same passages laid out as numbered, citable context for a language model. */
  app.post("/api/retrieval/context", async (request) => {
    const input = body.parse(request.body);
    const passages = await retriever.retrieve(input);
    return contextAssembler.assemble(input.query, passages, { maxChars: input.maxChars, maxPassages: input.limit });
  });
}
