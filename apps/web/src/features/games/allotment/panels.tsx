/**
 * What sits beside the plot: the panel for the bed in hand (sow, water, harvest), the
 * stall (the basket, the coins, more beds and the lasting things), this month on the plot
 * (what to sow, what waits for what), the almanac with a card for each crop and its
 * milestones, and the hemisphere switch. Lists with hairlines, in the app's own chrome.
 */
import {
  type AllotmentAction,
  type AllotmentState,
  bedAt,
  bedIndices,
  bedName,
  bedNow,
  COMPOST_BONUS,
  CROP_IDS,
  CROP_NOTES,
  CROPS,
  type CropId,
  DAY,
  FAMILIES,
  type Hemisphere,
  type HemisphereSetting,
  ITEM_IDS,
  inSeason,
  isGlassBed,
  itemPrice,
  MILESTONE_IDS,
  MILESTONES,
  monthAt,
  nextBedPrice,
  ROTATION_SOURCE,
  ROTATION_WHY,
  rainingAt,
  readyInMs,
  type Season,
  SOURCE_READ_ON,
  seasonOf,
  sowingMonth,
  THING_IDS,
  THINGS,
  wetDay,
} from "@outpost/shared/games/allotment";
import { ChevronRight, DropletOff, Droplets, Hourglass, X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { cn, formatDate, plural } from "@/lib/utils";
import { GameAbout } from "../kit/frame";
import { aboutWords, bedSentence, capital, growWords, itemCount, monthName, monthsWords, SEASON_WORDS, sowNote } from "./words";

type Act = (action: AllotmentAction) => void;

function Heading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-title text-lead text-ink">
      {children}
    </h2>
  );
}

