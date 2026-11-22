# Building a screen in the web app

How screens in `apps/web` are put together. Read `PRODUCT.md` and `DESIGN.md` first.
`features/storage/storage-page.tsx` is the reference screen: match its structure and tone.

## Where things are

```
apps/web/src/
  styles/tokens.css      every colour, radius, font and layer as a CSS variable
  styles/base.css        Tailwind v4 theme on the tokens, base rules, the type scale
  styles/prose.css       reading and writing surfaces (.prose)
  components/ui/         controls: button, input, dialog, menu, tabs, select, switch, checkbox,
                         radio, progress, badge, tooltip, popover, segmented, skeleton, kbd
  components/page.tsx    Page, PageHeader, Section, EmptyState, Notice, Rows, ErrorState,
                         BackLink, Joined, JumpLinks, Disclosure
  components/nav.ts      every screen and where it belongs
  lib/api.ts             the only way to call the server ({ keepalive: true } for a save on close)
  lib/notify.tsx         notify.error: every error toast, also said at once to a screen reader
  lib/use-debounced.ts   useDebounced(value, ms)
  lib/page-visible.ts    usePageVisible(), isPageVisible(): stop clocks while hidden
  lib/use-width.ts       useWidth(fallback): an element's width, for hand-drawn charts
  lib/clipboard.ts       copyText(text), with the fallback for plain http
  lib/events.tsx         live updates: server events to query keys
  lib/queries.ts         shared hooks (system, storage, jobs, settings)
  lib/utils.ts           cn, timeAgo, formatDate, formatDateTime, plural, modKey
  lib/clock.ts           the 12- or 24-hour choice and the one way to write a time
  features/<name>/       one folder per screen or feature
  features/kept/         the app out of reach of the server
  sw/                    the service worker; built into /sw.js by sw-plugin.ts
```

Use the `lib` helpers rather than another copy: `lib/one-copy.test.ts` fails if
`useDebounced`, `usePageVisible`, `copyText` or `useWidth` is defined elsewhere, and
`lib/notify.test.tsx` fails if `toast.error` is called outside `lib/notify.tsx`. The
shared `TabsList` already wraps and gives 44 px names on a phone.

## The look

- **Colour from tokens only**, through the Tailwind names (`bg-page`, `bg-surface`,
  `text-ink`, `text-ink-muted`, `border-border`, `bg-primary`, `bg-primary-soft`,
  `text-danger`, `bg-lamp` …). Never a hex value or a palette colour like `gray-500`.
- **Two families.** `font-title` (Literata) for the title of a thing a person reads;
  the sans for everything functional; `font-mono` for paths, checksums, coordinates and
  code. Sizes from the scale: `text-micro`, `text-small`, `text-body`, `text-lead`,
  `text-heading`, `text-title`, `text-display`.
- **Sentence case.** No all-caps, eyebrow text or decorative numbering.
- **Lists before cards.** A set of things is a list with hairlines (`Rows`). A card is
  only for an object picked from a set, never nested.
- **Hairlines and the two neutrals, not shadows.** Shadows only on things that float.
- **Radii by role:** `rounded-control`, `rounded-panel`.
- **Amber `lamp` means "alive right now"** (a running download, a reply being written)
  or a favourite, nothing else. Primary is the main action, the selection and links.
- **None of:** side-stripe accents, gradient text, glass, identical icon-card grids,
  big-number tiles. State is text, optionally with an icon.
- **Numbers people compare** get `tabular` and come from `formatBytes`, `formatNumber`,
  `plural`.
- **Times of day** only through `formatDateTime`, `formatTimeOfDay`, `formatStoredTime`
  or `clockText`, which follow the clock chosen under Settings → Appearance; a component
  that stays on screen calls `useClockStyle()`. UTC is always 24-hour and marked. Tests
  run on the 24-hour clock.
- **Motion** 120–200 ms on state changes only. **Icons** are Lucide, `strokeWidth` 1.6 in
  navigation.

## Charts

Hand-drawn SVG in React; no chart library.

