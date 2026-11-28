# Maps redesign: bar, map, sheet

The owner chose this model on 24 November 2026 (issue `outpost-9an2`). Part 0 and part 1
(Directions on a phone, commit `62422ff`) are built. The first design document lived in a
session's scratch folder and was lost; this one was rebuilt on 28 November 2026 from part
1's code and the titles of parts 2 to 5, and is the reference from here on. Where it says
"ruling", the rebuild had to decide something the lost document may have said differently.

## The model

A phone screen on Maps is always three things and nothing else:

- **A bar** across the top. While browsing it is the search bar. While a task is in hand
  (Directions, Measure, Draw, a place being edited, Print…) it is that task's bar in the
  spine's colour, with a way out on its leading edge and the task's name or its fields.
- **The map**, with as little on it as possible.
- **A sheet** at the foot. While browsing it is the Maps list. With a thing picked it is
  that thing's card. With a task in hand it is the task's sheet.

Rules that follow, and bind every part:

1. One bar at a time. Search bar on top means the app's bottom bar is there; a task's bar
   on top means the bottom bar is put away (DESIGN.md, Layout).
2. Nothing with suggestions is typed in a sheet. A field that suggests is in the bar, at
   the top, with its rows under it (DESIGN.md, Motion). Plain fields (a name, a note) may
   be in a sheet.
3. One card for every thing. Whatever is picked — on the map, from a list, from search,
   from Nearest, from a link — shows the same kind of card in the sheet's place: its name,
   one line saying what it is, one primary action, at most three more, and Close.
4. A task hides what is not the task: the search, the Tools and Layers buttons, cards of
   other things. Presses on the map belong to the task.
5. Targets are 44 px or more; rows in a sheet's list are 56 px. Everything works at 320 px
   wide and at the largest text size, in both themes. Tokens only.
6. Every state has words: loading, nothing yet, failed.

## Part 2 — browsing (`outpost-5dsr`)

Phone only (`!isDesktop`); wide screens change in part 4.

### The bar
- The search box stays where it is and gains a **Layers** button at its trailing edge,
  outside the field, the same height (icon and the word "Layers"; the word is dropped
  below 360 px wide, the accessible name stays).
- Search results are rows under the bar as now. Ruling: saved places and saved routes
  that match are listed first, nearest to the centre of the map first.

### The map
- The column of tools goes. In its place, top right under the bar: **Where I am**, **North
  up** (only when turned), and a **Tools** button with its name under the icon, where More
  was. While a track is being recorded its card shows as now.
- The readout, scale and credits stay where they are.

### The Layers sheet
Opened by the Layers button; a sheet from the foot (a dialog, per DESIGN.md), full height
available, closing with Done, Escape or a drag down. One scrolling list in this order:
1. **Map style** — the style choices.
2. **Shown on the map** — every `mapTools()` entry with `layer: true` as a switch row with
   its name (hill shading, contours, satellite imagery, road numbers, grids, grey line,
   repeaters, magnetic north…). Unavailable ones say why, as More does now.
3. **Things on the map** — what the Layers tab holds today: heard on the radio,
   satellites, and the reference layers panel with its switches. "Find in the reference
   layers" stays as it is until part 3.
4. A row **Offline maps** leading to what the Offline tab holds today, shown as a page
   inside this sheet with a "← Layers" head.