/** A row of a list: what it is on the left, its button on the right, wrapping on a narrow screen. */
function Row({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <li className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5", className)}>
      <div className="min-w-0 flex-1 basis-48">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

// ── The bed in hand ────────────────────────────────────────────────────────

export function BedPanel({
  plot,
  index,
  hemisphere,
  busy,
  act,
  onClose,
  ref,
}: {
  plot: AllotmentState;
  index: number;
  hemisphere: Hemisphere;
  busy: boolean;
  act: Act;
  onClose: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const bed = bedAt(plot, index);
  if (!bed) return null;
  const glass = isGlassBed(index);
  const name = bedName(index);
  const now = bedNow(plot, index, hemisphere);
  const month = monthAt(plot.clock, hemisphere);
  let body: ReactNode;
  if (!bed.crop) {
    body = (
      <>
        <p className="mt-1 text-small text-ink">{bedSentence(plot, index, hemisphere)}</p>
        <p className="mt-1 text-small text-ink-muted">
          Choose what to sow; the seed is paid for from the coins. Each crop grows in its own months
          {glass ? ", and under glass in every month" : ""}, and only while the soil is moist.
        </p>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {CROP_IDS.map((id) => {
            const crop = CROPS[id];
            const fits = plot.coins >= crop.seed;
            const note = sowNote(id, month, glass, hemisphere);
            const waits = !inSeason(id, month, glass);
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={!fits || busy}
                  onClick={() => act({ type: "sow", bed: index, crop: id })}
                  aria-label={`Sow ${crop.name}: ${crop.seed === 0 ? "free" : plural(crop.seed, "coin")}, ${growWords(crop.growMs)}. ${note}${fits ? "" : ` ${plural(crop.seed - plot.coins, "more coin")} needed.`}`}
                  className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_4.75rem_4.5rem] items-center gap-x-2 px-1 py-1.5 text-left text-small transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-55 md:min-h-10"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{capital(crop.name)}</span>
                    <span className={cn("flex items-start gap-1 text-micro", waits ? "text-ink" : "text-ink-muted")}>
                      {waits ? <Hourglass aria-hidden className="mt-0.5 size-3 shrink-0" /> : null}
                      <span>{note}</span>
                    </span>
                  </span>
                  <span className="tabular self-start text-ink-muted">{crop.seed === 0 ? "Free" : plural(crop.seed, "coin")}</span>
                  <span className="tabular self-start text-right text-ink-muted">{growWords(crop.growMs)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-micro text-ink-muted">Growing times are the time a crop needs in moist soil, sped up for the game.</p>
      </>
    );
  } else {
    const crop = CROPS[bed.crop];
    const stage = now.stage;
    const left = readyInMs(plot, index, hemisphere);
    const growing = stage !== "ripe" && now.waitsFor === null;
    body = (
      <>
        <p className="mt-1 text-small text-ink">
          <span className="font-medium">{capital(crop.name)}</span>
          {stage === "ripe" ? "" : `, ${stage === "sown" ? "just sown" : stage}`}. {bedSentence(plot, index, hemisphere)}
        </p>
        <p className="mt-1 text-small text-ink-muted">
          {[
            growing && left !== null ? `Ready in ${aboutWords(left)} if it is not watered again.` : null,
            growing && left === null ? "Its water will run out before it ripens: water it again later." : null,
            bed.composted ? `Sown with compost: ${crop.yield + COMPOST_BONUS} to harvest.` : `${crop.yield} to harvest.`,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {stage === "ripe" ? (
            <Button variant="primary" loading={busy} onClick={() => act({ type: "harvest", bed: index })}>
              Harvest {crop.name}
            </Button>
          ) : now.waitsFor === "season" ? null : (
            <Button
              variant={now.waitsFor === "water" ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => act({ type: "water", bed: index })}
            >
              <Droplets aria-hidden />
              {now.moist ? "Water again" : "Water"}
            </Button>
          )}
        </div>
      </>
    );
  }
  return (
    <section ref={ref} aria-label={name} className="scroll-mt-4 rounded-panel border border-border bg-surface px-4 pt-3 pb-4">
      <div className="flex items-center justify-between gap-2">
        <Heading>{glass ? `${name}, under glass` : name}</Heading>
        <Button variant="ghost" size="icon-sm" aria-label={`Close ${name.toLowerCase()}`} onClick={onClose}>
          <X />
        </Button>
      </div>
      {body}
    </section>
  );
}

// ── The stall ──────────────────────────────────────────────────────────────

export function Stall({ plot, busy, act }: { plot: AllotmentState; busy: boolean; act: Act }) {
  const inBasket = ITEM_IDS.filter((item) => plot.basket[item] > 0);
  const worth = inBasket.reduce((sum, item) => sum + plot.basket[item] * itemPrice(item), 0);
  const bed = nextBedPrice(plot);
  const short = (price: number) => (plot.coins < price ? `${plural(price - plot.coins, "more coin")} needed.` : null);
  return (
    <section aria-labelledby="allotment-stall" className="mt-6">
      <Heading id="allotment-stall">The stall</Heading>
      <p className="mt-1 text-small text-ink-muted">
        You have{" "}
        <span key={plot.coins} className="tabular inline-block font-semibold text-ink motion-safe:animate-enter">
          {plural(plot.coins, "coin")}
        </span>
        .
      </p>

      <h3 className="mt-4 text-small font-semibold text-ink">The basket</h3>
      {inBasket.length === 0 ? (
        <p className="mt-1 text-small text-ink-muted">Empty. What you harvest and collect goes here to be sold.</p>
      ) : (
        <>
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {inBasket.map((item) => {
              const n = plot.basket[item];
              return (
                <Row
                  key={item}
                  action={
                    <Button
                      size="sm"
                      disabled={busy}
                      aria-label={`Sell ${itemCount(item, n)} for ${plural(n * itemPrice(item), "coin")}`}
                      onClick={() => act({ type: "sell", item, count: "all" })}
                    >
                      Sell
                    </Button>
                  }
                >
                  <span className="tabular text-small text-ink">{capital(itemCount(item, n))}</span>
                  <span className="tabular ml-2 text-small text-ink-muted">{plural(itemPrice(item), "coin")} each</span>
                </Row>
              );
            })}
          </ul>
          <Button className="mt-3" variant="soft" disabled={busy} onClick={() => act({ type: "sellAll" })}>
            Sell everything for {plural(worth, "coin")}
          </Button>
        </>
      )}

      <h3 className="mt-5 text-small font-semibold text-ink">To buy</h3>
      <ul className="mt-1 divide-y divide-border border-y border-border">
        <Row
          action={
            bed === null ? (
              <span className="text-small text-ink-muted">All dug</span>
            ) : (
              <Button size="sm" disabled={busy || plot.coins < bed} onClick={() => act({ type: "buyBed" })}>
                Dig for {plural(bed, "coin")}
              </Button>
            )
          }
        >
          <p className="text-small font-medium text-ink">Another bed</p>
          <p className="text-small text-ink-muted">
            {bed === null
              ? "All 12 beds are dug."
              : `Bed ${plot.beds.length + 1} of 12. ${short(bed) ?? `Each bed costs 25 coins more than the last.`}`}
          </p>
        </Row>
        {THING_IDS.map((id) => {
          const thing = THINGS[id];
          const owned = plot.things[id];
          return (
            <Row
              key={id}
              action={
                owned ? (
                  <span className="text-small text-ink-muted">On the plot</span>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy || plot.coins < thing.price}
                    aria-label={`Buy for ${plural(thing.price, "coin")}: the ${thing.name.toLowerCase()}`}
                    onClick={() => act({ type: "buy", thing: id })}
                  >
                    Buy for {plural(thing.price, "coin")}
                  </Button>
                )
              }
            >
              <p className="text-small font-medium text-ink">{thing.name}</p>
              <p className="text-small text-ink-muted">
                {thing.does}
                {id === "compostBin" && owned ? ` ${plural(plot.compost, "load")} of compost ready.` : ""}
                {!owned && short(thing.price) ? ` ${short(thing.price)}` : ""}
              </p>
            </Row>
          );
        })}
      </ul>
    </section>
  );
}

// ── This month on the plot ─────────────────────────────────────────────────

/** "salad leaves, onions and garlic". */
const listWords = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** The next wet day from the plot's clock, as a moment, within a few weeks; null if none. */
function nextRain(plot: AllotmentState, hemisphere: Hemisphere): number | null {
  const today = Math.floor(plot.clock / DAY);
  for (let day = today + 1; day <= today + 40; day++) if (wetDay(day, hemisphere)) return day * DAY;
  return null;
}

export function ThisMonth({ plot, hemisphere }: { plot: AllotmentState; hemisphere: Hemisphere }) {
  const month = monthAt(plot.clock, hemisphere);
  const sowNow = CROP_IDS.filter((id) => sowingMonth(id, month)).map((id) => CROPS[id].name);
  const growing = CROP_IDS.filter((id) => inSeason(id, month)).map((id) => CROPS[id].name);
  const resting = CROP_IDS.filter((id) => !inSeason(id, month)).map((id) => CROPS[id].name);
  const raining = rainingAt(plot.clock, hemisphere);
  const rain = raining ? null : nextRain(plot, hemisphere);
  const waiting = bedIndices(plot)
    .map((index) => ({ index, bed: bedAt(plot, index)!, now: bedNow(plot, index, hemisphere) }))
    .filter(({ now }) => now.waitsFor !== null);
  return (
    <section aria-labelledby="allotment-month">
      <Heading id="allotment-month">This month on the plot</Heading>
      <p className="mt-1 text-small text-ink-muted">
        {monthName(month, hemisphere)}, {SEASON_WORDS[seasonOf(month)].toLowerCase()}.{" "}
        {raining
          ? "It is raining on the plot today: every open bed is watered."
          : rain === null
            ? ""
            : `The next rain is due in ${aboutWords(rain - plot.clock)}.`}
      </p>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        <Row>
          <p className="text-small text-ink">
            <span className="font-medium">To sow now:</span> {listWords(sowNow)}.
          </p>
        </Row>
        <Row>
          <p className="text-small text-ink">
            <span className="font-medium">Growing in the open:</span> {listWords(growing)}.
          </p>
          {resting.length ? (
            <p className="text-small text-ink-muted">
              Not in their months, so they wait if sown outside: {listWords(resting)}. Under glass everything grows.
            </p>
          ) : null}
        </Row>
        {waiting.map(({ index, bed, now }) => (
          <Row key={index}>
            <p className="flex items-start gap-1.5 text-small text-ink">
              {now.waitsFor === "water" ? (
                <DropletOff aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              ) : (
                <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              )}
              <span>
                <span className="font-medium">{bedName(index)}</span>: {CROPS[bed.crop!].name},{" "}
                {now.waitsFor === "season"
                  ? `waiting for ${monthName(now.resumes!, hemisphere)}`
                  : isGlassBed(index)
                    ? "waiting for water (no rain under glass)"
                    : "waiting for rain or the can"}
                .
              </span>
            </p>
          </Row>
        ))}
      </ul>
    </section>
  );
}

// ── The almanac ────────────────────────────────────────────────────────────

/** One crop's card: its months, the cold and water, and, once grown here, its family and a few facts. */
function CropCard({ plot, id, hemisphere }: { plot: AllotmentState; id: CropId; hemisphere: Hemisphere }) {
  const crop = CROPS[id];
  const notes = CROP_NOTES[id];
  const record = plot.almanac.crops[id];
  const grown = record.harvests > 0;
  const family = FAMILIES[notes.family];
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 md:min-h-10 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          <span className="min-w-0 flex-1 text-small text-ink">
            <span className="font-medium">{capital(crop.name)}</span>{" "}
            <span className="text-ink-muted">
              {grown ? `${plural(record.harvests, "harvest")}, ${itemCount(id, record.produce)}` : "not grown here yet"}
            </span>
          </span>
        </summary>
        <dl className="mb-3 ml-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
          <dt className="text-ink-muted">Sown</dt>
          <dd className="text-ink">{capital(monthsWords(crop.sow, hemisphere))}</dd>
          <dt className="text-ink-muted">Harvested</dt>
          <dd className="text-ink">{capital(monthsWords(crop.harvest, hemisphere))}</dd>
          <dt className="text-ink-muted">Cold</dt>
          <dd className="text-ink">{notes.cold}.</dd>
          <dt className="text-ink-muted">Water</dt>
          <dd className="text-ink">{notes.water}</dd>
          {grown ? (
            <>
              <dt className="text-ink-muted">Family</dt>
              <dd className="text-ink">
                {family.name}. {family.about}
              </dd>
              <dt className="text-ink-muted">Worth knowing</dt>
              <dd className="grid gap-1 text-ink">
                {notes.facts.map((fact) => (
                  <p key={fact}>{fact}</p>
                ))}
              </dd>
              <dt className="text-ink-muted">First grown</dt>
              <dd className="tabular text-ink">{formatDate(record.firstAt ?? plot.startedAt)}</dd>
            </>
          ) : (
            <dd className="col-span-2 text-ink-muted">
              Its family and a few things worth knowing are written here once it has been grown.
            </dd>
          )}
        </dl>
      </details>
    </li>
  );
}

export function Almanac({ plot, hemisphere }: { plot: AllotmentState; hemisphere: Hemisphere }) {
  const reached = MILESTONE_IDS.filter((id) => plot.milestones[id] !== undefined).sort(
    (a, b) => (plot.milestones[a] ?? 0) - (plot.milestones[b] ?? 0),
  );
  const grownCount = CROP_IDS.filter((id) => plot.almanac.crops[id].harvests > 0).length;
  return (
    <section aria-labelledby="allotment-almanac">
      <Heading id="allotment-almanac">Almanac</Heading>
      <p className="tabular mt-1 text-small text-ink-muted">
        Started {formatDate(plot.startedAt)}. {capital(plural(plot.almanac.harvests, "harvest"))} in all,{" "}
        {plural(plot.almanac.coinsEarned, "coin")} earned. {grownCount} of {CROP_IDS.length} crops grown.
      </p>
      <h3 className="mt-4 text-small font-semibold text-ink">The crops</h3>
      <p className="text-small text-ink-muted">
        When each is sown and harvested in{" "}
        {hemisphere === "south" ? "Britain, with the months moved on six for the southern hemisphere" : "Britain"}.
      </p>
      <ul className="mt-1 divide-y divide-border border-y border-border">
        {CROP_IDS.map((id) => (
          <CropCard key={id} plot={plot} id={id} hemisphere={hemisphere} />
        ))}
      </ul>
      <p className="mt-2 text-small text-ink-muted">{ROTATION_WHY}</p>
      <h3 className="mt-4 text-small font-semibold text-ink">Milestones</h3>
      {reached.length ? (
        <ul className="mt-1 divide-y divide-border border-y border-border">
          {reached.map((id) => (
            <Row key={id}>
              <p className="text-small text-ink">
                {MILESTONES[id]} <span className="tabular text-ink-muted">{formatDate(plot.milestones[id]!)}</span>
              </p>
            </Row>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-small text-ink-muted">None yet. The first harvest will be the first.</p>
      )}
      <GameAbout summary="Where this comes from">
        <p>
          The months each crop is sown and harvested, and every fact on these cards, are from the Royal Horticultural Society's
          grow-your-own pages, read on {SOURCE_READ_ON} and put in Outpost's own words. Where the RHS gives several ways of growing a crop,
          its months together are used; the radishes are salad radishes (the RHS's winter months are for winter radishes). The families are
          from its page on{" "}
          <a className="text-primary underline underline-offset-2" href={ROTATION_SOURCE} target="_blank" rel="noreferrer">
            crop rotation
          </a>
          .
        </p>
        <ul className="grid gap-0.5">
          {CROP_IDS.map((id) => (
            <li key={id}>
              <a className="text-primary underline underline-offset-2" href={CROP_NOTES[id].source} target="_blank" rel="noreferrer">
                {capital(CROPS[id].name)}
              </a>
            </li>
          ))}
        </ul>
        <p>
          Made up for the game: how fast things grow (minutes to days rather than weeks to months), the prices, how long water lasts and how
          often it rains. It is not a planting guide for any one garden: frost dates and rain differ from place to place.
        </p>
      </GameAbout>
    </section>
  );
}

// ── Seasons ────────────────────────────────────────────────────────────────

const FROM_WORDS = {
  setting: "as chosen here",
  "home place": "from the home place on the map",
  default: "as no saved place on the map has the home icon",
} as const;

export function Seasons({
  plot,
  hemisphere,
  from,
  season,
  busy,
  act,
}: {
  plot: AllotmentState;
  hemisphere: Hemisphere;
  from: keyof typeof FROM_WORDS;
  season: Season;
  busy: boolean;
  act: Act;
}) {
  return (
    <section aria-labelledby="allotment-seasons">
      <Heading id="allotment-seasons">Seasons</Heading>
      <p className="mt-1 text-small text-ink-muted">
        {SEASON_WORDS[season]} on the plot, by the calendar in the {hemisphere === "south" ? "southern" : "northern"} hemisphere,{" "}
        {FROM_WORDS[from]}. Each crop grows only in its own months, and only while its bed is moist; the rest of the time it waits, keeping
        its growth.
      </p>
      <Segmented<HemisphereSetting>
        className={cn("mt-3", busy && "pointer-events-none opacity-70")}
        label="Hemisphere"
        value={plot.hemisphere}
        onChange={(value) => act({ type: "setHemisphere", hemisphere: value })}
        options={[
          { value: "auto", label: "Automatic" },
          { value: "north", label: "Northern" },
          { value: "south", label: "Southern" },
        ]}
      />
    </section>
  );
}
