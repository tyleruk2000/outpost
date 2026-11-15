import type { MarkdownBlock, MarkdownInline, MarkdownListItem } from "@outpost/shared";
import type { ReactNode } from "react";
import { DataTable } from "./document-table";

/** The words of a run of text, for a label or a comparison. */
export function plainText(runs: readonly MarkdownInline[]): string {
  return runs.map((run) => (run.t === "break" ? " " : "v" in run ? run.v : plainText(run.c))).join("");
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
        <Heading>
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

/** A Markdown file with its formatting, drawn from the plain values the server sends. */
export function MarkdownDocument({ blocks, title }: { blocks: readonly MarkdownBlock[]; title: string }) {
  const sections = sectionsOf(blocks, title);
  if (sections.length === 0) return <p className="text-ink-muted">This document has no text.</p>;
  return (
    <article className="prose prose-doc">
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
