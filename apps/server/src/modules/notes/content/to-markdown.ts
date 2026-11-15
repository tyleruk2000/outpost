/**
 * Page document → GitHub-flavoured Markdown.
 *
 * The document is first turned into a Markdown syntax tree (mdast) and then written out
 * by remark, which knows every escaping rule; building the text by hand would get
 * characters such as `*`, `_`, `|` and `[` wrong sooner or later.
 *
 * Things Markdown has no syntax for are written the way GitHub renders them: callouts
 * as alert blockquotes (`> [!NOTE]`), toggles as `<details>`, underline and highlight as
 * `<u>` and `<mark>`. `markdownToDoc` reads all of these back.
 */

import type { NoteCalloutVariant, NoteDoc } from "@outpost/shared";
import type { Html, List, ListItem, PhrasingContent, Root, RootContent, Table, TableCell } from "mdast";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { trimInline } from "./inline.ts";
import { documentHref, MARK_ORDER, noteHref, type PMMark, type PMNode, parseInAppHref } from "./schema.ts";
import { inlineText } from "./text.ts";

export interface DocToMarkdownOptions {
  /** Where a link to another page should point, e.g. a relative path in an export. Default: `/notes/<id>`. */
  resolvePageLink?: (noteId: string) => string | null | undefined;
  /** Where an attachment should point, e.g. `_attachments/<file>` in an export. Default: `/api/attachments/<id>`. */
  resolveAttachment?: (attachmentId: string) => string | null | undefined;
}

export const ALERT_BY_VARIANT: Record<NoteCalloutVariant, string> = {
  info: "NOTE",
  warning: "WARNING",
  success: "TIP",
  danger: "CAUTION",
};

const processor = unified()
  .use(remarkGfm, { tablePipeAlign: false })
  .use(remarkStringify, {
    bullet: "-",
    emphasis: "*",
    strong: "*",
    // Asterisks, so that a rule can never be mistaken for front matter or a setext heading.
    rule: "*",
    fences: true,
    listItemIndent: "one",
    incrementListMarker: true,
  })
  .freeze();

