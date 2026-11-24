/**
 * "Answer from my library" on the Search screen: one question, one answer written by
 * the person's own language model from passages of their library, with its sources.
 *
 * Two kinds of words appear here and they must never be confused. What the model
 * wrote is set in the interface face, under a heading that says it was generated and
 * by what. What the library says is quoted in the reading face, exactly as stored,
 * with a link to the place it came from. The answer is an interpretation; the
 * passages are the source.
 *
 * Nothing in an answer is acted on. It is drawn as words: no markup, no links other
 * than the citation markers, which lead to sources Outpost itself supplied.
 */
import type { AnswerSource, AnswersStatus, SearchMode } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { RotateCw, ShieldAlert, Square, TextQuote, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { kindOf } from "@/components/search-hit";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { plural } from "@/lib/utils";
import { type AnswerState, type AnswerStore, answerStore, isWorking, useAnswer } from "./answer-store";
import { type AnswerPiece, placeWords, readAnswer, whereOf } from "./answer-text";

export const SETTINGS_ANSWERS = "/settings#answers-title";

export const useAnswersStatus = () =>
  useQuery({ queryKey: ["answers", "status"], queryFn: () => api.get<AnswersStatus>("/api/answers/status"), staleTime: 30_000 });

/** A source's address is only ever followed when it is a route inside Outpost. */
export const routeOf = (url: string) => (url.startsWith("/") && !url.startsWith("//") ? url : null);

const openWords = (source: AnswerSource) =>
  source.page ? `Open it at page ${source.page}` : source.kind === "note" ? "Open the page" : "Open the document";

/** The lamp: something is alive right now. */
function Lamp({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-[2px] bg-lamp motion-safe:animate-pulse ${className}`} />;
}

/** A citation marker in the answer. Pressing it shows the passage it points to, beside the claim it supports. */
export function Marker({ piece }: { piece: Extract<AnswerPiece, { kind: "marker" }> }) {
  const source = piece.source;
  if (!source) {
    return (
      <span className="rounded-[3px] bg-danger-soft px-1 font-mono text-[0.8125rem] font-semibold whitespace-nowrap text-danger line-through">
        [{piece.marker}]<span className="sr-only"> (refers to no source the model was given)</span>
      </span>
    );
  }
  const route = routeOf(source.url);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Source ${source.marker}: ${whereOf(source)}. Show the passage.`}
        className="relative rounded-[3px] bg-primary-soft px-1 py-px font-mono pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3 text-[0.8125rem] font-semibold whitespace-nowrap text-primary-soft-ink decoration-1 underline-offset-2 hover:underline data-[state=open]:underline"
      >
        [{source.marker}]
      </PopoverTrigger>
      <PopoverContent className="w-[min(25rem,calc(100vw-2rem))] p-0">
        <div className="max-h-[min(20rem,55vh)] overflow-y-auto px-3.5 py-3">
          <p className="text-small font-semibold text-ink">
            <span className="tabular font-mono">[{source.marker}]</span> {whereOf(source)}
          </p>
          <blockquote className="mt-2 font-serif text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">{source.quote}</blockquote>
        </div>
        <p className="border-t border-border px-3.5 py-2 text-small text-ink-muted">
          Quoted from your library, exactly as stored.{" "}
          {route ? (
            <Link to={route} className="font-medium text-primary underline decoration-1 underline-offset-2">
              {openWords(source)}
            </Link>
          ) : null}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** What the model wrote, as words. Never markup. */
function AnswerText({ answer }: { answer: AnswerState }) {
  const paragraphs = readAnswer(answer.text, answer.sources);
  const writing = answer.phase === "writing";
  return (
    <div className="max-w-[68ch] text-body leading-relaxed text-ink [overflow-wrap:anywhere]" data-testid="answer-text">
      {paragraphs.map((pieces, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are a fixed, ordered split of the text
        <p key={index} className="mt-3 whitespace-pre-line first:mt-0">
          {pieces.map((piece, at) =>
            piece.kind === "marker" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: pieces are a fixed, ordered split of the text
              <Marker key={at} piece={piece} />
            ) : piece.strong ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: pieces are a fixed, ordered split of the text
              <strong key={at} className="font-semibold">
                {piece.text}
              </strong>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: pieces are a fixed, ordered split of the text
              <span key={at}>{piece.text}</span>
            ),
          )}
          {writing && index === paragraphs.length - 1 ? <Lamp className="ml-1.5" /> : null}
        </p>
      ))}
    </div>
  );
}

