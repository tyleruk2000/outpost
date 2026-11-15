/** Queries and actions for the notes workspace. Every key starts with "notes" so live updates reach it. */
import type {
  AttachmentResponse,
  CreateNoteBody,
  MoveNoteBody,
  NoteDeletedResponse,
  NoteListResponse,
  NoteLookupResponse,
  NoteMoveResponse,
  NoteRef,
  NoteResponse,
  NoteSaveResponse,
  NoteTemplatesResponse,
  NoteTrashedResponse,
  NoteTrashResponse,
  NoteTreeItem,
  NoteTreeResponse,
  UpdateNoteBody,
} from "@outpost/shared";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api, errorMessage, uploadWithProgress } from "@/lib/api";
import { buildTreeIndex, placeOf, type TreeIndex } from "./tree-model";

export const noteKeys = {
  all: ["notes"] as const,
  tree: ["notes", "tree"] as const,
  detail: (id: string) => ["notes", "detail", id] as const,
  recent: ["notes", "recent"] as const,
  trash: ["notes", "trash"] as const,
  templates: ["notes", "templates"] as const,
  lookup: (query: string) => ["notes", "lookup", query] as const,
};

export const displayTitle = (title: string | null | undefined): string => title?.trim() || "Untitled";

// One index per tree response, shared by every component that reads the tree.
const indexes = new WeakMap<NoteTreeResponse, TreeIndex>();
function indexOf(data: NoteTreeResponse): TreeIndex {
  let index = indexes.get(data);
  if (!index) {
    index = buildTreeIndex(data.notes);
    indexes.set(data, index);
  }
  return index;
}

const fetchTree = () => api.get<NoteTreeResponse>("/api/notes/tree");

export const useNoteTree = () => useQuery({ queryKey: noteKeys.tree, queryFn: fetchTree, select: indexOf });

/**
 * The current title and icon of one page, for links to it. `missing` is true once the
 * tree is known and the page is not in it (trashed, deleted, or turned into a template).
 */
export function usePageRef(id: string): { page: NoteTreeItem | undefined; missing: boolean } {
  const { data, isSuccess } = useQuery({
    queryKey: noteKeys.tree,
    queryFn: fetchTree,
    select: (tree) => indexOf(tree).byId.get(id) ?? null,
  });
  return { page: data ?? undefined, missing: isSuccess && data === null };
}

export const useRecentNotes = (limit = 12) =>
  useQuery({
    queryKey: [...noteKeys.recent, limit],
    queryFn: () => api.get<NoteListResponse>("/api/notes/recent", { limit }),
    select: (data) => data.notes,
  });

export const useTrash = () =>
  useQuery({ queryKey: noteKeys.trash, queryFn: () => api.get<NoteTrashResponse>("/api/notes/trash"), select: (data) => data.notes });

export const useTemplates = () =>
  useQuery({
    queryKey: noteKeys.templates,
    queryFn: () => api.get<NoteTemplatesResponse>("/api/notes/templates"),
    select: (data) => data.templates,
  });

export const lookupNotes = (query: string, signal?: AbortSignal) =>
  api.get<NoteLookupResponse>("/api/notes/lookup", { q: query, limit: 8 }, signal).then((data) => data.notes);

export const exportUrl = (id: string) => `/api/notes/${id}/export.md`;
export const EXPORT_ALL_URL = "/api/notes/export.zip";

export const saveNote = (id: string, body: UpdateNoteBody) => api.patch<NoteSaveResponse>(`/api/notes/${id}`, body);

export function uploadAttachment(file: File, noteId: string, onProgress: (fraction: number) => void = () => {}, signal?: AbortSignal) {
  const form = new FormData();
  // The field goes first so the server knows the page before the file arrives.
  form.set("noteId", noteId);
  form.set("file", file, file.name);
  return uploadWithProgress<AttachmentResponse>("/api/attachments", form, onProgress, signal).then((data) => data.attachment);
}

function patchTreeItem(client: QueryClient, id: string, patch: Partial<NoteTreeItem>): void {
  client.setQueryData<NoteTreeResponse>(noteKeys.tree, (tree) =>
    tree ? { notes: tree.notes.map((item) => (item.id === id ? { ...item, ...patch } : item)) } : tree,
  );
}

