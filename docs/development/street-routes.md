# Street routes: the streets service and its API

Door-to-door drives, walking and cycling routes and reachable areas, from an optional
streets service (Valhalla) beside Outpost's own main-roads router. Outpost's router stays
the "Drive" route and the spine of a door-to-door one ([road-routes.md](road-routes.md));
why both, and what everything costs on a Raspberry Pi, is in
[street-routes-measurements.md](street-routes-measurements.md). The code is
`apps/server/src/modules/streets/`; the shapes are `packages/shared/src/streets.ts`.

## How it fits together

```
compose.yaml profile "routes":  valhalla container ── internal network "streets" ── outpost
                                       │                                               │
                     valhalla-tiles volume (/tiles there, OUTPOST_VALHALLA_DIR here)  │
                       status.json   ◀── written by the service, read by Outpost      │
                       request.json  ◀── written by Outpost, taken by the service     │
                       cancel        ◀── written by Outpost to stop a build           │
                       current/      tiles.tar, tileset.json: the streets served      │
                                                                                       │
POST /api/streets/route ─▶ door-to-door.ts: roads.plan() is the spine; client.ts asks /route for each end
                         ─▶ narrative.ts: manoeuvres → short lines
POST /api/streets/reach ─▶ reach.ts: /isochrone; or main-roads-reach.ts over Outpost's own network
POST /api/streets/tiles ─▶ tiles.ts: task streets.build writes request.json, follows status.json
```

- **Not installed** (most installations): there is no `status.json` in
  `OUTPOST_VALHALLA_DIR`. Outpost then asks nothing of the network at all, reports
  `state: "not-installed"`, offers none of the modes and adds no Map data row. Only a
  drive's reachable area works, over Outpost's own main roads.
- **connection.ts** reads `status.json` (checked, 256 KB at most) and asks the service
  `/status` only once streets are built, at most every 5 s. `OUTPOST_VALHALLA_URL`
  (default `http://valhalla:8002`, the Compose service) must be this computer or its own
  network (a loopback or private address, or a name without dots); anything else is
  refused with a sentence, so routes and places never leave for the internet.
- **client.ts**: `POST /route` (costing `auto`, `bicycle` or `pedestrian`, `language:
  en-GB`, kilometres) and `POST /isochrone`, both with `costing_options.<costing>.use_ferry:
  0`: Valhalla's pedestrian costing defaults to 1 (a ferry at half its time), which sent a
  Battersea to Chelsea walk by river bus; at 0 a ferry costs ten times its time plus six
  hours to board (`valhalla/sif/dynamiccost.h`), so it is taken only for want of another
  way. A manoeuvre of type 28 (or `ferry: true`) becomes a `ferries` entry on the
  directions (its ends, name, length and line), a "Take the ferry … Check it is running"
  line and a warning; the web app draws it dashed. Each with a time limit (20 s and 30 s), the
  person's request's signal (a closed browser stops the question), a size limit on the
  reply (4 MB and 8 MB) and a zod check of its shape. Valhalla's refusals keep its error
  code: 170 to 172 (no streets near a point) become "Streets are not installed for
  France" or "away from every street"; 442/443 "no way joins these points"; 154/155 "too
  far for this way of travelling".

## The sidecar contract

`docker/valhalla/outpost-valhalla.sh` documents it at its top. In short:

| File | Who writes it | What |
| --- | --- | --- |
| `request.json` | Outpost | `{ id, name, extracts: [absolute paths], regions: [StreetsRegion], work? }` to build; `{ id, name, import: path }` to bring in a `.tar`; `{ id, remove: true }` to delete the streets in use. Taken once (renamed `last-request.json`). |
| `cancel` | Outpost | Stops a build under way. |
| `status.json` | the service | `{ state: idle \| building \| ready \| failed, id, name, stage, message, startedAt, finishedAt, current }`. `id` is Outpost's task id. |
| `current/tileset.json` | the service | `{ name, extracts, builtAt, tarBytes, valhalla, regions }`. |

The country files' paths are Outpost's own (`storage.resolve`): the service must mount
every storage location at the same path, as `compose.yaml` does for `/storage/...`.
`work` puts the build's working files on another storage location (a USB SSD rather than
an SD card): Outpost passes `<location>/outpost-streets-work`, the service refuses any
folder not so named, builds in it, copies the finished streets onto its own volume, and
deletes it. That location must be mounted read-write in the `valhalla` service.

