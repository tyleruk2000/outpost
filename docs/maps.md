# Offline maps

Outpost draws the map in the browser from tiles it serves itself. Once a region is
installed, the map needs no internet. OpenStreetMap's public tile servers are never used.

More on the map: [Routes and tracks](map-routes.md), [Printing a map](map-printing.md),
[Satellite imagery](map-imagery.md), and the [map quick start](map-quick-start.md).

## The Maps screen

The panel beside the map (a sheet you drag up on a phone) has four tabs: **Places** (saved
places), **Routes** ([map-routes.md](map-routes.md)), **Offline** (installed regions and
downloads) and **Sun** ([Sunrise and sunset](#sunrise-and-sunset)).

The buttons on the map: the **search box** (place names, postcodes in Great Britain, or any
of the [Coordinate formats](#coordinate-formats)), the **ruler** (measures a path; **Save as
a route** or **Check line of sight**), **Record a track**, **Hill shading**, **Contour
lines**, **Map style**, **Find where you are from bearings**, **Print or save as PDF**,
**Road numbers**, **Magnetic north lines**, **Maidenhead locator grid**, **Grey line (day and
night)**, **Satellite** and **Line of sight between two points**. On a phone the three-dot
button at the end of the search box, **All map tools**, lists them all by name; the icons
below show as many as fit. Pinch to zoom.

Right-click the map (press and hold on a touch screen) for **Save a place here**, **Measure
from here**, **Draw a route from here**, **Sun times here**, **Estimated radio range from
here**, **How far on foot from here** and **Copy coordinates**.

The readout at the bottom gives the position of the cross at the centre of the map (with a
mouse, of the pointer, marked "Pointer"). Choose its format: decimal degrees,
degrees-minutes-seconds, British National Grid, UTM, MGRS or Maidenhead. Press it to copy.
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

## Downloading a region

A region is a rectangle of the map at a range of zoom levels, kept as one file on a storage
location. Install as many as you like; Outpost joins them into one map, using the most
detailed for each tile. Move or remove them as in [storage.md](storage.md). Downloading
needs the internet.

1. Open **Offline**. Pick one of 188 ready-made regions (the world overview, each country,
   parts of Britain and Ireland, some mountain ranges), or **Draw a box** or **Use the
   current view**. Adjust the box by its corner and edge handles (drag, or Tab to one and use
   the arrow keys).
2. Choose the maximum zoom:

   | Zoom | Roughly what you see |
   | --- | --- |
   | 6 | Countries, cities, main roads |
   | 10 | Towns, most roads |
   | 12 | Villages, tracks, larger streams |
   | 14 to 15 | Streets and paths, for walking |

3. Tick **Include terrain for hill shading and contour lines** for heights, contours, line
   of sight and radio range (terrain stops at zoom 12).
4. Choose the storage location. Each shows its free space; one too small or not connected
   says why. Map and terrain must both fit.
5. **Check the size** gives the exact size before anything is fetched. Then **Download**.

The download shows under **Downloads**, can be paused, and survives a restart.

Limits: a box cannot cross the 180° meridian (make two), the map ends at about 85° north and
south, and a box over about 20 million tiles or 60 GB is refused. Magnifying past the zoom
downloaded adds no detail.

## Map styles

**Map style** switches between styles drawn from the same maps, so nothing is downloaded:

| Style | For |
| --- | --- |
| Standard | The usual map, light or dark with the app. |
| Road map | Roads coloured by importance. |
| Road map, UK atlas colours | Motorways blue, primary routes green, A roads red, B roads orange. |
| Walking | Paths and tracks stronger; switches on hill shading and contours. |
| High contrast | For bright sun. |
| Night (red) | Reds only, to keep your eyes for the dark. |
| Low ink | For printing. |

**Road numbers** writes M6, A591 and the like on main roads from about zoom 7. **Magnetic
north lines** draws blue lines pointing to magnetic north at the angle for the centre of the
view; on a large area, zoom in where you are working.

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

## Printing a map

**Print or save as PDF** makes a one-page paper map at a true scale. See
[map-printing.md](map-printing.md).

## Reference layers

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

### A place, a route or a range on a phone, by QR code

**QR code** on a saved place, a route or a radio range shows a code for a phone to scan:

- **Open in Outpost**: the same thing in Outpost, for a phone on the same network.
- **Map apps (geo:)**: opens the point in the phone's own map apps, no network needed.
- **GPX file**, for a route: downloads it on the same network.

If Outpost answers this computer only, a phone cannot open the links: share it under
**Settings → Who can use this library**.

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
| Maidenhead locator | `IO83QM` |
| UTM and UPS | `30U 448251 5411932` · `UPS N 2000000 2000000` |
| MGRS (US National Grid) | `18S UJ 23483 06479` |

- Latitude comes first unless letters say otherwise.
- A grid reference or locator names a square; Outpost goes to its middle and says how big it
  is.
- National Grid conversion is good to about 5 m. The Irish Grid is not read.
- UTM and MGRS are on WGS 84; references from older maps on other datums can be hundreds of
  metres off.

## Maidenhead locators

Radio amateurs give positions as Maidenhead locators: `IO` is a field (20° by 10°), `IO83` a
square (about 130 by 110 km), `IO83QM` a subsquare (about 5.5 by 4.6 km), `IO83QM54` about
550 by 460 m. **Maidenhead locator grid** draws them on the map, finer as you zoom in. The
six-character locator is shown beside coordinates; press it to copy. A locator names a
cell, not a point.

## The grey line: day and night

**Grey line (day and night)** shades where it is night, deepening through civil, nautical
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
the furthest ground in sight, and the card's typical and furthest distances. Set your aerial's height and the other station's (handheld, car, roof)
under **Heights and details**. **Why this shape: look along one direction** shows the
ground along any bearing. It counts only line of sight: power, aerials, woods and buildings
are not counted, and radio often reaches less. It works the same way as a repeater's
[estimated range](radio.md#the-estimated-range).

## How far on foot from a point

Press and hold the map and choose **How far on foot from here**: the ground reachable on
foot in 30 minutes to 4 hours, shaded orange with a ring each half hour or hour. The pace is
Tobler's hiking function, about 5 km/h on a flat path and three fifths of that off paths,
for a fit adult with no load; choose **Slower** or **Much slower** for a pack, children or
someone hurt. Water, cliffs and slopes over 45° are barred except at bridges. **It does not
know** fences, private land, bog, woods, snow, darkness or weather, which can halve a pace
or stop it, and it can miss a narrow gully or footbridge.

## Repeaters on the map

**Repeaters** draws the repeaters you hold ([radio.md](radio.md#repeaters)); Outpost has none
until you add them. Each is a dot with its callsign and frequency as you zoom in; many are
counted in discs. Press one for its card: frequencies, access, distance and bearing,
**Check line of sight** and **Estimated range** (up to eight at once). Repeaters with no
position are not drawn.

## Offline place search

Download place names under **Offline maps → Place names**: `cities500` (every town over 500
people), `cities15000` (larger towns), or a country (its places, hills, waters, parks and
landmarks). Every word typed must match the start of a word in a name; accents are ignored.
Your own places come first, then the best matches nearest the map's centre.

### Limits

No house numbers, no street addresses outside Great Britain, no businesses, and no look-up
from a position to a name. Coordinates work with no names installed.

## Place names for Great Britain

**Offline maps → Place names → Place names for Great Britain** adds Ordnance Survey's OS Open
Names: postcodes, roads, settlements, hills, waters and woods, with Welsh and Gaelic names.

- Postcodes are typed any way; a part postcode ("SY23" or "SY23 3") finds its area.
- Not every name on a Landranger or Explorer map, and no heights.
- Not covered: Northern Ireland, the Isle of Man and the Channel Islands.
- 103 MB to download; 519 MB in the database with streets, 366 MB without (untick streets
  first). Reading takes five to ten minutes on a Raspberry Pi.
- OS publishes a new edition every three months; **Check for a newer edition** asks for it.
- The Open Government Licence credit is shown on the map while the names are installed
  ([sources.md](sources.md)).

### Terrain from Ordnance Survey: why it was not added

OS Terrain 50 is a 50 m grid. The terrain Outpost downloads is built over Great Britain from
1 m lidar where it exists and a 30 m model elsewhere, so Terrain 50 would make the map
coarser.

## Satellite imagery

**Satellite** draws pictures of the ground under the map from Outpost's own disk. See
[map-imagery.md](map-imagery.md).

## Keeping a map area on a phone

**Offline maps → Map areas on this phone** keeps the part of the map in view in a phone's
browser, with routes and places, for when it cannot reach the server. See
[offline.md](offline.md#a-phone-out-of-reach-of-the-server).

## What is not included

- **Routing**: Outpost does not work out routes or directions.
- **Surveyed contours**, crags, scree and spot heights.
- **Recording in the background**: only while the screen is on and Outpost is in front.
- **Radio coverage**: line of sight and range are geometry, not signal predictions.
- **A place's time zone, moonrise and moonset.**

## If map labels are missing

A build made without its fonts draws no names: see
[troubleshooting.md](troubleshooting.md#the-map-has-no-labels).

The API is in [api.md](api.md#maps); how the map works inside is in
[development/maps.md](development/maps.md).