/** Shows a saved title or icon in the tree straight away, before the server's event arrives. */
export function reflectInTree(client: QueryClient, id: string, patch: Pick<Partial<NoteTreeItem>, "title" | "icon" | "isFavorite">): void {
  patchTreeItem(client, id, patch);
}

export interface NoteActions {
  create(body?: CreateNoteBody, options?: { open?: boolean }): Promise<NoteRef | undefined>;
  setFavorite(page: NoteRef, isFavorite: boolean): Promise<void>;
  duplicate(page: NoteRef): Promise<void>;
  move(id: string, target: MoveNoteBody): Promise<boolean>;
  /** Moves a page and says so, with an "Undo" that puts it back. `index` is the tree before the move. */
  moveWithUndo(index: TreeIndex, id: string, target: MoveNoteBody): Promise<boolean>;
  trash(page: NoteRef, options?: { openId?: string }): Promise<void>;
  restore(page: NoteRef): Promise<boolean>;
  deleteForGood(page: NoteRef): Promise<boolean>;
}

/** The things that can be done to a page from the tree, the page menu and the lists. */
export function useNoteActions(): NoteActions {
  const client = useQueryClient();
  const navigate = useNavigate();

  return useMemo<NoteActions>(() => {
    const refresh = () => client.invalidateQueries({ queryKey: noteKeys.all });
    const fail = (error: unknown) => {
      toast.error(errorMessage(error));
    };

    const restore = async (page: NoteRef) => {
      try {
        await api.post<NoteResponse>(`/api/notes/${page.id}/restore`);
        await refresh();
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    };

    const move = async (id: string, target: MoveNoteBody) => {
      try {
        const { note } = await api.post<NoteMoveResponse>(`/api/notes/${id}/move`, target);
        patchTreeItem(client, id, note);
        void refresh();
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    };

    return {
      async create(body = {}, { open = true } = {}) {
        try {
          const { note } = await api.post<NoteResponse>("/api/notes", body);
          client.setQueryData(noteKeys.detail(note.id), { note });
          void refresh();
          if (open) navigate(`/notes/${note.id}`);
          return note;
        } catch (error) {
          fail(error);
          return undefined;
        }
      },

      async setFavorite(page, isFavorite) {
        patchTreeItem(client, page.id, { isFavorite });
        client.setQueryData<NoteResponse>(noteKeys.detail(page.id), (data) => (data ? { note: { ...data.note, isFavorite } } : data));
        try {
          await saveNote(page.id, { isFavorite });
        } catch (error) {
          fail(error);
        }
        await refresh();
      },

      async duplicate(page) {
        try {
          const { note } = await api.post<NoteResponse>(`/api/notes/${page.id}/duplicate`, { withChildren: true });
          await refresh();
          navigate(`/notes/${note.id}`);
        } catch (error) {
          fail(error);
        }
      },

      move,

      async moveWithUndo(index, id, target) {
        const page = index.byId.get(id);
        const back = placeOf(index, id);
        if (!(await move(id, target))) return false;
        if (!page || !back) return true;
        const title = displayTitle(page.title);
        const message =
          back.parentId === target.parentId
            ? `Moved “${title}”.`
            : target.parentId === null
              ? `Moved “${title}” to the top level.`
              : `Moved “${title}” into “${displayTitle(index.byId.get(target.parentId)?.title)}”.`;
        toast(message, { action: { label: "Undo", onClick: () => void move(id, back) } });
        return true;
      },

      async trash(page, { openId } = {}) {
        try {
          const { trashed } = await api.delete<NoteTrashedResponse>(`/api/notes/${page.id}`);
          // Leave a page that just went to the trash, whether it is this one or one above it.
          if (openId && trashed.includes(openId)) navigate("/notes");
          await refresh();
          const others = trashed.length - 1;
          toast(
            `Moved “${displayTitle(page.title)}” to the trash${others > 0 ? ` with ${others} sub-page${others === 1 ? "" : "s"}` : ""}.`,
            {
              action: { label: "Undo", onClick: () => void restore(page) },
            },
          );
        } catch (error) {
          fail(error);
        }
      },

      restore,

      async deleteForGood(page) {
        try {
          await api.delete<NoteDeletedResponse>(`/api/notes/${page.id}`, { permanent: 1 });
          await refresh();
          return true;
        } catch (error) {
          fail(error);
          return false;
        }
      },
    };
  }, [client, navigate]);
}
