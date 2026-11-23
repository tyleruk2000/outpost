# Design quality

What a screen is held to before it is done, and the shared part to reach for each time.
`DESIGN.md` says what Outpost looks like and `web-screens.md` how a screen is built; this
is the checklist that sits between them. A screen that needs something no shared part
gives makes it once, in `components/`, rather than on its own.

## What the shared layer does for you

| Need | Use | It already |
| --- | --- | --- |
| A button | `Button` (`variant`, `size`, `loading`) | Darkens on hover and press, gives a little (98%) when pressed, 44 px on touch and under 768 px, keeps its width while `loading` (the spinner takes the leading icon's place, or sits over the words) |
| A field | `Field` round `Input`, `Textarea`, `Select` | Label, then the control, then help, then the error; ids wired for a screen reader; 16 px text and 44 px tall on touch, so iOS does not zoom |
| A choice of a few | `Segmented`; `RadioItem` for a list of them | 44 px on touch; wraps rather than overflowing |
| Tabs | `TabsList`, `TabsTrigger` | Wraps; 44 px names on touch |
| A menu, a drop-down's list | `Menu*`, `Select` | Above dialogs; 44 px items on touch; scrolls on a short screen |
| A dialog | `DialogContent`, `DialogBody`, `DialogFooter`, `ConfirmDialog` | Centred on a wide screen; a sheet from the foot of a phone, clear of the home indicator; focus goes back to what opened it |
| A table to compare across columns | `Table`, `TableHead`, `Tr`, `Th`, `Td` (`components/ui/table.tsx`) | Figures right-aligned in tabular numerals (`numeric`); a frame the keyboard can scroll; `sticky` head; `stack` for a block per row on a phone (each `Td` given `label`); `interactive` rows lit under the pointer |
| A list of things a person opens | `Rows` | Hairlines, no cards |
| Waiting | `Skeleton` shaped like what comes; `Spinner delay` beside a field that refetches | Room held at once, seen only after 300 ms, so a quick answer shows no flash |
| Progress | `Progress` from real numbers | Moves only with real progress |
| Nothing here yet | `EmptyState` (`compact`, `level={3}` in a section) with its first action | Says what belongs here |
| A failure | `ErrorState onRetry`; `notify.error(...)` for an action | Words that say what happened and what to do |
| Detail most people skip | `Disclosure` | Closed, with a summary that says what is inside |
| A heading and actions | `PageHeader` (`under`, `back`, `actions`), `Section` | One `h1`, the way back, actions main last |
| Motion | `transition-colors` (or any `transition-*`) with no duration | Takes `--duration` and `--ease-out`; `duration-(--duration-fast)` for hover colour, `duration-(--duration-slow)` for something that travels |
| A choice CSS cannot make | `useMediaQuery(TABLET)` | |

## The checklist

Look at the screen at 390 (WebKit and Chromium), 768, 1024 and 1280 px, light and dark,
and at 200% text, before calling it done. Screenshot it and look.

**States**
- Loading is a skeleton of the final layout: when the content comes nothing moves.
- Empty says what belongs here and offers the first step; a filter that matches nothing
  says so and offers to clear it.
- An error says what happened and what to do, with Try again for a load.
- Refetching keeps what is on screen (`placeholderData: keepPreviousData` for a list
  whose key changes as a person types or filters). Never blank a list to refill it.
- No spinner for work under 300 ms: a skeleton or a `Spinner delay` waits that long.
- An action that is safe to show before the server answers (a tick, a rename, a
  reorder) is shown at once and put back if it fails, with `notify.error`.

**Interaction**
- Every control has a hover, a press, a visible focus ring (the global one) and a
  disabled look. Do not remove the outline; do not invent another ring.
- A button in flight is `loading`, not disabled and not relabelled to a longer word.
- A row that opens something is a link, lit on hover (`hover:bg-surface`), with the
  whole row the target.
- Motion only on a change of state, from the tokens. Nothing moves on arrival.

**Touch and small screens**
- 44 px for every primary control where the pointer is a finger: `max-md:` alone is not
  enough, add `md:pointer-coarse:` (a tablet is wider than 768 px; under 768 px `max-md:`
  already holds, and a screen that sizes its own controls in pixels, as Maps does, keeps
  them). 24 px is the floor
  everywhere, including dense desktop lists.
- Nothing runs off the side at 320 px or at 200% text; a row of names wraps.
- A table wider than a phone is `stack`ed, or scrolls in its `Table` frame; it never
  makes the page scroll sideways.
- The most used action of the screen is in reach without scrolling on a phone.
- On a tablet (768 to 1023 px) the screen has the full width less a 60 px rail: check it.
- Clear of a notch and the home indicator: the bars, the sidebar and `Page` already keep
  `env(safe-area-inset-*)`; a screen that draws to an edge itself (full bleed, a fixed
  bar of its own) keeps them too.

**Forms**
- One `Field` per control; the label says what to type, the hint says why or in what
  form, the error says what is wrong and how to put it right ("Enter a frequency in
  MHz, such as 145.500").
- Mark the few optional fields `optional`; nothing is marked required.
- Check on leaving a field or on sending, not on each key; clear an error as soon as
  the value is right.
- Width by what goes in: a callsign or a postcode is short (`max-w-[12rem]`), a name or
  an address is full width.
- The right keyboard: `type="email"`, `type="tel"`, `type="url"`, `inputMode="decimal"`
  for figures with a point, `inputMode="numeric"` for whole numbers; `autoComplete` where
  the browser knows the field (`name`, `email`, `tel`, `postal-code`, `off` for a code);
  `enterKeyHint` (`search`, `send`, `done`, `next`).
- The buttons that send a form are under it on the page, main first; in a dialog, in
  `DialogFooter`, main last.

**Type and space**
- Sizes from the scale only (`text-micro` to `text-display`); serif for the names of
  things read, sans for everything else. Figures people compare are `tabular`.
- Space from Tailwind's 4 px steps: 1.5 between a label and its control, 3 to 4 within a
  group, 5 to 6 between groups, 10 between sections (`Section` does this).
- Line length of prose at most 70ch; descriptions under a title at most 60ch.

**First use**
- A person who has never seen the screen can tell what it is for from its title and
  first line, and what to do first from its empty state.
- The common task of the screen takes as few presses as it can; count them before and
  after a change, and write the counts in the bead.
- A shortcut or quick action earns its place by saving presses on a common task. No new
  feature without a person who needs it.

## Audit of the shared layer and the frame

Most harm first, and what was done about each.

1. **The frame on a tablet.** From 768 px the full sidebar sat beside the page, leaving
   512 px: the map on Maps was 160 px wide at 768 px, with its card one word to a line.
   The sidebar is now a rail of icons from 768 to 1023 px, opening over the page.
   The map at 768 px is 356 px wide.
2. **Touch sizes followed the width, not the finger.** Every shared control was 32 to
   36 px tall on a tablet at 768 px or wider. They are 44 px wherever the pointer is
   coarse, and the sidebar's rows with them.
3. **Queries were held while the browser thought it was offline.** In the query
   library's default network mode a laptop talking to Outpost on localhost with no
   network at all showed skeletons for ever. Queries and mutations are now always asked.
4. **Back lost the place.** Every screen, reached by Back or not, opened at its top. Back
   and Forward now return to where the screen was left (`components/scroll-memory.ts`).
5. **Quick search hid what it can do.** With nothing typed, its actions (Add documents,
   New page) came after all 75 screens, out of sight; its placeholder was cut off on a
   phone. Actions now come first, a way somewhere first of all.
6. **The first visit did not say what Outpost is for**, and Preparedness and Help were
   not reachable from Home's first steps. A sentence now says it, a fifth step leads to
   Preparedness, and a line leads to Help.
7. **Skeletons flashed.** A screen whose code or data came in 100 ms flashed grey shapes.
   Skeletons now hold their room at once and appear only after 300 ms.
8. **A busy button grew.** The spinner was added beside the words, so the button and
   those beside it moved. It now keeps its width.
9. **Dialogs on a phone floated mid-screen**, buttons away from the thumb. They are now
   sheets from the foot of the screen.
10. **Press feedback was colour alone, and the soft button lightened on hover** (all but
    invisible on white). Buttons now give a little when pressed; the soft one darkens.
11. **Motion had no system.** Durations were set by hand (150, 200, 300 ms) in 79 places
    and transitions took Tailwind's own easing. Every `transition-*` now takes the
    tokens; screens still set by hand are for their areas to move over.
12. **Tables were drawn fifteen ways in fifty files**, two with a sticky head, none
    stacked on a phone. `Table` gives one way; screens move to it in their own passes.
13. **A drop-down's text is smaller than a field's** (14 px against 16) in the same form. Left
    to the area passes: it changes the height of the words in every drop-down, in cards and bars too.
14. **A running download could not be seen on a phone** without opening More. More
    carries the lamp while one runs.

Left as they are: no transitions between screens (DESIGN.md: no page-load
choreography); keeping the last answer is not the default for every query, since a
screen of one thing must not show another's data.

## Steps to the common tasks

Presses from Home for a first-time person, not counting typing. Phone at 390 px,
desktop at 1280 px.

| Task | Phone before | Phone after | Desktop before | Desktop after | What changed |
| --- | --- | --- | --- | --- | --- |
| Add a document | 1 (Start here) | 1 | 1 | 1 | From any other screen through quick search: open it, then the first row (2), where before it was 2 and typing, or scrolling past 75 screens |
| Search | 0 (field on Home) | 0 | 0 | 0 | |
| Find a place on the map | 1 (Maps) | 1 | 1 | 1 | |
| Plan a road route | 3 (Maps, Routes, Road route) | 2 (quick search, Road route) | 3 | 2 | Quick search opens Road route itself ("road route", "directions"). To a place just found: 1 press (Road route to here, its end filled in), where it was 2 and finding the place again in To |
| Print a map | 3 (Maps, More, Print) | 2 (quick search, Print) | 2 (Maps, Print) | 2 | Quick search takes up the page to print itself ("print") |
| Make the household book | 3 (More, Preparedness's screens, Household book) | 2 (Get your household ready, Household book) | 2 | 2 | A fifth first step on Home |
| Check supplies | 3 | 2 | 2 | 2 | The same step |
| See downloads and tasks | 2 (More, Downloads and tasks) | 2, and the lamp on More while one runs | 1 | 1 | |
| Change a setting | 2 (More, Settings) | 2 | 1 | 1 | |
| Open Help | 2 (More, Help at the foot of the sheet) | 1 (on the first visit) | 1 | 1 | A line under Start here |
| Find something to read, from an empty Library | 2 (More, Explore), nothing on Library saying where | 1 | 1 (the sidebar) | 1 | A link in Library's empty state, before the list of formats |
| Start a page, on an empty Notes | 1, with New page offered twice | 1, offered once | 1 | 1 | The empty state's button, beside Import pages |
| Make a backup, from Settings | 1 press after scrolling 9,800 px (or a press in 19 ungrouped links) | 1 (the line under the title), or 5,300 px down | 1 after 6,200 px | 1 after 3,300 px | Settings in five groups, what most people come for first; a line under the title |
| Turn a setting's switch | The 24 px switch | The switch or its name | The switch | The switch or its name | A row's name labels its one switch |
| Find a guide in Help | Scroll a list of 60 | Type a word (0 presses) | Scroll | Type a word | A field over the guides |
| Reach what Server status says needs attention | Scroll past every line that is fine | 1 (a link under the sentence) | Scroll | 1 | |
| Read search results on a phone | First result 790 px down for "water" | About 560 px down | | | The explainer links give way to results on a phone; Go to's sentences one line each |
| Maps for where I live: map, hills and place names for the home country | 11 (Maps, Offline, Choose your area, the country, terrain, Check the size, Download; then One country in full, the country from a list, Download place names) | 6 (Maps, Offline, All map data, Add map data, Check sizes, Download) | 10 | 5 (Maps, Map data, Add map data, Check sizes, Download) | Map data's one flow; the home country chosen already; one press for every size. From Map data itself: 3 |
| The same with roads for routes and places to find, first time | about 23 (the above, then Add a road network, Read the list of regions, Add; Get reference data, the source, its layers, Show the size, Download), the 2.2 GB country file downloaded twice | 10 (the above, two ticks, Next, the country file choice) | about 22 | 8 (two ticks, the country file choice) | One country file for both, asked once whether to keep it; from Map data 7 on a phone, 6 on a desktop, one fewer once the choice is remembered |
| Roads for a drive, from Road route's empty state | 4 (Add road networks, Add a road network, Read the list of regions, Add), the file deleted with no say | 4 (Add roads for the home country, Check sizes, the choice, Download) | 4 | 4 | The country chosen from home; the choice asked, then remembered (3); a kept file is read with no download (**Build roads**, 2) |

| Plan a walk from a point on the map (streets add-on installed) | Not possible | 6 (press and hold, Plan a route from here, Walk, To, a place, Plan route); 5 once Walk is remembered | Not possible | 6 (right-click, the same) | One Plan a route with its ways of travelling; the way chosen is remembered |
| Show 30 minutes' drive from a point | Not possible | 2 (press and hold, Reachable from here): 30 minutes is the default | Not possible | 2 (right-click, Reachable from here) | From the quick search ("reachable"), 2 for the middle of the map. Works on every installation with a road network (Main roads only) |

On a tablet at 768 px every screen gained 196 px of width; the full sidebar is one press
away (the button at the top of the rail, or Ctrl \\).
