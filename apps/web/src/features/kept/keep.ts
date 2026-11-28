/**
 * Keeping pages, routes and saved places on this phone, and bringing the kept copies
 * up to date when the server is in reach.
 *
 * A kept copy is only ever read. Nothing changed on the phone is sent back from it, so
 * a stale copy can never overwrite what is on the server: the copy is replaced by the
 * server's version, never the other way round. The one exception is an emergency
 * plan's ticks, which are sent as a list of what was done, for the server to apply by
 * its own rule (`plan-copy.ts`), never as a copy.
 */
import type {
  MarkerDto,
  MedicalSheetsResponse,
  NoteDetail,
  NoteNodeJson,
  NoteResponse,
  NoteTreeResponse,
  TrackDto,
  TrackWithGeometryDto,
} from "@outpost/shared";
import { FIRST_HOUSEHOLD_ID } from "@outpost/shared";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { DEVICE } from "./device";
import { refreshPlan } from "./plan-copy";
import {
  getKept,
  type KeptMedical,
  type KeptNote,
  type KeptPage,
  type KeptPlaces,
  type KeptTrack,
  listKept,
  openKept,
  putKept,
  putKeptBytes,
  putKeptJson,
} from "./store";

/** A page is kept with the pages inside it. Past this many, keep the parts that matter one by one. */
export const MAX_KEPT_PAGES = 300;
/** A picture or attached file larger than this is left on the server and counted as left out. */
export const MAX_KEPT_FILE_BYTES = 50 * 1024 * 1024;

export const notePath = (id: string) => `/api/notes/${id}`;
export const trackPath = (id: string) => `/api/maps/tracks/${id}`;
export const MARKERS_PATH = "/api/maps/markers";
export const PLACES_ID = "all";

const ATTACHMENT = /^\/api\/attachments\/[^/?#]+$/;

/** Every picture and attached file a page shows or links to, as addresses on this server. */
export function attachmentsOf(note: Pick<NoteDetail, "content" | "coverUrl">): string[] {
  const found = new Set<string>();
  const consider = (value: unknown) => {
    if (typeof value === "string" && ATTACHMENT.test(value)) found.add(value);
  };
  consider(note.coverUrl);
  const walk = (node: NoteNodeJson) => {
    consider(node.attrs?.src);
    for (const mark of node.marks ?? []) consider(mark.attrs?.href);
    for (const child of node.content ?? []) walk(child);
  };
  walk(note.content as unknown as NoteNodeJson);
  return [...found];
}

/**
 * The headers a kept file is filed with. The server sends uploads with a sandbox, so that an uploaded
 * HTML or SVG file can never run script in Outpost's origin; the kept copy carries the same headers.
 */
function guardedHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream" };
  for (const name of ["Content-Security-Policy", "X-Content-Type-Options", "Content-Disposition"]) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

type Tree = NoteTreeResponse["notes"];

/** The pages inside `rootId`, from the flat tree the sidebar uses. */
function descendants(tree: Tree, rootId: string): Tree {
  const byParent = new Map<string | null, Tree>();
  for (const item of tree) byParent.set(item.parentId, [...(byParent.get(item.parentId) ?? []), item]);
  const found: Tree = [];
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    for (const child of byParent.get(queue[index]!) ?? []) {
      found.push(child);
      queue.push(child.id);
    }
  }
  return found;
}

const tooMany = () =>
  new Error(
    `This page has more than ${MAX_KEPT_PAGES} pages inside it, which is more than can be kept as one. Keep the sub-pages you need one at a time.`,
  );

/** The page and every page inside it, asked of the server one by one. */
async function loadPages(rootId: string): Promise<NoteDetail[]> {
  const root = (await api.get<NoteResponse>(notePath(rootId))).note;
  if (root.trashedAt !== null) throw new Error("This page is in the trash. Restore it first, then keep it.");
  const pages = [root];
  const seen = new Set([root.id]);
  // Breadth first, so the pages nearest the one that was chosen come first.
  for (let index = 0; index < pages.length; index += 1) {
    for (const child of pages[index]!.children) {
      if (seen.has(child.id)) continue;
      if (pages.length >= MAX_KEPT_PAGES) throw tooMany();
      seen.add(child.id);
      pages.push((await api.get<NoteResponse>(notePath(child.id))).note);
    }
  }
  return pages;
}

/**
 * The same, for a copy that exists already: the tree says which pages there are and
 * when each last changed, so only the pages that differ from the copy are asked for.
 */
