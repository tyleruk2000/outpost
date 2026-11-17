/**
 * What sits beside the plot: the panel for the bed in hand (sow, water, harvest), the
 * stall (the basket, the coins, more beds and the lasting things), the almanac with its
 * milestones, and the hemisphere switch. Lists with hairlines, in the app's own chrome.
 */
import {
  type AllotmentAction,
  type AllotmentState,
  bedAt,
  bedName,
  CROP_IDS,
  CROPS,
  type Hemisphere,
  type HemisphereSetting,
  ITEM_IDS,
  inSeason,
  isGlassBed,
  itemPrice,
  MILESTONE_IDS,
  MILESTONES,
  nextBedPrice,
  readyInMs,
  type Season,
  stageOf,
  THING_IDS,
  THINGS,
} from "@outpost/shared/games/allotment";
import { X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { cn, formatDate, plural } from "@/lib/utils";
import { aboutWords, capital, growWords, itemCount, SEASON_WORDS } from "./words";

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
  season,
  busy,
  act,
  onClose,
  ref,
}: {
  plot: AllotmentState;
  index: number;
  hemisphere: Hemisphere;
  season: Season;
  busy: boolean;
  act: Act;
  onClose: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const bed = bedAt(plot, index);
  if (!bed) return null;
  const glass = isGlassBed(index);
  const name = bedName(index);
  const stage = stageOf(bed);
  let body: ReactNode;
  if (!bed.crop) {
    body = (
      <>
        <p className="mt-1 text-small text-ink-muted">
          Empty. Choose what to sow; the seed is paid for from the coins.
          {glass ? " Under glass every crop is in season." : ""}
        </p>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {CROP_IDS.map((id) => {
            const crop = CROPS[id];
            const fits = plot.coins >= crop.seed;
            const seasonal = inSeason(id, season, glass);
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={!fits || busy}
                  onClick={() => act({ type: "sow", bed: index, crop: id })}
                  aria-label={`Sow ${crop.name}: ${crop.seed === 0 ? "free" : plural(crop.seed, "coin")}, ${growWords(crop.growMs)}${seasonal ? ", in season" : ""}${fits ? "" : `, ${plural(crop.seed - plot.coins, "more coin")} needed`}`}
                  className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_4.75rem_5.5rem] items-center gap-x-2 px-1 py-1.5 text-left text-small transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-55 md:min-h-10"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{capital(crop.name)}</span>
                    {seasonal ? <span className="ml-2 text-micro text-success">In season</span> : null}
                  </span>
                  <span className="tabular text-ink-muted">{crop.seed === 0 ? "Free" : plural(crop.seed, "coin")}</span>
                  <span className="tabular text-right text-ink-muted">{growWords(crop.growMs)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  } else {
    const crop = CROPS[bed.crop];
    const left = readyInMs(plot, index, hemisphere) ?? 0;
    const seasonal = inSeason(bed.crop, season, glass);
    body = (
      <>
        <p className="mt-1 text-small text-ink">
          {capital(crop.name)}
          {stage === "ripe" ? ", ripe and waiting." : `, ${stage === "sown" ? "just sown" : stage}. Ready in ${aboutWords(left)}.`}
        </p>
        <p className="mt-1 text-small text-ink-muted">
          {[
            seasonal
              ? glass
                ? "Under glass, so in season."
                : "In season, so growing faster."
              : `Out of season in ${season}; it grows all the same.`,
            bed.watered ? "Watered." : null,
            bed.composted ? `Sown with compost: ${crop.yield + 2} to harvest.` : `${crop.yield} to harvest.`,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {stage === "ripe" ? (
            <Button variant="primary" loading={busy} onClick={() => act({ type: "harvest", bed: index })}>
              Harvest {crop.name}
            </Button>
          ) : bed.watered ? null : (
            <Button variant="secondary" disabled={busy} onClick={() => act({ type: "water", bed: index })}>
              Water
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
                    aria-label={`Buy the ${thing.name.toLowerCase()} for ${plural(thing.price, "coin")}`}
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

// ── The almanac ────────────────────────────────────────────────────────────

export function Almanac({ plot }: { plot: AllotmentState }) {
  const grown = CROP_IDS.filter((id) => plot.almanac.crops[id].harvests > 0);
  const reached = MILESTONE_IDS.filter((id) => plot.milestones[id] !== undefined).sort(
    (a, b) => (plot.milestones[a] ?? 0) - (plot.milestones[b] ?? 0),
  );
  return (
    <section aria-labelledby="allotment-almanac">
      <Heading id="allotment-almanac">Almanac</Heading>
      <p className="tabular mt-1 text-small text-ink-muted">
        Started {formatDate(plot.startedAt)}. {capital(plural(plot.almanac.harvests, "harvest"))} in all,{" "}
        {plural(plot.almanac.coinsEarned, "coin")} earned.
      </p>
      {grown.length ? (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {grown.map((id) => {
            const record = plot.almanac.crops[id];
            return (
              <Row key={id}>
                <p className="tabular text-small text-ink">
                  <span className="font-medium">{capital(CROPS[id].name)}</span>: {plural(record.harvests, "harvest")},{" "}
                  {itemCount(id, record.produce)}.{" "}
                  <span className="text-ink-muted">First grown {formatDate(record.firstAt ?? plot.startedAt)}.</span>
                </p>
              </Row>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-small text-ink-muted">Nothing harvested yet. Each crop is written here once it has been grown.</p>
      )}
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
        {FROM_WORDS[from]}. Crops in season grow a quarter faster.
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
