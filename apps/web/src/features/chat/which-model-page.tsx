/**
 * Which model to get: what each model did when it was tried with Outpost, so that a
 * person can choose one. Settings and the Chat screen's model picker link to it.
 *
 * The figures are not here. They are in packages/shared/src/model-trials.ts, which the
 * documentation quotes too; this file only draws them, one model to a list item, so that
 * it reads on a phone. Nothing on it is fetched: it works with no server at all.
 */
import {
  longDate,
  MODEL_TRIALS,
  type ModelChoice,
  type ModelSuits,
  type ModelTrial,
  type ModelTrials,
  type ModelVerdict,
  pullCommand,
  SETUP_GUIDE_PATH,
  TOOL_QUESTIONS,
  VERDICT_WORDS,
} from "@outpost/shared";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Disclosure, EmptyState, Page, PageHeader, Rows } from "@/components/page";
import { Badge } from "@/components/ui/misc";
import { CommandLine } from "@/features/setup/recommended-models";

const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

const NO_PI = "No model has been timed on a Raspberry Pi; it will be slower, by how much has not been measured.";

/** "suits a Raspberry Pi 5 with 4 GB" */
export function suitsWords(suits: ModelSuits | null): string {
  if (suits === "pi-4gb") return "suits a Raspberry Pi 5 with 4 GB";
  if (suits === "pi-8gb") return "suits a Raspberry Pi 5 with 8 GB";
  if (suits === "mac") return "wants a Mac or PC";
  return "not judged, as its memory was not measured";
}

/** "30 of 32 right; declined 13 of 13 it should" */
export function libraryWords(library: ModelTrial["library"]): string {
  if (!library) return "not run through the library questions";
  return `${library.right} of ${library.of} right; declined ${library.declinedRightly} of ${library.ofDeclined} it should`;
}

/** "first word 0.6 s, whole reply 2.1 s, on that Mac, not on a Pi" */
export function timingWords(timing: ModelTrial["timing"]): string {
  if (!timing) return "not timed";
  const seconds = (value: number) => `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} s`;
  return `first word ${seconds(timing.firstWordS)}, whole reply ${seconds(timing.wholeS)}, on that Mac, not on a Pi`;
}

const TONE: Record<ModelVerdict, "success" | "neutral" | "warning"> = {
  "looks-things-up-well": "success",
  "answers-only": "neutral",
  "not-recommended": "warning",
};

/** A link that leaves Outpost, marked as one. */
function Away({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={link}>
      {children}
      <ArrowUpRight aria-label="(opens in the browser, and needs the internet)" className="ml-0.5 inline size-3.5 align-[-0.1em]" />
    </a>
  );
}

const Name = ({ children }: { children: string }) => (
  <span className="font-mono text-[0.875em] text-ink [overflow-wrap:anywhere]">{children}</span>
);

function Licence({ licence }: { licence: ModelTrial["licence"] }) {
  if (licence.read) return licence.url ? <Away href={licence.url}>{licence.name}</Away> : licence.name;
  return (
    <>
      licence not read
      {licence.url ? (
        <>
          {" "}
          (<Away href={licence.url}>{licence.name || "its page"}</Away>)
        </>
      ) : null}
    </>
  );
}

/** One label and what it says, a pair of the model's facts. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function Model({ trial }: { trial: ModelTrial }) {
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h3 className="font-mono text-lead font-semibold text-ink [overflow-wrap:anywhere]">{trial.name}</h3>
        <Badge tone={TONE[trial.verdict]}>{trialVerdict(trial)}</Badge>
      </div>
      <p className="mt-1 text-body text-ink-muted">{trial.reason}</p>
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-y-2 text-small">
        <Fact label="Download">{trial.download ?? "size not read"}</Fact>
        <Fact label="Memory it needed">{trial.memoryGb === null ? "not measured" : `${trial.memoryGb.toFixed(1)} GB, measured here`}</Fact>
        <Fact label="Fits">{suitsWords(trial.suits)}</Fact>
        <Fact label="Licence">
          <Licence licence={trial.licence} />
        </Fact>
        <Fact label="Thinks first">
          {trial.thinks === null ? "not known" : trial.thinks ? "yes, so it is slower to start" : "no, it answers straight away"}
        </Fact>
        <Fact label="From your library">{libraryWords(trial.library)}</Fact>
        <Fact label="Looking things up">
          {trial.tools ? `${trial.tools.right} of ${trial.tools.of} right. ${trial.tools.mistakes}` : "not tried"}
        </Fact>
        <Fact label="Speed">{timingWords(trial.timing)}</Fact>
      </dl>
    </li>
  );
}

/** The verdict word, or "not tested" while nothing has been run. */
function trialVerdict(trial: ModelTrial): string {
  return trial.library === null && trial.tools === null ? "not tested" : VERDICT_WORDS[trial.verdict];
}

