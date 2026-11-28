# Saved places, place search and coordinates

Saving places on the map, finding a place with no internet, writing down where a place is in each kind of coordinate, and finding where you are from bearings. Part of the map guide, which starts at [Offline maps](maps.md).

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

## Offline place search

Place names come with a map on **Offline maps**: a country's **Map** brings its places, hills,
waters, parks and landmarks (GeoNames), and **The whole world** brings every town over 500
people. Every word typed must match the start of a word in a name; accents are ignored.
Your own places come first, then the best matches nearest the map's centre. Among places of
the same name, those in your household's country and in the country the map is over come first:
for a household in England, Olney finds the town in England before those in the United States,
whatever part of the world is in view. A place's other names count too: "Munich" finds München
and "Bavaria" finds Bayern, where the names held list them.

When no place has every word, the search says so above the list and tries again more loosely:

- A kind of place said with the name ("Waterloo station", "Lake Windermere") finds the places
  of that name, that kind first.
- A word no place has ("Ambleside Cumbria") is left out.
- A slip of a letter, or two letters the wrong way round ("Amblesdie"), finds the nearest
  spellings.

A word for the nearest of something ("pharmacy", "A&E", "petrol near me") puts **Nearest
pharmacies** (or hospitals, shelters, drinking water, fuel) first in the list, above any
street of that name.

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
  first). Reading them has not yet been timed on a Raspberry Pi.
- OS publishes a new edition every three months; **Update** on the row asks for it.
- The Open Government Licence credit is shown on the map while the names are installed
  ([sources.md](sources.md)).

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
