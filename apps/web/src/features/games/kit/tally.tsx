/**
 * A game's tally, shared by the household, in one or two plain lines under the board,
 * with a way to forget it.
 */
import type { GameTallyEntry, TallyGameId } from "@outpost/shared";
import { formatDuration } from "@outpost/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { plural } from "@/lib/utils";
import { useClearGame, useGames } from "./queries";

/** "Played 12, won 5. Best time 4 minutes 12 seconds." */
export function tallyWords(entry: GameTallyEntry | undefined, { moves = "moves" }: { moves?: string } = {}): string {
  if (!entry || entry.played === 0) return "Not played yet.";
  const parts = [`Played ${entry.played.toLocaleString("en-GB")}, won ${entry.won.toLocaleString("en-GB")}.`];
  if (entry.bestSeconds !== null) parts.push(`Best time ${formatDuration(entry.bestSeconds)}.`);
  if (entry.fewestMoves !== null) parts.push(`Fewest ${moves} ${entry.fewestMoves.toLocaleString("en-GB")}.`);
  return parts.join(" ");
}

export function GameTallyLine({
  game,
  variant,
  variantLabel,
  moves,
}: {
  game: TallyGameId;
  variant: string;
  /** How this way of playing is named in the sentence: "Draw three". */
  variantLabel: string;
  moves?: string;
}) {
  const games = useGames();
  const clear = useClearGame(game);
  const [asking, setAsking] = useState(false);
  if (games.isPending) return <Skeleton className="mt-4 h-5 w-64" />;
  // The tally is a nicety: without the server the game is played just the same.
  if (games.isError) return <p className="mt-4 text-small text-ink-muted">The tally could not be read from the server.</p>;
  const tally = games.data.tallies[game];
  const any = Object.values(tally).some((entry) => (entry?.played ?? 0) > 0);
  const total = Object.values(tally).reduce((sum, entry) => sum + (entry?.played ?? 0), 0);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-muted">
      <p className="tabular">
        {variantLabel}: {tallyWords(tally[variant], { moves })}
      </p>
      {any ? (
        <>
          <Button variant="link" size="sm" onClick={() => setAsking(true)}>
            Clear the tally
          </Button>
          <ConfirmDialog
            open={asking}
            onOpenChange={setAsking}
            title="Clear the tally?"
            description={`This forgets ${plural(total, "game")} played, won and the best results, for everyone in the household. A game in progress is not affected.`}
            confirmLabel="Clear the tally"
            loading={clear.isPending}
            onConfirm={() => clear.mutate(undefined, { onSuccess: () => setAsking(false) })}
          />
        </>
      ) : null}
    </div>
  );
}
