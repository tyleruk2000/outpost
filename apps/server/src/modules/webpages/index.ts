/**
 * Saving a web page to read offline.
 *
 * A person pastes the address of a page they are reading. Outpost fetches that one
 * page, finds the article in it, and keeps a readable copy in the document library:
 * a Markdown file that records where it came from and when, searchable like every
 * other document, and drawn by the Markdown view, which never puts a file's own HTML
 * in the page.
 *
 * It is two steps, both started by a person:
 *
 *   look   `POST /api/webpages/preview` fetches the page and says what was found: the
 *          title, how much text, how many pictures and from which hosts, and whether
 *          the address is already in the library. Nothing is kept.
 *   save   `POST /api/webpages/save` starts a job that brings the pictures, if asked,
 *          and adds the document. It uses the page as it was looked at a moment ago,
 *          so the site is asked for the page once.
 *
 * What it will not do is as much a part of it. One page per action: it follows no
 * link, takes no list of addresses, and fetches nothing on a schedule or again later.
 * A save that was not carried out within a few minutes of being asked for is dropped,
 * not picked up after a restart. The same address saved again replaces nothing unless
 * the request says which copy to replace.
 *
 * Every request goes through the guarded download client: `http` and `https` only, no
 * credentials, every connection and every redirect checked to land on a public
 * address. See `fetch.ts` for what is sent, `readable.ts` for how the article is
 * found, and `convert.ts` for how it is made safe to keep.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import {
  SAVE_WEB_PAGE_JOB,
  type SavedCopy,
  type SaveWebPageResult,
  type SkippedPicture,
  type WebPageLimits,
  type WebPagePreview,
} from "@outpost/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, messageOf } from "../../core/errors.ts";
import { safeFileName } from "../../core/fs-safe.ts";
import { createHttpClient } from "../../core/http.ts";
import { type JobRow, PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { documents as documentsTable } from "../../db/schema.ts";
import { pictureLines } from "../documents/embedded-pictures.ts";
import { formatForName, SNIFF_BYTES } from "../documents/file-types.ts";
import { savedFromOf, savedPageFrontMatter } from "../documents/saved-page.ts";
import { discardPart, newPartPath } from "../documents/staging.ts";
import { isFetchablePicture, parsePageAddress } from "./address.ts";
import { type ConvertedArticle, placePictures, writeArticle } from "./convert.ts";
import { assertIsPage, describeStatus, fetchLimited } from "./fetch.ts";
import { fetchPictures, limitsFor } from "./pictures.ts";
import { readPageInWorker } from "./read-host.ts";
import type { Article } from "./readable.ts";

export const WEB_PAGE_LIMITS: WebPageLimits = {
  pageBytes: 5 * 1024 * 1024,
  pageSeconds: 20,
  pictures: 30,
  pictureBytes: 5 * 1024 * 1024,
  picturesTotalBytes: 20 * 1024 * 1024,
};

const PAGE_ACCEPT = "text/html, application/xhtml+xml";
/** How long a look at a page is kept for saving, and how many are kept at once. */
const PREVIEW_MS = 15 * 60_000;
const MAX_PREVIEWS = 8;
/**
 * A save is carried out when it is asked for. One that has waited longer than this (the
 * server was stopped, or the job was paused) is not run late: by then nobody is asking.
 */
const STALE_SAVE_MS = 15 * 60_000;
const QUEUE = "webpage";

interface Looked {
  requestedUrl: string;
  /** Where the page came from, after redirects. */
  url: string;
  host: string;
  article: Omit<Article, "content">;
  converted: ConvertedArticle;
  fetchedAt: number;
}

interface SavePayload extends Record<string, unknown> {
  url: string;
  previewId?: string;
  pictures: boolean;
  replaceDocumentId?: string;
  keepBoth?: boolean;
  locationId?: string;
}

const previewBody = z.object({ url: z.string().max(4000) }).strict();
const saveBody = z
  .object({
    url: z.string().max(4000),
    previewId: z.string().max(64).optional(),
    pictures: z.boolean().optional(),
    replaceDocumentId: z.string().min(1).max(64).optional(),
    keepBoth: z.boolean().optional(),
    locationId: z.string().min(1).max(64).optional(),
  })
  .strict();

