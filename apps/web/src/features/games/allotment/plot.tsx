/**
 * The plot, seen from above: a drawing in SVG with the beds and the things around the
 * edge laid over it as real buttons, so that every bed can be pressed, tabbed to and
 * named aloud. Everything is drawn here in a few plain shapes with the games' tokens;
 * the season tints the grass and dresses the tree, frost edges the paths in winter, and
 * the device's own time of day lays a wash of dusk or night over it. Looks only.
 */
import {
  type AllotmentState,
  type Bed,
  type BedStage,
  bedAt,
  type CropId,
  FIRST_GLASS_BED,
  type Hemisphere,
  KEEPING_NAMES,
  MAX_OPEN_BEDS,
  PRODUCER,
  type ProducerId,
  readyInMs,
  type Season,
  stageOf,
} from "@outpost/shared/games/allotment";
import type { ReactNode } from "react";
import { cn, formatNumber } from "@/lib/utils";
import { boardSurface } from "../kit/frame";
import { bedLabel, shortWords } from "./words";

export const VIEW = { width: 360, height: 410 };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where each open bed is: four across, three down, with paths between. */
export function openBedBox(index: number): Box {
  return { x: 16 + (index % 4) * 84, y: 112 + Math.floor(index / 4) * 72, w: 72, h: 60 };
}
const glassBedBox = (index: number): Box => ({ x: 204 + (index - FIRST_GLASS_BED) * 72, y: 20, w: 64, h: 66 });
export const bedBox = (index: number) => (index >= FIRST_GLASS_BED ? glassBedBox(index) : openBedBox(index));

const THING_BOX: Record<ProducerId, Box> = {
  hens: { x: 8, y: 334, w: 150, h: 68 },
  beehive: { x: 164, y: 338, w: 56, h: 62 },
  appleTree: { x: 256, y: 328, w: 92, h: 76 },
};

/** A box in the drawing as a position over it, in percentages, so the buttons scale with it. */
const place = ({ x, y, w, h }: Box) => ({
  left: `${(x / VIEW.width) * 100}%`,
  top: `${(y / VIEW.height) * 100}%`,
  width: `${(w / VIEW.width) * 100}%`,
  height: `${(h / VIEW.height) * 100}%`,
});

/** The month as the north has it: March is spring in both halves of the world. */
const northMonth = (now: number, hemisphere: Hemisphere) => (new Date(now).getUTCMonth() + (hemisphere === "south" ? 6 : 0)) % 12;

/** Dusk or night by the device's own clock, or nothing by day. */
export function lightAt(date: Date): "day" | "dusk" | "night" {
  const hour = date.getHours();
  if (hour >= 21 || hour < 5) return "night";
  if (hour < 7 || hour >= 18) return "dusk";
  return "day";
}

// ── Crops ──────────────────────────────────────────────────────────────────

