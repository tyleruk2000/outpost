/**
 * The games under Games, in the order they are listed. The navigation (components/nav.ts)
 * and the Games page are both drawn from this list: to add a game, add an entry here and
 * a route in app.tsx.
 *
 * Quick games first, each said in a line with how long a go takes, and the slow ones the
 * household builds over weeks last: a teenager in the persona tests (24 November 2026)
 * read the list, opening on two long paragraphs about an allotment and a settlement, as
 * "a contents page" and "homework".
 */
import { ChessKnight, CircleDot, Crown, Hash, Shapes, Spade, Sprout, SquareTerminal, Warehouse, Worm } from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const gameScreens: SectionScreen[] = [
  {
    to: "/games/chess",
    keywords: "board game strategy",
    label: "Chess",
    icon: ChessKnight,
    about: "Against the computer at four strengths, or two of you at one device. Full rules.",
  },
  {
    to: "/games/snake",
    keywords: "arcade worm",
    label: "Snake",
    icon: Worm,
    about: "Steer, eat, grow, and keep off the walls and your own tail. A minute a go.",
  },
  {
    to: "/games/pairs",
    keywords: "memory matching cards children",
    label: "Pairs",
    icon: Shapes,
    about: "Turn two cards at a time and find the matching pictures. Three sizes, a few minutes each.",
  },
  {
    to: "/games/sudoku",
    keywords: "numbers puzzle",
    label: "Sudoku",
    icon: Hash,
    about: "Every row, column and box holds 1 to 9 once. A new puzzle each time, with one answer.",
  },
  {
    to: "/games/solitaire",
    label: "Solitaire",
    keywords: "patience klondike cards card game",
    icon: Spade,
    about: "Klondike, also called patience: build the four suits up from the aces. Draw one card or three.",
  },
  {
    to: "/games/draughts",
    keywords: "checkers board game",
    label: "Draughts",
    icon: Crown,
    about: "English draughts on an 8 by 8 board, against the computer or two of you at one device.",
  },
  {
    to: "/games/peg-solitaire",
    label: "Peg solitaire",
    keywords: "pegs marbles board puzzle",
    icon: CircleDot,
    about: "Jump one peg over another to take it, until one is left, at best in the middle.",
  },
  {
    to: "/games/skerry",
    keywords: "terminal command line shell puzzles",
    label: "Skerry",
    icon: SquareTerminal,
    about: "Keep an island weather station running by typing commands at a pretend terminal. Twelve levels, free hints.",
  },
  {
    to: "/games/allotment",
    label: "Allotment",
    icon: Sprout,
    about: "A plot the household sows and harvests together, a little each day. Nothing ever withers while you are away.",
  },
  {
    to: "/games/steading",
    label: "Steading",
    keywords: "settlement village city builder factory production chains resources economy",
    icon: Warehouse,
    about:
      "A valley settlement the household builds over weeks, where everything is made from something. Nothing gets worse while you are away.",
  },
];
