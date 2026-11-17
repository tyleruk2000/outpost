/**
 * Audiobooks in the library.
 *
 * A book of several files is a book in the sense of `modules/books`: a collection whose
 * folder holds the chapter files, one document per chapter, in order. What makes it an
 * audiobook is `meta.audiobook` on the collection: the author, the readers, each
 * chapter's running time, and, when the files were recognised as a LibriVox book, that
 * book's number, page and licence. No table of its own is needed.
 *
 * One audio file added through Library → Add documents stays an ordinary document of
 * type "audio", and is listed and played here as a book of one chapter.
 *
 * Adding is a background job: a zip is unpacked inside the storage location's own
 * incoming folder (with the import module's unpacker, which refuses names that climb
 * out of it, links, and archives built to fill a disk), the audio files in it are
 * taken in order into `collections/audiobooks/<title>/`, and everything else is left
 * out and listed. The staging folder is always removed afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  AudiobookAddResult,
  AudiobookChapterDto,
  AudiobookDto,
  AudiobookSummaryDto,
  DocumentDto,
  LibrivoxShelfResponse,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError, notFound } from "../../core/errors.ts";
import { pathExists, safeFileName } from "../../core/fs-safe.ts";
import { type JobRow, PermanentJobError } from "../../core/jobs.ts";
import type { CollectionRow } from "../collections/service.ts";
import { type AudioFacts, readAudioFacts } from "../documents/audio-tags.ts";
import { extensionOf, formatForExt, SNIFF_BYTES } from "../documents/file-types.ts";
import { INCOMING_DIR, readHead } from "../documents/staging.ts";
import { DEFAULT_EXTRACT_LIMITS, extractArchive, newBudget } from "../imports/extract.ts";
import { bookFacts, chapterTitle, describeBook, matchLibrivox, orderChapters } from "./assemble.ts";
import type { Received } from "./receive.ts";
import { BYTES_PER_SECOND, loadShelf, type Shelf } from "./shelf.ts";

export const ADD_JOB = "audiobook.add";
const MAX_CHAPTERS = 2000;
const STALE_STAGING_MS = 24 * 60 * 60 * 1000;

/** What `collections.meta.audiobook` holds. */
export interface AudiobookMeta {
  author: string | null;
  readers: string[];
  /** Running time of each chapter, by chapter key, where the file says. */
  seconds: Record<string, number>;
  librivoxId: string | null;
  sourceUrl: string | null;
  licenceNote: string | null;
  /** The zip it came from, when it came from one. */
  archiveName: string | null;
}

interface AddPayload extends Record<string, unknown> {
  locationId: string;
  staging: string;
  parts: Received["parts"];
  title?: string;
  librivoxId?: string;
}

export interface AudiobooksService {
  /** Queues the job that turns received files into a book. */
  add(received: Received): JobRow;
  list(query?: { q?: string; sort?: "added" | "title" }): AudiobookSummaryDto[];
  /** A book by its collection, or by any of its chapters; or one audio document on its own. */
  get(id: string): Promise<AudiobookDto>;
  shelf(): LibrivoxShelfResponse;
  isAudiobook(collection: Pick<CollectionRow, "meta">): boolean;
}

declare module "../../core/context.ts" {
  interface Services {
    audiobooks: AudiobooksService;
  }
}

export function audiobookMeta(collection: Pick<CollectionRow, "meta">): AudiobookMeta | undefined {
  const meta = collection.meta.audiobook;
  return typeof meta === "object" && meta !== null ? (meta as AudiobookMeta) : undefined;
}

const isAudio = (ext: string) => formatForExt(ext)?.type === "audio";

