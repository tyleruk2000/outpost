# Offline maps

This page covers downloading map regions and choosing where they are kept, hill
shading and contour lines, printing part of the map as a one-page PDF, where the map
data comes from and how it must be credited, using your own map source, markers and
moving them, sunrise and sunset for a place, drawing routes, recording a track as you
walk, importing GPX tracks, coordinate formats, Maidenhead locators, checking line of
sight between two points, and offline place search.

Outpost draws a vector map in the browser from tiles it serves itself. Once a region
is installed, viewing it needs no internet connection.

**OpenStreetMap's public tile servers are never used.** Map data is downloaded as
regional extracts of a published archive, on request, and then served from your own
disk.

## The Maps screen

The map fills the screen, with a panel beside it (a sheet you can drag up on a phone)
that has four tabs.

- **Places** lists your saved places. **Save a place** drops a pin you can drag; give
  it a name, a note, a colour, and mark it a favourite to keep it named on the map.
  A saved place can be moved without opening it (see
  [Moving a saved place](#moving-a-saved-place)).
- **Routes** lists routes you have drawn and GPX tracks you have imported. Open one
  for its distance, ascent and an elevation profile; move along the profile and the
  matching point is shown on the map. **Draw a route** places one point by point (see
  [Drawing a route](#drawing-a-route)). Drop a `.gpx` file anywhere on the map to
  import it.
- **Offline maps** lists installed regions and is where you download more: pick a
  ready-made region, or draw a box on the map (or use the current view), choose how
  much detail and which storage location it goes to, and see the exact size before
  anything is fetched.
- **Sun** gives sunrise, sunset, twilight and the moon's phase for the centre of the
  map, for any date, with nothing saved and nothing searched for (see
  [Sunrise and sunset](#sunrise-and-sunset)).

On the map itself:

- The **search box** takes a place name (once place names are downloaded, see
  [below](#offline-place-search)), coordinates in any of the formats under
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
- **Maidenhead locator grid** and **Line of sight between two points** are the two
  buttons below those (beside the top of the column on a phone). See
  [Maidenhead locators](#maidenhead-locators) and [Line of sight](#line-of-sight).
- **Print or save as PDF** is the last button in that column (see
  [Printing a map](#printing-a-map)).
- The readout at the bottom shows the centre of the map; choose decimal degrees,
  degrees-minutes-seconds, British National Grid or Maidenhead locator, and copy it.
- Right-click (or press and hold) for the position and its locator, "Save a place here",
  "Measure from here", "Draw a route from here", "Sun times here" and "Copy coordinates".
- A place, a found position and where you are each have a **Sun** line of their own:
  the same times, for that position.
- The address bar always holds the current view, so a link to it can be saved in a
  note.

Before any region is installed the map shows a plain outline of the world, which
ships with Outpost, and offers the world overview as a first download.

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
- Tracing happens in a background worker, so the map stays responsive, and what has
  been traced is kept while the page is open. The first look at a new area takes a
  moment longer than hill shading does.
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

### The browser's own Print

While the page is open, the browser's Print (Ctrl or ⌘ P, or the **Print** button once
the PDF is made) prints the sheet alone, at the size of the paper chosen. Before the
PDF is made the map in it is the preview's, at 120 dots to the inch; after, it is the
full-resolution one. The PDF is the dependable way: a browser adds its own margins and
headers unless told not to, and not every browser honours a page size set by a page.

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

## Where the data comes from

| Data | Source | Licence | Credit shown |
| --- | --- | --- | --- |
| Map tiles | The [Protomaps](https://protomaps.com) daily planet build, made from [OpenStreetMap](https://www.openstreetmap.org/copyright) data | ODbL 1.0 | "Protomaps © OpenStreetMap" |
| Terrain | The [Mapterhorn](https://mapterhorn.com/attribution) planet archive | Various open licences; see mapterhorn.com/attribution | "© Mapterhorn" |
| Place names | [GeoNames](https://www.geonames.org) | CC BY 4.0 | "Place names: GeoNames (CC BY 4.0)" |
| A simple world outline drawn beneath the map, and the boxes of the country presets | Natural Earth 1:110m | Public domain | "Natural Earth" |
| Map style | Protomaps basemap styles | BSD-3-Clause | |
| Map label fonts | Noto Sans | SIL Open Font License 1.1 | |
| Contour lines | Traced on your device from the terrain above, by maplibre-contour (code, BSD-3-Clause) | As the terrain | "© Mapterhorn" |

The first three are downloaded by you, on request. The outline, style, fonts, map
icons and the code that traces contour lines are bundled with Outpost. The terrain
credit is shown while hill shading or contour lines are on.

### Attribution you must keep

OpenStreetMap data is licensed under the Open Database Licence, and GeoNames under
CC BY 4.0. Both require credit wherever the data is shown.

- Outpost supplies the credits with the map sources (`GET /api/maps/sources`,
  fields `attribution` and `attributions`) for the map's attribution control. Do not
  hide or remove them.
- A page made with **Print or save as PDF** carries the credits itself, with the
  address for each written out (see [Printing a map](#printing-a-map)). Do not crop
  them off.
- If you publish screenshots or maps printed some other way, include "© OpenStreetMap
  contributors" and, where terrain or place names appear, the Mapterhorn and GeoNames
  credits.
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
red, green, blue, violet, slate), a favourite flag, and optionally a link to one of
your note pages. Markers are found by the app-wide search.

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

The quickest way to them is the **Sun** tab of the panel, which is on screen whenever
the map is: on a phone it is one of the four names on the sheet at the bottom. It
gives the times for **the centre of the map**, the same point the readout at the
bottom of the map gives and, on a touch screen with the sheet lowered, the one the
cross marks. The day's sunrise and sunset come first, with everything else under them.
Move the map and the times follow, once it has come to rest. Nothing has to be saved,
searched for, or pressed and held.

**On a phone, with the sheet raised, the centre of the map is behind the sheet's top
edge**, not in the middle of the part of the map still showing. The tab gives the
coordinates the times are for; to aim, lower the sheet, put the cross on the place, and
choose the tab again. Zoomed in far enough to pick out a town the difference is a
minute or less; looking at a whole country it can be many minutes.

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

Folded, it is one line with the day's sunrise and sunset. Opened, it shows:

| Row | What it is |
| --- | --- |
| First light, last light | The start and end of civil twilight: the centre of the sun 6° below the horizon. In clear weather there is enough light to see by between them. |
| Sunrise, sunset | The upper edge of the sun on the horizon, each with the true bearing of the point on the horizon where it happens, written as the ruler writes bearings ("49° NE"). The bearing is from true north, not magnetic north. |
| Solar noon | The sun at its highest, due south or due north, and how high its centre is then. |
| Day length | Sunrise to sunset, and how much longer or shorter that is than the day before. |
| Nautical twilight | The sun less than 12° below the horizon. |
| Moon | The phase by name and the percentage of the face that is lit, at the place's solar noon. |

It opens on today's date as this device has it. The date can be typed or picked, the
arrows beside it step a day either way, and **Today** comes back. Dates from 1900 to
2100 are taken. Whether the section was left open, and which clock was chosen, are
remembered in the browser.

On a phone, "Sun times here" and a found position put their card over the map, and the
opened section scrolls inside the card. The card covers the search box and the map's
controls while it is up; the Sun tab does not.

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

Not included: moonrise and moonset (the moon's distance and the place both matter, and
it is a longer sum), astronomical twilight, bearings from magnetic north, and any
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
the map clear. Leaving the Maps screen for another part of Outpost does not stop a
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

## GPX tracks

- **Import.** Upload one `.gpx` file at a time, up to 20 MB. Tracks and routes become
  a track on the map. Waypoints in the file either stay with the track or, if you ask,
  become markers; never both.
- **What is read.** GPX 1.0 and 1.1. From a track or a route: its name, its description
  (or its comment, when it has no description) and its points with their heights; from
  a track, the time of each point too, when every point of a segment has one. From a
  waypoint: name, description, time, symbol and height. The file's own name is the one
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
  Waypoints turned into saved places have a smaller limit of their own, 5,000 from one
  file, because each place is written on the server's own thread at about 0.2 ms
  apiece and that many hold everything else up for about a second. A file with more is
  refused with a message saying so; imported with its waypoints kept on the route, the
  same file is no trouble.
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
  (`GET /api/maps/export.gpx?markers=1&tracks=<id>,<id>`). The output is GPX 1.1. An
  imported track, a drawn route, places alone and a mixed selection were each checked
  against the published GPX 1.1 schema with `xmllint` on 15 November 2026, with names
  containing `<`, `&`, quotation marks and accented letters; all four validated. Opening
  the files in other map programs has not been tried.
- **A drawn route in GPX.** It is written as a track (`<trk>` with one `<trkseg>`),
  which more apps read than a `<rte>`, and which no device will try to re-plan along
  roads. It carries the route's name, one `<trkpt>` for each point you placed with its
  latitude and longitude, and an `<ele>` where a height is known. There are no `<time>`
  elements: a drawn route was never walked. The samples taken between your points for
  the elevation profile are not exported.
- **Numbers.** Latitudes, longitudes and heights are always written as plain decimals
  (never in a form such as `5e-8`, which GPX does not allow).
- **Safety.** A GPX file is checked before it is read: files with a DOCTYPE or entity
  declarations are refused. It is then read in one pass that keeps only what is stored,
  so the memory a file costs depends on the points in it and not on how its XML is
  shaped; see [security.md](security.md#files-people-upload). Positions are stored to
  six decimal places.

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

## Line of sight

**This is a check of geometry against terrain. It is not a prediction of signal
strength, propagation or coverage.** It answers one question: with an antenna this
high at each end, does the ground between two points stand in the way of the straight
line between them, and by how much does it clear?

### Using it

1. Press **Line of sight between two points**, then click or tap the map at each end:
   point A, then point B. Pressing a saved place puts the point exactly on it. Without
   a pointer, move the map and use **Use the centre of the map**. Or measure a path
   with the ruler and choose **Check line of sight**.
2. Give the height of the antenna at each end, in metres above the ground it stands
   on, and choose a band (10 m to 13 cm, and PMR446) or type a frequency. The heights
   and the band are remembered in the browser.
3. Read the answer in the panel beside the map (on a phone, **Show the path and the
   details** raises it). Changing a height or the band answers again at once.

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

## Offline place search

Place search works from GeoNames data that you download once.

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

- **No street addresses.** GeoNames lists places, not streets, house numbers or
  postcodes. Searching for "10 High Street" finds nothing.
- No businesses or points of interest beyond the short landmark list.
- No reverse look-up from a position to a place name.
- Only installed datasets are searched. Without any, typing a coordinate still works.

## Keeping a map area on a phone

A phone that leaves the house cannot reach the server, and so cannot ask it for tiles.
The part of the map in view can be kept in the phone's browser, with routes and saved
places, from "Map areas on this phone" in the **Offline maps** tab. The tiles are
copied from the regions installed here, so download the region first. How it works,
its limits and what browsers do with the kept data are in
[offline.md](offline.md#a-phone-out-of-reach-of-the-server).

## What is not included

- **Surveyed contours and other topographic detail.** Contour lines are traced from
  the downloaded terrain (see [Contour lines](#contour-lines)) and are only as fine as
  it is. Crags, scree, spot heights and the like are not drawn.
- **Recording in the background.** A track is recorded only while the screen is on
  and Outpost is in front; see [Recording a track](#recording-a-track).
- **Routing.** Outpost does not calculate routes or directions. A route is either
  imported from a GPX file or drawn by hand as straight lines between points; it never
  snaps to paths or roads.
- **Routes across the 180° meridian.** A drawn leg that crosses it is drawn the long
  way round the world.
- **Radio propagation or coverage.** The line-of-sight check is geometry over terrain
  (see [Line of sight](#line-of-sight)). It does not predict signal strength, and it
  does not draw the area a station covers.
- **Satellite or aerial imagery.**
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
