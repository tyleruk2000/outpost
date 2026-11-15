/**
 * Content utilities for page documents: pure functions with no database access, used
 * by the notes service and by importers.
 */
export { type HtmlToDocOptions, type HtmlToDocResult, htmlToDoc } from "./from-html.ts";
export { type MarkdownToDocOptions, type MarkdownToDocResult, markdownToDoc } from "./from-markdown.ts";
export type { LinkResolver } from "./from-mdast.ts";
export { type SanitizeOptions, sanitizeDoc } from "./sanitize.ts";
export {
  attachmentHref,
  documentHref,
  emptyDoc,
  type InAppTarget,
  MAX_DOC_BYTES,
  MAX_DOC_DEPTH,
  noteHref,
  parseInAppHref,
  safeUrl,
} from "./schema.ts";
export { docToSections, docToText, extractLinks, type NoteLinks, type NoteSection } from "./text.ts";
export { type DocToMarkdownOptions, docToMarkdown } from "./to-markdown.ts";
