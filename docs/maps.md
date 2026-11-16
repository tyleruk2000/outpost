# Offline maps

This page covers downloading map regions and choosing where they are kept, hill
shading and contour lines, where the map data comes from and how it must be credited,
using your own map source, markers and moving them, drawing routes, recording a track
as you walk, importing GPX tracks, coordinate formats, and offline place search.

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
  [Coordinate formats](#coordinate-formats), or a British grid reference.
- The **ruler** measures a path you click out, in kilometres and miles. **Save as a
  route** keeps the measured path as a route.
- **Record a track** (the ring with a dot in it) records where you walk, on the device
  in your hand (see [Recording a track](#recording-a-track)).
- **Hill shading** appears as a button once terrain is installed.
- **Contour lines** is the button below it (see [Contour lines](#contour-lines)). It
  is always there: pressed where there is nothing to draw them from, it says so.
- The readout at the bottom shows the centre of the map; choose decimal degrees,
  degrees-minutes-seconds or British National Grid, and copy it.
- Right-click (or press and hold) for "Save a place here", "Measure from here", "Draw
  a route from here" and "Copy coordinates".
- The address bar always holds the current view, so a link to it can be saved in a
  note.

Before any region is installed the map shows a plain outline of the world, which
ships with Outpost, and offers the world overview as a first download.

"Show where I am" and "Record a track" need HTTPS, which browsers require before they
share a location, so on a plain `http://` LAN address they say so instead.

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

Notes:

- Latitude comes first unless hemisphere letters say otherwise.
- A grid reference names a square. Outpost returns the middle of it, and reports the
  size of the square (100 m for six figures, 10 m for eight, 1 m for ten).
- National Grid positions are converted with the Ordnance Survey's standard seven-
  parameter transformation, which is accurate to about five metres. That is finer than
  a hand-typed reference, but it is not survey grade.
- Grid references are only meaningful in Great Britain. There is no support for UTM,
  MGRS or the Irish Grid.

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
- **Recording in the background.** A track is recorded only while the screen is on
  and Outpost is in front; see [Recording a track](#recording-a-track).
- **Routing.** Outpost does not calculate routes or directions. A route is either
  imported from a GPX file or drawn by hand as straight lines between points; it never
  snaps to paths or roads.
- **Routes across the 180° meridian.** A drawn leg that crosses it is drawn the long
  way round the world.
- **Satellite or aerial imagery.**
- **Other map schemas.** The bundled styles draw the Protomaps basemap schema only.

These match the limits listed in
[architecture.md](architecture.md#limits-and-trade-offs).

## If map labels are missing

Map label fonts and icons are fetched when Outpost is built, not at run time. A build
made without them draws roads and land but no names. See
[troubleshooting.md](troubleshooting.md#the-map-has-no-labels).

The API for everything on this page is listed in [api.md](api.md#maps).
