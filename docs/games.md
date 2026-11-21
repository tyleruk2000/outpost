# Games

A few small games for when the internet is out, under **Games** in the navigation (after
Preparedness), in the phone's More sheet and in the quick search:

| Game | Address | For |
| --- | --- | --- |
| Allotment | `/games/allotment` | A plot for the household to sow, grow and harvest, slowly. |
| Steading | `/games/steading` | A settlement for the household to build: production chains, households and trade. |
| Solitaire | `/games/solitaire` | The card game for one, also called patience or Klondike. |
| Peg solitaire | `/games/peg-solitaire` | The traditional board of 33 holes. |
| Sudoku | `/games/sudoku` | Puzzles made on the device, each with one answer. |
| Draughts | `/games/draughts` | English draughts, against the computer or two at one device. |
| Chess | `/games/chess` | Chess, against the computer at four strengths or two at one device. |
| Pairs | `/games/pairs` | A memory game for children. |
| Snake | `/games/snake` | Steer a growing snake, at four speeds. |
| Skerry | `/games/skerry` | Puzzles solved at a pretend command line. |

They are traditional games, or (the allotment, the Steading and Skerry) designs of Outpost's own. Everything is
drawn in code (SVG and HTML, the colours from `--game-*` tokens in
`apps/web/src/styles/tokens.css`, for light and dark): there are no image, font or sound
files and no sound. Each game is a lazy chunk of its own. None asks the network for
anything; the only requests are to Outpost's own server, for the allotment, the
Steading and the tallies.

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
| The Steading's settlement | On the server, the `steading` row of `game_saves` | One settlement for the household: every device sees the same. |
| Each game's tally: played, won, best time, fewest moves (for Peg solitaire, fewest pegs left; for Snake, the highest score), for each way of playing | On the server, a row of `game_saves` per game | Shared by the household. |
| An unfinished game of Solitaire, Peg solitaire, Sudoku, Draughts, Chess or Pairs | In the browser it is being played in (`localStorage`, `outpost.games.<game>`) | Two people playing at once on two devices must not overwrite each other's board. |
| Snake's best scores and settings | In the browser (`outpost.games.snake`) | A game of Snake lasts minutes and is not kept part-played. |
| Skerry's progress: the levels solved, the level being played, the commands typed | In the browser it is played in (`localStorage`, `outpost.games.skerry`) | Nothing about it needs the server. |

`game_saves` (migration `0027_games`) has one row per game: a JSON state (at most 64 KB),
a version that goes up with each write, and timestamps. It is the household's own data:
counted under **Storage → Database** ("games kept for the household", in "Everything
else") and in **Manage and clean up**, erased by erase everything, and in every backup. A
game's tally is forgotten with **Clear the tally** under its board, and the allotment
and the Steading each with **Start again**, in plain view at the foot of its screen; both ask first.

The game kept in the browser is read and written inside `try`/`catch` and checked field
by field when it is read back: in a private window, with site data blocked, or with a
damaged copy, the game is played the same and simply not kept. It is written a moment
after a move (a burst of moves is one write), at once when the page is hidden or the
screen is left, and not at all when nothing has changed. Two tabs of the same browser on
the same game do not overwrite each other: each follows the other's saves (a `storage`
event), the board shows the moves made in the other tab and says so, and the followed
game is not written straight back. It never leaves the
device; when a game ends (won, or given up by starting another after a move), only its
result is sent, once (`POST /api/games/:game/results`). Without the server a game is
played just the same, and the tally line says it could not be read.