The service runs as root and Outpost as another user (the image's `node`, uid 1000). On
starting, the service gives the shared folder to `OUTPOST_UID`:`OUTPOST_GID` (1000:1000
unless `compose.yaml` passes others from `.env`), so that Outpost can write `request.json`
and `cancel` there. `test/streets-valhalla.test.ts` (`OUTPOST_TEST_VALHALLA=1`, Docker)
runs it the same way: the service as root in a folder Docker makes, Outpost as the user
running the test, or as uid 1000 when that is root.

A build asked for while another runs is a `streets.build` task queued behind it (the
queue runs one at a time). Its record names the places asked for; which files, and which
places of the streets in use are kept beside them, is worked out when it starts. Before
writing `request.json` it waits, up to three hours, while the service says it is building
something else (a cancelled build slow to stop, one Outpost did not start), then fails with
words and can be retried. A request for places already being built or waiting is refused
(409) rather than queued again.

## The build task

`streets.build` (queue `streets`, one at a time, not paused or retried by itself):

1. Writes `request.json` (whole, then renamed into place) and waits up to a minute for the
   service to take it; otherwise it fails saying the service is not running.
2. Follows `status.json` every 3 s. Progress is stage `at` of `of`: `merge` (several files
   only), `admins`, `tiles`, `extract`, `swap`; or `import`, `swap`. The message adds the
   time left, from the expected time of the whole build and the measured shares of each
   stage (tiles are 95% of it). Once a stage has run past where the estimate had it end
   (a Pi building Great Britain for over an hour), it says "taking longer than usual"
   instead of counting down.
3. Ends when `status.json` says `ready` with its id; fails with the service's own
   sentence when it says `failed`. The streets in use stay until a build has finished.

Each step of a build runs as `nice -n 19 ionice -c 3` (lowest processor priority, idle
disk class) so that Outpost stays quick while it builds; either is left out where it is
not installed or the container refuses it (`outpost-valhalla.sh priority` prints what is
used, and the service logs it at start). `ionice` only counts with an I/O scheduler that
honours classes (BFQ); with `mq-deadline` or `none` it changes nothing.

Cancelling writes `cancel` (or removes a request not yet taken). Outpost stopping or
restarting leaves the build running: the task is queued again and follows it, by its id.

### What a build costs

`POST /api/streets/tiles/estimate` and the build's own answer give the figures the screen
shows before the button (`StreetsEstimate`). They are read off straight lines between
three builds measured on a Pi 5 (8 GB, SD card, two threads): Kent 54 MB (59 s, 0.7 GB
written, 77 MB result), Greater London 131 MB (142 s, 2.3 GB, 185 MB) and Great Britain
2.21 GB (56 min, 53 GB, 2.73 GB). Memory is Great Britain's 2.3 GB for anything up to its
size; free space is the service's own check, three times the country files (four when
several are joined). Past Great Britain's size `measured` is false and the warnings say
the figures are guesses. On a computer with under 6 GB of memory, a large area gets a
warning to choose a smaller one.

## Door to door

`mode: "drive-door"`: Outpost's road route (`ctx.services.roads.plan`) is the spine, its
legs unchanged. The streets service routes the door to Outpost's first join point and its
last join point to the door, when either is more than 100 m off; the last road leg's
"then local roads to the end" becomes "then the streets to the door", and the streets
from the door end "Join Kingston Road (B2430), then the main roads below" rather than
"Arrive at the end" (the main road's number alone, "Join the A24", when the last turn is
not onto it). A via point of a walk or ride is named as the main-road planner names it: a
name for its role only ("via") or its position is none, and the street it is on is said. An end outside the
streets built keeps Outpost's route to its main road, with a warning. Doors under 15 km
apart (straight line), or no road network installed, are driven on streets all the way
(`spine: "streets"`).

## Turn-by-turn lines

