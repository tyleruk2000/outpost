/**
 * Markdown syntax tree (mdast) → page blocks. Shared by the Markdown and the HTML
 * converters, so both end in the same content model by the same rules.
 *
 * The mapper never throws on a construct it does not know: the node's children or text
 * are kept as ordinary paragraphs and a warning says what was simplified. Raw HTML never
 * becomes HTML in the result (the content model has no such node): the few harmless
 * tags are mapped to marks and nodes, the rest lose their tags and keep their words.
 */
import { htmlToMdast } from "./html-pipeline.ts";
import { pushInline, trimInline } from "./inline.ts";
import {
  attachmentHref,
  type CALLOUT_VARIANTS,
  documentHref,
  type InAppTarget,
  MARK_ORDER,
  type PMMark,
  type PMNode,
  parseInAppHref,
  safeUrl,
} from "./schema.ts";

/** An mdast node, typed loosely: importers feed this all kinds of trees. */
export interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  identifier?: string;
  label?: string | null;
  /** Inline content of the summary of an `outpostDetails` node. */
  summary?: MdNode[];
  /** Set by the HTML pipeline on an emphasis node that stands for underline or highlight. */
  data?: { outpostMark?: "underline" | "highlight" };
}

export interface LinkResolver {
  /**
   * Lets an importer say what a link or image address points to inside Outpost, e.g. a
   * relative path to another imported file. Return null to leave the address alone.
   */
  resolveLink?: (href: string) => InAppTarget | null | undefined;
}

export interface MappedBlocks {
  blocks: PMNode[];
  warnings: string[];
}

const ALERTS: Record<string, (typeof CALLOUT_VARIANTS)[number]> = {
  NOTE: "info",
  IMPORTANT: "info",
  TIP: "success",
  WARNING: "warning",
  CAUTION: "danger",
};
const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;

/** HTML tags written inline in Markdown that mean the same as a mark. */
const TAG_MARKS: Record<string, PMMark["type"]> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  s: "strike",
  del: "strike",
  strike: "strike",
  u: "underline",
  ins: "underline",
  mark: "highlight",
  code: "code",
  kbd: "code",
};

const PHRASING = new Set([
  "text",
  "emphasis",
  "strong",
  "delete",
  "inlineCode",
  "break",
  "link",
  "image",
  "linkReference",
  "imageReference",
  "footnoteReference",
]);
const OPEN_TAG = /^<([A-Za-z][A-Za-z0-9-]*)(\s[^>]*)?\/?>$/s;
const CLOSE_TAG = /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>$/;

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tagAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeEntities(value);
}

const count = (value: string, pattern: RegExp): number => value.match(pattern)?.length ?? 0;
/** How many more `<tag>` than `</tag>` a piece of HTML has. */
const balance = (value: string, tag: string): number =>
  count(value, new RegExp(`<${tag}[\\s>]`, "gi")) - count(value, new RegExp(`</${tag}\\s*>`, "gi"));

/** True when a block says something: it has text, or is a picture, a rule or an embed. */
function hasContent(node: PMNode): boolean {
  if (node.type === "image" || node.type === "horizontalRule" || node.type === "documentEmbed" || node.type === "pageLink") return true;
  if (node.type === "text") return Boolean(node.text?.trim());
  return (node.content ?? []).some(hasContent);
}

function plainText(nodes: MdNode[]): string {
  let text = "";
  for (const node of nodes) {
    if (node.type === "html") continue;
    if (typeof node.value === "string") text += node.value;
    else if (node.type === "image") text += node.alt ?? "";
    else if (node.children) text += plainText(node.children);
  }
  return text;
}

/** An image found in inline content. It becomes a block when the paragraph is assembled. */
const isImage = (node: PMNode): boolean => node.type === "image";

