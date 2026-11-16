/**
 * A conversation as it reads: who said what, in order, like the pages of a logbook.
 *
 * There are no speech bubbles. Who is speaking is written in the margin (above the
 * text on a narrow screen), the person's words are set a little heavier than the
 * model's, and a hairline separates one exchange from the next. A model's words are in
 * the interface face; passages quoted from the library are in the reading face. The
 * two are never mixed, so it is always plain which words are the library's.
 */
import type { AnswerSource, ChatConversationDetail, ChatMessage } from "@outpost/shared";
import { Check, ChevronDown, Copy, FilePlus2, Pencil, RotateCw, ShieldAlert } from "lucide-react";
import { Fragment, type ReactNode, useId, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { kindOf } from "@/components/search-hit";
import { Button } from "@/components/ui/button";
import { routeOf } from "@/features/search/answer";
import { whereOf } from "@/features/search/answer-text";
import { cn, plural } from "@/lib/utils";
import { type LiveReply, SETTINGS_MODEL, useElapsedSeconds } from "./chat-data";
import { markersIn, ReplyBody, useCopied } from "./reply-body";

/** The two columns of a turn: who is speaking, and what they said. One column on a narrow screen. */
export const TURN = "grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-[8.5rem_minmax(0,1fr)]";

const timeOnly = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayAndTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "14:02" today, "12 Nov, 14:02" on any other day. */
export function whenWords(timestamp: number, now = Date.now()): string {
  const same = new Date(timestamp).toDateString() === new Date(now).toDateString();
  return (same ? timeOnly : dayAndTime).format(timestamp);
}

/** "48 seconds", "2 minutes": how long a reply took. A small computer is slow, and the number says how slow. */
export function tookWords(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 90) return plural(seconds, "second");
  return plural(Math.round(seconds / 60), "minute");
}

/**
 * The lamp: something is alive right now. Steady, with the halo the lamp at the foot of the
 * spine has while work is running; the one thing that moves is the mark at the end of the words.
 */
function Lamp({ className }: { className?: string }) {
  return <span aria-hidden className={cn("chat-lamp", className)} />;
}

/** Controls are a full finger wide and tall on a phone. */
const TOUCH = "max-md:h-11";
const DISCLOSE = "max-md:inline-flex max-md:min-h-11 max-md:items-center";

export interface TranscriptActions {
  /** Throw the last reply away and write it again. */
  regenerate(): void;
  /** Put the last message back in the box, to be written again. */
  edit(message: ChatMessage): void;
  /** Send a message without typing it: "Please continue." */
  say(text: string): void;
  /** Turn the library off for this conversation and ask the last question again. */
  askWithoutLibrary(): void;
  saveAsNote(message: ChatMessage): void;
  chooseModel(): void;
}

function Margin({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 text-small text-ink-muted md:block md:pt-px", className)}>
      {children}
    </header>
  );
}

/** A long message (a pasted page, say) is folded to its first lines, so that the conversation stays readable. */
const isLong = (text: string) => text.length > 900 || text.split("\n").length > 12;

