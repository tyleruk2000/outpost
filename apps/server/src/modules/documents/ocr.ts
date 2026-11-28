/**
 * OCR for the document library: reading text from scanned PDF pages and from images.
 *
 * It is a background job of its own, on a queue that runs one at a time, because it is
 * minutes of processor time for a long document. What it reads goes where every other
 * document's text goes: the extracted-text store, the search index, and from there the
 * semantic index. Only pages that have no text of their own are read, and the text of
 * the file itself is never replaced by a reading of its picture.
 *
 * Pages are kept as they are finished. A restart or a pause continues from them; a
 * cancel or a failure makes what was read part of the document and stops there.
 *
 * Nothing here writes outside Outpost's data directory, and nothing reaches the network.
 */
import fs from "node:fs";
import type { OcrStatus } from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict, messageOf } from "../../core/errors.ts";
import { replacedByLink } from "../../core/fs-safe.ts";
import { type JobRow, PermanentJobError } from "../../core/jobs.ts";
import { documents } from "../../db/schema.ts";
import { OcrFailure, runOcr } from "../ocr/host.ts";
import { engineInstalled, installedLanguages, LANGUAGE_FOLDER, languageName, parseLanguages } from "../ocr/tesseract-assets.ts";
import { DEFAULT_PROVIDER, MAX_OCR_PAGES, MAX_PDF_BYTES, MAX_SOURCE_PIXELS, type OcrLanguageFile, type OcrPage } from "../ocr/types.ts";
import { type ExtractedSection, tidyText, withHeading } from "./extract-types.ts";
import type { ExtractedStore, StoredDocumentText } from "./extracted-store.ts";
import { formatForExt } from "./file-types.ts";

type DocumentRow = typeof documents.$inferSelect;

export const OCR_JOB = "document.ocr";
/** Its own queue, so that only one document is read at a time whatever else is running. */
const OCR_QUEUE = "ocr";
/** Image types the engine reads. An SVG is a drawing, not a picture of text. */
const OCR_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
/** How often the pages read so far are written down while a long document is read. */
const SAVE_EVERY_PAGES = 10;
const SAVE_EVERY_MS = 15_000;

interface OcrPayload extends Record<string, unknown> {
  documentId: string;
  /** Read again the pages OCR has already been run on, replacing what it found. */
  redo?: boolean;
}

/** What the OCR job needs from the documents service it is part of. */
export interface OcrHooks {
  findRow(id: string): DocumentRow | undefined;
  index(row: DocumentRow, sections: ExtractedSection[]): void;
  changed(id: string): void;
  subjectOf(id: string): string;
  extracted: ExtractedStore;
  /** Runs one change to a document's stored text at a time. */
  exclusive<T>(id: string, task: () => Promise<T>): Promise<T>;
}

export interface DocumentOcr {
  status(): Promise<OcrStatus>;
  /** "pdf" or "image" for a file OCR can read; undefined for every other type. */
  kindOf(row: Pick<DocumentRow, "ext">): "pdf" | "image" | undefined;
  /** Queues reading the scanned pages, or returns the job already doing so. Throws `AppError` when it cannot. */
  start(row: DocumentRow, options?: { redo?: boolean }): Promise<JobRow>;
  /** Queues OCR for a document whose own text has just been read, when the setting asks for it. */
  startIfAutomatic(row: DocumentRow): Promise<void>;
  /** Stops any OCR of this document. What it had read is kept. */
  cancel(id: string): void;
}