function Choice({ label, choice, command }: { label: string; choice: ModelChoice | null; command?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <dt className="text-small font-medium text-ink-muted">{label}</dt>
      <dd className="text-body text-ink">
        {choice ? (
          <>
            <Name>{choice.name}</Name>. {choice.reason}
            {command ? <CommandLine command={pullCommand(choice.name)} className="mt-2" /> : null}
          </>
        ) : (
          <span className="text-ink-muted">Not chosen yet: the models have not all been measured.</span>
        )}
      </dd>
    </div>
  );
}

export function WhichModel({ trials, questions }: { trials: ModelTrials; questions: string[] }) {
  const { recommendation } = trials;
  return (
    <Page width="reading">
      <PageHeader
        title="Which model"
        description="What each model did when it was asked questions through Outpost, to help you choose one to get. A small model is a helper, not an expert."
      />

      {trials.models.length === 0 ? (
        <EmptyState title="No models have been tried yet">
          When some have been, what each got right, how much memory it needed and how long it took will be here.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 text-body text-ink">
          <section aria-labelledby="start-here">
            <h2 id="start-here" className="font-title text-heading text-ink">
              Start here
            </h2>
            <dl className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5">
              <Choice label="On a Raspberry Pi" choice={recommendation.pi} command />
              <Choice label="On a Mac or PC" choice={recommendation.mac} />
              {recommendation.avoid.length ? (
                <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
                  <dt className="text-small font-medium text-ink-muted">Not worth getting</dt>
                  {recommendation.avoid.map((choice) => (
                    <dd key={choice.name} className="text-body text-ink">
                      <Name>{choice.name}</Name>. {choice.reason}
                    </dd>
                  ))}
                </div>
              ) : null}
            </dl>
            <p className="mt-5 text-small text-ink-muted">{NO_PI}</p>
          </section>

          <section aria-labelledby="each-model" className="border-t border-border pt-8">
            <h2 id="each-model" className="font-title text-heading text-ink">
              Each model
            </h2>
            <p className="mt-2 text-small text-ink-muted">
              Measured on {longDate(trials.measuredOn)} on {trials.machine}, with Ollama {trials.ollama}.
            </p>
            <Rows className="mt-3" aria-label="The models tried">
              {trials.models.map((trial) => (
                <Model key={trial.name} trial={trial} />
              ))}
            </Rows>
          </section>

          <section aria-labelledby="how-measured" className="border-t border-border pt-8">
            <h2 id="how-measured" className="font-title text-heading text-ink">
              How it was measured
            </h2>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3">
              <p>
                On {longDate(trials.measuredOn)}, on {trials.machine}, with Ollama {trials.ollama}, each model was asked two sets of
                questions through Outpost itself.
              </p>
              <p>
                <span className="font-semibold">From your library:</span> 45 questions over a small test library of made-up household
                documents. 32 are answered by one passage, and a right answer must cite it; 13 are not answered by the library, and the
                model should say so. The questions and how they are judged are in Outpost’s documentation, <Name>docs/ai.md</Name>, under
                “Measured with a real model”.
              </p>
              <p>
                <span className="font-semibold">Looking things up:</span> {questions.length ? `${questions.length} questions` : "questions"}{" "}
                asked with Outpost’s look-up tools on. Memory is what Ollama held for the model while it answered; times are the middle of
                the times over these questions.
              </p>
              <Disclosure
                summary={
                  questions.length ? `The ${questions.length} questions for looking things up` : "The questions for looking things up"
                }
              >
                {questions.length ? (
                  <ol className="grid list-decimal gap-1.5 pl-5">
                    {questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-ink-muted">They have not been written in yet.</p>
                )}
              </Disclosure>
              <p>{NO_PI}</p>
              <p>
                To install Ollama and get a model, follow the{" "}
                <Link to={`${SETUP_GUIDE_PATH}#get-a-model`} className={link}>
                  Set-up guide
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}

export default function WhichModelPage() {
  return <WhichModel trials={MODEL_TRIALS} questions={TOOL_QUESTIONS} />;
}