export interface WebPagesService {
  /** Fetches one page and says what is in it. Keeps nothing but the look itself, for a few minutes. */
  preview(url: string, signal?: AbortSignal): Promise<WebPagePreview>;
  /** Starts saving a page, or returns the job already saving that address. */
  save(input: z.infer<typeof saveBody>): JobRow;
}

declare module "../../core/context.ts" {
  interface Services {
    webpages: WebPagesService;
  }
}

/** The start of the text, cut at a word. */
function excerptOf(text: string, max = 320): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}

const hostOf = (address: string) => new URL(address).host;

export async function registerWebPages(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { documents, storage } = ctx.services;
  const allowPrivate = ctx.config.allowPrivateDownloads;
  const client = createHttpClient({ allowPrivate });
  ctx.onClose.push(() => client.close());

  const previews = new Map<string, { looked: Looked; expires: number }>();
  const recall = (previewId: string | undefined, requestedUrl: string): Looked | undefined => {
    const entry = previewId ? previews.get(previewId) : undefined;
    if (!entry || entry.expires < Date.now() || entry.looked.requestedUrl !== requestedUrl) return undefined;
    return entry.looked;
  };
  const remember = (looked: Looked): string => {
    const now = Date.now();
    for (const [id, entry] of previews) if (entry.expires < now) previews.delete(id);
    // The oldest goes first: a Map keeps the order things were put in.
    while (previews.size >= MAX_PREVIEWS) previews.delete(previews.keys().next().value!);
    const id = randomBytes(12).toString("hex");
    previews.set(id, { looked, expires: now + PREVIEW_MS });
    return id;
  };

  /** Fetches the page and finds the article. Every refusal a person can meet is thrown from here, in words. */
  async function look(rawUrl: string, signal?: AbortSignal): Promise<Looked> {
    const address = parsePageAddress(rawUrl, { allowPrivate });
    const fetched = await fetchLimited(client, address.url, {
      accept: PAGE_ACCEPT,
      maxBytes: WEB_PAGE_LIMITS.pageBytes,
      timeoutMs: WEB_PAGE_LIMITS.pageSeconds * 1000,
      signal,
      what: "the page",
    });
    if (fetched.status < 200 || fetched.status >= 300) throw new AppError("upstream", describeStatus(fetched.status, "the page"));
    assertIsPage(fetched);
    const fetchedAt = Date.now();
    const from = new URL(fetched.url);
    from.hash = "";

    // Somebody else's HTML is read in a worker thread, which can be stopped; see `read-host.ts`.
    const { article, converted } = await readPageInWorker(
      { bytes: fetched.bytes, contentType: fetched.contentType, url: from.href },
      { signal },
    );
    return { requestedUrl: address.url, url: from.href, host: from.host, article, converted, fetchedAt };
  }

  /**
   * Copies of an address that are already in the library: Markdown documents recorded
   * as coming from it. Only such a document can be offered for replacing.
   */
  function existingCopies(urls: string[]): SavedCopy[] {
    return ctx.db
      .select({ documentId: documentsTable.id, title: documentsTable.title, savedAt: documentsTable.createdAt })
      .from(documentsTable)
      .where(and(inArray(documentsTable.source, [...new Set(urls)]), eq(documentsTable.ext, "md")))
      .orderBy(desc(documentsTable.createdAt))
      .limit(20)
      .all();
  }

  /** Whether a document's own file says it is a page saved from one of these addresses. */
  async function isSavedCopyOf(documentId: string, urls: string[]): Promise<boolean> {
    const handle = await fs.promises.open(documents.absolutePath(documentId), "r");
    try {
      const head = Buffer.alloc(16_384);
      const { bytesRead } = await handle.read(head, 0, head.length, 0);
      const from = savedFromOf(head.subarray(0, bytesRead).toString("utf8"));
      return Boolean(from && urls.includes(from.url));
    } finally {
      await handle.close();
    }
  }

  function toPreview(previewId: string, looked: Looked): WebPagePreview {
    const { article, converted } = looked;
    const fetchable = converted.pictures.filter((address) => isFetchablePicture(address, { allowPrivate }));
    const willFetch = fetchable.slice(0, WEB_PAGE_LIMITS.pictures);
    return {
      previewId,
      requestedUrl: looked.requestedUrl,
      url: looked.url,
      host: looked.host,
      title: article.title,
      byline: article.byline ?? null,
      site: article.site ?? null,
      published: article.published ?? null,
      language: article.language ?? null,
      words: converted.text.split(/\s+/).filter(Boolean).length,
      excerpt: excerptOf(converted.text),
      pictures: { count: fetchable.length, willFetch: willFetch.length, hosts: [...new Set(willFetch.map(hostOf))].slice(0, 12) },
      existing: existingCopies([looked.requestedUrl, looked.url]),
      limits: WEB_PAGE_LIMITS,
    };
  }

  ctx.jobs.setConcurrency(QUEUE, 1);
  ctx.jobs.register<SavePayload>(SAVE_WEB_PAGE_JOB, {
    queue: QUEUE,
    async run({ job, payload, signal, progress }): Promise<Record<string, unknown>> {
      let looked = recall(payload.previewId, payload.url);
      if (!looked) {
        if (Date.now() - job.createdAt > STALE_SAVE_MS) {
          throw new PermanentJobError(
            "This save was asked for a while ago and was not finished then. Outpost fetches a page only when someone asks, so it was not fetched now. Nothing was kept; save the page again if you still want it.",
            "stale",
          );
        }
        progress({ current: 0, total: null, message: "Fetching the page" });
        try {
          looked = await look(payload.url, signal);
        } catch (error) {
          if (signal.aborted) throw error;
          // The same address would give the same answer; this is not retried.
          throw new PermanentJobError(messageOf(error), error instanceof AppError ? error.code : "upstream");
        }
      }
      const urls = [looked.requestedUrl, looked.url];
      const copies = existingCopies(urls);
      if (copies.length > 0 && !payload.keepBoth && !payload.replaceDocumentId) {
        throw new PermanentJobError(
          `This page is already in your library as "${copies[0]!.title}". Nothing was replaced. Save it again and choose whether to replace that copy or keep both.`,
          "conflict",
        );
      }
      const replacing = payload.replaceDocumentId ? copies.find((copy) => copy.documentId === payload.replaceDocumentId) : undefined;
      if (payload.replaceDocumentId && !replacing) {
        throw new PermanentJobError(
          "The copy that was to be replaced is no longer in the library. Nothing was saved; save the page again.",
          "conflict",
        );
      }
      if (replacing && !(await isSavedCopyOf(replacing.documentId, urls).catch(() => false))) {
        throw new PermanentJobError(
          `"${replacing.title}" could not be confirmed as a saved copy of this page (its file may be on a drive that is not connected), so it was not replaced. Save the page again and keep both.`,
          "conflict",
        );
      }
      const location = documents.uploadLocation(payload.locationId);

      const { article, converted } = looked;
      const wanted = payload.pictures ? converted.pictures.filter((address) => isFetchablePicture(address, { allowPrivate })) : [];
      const fetched =
        wanted.length > 0
          ? await fetchPictures(client, wanted, limitsFor(WEB_PAGE_LIMITS), {
              signal,
              onProgress: (done, total) =>
                progress({
                  current: done,
                  total,
                  message: done < total ? `Fetching picture ${done + 1} of ${total}` : "Adding the page to the library",
                }),
            })
          : { kept: [], skipped: [] as SkippedPicture[], notPictures: [] };
      signal.throwIfAborted();

      const numbers = new Map(fetched.kept.map((picture, index) => [picture.url, index + 1]));
      const tree = placePictures(converted.tree, numbers, new Set(fetched.notPictures));
      const text =
        savedPageFrontMatter({
          title: article.title,
          author: article.byline,
          site: article.site,
          published: article.published,
          language: article.language,
          savedFrom: looked.url,
          savedAt: looked.fetchedAt,
        }) +
        `\n${writeArticle(tree, article)}` +
        pictureLines(fetched.kept);
      const bytes = Buffer.from(text, "utf8");

      const originalName = `${safeFileName(article.title.slice(0, 100), "Saved page")}.md`;
      await storage.assertSpace(location.id, bytes.length);
      const partPath = await newPartPath(location.path);
      try {
        await fs.promises.writeFile(partPath, bytes);
      } catch (error) {
        await discardPart(partPath);
        throw error;
      }
      const before = replacing ? documents.get(replacing.documentId) : undefined;
      // A second copy of an address is the person's choice, so the same bytes twice are not turned away either.
      const outcome = await documents.commitStaged(
        {
          partPath,
          owned: true,
          locationId: location.id,
          originalName,
          format: formatForName(originalName),
          sha256: createHash("sha256").update(bytes).digest("hex"),
          sizeBytes: bytes.length,
          head: bytes.subarray(0, SNIFF_BYTES),
        },
        { title: article.title, allowDuplicate: true, category: before?.category ?? null, tags: before?.tags ?? [] },
      );
      const document = await documents.update(outcome.document.id, {
        source: looked.url,
        author: article.byline ?? null,
        language: article.language ?? null,
      });

      // The earlier copy goes only now, with the new one safely in the library.
      let replacedDocumentId: string | undefined;
      let replaceError: string | undefined;
      if (replacing) {
        try {
          await documents.remove(replacing.documentId);
          replacedDocumentId = replacing.documentId;
        } catch (error) {
          // The new copy is in the library either way; the person is told the old one is still there.
          replaceError = messageOf(error);
        }
      }
      if (payload.previewId) previews.delete(payload.previewId);

      const result: SaveWebPageResult = {
        documentId: document.id,
        title: document.title,
        url: looked.url,
        pictures: {
          kept: fetched.kept.length,
          bytes: fetched.kept.reduce((sum, picture) => sum + picture.bytes.length, 0),
          skipped: fetched.skipped
            .slice(0, 40)
            .map((skipped) => ({ url: skipped.url.slice(0, 300), reason: skipped.reason.slice(0, 300) })),
        },
        ...(replacedDocumentId ? { replacedDocumentId } : {}),
        ...(replaceError ? { replaceError } : {}),
      };
      return result as unknown as Record<string, unknown>;
    },
  });

  const service: WebPagesService = {
    async preview(url, signal) {
      const looked = await look(url, signal);
      return toPreview(remember(looked), looked);
    },

    save(input) {
      const address = parsePageAddress(input.url, { allowPrivate });
      if (input.keepBoth && input.replaceDocumentId) throw badRequest("Choose one: replace the earlier copy, or keep both.");
      const subject = `webpage:${address.url}`;
      const underWay = ctx.jobs.findBySubject(subject).find((job) => job.state === "queued" || job.state === "running");
      if (underWay) return underWay;

      const looked = recall(input.previewId, address.url);
      const copies = existingCopies(looked ? [address.url, looked.url] : [address.url]);
      if (input.replaceDocumentId && !copies.some((copy) => copy.documentId === input.replaceDocumentId)) {
        throw badRequest("That document is not a saved copy of this address, so it cannot be replaced by it.");
      }
      if (copies.length > 0 && !input.keepBoth && !input.replaceDocumentId) {
        throw conflict(
          `This address is already in your library as "${copies[0]!.title}". Choose whether to replace that copy or keep both; nothing is replaced unless you say so.`,
          { existing: copies },
        );
      }
      // Fails now, with a clear message, rather than after the page has been fetched.
      documents.uploadLocation(input.locationId);
      const payload: SavePayload = {
        url: address.url,
        pictures: input.pictures === true,
        ...(looked && input.previewId ? { previewId: input.previewId } : {}),
        ...(input.replaceDocumentId ? { replaceDocumentId: input.replaceDocumentId } : {}),
        ...(input.keepBoth ? { keepBoth: true } : {}),
        ...(input.locationId ? { locationId: input.locationId } : {}),
      };
      return ctx.jobs.enqueue(SAVE_WEB_PAGE_JOB, payload, {
        title: `Save “${(looked?.article.title ?? address.host).slice(0, 120)}”`,
        subject,
      });
    },
  };
  ctx.services.webpages = service;

  app.post("/api/webpages/preview", async (request, reply): Promise<WebPagePreview> => {
    const { url } = previewBody.parse(request.body);
    // Someone who closes the dialog is no longer asking, so the fetch stops with them.
    const gone = new AbortController();
    const onClose = () => {
      if (!reply.raw.writableFinished) gone.abort();
    };
    reply.raw.on("close", onClose);
    try {
      return await service.preview(url, gone.signal);
    } catch (error) {
      if (gone.signal.aborted) throw badRequest("The request was closed before the page arrived, so Outpost stopped fetching it.");
      throw error;
    } finally {
      reply.raw.off("close", onClose);
    }
  });

  app.post("/api/webpages/save", async (request) => ({ job: toJobDto(service.save(saveBody.parse(request.body))) }));
}
