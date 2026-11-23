/**
 * "How search works": an illustrated explanation of how Outpost turns a question into
 * cited passages, drawn from the reader's own library. One question, kept in the
 * address bar, drives every figure on the page.
 */
import { ArrowRight } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BackLink, EmptyState, ErrorState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { cn, formatNumber, plural } from "@/lib/utils";
import { COLOR } from "./charts/colors";
import { Prose } from "./charts/figure";
import { libraryCount, TraceProvider, type TraceState, useChunks, useEntities, useOverview, useProjection, useTrace } from "./data";
import { entityKey } from "./figures/ribbon";
import { formatMs } from "./lib/scale";
import { buildExamples, type Example } from "./lib/text";
import { CuttingSection, JourneySection, WordsSection } from "./sections/early";
import { ContextSection, FusionSection, ModelSection, WrongSection } from "./sections/late";
import { MeaningSection } from "./sections/meaning";
import { STAGES, type StageId } from "./stages";
import "./understand.css";

const GLOSSARY: Array<{ term: string; means: string; stage: StageId }> = [
  {
    term: "RAG",
    means: "Retrieval-augmented generation: find relevant text first, then have a model answer from it.",
    stage: "stage-journey",
  },
  { term: "Hallucination", means: "A fluent statement from a model that nothing supports.", stage: "stage-journey" },
  {
    term: "Passage (chunk)",
    means: "A piece of a document, a few paragraphs long. Search works on passages, not whole documents.",
    stage: "stage-cutting",
  },
  {
    term: "Index",
    means: "A structure prepared in advance so a question can be answered without reading everything.",
    stage: "stage-cutting",
  },
  { term: "BM25", means: "The standard formula for scoring how well a passage matches the words of a question.", stage: "stage-words" },
  { term: "Inverse document frequency", means: "The extra weight a rare word earns over a common one.", stage: "stage-words" },
  {
    term: "Embedding (vector)",
    means: "A list of numbers standing for a text, made so that similar meanings get similar lists.",
    stage: "stage-meaning",
  },
  { term: "Dimension", means: "One position in a vector. A vector with 384 numbers has 384 dimensions.", stage: "stage-meaning" },
  {
    term: "Cosine similarity",
    means: "How nearly two vectors point the same way: 1 the same, 0 unrelated, −1 opposite.",
    stage: "stage-meaning",
  },
  { term: "Nearest neighbour", means: "A passage whose vector is among the closest to the question’s.", stage: "stage-meaning" },
  { term: "Rank", means: "A passage’s position in a list of results: first, second, third.", stage: "stage-fusion" },
  { term: "Reciprocal rank fusion", means: "Merging two ranked lists by adding 1 ÷ (k + rank) from each.", stage: "stage-fusion" },
  { term: "Context window", means: "The most text a language model can read at once.", stage: "stage-context" },
  { term: "Token", means: "A word or piece of a word, the unit a model reads. About four characters in English.", stage: "stage-context" },
  { term: "Citation", means: "A numbered marker tying a statement to the exact passage it came from.", stage: "stage-context" },
  { term: "Prompt", means: "What is sent to a language model: instructions, sources and the question.", stage: "stage-model" },
];

function QueryMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rotate-45 rounded-[1px]", className)}
      style={{ background: COLOR.query }}
    />
  );
}

