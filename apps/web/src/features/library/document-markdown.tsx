import type { MarkdownBlock, MarkdownInline, MarkdownListItem, MarkdownRef } from "@outpost/shared";
import { createContext, lazy, type ReactNode, Suspense, useContext, useEffect, useRef, useState } from "react";
import { Link, type To, useLocation } from "react-router";
import { DataTable } from "./document-table";
import MermaidDiagram from "./figures/mermaid-diagram";

// Only documents with a signal figure need the code that draws one.
const RadioViz = lazy(() => import("./figures/radio-viz"));

/** The words of a run of text, for a label or a comparison. */
export function plainText(runs: readonly MarkdownInline[]): string {
  return runs
    .map((run) => {
      if (run.t === "break") return " ";
      if (run.t === "anchor") return "";
      if (run.t === "image" || run.t === "picture") return run.alt;
      return "v" in run ? run.v : plainText(run.c);
    })
    .join("");
}

/**
 * What a book adds to a document: where its pictures are, and its other chapters. The
 * EPUB reader supplies it. Without it (a Markdown file) a picture is its description
 * and a link to a chapter is its words.
 */
export interface BookLinks {
  /** The address of a picture inside the book, or null when what the server sent is not a path. */
  picture(src: string): string | null;
  /** Where a chapter is, counted from 1; 0 is the contents. */
  chapter(chapter: number, anchor?: string): To | null;
}
export const BookLinksContext = createContext<BookLinks | null>(null);

/**
 * How a block of code is drawn, where the usual block that scrolls sideways is not wanted:
 * Help's guides show a command whole, with a button that copies it.
 */
export const CodeBlockContext = createContext<((code: string, lang?: string) => ReactNode) | null>(null);

/**
 * Ids as the server makes them: a document or collection id is letters and digits, a
 * catalogue entry id is lower-case words joined by dots or hyphens, a heading id is
 * letters, digits, hyphens and underscores. The server only sends what it looked up;
 * these are checked again here so that an address is never built from anything else.
 */
const RECORD_ID = /^[0-9A-Za-z]{1,40}$/;
const ENTRY_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const HEADING_ID = /^[\p{L}\p{M}\p{N}_-]{1,200}$/u;

/** The document being drawn, for the pictures it carries. Not set where there is no document (a preview, a test). */
const DocumentContext = createContext<string | undefined>(undefined);

/**
 * Where a picture the file carries is served. Built here from the document's own id and
 * a number, both checked: nothing a file wrote is ever part of the address.
 */
export function pictureAddress(documentId: string | undefined, picture: number | undefined): string | null {
  if (documentId === undefined || !RECORD_ID.test(documentId)) return null;
  if (typeof picture !== "number" || !Number.isInteger(picture) || picture < 1 || picture > 9999) return null;
  return `/api/documents/${documentId}/pictures/${picture}`;
}

/** What stands in for a picture that is not shown: the description its author gave it. */
function PictureDescription({ alt, caption, label }: { alt: string; caption?: string; label: string }) {
  return (
    <span className="doc-picture">
      <span className="doc-picture-label">{label} </span>
      {alt}
      {caption ? <span className="doc-picture-caption"> {caption}</span> : null}
    </span>
  );
}

/** A picture, or its description when the file does not carry it or it cannot be had. */
function Picture({ run }: { run: Extract<MarkdownInline, { t: "image" }> }) {
  const address = pictureAddress(useContext(DocumentContext), run.picture);
  const [failed, setFailed] = useState(false);
  if (!address) return <PictureDescription alt={run.alt} caption={run.caption} label="Picture, not shown here." />;
  // Its storage is unplugged, or the file changed under us: say so, and keep what the author wrote about it.
  if (failed) return <PictureDescription alt={run.alt} caption={run.caption} label="Picture, which could not be loaded." />;
  return (
    <img src={address} alt={run.alt} loading="lazy" decoding="async" className="doc-carried-picture" onError={() => setFailed(true)} />
  );
}

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

/** A link to a place in this document. The rest of the address stays as it is, so a chapter of a book stays that chapter. */
function Jump({ to, children }: { to: string; children: ReactNode }) {
  const { search } = useLocation();
  if (!HEADING_ID.test(to)) return children;
  return (
    <Link to={{ search, hash: `#${headingElementId(to)}` }} onClick={() => scrollToHeading(null, headingElementId(to))}>
      {children}
    </Link>
  );
}

/** What stands where a picture cannot be shown: what its author wrote about it. */
function PictureWords({ alt, caption }: { alt: string; caption?: ReactNode }) {
  return (
    <span className="doc-picture">
      <span className="doc-picture-label">Picture, not shown here. </span>
      {alt}
      {caption ? <span className="doc-picture-caption"> {caption}</span> : null}
    </span>
  );
}

/** A picture from inside a book. If it will not load (the file is damaged, or is not a picture after all) its description stands in. */
function BookPicture({ src, alt, standing }: { src: string; alt: string; standing?: boolean }) {
  const url = useContext(BookLinksContext)?.picture(src) ?? null;
  const [failed, setFailed] = useState(false);
  if (!url || failed) return alt || standing ? <PictureWords alt={alt} /> : null;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={standing ? "doc-book-picture" : "doc-book-picture doc-book-picture-inline"}
    />
  );
}

