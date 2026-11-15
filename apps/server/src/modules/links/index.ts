/**
 * Saving a file that a reference page links to.
 *
 * A reference archive is a copy of a web site, but not of everything the site links to:
 * a page in it may point at PDFs that were never packed into the archive. Reading such
 * a link needs the internet. This module lets a person fetch the file while they have a
 * connection, so that it is in their document library afterwards: stored on their disk,
 * searchable to the page, and readable offline.
 *
 * It only ever acts on an address a person chose to save. The address must be a plain
 * web address of a kind of file the library keeps, the fetch goes through the download
 * manager (so it shows on the Downloads screen, obeys the speed limit, and can be
 * paused), and every connection it makes must land on a public address: it cannot be
 * pointed at this machine or the home network.
 */
import fs from "node:fs";
import path from "node:path";
import { inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { safeFileName } from "../../core/fs-safe.ts";
import { isPublicAddress } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { documents as documentsTable } from "../../db/schema.ts";
import { extensionOf, formatForExt } from "../documents/file-types.ts";
import type { DownloadRow } from "../downloads/types.ts";

/** Where a fetched file waits, inside a storage location, until the library takes it. */
const SAVED_DIR = "documents/saved";
/** The most links one request may ask for: a page's worth, not a site's. */
export const MAX_LINKS = 200;
const KEPT = "PDF, EPUB, Markdown, plain text and images";
const ACTIVE = new Set(["queued", "running", "verifying", "paused"]);

const text = (max: number) => z.string().trim().max(max);
const saveBody = z.object({
  url: z.string().max(2000),
  title: text(300).optional(),
  /** The collection the link was found in, for the document's description. */
  foundIn: text(300).optional(),
  locationId: z.string().min(1).max(64).optional(),
});
const saveAllBody = z.object({
  links: z
    .array(z.object({ url: z.string().max(2000), title: text(300).optional() }))
    .min(1)
    .max(MAX_LINKS, `Save at most ${MAX_LINKS} links at a time.`),
  foundIn: text(300).optional(),
  locationId: z.string().min(1).max(64).optional(),
});
const checkBody = z.object({ urls: z.array(z.string().max(2000)).max(500) });

interface Link {
  url: string;
  host: string;
  fileName: string;
}

/** The address as a link Outpost is willing to fetch, or the reason it is not. */
export function parseLink(raw: string, options: { allowPrivate: boolean }): Link {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest("That is not a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw badRequest("Only links that start with http:// or https:// can be saved.");
  if (url.username || url.password) throw badRequest("A link that carries a user name or password cannot be saved.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw badRequest("That is not a web address.");

  let last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    last = decodeURIComponent(last);
  } catch {
    // Not valid percent-encoding; the raw segment will do.
  }
  const fileName = safeFileName(last, "");
  const format = fileName ? formatForExt(extensionOf(fileName)) : undefined;
  // A web page is not offered: saved alone, without its pictures and styles, it is rarely what was wanted.
  if (!format || format.type === "html") {
    throw badRequest(`Outpost can save links to files it can keep (${KEPT}). This link does not end in one of those.`);
  }

  // A name is checked when it is looked up, on every connection. An address written out
  // in the link can be refused straight away.
  const literal = /^[\d.]+$/.test(host) || host.includes(":");
  if (!options.allowPrivate && (host === "localhost" || host.endsWith(".localhost") || (literal && !isPublicAddress(host)))) {
    throw new AppError("forbidden", "That link points at this computer or your own network, which Outpost does not fetch from.");
  }
  url.hash = "";
  return { url: url.toString(), host, fileName };
}

export async function registerLinks(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { documents, downloads, storage } = ctx.services;
  const allowPrivate = ctx.config.allowPrivateDownloads;

  const savedAs = (urls: string[]): Map<string, string> => {
    if (urls.length === 0) return new Map();
    const rows = ctx.db
      .select({ id: documentsTable.id, source: documentsTable.source })
      .from(documentsTable)
      .where(inArray(documentsTable.source, urls))
      .all();
    return new Map(rows.map((row) => [row.source!, row.id]));
  };
  const underWay = (): Map<string, DownloadRow> =>
    new Map(
      downloads
        .list()
        .filter((row) => row.kind === "document" && ACTIVE.has(row.state))
        .map((row) => [row.url, row]),
    );

  async function start(link: Link, options: { title?: string; foundIn?: string; locationId?: string }): Promise<DownloadRow> {
    const title = options.title || path.parse(link.fileName).name;
    return downloads.start({
      kind: "document",
      title,
      url: link.url,
      locationId: options.locationId ?? storage.getDefault().id,
      // One folder for everything on its way in; the id keeps two files of the same name apart.
      relPath: `${SAVED_DIR}/${newId()}-${link.fileName}`,
      allowedHosts: [link.host],
      meta: { title: options.title, foundIn: options.foundIn, fileName: link.fileName },
    });
  }

  // A fetched file becomes a document. Nothing is recorded as a collection.
  downloads.registerInstaller("document", async ({ download, filePath }) => {
    const meta = download.meta as { title?: string; foundIn?: string; fileName?: string };
    const folder = path.dirname(filePath);
    try {
      const outcome = await documents.ingestFile({
        sourcePath: filePath,
        originalName: meta.fileName ?? path.basename(filePath),
        title: meta.title,
        locationId: download.locationId,
        move: true,
      });
      if (outcome.status === "created") {
        await documents.update(outcome.document.id, {
          source: download.url,
          ...(meta.foundIn ? { description: `Saved from a link in ${meta.foundIn}.` } : {}),
        });
      } else {
        // The library already holds this exact file. The copy just fetched is not needed.
        await fs.promises.rm(filePath, { force: true });
      }
      return { meta: { documentId: outcome.document.id, alreadyInLibrary: outcome.status === "duplicate" } };
    } catch (error) {
      // What arrived is not something the library keeps (a sign-in page named .pdf, say).
      // Trying again would fetch the same thing, so it is removed and not retried.
      await fs.promises.rm(filePath, { force: true });
      if (error instanceof AppError) throw new PermanentJobError(error.message, error.code);
      throw error;
    } finally {
      // The folder is only somewhere to fetch into; it goes when nothing else is on its way.
      await fs.promises.rmdir(folder).catch(() => undefined);
    }
  });

  app.post("/api/links/save", async (request) => {
    const input = saveBody.parse(request.body);
    const link = parseLink(input.url, { allowPrivate });
    const documentId = savedAs([link.url]).get(link.url);
    if (documentId) return { already: "saved", document: documents.get(documentId) };
    const running = underWay().get(link.url);
    if (running) return { already: "saving", download: downloads.toDto(running) };
    return { download: downloads.toDto(await start(link, input)) };
  });

  app.post("/api/links/save-all", async (request) => {
    const input = saveAllBody.parse(request.body);
    const refused: Array<{ url: string; reason: string }> = [];
    const wanted = new Map<string, { link: Link; title?: string }>();
    for (const item of input.links) {
      try {
        const link = parseLink(item.url, { allowPrivate });
        if (!wanted.has(link.url)) wanted.set(link.url, { link, title: item.title });
      } catch (error) {
        refused.push({ url: item.url, reason: (error as Error).message });
      }
    }
    const saved = savedAs([...wanted.keys()]);
    const running = underWay();
    const queued = [];
    let already = 0;
    for (const [url, { link, title }] of wanted) {
      if (saved.has(url) || running.has(url)) {
        already += 1;
        continue;
      }
      queued.push(downloads.toDto(await start(link, { title, foundIn: input.foundIn, locationId: input.locationId })));
    }
    return { queued, already, refused };
  });

  // Which of these links are already in the library, or on their way.
  app.post("/api/links/check", async (request) => {
    const { urls } = checkBody.parse(request.body);
    const normal = urls.map((raw) => {
      try {
        return parseLink(raw, { allowPrivate }).url;
      } catch {
        return undefined;
      }
    });
    const saved = savedAs(normal.filter((url): url is string => url !== undefined));
    const running = underWay();
    return {
      links: urls.map((raw, index) => {
        const url = normal[index];
        if (!url) return { url: raw, state: "unsupported" as const };
        const documentId = saved.get(url);
        if (documentId) return { url: raw, state: "saved" as const, documentId };
        const download = running.get(url);
        if (download) return { url: raw, state: "saving" as const, downloadId: download.id };
        return { url: raw, state: "new" as const };
      }),
    };
  });
}