/** One plant of a crop when it is ripe, centred on (x, y). */
function RipePlant({ crop, x, y }: { crop: CropId; x: number; y: number }) {
  switch (crop) {
    case "radishes":
      return (
        <g>
          <ellipse cx={x - 2.5} cy={y - 4} rx={2} ry={4} className="fill-game-leaf" transform={`rotate(-25 ${x - 2.5} ${y - 4})`} />
          <ellipse cx={x + 2.5} cy={y - 4} rx={2} ry={4} className="fill-game-leaf" transform={`rotate(25 ${x + 2.5} ${y - 4})`} />
          <circle cx={x} cy={y + 2} r={3.6} className="fill-game-berry" />
        </g>
      );
    case "salad":
      return (
        <g>
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse
              key={angle}
              cx={x}
              cy={y - 3.5}
              rx={2.6}
              ry={4.4}
              className={angle % 144 === 0 ? "fill-game-leaf" : "fill-game-leaf-deep"}
              transform={`rotate(${angle} ${x} ${y})`}
            />
          ))}
        </g>
      );
    case "peas":
      return (
        <g>
          <line x1={x} y1={y - 8} x2={x} y2={y + 7} className="stroke-game-wood" strokeWidth={1.4} />
          <ellipse cx={x - 3} cy={y - 3} rx={2.6} ry={1.8} className="fill-game-leaf" />
          <ellipse cx={x + 3} cy={y + 1} rx={2.6} ry={1.8} className="fill-game-leaf" />
          <rect x={x + 1.4} y={y - 6} width={2.2} height={5} rx={1.1} className="fill-game-leaf-deep" />
          <rect x={x - 3.6} y={y + 1.5} width={2.2} height={5} rx={1.1} className="fill-game-leaf-deep" />
        </g>
      );
    case "carrots":
      return (
        <g>
          {[-30, 0, 30].map((angle) => (
            <line
              key={angle}
              x1={x}
              y1={y}
              x2={x}
              y2={y - 8}
              className="stroke-game-leaf"
              strokeWidth={1.6}
              strokeLinecap="round"
              transform={`rotate(${angle} ${x} ${y})`}
            />
          ))}
          <path d={`M${x - 2.6} ${y} L${x + 2.6} ${y} L${x} ${y + 6} Z`} className="fill-game-root" />
        </g>
      );
    case "beetroot":
      return (
        <g>
          <ellipse
            cx={x - 2.5}
            cy={y - 4}
            rx={2.2}
            ry={4.2}
            className="fill-game-leaf-deep"
            transform={`rotate(-20 ${x - 2.5} ${y - 4})`}
          />
          <ellipse cx={x + 2.5} cy={y - 4} rx={2.2} ry={4.2} className="fill-game-leaf-deep" transform={`rotate(20 ${x + 2.5} ${y - 4})`} />
          <circle cx={x} cy={y + 2.5} r={4.2} className="fill-game-berry" />
        </g>
      );
    case "potatoes":
      return (
        <g>
          <circle cx={x} cy={y} r={6.5} className="fill-game-leaf-deep" />
          <circle cx={x - 2} cy={y - 1.5} r={3.6} className="fill-game-leaf" />
          <circle cx={x + 2.5} cy={y - 2.5} r={1.2} className="fill-game-bloom" />
          <circle cx={x - 2.5} cy={y + 2.5} r={1.2} className="fill-game-bloom" />
        </g>
      );
    case "leeks":
      return (
        <g>
          <rect x={x - 1.6} y={y - 3} width={3.2} height={11} rx={1.4} className="fill-game-leaf" />
          <path
            d={`M${x} ${y - 2} L${x - 5} ${y - 10} M${x} ${y - 2} L${x + 5} ${y - 10} M${x} ${y - 2} L${x} ${y - 11}`}
            className="stroke-game-leaf-deep"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </g>
      );
    case "squash":
      return (
        <g>
          <ellipse cx={x + 6} cy={y - 5} rx={6} ry={4} className="fill-game-leaf" />
          <ellipse cx={x - 1} cy={y + 2} rx={8.5} ry={6.5} className="fill-game-root" />
          <path
            d={`M${x - 1} ${y - 4} V${y + 8} M${x - 5.5} ${y - 3} Q${x - 7} ${y + 2} ${x - 5.5} ${y + 7} M${x + 3.5} ${y - 3} Q${x + 5} ${y + 2} ${x + 3.5} ${y + 7}`}
            className="stroke-game-soil-edge"
            strokeWidth={0.8}
            fill="none"
          />
        </g>
      );
  }
}

