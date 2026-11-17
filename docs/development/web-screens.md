# Building a screen in the web app

How screens in `apps/web` are put together. Read `PRODUCT.md` and `DESIGN.md` first:
they say who this is for and why it looks the way it does. This page is the working
detail.

## Where things are

```
apps/web/src/
  styles/tokens.css      every colour, radius, font and layer as a CSS variable
  styles/base.css        Tailwind v4 theme mapped onto the tokens, base rules, utilities
  styles/prose.css       reading and writing surfaces (.prose)
  components/ui/         controls: button, input, dialog, menu, misc (tabs, select, switch,
                         checkbox, radio, progress, badge, tooltip, popover, segmented, skeleton, kbd)
  components/page.tsx    Page, PageHeader, Section, EmptyState, Notice, Rows, ErrorState,
                         BackLink, Joined, JumpLinks, Disclosure
  components/            shell: sidebar, mobile nav, command palette, lamp, contour, storage bar
  lib/api.ts             the only way to call the server (`api.get/post/patch/delete/upload`;
                         `{ keepalive: true }` on `patch` and `put` for the save made as a page closes)
  lib/notify.tsx         `notify.error`: every error toast, also said at once to a screen reader
  lib/use-debounced.ts   `useDebounced(value, ms)`: typed words, asked for once the person pauses
  lib/page-visible.ts    `usePageVisible()`, `isPageVisible()`: stop clocks and sampling while hidden
  lib/use-width.ts       `useWidth(fallback)`: an element's width in pixels, for hand-drawn charts
  lib/clipboard.ts       `copyText(text)`: copies, with the older way for plain http; says if it worked
  lib/events.tsx         live updates; maps server events to query keys to refresh
  lib/queries.ts         shared data hooks (system, storage, jobs, settings)
  lib/utils.ts           cn, timeAgo, formatDate, formatDateTime, plural, modKey
  lib/clock.ts           the 12-hour or 24-hour choice, and the one way to write a time of day
  features/<name>/       one folder per screen or feature
  features/kept/         what is kept in the browser for when the server is out of reach,
                         and the app as it is then (see docs/offline.md)
  sw/                    the service worker and its rules; built into /sw.js by sw-plugin.ts
```

`features/storage/storage-page.tsx` is the reference screen. Match its structure and
tone before inventing anything.

Use the helpers in `lib` rather than writing another copy in a feature folder:
`lib/one-copy.test.ts` fails if `useDebounced`, `usePageVisible`, `copyText` or
`useWidth` is defined anywhere else, and `lib/notify.test.tsx` fails if `toast.error` is
called anywhere but `lib/notify.tsx`. The shared `TabsList` and `TabsTrigger` already
wrap on to a second line and give each name 44 px of height on a phone: do not add
`flex-wrap` or a minimum height of your own.

## The look, in practice

- **Colour comes from tokens only.** Use the Tailwind names (`bg-page`, `bg-surface`,
  `text-ink`, `text-ink-muted`, `border-border`, `bg-primary`, `text-primary`,
  `bg-primary-soft`, `text-danger`, `bg-lamp` …). Never a hex value, never a Tailwind
  palette colour such as `gray-500`. Light and dark both come for free that way.
- **Two type families with fixed jobs.** `font-title` (Literata, serif) is for the title
  of a thing a person reads: a screen title, a document, a page, a collection.
  Everything functional is the default sans. `font-mono` is for paths, checksums,
  coordinates and code. Sizes are the scale in `base.css`: `text-micro`, `text-small`,
  `text-body`, `text-lead`, `text-heading`, `text-title`, `text-display`.
- **Sentence case everywhere.** No all-caps labels, no tracked "eyebrow" text above
  headings, no decorative numbering.
- **Lists before cards.** A set of things is a list with hairlines (`Rows`, or
  `divide-y divide-border`). A card is only for an object picked from a set (a catalogue
  collection, a map region), and cards are never nested.
- **Structure from hairlines and the two neutrals**, not shadows. Shadows are for
  things that float (menus, dialogs, toasts) and come from the `ui` components.
