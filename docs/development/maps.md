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
- OS Open Names: checked against OS's MD5; attribution from the edition's `Doc/licence.txt`;
  Helmert transformation from OS's *A guide to coordinate systems in Great Britain* v3.6.
