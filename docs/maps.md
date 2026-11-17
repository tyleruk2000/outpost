# Offline maps

This page covers downloading map regions and choosing where they are kept, hill
shading and contour lines, printing part of the map as a one-page PDF, where the map
data comes from and how it must be credited, using your own map source, markers, their
icons and moving them, sunrise and sunset, the centre of the map, drawing routes, finding a known route by
name, recording a track as you walk, importing GPX tracks, coordinate formats,
Maidenhead locators, checking line of sight between two points, repeaters on the map,
satellite imagery, and offline place search, with place names and postcodes for Great
Britain from Ordnance Survey.

Outpost draws a vector map in the browser from tiles it serves itself. Once a region
is installed, viewing it needs no internet connection.

**OpenStreetMap's public tile servers are never used.** Map data is downloaded as
regional extracts of a published archive, on request, and then served from your own
disk.

## The Maps screen

The map fills the screen, with a panel beside it (a sheet you can drag up on a phone)
that has four tabs.

- **Places** lists your saved places. **Save a place** drops a pin you can drag; give
  it a name, a note, a colour and an icon (see [Markers](#markers)), and mark it a
  favourite to keep it named on the map.
  A saved place can be moved without opening it (see
  [Moving a saved place](#moving-a-saved-place)).
- **Routes** lists routes you have drawn and GPX tracks you have imported. Open one
  for its distance, ascent and an elevation profile; move along the profile and the
  matching point is shown on the map. **Draw a route** places one point by point (see
  [Drawing a route](#drawing-a-route)). **Find a route** looks a known one up by name
  and adds it (see [Finding a known route](#finding-a-known-route)); it is the one
  thing here that needs the internet. Drop a `.gpx` file anywhere on the map to import
  it.
- **Offline maps** (written **Offline** on the tab, so that the five names fit on one
  line) lists installed regions and is where you download more: pick a
  ready-made region, or draw a box on the map (or use the current view), choose how
  much detail and which storage location it goes to, and see the exact size before
  anything is fetched.
- **Sun** gives sunrise, sunset, twilight and the moon's phase for the centre of the
  map, for any date, with nothing saved and nothing searched for (see
  [Sunrise and sunset](#sunrise-and-sunset)).

On the map itself:

- The **search box** takes a place name, or in Great Britain a postcode (once place
  names are downloaded, see [below](#offline-place-search)), coordinates in any of the formats under
  [Coordinate formats](#coordinate-formats), a British grid reference, or a Maidenhead
  locator.
- The **ruler** measures a path you click out, in kilometres and miles, and gives the
  locators of its two ends. **Save as a route** keeps the measured path as a route;
  **Check line of sight** hands its first and last points to the tool described under
  [Line of sight](#line-of-sight).
- **Record a track** (the ring with a dot in it) records where you walk, on the device
  in your hand (see [Recording a track](#recording-a-track)).
- **Hill shading** appears as a button once terrain is installed.
- **Contour lines** is the button below it (see [Contour lines](#contour-lines)). It
  is always there: pressed where there is nothing to draw them from, it says so.
- **Print or save as PDF** is the button below that (see
  [Printing a map](#printing-a-map)).
- **Maidenhead locator grid**, **Grey line (day and night)**, **Satellite** (see
  [Satellite imagery](#satellite-imagery)) and **Line of sight between two points** are
  the last buttons in the column. See
  [Maidenhead locators](#maidenhead-locators),
  [The grey line](#the-grey-line-day-and-night) and [Line of sight](#line-of-sight).
- **On a phone, every one of these is also in a menu by name**: the button with three
  dots at the end of the search box. The column of icons under it shows as many as
  there is room for (see [On a phone](#on-a-phone)).
- The readout at the bottom shows the centre of the map; choose decimal degrees,
  degrees-minutes-seconds, British National Grid or Maidenhead locator, and copy it.
  With a mouse over the map it gives the pointer's position instead, and says which.
- **A cross always marks the centre of the map**: the point the readout gives while it
  says "Centre", the Sun tab works its times out for, and a route drawn from the
  keyboard puts its next point. With a mouse over the map the readout gives the
  pointer's position and says "Pointer"; the cross stays on the centre. See
  [The centre of the map](#the-centre-of-the-map).
- On a phone, **today's sunrise and sunset** for the centre are written under the
  readout while the sheet is lowered; touch the line for the rest of the day.
- Right-click (or press and hold) for the position and its locator, "Save a place here",
  "Measure from here", "Draw a route from here", "Sun times here" and "Copy coordinates".
- A place, a found position and where you are each have a **Sun** line of their own:
  the same times, for that position.
- The address bar always holds the current view, so a link to it can be saved in a
  note.

Before any region is installed the map shows a plain outline of the world, which
ships with Outpost, and offers the world overview as a first download.

### On a phone

A phone's map is small, and the tools above were each built on a large one. So on a
phone each kind of thing has one place over the map and gives way in a set order, and
nothing lies over anything else:

- **The search box is always across the top.** At its end is a button with three dots,
  **All map tools**: every tool and every layer by name, with a tick beside the ones
  that are on or in hand. An icon cannot say what it is to a finger; the menu can.
- **The tools are also icons in a column under the end of the search box**, in the
  same order as on a wide screen. The column holds as many as fit above whatever is
  below it and stops there, so on a small phone, or with a card up, the last ones are
  in the menu only. There are no zoom buttons: pinch.
- **A card** (the tool in hand, a place that was found, a recording) comes up from just
  above the sheet and takes at most the lower three fifths of the clear part of the
  map. A card with more in it than that scrolls inside itself; its title and its close
  button stay where they are. The map does not move when a card comes up.
- **The centre of the map is two fifths of the way down the clear part of the map**,
  not half way, so that a card never covers it or the cross that marks it, and the map
  does not have to move when a card comes up (see
  [The centre of the map](#the-centre-of-the-map)).
- **The readout and the credits are just above the sheet.** The credits are always
  there. Where there is not room for everything (larger text, a small screen, the sheet
  raised), the coordinates of the centre and the scale bar step aside first, and then
  the line of sun times under them; the coordinates and the sun times are still in the
  Sun tab, and the coordinates of any point under a long press. Where neither fits,
  the cross at the centre is put away with them.
- **A recording's card folds to its one line** when another card comes up, and unfolds
  again from its arrow.
- **With the sheet at its full height** only the search box is left over the map.
- Everything that is pressed is at least 44 px each way.

This was measured, not looked at on a real phone: see
[What was checked on a phone](#what-was-checked-on-a-phone).

### What was checked on a phone

**No real phone was used.** Everything here was measured in Chromium with a phone's
screen size and touch input. It is not Safari, and it is not a hand.

A script walked the Maps screen through each state a person can reach: the sheet
lowered, half raised and at full height; each of the four tabs; a saved place opened
and one being moved; measuring; line of sight; drawing a route; finding a route, with
its preview; recording a track, alone and with another tool; the box of a page to
print; a position that was found, with its sun times open; the locator grid; with no
map regions installed and with one. It did the same for the maps set into the radio
screens. It did this at 320 by 568, 375 by 667, 390 by 844 and 430 by 932 px; with the
text at its usual size, at 125% and at 150% (a root font size of 16, 20 and 24 px);
with and without the 34 px a home indicator takes; in light and dark: 48 set-ups, 40
states in each. In every state it listed each pair of things lying over each other,
each thing cut off or off the screen, each touch target under 44 px, each piece of text
under the smallest size the design sets, and anything that scrolls sideways
(`e2e/tests/layout-audit.ts`).

| | Before | After |
| --- | --- | --- |
| States with nothing lying over anything, nothing cut off, nothing scrolling sideways, and nothing the script could not touch | 188 of 1,918 | 1,670 of 1,920 |
| Pairs of things lying over each other | 30,812 | 180 |
| Things cut off or off the screen | 3,664 | 52 |
| Touch targets under 44 px | 3,470 | 64 |
| Pieces of text under the smallest size | 11,102 | 0 |
| Regions that scroll sideways | 148 | 104 |
| Things the script could not touch because something lay over them | 417 | 46 |

The counts are of occurrences: one overlap seen in 48 set-ups counts 48 times. They
leave out the app's own bars (the top bar and the bar of screens at the bottom), which
are not the Maps screen's, and the links in the line of credits, which are as tall as
the line.

**What remains** is nearly all on screens narrower than Outpost says it works on. It
says from 320 px wide; text enlarged by half on a 320 px phone leaves the room of a
screen 213 px wide. Taking a set-up to be within that when its width divided by the
enlargement is 312 px or more (all four sizes at the usual text size, and 390 and 430
px at 125%), 2 of the 180 overlaps are within it, and none of the things cut off, the
sideways scrolls or the touches that were blocked.

- At 320 by 568 px with a home indicator's 34 px and the usual text size, the card
  that offers a first map reaches the cross at the centre (the 2 overlaps). No phone
  is that size with a home indicator.
- With the text at 125% on a 320 px phone, and at 150% on a 320 or a 375 px one, a
  card has 6rem or all the room there is, whichever is less, and then reaches the
  cross or the pin it is about (the other 178 overlaps). At 150% on 320 by 568 px a
  card has about 100 px: its title and a line or two, the rest by scrolling. The tools
  work there and are cramped. The 46 blocked touches are all in these set-ups: no
  clear map left to touch, or a button of a card below the edge of the card.
- Sideways scroll, all with enlarged text: the panel where a drawn route is named (at
  125% on 320 px, and at 150% on every size); the Offline maps and Sun tabs at 150% on
  320 px, by 7 and 11 px; and the radio screens' own pages and the dialog for a
  station, at 150%. What is too wide in each was not looked into.
- At 150% on 320 by 568 px the buttons at the foot of "Choose on the map" are below
  the screen (the 52 things cut off, with the radio pages above): the dialog every
  screen shares does not scroll as a whole. It was left as it is.
- The close button of that shared dialog is 40 px, at every size (the 64 touch
  targets). The app's small buttons are 40 px on a phone outside the Maps screen.

Not covered: the menu on a long press, the card of a repeater, the card of where you
are, a phone held on its side, the map kept on a phone out of reach of the server, and
browsers older than those that have container queries (Safari before 16), where a card
has no greatest height and behaves as it did before.

`e2e/tests/phone-layout.mobile.spec.ts` runs a short version of the same walk at three
sizes with the rest of the tests.

"Show where I am" and "Record a track" need a secure address, which browsers require
before they share a location. On a plain `http://` LAN address they say so and point to
**Settings → HTTPS on your network** (see
[deployment.md](deployment.md#https-on-your-network)).

## How regions work

A region is a rectangle of the world at a range of zoom levels, saved as one file in
PMTiles format on a storage location (`collections/maps/<name>-<build>.pmtiles`).

You can install as many regions as you like: a coarse one for a whole country, a
detailed one for the hills you walk in, an overview of the world. Outpost serves them
as one continuous map. For each tile it answers from the most detailed installed region
that covers it and has that tile.

Regions are ordinary collections. Moving them to another drive, checking their files
and removing them work as described in [storage.md](storage.md).

## Downloading a region

Downloading needs an internet connection.

### Ready-made regions

Outpost ships a list of 188 ready-made regions (`catalog/map-regions.json`): a world
overview, a region for each country in Natural Earth's 1:110m data (which leaves out
some very small states), parts of Britain and Ireland, and a few mountain ranges. Each
has a recommended maximum zoom: deep for a small area, shallow for a continent. The
world overview goes to zoom 6: countries, cities and main roads.

### Your own box

Any rectangle can be downloaded by giving its west, south, east and north edges in
degrees, a name, and a maximum zoom.

- West must be less than east. An area that crosses the 180° meridian has to be
  downloaded as two regions.
- The map ends at about 85° north and south.

On the Maps screen the box is drawn on the map (**Draw a box**) or taken from the view
(**Use the current view**), and then adjusted by its eight handles:

| Handle | Moves | Pointer or finger | Keyboard |
| --- | --- | --- | --- |
| A square on each corner | The two edges that meet there | Drag it | Tab to it, then any arrow key |
| A bar in the middle of each edge | That edge only; the other three stay put | Drag it | Tab to it, then the arrow keys across the edge (up and down for north and south, left and right for east and west) |

- An arrow key moves a handle 4 pixels on screen; with Shift, 24. Zoom in for finer
  steps.
- Each handle is 44 pixels to touch, whatever its drawn size. An edge too short on
  screen to hold a handle between its corners goes without one until you zoom in; the
  corners still do everything.
- A box made too small, or pushed across the 180° meridian, is refused and the box
  stays as it was.

### Zoom levels

Zoom runs from 0 (the whole world in one tile) to 15. Each level has four times as
many tiles as the one before, so the maximum zoom decides the size.

| Maximum zoom | Roughly what you see |
| --- | --- |
| 6 | Countries, cities, main roads |
| 10 | Towns, most roads |
| 12 | Villages, tracks, larger streams |
| 14 to 15 | Street and path level, the detail for walking |

The vector map can be magnified past the zoom you downloaded; no new detail appears.

### Size estimates

Before a download starts, Outpost asks the source archive which tiles the box contains
and reports the **exact** size, the number of tiles and the number of requests it will
make (`POST /api/maps/estimate`). Nothing is downloaded for an estimate except the
archive's index.

Limits:

- A box of more than about 20 million tile positions is refused; lower the maximum
  zoom or split the area.
- A single region of more than 60 GB is refused.
- The storage location must have room for the region plus a 256 MB reserve.

### Where a download is kept

Every download of map data asks which storage location it goes to: a region, the
terrain that goes with it, and place names.

- Each location is listed with its free space, and the default one is marked.
- A location that is not connected, or that has too little room for this download,
  stays in the list, says why, and cannot be chosen.
- The location is shown again beside the **Download** button, so it is in view at the
  moment of deciding on a phone as well as on a desktop.
- The location the last map download went to is offered first the next time (this is
  remembered in the browser). With only one location, it is still named.
- Terrain is kept in the same location as its map. Both must fit before either starts.

In the API this is `locationId` on `POST /api/maps/regions` and
`POST /api/maps/places/datasets`; without it the default location is used. Location
ids are listed by `GET /api/storage/locations`.

### Terrain

Asking for terrain (`includeTerrain: true` in the API) downloads a second file for the
same box: elevation tiles, used for hill shading, for contour lines and for the heights
of routes you draw. Terrain stops at zoom 12 whatever maximum you chose. Both files
must fit before either download starts.

Terrain is optional. Without it the map is flat, with no contour lines, and a drawn
route has no heights.

### While it downloads

A region is fetched by the same download manager as everything else: it appears under
**Downloads**, can be paused and resumed, survives a restart, and continues from where
it stopped. If the day's map build is withdrawn before a download finishes, Outpost
starts that download again from the newest build and says so.

## Contour lines

**Contour lines are drawn on your device from the terrain you have already
downloaded.** There is no contour download, no tile server and no request to the
internet: the browser reads the same elevation tiles that shade the hills, traces
lines of equal height through them, and draws those. Switch them on with the
**Contour lines** button under **Hill shading**; the choice is remembered in the
browser, like the other map preferences. They work with hill shading on or off.

The height between lines follows the zoom, in metres:

| Zoom | Every line | Index line (heavier, with its height written on it) |
| --- | --- | --- |
| Below 9 | none | none |
| 9 | 200 m | 1,000 m |
| 10 | 100 m | 500 m |
| 11 and 12 | 50 m | 250 m |
| 13 and 14 | 20 m | 100 m |
| 15 and closer | 10 m | 50 m |

- Heights are in metres above sea level, written on index lines as "450 m".
- The line at sea level is left out: the coast is already drawn, from better data.
- Lines stop at the edge of the terrain you have. Pressed where there is none, the
  button says so and offers **Offline maps**; pressed with the map too far out, it says
  to zoom in. With no terrain on the device at all it stays off and says what to
  download.
- **They are only as fine as the terrain.** Terrain stops at zoom 12, a grid with cells
  some 10 m or more across, so a 10 m line is an interpolation between those cells. It
  shows the shape of a hillside well; it does not show a crag, a small knoll or a
  narrow gully, and it is not a surveyed contour. Do not rely on it where a few metres
  matter.
- Tracing happens in a background worker, so the map stays responsive. The worker is
  started for the first tile and ended a minute after the last, so a map at rest holds
  none. The first look at a new area takes a moment longer than hill shading does.
- A browser needs `OffscreenCanvas` in workers for this (every current browser; Safari
  from 16.4). In one that lacks it the button says contour lines cannot be drawn.

The tracing is done by [maplibre-contour](https://github.com/onthegomap/maplibre-contour)
(BSD-3-Clause), built into Outpost and served from it like the rest of the app.

## Printing a map

**Print or save as PDF** makes a paper map of part of the map: one page, with a title,
the date, scale bars, north, latitude and longitude round the edge, and the credits.
It is made on your device from the maps already installed. Nothing is fetched from the
internet and nothing is sent to the Outpost server; the file exists only in the browser
until you save or share it.

### Making a page

1. Press **Print or save as PDF** in the column of map tools. A box appears on the map:
   **the box is the page.** It is the same box, with the same handles and keys, as the
   one for [downloading a region](#your-own-box), but it keeps the shape of the paper
   as you drag it. **Centre the box here** moves it to the middle of the map.
2. Choose the paper (A4, A3 or US Letter), which way up, and the scale: **Fit the box**
   takes whatever scale your box comes to, rounded to three figures, or pick 1:10,000,
   1:25,000, 1:50,000, 1:100,000 or 1:250,000 and the box takes that size.
3. **Preview the page** shows the sheet as it will be made. Give it a title, and tick
   what goes on the map:

   | | Starts ticked when | Notes |
   | --- | --- | --- |
   | Names of places, roads and water | always | Unticked, the map is drawn without lettering, for writing on. |
   | Contour lines | the map on screen shows them | Need terrain for the area; not drawn at scales smaller than about 1:420,000 (the figure depends on latitude). |
   | Hill shading | the map on screen shows it | Needs terrain for the area. |
   | Routes and tracks | any route showing on the map crosses the page | Each route that crosses the page can be ticked by itself. |
   | Saved places | any are on the page | Favourites are named; the others are named when the page is at zoom 9 or closer, as on screen. |
   | Lines of latitude and longitude | never | The figures round the edge are printed either way; this draws the lines across the map as well. |
   | Maidenhead grid squares | the grid is switched on for the map on screen | Fields, squares, subsquares or extended squares as the scale allows, each with its locator, as on screen. |

4. **Make the PDF**, then **Save the PDF**, **Share** (where the browser can share
   files, which needs HTTPS) or **Print**. The file is named after the title:
   “Helvellyn from Glenridding” becomes `helvellyn-from-glenridding.pdf`.

The map on each paper, inside a 10 mm margin and above the strip of lettering:

| Paper | Map | At 1:25,000 | At 1:50,000 |
| --- | --- | --- | --- |
| A4 portrait | 190 × 251 mm | 4.7 × 6.3 km | 9.5 × 12.6 km |
| A4 landscape | 277 × 164 mm | 6.9 × 4.1 km | 13.8 × 8.2 km |
| A3 portrait | 277 × 374 mm | 6.9 × 9.4 km | 13.8 × 18.7 km |
| A3 landscape | 400 × 251 mm | 10.0 × 6.3 km | 20.0 × 12.6 km |
| US Letter portrait | 196 × 234 mm | 4.9 × 5.8 km | 9.8 × 11.7 km |
| US Letter landscape | 259 × 170 mm | 6.5 × 4.3 km | 13.0 × 8.5 km |

### Scale, and how far to trust it

- **Print at 100% ("actual size"), not "fit to page".** The PDF's page is the size of
  the paper and the map is placed on it at its true size, so at 100% the scale holds.
  The file asks the print dialogue to start at 100%, but a reader may ignore that. The
  page says how long its scale bar should be ("the 1 km bar is 40 mm long"): measure
  it once. The scale bars themselves stay right however the page is scaled.
- **The stated scale is exact along the middle of the sheet only.** The map is in the
  Web Mercator projection, which stretches towards the poles: at latitude φ the scale
  is the stated one × cos φ ÷ cos φ₀, where φ₀ is the latitude of the middle of the
  sheet. The page prints the scale along its top and bottom edges. On A4 at 1:25,000
  at 54.5°N that is 1:24,983 and 1:25,017, a difference of 0.07%; on a sheet from 50°N
  to 60°N it is up to 13%, and a ruler is no use on such a sheet away from its middle.
- **The ground is measured on a sphere**, as the scale bar and the measuring tool on
  screen measure it. On the real, slightly flattened Earth, east–west and north–south
  distances differ from that by up to 0.7%. Together with the point above: good to
  about 1% on a walking map, which is under a millimetre across a scale bar.
- **North.** True north is straight up everywhere on the sheet: in this projection
  every meridian is a vertical line. Magnetic north is not shown, because Outpost has
  no model of it; set a compass's declination from another source.
- The figures round the edge are latitude and longitude, in decimal degrees or in
  degrees, minutes and seconds, following the format chosen for the readout on the
  map. Opposite ticks are the two ends of one line, so a ruler laid between them gives
  a position anywhere on the sheet. British National Grid lines are not drawn: they do
  not run straight on this projection.
- The arithmetic is checked against values worked out by hand
  (`apps/web/src/features/maps/print/scale.test.ts`), and an end-to-end test prints a
  test map holding a lake exactly 1,000 m wide and measures it in the PDF: 472 pixels
  at 300 to the inch, as 40 mm should be.

### Print quality, and what a device can draw

The map is drawn off screen with 2.5 device pixels to each pixel of the map's own
layout, which is **300 dots to the inch** of paper; names and line widths are laid out
as on screen and drawn larger, at 120 of the map's pixels to the inch, so a 12.5 pixel
name is 7.5 point type. **Draft** is 150 dots to the inch: quicker, and about a
quarter of the size. Nothing is captured until MapLibre reports the view complete:
every tile arrived and laid out (with the glyphs and icons its names need), every name
placed, nothing left to redraw. A tile that fails to load stops the page with a
message instead of leaving a hole.

A browser limits how large a canvas may be, and the limits were looked up on
16 November 2026:

- **iPhone and iPad.** WebKit allows a canvas of at most 4,096 × 4,096 pixels in area
  on iOS, raised to 8,192 × 8,192 by a change made in March 2024; a canvas over the
  limit does not fail, it stays blank. Sources: `maxCanvasArea()` in WebKit's
  `Source/WebCore/html/CanvasBase.cpp`, [WebKit bug 271002](https://bugs.webkit.org/show_bug.cgi?id=271002),
  and "Maximum canvas size" on [MDN's page for the canvas element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas).
  iOS also limits the memory of all canvases on a page together, by an amount that is
  not documented ([WebKit bug 195325](https://bugs.webkit.org/show_bug.cgi?id=195325)
  has reports of 224 MB to 384 MB).
- **MapLibre** keeps its own canvas within 4,096 × 4,096 unless told otherwise, and
  quietly draws at a lower resolution when asked for more.

So Outpost never asks for a canvas over 4,096 pixels on a side or 16.8 million in
area, and on a phone or tablet (a device whose main pointer is a finger) keeps each to
about 4.2 million. A page that does not fit is **drawn in pieces** set side by side in
the PDF: each piece is drawn 128 pixels larger than it is used where it meets another,
so that a name lying across the join is laid out the same way in both pieces. A4 and
US Letter at 300 dots to the inch are one piece on a computer and two on a phone; A3 is
two on a computer and six on a phone. If a device loses its graphics context or hands
back a blank picture all the same, smaller pieces are tried, and only if no arrangement
of pieces fits is the resolution lowered. **You are told** beside the finished file
when it was drawn in pieces or at a lower resolution than asked for.

### What is installed, and what is not

A page at 1:25,000 is drawn from zoom 13 tiles. The preview says, before anything is
made, when the installed maps do not hold the page at the zoom it needs: how much of
it will show only the outline of the world, and how much will be drawn from a coarser
region (still crisp, but with simpler outlines and fewer paths and names), with the
zoom that region goes to. It is a warning, not a refusal, and it is worked out from
the boxes of the installed regions. Terrain for only part of the page is said too.

### What is in the file

- One page (PDF 1.6), its size the paper's: 595.28 × 841.89 points for A4.
- The map as one JPEG picture, or several where it was drawn in pieces. The map is a
  picture, not shapes: it cannot be enlarged past its resolution.
- Everything round the map as real text and lines: the title, date, scale, notes,
  graticule figures and credits can be selected and searched, and are sharp at any
  size. They are set in Helvetica, which every PDF reader supplies, so no font is
  carried in the file. Helvetica as a PDF addresses it has western European letters
  only; a title with other letters in it (Polish, Greek, Cyrillic, Chinese) is put in
  the file as a small picture instead, and the dialog says so.
- **Words that say what the map shows**, as text laid over the map that is in the file
  and drawn in no ink (PDF text rendering mode 3, the way a scanned page carries the
  text read from it). The map is a picture, and a picture cannot be searched; these
  sentences can. They give the title, how much ground the page covers and where (its
  centre, its corners, the Maidenhead locator), the scale and paper, the day, the saved
  places and routes that were ticked for the page, and the names that were drawn on the
  map: those the map gave room to, as its data spells them, at most 250. A name in a
  script Helvetica cannot write is left out and counted, never written as "?". A reader
  that speaks the page says them; selecting all the text of the page picks them up.
  `apps/web/src/features/maps/print/map-words.ts`.
- **No name is cut by the edge of the map.** A name that would cross the border is
  left out, as it would be if another name were in its way.
- **The credits**, exactly those the map on screen shows for what is drawn (so terrain
  is credited when contour lines or hill shading are on the page), each followed by
  the address to look it up at: for example “Protomaps © OpenStreetMap,
  openstreetmap.org/copyright”. The OpenStreetMap Foundation's
  [attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
  ask for that address to be printed on a printed map, beside the map.

The file is written by Outpost's own small PDF writer
(`apps/web/src/features/maps/print/pdf.ts`), not a library: a page of one or a few
JPEG pictures and some text needs eight kinds of object, and JPEG data goes into a PDF
as it stands.

### Saving, sharing, and adding the page to the library

Once the page is made, the dialog offers what every PDF made in Outpost offers
([library.md](library.md)):

- **Save as PDF**: a link to the file.
- **Add to library**: sends the file to this Outpost's library, where it is filed under
  "Made in Outpost" as "Map, *title*, 1:25,000, *date*" (by the centre of the page when
  it has no title), read for search and kept in backups. Its source records the map
  address of the same ground, and the document's page links back to it. Because of the
  words above, a search for a place on the map finds the map. On a phone this is the
  way that does not depend on the phone saving a file, and from the Home Screen it is
  the main button.
- **Share**, where the device has a share sheet that takes files.

A page is a few megabytes at 300 dots to the inch. It is sent with a progress bar and a
**Stop**, and if the storage location is full or not connected the dialog says so and
keeps the file to save or to try again with. Nothing is sent until **Add to library**
is pressed: making the page still asks the server only for map data.

The file carries the day printed on the page, not the moment it was made, so the same
page made twice in a day (the same ground, scale, paper, title and layers, from the same
installed maps) is the same file, and adding it again says it is already in the library.
Made on another day it carries another date and is another document.

### The browser's own Print

While the page is open, the browser's Print (Ctrl or ⌘ P, or the **Print** button once
the PDF is made) prints the sheet alone, at the size of the paper chosen. Before the
PDF is made the map in it is the preview's, at 120 dots to the inch; after, it is the
full-resolution one. The PDF is the dependable way: a browser adds its own margins and
headers unless told not to, and not every browser honours a page size set by a page.
A phone's browser does not always print from a button at all. The **Print** button is
left out where the browser has no print, and says to save the PDF and print that when a
press is followed by no sign of printing
([encryption.md](encryption.md#printing-from-a-phone) has what is known about each
browser).

### Limits, and what has not been tried

- **Not printed on paper.** No page from this was put through a printer; the scale was
  checked in the file, where the map is 40 mm to the kilometre at 1:25,000 by its own
  page size and by measurement of the picture.
- **Not tried on an iPhone, an iPad or any Safari.** It was built and tested in
  Chromium, on a computer and with a phone's screen size and touch input. The canvas
  limits above come from WebKit's source and bug tracker, not from a device.
- Read back with pdf.js (the document library's reader), Poppler and macOS's own PDF
  code. Poppler drew the bold lines (title and scale) in a regular weight on the
  machine used; the other two drew them bold.
- The area cannot cross the 180° meridian, and the map ends at about 85° north and
  south, as for a downloaded region.
- One page. There is no atlas of several sheets.
- A paper map is fixed on the day it is made, and is only as good as the map installed
  and, for contour lines, the terrain: see [Contour lines](#contour-lines) for what
  they do not show.

### Adding to what can be printed (for developers)

What can be ticked is a list, `PRINT_OVERLAYS` in
`apps/web/src/features/maps/print/overlays.ts`. An entry has a name, says whether it
starts ticked, and has an `apply` that switches it on in the off-screen map by adding
a source and layers to a draft of its style. The file's first comment is the
contract.

## Reference layers

The **Layers** tab draws published data over the map: boundaries, populated places,
airports, publicly mapped military sites and nuclear facilities, hospitals and
emergency services, shelters, emergency planning zones, population density and
historical records, each downloaded by country or imported, each record with its source,
dates, licence and accuracy, and its class told by its mark. Reference data is managed
under **Offline maps → Reference data for the map**. The whole of it, the sources and
their terms, the data model and what was measured, is in
[reference-layers.md](reference-layers.md).

## Where the data comes from

| Data | Source | Licence | Credit shown |
| --- | --- | --- | --- |
| Map tiles | The [Protomaps](https://protomaps.com) daily planet build, made from [OpenStreetMap](https://www.openstreetmap.org/copyright) data | ODbL 1.0 | "Protomaps © OpenStreetMap" |
| Terrain | The [Mapterhorn](https://mapterhorn.com/attribution) planet archive | Various open licences; see mapterhorn.com/attribution | "© Mapterhorn" |
| Place names | [GeoNames](https://www.geonames.org) | CC BY 4.0 | "Place names: GeoNames (CC BY 4.0)" |
| Place names, roads and postcodes of Great Britain | Ordnance Survey's [OS Open Names](https://docs.os.uk/os-downloads/products/addresses-and-names-portfolio/os-open-names) | Open Government Licence v3.0 | The statement in the edition's own licence file, "Contains OS data © Crown Copyright and database rights 2026", and "OGL v3.0" |
| A simple world outline drawn beneath the map, and the boxes of the country presets | Natural Earth 1:110m | Public domain | "Natural Earth" |
| Map style | Protomaps basemap styles | BSD-3-Clause | |
| Map label fonts | Noto Sans | SIL Open Font License 1.1 | |
| Contour lines | Traced on your device from the terrain above, by maplibre-contour (code, BSD-3-Clause) | As the terrain | "© Mapterhorn" |
| Routes found with **Find a route** | [OpenStreetMap](https://www.openstreetmap.org/copyright), asked through an Overpass API server | ODbL 1.0 | "Routes: © OpenStreetMap contributors" |

The first three are downloaded by you, on request, and a found route is fetched when
you choose it. The outline, style, fonts, map
icons and the code that traces contour lines are bundled with Outpost. The terrain
credit is shown while hill shading or contour lines are on.

### Attribution you must keep

OpenStreetMap data is licensed under the Open Database Licence, GeoNames under CC BY
4.0, and OS Open Names under the Open Government Licence, which asks for Ordnance
Survey's attribution statement with the year of the data. All three require credit
wherever the data is shown.

- Outpost supplies the credits with the map sources (`GET /api/maps/sources`,
  fields `attribution` and `attributions`) for the map's attribution control. Do not
  hide or remove them.
- A page made with **Print or save as PDF** carries the credits itself, with the
  address for each written out (see [Printing a map](#printing-a-map)). Do not crop
  them off.
- If you publish screenshots or maps printed some other way, include "© OpenStreetMap
  contributors" and, where terrain or place names appear, the Mapterhorn, GeoNames and
  Ordnance Survey credits.
- An imported archive that Outpost did not download is shown with the usual credit.
  If it comes from somewhere else, you are responsible for crediting it correctly.

## Using your own map source

By default Outpost looks up the newest Protomaps daily build each time you ask for an
estimate or a download. Builds are published daily and kept for about a week, so no
address is fixed in the code.

The `maps.tileSource` setting replaces that with an address of your choice: a mirror,
or an archive you host. Any PMTiles archive that uses the Protomaps basemap schema
works, served by anything that supports HTTP range requests.

```bash
curl -X PATCH "http://localhost:8080/api/settings" \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"maps.tileSource": "https://maps.example.net/planet.pmtiles"}'
```

- Set it back to `""` to follow the newest daily build again.
- `maps.terrainSource` does the same for terrain. Its default is
  `https://download.mapterhorn.com/planet.pmtiles`.
- If your archive is on a private address (your own network), the server must be
  started with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.

This matters for the long term: new downloads depend on the source staying available.
Regions you have already installed do not.

## Importing a `.pmtiles` file you already have

If you have a PMTiles archive (made with the `pmtiles` tool, for example), copy it
onto a storage location and register it. Nothing is copied or changed.

```bash
curl -X POST "http://localhost:8080/api/maps/import" \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"locationId": "<location id>", "relPath": "collections/maps/my-region.pmtiles", "name": "My region"}'
```

- The file name must end in `.pmtiles`. Outpost reads the archive's header for its
  bounds and zoom range.
- A vector archive must contain vector tiles in the Protomaps basemap schema to be
  drawn properly. An archive of image tiles is refused as a map.
- Elevation data in Terrarium encoding, as WebP or PNG tiles, can be imported as
  terrain by adding `"tileType": "terrain"`.
- Location ids are listed by `GET /api/storage/locations`.

## Markers

A marker is a named point with an optional note, one of seven colours (teal, amber,
red, green, blue, violet, slate), one of sixteen icons, a favourite flag, and optionally
a link to one of your note pages. Markers are found by the app-wide search.

### Icons

| Icon | Meant for | Written to GPX as |
| --- | --- | --- |
| Pin | Anything. The plain dot: what a place is until an icon is chosen, and what every place was before there were icons | no symbol |
| Home | Home, a base | `Residence` |
| Shelter or hut | A bothy, a mountain hut, an open shelter | `Lodge` |
| Camp | A place to pitch | `Campground` |
| Car park | Where the car is left | `Parking Area` |
| Water | A spring, a tap, a stream to fill up at | `Drinking Water` |
| Food | A shop, a pub, a cache of food | `Restaurant` |
| First aid | A first-aid box, a doctor, a hospital | `Medical Facility` |
| Fuel | A filling station, a fuel store | `Gas Station` |
| Summit | A top | `Summit` |
| Viewpoint | Somewhere to look from | `Scenic Area` |
| Radio mast | A mast, a repeater site | `Tall Tower` |
| Meeting point | Where to meet | no symbol |
| Danger | Somewhere to keep away from | `Danger Area` |
| Star | Anything worth a star | no symbol |
| Flag | Anything worth a flag | `Flag, Blue` |

- **Choosing one.** The place editor has the icons under the colours, each drawn on the
  colour chosen. The chosen one has a ring and its name is written under the set. With
  the keyboard, Tab reaches the set and the arrow keys move through it; each icon is
  named for a screen reader. On a phone each is 44 px to touch.
- **Where it shows.** On the map, in the list of places (and its name is read out after
  the place's), on the heading of an opened place, on the pin while the place is being
  edited or moved, in the results of the map's own search box, on a printed map, and in
  the map kept on a phone. The search across everything shows every saved place with
  the same pin, as before: its index does not hold the icon.
- **On the map** a place with an icon is a disc of its colour, 22 px across inside a
  ring of the page colour, with the icon on it in white (near-black on amber, where
  white is too faint). The icon is about 15 px across. It is drawn the same on the
  light and the dark map and over hill shading, because the disc is its own
  background. A plain pin is the dot it always was.
- **Where places crowd together** an icon is drawn only where it does not lie over
  another: the other place stays a dot of its colour until the map is zoomed in far
  enough for both. Room is given in this order: a favourite's name and icon first (a
  favourite's icon is always drawn whole), then the icons of other places, then their
  names. So a name never hides an icon, and nothing hides a favourite. This is what
  keeps a map with thousands of places nearly as light as it was; see below.
- **Names** are written by the rules there were before: a favourite at every zoom, any
  other place from zoom 9, where there is room.
- **The drawings** are part of the app (`apps/web/src/features/maps/lib/place-icons.ts`):
  a few strokes each, in the line style of the icons the rest of the interface uses,
  drawn for this size rather than taken from that set. The map is handed them as small
  pictures made in the browser when it first asks for one (`map/place-images.ts`,
  through MapLibre's resolver for images a style names and the map does not have).
  Nothing is fetched and nothing is added to the map assets.
- **Existing places** are plain pins. The database gains two columns
  (`0013_place_icons`), and nothing else about a place changes.

**How heavy it is, measured.** 5,000 places in an area 60 km by 45 km, all in view at
zoom 9.2, on a 412 × 839 screen at 2.6 device pixels each, in headless Chromium on a
Mac (16 November 2026). The map was dragged for 90 steps and zoomed in and out by 24
notches while the time between frames was recorded. Headless Chromium on that machine
is far slower than a phone; what the figures are good for is the comparison.

| 5,000 places | Dragging: median time between frames (worst) | Zooming: median (worst) |
| --- | --- | --- |
| All plain pins, which is the map as it was | 50 ms (67), 33 ms (83) | 33 ms (67), 33 ms (117) |
| Every place with an icon (13 icons, 7 colours) | 50 ms (67), 50 ms (83) | 50 ms (67), 50 ms (67) |

Two runs of each, taken in turn. Frames come 17 ms apart, so the figures move in steps
of that: **with an icon on every one of 5,000 places in view the map is about one frame
slower between frames than with plain pins**, and its worst frame is no worse. Smaller
numbers of places were not measured. Other work on the machine moved these figures by
more than that from one run to the next (one pair of runs, taken while it was busy,
gave 200 ms for plain pins and 100 ms with icons). Drawing every
icon whatever lay under it, which was tried first, measured 83 and 117 ms dragging
against 50 and 67 ms for plain pins in the same runs, and was dropped for that.

Not measured: a real phone.

### Icons and GPX

GPX has no list of symbols: a waypoint's `<sym>` is free text, and each program writes
its own names. The nearest thing to a common vocabulary is Garmin's, so those are the
names Outpost writes, where there is an obvious one (the table above). **Every name was
checked against the table of Garmin symbol names in GPSBabel**
([`garmin_icon_tables.h`](https://github.com/GPSBabel/gpsbabel/blob/master/garmin_icon_tables.h),
read on 16 November 2026), and none is written that was not found there. Only the
names are used.

- **Export.** A place is written with the symbol for its icon. A plain pin, a meeting
  point and a star have no obvious Garmin symbol and are written with no `<sym>`, which
  every program reads as its own default.
- **Import.** When waypoints are saved as places, a symbol Outpost knows becomes its
  icon: the names in the table, and also `Lodging` (shelter or hut), `Water Source`
  (water), `Fast Food` (food), `Short Tower` and `Radio Beacon` (radio mast), `Skull
  and Crossbones` (danger), and `Flag`, `Flag, Red` and `Flag, Green` (flag). Capitals
  and spacing are not held against a file. Any other symbol, and none, is a plain pin.
- **Nothing is lost on a round trip.** The symbol a place had in the file it came from
  is kept, word for word, and written again on export for as long as the place's icon
  is the one that symbol was read as: `Geocache` goes out as `Geocache` on a plain pin,
  and `Lodging` as `Lodging`, not `Lodge`. Once you give the place another icon, the
  file says what the map shows.
- **What a round trip through another Outpost cannot carry.** A meeting point and a
  star are written with no symbol, so they arrive as plain pins. The colour and the
  favourite flag are not part of GPX either.
- The limit of 5,000 waypoints saved as places from one file is unchanged.
- **Not tried:** opening an exported file in Garmin's own programs or on a Garmin unit.

### Icons elsewhere

- **Printing.** A printed map draws saved places with the same layers as the screen, so
  places have their icons, on the light map's colours. The pictures are drawn at four
  device pixels to the map's pixel, which is more than the 300 dots per inch a page is
  made at.
- **A map kept on a phone.** The kept copy of your places is the server's own answer,
  so it carries the icon. A copy kept before this version has none and is shown with
  plain pins until it is kept again.
- **Portable drives.** A drive's database is a copy of the home one, so it has the
  icons. Brought back, an icon given on the drive comes home with the place, as does
  the symbol a place had in a GPX file. A drive written by an Outpost from before there
  were icons is still read place for place: a plain pin has the fingerprint it had
  then, so nothing is listed that did not change, and bringing a change home from such
  a drive leaves the icons home has alone.
- **Backups** are the whole database, so they hold the icons. **Erase everything**
  removes places one at a time through the same service as before, icon and all.

### Moving a saved place

A saved place can be moved straight from the map, without opening it. **Nothing is
kept until you choose "Save new position"**, and a move that has been saved can be
undone from the message that confirms it.

| To | Pointer or finger | Keyboard |
| --- | --- | --- |
| Start moving a place | Press and hold it on the map for half a second, then drag; or right-click it and choose **Move**; or the move button beside it in the Places list | The move button beside it in the Places list |
| Move the pin | Drag it, as often as you like | The arrow keys while the pin has the keyboard (it does as soon as the move starts): 4 pixels a press, 24 with Shift |
| Keep the new position | **Save new position** | Enter on the pin, or **Save new position** |
| Put it back | **Cancel**, or the × on the card | Escape |

- A drag that merely starts on a place moves the map, as anywhere else. Only a press
  held still picks a place up, so one is not moved by accident while panning, with a
  finger or a mouse.
- While a place is being moved it is shown as a pin, and a card over the map says how
  far it now is from where it is saved.
- Places cannot be picked up while you are drawing a route, measuring, or have another
  place open: finish that first.
- Opening a place still works as before, and its pin can be dragged or moved with the
  arrow keys in the same way; **Save changes** keeps the new position.

## Sunrise and sunset

**Sun times are worked out on your device from the position and the date.** Nothing is
looked up and nothing needs a connection.

**On a phone, today's sunrise and sunset are on the screen as soon as Maps opens**: a
line under the coordinates of the centre, just above the lowered sheet ("Sunrise 04:43
Sunset 21:21"). Touch it and the Sun tab opens with the rest of the day. Nothing has to
be found first. The line steps aside while the sheet is raised, when the tab itself is
in view, and while a card is up over the map (a tool in use, a point that was found),
which needs the room.

The **Sun** tab of the panel gives the whole day for **the centre of the map**: the
same point the readout at the bottom of the map gives, and the one the cross on the map
marks (see [The centre of the map](#the-centre-of-the-map)). Move the map and the times
follow, once it has come to rest. Nothing has to be saved, searched for, or pressed and
held. Left open past midnight, the tab and the line under the coordinates move on to
the new day by themselves. An empty Places tab says so too, with a button that opens the Sun tab, for
someone who looks for sun times among their places.

The times are laid out to be read on a phone held at arm's length:

- **Sunrise and sunset**, side by side at the top, in figures 34 px high, under the day
  they are for ("Today, Sunday 21 June").
- **First light and last light** under them, at 23 px.
- The date, with an arrow either side to step a day.
- Then, quieter, a list: solar noon and the height of the sun then, the bearings the
  sun rises and sets towards, the length of the day, nautical twilight, and the moon.

"am" and "pm", "UTC", and the date of a time that falls on another day are set small
beside or under the figures, so the figures stay large at 320 px wide. A day with no
sunrise or sunset is said in words at reading size. Where the text is too large for
two times side by side they go one under the other; nothing is cut off.

### Sun times on paper

Under the times, in the Sun tab and in the Sun section of a saved place or a found
point, **A PDF of sun times, day by day** opens a sheet to print and carry: **2 weeks**
from the day shown (the usual), the **Month** it is in, or the **Year** (one table that
runs over six pages of A4). Each day is a line: first light, sunrise, solar noon,
sunset, last light and the length of the day. The sheet names the place (a saved
place's name, or the position as the screen writes it, with the decimal position and
the Maidenhead locator), the days, and the clock: the device's time zone with its offset
(and the day it changes, as at the start of summer time) on the 12-hour or 24-hour clock
chosen in Settings, or UTC on the 24-hour clock, as the screen shows. Every time comes
from the code the screen uses, so the two agree to the minute
(`apps/web/src/features/maps/lib/sun-document.test.ts` compares them for five places,
six dates and three clocks). A day without a sunrise, a sunset or a night says so in a
word, explained under the table, with what the times assume: a flat horizon at sea
level and the usual refraction, that hills make sunrise later and sunset earlier, and
the accuracy of the method. The choice of span is kept on the device
(`outpost.maps.sun.span`); the paper is the same choice as every other sheet.

The three actions every PDF made in Outpost has: **Save as PDF**, **Add to library**
(filed as "Sun times, Helvellyn, November 2026", tag `Sun times`, its source leading
back to the same ground on the map), and **Share** where the device can. The file is
dated by the day it is made, so the same sheet made twice in a day is the same file.

### The centre of the map

**On a phone, the centre of the map is in the part of the map you can see**, not the
middle of the map's rectangle. The camera keeps clear of what lies over the map: the
search box, and the sheet with the readout and the credits above it. What is left is
the clear part of the map, and the centre is two fifths of the way down it: a little
above its middle, so that a card coming up from the foot of the map (which may take the
lower three fifths) never covers the centre, and the map does not move when one does.
The space the search box and the readout take is measured, so this holds with larger
text too. When the sheet is raised or lowered, the same point on the ground stays the
centre and the map slides to keep it in view. On a wide screen nothing lies over the
middle of the map, and the centre is the middle of it until the map flies to a place or
a search result, or is fitted to a route, which lands a little to the left to keep
clear of the column of controls; the centre is there from then on.

A fit (opening a route, the box of a page to print) used to count that room for the
controls twice on a wide screen once the map had flown anywhere, and landed 28 px left
of where a fly lands. It counts it once now.

**A cross marks it**, on any size of screen, whenever something on screen is reading
the centre:

- the readout at the bottom of the map, while it says "Centre". On a laptop the readout
  gives the pointer's position while the pointer is over the map, and says "Pointer";
  the cross is put away for as long as it does, so it is never taken for the point the
  readout is giving;
- the Sun tab, which says "Sun at the centre of the map" and gives the coordinates it
  is using. While it is open the cross stays whatever the pointer is doing;
- a route being drawn from the keyboard, where the centre is where the next point goes.

The cross is put where the map itself says its centre is, so the mark, the readout and
the Sun tab cannot disagree. Before this, the centre drifted from the middle of the
screen after the map had flown to a search result or a place (by 28 px on a laptop and
53 px on a phone), and the cross a phone drew in the middle of the screen was then not
on the point the readout gave.

The Sun tab also has a part headed **Where you are**. Where the browser will share the
device's position it offers **Show where I am**, which moves the map there, so that the
times are then for where you are. Over a plain `http://` address a browser refuses, and
the tab says so in that place, with a link to **Settings → HTTPS on your network**;
until that is set up, move the map until its centre is where you are.

A **Sun** line is also part of:

- a saved place when it is opened, and a new one while it is being saved. It sits
  straight under the place's name, so that on a phone it is on screen as soon as the
  place is opened; opening it there raises the sheet to make room, and **Save** stays
  where it was;
- the card of a position that was found: a search result, typed coordinates, a grid
  reference;
- any point on the map: right-click it (or press and hold) and choose **Sun times
  here**, which drops a pin there with its sun times open. The menu stays when the
  finger is lifted. (Pressing and holding was tried with touches made by a test
  browser, in which the map times the press itself, as it has to on an iPhone. It was
  not tried on a real phone.);
- where you are: while **Show where I am** is following the device (which needs
  HTTPS, as above), a card gives its position, how closely the device claims to know
  it, and its sun times. The card can be put away; it comes back the next time the
  position is asked for.

Folded, it is one line with the day's sunrise and sunset, at reading size. Opened, it
is laid out as the Sun tab is, and shows:

| Row | What it is |
| --- | --- |
| First light, last light | The start and end of civil twilight: the centre of the sun 6° below the horizon. In clear weather there is enough light to see by between them. |
| Sunrise, sunset | The upper edge of the sun on the horizon. |
| Solar noon | The sun at its highest, due south or due north, and how high its centre is then. |
| Rises towards, sets towards | The true bearing of the point on the horizon where the sun rises and where it sets, written as the ruler writes bearings ("49° NE"). From true north, not magnetic north. |
| Day length | Sunrise to sunset, and how much longer or shorter that is than the day before. |
| Nautical twilight | The sun less than 12° below the horizon. |
| Moon | The phase by name and the percentage of the face that is lit, at the place's solar noon. |

It opens on today's date as this device has it. The date can be typed or picked, the
arrows beside it step a day either way, and **Today** comes back. Dates from 1900 to
2100 are taken. Whether the section was left open, and which clock was chosen, are
remembered in the browser.

**On a phone: what was checked, and what was not.** The sheet's four names, the line
under the readout and the two large times were checked in Chromium at 320, 375 and 390
px wide; with the text enlarged (the root font size at 20 and 24 px, where the names
take a second line rather than run off the edge); and with the 34 px inset at the
bottom of the screen that a phone with a home indicator reports, which the Maps screen
now leaves room for. Where the text is so large that the coordinates and the line of
sun times do not both fit over the map, the line stays and the coordinates step aside.
**None of this was
tried on a real iPhone**, in Safari or opened from the Home Screen. The whole screen
was measured later: see [What was checked on a phone](#what-was-checked-on-a-phone).

On a phone, "Sun times here" and a found position put their card over the map. Like
every card there it takes at most the lower three fifths of the clear map (see
[On a phone](#on-a-phone)), so with the section opened the card scrolls inside itself;
opening the section brings the two large times to the top of what shows. The Sun tab
has room for all of it.

### The far north and south

Days without a sunrise or a sunset are said in words, never left blank:

- "Does not set on this date (midnight sun)" and "Does not rise on this date (polar
  night)". In the polar night the twilight around midday is still given where there
  is any, and the height of the sun at noon is given as degrees below the horizon.
- "Twilight lasts all night" where the sun sets but never gets 6° below the horizon,
  and "None: the sun stays more than 6° below the horizon" where it never gets that
  close.
- On the day or two at each edge of the midnight sun one end of the day is missing:
  "Already up: it did not set the night before" or "Does not set tonight".

### Time zones

**Offline, Outpost does not know the time zone of a point on the map**, and it does
not guess. Time zone boundaries are a large dataset that changes, and none is bundled.

- Times are shown on **this device's clock**, and the section names the zone and its
  offset on that date ("Europe/London (UTC+1)"). Summer time is handled by the
  browser.
- **UTC** shows the same times in UTC, for a radio log or to agree a time with someone
  elsewhere. UTC is always written on the 24-hour clock, and each time is marked:
  "03:43 UTC".
- Times on the device's clock are written **on the 24-hour clock or the 12-hour one**
  ("21:21" or "9:21 pm"), whichever Outpost is set to use: see
  [The 12-hour and 24-hour clock](#the-12-hour-and-24-hour-clock). A line under the
  times links to the setting.
- **The date is the date at the place**: the day whose midday is nearest to the sun
  crossing the place's own meridian. For a place far to the east or west a time can
  fall on the day before or after on the clock being shown; the day is then written
  beside it ("18:10 on 19 Mar").
- When the sun's time at the place is two hours or more from the standard time of the
  device's zone, a line above the times says so: "By the sun, this place runs about
  12 hours ahead of this device's time zone, so clocks there probably read
  differently." **A place one zone over gets no such line.** Zones are drawn too
  generously for longitude to tell them apart (Spain keeps Berlin's time), so nearer
  than two hours nothing is said. Read the zone that is named.

### The 12-hour and 24-hour clock

**Settings → Appearance → Clock** chooses how times of day are written, here and
everywhere else in Outpost: **As this device**, **24-hour** or **12-hour**.

- It starts on **As this device**: the clock the browser reports for the device's
  language and region. A phone set to United States English gets "9:21 pm"; one set to
  British English gets "21:21". The setting says which it found. **This was tried in
  Chromium with its language set each way, not on a real phone.** A browser may not pass
  on a 12-hour or 24-hour switch made in the device's own settings, so where it has it
  wrong, choose one.
- The choice is **kept in the browser**, like the theme, so a phone and a desktop can
  differ. It is not sent to the server.
- It applies to every time of day the app writes: sun times, when a download finished
  or is expected to, when a backup was made and when the next is due, when a recording
  started, when a page was saved. One screen never shows both styles.
- **UTC is the exception**: it is always 24-hour and marked "UTC".
- On the 12-hour clock the hour after midnight is written "12:07 am" and the hour after
  noon "12:07 pm". Lengths of time ("16 h 38 min") are not clock times and do not
  change.
- One thing does not follow it: **the field where a backup's time of day is typed**
  (Settings → Automatic backups) is the browser's own time control, which the browser
  draws in the device's style whatever is chosen here. The sentence beside it follows
  the choice.

### How accurate it is

The sun's position is the low-accuracy series from Jean Meeus, *Astronomical
Algorithms*, as used by [NOAA's solar calculator](https://gml.noaa.gov/grad/solcalc/calcdetails.html),
written out in Outpost (`apps/web/src/features/maps/lib/sun.ts`, no library). The moon's
phase is from the same book (`lib/moon.ts`).

- **The horizon is taken as flat and at sea level**, with standard refraction: sunrise
  and sunset are when the centre of the sun is 0.833° below it (0.567° of refraction
  and 0.267° for the sun's radius). **Hills and mountains make the real sunrise later
  and the real sunset earlier**, by many minutes in a valley. A summit sees the sun a
  few minutes longer at each end of the day than this says.
- NOAA gives the method as accurate to about a minute between 72° north and south, and
  to about ten minutes beyond. The state of the air moves the real times by a minute
  or more, and by more at high latitudes.
- **Checked against the US Naval Observatory** (aa.usno.navy.mil, read on 16 November
  2026). For Greenwich at the March equinox and the June solstice of 2026, Quito at
  the September equinox, Sydney and Reykjavik at the December solstice, Suva and Adak
  either side of the date line, and New York on 29 February 2024, every sunrise,
  sunset, solar noon and civil twilight came out within 32 seconds of the published
  minute, so a time shown is the published minute or the one beside it. Nautical
  twilight at Greenwich on four dates did the same. Bearings at sunrise and sunset
  were within a quarter of a degree at Greenwich and Sydney.
- **Near the edges of the midnight sun it is rougher.** The sun meets the horizon at a
  shallow angle there, and the same small error in height is a longer error in time.
  For Tromsø on 17 and 18 May and 25 and 26 July 2026 the times came out within two
  minutes of the published ones (1 minute 54 seconds at worst). Which day is the first
  without a sunset can differ by one from another source. The days themselves were
  right for Tromsø, Longyearbyen, Trondheim and McMurdo at the solstices.
- **The moon.** The lit fraction matched the Observatory's table for ten dates in 2026
  to within 0.01, and eleven published new moons, quarters and full moons fell within
  an hour of where this puts them. A phase is called "Full moon", "First quarter" and
  so on when it falls within about half a day of the place's solar noon; otherwise it
  is waxing or waning, crescent or gibbous. (The Observatory's one-day data keeps
  "Waxing Crescent" up to the moment of the quarter, so on the day of a quarter the two
  can differ in name while agreeing on the percentage.)
- These were not compared with NOAA's own calculator, which works its answers out in
  the browser and publishes no table to read them from.

The Sun tab's date is shared with the grey line on the map, so the two are always about
the same day; see [The grey line](#the-grey-line-day-and-night).

Not included: moonrise and moonset (the moon's distance and the place both matter, and
it is a longer sum), astronomical twilight (the grey line shades it, but the tab gives
no time for it), bearings from magnetic north, and any
allowance for the height of the place or the hills around it.

## Drawing a route

**A drawn route is straight lines between the points you place. It does not follow
paths or roads, and it is not routing: Outpost does not work out a way for you.** Its
length is the length of those straight lines, which on a winding path is shorter than
the walk.

Start from **Draw a route** in the Routes tab, from the pencil button on the map, or
from "Draw a route from here" in the map's right-click (press-and-hold) menu.

| To | Pointer or finger | Keyboard |
| --- | --- | --- |
| Add a point | Click or tap the map | Move the map with the arrow keys, then press Enter with the map focused, or use **Add a point at the centre of the map** |
| Move a point | Drag it | Choose it in the list, move the map, then **Move to the centre of the map** |
| Add a point between two others | Drag (or press) the small handle in the middle of the leg | |
| Remove a point | Press it to choose it, then Delete or Backspace; or the × beside it in the list | The × beside it in the list |
| Undo, redo | The buttons | Ctrl/⌘ Z, Shift Ctrl/⌘ Z |
| Stop | **Cancel**, or the × on the card | Escape |

- The total distance is shown as you go, and at the last point on the map.
- One finger is enough on a phone: a tap adds a point, a drag on a point moves it, and
  a drag anywhere else still moves the map. The panel is a sheet there; while it is
  lowered, a small card over the map holds undo, redo and **Name and save**.
- Stopping asks first if there are points that have not been saved. If you leave the
  Maps screen or reload the page part-way, the unsaved route is there when you come
  back (in the same browser tab).
- A route has between 2 and 2,000 points.
- **Saving** needs a name and a colour. A saved route is like an imported one
  everywhere: listed under Routes, drawn on the map, found by search, exported as GPX.

### Heights

When a route is saved, Outpost reads heights from the **terrain installed on this
device**, for each point and along the straight lines between them (a sample about
every 25 m, more widely spaced on very long routes). That gives the route its ascent
and an elevation profile. Nothing is downloaded to do this.

- No terrain where the route runs: the route has no ascent and no profile, and its
  panel says so.
- Terrain for only part of it: the profile and the ascent cover that part only, and
  the panel says so.
- If terrain is installed later, open the route and choose **Fill in heights from
  terrain**.
- The terrain is a grid of heights with cells some 10 m or more across, so sharp
  summits and narrow ridges read a few metres low.

### Editing the shape of a route

**Edit shape** on a route opens the same tool on its line.

For a route you drew, that simply changes its points. For a **recording imported from
a GPX file**, Outpost asks first, because saving replaces what was recorded:

- a recording of more than about 300 points becomes a simpler line of that many
  points following the same shape;
- separate lines (track segments, routes) in the file are joined end to end into one;
- the time recorded at each point is dropped;
- the heights from the file are replaced by heights from installed terrain, or
  dropped where there is none;
- its name, colour and waypoints are kept.

Nothing changes until you save. **Edit a copy** leaves the recording as it is and
starts a new route from its line.

### In the API

- `POST /api/maps/tracks` with `{ "name", "color"?, "description"?, "points": [{ "lat", "lon" }, …] }`
  creates a route.
- `PUT /api/maps/tracks/:id/points` with `{ "points": […] }` replaces the lines of a
  track with one line through those points. Waypoints stored with the track are kept.

Both answer with the track and `elevation`: `"terrain"`, `"partial"` or `"none"`.
Distance, ascent, point count and bounds are worked out on the server. Positions are
stored to six decimal places, and a point repeated straight after itself is dropped.

## Recording a track

**A recording runs only while the screen is on and Outpost is the page in front.** No
browser gives a web page positions while the screen is locked, or while another app or
another tab is in front, and Outpost cannot change that. If you want a track of a long
day with the phone in a pocket, record it with a GPS unit or an app made for it, and
import its GPX file afterwards. The rest of this section says exactly what Outpost
does within that limit.

Press **Record a track** on the map. A card says the paragraph above in its own words,
and what this browser can do about the screen, before anything starts. **Start
recording** asks the browser for the device's position (the browser asks you, the
first time).

| While recording | |
| --- | --- |
| The line | Drawn on the map as you go, with a dot where you are. The map moves with you when you walk off the edge of it; if you move the map to look somewhere else, it stays where you put it. |
| Distance | Along the points kept, in kilometres and miles. |
| Time | Since the first point, by the clock: pauses and rests are in it. |
| Moving | The part of that time spent covering ground at 1 km/h or more. |
| Climb | Added up from the heights the device reports, when it reports any. |
| **Pause**, **Resume** | Nothing is kept while paused. Resuming starts a new stretch of the line; nothing is drawn or counted across the pause. |
| **Stop** | Ends the recording and asks for a name and a colour. **Carry on** undoes a stop that was not meant. |

The card folds to one line (the arrow at its corner, or the Record button), to leave
the map clear. On a phone it folds by itself when the card of another tool comes up. Leaving the Maps screen for another part of Outpost does not stop a
recording: every other screen says that one is running, with a way back to the map.

Saved, a recording is a route like any other: listed under Routes, drawn on the map,
found by search, and exported as GPX **with the time of every point**, one track
segment for each stretch.

### What browsers do, and what Outpost does about it

Read on 16 November 2026. Browser makers do not describe this in their manuals, so
for positions the sources are the standard and each browser's own code; for keeping
the screen on they are the makers' own pages.

| | Positions while the page is hidden | Keeping the screen on |
| --- | --- | --- |
| The standards | Position updates go only to documents that are visible and active; otherwise they are silently "dropped on the floor" until the page is visible again. | A page may ask for a "screen wake lock". It is released by the browser whenever the page is hidden, and the page has to ask again. The browser may refuse, for instance when the battery is low or a power-saving mode is on. A lock keeps the screen on and nothing more: it does not keep a hidden page running. |
| Safari on iPhone and iPad | None. WebKit stops the positioning itself when the page is not visible, "to save battery". | From iOS 16.4 in Safari. For Outpost opened from a Home Screen icon, only from iOS 18.4: before that it does not work there. |
| Chrome on Android (and on computers) | None. Chrome stops updating when the page is not visible and throws away any position that arrives while it is hidden. | From Chrome 84. |
| Firefox (Android and computers) | None since Firefox 92: positions are not passed on "if window is not fully active or the document is hidden". | From Firefox 126. |

"Hidden" means the screen is locked or off, another app is in front, or (in a browser
with tabs) another tab is, or the window is minimised.

So Outpost does this:

- **It asks the browser to keep the screen on** while recording, lets go on Pause and
  Stop, and asks again each time the page comes back into view. The card says whether
  the browser agreed. Even when it agrees, the lock button still locks the phone, and
  the standard lets a browser report that the screen is being kept on when the
  operating system has in fact declined, so the card says "asked", not "on".
- **Where the browser cannot be asked, or refuses, the card says so**, and what
  follows from it: set the screen not to lock for the length of the walk.
- **A gap is written down, not papered over.** When the page has been out of sight for
  more than a minute and no position arrived in that time, the card says how long was
  not recorded and when, and what follows is a new stretch of the line: nothing is
  drawn or counted across ground that was not recorded. A shorter absence, or one in
  which positions kept arriving, leaves the line whole.
- **A recording that was cut off is offered back.** Every point is written to the
  device's own storage as it is kept, so a reload, a closed tab, a browser the phone
  shut down or a flat battery loses nothing recorded before it. The next time Outpost
  is opened on that device, the map offers the unfinished recording: **Continue** (as
  a new stretch, with the time in between written down as not recorded), **Save what
  there is**, or **Discard**, which asks first.

A screen that stays on uses the battery a good deal faster than a phone asleep in a
pocket. Outpost has no figure for how much.

### Which positions are kept

| Rule | Why |
| --- | --- |
| A fix the device says is good to worse than **30 m** is ignored. | Each position comes with a radius the device believes it is within (the standard makes it the 68% level). Outpost takes a fix that poor to come from the phone network, or from a badly obstructed sky, rather than from a clear view of the satellites; a line through such fixes would zigzag by more than a path is wide. The card says when this is happening. |
| A fix is kept only when it is at least **5 m** from the last point kept, and at least **its own radius** from it. | A move smaller than the uncertainty is not evidence of a move. This is what stops a phone lying on a wall from adding distance while its reported position wanders. The cost: a corner tighter than 5 m is cut, so a path of tight zigzags reads a little short. |
| A fix no later than the last point kept is dropped. | Time only goes forwards; a position handed over twice is recorded once. |
| A height is kept unless the device says it is good to worse than 30 m. | Many devices give a height with no figure for how good it is; that height is kept as given. |

These are reasoned choices, not measured ones: **they have not been tried on a real
phone outdoors** (see [What has been tested](#what-has-been-tested)). The numbers are
constants at the top of `apps/web/src/features/maps/recording/track-log.ts`.

Heights need two cautions.

- **Climb reads high when heights wander.** It is added up the way Outpost adds it up
  for every track: a rise counts once the height is 3 m above the last counted one. A
  device whose reported height wobbles by 3 m or more on flat ground will have that
  wobble counted as climbing. Outpost has not measured how steady any phone's heights
  are, so treat the figure as rough.
- **The heights may be offset from the map's.** The standard defines the height a
  browser reports as metres above the WGS 84 ellipsoid, which is not the same as
  metres above sea level; the two differ by tens of metres depending on where you
  are. Outpost keeps the number the device gives and has not checked what each
  browser on each phone actually reports. A constant offset does not change the
  climb, but the elevation profile may sit above or below the map's contour lines.

### Saving, and when Outpost is out of reach

Recording needs nothing from the server: once the Maps screen is open, positions are
taken, filtered, drawn and stored on the device alone. Walk out of range of your
network and the recording carries on (the map itself shows only what the browser
already has).

Saving does need the server. If it cannot be reached when you save:

- the recording stays on the device, under the name you gave it, and a card says it
  is waiting;
- it is sent again after 5, 15 and 30 seconds and then every minute, and at once when
  the browser reports the network back, when the page is looked at again, or when you
  press **Try now**. It is also sent when Outpost is next opened on that device,
  whichever screen is opened;
- it is removed from the device only when the server has answered that it holds it.
  If a save arrives but its answer is lost, the recording is sent again and the
  server recognises it, so there is never a second copy;
- **Download GPX** hands the recording over as a file at any time, without the
  server, so a walk can always be got off the phone;
- you can record another walk while one is waiting.

If the server refuses a recording outright, the card says what it said and keeps the
recording, with **Send again**, **Download GPX** and **Discard**.

Until Outpost itself opens without its server, a page reloaded while out of reach
shows "The server is not responding" and nothing else. The recording is still on the
device and is offered back once Outpost opens again.

### Limits

- One recording holds at most 150,000 points, about 750 km at one point every 5 m.
  At that number it stops and asks to be saved.
- One recording at a time in one browser. A second tab says the recording is open in
  the other.
- An unsaved recording lives in that browser's storage for Outpost's address.
  Clearing the browser's site data deletes it. A private window keeps nothing, so
  recording is not offered there.
- A browser needs geolocation, HTTPS (or `localhost`), and storage. Over plain HTTP
  the card says so and points to **Settings → HTTPS on your network**.
- Heights are whatever the device reports; installed terrain is not consulted for a
  recording.

### What has been tested

- The rules for which positions are kept, and the distance, moving time and climb,
  against figures worked out by hand (`track-log.test.ts`).
- The recorder against a stand-in browser: pause and resume, the screen being asked
  for and let go, gaps, a recording cut off and taken up again, saves that fail and
  are sent again (`recorder.test.ts`).
- In Chromium, with the browser's position set by the test, on `localhost`: a walk
  recorded, saved and exported as GPX with times; a reload in the middle; the network
  cut before saving and restored; a save whose answer was lost (`e2e/tests/recording.spec.ts`).
- On the server: a recording of 86,400 points (a day at one a second, 8.3 MB as GPX)
  was saved in 0.3 to 0.5 seconds, during which the server's own thread was never
  held for more than 28 ms at a time and went on answering other requests (16 November
  2026, Node 24.15 on a Mac, with other test suites running).

**Not tested: a real phone, outdoors.** Nobody has walked with this. Real GPS noise, a
screen that really locks, Safari on an iPhone, Chrome and Firefox on Android, a browser
ended by the phone to free memory, and a day's worth of battery are all untried, and
the table of browser behaviour above is read from documents and source code, not
observed.

### Sources

- Geolocation: W3C Candidate Recommendation Draft, 5 November 2026,
  <https://www.w3.org/TR/geolocation/> (updates only to visible documents; accuracy
  at the 68% level; altitude above the WGS 84 ellipsoid).
- Chrome: `third_party/blink/renderer/core/geolocation/geolocation.cc`,
  <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/geolocation/geolocation.cc>.
- Safari: `Source/WebCore/Modules/geolocation/GeolocationController.cpp`,
  <https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/geolocation/GeolocationController.cpp>.
- Firefox: `dom/geolocation/Geolocation.cpp`,
  <https://github.com/mozilla-firefox/firefox/blob/main/dom/geolocation/Geolocation.cpp>,
  and <https://bugzilla.mozilla.org/show_bug.cgi?id=1653549> (fixed in Firefox 92).
- What "hidden" covers: <https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilityState>.
- Screen Wake Lock: W3C Working Draft, 11 November 2026,
  <https://www.w3.org/TR/screen-wake-lock/>; Chrome for Developers,
  <https://developer.chrome.com/docs/capabilities/web-apis/wake-lock>; Apple's Safari
  16.4 and 18.4 release notes,
  <https://developer.apple.com/documentation/safari-release-notes/safari-16_4-release-notes>
  and
  <https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes>;
  Mozilla's Firefox 126 release notes for developers,
  <https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/126>; versions
  from MDN's browser compatibility data for `WakeLock`.

### In the API

`PUT /api/maps/recordings/:id` saves a recording. The body is `multipart/form-data`
with `name`, `color?` and one GPX file, which the device builds itself. `:id` is 26
characters chosen by the device, and the track is saved under it: sent twice, the
second answers with the track already there (`alreadySaved: true`) and changes
nothing. The file is read by the same reader, under the same limits, as an imported
GPX file, and must then be a recording: tracks only, a time at every point, at most
150,000 points. Anything else is refused with a message saying which.
## Finding a known route

**Find a route** in the Routes tab looks a route up by name (a waymarked walk, a cycle
route, a named path such as the Llanberis Path) and adds it to your own routes, so you
do not have to go looking for a GPX file. The routes come from
[OpenStreetMap](https://www.openstreetmap.org/copyright), through a server that
answers questions about it.

**This is the one part of the map that needs the internet at the moment you use it.**
The search is sent when you press **Search** and at no other time; a route you add is
kept on your device and works offline from then on, like any other.

1. Type part of the name, or leave it empty to list the routes in the map view.
2. Choose where to look: **This map view** or **Anywhere**.
3. Press **Search**. The list shows each route's name, what kind it is (walking,
   cycling, mountain biking, riding, running, or a named path), its length, and how
   far it lies from the middle of the map.
4. Choose one to see it drawn on the map, with its length and how whole its line is.
5. **Add to my routes** saves it. It is then listed, drawn, found by search, given an
   elevation profile, exported as GPX and printed exactly as a route you drew or
   imported is.

### What is sent, and to whom

Before you search, the view names the server the search goes to. What is sent is the
name you typed, the edges of the map view (to five decimal places) when you search the
view, and a client name that says "Outpost" with its version and the project's
web address, which the servers' operators ask programs to give. The view shows that
name, word for word, in the same sentence as the server, before you search: it is the
same for every copy of Outpost. Nothing about you, your library or this installation is
sent, and nothing is sent while you type.

The servers are declared in one file, `catalog/route-sources.json`; a search goes to
the host of one of them and to no other, and a redirect is refused rather than
followed. Three are shipped, each an [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
server run by someone other than this project, on terms read on 16 November 2026
([sources.md](sources.md#routes)):

| Server | Knows | Asked first when the middle of the map is in | Run by |
| --- | --- | --- | --- |
| `ovp.dresel.systems` | Europe | 11° W to 32° E, 36° N to 71.5° N | A private person in Germany |
| `ovp.dresel.systems` (a second database) | North America | 168° W to 52° W, 25° N to 72° N | The same |
| `overpass.private.coffee` | The whole world | Anywhere else | Private.coffee, a non-profit association in Austria |

A server that knows one region is asked about that region before the one that serves
the whole world. The boxes are drawn inside what each regional server holds, so some
of what it knows (Iceland, Crete, most of Mexico) goes to the world server unless you
choose otherwise, and a strip of north Africa lies inside the European box although
that server does not hold it. **Change server**, under the search, chooses another;
the choice is remembered in the browser and is then used wherever the map is. A
search that fails, or finds nothing, offers **Ask another server**. These are volunteers'
servers with no promise of being there. On 16 November 2026 `overpass.private.coffee`
answered one search in 95 seconds, from a copy of the map dated 28 July 2026, and
gave no answer to four more requests within 29 to 60 seconds; `ovp.dresel.systems` answered a
search of a view in about a second and a search by name across Europe in three to
five, from the previous day's map. That is one day's measurement, not a judgement of either.
When a server's copy of the map is more than a month old the results say so.

To use a server of your own, or to stop Outpost using the shipped ones, write
`<data directory>/catalog/routes/route-sources.json` and restart:

```json
{
  "schemaVersion": 1,
  "defaultSource": "ours",
  "replaceShipped": false,
  "sources": [
    {
      "id": "ours",
      "name": "Our Overpass",
      "type": "overpass",
      "endpoint": "https://overpass.example.net/api/interpreter",
      "operator": "the walking club",
      "coverage": "Britain and Ireland",
      "bbox": [-11, 49, 2, 61],
      "termsUrl": "https://overpass.example.net/",
      "lastVerified": "2026-11-16"
    }
  ]
}
```

- `endpoint` is the server's "interpreter" address. Shipped sources must be `https`;
  your own may be `http`. A server on your own network also needs Outpost started with
  `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.
- `defaultSource` names the server to ask wherever the map is. Leave it out and the
  server is chosen as above: the first whose `bbox` holds the middle of the map, else
  the first that has no `bbox`.
- `bbox` (`[west, south, east, north]`) is optional, and only decides which server is
  asked first. Nothing stops a person choosing a server for a view outside its box.
- `"replaceShipped": true` leaves the shipped servers out altogether. With an empty
  `sources` list as well, "Find a route" has nowhere to search and says so.
- A file that cannot be used is reported in the server's log and by
  `GET /api/maps/route-sources` (`problems`), and none of it is used.

### What is searched

- **Routes**: OpenStreetMap "route relations" for walking (`hiking`, `foot`,
  `walking`), running, cycling (`bicycle`), mountain biking (`mtb`) and riding
  (`horse`). A name matches if what you typed appears anywhere in the route's name, in
  any language it is named in, or in its alternative name, whatever the capitals. A
  route found by a name other than its main one shows both: on 16 November 2026 a
  search for "pyg track" around Snowdon listed "Llwybr Bwlch Moch", with "Also Pyg
  Track" beneath it.
- **Named paths**: many well-known paths are not routes in OpenStreetMap at all, only
  stretches of path that share a name (a search of that view on the same day turned up
  eight separate ways named Miners' Track). When you search **the map view by name**,
  paths,
  footways, bridleways, cycleways, tracks and steps with that name are found too. Ways
  whose ends lie within 300 m of each other are offered as one path; the same name on
  another hill is offered separately. Searching **Anywhere** finds routes only: asking
  a volunteer's server to read every path in the world for a name is not a reasonable
  thing to ask.
- A view may be at most 2° wide and 2° tall (about 220 km north to south). A name
  needs at least three letters. A search lists at most 40 routes and 20 named paths
  and says when there were more.
- A long route kept as sections (a "super-route": many national and international
  trails) is shown as its list of sections, each of which is looked at and added by
  itself.

### How a route's line is made

OpenStreetMap keeps a route as a list of ways, each a short line. The list is meant to
be in walking order, but ways are drawn in either direction, are sometimes listed out
of order, sometimes do not meet, and sometimes fork. Outpost joins what really joins:

| In OpenStreetMap | What Outpost does |
| --- | --- |
| A way drawn the other way round | Turns it to fit |
| Ways listed out of order | Joins them wherever an end of one is exactly an end of another |
| Two parts that do not meet (a gap) | **Leaves the gap open.** The route becomes two lines. Nothing is ever drawn across, and the length counts only what is mapped. The preview says how many gaps there are and how wide the widest is |
| A fork, a loop, or two carriageways | Keeps each branch as a line of its own, touching the line it leaves. The length counts them all |
| Legs marked as an alternative, an excursion, an approach or a connection | Left out unless you tick **Also add its alternative legs**; then added as separate lines named "Alternative leg" |
| Guideposts and other points in the route | Passed over |
| A point that is not a place on Earth, or a way with no points | Dropped, and the preview says how many |

Lines are put in the order they would be walked as far as that can be told: the first
line first, then always the line whose end is nearest to where the last one stopped. A
route of several lines is stored, and exported, as several lines, like a GPX file with
several track segments.

### How large a route may be

One route may have up to 10,000 ways and 200,000 points (about 2,000 km of path), in an
answer of up to 24 MB. A larger one is refused whole with a message that says so and
suggests a section of it. A search answer may be up to 6 MB. The limits were chosen so
that a national trail of some hundreds of kilometres fits; that is an estimate from
how densely paths are mapped, and no trail of that length was fetched to try it. A
trail across a continent does not fit, and is in any case kept as sections.

### Heights

When a found route is added, each of its points is given a height from the **terrain
installed on this device**, as a drawn route is; nothing is downloaded for this. With
no terrain where it runs, it has no ascent and no elevation profile, and its panel
says so. If terrain is installed later, open the route and choose **Fill in heights
from terrain**: the route is not fetched again.

Filling in heights only adds. A point keeps the height it has where the terrain
installed now has none to give (terrain may have been removed since), and takes the
terrain's height where there is one. Reading terrain for a long route takes some
seconds; if the route is redrawn, filled in or removed in that time, from another tab
or another device, nothing is written and the answer says so.

### Credit and licence

A found route's line is OpenStreetMap's data, © OpenStreetMap contributors, under the
[Open Database Licence](https://opendatacommons.org/licenses/odbl/1-0/). What the
licence asks was read on 16 November 2026 and is set out in
[sources.md](sources.md#what-the-open-database-licence-asks-of-a-found-route). In
short: the points, as data, stay under that licence wherever they go, and a map with
the route on it must say where the route came from when it is shown to other people.
Outpost therefore keeps the credit with the route:

- the route's panel shows which element of OpenStreetMap it is (for a route, with a
  link to its page there), the day it was fetched, the server it came from, how fresh
  that server's copy of the map was, and the credit and licence with their links;
- the map's credits read "Routes: © OpenStreetMap contributors" while a found route is
  drawn, whatever map is beneath it;
- the GPX export carries the credit in `<metadata><copyright>` (author, year, licence
  address), a `<link>` to OpenStreetMap's copyright page, and on each track a `<src>`
  saying where its points came from and, for a route, a `<link>` to its page. Four
  exports (a found route with an alternative leg and a name full of awkward
  characters, a named path, the two together, and a mixture with a drawn route and a
  saved place) were checked against the GPX 1.1 schema with `xmllint` on 16 November
  2026; all four validated. Opening them in other map programs has not been tried;
- the same sentence is the route's description, so a program that reads nothing else
  from the file still keeps it. That is also how the credit survives when the file is
  imported into Outpost again: the importer keeps descriptions, not copyright elements;
- an export of several routes marks the whole file as OpenStreetMap's only when all of
  it is; otherwise each found route says so on its own track and a sentence at the top
  says some do;
- editing the route's shape by hand keeps the credit.

**If you pass the GPX file on, leave the credit in it. If you print or publish a map
with the route on it, the credit must be on it.**

### What it does not do

- It does not find routes from walking websites or apps. Those are other people's
  collections, and their terms do not allow it ([sources.md](sources.md#routes)).
- It does not check a route. OpenStreetMap is made by volunteers: a route can be
  wrong, out of date, closed or dangerous. Check it against the ground and a proper map.
- It does not keep results, refresh a route you added, or fetch anything in the
  background. A preview is held in the server's memory for up to fifteen minutes so
  that adding it does not ask the source again, and is then forgotten. Every preview
  fetched in that time is held, so stepping through the sections of a long trail and
  going back to add the first asks nobody again. The bound is on memory, shared by
  everyone using this Outpost: 600,000 points in all (three of the largest routes
  allowed) and 200 previews. A held point takes about 73 bytes (a route of 190,001
  points held 13.9 MB, measured on Node 24 on 16 November 2026), so the largest route
  allowed costs some 15 MB while it is held and the bound is some 44 MB; a section of
  a few thousand points costs a few hundred kilobytes. When there is no more room the
  oldest preview is let go, and adding it fetches it again and says that Outpost was
  no longer holding it.
- It does not add the same preview twice. If "Add" arrives twice for one preview (a
  double click, or a retry while a long route's heights are being read), one route is
  made and both are answered with it.
- One search runs at a time: a source is never asked two questions at once. A second
  one started meanwhile waits up to two seconds for its turn. That is long enough for
  a search that was just cancelled (choosing one result and then another, or Cancel
  and then Search) to be dropped, so the next one follows it without a refusal. If
  the first is still running after that, from this or another device, the second is
  asked to wait. After a server says it is busy, Outpost does not ask it again for 30
  seconds.
- Names in scripts where capital letters differ in ways the server does not know may
  need to be typed with the capitals the map uses.

In the API: `GET /api/maps/route-sources`, `POST /api/maps/route-search`,
`POST /api/maps/route-search/preview`, `POST /api/maps/route-search/add` and
`POST /api/maps/tracks/:id/heights`; see [api.md](api.md#finding-a-route).

## GPX tracks

- **Import.** Upload one `.gpx` file at a time, up to 20 MB. Tracks and routes become
  a track on the map. Waypoints in the file either stay with the track or, if you ask,
  become markers; never both.
- **What is read.** GPX 1.0 and 1.1. From a track or a route: its name, its description
  (or its comment, when it has no description) and its points with their heights; from
  a track, the time of each point too, when every point of a segment has one. From a
  waypoint: name, description, time, symbol and height (what a symbol becomes when the
  waypoint is saved as a place is under [Icons and GPX](#icons-and-gpx)). The file's own name is the one
  in its `<metadata>`, or the `<name>` directly under `<gpx>` where GPX 1.0 keeps it,
  or failing both the name of its first track. Each of these is read only from where
  GPX puts it. Everything else is passed over, extensions above all (heart rate,
  cadence, a device's own settings), however much of it there is. A file may start with
  a byte-order mark, write its elements with a prefix (`<gpx:trk>`), and put text in
  CDATA. A position that is nowhere on Earth is dropped, and a line needs two points.
- **What a file may hold.** A file over any of these is refused whole, with a message
  that says which, and nothing of it is imported:

  | | At most |
  | --- | --- |
  | Size | 20 MB |
  | Track points and route points, together | 1,000,000 |
  | Waypoints | 20,000 |
  | Tracks and routes, together | 10,000 |
  | Track segments | 100,000 |
  | Elements inside one another | 64 |
  | Attributes on one element | 64 |
  | Namespace declarations in force at one place | 64 |
  | One unbroken piece of text, CDATA section, comment or attribute value | 1,000,000 characters |

  The size is reached long before the points: 20 MB holds about 870,000 of the shortest
  points that can be written, or about 200,000 with a height and a time each (a
  recording of one point a second for more than two days). A name, description, comment
  or symbol longer than 2,000 characters is cut there; the file is not refused for it.
  Waypoints turned into saved places have no smaller limit of their own: every waypoint
  a file may hold, 20,000, can become a place. Each place is written on the server's
  own thread at about 0.2 ms apiece, so they are written a hundred at a time with a
  pause between, and the server goes on answering while they are (20,000 take about
  five seconds in all). If the import fails part of the way, the places already made
  are removed again.
- **Several files at once.** Two files are read at a time and up to six more wait
  their turn; one more than that is turned away with a message asking to try again.
  A read holds the text of the file and what is kept of it, so a burst of uploads takes
  turns instead of adding up.
- **What is refused.** A file that is not well-formed XML (a tag left open, an
  attribute without quotes, an entity XML does not define such as `&nbsp;`): it is not
  repaired. A file with a DOCTYPE or entity declarations. A file saved as UTF-16; save
  it as UTF-8. XML that is not GPX, and a GPX file with no track, route or waypoint in
  it. Each gets its own message.
- **The one thing let through.** An ampersand that starts no reference, as in a place
  called `Fish & chips` or a link ending `?a=1&b=2`, is not XML, but programs write it
  and it can only mean the ampersand. It is read as one.
- **How long it takes.** A recording of 150,000 points with heights and times (13 MB)
  is read in about 0.15 seconds and imported in about 0.4, away from the server's own
  thread, which goes on answering (16 November 2026, Node 24.15 on a Mac).
- **What is recorded.** Name, description, colour, distance, total ascent (when the
  file has elevations; rises of less than 3 m are ignored as GPS noise), number of
  points and bounds.
- **Export.** One track as GPX (`GET /api/maps/tracks/:id/export.gpx`), or a selection
  of tracks together with your markers as waypoints
  (`GET /api/maps/export.gpx?markers=1&tracks=<id>,<id>`). The output is GPX 1.1,
  checked against the published schema; see
  [Exports checked against the GPX 1.1 schema](#exports-checked-against-the-gpx-11-schema).
- **A drawn route in GPX.** It is written as a track (`<trk>` with one `<trkseg>`),
  which more apps read than a `<rte>`, and which no device will try to re-plan along
  roads. It carries the route's name, one `<trkpt>` for each point you placed with its
  latitude and longitude, and an `<ele>` where a height is known. There are no `<time>`
  elements: a drawn route was never walked. The samples taken between your points for
  the elevation profile are not exported.
- **Numbers.** Latitudes, longitudes and heights are always written as plain decimals
  (never in a form such as `5e-8`, which GPX does not allow): positions to seven
  places, heights to the centimetre. GPX 1.1 allows a longitude from -180 up to, but
  not including, 180, so a point at 180° east is written as `-180`, which is the same
  meridian.
- **Times.** Written in the one form GPX allows, such as `2026-03-01T12:30:00Z`. A
  time already in that form goes out exactly as it came in, zone and fractions of a
  second included. An imported file may give times in other forms that Outpost can
  read (`2026-03-01 12:30:00`, `Sun, 01 Mar 2026 12:30:00 GMT`, a date alone); those
  are kept as the file gave them and written out as the same moment in UTC. One of
  those with no zone is taken as the local time of the computer Outpost runs on.
- **Safety.** A GPX file is checked before it is read: files with a DOCTYPE or entity
  declarations are refused. It is then read in one pass that keeps only what is stored,
  so the memory a file costs depends on the points in it and not on how its XML is
  shaped; see [security.md](security.md#files-people-upload). Positions are stored to
  six decimal places.


### Exports checked against the GPX 1.1 schema

On 16 November 2026, thirteen exports made by a test server were validated against the
GPX 1.1 schema as its publisher serves it (`https://www.topografix.com/GPX/1/1/gpx.xsd`,
26,665 bytes, SHA-256 `9e4d1988b862edbe556305b130f8f6f1b29864fefd0dc02d5dab04ccdd1f34d6`)
with `xmllint --noout --schema gpx.xsd <file>` (libxml2 2.9.13, the one that comes with
macOS). The exports were:

| Export | What is in it |
| --- | --- |
| A route drawn on the map | One track, a description, no times. |
| A recorded track | The time and the height of every point, as the recorder sends them. |
| An imported file with waypoints | Waypoints with heights, times, descriptions and symbols (`<sym>`), one with a symbol and nothing else, beside a track. |
| Awkward names | `&`, `<`, `>`, both kinds of quotation mark, emoji, Cyrillic, Greek, Chinese, Hebrew and Arabic, in the file's name, its description, a track and a waypoint. |
| Nothing named | A waypoint, a track and a route with no names, imported with no name given. |
| Several segments | A track of three segments (times with `Z`, times with an offset and a fraction of a second, no times), and a second track with heights below zero. |
| Times written other ways | Waypoint and point times in forms Outpost reads and GPX does not allow. |
| Saved places alone | Among them places at 180° and -180° longitude, at both poles, and at 179.99999996°. |
| A route across the date line | A drawn route with a point at 180°. |
| Everything together | All of the above in one file, places included. |
| A file that came in as GPX 1.0 | Sent out as 1.1. |
| A found route | With its credit in `<copyright>`, `<link>` and `<src>`. The credit was written into a stored route as the finder stores it; the finder itself was not run. |
| A found route with a drawn one | Where only the track carries the credit. |

**What the schema refused, and what was done.** Nine of the thirteen validated as they
were. Four did not, for two reasons, both now fixed in the writer
(`apps/server/src/modules/maps/gpx.ts`):

- **Times in forms GPX does not allow.** The reader keeps any time it can read as a
  date, and the writer wrote it back unchanged, so `2026-03-01 12:30:00` or
  `Sun, 01 Mar 2026 12:30:00 GMT` in an imported file came out the same way. They are
  now written as the schema's `xsd:dateTime`.
- **A longitude of exactly 180.** The schema's longitude stops just short of it. A
  saved place or a route point at 180°, or one that rounds to it, is now written as
  `-180`.

The order of elements, which is the usual fault, was right everywhere: in a waypoint
`ele`, `time`, `name`, `desc`, `sym`; in the metadata `name`, `desc`, `copyright`,
`link`; in a track `name`, `desc`, `src`, `link`, then its segments. After the two
fixes all thirteen validate.

**Read back.** Each file was then read with Outpost's own GPX reader and compared with
what is stored. Positions, heights (to the centimetre), the moment of every time,
names, descriptions and symbols all came back as stored, with 180° read back as -180°.
The export adds two things on purpose: a single line with no name of its own takes the
route's name, and a waypoint with no name is written as "Waypoint".

**How this is kept true.** The schema file says nothing about its own licence, so it
is not kept in this repository and no test needs it or the internet.
`apps/server/test/maps-gpx-schema.test.ts` has the schema's order of elements written
out and checks it, and the forms of every latitude, longitude, height and time, on the
same kinds of export made by a test server. To validate again, fetch the schema and run
the `xmllint` command above on an exported file.

**Earlier checks.** Four exports were validated on 15 November 2026 and the four
found-route exports described under [Finding a known route](#finding-a-known-route) on 16 November
2026. All eight passed; none of them held a time in another form or a point at 180°.

**What has not been tested.**

- **No other program has opened these files.** Not one. Programs a person might try,
  and which may each be stricter or looser than the schema: Garmin BaseCamp and a
  Garmin handheld, OsmAnd, Organic Maps, Gaia GPS, Komoot, QGIS, GPXSee, gpx.studio,
  Google Earth and JOSM. If one of them refuses a file or shows it wrongly, that is
  worth an issue with the file attached.
- **Addresses.** `xmllint` checks a web address (`<link href>`, `<license>`) only
  loosely, so validating says little about those.
- **What is not in the schema.** That a program shows a symbol name it knows as an icon,
  keeps the credit, or draws a route across the date line as one line and not as a
  stroke round the world.

## Coordinate formats

A position typed into the place search is recognised as a position, not a name (the
API answers with `coordinate` instead of a list of places). These forms are
understood:

| Format | Examples |
| --- | --- |
| Decimal degrees | `54.4609, -3.0886` · `54.4609 -3.0886` |
| With hemisphere letters | `54.4609N 3.0886W` · `3.09W 54.46N` |
| Degrees and decimal minutes | `54°27.654'N 3°05.316'W` · `N54 27.654 W3 05.316` |
| Degrees, minutes, seconds | `54°27'39"N 3°05'19"W` |
| `geo:` links | `geo:54.4609,-3.0886` |
| British National Grid reference | `NY 215 072` · `NY21540721` · `NY 21540 07210` |
| National Grid easting and northing | `321540 507210` |
| Maidenhead locator | `IO83` · `IO83QM` · `io83qm` · `IO83QM54` |

Notes:

- Latitude comes first unless hemisphere letters say otherwise.
- A grid reference names a square. Outpost returns the middle of it, and reports the
  size of the square (100 m for six figures, 10 m for eight, 1 m for ten).
- National Grid positions are converted with the Ordnance Survey's standard seven-
  parameter transformation, which is accurate to about five metres. That is finer than
  a hand-typed reference, but it is not survey grade.
- Grid references are only meaningful in Great Britain. There is no support for UTM,
  MGRS or the Irish Grid.
- A Maidenhead locator of four, six or eight characters is read, in either case. It
  names a cell too; see [Maidenhead locators](#maidenhead-locators).

## Maidenhead locators

Radio amateurs give positions as Maidenhead locators: pairs of characters, each pair
dividing the cell before it.

| Characters | Cell | Size | Example |
| --- | --- | --- | --- |
| 2 | Field | 20° of longitude by 10° of latitude | `IO` |
| 4 | Square | 2° by 1° (about 132 km by 111 km at 53.5° north) | `IO83` |
| 6 | Subsquare | 5′ by 2.5′ (about 5.5 km by 4.6 km) | `IO83QM` |
| 8 | Extended square | 30″ by 15″ (about 550 m by 460 m) | `IO83QM54` |

Outpost writes locators in capitals and reads them in either case.

- **The grid.** The **Maidenhead locator grid** button draws the grid over the map, with
  each cell named at its middle; the choice is remembered in the browser. Which cells
  are drawn follows the zoom: fields from as far out as the map goes, squares from zoom
  4.5, subsquares from zoom 9 and extended squares from zoom 12.5, each from the point
  where a cell is 60 pixels wide. The edges of the cell one size up are drawn heavier.
  The lines and names are the text colour of the theme, thinned, and take no room from
  the map's own names.
- **Beside coordinates.** The six-character locator of a position is written with its
  coordinates: on a found position, on a saved place, in the right-click menu, and for
  both ends of a measured path. Press it to copy it.
- **As the coordinate format.** With **Maidenhead locator** chosen for the readout at
  the bottom of the map, the position under the pointer is given as a locator of four,
  six or eight characters, as many as the view can tell apart.
- **In the search box.** A locator of four, six or eight characters goes to the middle
  of its cell, and the result says which kind of cell it is and how big. A field alone
  (two letters) is not read as a position.
- **One overlap.** Four characters such as `NN16` are both a British grid reference
  for a 10 km square and a locator. The search lists both; the grid reference first.

A locator names a cell, not a point. Going to "IO83QM" goes to the middle of a cell
more than five kilometres across.

The conversion is checked both ways against published examples: W1AW's locator as
given by Wikipedia and by the ARRL, and the seven positions in the test table of the
go-maidenhead library, each at six and eight characters
(`apps/server/test/maps-sight.test.ts` lists them with where they were read).

## The grey line: day and night

The **Grey line (day and night)** button, beside the Maidenhead grid's, draws over the
map where it is day and where it is night, for now or for a time you choose. Radio
amateurs call the band of twilight along the edge between the two the grey line: HF
signals along it often travel unusually well around dawn and dusk. It is off until it is
pressed, and the choice is remembered in the browser.

**What is drawn**, worked out on your device from the Sun's position, with no tiles and
no connection:

- **The line** where the Sun is rising or setting: solid, in the text colour, with a
  thin casing in the page colour so that it holds over dark ground and hill shading.
  It is drawn where the centre of the Sun is 0.833° below the horizon, the same rule the
  Sun tab uses for sunrise and sunset, so a place on the line is at the Sun tab's
  sunrise or sunset.
- **Night as a tint that deepens in four steps**: past sunset, then past the end of
  civil twilight (the Sun 6° below the horizon), of nautical twilight (12°) and of
  astronomical twilight (18°). Each step is a thin dashed line as well as a shade, so
  the bands can be told apart without relying on the colour. Full night is 30% of the
  text colour over the light map and 59% black over the dark one: the map, its roads
  and its hill shading still show through.
- **The map's own names are drawn over the tint**, so their contrast is not changed at
  night. (Under it, they would lose too much: over the dark map the quieter grey of the
  outline map's country names would drop from 7.4:1 to 3.0:1 against the ground.) What
  you have put on the map (places, routes, the grid, a measured line) is over the tint
  as well.
- **Sun overhead**: a small amber disc and those words where the Sun is straight
  overhead.

**A legend** sits over the top left of the map while the line is on. It says the time
the line is drawn for, in words: "Now, 14:32 on Monday 16 November 2026", or "Not now:
drawn for 03:30 UTC on Sunday 21 June 2026" whenever another time has been chosen, with
**Back to now** beside it. It names what the shading means, with a sample of each.

**Choosing another time.** The clock button in the legend opens a date and a time.
They are on the clock the Sun tab's times are on: this device's, or UTC (a link beside
them switches; the Sun tab's own switch does the same). Times are written on the
24-hour or 12-hour clock chosen under Settings, except UTC, which is always 24-hour.
**Now** goes back to the present. A chosen time stays put; "now" is drawn afresh at the
turn of every minute, and not while the page is out of sight. There is no animation.

**The Sun tab and the line agree.** The Sun tab's date is the date of the moment the
line is drawn for: step a day in the Sun tab and the line moves a day at the same time
of day; choose a time on the line that falls on another day and the Sun tab goes to
that day. **Today** in the Sun tab is "now" for both. A time chosen is kept while you
are on the Maps screen and forgotten when you leave it, so the map never opens on a
moment nobody remembers choosing. (The Sun lines of a saved place or a found point keep
a date of their own, as before.)

**Printing.** When the line is on, **Print or save as PDF** starts with **Grey line (day
and night)** ticked, draws it on the page for the moment the map shows (to the minute),
and prints a sentence under the map with that time in UTC: "Day and night are drawn
for 03:30 UTC on Sunday 21 June 2026." Untick it to leave it off.

**On an HF coverage map** (Radio → HF coverage) the same line can be switched on under
the hour control; see [radio.md](radio.md#radio-tools-on-the-map).

### How it is worked out, and how accurate it is

The Sun's declination and the equation of time come from the same code as the Sun tab
(`apps/web/src/features/maps/lib/sun.ts`, Jean Meeus's low-accuracy series). From them,
the point where the Sun is overhead is at latitude = declination and longitude =
−15° × (hours since 00:00 UTC − 12) − equation of time ÷ 4 (the equation of time in
minutes). Everywhere the Sun is below a given height is a circle on the globe round the
point opposite, of radius 90° plus that height; each is traced every quarter of a
degree and cut into pieces between −180° and 180° of longitude, closed along a pole
when it holds one (the polar night). So nothing is stretched across the date line,
every copy of the world the map shows is drawn the same, and the shapes are right round
the poles (`apps/web/src/features/maps/grey-line/geometry.ts`).

- **Against the Sun tab**: at the Sun tab's sunrise and sunset for eight places and
  dates (Greenwich at the March equinox and the June solstice, Quito at the September
  equinox, Sydney and Reykjavik at the December solstice, Suva and Adak either side of
  the date line, New York on 29 February 2024), the drawn line passes over the place
  within 0.3 seconds of the time the tab gives.
- **Against the US Naval Observatory's published times** (the ones in
  `lib/sun.test.ts`, read on 16 November 2026): the line passes over each of those
  places within 27 seconds of the published minute of sunrise and sunset, and the
  steps of the shading fall within a minute and a half of the published times of civil
  twilight there and of nautical twilight at Greenwich at the solstices and equinoxes.
  Astronomical twilight (18°) has no published times in those tests; it is held to the
  Sun's height worked out directly.
- **Everywhere at once**: for seven moments (the solstices, the equinoxes, and ordinary
  times either side of midnight UTC), more than 6,000 points over the whole globe each
  fall in the band the Sun's height there puts them in, except within 0.05° of a
  boundary, where a straight piece of the traced circle and the true curve may differ.
  The poles are in day or night as they should be at the solstices, and places just
  either side of the 180° meridian always fall in the same band.
- The method's own accuracy is that of the Sun tab: the Sun's position to about 0.01°,
  about 2 km on the ground. **The real edge of daylight is not this sharp**: the air,
  the height of the ground and the hills move it by more than that.

Tests: `grey-line/geometry.test.ts` (the arithmetic and the shapes),
`grey-line/grey-line.test.tsx` (the button, the legend, the time, the Sun tab, the
page), and `e2e/tests/grey-line.spec.ts` and `grey-line.mobile.spec.ts`, which read the
map's own pixels to see that night is drawn and day is not, at desktop width and at
390 px.

**Not tried on a real phone.** The phone tests run in a desktop browser made the size of
an iPhone (390 × 844) and pressed with touch events.

## Line of sight

**This is a check of geometry against terrain. It is not a prediction of signal
strength, propagation or coverage.** It answers one question: with an antenna this
high at each end, does the ground between two points stand in the way of the straight
line between them, and by how much does it clear?

### Using it

1. Press **Line of sight between two points**, then click or tap the map at each end:
   point A, then point B. Pressing a saved place puts the point exactly on it. Without
   a pointer, move the map and use **Use the centre of the map**. Or measure a path
   with the ruler and choose **Check line of sight**. Or open a repeater on the map and
   choose **Check line of sight**: it becomes point B, and you choose point A (see
   [Repeaters on the map](#repeaters-on-the-map)).
2. Give the height of the antenna at each end, in metres above the ground it stands
   on, and choose a band (10 m to 13 cm, and PMR446) or type a frequency. The heights
   and the band are remembered in the browser.
3. Read the answer in the panel beside the map (on a phone, **Show the path and the
   details** raises it). Changing a height or the band answers again at once.

On a phone the tool takes over the sheet, and the lowered sheet shows its name and the
button that puts it down. The card over the map says only what to do next, or the
answer in a line: the tool is named once. Choosing an end again from the raised sheet
lowers it, so the map can be touched.

**Move** beside A or B chooses that end again; **Swap A and B** turns the path round;
Escape puts the tool down.

### What it shows

- The great-circle **distance** between the two points, the **bearing** to set out on
  from each towards the other, and the **locator** of each.
- **The answer in words**, one of:

  | Answer | Meaning |
  | --- | --- |
  | Clear | No ground is above the straight line, and at least 60% of the first Fresnel zone's radius is clear all along it. |
  | In sight, with the Fresnel zone partly blocked | No ground is above the line, but somewhere less than 60% of the first Fresnel zone's radius is clear. It says where, and how much is clear there. |
  | Blocked | Ground is above the line. It says how far above at the worst place, how far along that is, and over what stretch of the path. |
  | Not known | Terrain is missing for part of the path, or under one of the ends. It says which part. |
  | No terrain here | No terrain is installed anywhere along the path. |

- **The path from the side**: the ground between the two antennas, the straight ray,
  and the first Fresnel zone around the ray. Move along it with the pointer, a finger
  or the arrow keys for the ground height, the height of the ray above it and the
  Fresnel radius at that place; the place is shown on the map.
- On the map, the path as the great circle it is, with A, B and the place the answer
  turns on.

### The sums

- **The Earth's curve.** Between the two ends the ground is lifted above the straight
  line joining them by d1 × d2 ÷ (2 × k × R): d1 and d2 are the distances to each end,
  R is the Earth's radius (6,371 km) and k is 4/3. **k = 4/3 is the "effective Earth
  radius" that radio planning uses for a standard atmosphere**, in which the air bends
  a ray gently downwards so that it reaches a little further than a straight line
  would. It is an average. On a given day the air may bend a signal more or less. The
  chart draws this lift into the ground, so the ray is a straight line; the lift at the
  middle of the path is given under the chart's title.
- **The first Fresnel zone.** Its radius at a point is √(λ × d1 × d2 ÷ (d1 + d2)), with
  λ the wavelength. The usual guide is that 60% of that radius should be clear of the
  ground; the answer is measured against it, at the place where least is clear.
- **The ray** runs straight from the top of one antenna to the top of the other, each
  standing on the terrain's height at its end.

These are checked in `apps/server/test/maps-sight.test.ts` against values worked by
hand, against the handbook forms of the same formulas, and against made-up ground
whose answer is known (a ridge of known height midway, level ground, a valley between
two summits, the sea).

### What it rests on, and its limits

- **Terrain only.** The heights are those of the terrain installed on this device. It
  holds no buildings, trees, masts or pylons as such, and a wood or a row of houses on
  the path will block or weaken a signal that this check calls clear.
- **How fine the terrain is.** Terrain Outpost downloads comes from Mapterhorn as tiles
  512 cells across down to zoom 12, where one cell is about 19 m wide at the equator
  and about 11.5 m at 53° north. The data behind those cells is coarser than that over
  most of the world: Mapterhorn's list of sources (read on 16 November 2026) gives
  Copernicus GLO-30, a 30 m model, as its worldwide source, with finer national models
  where a country publishes one. Whether a given source measures bare ground or the
  top of what stands on it was not checked source by source. Either way, a sharp
  summit or a narrow ridge reads a few metres low, and nothing narrower than a cell is
  there at all. The panel says how wide the cells that were read are.
- **How closely the path is sampled.** One sample for each cell of the finest terrain
  installed, since a height between two cells is only a blend of the cells around it
  and a closer sample would read nothing new. A profile holds at most 4,096 samples:
  about 47 km of path in Britain at the finest terrain, 78 km at the equator. A longer
  path is sampled more widely, and its heights are read from coarser tiles whose cells
  are between half a step and a step wide, so nothing between two samples is skipped;
  but each cell then stands for more ground, and a narrow ridge reads lower on a long
  path than on a short one. The panel says so when it applies.
- **Missing terrain.** Where no terrain is installed for part of the path, the panel
  names the stretch and gives no verdict: nothing in the way where terrain is known
  does not make the path clear. Ground above the line where terrain *is* known does
  make it blocked, whatever the gap hides. With no terrain under an end there is no
  ground to stand the antenna on, and nothing is worked out. Nothing is downloaded to
  fill a gap.
- **A blocked path may still work, and a clear one may not.** Signals bend over ridges,
  reflect, and are carried by the weather; a clear path can still be spoiled by
  reflection from the ground or by what stands on it. None of that is modelled.
- **Up to 1,000 km.** Further apart than that, no two points on the ground can see each
  other: from the top of the highest mountain the radio horizon is under 400 km away.
- **How long it takes.** Reading the ground for a 300 km path took about 0.23 seconds
  and 14 terrain tiles, and for a 690 km path about 0.28 seconds and 17, with tiles
  the size and format of a real download; the server went no longer than about 0.03
  seconds without giving other requests a turn (16 November 2026, Node 24 on a Mac).
  This was measured with made-up terrain in real-sized tiles, not with a Mapterhorn download.

### In the API

`GET /api/maps/terrain-profile?from=<lat>,<lon>&to=<lat>,<lon>` answers with the ground
along the great circle between the two points (`TerrainProfile` in
`packages/shared/src/radio.ts`): `distanceMeters`, `stepMeters`, `heights` (one for each
sample, both ends included, `null` where no terrain is installed), `coverage`
(`"terrain"`, `"partial"` or `"none"`), `gaps` (each stretch with no terrain, in metres
from the first point) and `terrain` (the width of the cells that were read). The ray,
the curve, the Fresnel zone and the verdict are worked out from that by `analyseSight`
in the same file; the web app runs it in the browser.

## Repeaters on the map

The repeaters you hold ([radio.md](radio.md#repeaters)) can be drawn over the map.
Outpost holds none until you import a list or enter some; it downloads none.

- **Repeaters**, among the radio buttons on the map, switches them on and off, and the
  choice is remembered in the browser. With none to draw, a card says so and leads to
  the Repeaters screen.
- **Few enough to tell apart, each is a small dot** in the map's ink colour, under
  saved places and routes. From about zoom 7.5 a dot has its callsign, and from 10.5
  the frequency to listen on beneath it. Names are placed only where they fit and give
  way to the map's own, so a town keeps its name. A repeater its list says is not
  operational is drawn hollow.
- **More than 400 in view are counted by patch.** The server counts them on a fixed
  grid, about eight patches to the height of the view, and each patch is a disc with
  its number at the middle of its repeaters. A patch holding one repeater is that
  repeater. Pressing a disc goes in closer. A worldwide list of 50,000 entries is about
  200 discs and 10 kB at the scale of the whole world.
- **Pressing a repeater opens a card**: what to listen on and the shift, access and
  modes, the town and locator, distance and bearing from where you are (or from the
  middle of the map when the device's position is not being followed), what its list
  said of its status, where the entry came from and the date of its data, and a
  sentence when its position is approximate. **Details** opens its own screen. A saved
  place or a route under the press is opened instead, and nothing opens while another
  tool is in hand.
- **Check line of sight** on the card takes up the [line-of-sight](#line-of-sight)
  tool with the repeater as point B. Point A is where you are if the map is following
  the device, and otherwise the next place you press. The repeater's end is named in
  the panel with what its position is worth ("listed position", or "listed only to
  about 5.56 km"), because the check is exact about a place the list may not be. The
  listed aerial height is on the repeater's own screen, to type in as the height at B;
  it is not filled in for you.

Links of the form `/maps?repeater=<id>` open the map on a repeater, and with `&sight=1`
(and optionally `&from=latitude,longitude`) go straight to the check; the repeater's
own screen and the search across everything use them.

Not drawn: repeaters with no position (a CHIRP file has none), repeaters on a printed
map, and coverage of any kind.

## Offline place search

Place search works from GeoNames data that you download once, and in Great Britain also
from Ordnance Survey's OS Open Names (see
[Place names for Great Britain](#place-names-for-great-britain)).

| Dataset | What it holds |
| --- | --- |
| `cities500` | Every town of more than 500 people, worldwide |
| `cities15000` | Larger towns and cities, worldwide |
| A country (two-letter code such as `GB`) | Everything Outpost keeps about that country |

From a country file Outpost keeps what is useful on a map: populated places;
mountains, passes, valleys, capes and islands; lakes, rivers, bays and other named
water; parks, reserves and forests; a short list of landmarks such as huts, stations,
airports, castles, lighthouses and hospitals; and countries with their first two
levels of division. Farms, wells and administrative odds and ends are left out.

Searching: every word you type must match the start of a word in the name or one of
its alternative names. Accents are ignored. Results are ordered by how well the name
matches, by population, and by distance from a point when one is given
(`near=<latitude>,<longitude>`).

### Limits

- **No house numbers, and no street addresses outside Great Britain.** GeoNames lists
  places, not streets or postcodes. In Great Britain, OS Open Names adds streets and
  postcodes (below); "High Street" finds the High Streets nearest the middle of the
  map, but "10 High Street" finds nothing.
- No businesses or points of interest beyond the short landmark list.
- No reverse look-up from a position to a place name.
- Only installed datasets are searched. Without any, typing a coordinate still works.

## Place names for Great Britain

Ordnance Survey publishes **OS Open Names**, a gazetteer of Great Britain, as OpenData.
Outpost downloads it on a press and reads it into the same place search as GeoNames:
**Offline maps → Place names → Place names for Great Britain**.

**What it holds** (October 2026 edition, counted from the file): 1,743,934 postcodes,
884,116 named roads and 5,161 numbered ones, 43,274 settlements (cities, towns,
villages, hamlets, parts of towns), 37,025 hills and mountains and some 39,000 other
landforms (valleys, islands, headlands, corries), 27,000 named waters, 121,000 woods
and other land cover, stations, ports, airfields, schools, hospitals and the like.
Each is kept with its name (and its other name where OS gives one: Welsh and English,
Gaelic and English), what it is in plain words ("Village", "Hill or mountain",
"Postcode"), its area ("Aberystwyth, Ceredigion, Wales"), and its position. Left out:
OS's "Section Of Named Road" and "Section Of Numbered Road" records (107,379), which
repeat a road once for every settlement it passes through.

**Hills.** OS's 1:50 000 Scale Gazetteer, the old list of every name on the Landranger
maps, was withdrawn long ago. OS Open Names has hills and mountains as a kind of its
own, and was checked to hold Helvellyn, Scafell Pike and Ben Nevis (with Beinn
Nibheis). It does not hold every name printed on a Landranger or Explorer map, and it
gives no heights.

**Postcodes.** Each postcode is one point, which OS describes as "the notional centre
created from all the addresses within the postcode unit". Search finds one however it
is typed: "SY23 3BY", "sy233by" and "Sy23 3by" are the same. A postcode typed in part
finds the area: "SY23" the postcode district and "SY23 3" the sector, each placed at the
middle of its postcodes, which Outpost works out from the file as it is read. A district
such as "SY23" is also a grid reference (a 10 km square in Dorset): both are offered.
Code-Point Open, OS's other postcode product, gives the same points with more about
each postcode's area; OS Open Names already has what a search needs, so it is not used.

**Not covered:** Northern Ireland, the Isle of Man and the Channel Islands. A postcode
beginning BT is answered with a sentence saying so.

**How big.** The download is 103 MB (October 2026 edition). Read into Outpost's
database it takes 519 MB with streets and 366 MB without (measured on this Mac:
2,956,719 and 2,067,442 rows with their search index). The choice is offered before
the download, and is the owner's to overturn: streets are kept unless the box is
cleared. The names are in the database, so they are also in its backups; the zip is a
file on the chosen storage location, like a map region, and is deleted with the names.
Reading it took 63 seconds on this Mac; on a Raspberry Pi expect five to ten minutes.
A search of the whole of it answers in under 5 ms for a word or a postcode; the slowest,
a two-letter start such as "st", took about 220 ms on this Mac with streets and 50 ms
without (not measured on a Pi; expect four to eight times as long).

**How current.** OS publishes a new edition every three months (January, April, July
and October). The tab says which edition is held, and **Check for a newer edition**
asks OS for the current one. A newer edition is downloaded and read in full and then
replaces the one held, whole; if it fails, the one held stays as it was.

**Where it comes from, and the terms.** Ordnance Survey's Downloads API at `api.os.uk`,
which needs no key and no account for OpenData. **Check the size** asks it two things:
the product's current edition, and the size and MD5 of the CSV file for Great Britain.
The download is that API's address, which redirects to OS's own file store; a download
that is cut off asks the API again and carries on from where it stopped. The finished
file is checked against OS's MD5 before it is read. OS OpenData is under the Open
Government Licence v3.0, whose one condition is the attribution statement: Outpost reads
it from the edition's own `Doc/licence.txt` ("Contains OS data © Crown Copyright and
database rights 2026") and shows it on the map while the names are installed, under the
search list when an OS result is in it, and in the Offline tab. The terms are quoted in
[sources.md](sources.md).

**Positions.** OS gives eastings and northings on the National Grid (OSGB36). Outpost
converts them to WGS 84 latitude and longitude with the seven-parameter Helmert
transformation in Ordnance Survey's *A guide to coordinate systems in Great Britain*
(v3.6, section 6.6 and annexes C.2 and D). OS gives its error as "up to 3.5 metres
(95%)"; Outpost states about 5 m. That is far finer than the difference between where
two sources put "the centre" of a village. The exact transformation, OSTN15, needs a
grid file Outpost does not ship. The conversion is tested against OS's worked example
in annexe D to within a centimetre.

**How results are ordered.** Your own saved places and routes come first, as before.
Then, in this order, so that nothing lower can outweigh anything higher: a name that is
exactly what was typed (or exactly one of its other names) before one that only starts
with it; a place, hill, lake or the like before a road or postcode, because roads share
names by the thousand (there are about thirty roads called Ambleside, and the town comes
first even when the map is over one of them); then a score of how well the text matches,
how big the place is (settlements by kind for OS, by population for GeoNames), and how
near it is to the middle of the map. A place OS and GeoNames both hold is listed once.

### Terrain from Ordnance Survey: why it was not added

OS Terrain 50, OS's open height data, is a 50 m grid (and 10 m contours made from the
same source), "verified to be 4m RMSE", updated each July. The terrain Outpost already
downloads (Mapterhorn) is, over Great Britain, made from 1 m lidar terrain models
(Environment Agency's LIDAR Composite DTM for England, the Welsh Government's 1 m DTM,
and the Scottish Government's Phase 1 lidar where it reaches), and elsewhere from
Copernicus GLO-30 at 30 m; Outpost keeps it to zoom 12, about 12 m a pixel at British
latitudes. That is finer than Terrain 50 everywhere in Britain, so Terrain 50 would
make the map coarser, not better, and was not added. Its one real advantage is that it
is a bare-earth model everywhere, where GLO-30 (used in Scotland outside lidar cover)
is a surface model that includes forest canopy; its contours are no better than the
ones Outpost traces, being made from the same 50 m source. Its licence (OGL) is no
cleaner in practice than Mapterhorn's sources, which are open licences each with its
credit.

## Satellite imagery

**Satellite** (the button with a satellite on it, after **Grey line** and
**Repeaters**; on a phone, in the menu at the end of the search box when the column has
no room for it) draws
pictures of the ground under the map's roads, paths, names and everything you have put
on it. The choice is remembered in the browser. The pictures come from Outpost's own
disk: nothing is fetched from the internet while you look at the map.

Two kinds can be downloaded, under **Offline maps → Satellite imagery**. Both are free
and need no account.

| | The world | A small area in detail |
| --- | --- | --- |
| From | NASA's Blue Marble: Next Generation, July 2004 | The European Union's Sentinel-2 satellites, Level-2A, one pass |
| Detail | 2 km a pixel (zoom 0 to 6), or 500 m (zoom 0 to 8) | 10 m a pixel, to about zoom 14 |
| What can be made out | Coasts, mountains, deserts, forests; at 500 m large towns, lakes and valleys | Fields, woods, lakes, rivers, the shape of a town; not single houses |
| Fetched | 256 MB (2 km) or 3.26 GB (500 m), from NASA | Only the parts of the scene's files that cover the area: about 16 MB for 100 km² |
| Kept on disk | 15.5 MB (2 km), measured; about 350 MB (500 m), estimated | Under 1 MB for 100 km² |
| Cloud | None: it is a cloud-free composite of a month | Whatever there was that day; you choose the day |

Where a government publishes its aerial photographs openly in a form Outpost reads,
a third kind is offered for an area beside the satellite's days: see
[Aerial photographs](#aerial-photographs). So far that is New Zealand and the lower 48
United States; England's are not offered, for the reason given there.

Several can be installed: the world and as many areas as you like. **The most detailed
one that covers the screen is drawn on top**; outside an area, or beyond the edge of a
scene, the coarser one beneath shows through, enlarged if need be, and where there is
none the map shows as usual. The button says when there is nothing to draw: "Satellite:
none downloaded yet", or "none downloaded for this area", and pressed, it says where to
get some.

**A picture is of one day.** The day is written in the credits under the map whenever
the picture is on screen ("Imagery 12 July 2026: Contains modified Copernicus Sentinel
data 2026"), beside each set in the list, and on a printed page. The world is how it
looked in July 2004; an area is how it looked on the day of its pass, with that day's
cloud, shadow, snow and season.

**Over a picture, names are given a wider halo** in the page colour (2 pixels, slightly
blurred) instead of the land colour they normally sit on, so that they stay readable
over dark woods and bright fields alike. Roads and paths keep their colours. Hill
shading, the land and water colours and buildings are beneath the picture and do not
show while it is on; contour lines are drawn over it.

### Choosing an area

1. **Offline maps → Satellite imagery → Choose an area.** Draw a box, or use the
   current view, and name it.
2. **Find pictures** asks the Sentinel-2 catalogue (Element 84's Earth Search) for
   scenes of the area from the last year, with no more than 80% cloud over the whole
   scene. Scenes taken by one satellite on one day are one pass and are joined. Each
   pass is listed with its day, its satellite, the publisher's cloud figure for the
   whole 110 km scene, and how much of the area it covers; those that cover all of it
   first, then the least cloudy.
3. **Continue** reads the index at the start of each of the scene's three files and
   its cloud map (a few hundred kilobytes) and shows, before anything else is fetched:

   - the picture, its day and its detail;
   - **cloud and cloud shadow over your area**, from the scene's own classification of
     every pixel (classes 3, 8, 9 and 10: shadow, cloud of medium and high
     probability, thin cirrus), read at about 80 m;
   - the area in km², **the bytes to fetch, exactly** (the publisher's files are cut
     into 10 km tiles, and only those the area touches are fetched), and the number of
     requests;
   - the size on disk (estimated), the time it will take (at 50 and at 10 megabits a
     second, plus the time to make the tiles), the number of scenes and so of seams;
   - the free space where it will be kept;
   - who it is from, the licence, and **the cost: none, and to nobody**;
   - that it is one moment's picture and not a seamless mosaic.

   If cloud covers what you care about, go back and choose another day.
4. **Fetch** starts it. It is a download like any other: it shows under Downloads, can
   be paused and resumed, survives a restart, and checks for room first. What has been
   fetched is kept beside the partial file until it is installed, so carrying on after
   a pause fetches nothing twice. Once installed it is listed with what was fetched to
   make it, and can be removed from the list or from Manage and clean up.

### How big an area

Above 400 km² the figures are spelled out in a sentence before the button. Above
2,500 km² the warning says it is large and that several smaller areas of the places
that matter are usually better (quicker, smaller, each with its own clear day), and
the download needs a tick that you have read it. Above 10,000 km² it is refused: one
job asking a free public service for several hundred megabytes, from many scenes, is
not what this is for.

Measured on 16 November 2026, a 10 km square over Derwentwater and Keswick (100 km²,
the scene of 12 July 2026), on this project's Mac (Apple M2 Max) and a home connection:

| | |
| --- | --- |
| Searching | 1 second |
| Working out the figures | 2 seconds, 0.27 MB read |
| Fetched | 16.3 MB in 17 requests (the estimate said 16.2 MB and 15) |
| Made | 111 tile positions from zoom 6 to 14, 7.3 seconds from start to installed |
| Kept | 327 kB (the same area from the scene of 12 November 2026 came to 574 kB) |
| Memory | about 90 MB more while it is made |

Transfer goes by the publisher's 10 km tiles, not by area: a 35 km² area within those
same tiles also needs 16.2 MB, and an area of 100 km² that straddles more of them needs
more, up to about four times as much. Not measured on a Raspberry Pi; the time shown
before fetching assumes one is four times slower than the Mac.

### What is done to the picture

Sentinel-2's Level-2A product is surface reflectance in thirteen bands. Outpost makes
true colour from the red, green and blue bands (B04, B03, B02), at their native 10 m:

1. Each value becomes reflectance by the scale and offset the publisher's metadata
   gives (for current scenes: value × 0.0001 − 0.1).
2. Reflectance from 0 to 0.3 is mapped to 0 to 1, anything above held at 1, and then
   put on the sRGB curve that screens expect, as 8 bits. These numbers are the same for
   every scene: no stretch is fitted to a picture, no colours are balanced, nothing is
   sharpened. 0.3 was chosen by looking at real scenes: bright enough for fields and
   woods to read, with cloud, snow and bright roofs going white.
3. Each map pixel at the deepest zoom is taken back to the scene's UTM grid and read by
   bilinear interpolation between the four nearest 10 m pixels; at the edge of the data
   the nearest pixel is used instead. Each coarser zoom is the average of four pixels
   of the one below. Nothing finer than the data is made: the deepest zoom is the first
   whose pixels are as fine as 10 m at the area's latitude (zoom 14 in Britain), and
   the map enlarges that if you zoom in further.
4. Where a scene has no data (beyond the edge of its swath) the next scene of the same
   pass is used; outside the area, and where no scene has data, the picture is
   transparent.

Tiles are WebP at quality 78, WebP rather than JPEG because the edge of an area must be
transparent. The quality was chosen by looking: zoom-14 tiles of Keswick at 60, 70, 78
and 90, beside the tile before compression, enlarged three times. At 60 and 70 the
streets of the town smear into blocks; 78 is close to 90 at about half the size (6.2 kB
a tile against 11.7 kB). Blue Marble tiles were looked at only at 78. A full tile at
zoom 14 is 3 to 9 kB: a screen of a phone holds about twenty, so a few hundred
kilobytes to fill it.

The world is made the same way, from NASA's picture in latitude and longitude: each
map pixel at the deepest zoom is the average of the picture's pixels whose centres fall
inside it, and each coarser zoom the average of four.

**What it would take to go further.** A cloud-free picture of an area means taking,
for each pixel, a clear view from many passes (a median of the scenes in a season,
with the scene classification used to throw out cloud and shadow first): perhaps
fifteen to thirty times the transfer of one scene, a pixel-by-pixel mask, and the
work of matching colours between days. Outpost has the pieces (the reader, the
classification, the reprojection) but not the compositing; it is not built.

### The world

**The world, 2 km a pixel** fetches NASA's single 21,600 × 10,800 GeoTIFF (256 MB)
and makes 5,461 tiles. Measured on the Mac above: 50 seconds to fetch, 36 seconds to
make, 15.5 MB kept, at most 700 MB of memory in use while making it.

**The world, 500 m a pixel** fetches NASA's eight 90° squares (3.26 GB) and makes
87,381 tiles. **It was not run**: the size kept (about 350 MB) and the time (perhaps
half an hour on the Mac above, most of it fetching) are estimates from the 2 km build.

Both are made from NASA's GeoTIFFs because they can be read a row at a time with the
compression Node already has, so the picture never has to be held in memory whole.
NASA's JPEG files are eight to thirteen times smaller to fetch, but reading them a
little at a time needs a JPEG decoder Outpost does not have.

### Aerial photographs

A national aerial photograph is taken from an aeroplane, not a satellite: 5 cm to 1 m a
pixel where Sentinel-2 is 10 m, so single houses, cars, paths and garden walls can be
made out. It is offered when **Find pictures** is pressed for an area a source covers,
listed before the satellite's days as "Aerial photograph, 7.5 cm" with the survey's
name and the season it was flown, and goes through the same confirmation.

| | New Zealand | United States (lower 48) |
| --- | --- | --- |
| Publisher | Toitū Te Whenua Land Information New Zealand (LINZ), for the councils and agencies that commissioned each survey | USDA Farm Service Agency's National Agriculture Imagery Program (NAIP) |
| Detail | 5 cm to 30 cm by survey (towns finer than farmland) | 30 cm, 60 cm or 1 m by state and year |
| Age | Surveys of the last ten years are offered; each region is flown every few years | Each state at least every three years; 2010 onwards |
| Terms | CC BY 4.0, credited to the survey's licensor: "Licensed by Environment Canterbury for re-use under CC-BY-4.0" | Public domain; "NAIP imagery provided by USDA Farm Service Agency" |
| Fetched from | `nz-imagery.s3.ap-southeast-2.amazonaws.com` (public, not requester-pays) | `naipeuwest.blob.core.windows.net`, found through `planetarycomputer.microsoft.com`, with a token anyone can have without an account |
| Form | Cloud-Optimised GeoTIFF, RGB with transparency, lossless WebP for the photograph and lossy WebP for its reduced copies, NZTM 2000 | Cloud-Optimised GeoTIFF (BigTIFF), red, green, blue and near infra-red, Deflate, NAD83 / UTM |

**Finding a survey.** New Zealand has no search service, but LINZ publishes a static
catalogue of every survey in the bucket. Outpost reads it (about 270 kB), keeps the
colour surveys of urban or rural photographs of the last ten years in the regions the
area touches (the regions' outlines are fixed in code, from every survey's extent on
16 November 2026), and reads only the last 12 kB of each survey's description, where
its extent, dates and licensor are; then each candidate's capture area, to say how much
of the area it covers. A search over Christchurch on 16 November 2026 took 11 seconds
and read about 1 MB. The files of a survey are sheets of LINZ's grid (the Topo50 map
sheets, cut into 240 by 360 m tiles at scale 1:500 or 2.4 by 3.6 km at 1:5,000), named
from that grid: Outpost works out which sheets the area touches and asks for the start
of each. A sheet the survey never flew answers 403 and is left out. The United States
has a search service (Microsoft's Planetary Computer, the STAC API it runs for NAIP):
one search, grouped into one choice per state and year.

**What is done to the photograph.** The publisher's colours are kept as they are: no
stretch, no colour balancing, no sharpening, nothing invented. The fourth band of NAIP
(near infra-red) is left out; the fourth band of LINZ's (transparency) marks where there
is no photograph, as do the black corners of NAIP's quarter-sheets. The deepest zoom is
the first whose map pixels are as fine as the photograph, **and no deeper than zoom 19**
(about 22 cm a map pixel in Christchurch, 23 cm in Colorado): a 5 or 7.5 cm photograph is
read from the publisher's own reduced copy that is as fine as zoom 19 (15 cm), which the
confirmation says. The map enlarges zoom 19 if you zoom in further. Below zoom 10 the set
has nothing: an area is a few pixels there, and the world or Sentinel-2 shows instead.
Each map pixel is read by bilinear interpolation from the publisher's grid, each coarser
zoom is the average of four pixels, and tiles are WebP at quality 78, as for Sentinel-2.

**Positions.** NZGD2000 and NAD83 are taken as WGS 84, which the map uses. They differ
by about a metre in New Zealand (the plates have moved since 2000) and by one to two
metres in the United States, so a photograph may sit a few pixels off the map's roads at
the deepest zoom. Outpost does not apply a datum shift.

**How much.** The warnings go by bytes and tiles, not area, because 7.5 cm of a square
kilometre is far more than 10 m of a hundred. Above 50 MB to fetch the figures are
spelled out. Above 10,000 map tiles (about 20 km²) or 300 MB to fetch the warning says it
is a lot for a photograph, meant for a town centre or a stretch of valley, not a county,
and needs a tick. Above 40,000 tiles (about 80 km²) it is refused before anything is
read, and above 1.5 GB to fetch it is refused once the size is known.

Measured on 16 November 2026, on this project's Mac (Apple M2 Max) and a home
connection, through the built app:

| | Christchurch centre, 1 km², LINZ 7.5 cm (March 2025) | Christchurch, 0.1 km², the same | Boulder, Colorado, 0.3 km², NAIP 30 cm (25 September 2023) |
| --- | --- | --- | --- |
| Find pictures | 10.4 seconds (both sources and Sentinel-2) | 11.7 seconds | 1.5 seconds |
| Working out the figures | 2.1 seconds, 20 of the survey's files | 1.5 seconds, 4 files | 0.9 seconds, 1 file |
| Fetched | 11.75 MB in 275 requests (the estimate said 11.75 MB) | 1.78 MB in 44 requests | 19.8 MB in 26 requests |
| Made | 512 tile positions, zoom 10 to 19 | 102 | 181 |
| Start to installed | 60 seconds | 11.5 seconds | 6.5 seconds |
| Kept | 4.63 MB | 565 kB | 1.39 MB |

NAIP costs more to fetch because its full-resolution tiles are lossless and carry the
near infra-red band, which is fetched with the rest and thrown away. Screenshots of the
runs at phone width were looked at: the photographs line up with the map and the
credit and season are under the map. Not measured on a Raspberry Pi; the time shown
before fetching takes 120 ms a tile on the Mac, four times that for a small computer.

### What it would take to add a country

A source is an entry in `modules/maps/imagery/aerial-sources.ts`: where its surveys are
found for an area, how its files are named, the projection of its grid, its credit and
licence, and its ceiling of zoom. The reader takes Cloud-Optimised GeoTIFFs of 8-bit
colour, uncompressed, Deflate or WebP, in WGS 84 UTM, NAD83 UTM or a Transverse Mercator
grid such as New Zealand's. Countries researched on 16 November 2026 and not built are
in [sources.md](sources.md#aerial-photographs), each with what is missing. In short:

- **England**: the Environment Agency's photographs are published only as ECW, a
  format whose decoder is closed (Hexagon's ECW SDK). If the Agency also offered
  GeoTIFF or COG, adding it would be the British National Grid projection (Transverse
  Mercator on the Airy ellipsoid, with the OSTN15 shift to WGS 84 for metre accuracy) and
  a search of its 5 km tiles.
- **Switzerland** (SWISSIMAGE 10 cm, open, COG, no key) and **the Netherlands** (8 cm,
  CC BY 4.0, tiled GeoTIFF, no key): both store JPEG in the TIFF (YCbCr), which needs a
  JPEG decoder, and use national projections (Swiss LV95, Dutch RD New) on other
  ellipsoids with datum shifts. Both are possible, and are the most useful next
  additions for a European user; neither was built.

### Where the pictures come from, and the terms

| | Blue Marble: Next Generation | Sentinel-2 Level-2A, Collection 1 |
| --- | --- | --- |
| Publisher | NASA Earth Observatory (produced by Reto Stöckli) | The European Union's Copernicus programme (ESA) |
| Fetched from | `assets.science.nasa.gov` | `e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com` (AWS Open Data, "No AWS account required", not requester-pays); scenes found through `earth-search.aws.element84.com` |
| Terms | NASA media "generally are not subject to copyright in the United States"; NASA asks to be acknowledged | "Free, full and open access" (Copernicus Sentinel data legal notice) |
| Credit shown | "NASA Earth Observatory" | "Contains modified Copernicus Sentinel data 2026" (the year of the picture) |
| Cost | Free | Free |

The publishers' own words, and where they were read, are in
[sources.md](sources.md#satellite-imagery). Nothing is bundled with Outpost.

**Why Collection 1.** Earth Search also lists the older `sentinel-2-l2a` collection
(bucket `sentinel-cogs`). In many of its files the values do not match the scale and
offset its own metadata gives: the scene of 12 July 2026 over Keswick has red values
around 130 where the metadata implies reflectance = value × 0.0001 − 0.1, which would
be negative. Earth Search's issue 71 reports the same, unanswered on 16 November 2026.
A picture made from it by the metadata comes out black. Collection 1's values (around
1,130 for the same pixel) agree with its metadata.

### The EOX cloudless mosaic, and why it is not here

EOX's Sentinel-2 cloudless is a cloud-free 10 m mosaic. Its original tiles were once
offered from an Amazon S3 bucket set to "requester pays" (`eox-s2maps`, eu-central-1,
named in EOX's 2017 post). On 16 November 2026 that bucket answered `NoSuchBucket`,
and none of EOX's current pages (cloudless.eox.at) mentions a bucket. EOX now offers
its data as purchased offline caches (from €1,500 a region; €5,000 to €6,000 a year's
mosaic of the world) and through its public map service, whose terms allow commercial
use of the 2016 layer "provided traffic is reasonable", prohibit it for 2018 onwards,
and say nothing that permits bulk downloading for keeping. So there is no route to
the files that a person's own AWS account could pay for, and Outpost does not fetch
EOX's mosaic at all. If EOX publishes files again on terms that allow keeping a copy,
the area tool could read them the same way it reads Sentinel-2's.

### Limits

- Areas cannot cross the 180° meridian, as for regions.
- **Not kept on a phone.** "Map areas on this phone" keeps map tiles and terrain, not
  imagery: out of reach of the server, a phone shows no pictures.
- Not tried on an iPhone, an iPad or a Raspberry Pi. Built and tested in Chromium on a
  Mac, at desktop size and at 390 pixels wide with touch.
- The 500 m world was not built (see above).
- Landsat (30 m) is not offered: on AWS its files are in a requester-pays bucket, so
  each download would be billed to an AWS account, and at 30 m it shows less than
  Sentinel-2.

## Keeping a map area on a phone

A phone that leaves the house cannot reach the server, and so cannot ask it for tiles.
The part of the map in view can be kept in the phone's browser, with routes and saved
places, from "Map areas on this phone" in the **Offline maps** tab. The tiles are
copied from the regions installed here, so download the region first. How it works,
its limits and what browsers do with the kept data are in
[offline.md](offline.md#a-phone-out-of-reach-of-the-server).

## What the screen costs at rest

Outpost is meant to sit open on a low-power machine for days, so the Maps screen does
nothing it does not have to while nobody touches it. Measured with
`e2e/tools/idle-cost.mjs` and a script of the same kind in headless Chromium on a Mac
(17 November 2026), over 12 seconds per state:

- At rest, with any of the panel's tabs open, the grey line, satellite imagery, contour
  lines and a reference layer on: no animation frames, no running animations and no
  requests of the screen's own. The grey line redraws once a minute (one frame), and
  the Sun tab and the line under the coordinates read the date again at midnight.
- While the page is hidden (a background tab, a locked phone): no frames and no timers
  of the screen's own.
- Map tiles are kept by the browser for an hour and asked about again with a tag the
  server answers with "not changed" (`docs/api.md`). The map itself is not given an
  expiry: it used to fetch every tile it held again each hour. A tile's address
  changes when the regions do, so nothing is missed.
- Recording a track: the work happens when a position arrives (about once a second on
  most phones). The card's clock ticks once a second while the page is in sight and not
  at all while it is hidden, when the line is not handed to the map either; both catch
  up when the page is looked at again. Stopping releases the screen and the position
  watch (checked in the same script: one lock taken, one released, one watch cleared).
- Panning by hand costs what MapLibre costs: frames while the map moves, none once it
  stops.

## What is not included

- **Surveyed contours and other topographic detail.** Contour lines are traced from
  the downloaded terrain (see [Contour lines](#contour-lines)) and are only as fine as
  it is. Crags, scree, spot heights and the like are not drawn.
- **Recording in the background.** A track is recorded only while the screen is on
  and Outpost is in front; see [Recording a track](#recording-a-track).
- **Routing.** Outpost does not calculate routes or directions. A route is imported
  from a GPX file, drawn by hand as straight lines between points, or found ready-made
  in OpenStreetMap; a drawn one never snaps to paths or roads.
- **Routes across the 180° meridian.** A drawn leg that crosses it is drawn the long
  way round the world.
- **Radio propagation or coverage.** The line-of-sight check is geometry over terrain
  (see [Line of sight](#line-of-sight)). It does not predict signal strength, and it
  does not draw the area a station covers.
- **Repeater coverage, and repeaters you have not put in.** The map draws the repeaters
  you hold as points (see [Repeaters on the map](#repeaters-on-the-map)); the map
  fetches no list and draws no coverage.
- **Aerial photographs outside New Zealand and the lower 48 United States, satellite
  imagery finer than 10 m, and cloud-free mosaics.** Satellite imagery is the world at
  2 km or 500 m and chosen areas at 10 m, each a picture of one day (see
  [Satellite imagery](#satellite-imagery)); aerial photographs are offered only where
  a publisher's terms and file format allow (see
  [Aerial photographs](#aerial-photographs)).
- **The time zone of a place, moonrise and moonset.** Sun times are shown on the
  device's clock or in UTC (see [Time zones](#time-zones)).
- **Other map schemas.** The bundled styles draw the Protomaps basemap schema only.

These match the limits listed in
[architecture.md](architecture.md#limits-and-trade-offs).

## If map labels are missing

Map label fonts and icons are fetched when Outpost is built, not at run time. A build
made without them draws roads and land but no names. See
[troubleshooting.md](troubleshooting.md#the-map-has-no-labels).

The API for everything on this page is listed in [api.md](api.md#maps).