1. **Form from the job.** Change over time: a line. Parts of a whole: one stacked bar.
   Ranking: horizontal bars. A single figure: a number in a sentence. Never two y-axes.
2. **Colour by job.** Identity: `--chart-1` to `--chart-4` in order, meaning the same
   across a screen (scatter plots use three); the rest `--chart-other`. Magnitude:
   `--chart-seq-1` to `-5`. State: the status tokens with a word. The palette is
   validated for colour-blind separation and contrast; do not add to it.
3. **Thin marks.** Lines 2 px; bars with 2 px gaps and 4 px rounded data ends; points ≥8
   px. Grid and axes recessive.
4. **Text in ink**, never the series colour. Two or more series have a legend; up to four
   are labelled directly.
5. **Pointer and keyboard.** Crosshair and tooltip on lines, a tooltip per mark, hit
   areas larger than marks, focusable marks.
6. **Words.** A title, a one-line reading, an accessible name and a hidden table of the
   numbers.
7. **Look at it** in light, dark and at phone width.

## Diagrams

A diagram explains a mechanism words struggle with; a form-and-answer screen gets none.
They are drawn with `features/diagrams/` only:

- `plate.tsx`: `Plate` (a `figure` with an SVG at the given width, named by its caption
  and described by its own sentence) and the parts `Line`, `Path`, `Arrow`, `Angle`,
  `Ground`, `SunSign`, `StarDot`, `Mark`, `Spread`, `ScaleBar`, `Label`. Lines by role
  (`object` 1.5 px ink, `guide` 1 px muted, `sight` dashed, `subject` 2 px accent), open
  arrowheads, angles as accent arcs with the value outside, hatched ground, the sun as ☉,
  ranges as tinted bands.
- `geometry.ts`: angles clockwise from up, arcs, `exaggeration` (a stated whole factor),
  and label placement (`placeLabel`, `firstFree`, `aroundGroup`) that drops a label
  rather than overlap.

Labels are real text at the small size or larger, upright, never overlapping, and make
room at 150% and 200% text. A live diagram uses the same functions as the figures beside
it, with a test of a known angle in both hemispheres. Nothing moves. A diagram that would
be wrong somewhere is not drawn there. `e2e/tests/diagrams.ts` (`checkDiagrams`)
measures every plate on a page.

## Every screen has a place in the navigation

`components/nav.ts` describes every screen. The sidebar, the phone's bar and More sheet,
the quick search's "Go to" and the "g then a letter" shortcuts are drawn from it:

- **A screen people go to directly** is an entry of `knowledgeNav` or `upkeepNav`, with
  an icon and a free shortcut letter.
- **A screen reached from another** is one of that entry's `children`. The parent links
  to it near its top: `PageHeader under="/radio"` draws `ScreensUnder`.
- **A screen of one thing** (a document, a plan) needs no entry.
- **Its `label` is its `h1`**, word for word (`every-screen.spec.ts` checks). The `h1` also
  names the browser tab ("Settings / Outpost") and is said aloud when a person moves to the
  screen (`components/route-announcer.tsx`), so every screen has exactly one, even if only
  for a screen reader (`sr-only`). A screen of one thing may set `document.title` itself.
- **Give it `keywords`** people use ("food" for Supplies), and add a line to the table
  in `components/command-palette-words.test.ts`.
- **A Settings section** is an entry of `settingsSections`, opened as
  `/settings#<id>`.

`components/nav.test.tsx` fails on a parameterless route in neither list or an entry
with no route. `e2e/tests/every-screen*.spec.ts` press from Home to every screen at
desktop and phone width, and at an insecure address, where `crypto.randomUUID`, the
clipboard, sharing, location and caches are missing: check before use.

The sidebar must fit a 13-inch laptop with a page tree: upkeep screens and the lamp stay
at the foot, the rest scrolls with a fade. Look at 1280×720, 1280×800 and 1440×900.
The More sheet holds every screen the four tabs do not, in sidebar order, folded under
their parents.

## Every screen has all of its states

- **Loading:** `Skeleton`s shaped like the content, not a spinner.
- **Empty:** `EmptyState` saying what belongs here, with a first action (`compact`,
  `level={3}` inside a section). A filter that matches nothing says so, with a way to
  clear it.
