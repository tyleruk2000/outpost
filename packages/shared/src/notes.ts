/**
 * The notes workspace: the content model of a page and the shapes the notes API
 * returns. The content model is a contract between the server (which validates,
 * indexes, imports and exports it) and the editor (which produces it), so a node type
 * or attribute added on one side has to be added here first.
 *
 * A page's content is a ProseMirror/Tiptap JSON document.
 */

// ── Content model ───────────────────────────────────────────────────────────

export const NOTE_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "image",
  "callout",
  "documentEmbed",
  "details",
  "detailsSummary",
  "detailsContent",
] as const;

export const NOTE_INLINE_TYPES = ["text", "hardBreak", "pageLink"] as const;

/** Every node type a page may contain, including the root. */
export const NOTE_NODE_TYPES = ["doc", ...NOTE_BLOCK_TYPES, ...NOTE_INLINE_TYPES] as const;

export const NOTE_MARK_TYPES = ["bold", "italic", "strike", "code", "underline", "highlight", "link"] as const;

export const NOTE_CALLOUT_VARIANTS = ["info", "warning", "success", "danger"] as const;

export type NoteBlockType = (typeof NOTE_BLOCK_TYPES)[number];
export type NoteInlineType = (typeof NOTE_INLINE_TYPES)[number];
export type NoteNodeType = (typeof NOTE_NODE_TYPES)[number];
export type NoteMarkType = (typeof NOTE_MARK_TYPES)[number];
export type NoteCalloutVariant = (typeof NOTE_CALLOUT_VARIANTS)[number];

export type NoteMark = { type: Exclude<NoteMarkType, "link"> } | { type: "link"; attrs: { href: string } };

export interface NoteTextNode {
  type: "text";
  text: string;
  marks?: NoteMark[];
}
export interface NoteHardBreakNode {
  type: "hardBreak";
}
/** Inline link to another page. `label` is the title as it was when the link was made. */
export interface NotePageLinkNode {
  type: "pageLink";
  attrs: { noteId: string; label: string };
}
export type NoteInlineNode = NoteTextNode | NoteHardBreakNode | NotePageLinkNode;

export interface NoteParagraphNode {
  type: "paragraph";
  content?: NoteInlineNode[];
}
export interface NoteHeadingNode {
  type: "heading";
  attrs: { level: 1 | 2 | 3 };
  content?: NoteInlineNode[];
}
/** The first child of a list item or task item is always a paragraph. */
export interface NoteListItemNode {
  type: "listItem";
  content: NoteBlockNode[];
}
export interface NoteBulletListNode {
  type: "bulletList";
  content: NoteListItemNode[];
}
export interface NoteOrderedListNode {
  type: "orderedList";
  attrs?: { start?: number };
  content: NoteListItemNode[];
}
export interface NoteTaskItemNode {
  type: "taskItem";
  attrs: { checked: boolean };
  content: NoteBlockNode[];
}
export interface NoteTaskListNode {
  type: "taskList";
  content: NoteTaskItemNode[];
}
export interface NoteBlockquoteNode {
  type: "blockquote";
  content: NoteBlockNode[];
}
/** Contains at most one unmarked text node. */
export interface NoteCodeBlockNode {
  type: "codeBlock";
  attrs: { language: string | null };
  content?: NoteTextNode[];
}
export interface NoteHorizontalRuleNode {
  type: "horizontalRule";
}
export interface NoteTableCellAttrs {
  colspan?: number;
  rowspan?: number;
  colwidth?: number[] | null;
}
export interface NoteTableCellNode {
  type: "tableHeader" | "tableCell";
  attrs?: NoteTableCellAttrs;
  content: NoteBlockNode[];
}
export interface NoteTableRowNode {
  type: "tableRow";
  content: NoteTableCellNode[];
}
export interface NoteTableNode {
  type: "table";
  content: NoteTableRowNode[];
}
/** `src` is `/api/attachments/<id>` for an image stored in Outpost. */
export interface NoteImageNode {
  type: "image";
  attrs: { src: string; alt: string | null; title: string | null };
}
export interface NoteCalloutNode {
  type: "callout";
  attrs: { variant: NoteCalloutVariant };
  content: NoteBlockNode[];
}
/** Block link to a document in the library. */
export interface NoteDocumentEmbedNode {
  type: "documentEmbed";
  attrs: { documentId: string; title: string };
}
/** The summary holds text only (marks allowed), so it is valid in every editor schema. */
export interface NoteDetailsSummaryNode {
  type: "detailsSummary";
  content?: NoteTextNode[];
}
export interface NoteDetailsContentNode {
  type: "detailsContent";
  content: NoteBlockNode[];
}
export interface NoteDetailsNode {
  type: "details";
  content: [NoteDetailsSummaryNode, NoteDetailsContentNode];
}

