/**
 * What a model looked up in Outpost while writing a reply, with the tools it may call.
 *
 * One quiet line under the reply: "Looked at: places on the map (Food and supplies,
 * fetched 12 Nov), supplies". Each name opens what was asked of the tool, in plain
 * words, and the answer it gave, quoted in the reading face the way the library's
 * passages are, since it is Outpost's own data and not the model's wording. A call that
 * was refused is listed as refused, with what the model was told.
 */
import { type AnswerSource, type ChatModel, type ChatStatus, RECOMMENDED_TOOL_MODELS, sameModelName } from "@outpost/shared";
import { Fragment, useId, useState } from "react";
import { Link } from "react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { routeOf } from "@/features/search/answer";
import { cn } from "@/lib/utils";

/** A lookup kept with a reply, as the server stores it. */
export type Lookup = AnswerSource & { lookup: NonNullable<AnswerSource["lookup"]> };

export const isLookup = (source: AnswerSource): source is Lookup => source.kind === "lookup" && source.lookup !== undefined;

/** The name in "Looked at": the tool and where its answer came from, or that it was refused. */
export function lookupName(source: Lookup): string {
  if (source.lookup.ok) return source.title;
  return source.lookup.area === null ? "a tool that does not exist (refused)" : `${source.title} (refused)`;
}

const valueWords = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(valueWords).filter(Boolean).join(", ");
  if (typeof value === "object") return argumentWords(value);
  return String(value);
};

/** What was asked of a tool, as words: "kind: supermarket, near: Northampton". Never the JSON the model wrote. */
export function argumentWords(args: unknown): string {
  if (typeof args === "string") return "something that could not be read";
  if (!args || typeof args !== "object" || Array.isArray(args)) return "nothing in particular";
  const parts = Object.entries(args as Record<string, unknown>)
    .map(([key, value]) => [key.replace(/_/g, " "), valueWords(value)] as const)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length > 0 ? parts.join(", ") : "nothing in particular";
}

/** Controls are a full finger tall on a phone, without breaking the line they sit in. */
const DISCLOSE = "max-md:inline-flex max-md:min-h-11 max-md:items-center";

function Answer({ source, id }: { source: Lookup; id: string }) {
  const route = routeOf(source.url);
  return (
    <div id={id} className="py-2">
      <p className="text-small text-ink-muted">
        <span className="font-medium text-ink">{lookupName(source)}</span>, asked for {argumentWords(source.lookup.arguments)}
      </p>
      {source.lookup.ok ? (
        <>
          <blockquote className="mt-1 max-w-[68ch] font-serif text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">
            {source.quote}
          </blockquote>
          {route ? (
            <Link to={route} className={cn("mt-1 text-small font-medium text-primary underline decoration-1 underline-offset-2", DISCLOSE)}>
              Open it in Outpost
            </Link>
          ) : null}
        </>
      ) : (
        <p className="mt-1 max-w-[68ch] text-small text-ink">Outpost did not run it, and told the model: {source.quote}</p>
      )}
    </div>
  );
}

/** The line of lookups under a reply. Shown as they are made, before the reply is written. */
export function LookedAt({ sources }: { sources: readonly AnswerSource[] }) {
  const lookups = sources.filter(isLookup);
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const base = useId();
  if (lookups.length === 0) return null;
  const toggle = (index: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  return (
    <section aria-label="What the model looked up in Outpost" className="mt-3 max-w-[46rem]" data-testid="looked-at">
      <p className="text-small text-ink-muted">
        Looked at:{" "}
        {lookups.map((source, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lookups in the order they were made; a refused one has no number of its own
          <Fragment key={index}>
            {index > 0 ? ", " : null}
            <button
              type="button"
              aria-expanded={open.has(index)}
              aria-controls={`${base}-${index}`}
              onClick={() => toggle(index)}
              className={cn(
                "-mx-0.5 rounded-control px-0.5 text-left font-medium text-ink underline decoration-border-strong decoration-1 underline-offset-[0.2em] hover:decoration-primary",
                !source.lookup.ok && "text-ink-muted",
                DISCLOSE,
              )}
            >
              {lookupName(source)}
            </button>
          </Fragment>
        ))}
      </p>
      {open.size > 0 ? (
        <div className="mt-1.5 divide-y divide-border border-y border-border">
          {lookups.map((source, index) =>
            // biome-ignore lint/suspicious/noArrayIndexKey: as above
            open.has(index) ? <Answer key={index} source={source} id={`${base}-${index}`} /> : null,
          )}
        </div>
      ) : null}
    </section>
  );
}

/** "[3]" in a reply, where source 3 is something looked up: shows what the tool answered, not a passage. */
export function LookupMarker({ source }: { source: Lookup }) {
  const route = routeOf(source.url);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Source ${source.marker}: looked up in Outpost, ${source.title}. Show what it said.`}
        className="rounded-[3px] bg-primary-soft px-1 py-px font-mono text-[0.8125rem] font-semibold whitespace-nowrap text-primary-soft-ink decoration-1 underline-offset-2 hover:underline data-[state=open]:underline"
      >
        [{source.marker}]
      </PopoverTrigger>
      <PopoverContent className="w-[min(25rem,calc(100vw-2rem))] p-0">
        <div className="max-h-[min(20rem,55vh)] overflow-y-auto px-3.5 py-3">
          <p className="text-small font-semibold text-ink">
            <span className="tabular font-mono">[{source.marker}]</span> {source.title}
          </p>
          <blockquote className="mt-2 font-serif text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">{source.quote}</blockquote>
        </div>
        <p className="border-t border-border px-3.5 py-2 text-small text-ink-muted">
          Looked up in Outpost, as the model was given it.{" "}
          {route ? (
            <Link to={route} className="font-medium text-primary underline decoration-1 underline-offset-2">
              Open it in Outpost
            </Link>
          ) : null}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** "a, b and c". */
const listWords = (names: readonly string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * The one sentence under the message box about looking things up, when "Let the model
 * look things up in Outpost" is on: whether this model will be offered the tools, and
 * if not, why, and which of the suggested small models could. Null when there is
 * nothing to say (the switch is off, the conversation is about one item, or the model
 * server's list has not been read).
 */
export function toolsNoteFor(input: {
  status: ChatStatus | undefined;
  model: string;
  /** The model as the server's list describes it; undefined when the list does not have it. */
  info: ChatModel | undefined;
  /** The server's list was read. */
  listed: boolean;
  grounded: boolean;
  scoped: boolean;
}): string | null {
  const { status, model, info, listed, grounded, scoped } = input;
  const tools = status?.tools;
  if (!tools?.enabled || scoped || !model || !listed) return null;
  const otherwise = grounded ? "it answers from your library’s passages only" : "it answers from what it learned only";
  if (tools.offForModels.some((name) => sameModelName(name, model))) {
    return `Looking things up in Outpost is turned off for this model in Settings, so ${otherwise}.`;
  }
  if (info?.tools === true) {
    return tools.offered === 0
      ? `Every area the model could look things up in is switched off in Settings, so ${otherwise}.`
      : "It can also look things up in Outpost with the tools switched on in Settings; what they answer is sent to the model too.";
  }
  const can = RECOMMENDED_TOOL_MODELS.names.filter((name) => !sameModelName(name, model));
  const suggest = can.length > 0 ? ` Of the suggested small models, ${listWords(can)} can.` : "";
  return info?.tools === false
    ? `This model cannot look things up in Outpost; ${otherwise}.${suggest}`
    : `The model server does not say whether this model can look things up in Outpost, so it is not offered the tools; ${otherwise}.${suggest}`;
}