- **Radii by role:** `rounded-control` for controls, `rounded-panel` for panels.
- **The amber `lamp` colour means "alive right now"** (a running download, indexing,
  a reply being written)
  or a favourite. Nothing else. Primary (verdigris) is for the main action, the current
  selection and links.
- **No side-stripe accents** (a thick coloured left border), no gradient text, no
  glass effects, no identical icon-heading-text card grids, no big-number "metric"
  tiles. State is always text, optionally with an icon; colour only supports it.
- **Numbers people compare** (sizes, counts, progress) get the `tabular` class and come
  from `formatBytes` / `formatNumber` / `plural`.
- **A time of day is never formatted by hand.** Use `formatDateTime` (`lib/utils.ts`),
  or `formatTimeOfDay`, `formatStoredTime` and `clockText` (`lib/clock.ts`). They write
  it on the 24-hour or the 12-hour clock as chosen under Settings → Appearance, so that
  one screen never shows both. A component that shows a time and stays on screen while
  the choice could change calls `useClockStyle()`. UTC is the exception: always
  24-hour, marked "UTC". The web tests and the end-to-end suite run as a device on the
  24-hour clock (`test-setup.ts`, `locale` in `e2e/playwright.config.ts`); a test of
  the 12-hour clock says so itself.
- **Motion is 120–200 ms on state changes only.** No entrance animations on page load.
- **Icons are Lucide**, `strokeWidth` 1.6 in navigation, default in controls.

## Charts

Charts are hand-drawn SVG in React. There is no chart library. They follow a method,
not taste:

1. **Pick the form from the job.** Change over time is a line. Parts of a whole is one
   stacked bar. A ranking is horizontal bars. A single figure is a number in a
   sentence, not a chart. Never two y-axes on one chart.
2. **Colour last, and by job.** Identity uses the four categorical tokens
   `--chart-1` (teal), `--chart-2` (amber), `--chart-3` (violet), `--chart-4` (rose),
   always in that order and always meaning the same thing across a screen. Scatter
   plots use the first three only. Everything else folds into `--chart-other`.
   Magnitude uses the single-hue ramp `--chart-seq-1` … `--chart-seq-5`. State uses
   the status tokens (`success`, `warning`, `danger`) with a word beside it. The
   palette was checked with a validator for colour-blind separation and contrast in
   both themes; do not add colours to it.
3. **Marks are thin.** Lines 2px, bars with a 2px gap in the surface colour between
   segments, 4px rounded ends at the data end only, points at least 8px. Grid and axes
   are recessive (`--chart-grid`, `--chart-axis`).
4. **Text is ink, never the series colour.** Values and labels use `text-ink` and
   `text-ink-muted`; a coloured mark next to them carries identity. Two or more series
   always have a legend, and up to four are also labelled directly on the chart.
5. **Every chart answers the pointer and the keyboard.** A crosshair and tooltip on
   lines, a tooltip per mark on bars and points, hit areas larger than the mark, and
   focusable marks with the same information for keyboard users.
6. **Every chart has words.** A title that says what it shows, a one-line reading of
   it underneath where that helps, an accessible name, and a table of the same numbers
   available to screen readers (a visually hidden `<table>` is fine).
7. **Look at it** in light, dark and at phone width before calling it done.

## Every screen has a place in the navigation

`components/nav.ts` is the one description of every screen and where it belongs. The
desktop sidebar, the phone's bottom bar and More sheet, the quick search's "Go to" list
and the "g then a letter" shortcuts are all drawn from it, so a new screen is added
there and nowhere else:

- **A screen people go to directly** (Maps, Settings) is an entry of `knowledgeNav`
  (reading, writing and finding) or `upkeepNav` (looking after the library), with an
  icon and a free letter for its shortcut.
