import type { ExplainOverview, ExplainResponse } from "@outpost/shared";
import { formatNumber, plural } from "@/lib/utils";
import { COLOR } from "../charts/colors";
import { HiddenTable, useMeasure } from "../charts/figure";
import { fitLabel } from "../charts/measure";
import { TRACE_LIMIT } from "../data";
import { layoutPipeline, NODE_HEIGHT, type NodeId } from "../lib/pipeline";
import { formatMs } from "../lib/scale";

interface NodeText {
  title: string;
  lines: string[];
  href: string;
  color: string;
  outside?: boolean;
  timing?: number;
  /** What a screen reader hears for this stage. */
  spoken: string;
}

function nodeTexts(overview: ExplainOverview | undefined, trace: ExplainResponse | undefined): Record<NodeId, NodeText> {
  const documents = overview?.entities.document ?? 0;
  const pages = overview?.entities.note ?? 0;
  const demo = (trace?.semantic.source ?? overview?.vectors.source) === "demonstration";
  const cap = TRACE_LIMIT * 2;
  const found = (count: number) => (count >= cap ? `best ${count} kept` : `${formatNumber(count)} found`);
  const union = trace ? new Set([...trace.keyword.hits, ...trace.semantic.hits].map((hit) => hit.chunkId)).size : 0;

  return {
    library: {
      title: "Your library",
      lines: overview ? [plural(documents, "document"), plural(pages, "page")] : [],
      href: "#stage-cutting",
      color: COLOR.borderStrong,
      spoken: overview ? `${plural(documents, "document")} and ${plural(pages, "page")}` : "",
    },
    passages: {
      title: "Passages",
      lines: overview
        ? [
            documents + pages === 0 ? "none of yours yet" : `${formatNumber(overview.chunks)} in all`,
            `up to ${formatNumber(overview.settings.chunkSize)} chars`,
          ]
        : ["cut to size"],
      href: "#stage-cutting",
      color: COLOR.borderStrong,
      spoken: overview ? `${formatNumber(overview.chunks)} passages of about ${formatNumber(overview.settings.chunkSize)} characters` : "",
    },
    index: {
      title: "The index",
      lines: ["by word", demo ? "by vector (demo)" : "by vector"],
      href: "#stage-cutting",
      color: COLOR.borderStrong,
      spoken: "kept by word and by vector",
    },
    question: {
      title: "Your question",
      lines: trace ? [`“${trace.query}”`] : ["typed above"],
      href: "#question",
      color: COLOR.query,
      spoken: trace ? trace.query : "",
    },
    words: {
      title: "Words",
      lines: trace
        ? [plural(trace.parse.words.length, "word"), ...(trace.parse.excluded.length ? [`${trace.parse.excluded.length} left out`] : [])]
        : ["split up"],
      href: "#stage-words",
      color: COLOR.keyword,
      spoken: trace ? plural(trace.parse.words.length, "word") : "",
    },
    vector: {
      title: "Vector",
      lines: trace ? [`${formatNumber(trace.semantic.dimensions ?? 0)} numbers`, ...(demo ? ["word counts"] : [])] : ["turned to numbers"],
      href: "#stage-meaning",
      color: COLOR.meaning,
      spoken: trace ? `${formatNumber(trace.semantic.dimensions ?? 0)} numbers` : "",
    },
    keyword: {
      title: "Keyword search",
      lines: trace ? [found(trace.keyword.hits.length), ...(trace.parse.relaxed ? ["any word"] : [])] : ["matches words"],
      href: "#stage-words",
      color: COLOR.keyword,
      timing: trace?.timings.keywordMs,
      spoken: trace ? `${found(trace.keyword.hits.length)}, ${formatMs(trace.timings.keywordMs)}` : "",
    },
    meaning: {
      title: "Meaning search",
      lines: trace ? [`${formatNumber(trace.semantic.compared)} compared`, found(trace.semantic.hits.length)] : ["compares vectors"],
      href: "#stage-meaning",
      color: COLOR.meaning,
      timing: trace?.timings.semanticMs,
      spoken: trace
        ? `compared with ${formatNumber(trace.semantic.compared)} vectors, ${found(trace.semantic.hits.length)}, ${formatMs(trace.timings.semanticMs)}`
        : "",
    },
    fusion: {
      title: "Fusion",
      lines: trace ? [`${formatNumber(union)} candidates`, "one list"] : ["two lists, one"],
      href: "#stage-fusion",
      color: COLOR.fused,
      timing: trace?.timings.fusionMs,
      spoken: trace ? `${formatNumber(union)} candidates merged into one list, ${formatMs(trace.timings.fusionMs)}` : "",
    },
    context: {
      title: "Context",
      lines: trace
        ? [plural(trace.context.citations.length, "source"), `≈${formatNumber(trace.context.approxTokens)} tokens`]
        : ["numbered sources"],
      href: "#stage-context",
      color: COLOR.fused,
      timing: trace?.timings.contextMs,
      spoken: trace
        ? `${plural(trace.context.citations.length, "source")}, about ${formatNumber(trace.context.approxTokens)} tokens, ${formatMs(trace.timings.contextMs)}`
        : "",
    },
    model: {
      title: "Language model",
      lines: ["not part of", "Outpost"],
      href: "#stage-model",
      color: COLOR.axis,
      outside: true,
      spoken: "not part of Outpost",
    },
    answer: {
      title: "Answer",
      lines: ["with citations", "[1] [2]"],
      href: "#stage-model",
      color: COLOR.axis,
      outside: true,
      spoken: "with citations; not produced by Outpost",
    },
  };
}

