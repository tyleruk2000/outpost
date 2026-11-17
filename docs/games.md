# Games

A few small games for when the internet is out, under **Games** in the navigation (after
Preparedness), in the phone's More sheet and in the quick search:

| Game | Address | For |
| --- | --- | --- |
| Allotment | `/games/allotment` | A plot for the household to sow, grow and harvest, slowly. |
| Solitaire | `/games/solitaire` | The card game for one, also called patience or Klondike. |
| Peg solitaire | `/games/peg-solitaire` | The traditional board of 33 holes. |
| Sudoku | `/games/sudoku` | Puzzles made on the device, each with one answer. |
| Draughts | `/games/draughts` | English draughts, against the computer or two at one device. |
| Pairs | `/games/pairs` | A memory game for children. |

They are traditional games, or (the allotment) a design of Outpost's own. Everything is
drawn in code (SVG and HTML, the colours from `--game-*` tokens in
`apps/web/src/styles/tokens.css`, for light and dark): there are no image, font or sound
files and no sound. Each game is a lazy chunk of its own. None asks the network for
anything; the only requests are to Outpost's own server, for the allotment and the
tallies.

Every game is played with a finger, a mouse or the keyboard. Each cell, card, square or
hole is a button with a spoken name ("7 of hearts, face up", "Row 3, column 5, empty,
notes 2 and 7", "Square c3, your man", "Bed 3, carrots, ripe"), and what a move did is
said in a polite live region. The boards turn off text selection, the long-press
callout and double-tap zoom; motion is only where it shows what changed, and none
under reduced motion.

## What is kept, and where

| What | Where | Why |
| --- | --- | --- |
| The allotment's plot | On the server, the `allotment` row of `game_saves` | One plot for the household: every device sees the same. |
| Each game's tally: played, won, best time, fewest moves (and for Peg solitaire, fewest pegs left), for each way of playing | On the server, a row of `game_saves` per game | Shared by the household. |
| An unfinished game of Solitaire, Peg solitaire, Sudoku, Draughts or Pairs | In the browser it is being played in (`localStorage`, `outpost.games.<game>`) | Two people playing at once on two devices must not overwrite each other's board. |

`game_saves` (migration `0027_games`) has one row per game: a JSON state (at most 64 KB),
a version that goes up with each write, and timestamps. It is the household's own data:
counted under **Storage → Database** ("games kept for the household", in "Everything
else") and in **Manage and clean up**, erased by erase everything, and in every backup. A
game's tally is forgotten with **Clear the tally** under its board, and the allotment
with **Start again** under its About; both ask first.

The game kept in the browser is read and written inside `try`/`catch` and checked field
by field when it is read back: in a private window, with site data blocked, or with a
damaged copy, the game is played the same and simply not kept. It is written a moment
after a move (a burst of moves is one write), at once when the page is hidden or the
screen is left, and not at all when nothing has changed. It never leaves the
device; when a game ends (won, or given up by starting another after a move), only its
result is sent, once (`POST /api/games/:game/results`). Without the server a game is
played just the same, and the tally line says it could not be read.

The routes are in [api.md](api.md#games).

## Allotment

A small top-down plot of beds. Sow seeds; they grow in real time; harvest; take the
produce to the stall for coins; buy seeds, more beds and a few lasting things.

### It never punishes, and why

The owner asked for something "super easy, like if you left it for a year it would be
fine". So:

- Nothing withers, dies, rots, expires, runs out or is stolen. A ripe crop waits for
  ever.
- No energy meter, streaks, daily rewards, notifications or countdowns to miss.
- Radish seed is free, so there is always something to sow: no way to get stuck.
- What builds up while you are away (eggs, honey, apples) stops at a small cap and
  waits.
- Watering and compost only ever speed things up or add to a harvest; neither is ever
  needed.
- No ending and no fail state. The long-term things are calm ones: the almanac of what
  has been grown, a few milestones, the plot filling out.

Open it after a year and every bed is ripe and waiting, the hens' eggs, the honey and
the apples are at their caps, and one line says "You were away 1 year and 35 days.
Everything waited for you." (shown when the last action was more than six hours ago,
until the next). A test advances the engine 400 days and checks that nothing is lost
and no number overflows, goes negative or stops being finite
(`apps/server/test/allotment-engine.test.ts`).

### One plot, the server's clock

The engine is pure TypeScript in `packages/shared/src/games/allotment/` (imported as
`@outpost/shared/games/allotment`): the state, `advance(state, now, hemisphere)`, and each
action as a pure function. The server applies every action with its own clock, so devices
whose clocks are wrong agree; a clock that jumps backwards changes nothing (time is
clamped to the latest the plot has seen, and nothing un-grows). `GET` works the plot out
to now without writing it. An action that cannot be done (sowing a bed that has a crop,
seed you cannot afford) is refused with a message, and nothing changes. After each
action the server says `games.changed`, and every device showing the plot refreshes;
nothing else asks the server again. Between refreshes the screen moves growth on with
the device's clock, for display only: it draws the plot again when the next bed ripens
or the next egg, jar or apple is ready, and otherwise once a minute (for the time left
on each bed and the light), and not at all while the page is hidden. The season shown
moves with that clock, so a screen left open over the turn of a season changes with it.
A stored plot that cannot be read is not replaced: the screen says so and offers Start
again.

### The numbers

They are game numbers, made up for the game: not growing advice and not a sowing
calendar. The game's About says so.

| Crop | Grows in | Seed | Yield | Sells each | Faster in |
| --- | --- | --- | --- | --- | --- |
| Radishes | 4 minutes | free | 3 | 1 | spring, autumn |
| Salad leaves | 25 minutes | 4 | 4 | 2 | spring, summer |
| Peas | 2 hours | 10 | 5 | 4 | summer |
| Carrots | 6 hours | 15 | 6 | 5 | summer, autumn |
| Beetroot | 12 hours | 20 | 5 | 8 | autumn, winter |
| Potatoes | 1 day | 30 | 8 | 7 | spring, summer |
| Leeks | 2 days | 40 | 5 | 18 | autumn, winter |
| Squash | 3 days | 60 | 3 | 45 | summer, autumn |

- 10 coins and 4 beds to start. Every crop can be sown in every season. The seed price
  is paid when sowing.
- Growth runs ×1.25 in season and ×1.5 watered (free, once per sowing); the two multiply.
  A greenhouse bed counts every crop as in season.
- The next bed costs 25 × (beds − 3) coins, from 25 for the fifth to 225 for the
  twelfth.

| Lasting thing | Costs | Does |
| --- | --- | --- |
| Water butt | 40 | Every new sowing starts watered. |
| Compost bin | 80 | Each harvest adds 1 compost (at most 8); a sowing uses one, and that bed yields 2 more. |
| Hens | 120 | An egg every 3 hours, at most 6 waiting; 3 coins each. |
| Beehive | 200 | A jar of honey every 8 hours, at most 4 waiting; 12 coins each. |
| Apple tree | 300 | An apple every 6 hours, at most 12 waiting; 3 coins each. |
| Greenhouse | 500 | Two more beds, under glass. |

Counts stop at caps: coins at 999,999, each kind in the basket at 9,999, each almanac
count at 999,999. A harvest the basket cannot hold is refused and the crop stays in its
bed; a sale sells only what fits under the coin cap.

Milestones, each dated when reached: the first harvest, 10 and 100 harvests, every crop
grown once, all 12 beds, every lasting thing, 1,000 coins earned in all, and a year since
the plot was started.

### Seasons and light

The season comes from the real calendar (the month in UTC). Northern: March to May
spring, June to August summer, September to November autumn, December to February
winter; southern, six months on. The hemisphere is northern unless the home place (the
saved place with the home icon) is south of the equator; a switch on the screen
(Automatic, Northern, Southern) overrides it. Growth over a long absence is worked out
piece by piece across season changes. The season changes how the plot looks (the grass,
fresh, deep, going gold or frosted but always green; blossom, apples or bare boughs;
fallen leaves in autumn, frost and a little snow along the hedge in winter), and the
device's own time of day lights it, against a day as long as the month's: shadows that
lengthen when the sun is low, a warm cast at dawn and dusk, and a blue night with the
shed window lit. A lasting thing not yet bought, and the next bed to dig, are pegged out
on the ground; each is a button that says what it is for and what it costs.

## Solitaire

Klondike, also called patience. Seven piles of 1 to 7 cards, the last of each face up;
the other 24 are the stock.

- The piles are built down in alternating colours; runs of face-up cards move together;
  only a king, or a run headed by a king, goes on an empty pile. A face-down card turns
  up when it is uncovered.
- The foundations are built up by suit from the ace, one card at a time. A foundation's
  top card can be taken back onto a pile.
- The stock turns one card, or three in draw three (the third on top); only the top of
  the waste can be played. An empty stock turns the waste over, as often as you like.
- A tapped card goes to its best place: its foundation if it can; else the first pile it
  fits on, counting rightwards from its own pile and wrapping round (from pile 1 for a
  card from the waste or a foundation); else the leftmost empty pile (not for a king that
  already heads its own pile). A card with nowhere to go says so. A setting under the
  board ("A tap on a card: Moves it where it fits / Picks it up") switches to pick and
  put; the keyboard always picks and puts. Cards can be dragged.
- "Put away all that can go" moves every card it can to the foundations, as one undo
  step; once the stock is empty and every card is face up, it offers to finish when
  finishing is possible.
- Undo takes back every move exactly. Moves and time are counted; time only while the
  tab is visible. The deal comes from a seed (`?seed=` deals a given one).
- The cards are drawn in code: Outpost's own pip shapes, court cards as J, Q or K with a
  mark of one, two or three peaks. On a phone, a card shows its corner rank and one large
  suit.

## Peg solitaire

The English board: a cross of 33 holes, every hole holding a peg but the centre at the
start. A peg jumps along a row or column (not diagonally) over a neighbouring peg into an
empty hole just beyond, and the jumped peg is removed. The game ends when no jump is
left; solved is one peg left, best of all in the centre. Undo takes back every move
exactly; Start again asks first. The tally keeps the fewest pegs left at the end of a game played out (a game given up
by starting again does not count towards it).

The holes are named like a chessboard, columns a to g from the left and rows 1 to 7 from
the bottom, so the centre is d4. Tap a peg, then one of the holes it can reach (they are
marked), or drag it there; tapping the picked peg again puts it down. The time runs from the first jump, only while
the board is in view. Once no jump is
left the game is over and undo is off, since its result has been counted. A test replays
a full 31-jump solution to one peg in the centre
(`apps/server/test/peg-solitaire-engine.test.ts`); the engine is in
`packages/shared/src/games/peg-solitaire/`.

## Sudoku

Fill the grid so that every row, column and 3×3 box holds 1 to 9 once.

- Puzzles are made on the device from a seed: a full grid filled by a randomised search,
  then cells emptied in a random order, each emptying kept only while the puzzle still
  has exactly one answer (a test checks this for 20 seeds of each level).
- Gentle: 38 givens, solvable by singles alone (one digit fits a cell, or a digit has
  one place left in a row, column or box). Steady: 30 givens, the same rule. Testing:
  emptied as far as one answer allows (21 to 27 givens in tests), and remade, up to four
  times, if singles alone would solve it. Making one takes a few milliseconds.
- Pencil notes, undo, erase, and an optional Check that marks wrong cells (in words and
  with a mark, never colour alone) without showing an answer. Writing a digit removes
  it from the notes in its row, column and box. A number pad sized for thumbs says how
  many of each digit are left; digits, Backspace and the arrow keys work too.
- The cells on a 390 px phone are 38 px, under the 44 px Outpost uses elsewhere: nine
  cells do not fit in the width otherwise. The pad's keys, which are what is pressed
  most, are at least 44 px.

## Draughts

English draughts (checkers), the rules shown under the board:

- An 8×8 board, played on the dark squares; 12 men each; dark moves first.
- A man moves one square diagonally forward; a king one square diagonally forward or
  back (not flying kings).
- A capture is a jump over an adjacent opposing piece to the empty square beyond. If any
  capture is available a capture must be made; where there are several, any may be
  chosen. A piece that has jumped goes on jumping in the same turn while it can; pieces
  jumped stay on the board until the move ends.
- A man reaching the far row becomes a king, and the turn ends there.
- A player with no legal move loses. After 40 moves each with no capture and no man
  moved, the game is a draw; two players may also agree a draw.

Against the computer you play dark and move first, or choose light. The computer
searches 6 plies (3 moves each) with alpha-beta, valuing a man at 100 and a king at 160,
with a little for advancing, keeping the back row and the centre, and picks among moves
it values equally from a seed. It runs in a Web Worker so the page never stops: one is
started for each reply and ended as soon as it has answered (or the reply is no longer
wanted); where there is none it searches on the page in slices. It does not think while
the page is hidden, and replies once it is shown again. Its slowest search seen on a Mac was
about 20 ms; it waits at least 450 ms before showing its move, so that the move can be
followed. Undo takes back a whole turn. The time runs from the first move, only while the
board is in view. In two-player mode the board does not turn, and
the line above it says whose turn it is.

## Pairs

Turn over two cards at a time; a match stays face up, a miss turns back after a second
or at the next tap. Small is 6 pairs (3×4), medium 8 (4×4), large 12 (4×6 on a phone).
The pictures are icons the app already has, things a small child can name (a cat, a
tortoise, an apple, a bus, a snowflake …). No clock is shown while playing; the end is
one line with the turns and the time.

## Not tested

- On a real iPhone, Android phone or Raspberry Pi. The end-to-end tests run Chromium at
  phone size (Pixel 7 and 390 × 844), with touch.
- With a real screen reader: the spoken names are checked by the tests, not by ear.
