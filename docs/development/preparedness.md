# Preparedness and reference layers: internals

For the guides' screens. Routes are in [api.md](../api.md#reference-layers) and
[api.md](../api.md#nuclear-preparedness).

## Reference layers (`apps/server/src/modules/layers/`)

- **A pack** is a collection of kind `dataset` (`meta.reference`: provider, item, scope,
  layers, dates, counts, skips). Records are `reference_features` (migration 0020):
  provider, source id, layer, kind, name, a point, a box, GeoJSON for areas, `props`,
  `provenance` (CHECK: `public-infrastructure`, `historical`, `user`, `unverified`),
  accuracy, licence, dates, `duplicate_of`. `reference_features_rtree` (R*Tree) and
  `reference_features_fts` (FTS5) are kept by triggers. `historical_records` holds the
  section-6 fields, `record_type` CHECKed; `country_figures` holds country-level figures.
  Population grids are the GeoTIFF plus `reference/population/<key>.bin`, summed at 4,
  16, 64 and 256 cells to a side.
- **Views** (`GET /api/reference/features`) come from the R*Tree, joined first (`CROSS
  JOIN`; SQLite otherwise starts from the layer index, a thousand times slower). Over
  1,500 features are counted into patches per layer and class; areas are simplified
  (Douglas–Peucker), at most 600. The last 64 answers are cached until a write. With
  300,000 points the R*Tree answered a town-sized view in 0.01 ms against 9 ms unindexed;
  at continent scale a scan wins, hence patches.
- **Duplicates**: same source record in another pack; an OSM object whose `wikidata` tag
  names a held item; or, across sources in a layer, the same folded name within 1 km.
  Food shops across OSM and the FSA use the name and distance rule in the guide.
- **Installs** read under a temporary owner and swap the pack in one transaction; rows of
  a vanished pack are cleared at start. Estimates live 30 minutes on the server.
- **The `.osm.pbf` reader** (`adapters/pbf.ts`, no dependency) reads only the layers
  chosen: a synthetic 344 MB file read in 58 s at 664 MB peak, or 35.5 s with a 256 MB heap.
- **The client name** for Overpass and Wikidata is refused unless the estimate carries
  `clientNameAgreed: true`; `GET /api/reference/catalogue` gives each provider's
  `clientName`.
- **Stand-ins for tests**: `OUTPOST_FLOOD_ZONES_URL`, `OUTPOST_OURAIRPORTS_URL`,
  `OUTPOST_FSA_URL`, `OUTPOST_GEOFABRIK_URL`.

**Adding an adapter** (`ReferenceAdapter` in `types.ts`): a `provider` entry in
`providers.ts` with the terms quoted and dated and a verdict (if the terms do not allow a
program to fetch, `import` or `link` and no `estimate`); `estimate(request)` with honest
sizes; `download(request, item)` with address, allowed hosts, size, checksum and fetcher;
`read({ filePath, meta, sink })` converting to WGS 84 (`crs.ts`) and calling `sink.add` /
`sink.skip`, throwing `PermanentJobError` for a wrong file. Register it in `service.ts`,
name its host in [security.md](../security.md#reference-layers), add a test against a
file in the publisher's format, and a row in the guide.

## The nuclear effects model (`packages/shared/src/nuclear-effects.ts`)

From Glasstone and Dolan (1977), read from the scans at fourmilab.ch. Figure pages were
rendered at 300 dpi and curves read off against their gridlines; tables copied as printed
(`nuclear-effects-data.ts`, each with its figure number). `computeEffects` runs in the
browser; the server checks saved scenarios with `effectsProblems`.

- **Blast**: Figs. 3.73b and c, scaled by W^⅓; 5 psi interpolated on log pressure.
- **Heat**: Fig. 7.42 with Fig. 12.65's 50% burn lines (second degree Q = 3.95 +
  0.757 log₁₀W, third Q = 5.96 + 1.24 log₁₀W cal/cm²); low bursts use Table 7.101's
  thermal partition.
- **Initial radiation**: Figs. 8.33a/b and 8.64a/b, fission curves below 100 kt and
  thermonuclear above; surface-burst factors from Table 8.37 and § 8.66.
- **Fireball** 110 W^0.4 ft (air), 145 W^0.4 ft (surface). **Crater** Figs. 6.72a/b,
  scaled by W^0.3.
- **Fallout**: Table 9.93's contours, wind factor from § 9.97, cigar shape per Fig. 9.93.

`apps/server/test/nuclear-effects.test.ts` holds it to the book's worked examples (4 psi
reach for 125 kt within 5%; 1 psi at 10 miles from 1 Mt within 10%; § 9.97's fallout
example within 1%). The effect colours are the `--map-effect-*` tokens.

## Other screens

- **Barometer**: sea level by the ISA, p₀ = p × (1 − 0.0065 h / 288.15)^−5.25588; 1 inHg
  = 33.8639 hPa. A station pushing readings would need a write route outside
  `core/guard.ts`'s model.
- **River trend** `levelTrend` (`packages/shared/src/weather-rivers.ts`); freshness
  `FRESH_FOR` (`packages/shared/src/weather.ts`).
- **Supplies matching** `compareSupplies` (`packages/shared/src/emergency-plans.ts`).
- **Food table** `apps/server/src/modules/supplies/foods/fdc-sr-legacy.json`, built by
  `node scripts/build-food-energy.mjs <unzipped folder> --zip <zip>` from
  `FoodData_Central_sr_legacy_food_csv_2018-04.zip` (sha256 `b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0`).
- **Barcode reader** `apps/web/src/features/supplies/barcode/decode.ts`: scan lines at
  twelve angles, a read accepted with a valid check and two agreeing lines; about 18 ms a
  camera frame on an M-series Mac.
- **Emergency plans** expose `ctx.services.emergencyPlans`; callers send `baseUpdatedAt`
  and use `kind: "other"` with `kindText` for their own kinds. Template words and terms
  are in `packages/shared/src/emergency-templates-data.ts` (`SOURCE_TERMS_DATA`).