export function createAudiobooksService(ctx: AppContext): AudiobooksService {
  const { collections, documents, storage, books } = ctx.services;
  let shelf: Shelf | undefined;
  const loadedShelf = (): Shelf => {
    if (!shelf) {
      const loaded = loadShelf(ctx.config.catalogDir);
      for (const problem of loaded.problems) ctx.log.warn(problem);
      shelf = loaded.shelf;
    }
    return shelf;
  };

  const isAudiobook = (collection: Pick<CollectionRow, "meta">) => audiobookMeta(collection) !== undefined;
  const audiobookCollections = () => collections.list({ kind: "file" }).filter(isAudiobook);

  /** A free folder for a book: its title, then numbered. */
  async function freeFolder(locationId: string, title: string): Promise<string> {
    const base = safeFileName(title, "Audiobook").slice(0, 80).trim() || "Audiobook";
    for (let copy = 1; copy <= 50; copy += 1) {
      const relPath = `collections/audiobooks/${copy === 1 ? base : `${base} (${copy})`}`;
      if (!(await pathExists(storage.resolve(locationId, relPath)))) return relPath;
    }
    throw new PermanentJobError(`There are already many audiobooks called "${title}". Remove some of them and try again.`);
  }

  // ── Adding ──

  async function runAdd(payload: AddPayload, signal: AbortSignal, progress: (message: string) => void): Promise<AudiobookAddResult> {
    if (!storage.isAvailable(payload.locationId)) {
      throw new PermanentJobError(`"${storage.get(payload.locationId).name}" is not connected, so the audiobook could not be added.`);
    }
    const staging = storage.resolve(payload.locationId, payload.staging);
    let bookFolder: string | undefined;
    try {
      const leftOut: AudiobookAddResult["leftOut"] = [];
      let candidates: Array<{ name: string; file: string }>;
      const zip = payload.parts.find((part) => part.kind === "zip");
      if (zip) {
        progress(`Unpacking "${zip.name}"`);
        const unpacked = path.join(staging, "unpacked");
        await fs.promises.mkdir(unpacked);
        const limits = { ...DEFAULT_EXTRACT_LIMITS, maxEntries: 5000, maxFileBytes: ctx.config.maxUploadBytes };
        const result = await extractArchive(path.join(staging, zip.file), unpacked, {
          limits,
          budget: await newBudget(unpacked, limits),
          label: zip.name,
          signal,
        }).catch((error: unknown) => {
          throw error instanceof AppError ? new PermanentJobError(error.message, error.code) : error;
        });
        leftOut.push(...result.leftOut);
        candidates = result.written.map((name) => ({ name, file: path.join(unpacked, name) }));
      } else {
        candidates = payload.parts.map((part) => ({ name: part.name, file: path.join(staging, part.file) }));
      }

      // Only audio the library takes, and only when its first bytes agree with its name.
      const audio: Array<{ name: string; file: string; ext: string; facts: AudioFacts }> = [];
      for (const candidate of candidates) {
        const ext = extensionOf(candidate.name);
        const format = formatForExt(ext);
        if (format?.type !== "audio") {
          leftOut.push({ path: candidate.name, reason: "It is not an audio file." });
          continue;
        }
        const head = await readHead(candidate.file, SNIFF_BYTES);
        if (!format.matches(head, false)) {
          leftOut.push({ path: candidate.name, reason: `It is named like ${format.label}, but its contents are not one.` });
          continue;
        }
        audio.push({ ...candidate, ext, facts: await readAudioFacts(candidate.file, ext) });
      }
      const label = zip ? `"${zip.name}"` : "The files sent";
      if (audio.length === 0) {
        throw new PermanentJobError(
          `${label} held no audio files the library can keep (MP3, M4A, M4B, AAC, Ogg, Opus, FLAC or WAV), so nothing was added.`,
          "unsupported",
        );
      }
      if (audio.length > MAX_CHAPTERS)
        throw new PermanentJobError(`${label} held more than ${MAX_CHAPTERS} audio files, which is more than one book.`);

      const ordered = orderChapters(audio);
      const librivox = matchLibrivox(loadedShelf().books, {
        librivoxId: payload.librivoxId,
        archiveName: zip?.name,
        fileCount: ordered.length,
      });
      const facts = bookFacts(ordered, { typedTitle: payload.title, librivox, archiveName: zip?.name });

      progress(`Filing ${ordered.length} chapters`);
      const relPath = await freeFolder(payload.locationId, facts.title);
      bookFolder = storage.resolve(payload.locationId, relPath);
      await fs.promises.mkdir(path.dirname(bookFolder), { recursive: true });
      // Not recursive: the folder must be new, so nothing already there is written into.
      await fs.promises.mkdir(bookFolder);
      const width = Math.max(3, String(ordered.length).length);
      const chapters = [];
      const seconds: Record<string, number> = {};
      for (const [index, file] of ordered.entries()) {
        signal.throwIfAborted();
        const key = String(index + 1).padStart(width, "0");
        const base = safeFileName(path.posix.basename(file.name.replaceAll("\\", "/")), `chapter.${file.ext}`);
        const fileName = `${key} ${base.toLowerCase().endsWith(`.${file.ext}`) ? base : `${base}.${file.ext}`}`;
        await fs.promises.rename(file.file, path.join(bookFolder, fileName));
        if (file.facts.seconds) seconds[key] = Math.round(file.facts.seconds * 10) / 10;
        chapters.push({ key, number: String(index + 1), title: chapterTitle(file), section: "", fileName });
      }

      const shelfData = loadedShelf();
      const meta: AudiobookMeta = {
        author: facts.author,
        readers: facts.readers,
        seconds,
        librivoxId: librivox?.id ?? null,
        sourceUrl: librivox?.pageUrl ?? null,
        licenceNote: librivox ? shelfData.licenceNote : null,
        archiveName: zip?.name ?? null,
      };
      const source = librivox ? `LibriVox: ${librivox.pageUrl}` : zip ? `Added from "${zip.name}"` : "Added as audio files";
      const { collection, chapterCount } = await books.create({
        collection: {
          title: facts.title,
          locationId: payload.locationId,
          relPath,
          description: describeBook(facts),
          language: librivox?.language === "English" ? "en" : null,
          publisher: librivox ? "LibriVox" : null,
          license: librivox ? shelfData.licence : null,
          attribution: librivox
            ? `LibriVox recording${describeBook({ author: null, readers: facts.readers }) ? `. ${describeBook({ author: null, readers: facts.readers })}` : "."} librivox.org`
            : null,
          meta: { audiobook: meta, ...(librivox ? { homepage: librivox.pageUrl, licenseNote: shelfData.licenceNote } : {}) },
        },
        chapters,
        document: { author: facts.author, source, language: librivox?.language === "English" ? "en" : null },
      });
      bookFolder = undefined;
      return { collectionId: collection.id, title: collection.title, chapters: chapterCount, leftOut };
    } finally {
      // A book that was not recorded leaves no folder; the staging folder is always Outpost's own to remove.
      if (bookFolder) await fs.promises.rm(bookFolder, { recursive: true, force: true }).catch(() => undefined);
      await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  ctx.jobs.register<AddPayload>(ADD_JOB, {
    queue: "audiobooks",
    async run({ payload, signal, progress }) {
      const result = await runAdd(payload, signal, (message) => progress({ message }));
      return { ...result };
    },
  });

  /** Staging folders left by a restart in the middle of an add. */
  async function sweepStaging(): Promise<void> {
    const cutoff = Date.now() - STALE_STAGING_MS;
    for (const location of storage.list()) {
      if (location.status !== "available") continue;
      const dir = path.join(location.path, INCOMING_DIR);
      for (const name of await fs.promises.readdir(dir).catch(() => [] as string[])) {
        if (!name.startsWith("audiobook-")) continue;
        const stat = await fs.promises.stat(path.join(dir, name)).catch(() => undefined);
        if (stat?.isDirectory() && stat.mtimeMs < cutoff) await fs.promises.rm(path.join(dir, name), { recursive: true, force: true });
      }
    }
  }
  void sweepStaging().catch((error) => ctx.log.warn({ err: error }, "could not clean up unfinished audiobooks"));

  // ── Reading ──

  function chapterOf(document: DocumentDto, seconds: number | null): AudiobookChapterDto {
    return {
      documentId: document.id,
      title: document.title,
      fileUrl: document.fileUrl,
      mime: document.mime,
      ext: document.ext,
      sizeBytes: document.sizeBytes,
      seconds,
    };
  }

  const total = (values: Array<number | null>) =>
    values.length > 0 && values.every((value) => value !== null)
      ? Math.round(values.reduce<number>((sum, value) => sum + value!, 0))
      : null;

  function bookDto(collection: CollectionRow): AudiobookDto {
    const meta = audiobookMeta(collection)!;
    const contents = books.contents(collection.id);
    const chapters = contents.sections.flatMap((section) =>
      section.chapters.map((chapter) => chapterOf(documents.get(chapter.documentId), meta.seconds[chapter.key] ?? null)),
    );
    return {
      id: collection.id,
      kind: "book",
      collectionId: collection.id,
      title: collection.title,
      author: meta.author,
      readers: meta.readers,
      licence: collection.license,
      licenceNote: meta.licenceNote,
      sourceUrl: meta.sourceUrl,
      librivoxId: meta.librivoxId,
      totalSeconds: total(chapters.map((chapter) => chapter.seconds)),
      sizeBytes: collection.sizeBytes,
      chapters,
      locationAvailable: storage.isAvailable(collection.locationId),
      addedAt: collection.installedAt,
    };
  }

  /** Running times of single files, read once: a document's bytes never change. */
  const singleSeconds = new Map<string, number | null>();

  async function measure(document: DocumentDto): Promise<number | null> {
    if (singleSeconds.has(document.sha256)) return singleSeconds.get(document.sha256)!;
    let seconds: number | null = null;
    try {
      seconds = (await readAudioFacts(documents.absolutePath(document.id), document.ext)).seconds ?? null;
    } catch {
      return null; // its storage is away; ask again next time
    }
    if (singleSeconds.size > 500) singleSeconds.clear();
    singleSeconds.set(document.sha256, seconds);
    return seconds;
  }

  function singleDto(document: DocumentDto, seconds: number | null): AudiobookDto {
    return {
      id: document.id,
      kind: "single",
      collectionId: null,
      title: document.title,
      author: document.author,
      readers: [],
      licence: null,
      licenceNote: null,
      sourceUrl: null,
      librivoxId: null,
      totalSeconds: seconds === null ? null : Math.round(seconds),
      sizeBytes: document.sizeBytes,
      chapters: [chapterOf(document, seconds)],
      locationAvailable: document.locationAvailable,
      addedAt: document.createdAt,
    };
  }

  function singles(): DocumentDto[] {
    const found: DocumentDto[] = [];
    for (let offset = 0; offset < 2000; offset += 200) {
      const page = documents.list({ type: "audio", chapters: false, limit: 200, offset, sort: "added" }).documents;
      found.push(...page);
      if (page.length < 200) break;
    }
    return found;
  }

  return {
    isAudiobook,

    add(received) {
      const label = received.parts.length === 1 ? received.parts[0]!.name : `${received.parts.length} audio files`;
      return ctx.jobs.enqueue<AddPayload>(
        ADD_JOB,
        {
          locationId: received.locationId,
          staging: received.staging,
          parts: received.parts,
          ...(received.fields.title ? { title: received.fields.title } : {}),
          ...(received.fields.librivoxId ? { librivoxId: received.fields.librivoxId } : {}),
        },
        { title: `Adding the audiobook ${label}` },
      );
    },

    list(query = {}) {
      const items: AudiobookSummaryDto[] = [
        ...audiobookCollections().map((collection) => {
          const meta = audiobookMeta(collection)!;
          const count = Number((collection.meta.book as { chapters?: number } | undefined)?.chapters ?? 0);
          const known = Object.values(meta.seconds);
          return {
            id: collection.id,
            kind: "book" as const,
            title: collection.title,
            author: meta.author,
            readers: meta.readers,
            chapterCount: count,
            totalSeconds: known.length === count && count > 0 ? Math.round(known.reduce((sum, value) => sum + value, 0)) : null,
            sizeBytes: collection.sizeBytes,
            addedAt: collection.installedAt,
            url: `/library/collections/${collection.id}`,
          };
        }),
        ...singles().map((document) => ({
          id: document.id,
          kind: "single" as const,
          title: document.title,
          author: document.author,
          readers: [],
          chapterCount: 1,
          totalSeconds: singleSeconds.get(document.sha256) ?? null,
          sizeBytes: document.sizeBytes,
          addedAt: document.createdAt,
          url: `/library/documents/${document.id}`,
        })),
      ];
      const wanted = query.q?.trim().toLowerCase();
      const matching = wanted
        ? items.filter((item) => `${item.title}\n${item.author ?? ""}\n${item.readers.join("\n")}`.toLowerCase().includes(wanted))
        : items;
      return query.sort === "title"
        ? matching.sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true, sensitivity: "base" }))
        : matching.sort((a, b) => b.addedAt - a.addedAt);
    },

    async get(id) {
      const collection = collections.get(id);
      if (collection) {
        if (!isAudiobook(collection)) throw notFound("Audiobook");
        return bookDto(collection);
      }
      let document: DocumentDto;
      try {
        document = documents.get(id);
      } catch {
        throw notFound("Audiobook");
      }
      if (!isAudio(document.ext)) throw notFound("Audiobook");
      const book = document.book ? collections.get(document.book.collectionId) : undefined;
      if (book && isAudiobook(book)) return bookDto(book);
      return singleDto(document, document.locationAvailable ? await measure(document) : null);
    },

    shelf() {
      const data = loadedShelf();
      const held = new Map<string, CollectionRow>();
      for (const collection of audiobookCollections()) {
        const librivoxId = audiobookMeta(collection)?.librivoxId;
        if (librivoxId) held.set(librivoxId, collection);
      }
      return {
        checked: data.checked,
        licence: data.licence,
        licenceNote: data.licenceNote,
        books: data.books.map((book) => {
          const owned = held.get(book.id);
          return {
            ...book,
            approxBytes: book.totalSeconds * BYTES_PER_SECOND,
            inLibrary: owned ? { id: owned.id, url: `/library/collections/${owned.id}` } : null,
          };
        }),
      };
    },
  };
}