/** Highlights the stage in view. The last stage whose top has passed a line a third of the way down the window wins. */
function useActiveStage(): StageId {
  const [active, setActive] = useState<StageId>(STAGES[0].id);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const line = window.innerHeight * 0.33;
      let current: StageId = STAGES[0].id;
      for (const stage of STAGES) {
        const top = document.getElementById(stage.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = stage.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return active;
}

function goTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}

function StageList({ active, query, empty }: { active: StageId; query: string; empty: boolean }) {
  return (
    <nav aria-label="On this page" className="sticky top-10 hidden self-start xl:block">
      <p className="mb-2 px-2 text-small font-semibold text-ink">On this page</p>
      <ol className="grid gap-px">
        {STAGES.map((stage, index) => (
          <li key={stage.id}>
            <a
              href={`#${stage.id}`}
              aria-current={stage.id === active ? "location" : undefined}
              className={cn(
                "flex gap-2.5 rounded-control px-2 py-1.5 text-small transition-colors",
                stage.id === active
                  ? "bg-primary-soft font-medium text-primary-soft-ink"
                  : "text-ink-muted hover:bg-surface-strong hover:text-ink",
              )}
            >
              <span className="tabular w-3 shrink-0 text-right">{index + 1}</span>
              <span>{stage.short}</span>
            </a>
          </li>
        ))}
      </ol>
      <div className="mt-5 border-t border-border px-2 pt-4 text-small text-ink-muted">
        {query ? (
          <>
            <p className="flex items-baseline gap-2">
              <QueryMark className="translate-y-[-1px]" />
              <span className="min-w-0 break-words text-ink">{query}</span>
            </p>
            <a
              href="#question"
              className="mt-1.5 inline-block font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
            >
              Ask something else
            </a>
          </>
        ) : (
          <a href="#question" className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
            {empty ? "Add something to trace" : "Trace a question"}
          </a>
        )}
      </div>
    </nav>
  );
}

/** The same list for screens with no room for it at the side: one compact control that stays in reach. */
function StagePicker({ active }: { active: StageId }) {
  const index = STAGES.findIndex((stage) => stage.id === active);
  return (
    <div
      data-sticky-top
      className="understand-picker sticky z-(--z-sticky) -mx-5 mb-8 border-b border-border bg-page px-5 py-2 md:-mx-10 md:px-10 xl:hidden"
    >
      <Select
        aria-label="Jump to a stage"
        value={active}
        onChange={(id) => goTo(id)}
        className="h-10 max-w-md"
        options={STAGES.map((stage, position) => ({ value: stage.id, label: `${position + 1}. ${stage.short}` }))}
      />
      <span className="sr-only" aria-live="polite">
        Stage {index + 1} of {STAGES.length}
      </span>
    </div>
  );
}

function QuestionBox({
  query,
  onTrace,
  examples,
  state,
}: {
  query: string;
  onTrace: (query: string) => void;
  examples: Example[];
  state: TraceState;
}) {
  const id = useId();
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const { trace } = state;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim().slice(0, 500);
    if (next) onTrace(next);
  };
  return (
    <form
      id="question"
      onSubmit={submit}
      className="understand-anchor rounded-panel border border-border-strong bg-surface px-4 py-4 sm:px-5"
    >
      <label htmlFor={id} className="flex items-center gap-2 text-small font-semibold text-ink">
        <QueryMark /> Your question
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          placeholder="A few words about something in your library"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 basis-64"
        />
        <Button type="submit" variant="primary" loading={Boolean(query) && trace.isFetching} disabled={!draft.trim()}>
          Trace this question
        </Button>
      </div>
      {examples.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small text-ink-muted">
          <span>From your library:</span>
          {examples.map((example) => (
            <button
              key={example.query}
              type="button"
              onClick={() => onTrace(example.query)}
              className="rounded-full border border-border-strong bg-page px-3 py-0.5 text-ink transition-colors hover:border-ink-faint hover:bg-surface-strong max-md:min-h-11 max-md:py-1.5 md:pointer-coarse:min-h-11 md:pointer-coarse:py-1.5"
            >
              {example.label}
            </button>
          ))}
        </div>
      ) : null}
      <p aria-live="polite" className="mt-3 text-small text-ink-muted">
        {!query
          ? "Nothing has been traced yet. Until then the figures below show their outlines."
          : trace.isError && !trace.isFetching
            ? "The trace failed. Each figure below says why and offers to try again."
            : trace.data && !trace.isPlaceholderData
              ? `Traced “${trace.data.query}” in ${formatMs(trace.data.timings.totalMs)}. Every figure below is now drawn from it, and the address of this page links to the same trace.`
              : "Tracing…"}
      </p>
    </form>
  );
}

