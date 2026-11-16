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
                         checkbox, progress, badge, tooltip, popover, segmented, skeleton, kbd)
  components/page.tsx    Page, PageHeader, Section, EmptyState, Notice, Rows, ErrorState
  components/            shell: sidebar, mobile nav, command palette, lamp, contour, storage bar
  lib/api.ts             the only way to call the server (`api.get/post/patch/delete/upload`)
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

## Every screen has all of its states

- **Loading:** skeletons shaped like the content (`Skeleton`), not a centred spinner.
- **Empty:** `EmptyState` with a title that says what belongs here and a first action.
- **Error:** `ErrorState` (with retry) for a failed load; `Notice tone="danger"` or a
  toast (`sonner`) for a failed action. Use `errorMessage(error)`: the server already
  writes messages for people.
- **Partial trouble:** a disconnected storage location, a job still running, a
  document whose text could not be read. Say it plainly where it matters.
- **No permission state.** There are no accounts or roles, so every action is there
  for everyone.

## Data

- Use TanStack Query. **Query keys start with the feature name** (`["documents", …]`),
  because `lib/events.tsx` refreshes queries by that prefix when the server says
  something changed. Add your event to the `invalidations` map there if it is missing.
- Types come from `@outpost/shared`. Do not redeclare API shapes.
- Mutations: `useMutation`, invalidate the affected keys on success, toast on error.
- Long work is a server job; show it with `Progress` fed by real numbers. Never fake
  progress, never show a control that does nothing.

## Words

Write for the person using it. Name things as they would ("Add documents", not
"Upload files to index"). A button says exactly what it does and keeps that name
through the flow. An error says what happened and what to do next. Deleting anything
goes through `ConfirmDialog`, which names what will be removed.

## Access and layout

- Everything works from the keyboard, with visible focus (the global `:focus-visible`
  ring; do not remove it). Icon-only buttons have an `aria-label`. Form controls are
  labelled (`Field`).
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
- Body text contrast is at least 4.5:1. `text-ink-faint` is for placeholders and
  disabled text only.

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