/** A plant on its way: seed drills, a pair of seed leaves, then a smaller green plant. */
function YoungPlant({ stage, x, y }: { stage: BedStage; x: number; y: number }) {
  if (stage === "sown")
    // A short drill of seed, drawn in the path's colour so it shows on wet soil and dry.
    return <rect x={x - 3} y={y - 0.8} width={6} height={1.6} rx={0.8} className="fill-game-path" opacity={0.75} />;
  if (stage === "shoots")
    return (
      <g>
        <line x1={x} y1={y + 2} x2={x} y2={y - 1} className="stroke-game-leaf-deep" strokeWidth={1} />
        <ellipse cx={x - 2} cy={y - 1.5} rx={2} ry={1.1} className="fill-game-leaf" />
        <ellipse cx={x + 2} cy={y - 1.5} rx={2} ry={1.1} className="fill-game-leaf" />
      </g>
    );
  return (
    <g>
      <ellipse cx={x - 2.4} cy={y - 2} rx={2} ry={3.6} className="fill-game-leaf" transform={`rotate(-25 ${x - 2.4} ${y - 2})`} />
      <ellipse cx={x + 2.4} cy={y - 2} rx={2} ry={3.6} className="fill-game-leaf-deep" transform={`rotate(25 ${x + 2.4} ${y - 2})`} />
      <line x1={x} y1={y + 3} x2={x} y2={y - 1} className="stroke-game-leaf-deep" strokeWidth={1.2} />
    </g>
  );
}

/** Where the plants sit in a bed: three across and two down, or fewer for big ones. */
function plantSpots(box: Box, crop: CropId, stage: BedStage): Array<[number, number]> {
  const across = stage === "ripe" && crop === "squash" ? 2 : 3;
  const down = stage === "ripe" && crop === "squash" ? 1 : 2;
  const spots: Array<[number, number]> = [];
  for (let row = 0; row < down; row++)
    for (let col = 0; col < across; col++)
      spots.push([box.x + (box.w * (col + 0.5)) / across, box.y + 4 + ((box.h - 8) * (row + 0.5)) / down]);
  return spots;
}

function BedDrawing({ bed, box, dug = true }: { bed: Bed | null; box: Box; dug?: boolean }) {
  if (!dug || !bed)
    return (
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={5}
        className="fill-none stroke-game-soil-edge"
        strokeWidth={1}
        strokeDasharray="3 4"
        opacity={0.6}
      />
    );
  const stage = stageOf(bed);
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={5}
        className={cn(bed.watered && stage !== "ripe" ? "fill-game-soil-wet" : "fill-game-soil", "stroke-game-soil-edge")}
        strokeWidth={1.5}
      />
      {/* The rows of a bed, raked. */}
      {[0.33, 0.66].map((at) => (
        <line
          key={at}
          x1={box.x + 6}
          x2={box.x + box.w - 6}
          y1={box.y + box.h * at + 2}
          y2={box.y + box.h * at + 2}
          className="stroke-game-soil-edge"
          strokeWidth={0.7}
          opacity={0.6}
        />
      ))}
      {bed.crop ? (
        // Keyed by what is drawn, so a change (sown, sprouting, harvested) fades in rather than jumping.
        <g key={`${bed.crop}-${stage}`} className="motion-safe:animate-fade">
          {plantSpots(box, bed.crop, stage).map(([x, y]) =>
            stage === "ripe" ? (
              <RipePlant key={`${x}-${y}`} crop={bed.crop!} x={x} y={y} />
            ) : (
              <YoungPlant key={`${x}-${y}`} stage={stage} x={x} y={y} />
            ),
          )}
        </g>
      ) : null}
    </g>
  );
}

// ── The things around the edge ─────────────────────────────────────────────

/** The place a lasting thing will go, marked out on the ground until it is bought from the stall. */
function Spot({ shape }: { shape: Box | { cx: number; cy: number; r: number } }) {
  const line = { className: "fill-none stroke-game-soil-edge", strokeWidth: 1, strokeDasharray: "3 4", opacity: 0.45 };
  return "r" in shape ? (
    <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...line} />
  ) : (
    <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={4} {...line} />
  );
}

/** Where `n` small things (eggs, jars, apples) are set out, each with a place of its own. */
const spots = (n: number, at: (i: number) => [number, number]) => Array.from({ length: n }, (_, i) => at(i));

