import type { ExplainChunk, ExplainEntity } from "@outpost/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { kindMeta } from "@/components/search-hit";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/misc";
import { formatNumber, plural } from "@/lib/utils";
import { COLOR } from "../charts/colors";
import { HiddenTable, Legend, useMeasure } from "../charts/figure";
import { fitLabel } from "../charts/measure";
import type { ChunksResponse } from "../data";
import { extents, layoutRibbon, placeLabel, splitOverlap, stepIndex } from "../lib/ribbon";
import { approxTokens } from "../lib/text";

const LABEL_ROOM = 16;
const LANE = 14;
const LANE_GAP = 2;
const ROW_GAP = 10;
const ROW = LABEL_ROOM + LANE * 2 + LANE_GAP + ROW_GAP;

export const entityKey = (entity: { kind: string; entityId: string }) => `${entity.kind}:${entity.entityId}`;

/** Chooses which document or page the ribbon shows. */
export function DocumentPicker({
  entities,
  value,
  onChange,
}: {
  entities: ExplainEntity[];
  value: string | undefined;
  onChange: (key: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <label htmlFor={id} className="text-small font-medium text-ink">
        Document on show
      </label>
      <Select
        id={id}
        value={value}
        onChange={onChange}
        className="w-80 max-w-full"
        options={entities.map((entity) => ({
          value: entityKey(entity),
          label: entity.title,
          description: `${kindMeta[entity.kind]?.label ?? entity.kind}, ${plural(entity.chunks, "passage")}`,
        }))}
      />
    </div>
  );
}

export function ribbonReading(data: ChunksResponse): string {
  const { chunks, entity } = data;
  const total = extents(chunks).reduce((max, range) => Math.max(max, range.end), 0);
  const shared = chunks.filter((chunk) => chunk.overlapWithPrevious > 0);
  const average = shared.length ? Math.round(shared.reduce((sum, chunk) => sum + chunk.overlapWithPrevious, 0) / shared.length) : 0;
  const cut = `“${entity.title}” is ${formatNumber(total)} characters long and was cut into ${plural(chunks.length, "passage")}.`;
  if (shared.length === 0)
    return `${cut} None of its sections was long enough to need cutting, so no passage shares text with a neighbour.`;
  return `${cut} ${plural(shared.length, "passage")} ${shared.length === 1 ? "shares" : "share"} text with the one before, about ${formatNumber(average)} characters each time.`;
}

function PassageReader({
  chunks,
  index,
  demonstration,
  onStep,
}: {
  chunks: ExplainChunk[];
  index: number;
  demonstration: boolean;
  onStep: (index: number) => void;
}) {
  const chunk = chunks[index];
  if (!chunk) return null;
  const sharedAfter = chunks[index + 1]?.overlapWithPrevious ?? 0;
  const { head, body, tail } = splitOverlap(chunk.text, chunk.overlapWithPrevious, sharedAfter);
  const place = placeLabel(chunk);
  const shared = "rounded-[2px] bg-surface-strong decoration-ink-muted decoration-dotted underline underline-offset-[0.25em]";
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p aria-live="polite" className="text-small text-ink-muted">
          <span className="font-semibold text-ink">
            Passage {index + 1} of {chunks.length}
          </span>
          {place ? <span> · {place}</span> : null}
          <span className="tabular">
            {" "}
            · {formatNumber(chunk.text.length)} characters, about {formatNumber(approxTokens(chunk.text.length))} tokens
          </span>
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous passage" disabled={index === 0} onClick={() => onStep(index - 1)}>
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next passage"
            disabled={index === chunks.length - 1}
            onClick={() => onStep(index + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <p className="mt-2 max-w-[74ch] font-serif text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">
        {head ? <span className={shared}>{head}</span> : null}
        {body}
        {tail ? <span className={shared}>{tail}</span> : null}
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-small text-ink-muted sm:grid-cols-[auto_1fr]">
        <dt>Shared text</dt>
        <dd className="tabular text-ink">
          {chunk.overlapWithPrevious > 0 || sharedAfter > 0 ? (
            <>
              <span className={shared}>marked like this</span>: {formatNumber(chunk.overlapWithPrevious)} characters with the passage
              before, {formatNumber(sharedAfter)} with the one after
            </>
          ) : (
            "none: this passage is a whole section on its own"
          )}
        </dd>
        <dt>Vector</dt>
        <dd className="text-ink">
          {chunk.hasVector
            ? "stored for the model in use"
            : demonstration
              ? "none stored; demonstration vectors are made on the spot"
              : "not made yet"}
        </dd>
        <dt>Content hash</dt>
        <dd className="font-mono text-[0.8125rem] break-all text-ink">{chunk.contentHash}</dd>
      </dl>
    </div>
  );
}

/** One document as a ribbon of passages, with the passage under the pointer shown beneath it. */
export function DocumentRibbon({ data, demonstration }: { data: ChunksResponse; demonstration: boolean }) {
  const { chunks, entity, chunkSize } = data;
  const [ref, width] = useMeasure<HTMLDivElement>(720);
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const listId = useId();

  // Start on the first passage that shares text with its neighbour: it shows the overlap straight away.
  const entityId = entityKey(entity);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when another document is picked
  useEffect(() => {
    const first = chunks.findIndex((chunk) => chunk.overlapWithPrevious > 0);
    setSelected(Math.max(first, 0));
    setHovered(null);
  }, [entityId]);

  const layout = useMemo(() => layoutRibbon(chunks, { width, chunkSize, maxRows: width < 480 ? 16 : 12 }), [chunks, width, chunkSize]);
  const shown = Math.min(chunks.length - 1, hovered ?? selected);
  const active = Math.min(chunks.length - 1, selected);
  const rowTop = (row: number) => row * ROW;
  const laneY = (row: number, lane: number) => rowTop(row) + LABEL_ROOM + lane * (LANE + LANE_GAP);

  const onKeyDown = (event: KeyboardEvent) => {
    const next = stepIndex(active, event.key, chunks.length);
    if (next === null) return;
    event.preventDefault();
    setHovered(null);
    setSelected(next);
  };

  return (
    <div>
      <Legend
        className="mb-3"
        items={[
          { label: "A passage", color: COLOR.other },
          { label: "Text shared by two passages", color: COLOR.axis },
          { label: "The passage shown below", color: COLOR.ink },
          { label: "A new page or heading", color: COLOR.axis, swatch: "line" },
        ]}
      />
      <div ref={ref}>
        <svg
          width={width}
          height={Math.max(ROW, layout.rows * ROW - ROW_GAP)}
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: an SVG list of passages; arrow keys move the selection
          role="listbox"
          tabIndex={0}
          aria-label={`Passages of ${entity.title}. Use the arrow keys to move from passage to passage.`}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setHovered(null)}
          className="understand-ribbon block max-w-full"
        >
          {chunks.map((chunk, index) => {
            const pieces = layout.pieces.filter((piece) => piece.index === index);
            const overlaps = layout.overlaps.filter((piece) => piece.index === index || piece.index === index + 1);
            const state = index === shown ? "shown" : "rest";
            return (
              <g
                key={chunk.chunkId}
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                aria-label={`Passage ${index + 1}${placeLabel(chunk) ? `, ${placeLabel(chunk)}` : ""}, ${formatNumber(chunk.text.length)} characters`}
                onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(index)}
                onClick={() => {
                  setSelected(index);
                  setHovered(null);
                }}
                className="cursor-pointer"
              >
                {pieces.map((piece) => (
                  <rect
                    key={`${piece.row}-${piece.x}`}
                    x={piece.x}
                    y={laneY(piece.row, piece.lane)}
                    width={Math.max(1.5, piece.width)}
                    height={LANE}
                    rx={2}
                    fill={state === "shown" ? COLOR.ink : COLOR.other}
                  />
                ))}
                {/* A taller, invisible target so thin passages can still be hit. */}
                {pieces.map((piece) => (
                  <rect
                    key={`hit-${piece.row}-${piece.x}`}
                    x={piece.x}
                    y={rowTop(piece.row) + LABEL_ROOM - 2}
                    width={Math.max(6, piece.width)}
                    height={LANE * 2 + LANE_GAP + 4}
                    fill="transparent"
                  />
                ))}
                {state === "rest"
                  ? overlaps
                      .filter((piece) => piece.index === index)
                      .map((piece) => (
                        <rect
                          key={`shared-${piece.row}-${piece.x}`}
                          x={piece.x}
                          y={laneY(piece.row, 0)}
                          width={Math.max(1.5, piece.width)}
                          height={LANE * 2 + LANE_GAP}
                          fill={COLOR.axis}
                          pointerEvents="none"
                        />
                      ))
                  : null}
              </g>
            );
          })}
          {/* Shared stretches around the passage on show stay visible on top of it. */}
          {layout.overlaps
            .filter((piece) => piece.index === shown || piece.index === shown + 1)
            .map((piece) => (
              <rect
                key={`on-${piece.index}-${piece.row}-${piece.x}`}
                x={piece.x}
                y={laneY(piece.row, 0)}
                width={Math.max(1.5, piece.width)}
                height={LANE * 2 + LANE_GAP}
                fill={COLOR.axis}
                stroke={COLOR.page}
                strokeWidth={1}
                pointerEvents="none"
              />
            ))}
          {layout.boundaries.map((boundary, position) => {
            const next = layout.boundaries.slice(position + 1).find((other) => other.row === boundary.row && other.showLabel);
            const room = (next ? next.x : width) - boundary.x - 8;
            return (
              <g key={`${boundary.index}`} pointerEvents="none">
                <line
                  x1={boundary.x + 0.5}
                  x2={boundary.x + 0.5}
                  y1={rowTop(boundary.row) + 3}
                  y2={rowTop(boundary.row) + LABEL_ROOM + LANE * 2 + LANE_GAP}
                  stroke={COLOR.axis}
                  strokeWidth={1}
                />
                {boundary.showLabel ? (
                  <text x={boundary.x + 4} y={rowTop(boundary.row) + 11} className="fill-ink-muted text-[0.6875rem]">
                    {fitLabel(boundary.label, room, 11)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <PassageReader
        chunks={chunks}
        index={shown}
        demonstration={demonstration}
        onStep={(index) => {
          setSelected(index);
          setHovered(null);
        }}
      />
      <p className="mt-3 text-small text-ink-muted">
        <Link to={entity.url} className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
          Open “{entity.title}”
        </Link>
        {chunks.length >= 400 ? " · Only its first 400 passages are drawn." : null}
      </p>
      <HiddenTable
        caption={`How ${entity.title} was cut into passages`}
        columns={[
          "Passage",
          "Page or heading",
          "Starts at character",
          "Ends at character",
          "Characters shared with the passage before",
          "Has a stored vector",
        ]}
        rows={chunks.map((chunk, index) => [
          index + 1,
          placeLabel(chunk) || null,
          chunk.charStart,
          chunk.charEnd,
          chunk.overlapWithPrevious,
          chunk.hasVector ? "yes" : "no",
        ])}
      />
    </div>
  );
}
