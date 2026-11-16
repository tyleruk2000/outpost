# Design

The visual system for Outpost. Tokens live in `apps/web/src/styles/tokens.css`; this
file explains the choices behind them. `docs/development/web-screens.md` is the
working guide for building a screen.

## Scene

A person at a kitchen table at dusk, or in a hut with a headlamp, opening a laptop or a
phone to look something up on a small server humming on a shelf. Bright daylight and
near darkness are both normal, so light and dark themes are equal citizens and the
default follows the system setting.

## The picture

**A cloth-bound field reference.** A dark verdigris spine (the sidebar), clean white
pages (the content), a sturdy book face for the titles of things you read, and one
amber lamp for anything alive right now.

This is deliberately not the default look of a web app: no all-white shell with a
single accent, no card grid, no geometric sans everywhere. The identity is carried by
three things and nothing else:

1. **The spine.** Navigation sits on deep verdigris in both themes. It is the one
   committed block of colour.
2. **Two faces with fixed jobs.** Literata, a book serif drawn for long reading on
   screens, names the things a person reads: a screen, a document, a page, a
   collection. Atkinson Hyperlegible does everything functional. Its letterforms were
   drawn to stay distinguishable in poor conditions, which is this product's premise.
3. **Contour lines.** Home and empty states carry a quiet contour drawing, generated
   with the same method as a real map (a height field traced by marching squares).
   Nothing else in the interface is decorative.

## Colour

Strategy: **restrained**, with one committed surface. All values are OKLCH.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `page` | `1 0 0` | `0.2 0.008 215` | Content surface. Light is literal white. |
| `surface` | `0.972 0.004 200` | `0.232 0.009 215` | Panels, toolbars, table heads |
| `surface-strong` | `0.945 0.006 200` | `0.265 0.011 215` | Hover, tracks, inline code |
| `raised` | `1 0 0` | `0.245 0.01 215` | Menus, dialogs |
| `border` / `border-strong` | `0.905 0.006 200` / `0.82 0.01 200` | `0.305 0.011 215` / `0.4 0.014 215` | Hairlines / control outlines |
| `ink` | `0.21 0.015 220` | `0.935 0.006 210` | Text |
| `ink-muted` | `0.44 0.016 220` | `0.74 0.012 212` | Secondary text (still 4.5:1) |
| `ink-faint` | `0.56 0.014 220` | `0.62 0.012 212` | Placeholders and disabled only |
| `spine` | `0.285 0.042 200` | `0.165 0.024 200` | The sidebar |
| `primary` | `0.45 0.074 200` | `0.76 0.09 195` | Main action, selection, links |
| `primary-soft` | `0.95 0.022 200` | `0.29 0.04 200` | Selected rows, soft buttons, info notices |
| `lamp` | `0.78 0.15 75` | `0.82 0.14 78` | Alive right now; favourites |
| `success` / `warning` / `danger` | `0.48 0.11 155` / `0.5 0.11 70` / `0.5 0.17 27` | lighter equivalents | State, always with words |

Rules:

- Primary is the seed colour, a deep mineral teal. It marks the main action, the
  current selection and links. Never decoration.
- The amber `lamp` is the single warm note. It means a download is running, an index
  is building, or something is a favourite. If more than a few amber things are on
  screen, something is wrong.
- Surfaces carry no warmth. Neutrals lean very slightly toward the brand's own hue.
- Text on a tinted background uses a darker shade of that hue, never grey.
- State is never colour alone: there is always a word, and usually an icon.

## Typography

| Family | Job |
| --- | --- |
| **Literata** (variable, optical sizes) | Titles of things you read, and reading surfaces (pages, document text). A setting switches reading surfaces to the sans. |
| **Atkinson Hyperlegible Next** (variable) | Everything functional: navigation, controls, labels, tables, body UI text. |
| **Atkinson Hyperlegible Mono** | Paths, checksums, coordinates, code. |

All three are bundled and served locally. Fixed rem scale, ratio about 1.2:

| Token | Size / line | Use |
| --- | --- | --- |
| `display` | 2.125rem / 2.5rem | Home title |
| `title` | 1.75rem / 2.125rem | Screen titles |
| `heading` | 1.4375rem / 1.875rem | Empty-state and section titles in serif |
| `lead` | 1.1875rem / 1.625rem | Section headings, row titles |
| `body` | 1rem / 1.5rem | Default |
| `small` | 0.875rem / 1.3125rem | Secondary UI text |
| `micro` | 0.78125rem / 1.125rem | Badges, counters |

- Reading prose is 1.0625rem at 1.72 line height, capped at 70ch.
- Sentence case everywhere. No all-caps labels, no tracked eyebrows, no decorative
  numbering.
- Words a language model wrote are not reading matter from the library, so they are
  set in the functional face, under a heading that says they were generated and by
  what. Passages quoted from the library beside them are set in Literata. The two
  faces keep the model's wording and the source's wording apart.
- Numbers people compare use tabular figures.

## Shape and depth

- Radii by role: controls 5px, panels and dialogs 8px, pills full.
- Structure comes from hairlines and the two neutrals. Shadows appear only on things
  that float.
- Icons are Lucide, stroke 1.6 in navigation.
- No side-stripe accents, gradient text, glass, or icon-in-a-tinted-square tiles.

## Layout

```
┌────────────┬──────────────────────────────────────────┐
│ ▮ Outpost  │                                          │
│ Search  ⌘K │   Title in Literata                      │
│            │   content                                │
│ Home       │   reading: max 46rem, left aligned       │
│ Explore    │   browsing: max 70rem                    │
│ Library    │   map and readers: full bleed            │
│ Maps       │                                          │
│ Notes      │                                          │
│  ▸ pages   │                                          │
│ ─────────  │                                          │
│ Downloads  │                                          │
│ Storage    │                                          │
│ Settings   │                                          │
│ ▪ Ready    │                                          │
└────────────┴──────────────────────────────────────────┘
        spine: verdigris            pages: white
```

- Desktop: a 16rem spine, collapsible to icons. Knowledge at the top, the page tree in
  the middle, upkeep at the bottom, and the lamp (one line of status) at the foot.
- Mobile: a spine-coloured top bar and a bottom bar with Home, Library, Maps, Notes
  and More.
- Lists before cards. A card appears only when an item is an object picked from a set
  (a catalogue collection, a map region). Cards are never nested.
- Home is written as sentences and lists, not tiles of numbers.

## Motion

- 120–200ms, ease-out, on state changes only: opening, selecting, confirming.
- Progress bars move with real progress. No page-load choreography.
- Under `prefers-reduced-motion`, transitions are instant.

## Writing

- Name things as people know them: "Library", "Storage", "Downloads".
- A button says what it does: "Download", "Move collection", "Write drive".
- Errors state what happened and what to do. Offline is a normal state, described
  plainly: "No connection. This download will resume when the network is back."
- Empty screens invite the first action.

## Layers

`sticky 10` · `nav 20` · `dropdown 30` · `overlay 40` · `dialog 50` · `toast 60` ·
`tooltip 70`.
