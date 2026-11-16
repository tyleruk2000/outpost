/**
 * A reply, drawn from the tree of plain values the server made of it.
 *
 * What a model writes is untrusted: it can be talked into writing anything, by the
 * person or by a passage of a document it was given. So nothing here is ever markup.
 * Each value becomes one of this app's own elements, and three things a document's
 * Markdown may do, a reply may not:
 *
 *  - a link is not a link. Its words are shown, and its address beside them as text,
 *    so nothing a model wrote can be followed with a click;
 *  - a picture is never fetched; only what was written about it is shown;
 *  - a diagram or figure block is shown as the code it is.
 *
 * The one thing in a reply that leads anywhere is a citation marker, and where it
 * leads was decided by Outpost, not by the model.
 */
import type { AnswerSource, MarkdownBlock, MarkdownInline, MarkdownListItem } from "@outpost/shared";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/features/library/document-meta";
import { DataTable } from "@/features/library/document-table";
import { Marker } from "@/features/search/answer";
import "./chat.css";

/** "[2]", and "[1, 3]" as some models write it. The same rule as the server's `checkCitations`. */
const MARKER = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;

/** The citation markers a reply uses, in the order they are first met. */
export function markersIn(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(MARKER)) for (const number of match[1]!.split(/[,;]/)) found.add(Number(number));
  return [...found];
}

type Sources = ReadonlyMap<number, AnswerSource>;

/** A run of words, with any citation markers in it made into buttons that show the passage. */
function Words({ text, sources }: { text: string; sources: Sources | null }): ReactNode {
  if (!sources) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    for (const number of match[1]!.split(/[,;]/)) {
      const marker = Number(number);
      out.push(<Marker key={`${at}-${marker}`} piece={{ kind: "marker", marker, source: sources.get(marker) }} />);
    }
    last = at + match[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const plain = (runs: readonly MarkdownInline[]): string =>
  runs
    .map((run) => {
      if (run.t === "break") return " ";
      if (run.t === "image" || run.t === "picture") return run.alt;
      // A place a link can land on: it shows nothing. A model's reply never has one; a book's chapter may.
      if (run.t === "anchor") return "";
      return "v" in run ? run.v : plain(run.c);
    })
    .join("");

function Inline({ runs, sources }: { runs: readonly MarkdownInline[]; sources: Sources | null }): ReactNode {
  return runs.map((run, index) => {
    switch (run.t) {
      case "text":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <Words key={index} text={run.v} sources={sources} />;
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
            <Inline runs={run.c} sources={sources} />
          </strong>
        );
      case "em":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <em key={index}>
            <Inline runs={run.c} sources={sources} />
          </em>
        );
      case "del":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <del key={index}>
            <Inline runs={run.c} sources={sources} />
          </del>
        );
      case "link": {
        // The words, then the address as words. Never something to click.
        const label = plain(run.c).trim();
        const address = run.href.replace(/^mailto:/, "");
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
          <span key={index} data-reply-link>
            <Inline runs={run.c} sources={sources} />
            {label && label !== address && label !== run.href ? (
              <span className="font-mono text-[0.8125em] text-ink-muted"> ({address})</span>
            ) : null}
          </span>
        );
      }
      case "image":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <span key={index}>{run.alt || run.caption || ""}</span>;
      case "jump":
      case "ref":
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph, in order
        return <Inline key={index} runs={run.c} sources={sources} />;
      default:
        return null;
    }
  });
}

/** Says "Copied" for a moment after the press, then goes back to what it said. */
export function useCopied(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    copied,
    async (text) => {
      if (!(await copyText(text))) return;
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    },
  ];
}

function CodeBlock({ lang, code }: { lang?: string; code: string }) {
  const [copied, copy] = useCopied();
  return (
    <figure className="chat-code">
      <figcaption>
        <span>{lang || "code"}</span>
        <Button variant="ghost" size="sm" className="font-sans max-md:h-11" onClick={() => void copy(code)}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span aria-live="polite">{copied ? "Copied" : "Copy code"}</span>
        </Button>
      </figcaption>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard */}
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

const NESTED = "[&>*+*]:mt-[0.5em]";

function Item({ item, sources }: { item: MarkdownListItem; sources: Sources | null }) {
  if (item.checked === undefined) {
    return (
      <li className={NESTED}>
        <Blocks blocks={item.c} sources={sources} />
      </li>
    );
  }
  return (
    <li data-checked={item.checked}>
      <label>
        <input type="checkbox" checked={item.checked} disabled readOnly aria-label={item.checked ? "Done" : "Not done"} />
      </label>
      <div className={NESTED}>
        <Blocks blocks={item.c} sources={sources} />
      </div>
    </li>
  );
}

function Block({ block, sources }: { block: MarkdownBlock; sources: Sources | null }): ReactNode {
  switch (block.t) {
    case "heading": {
      // The screen has its own first heading; a reply's headings sit under the conversation's.
      const Heading = block.depth <= 1 ? "h2" : block.depth === 2 ? "h3" : "h4";
      return (
        <Heading>
          <Inline runs={block.c} sources={sources} />
        </Heading>
      );
    }
    case "paragraph":
      return (
        <p>
          <Inline runs={block.c} sources={sources} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: items have no identity beyond their order
        <Item key={index} item={item} sources={sources} />
      ));
      if (block.ordered) return <ol start={block.start}>{items}</ol>;
      return <ul data-type={block.items.some((item) => item.checked !== undefined) ? "taskList" : undefined}>{items}</ul>;
    }
    case "quote":
      return (
        <blockquote className={NESTED}>
          <Blocks blocks={block.c} sources={sources} />
        </blockquote>
      );
    case "code":
      return <CodeBlock lang={block.lang} code={block.v} />;
    case "table": {
      const [header = [], ...body] = block.rows;
      const cell = (runs: MarkdownInline[]) => <Inline runs={runs} sources={sources} />;
      return (
        <DataTable label={header.map(plain).filter(Boolean).join(", ")} header={header.map(cell)} body={body.map((row) => row.map(cell))} />
      );
    }
    case "rule":
      return <hr />;
    default:
      return null;
  }
}

function Blocks({ blocks, sources }: { blocks: readonly MarkdownBlock[]; sources: Sources | null }): ReactNode {
  return blocks.map((block, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity beyond their order
    <Block key={index} block={block} sources={sources} />
  ));
}

export function ReplyBody({
  blocks,
  sources,
  writing = false,
}: {
  blocks: readonly MarkdownBlock[];
  /** The passages the model was given. With any, `[n]` in the reply becomes a marker that shows passage n. */
  sources?: readonly AnswerSource[];
  writing?: boolean;
}) {
  const byMarker = sources && sources.length > 0 ? new Map(sources.map((source) => [source.marker, source])) : null;
  return (
    <div className="prose prose-reply" data-writing={writing || undefined} data-testid="reply-text">
      <Blocks blocks={blocks} sources={byMarker} />
    </div>
  );
}
