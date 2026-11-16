# Offline maps

This page covers downloading map regions and choosing where they are kept, hill
shading and contour lines, where the map data comes from and how it must be credited,
using your own map source, markers and moving them, drawing routes and importing GPX
tracks, coordinate formats, Maidenhead locators, checking line of sight between two
points, and offline place search.

Outpost draws a vector map in the browser from tiles it serves itself. Once a region
is installed, viewing it needs no internet connection.

**OpenStreetMap's public tile servers are never used.** Map data is downloaded as
regional extracts of a published archive, on request, and then served from your own
disk.

## The Maps screen

The map fills the screen, with a panel beside it (a sheet you can drag up on a phone)
that has three tabs.

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

On the map itself:

- The **search box** takes a place name (once place names are downloaded, see
  [below](#offline-place-search)), coordinates in any of the formats under
  [Coordinate formats](#coordinate-formats), a British grid reference, or a Maidenhead
  locator.
- The **ruler** measures a path you click out, in kilometres and miles, and gives the
  locators of its two ends. **Save as a route** keeps the measured path as a route;
  **Check line of sight** hands its first and last points to the tool described under
  [Line of sight](#line-of-sight).
- **Hill shading** appears as a button once terrain is installed.
- **Contour lines** is the button below it (see [Contour lines](#contour-lines)). It
  is always there: pressed where there is nothing to draw them from, it says so.
- **Maidenhead locator grid** and **Line of sight between two points** are the two
  buttons below those (beside the top of the column on a phone). See
  [Maidenhead locators](#maidenhead-locators) and [Line of sight](#line-of-sight).
- The readout at the bottom shows the centre of the map; choose decimal degrees,
  degrees-minutes-seconds, British National Grid or Maidenhead locator, and copy it.
- Right-click (or press and hold) for the position and its locator, "Save a place here",
  "Measure from here", "Draw a route from here" and "Copy coordinates".
- The address bar always holds the current view, so a link to it can be saved in a
  note.

Before any region is installed the map shows a plain outline of the world, which
ships with Outpost, and offers the world overview as a first download.

Not there yet: "locate me" needs HTTPS, which browsers require for location, so it
explains this on a plain `http://` LAN address.

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
- If you publish screenshots or printed maps, include "© OpenStreetMap contributors"
  and, where terrain or place names appear, the Mapterhorn and GeoNames credits.
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

## What is not included

- **Surveyed contours and other topographic detail.** Contour lines are traced from
  the downloaded terrain (see [Contour lines](#contour-lines)) and are only as fine as
  it is. Crags, scree, spot heights and the like are not drawn.
- **Routing.** Outpost does not calculate routes or directions. A route is either
  imported from a GPX file or drawn by hand as straight lines between points; it never
  snaps to paths or roads.
- **Routes across the 180° meridian.** A drawn leg that crosses it is drawn the long
  way round the world.
- **Radio propagation or coverage.** The line-of-sight check is geometry over terrain
  (see [Line of sight](#line-of-sight)). It does not predict signal strength, and it
  does not draw the area a station covers.
- **Satellite or aerial imagery.**
- **Other map schemas.** The bundled styles draw the Protomaps basemap schema only.

These match the limits listed in
[architecture.md](architecture.md#limits-and-trade-offs).

## If map labels are missing

Map label fonts and icons are fetched when Outpost is built, not at run time. A build
made without them draws roads and land but no names. See
[troubleshooting.md](troubleshooting.md#the-map-has-no-labels).

The API for everything on this page is listed in [api.md](api.md#maps).
