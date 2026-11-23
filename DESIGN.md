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
| `border` / `border-strong` | `0.905 0.006 200` / `0.64 0.01 200` | `0.305 0.011 215` / `0.54 0.014 215` | Hairlines / control outlines (3:1 on every surface) |
| `ink` | `0.21 0.015 220` | `0.935 0.006 210` | Text |
| `ink-muted` | `0.44 0.016 220` | `0.74 0.012 212` | Secondary text (still 4.5:1) |
| `ink-faint` | `0.545 0.014 220` | `0.635 0.012 212` | Placeholders and disabled only (4.5:1 on every surface) |
| `spine` | `0.285 0.042 200` | `0.165 0.024 200` | The sidebar |
| `primary` | `0.45 0.074 200` | `0.76 0.09 195` | Main action, selection, links |
| `primary-soft` | `0.95 0.022 200` | `0.29 0.04 200` | Selected rows, soft buttons, info notices |
| `lamp` | `0.78 0.15 75` | `0.82 0.14 78` | Alive right now; favourites |
| `success` / `warning` / `danger` | `0.48 0.11 155` / `0.5 0.11 70` / `0.5 0.17 27` | lighter equivalents | State, always with words |

Rules:

- Primary is the seed colour, a deep mineral teal. It marks the main action, the
  current selection and links. Never decoration.
- The amber `lamp` is the single warm note. It means a download is running, an index
  is building, a reply is being written, or something is a favourite. If more than a few amber things are on
  screen, something is wrong.
- Surfaces carry no warmth. Neutrals lean very slightly toward the brand's own hue.
- Text on a tinted background uses a darker shade of that hue, never grey.
- State is never colour alone: there is always a word, and usually an icon.
- The map has hues of its own for what is drawn over it, each with one job and never a
  status colour: `map-effect-*` for the nuclear effects, `map-range` (green) for the
  ground in sight of an aerial, `map-walk` (orange) for the ground a walk reaches. Each
  is checked for colour-blind separation against the map's land and the others it can
  meet (the figures are beside the tokens).
- A wash over the map is never the only mark of a shape. The range's ground in sight is
  the `map-range` wash at 55% with an edge in the same hue at full strength, 2 px, cased
  in the page colour, traced round every patch in sight: the wash lets the map show
  through, the edge carries the shape on hill shading, woods and satellite imagery and
  keeps a small patch from being lost. Checked at phone size on the light and dark maps,
  every map style and satellite imagery (21 November 2026): on the light map's land the
  edge is at least 3:1 and the wash 1.9:1 (it was 1.6:1 at 42% with no edge); on the
  dark map's land both are at least 3:1; edge and wash are 15 apart in the worst
  colour-blind simulation. The why view's disc edges its shape the same way.
- Round a range, two kinds of line, each told from the wash and edge by form as well as
  colour. The distance rings are thin solid lines in `ink-muted` grey, drawn only out to
  the first ring beyond the furthest ground in sight. The typical range is
  `map-range-typical` (magenta, `#a3229a` light, `#cc55c4` dark), 2.5 px, dashed,
  cased in the page colour, written once ("Typical 12 km"). Checked with the data-viz
  validator (21 November 2026; worst colour-blind separation, normal vision in brackets):
  on the light map 14.5 (34.3) from the range edge, 24.9 (36.6) from the wash over the
  land, 9.1 (21.8) from the grey rings, 5.6:1 on the land; on the dark map 15.1 (34.9)
  from the edge, 13.7 (23.3) from the rings, 4.3:1 on the land; high contrast 12.5 from
  its darker range green and 10.4 from its blue water; Low ink as the light map on white,
  6.5:1; satellite 12.2 from the wash over dark ground and 12.9 from brown fields, the
  casing carrying it on dark imagery.
- The night style keeps every other colour's lightness only, but the range, its typical
  circle and the walk have reds of their own (`map-range-night` `#c81300`,
  `map-range-typical-night` `#e61600`, `map-walk-night` `#a00f00`), used for the shading's
  pictures, their edges and the keys beside the map alike. On the night land: the range's
  edge 3.2:1 and its wash 1.8:1; the typical circle the lightest red the style draws, 4.0:1,
  told from the edge and rings by its dashes and label as well; the walk darker than the
  range (edge 2.3:1). Satellite imagery is made grey and dim there. Worked out from the
  colours (22 November 2026), not yet looked at in the dark.

## Typography

| Family | Job |
| --- | --- |
| **Literata** (variable, optical sizes) | Titles of things you read, and reading surfaces (pages, document text). A setting switches reading surfaces to the sans. |
| **Atkinson Hyperlegible Next** (variable) | Everything functional: navigation, controls, labels, tables, body UI text. |
| **Atkinson Hyperlegible Mono** | Paths, checksums, coordinates, code. |

