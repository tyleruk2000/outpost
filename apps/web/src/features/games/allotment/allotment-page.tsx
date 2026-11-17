/**
 * Games → Allotment: the household's one plot, kept on this Outpost so that every device
 * sees the same. Sow, water and harvest; sell at the stall; buy more beds and a few
 * lasting things. A crop grows only in its own months and in moist soil, and otherwise
 * waits; nothing withers, and nothing is lost by walking away.
 *
 * The server applies every action with its own clock. Between fetches the screen moves
 * growth on with `advance`, for drawing only: it draws again when the next thing changes
 * (a bed ripens or dries, the rain starts or stops, the month turns) or at most once a
 * minute, never while hidden, and fetches the plot again only when a device changes it
 * ("games.changed").
 */
import {
  type AllotmentAction,
  AWAY_AFTER_MS,
  advance,
  bedAt,
  bedIndices,
  bedNow,
  inSeason,
  KEEPING_NAMES,
  monthAt,
  PRODUCER,
  type ProducerId,
  readyInMs,
  seasonAt,
  stageOf,
} from "@outpost/shared/games/allotment";
import { useEffect, useRef, useState } from "react";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { ApiError } from "@/lib/api";
import { GameAbout, GameFrame } from "../kit/frame";
import { useClearGame } from "../kit/queries";
import { Almanac, BedPanel, Seasons, Stall, ThisMonth } from "./panels";
import { Plot, VIEW } from "./plot";
import { type AllotmentView, untilNextChange, useAllotment, useAllotmentAction, useServerNow } from "./queries";
import { aboutWords, awayWords, collectWords, doneWords, readyWords } from "./words";

export default function AllotmentPage() {
  const query = useAllotment();
  return (
    <GameFrame title="Allotment">
      {query.isPending ? (
        <PlotSkeleton />
      ) : query.isError ? (
        <Trouble error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Allotment view={query.data} />
      )}
    </GameFrame>
  );
}

function PlotSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the allotment"
      className="grid gap-8 md:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]"
    >
      <div>
        <Skeleton className="mb-3 h-5 w-56" />
        <Skeleton className="w-full rounded-panel" style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}` }} />
      </div>
      <div className="grid content-start gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

/** A failed load: the server is needed, or the plot kept there could not be read. */
function Trouble({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const damaged = error instanceof ApiError && (error.details as { damaged?: boolean } | undefined)?.damaged === true;
  if (damaged) return <StartAgain damaged message={(error as Error).message} />;
  return (
    <div className="grid max-w-[60ch] gap-3">
      <ErrorState error={error} onRetry={onRetry} />
      <p className="text-small text-ink-muted">
        The allotment is kept on this Outpost for the whole household, so it needs the server to be reached.
      </p>
    </div>
  );
}

function StartAgain({ damaged, message }: { damaged?: boolean; message?: string }) {
  const clear = useClearGame("allotment");
  const [asking, setAsking] = useState(false);
  const button = (
    <Button variant={damaged ? "danger" : "danger-ghost"} size="sm" onClick={() => setAsking(true)}>
      Start again
    </Button>
  );
  return (
    <>
      {damaged ? (
        <Notice tone="danger" title="The plot could not be read" action={button}>
          {message}
        </Notice>
      ) : (
        button
      )}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Start the allotment again?"
        description="This digs the whole plot over for everyone in the household: every bed and what is growing in it, the coins, the basket, the beds and lasting things bought, the almanac and the milestones. A new plot starts with 4 beds and 10 coins. It cannot be undone."
        confirmLabel="Start again"
        loading={clear.isPending}
        onConfirm={() => clear.mutate(undefined, { onSuccess: () => setAsking(false) })}
      />
    </>
  );
}

function Allotment({ view }: { view: AllotmentView }) {
  const now = useServerNow(view.clockOffset, (at) => untilNextChange(advance(view.plot, at, view.hemisphere), view.hemisphere));
  const plot = advance(view.plot, now, view.hemisphere);
  // The season by the time shown, so that a screen left open over the turn of a month moves with it.
  const season = seasonAt(now, view.hemisphere);
  const [selected, setSelected] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const panel = useRef<HTMLElement>(null);
  const action = useAllotmentAction((done, before, after) => {
    if (before) setSaid(doneWords(done, before.plot, after.plot, after.hemisphere));
  });
  const act = (next: AllotmentAction) => action.mutate(next);
  const busy = action.isPending;

  // A bed chosen on a phone may have its panel below the fold: bring it up, gently.
  useEffect(() => {
    if (selected === null || !panel.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    panel.current.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [selected]);

  const onBed = (index: number) => {
    setSelected(index);
    const bed = bedAt(plot, index);
    // A ripe bed is harvested in one tap; the panel then offers to sow it again.
    if (bed && stageOf(bed) === "ripe") act({ type: "harvest", bed: index });
  };
  const onThing = (thing: ProducerId) => {
    const { gives, everyMs } = PRODUCER[thing];
    if (plot.waiting[gives] > 0) act({ type: "collect", thing });
    else setSaid(`No ${KEEPING_NAMES[gives].many} yet. The next in ${aboutWords(everyMs - plot.producing[thing])}.`);
  };

  const ready = readyWords(plot);
  const ripeBeds = bedIndices(plot).filter((index) => stageOf(bedAt(plot, index)!) === "ripe").length;
  const waiting = plot.waiting.eggs + plot.waiting.honey + plot.waiting.apples;
  const states = bedIndices(plot).map((index) => ({ index, now: bedNow(plot, index, view.hemisphere) }));
  const growing = states
    .filter(({ now: bed }) => bed.stage !== "empty" && bed.stage !== "ripe" && bed.waitsFor === null)
    .map(({ index }) => readyInMs(plot, index, view.hemisphere))
    .filter((ms): ms is number => ms !== null && ms > 0);
  const soonest = growing.length ? Math.min(...growing) : null;
  const waitingBeds = states.filter(({ now: bed }) => bed.waitsFor !== null).length;
  const radishTime = inSeason("radishes", monthAt(plot.clock, view.hemisphere));
  const firstVisit = !view.started || (plot.almanac.harvests === 0 && bedIndices(plot).every((index) => !bedAt(plot, index)?.crop));
  const away = view.started && view.awayMs > AWAY_AFTER_MS;

  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-3 grid gap-2">
          {away ? <p className="text-body text-ink">You were away {awayWords(view.awayMs)}. Everything waited for you.</p> : null}
          {firstVisit ? (
            <p className="text-body text-ink">
              {radishTime
                ? "Sow radishes in a bed and water them: they are free and grow in a few minutes."
                : "Sow onions in a bed and water them: onion sets are free and grow in every month."}
            </p>
          ) : null}
          <p className="tabular text-small text-ink-muted">
            {[
              ready
                ? `${ready}.`
                : soonest !== null
                  ? `Nothing ripe yet. The next is ready in ${aboutWords(soonest)}.`
                  : waitingBeds === 0
                    ? "Nothing growing. Choose a bed to sow it."
                    : null,
              waitingBeds === 1 ? "1 bed is waiting for water or its months." : null,
              waitingBeds > 1 ? `${waitingBeds} beds are waiting for water or their months.` : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
          {ripeBeds > 0 || waiting > 0 ? (
            <div className="flex flex-wrap gap-2">
              {ripeBeds > 0 ? (
                <Button variant="primary" disabled={busy} onClick={() => act({ type: "harvestAll" })}>
                  Harvest everything ripe
                </Button>
              ) : null}
              {waiting > 0 ? (
                <Button variant="secondary" disabled={busy} onClick={() => act({ type: "collect" })}>
                  Collect {collectWords(plot)}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Plot
          plot={plot}
          hemisphere={view.hemisphere}
          season={season}
          now={now}
          local={new Date()}
          selected={selected}
          onBed={onBed}
          onThing={onThing}
          busy={busy}
        />
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
      </div>

      <div className="min-w-0">
        {selected !== null && bedAt(plot, selected) ? (
          <BedPanel
            ref={panel}
            plot={plot}
            index={selected}
            hemisphere={view.hemisphere}
            busy={busy}
            act={act}
            onClose={() => setSelected(null)}
          />
        ) : (
          <p className="text-small text-ink-muted">Choose a bed on the plot to see what it is doing, and to sow, water or harvest it.</p>
        )}
        <Stall plot={plot} busy={busy} act={act} />
      </div>

      <div className="grid gap-8 md:col-span-2 md:grid-cols-2">
        <div className="grid content-start gap-8">
          <ThisMonth plot={plot} hemisphere={view.hemisphere} />
          <Seasons plot={plot} hemisphere={view.hemisphere} from={view.hemisphereFrom} season={season} busy={busy} act={act} />
        </div>
        <Almanac plot={plot} hemisphere={view.hemisphere} />
      </div>

      <div className="md:col-span-2">
        <GameAbout>
          <p>
            Sow a bed, water it, harvest it, and sell what you grow at the stall for coins to buy more beds and a few lasting things. Radish
            seed and onion sets are always free. A crop grows only in its own months, the months it grows in Britain, and only while its bed
            is moist: watering keeps a bed moist for 12 hours, and on a wet day the rain waters every open bed. The rest of the time it
            waits, keeping all its growth. Under glass every month is in season, but no rain falls. Nothing ever withers or is lost: ripe
            crops wait, and the hens, the hive and the tree stop when a few are waiting.
          </p>
          <p>
            The months and the facts in the almanac are real, from the Royal Horticultural Society (see "Where this comes from" in the
            almanac). How fast things grow, the prices, how long water lasts and how often it rains are made up for the game.
          </p>
          <p>The plot is the household's, kept on this Outpost: it is the same on every device, and anyone can tend it.</p>
        </GameAbout>
        {/* In plain view, not folded into About: a way to reset the plot has to be findable. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
          <StartAgain />
          <p className="min-w-0 flex-1 basis-56 text-small text-ink-muted">
            Start again resets the whole allotment to a new plot, for everyone. It asks first.
          </p>
        </div>
      </div>
    </div>
  );
}
