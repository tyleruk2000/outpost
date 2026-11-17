/**
 * The plot, seen from above: a drawing in SVG with the beds and the things around the
 * edge laid over it as real buttons, so that every bed can be pressed, tabbed to and
 * named aloud. The drawing is in `scenery.tsx` (the ground, the hedge, the shed and the
 * lasting things) and `crops.tsx` (the beds), every colour a `--game-*` token. The
 * season dresses it; the device's own time of day lights it; a wet day greys it and lays
 * rain over it. Each bed's label says what it is doing: the time left, "Ripe", or why it
 * waits, with a mark (a crossed-out drop for dry soil, an hourglass for its months), so
 * that none of it rests on colour. Looks only.
 */
import {
  type AllotmentState,
  BUTT_KEEPS_MS,
  bedAt,
  bedNow,
  DAY,
  FIRST_GLASS_BED,
  type Hemisphere,
  KEEPING_NAMES,
  MAX_OPEN_BEDS,
  nextBedPrice,
  PRODUCER,
  type ProducerId,
  RAIN_SOAKS_MS,
  rainingAt,
  type Season,
  THINGS,
  type ThingId,
  wetDay,
} from "@outpost/shared/games/allotment";
import { DropletOff, Hourglass } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn, formatNumber, plural } from "@/lib/utils";
import { boardSurface } from "../kit/frame";
import { BedDrawing } from "./crops";
import { type Box, skyAt, v } from "./paint";
import {
  AppleTree,
  AT,
  CompostBin,
  Defs,
  Edges,
  GreenhouseFloor,
  GreenhouseGlass,
  Ground,
  HenHouse,
  Hive,
  LitWindow,
  MarkedOut,
  Puddles,
  Rain,
  Shadows,
  Shed,
  TapAndBarrow,
  VIEW,
  WaterButt,
} from "./scenery";
import { bedLabel, chip } from "./words";

export { VIEW };

/** Where each open bed is: four across, three down, with paths between. */
export function openBedBox(index: number): Box {
  return { x: 16 + (index % 4) * 84, y: 112 + Math.floor(index / 4) * 72, w: 72, h: 60 };
}
const glassBedBox = (index: number): Box => ({ x: 204 + (index - FIRST_GLASS_BED) * 72, y: 20, w: 64, h: 66 });
export const bedBox = (index: number) => (index >= FIRST_GLASS_BED ? glassBedBox(index) : openBedBox(index));

/** A box in the drawing as a position over it, in percentages, so the buttons scale with it. */
const place = ({ x, y, w, h }: Box) => ({
  left: `${(x / VIEW.width) * 100}%`,
  top: `${(y / VIEW.height) * 100}%`,
  width: `${(w / VIEW.width) * 100}%`,
  height: `${(h / VIEW.height) * 100}%`,
});

/** The month as the north has it: March is spring in both halves of the world. */
const northMonth = (now: number, hemisphere: Hemisphere) => (new Date(now).getUTCMonth() + (hemisphere === "south" ? 6 : 0)) % 12;

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

/** The weather on the plot at a moment, from the date alone: rain falling, puddles lying, the butt full. */
export function weatherAt(now: number, hemisphere: Hemisphere) {
  const day = Math.floor(now / DAY);
  const raining = rainingAt(now, hemisphere);
  const since = (soak: number) => [1, 2, 3].some((back) => wetDay(day - back, hemisphere) && now < (day - back + 1) * DAY + soak);
  return { raining, puddles: raining || since(RAIN_SOAKS_MS), buttFull: raining || since(BUTT_KEEPS_MS) };
}

const PLACES: ThingId[] = ["waterButt", "compostBin", "greenhouse", "hens", "beehive", "appleTree"];