The routes are in [api.md](api.md#games).

## Allotment

A small top-down plot of beds. Sow seeds; water them; they grow in their own months while
the soil is moist; harvest; take the produce to the stall for coins; buy seeds, more beds
and a few lasting things. It is also a little almanac of real growing: when each crop is
sown and harvested in Britain, how it takes the cold and the dry, and a few things worth
knowing about it.

### It never punishes, and why

The owner asked for something "super easy, like if you left it for a year it would be
fine", and later (17 November 2026) "dont have things die but do not grow out of season or
with no water", and "a bit of an educational thing also". So:

- Nothing withers, dies, wilts, rots, bolts, expires or is stolen, and no growth is ever
  lost. A crop out of its months, or in dry soil, **waits**: it keeps every bit of growth
  it has and carries on when its months come round or water comes. A ripe crop waits for
  ever.
- No energy meter, streaks, daily rewards, notifications, quizzes or scores for learning.
- Radish seed and onion sets are free, so there is always something to sow; onions grow in
  every month, so a plot with no coins is never stuck.
- What builds up while you are away (eggs, honey, apples) stops at a small cap and waits.
- Sowing out of season is never refused: each crop in the sowing list says first what will
  happen ("Sown now, they wait in the ground until February."), because waiting is the
  lesson.
- No ending and no fail state.

### The rules

A crop grows only while **both** of these hold; otherwise it waits:

1. **It is in its months.** Each crop grows in the open from its earliest sowing to its
   last harvest in Britain, as the Royal Horticultural Society gives them (the table
   below). Under glass every month is in season.
2. **Its bed is moist.** A bed is moist:
   - for **12 hours** after it is watered with the can (watering again tops it up to 12
     hours from then; it is never refused);
   - in the open, all through a **wet day** and for **12 hours** after it;
   - in the open with the **water butt**, all through a wet day and for **2 days** after
     it (the butt fills when it rains and keeps the beds watered between showers).

   No rain falls under glass, and the butt does not reach the greenhouse: there, the can
   is the only water.

**Rain.** Whether a UTC day is wet comes from the date alone (a hash of the day number
against that month's chance), so it is the same on every device, after any absence and
after a reload; nothing random changes it. It rains more in the household's autumn and
winter (in the south the months are moved on six, as the seasons are):

| Month (north) | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chance of a wet day | 45% | 40% | 35% | 30% | 30% | 30% | 30% | 35% | 35% | 45% | 50% | 50% |

Measured over 2025 to 2064 the share of wet days is within a point or two of these; the
longest run of dry days in those forty years is 22.

What that means in play (the share of the time a crop that is in its months is growing,
worked out with the engine over 2027 to 2030, for someone who looks in at 8 in the
morning):

| | Nobody waters | Water butt | Waters once a day | Both |
| --- | --- | --- | --- | --- |
| January | 52% | 76% | 78% | 88% |
| April | 40% | 66% | 72% | 83% |
| June | 42% | 66% | 73% | 83% |
| October | 56% | 81% | 80% | 90% |

So someone who looks in once a day and waters always finds something has happened, and
gets on nearly twice as fast as someone who waits for the rain; the butt makes an untended
plot comfortable.

**Growth is exact.** The engine integrates growth month by month (the season changes only
at a month's start) and over the moist stretches inside each month, so a plot worked out
a year at once is identical to one worked out in a thousand small steps, wherever the beds
dry and the rain comes; a test checks this in both hemispheres
(`apps/server/test/allotment-engine.test.ts`).

### The crops

The months are real; the growing times and prices are made up for the game. A growing
time is the time a crop needs in moist soil in its months, sped up from weeks or months
to minutes or days. "Grows" is from the first month it goes in to the last month it is
harvested, for each way the RHS gives of growing it (so overwintering sowings carry it
through the winter).

| Crop | Sown or planted | Harvested | Grows (in the open) | Growing time | Seed | Yield | Sells each |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Radishes | March to September | April to October | March to October | 4 minutes | free | 3 | 1 |
| Salad leaves | February to September | April to December | February to December | 25 minutes | 4 | 4 | 2 |
| Onions | January to April, August to November | June to September | all year | 1 hour | free | 3 | 2 |
| Peas | February to June | June to October | February to October | 2 hours | 10 | 5 | 4 |
| Carrots | February to July | May to November | February to November | 6 hours | 15 | 6 | 5 |
| Beetroot | March to July | June to October | March to October | 12 hours | 20 | 5 | 8 |
| Kale | March to July | October to April | all year | 18 hours | 20 | 6 | 7 |
| Broad beans | February to May, October and November | May to August | October to August | 1 day | 25 | 6 | 9 |
| Potatoes | March to May | June to October | March to October | 1 day | 30 | 8 | 7 |
| Leeks | February to July | August to March | all year | 2 days | 40 | 5 | 18 |
| Garlic | February, March, October to December | May to August | October to August | 2½ days | 35 | 6 | 16 |
| Squash | April to June | July to October | April to October | 3 days | 60 | 3 | 45 |

So there is something to sow and something growing in the open in every month: in
January, onions to sow, and onions, kale, broad beans, leeks and garlic growing; under
glass, everything. The eight crops of the first version are all still grown, with their
growing times unchanged; broad beans, garlic, onions and kale were added for the winter.

Where they come from: each crop's RHS "grow your own" page (listed in
[sources.md](sources.md#the-allotments-months-and-facts-read-2026-11-17)). "Sown or
planted" is the page's Sow, Plant and Plant out rows together. Two choices were made where
the page has more than one kind of crop: the radishes are **salad radishes** (sown March to
September, ready four to six weeks later), so the winter months the RHS calendar also marks,
which are for winter radishes, are left out; the squash's sowing is the RHS's April and May
(it starts them indoors) with its planting out in May and June. The RHS was the only
source used, so there were no two sources to choose between.

- 10 coins and 4 beds to start. The seed price is paid when sowing.
- The next bed costs 25 × (beds − 3) coins, from 25 for the fifth to 225 for the twelfth.

| Lasting thing | Costs | Does |
| --- | --- | --- |
| Water butt | 40 | Fills when it rains, and keeps the open beds watered for 2 days after each wet day. |
| Compost bin | 80 | Each harvest adds 1 compost (at most 8); a sowing uses one, and that bed yields 2 more. |
| Hens | 120 | An egg every 3 hours, at most 6 waiting; 3 coins each. |
| Beehive | 200 | A jar of honey every 8 hours, at most 4 waiting; 12 coins each. |
| Apple tree | 300 | An apple every 6 hours, at most 12 waiting; 3 coins each. |
| Greenhouse | 500 | Two more beds, under glass: every crop grows all year there, but no rain falls. |

Counts stop at caps: coins at 999,999, each kind in the basket at 9,999, each almanac
count at 999,999. A harvest the basket cannot hold is refused and the crop stays in its
bed; a sale sells only what fits under the coin cap.

Milestones, each dated when reached: the first harvest, 10 and 100 harvests, every crop
grown once, all 12 beds, every lasting thing, 1,000 coins earned in all, and a year since
the plot was started.

### A plot left alone for a year

Open it after a year and: every open bed whose crop has had its months has ripened with
the rain and waits, ripe; a crop sown out of its months waited for them, grew in them, and
is ripe; a bed under glass grew only for the water it was last given and waits for the
can, with all that growth kept; the hens' eggs, the honey and the apples are at their
caps; the coins, the basket and the almanac are exactly as they were. One line says "You
were away 1 year and 35 days. Everything waited for you." (shown when the last action was
more than six hours ago, until the next). A test advances the engine 400 days and checks
this, and that no number overflows, goes negative or stops being finite.

### A plot from before these rules

The stored plot is version 2 (`v: 2`). A version 1 plot (the first rules, where watering
was a flag that lasted the sowing) is read into version 2 when it is loaded, with no
database migration: every coin, bed, thing bought, crop's growth, basket count, almanac
record and milestone is kept; a bed that had been watered and is not ripe is moist for 12
hours from the plot's clock; the four new crops start with empty records. No crop was
dropped, so nothing had to be harvested on its behalf. A `GET` does not write the
upgraded plot; the next action writes it in the new shape. The time since the plot's last
action before the upgrade is worked out under the new rules (growth only goes forward).
Tests load a version 1 plot as saved, and one a year old
(`allotment-engine.test.ts`, `allotment.test.ts`).

### The almanac, and this month on the plot

- **This month on the plot** says the month and season, whether it is raining or when the
  next rain is due, what to sow now (the crops whose RHS sowing months include it), what
  grows in the open this month and what would wait, and each bed that is waiting and for
  what ("Bed 3: squash, waiting for April").
- **The crops**: a card for each (a row that opens): when it is sown and harvested (by
  month, in the household's calendar: moved on six in the south), how it takes the cold,
  how much water it wants. Once it has been grown on the plot, the card adds its family
  (and why the family matters for rotating beds) and one or two things worth knowing (that
  peas and beans feed the soil, why potatoes are earthed up, why garlic goes in in
  autumn). Nothing is read aloud or tested; nothing asks to be read.
- **Where this comes from**, a disclosure at the foot of the almanac, names the RHS, links
  each crop's page and the crop rotation page, and says what is made up.

### Seeing it

- Dry soil is pale and crazed with cracks; moist soil is dark and glistens: told apart by
  shape as well as colour, in day and night, light and dark.
- Each bed's label shows the time left, "Ripe", or why it waits: a crossed-out drop and
  "Dry", or an hourglass and the month it resumes ("Till Mar"). Its spoken name says it in
  full ("Bed 3, carrots, shoots, waiting for rain, dry").
- Tapping a bed says in one sentence what it is doing and what would change it: "Waiting
  for rain: the soil is dry. Water it to grow now; rain is due in about 2 days." "Waiting
  for April: squash grow April to October, so they rest in the ground with all their
  growth until then." "Growing: the water butt is keeping it watered, for about 1 day
  more."
- A wet day greys the light and lays rain across the plot, drawn still (nothing on the
  plot moves at rest); puddles lie on the paths while it rains and for 12 hours after; the
  water butt is brim-full after rain and low after a dry spell; there are no sun shadows
  under cloud.

### One plot, the server's clock

The engine is pure TypeScript in `packages/shared/src/games/allotment/` (imported as
`@outpost/shared/games/allotment`): the state, `advance(state, now, hemisphere)`, and each
action as a pure function; every number is in `numbers.ts`, and the almanac's words in
`notes.ts`. The server applies every action with its own clock, so devices whose clocks
are wrong agree; a clock that jumps backwards changes nothing (time is clamped to the
latest the plot has seen, and nothing un-grows). `GET` works the plot out to now from
timestamps, without writing it; there is no timer on the server. An action that cannot be
done (sowing a bed that has a crop, seed you cannot afford) is refused with a message, and
nothing changes. After each action the server says `games.changed`, and every device
showing the plot refreshes; nothing else asks the server again. Between refreshes the
screen moves growth on with the device's clock, for display only: it draws the plot again
when the next thing changes (a bed ripens, dries or is wetted, the rain starts or stops,
the month turns, an egg, jar or apple is ready), and otherwise once a minute (for the time
left on each bed and the light), and not at all while the page is hidden. Measured with
`e2e/tools/idle-cost.mjs` at phone size on 17 November 2026: with a new plot and with
crops growing, visible: 0% page processor, 0 animation frames, 0 requests, 10 timers a
minute (the same as Sudoku: the app's own); hidden: 0 frames, 2 timers a minute; the
server 0%. A stored plot that cannot be read is not replaced: the screen says so and
offers Start again.

### Seasons and light

The season comes from the real calendar (the month in UTC). Northern: March to May
spring, June to August summer, September to November autumn, December to February
winter; southern, six months on, and so are each crop's months and the rain. The
hemisphere is northern unless the home place (the saved place with the home icon) is south
of the equator; a switch on the screen (Automatic, Northern, Southern) overrides it. The
season changes how the plot looks (the grass, fresh, deep, going gold or frosted but
always green; blossom, apples or bare boughs; fallen leaves in autumn, frost and a little
snow along the hedge in winter), and the device's own time of day lights it, against a day
as long as the month's: shadows that lengthen when the sun is low, a warm cast at dawn and
dusk, and a blue night with the shed window lit. A lasting thing not yet bought, and the
next bed to dig, are pegged out on the ground; each is a button that says what it is for
and what it costs.

### What is real and what is made up

- **Real**, from the RHS: the months each crop is sown, harvested and grows in; each
  crop's family, how it takes the cold, how much water it wants, and the facts on its
  card.
- **Made up for the game**: how fast things grow, the prices and yields, how long water
  lasts (12 hours from the can, 12 hours after rain, 2 days with the butt), how often it
  rains, and the hens, the hive and the tree. It is not a planting guide for any one
  garden: frost dates and rainfall differ from place to place, and the southern months are
  Britain's moved on six, not a southern gardening calendar.

## Steading

A settlement in Ashgill, a valley of woods, rock, clay banks and a river, for the
household to build. Everything is made from something and carried from somewhere: a
bakery with no flour bakes nothing, and a quarry with no route fills its yard and stops.

**Leave it as long as you like: nothing here ever gets worse while you are away.** That
line is on the game's page. Work goes on while it is closed until the stores and yards
are full, then stops, with everything kept. Nothing decays, runs out, leaves or is
used up by itself; there are no streaks, timers, reminders or events. Coming back there
is nothing to catch up on.

### Production chains

- Tap a square of meadow to build on it. Each building shows what it uses and makes in a
  day, its workers and its cost. Woodcutters, quarries, clay pits and coal pits stand
  beside their woods, rock, clay or coal; the landing, water wheel and waterworks beside
  the river. Woodcutters, quarries, clay pits and fields are free, so the settlement is
  never stuck.
- A building sends what it makes along **routes**: to a workshop that uses it, or to a
  storehouse. Choose the building, then **Send its … to…**, the place and how it is
  carried:

  | Carried | Per day | Reach | Costs a square |
  | --- | --- | --- | --- |
  | By hand | 12 | 3 squares | nothing |
  | Cart road | 40 | 8 squares | a plank and a stone |
  | Track (40 people) | 160 | 20 squares | a bar of iron and a plank |

- A building fills its first route first; **Fill this first** changes the order. What
  cannot be sent on waits in its yard (20 of each thing); a full yard rests the work.
  **Carry the yard to the store** empties it by hand.
- The chains: logs to a sawmill (planks) or a woodyard (firewood); clay and firewood to a
  brick kiln; grain to a mill, flour and firewood to a bakery; later ore and coal to a
  smelter, iron and planks to a smithy.
- Each building says what holds it back: short of workers, waiting for an input, or its
  yard full. A flag on its corner marks it on the plan. The plan draws every route as a
  line whose width is what it carries in a day, dashed by hand, solid for a cart road,
  railed for track.
- The **ledger** lists every good: what is in store (each storehouse holds 200 of each),
  what is kept each day, what goes to the households, and how much has been made.
  Stock in store is for building and trade: workshops take only what is sent to them,
  which is why time never draws a stock down.
- Taking a building down gives back everything it and its routes cost, and its yard. A
  house with a household in it stays.

### Households

A new settlement has a storehouse, two households of four and a well. People work within
4 squares of home. A new house fills once it has a well within 3 squares, a storehouse
within 5, and enough water, bread and firewood coming in for it as well as for everyone
already there; otherwise it says what it waits for. Households never leave, and a
shortage only keeps a new house waiting.

What a household of four uses in a day, from real figures:

| | A day | From |
| --- | --- | --- |
| Food | 9,000 kcal, about 4.2 loaves of 800 g | 2,250 kcal a person (Public Health England); 266 kcal in 100 g of white bread (USDA) |
| Water | 60 litres | 15 litres a person, the top of WHO's 7.5 to 15 for drinking, cooking and basic hygiene |
| Heat | 26 kWh, about 6.3 kg of dry logs | 9,500 kWh of gas a year for a typical household (Ofgem, from July 2026); 4.1 kWh per kg of air-dry logs (Forest Research) |
| Electricity | 6.8 kWh | 2,500 kWh a year for a typical household (Ofgem) |

The heat is what a typical household's gas gives, counted as if from wood; a stove and a
boiler are not equally efficient, and the game does not count the difference.
Electricity is not needed to move in. A **water wheel** (24 people) makes 120 kWh a day:
it lights the houses within 5 squares first, then runs the sawmill, mill and smithy within
reach at twice the pace. The **waterworks** (40 people) waters every house in the valley.

### Trade

The valley has no ore. Once 12 people live here a **landing** on the river can be built.
Choose a trade for it (planks, bricks or bread for ore; grain for coal) and lay routes to
it and from it: the barge then takes and brings that every day. The landing also buys
anything from the store at a fixed price, for credit, and sells coal, ore, iron and tools
for credit. Prices never change.

### Time

A day in the settlement passes in an hour, and every rate is per such day. Between the
moments when something fills or a household moves in, every flow is steady, so the
server works the settlement out from the time exactly, however long it was left; there
is no timer on the server. Each action is applied with the server's clock, and a clock
that jumps back changes nothing. **Start again** at the foot of the screen clears the
valley for a new settlement, for everyone, and asks first.

What is made up: every rate, cost, reach and price, the sizes of a loaf and a bundle of
firewood, and the hour-long day. The household figures above are real.

The Steading adds 60 KB of script (20 KB compressed), loaded when the screen is opened,
and no image, font or sound files.

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

## Chess

Chess by the FIDE Laws of Chess (those in force from 1 January 2023), against the
computer or with two people at one device. The rules are shown under the board.

- Every rule is played: castling on either side (not once the king or that rook has
  moved, not out of check, not through or onto an attacked square, not with a piece
  between), en passant on the next move only, and promotion to a queen, rook, bishop or
  knight, chosen in a small window. A move that would leave your own king in check
  cannot be made.
- The game ends in checkmate or stalemate, and is drawn when the same position comes up
  three times, after 50 moves each with no capture and no pawn moved, when neither side
  has the pieces to checkmate (king against king, a king and one bishop or knight against
  a king, or only bishops all on squares of one colour), or with two players by
  agreement. Repetition and the 50 moves end the game at once; under FIDE's rules they
  wait for a player to claim them. Other dead positions, such as locked pawn chains, are
  not spotted.
- Tap a piece and its legal squares are marked; tap one, or drag the piece there. The
  arrow keys move between squares, Enter picks and puts down, Escape puts back. The last
  move is shaded and a king in check is ringed, both also said in the square's name.
- The pieces are drawn for Outpost, each kind with its own outline; white's are drawn
  open and black's solid with light inner lines, so the sides differ in more than colour
  in both themes.
- Moves are listed beside the board in standard notation. Undo takes back a whole turn.
  **Turn the board** shows it from the other side, for the second player.
- **Copy the game** gives the game as PGN and the position as FEN, with a copy button
  for each (on a page where the browser will not copy, the text is there to select).
  **Paste a game** reads PGN (comments, variations and annotations are passed over) or
  FEN, and play carries on from there; a pasted game that is already over is shown and
  not counted.

The computer is Outpost's own small search, as for Draughts: alpha-beta to a fixed
depth, captures tried first, then a look at captures alone until the position is quiet,
valuing material and where each piece stands. There is no opening book and no endgame
table, and no chess engine is bundled or fetched. Its four strengths:

| Level | Looks ahead | Plays like |
| --- | --- | --- |
| Learner | 1 ply, no follow-up of exchanges | Blunders often: a child who knows the moves can beat it. |
| Easy | 2 plies, exchanges followed | Takes what is left hanging, misses most plans. |
| Medium | 3 plies | A steady opponent for a casual player. |
| Hard | 4 plies | A fair game for a casual player; any club player or chess program will beat it. |

None of the levels has been rated against people. The computer thinks in a Web Worker,
started for each reply and ended as soon as it answers; it does not think while the page
is hidden. At its hardest level its slowest reply seen on a Mac was about a quarter of
a second; on a Raspberry Pi or an old phone it is slower.

The tally keeps each level and two-player games apart.

## Pairs

Turn over two cards at a time; a match stays face up, a miss turns back after a second
or at the next tap. Small is 6 pairs (3×4), medium 8 (4×4), large 12 (4×6 on a phone).
The pictures are icons the app already has, things a small child can name (a cat, a
tortoise, an apple, a bus, a snowflake …). No clock is shown while playing; the end is
one line with the turns and the time.

## Snake

Steer a snake to the apples on a field of 16 by 16. Each apple makes it a cell longer and
scores one. The game ends when the head runs into the snake's own body, or with walls into
the edge of the field; with **Wrap round** it leaves one edge and comes back at the
opposite one. Filling the field wins.

- Steer with the arrow keys or W, A, S and D, a swipe on the field, or the four arrow
  buttons under it (56 px each). The snake never turns back on itself; two quick turns
  are both taken.
- Four speeds: slow (three steps a second, for small children), steady, quick and fast
  (about fourteen). Speed and edges take effect from the next game.
- Space or P pauses. The game pauses itself when the page is hidden, and waits for you to
  carry on rather than starting by itself.
- There is no sound and nothing shakes or flashes. With reduced motion asked for, the
  page says that the snake still moves, since that is the game.

The best score for each speed and kind of edge, and the speed and edges chosen, are kept
in this browser. Each game's score also goes to the household's tally, which keeps the
highest score; a game in progress is not kept.

## Skerry

You are the relief keeper at the weather station on Tarrow Skerry, a small made-up island
far out to sea. The keeper before you, Ines, left her handover notes in the station
computer's files, and the computer is worked by typing commands. Each of the twelve levels
asks one thing (which hook the paint store key hangs on, how many days of October had fog,
where the birthday cake is hidden), and the files hold the answer.

- Type a command and press Enter. `help` lists the commands, `man` and a command's name
  says more about one, `goal` repeats what the level asks, and `answer` gives your answer
  (`answer 5`). Some levels are solved by reading the right file.
- `hint` gives a hint, as many as you like, for nothing. The last hint all but says what
  to type.
- The commands are the everyday ones of a real command line, and behave like them: `pwd`,
  `ls` (`-a` for hidden names), `cd` (with `..`, `~` and paths from `/`), `cat`, `head`,
  `tail`, `grep` (`-i`, `-n`, `-c`, `-v`, `-r`), `wc`, `sort` (`-n`, `-r`), `uniq` (`-c`),
  `find` (`-name`, `-type`), `echo`, `rev`, `history` and `clear`, joined with `|`. One is
  the game's own: `decode 3 note.txt` undoes a Caesar shift of three, as the Encryption
  screen does by hand.
- Tab finishes a command's or a file's name, and lists the choices when there are several;
  the up and down arrows bring back what you typed. On a phone, the buttons under the
  terminal do the same, and type the `|` that phone keyboards hide.
- The levels start with looking and reading and end with putting several commands
  together. Any level can be played from the list, in any order, and played again.

The command line is pretend. It is part of the page: its commands only read the level's
own made-up files, nothing can be changed, deleted or written, and it runs nothing on the
device or on Outpost and reaches no network. Commands that would change things, or
connect to somewhere, say that they are not here. Nothing in it is about getting into
anyone else's computer.

Skerry adds 62 KB of script (16 KB compressed), text only, loaded when the screen is
opened.

## Not tested

- On a real iPhone, Android phone or Raspberry Pi. The end-to-end tests run Chromium at
  phone size (Pixel 7 and 390 × 844), with touch.
- With a real screen reader: the spoken names are checked by the tests, not by ear.
- The allotment's rain, drying and season changes were checked in the engine's tests and
  in pictures of plots made for given dates (a demonstration server with its clock moved);
  not by leaving a real plot for days or across a real change of month.
- Chess: how long the computer takes on a Raspberry Pi or an old phone, and how strong
  each level is against real players. Swipes and the arrow buttons of Snake on a real
  phone.
- The Steading's settlement left for a day, a month and a year was checked in the
  engine's tests, not by leaving a real one.