- **Error:** `ErrorState` with retry for a failed load; `Notice tone="danger"` or
  `notify.error(...)` for a failed action, with `errorMessage(error)`.
- **Partial trouble** (a disconnected location, a running job, unreadable text): say it
  where it matters.
- **No permission state**: there are no roles.

## Data

- TanStack Query. **Query keys start with the feature name**, because `lib/events.tsx`
  refreshes by prefix. Add the event to its `invalidations` map, listing only keys it
  can change.
- **Do not poll what an event reports.** A screen following one job may poll while it
  runs. Hidden tabs refetch nothing; the stream closes after a minute hidden. Job
  progress is patched into `useActiveJobs` from the event.
- Types from `@outpost/shared`; never redeclared.
- `useMutation`, invalidate on success, `notify.error` on error.
- Long work is a server job shown with `Progress` from real numbers. No fake progress,
  no control that does nothing.

## Words

Name things as the person would ("Add documents"). A button says what it does and keeps
that name through the flow. An error says what happened and what to do. Deleting goes
through `ConfirmDialog`, naming what goes.

## One way everywhere

`lib/one-product.test.ts` fails when a screen goes its own way; its `KNOWN` lists are
places still to fix.

- **Buttons.** In a dialog: one row at the foot (`DialogFooter`), right-aligned, main
  last. In the flow of a page: at the left under what they act on, main first. In a
  `PageHeader`: main last.
- **The way back** is `BackLink` above the title: `ArrowLeft` and the other screen's
  name. `PageHeader` draws it for a child screen; others pass `back={{ to, label }}`.
- **Names.** "Where to keep it" for a download's place. **Notes** is the place, a
  **page** what is written there, never "a note".
- **Dates** "17 Nov 2026" through `formatDate`; editions keep the publisher's form.
- **Facts on one line** joined by " · " (`Joined`).
- **Sections.** `Tabs` when one shows at a time; `JumpLinks` when all show.
- **Radios** are round marks with a dot; touch targets grow invisibly.
- **Toasts** are words without an icon; errors through `notify.error`. Set once on the
  `Toaster`.
- **No emoji** in Outpost's own things.
- **Household words** ("8 items", not "8 rows"); technical detail behind a `Disclosure`.
- **The answer first**, before what it rests on and before Keep or Print; UTC times also
  in the device's clock ("15:00 UTC (16:00 here)").

## A screen that makes a PDF

PDFs are made in the browser by `features/maps/print/pdf.ts`. Wrap the bytes with
`madePdf(bytes, title, kind, from)` and hand them to `PdfActions` (or `useMadePdf` with
`PdfButtons` and `PdfStatus`), in `features/library/made/`: **Save as PDF**, **Add to
library** and **Share**, the same everywhere. Title it for what and when, give `from` the
in-app address, and date it by content so the same thing twice is the same file. A
secret (a one-time pad) gets none of these buttons.

## Access and layout

- Everything works from the keyboard with the global `:focus-visible` ring. Icon-only
  buttons have an `aria-label`; controls are labelled (`Field`, `Field optional`).
- A dialog returns focus to what opened it (`DialogContent`, `ConfirmDialog`, or
  `useFocusReturn`). A dialog without a description is described by nothing.
- App shortcuts (`/`, Ctrl/⌘ K, `g` then a letter, Ctrl/⌘ \) act only outside fields,
  menus, lists and dialogs; a screen's own keys follow the same rule.
- Mobile-first from 320 px. Leave `Page`'s bottom padding. Touch targets ≥44 px.
- **A full-height screen** leaves `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`, not
  `pb-14`. Heights in `dvh`, never `vh`.
- **A row of names wraps** rather than scrolling sideways. Check phones at root font
  sizes of 20 and 24 px.
- **Text size** (87.5%, 100%, 125%, 150%) scales the root font size, set by
  `public/pre-paint.js`; size in `rem`. `e2e/tests/shell-large-text.mobile.spec.ts`
  checks every top-level screen.
