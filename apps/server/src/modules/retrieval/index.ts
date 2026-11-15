/**
 * Retrieval and context assembly: the parts of a question-answering pipeline that do
 * not need a language model. Exposed over HTTP so that a model running elsewhere on
 * the machine can already be given cited context from the library.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { registerExplain } from "./explain.ts";
import type { AssembledContext, Citation, ContextAssembler, ModelProvider, Reranker, RetrievedPassage, Retriever } from "./types.ts";

export interface RetrievalService {
  retriever: Retriever;
  assembler: ContextAssembler;
  /** Extension points for a future release; empty today. */
  rerankers: Map<string, Reranker>;
  models: Map<string, ModelProvider>;
}

declare module "../../core/context.ts" {
  interface Services {
    retrieval: RetrievalService;
  }
}

/** Collections and tags whose content must be quoted rather than paraphrased. */
const safetyTerms = /\b(medic|first aid|health|drug|dose|dosage|wound|poison|canning|preserv|food safety|ferment|foraging|mushroom|water treatment|purif)/i;

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

/** Finds which citation markers an answer used, and which of them are not real sources. */
export function checkCitations(answer: string, citations: Citation[]): { used: number[]; unsupported: number[] } {
  const known = new Set(citations.map((citation) => citation.marker));
  const used = new Set<number>();
  for (const match of answer.matchAll(/\[(\d{1,3})\]/g)) used.add(Number(match[1]));
  const all = [...used].sort((a, b) => a - b);
  return { used: all.filter((marker) => known.has(marker)), unsupported: all.filter((marker) => !known.has(marker)) };
}

export async function registerRetrieval(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { search } = ctx.services;

  const retriever: Retriever = {
    id: "outpost-hybrid",
    async retrieve({ query, limit = 8, kinds, mode, signal }) {
      // Reference articles served by Kiwix are not chunked in Outpost's index, so
      // retrieval covers documents, notes and other locally indexed text.
      const response = await search.search({ q: query, kinds: kinds ?? ["document", "note"], mode, limit: Math.min(limit * 2, 50), signal });
      const wanted: Array<{ chunkId: number; score: number; sources: string[] }> = [];
      for (const result of response.results) {
        for (const passage of result.passages) {
          if (passage.chunkId !== null) wanted.push({ chunkId: passage.chunkId, score: result.score, sources: result.sources });
        }
      }
      const records = new Map(search.getChunks(wanted.map((item) => item.chunkId)).map((record) => [record.chunkId, record]));
      const passages: RetrievedPassage[] = [];
      for (const item of wanted) {
        const record = records.get(item.chunkId);
        if (!record || !record.text) continue;
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
          score: item.score,
          retrievedBy: item.sources,
        });
        if (passages.length >= limit) break;
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