export function Plot({ plot, hemisphere, season, now, local, selected, onBed, onThing, busy }: PlotProps) {
  const [marked, setMarked] = useState<string | null>(null);
  const month = northMonth(now, hemisphere);
  const sky = skyAt(local, month, hemisphere);
  const dark = sky.phase === "night";
  const weather = weatherAt(now, hemisphere);
  // Under cloud there is no sun to throw shadows.
  const shadow = weather.raining ? null : sky.shadow;
  const winter = season === "winter";
  const has = plot.things;
  const openBeds = Array.from({ length: MAX_OPEN_BEDS }, (_, index) => index);
  const glassBeds = plot.glassBeds.map((_, index) => FIRST_GLASS_BED + index);
  const thingLabel = (thing: ProducerId): string => {
    const { gives } = PRODUCER[thing];
    const n = plot.waiting[gives];
    const name = { hens: "The hens", beehive: "The beehive", appleTree: "The apple tree" }[thing];
    return n > 0
      ? `${name}, ${formatNumber(n)} ${n === 1 ? KEEPING_NAMES[gives].one : KEEPING_NAMES[gives].many} waiting. Collect`
      : `${name}, nothing waiting yet`;
  };

  // What is still to come, each a place on the ground that says what it is for.
  const waiting: Array<{ key: string; box: Box; label: string; caption: string }> = PLACES.filter((id) => !has[id]).map((id) => ({
    key: id,
    box: AT[id],
    label: `${THINGS[id].name}, not bought yet: ${plural(THINGS[id].price, "coin")} at the stall`,
    caption: `Marked out for the ${THINGS[id].name.toLowerCase()}. ${THINGS[id].does} ${plural(THINGS[id].price, "coin")} at the stall.`,
  }));
  const nextBed = nextBedPrice(plot);
  if (nextBed !== null) {
    const n = plot.beds.length + 1;
    waiting.unshift({
      key: "bed",
      box: openBedBox(plot.beds.length),
      label: `Ground for bed ${n}, not dug yet: ${plural(nextBed, "coin")} at the stall`,
      caption: `Marked out for bed ${n}. It can be dug for ${plural(nextBed, "coin")} at the stall.`,
    });
  }
  const shown = waiting.find((place) => place.key === marked) ?? null;
  // The words go at the far end of the plot from the place they are about, so as not to cover it.
  const captionAtTop = shown !== null && shown.box.y > VIEW.height / 2;

  let buttons: ReactNode[] = [...openBeds.filter((index) => index < plot.beds.length), ...glassBeds].map((index) => {
    const label = chip(plot, index, hemisphere);
    const ripe = label?.mark === "ripe";
    const waits = label?.mark === "water" || label?.mark === "season";
    return (
      <button
        key={index}
        type="button"
        aria-label={bedLabel(plot, index, hemisphere)}
        aria-pressed={selected === index}
        disabled={busy && ripe}
        onClick={() => {
          setMarked(null);
          onBed(index);
        }}
        style={place(bedBox(index))}
        className={cn(
          // The label sits astride the bed's top plank, over the path, so that it never covers what is growing.
          "absolute flex items-start justify-center rounded-[6px] outline-offset-2 transition-shadow duration-150 motion-reduce:transition-none",
          "hover:shadow-[0_0_0_2px_var(--game-soil-edge)]",
          selected === index && "shadow-[0_0_0_3px_var(--primary)] hover:shadow-[0_0_0_3px_var(--primary)]",
        )}
      >
        {label ? (
          <span
            className={cn(
              "tabular inline-flex -translate-y-1/2 items-center gap-0.5 rounded-[3px] px-1 text-micro leading-tight font-medium whitespace-nowrap shadow-[0_0_0_1px_var(--game-soil-edge)]",
              ripe || waits ? "bg-page text-ink" : "bg-page/85 text-ink-muted",
            )}
          >
            {label.mark === "water" ? <DropletOff aria-hidden className="size-3 shrink-0" strokeWidth={2.25} /> : null}
            {label.mark === "season" ? <Hourglass aria-hidden className="size-3 shrink-0" strokeWidth={2.25} /> : null}
            {label.text}
          </span>
        ) : null}
      </button>
    );
  });
  buttons = buttons.concat(
    (["hens", "beehive", "appleTree"] as const)
      .filter((thing) => has[thing])
      .map((thing) => {
        const n = plot.waiting[PRODUCER[thing].gives];
        return (
          <button
            key={thing}
            type="button"
            aria-label={thingLabel(thing)}
            onClick={() => {
              setMarked(null);
              onThing(thing);
            }}
            style={place(AT[thing])}
            className="absolute flex items-start justify-end rounded-[6px] p-1 outline-offset-2 hover:shadow-[0_0_0_2px_var(--game-soil-edge)]"
          >
            {n > 0 ? (
              <span className="tabular rounded-[3px] bg-page px-1 text-micro leading-tight font-medium text-ink">{formatNumber(n)}</span>
            ) : null}
          </button>
        );
      }),
    waiting.map((spot) => (
      <button
        key={spot.key}
        type="button"
        aria-label={spot.label}
        aria-expanded={marked === spot.key}
        onClick={() => setMarked((now) => (now === spot.key ? null : spot.key))}
        style={place(spot.box)}
        className={cn(
          "absolute rounded-[6px] outline-offset-2 hover:shadow-[0_0_0_2px_var(--game-string)]",
          marked === spot.key && "shadow-[0_0_0_2px_var(--game-string)]",
        )}
      />
    )),
  );

  const footprints = (
    <>
      <path d="M0 0H360V12H0ZM0 0H11V418H0ZM349 0H360V418H349Z" />
      <rect x={8} y={12} width={66} height={78} />
      <rect x={80} y={18} width={46} height={18} />
      <rect x={176} y={70} width={4} height={23} />
      <rect x={9} y={417} width={342} height={11} />
      {has.waterButt ? <rect x={76} y={56} width={22} height={32} rx={4} /> : null}
      {has.compostBin ? <rect x={120} y={50} width={42} height={38} /> : null}
      {has.greenhouse ? <rect x={192} y={10} width={156} height={84} opacity={0.5} /> : null}
      {has.hens ? <path d="M16 392V360L37 339L62 360V392Z" /> : null}
      {has.beehive ? <path d="M210 377V347L224 336L238 347V377Z" /> : null}
      {has.appleTree ? winter ? <circle cx={308} cy={362} r={24} opacity={0.4} /> : <circle cx={308} cy={362} r={30} /> : null}
    </>
  );

  return (
    <div className={cn("relative w-full overflow-hidden rounded-panel border border-border", boardSurface)}>
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} className="block h-auto w-full" aria-hidden focusable="false">
        <Defs />
        <Ground season={season} />
        {openBeds.map((index) =>
          index < plot.beds.length ? (
            <BedDrawing
              key={index}
              bed={bedAt(plot, index)!}
              box={openBedBox(index)}
              index={index}
              frost={winter}
              moist={bedNow(plot, index, hemisphere).moist !== null}
            />
          ) : (
            <MarkedOut key={index} box={openBedBox(index)} seed={index * 31 + 5} />
          ),
        )}
        {has.greenhouse ? <GreenhouseFloor /> : <MarkedOut box={AT.greenhouse} seed={3} />}
        {glassBeds.map((index) => (
          <BedDrawing
            key={index}
            bed={bedAt(plot, index)!}
            box={glassBedBox(index)}
            index={index}
            frost={false}
            moist={bedNow(plot, index, hemisphere).moist !== null}
          />
        ))}
        {has.waterButt ? null : <MarkedOut box={{ x: 76, y: 58, w: 22, h: 30 }} seed={7} />}
        {has.compostBin ? null : <MarkedOut box={{ x: 120, y: 50, w: 42, h: 38 }} seed={9} />}
        {has.hens ? null : <MarkedOut box={{ x: 14, y: 342, w: 138, h: 62 }} seed={17} />}
        {has.beehive ? null : <MarkedOut box={{ x: 206, y: 346, w: 36, h: 40 }} seed={19} />}
        {has.appleTree ? null : <MarkedOut box={{ x: 280, y: 336, w: 56, h: 56 }} seed={23} round />}
        {weather.puddles ? <Puddles raining={weather.raining} /> : null}
        <Shadows shadow={shadow} footprints={footprints} />
        <Edges season={season} />
        <TapAndBarrow season={season} moon={dark} />
        <Shed season={season} />
        {has.waterButt ? <WaterButt moon={dark} full={weather.buttFull} /> : null}
        {has.compostBin ? <CompostBin compost={plot.compost} /> : null}
        {has.greenhouse ? <GreenhouseGlass winter={winter} /> : null}
        {has.hens ? <HenHouse eggs={plot.waiting.eggs} roosting={dark} /> : null}
        {has.beehive ? <Hive honey={plot.waiting.honey} bees={!dark && !winter} /> : null}
        {has.appleTree ? <AppleTree month={month} apples={plot.waiting.apples} season={season} /> : null}
        {weather.raining ? <Rain /> : null}
        {sky.phase !== "day" ? (
          <rect width={VIEW.width} height={VIEW.height} fill={v(sky.phase)} style={{ mixBlendMode: "multiply" }} pointerEvents="none" />
        ) : null}
        {sky.phase !== "day" ? <LitWindow glow={dark} /> : null}
      </svg>
      {buttons}
      {shown ? (
        <p
          className={cn(
            "absolute inset-x-2 rounded-[5px] bg-page/95 px-2.5 py-1.5 text-small text-ink shadow-sm",
            captionAtTop ? "top-2" : "bottom-2",
          )}
        >
          {shown.caption}
        </p>
      ) : null}
    </div>
  );
}