- **A screen reached from inside another** (How search works, from Search; a radio
  tool, from Radio) is one of that entry's `children`, in the order the parent screen
  lists it. The sidebar shows it indented under its parent behind a button ("Show the
  screens under Radio"), the More sheet the same, and the quick search as
  "Radio: Repeaters". Give the parent screen a link to it near its top: `PageHeader`
  takes `under="/radio"` and draws `ScreensUnder`, which reads the same description.
- **A screen with an address of its own and nothing else** (a document, a plan) needs no
  entry: it is reached from the list it belongs to.
- **Its name is its title.** `label` is the screen's own `h1`, word for word, so that
  the sidebar, the More sheet and the screen agree (`every-screen.spec.ts` checks; Home,
  "Your library", and the set-up guide are the two listed exceptions).
- **Give it the words people use for it** in `keywords`: "food" for Supplies, "wifi" for
  QR codes, "bigger text" for Text size. The quick search's "Go to" list, and the search
  screen's, find a screen by its name first and then by these (`components/find-places.ts`).
  Leave a word out rather than send it to a screen that does not answer it.
  `components/command-palette-words.test.ts` holds a table of everyday words and where
  each lands: add a line for your screen.
- **A section of Settings** is one entry of `settingsSections` in `nav.ts`, with the
  `id` of its `SettingsSection` and its everyday words; the quick search offers it as
  "Settings: Backup" and opens `/settings#backup`, which comes to rest at that section.

`components/nav.test.tsx` reads the routes from `app.tsx` and fails if a route with no
parameters is in neither list (the not-found page is the one exception, listed there),
or if an entry points at no route. `e2e/tests/every-screen.spec.ts` and
`every-screen.mobile.spec.ts` then press their way from Home to every screen in the
navigation, at desktop and phone width, and once more at an address browsers do not
treat as secure (as a phone on the home network reaches Outpost), failing on any page
error. There, `window.isSecureContext` is false: `crypto.randomUUID`, the clipboard,
sharing, location and the service worker's caches are missing or refused, so check for
them before use.

The sidebar has to fit a 13-inch laptop (a window about 700 to 800 px high) with a page
tree in it. The upkeep list (Downloads, Storage, On this device, Settings) and the lamp
stay at the foot, always in view; the screens and the page tree above them scroll as one
part, and a fade at its foot says when there is more below. Groups start closed unless
every one fits open with room for about eight pages of the tree; the group of the screen
in view opens by itself. The four screens of the phone's bottom bar (Home, Library,
Maps, Notes) come first, with Search, as they are used most. Look at it at 1280 by 720,
1280 by 800 and 1440 by 900 when you add a screen.

The phone's More sheet holds every screen the four tabs do not, in the sidebar's order
and its two parts. A screen with others under it is a heading with a button that shows
them; they are folded away until asked for, except the group of the screen in view, so
that Storage and Settings are in sight without scrolling on a 390 by 844 phone. Screens
with none under them sit two to a line while they fit.

## Every screen has all of its states

- **Loading:** skeletons shaped like the content (`Skeleton`), not a centred spinner.
- **Empty:** `EmptyState` with a title that says what belongs here and a first action.
  Inside a section or a dialog it is `compact`, with `level={3}` under the section's title.
  A filter that matches nothing is not empty: say so in a line, with a way to clear it.
- **Error:** `ErrorState` (with retry) for a failed load; `Notice tone="danger"` or
  `notify.error(...)` (`lib/notify.tsx`) for a failed action. `notify.error` shows the
  usual toast and also writes the message to an assertive live region, so a screen
  reader says it at once rather than after the polite toasts; never call `toast.error`
  directly. Use `errorMessage(error)`: the server already writes messages for people.
- **Partial trouble:** a disconnected storage location, a job still running, a
  document whose text could not be read. Say it plainly where it matters.
- **No permission state.** There are no accounts or roles, so every action is there
  for everyone.

## Data

- Use TanStack Query. **Query keys start with the feature name** (`["documents", …]`),
  because `lib/events.tsx` refreshes queries by that prefix when the server says
  something changed. Add your event to the `invalidations` map there if it is missing,
  and list only the keys the event can really change: every key listed is fetched
  again on every open screen that shows it, each time the event arrives.
- **Do not poll what an event reports.** No `refetchInterval` on a list the server
  announces changes to. A screen that follows one job may poll it while it runs, and
  stops when it ends. Nothing refetches in a hidden tab: `lib/events.tsx` marks what
  changed while a tab is hidden and fetches it when the tab is shown, and closes the
  stream after a minute hidden. A job's progress is patched into the shared active-jobs
  list (`useActiveJobs`) from the event, without a fetch.