const html = (value: string): Html => ({ type: "html", value });
const childrenOf = (node: PMNode): PMNode[] => (Array.isArray(node.content) ? node.content : []);
const attr = (node: PMNode, name: string): string => {
  const value = node.attrs?.[name];
  return typeof value === "string" ? value : "";
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** An inline node with the marks that still have to be written around it. */
interface Run {
  node: PMNode;
  marks: PMMark[];
}

const sortMarks = (marks: PMMark[] | undefined): PMMark[] =>
  [...(marks ?? [])]
    .filter((mark) => (MARK_ORDER as readonly string[]).includes(mark.type))
    .sort((a, b) => MARK_ORDER.indexOf(a.type as never) - MARK_ORDER.indexOf(b.type as never));

const sameMark = (a: PMMark, b: PMMark): boolean => a.type === b.type && a.attrs?.href === b.attrs?.href;

function createWriter(options: DocToMarkdownOptions) {
  function linkUrl(href: string): string {
    const target = parseInAppHref(href);
    if (target?.type === "note") return options.resolvePageLink?.(target.noteId) ?? href;
    if (target?.type === "attachment") return options.resolveAttachment?.(target.attachmentId) ?? href;
    return href;
  }

  function leaf(node: PMNode, inTable: boolean): PhrasingContent[] {
    if (node.type === "text") return node.text ? [{ type: "text", value: node.text }] : [];
    // A backslash line break would end a table row, so cells use the HTML form.
    if (node.type === "hardBreak") return [inTable ? html("<br>") : { type: "break" }];
    if (node.type === "pageLink") {
      const noteId = attr(node, "noteId");
      const url = options.resolvePageLink?.(noteId) ?? noteHref(noteId);
      return [{ type: "link", url, children: [{ type: "text", value: attr(node, "label") || "Untitled" }] }];
    }
    return [];
  }

  /**
   * Moves spaces at the edges of bold, italic or struck text outside the markers.
   * `**word **` is not emphasis in Markdown; `**word** ` is, and reads the same.
   */
  function splitEdges(runs: Run[]): { before: string; inner: Run[]; after: string } {
    const inner = runs.map((run) => ({ ...run }));
    let before = "";
    let after = "";
    const first = inner[0];
    if (first?.node.type === "text" && !first.marks.some((mark) => mark.type === "code")) {
      const text = first.node.text ?? "";
      before = /^\s*/.exec(text)![0];
      first.node = { ...first.node, text: text.slice(before.length) };
    }
    const last = inner.at(-1);
    if (last?.node.type === "text" && !last.marks.some((mark) => mark.type === "code")) {
      const text = last.node.text ?? "";
      after = /\s*$/.exec(text)![0];
      last.node = { ...last.node, text: text.slice(0, text.length - after.length) };
    }
    return { before, inner: inner.filter((run) => run.node.type !== "text" || run.node.text), after };
  }

  /**
   * Writes a run of inline nodes, opening each mark once around the longest stretch of
   * neighbours that share it, so `bold, bold+italic, bold` becomes `**a *b* c**`.
   */
  function group(runs: Run[], inTable: boolean): PhrasingContent[] {
    const out: PhrasingContent[] = [];
    let index = 0;
    while (index < runs.length) {
      const run = runs[index]!;
      const mark = run.marks[0];
      if (!mark) {
        out.push(...leaf(run.node, inTable));
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < runs.length && runs[end]!.marks.some((other) => sameMark(other, mark))) end += 1;
      const stretch = runs.slice(index, end).map((item) => ({
        node: item.node,
        marks: item.marks.filter((other) => !sameMark(other, mark)),
      }));
      out.push(...wrap(mark, stretch, inTable));
      index = end;
    }
    return out;
  }

  function wrap(mark: PMMark, runs: Run[], inTable: boolean): PhrasingContent[] {
    switch (mark.type) {
      case "code":
        return [{ type: "inlineCode", value: runs.map((run) => run.node.text ?? "").join("") }];
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        return [{ type: "link", url: linkUrl(href), children: group(runs, inTable) as never }];
      }
      case "underline":
        return [html("<u>"), ...group(runs, inTable), html("</u>")];
      case "highlight":
        return [html("<mark>"), ...group(runs, inTable), html("</mark>")];
      default: {
        const type = mark.type === "bold" ? "strong" : mark.type === "italic" ? "emphasis" : "delete";
        const { before, inner, after } = splitEdges(runs);
        const out: PhrasingContent[] = [];
        if (before) out.push({ type: "text", value: before });
        if (inner.length > 0) out.push({ type, children: group(inner, inTable) as never });
        if (after) out.push({ type: "text", value: after });
        return out;
      }
    }
  }

  function phrasing(node: PMNode, inTable = false): PhrasingContent[] {
    // Leading and trailing spaces would be written as "&#x20;", and a line break at the
    // very end as a stray backslash; neither is worth keeping.
    return group(
      trimInline(childrenOf(node)).map((child) => ({ node: child, marks: child.type === "text" ? sortMarks(child.marks) : [] })),
      inTable,
    );
  }

  /** Inline content as HTML, for the one place Markdown is not read: inside `<summary>`. */
  function summaryHtml(node: PMNode): string {
    const tags: Record<string, string> = { bold: "strong", italic: "em", strike: "s", underline: "u", highlight: "mark", code: "code" };
    return childrenOf(node)
      .map((child) => {
        if (child.type === "hardBreak") return " ";
        if (child.type === "pageLink") return escapeHtml(attr(child, "label"));
        let out = escapeHtml((child.text ?? "").replace(/\s*\n\s*/g, " "));
        for (const mark of sortMarks(child.marks).reverse()) {
          if (mark.type === "link") out = `<a href="${escapeHtml(linkUrl(String(mark.attrs?.href ?? "")))}">${out}</a>`;
          else out = `<${tags[mark.type]}>${out}</${tags[mark.type]}>`;
        }
        return out;
      })
      .join("");
  }

  function image(node: PMNode): PhrasingContent {
    const src = attr(node, "src");
    const target = parseInAppHref(src);
    const url = target?.type === "attachment" ? (options.resolveAttachment?.(target.attachmentId) ?? src) : src;
    return { type: "image", url, alt: attr(node, "alt"), title: attr(node, "title") || null };
  }

  const embedLink = (node: PMNode): PhrasingContent => ({
    type: "link",
    url: documentHref(attr(node, "documentId")),
    children: [{ type: "text", value: attr(node, "title") || "Document" }],
  });

  /** A table cell holds blocks in the editor but only one line in Markdown. */
  function cellPhrasing(node: PMNode): PhrasingContent[] {
    const parts: PhrasingContent[][] = [];
    const visit = (block: PMNode) => {
      if (block.type === "paragraph" || block.type === "heading" || block.type === "detailsSummary") parts.push(phrasing(block, true));
      else if (block.type === "image") parts.push([image(block)]);
      else if (block.type === "documentEmbed") parts.push([embedLink(block)]);
      else if (block.type === "codeBlock") parts.push([{ type: "inlineCode", value: inlineText(block).replace(/\s*\n\s*/g, " ") }]);
      else for (const child of childrenOf(block)) visit(child);
    };
    for (const child of childrenOf(node)) visit(child);
    const out: PhrasingContent[] = [];
    for (const part of parts.filter((item) => item.length > 0)) {
      if (out.length > 0) out.push(html("<br>"));
      out.push(...part);
    }
    return out;
  }

  function table(node: PMNode): Table | null {
    const rows = childrenOf(node).filter((row) => childrenOf(row).length > 0);
    if (rows.length === 0) return null;
    return {
      type: "table",
      children: rows.map((row) => ({
        type: "tableRow",
        children: childrenOf(row).map((cell): TableCell => ({ type: "tableCell", children: cellPhrasing(cell) as never })),
      })),
    };
  }

  function list(node: PMNode): List {
    const items = childrenOf(node).map((item): ListItem => {
      const children = blocks(childrenOf(item));
      // Anything beyond "a line and maybe a nested list" gets blank lines between its
      // parts, so a table or a toggle inside an item is not glued to the text above it.
      const simple = children.every((child, index) => (index === 0 ? child.type === "paragraph" : child.type === "list"));
      const listItem: ListItem = { type: "listItem", spread: !simple, children: children as never };
      if (node.type === "taskList") {
        listItem.checked = item.attrs?.checked === true;
        // The checkbox is written in front of a paragraph; an empty item still needs one.
        if (children[0]?.type !== "paragraph") listItem.children.unshift({ type: "paragraph", children: [] });
      }
      return listItem;
    });
    const start = node.attrs?.start;
    return {
      type: "list",
      ordered: node.type === "orderedList",
      start: node.type === "orderedList" ? (typeof start === "number" ? start : 1) : null,
      spread: false,
      children: items,
    };
  }

  function callout(node: PMNode): RootContent {
    const variant = attr(node, "variant") as NoteCalloutVariant;
    const marker = html(`[!${ALERT_BY_VARIANT[variant] ?? ALERT_BY_VARIANT.info}]`);
    const [first, ...rest] = blocks(childrenOf(node));
    // GitHub wants the marker on the first line with the text following directly.
    if (first?.type === "paragraph") {
      const paragraph: RootContent = { type: "paragraph", children: [marker, { type: "text", value: "\n" }, ...first.children] };
      return { type: "blockquote", children: [paragraph, ...rest] as never };
    }
    const paragraph: RootContent = { type: "paragraph", children: [marker] };
    return { type: "blockquote", children: (first ? [paragraph, first, ...rest] : [paragraph]) as never };
  }

  function details(node: PMNode): RootContent[] {
    const summary = childrenOf(node).find((child) => child.type === "detailsSummary");
    const body = childrenOf(node)
      .filter((child) => child.type === "detailsContent")
      .flatMap(childrenOf);
    return [html(`<details>\n<summary>${summary ? summaryHtml(summary) : ""}</summary>`), ...blocks(body), html("</details>")];
  }

  function blocks(nodes: PMNode[]): RootContent[] {
    const out: RootContent[] = [];
    for (const node of nodes) {
      switch (node.type) {
        case "paragraph": {
          const children = phrasing(node);
          if (children.length > 0) out.push({ type: "paragraph", children });
          break;
        }
        case "heading": {
          const level = node.attrs?.level;
          out.push({ type: "heading", depth: level === 2 || level === 3 ? level : 1, children: phrasing(node) });
          break;
        }
        case "bulletList":
        case "orderedList":
        case "taskList":
          if (childrenOf(node).length > 0) out.push(list(node));
          break;
        case "blockquote":
          out.push({ type: "blockquote", children: blocks(childrenOf(node)) as never });
          break;
        case "codeBlock":
          out.push({ type: "code", lang: attr(node, "language") || null, value: inlineText(node) });
          break;
        case "horizontalRule":
          out.push({ type: "thematicBreak" });
          break;
        case "table": {
          const mdTable = table(node);
          if (mdTable) out.push(mdTable);
          break;
        }
        case "image":
          out.push({ type: "paragraph", children: [image(node)] });
          break;
        case "callout":
          out.push(callout(node));
          break;
        case "documentEmbed":
          out.push({ type: "paragraph", children: [embedLink(node)] });
          break;
        case "details":
          out.push(...details(node));
          break;
        default:
          // Not part of the model (the document was not sanitised): keep what is inside.
          out.push(...blocks(childrenOf(node)));
      }
    }
    return out;
  }

  return { blocks };
}

/** Writes a page as Markdown. The result ends with a newline unless the page is empty. */
export function docToMarkdown(doc: NoteDoc | PMNode | null | undefined, options: DocToMarkdownOptions = {}): string {
  if (!doc) return "";
  const root: Root = { type: "root", children: createWriter(options).blocks(childrenOf(doc as PMNode)) };
  if (root.children.length === 0) return "";
  return processor.stringify(root);
}
