# Design

The visual system for Outpost. Tokens live in `apps/web/src/styles/tokens.css`; this
file explains the choices behind them.

## Scene

A person at a kitchen table at dusk, or in a hut with a headlamp, opening a laptop or a
phone to look something up on a small server humming on a shelf. Bright daylight and
near darkness are both normal, so light and dark themes are equal citizens and the
default follows the system setting.

Mood phrase: **a well-kept field station, lamp on** — mineral teal, clean white paper,
one amber light.

## Colour

Strategy: **restrained**. Neutral surfaces, one primary, one signal colour.

All values are OKLCH.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | `1 0 0` | `0.17 0.006 220` | Content surface |
| `surface` | `0.975 0.003 210` | `0.205 0.007 220` | Sidebar, toolbars, panels |
| `raised` | `1 0 0` | `0.235 0.008 220` | Popovers, dialogs, menus |
| `border` | `0.915 0.005 210` | `0.29 0.008 220` | Hairlines, control outlines |
| `border-strong` | `0.84 0.008 210` | `0.37 0.01 220` | Inputs, focused outlines |
| `ink` | `0.21 0.015 225` | `0.94 0.005 210` | Body text |
| `ink-muted` | `0.47 0.015 225` | `0.72 0.01 215` | Secondary text |
| `ink-faint` | `0.58 0.012 225` | `0.6 0.01 215` | Placeholders, disabled |
| `primary` | `0.45 0.074 200` | `0.74 0.09 195` | Primary actions, selection, links |
| `primary-ink` | `1 0 0` | `0.17 0.02 200` | Text on primary |
| `primary-soft` | `0.955 0.02 200` | `0.27 0.035 200` | Selected rows, soft buttons |
| `signal` | `0.74 0.15 72` | `0.8 0.14 78` | The lamp: active work, favourites |
| `success` | `0.5 0.11 155` | `0.76 0.13 155` | Verified, installed |
| `warning` | `0.56 0.12 70` | `0.8 0.13 80` | Low space, needs attention |
| `danger` | `0.52 0.17 27` | `0.72 0.15 25` | Errors, destructive actions |

Rules:

- The primary is the seed colour `oklch(0.45 0.074 200)`: a deep mineral teal. It is
  used for primary actions, the current selection and links. Never as decoration.
- `signal` amber is the single warm note. It marks things that are alive right now
  (a running download, an indexing job) and favourites. If more than a few amber
  things are visible at once, something is wrong.
- Light `bg` is literal white. Warmth is not added to surfaces.
- Text on tinted or coloured backgrounds uses a darker shade of that hue, never grey.

## Typography

One family, chosen for the subject: **Atkinson Hyperlegible Next** (variable, OFL),
with **Atkinson Hyperlegible Mono** for code, coordinates, checksums and sizes in
tables. Both are bundled through `@fontsource-variable` and served locally.

The Atkinson faces were drawn so that letters stay distinguishable in poor conditions.
That is the product's whole premise, so the type carries it.

Fixed rem scale, ratio about 1.15:

| Token | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display` | 1.75rem / 2.125rem | 650 | Page titles in notes and readers |
| `title` | 1.375rem / 1.75rem | 650 | Screen titles |
| `heading` | 1.0625rem / 1.5rem | 600 | Section headings |
| `body` | 0.9375rem / 1.5rem | 400 | Default UI and prose |
| `small` | 0.8125rem / 1.25rem | 400 | Secondary text, table meta |
| `micro` | 0.75rem / 1rem | 500 | Badges, counters |

- Prose (notes, readers) is set at 1rem / 1.7 and capped at 70ch.
- Sentence case everywhere. No all-caps labels, no tracked eyebrows.
- Numbers that people compare (sizes, free space, progress) use tabular figures.

## Shape and depth

- Radii by role, not one value: controls 6px, panels and dialogs 10px, pills full.
- Structure comes from hairline borders and the two-level neutral. Shadows appear only
  on things that float (menus, dialogs, toasts).
- Icons are Lucide at 1.5px stroke, 16px in controls and 18px in navigation.

## Layout

```
┌────────────┬──────────────────────────────────────────┐
│ Outpost    │  breadcrumb / title          search  ⌘K  │
│            ├──────────────────────────────────────────┤
│ Home       │                                          │
│ Search     │   content                                │
│ Explore    │   reading: max 720px, left aligned       │
│ Library    │   browsing: max 1120px                   │
│ Maps       │   map: full bleed                        │
│ Notes      │                                          │
│  ▸ page    │                                          │
│  ▸ page    │                                          │
│ ────────   │                                          │
│ Downloads  │                                          │
│ Storage    │                                          │
│ Settings   │                                          │
└────────────┴──────────────────────────────────────────┘
```

- Desktop: a 256px sidebar on the `surface` neutral, collapsible to icons. Knowledge
  destinations sit at the top, the notes tree in the middle, upkeep (downloads,
  storage, settings) at the bottom.
- Mobile: the sidebar becomes a bottom bar with Home, Search, Library, Notes and Maps,
  plus a More sheet for the rest.
- Content is left aligned. Reading surfaces are narrow; browsing surfaces are wider;
  the map takes everything.
- Lists and rows are preferred over cards. A card appears only when an item is a
  self-contained object people pick from a set (a catalogue collection, a map region).

## The one memorable thing

Contour lines. Empty states and the Home header carry a quiet topographic drawing in
`border` colour, generated from the same maths as a real contour map. Nothing else in
the interface is decorative.

## Motion

- 120–200ms, ease-out-quart, on state changes only: opening, selecting, confirming.
- Progress bars move with real progress. No page-load choreography.
- Under `prefers-reduced-motion`, transitions become instant or a short crossfade.

## Writing

- Name things as people know them: "Library", "Storage", "Downloads".
- A button says what it does: "Download", "Move collection", "Verify files".
- Errors state what happened and what to do. Offline is a normal state, described
  plainly: "No connection. This download will resume when the network is back."
- Empty screens invite the first action.

## Z-index scale

`base 0` · `sticky 10` · `nav 20` · `dropdown 30` · `overlay 40` · `dialog 50` ·
`toast 60` · `tooltip 70`.