- Types come from `@outpost/shared`. Do not redeclare API shapes.
- Mutations: `useMutation`, invalidate the affected keys on success, `notify.error` on error.
- Long work is a server job; show it with `Progress` fed by real numbers. Never fake
  progress, never show a control that does nothing.

## Words

Write for the person using it. Name things as they would ("Add documents", not
"Upload files to index"). A button says exactly what it does and keeps that name
through the flow. An error says what happened and what to do next. Deleting anything
goes through `ConfirmDialog`, which names what will be removed.

## One way everywhere

Outpost is one product, not a set of tools built one at a time. Where screens agree on a
way of doing something, this is the way; `lib/one-product.test.ts` reads the source and
fails when a screen goes its own way. Its `KNOWN` lists are the places still to be put
right: take a line out when you fix one.

- **Buttons in a dialog** are one row at its foot (`DialogFooter`), on the right, the
  main one last: Cancel, then Save. The row wraps on a narrow phone; it is never a stack
  of full-width buttons. A bar at the foot of a full-screen form (a contact) is the same.
  **Buttons in the flow of a page** (under a form's fields, in an empty state, in a card)
  sit at the left under what they act on, the main one first, where the eye starts.
  **Buttons in a screen's header** (`PageHeader actions`) put the main one last, at the
  end of the row, as Storage does.
- **The way back.** A screen reached from another has a link back above its title: an
  arrow and the other screen's name, small and muted (`BackLink`). `PageHeader` draws it
  by itself for a screen under another in the navigation (Water leads back to Tools); a
  screen of its own (a plan, an item, a contact) passes `back={{ to, label }}`. One glyph,
  `ArrowLeft`, never a chevron; the slim bars over a page being written or a conversation
  use the same arrow.
- **Names.** The place a download is kept is "Where to keep it", everywhere. **Notes** is
  the place; what is written in it is a **page** ("Save as a page", "a page in Notes",
  "a page of notes" where it needs saying), never "a note". The fields of a contact or a
  saved place called "Note" are something else and keep the name.
- **Dates.** A day a person reads is "17 Nov 2026", through `formatDate`, on the server as
  in the browser. An edition or a version keeps the publisher's own form ("Version
  2026-11"). A time of day follows the clock rule above.
- **Facts about one thing** on one line are joined by a middle dot, " · " (`Joined`,
  which leaves out empty parts and says a comma to a screen reader). Not a slash, not a
  full stop between fragments, and not the thing's own name again.
- **Empty** is `EmptyState`, with the contour drawing and, where there is one, a button
  for the first thing to do (see the states above). Never a bordered paragraph.
- **Sections of a screen.** Tabs (`Tabs`) when one section shows at a time (Supplies,
  Morse, Encryption); links to each section (`JumpLinks`) when the screen shows them all,
  one after another (Water, the set-up guide).
- **Radios** are a round mark with a dot (`RadioItem`, or a native radio with
  `accent-primary`); a touch rule that makes targets 44 px reaches round the mark with an
  invisible box, as for a tick box, and never grows the mark into a square.
- **Toasts** are words, with no icon: `toast.success` and `toast` look the same. An error
  goes through `notify.error` and keeps its icon. An action in a toast (Undo, Open it) is
  drawn as a secondary button. All of it is set once, on the `Toaster` in `main.tsx`.
- **Icons** are Lucide line icons. Outpost's own things (its templates, its screens) never
  use an emoji; an emoji on a page is one a person chose for it.
- **Household words.** A screen a household reads says what it means in their words
  ("8 items", not "8 rows"). The technical detail a few want (an ADIF file's field
  names, the ports and protocols of a network scan) is kept, behind a `Disclosure`
  whose summary says what is inside.
- **The answer first.** A screen that works something out shows the answer before what
  it rests on and before the buttons that keep or print it, and gives a time in the
  device's own clock as well as UTC where UTC is the engine's ("15:00 UTC (16:00 here)").

## A screen that makes a PDF

PDFs are made in the browser by `features/maps/print/pdf.ts` (pages of text in
Helvetica and Courier, pictures, lines). A screen that makes one does not write its own
buttons: it wraps the bytes with `madePdf(bytes, title, kind, from)` and hands them to
`PdfActions` (or `useMadePdf` with `PdfButtons` and `PdfStatus` where the buttons live
in a header), all in `features/library/made/`. That gives **Save as PDF**, **Add to
library** and **Share** in the same words everywhere, with every state of the upload
said in words. Give the file a title that says what it is and for when, and a `from`
with the address inside Outpost that shows the thing again. Date the file by its
content, not by the clock, where you can, so that the same thing written out twice is
the same file and the library can say it already has it. A secret (a one-time pad) is
not given these buttons. [library.md](../library.md) has the whole of it.

## Access and layout

- Everything works from the keyboard, with visible focus (the global `:focus-visible`
  ring; do not remove it). Icon-only buttons have an `aria-label`. Form controls are
  labelled (`Field`).
  A field that may be left empty, among others that may not, says so (`Field optional`).
- A dialog gives focus back to what opened it when it closes, also when it was opened
  from state or a menu item rather than a `DialogTrigger` (`DialogContent` and
  `ConfirmDialog` do it; a Radix dialog built by hand uses `useFocusReturn`). A dialog
  with no `description` is described by nothing, not by its title again.
- The app's shortcuts (`/` and Ctrl or ⌘ K for the quick search, `g` then a letter,
  Ctrl or ⌘ \ for the sidebar) are listed at the foot of the quick search, and act only
  when focus is not in a field, a menu, a list or a dialog. A screen's own keys follow
  the same rule.