const ORDER: NodeId[] = [
  "library",
  "passages",
  "index",
  "question",
  "words",
  "vector",
  "keyword",
  "meaning",
  "fusion",
  "context",
  "model",
  "answer",
];

/** The whole journey: what is prepared beforehand, and what happens to one question. */
export function PipelineDiagram({ overview, trace }: { overview: ExplainOverview | undefined; trace: ExplainResponse | undefined }) {
  const [ref, width] = useMeasure<HTMLDivElement>(760);
  const layout = layoutPipeline(width);
  const texts = nodeTexts(overview, trace);

  return (
    <div ref={ref}>
      <svg
        width={layout.width}
        height={layout.height}
        aria-label="The journey of a question, stage by stage. Each stage links to its section."
        className="block max-w-full overflow-visible"
      >
        <defs>
          <marker id="understand-arrow" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0.5 L7,4 L0,7.5 z" fill={COLOR.axis} />
          </marker>
        </defs>
        {layout.bands.map((band) => (
          <text key={band.id} x={band.x} y={band.y} className="fill-ink-muted text-[0.78125rem]">
            {band.id === "before" ? "Beforehand, once for each document and page" : "Then, for every question"}
          </text>
        ))}
        {layout.edges.map((edge) => (
          <path
            key={`${edge.from}-${edge.to}`}
            d={edge.path}
            fill="none"
            stroke={COLOR.axis}
            strokeWidth={1.25}
            strokeDasharray={edge.outside ? "4 4" : undefined}
            markerEnd="url(#understand-arrow)"
          />
        ))}
        {ORDER.map((id) => {
          const node = layout.nodes[id];
          const text = texts[id];
          const room = node.width - 14;
          return (
            <a key={id} href={text.href} aria-label={`${text.title}${text.spoken ? `: ${text.spoken}` : ""}`} className="understand-node">
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={NODE_HEIGHT}
                rx={5}
                fill={COLOR.page}
                stroke={text.color}
                strokeWidth={text.outside ? 1.25 : 1.75}
                strokeDasharray={text.outside ? "4 4" : undefined}
              />
              <text x={node.x + 8} y={node.y + 20} className="fill-ink text-[0.8125rem] font-semibold">
                {fitLabel(text.title, room, 13, 600)}
              </text>
              {text.lines.slice(0, 2).map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: at most two fixed lines
                <text key={index} x={node.x + 8} y={node.y + 37 + index * 15} className="tabular fill-ink-muted text-[0.75rem]">
                  {fitLabel(line, room, 12)}
                </text>
              ))}
              {text.timing !== undefined ? (
                <text x={node.x + 8} y={node.y + NODE_HEIGHT + 13} className="tabular fill-ink-muted text-[0.75rem]">
                  {formatMs(text.timing)}
                </text>
              ) : null}
            </a>
          );
        })}
      </svg>
      <HiddenTable
        caption="The stages a question passes through"
        columns={["Stage", "What happened", "Time"]}
        rows={ORDER.map((id) => [
          texts[id].title,
          texts[id].spoken || texts[id].lines.join(", "),
          texts[id].timing === undefined ? null : formatMs(texts[id].timing!),
        ])}
      />
    </div>
  );
}