/** Markers to numbers no passage carried, and what was done with each: pointed at the passage that holds the words, or taken out. */
export function StrayMarkers({
  unsupported,
  repointed,
  count,
  className,
}: {
  unsupported: number[];
  repointed: Array<{ from: number; to: number }>;
  count: number;
  className?: string;
}) {
  const moved = new Map(repointed.map((entry) => [entry.from, entry.to]));
  const dropped = unsupported.filter((marker) => !moved.has(marker));
  const list = (markers: number[]) => markers.map((marker) => `[${marker}]`).join(" ");
  const given = count === 1 ? "one passage, numbered 1" : `${plural(count, "passage")}, numbered 1 to ${count}`;
  return (
    <Notice
      tone="warning"
      className={className}
      title={
        dropped.length > 0
          ? `${list(dropped)} taken out: no passage has ${dropped.length === 1 ? "that number" : "those numbers"}`
          : `${list([...moved.keys()])} pointed at the passage that holds the words`
      }
    >
      The model was given {given}, and cited {list(unsupported)}.
      {[...moved].map(([from, to]) => (
        <span key={from}>
          {" "}
          The words marked [{from}] are, word for word, in passage [{to}], so that marker now points there.
        </span>
      ))}
      {dropped.length > 0
        ? ` ${dropped.length === 1 ? "That marker was" : "Those markers were"} taken out, so whatever ${dropped.length === 1 ? "it was" : "they were"} attached to stands without a source.`
        : ""}
    </Notice>
  );
}

function SourceRow({ source, state, startOpen }: { source: AnswerSource; state: "cited" | "not cited" | null; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  useEffect(() => setOpen(startOpen), [startOpen]);
  const id = useId();
  const kind = kindOf(source.kind);
  const route = routeOf(source.url);
  const where = whereOf(source);
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 py-3">
      <span className="tabular pt-px font-mono text-small font-semibold text-ink" aria-hidden>
        [{source.marker}]
      </span>
      <div className="min-w-0">
        <p className="text-small">
          <span className="min-w-0">
            <kind.icon aria-hidden className="mr-1.5 inline size-3.5 -translate-y-px text-ink-muted" />
            <span className="sr-only">
              Source {source.marker}, {kind.label.toLowerCase()}:{" "}
            </span>
            {route ? (
              <Link to={route} className="font-medium text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline">
                {where}
              </Link>
            ) : (
              <span className="font-medium text-ink">{where}</span>
            )}
          </span>
        </p>
        {/* Whether it was cited sits on the same line as the button, so that it is in the same place on every row. */}
        <div className="mt-0.5 flex items-center justify-between gap-4">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
            className="-ml-1.5 inline-flex min-h-6 items-center rounded-control px-1.5 py-1 text-small font-medium text-primary hover:bg-surface-strong max-md:min-h-11 md:pointer-coarse:min-h-11"
          >
            {open ? "Hide the passage" : "Show the passage"}
          </button>
          {state ? (
            <span className="shrink-0 text-micro text-ink-muted">{state === "cited" ? "Cited in the answer" : "Not cited"}</span>
          ) : null}
        </div>
        {open ? (
          <blockquote id={id} className="mt-1 max-w-[70ch] font-serif text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">
            {source.quote}
          </blockquote>
        ) : null}
      </div>
    </li>
  );
}