- Layout is mobile-first and must hold from 320 px wide. The sidebar becomes a bottom
  bar under `md`, so leave the bottom padding `Page` provides. Touch targets are at
  least 44 px on small screens (the `ui` controls already grow under `md`).
- **A screen that fills the height leaves room for the whole bottom bar.** The bar is
  taller by `env(safe-area-inset-bottom)` on a phone with a home indicator, so the
  room to leave is `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`, not `pb-14`: with
  the latter, the foot of the screen (on Maps it was the sheet's row of tab names) is
  under the bar on such a phone. Heights are in `dvh`, never `vh`.
- **A row of names never scrolls sideways without saying so.** With larger text, or a
  zoomed page, a row that fitted no longer does; let it wrap, so the last name is not
  off the edge. Check a phone layout with the root font size at 20 and 24 px.
- **Text size** (Settings → Appearance) scales the root font size on one device: 87.5%,
  100%, 125% or 150% of the size the device is set to, put on the page by
  `public/pre-paint.js` before anything is drawn (`lib/theme.tsx` keeps it there). Text
  sized in `rem`, as the scale in `base.css` is, follows it; a screen that holds at 150%
  and 200% holds at each step; `e2e/tests/shell-large-text.mobile.spec.ts` checks every top-level screen at
  each.
- Body text contrast is at least 4.5:1. `text-ink-faint` is for placeholders and
  disabled text only.

## Things over a map

The Maps screen has many tools, added one at a time, and each puts something over the
map. On a phone they share a small map with the sheet. So where a thing sits over the
map is not for each tool to choose: one component decides it for all of them
(`features/maps/map-furniture.tsx`), and a new tool follows the rule by using the
shared pieces. On a wide screen little lies over the map and the rule is short: search
top left, the column of controls top right, the card of what is in hand at the foot
with the readout, the scale and the credits under it.

**On a phone, everything over the map is one column from the top of the map to the top
of the sheet**, so nothing can lie over anything else. Each kind of thing owns one
place in it:

| Place | What is there | Gives way? |
| --- | --- | --- |
| The top edge | The search box, with the menu of every tool at its end (`MapMenu`) | Never |
| Under the end of the search box | The tools as icons (`MapToolColumn`) | Shows as many as fit; the rest are in the menu, where all of them always are |
| The clear map | Nothing. The centre of the map is two fifths of the way down it | |
| Above the readout | The cards: one for the tool or thing in hand (`MapCard`), and the recording's | At most the lower three fifths of the clear map, less a margin |
| Just above the sheet | The readout with the scale beside it, and the credits | The credits never; the rest in the order below |
| The foot | The sheet | Lowered, it shows its handle and tab names, or the name of a tool that has taken it over |

What follows from that:

- **A tool is one entry in one list** (`mapTools` in `map-chrome.tsx`). The column on a
  wide screen, the column on a phone and the phone's menu are all drawn from it. Do not
  add a button to the map anywhere else.
- **A card is a `MapCard`** (or uses the same shell, `mapCard` in `ui.tsx`). It does not
  set its own height. On a phone the cards together get the lower three fifths of the
  clear map, less a margin; a card with more to say scrolls inside itself, and its
  title and close button stay put. Because the camera keeps the centre of the map two
  fifths of the way down, a card never covers the centre or the cross that marks it,
  and the map does not move when a card appears or grows.
- **One title.** A tool that has taken over the sheet (line of sight) is named by the
  sheet's first line, which also holds what puts the tool down. Its card over the map
  then has no title of its own (`titleHidden`) and no close button.
- **What yields when a tool is in hand.** The line of sun times goes while a tool is
  in hand or a point has been found. The column of icons shortens to what fits above
  the cards. A recording's open card folds to its one line when another card comes up.
  The map itself does not move: while something is in hand the camera keeps the room
  it had. With the sheet at full height only the search box is left.
- **As the room gets shorter** (larger text, a small phone, the sheet raised) things
  step aside in this order: the icons, which show only what fits; then the coordinates
  of the centre, with the scale bar; then the line of sun times. `MapFurniture`
  measures what each needs and what there is, keeps 56 px of clear map for the cross,
  and says the answer in `data-room` (`all`, `sun`, `none`), which `maps.css` acts on;
  with `none` the cross goes too. It is measured rather than set by breakpoints
  because the credits can be one line or four. Each thing is still reachable: the tools
  in the menu, the coordinates of the centre and the sun times in the Sun tab, the
  coordinates of any point under a long press.
- **Touch targets are 44 px, in pixels**, on a screen with a map (`outpost-touch`, one
  rule in `maps.css`). A control with no words in it (an icon, the sheet's handle) does
  not grow with the text: a finger is the same size, and the room is the map's.
- **A map set into another screen** (`features/propagation/map/plan-map.tsx`) uses the
  same column, with its zoom buttons where the tools would be.

`e2e/tests/layout-audit.ts` measures a screen for things lying over each other, things
cut off, touch targets under 44 px, text under the smallest size in DESIGN.md and
sideways scroll. `e2e/tests/phone-layout.mobile.spec.ts` holds the Maps screen to it at
three phone sizes; add a state there when you add a tool.

## Out of reach of the server

Where the app is kept on the device (HTTPS, packaged build), it goes on without the
server: `features/kept/out-of-reach-app.tsx` replaces the routes with the few that can
work from kept copies, and every other address gets a page saying it needs the server.
A new screen needs nothing for this. Two things to know:

- A file a screen must have *out of reach* has to be reachable from
  `out-of-reach-app.tsx`; that is how `sw-plugin.ts` decides what the phone holds.
- The service worker is not registered in development, and the end-to-end suite
  blocks it except in `kept.mobile.spec.ts`. To try it by hand, build the packaged app
  and open it on `localhost`.

## Checking your work

Run a private server and the Vite dev server on ports of your own, then look at it:

```bash
# terminal 1: API on a scratch data directory
OUTPOST_DATA_DIR=/tmp/outpost-dev/data OUTPOST_STORAGE_ROOTS=/tmp/outpost-dev/storage \
OUTPOST_PORT=8101 node apps/server/src/index.ts
# terminal 2: web app, proxying to it
OUTPOST_DEV_SERVER=http://127.0.0.1:8101 OUTPOST_WEB_PORT=5181 pnpm --filter @outpost/web dev
# screenshots (light, dark, mobile) into a folder you can open
node e2e/tools/screenshot.mjs http://localhost:5181 /tmp/outpost-shots /library /library@dark /library@mobile
```

Look at the screenshots. Check light, dark and mobile, and each state you built.
`pnpm --filter @outpost/web typecheck` must pass.