async function loadChangedPages(rootId: string, tree: Tree, cache: Cache): Promise<NoteDetail[]> {
  const root = tree.find((item) => item.id === rootId);
  if (!root) return loadPages(rootId);
  const items = [root, ...descendants(tree, rootId)];
  if (items.length > MAX_KEPT_PAGES) throw tooMany();
  const pages: NoteDetail[] = [];
  for (const item of items) {
    const copy = await cache.match(notePath(item.id));
    const kept = copy ? ((await copy.json()) as NoteResponse).note : undefined;
    // A page's own date does not move when a page inside it is added, renamed or taken away, so its list is compared too.
    const inside = tree.filter((child) => child.parentId === item.id);
    const sameInside =
      kept?.children.length === inside.length &&
      kept.children.every((child) => inside.some((now) => now.id === child.id && now.title === child.title && now.icon === child.icon));
    pages.push(kept && kept.updatedAt === item.updatedAt && sameInside ? kept : (await api.get<NoteResponse>(notePath(item.id))).note);
  }
  return pages;
}

/**
 * Keeps a page, every page inside it, and the pictures and files they hold. Called
 * again for a page that is already kept, it replaces the copy with the server's; with
 * the `tree`, only what changed is fetched.
 */
export async function keepNote(id: string, tree?: Tree): Promise<KeptNote> {
  const before = await getKept("note", id);
  const cache = await openKept("note", id);
  const pages = tree && before ? await loadChangedPages(id, tree, cache) : await loadPages(id);
  const wanted = new Set<string>();
  let bytes = 0;
  let files = 0;
  let skipped = 0;

  for (const page of pages) {
    wanted.add(notePath(page.id));
    bytes += await putKeptJson(cache, notePath(page.id), { note: page } satisfies NoteResponse);
    for (const address of attachmentsOf(page)) {
      if (wanted.has(address)) continue;
      // A file never changes under its address, so one that is here already is not fetched again.
      const have = await cache.match(address);
      if (have) {
        wanted.add(address);
        files += 1;
        bytes += (await have.blob()).size;
        continue;
      }
      const response = await fetch(address, { credentials: "same-origin" });
      // A picture that is already missing on the server is missing in the copy too; the page says so where it would be.
      if (!response.ok) continue;
      if (Number(response.headers.get("Content-Length") ?? 0) > MAX_KEPT_FILE_BYTES) {
        skipped += 1;
        await response.body?.cancel();
        continue;
      }
      const body = await response.blob();
      if (body.size > MAX_KEPT_FILE_BYTES) {
        skipped += 1;
        continue;
      }
      wanted.add(address);
      files += 1;
      bytes += await putKeptBytes(cache, address, body, guardedHeaders(response));
    }
  }
  // A sub-page moved away or a picture taken out since the last copy: its kept answer goes too.
  for (const request of await cache.keys()) {
    if (!wanted.has(new URL(request.url).pathname)) await cache.delete(request);
  }

  const root = pages[0]!;
  const now = Date.now();
  const item: KeptNote = {
    kind: "note",
    id,
    title: root.title,
    icon: root.icon,
    pages: pages.map((page): KeptPage => ({ id: page.id, title: page.title, icon: page.icon, updatedAt: page.updatedAt })),
    files,
    skipped,
    bytes,
    keptAt: before?.keptAt ?? now,
    refreshedAt: now,
  };
  await putKept(item);
  return item;
}

export async function keepTrack(id: string): Promise<KeptTrack> {
  const before = await getKept("track", id);
  const { track } = await api.get<{ track: TrackWithGeometryDto }>(trackPath(id));
  const cache = await openKept("track", id);
  const bytes = await putKeptJson(cache, trackPath(id), { track });
  const now = Date.now();
  const item: KeptTrack = {
    kind: "track",
    id,
    title: track.name,
    color: track.color,
    distanceMeters: track.distanceMeters,
    bounds: track.bounds,
    updatedAt: track.updatedAt,
    bytes,
    keptAt: before?.keptAt ?? now,
    refreshedAt: now,
  };
  await putKept(item);
  return item;
}

export async function keepPlaces(): Promise<KeptPlaces> {
  const before = await getKept("places", PLACES_ID);
  const answer = await api.get<{ markers: MarkerDto[] }>(MARKERS_PATH);
  const cache = await openKept("places", PLACES_ID);
  const bytes = await putKeptJson(cache, MARKERS_PATH, answer);
  const now = Date.now();
  const item: KeptPlaces = {
    kind: "places",
    id: PLACES_ID,
    title: "Saved places",
    count: answer.markers.length,
    bytes,
    keptAt: before?.keptAt ?? now,
    refreshedAt: now,
  };
  await putKept(item);
  return item;
}

/** The first household's id: a copy kept before there were copies per household is under it. */
export const MEDICAL_ID = FIRST_HOUSEHOLD_ID;
export const MEDICAL_PATH = "/api/medical-sheets";

/**
 * Keeps a household's medical sheets on this phone as they are on the server: a locked one
 * stays locked. Each household's copy is its own, kept under the household's id, so that
 * keeping another household's sheets never replaces one kept before. Left out, `householdId`
 * is the current household; with several households the copy says whose they are.
 */
