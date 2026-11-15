/**
 * What a page may contain, as data. The sanitiser, the converters and the text
 * extractors all read these tables, so the content model is stated once on the server.
 * The type names come from `@outpost/shared`, which is the contract with the editor:
 * `NODE_RULES` is keyed by that union, so a node type added there fails to compile here
 * until it has a rule.
 */
import type { NoteCalloutVariant, NoteDoc, NoteMarkType, NoteNodeJson, NoteNodeType } from "@outpost/shared";

/** A node of the model without the precise per-type shape; what the walkers work on. */
export type PMNode = NoteNodeJson;
export type PMMark = NonNullable<NoteNodeJson["marks"]>[number];

export type ContentRule =
  /** One or more blocks (paragraphs, lists, tables, …). */
  | { kind: "block" }
  /** Text, hard breaks and page links. */
  | { kind: "inline" }
  /** Text only; `marks` says whether formatting is kept. */
  | { kind: "text"; marks: boolean }
  | { kind: "none" }
  /** Only the listed child types; anything else is wrapped in `wrapper`. */
  | { kind: "children"; allowed: readonly NoteNodeType[]; wrapper: NoteNodeType };

export interface NodeRule {
  /** Where the node may appear: as block content, as inline content, or only inside its own parent. */
  group: "doc" | "block" | "inline" | "part";
  content: ContentRule;
  /** A list item style node whose first child must be a paragraph. */
  paragraphFirst?: boolean;
}

const block = { kind: "block" } as const;
const inline = { kind: "inline" } as const;
const none = { kind: "none" } as const;

export const NODE_RULES: Record<NoteNodeType, NodeRule> = {
  doc: { group: "doc", content: block },
  paragraph: { group: "block", content: inline },
  heading: { group: "block", content: inline },
  bulletList: { group: "block", content: { kind: "children", allowed: ["listItem"], wrapper: "listItem" } },
  orderedList: { group: "block", content: { kind: "children", allowed: ["listItem"], wrapper: "listItem" } },
  listItem: { group: "part", content: block, paragraphFirst: true },
  taskList: { group: "block", content: { kind: "children", allowed: ["taskItem"], wrapper: "taskItem" } },
  taskItem: { group: "part", content: block, paragraphFirst: true },
  blockquote: { group: "block", content: block },
  codeBlock: { group: "block", content: { kind: "text", marks: false } },
  horizontalRule: { group: "block", content: none },
  table: { group: "block", content: { kind: "children", allowed: ["tableRow"], wrapper: "tableRow" } },
  tableRow: { group: "part", content: { kind: "children", allowed: ["tableHeader", "tableCell"], wrapper: "tableCell" } },
  tableHeader: { group: "part", content: block },
  tableCell: { group: "part", content: block },
  image: { group: "block", content: none },
  callout: { group: "block", content: block },
  documentEmbed: { group: "block", content: none },
  details: { group: "block", content: { kind: "children", allowed: ["detailsSummary", "detailsContent"], wrapper: "detailsContent" } },
  detailsSummary: { group: "part", content: { kind: "text", marks: true } },
  detailsContent: { group: "part", content: block },
  text: { group: "inline", content: none },
  hardBreak: { group: "inline", content: none },
  pageLink: { group: "inline", content: none },
};

/** Marks in the order the converters nest them, outermost first. */
export const MARK_ORDER: readonly NoteMarkType[] = ["link", "bold", "italic", "strike", "underline", "highlight", "code"];

export const CALLOUT_VARIANTS: readonly NoteCalloutVariant[] = ["info", "warning", "success", "danger"];

export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const MAX_DOC_DEPTH = 40;

export function ruleOf(type: unknown): NodeRule | undefined {
  return typeof type === "string" && Object.hasOwn(NODE_RULES, type) ? NODE_RULES[type as NoteNodeType] : undefined;
}

export function isMarkType(type: unknown): type is NoteMarkType {
  return typeof type === "string" && (MARK_ORDER as readonly string[]).includes(type);
}

/** A fresh empty page. A function, so that no two pages ever share one object. */
export function emptyDoc(): NoteDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

// ── Links ───────────────────────────────────────────────────────────────────

/** Ids are ULIDs today; the pattern is a little wider so imported ids keep working. */
const ID = "[A-Za-z0-9_-]{1,64}";
const ID_ONLY = new RegExp(`^${ID}$`);
const NOTE_ROUTE = new RegExp(`^/notes/(${ID})(?:[?#].*)?$`);
const DOCUMENT_ROUTE = new RegExp(`^/library/documents/(${ID})(?:[?#].*)?$`);
const ATTACHMENT_ROUTE = new RegExp(`^/api/attachments/(${ID})(?:[?#].*)?$`);

export const isId = (value: unknown): value is string => typeof value === "string" && ID_ONLY.test(value);

export const noteHref = (noteId: string): string => `/notes/${noteId}`;
export const documentHref = (documentId: string): string => `/library/documents/${documentId}`;
export const attachmentHref = (attachmentId: string): string => `/api/attachments/${attachmentId}`;

export type InAppTarget =
  | { type: "note"; noteId: string }
  | { type: "document"; documentId: string }
  | { type: "attachment"; attachmentId: string };

/** Recognises a link to a page, a library document or an attachment of this Outpost. */
export function parseInAppHref(href: string): InAppTarget | null {
  const note = NOTE_ROUTE.exec(href);
  if (note) return { type: "note", noteId: note[1]! };
  const document = DOCUMENT_ROUTE.exec(href);
  if (document) return { type: "document", documentId: document[1]! };
  const attachment = ATTACHMENT_ROUTE.exec(href);
  if (attachment) return { type: "attachment", attachmentId: attachment[1]! };
  return null;
}

const LINK_SCHEMES = new Set(["http", "https", "mailto"]);
const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/;

/**
 * Returns the URL if it is safe to put in an `href` or an image `src`, otherwise null.
 *
 * Allowed: http, https, mailto, and anything without a scheme (in-app routes such as
 * `/notes/…` and `/api/attachments/…`, relative paths, `#anchors`). Images may also be
 * small inline `data:` pictures of the raster types browsers render without running
 * anything. Everything else, `javascript:` and `data:text/html` in particular, is refused.
 */
export function safeUrl(value: unknown, use: "link" | "image"): string | null {
  if (typeof value !== "string") return null;
  // Browsers ignore tabs, newlines and other control characters inside a URL, which is
  // the classic way to hide "java\tscript:" from a filter. Remove them before looking.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  const url = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!url || url.length > 4096 + (use === "image" ? MAX_DOC_BYTES : 0)) return null;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url)?.[1]?.toLowerCase();
  if (scheme === undefined) return url;
  if (LINK_SCHEMES.has(scheme)) return use === "image" && scheme === "mailto" ? null : url;
  if (scheme === "data" && use === "image") return SAFE_DATA_IMAGE.test(url) ? url : null;
  return null;
}