function Glossary() {
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="mt-8 border-y border-border md:py-3">
      <summary className="cursor-pointer rounded-control py-3 text-small font-semibold text-ink md:py-0.5 md:pointer-coarse:py-3">
        The words used on this page
      </summary>
      <dl className="mt-3 grid gap-x-10 gap-y-2.5 pb-3 text-small md:grid-cols-2 md:pb-1">
        {GLOSSARY.map((entry) => (
          <div key={entry.term}>
            <dt className="inline font-semibold text-ink">
              <a
                href={`#${entry.stage}`}
                className="underline decoration-border-strong decoration-1 underline-offset-[0.22em] hover:decoration-primary"
              >
                {entry.term}
              </a>
            </dt>
            <dd className="inline text-ink-muted"> {entry.means}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default function UnderstandPage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").trim().slice(0, 500);
  const overview = useOverview();
  const empty = overview.data ? libraryCount(overview.data) === 0 : false;
  const ready = Boolean(overview.data) && !empty;
  const trace = useTrace(ready ? query : "");
  const projection = useProjection(query, ready);
  const entities = useEntities();
  const [picked, setPicked] = useState<string>();
  const selected = entities.data?.find((entity) => entityKey(entity) === picked) ?? entities.data?.[0];
  const chunks = useChunks(ready ? selected : undefined);
  const active = useActiveStage();

  // Examples come from the first document shown, and stay put when another is picked.
  const examples = useRef<Example[]>([]);
  if (examples.current.length === 0 && entities.data && chunks.data) {
    examples.current = buildExamples(
      entities.data.filter((entity) => entityKey(entity) !== entityKey(chunks.data.entity)).map((entity) => entity.title),
      chunks.data.chunks.map((chunk) => chunk.heading),
    );
  }

  const state = useMemo<TraceState>(
    () => ({ query: ready ? query : "", trace, overview: overview.data, empty }),
    [ready, query, trace, overview.data, empty],
  );
  const onTrace = (next: string) => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("q", next);
      return updated;
    });
  };

  return (
    <Page width="wide">
      <TraceProvider value={state}>
        <div className="xl:grid xl:grid-cols-[minmax(0,49rem)_13rem] xl:justify-between xl:gap-12">
          <div className="min-w-0 max-w-[49rem]">
            <header className="mb-8">
              <BackLink to={query ? `/search?q=${encodeURIComponent(query)}` : "/search"} className="mb-2">
                Search
              </BackLink>
              <h1 className="font-title text-title text-ink">How search works</h1>
              <Prose className="mt-4">
                <p>
                  Outpost answers a question by finding the passages in your library most likely to hold the answer, and showing you exactly
                  where each one came from. Handing passages like these to a language model, so that it writes its answer from them and not
                  from memory, is called retrieval-augmented generation, or RAG. This page follows one question of yours through every step,
                  on your own library, with the real numbers.
                </p>
              </Prose>
              <p className="mt-3 text-small">
                <Link to="/search/how-it-was-tuned" className="text-primary underline underline-offset-2">
                  How search was tuned
                </Link>
                : how it was measured and improved, one change at a time.
              </p>
            </header>

            {overview.isError ? (
              <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
            ) : !overview.data ? (
              <Skeleton className="h-36 rounded-panel" />
            ) : empty ? (
              <div id="question" className="understand-anchor">
                <EmptyState
                  title="Nothing to trace yet"
                  seed={11}
                  compact
                  action={
                    <>
                      <Button asChild variant="primary">
                        <Link to="/library">
                          Add documents <ArrowRight aria-hidden />
                        </Link>
                      </Button>
                      <Button asChild>
                        <Link to="/notes">Write a page</Link>
                      </Button>
                    </>
                  }
                >
                  This page explains search on your own library, and yours has no documents or pages in it yet. Add a few and come back. The
                  explanation below can still be read; its figures will stay as outlines until there is something real to draw.
                </EmptyState>
              </div>
            ) : (
              <QuestionBox query={query} onTrace={onTrace} examples={examples.current} state={state} />
            )}

            <Glossary />
            {overview.data && !empty ? (
              <p className="mt-3 text-small text-ink-muted">
                Reading time is about fifteen minutes. Your library has {plural(overview.data.entities.document ?? 0, "document")} and{" "}
                {plural(overview.data.entities.note ?? 0, "page")}, cut into {formatNumber(overview.data.chunks)} passages.
              </p>
            ) : null}

            <div className="mt-10">
              <StagePicker active={active} />
              <JourneySection />
              <CuttingSection
                entities={entities}
                chunks={chunks}
                selected={selected ? entityKey(selected) : undefined}
                onSelect={setPicked}
              />
              <WordsSection />
              <MeaningSection projection={projection} />
              <FusionSection />
              <ContextSection />
              <ModelSection />
              <WrongSection />
            </div>
          </div>
          <StageList active={active} query={state.query} empty={empty} />
        </div>
      </TraceProvider>
    </Page>
  );
}
