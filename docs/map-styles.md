# Map styles, contours and layers

How the map is drawn: its styles, contour lines, the layers over it, where its data comes from and the credit it must carry, and a map source of your own. Part of the map guide, which starts at [Offline maps](maps.md).

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

## Layers

The **Layers** tab draws published data over the map: boundaries, airports, hospitals,
shelters, planning zones and more. **Find in the reference layers** lists what matches nearest
home first (or the middle of the map, with no home set), each with its kind, the town it is near
where the Towns layer is held, and its distance. See [reference-layers.md](reference-layers.md).

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

## Satellite imagery

**Satellite imagery** draws pictures of the ground under the map from Outpost's own disk. See
[map-imagery.md](map-imagery.md).

## Printing a map

**Print or save as PDF** makes a one-page paper map at a true scale. See
[map-printing.md](map-printing.md).