All three are bundled and served locally. Fixed rem scale, ratio about 1.2:

| Token | Size / line | Use |
| --- | --- | --- |
| `display` | 2.125rem / 2.5rem | Home title; sunrise and sunset on the map, read at arm's length |
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
- A conversation with a model is set like a logbook, not a messenger: who is speaking
  is written in the margin (above the text on a phone), the person's words are a
  little heavier than the model's, and a hairline separates one exchange from the
  next. No speech bubbles, no avatars, no tinted turns.
- Numbers people compare use tabular figures.

## Shape and depth

- Radii by role: controls 5px, panels and dialogs 8px, pills full.
- Structure comes from hairlines and the two neutrals. Shadows appear only on things
  that float.
- Icons are Lucide, stroke 1.6 in navigation. The icons of saved places on the map are
  drawn for the size of a marker, in the same line style
  (`apps/web/src/features/maps/lib/place-icons.ts`).
- No side-stripe accents, gradient text, glass, or icon-in-a-tinted-square tiles.

## Layout

```
┌────────────┬──────────────────────────────────────────┐
│ ▮ Outpost  │                                          │
│ Quick s ⌘K │   Title in Literata                      │
│            │   content                                │
│ Home       │   reading: max 46rem, left aligned       │
│ Search     │   browsing: max 70rem                    │
│ Library    │   map and readers: full bleed            │
│ Maps       │                                          │
│ Notes      │                                          │
│ Explore …  │                                          │
│ Pages      │                                          │
│  ▸ pages   │                                          │
│ ─────────  │                                          │
│ Downloads  │                                          │
│ Storage    │                                          │
│ Settings   │                                          │
│ ▪ Ready    │                                          │
└────────────┴──────────────────────────────────────────┘
        spine: verdigris            pages: white
```

- Desktop: a 16rem spine, collapsible to icons. The quick search field at the top,
  then the screens (the four of the phone's bottom bar first, with Search), then the
  page tree; upkeep and the lamp (one line of status) at the foot. Only the screens and
  the page tree scroll, as one part, with a fade at its foot when there is more below;
  upkeep is always in view. A screen reached from inside another is listed indented
  under it, by name only, behind a chevron that shows or hides the group. Each screen is
  named by its own title.
- Tablet (768 to 1023 px wide): the spine is a rail of icons, and the whole of it opens
  over the page, which dims behind it, when its button is pressed; it closes on the next
  screen or with Escape. Beside the page at that width it left a map 160 px wide.
- Mobile: a spine-coloured top bar and a bottom bar with Home, Library, Maps, Notes
  and More. The More sheet is the sidebar's two parts, each heading's screens folded
  under it until asked for.
- Lists before cards. A card appears only when an item is an object picked from a set
  (a catalogue collection, a map region). Cards are never nested.
- Home is written as sentences and lists, not tiles of numbers.

## Motion

- 120–200ms, ease-out, on state changes only: opening, selecting, confirming. Three
  durations and one easing, as tokens: `--duration-fast` (120 ms, a colour answering the
  pointer), `--duration` (140 ms, the default of every transition, anything opening in
  place), `--duration-slow` (200 ms, something that travels: a sheet, the spine folding).
- A press answers at once: a button darkens and gives a little (98%) with no transition.
- What stands for work under way (a skeleton, a spinner given `delay`) is seen only after
  `--reveal-delay` (300 ms), so that a quick answer shows no flash.
- Progress bars move with real progress. No page-load choreography.
- Under `prefers-reduced-motion`, transitions are instant.
- A loading skeleton holds its room at once, appears after 300 ms, shimmers five times
  (eight seconds) and then holds still.
- On a phone a dialog is a sheet that rises from the foot of the screen, edge to edge.

## Writing

- Name things as people know them: "Library", "Storage", "Downloads".
- A button says what it does: "Download", "Move collection", "Write drive".
- Errors state what happened and what to do. Offline is a normal state, described
  plainly: "No connection. This download will resume when the network is back."
- Empty screens invite the first action.

## Layers

`sticky 10` · `nav 20` · `dropdown 30` · `overlay 40` · `dialog 50` · `popover 55` ·
`toast 60` · `tooltip 70`.

`popover` is for what a press opens and puts at the end of the page: a drop-down's
list, a menu, a popover (`floating` in `components/ui/menu.tsx`). It is above `dialog`
because any of them can be opened from inside one. `dropdown` is for what floats over
the page itself and belongs under a dialog: a list of suggestions, the editor's toolbar.
