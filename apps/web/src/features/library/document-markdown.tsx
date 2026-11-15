import type { MarkdownBlock, MarkdownInline, MarkdownListItem, MarkdownRef } from "@outpost/shared";
import { type ReactNode, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { DataTable } from "./document-table";

/** The words of a run of text, for a label or a comparison. */
export function plainText(runs: readonly MarkdownInline[]): string {
  return runs.map((run) => (run.t === "break" ? " " : run.t === "image" ? run.alt : "v" in run ? run.v : plainText(run.c))).join("");
}

/**
 * Ids as the server makes them: a document or collection id is letters and digits, a
 * catalogue entry id is lower-case words joined by dots or hyphens, a heading id is
 * letters, digits, hyphens and underscores. The server only sends what it looked up;
 * these are checked again here so that an address is never built from anything else.
 */
const RECORD_ID = /^[0-9A-Za-z]{1,40}$/;
const ENTRY_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const HEADING_ID = /^[\p{L}\p{M}\p{N}_-]{1,200}$/u;

/** The id a heading carries in the page. The prefix keeps a file's words from naming anything else in it. */
export const headingElementId = (id: string) => `h-${id}`;

/**
 * Where a link into Outpost leads: the chapter's document, else the book's contents,
 * else the entry in Explore, where it can be added. Null when the server sent something
 * that is not an id, in which case the words are shown and nothing is linked.
 */
export function refTarget(ref: Pick<MarkdownRef, "entryId" | "collectionId" | "documentId" | "anchor">): {
  to: { pathname: string; search?: string; hash?: string };
  inLibrary: boolean;
} | null {
  if (ref.documentId !== undefined) {
    if (!RECORD_ID.test(ref.documentId)) return null;
    const hash = ref.anchor !== undefined && HEADING_ID.test(ref.anchor) ? `#${headingElementId(ref.anchor)}` : undefined;
    return { to: { pathname: `/library/documents/${ref.documentId}`, ...(hash ? { hash } : {}) }, inLibrary: true };
  }
  if (ref.collectionId !== undefined) {
    return RECORD_ID.test(ref.collectionId) ? { to: { pathname: `/library/collections/${ref.collectionId}` }, inLibrary: true } : null;
  }
  if (typeof ref.entryId !== "string" || ref.entryId.length > 120 || !ENTRY_ID.test(ref.entryId)) return null;
  return { to: { pathname: "/explore", search: `?entry=${encodeURIComponent(ref.entryId)}` }, inLibrary: false };
}

/** A link to a chapter, a book or a catalogue entry. It stays in this tab: it is part of Outpost. */
function Ref({ run }: { run: MarkdownRef }) {
  const target = refTarget(run);
  if (!target) return <Inline runs={run.c} />;
  if (target.inLibrary) {
    return (
      <Link to={target.to} className="[overflow-wrap:anywhere]">
        <Inline runs={run.c} />
      </Link>
    );
  }
  // Not in the library: the words read as part of the sentence, marked quietly, and lead to where it can be added.
  const where = `In “${run.entryName}”, which is not in your library. Find it in Explore.`;
  return (
    <Link to={target.to} title={where} data-ref="missing" className="doc-ref-missing [overflow-wrap:anywhere]">
      <Inline runs={run.c} />
      <span className="sr-only"> ({where})</span>
    </Link>
  );
}

function scrollToHeading(root: ParentNode | null, elementId: string): boolean {
  // Looked up by id, never by a selector built from the address.
  const target = document.getElementById(elementId);
  if (!target || (root && !root.contains(target))) return false;
  target.scrollIntoView({ block: "start" });
  return true;
}

function Inline({ runs }: { runs: readonly MarkdownInline[] }): ReactNode {
  return runs.map((run, index) => {
    switch (run.t) {
      case "text":
        return run.v;
      case "code":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <code key={index}>{run.v}</code>;
      case "break":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <br key={index} />;
      case "strong":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <strong key={index}>
            <Inline runs={run.c} />
          </strong>
        );
      case "em":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <em key={index}>
            <Inline runs={run.c} />
          </em>
        );
      case "del":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <del key={index}>
            <Inline runs={run.c} />
          </del>
        );
      case "jump":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        if (!HEADING_ID.test(run.to)) return <Inline key={index} runs={run.c} />;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <Link key={index} to={{ hash: `#${headingElementId(run.to)}` }} onClick={() => scrollToHeading(null, headingElementId(run.to))}>
            <Inline runs={run.c} />
          </Link>
        );
      case "ref":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <Ref key={index} run={run} />;
      case "image":
        // The picture is not here; what its author wrote about it is.
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <span key={index} className="doc-picture">
            <span className="doc-picture-label">Picture, not shown here. </span>
            {run.alt}
            {run.caption ? <span className="doc-picture-caption"> {run.caption}</span> : null}
          </span>
        );
      case "link":
        // The server sends a link only for a web or mail address; it opens away from Outpost.
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <a key={index} href={run.href} target="_blank" rel="noreferrer noopener" className="[overflow-wrap:anywhere]">
            <Inline runs={run.c} />
          </a>
        );
      default:
        return null;
    }
  });
}

/** Space between the blocks inside a list item or a quotation. */
const NESTED = "[&>*+*]:mt-[0.55em]";

function Item({ item }: { item: MarkdownListItem }) {
  if (item.checked === undefined) {
    return (
      <li className={NESTED}>
        <Blocks blocks={item.c} />
      </li>
    );
  }
  return (
    <li data-checked={item.checked}>
      <label>
        <input type="checkbox" checked={item.checked} disabled readOnly aria-label={item.checked ? "Done" : "Not done"} />
      </label>
      <div className={NESTED}>
        <Blocks blocks={item.c} />
      </div>
    </li>
  );
}