- Body contrast ≥4.5:1; `text-ink-faint` only for placeholders and disabled text.
- **axe-core checks every screen** in both themes in the every-screen walks
  (`e2e/tests/a11y.ts`); a serious or critical finding fails them. Waive only with a
  reason, in `e2e/tests/a11y-waivers.ts`. What it does not check is in
  [testing-status.md](../testing-status.md#accessibility).

## Things over a map

One component decides where things sit over the map (`features/maps/map-furniture.tsx`);
a new tool uses its pieces. Wide screens: search top left, controls top right, the card
in hand at the foot with the readout, scale and credits.

**On a phone, everything over the map is one column** from the top of the map to the top
of the sheet:

| Place | What is there | Gives way? |
| --- | --- | --- |
| Top edge | Search | Never |
| Under it | Tools as icons (`MapToolColumn`), then a button that says "More" (`MapMenu`): every tool by name | Icons show what fits, a tool in hand or a layer that is on first; "More" never |
| Clear map | Nothing; the centre is two fifths of the way down | |
| Just above the sheet | Readout, scale, credits | Credits never; the rest in order below |
| Foot | The sheet; while something is in hand, its card in the sheet's place | |

- **A tool is one entry in `mapTools`** (`map-chrome.tsx`); no buttons anywhere else.
- **A card is a `MapCard`** and does not set its own height; extra content scrolls
  inside it, under its title and close button. **On a phone the card of what is in hand
  takes the lowered sheet's place** (`docked` in `maps-page.tsx`): edge to edge, the
  credits over it, up to 12 px below the cross and no higher; the readout and the
  sheet's tabs come back when it is closed. One thing at a time. The camera keeps the
  centre where it was, so the map does not move. A card while nothing is in hand (where
  the device is, first use), or while the sheet is raised, floats above the readout in
  the lower three fifths of the clear map.
- **One title**: a tool that takes over the sheet (the page to print) is named there;
  its card has `titleHidden`.
- **A hint is a card, not a message**: a message at the foot of a phone lies over the
  sheet's tabs.
- **As room shrinks**, the icons step aside first, then the centre's coordinates with the
  scale bar, then the sun times. `MapFurniture` measures and sets `data-room` (`all`,
  `sun`, `none`) for `maps.css`; everything stays reachable elsewhere.
- **Touch targets 44 px in pixels** on map screens (`outpost-touch`); icon controls do
  not grow with text.
- **A map inside another screen** (`features/propagation/map/plan-map.tsx`) uses the same
  column.

`e2e/tests/layout-audit.ts` measures overlaps, clipping, small targets and text, and
sideways scroll; `phone-layout.mobile.spec.ts` holds Maps to it at three phone sizes.
`maps.iphone.spec.ts` does the same in WebKit at iPhone sizes, and
`docs/development/maps-on-a-phone.md` lists what was found. Add a state when you add a tool.

## Out of reach of the server

Where the app is kept on the device, `features/kept/out-of-reach-app.tsx` replaces the
routes with those that work from kept copies. A new screen needs nothing for this. A
file needed out of reach must be reachable from `out-of-reach-app.tsx` (that is how
`sw-plugin.ts` decides what the phone holds). The service worker is not registered in
development and is blocked in end-to-end tests except `kept.mobile.spec.ts`; to try it,
build the packaged app and open it on `localhost`.

## Checking your work

```bash
# terminal 1: API on a scratch data directory
OUTPOST_DATA_DIR=/tmp/outpost-dev/data OUTPOST_STORAGE_ROOTS=/tmp/outpost-dev/storage \
OUTPOST_PORT=8101 node apps/server/src/index.ts
# terminal 2: web app, proxying to it
OUTPOST_DEV_SERVER=http://127.0.0.1:8101 OUTPOST_WEB_PORT=5181 pnpm --filter @outpost/web dev
# screenshots (light, dark, mobile)
node e2e/tools/screenshot.mjs http://localhost:5181 /tmp/outpost-shots /library /library@dark /library@mobile
```

Look at each state in light, dark and mobile. `pnpm --filter @outpost/web typecheck`
must pass.