export function mdastToBlocks(root: MdNode, options: LinkResolver = {}): MappedBlocks {
  const warnings = new Set<string>();
  const definitions = new Map<string, MdNode>();

  (function collect(node: MdNode) {
    if (node.type === "definition" && node.identifier) definitions.set(node.identifier, node);
    for (const child of node.children ?? []) collect(child);
  })(root);

  function resolve(href: string): InAppTarget | null {
    try {
      return options.resolveLink?.(href) ?? parseInAppHref(href);
    } catch {
      // A resolver is importer code; one bad link must not stop a whole import.
      return parseInAppHref(href);
    }
  }

  function withMark(marks: PMMark[], mark: PMMark): PMMark[] {
    if (marks.some((existing) => existing.type === mark.type)) return marks;
    return [...marks, mark].sort((a, b) => MARK_ORDER.indexOf(a.type as never) - MARK_ORDER.indexOf(b.type as never));
  }

  function pushText(out: PMNode[], value: string, marks: PMMark[]): void {
    // A line break inside a Markdown paragraph is just a space when rendered.
    const text = marks.some((mark) => mark.type === "code") ? value : value.replace(/[ \t]*\n[ \t]*/g, " ");
    if (!text) return;
    pushInline(out, marks.length > 0 ? { type: "text", text, marks } : { type: "text", text });
  }

  function imageNode(url: string, alt: string | null | undefined, title: string | null | undefined, out: PMNode[], marks: PMMark[]): void {
    const target = resolve(url);
    const src = target?.type === "attachment" ? attachmentHref(target.attachmentId) : safeUrl(url, "image");
    if (src) {
      out.push({ type: "image", attrs: { src, alt: alt || null, title: title || null } });
      return;
    }
    warnings.add("An image with an address that is not allowed was replaced by its description.");
    if (alt) pushText(out, alt, marks);
  }

  function linkInto(out: PMNode[], url: string, children: MdNode[], marks: PMMark[]): void {
    const target = resolve(url);
    if (target?.type === "note") {
      out.push({ type: "pageLink", attrs: { noteId: target.noteId, label: plainText(children).replace(/\s+/g, " ").trim() } });
      return;
    }
    const href =
      target?.type === "document"
        ? documentHref(target.documentId)
        : target?.type === "attachment"
          ? attachmentHref(target.attachmentId)
          : safeUrl(url, "link");
    if (!href) warnings.add("A link with an address that is not allowed was turned into plain text.");
    inlineInto(out, children, href ? withMark(marks, { type: "link", attrs: { href } }) : marks);
  }

  /** Inline HTML: a handful of tags act as marks, a line break is a line break, the rest is dropped. */
  function inlineHtml(value: string, out: PMNode[], marks: PMMark[], open: Array<{ tag: string; mark: PMMark | null }>): void {
    const tag = value.trim();
    if (tag.startsWith("<!--")) return;
    const closing = CLOSE_TAG.exec(tag);
    if (closing) {
      const name = closing[1]!.toLowerCase();
      const index = open.findLastIndex((entry) => entry.tag === name);
      if (index >= 0) open.splice(index, 1);
      return;
    }
    const opening = OPEN_TAG.exec(tag);
    if (!opening) {
      warnings.add("Some HTML could not be converted and was left out.");
      return;
    }
    const name = opening[1]!.toLowerCase();
    if (name === "br") {
      out.push({ type: "hardBreak" });
    } else if (name === "img") {
      imageNode(tagAttribute(tag, "src") ?? "", tagAttribute(tag, "alt"), tagAttribute(tag, "title"), out, marks);
    } else if (name === "a") {
      const href = safeUrl(tagAttribute(tag, "href"), "link");
      open.push({ tag: name, mark: href ? { type: "link", attrs: { href } } : null });
    } else if (TAG_MARKS[name]) {
      open.push({ tag: name, mark: { type: TAG_MARKS[name] } });
    } else {
      warnings.add("Some HTML formatting is not supported and was removed; the text was kept.");
    }
  }

  function inlineInto(out: PMNode[], children: MdNode[], marks: PMMark[]): void {
    // HTML tags opened in this run of siblings, e.g. the <u> of `<u>text</u>`.
    const open: Array<{ tag: string; mark: PMMark | null }> = [];
    for (const child of children) {
      let current = marks;
      for (const entry of open) if (entry.mark) current = withMark(current, entry.mark);
      switch (child.type) {
        case "text":
          pushText(out, child.value ?? "", current);
          break;
        case "emphasis":
          inlineInto(out, child.children ?? [], withMark(current, { type: child.data?.outpostMark ?? "italic" }));
          break;
        case "strong":
          inlineInto(out, child.children ?? [], withMark(current, { type: "bold" }));
          break;
        case "delete":
          inlineInto(out, child.children ?? [], withMark(current, { type: "strike" }));
          break;
        case "inlineCode":
          pushText(out, child.value ?? "", withMark(current, { type: "code" }));
          break;
        case "break":
          out.push({ type: "hardBreak" });
          break;
        case "link":
          linkInto(out, child.url ?? "", child.children ?? [], current);
          break;
        case "image":
          imageNode(child.url ?? "", child.alt, child.title, out, current);
          break;
        case "linkReference": {
          const definition = definitions.get(child.identifier ?? "");
          if (definition?.url) linkInto(out, definition.url, child.children ?? [], current);
          else inlineInto(out, child.children ?? [], current);
          break;
        }
        case "imageReference": {
          const definition = definitions.get(child.identifier ?? "");
          if (definition?.url) imageNode(definition.url, child.alt, definition.title, out, current);
          else if (child.alt) pushText(out, child.alt, current);
          break;
        }
        case "footnoteReference":
          pushText(out, `[^${child.label ?? child.identifier ?? ""}]`, current);
          break;
        case "html":
          inlineHtml(child.value ?? "", out, current, open);
          break;
        default:
          if (child.children) inlineInto(out, child.children, current);
          else if (typeof child.value === "string") pushText(out, child.value, current);
      }
    }
  }

  function inline(children: MdNode[]): PMNode[] {
    const out: PMNode[] = [];
    inlineInto(out, children, []);
    return out;
  }

  /** Inline content where a picture cannot stand on its own (headings, summaries): it reads as its description. */
  function inlineWithoutImages(children: MdNode[]): PMNode[] {
    const out: PMNode[] = [];
    for (const node of inline(children)) {
      if (!isImage(node)) pushInline(out, node);
      else if (node.attrs?.alt) pushInline(out, { type: "text", text: String(node.attrs.alt) });
    }
    return out;
  }

  /** Images are blocks in the content model, so a paragraph is cut around each one. */
  function paragraphs(items: PMNode[]): PMNode[] {
    const blocks: PMNode[] = [];
    let current: PMNode[] = [];
    const flush = () => {
      // Spaces and line breaks next to where a picture was cut out belong to nothing.
      const content = trimInline(current);
      if (content.length > 0) blocks.push({ type: "paragraph", content });
      current = [];
    };
    for (const item of items) {
      if (isImage(item)) {
        flush();
        blocks.push(item);
      } else {
        current.push(item);
      }
    }
    flush();
    return blocks;
  }

  function paragraph(node: MdNode): PMNode[] {
    const children = node.children ?? [];
    // A link to a library document alone on its line is how an embed is written.
    const only = children.length === 1 ? children[0]! : undefined;
    if (only?.type === "link") {
      const target = resolve(only.url ?? "");
      if (target?.type === "document") {
        return [{ type: "documentEmbed", attrs: { documentId: target.documentId, title: plainText(only.children ?? []).trim() } }];
      }
    }
    return paragraphs(inline(children));
  }

  function atLeastParagraph(blocks: PMNode[]): PMNode[] {
    return blocks.length > 0 ? blocks : [{ type: "paragraph" }];
  }

  function list(node: MdNode): PMNode {
    const items = (node.children ?? []).map((item) => {
      let checked = typeof item.checked === "boolean" ? item.checked : undefined;
      let children = item.children ?? [];
      // "- [ ]" with nothing after it is not a task item to the parser, but it is one to a person.
      const text = children.length === 1 && children[0]!.type === "paragraph" ? plainText(children[0]!.children ?? []) : undefined;
      const emptyTask = checked === undefined && text !== undefined ? /^\[([ xX])\]$/.exec(text.trim()) : null;
      if (emptyTask) {
        checked = emptyTask[1] !== " ";
        children = [];
      }
      const content = flow(children);
      if (content[0]?.type !== "paragraph") content.unshift({ type: "paragraph" });
      return { checked, content };
    });
    if (items.some((item) => item.checked !== undefined)) {
      return {
        type: "taskList",
        content: items.map((item) => ({ type: "taskItem", attrs: { checked: item.checked === true }, content: item.content })),
      };
    }
    const content = items.map((item) => ({ type: "listItem", content: item.content }));
    return node.ordered ? { type: "orderedList", attrs: { start: node.start ?? 1 }, content } : { type: "bulletList", content };
  }

  function blockquote(node: MdNode): PMNode {
    const children = node.children ?? [];
    const first = children[0];
    const lead = first?.type === "paragraph" ? first.children?.[0] : undefined;
    const marker = lead?.type === "text" ? ALERT_MARKER.exec(lead.value ?? "") : null;
    if (!first || !lead || !marker) return { type: "blockquote", content: atLeastParagraph(flow(children)) };

    const rest = (lead.value ?? "").slice(marker[0].length);
    const remaining = [...(rest ? [{ ...lead, value: rest }] : []), ...(first.children ?? []).slice(1)];
    // "[!NOTE]" followed by a hard break leaves the break behind; it belongs to the marker.
    if (!rest && remaining[0]?.type === "break") remaining.shift();
    const body = [...(remaining.length > 0 ? [{ ...first, children: remaining }] : []), ...children.slice(1)];
    return {
      type: "callout",
      attrs: { variant: ALERTS[marker[1]!.toUpperCase()] ?? "info" },
      content: atLeastParagraph(flow(body)),
    };
  }

  function table(node: MdNode): PMNode | null {
    const rows = node.children ?? [];
    const width = Math.max(0, ...rows.map((row) => row.children?.length ?? 0));
    if (width === 0) return null;
    return {
      type: "table",
      content: rows.map((row, rowIndex) => ({
        type: "tableRow",
        // Every row gets the same number of cells; the editor's table model needs a rectangle.
        content: Array.from({ length: width }, (_, column) => ({
          type: rowIndex === 0 ? "tableHeader" : "tableCell",
          content: atLeastParagraph(paragraphs(inline(row.children?.[column]?.children ?? []))),
        })),
      })),
    };
  }

  function details(summary: PMNode[], content: PMNode[]): PMNode {
    const summaryNode: PMNode = summary.length > 0 ? { type: "detailsSummary", content: summary } : { type: "detailsSummary" };
    return { type: "details", content: [summaryNode, { type: "detailsContent", content: atLeastParagraph(content) }] };
  }

  /** Blocks of an HTML fragment found inside Markdown, cleaned by the HTML pipeline first. */
  function htmlBlocks(html: string): PMNode[] {
    if (!html.trim() || /^\s*<!--[\s\S]*-->\s*$/.test(html)) return [];
    try {
      // A lone opening tag ("<blockquote>" on its own line) converts to an empty shell; drop those.
      return flow(htmlToMdast(html).tree.children ?? []).filter(hasContent);
    } catch {
      warnings.add("Some HTML could not be converted and was left out.");
      return [];
    }
  }

  function htmlInline(html: string): PMNode[] {
    const out: PMNode[] = [];
    for (const block of htmlBlocks(html)) {
      for (const child of block.content ?? []) if (child.type === "text") pushInline(out, child);
    }
    return out;
  }

  /**
   * `<details>` and `<aside>` written the usual Markdown way: an HTML line that opens
   * the element, Markdown content, and an HTML line that closes it. Returns the toggle
   * or callout and the index of the closing node, or null when `children[start]` does
   * not open one that is closed further down.
   */
  function containerAt(children: MdNode[], start: number): { node: PMNode; end: number } | null {
    const head = children[start]!.value ?? "";
    const tag = /^\s*<(details|aside)[\s>]/i.exec(head)?.[1]?.toLowerCase();
    if (!tag) return null;
    let depth = balance(head, tag);
    if (depth <= 0) return null;
    let end = start;
    while (depth > 0 && end + 1 < children.length) {
      end += 1;
      if (children[end]!.type === "html") depth += balance(children[end]!.value ?? "", tag);
    }
    if (depth > 0) return null;

    const summary = tag === "details" ? /<summary[^>]*>([\s\S]*?)<\/summary\s*>/i.exec(head) : null;
    const leading = head.replace(new RegExp(`^\\s*<${tag}[^>]*>`, "i"), "").replace(summary?.[0] ?? "", "");
    const tail = children[end]!.value ?? "";
    const closeAt = tail.toLowerCase().lastIndexOf(`</${tag}`);
    const content = [...htmlBlocks(leading), ...flow(children.slice(start + 1, end)), ...htmlBlocks(tail.slice(0, Math.max(0, closeAt)))];
    const node =
      tag === "details"
        ? details(summary ? htmlInline(summary[1]!) : [], content)
        : { type: "callout", attrs: { variant: "info" }, content: atLeastParagraph(content) };
    return { node, end };
  }

  const isPhrasing = (node: MdNode): boolean => PHRASING.has(node.type);

  function flow(children: MdNode[]): PMNode[] {
    const out: PMNode[] = [];
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index]!;

      if (isPhrasing(node)) {
        // Inline content directly among blocks (HTML without <p>): gather it into a paragraph.
        let end = index;
        while (end + 1 < children.length && isPhrasing(children[end + 1]!)) end += 1;
        out.push(...paragraphs(inline(children.slice(index, end + 1))));
        index = end;
        continue;
      }

      switch (node.type) {
        case "paragraph":
          out.push(...paragraph(node));
          break;
        case "heading": {
          const content = inlineWithoutImages(node.children ?? []);
          // The editor has three heading levels; deeper ones become the smallest.
          const level = Math.min(3, Math.max(1, node.depth ?? 1));
          out.push(content.length > 0 ? { type: "heading", attrs: { level }, content } : { type: "heading", attrs: { level } });
          break;
        }
        case "blockquote":
          out.push(blockquote(node));
          break;
        case "list":
          if ((node.children ?? []).length > 0) out.push(list(node));
          break;
        case "code":
          out.push(
            node.value
              ? { type: "codeBlock", attrs: { language: node.lang || null }, content: [{ type: "text", text: node.value }] }
              : { type: "codeBlock", attrs: { language: node.lang || null } },
          );
          break;
        case "thematicBreak":
          out.push({ type: "horizontalRule" });
          break;
        case "table": {
          const mapped = table(node);
          if (mapped) out.push(mapped);
          break;
        }
        case "html": {
          const container = containerAt(children, index);
          if (container) {
            out.push(container.node);
            index = container.end;
          } else {
            out.push(...htmlBlocks(node.value ?? ""));
          }
          break;
        }
        case "outpostDetails":
          out.push(details(inlineWithoutImages(node.summary ?? []), flow(node.children ?? [])));
          break;
        case "definition":
          break;
        case "footnoteDefinition": {
          warnings.add("Footnotes are not supported; their text was kept as ordinary paragraphs.");
          const blocks = flow(node.children ?? []);
          const label: PMNode = { type: "text", text: `[^${node.label ?? node.identifier ?? ""}]: ` };
          if (blocks[0]?.type === "paragraph") blocks[0] = { type: "paragraph", content: [label, ...(blocks[0].content ?? [])] };
          else blocks.unshift({ type: "paragraph", content: [label] });
          out.push(...blocks);
          break;
        }
        default:
          warnings.add(`Something of the kind "${node.type}" is not supported and was kept as plain text.`);
          if (node.children) out.push(...flow(node.children));
          else if (typeof node.value === "string" && node.value.trim()) {
            out.push({ type: "paragraph", content: [{ type: "text", text: node.value }] });
          }
      }
    }
    return out;
  }

  const blocks = flow(root.children ?? []);
  return { blocks, warnings: [...warnings] };
}
