/** The stages of the essay, in order, and the small pieces every stage shares. */
import type { ExplainVectorSource } from "@outpost/shared";
import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";

export const STAGES = [
  { id: "stage-journey", short: "The whole journey", title: "The whole journey at a glance" },
  { id: "stage-cutting", short: "Reading and cutting", title: "Before any question: reading and cutting" },
  { id: "stage-words", short: "Search by words", title: "Search by words" },
  { id: "stage-meaning", short: "Search by meaning", title: "Search by meaning" },
  { id: "stage-fusion", short: "Combining the two", title: "Combining the two lists" },
  { id: "stage-context", short: "Building the context", title: "Building the context" },
  { id: "stage-model", short: "The language model", title: "Handing it to a language model: the step Outpost does not take" },
  { id: "stage-wrong", short: "What can go wrong", title: "What can go wrong, and how to tell" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export function Stage({ id, children }: { id: StageId; children: ReactNode }) {
  const stage = STAGES.find((item) => item.id === id)!;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="understand-stage mt-16 border-t border-border-strong pt-10 first:mt-0 first:border-t-0 first:pt-0"
    >
      <h2 id={`${id}-title`} className="mb-5 max-w-[28ch] font-title text-heading text-ink sm:max-w-[36ch]">
        {stage.title}
      </h2>
      {children}
    </section>
  );
}

export const SETTINGS_MEANING = "/settings#semantic-title";
export const SETTINGS_READING = "/settings#indexing-title";

/** Says plainly which vectors are in use. Shown wherever vectors appear. */
export function VectorNotice({ source, className }: { source: ExplainVectorSource | undefined; className?: string }) {
  if (!source) return null;
  if (source.source === "model") {
    return (
      <Notice
        className={className}
        icon={<FlaskConical aria-hidden />}
        title={
          source.modelId === "demo:word-counts"
            ? "These vectors come from the built-in demonstration provider"
            : "These vectors come from your embedding model"
        }
      >
        {source.modelId === "demo:word-counts" ? (
          <>
            Search by meaning is switched on with the provider called “Demonstration” (
            <span className="font-mono text-[0.8125rem]">{source.modelId}</span>). The whole pipeline is running for real, on stored
            vectors, but those vectors are made from word counts, not by a language model. They only know that two texts are alike when they
            share words.{" "}
            <Link to={SETTINGS_MEANING} className="font-medium text-primary underline decoration-1 underline-offset-[0.2em]">
              Choose the built-in model in Settings
            </Link>{" "}
            to see meaning matched without shared words.
          </>
        ) : (
          <>
            The model in use is <span className="font-mono text-[0.8125rem]">{source.modelId}</span>
            {source.dimensions ? `, which turns each text into ${source.dimensions.toLocaleString("en-GB")} numbers` : ""}. Everything in
            this section is drawn from its vectors.
          </>
        )}
      </Notice>
    );
  }
  return (
    <Notice
      className={className}
      tone="warning"
      icon={<FlaskConical aria-hidden />}
      title="These are demonstration vectors, not a language model"
    >
      <p>{source.reason}</p>
      <p className="mt-1.5">
        Each vector here is a count of the words in a text. The mechanics you see are the real ones: the same comparing, ranking and
        combining. What is missing is understanding: these vectors cannot tell that “purify” and “boil” are related unless the two texts
        happen to share words. A real embedding model can.
      </p>
      <p className="mt-1.5">
        <Link to={SETTINGS_MEANING} className="font-medium text-primary underline decoration-1 underline-offset-[0.2em]">
          Set up search by meaning in Settings
        </Link>
        . Outpost has a small model built in, with nothing to install: switching search by meaning on there and building the index gives you
        the real thing.
      </p>
    </Notice>
  );
}