`narrative.ts` writes each manoeuvre from its type, street names and sign rather than
using Valhalla's sentence: "Drive north-east on Bell Lane", "Turn left onto Guildford Road
(B2122)", "At the roundabout, take the 2nd exit onto Leatherhead Road (A24)", "Take exit
16 (Denham) onto M40 towards Birmingham, Oxford". A road's name comes before its number;
a European route alone ("E 05", Valhalla's name for the M6) is dropped where the road has
another name and written "E05" where it has none; a step that stays on the same road
folds into the line before; leaving a roundabout folds into entering it. Distances are to
the next line: metres and kilometres, or yards (under a quarter of a mile) and miles.

## Reachable areas

Any one to three times (`STREETS_REACH_MINUTES`): by car or bicycle 15, 30, 60, 90 or
120 minutes; on foot 30, 60, 120, 240, 360 or 480. The card asks for the time chosen and up
to two shorter ones (120 by car: 30, 60, 120; 480 on foot: 120, 240, 480). Anything else
is a `400` naming the times for that way.

- **Streets** (`source: "streets"`): Valhalla's isochrones as GeoJSON polygons, with
  `denoise` 0.5 (pieces under half the size of the largest go) and `generalize` 100 m for
  driving, 75 m for cycling, 50 m on foot (outlines simplified to within that), growing
  with the longest time over an hour (two hours on foot): 200 m for 2 hours' drive, 150 m
  for 2 hours' ride, 200 m for 8 hours' walk. Valhalla's own grid is a 300th of the
  furthest the time could go (70 mph by car, 20 by bicycle, 5 on foot), held between 0.001
  and 0.005 degrees, so a long time does not grow its grid without end; the work does grow
  with the streets inside it. Outpost waits 30 s for an hour or less, 90 s for longer.
  The sidecar's configuration sets `service_limits.isochrone.max_time_contour` to 480
  (Valhalla's default is 120) and `max_contours` to 4; a service started from an older
  image refuses over 2 hours with error 151, which Outpost says plainly.
- **Main roads only** (`source: "main-roads"`, drive only): for installations without the
  service, or asked for with `source: "main-roads"`. The point is joined to the nearest
  main road at 30 km/h; Dijkstra's method over the main roads (sea crossings left out)
  marks a grid of cells with the earliest time along each road, part-way along the last;
  each time's cells are grown by one of its own cells, enclosed gaps are filled, and the
  outline is traced and simplified to 60% of a cell. The grid is set by the shortest time
  asked: 375 m for 15 minutes, 750 m for 30, 1.5 km for 60, 3 km for 120
  (`settings.gridM`), and coarsened when that would put more than 1,200 cells across the
  grid (15 minutes with 2 hours: about 400 m), which bounds it at 1.44 million cells. Over
  Great Britain's network on a Mac, an hour's area takes about 50 ms and is 4 KB. On the
  test network, 15, 30 and 60 minutes took 27 ms; 2 hours alone 1 ms; 15 minutes, an hour
  and 2 hours together (the 1,200-cell grid, the most work there is) 117 ms.

A drive says "Free-flowing traffic, no stops" (`note`): neither source counts traffic or
waits. A ride or a walk says "a steady pace on the flat with no stops" (the tiles hold no
heights); over an hour by bicycle or 2 hours on foot it adds "no rests counted".

## API

| Method and path | Purpose |
| --- | --- |
| `GET /api/streets/status` | `StreetsStatusResponse`: `state` (`not-installed`, `no-streets`, `ready`, `not-answering`, `problem`), `installed`, `message`, the streets in use (`tileset`: name, regions, countries, size, data date, Valhalla's version), a build under way or the last failed one (`build`), the `modes` available now, kept `countryFiles` to build from, `reachMinutes`. |
| `POST /api/streets/route` | `{ points (2–12: {lat, lon, name?} or {placeId}), mode: drive-door \| walk \| cycle, units?: km \| miles, crossing? }` → `StreetsRouteResult`: `spine`, `road` (Outpost's `RoadRouteResult`), `start`, `end` or `streets` (each `{ lines, distanceM, durationS, geometry }`), `summary`, `geometry`, `warnings`, `credit`. `415` not installed; `400` "Streets are not installed for France", no way, too far; `503` the service not answering; `502` a bad or late reply. |
| `POST /api/streets/reach` | `{ point, mode: drive \| walk \| cycle, minutes: [one to three of the way's times], source?: auto \| main-roads }` → `StreetsReachResult`: `source`, `label` ("Streets" or "Main roads only"), `note`, `areas` (a FeatureCollection, smallest time first, `properties.minutes`), `settings`, `credit`. Walking and cycling without streets: `415`. |
| `POST /api/streets/tiles/estimate` | `{ regions: [Geofabrik ids of kept country files] }` → `StreetsEstimate`. |
| `POST /api/streets/tiles` | `{ regions, workLocationId? }` builds one set from those country files, joined, replacing the set in use; `{ import: { locationId, relPath, name? } }` brings in a `.tar` from `deploy/valhalla/build-tiles.sh`. → `{ jobId, estimate }`. `409` while one is under way. |
| `DELETE /api/streets/tiles` | Stops serving and deletes the streets in use. `409` while building. |

`GET /api/maps/data` gains a seventh row per country, `kind: "streets"` ("Streets for
routes"), only where the service is installed: the set in use under each country it
covers (state, size, data date), a build under way with its progress, or the last failed
build (under `other`). Live event: `streets.changed`.

## Tests

`apps/server/test/streets.test.ts` runs against a stand-in answering with replies recorded
from a real Valhalla serving Great Britain (`test/fixtures/streets/`), and plays the
service's side of the folder: not installed, words, door to door joined to the road-route
fixture, streets outside the area built, reach on streets and on main roads, the build
followed stage by stage, a failure, a cancel, removal and Map data's row.
`streets-sidecar.test.ts` runs the sidecar script's `priority` with stand-ins for `nice`
and `ionice` (there, missing, refused). `streets-valhalla.test.ts` starts the real sidecar image with Docker, builds from the
road-route fixture's country file on a work folder, routes, draws an area and removes the
streets: `OUTPOST_TEST_VALHALLA=1` (and `docker build -t outpost-valhalla:local docker/valhalla`
first).
