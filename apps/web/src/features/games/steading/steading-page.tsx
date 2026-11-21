/**
 * Games → Steading: the household's one settlement in a valley, kept on this Outpost so
 * that every device sees the same. Place buildings, lay routes between them, watch the
 * stocks and flows, and find what holds a chain back; build houses, and households move in
 * once they have water, food and firewood to hand; trade at the landing for what the
 * valley lacks. Time away only adds: nothing here ever gets worse while it is closed.
 *
 * The server applies every action with its own clock. Between fetches the screen works the
 * settlement out with `advance`, for drawing only, every 15 seconds while it is in view.
 */
import { advance, flowsOf, peopleOf, type SteadingAction, storeCap } from "@outpost/shared/games/steading";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { ApiError } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useServerNow } from "../allotment/queries";
import { GameAbout, GameFrame } from "../kit/frame";
import { useClearGame } from "../kit/queries";
import { BuildingList, Households, Ledger, Milestones, SquarePanel, Trade } from "./panels";
import { type SteadingView, useSteading, useSteadingAction } from "./queries";
import { Valley } from "./valley";
import { amountsWords, doneWords } from "./words";

/** The game's one rule, said on its page so that the player knows they can leave it. */
export const LEAVE_IT_WORDS = "Leave it as long as you like: nothing here ever gets worse while you are away.";

const REDRAW_MS = 15_000;

export default function SteadingPage() {
  const query = useSteading();
  return (
    <GameFrame title="Steading" description={LEAVE_IT_WORDS}>
      {query.isPending ? (
        <ValleySkeleton />
      ) : query.isError ? (
        <Trouble error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Steading view={query.data} />
      )}
    </GameFrame>
  );
}

function ValleySkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the settlement"
      className="grid gap-8 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
    >
      <div>
        <Skeleton className="mb-3 h-5 w-56" />
        <Skeleton className="w-full rounded-panel" style={{ aspectRatio: "10 / 14" }} />
      </div>
      <div className="grid content-start gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function Trouble({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const damaged = error instanceof ApiError && (error.details as { damaged?: boolean } | undefined)?.damaged === true;
  if (damaged) return <StartAgain damaged message={(error as Error).message} />;
  return (
    <div className="grid max-w-[60ch] gap-3">
      <ErrorState error={error} onRetry={onRetry} />
      <p className="text-small text-ink-muted">
        The settlement is kept on this Outpost for the whole household, so it needs the server to be reached.
      </p>
    </div>
  );
}

function StartAgain({ damaged, message }: { damaged?: boolean; message?: string }) {
  const clear = useClearGame("steading");
  const [asking, setAsking] = useState(false);
  const button = (
    <Button variant={damaged ? "danger" : "danger-ghost"} size="sm" onClick={() => setAsking(true)}>
      Start again
    </Button>
  );
  return (
    <>
      {damaged ? (
        <Notice tone="danger" title="The settlement could not be read" action={button}>
          {message}
        </Notice>
      ) : (
        button
      )}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Start the settlement again?"
        description="This clears the whole valley for everyone in the household: every building and route, the households, the stock, the credit at the landing and the milestones. A new settlement starts with a storehouse, two households and a well. It cannot be undone."
        confirmLabel="Start again"
        loading={clear.isPending}
        onConfirm={() => clear.mutate(undefined, { onSuccess: () => setAsking(false) })}
      />
    </>
  );
}

function Steading({ view }: { view: SteadingView }) {
  const now = useServerNow(view.clockOffset, () => REDRAW_MS);
  const settlement = useMemo(() => advance(view.settlement, now), [view.settlement, now]);
  const flows = useMemo(() => flowsOf(settlement), [settlement]);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [said, setSaid] = useState("");
  const panel = useRef<HTMLElement>(null);
  const action = useSteadingAction((done, before, after) => {
    if (before) setSaid(doneWords(done, before.settlement, after.settlement));
  });
  const act = (next: SteadingAction) => action.mutate(next);
  const busy = action.isPending;

  // A square chosen on a phone may have its panel below the fold: bring it up, gently.
  useEffect(() => {
    if (selected === null || !panel.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    panel.current.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [selected]);

  const people = peopleOf(settlement);
  const cap = storeCap(settlement);
  const kept = Object.fromEntries(
    Object.entries(settlement.stock).filter(([good]) => ["planks", "stone", "bricks", "logs"].includes(good)),
  );
  const firstVisit = !view.started;

  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-3 grid gap-2">
          {firstVisit ? (
            <p className="text-body text-ink">
              A storehouse, two households and a well in the valley of Ashgill. Choose a square on the meadow beside the woods and build a
              woodcutter, then send its logs to the storehouse.
            </p>
          ) : null}
          <p className="tabular text-small text-ink-muted">
            {formatNumber(people)} people · {amountsWords(kept, (n) => formatNumber(Math.floor(n + 1e-9)))} in store, of {formatNumber(cap)}{" "}
            each
          </p>
        </div>
        <Valley state={settlement} flows={flows} selected={selected} onSelect={setSelected} />
        <p className="mt-2 text-small text-ink-muted">
          A route's width is what it carries in a day: dashed by hand, solid for a cart road, railed for track; the arrow points the way it
          goes. A corner flag marks a building held back. Squares are small on a phone: every building is also in the list.
        </p>
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
      </div>

      <div className="grid min-w-0 content-start gap-8">
        {selected ? (
          <SquarePanel
            ref={panel}
            state={settlement}
            flows={flows}
            square={selected}
            busy={busy}
            act={act}
            onClose={() => setSelected(null)}
          />
        ) : (
          <p className="text-small text-ink-muted">
            Choose a square in the valley to build on it, or a building to see what it is doing and lay its routes.
          </p>
        )}
        <BuildingList state={settlement} flows={flows} onChoose={setSelected} />
      </div>

      <div className="grid gap-8 md:col-span-2 md:grid-cols-2">
        <Ledger state={settlement} flows={flows} />
        <Households state={settlement} flows={flows} />
        <Trade state={settlement} busy={busy} act={act} />
        <Milestones state={settlement} />
      </div>

      <div className="md:col-span-2">
        <GameAbout>
          <p>
            Every building makes something from something. Lay a route from each to where its goods are wanted: a workshop that uses them,
            or the storehouse. Carried by hand a route takes 12 a day up to 3 squares; a cart road 40 a day up to 8; track, later, 160. What
            cannot be sent on waits in the building's yard, and when the yard is full the work rests. The tightest part of a chain sets its
            pace: its building says what it is waiting for.
          </p>
          <p>
            People work within 4 squares of home. A new house fills once it has a well and a storehouse within reach and enough water, bread
            and firewood coming in for it as well as everyone already there. Households never leave. At 12 people the landing and the coal
            pit can be built, at 24 the smelter, the smithy and the water wheel, at 40 track and the waterworks.
          </p>
          <p>
            Time away only adds. Work goes on while the screen is closed until the stores and yards are full, then simply stops, with
            everything kept; nothing is ever used up from the store but by your own building and trading. A day in the settlement passes in
            an hour.
          </p>
          <p>
            What a household uses in a day is real (see "Where the figures come from" under Households). How fast things are made, their
            costs and the trade are made up for the game. The settlement is the household's, kept on this Outpost: the same on every device.
          </p>
        </GameAbout>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
          <StartAgain />
          <p className="min-w-0 flex-1 basis-56 text-small text-ink-muted">
            Start again clears the valley for a new settlement, for everyone. It asks first.
          </p>
        </div>
      </div>
    </div>
  );
}