/** A link to another chapter of the same book. It stays in this tab: it is part of the book. */
function ChapterLink({ chapter, anchor, children }: { chapter: number; anchor?: string; children: ReactNode }) {
  const to = useContext(BookLinksContext)?.chapter(chapter, anchor) ?? null;
  if (!to) return children;
  return (
    <Link to={to} className="[overflow-wrap:anywhere]">
      {children}
    </Link>
  );
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
      case "sup":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <sup key={index}>
            <Inline runs={run.c} />
          </sup>
        );
      case "sub":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <sub key={index}>
            <Inline runs={run.c} />
          </sub>
        );
      case "jump":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <Jump key={index} to={run.to}>
            <Inline runs={run.c} />
          </Jump>
        );
      case "anchor":
        // A place a link can land on. It shows nothing and takes no room.
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return HEADING_ID.test(run.id) ? <span key={index} id={headingElementId(run.id)} className="doc-anchor" /> : null;
      case "picture":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <BookPicture key={index} src={run.src} alt={run.alt} />;
      case "chapter":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <ChapterLink key={index} chapter={run.chapter} anchor={run.anchor}>
            <Inline runs={run.c} />
          </ChapterLink>
        );
      case "ref":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <Ref key={index} run={run} />;
      case "image":
        // Shown only when the file carries the picture itself; otherwise what its author wrote about it is.
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <Picture key={index} run={run} />;
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
  const drawCode = useContext(CodeBlockContext);
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
      // Places with no words around them: nothing to read, only somewhere for a link to land.
      if (block.c.length > 0 && block.c.every((run) => run.t === "anchor")) {
        return (
          <span className="doc-anchors">
            <Inline runs={block.c} />
          </span>
        );
      }
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
      // A footnote or a sidebar is set apart like a quotation, but it is the author's own words.
      if (block.kind === "note") {
        return (
          <aside className={`doc-note ${NESTED}`}>
            <Blocks blocks={block.c} />
          </aside>
        );
      }
      return (
        <blockquote className={NESTED}>
          <Blocks blocks={block.c} />
        </blockquote>
      );
    case "figure":
      return (
        <figure className="doc-book-figure">
          <BookPicture src={block.src} alt={block.alt} standing />
          {block.caption ? (
            <figcaption>
              <Inline runs={block.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    case "code":
      // Two kinds of fenced block describe a picture. The text of either is only ever read as a
      // description: the diagram becomes an image, the figure is drawn from numbers and labels.
      if (block.lang === "mermaid") return <MermaidDiagram source={block.v} />;
      if (block.lang === "viz") {
        return (
          <Suspense
            fallback={
              <div className="doc-figure doc-figure-pending" aria-busy>
                Drawing the figure…
              </div>
            }
          >
            <RadioViz source={block.v} />
          </Suspense>
        );
      }
      if (drawCode) return drawCode(block.v, block.lang);
      return (
        <pre>
          <code>{block.v}</code>
        </pre>
      );
    case "table": {
      const [first = [], ...rest] = block.rows;
      const cell = (runs: MarkdownInline[]) => <Inline runs={runs} />;
      // A table with no header row is every row a body row; it is still named by what its first row holds.
      const body = block.plain ? block.rows : rest;
      return (
        <DataTable
          label={first.map(plainText).filter(Boolean).join(", ")}
          header={block.plain ? [] : first.map(cell)}
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
    else if (block.t === "figure" && block.caption) yield* within(block.caption);
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

/** A Markdown file, or a chapter of a book, with its formatting, drawn from the plain values the server sends. */
export function MarkdownDocument({
  blocks,
  title,
  empty = "This document has no text.",
  documentId,
}: {
  blocks: readonly MarkdownBlock[];
  /** The name the page already shows; a first heading that only repeats it is left out. */
  title: string;
  /** What to say when there is nothing to draw. */
  empty?: string;
  /** The document these blocks are of, so that pictures it carries can be shown. */
  documentId?: string;
}) {
  const sections = sectionsOf(blocks, title);
  const article = useRef<HTMLElement>(null);
  const { hash } = useLocation();

  // Arriving at "#h-some-heading" (from another chapter, or a link within this one) goes to that heading.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the headings are there once the blocks are drawn
  useEffect(() => {
    if (hash.startsWith("#h-")) scrollToHeading(article.current, decodeURIComponent(hash.slice(1)));
  }, [hash, blocks]);

  if (sections.length === 0) return <p className="text-ink-muted">{empty}</p>;
  const body = sections.map((section, index) => (
    <section
      // biome-ignore lint/suspicious/noArrayIndexKey: sections have no identity beyond their order
      key={index}
      className="[contain-intrinsic-size:auto_24rem] [content-visibility:auto] [&>*+*]:mt-[0.85em] [&>h2:first-child]:mt-[0.65em] first:[&>h2:first-child]:mt-0"
    >
      <Blocks blocks={section} />
    </section>
  ));
  return (
    <article ref={article} className="prose prose-doc" data-highlight-root="">
      <MissingBooks entries={missingRefs(blocks)} />
      <DocumentContext value={documentId}>{body}</DocumentContext>
    </article>
  );
}