function Shed() {
  return (
    <g>
      <rect x={12} y={14} width={66} height={64} rx={2} className="fill-game-roof" />
      <path d="M12 46 H78" className="stroke-game-soil-edge" strokeWidth={1.2} />
      {[22, 30, 38].map((y) => (
        <path key={y} d={`M14 ${y} H76 M14 ${y + 32} H76`} className="stroke-game-soil-edge" strokeWidth={0.6} opacity={0.5} />
      ))}
      <rect x={34} y={78} width={20} height={4} className="fill-game-wood" />
    </g>
  );
}

function WaterButt() {
  return (
    <g>
      <circle cx={94} cy={66} r={12} className="fill-game-wood stroke-game-soil-edge" strokeWidth={1.4} />
      <circle cx={94} cy={66} r={8.5} className="fill-game-water" />
    </g>
  );
}

function CompostBin({ compost }: { compost: number }) {
  return (
    <g>
      <rect x={114} y={44} width={40} height={40} rx={2} className="fill-game-soil-wet stroke-game-wood" strokeWidth={3} />
      {[54, 64, 74].map((y) => (
        <line key={y} x1={114} x2={154} y1={y} y2={y} className="stroke-game-wood" strokeWidth={1.2} />
      ))}
      {/* A little heap that grows with what is in it. */}
      {compost > 0 ? <ellipse cx={134} cy={70} rx={6 + compost * 1.4} ry={4 + compost * 0.7} className="fill-game-soil" /> : null}
    </g>
  );
}

function Greenhouse() {
  return (
    <g>
      <rect x={196} y={10} width={152} height={84} rx={3} className="fill-game-glass stroke-game-wood" strokeWidth={2} />
      {[234, 272, 310].map((x) => (
        <line key={x} x1={x} x2={x} y1={10} y2={94} className="stroke-game-wood" strokeWidth={0.8} opacity={0.6} />
      ))}
    </g>
  );
}

function HenHouse({ eggs }: { eggs: number }) {
  return (
    <g>
      <rect x={14} y={346} width={64} height={44} rx={2} className="fill-game-wood" />
      <path d="M10 350 L46 336 L82 350 Z" className="fill-game-roof" />
      <rect x={38} y={372} width={14} height={18} rx={6} className="fill-game-soil-edge" />
      {/* Two hens out on the grass. */}
      {[
        [104, 372],
        [134, 386],
      ].map(([x, y]) => (
        <g key={x}>
          <ellipse cx={x} cy={y} rx={9} ry={6.5} className="fill-game-path stroke-game-wood" strokeWidth={1} />
          <circle cx={x! + 8} cy={y! - 4} r={3.6} className="fill-game-path stroke-game-wood" strokeWidth={1} />
          <circle cx={x! + 9} cy={y! - 8} r={1.4} className="fill-game-berry" />
        </g>
      ))}
      {spots(Math.min(eggs, 6), (i) => [20 + i * 9, 398]).map(([x, y]) => (
        <ellipse key={x} cx={x} cy={y} rx={3} ry={3.8} className="fill-game-path stroke-game-wood" strokeWidth={0.8} />
      ))}
    </g>
  );
}

function Hive({ honey }: { honey: number }) {
  return (
    <g>
      <rect x={172} y={356} width={40} height={10} rx={1.5} className="fill-game-roof" />
      <rect x={175} y={366} width={34} height={13} className="fill-game-bloom stroke-game-wood" strokeWidth={1} />
      <rect x={175} y={379} width={34} height={13} className="fill-game-bloom stroke-game-wood" strokeWidth={1} />
      <rect x={187} y={388} width={10} height={3} className="fill-game-soil-edge" />
      {spots(Math.min(honey, 4), (i) => [170 + i * 11, 396]).map(([x, y]) => (
        <rect key={x} x={x} y={y} width={8} height={6} rx={1} className="fill-game-root" />
      ))}
    </g>
  );
}

