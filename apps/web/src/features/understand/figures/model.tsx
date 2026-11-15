import type { ExplainResponse } from "@outpost/shared";
import { useId, useState } from "react";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { cn, formatNumber, plural } from "@/lib/utils";
import { checkMarkers, splitMarkers } from "../lib/text";

/** The prompt that would be sent to a model. It is shown, never sent: Outpost does not run one. */
export function PromptBlock({ trace }: { trace: ExplainResponse }) {
  const [full, setFull] = useState(false);
  const { system, user, approxTokens } = trace.prompt;
  const long = user.length > 900;
  // Shorten at the ends of words, and say how much was left out.
  const head = user.slice(0, 700).replace(/\s+\S*$/, "");
  const tail = user.slice(-170).replace(/^\S*\s+/, "");
  const shownUser =
    full || !long
      ? user
      : `${head} …\n\n[${formatNumber(user.length - head.length - tail.length)} more characters of sources, not shown here]\n\n… ${tail}`;
  const part = "px-4 py-3 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words text-ink";
  return (
    <div className="overflow-hidden rounded-panel border border-dashed border-border-strong">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-dashed border-border-strong bg-surface px-4 py-2">
        <p className="text-small font-semibold text-ink">What would be sent. Outpost does not run a model, so nothing was.</p>
        <p className="tabular text-small text-ink-muted">about {formatNumber(approxTokens)} tokens</p>
      </div>
      <p className="px-4 pt-3 text-micro font-medium text-ink-muted">System: the standing instructions</p>
      <pre className={cn(part, "pt-1")}>{system}</pre>
      <p className="border-t border-border px-4 pt-3 text-micro font-medium text-ink-muted">User: the sources, then the question</p>
      <pre className={cn(part, "pt-1")}>{shownUser}</pre>
      {long ? (
        <div className="border-t border-border px-2 py-1.5">
          <button
            type="button"
            aria-expanded={full}
            onClick={() => setFull((value) => !value)}
            className="rounded-control px-2 py-1 text-small font-medium text-ink-muted hover:bg-surface-strong hover:text-ink"
          >
            {full ? "Show less of the prompt" : "Show the whole prompt"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Checks the citation markers in an answer the reader brings from their own model.
 * Nothing is generated here: the page only reads the text it is given and compares its
 * `[n]` markers with the sources that were supplied.
 */
export function CitationChecker({ trace }: { trace: ExplainResponse }) {
  const id = useId();
  const [answer, setAnswer] = useState("");
  const citations = trace.context.citations;
  const known = citations.map((citation) => citation.marker);
  const supplied = new Set(known);
  const result = checkMarkers(answer, known);
  const unused = known.filter((marker) => !result.used.includes(marker));
  const has = answer.trim().length > 0;
  const none = has && result.used.length === 0 && result.unsupported.length === 0;
  if (citations.length === 0)
    return (
      <p className="text-small text-ink-muted">
        This question produced no sources, so there are no markers an answer could rightly use. Any marker at all would be unsupported.
      </p>
    );

  return (
    <div>
      <label htmlFor={id} className="text-small font-medium text-ink">
        An answer from your own model
      </label>
      <p id={`${id}-hint`} className="mt-0.5 max-w-[68ch] text-small text-ink-muted">
        Paste an answer here to check its markers against the {plural(citations.length, "source")} above. The text stays in this page; it is
        not sent anywhere.
      </p>
      <Textarea
        id={id}
        aria-describedby={`${id}-hint`}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={4}
        spellCheck={false}
        className="mt-2 max-w-[46rem] text-small"
        placeholder="Paste text containing markers such as [1] and [2]"
      />
      {has ? (
        <div className="mt-3 max-w-[46rem]" aria-live="polite">
          <p className="font-serif text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-ink">
            {splitMarkers(answer).map((piece, index) =>
              piece.marker === null ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: pieces are a fixed, ordered split of the text
                <span key={index}>{piece.text}</span>
              ) : supplied.has(piece.marker) ? (
                <a
                  // biome-ignore lint/suspicious/noArrayIndexKey: pieces are a fixed, ordered split of the text
                  key={index}
                  href={`#source-${piece.marker}`}
                  className="rounded-[3px] bg-success-soft px-1 font-mono text-[0.8125rem] font-semibold text-success underline decoration-1 underline-offset-2"
                >
                  {piece.text}
                  <span className="sr-only"> (a supplied source)</span>
                </a>
              ) : (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: pieces are a fixed, ordered split of the text
                  key={index}
                  className="rounded-[3px] bg-danger-soft px-1 font-mono text-[0.8125rem] font-semibold text-danger line-through"
                >
                  {piece.text}
                  <span className="sr-only"> (not a supplied source)</span>
                </span>
              ),
            )}
          </p>
          <ul className="mt-3 grid gap-1.5 text-small text-ink">
            {none ? <li>No markers were found. An answer with no citations cannot be checked against its sources at all.</li> : null}
            {result.used.length > 0 ? (
              <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-2">
                <Badge tone="success" className="justify-self-start">
                  Supported
                </Badge>
                {result.used.map((marker) => `[${marker}]`).join(" ")} {result.used.length === 1 ? "points" : "point"} at a source that was
                supplied. Follow each one and read the source: the checker confirms the source exists, not that it says what the answer
                claims.
              </li>
            ) : null}
            {result.unsupported.length > 0 ? (
              <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-2">
                <Badge tone="danger" className="justify-self-start">
                  Unsupported
                </Badge>
                {result.unsupported.map((marker) => `[${marker}]`).join(" ")} {result.unsupported.length === 1 ? "refers" : "refer"} to no
                source that was supplied. The model made {result.unsupported.length === 1 ? "it" : "them"} up.
              </li>
            ) : null}
            {!none && unused.length > 0 ? (
              <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-2">
                <Badge className="justify-self-start">Not used</Badge>
                {unused.map((marker) => `[${marker}]`).join(" ")} {unused.length === 1 ? "was" : "were"} supplied but never cited. That is
                allowed; not every source is relevant.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The request that fetches the same context for the reader's own model, with their question filled in. */
export function contextCommand(query: string): string {
  const body = JSON.stringify({ query, limit: 8, maxChars: 6000 }).replace(/'/g, "'\\''");
  return `curl -s -X POST ${window.location.origin}/api/retrieval/context \\\n  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \\\n  -d '${body}'`;
}
