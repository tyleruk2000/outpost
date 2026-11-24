# Offline maps

Outpost draws the map in the browser from tiles it serves itself. Once a place is added
under **Offline maps**, its map needs no internet. OpenStreetMap's public tile servers are never used.

More on the map: [Routes and tracks](map-routes.md), [Road routes](road-routes.md), [Printing a map](map-printing.md),
[Satellite imagery](map-imagery.md), and the [map quick start](map-quick-start.md).

## The Maps screen

The panel beside the map (a sheet you drag up on a phone) has five tabs: **Places** (saved
places), **Routes** ([map-routes.md](map-routes.md) and [road routes](road-routes.md)),
**Layers** ([reference-layers.md](reference-layers.md)), **Offline** (what covers the view,
adding an area, satellite pictures, keeping the view on a phone) and **Sun**
([Sunrise and sunset](#sunrise-and-sunset)).

The buttons on the map: the **search box** (place names, postcodes in Great Britain, or any
of the [Coordinate formats](#coordinate-formats)), **Measure a distance** (then **Save as a
route** or **Check line of sight**), **Draw a route**, **Save a place**, **Show where I
am**, **Record a track**, **Hill shading**, **Contour lines**, **Map style**, **Find where
you are from bearings**, **Print or save as PDF**, **Road numbers**, **Magnetic north
lines**, **UTM grid**, **Maidenhead locator grid**, **Grey line (day and night)**,
**Repeaters**, **Satellite imagery** and **Line of sight between two points**. Where there
is not room for them all, as on a phone, the column shows as many as fit and **More** under
it lists every tool by name. A tool taken up on a phone has its card at the foot of the
screen in place of the tabs; close the card to have the tabs back. Pinch to zoom.

Right-click the map (press and hold on a touch screen) for **Save a place here**, **Measure
from here**, **Draw a route from here**, **Plan a route from here**, **Plan a route to here**,
**Reachable from here**,
**Sun times here**, **Estimated radio range from here**, **How far on foot from here** and
**Copy coordinates** (and **Move** on a saved place).

From the keyboard, the point is the cross at the centre of the map. Tab to the map, move it
with the arrow keys (plus and minus zoom), then press **Shift F10** (or the menu key) for the
same menu at the centre. While measuring, **Enter** adds the centre as the next point; with
**Save a place** in hand, **Enter** saves the centre; while drawing a route, **Enter** adds a
point there. The measuring and drawing cards have a button that does the same. A position, grid
reference or locator typed in the search box opens a card for it, which takes the keyboard.

The readout at the bottom gives the position of the cross at the centre of the map (with a
mouse, of the pointer, marked "Pointer"). Choose its format: decimal degrees,
degrees-minutes-seconds, British National Grid, Irish Grid, Irish Transverse Mercator (ITM),
UTM, MGRS or Maidenhead. Away from the grid you chose (Great Britain, or Ireland for the two
Irish ones) it shows decimal degrees and says so. Press it to copy.
Beside it are the height of the ground and magnetic north's angle ("Magnetic 0.6° W"),
which opens Tools → Compass ([tools-compass.md](tools-compass.md)). The address bar holds
the current view, so a link to it can be kept in a note.

**Show where I am** and **Record a track** need a secure address; on plain `http://` they
point to **Settings → HTTPS on your network**
([deployment.md](deployment.md#https-on-your-network)).

### The height of the ground

The readout shows the ground's height after the coordinates ("57.00000, -3.39897 · 100 m");
on a phone, open the readout to see it. Where no terrain covers the point nothing is shown,
never a guess, and **Get terrain** is offered. It is the ground thereabouts from the finest
terrain installed, mostly a 30 m model, so a summit reads a few metres low. Metres or feet:
**Settings → Appearance → Heights**.

## Offline maps: everything kept for the map

**Maps → Offline maps** (also **All offline maps** in the Offline tab, and **Manage** under
Storage) is the one place map data is added, updated, moved and removed. The line under the
title says how much there is and where.

Each place is one row: a country, a part of one, an area drawn on the map, or **World
basics** (the world overview, the world's towns, borders and airports). A row says where
each thing a place can have stands:

| | What it is for |
| --- | --- |
| **Map** | The map to look at, its hills and heights, and its towns found by name |
| **Routes** | Planning a drive |
| **Nearby places** | Hospitals, shelters, food and supplies, on the map and in the lists of what is nearest |
| **Walk/cycle** | Walking, cycling and door-to-door routes, where the optional Walking and cycling add-on is installed |

On a phone the row is the place's name, its size and **…**, then one line ("Map, Routes 43%,
Nearby places: Add"); on a wider screen the same rows line up as a table. **Add** in a row
starts Add a place for that place with that ticked. A row opens to what is behind each word:
the day the data is from, where it is kept, the source file, and progress with Pause and
Cancel.

Every row, whatever it holds, says where it stands in the same words: **Not added**,
**Waiting**, **Downloading 1.0 of 2.3 GB, 19 min left**, **Building**, **Ready, from 17 Nov
2026**, **Over a year old**, **Failed:** and what to do, **Storage not connected**, **Moving**.
Its **…** menu has the same actions in the same order: **Update**, **Move…**, **Remove…**,
**Details**.

Above the rows, a line follows anything downloading ("United Kingdom routes: 1.0 of 2.3 GB,
19 min") and leads to it; another says how many places are over a year old, with **Check for
updates**. Below them: whether walking and cycling is set up, what is kept on this phone, and
**Sources and licences**.

### Add a place

One button, **Add a place**, wherever a map, routes or nearby places are offered.

1. **Where?** Type a country, a region or a town in **Country, region or town**; a town says
   which country it is in and, where Outpost knows it, the part of it: "Chamonix-Mont-Blanc is
   in France: Rhône-Alpes (smaller) or all of France". This is answered on the device: nothing
   is looked up elsewhere. Or tap a country on the small map of the world, or choose a
   suggestion: where the map is now, home, the whole world, **Draw an area on the map**, or
   **Import a file**. Nothing is chosen for you.
2. **What for France?** **Map** and **Routes** are ticked, **Nearby places** is not.
   Ticked, **Nearby places** opens to **Which kinds** (see below). The source file is one
   line under the ticks (see below). **More choices** has the detail of the map, hills and
   heights, and where things are kept. A country Geofabrik also publishes in parts says so
   ("Germany comes in 16 parts, 4.3 GB together. All are ticked."): untick the parts you do
   not need, and only those are read. A press anywhere on a row ticks it.
3. **Check size** asks the map sources how large it is; the first time, it reads Geofabrik's
   list of regions too (download.geofabrik.de). Nothing is downloaded yet.
4. **Download · 4.1 GB**. Progress shows at the top of Offline maps and under **Downloads and
   tasks**; you can leave the screen.

A route that needs countries you have no roads for opens the same steps with those countries
and **Routes** ticked. A layer with nothing held, in the Layers tab, opens them with its kind
ticked ("Add hospitals for United Kingdom"). For Great Britain, a map's place names come from Ordnance Survey's OS
Open Names, with nothing more to choose (see below).

### Which kinds of nearby places

Nearby places are the layers drawn on the map and listed by what is nearest. Under **Which
kinds**, each is ticked on its own, grouped by where it comes from:

- **A country**: hospitals; police, fire and ambulance; shelters and assembly points; food
  and supplies (shops, markets, fuel, drinking water, food banks, pharmacies); military
  sites; nuclear facilities; waymarked routes; rights of way. All are read from the source
  file, with nothing more downloaded. Also population density (WorldPop), and in Switzerland
  the official emergency meeting points.
- **World basics** (the whole world): country boundaries, regions and populated places
  (Natural Earth), airports and airfields (OurAirports), nuclear power stations and research
  reactors (Wikidata).
- **An area you draw**: the same kinds asked of an Overpass server for the area, registered
  food shops in the UK, flood zones in England (up to about 20 km across), and airports.

What is held already says **Held**. Adding a kind never takes away those held: the kinds held
are read again with it. After **Check size**, each kind from its own source shows its size.
Wikidata and the Overpass servers ask to be told what is asking: tick **Send Outpost's name
to …** (the name is shown word for word); nothing is asked of them until you do.

Nearby places are updated and removed with the rest of the place: **Update** and **Remove…**
in its **⋯** menu. A set from its own source is checked with **Check**, then **Update**.

### The source file

Routes and nearby places are read from a country's whole OpenStreetMap record, a separate
file from Geofabrik (4.9 GB for France). It is always one line under the ticks:

- The first time, both choices are shown, each with its reason, and nothing is chosen for
  you:
  - **Keep it**: needed to add walking and cycling later, or to update without downloading
    again. The location with the most room is suggested. On a drive that is switched off,
    routes keep working and updating waits.
  - **Delete it after reading**: saves its space (2.3 GB for the United Kingdom). Routes and
    nearby places keep working; walking and cycling or an update downloads it again.
- After that, the choice you made is said in one line with **Change**: "Source file (2.3
  GB): kept on NAS. Needed to add walking and cycling or update without downloading again ·
  Change".
- With **Walking and cycling** ticked the file is kept, because it is built from it:
  "Source file (4.9 GB): kept on NAS. Walking and cycling is built from it, so it is kept."

The total under the ticks says what happens to the file either way. With the file kept,
adding routes or nearby places reads it again with no download (**Build from the kept
file**).

### Updating

Something over twelve months old says **Over a year old**; sets made once and never revised
(Natural Earth's borders, census grids) never do. **Check for updates** lists each place
("France · Map from 1 Jun 2025"), and **Update** in a row's menu does the same for one place.
Nothing is checked or downloaded until you press:

- **Check** asks the source, named first, how large and how new its newest copy is. **Update**
  downloads it to the same storage location. What you have stays, and is used, until the new
  one is in place and checked; a download that stops leaves it as it was. The new one needs
  room beside the old one while it downloads.
- Routes and nearby places are read again from the kept source file with no download, or
  from a newer one (**Download a newer file**).
- **Update all** does every place listed. A map imported from a file of your own cannot be
  fetched again: import a newer file.

### Removing

**Remove…** in a row's menu lists what the place has, each with its size, ticked; the source
file is listed unticked. It says what stops working ("Saved routes keep their directions.")
and what is freed: **Remove · frees 3.1 GB**. What is on a storage location that is not
connected is left there until it is back.

### An area of the map

**Offline** on the Maps screen shows what covers the view, with **Add this view** and **Draw
an area** (drag a box on the map; Escape stops). Both open Add a place with that area, where
you name it. A box cannot cross the 180° meridian (make two), and a map of over about 20
million tiles is refused: choose less detail under **More choices**. The detail levels:

| Detail | Roughly what you see |
| --- | --- |
| Roads and towns | Towns, most roads |
| Villages and tracks | Villages, tracks, larger streams |
| Footpaths and buildings, Everything | Streets and paths, for walking |

Hills and heights are less detailed than the most detailed map: the source stops before
footpath detail. Downloads can be paused and survive a
restart.

## Map styles

**Map style** switches between styles drawn from the same maps, so nothing is downloaded:

| Style | For |
| --- | --- |
| Standard | The usual map, light or dark with the app. |
| Road map | Roads coloured by importance. |
| Road map, UK atlas colours | Motorways blue, primary routes green, A roads red, B roads orange. |
| Walking | Paths and tracks stronger; switches on hill shading and contours. |
| High contrast | For bright sun. |
| Night (red) | Reds only, to keep your eyes for the dark. The whole screen goes dark and red with it: the panel, the search box, the sidebar and the menus. Satellite imagery is shown grey and dim, and an estimated range or a walk's reach in reds of their own. |
| Low ink | For printing. |

**Road numbers** writes M6, A591 and the like on main roads from about zoom 7. **Magnetic
north lines** draws blue lines pointing to magnetic north at the angle for the centre of the
view; on a large area, zoom in where you are working. **UTM grid** draws lines of equal
easting and northing every 10 km, 1 km or 100 m as you zoom in, each marked in kilometres,
with the zone written above the centre ("UTM 30U"); near a zone's edge the lines carry on in
the zone of the centre of the view. A printed page starts with its UTM grid ticked when the
map has it on.

## Contour lines

**Contour lines** are traced on your device from the terrain you downloaded. Lines are 200 m
apart at zoom 9, closing to 10 m at zoom 15; heavier index lines carry their height. Below
zoom 9 none are drawn.

**They are only as fine as the terrain**, a grid of cells 10 m or more across: they show the
shape of a hillside, not a crag or a narrow gully, and are not surveyed contours. Do not
rely on them where a few metres matter. Where there is no terrain the button says so.

## Finding where you are from bearings

With no GPS, take compass bearings to two or three landmarks you can find on the map.

1. Press **Find where you are from bearings**.
2. Press the map (or a saved place) where landmark A is, then B.
3. Type the bearing to each. On a phone at an HTTPS address, **Phone's compass** can take it.
4. Your position is where the lines cross. **Add a third landmark** for a check: the size of
   the triangle shows how good the bearings were.
5. **Save this place** keeps it.

Bearings are magnetic unless you choose **True north**. Choose landmarks 60° to 120° apart.
A hand compass reads to a degree or two, about 90 m at 5 km, so expect a few hundred metres.

## Road routes

Planned directions for a drive, written the way you would write them down: "M20 -
Folkestone", "A26 (E17) - Reims (A4)". Open **Routes**, then **Plan a route**; or press and
hold (right-click) a point on the map and choose **Plan a route from here** or **Plan a route
to here**. The roads are added by country on **Offline maps**, as **Routes**. With
the optional Walking and cycling add-on, the same panel also plans door to door, walking and cycling.
See [road-routes.md](road-routes.md).

## Reachable from here

Press and hold a point and choose **Reachable from here**: the areas reachable in 15, 30 or
60 minutes, drawn in three steps of one colour with a labelled outline for each time. By
car it works over the routes added (**Main roads only**); with walking and cycling added,
over every street, by car, bicycle or on foot (**Streets**). Free-flowing traffic,
no stops. See [road-routes.md](road-routes.md#reachable-from-here).

## Walking and cycling

Only where the optional Walking and cycling add-on is installed, each country on **Offline maps** has a
**Walk/cycle** column, and **Walking and cycling** ("Walking, cycling and door-to-door
routes") is one of the choices in **Add a place**. It is built on this device from the
country's source file; nothing more is downloaded once that file is kept.

1. Press **Add** under **Walk/cycle** on the country's row (or **Add a place**, then tick
   **Walking and cycling** in **What for France?**). Where the source file is not kept yet,
   the flow downloads it first and says so ("Needs France's source file, 4.9 GB:
   downloaded first").
2. Read what it takes before you start: for Great Britain on a Raspberry Pi 5, about an
   hour, about 2.3 GB of memory, and about 53 GB written to the disk it works on. An SD
   card wears with every write: under **Where it works**, choose the NAS or a USB disk to
   spare it. The finished streets are copied back. Several countries are joined into one
   set, which replaces the one in use.
3. Press the button that starts it. The row shows each stage with its progress (step 3 of 5)
   and the time left; routes keep working on what is in use meanwhile.

**Remove…** in the place's **⋯** menu lets you tick **Walking and cycling**; the source file
stays unless you tick it too. Where the add-on is not installed, Offline maps says so in one
line ("Walking and cycling: not set up"), with how to add it.

## Printing a map

**Print or save as PDF** makes a one-page paper map at a true scale. See
[map-printing.md](map-printing.md).

## Layers

The **Layers** tab draws published data over the map: boundaries, airports, hospitals,
shelters, planning zones and more. See [reference-layers.md](reference-layers.md).

## Where the data comes from

| Data | Source | Licence |
| --- | --- | --- |
| Map | [Protomaps](https://protomaps.com) daily build of [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL 1.0 |
| Terrain | [Mapterhorn](https://mapterhorn.com/attribution) | Various open licences |
| Place names | [GeoNames](https://www.geonames.org) | CC BY 4.0 |
| Places and postcodes of Great Britain | Ordnance Survey OS Open Names | Open Government Licence v3.0 |
| World outline | Natural Earth | Public domain |
| Style, fonts, contour tracing | Protomaps styles, Noto Sans, maplibre-contour | BSD-3-Clause, OFL 1.1, BSD-3-Clause |

### Attribution you must keep

These licences require credit wherever the data is shown. Do not hide the map's credits (on
a phone they fold to one line, the rest one press away). Printed pages carry them; do not
crop them off. If you publish a screenshot, include "© OpenStreetMap contributors" and any
terrain, GeoNames or Ordnance Survey credit shown.

## Using your own map source

The settings `maps.tileSource` and `maps.terrainSource` replace the default download source
with any PMTiles archive you host; a `.pmtiles` file you already have can be registered
without downloading. See [development/maps.md](development/maps.md#your-own-map-source).

## Markers

A saved place has a name, a note, one of seven colours, one of sixteen icons (Pin, Home,
Shelter or hut, Camp, Car park, Water, Food, First aid, Fuel, Summit, Viewpoint, Radio mast,
Meeting point, Danger, Star, Flag), a favourite flag, and optionally a link to a note page.
The app-wide search finds them. Favourites are named at every zoom, others from zoom 9.
Where places crowd together an icon gives way to its neighbour until you zoom in.

### Every household's home

With several households, each one's home is labelled on the map with the household's name:
a fixed household's under its saved place, a portable household's (a caravan, a car, a group
on foot) as a ringed dot where it was last said to be, with how old that is ("as of 3 hours
ago"). The ring is larger for the household Outpost is set to now, and it is that household's
home that distances on the map are measured from (what was heard on the radio, the range of
a point). With one household whose home is a saved place, nothing is added.

### A place, a route or a range on a phone, by QR code

**QR code** on a saved place, a route or a radio range shows a code for a phone to scan:

- **Open in Outpost**: the same thing in Outpost, for a phone on the same network. For a
  range from a point, the map opens at the point with the range drawn, worked out there for
  the same two heights (which that phone then remembers).
- **Map apps (geo:)**: opens the point in the phone's own map apps, no network needed.
- **GPX file**, for a route: downloads it on the same network.

If Outpost answers this computer only, a phone cannot open the links: share it under
**Settings → Who can use this library**.

The QR code for a range holds only the point and the heights. For the shape itself in other
map apps, **GPX** and **KML** beside it download the outline, made on this device: the
furthest ground in sight on each bearing joined into one closed line, the typical-range
circle, and the point. Ground inside the outline can still be hidden by nearer ground; only
Outpost's shading shows which. With no terrain the outline is the smooth-Earth horizon.

### Moving a saved place

Press and hold a place for half a second and drag it (or right-click → **Move**, or the move
button in the Places list; then the arrow keys). Nothing is kept until **Save new
position**; **Cancel** or Escape puts it back, and a saved move can be undone. A drag that
does not start with a held press moves the map instead.

## Sunrise and sunset

Worked out on your device; nothing is looked up. The **Sun** tab gives the day for the
centre of the map; on a phone today's sunrise and sunset are also under the readout. A
saved place, a found point, **Sun times here** and where you are each have a **Sun** line too.

| Row | What it is |
| --- | --- |
| First light, last light | Civil twilight: enough light to see by in clear weather. |
| Sunrise, sunset | The sun's upper edge on the horizon. |
| Solar noon | The sun at its highest, and how high. |
| Rises towards, sets towards | True bearing of sunrise and sunset. |
| Day length | And the change from the day before. |
| Nautical twilight | The sun less than 12° below the horizon. |
| Moon | Phase and percentage lit. |

Step a day with the arrows or pick a date. Days with no sunrise or sunset are said in words
("Does not set on this date (midnight sun)").

### Sun times on paper

**A PDF of sun times, day by day** makes a sheet for two weeks, a month or a year: **Save as
PDF**, **Add to library** or **Share**.

### Time zones

Offline, Outpost does not know a point's time zone. Times are on this device's clock, with
the zone named, or in **UTC**. Far from home, a line warns that local clocks probably read
differently; one zone over gets no warning, so check the zone named. The 12- or 24-hour
clock is under **Settings → Appearance → Clock**.

### How accurate it is

Within a minute or so between 72° N and S, a few minutes near the edges of the midnight sun.
**The horizon is taken as flat and at sea level: hills make the real sunrise later and
sunset earlier**, by many minutes in a valley. Moonrise and moonset are not given.

## Coordinate formats

The search box reads these as positions:

| Format | Example |
| --- | --- |
| Decimal degrees | `54.4609, -3.0886` |
| Hemisphere letters | `54.4609N 3.0886W` |
| Degrees and minutes, or minutes and seconds | `54°27.654'N 3°05.316'W` · `54°27'39"N 3°05'19"W` |
| `geo:` link | `geo:54.4609,-3.0886` |
| British National Grid | `NY 215 072` · `321540 507210` |
| Irish Grid | `O 159 346` · `J 338 740` |
| Irish Transverse Mercator (ITM) | `ITM 715830 734697` · `itm 715830, 734697` |
| Maidenhead locator | `IO83QM` |
| UTM and UPS | `30U 448251 5411932` · `UPS N 2000000 2000000` |
| MGRS (US National Grid) | `18S UJ 23483 06479` |

- Latitude comes first unless letters say otherwise.
- A grid reference or locator names a square; Outpost goes to its middle and says how big it
  is.
- National Grid conversion is good to about 5 m, Irish Grid to about a metre. An Irish Grid
  reference is one letter and figures; two letters are a British one.
- ITM needs `ITM` before or after the figures, in any case: plain six-figure pairs are read
  as a British easting and northing, which they look like. Easting first, then northing, in
  metres; decimals are kept. ITM figures name a point, not a square.
- UTM and MGRS are on WGS 84; references from older maps on other datums can be hundreds of
  metres off.

## Maidenhead locators

Radio amateurs give positions as Maidenhead locators: `IO` is a field (20° by 10°), `IO83` a
square (about 130 by 110 km), `IO83QM` a subsquare (about 5.5 by 4.6 km), `IO83QM54` about
550 by 460 m. **Maidenhead locator grid** draws them on the map, finer as you zoom in. The
six-character locator is shown beside coordinates; press it to copy. A locator names a
cell, not a point.

## The grey line: day and night

**Grey line (day and night)** shades where it is night and hatches it with fine diagonal
lines, so that night reads in either theme and in greyscale. The shade deepens through civil, nautical
and astronomical twilight, for now or a time you choose. Radio amateurs call the twilight
band along its edge the grey line: HF signals along it often travel well at dawn and dusk.
The legend gives the time it is drawn for; its clock button chooses another, and **Back to
now** returns. It shares its date with the Sun tab. It is good to about 2 km; the real edge
of daylight is softer. It is also on Radio → HF coverage
([radio.md](radio.md#radio-tools-on-the-map)).

## Line of sight

**This checks geometry against terrain. It does not predict signal strength or coverage.**

1. Press **Line of sight between two points** and press the map at A and B (a saved place
   puts the end exactly on it). Or use the ruler's **Check line of sight**, or a repeater's.
2. Give each aerial's height above the ground and the band or frequency.
3. Read the answer. **Swap A and B** turns it round; Escape puts the tool down.

### What it shows

Distance, bearings both ways, each end's locator, and the answer:

| Answer | Meaning |
| --- | --- |
| Clear | No ground in the way, and at least 60% of the first Fresnel zone clear. |
| In sight, with the Fresnel zone partly blocked | No ground in the way, but less than 60% clear somewhere. |
| Blocked | Ground above the line: how far, and where. |
| Not known | Terrain is missing for part of the path. |
| No terrain here | None installed along the path. |

The side view shows the ground, the ray and the Fresnel zone; move along it for the figures
at each point. If the ends cannot see each other, **Find high ground in sight of both**
shades the ground in sight of both and lists up to eight high and eight near places for a
relay (ends up to 200 km apart).

### The sums

The Earth's curve uses an effective radius of 4/3 × 6,371 km, the standard atmosphere radio
planning assumes; on a given day the air bends signals more or less. 60% of the first
Fresnel zone should be clear. The ray runs from aerial top to aerial top.

### Limits

- **Terrain only**: no buildings, trees or masts. A wood or a row of houses can block a path
  this calls clear.
- Narrow ridges read low, and anything narrower than a terrain cell is missing.
- **A blocked path may still work and a clear one may not**: diffraction, reflection and
  weather are not modelled.
- Where terrain is missing, no verdict is given.

## Estimated radio range from a point

Press and hold the map and choose **Estimated radio range from here**: the ground in line of
sight of a radio there, shaded green with a green edge round each patch, a dashed magenta
circle at the typical range, grey rings at 10, 25, 50 and 100 km out to the first beyond
the furthest ground in sight, and the card's typical and furthest distances. The card is two
lines, the answer in a few words, so the map stays clear; **Show the details** opens it out.
Set your aerial's height and the other station's (handheld, car, roof)
under **Heights and details**. **Why this shape: look along one direction** shows the
ground along any bearing. It counts only line of sight: power, aerials, woods and buildings
are not counted, and radio often reaches less. It works the same way as a repeater's
[estimated range](radio.md#the-estimated-range). In the **Night (red)** map style the
shading, its edge and the circles are drawn in reds, the typical-range circle the brightest.

## How far on foot from a point

(For walking times along streets rather than over open ground, see **Reachable from here**
above.)


Press and hold the map and choose **How far on foot from here**: the ground reachable on
foot in 30 minutes to 4 hours, shaded orange with a ring each half hour or hour. The pace is
Tobler's hiking function, about 5 km/h on a flat path and three fifths of that off paths,
for a fit adult with no load; choose **Slower** or **Much slower** for a pack, children or
someone hurt. Water, cliffs and slopes over 45° are barred except at bridges. **It does not
know** fences, private land, bog, woods, snow, darkness or weather, which can halve a pace
or stop it, and it can miss a narrow gully or footbridge.

## Repeaters on the map

**Repeaters** draws the repeaters you hold ([radio.md](radio.md#repeaters)); Outpost has none
until you add them. Each is drawn by the shape of its band (a circle for 2 m, a square for
70 cm, a triangle for 6 m and 10 m, a diamond for 23 cm and up; hollow if listed as not
operational), with its callsign and frequency as you zoom in; many are counted in discs.
Press one for its card: frequencies, access, distance and bearing from where you are (when
followed) or else from Home,
**Check line of sight** and **Estimated range** (up to eight at once). Repeaters with no
position are not drawn.

## Offline place search

Place names come with a map on **Offline maps**: a country's **Map** brings its places, hills,
waters, parks and landmarks (GeoNames), and **The whole world** brings every town over 500
people. Every word typed must match the start of a word in a name; accents are ignored.
Your own places come first, then the best matches nearest the map's centre.

### Limits

No house numbers, no street addresses outside Great Britain, no businesses, and no look-up
from a position to a name. Coordinates work with no names installed.

## Place names for Great Britain

Adding the **Map** for the United Kingdom on **Offline maps** adds Ordnance Survey's OS Open
Names, with nothing more to choose: postcodes, roads, settlements, hills, waters and woods, with Welsh and Gaelic names.

- Postcodes are typed any way; a part postcode ("SY23" or "SY23 3") finds its area.
- Not every name on a Landranger or Explorer map, and no heights.
- Not covered: Northern Ireland, the Isle of Man and the Channel Islands.
- 103 MB to download; 519 MB in the database with streets, 366 MB without (untick streets
  first). Reading takes five to ten minutes on a Raspberry Pi.
- OS publishes a new edition every three months; **Update** on the row asks for it.
- The Open Government Licence credit is shown on the map while the names are installed
  ([sources.md](sources.md)).

## Satellite imagery

**Satellite imagery** draws pictures of the ground under the map from Outpost's own disk. See
[map-imagery.md](map-imagery.md).

## Keeping a map area on a phone

**Offline maps → Map areas on this phone** keeps the part of the map in view in a phone's
browser, with routes and places, for when it cannot reach the server. See
[offline.md](offline.md#a-phone-out-of-reach-of-the-server).

## What is not included

- **Routing on foot or by bicycle**, and live navigation of any kind. Planned road
  directions (main roads, junctions and signs) are in [road-routes.md](road-routes.md).
- **Surveyed contours**, crags, scree and spot heights.
- **Recording in the background**: only while the screen is on and Outpost is in front.
- **Radio coverage**: line of sight and range are geometry, not signal predictions.
- **A place's time zone, moonrise and moonset.**

## If map labels are missing

A build made without its fonts draws no names: see
[troubleshooting.md](troubleshooting.md#the-map-has-no-labels).

The API is in [api.md](api.md#maps); how the map works inside is in
[development/maps.md](development/maps.md).