function AppleTree({ month, apples }: { month: number; apples: number }) {
  const bare = month === 11 || month <= 1;
  const blossom = month >= 2 && month <= 4;
  // Fruit is drawn in late summer and autumn, and whenever apples are waiting to be picked up.
  const fruit = (month >= 7 && month <= 10) || apples > 0;
  const cx = 302;
  const cy = 362;
  return (
    <g>
      <rect x={cx - 3} y={cy} width={6} height={36} rx={2} className="fill-game-wood" />
      {bare ? (
        <path
          d={`M${cx} ${cy + 4} L${cx - 24} ${cy - 18} M${cx} ${cy + 4} L${cx + 22} ${cy - 20} M${cx} ${cy} L${cx + 2} ${cy - 28} M${cx - 12} ${cy - 6} L${cx - 20} ${cy - 26} M${cx + 12} ${cy - 7} L${cx + 26} ${cy - 4}`}
          className="stroke-game-wood"
          strokeWidth={2.4}
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <>
          <circle cx={cx} cy={cy - 8} r={30} className="fill-game-leaf-deep" />
          <circle cx={cx - 10} cy={cy - 14} r={16} className="fill-game-leaf" opacity={0.7} />
        </>
      )}
      {blossom
        ? [
            [-16, -22],
            [8, -28],
            [18, -6],
            [-6, -2],
            [-20, -4],
            [4, -16],
            [16, -22],
          ].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={cx + dx!} cy={cy + dy!} r={2.6} className="fill-game-blossom" />)
        : null}
      {fruit && !bare
        ? [
            [-14, -18],
            [10, -24],
            [16, -2],
            [-4, 4],
            [-20, 0],
          ].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={cx + dx!} cy={cy + dy!} r={3.2} className="fill-game-berry" />)
        : null}
      {spots(Math.min(apples, 12), (i) => [262 + (i % 6) * 7, 392 + Math.floor(i / 6) * 7]).map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3} className="fill-game-berry" />
      ))}
    </g>
  );
}

// ── The plot ───────────────────────────────────────────────────────────────

const GRASS: Record<Season, string> = {
  spring: "fill-game-grass",
  summer: "fill-game-grass",
  autumn: "fill-game-grass-autumn",
  winter: "fill-game-grass-winter",
};

export interface PlotProps {
  plot: AllotmentState;
  hemisphere: Hemisphere;
  season: Season;
  /** The moment shown (the server's clock, moved on by the device's). */
  now: number;
  /** The device's own time of day, for the light. */
  local: Date;
  selected: number | null;
  onBed: (index: number) => void;
  onThing: (thing: ProducerId) => void;
  busy: boolean;
}

/** A bed's short label: "Ripe", "40 min", or nothing for an empty one. */
function chip(plot: AllotmentState, index: number, hemisphere: Hemisphere): string | null {
  const bed = bedAt(plot, index);
  if (!bed?.crop) return null;
  if (stageOf(bed) === "ripe") return "Ripe";
  return shortWords(readyInMs(plot, index, hemisphere) ?? 0);
}