/** Blocks that may appear wherever "block content" is allowed. */
export type NoteBlockNode =
  | NoteParagraphNode
  | NoteHeadingNode
  | NoteBulletListNode
  | NoteOrderedListNode
  | NoteTaskListNode
  | NoteBlockquoteNode
  | NoteCodeBlockNode
  | NoteHorizontalRuleNode
  | NoteTableNode
  | NoteImageNode
  | NoteCalloutNode
  | NoteDocumentEmbedNode
  | NoteDetailsNode;

export interface NoteDoc {
  type: "doc";
  content: NoteBlockNode[];
}

/** Any node of the model, for code that walks a document without caring about types. */
export interface NoteNodeJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoteNodeJson[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/** A new page: one empty paragraph. Copy it before changing it. */
export const EMPTY_DOC: NoteDoc = { type: "doc", content: [{ type: "paragraph" }] };

/** In-app routes that content links to. */
export const noteUrl = (noteId: string): string => `/notes/${noteId}`;
export const attachmentUrl = (attachmentId: string): string => `/api/attachments/${attachmentId}`;

// ── API shapes ──────────────────────────────────────────────────────────────

/** Enough of a page to show it in a list or a link. */
export interface NoteRef {
  id: string;
  title: string;
  icon: string | null;
}

/** One row of the sidebar tree. The tree is sent flat; `parentId` gives the shape. */
export interface NoteTreeItem extends NoteRef {
  parentId: string | null;
  /** Fractional sort key among siblings; lower comes first. */
  position: number;
  isFavorite: boolean;
  childCount: number;
  updatedAt: number;
}

export interface NoteDetail extends NoteRef {
  parentId: string | null;
  content: NoteDoc;
  /**
   * True when the content is one armoured OpenPGP message and nothing else (see
   * `encryptedNoteArmor` in encryption.ts). The title, icon, tags and cover of such a
   * page are still plain.
   */
  encrypted: boolean;
  tags: string[];
  isFavorite: boolean;
  isTemplate: boolean;
  position: number;
  coverAttachmentId: string | null;
  coverUrl: string | null;
  /** Ancestors from the top of the tree down to the parent; the page itself is not included. */
  breadcrumbs: NoteRef[];
  /** Pages whose content links here. Pages in the trash are left out. */
  backlinks: NoteRef[];
  children: NoteRef[];
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastViewedAt: number | null;
}

/**
 * Whether a page holds nothing at all: no title, icon, tags, cover or sub-pages, and only empty paragraphs.
 * Such a page, made by "New page" and left untouched, is removed when it is left (`POST /api/notes/:id/discard`).
 */
export function isEmptyNote(
  note: Pick<NoteDetail, "title" | "icon" | "tags" | "coverAttachmentId" | "children" | "encrypted" | "trashedAt" | "content">,
): boolean {
  const blocks = note.content?.content ?? [];
  const emptyText = blocks.every((block) => block.type === "paragraph" && !("content" in block && block.content?.length));
  return (
    note.title.trim() === "" &&
    note.icon === null &&
    note.tags.length === 0 &&
    note.coverAttachmentId === null &&
    note.children.length === 0 &&
    !note.encrypted &&
    note.trashedAt === null &&
    emptyText
  );
}

/** What a save returns: everything except the content that was just sent. */
export interface NoteSaveResult extends NoteRef {
  /** Send this back as `baseUpdatedAt` with the next save. */
  updatedAt: number;
  tags: string[];
  isFavorite: boolean;
  isTemplate: boolean;
  coverAttachmentId: string | null;
  coverUrl: string | null;
}

export interface NoteListItem extends NoteRef {
  parentId: string | null;
  isFavorite: boolean;
  updatedAt: number;
  lastViewedAt: number | null;
}

/** A match for the editor's page-link menu. `path` is the titles of the ancestors. */
export interface NoteLookupItem extends NoteRef {
  path: string;
  updatedAt: number;
}

export interface TrashedNote extends NoteRef {
  trashedAt: number;
  /** Sub-pages that went to the trash together with this page and come back with it. */
  descendantCount: number;
}

export interface NoteTemplate {
  /** `builtin:<slug>` for the templates Outpost ships, a page id for your own. */
  id: string;
  title: string;
  icon: string | null;
  description: string;
  builtin: boolean;
}

export interface CreateNoteBody {
  parentId?: string | null;
  title?: string;
  icon?: string | null;
  content?: NoteDoc;
  /** Copies title, icon and content from a template; fields given here win. */
  templateId?: string;
  /** Place the page right after this sibling instead of last. */
  afterId?: string;
  /**
   * The page's id, made by the device that wrote it (8 to 64 letters, digits, `-` or `_`).
   * Sent again, the page made the first time is the answer and no second one is made.
   */
  clientId?: string;
}

export interface UpdateNoteBody {
  title?: string;
  icon?: string | null;
  content?: NoteDoc;
  tags?: string[];
  isFavorite?: boolean;
  coverAttachmentId?: string | null;
  isTemplate?: boolean;
  /** Needed to replace an encrypted page's content with content that is not encrypted. */
  removeEncryption?: boolean;
  /**
   * The `updatedAt` this edit was based on. When the stored page is newer the save is
   * refused with 409 `conflict` and `details.current`, so nothing is overwritten.
   */
  baseUpdatedAt?: number;
  /**
   * Names the browser tab that saves, and comes back in the `notes.changed` event this
   * save causes, so that the tab can tell its own save from someone else's and does not
   * fetch again the page it has just sent.
   */
  origin?: string;
}

/** What a `notes.changed` event carries after a save of one page. */
export interface NoteChangedEvent {
  updatedAt: number;
  origin?: string;
}

/** `details` of the 409 answer to a save that would overwrite a newer version. */
export interface NoteConflictDetails {
  current: { updatedAt: number; title: string };
}

export interface MoveNoteBody {
  parentId: string | null;
  /** Omitted: last among the new siblings. `null`: first. An id: right after that page. */
  afterId?: string | null;
}

export interface DuplicateNoteBody {
  withChildren?: boolean;
}

export interface AttachmentDto {
  id: string;
  noteId: string | null;
  filename: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  /** `/api/attachments/<id>`; use it as an image `src`. */
  url: string;
  createdAt: number;
}

export interface NoteTreeResponse {
  notes: NoteTreeItem[];
}
export interface NoteResponse {
  note: NoteDetail;
}
export interface NoteSaveResponse {
  note: NoteSaveResult;
}
export interface NoteMoveResponse {
  note: NoteTreeItem;
}
export interface NoteListResponse {
  notes: NoteListItem[];
}
export interface NoteLookupResponse {
  notes: NoteLookupItem[];
}
export interface NoteTrashResponse {
  notes: TrashedNote[];
}
export interface NoteTemplatesResponse {
  templates: NoteTemplate[];
}
export interface NoteTrashedResponse {
  /** Ids of the page and the sub-pages that went to the trash with it. */
  trashed: string[];
}
export interface NoteDeletedResponse {
  deletedNotes: number;
  deletedAttachments: number;
}
export interface AttachmentResponse {
  attachment: AttachmentDto;
}

// ── Earlier versions ────────────────────────────────────────────────────────

/**
 * What a page said before a save changed it. Every save is kept for an hour, then the
 * last of each hour for a day, then the last of each day.
 */
export interface NoteVersionItem {
  id: string;
  title: string;
  /** When the page was saved like this. */
  savedAt: number;
  /** The content is an armoured OpenPGP message, as the page was then. */
  encrypted: boolean;
  sizeBytes: number;
}

export interface NoteVersionDetail extends NoteVersionItem {
  content: NoteDoc;
}

export interface NoteVersionsResponse {
  versions: NoteVersionItem[];
}

/** `POST /api/notes/:id/versions/:versionId/restore`: the version becomes the page's newest. */
export interface RestoreNoteVersionBody {
  /** The `updatedAt` of the page as the person saw it, so a newer save is not replaced unseen. */
  baseUpdatedAt: number;
  origin?: string;
}

/** The room the earlier versions of every page take, for the Storage screen. */
export interface NoteVersionsSpace {
  versions: number;
  pages: number;
  bytes: number;
}
