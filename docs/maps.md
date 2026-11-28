# Offline maps

Outpost draws the map in the browser from tiles it serves itself. Once a place is added
under **Offline maps**, its map needs no internet. OpenStreetMap's public tile servers are never used.

More on the map: [Routes and tracks](map-routes.md), [Road routes](road-routes.md), [Printing a map](map-printing.md),
[Satellite imagery](map-imagery.md), and the [map quick start](map-quick-start.md).

## The Maps screen

On a phone, Maps has the whole screen: the search box is at the top (quick search is the first
row of **More**), and **Directions** is at the foot, beside the handle of the sheet. See
[road routes](road-routes.md).

The panel beside the map (a sheet you drag up on a phone) has five tabs: **Places** (saved
places), **Routes** ([map-routes.md](map-routes.md) and [road routes](road-routes.md)),
**Layers** ([reference-layers.md](reference-layers.md)), **Offline** (what covers the view,
adding an area, satellite pictures, keeping the view on a phone) and **Sun**
([Sunrise and sunset](map-sun-and-radio.md#sunrise-and-sunset)).

The buttons on the map: the **search box** (place names, postcodes in Great Britain, or any
of the [Coordinate formats](map-places.md#coordinate-formats)), **Measure a distance** (then **Save as a
route** or **Check line of sight**), **Draw a route**, **Save a place**, **Show where I
am**, **Record a track**, **Hill shading**, **Contour lines**, **Map style**, **Find where
you are from bearings**, **Print or save as PDF**, **Road numbers**, **Magnetic north
lines**, **UTM grid**, **Maidenhead locator grid**, **Grey line (day and night)**,
**Repeaters**, **Satellite imagery** and **Line of sight between two points**. Where there
is not room for them all, as on a phone, the column shows as many as fit and **More** under
it lists every tool by name. A tool taken up on a phone has its card at the foot of the
screen in place of the tabs; close the card to have the tabs back. Pinch to zoom.

Right-click the map (press and hold on a touch screen) for **Save a place here**, **Measure
from here**, **Draw a route from here**, **Directions from here**, **Directions to here**,
**Reachable from here**,
**Sun times here**, **Estimated radio range from here** and
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

### Nearest

**Nearest** (at the foot of the map on a phone, beside the search box on a wider screen)
lists the nearest **hospital**, **pharmacy**, **shelter**, **drinking water** or **fuel**,
whichever of these are held on this Outpost, without switching a layer on. Each is listed
with its distance and direction from home (or from the middle of the map) and
**Directions**; press its name to see it on the map. Searching the map for "pharmacy" or
"hospital" offers the same list. Distances are in a straight line, from what was held on the
day it was fetched; nothing is asked of the internet, and it does not say a place is open.
The places come from **Nearby places** in Offline maps; with none held, **Nearest** says so
and links there.

A record opened on the map (a hospital, a shop, a shelter) says how far it is from home and
has **Directions** to it.

### The height of the ground

The readout shows the ground's height after the coordinates ("57.00000, -3.39897 · 100 m");
on a phone, open the readout to see it. Where no terrain covers the point nothing is shown,
never a guess, and **Get terrain** is offered. It is the ground thereabouts from the finest
terrain installed, mostly a 30 m model, so a summit reads a few metres low. Metres or feet:
**Settings → Appearance → Heights**.

## More about the map

The rest of the map guide is in parts of its own:

- [Map data: what is kept for the map](map-data.md): adding a place, nearby places, the source file, updating and removing, an area of your own, and keeping an area on a phone.
- [Map styles, contours and layers](map-styles.md): the styles, contour lines, layers, where the data comes from, and a map source of your own.
- [Saved places, place search and coordinates](map-places.md): markers, finding a place offline, grid references, UTM, MGRS and Maidenhead, and bearings.
- [Road routes, reach, walking and cycling](map-getting-around.md): what is reachable from a point, and walking and cycling.
- [Sun, grey line, line of sight and radio range](map-sun-and-radio.md): sunrise and sunset, day and night over the map, line of sight and radio range.
- [Routes and tracks](map-routes.md), [Road routes](road-routes.md), [Printing a map](map-printing.md) and [Satellite imagery](map-imagery.md).
