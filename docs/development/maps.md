# Maps: how the parts work

For people changing or administering the map. Routes are in [api.md](../api.md#maps).

## Your own map source

`maps.tileSource` replaces the daily Protomaps build (kept about a week) with any PMTiles
archive in the Protomaps basemap schema served with HTTP range requests; `""` restores it.
`maps.terrainSource` does the same for terrain (default
`https://download.mapterhorn.com/planet.pmtiles`). A private address needs
`OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.

```bash
curl -X PATCH "http://localhost:8080/api/settings" -H "X-Outpost-Request: 1" \
  -H "Content-Type: application/json" -d '{"maps.tileSource": "https://maps.example.net/planet.pmtiles"}'
```

A `.pmtiles` file already on a storage location is registered, not copied, with
`POST /api/maps/import` (`locationId`, `relPath`, `name`; `"tileType": "terrain"` for
Terrarium elevation). Image-tile archives are refused as maps.

## Route sources

Shipped Overpass servers are in `catalog/route-sources.json`. Write
`<data directory>/catalog/routes/route-sources.json` and restart to add your own:

```json
{ "schemaVersion": 1, "defaultSource": "ours", "replaceShipped": false,
  "sources": [{ "id": "ours", "name": "Our Overpass", "type": "overpass",
    "endpoint": "https://overpass.example.net/api/interpreter", "operator": "the walking club",
    "coverage": "Britain and Ireland", "bbox": [-11, 49, 2, 61],
    "termsUrl": "https://overpass.example.net/", "lastVerified": "2026-11-16" }] }
```

Without `defaultSource`, the first source whose `bbox` holds the map's centre is asked, else
the first with none. `replaceShipped: true` drops the shipped ones. A bad file is reported in
the log and by `GET /api/maps/route-sources` and is ignored. Previews are held 15 minutes,
bounded at 600,000 points and 200 previews; one search per source at a time, 30 s back-off
after "busy".

## Code and constants

- Heights: `GET /api/maps/height`; at most one request per 100 ms, last 32 cached in the page,
  last four decoded terrain tiles on the server. All heights format through
  `apps/web/src/lib/heights.ts`.
- Place icons: `apps/web/src/features/maps/lib/place-icons.ts`, made into map images on first
  use by `map/place-images.ts`.
- Sun and moon: `apps/web/src/features/maps/lib/sun.ts` (Meeus, as NOAA; sunrise at −0.833°)
  and `lib/moon.ts`; US Naval Observatory checks in `lib/sun.test.ts`.
- Grey line: `grey-line/geometry.ts` traces circles of radius 90° + h round the antisolar point
  every 0.25°, cut at ±180°.
- Line of sight: `TerrainProfile` and `analyseSight` in `packages/shared/src/radio.ts`; Earth
  bulge d1·d2/(2kR), k = 4/3; Fresnel √(λ·d1·d2/(d1+d2)); at most 4,096 samples. Tests in
  `apps/server/test/maps-sight.test.ts`.
- Walk reach: Tobler's function on a 25–60 m grid, off-path × 0.6.
- Printing: `apps/web/src/features/maps/print/` (`pdf.ts` is Outpost's own PDF writer;
  `map-words.ts` the hidden text). What can be ticked is `PRINT_OVERLAYS` in `overlays.ts`; its
  first comment is the contract. Canvases stay within 4,096 px a side (about 4.2 Mpx on touch
  devices, after WebKit's `maxCanvasArea()`), in pieces overlapping by 128 px.
- Recording: constants in `recording/track-log.ts` (30 m, 5 m, 3 m, 150,000 points); upload is
  `PUT /api/maps/recordings/:id` with a device-chosen id, so a repeat is a no-op.
- GPX: `apps/server/src/modules/maps/gpx.ts`, one streaming pass, DOCTYPE refused. Exports
  follow the GPX 1.1 schema's element order, `xsd:dateTime` times, longitude 180 as −180;
  `apps/server/test/maps-gpx-schema.test.ts` checks this without the schema file. To validate
  again, fetch `https://www.topografix.com/GPX/1/1/gpx.xsd` and run
  `xmllint --noout --schema gpx.xsd <file>`.
- Imagery: Sentinel-2 L2A Collection 1 (the older collection's values disagree with its
  metadata and come out black); reflectance 0–0.3 to sRGB, bilinear, WebP quality 78. Aerial
  sources are entries in `apps/server/src/modules/maps/imagery/aerial-sources.ts`; the reader
  takes 8-bit COGs (uncompressed, Deflate or WebP) in UTM or Transverse Mercator. Switzerland
  and the Netherlands would need a JPEG-in-TIFF decoder and their national projections.
- OS Terrain 50 is not offered: it is a 50 m grid, and the terrain downloaded is built over
  Great Britain from 1 m lidar where it exists and a 30 m model elsewhere, so it would make
  the map coarser.
- OS Open Names: checked against OS's MD5; attribution from the edition's `Doc/licence.txt`;
  Helmert transformation from OS's *A guide to coordinate systems in Great Britain* v3.6.

## Map data and country files

`GET /api/maps/data` answers the Map data screen in one request, from what is held:
per country six rows in a fixed order (map to look at, hills and heights, place names,
roads for routes, places to find, country file), then the whole world, other areas (drawn
and satellite areas, anything not one country's) and the kept country files. Each item has
its size, storage location (none for a road network, which is in Outpost's own data), the
day its data is from, a state (`waiting`, `downloading`, `paused`, `processing` with the
task's own progress and step, `ready`, `failed` with the reason, `location-offline`,
`missing`, `damaged`, `moving`) and the download or task to open. A ready-made map area is
put under the country whose outline box is most like its own; a drawn one is under other
areas. Kept phone areas live in the phone's browser, so `onThisPhone` is always null.

A country file is a Geofabrik extract (`.osm.pbf`). It is downloaded once (a download of
kind `extract`) and read for what was asked, the main roads and then the places, each a
step of the same task; then it is kept or deleted as the person chose. A kept file is a
collection of kind `extract` ("Country files") in `collections/country-files/` of the
chosen location, so Storage moves, checks and removes it, and it is marked missing or
damaged like any other file. Removing it is the only way it is deleted; roads and places
made from it keep working. Every file read is written to `country_files` (migration
`0045_country_files`), kept or not, which is how a row can say "read and deleted".

Roads and places read a kept file for the region instead of downloading, a task of type
`maps.country-file.read` holding the file so it cannot be moved or removed meanwhile. The
newest kept file is used, by its data date; `newerThan` (a day) asks for a download instead
when the kept one is older. A kept file whose location is not connected, or which is missing
or damaged, is not used.

`POST /api/maps/data/add` adds a country's roads, places and country file in one press, with
the map and terrain (through `regions.start`) and GeoNames names beside them. The keep
choice is required: nothing is kept or deleted by default. The last choice is the setting
`maps.countryFileKeep` (`ask` until one is made), which the screen preselects. The road
routes and places screens' own adds go through the same country file.

Geofabrik's `-latest` address redirects to the newest dated file. When that file answers
404 (seen on 23 November 2026: `united-kingdom-261122.osm.pbf` while `-261121` was there),
the newest earlier dated file the region's page lists is fetched instead, checked against
its own `.md5`, and the download's first history line says which file it was.