function Block({ block }: { block: MarkdownBlock }): ReactNode {
  switch (block.t) {
    case "heading": {
      // The page already has the document's name as its first heading.
      const Heading = block.depth <= 1 ? "h2" : block.depth === 2 ? "h3" : "h4";
      return (
        <Heading id={block.id && HEADING_ID.test(block.id) ? headingElementId(block.id) : undefined} className="scroll-mt-4">
          <Inline runs={block.c} />
        </Heading>
      );
    }
    case "paragraph":
      return (
        <p>
          <Inline runs={block.c} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: items have no identity beyond their order
        <Item key={index} item={item} />
      ));
      if (block.ordered) return <ol start={block.start}>{items}</ol>;
      return <ul data-type={block.items.some((item) => item.checked !== undefined) ? "taskList" : undefined}>{items}</ul>;
    }
    case "quote":
      return (
        <blockquote className={NESTED}>
          <Blocks blocks={block.c} />
        </blockquote>
      );
    case "code":
      return (
        <pre>
          <code>{block.v}</code>
        </pre>
      );
    case "table": {
      const [header = [], ...body] = block.rows;
      const cell = (runs: MarkdownInline[]) => <Inline runs={runs} />;
      return (
        <DataTable
          label={header.map(plainText).filter(Boolean).join(", ")}
          header={header.map(cell)}
          body={body.map((row) => row.map(cell))}
        />
      );
    }
    case "rule":
      return <hr />;
    default:
      return null;
  }
}

function Blocks({ blocks }: { blocks: readonly MarkdownBlock[] }): ReactNode {
  return blocks.map((block, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity beyond their order
    <Block key={index} block={block} />
  ));
}

const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The blocks under each main heading, so the browser can skip laying out the parts of a
 * long file that are far off screen. A file that opens with its own name as a heading
 * does not say it twice: the page shows that name already.
 */
export function sectionsOf(blocks: readonly MarkdownBlock[], title: string): MarkdownBlock[][] {
  const first = blocks[0];
  const body = first?.t === "heading" && first.depth === 1 && sameWords(plainText(first.c), title) ? blocks.slice(1) : blocks;
  const sections: MarkdownBlock[][] = [];
  for (const block of body) {
    const current = sections.at(-1);
    if (!current || (block.t === "heading" && block.depth <= 2)) sections.push([block]);
    else current.push(block);
  }
  return sections;
}

/** Every run of text in a tree of blocks, wherever it sits. */
function* runsIn(blocks: readonly MarkdownBlock[]): Generator<MarkdownInline> {
  function* within(runs: readonly MarkdownInline[]): Generator<MarkdownInline> {
    for (const run of runs) {
      yield run;
      if ("c" in run) yield* within(run.c);
    }
  }
  for (const block of blocks) {
    if (block.t === "heading" || block.t === "paragraph") yield* within(block.c);
    else if (block.t === "quote") yield* runsIn(block.c);
    else if (block.t === "list") for (const item of block.items) yield* runsIn(item.c);
    else if (block.t === "table") for (const row of block.rows) for (const cell of row) yield* within(cell);
  }
}

/** The catalogue entries this document links to that are not in the library, in the order they are first met. */
export function missingRefs(blocks: readonly MarkdownBlock[]): Array<{ entryId: string; entryName: string }> {
  const found = new Map<string, string>();
  for (const run of runsIn(blocks)) {
    if (run.t !== "ref" || found.has(run.entryId)) continue;
    const target = refTarget(run);
    if (target && !target.inLibrary) found.set(run.entryId, run.entryName);
  }
  return [...found].map(([entryId, entryName]) => ({ entryId, entryName }));
}

/** Says once, above the text, what the quietly marked links are and where to get what they lead to. */
function MissingBooks({ entries }: { entries: Array<{ entryId: string; entryName: string }> }) {
  if (entries.length === 0) return null;
  return (
    <p className="doc-refs-note">
      Some links in this text have a dotted underline. They lead to{" "}
      {entries.map((entry, index) => (
        <span key={entry.entryId}>
          {index > 0 ? (index === entries.length - 1 ? " and " : ", ") : null}
          <Link to={{ pathname: "/explore", search: `?entry=${encodeURIComponent(entry.entryId)}` }}>{entry.entryName}</Link>
        </span>
      ))}
      , which {entries.length === 1 ? "is" : "are"} not in your library. Add {entries.length === 1 ? "it" : "them"} from Explore and the
      links open the chapter they name.
    </p>
  );
}

/** A Markdown file with its formatting, drawn from the plain values the server sends. */
export function MarkdownDocument({ blocks, title }: { blocks: readonly MarkdownBlock[]; title: string }) {
  const sections = sectionsOf(blocks, title);
  const article = useRef<HTMLElement>(null);
  const { hash } = useLocation();

  // Arriving at "#h-some-heading" (from another chapter, or a link within this one) goes to that heading.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the headings are there once the blocks are drawn
  useEffect(() => {
    if (hash.startsWith("#h-")) scrollToHeading(article.current, decodeURIComponent(hash.slice(1)));
  }, [hash, blocks]);

  if (sections.length === 0) return <p className="text-ink-muted">This document has no text.</p>;
  return (
    <article ref={article} className="prose prose-doc">
      <MissingBooks entries={missingRefs(blocks)} />
      {sections.map((section, index) => (
        <section
          // biome-ignore lint/suspicious/noArrayIndexKey: sections have no identity beyond their order
          key={index}
          className="[contain-intrinsic-size:auto_24rem] [content-visibility:auto] [&>*+*]:mt-[0.85em] [&>h2:first-child]:mt-[0.65em] first:[&>h2:first-child]:mt-0"
        >
          <Blocks blocks={section} />
        </section>
      ))}
    </article>
  );
}
