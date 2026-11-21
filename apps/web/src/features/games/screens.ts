/**
 * The games under Games, in the order they are listed. The navigation (components/nav.ts)
 * and the Games page are both drawn from this list: to add a game, add an entry here and
 * a route in app.tsx.
 */
import { ChessKnight, CircleDot, Crown, Hash, Shapes, Spade, Sprout, Worm } from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const gameScreens: SectionScreen[] = [
  {
    to: "/games/allotment",
    label: "Allotment",
    icon: Sprout,
    about:
      "A small plot for the household to sow, grow and harvest, slowly. Nothing ever withers: leave it a year and it will all be waiting.",
  },
  {
    to: "/games/solitaire",
    label: "Solitaire",
    keywords: "patience klondike cards card game",
    icon: Spade,
    about:
      "The card game for one also called patience or Klondike: build the four suits up from the aces. Draw one card at a time, or three.",
  },
  {
    to: "/games/peg-solitaire",
    label: "Peg solitaire",
    keywords: "pegs marbles board puzzle",
    icon: CircleDot,
    about: "The traditional board of 33 holes: jump one peg over another to take it, until one is left, at best in the middle.",
  },
  {
    to: "/games/sudoku",
    keywords: "numbers puzzle",
    label: "Sudoku",
    icon: Hash,
    about:
      "Fill the grid so that every row, column and box holds 1 to 9 once. Each puzzle is made on this device and has exactly one answer.",
  },
  {
    to: "/games/draughts",
    keywords: "checkers board game",
    label: "Draughts",
    icon: Crown,
    about: "English draughts on an 8 by 8 board, against the computer or with two people at one device.",
  },
  {
    to: "/games/chess",
    keywords: "board game strategy",
    label: "Chess",
    icon: ChessKnight,
    about: "Chess by the full rules, against the computer at four strengths or with two people at one device.",
  },
  {
    to: "/games/pairs",
    keywords: "memory matching cards children",
    label: "Pairs",
    icon: Shapes,
    about: "Turn over two cards at a time to find the matching pictures. Three sizes, for small hands and bigger ones.",
  },
  {
    to: "/games/snake",
    keywords: "arcade worm",
    label: "Snake",
    icon: Worm,
    about: "Steer a snake that grows with every bite, without hitting the walls or itself. A slow speed for small children.",
  },
];