export async function keepMedical(householdId?: string): Promise<KeptMedical> {
  const answer = await api.get<MedicalSheetsResponse>(
    householdId === undefined ? MEDICAL_PATH : `${MEDICAL_PATH}?household=${encodeURIComponent(householdId)}`,
  );
  const id = answer.household?.id ?? householdId ?? MEDICAL_ID;
  const before = await getKept("medical", id);
  const cache = await openKept("medical", id);
  const householdName = answer.household?.several ? answer.household.name : null;
  const bytes = await putKeptJson(cache, MEDICAL_PATH, { sheets: answer.sheets, householdName });
  const now = Date.now();
  const item: KeptMedical = {
    kind: "medical",
    id,
    title: householdName ? `Medical sheets for ${householdName}` : "Medical sheets",
    householdName,
    count: answer.sheets.length,
    locked: answer.sheets.filter((sheet) => sheet.encrypted).length,
    bytes,
    keptAt: before?.keptAt ?? now,
    refreshedAt: now,
  };
  await putKept(item);
  return item;
}

const isGone = (error: unknown) => error instanceof ApiError && error.status === 404;

async function refreshNote(item: KeptNote, tree: Tree): Promise<boolean> {
  const inTree = tree.find((entry) => entry.id === item.id);
  if (!inTree) {
    // Not among the pages: a template, in the trash, or deleted. Ask for the page itself.
    try {
      const { note } = await api.get<NoteResponse>(notePath(item.id));
      if (note.trashedAt !== null) throw new ApiError(404, "not_found", "In the trash.");
      if (!item.gone && note.updatedAt === item.pages[0]?.updatedAt) return false;
      await keepNote(item.id);
      return true;
    } catch (error) {
      if (!isGone(error)) throw error;
      if (!item.gone) await putKept({ ...item, gone: true });
      return !item.gone;
    }
  }
  const current = [inTree, ...descendants(tree, item.id)];
  const kept = new Map(item.pages.map((page) => [page.id, page]));
  const same =
    !item.gone &&
    current.length === kept.size &&
    current.every((page) => {
      const copy = kept.get(page.id);
      return copy?.updatedAt === page.updatedAt && copy.title === page.title && copy.icon === page.icon;
    });
  if (same) return false;
  await keepNote(item.id, tree);
  return true;
}

let refreshing: Promise<number> | undefined;

/**
 * Brings every kept page, route and set of places up to date with the server. Only
 * what has changed is fetched again; what has not is marked as checked, so the date
 * on a copy is the last time it was known to match the server. Map areas are not fetched again from here: they
 * are large, so that is a button a person presses (see `area.ts`). Resolves with the
 * number of things that were replaced.
 */
export function refreshKept(): Promise<number> {
  refreshing ??= (async () => {
    const items = await listKept();
    let replaced = 0;
    const notes = items.filter((item) => item.kind === "note");
    if (notes.length > 0) {
      const tree = (await api.get<NoteTreeResponse>("/api/notes/tree")).notes;
      for (const item of notes) {
        try {
          if (await refreshNote(item, tree)) replaced += 1;
          else if (!item.gone) await putKept({ ...item, refreshedAt: Date.now() });
        } catch (error) {
          // The server going away ends the round. Anything else (a page that has outgrown what can be
          // kept as one, say) is this page's trouble alone: its copy stays as it was, with its old date.
          if (error instanceof ApiError && error.isUnreachable) throw error;
        }
      }
    }
    const tracks = items.filter((item) => item.kind === "track");
    if (tracks.length > 0) {
      const current = (await api.get<{ tracks: TrackDto[] }>("/api/maps/tracks")).tracks;
      for (const item of tracks) {
        const now = current.find((track) => track.id === item.id);
        if (!now) {
          if (!item.gone) {
            await putKept({ ...item, gone: true });
            replaced += 1;
          }
        } else if (item.gone || now.updatedAt !== item.updatedAt) {
          await keepTrack(item.id);
          replaced += 1;
        } else {
          await putKept({ ...item, refreshedAt: Date.now() });
        }
      }
    }
    for (const item of items) {
      if (item.kind !== "plan") continue;
      try {
        const sent = await refreshPlan(item);
        if (sent) replaced += 1;
        if (sent)
          toast(
            `Ticks made on this ${DEVICE} for “${sent.title}” were sent to the server${sent.dropped > 0 ? `; ${sent.dropped} of them no longer applied (the plan had been reset or changed meanwhile) and were left out` : ""}.`,
          );
      } catch (error) {
        if (error instanceof ApiError && error.isUnreachable) throw error;
      }
    }
    if (items.some((item) => item.kind === "places")) {
      // Small, and with no date of its own to compare: fetched each time.
      await keepPlaces();
    }
    for (const item of items) {
      if (item.kind !== "medical") continue;
      try {
        // Each household's copy from its own household, whichever is current now.
        await keepMedical(item.id);
      } catch (error) {
        // A household removed at home: its copy stays as it was.
        if (!isGone(error)) throw error;
      }
    }
    return replaced;
  })().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}
