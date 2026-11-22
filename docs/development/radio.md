# Radio, for developers

Routes are in [api.md](../api.md); the guide is [radio.md](../radio.md).

## Repeater sources

`catalog/repeater-sources.json`, overridden by `<data>/catalog/repeaters/repeater-sources.json`:

```json
{
  "schemaVersion": 1,
  "regions": [{ "id": "valley", "name": "Our valley", "bbox": [-3.4, 54.3, -2.9, 54.7] }],
  "sources": [{
    "id": "club-list", "region": "valley", "publisher": "Fell Radio Club",
    "name": "Club repeater list", "covers": "The club's own repeaters.",
    "pageUrl": "https://club.example.org/repeaters", "kind": "fetch",
    "why": "It is our own list.", "termsUrl": "https://club.example.org/repeaters",
    "termsNote": "Ours to use.", "termsRead": "2026-11-16",
    "fetch": { "url": "https://club.example.org/repeaters.csv", "waitSeconds": 10 }
  }]
}
```

A shipped `id` is replaced; `"replaceShipped": true` drops them all. `kind` is `fetch`
(needs `fetch.url`), `link` (needs `steps`) or `none`. Shipped sources must be `https` with
a wait of at least ten seconds; a private address needs `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.
`pnpm catalog:validate` checks the file. Scale: `OUTPOST_SCALE=1 pnpm exec vitest run
test/repeaters-scale.test.ts` in `apps/server`.

## Reference sheets and frequencies

- Sheets are Markdown in `catalog/bundled/radio/`, listed in
  `catalog/manifests/outpost-reference.json`. To correct one: edit it, re-check each changed
  figure at its source, update **Checked**, raise `version` and `lastVerified`, then run
  `pnpm catalog:validate` and the catalogue tests. Rules: [catalog/README.md](../../catalog/README.md).
- Frequencies are in `packages/shared/src/radio-frequencies/` (one file per kind; shape and
  the `heardFromAfar` rule in `radio-frequencies.ts`). Set `checked` (and `schedule` for
  shortwave), then `cd apps/web && pnpm exec vitest run src/features/frequencies`
  (`FREQ_KIND=weather` for one kind). Keep a closed station, with its date.

## LogBook73 books

`pnpm catalog:import-logbook73 /path/to/LogBook73` writes `catalog/bundled/logbook73/`,
`catalog/manifests/logbook73.json` and its packs, then run `pnpm catalog:validate` and both
test suites. Chapter text is not edited; chapter links become `outpost:entry/<id>/<chapter>`
([catalog/README.md](../../catalog/README.md#links-into-the-catalogue)). It refuses a dirty
checkout and reports dead links; `version` moves only when a book changes. Signal figures
port LogBook73's `RadioViz` (MIT).

## Mesh radio

Code: `apps/server/src/modules/mesh/`. Set-up in the settings rows `mesh.config` and
`mesh.heard` (not in the settings schema); passwords in `<data>/mesh/secrets.json` (0600,
scrypt hash of the broker password).

The MQTT 3.1.1 broker (`mesh/mqtt/`) requires a password; QoS 0 and 1 only (QoS 2 closes the
connection); no retained messages, wills or kept sessions. Limits: 64 KiB a packet, 8
connections (2 unauthenticated per address), 20 publishes a second (bursts of 50), 32
subscriptions, 10 s to sign in, 5 wrong passwords a minute per address. Only this computer
and private addresses may connect. As a client it subscribes to `<root>/2/json/#` and
`<root>/2/e/#`, publishes to `<root>/2/json/mqtt/`, and reads at most 20 messages a second.

Licences (read 17 November 2026; [sources.md](../sources.md#mesh-radio-read-2026-11-17)):
Meshtastic's firmware and protobufs are GPL-3; only its documented MQTT JSON interface is
built (`meshtastic/json.ts`). Its binary API (USB, port 4403) is not, since its field
numbers exist only in the GPL `mesh.proto`. MeshCore (MIT) frames and commands are written
fresh from its `ArduinoSerialInterface.cpp` and `companion_protocol.md`.

## Board transports

`apps/server/src/modules/board/transport.ts`, on `ctx.services.board`: `addTransport({ name,
carries(channel), send(message), refuse? })`, `receive({ channel, source, externalId,
author, body, … })` (stored once per source and id), `onMessage(listener)` and `setMeta(id,
meta)` (at most 4 KB; announces `board.changed` with `delivery`). Messages live in
`board_messages` (`source`, `external_id`, `meta`) and files in `board_files` and `board/`.

## Estimated range accuracy

The viewshed reads 720 bearings, half a degree apart: every 10 m to 2 km (from the finest
terrain), 50 m to 25 km, 100 m to 50 km and 250 m to 100 km. The answer is about 190 kB.
Beyond 50 km the ground is read from the same tiles as from 25 to 50 km (cells of about
90 m at 55° N, zoom 9) where they are installed, not from tiles about as wide as the step
(about 180 m, zoom 8); where only coarser tiles are held, those are read
(`RANGE_FAR_READ_METERS` in `radio-range.ts`). The check below was made before this change
and has not been made again; how long the finer far band takes on a Raspberry Pi has not
been timed.

*How it was checked* (21 November 2026). The same terrain tiles were read at four places:
a hillside near the A9 (56.8866, −4.1454, 750 m), Ben Nevis summit (56.7969, −5.0036,
1,340 m), Beachy Head cliff top (50.7380, 0.2420, 110 m, with the sea in view) and
south-west London (51.4330, −0.2110, 20 m, flat), each with a 1.5 m aerial and a 10 m
mast, a 1.5 m station, out to 100 km. Outpost's answer was compared with GDAL 3.13's
`gdal_viewshed` (the method of Wang, Robinson and White, 2000) on the same terrain warped
to a grid centred on the aerial, with curvature coefficient 0.75 (k = 4/3), and with a
separate line-of-sight walk every 5 m along each of the 720 bearings over the finest
tiles (a walk every 2 m gave the same answer). With the same tiles, Outpost and GDAL
agreed to within 1 percentage point of the ground in sight at every distance. The check
found one real error, now fixed: the ground was read every 50 m from the aerial, which
skipped a summit's crown, and on Ben Nevis gave 15.9% of the ground within 2 km in sight
where the 5 m walk gives 8.8%. The first 2 km are now read every 10 m from the finest
terrain, which gives 8.9%. The largest remaining difference is far out from a high
summit: from Ben Nevis with a 10 m mast, 10.6% of the ground within 100 km against 9.2%,
because beyond 50 km the ground was read every 250 m from cells of about 170 m (now from
cells of about 90 m where installed, not yet compared). Over the
sea the terrain holds 0 m, so a station there is taken as at sea level; tides are not
counted.

Sources, read 21 November 2026: which source covers where, from Mapterhorn's
`attribution.json` (download.mapterhorn.com); GLO-30's accuracy and that it is a surface
model "including buildings, infrastructure and vegetation", from the Copernicus DEM
collection page (dataspace.copernicus.eu, COP-DEM); "All LIDAR data has a vertical
accuracy of +/-15cm RMSE", from the Environment Agency's *LIDAR Composite DTM 2020 - 1m*
record on data.gov.uk; the curvature coefficient as 1 − the refraction coefficient, from
GDAL's `gdal_viewshed` page (gdal.org).
