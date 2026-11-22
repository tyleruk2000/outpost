/**
 * Findings of the accessibility check (a11y.ts) that are let through, each with the reason.
 * A waiver names the axe rule, and may narrow it to screens (`where`, matched against the
 * address) and to elements (`target`, matched against axe's selector for the element
 * followed by the start of its HTML).
 * Keep this list short: a finding is fixed in the app unless it is wrong or cannot be.
 */
export interface Waiver {
  rule: string;
  where?: RegExp;
  target?: RegExp;
  reason: string;
}

export const WAIVERS: Waiver[] = [
  {
    rule: "label-content-name-mismatch",
    where: /^\/games\/(chess|draughts)$/,
    target: /data-square/,
    reason:
      "The squares on the board's edges show the rank's digit and the file's letter as separate marks in two corners, and the square is named by its coordinate in full (\"a2, your pawn\"). The board is played from the keyboard as a grid, not by speaking the mark in a corner.",
  },
  {
    rule: "label-content-name-mismatch",
    where: /^\/games\/(solitaire|pairs)$/,
    target: /data-card/,
    reason:
      'A card shows its printed index ("J" and the suit\'s sign in the corner) and is named in words ("Jack of spades, face up"). The index is the card\'s face, not a label to be spoken; the table is played from the keyboard.',
  },
  {
    rule: "label-content-name-mismatch",
    where: /^\/search\/how-it-works$/,
    target: /understand-node/,
    reason:
      "Each stage of the drawing is a link whose visible words are its title and one or two lines cut to fit the box. Its name is the title followed by the whole statement in words, and the table beside the drawing holds the same.",
  },
  {
    rule: "aria-hidden-focus",
    // A check made with a menu or a short list open names it in brackets after the address: "/contacts (contacts menu)".
    where: /\((?:[a-z ]+ menu|[a-z ]+ filter)\)$/,
    reason:
      "An open menu (Radix's DropdownMenu, components/ui/menu.tsx) marks the rest of the page aria-hidden, and while it is open keeps focus inside itself and refuses the pointer outside it; Escape or a choice closes it and the marks go. What is behind cannot be reached by Tab, by a screen reader's cursor or by touch, so it is hidden as axe asks, only not by `inert`. study-reading-dialogs.spec.ts checks that each menu takes focus, closes with Escape and gives focus back.",
  },
];