### The Tools sheet
Opened by the Tools button; same kind of sheet. A list of named 56 px rows, icon then
name then one line saying what it does: every `mapTools()` entry that is not a layer and
not Where I am / North up (Measure a distance, Draw a route, Save a place, Record a track,
Line of sight, Find where you are from bearings, Print or save as PDF), then **Reachable
from here**, **Sun times here** and **Estimated radio range** (acting on the centre of the
map, as the context menu's do on a point). Choosing a row closes the sheet and takes the
tool up exactly as the column did. The More menu component is retired on phones.

### The sheet while browsing: the Maps list
The tab row goes. The lowered sheet's first row keeps the handle, **Nearest** and
**Directions**. Raised, the sheet is one list:
- **Places** with the count ›, **Routes** with the count ›, **Sun** ›.
- Under them, favourite places (starred), nearest first, as rows that open the place's
  card. Nothing starred: nothing shown.
Each of the three rows opens what its tab held, as a page in the sheet with a "← Maps"
head on its first line (the pattern the place form's "← Places" already uses). Layers and
Offline are no longer here; they are behind the Layers button. `?tab=` links keep working:
`places`, `routes` and `sun` open that page; `layers` and `offline` open the Layers sheet
(at Offline maps for `offline`). The stored panel tab is read the same way.

### One card for every thing
New cards, all on `MapCard`, joining the existing chain in `handCard`:
- **A saved place** (pressed on the map, chosen from Places, search, Nearest, a link):
  name with its icon and colour; one line (the note's first line, else coordinates) and
  how far from where the device is or from home; **Directions** (primary), **Edit**,
  **Move**, favourite star, Close. Edit opens today's form. The form no longer opens on a
  press.
- **A saved route (a track)**: name; length and climb if known; **Show all of it**
  (primary), **Details** (today's RouteDetail page), Close.
- **A saved road route**: name; ends and distance; **Plan it again** (primary, into
  Directions), **Details**, Close.
- The found-place card, layer record, repeater, heard and the rest keep their content;
  check each has the same order (name, what it is, primary, others, Close) and fix those
  that differ.
- Nearest stays a dialog for choosing; choosing a row closes it and shows that thing's
  card.

### Directions
- While Directions is in hand on a phone the Tools button and the Layers button are
  hidden; Where I am and North up stay.
- Presses on the map during Directions do not open cards or forms. (Pressing to move the
  cross is part 5.)

### Tests and docs
Unit tests for the Maps list, the Layers and Tools sheets and each new card. E2E: update
every phone spec that used tabs, the column or More to the new places; add a spec walking
bar → Layers → each group, Tools → each tool taken up, each kind of card, at 320 and 390,
both themes, largest text. Rewrite the opening of `docs/maps.md` and the quick start for
the new model; update DESIGN.md's Layout lines if they name the tab row or the column.

## Part 3 — tasks on the bar and sheet (`outpost-yzdg`)

Each of these becomes a task with its own bar (spine colour, ✕ leading, the bottom bar put
away) and its own sheet, built the way Directions was: one hook owning the state, a bar
component, a sheet component.

| Task | Bar | Sheet |
|---|---|---|
| Save a place / edit a place | "Save a place" or the place's name; **Save** trailing | Name, note, colour, icon, the rest behind "More"; Delete for a saved one. Moving it is choosing on the map with the cross. |
| Find a route (online) | A search field with its rows under it; "This map view / Anywhere" | Results as cards; says plainly that it asks the internet. |
| Find in layers | A search field with rows under it, nearest first | The chosen record's card. Reached from the Layers sheet and from the search bar's results as a last row "Find in layers: …". |
| Offline: Where? | "Keep a map of…" with a search field (country, region, town) and rows | The choices now on step 1 (Where the map is now, Home, Draw an area, The whole world, Import a file) and then the existing steps. |
| Measure | "Measure" and the running total | Add centre, Undo, Clear, Save as a route, Check line of sight. |
| Draw a route | The route's name (pressing it renames) and length | Undo, Add centre, Done; details behind a raise. |
| Line of sight | The two ends as rows, like Directions | The answer and the profile. |
| Print | "Print" and the paper size | The print choices; the box on the map. |
| Rename | Anything with a name is renamed by pressing its name in its bar or on its card's Details page: one plain field, Save. |

## Part 4 — iPad and desktop (`outpost-kl3k`)

- An iPad held upright (768 to 1023 px) with a coarse pointer gets the phone's bar, map and
  sheet, the sheet as a 24rem panel at the leading edge rather than across the foot.
- Wider screens keep the side panel. Its head is **Directions**: the From and To fields at
  the panel's head, always there, using `useDirections` (planned as soon as both ends are
  known; the old form and its Plan route button retire). The route is edited in place: the
  result is under the fields, not a second page; stops, way of travelling and options
  change it where it is.
- Under Directions the panel is the Maps list of part 2 (no tab row); Layers and Tools are
  named buttons on the map (icon and word), opening popovers with the same lists as the
  phone's sheets. Every map button has its name beside or under it.

## Part 5 — finishing (`outpost-15yj`)

- **Recent ends**: the last eight ends chosen in Directions, kept on the device, shown in
  the picker before anything is typed, under Where I am and Home; a row can be removed.
- **Rename after save**: Save in Directions keeps its one press; the "Saved as …" line
  gains **Rename**.
- **Back**: opening a task, a card, a page in the sheet or the picker adds a history entry;
  Back (and an edge swipe on iOS) undoes the last of these rather than leaving Maps.
- **Press the map to move the cross**: while choosing on the map, a press moves the map so
  the cross is on the pressed point.
- **Results ranked from the start**: in the picker for To and for stops, saved places and
  found places are ordered by distance from the start once anything is typed (exact name
  matches first).
