/**
 * A reply saved as a page of notes. Always a new page: nothing a model wrote is ever
 * put into a page that exists.
 *
 * The reply keeps its headings, lists, tables and code. It does not keep its links or
 * pictures: a model can be made to write any address, and a page of notes would fetch
 * a picture or offer a link the moment it was opened. An address a model wrote stays
 * as the words it is. The page opens with a line saying what wrote it, when, and in
 * reply to what; a reply written from the library ends with links to the passages it
 * was given, which are Outpost's own.
 */
import type { AnswerSource, NoteDoc } from "@outpost/shared";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { type MdNode, mdastToBlocks } from "../notes/content/from-mdast.ts";
import { sanitizeDoc } from "../notes/content/sanitize.ts";
import type { PMNode } from "../notes/content/schema.ts";

const processor = unified().use(remarkParse).use(remarkGfm).freeze();

const words = (node: MdNode): string => (typeof node.value === "string" ? node.value : (node.children ?? []).map(words).join(""));

/** The tree with every link, picture and piece of HTML reduced to the words it carries. */
function withoutAddresses(node: MdNode): MdNode {
  if (!node.children) return node;
  const children: MdNode[] = [];
  for (const child of node.children) {
    switch (child.type) {
      case "link": {
        children.push(...(withoutAddresses(child).children ?? []));
        const url = typeof child.url === "string" ? child.url.trim() : "";
        if (url && url !== words(child).trim()) children.push({ type: "text", value: ` (${url})` });
        break;
      }
      case "linkReference":
        children.push(...(withoutAddresses(child).children ?? []));
        break;
      case "image":
      case "imageReference":
        if (child.alt) children.push({ type: "text", value: child.alt });
        break;
      case "definition":
        break;
      case "html":
        // Shown as typed, never read as markup. Where it stood as a block of its own it becomes a paragraph.
        children.push(
          node.type === "root" || node.type === "blockquote" || node.type === "listItem"
            ? { type: "paragraph", children: [{ type: "text", value: child.value ?? "" }] }
            : { type: "text", value: child.value ?? "" },
        );
        break;
      default:
        children.push(withoutAddresses(child));
    }
  }
  return { ...node, children };
}

const text = (value: string, marks?: PMNode["marks"]): PMNode => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: PMNode[]): PMNode => ({ type: "paragraph", content });

const whereOf = (source: AnswerSource) =>
  [source.title, source.heading && source.heading !== source.title ? source.heading : null, source.page ? `page ${source.page}` : null]
    .filter(Boolean)
    .join(", ");

/** A source as a link Outpost made itself: to the page of notes, or to the document at its page. */
function sourceLink(source: AnswerSource): PMNode {
  const label = whereOf(source);
  if (source.kind === "note") return { type: "pageLink", attrs: { noteId: source.entityId, label } };
  // Only ever a route inside Outpost.
  const href = source.url.startsWith("/") && !source.url.startsWith("//") ? source.url : null;
  return href ? text(label, [{ type: "link", attrs: { href } }]) : text(label);
}

export interface ReplyNote {
  /** The model's reply, as it wrote it. */
  reply: string;
  /** The message it replied to. */
  question: string;
  model: string | null;
  writtenAt: number;
  sources: AnswerSource[];
  /** The reply stops before its end (stopped, cut short or failed). */
  unfinished: boolean;
}

const dateWords = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function replyAsNote(input: ReplyNote): NoteDoc {
  let blocks: PMNode[];
  try {
    blocks = mdastToBlocks(withoutAddresses(processor.parse(input.reply) as unknown as MdNode)).blocks;
  } catch {
    blocks = input.reply
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => paragraph(text(part)));
  }
  const asked = input.question.replace(/\s+/g, " ").trim();
  const question = asked.length > 300 ? `${asked.slice(0, 300).trimEnd()}…` : asked;
  const opening: PMNode = {
    type: "callout",
    attrs: { variant: "info" },
    content: [
      paragraph(
        text("Written by a language model"),
        ...(input.model ? [text(" ("), text(input.model, [{ type: "code" }]), text(")")] : []),
        text(` on ${dateWords.format(input.writtenAt)}, in reply to: “${question}”. `),
        text(
          input.sources.length > 0
            ? "It is the model’s wording of the passages listed at the end, not a source."
            : "It is the model’s wording, written without your library, and not a source.",
        ),
        ...(input.unfinished ? [text(" The reply was not finished.")] : []),
      ),
    ],
  };
  const closing: PMNode[] =
    input.sources.length > 0
      ? [
          { type: "heading", attrs: { level: 3 }, content: [text("Passages the model was given")] },
          {
            type: "orderedList",
            content: input.sources.map((source) => ({ type: "listItem", content: [paragraph(sourceLink(source))] })),
          },
        ]
      : [];
  return sanitizeDoc({ type: "doc", content: [opening, ...blocks, ...closing] });
}