/** The page a section or result belongs to; 0 stands for an image, which has no pages. */
const keyOf = (page: number | null | undefined) => page ?? 0;
const pages = (count: number) => `${count.toLocaleString("en")} ${count === 1 ? "page" : "pages"}`;

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function createDocumentOcr(ctx: AppContext, hooks: OcrHooks): DocumentOcr {
  const { db } = ctx;
  const { storage, settings } = ctx.services;
  const { extracted } = hooks;

  function kindOf(row: Pick<DocumentRow, "ext">): "pdf" | "image" | undefined {
    const type = formatForExt(row.ext)?.type;
    if (type === "pdf") return "pdf";
    return type === "image" && OCR_IMAGE_EXTENSIONS.has(row.ext.toLowerCase()) ? "image" : undefined;
  }

  /** The languages to read with, in the order the setting gives them, and what is wrong if there are none. */
  async function languages(): Promise<{ use: OcrLanguageFile[]; status: OcrStatus }> {
    const installed = await installedLanguages(ctx.config.dataDir);
    const chosen = parseLanguages(settings.get("ocr.languages"));
    const wanted = chosen.length > 0 ? chosen : ["eng"];
    const byCode = new Map(installed.map((language) => [language.code, language]));
    const use = wanted.flatMap((code) => byCode.get(code) ?? []);
    const missing = wanted.filter((code) => !byCode.has(code));

    let reason: string | null = null;
    if (!engineInstalled() || installed.length === 0) {
      reason = "Reading text from scans (OCR) is not part of this installation: the OCR engine or its language data is missing.";
    } else if (use.length === 0) {
      reason = `OCR is set to read ${listOf(missing.map(languageName))}, but that language data is not installed. Put the language file in "${LANGUAGE_FOLDER}" inside the data directory, or set the language back to English.`;
    }
    return {
      use,
      status: {
        available: reason === null,
        reason,
        engine: "Tesseract",
        languages: installed.map((language) => ({
          code: language.code,
          name: languageName(language.code),
          builtIn: language.builtIn,
          selected: wanted.includes(language.code),
        })),
        missingLanguages: missing,
        languageFolder: LANGUAGE_FOLDER,
        auto: settings.get("ocr.auto"),
        limits: { pagesPerRun: MAX_OCR_PAGES, maxPixels: MAX_SOURCE_PIXELS },
      },
    };
  }

  /**
   * The pages OCR should read now: those with no text of their own, less the ones it
   * has already been run on unless asked to read them again. `[0]` stands for an image.
   */
  function pagesToRead(row: DocumentRow, stored: StoredDocumentText, redo: boolean): number[] {
    const attempted = new Set(stored.ocrPages);
    if (kindOf(row) === "image") return redo || !attempted.has(0) ? [0] : [];
    if (!row.pageCount) return [];
    const most = settings.get("indexing.maxPdfPages");
    const limit = most > 0 ? Math.min(row.pageCount, most) : row.pageCount;
    const own = new Set(stored.sections.filter((section) => !section.ocr).map((section) => section.page));
    const wanted: number[] = [];
    for (let page = 1; page <= limit; page += 1) {
      if (!own.has(page) && (redo || !attempted.has(page))) wanted.push(page);
    }
    return wanted;
  }

  interface Outcome {
    /** How the run ended when it did not finish. */
    stopped?: "cancelled" | "failed";
    /** For a failed run, why. */
    error?: string | null;
    /** Pages this run set out to read. */
    total: number;
    /** Scanned pages left for another run, beyond the most one run reads. */
    remaining?: number;
  }

  /** A sentence or two about a run, for the document's details. Null when there is nothing to add. */
  function describe(image: boolean, results: OcrPage[], found: number, outcome: Outcome): string | null {
    const parts: string[] = [];
    const read = results.length;
    const unreadable = results.filter((result) => result.skipped).length;
    const empty = read - found - unreadable;

    if (outcome.stopped === "failed") {
      parts.push(outcome.error || "OCR stopped unexpectedly.");
      if (!image && read > 0) parts.push(`${pages(read)} of ${outcome.total.toLocaleString("en")} had been read.`);
    } else if (outcome.stopped === "cancelled") {
      if (image || read === 0) parts.push("Reading the text was cancelled before anything was read.");
      else {
        parts.push(`Stopped after ${read.toLocaleString("en")} of ${pages(outcome.total)}. What was read so far is searchable.`);
      }
    }

    if (image) {
      if (!outcome.stopped && found === 0) parts.push("OCR found no text in this image.");
    } else if (read > 0 && unreadable === read) {
      parts.push(
        read === 1
          ? "The page has no picture that OCR could read."
          : `None of the ${pages(read)} has a picture that OCR could read. Text drawn as shapes rather than scanned cannot be read.`,
      );
    } else if (read > 0) {
      if (found === 0 && !outcome.stopped) parts.push("OCR found no text on the scanned pages.");
      else if (empty > 0) parts.push(`OCR found no text on ${empty.toLocaleString("en")} of the ${pages(read)} it read.`);
      if (unreadable > 0) parts.push(`${pages(unreadable)} had no picture that OCR could read.`);
    }
    if (outcome.remaining) {
      parts.push(
        `At most ${MAX_OCR_PAGES.toLocaleString("en")} scanned pages are read in one go, and ${pages(outcome.remaining)} ${outcome.remaining === 1 ? "is" : "are"} left. Read the remaining pages to continue.`,
      );
    }
    return parts.join(" ") || null;
  }

  /**
   * Makes the pages a run read part of the document: stored with its other text,
   * indexed for search, and counted. Also the end of a cancelled or failed run, whose
   * finished pages are kept. Returns how many pages gave text.
   */
  function finish(id: string, results: OcrPage[], outcome: Outcome): Promise<number> {
    return hooks.exclusive(id, async () => {
      const row = hooks.findRow(id);
      if (!row) {
        await extracted.clearOcrProgress(id);
        return 0;
      }
      const stored = await extracted.readAll(id);
      const own = stored.sections.filter((section) => !section.ocr);
      const ownPages = new Set(own.map((section) => section.page));
      const read = new Map<number, ExtractedSection>();
      for (const section of stored.sections) if (section.ocr) read.set(keyOf(section.page), section);
      const attempted = new Set(stored.ocrPages);

      let found = 0;
      const counted: OcrPage[] = [];
      for (const result of results) {
        // Text from the file itself always wins over a reading of its picture.
        if (result.page !== null && ownPages.has(result.page)) continue;
        counted.push(result);
        const key = keyOf(result.page);
        attempted.add(key);
        const text = tidyText(result.text);
        if (text) {
          // A scanned book's bookmarks still name the chapter of the page read.
          read.set(
            key,
            result.page === null
              ? { text, ocr: true }
              : withHeading({ text, ocr: true, page: result.page }, stored.pageHeadings[result.page]),
          );
          found += 1;
        } else {
          read.delete(key);
        }
      }

      const sections = [...own, ...read.values()].sort((a, b) => keyOf(a.page) - keyOf(b.page));
      const textChars = sections.reduce((total, section) => total + section.text.length, 0);
      await extracted.write(
        id,
        sections,
        [...attempted].sort((a, b) => a - b),
        stored.pageHeadings,
      );

      const patch: Partial<DocumentRow> = {
        textChars,
        ocrPages: attempted.size > 0 ? attempted.size : null,
        ocrDetail: describe(kindOf(row) === "image", counted, found, outcome),
        updatedAt: Date.now(),
      };
      // While the file's own text is being read again, its state is not OCR's to set.
      if (row.extraction === "done" || row.extraction === "unsupported") {
        patch.extraction = textChars > 0 ? "done" : "unsupported";
        // "This PDF has no text of its own" stops being the whole story once OCR has read some.
        if (textChars > 0 && row.extraction === "unsupported") patch.extractionDetail = null;
      }
      db.update(documents).set(patch).where(eq(documents.id, id)).run();
      await extracted.clearOcrProgress(id);

      const fresh = hooks.findRow(id);
      if (!fresh) {
        // Deleted while its text was being written.
        await extracted.remove(id);
        return 0;
      }
      hooks.index(fresh, sections);
      hooks.changed(id);
      return found;
    });
  }

  const active = (job: JobRow) => job.type === OCR_JOB && (job.state === "queued" || job.state === "running" || job.state === "paused");
  const jobsFor = (id: string) => ctx.jobs.findBySubject(hooks.subjectOf(id)).filter(active);

  ctx.jobs.register<OcrPayload>(OCR_JOB, {
    queue: OCR_QUEUE,

    async run({ payload, signal, progress }) {
      const id = payload.documentId;
      const row = hooks.findRow(id);
      if (!row) {
        await extracted.clearOcrProgress(id);
        return { skipped: "The document was removed before its scanned pages were read." };
      }
      const kind = kindOf(row);
      if (!kind) throw new PermanentJobError("OCR reads scanned PDFs and PNG, JPEG, GIF and WebP images only.", "unsupported");
      const { use, status } = await languages();
      if (!status.available) throw new PermanentJobError(status.reason ?? "OCR is not available.", "unsupported");

      let file: string;
      try {
        file = storage.resolve(row.locationId, row.relPath);
      } catch (error) {
        throw new PermanentJobError(`${messageOf(error)} The scanned pages can be read once it is reconnected.`, "storage_unavailable");
      }
      // By its own name: a link put in its place is not a file, and is not read.
      const stat = await fs.promises.lstat(file).catch(() => undefined);
      if (stat?.isSymbolicLink()) throw new PermanentJobError(replacedByLink().message, "conflict");
      if (!stat?.isFile()) {
        throw new PermanentJobError(
          `The file is missing from "${storage.get(row.locationId).name}" (${row.relPath}). If it was moved or deleted outside Outpost, put it back and try again.`,
          "not_found",
        );
      }
      if (kind === "pdf" && stat.size > MAX_PDF_BYTES) {
        const megabytes = Math.round(MAX_PDF_BYTES / (1024 * 1024));
        throw new PermanentJobError(`This PDF is larger than ${megabytes} MB, which is more than OCR will read.`, "too_large");
      }

      const wanted = pagesToRead(row, await extracted.readAll(id), payload.redo === true);
      const batch = wanted.slice(0, MAX_OCR_PAGES);
      const inBatch = new Set(batch);
      // Pages finished before a pause or a restart are not read twice.
      const done = new Map<number, OcrPage>();
      for (const page of await extracted.readOcrProgress(id)) if (inBatch.has(keyOf(page.page))) done.set(keyOf(page.page), page);
      const fromEarlier = done.size;
      const todo = batch.filter((page) => !done.has(page));
      const outcome: Outcome = { total: batch.length, remaining: wanted.length - batch.length };

      const report = () =>
        progress({
          current: done.size,
          total: batch.length,
          unit: kind === "image" ? null : "pages",
          message:
            kind === "image"
              ? "Reading the image"
              : `Reading scanned page ${Math.min(done.size + 1, batch.length).toLocaleString("en")} of ${batch.length.toLocaleString("en")}`,
        });

      let unsaved = 0;
      let savedAt = Date.now();
      let saving: Promise<void> = Promise.resolve();
      const save = () => {
        unsaved = 0;
        savedAt = Date.now();
        const snapshot = [...done.values()];
        saving = saving.then(() => extracted.writeOcrProgress(id, snapshot)).catch(() => undefined);
        return saving;
      };

      if (todo.length > 0) {
        report();
        try {
          await runOcr(
            { provider: DEFAULT_PROVIDER, languages: use, filePath: file, kind, pages: kind === "pdf" ? todo : [] },
            {
              signal,
              onProgress: report,
              onPage: (_index, page) => {
                done.set(keyOf(page.page), page);
                unsaved += 1;
                report();
                if (unsaved >= SAVE_EVERY_PAGES || Date.now() - savedAt >= SAVE_EVERY_MS) void save();
              },
            },
          );
        } catch (error) {
          // Whatever was finished is kept: for the next attempt, or to become the result.
          await save();
          if (signal.aborted) throw error;
          throw new PermanentJobError(error instanceof OcrFailure ? error.message : `OCR could not be run: ${messageOf(error)}`, "ocr");
        }
      }
      await saving;
      const found = await finish(id, [...done.values()], outcome);
      return { pagesRead: done.size, pagesWithText: found, pagesFromEarlier: fromEarlier, pagesLeft: outcome.remaining ?? 0 };
    },

    /** A run that was cancelled or failed still hands over the pages it finished. */
    async onSettled(job) {
      if (job.state === "succeeded") return;
      const id = (job.payload as OcrPayload).documentId;
      const results = await extracted.readOcrProgress(id);
      await finish(id, results, {
        stopped: job.state === "cancelled" ? "cancelled" : "failed",
        error: job.error,
        total: job.progressTotal ?? results.length,
      });
    },
  });

  const service: DocumentOcr = {
    status: async () => (await languages()).status,
    kindOf,

    async start(row, options = {}) {
      const kind = kindOf(row);
      if (!kind) {
        throw new AppError(
          "unsupported",
          `OCR reads scanned PDFs and PNG, JPEG, GIF and WebP images. "${row.title}" is ${formatForExt(row.ext)?.label ?? "another kind of file"}.`,
        );
      }
      const { status } = await languages();
      if (!status.available) throw new AppError("unsupported", status.reason ?? "OCR is not available.");

      const [underWay] = jobsFor(row.id);
      if (underWay) return underWay.state === "paused" ? ctx.jobs.resume(underWay.id) : underWay;

      if (row.extraction === "pending" || row.extraction === "running") {
        throw conflict("Outpost is still reading this document's own text. Try again when that has finished.");
      }
      if (kind === "pdf" && !row.pageCount) {
        throw conflict('Outpost has not been able to open this PDF, so its pages cannot be read by OCR. Choose "Read text again" first.');
      }
      // Fails now, with a clear message, rather than later in the background.
      storage.resolve(row.locationId, row.relPath);
      if (pagesToRead(row, await extracted.readAll(row.id), options.redo === true).length === 0) {
        throw conflict(
          options.redo
            ? "Every page of this document has text of its own, so there is nothing for OCR to read."
            : "OCR has already been run on every scanned page of this document.",
        );
      }

      db.update(documents).set({ ocrDetail: null, updatedAt: Date.now() }).where(eq(documents.id, row.id)).run();
      const payload: OcrPayload = { documentId: row.id, redo: options.redo === true };
      const job = ctx.jobs.enqueue(OCR_JOB, payload, {
        title: kind === "image" ? `Reading text from the image "${row.title}"` : `Reading scanned pages of "${row.title}"`,
        subject: hooks.subjectOf(row.id),
      });
      hooks.changed(row.id);
      return job;
    },

    async startIfAutomatic(row) {
      if (!settings.get("ocr.auto") || row.scanPages === 0 || !kindOf(row)) return;
      try {
        await service.start(row);
      } catch (error) {
        // Nothing left to read, or OCR is not available here: not worth a failed job.
        ctx.log.debug({ document: row.id, err: messageOf(error) }, "automatic OCR was not started");
      }
    },

    cancel(id) {
      for (const job of jobsFor(id)) ctx.jobs.cancel(job.id);
    },
  };
  return service;
}
