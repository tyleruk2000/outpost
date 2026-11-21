import { SectionPage } from "@/components/section";
import { gameScreens } from "./screens";

export default function GamesPage() {
  return (
    <SectionPage
      title="Games"
      description="A few small games to pass the time, for one or for the household. They need no connection, and nothing is sent anywhere but this Outpost."
      screens={gameScreens}
    >
      The allotment and each game's tally of wins are kept on this Outpost for the whole household, so every device sees the same. A game of
      Solitaire, Peg solitaire, Sudoku, Draughts, Chess, Pairs or Snake still being played stays on the device it is being played on, so two
      people can play at once.
    </SectionPage>
  );
}