export function Plot({ plot, hemisphere, season, now, local, selected, onBed, onThing, busy }: PlotProps) {
  const month = northMonth(now, hemisphere);
  const light = lightAt(local);
  const openBeds = Array.from({ length: MAX_OPEN_BEDS }, (_, index) => index);
  const glassBeds = plot.glassBeds.map((_, index) => FIRST_GLASS_BED + index);
  const winter = season === "winter";
  const thingLabel = (thing: ProducerId): string => {
    const { gives } = PRODUCER[thing];
    const n = plot.waiting[gives];
    const name = { hens: "The hens", beehive: "The beehive", appleTree: "The apple tree" }[thing];
    return n > 0
      ? `${name}, ${formatNumber(n)} ${n === 1 ? KEEPING_NAMES[gives].one : KEEPING_NAMES[gives].many} waiting. Collect`
      : `${name}, nothing waiting yet`;
  };

  let buttons: ReactNode[] = [...openBeds.filter((index) => index < plot.beds.length), ...glassBeds].map((index) => {
    const text = chip(plot, index, hemisphere);
    const ripe = text === "Ripe";
    return (
      <button
        key={index}
        type="button"
        aria-label={bedLabel(plot, index, hemisphere)}
        aria-pressed={selected === index}
        disabled={busy && ripe}
        onClick={() => onBed(index)}
        style={place(bedBox(index))}
        className={cn(
          "absolute flex items-start justify-start rounded-[6px] p-1 outline-offset-2 transition-shadow duration-150 motion-reduce:transition-none",
          "hover:shadow-[0_0_0_2px_var(--game-soil-edge)]",
          selected === index && "shadow-[0_0_0_3px_var(--primary)] hover:shadow-[0_0_0_3px_var(--primary)]",
        )}
      >
        {text ? (
          <span
            className={cn(
              "tabular rounded-[3px] px-1 text-micro leading-tight font-medium whitespace-nowrap",
              ripe ? "bg-page text-ink" : "bg-page/85 text-ink-muted",
            )}
          >
            {text}
          </span>
        ) : null}
      </button>
    );
  });
  buttons = buttons.concat(
    (["hens", "beehive", "appleTree"] as const)
      .filter((thing) => plot.things[thing])
      .map((thing) => {
        const n = plot.waiting[PRODUCER[thing].gives];
        return (
          <button
            key={thing}
            type="button"
            aria-label={thingLabel(thing)}
            onClick={() => onThing(thing)}
            style={place(THING_BOX[thing])}
            className="absolute flex items-start justify-end rounded-[6px] p-1 outline-offset-2 hover:shadow-[0_0_0_2px_var(--game-soil-edge)]"
          >
            {n > 0 ? (
              <span className="tabular rounded-[3px] bg-page px-1 text-micro leading-tight font-medium text-ink">{formatNumber(n)}</span>
            ) : null}
          </button>
        );
      }),
  );

  return (
    <div className={cn("relative w-full overflow-hidden rounded-panel border border-border", boardSurface)}>
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} className="block h-auto w-full" aria-hidden focusable="false">
        <rect width={VIEW.width} height={VIEW.height} className={GRASS[season]} />
        {/* The paths: one along the top, and the ground between the beds. */}
        <rect x={0} y={98} width={VIEW.width} height={10} className="fill-game-path" />
        <rect x={8} y={104} width={344} height={224} rx={4} className="fill-game-path" />
        <rect x={180} y={0} width={12} height={104} className="fill-game-path" />
        {winter ? (
          <g className="stroke-game-frost" strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" fill="none">
            <rect x={9} y={105} width={342} height={222} rx={4} />
            <path d="M0 99 H360 M181 0 V98 M191 0 V98" />
          </g>
        ) : null}
        <Shed />
        {plot.things.waterButt ? <WaterButt /> : <Spot shape={{ cx: 94, cy: 66, r: 12 }} />}
        {plot.things.compostBin ? <CompostBin compost={plot.compost} /> : <Spot shape={{ x: 114, y: 44, w: 40, h: 40 }} />}
        {plot.things.greenhouse ? <Greenhouse /> : <Spot shape={{ x: 196, y: 10, w: 152, h: 84 }} />}
        {openBeds.map((index) => (
          <BedDrawing key={index} bed={bedAt(plot, index)} box={openBedBox(index)} dug={index < plot.beds.length} />
        ))}
        {glassBeds.map((index) => (
          <BedDrawing key={index} bed={bedAt(plot, index)} box={glassBedBox(index)} />
        ))}
        {plot.things.hens ? <HenHouse eggs={plot.waiting.eggs} /> : <Spot shape={{ x: 12, y: 340, w: 136, h: 56 }} />}
        {plot.things.beehive ? <Hive honey={plot.waiting.honey} /> : <Spot shape={{ x: 170, y: 352, w: 44, h: 44 }} />}
        {plot.things.appleTree ? <AppleTree month={month} apples={plot.waiting.apples} /> : <Spot shape={{ cx: 302, cy: 362, r: 30 }} />}
        {light !== "day" ? (
          <rect
            width={VIEW.width}
            height={VIEW.height}
            className={light === "night" ? "fill-game-night" : "fill-game-dusk"}
            pointerEvents="none"
          />
        ) : null}
      </svg>
      {buttons}
    </div>
  );
}