function AnswerPanel({
  answer,
  status,
  store,
  mode,
  referenceResults,
}: {
  answer: AnswerState;
  status: AnswersStatus | undefined;
  store: AnswerStore;
  mode: SearchMode | undefined;
  referenceResults: number;
}) {
  const titleId = useId();
  const working = isWorking(answer.phase);
  const where = placeWords(status?.place ?? null, answer.server || status?.server || null);
  const count = answer.sources.length;
  const settled = answer.phase === "done";
  const declined = settled && answer.declined;
  const uncited = settled && !declined && answer.used.length === 0 && answer.unsupported.length === 0;
  const unfinished = answer.phase === "stopped" || answer.phase === "failed";
  // The heading names the model once it has the passages, and never credits it with an answer it did not write.
  const written = Boolean(answer.model) && (answer.text.length > 0 || answer.phase === "waiting");

  const announce =
    answer.phase === "finding"
      ? "Finding passages in your library."
      : answer.phase === "waiting"
        ? answer.loading
          ? "The model is being loaded into memory."
          : "The model is reading the passages."
        : answer.phase === "writing"
          ? "The answer is being written."
          : answer.phase === "done"
            ? declined
              ? "The model said your library does not seem to cover this."
              : "The answer is finished."
            : answer.phase === "stopped"
              ? "Stopped."
              : "";

  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-panel border border-border-strong">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={titleId} className="text-small font-semibold text-ink">
            Generated answer
          </h2>
          <p className="mt-0.5 text-small text-ink-muted">
            {written ? (
              <>
                Written by <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{answer.model}</span>, a language
                model {where}, for{" "}
              </>
            ) : (
              "For "
            )}
            “{answer.question}”.{written ? " It is the model’s wording, not a source." : working ? "" : " Nothing was written."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {working ? (
            <Button size="sm" onClick={() => store.stop()}>
              <Square /> Stop
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => void store.ask(answer.question, mode)}>
                <RotateCw /> Ask again
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Close this answer" onClick={() => store.clear()}>
                <X />
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-4 px-4 py-4">
        <p className="sr-only" role="status">
          {announce}
        </p>

        {answer.safetyCritical && count > 0 ? (
          <Notice tone="warning" icon={<ShieldAlert aria-hidden />} title="Read the passages themselves before acting on this">
            At least one is about medicine, first aid, treating water or preserving food, where a reworded dose, time or temperature can
            hurt someone. Those passages are open below, quoted exactly. Go by them, not by the model’s wording.
          </Notice>
        ) : null}

        {answer.phase === "finding" ? (
          <p className="flex items-center gap-2.5 text-small text-ink">
            <Lamp /> Finding passages in your library
          </p>
        ) : null}
        {answer.phase === "waiting" ? (
          <p className="flex items-baseline gap-2.5 text-small text-ink" data-testid="answer-waiting">
            <Lamp className="translate-y-px" />
            {answer.loading ? (
              <span>
                The model server is loading <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{answer.model}</span> into
                memory before it can read {plural(count, "passage")}: it said the model was not loaded.{" "}
                <span className="text-ink-muted">
                  That happens the first time a model is used and after it has sat idle. Outpost waits up to 3 minutes for the first word.
                </span>
              </span>
            ) : (
              <span>
                The model is reading {plural(count, "passage")}.{" "}
                <span className="text-ink-muted">On a small machine it can be a minute or more before the first word.</span>
              </span>
            )}
          </p>
        ) : null}

        {answer.phase === "nothing" ? (
          <div className="max-w-[60ch]">
            <p className="font-medium text-ink">
              Nothing in your documents, notes or books matches this question, so the model was not asked.
            </p>
            <p className="mt-1 text-small text-ink-muted">
              An answer written from no passages would be the model’s guess, not your library’s. Try other words, or fewer.
              {referenceResults > 0
                ? ` The ${plural(referenceResults, "reference article")} in the results below ${referenceResults === 1 ? "was" : "were"} not read: answers are written from documents, notes and book chapters only.`
                : " Reference collections such as Wikipedia are not read for answers."}
            </p>
          </div>
        ) : null}

        {declined ? (
          <div className="max-w-[60ch]" data-testid="answer-declined">
            <p className="font-medium text-ink">Your library does not seem to cover this.</p>
            <p className="mt-1 text-small text-ink-muted">
              The model read {count === 1 ? "the passage" : `the ${plural(count, "passage")}`} below and said{" "}
              {count === 1 ? "it does" : "they do"} not hold the answer, so nothing here is cited. A small model sometimes says this when a
              passage does hold it: if you expected one to, read {count === 1 ? "it" : "them"}.
              {answer.text ? " What the model wrote follows, without markers." : ""}
            </p>
          </div>
        ) : null}

        {answer.text ? <AnswerText answer={answer} /> : null}

        {answer.phase === "stopped" ? (
          <p className="text-small text-ink-muted">
            {answer.text ? "Stopped. The answer above is unfinished." : "Stopped before the model had written anything."}
          </p>
        ) : null}
        {answer.phase === "failed" ? (
          <Notice tone="danger" title={answer.text ? "The answer above is unfinished" : "No answer was written"}>
            {answer.error}
            {answer.failure &&
            ["no-such-model", "not-a-chat-model", "no-chat-endpoint", "context-too-long", "refused"].includes(answer.failure) ? (
              <>
                {" "}
                <Link to={SETTINGS_ANSWERS} className="font-medium underline underline-offset-2">
                  Open Settings
                </Link>
              </>
            ) : null}
          </Notice>
        ) : null}

        {settled && !declined && answer.unsupported.length > 0 ? (
          <StrayMarkers unsupported={answer.unsupported} repointed={answer.repointed} count={count} />
        ) : null}
        {settled && !declined && answer.citesAll ? (
          <p className="text-small text-ink-muted">
            The answer cites every passage it was given, so its markers do not show which passage each statement rests on.
          </p>
        ) : null}
        {uncited ? (
          <Notice tone="warning" title="This answer cites no source">
            If it says the passages do not hold the answer, that is the honest outcome. Otherwise nothing in it can be checked against your
            library, so do not rely on it.
          </Notice>
        ) : null}
        {settled && answer.cutShort ? (
          <p className="text-small text-ink-muted">The model reached its length limit, so the answer stops before its end.</p>
        ) : null}
      </div>

      {count > 0 ? (
        <div className="border-t border-border px-4 pt-3 pb-4">
          <h3 className="text-small font-semibold text-ink">
            {declined
              ? count === 1
                ? "The passage the model read"
                : `The ${plural(count, "passage")} the model read`
              : count === 1
                ? "The passage the model was given"
                : `The ${plural(count, "passage")} the model was given`}
          </h3>
          <p className="mt-0.5 text-small text-ink-muted">
            Quoted from your library, exactly as stored.{" "}
            {answer.searchedFor && answer.searchedFor !== answer.question ? `Found by searching for “${answer.searchedFor}”. ` : ""}
            {declined
              ? ""
              : unfinished || settled || answer.text
                ? `Check the answer against ${count === 1 ? "it" : "them"}.`
                : `The answer may only draw on ${count === 1 ? "this" : "these"}.`}
            {answer.omitted > 0 ? ` ${plural(answer.omitted, "more passage")} matched but did not fit the context budget.` : ""}
          </p>
          {answer.leftOut > 0 ? (
            <p className="mt-1 text-small text-ink" data-testid="answer-left-out">
              {plural(answer.leftOut, "passage")} left out: the model server said all {count + answer.leftOut} were more than the model can
              read at once, so Outpost asked again with the {count === 1 ? "best one" : `best ${count}`}.
            </p>
          ) : null}
          <ol className="mt-2 divide-y divide-border border-y border-border">
            {answer.sources.map((source) => (
              <SourceRow
                key={source.marker}
                source={source}
                state={settled && !declined ? (answer.used.includes(source.marker) ? "cited" : "not cited") : null}
                startOpen={source.safetyCritical}
              />
            ))}
          </ol>
          <p className="mt-3 max-w-[70ch] text-small text-ink-muted">
            Answers are written from documents, notes and book chapters only.{" "}
            {referenceResults > 0
              ? `The ${plural(referenceResults, "reference article")} in the results below ${referenceResults === 1 ? "was" : "were"} not read.`
              : "Reference collections such as Wikipedia are not read."}{" "}
            This answer is not saved anywhere: it goes when this tab is closed or reloaded.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The part of the Search screen that offers an answer and shows it. It sits between the
 * search box and the results, which stay where they are: an answer is an extra, asked
 * for with a button, never a replacement for the list of what was found.
 */
export function AnswerArea({
  q,
  mode,
  referenceResults = 0,
  store = answerStore,
}: {
  q: string;
  mode?: SearchMode;
  /** Reference articles among the search results, which answers do not read. */
  referenceResults?: number;
  store?: AnswerStore;
}) {
  const status = useAnswersStatus().data;
  const answer = useAnswer(store);
  const question = q.trim();
  const has = answer.phase !== "idle";
  const forThis = has && answer.question === question;
  if (!has && !status?.enabled) return null;

  const offer = Boolean(status?.ready && question && !forThis);
  return (
    <div className="mt-4 grid max-w-[46rem] gap-4">
      {offer && status ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={() => void store.ask(question, mode)}>
            <TextQuote /> Answer from my library
          </Button>
          <p className="min-w-56 flex-1 text-small text-ink-muted">
            <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{status.model}</span>, a language model{" "}
            {placeWords(status.place, status.server)}, writes a short answer from passages of your documents, notes and books, and cites
            them. It can be wrong: check it against the passages listed with it.
            {status.place === "elsewhere" ? " The question and those passages are sent to that address." : ""}
          </p>
        </div>
      ) : null}
      {status?.enabled && !status.ready && question && !has ? (
        <p className="text-small text-ink-muted">
          Answers from your library are switched on but not ready. {status.reason}{" "}
          <Link to={SETTINGS_ANSWERS} className="text-primary underline underline-offset-2">
            Open Settings
          </Link>
        </p>
      ) : null}
      {has ? <AnswerPanel answer={answer} status={status} store={store} mode={mode} referenceResults={referenceResults} /> : null}
    </div>
  );
}

/** One line for the empty Search screen, shown only when a model has been set up. */
export function AnswerHint() {
  const status = useAnswersStatus().data;
  if (!status?.ready) return null;
  return (
    <p className="mt-4 text-small">
      With a question typed, <span className="font-medium text-ink">Answer from my library</span> has your own language model (
      <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{status.model}</span>) write a short answer from your
      documents, with the passages it used.
    </p>
  );
}