function PersonTurn({ message, editable, onEdit }: { message: ChatMessage; editable: boolean; onEdit(): void }) {
  const long = isLong(message.text);
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <article aria-label="You said" className={TURN} data-role="user">
      <Margin>
        <span className="font-medium">You</span>
        <span className="flex flex-1 items-center gap-x-2 md:mt-0.5">
          <time dateTime={new Date(message.createdAt).toISOString()} className="tabular text-micro">
            {whenWords(message.createdAt)}
          </time>
          {editable ? (
            // In the margin, on the line that says when: the words stay clear of controls, and every turn is as tall as the next.
            <Button
              variant="ghost"
              size="sm"
              className={cn(TOUCH, "-my-2 ml-auto md:-my-1.5 md:ml-0 md:h-6 md:gap-1 md:px-1.5 md:text-micro md:[&_svg]:size-3")}
              onClick={onEdit}
            >
              <Pencil aria-hidden /> Edit
            </Button>
          ) : null}
        </span>
      </Margin>
      <div className="min-w-0">
        <p
          id={id}
          className={cn("max-w-[68ch] whitespace-pre-wrap font-medium text-ink [overflow-wrap:anywhere]", long && !open && "line-clamp-6")}
        >
          {message.text}
        </p>
        {long ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "-ml-1.5 mt-1 rounded-control px-1.5 py-0.5 text-small font-medium text-primary hover:bg-surface-strong",
              DISCLOSE,
            )}
          >
            {open ? "Show less" : "Show all of it"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

const openWords = (source: AnswerSource) =>
  source.page ? `Open it at page ${source.page}` : source.kind === "note" ? "Open the page" : "Open the document";

function SourceRow({ source, cited, startOpen }: { source: AnswerSource; cited: boolean | null; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  const kind = kindOf(source.kind);
  const route = routeOf(source.url);
  const where = whereOf(source);
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1.5 py-2">
      <span className="tabular pt-px font-mono text-small font-semibold text-ink" aria-hidden>
        [{source.marker}]
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-small">
          <span className="min-w-0">
            <kind.icon aria-hidden className="mr-1.5 inline size-3.5 -translate-y-px text-ink-muted" />
            <span className="sr-only">
              Passage {source.marker}, {kind.label.toLowerCase()}:{" "}
            </span>
            {route ? (
              <Link
                to={route}
                title={openWords(source)}
                className="font-medium text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline"
              >
                {where}
              </Link>
            ) : (
              <span className="font-medium text-ink">{where}</span>
            )}
          </span>
          {cited === null ? null : <span className="shrink-0 text-micro text-ink-muted">{cited ? "Cited" : "Not cited"}</span>}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className={cn("-ml-1.5 rounded-control px-1.5 py-0.5 text-small font-medium text-primary hover:bg-surface-strong", DISCLOSE)}
        >
          {open ? "Hide the passage" : "Show the passage"}
        </button>
        {open ? (
          <blockquote id={id} className="mt-1 max-w-[68ch] font-serif text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">
            {source.quote}
          </blockquote>
        ) : null}
      </div>
    </li>
  );
}

/** The passages a reply was written from: always there to be checked, folded away once there are a few. */
function Sources({ message, sources, settled, last }: { message: ChatMessage; sources: AnswerSource[]; settled: boolean; last: boolean }) {
  const critical = sources.some((source) => source.safetyCritical);
  const [open, setOpen] = useState(last || critical || sources.length <= 3);
  const id = useId();
  if (sources.length === 0) return null;
  const used = settled ? new Set(markersIn(message.text)) : null;
  return (
    <section aria-label="Passages the model was given" className="mt-4 max-w-[46rem]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="-ml-1.5 flex items-center gap-1 rounded-control px-1.5 py-0.5 text-left text-small font-semibold text-ink hover:bg-surface-strong max-md:min-h-11"
      >
        <ChevronDown aria-hidden className={cn("size-4 text-ink-muted transition-transform duration-150", !open && "-rotate-90")} />
        Written from {plural(sources.length, "passage")} of your library
      </button>
      {open ? (
        <div id={id}>
          <p className="mt-0.5 text-small text-ink-muted">
            Quoted exactly as stored
            {message.searchedFor ? `, found by searching for “${message.searchedFor}”` : ""}. Check the reply against{" "}
            {sources.length === 1 ? "it" : "them"}.
          </p>
          <ol className="mt-1.5 divide-y divide-border border-y border-border">
            {sources.map((source) => (
              <SourceRow
                key={source.marker}
                source={source}
                cited={used ? used.has(source.marker) : null}
                startOpen={critical && source.safetyCritical}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

/** What a reply is doing before it has any words. The count of seconds is there so that a slow start never looks frozen. */
function Waiting({ live }: { live: LiveReply | null }) {
  const seconds = useElapsedSeconds(live?.since ?? null, true);
  const finding = live?.phase === "finding";
  return (
    <div className="text-ink" data-testid="reply-waiting">
      <p>
        <span>
          {/* The margin already names the model. */}
          {finding ? "Finding passages in your library" : "Waiting for the model to start writing"}
          {seconds >= 3 ? <span className="tabular text-ink-muted">, {plural(seconds, "second")} so far</span> : null}
        </span>
      </p>
      {!finding && seconds >= 8 ? (
        <p className="mt-1.5 max-w-[60ch] text-small text-ink-muted">
          A model is loaded into memory the first time it is used, and again after it has sat idle. On a small computer that can take a
          minute or more; it is working, not stuck. Later replies start sooner.
        </p>
      ) : null}
    </div>
  );
}

function ReplyActions({
  message,
  last,
  busy,
  actions,
}: {
  message: ChatMessage;
  last: boolean;
  busy: boolean;
  actions: TranscriptActions;
}) {
  const [copied, copy] = useCopied();
  const hasWords = message.text.trim().length > 0;
  if (!hasWords && !last) return null;
  return (
    <div className="mt-2 -ml-2.5 flex flex-wrap items-center gap-x-0.5">
      {hasWords ? (
        <Button variant="ghost" size="sm" className={TOUCH} onClick={() => void copy(message.text)}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </Button>
      ) : null}
      {last ? (
        <Button variant="ghost" size="sm" className={TOUCH} disabled={busy} onClick={actions.regenerate}>
          <RotateCw aria-hidden /> {message.state === "complete" || message.state === "cut-short" ? "Regenerate" : "Try again"}
        </Button>
      ) : null}
      {hasWords ? (
        <Button variant="ghost" size="sm" className={TOUCH} onClick={() => actions.saveAsNote(message)}>
          <FilePlus2 aria-hidden /> Save as a note
        </Button>
      ) : null}
    </div>
  );
}

function ReplyTurn({
  message,
  live,
  last,
  busy,
  scoped,
  actions,
}: {
  message: ChatMessage;
  live: LiveReply | null;
  last: boolean;
  /** Something is being written or sent, so nothing new can be asked for. */
  busy: boolean;
  scoped: boolean;
  actions: TranscriptActions;
}) {
  const writing = message.state === "writing";
  const blocks = live ? live.blocks : message.blocks;
  const sources = live && live.sources.length > 0 ? live.sources : message.sources;
  const model = message.model ?? live?.model ?? "";
  const settled = message.state === "complete" || message.state === "cut-short";
  const critical = sources.some((source) => source.safetyCritical);
  const uncited = settled && message.grounded && sources.length > 0 && markersIn(message.text).length === 0;
  const invented = message.unsupported.map((marker) => `[${marker}]`).join(" ");

  return (
    <article
      aria-label={`Reply from ${model || "the model"}`}
      aria-busy={writing || undefined}
      className={TURN}
      data-role="assistant"
      data-state={message.state}
    >
      <Margin className="relative">
        <span className="flex min-w-0 items-baseline gap-2">
          {/* Hung outside the margin on a wide screen, so the model's name stays where it is when the reply settles. */}
          {writing ? <Lamp className="translate-y-px md:absolute md:top-[0.5rem] md:-left-4 md:translate-y-0" /> : null}
          <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{model || "The model"}</span>
        </span>
        {message.state === "nothing-found" ? (
          <span className="text-micro md:mt-0.5 md:block">was not asked</span>
        ) : (
          <>
            {message.grounded ? <span className="text-micro md:mt-0.5 md:block">from your library</span> : null}
            {settled && message.tookMs ? <span className="tabular text-micro md:mt-0.5 md:block">{tookWords(message.tookMs)}</span> : null}
          </>
        )}
      </Margin>

      <div className="min-w-0">
        <p className="sr-only" role="status">
          {writing
            ? blocks.length > 0
              ? "The reply is being written."
              : "Waiting for the model."
            : settled
              ? "The reply is finished."
              : ""}
        </p>

        {critical && (blocks.length > 0 || settled) ? (
          <Notice
            tone="warning"
            icon={<ShieldAlert aria-hidden />}
            title="Read the passages themselves before acting on this"
            className="mb-3 max-w-[46rem]"
          >
            At least one is about medicine, first aid, treating water or preserving food, where a reworded dose, time or temperature can
            hurt someone. Those passages are open below, quoted exactly. Go by them, not by the model’s wording.
          </Notice>
        ) : null}

        {writing && blocks.length === 0 ? <Waiting live={live} /> : null}
        {blocks.length > 0 ? <ReplyBody blocks={blocks} sources={sources} writing={writing} /> : null}

        {message.state === "nothing-found" ? (
          <div className="max-w-[60ch]">
            <p className="font-medium text-ink">{message.notice?.split(". ")[0]}.</p>
            <p className="mt-1 text-small text-ink-muted">
              {message.notice?.split(". ").slice(1).join(". ")} Reference collections such as Wikipedia are not read.
            </p>
            {last && !scoped ? (
              <Button size="sm" className={cn("mt-3", TOUCH)} disabled={busy} onClick={actions.askWithoutLibrary}>
                Ask without my library
              </Button>
            ) : null}
          </div>
        ) : null}

        {message.state === "stopped" ? <p className="mt-2 text-small text-ink-muted">{message.notice}</p> : null}

        {message.state === "cut-short" ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-muted">
            {message.notice}
            {last ? (
              <Button
                variant="link"
                size="sm"
                className="max-md:min-h-11"
                disabled={busy}
                onClick={() => actions.say("Please continue from where you stopped.")}
              >
                Ask it to continue
              </Button>
            ) : null}
          </p>
        ) : null}

        {message.state === "failed" ? (
          <Notice
            tone="danger"
            title={message.text ? "This reply is unfinished" : "No reply was written"}
            className={cn("max-w-[46rem]", blocks.length > 0 && "mt-3")}
          >
            {message.notice}
            {last && (message.failure === "no-such-model" || message.failure === "not-a-chat-model") ? (
              <>
                {" "}
                <button type="button" onClick={actions.chooseModel} className="font-medium underline underline-offset-2">
                  Choose another model
                </button>
              </>
            ) : null}
            {message.failure === "unreachable" || message.failure === "no-chat-endpoint" || message.failure === "context-too-long" ? (
              <>
                {" "}
                <Link to={SETTINGS_MODEL} className="font-medium underline underline-offset-2">
                  Open Settings
                </Link>
              </>
            ) : null}
          </Notice>
        ) : null}

        {settled && message.unsupported.length > 0 ? (
          <Notice
            tone="warning"
            title={`${invented} ${message.unsupported.length === 1 ? "refers" : "refer"} to no passage`}
            className="mt-3 max-w-[46rem]"
          >
            The model was given{" "}
            {sources.length === 1 ? "one passage, numbered 1" : `${plural(sources.length, "passage")}, numbered 1 to ${sources.length}`}.
            Whatever {message.unsupported.length === 1 ? "that marker is" : "those markers are"} attached to is unsupported.
          </Notice>
        ) : null}
        {uncited ? (
          <p className="mt-2 max-w-[60ch] text-small text-ink-muted">
            This reply cites none of the passages. If it says they do not hold the answer, that is the honest outcome; otherwise nothing in
            it can be checked against your library.
          </p>
        ) : null}

        {writing ? null : <Sources message={message} sources={sources} settled={settled} last={last} />}
        {writing && sources.length > 0 && blocks.length > 0 ? (
          <p className="mt-3 text-small text-ink-muted">Being written from {plural(sources.length, "passage")} of your library.</p>
        ) : null}
        {writing ? null : <ReplyActions message={message} last={last} busy={busy} actions={actions} />}
      </div>
    </article>
  );
}

export function Transcript({
  detail,
  live,
  busy,
  actions,
}: {
  detail: ChatConversationDetail;
  /** The reply being written, as it arrives. */
  live: LiveReply | null;
  busy: boolean;
  actions: TranscriptActions;
}) {
  const { messages, sentFrom } = detail;
  const lastUser = messages.findLast((message) => message.role === "user");
  const lastIndex = messages.length - 1;
  return (
    <div className="grid gap-6" data-testid="transcript">
      {messages.map((message, index) => (
        <Fragment key={message.id}>
          {message.role === "user" ? (
            <div className={cn(index > 0 && sentFrom !== message.id && "border-t border-border pt-6")}>
              {sentFrom === message.id && index > 0 ? (
                <p role="note" className="mb-6 flex items-center gap-3 text-small text-ink-muted">
                  <span aria-hidden className="h-px min-w-4 flex-1 bg-border-strong" />
                  <span className="max-w-[46ch] text-center">
                    Messages above this line are no longer sent to the model. It can read only so much at once, so the oldest are left out.
                  </span>
                  <span aria-hidden className="h-px min-w-4 flex-1 bg-border-strong" />
                </p>
              ) : null}
              <PersonTurn message={message} editable={!busy && message.id === lastUser?.id} onEdit={() => actions.edit(message)} />
            </div>
          ) : (
            <ReplyTurn
              message={message}
              live={live?.messageId === message.id ? live : null}
              last={index === lastIndex}
              busy={busy}
              scoped={detail.conversation.scope !== null}
              actions={actions}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}
