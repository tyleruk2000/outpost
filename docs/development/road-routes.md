# Road routes: the engine and its API

Planned, high-level road directions worked out offline from main-roads networks kept
per country or region. The code is `apps/server/src/modules/roads/`; the shapes are
`packages/shared/src/roads.ts`. The guide for people is [road-routes.md](../road-routes.md).

## How it fits together

```
Geofabrik .osm.pbf ──(download manager, MD5)──▶ build.ts ──▶ <data>/roads/<id>.roads   (one file per network)
   or a file in storage ──(job roads.build)──┘        road_networks row (name, country, data date, size)

POST /api/roads/route ─▶ graph.ts: every installed network joined in memory
                       ─▶ route.ts: join points to the network, A* by time, crossing choice
                       ─▶ directions.ts: path → the owner's lines
                       ─▶ plan.ts: RoadRouteResult (legs, summary, geometry, snapped, warnings, credit)
```

- **build.ts** reads an extract in two passes over the file (roads and junctions, then
  the positions of the roads' nodes only) and an in-memory step between, into typed
  arrays. Kept: `highway=motorway|trunk|primary|secondary` and their `_link`s;
  `route=ferry` ways that carry cars (`motorcar`/`motor_vehicle`/`vehicle=yes` on the way
  or on a ferry route relation it belongs to); `route=shuttle_train` ways (the Channel
  Tunnel shuttle is mapped so, with `duration=35`); `highway=motorway_junction` nodes
  (`ref`, `name`). Tags kept per way: `ref`, `int_ref` (European routes, "E 17" written
  "E17"), `name`, `oneway` (and `-1`; motorways, slip roads, roundabouts and the shuttle
  are one-way unless tagged otherwise), `junction=roundabout`, `toll`, `maxspeed` (and
  `maxspeed:type`, codes such as `GB:nsl_single`, `FR:rural`, `none`), and the signs:
  `destination`, `destination:ref`, `destination:street`, `junction:ref`, with their
  `:forward`/`:backward` forms (a plain `destination` counts only on a one-way road).
  Ways are cut into edges at the nodes where they meet, end or have a junction; each
  edge keeps its length and a shape simplified to 12 m.
- **network-file.ts**: the arrays and a JSON header (strings, crossings) in one binary
  file. A file, not SQLite rows: routing needs every edge in memory, and a file of typed
  arrays loads in one read with no parsing; millions of rows would be slower to write,
  read and reclaim on update. Paths go through `resolveInside` on the data directory.
- **graph.ts** joins the networks. Geofabrik's extracts hold every way that crosses
  their edge whole, with all its nodes (none missing in Kent, Nord-Pas-de-Calais,
  Luxembourg or Great Britain), so neighbours share node ids at their borders: nodes
  with the same id become one, and an edge both hold is kept once. Each end of a crossing
  that meets no road is joined to the nearest trunk, primary or secondary node within
  8 km by a "local roads" edge (ports and terminals sit on service roads the network
  leaves out). Ferries of one name are one crossing; both shuttle ways are "eurotunnel".
- **route.ts**: points join the nearest trunk, primary or secondary node (never a
  motorway carriageway or a slip road) within 40 km, in a piece of network every point
  can reach; then A* by time, the estimate being straight-line distance at 120 km/h.
- **directions.ts**: the path as lines (below). **countries.ts**: which country a point is
  in, from Natural Earth outlines (`country-outlines.json`, written by
  `scripts/write-country-outlines.mjs`).
- **speeds.ts**: the speed table (below).

## Directions

The owner's own list from London to Chamonix is the target, and the golden test:

```
M25
M20 - Folkestone
Eurotunnel, Folkestone – Calais
A26 (E17) - Reims (A4)
A26 (E17) - Troyes
A5 (E17 - E54)
A31 - Dijon
A39 - Geneve
A40 (E21 E62) - Geneve
A40 (E25) - Chamonix
N205 - Chamonix
```

A leg's `title` is that line: the road's `ref` (or its name where it has none), the
European routes in brackets (grouped by where each first appears: `E21;E62` together is
"E21 E62", `E17` then `E54` is "E17 - E54"), then " - " and the place its signs say to
follow, with `destination:ref` in brackets when it is another road. Its `detail` is the
quieter part: which way ("heading south-east", or clockwise/anticlockwise round the
M25, M60, Berliner Ring, R0 and Périphérique), the junction to join and to leave at
("J10 (Ardley)" in Britain and Ireland, "exit 21 (Troyes-Nord)" elsewhere), the sign on
the slip road off ("for Reigate"), distance and time.

How the path becomes lines:

1. Slip roads, roundabouts and the joins to a crossing are not roads of their own: they
   are the way onto the next road, and their signs are its signs.
2. Steps on the same road are one leg; a road keeps its number while the next piece
   still carries it (`A1;A26` then `A26` is one road).
3. A new line starts where the place followed changes. From each sign, the place kept
   is the one that stays on the signs that follow furthest (in 20 km steps), then the
   one that leads to the crossing that comes next ("Channel Tunnel", the port), then the
   one named most. Road numbers given as places ("M6(N)", "(M20, M23)") are never the
   place; "The SOUTH" or "City Centre" only when nothing better is signed. A place
   followed for under 12 km joins the line before.
4. Legs under 0.8% of the route (between 3 and 10 km), and unnumbered streets under three
   times that, fold into the line before (or the one after, at a start or after a
   crossing); an A–B–A dog-leg folds into A. More than 28 road lines left: the shortest
   fold until 28.
5. The same road on, signed for a place its earlier signs already named, or after a
   stretch whose signs named no place at all, is one line for the later place; a place
   not signed before is a line of its own (A26 for Reims, then for Troyes).

On the real Great Britain and France networks, the owner's own trip (Leatherhead to
Chamonix, 1,075 km) comes out at 15 lines, against the owner's 10:

```
M25 - Gatwick
M25 - Dartford Crossing
M26 - Maidstone
M20 (E15) - Folkestone
Eurotunnel, Folkestone – Calais
A16 (E402 - E15) - Lille
A26 (E15 - E17 - E44) - Reims
A4 (E17 E46 E50) - Lyon
A26 (E17) - Troyes
A5 (E17 E54) - Besançon
A31 (E17 E21) - Lyon
A39 - Grenoble
A40 (E21 E62) - Milan
A40 (E21 - E25 - E712) - Chamonix-Mᵗ Blanc
N205 (E25) - Chamonix-Mont Blanc
```

The differences are the data's: the M25's signs change at the Dartford Crossing, the A4
shares the Reims bypass with the A26, and the A40's signs name Milan (by the Mont Blanc
tunnel) where the owner read Geneve. Leatherhead → Manchester → Amiens (998 km) is 22
lines.

## Speeds

Times are for a car in free-flowing traffic with no stops. Where a road's limit is
mapped it is driven at 90% of it, held under the ceiling; where none is mapped, the
typical speed. Both columns are Outpost's assumption, set under the legal limits beside
them.

| Road | Typical (no limit mapped) | Ceiling | Legal limit for cars, and source |
| --- | --- | --- | --- |
| motorway | 105 km/h | 120 km/h | UK 70 mph ([GOV.UK, Speed limits](https://www.gov.uk/speed-limits), read 22 Nov 2026); France, Austria, Italy, Luxembourg, Netherlands 130, Switzerland 120, Germany advisory 130 ([OpenStreetMap wiki, Default speed limits](https://wiki.openstreetmap.org/wiki/Default_speed_limits), read 22 Nov 2026) |
| trunk | 85 km/h | 100 km/h | UK dual carriageway 70 mph, single 60 mph (GOV.UK); France dual carriageway 110 (wiki) |
| primary | 65 km/h | 90 km/h | UK single carriageway 60 mph (GOV.UK); France outside towns 80 (wiki, citing the Code de la route) |
| secondary | 55 km/h | 80 km/h | as primary |
| motorway slip road | 55 km/h | 70 km/h | — |
| trunk slip road | 45 km/h | 60 km/h | — |
| primary or secondary slip road | 35 km/h | 50 km/h | — |
| roundabout | at most 30 km/h | | — |
| car ferry, no `duration` mapped | 28 km/h (about 15 knots) | | — |
| a crossing's end to the nearest main road | 20 km/h over 1.3 × the straight line | | — |

A crossing's time is its `duration` tag (shared among its edges by length), never faster
than 120 km/h. Check-in and waiting are not included, and the result says so.

## Secondary roads: in

Measured with and without `highway=secondary` (and its links), share of nodes in the
largest connected piece:

| Extract | With secondary | Without |
| --- | --- | --- |
| Kent | 99.8% (10,097 nodes) | 99.8% (8,071) |
| Nord-Pas-de-Calais | 99.7% (40,675) | 99.8% (21,058) |
| Luxembourg | 99.3% (14,674) | 98.3% (7,466) |

The network joins without them, but they are kept: a start or end joins the network
nearer to where it is (fewer kilometres of "local roads" unaccounted for), small
countries stay better joined, and the cost is small (the network is about 1.3% of the
extract's size). Folding keeps them out of the lines unless a route really runs along one.

## Measured

On a Mac with Apple silicon, Node 26 run from TypeScript source:

| Extract (Geofabrik, 20–22 Nov 2026) | File | Build | Network file | Nodes, edges | Peak memory of the process |
| --- | --- | --- | --- | --- | --- |
| Kent | 54 MB | 1.9 s | 0.7 MB | 10,097, 11,804 | 345 MB |
| Luxembourg | 48 MB | 1.5 s | 1.0 MB | 14,674, 16,572 | 360 MB |
| Nord-Pas-de-Calais | 242 MB | 7.8 s | 3.0 MB | 40,675, 48,587 | 410 MB |
| Great Britain | 2.21 GB | 72 s | 30 MB | 391,362, 456,949 | 690 MB |
| France | 5.12 GB | 224 s | 62 MB | 809,801, 956,160 | 852 MB |

The idle process run from source is 266 MB of that (type stripping); the build's own
arrays for Great Britain are 3.5 million node references (28 MB as `Float64Array`) and
3.0 million unique ids; the rest is the garbage of decompressed blocks, which the
collector takes back; France's are 7.9 million references and 6.9 million unique ids.
Joining Great Britain and France: 1,201,133 nodes and 1,413,245 edges, 134 MB of
arrays, joined in 0.5 s, the process at 540 MB afterwards; Leatherhead to Chamonix
planned in 0.18 s. Not measured: a Raspberry Pi (none in this work; expect three to four
times these times), and Germany and Austria (Germany is downloaded by Land).

## API

All under `/api/roads`. Bodies are checked with zod; anything a person should read comes
back as `{ error: { code, message } }` with a 4xx.

| Method and path | Body | Answer |
| --- | --- | --- |
| `GET /networks` | | `RoadNetworksResponse`: `networks: RoadNetworkDto[]`, `building` (jobs and downloads under way), `credit` |
| `POST /networks` | `{ regionId, keepExtract?, locationId? }` (a Geofabrik region id, as `GET /api/reference/regions` lists them once read with `POST /api/reference/regions`) or `{ locationId, relPath, name, country? }` (a file already in storage) | `{ downloadId, jobId }`: for a region, the country file's download, or, where the region's country file is kept, a task reading it (no download); for a file in storage, a build job. See [map data](../maps.md#the-source-file) |
| `POST /networks/:id/update` | | as above: the region downloaded again, or the file read again; the new network replaces the old when built |
| `DELETE /networks/:id` | | `{ ok: true }`: the network file and row go; a kept extract stays |
| `POST /countries` | `{ boxes: [w, s, e, n][] }` (≤ 200) | `{ countries }`: ISO codes the boxes cover, most first, from the country outlines; a box over 40° by 25° is passed over. The web app sends the installed map regions' boxes, to offer their countries first |
| `GET /crossings` | | `{ crossings: RoadCrossingDto[] }`: sea crossings in what is installed (`id` is `"eurotunnel"` or `"way/<id>"`), with `joined` when both ends reach a road |
| `POST /coverage` | `{ points: [{ lat, lon }] }` (1–12) | `RoadCoverageResponse`: each point's country; each country the route touches, in order, with `state` `ready` \| `part` (a point outside the parts kept) \| `downloading` (with `progress`: phase, bytes, time left) \| `missing`; and `seaCrossing`. Local only: country outlines and the networks table, no graph read, nothing asked of anyone |
| `POST /route` | `RoadRouteRequest`: `{ points: [{lat, lon, name?} \| {placeId, name?}] (2–12), crossing?: "any" \| "eurotunnel" \| "way/<id>", units?: "km" \| "miles" }` | `RoadRouteResult` |
| `GET /routes` | | `{ routes: SavedRoadRouteSummaryDto[] }`, newest first |
| `POST /routes` | `{ name, route: RoadRouteResult }` | `SavedRoadRouteDto` |
| `GET /routes/:id` | | `SavedRoadRouteDto` (`route` as planned: prints with no network loaded) |
| `PATCH /routes/:id` | `{ name }` | `SavedRoadRouteDto` |
| `DELETE /routes/:id` | | `{ ok: true }` |

`placeId` is a saved place on the map (a marker). Changes publish `roads.changed`; the
web app's query keys should start with `roads`.

### RoadRouteResult

```ts
{
  legs: RoadLeg[];                // in order; kind "road" | "crossing" | "via"
  summary: { distanceM, durationS, countries: string[], crossings: RoadCrossingOnRoute[] };
  geometry: { type: "MultiLineString", coordinates: [lon, lat][][] };  // one line per stretch between points, simplified to 25 m
  snapped: RoadSnappedPoint[];    // per point: input {lat, lon, name}, lat/lon joined, distanceM (straight line), road, country
  warnings: string[];             // far joins, unused crossing choice, old data, "crossings are booked"
  credit: { attribution, license, licenseUrl, url, line };
  request: RoadRouteRequest;      // as asked, to plan again
  plannedAt: number;              // ms
  networks: { id, name, dataDate }[];
}

RoadLeg {
  kind: "road" | "crossing" | "via";
  title: string;                  // "A26 (E17) - Reims (A4)": the bold part
  detail: string;                 // "Heading south, leave at exit 21 (Troyes-Nord), 105 km, 54 min"
  road: string | null;            // "A26"; a name where unnumbered; null for local roads
  europeanRoutes: string[][];     // [["E17"], ["E54"]]
  towards: string | null;         // the signed place, spelt as signed ("Genève")
  towardsRef: string | null;      // "A4"
  direction: string | null;       // "south-east", "clockwise"
  joinAt, leaveAt: { ref, name, label, at: [lon, lat] } | null;
  exitSign: string | null;        // the slip road's sign at leaveAt
  distanceM, durationS: number;
  countries: string[];            // ISO alpha-2 in order
  crossing: { id, kind, name, operator, from, to, durationS, durationSource } | null;
  via: { index, name } | null;
  start, end: [lon, lat];
}
```

Errors a person sees, word for word in kind: "Germany and Switzerland have no roads yet.
Add roads for Germany and Switzerland, then plan again."; "“Chamonix” is more than 40 km
from any main road kept for France: only Nord-Pas-de-Calais is kept. Add roads for all of
France, or choose a point nearer a main road."; "The roads kept do not join these points.
Belgium has no roads yet. …"; "There is no way by the Channel Tunnel shuttle with the
networks installed: it does not reach both sides." Each of the first three carries
`details: RoadRouteProblem` (`{ missing: [{ code, name, regionId }], far: [{ index, name,
country, distanceM }], reason: "empty" | "point" | "between" }`), from which the screen
offers **Add roads for …** for exactly those countries. The countries a route needs are its
points' and those the straight lines between them cross for at least 40 km (or a quarter of
a short line), sampled every 5 km over the country outlines (`coverage.ts`).

### Plain text

`directionsAsPlainText(route, { width = 48, ascii = false, title?, locale? })` in the
shared package gives the condensed plain text: title (start to end), the day planned,
totals, each leg's `title` with its `detail` indented under it, rules of dashes, the
note and the credit. No line is longer than `width` (words wrap; a longer word is
broken). Typographic dashes and quotes become plain ones; `ascii: true` also takes the
accents off (`roadAsciiText`: "Genève" → "Geneve"). Distances are in the units the route
was planned in.

## The web side

`apps/web/src/features/maps/road-route/`: `road-route-panel.tsx` (the Routes tab's **Road
route**: form, planned route, saved route, saved list), `point-field.tsx` (a point from the
map's search, saved places or the map centre), `directions.tsx`, `plain-text.tsx`,
`layers.ts` (the `o-road-route` overlay), `route-map.ts` and `route-card.ts` (the print-kit card; the
installed maps are read before the overview is drawn), `words.ts` (start and end lines,
crossing choices, and `legLines`, which cuts the route's geometry into each leg's part by
the legs' ends). Query keys start with `roads`; `roads.changed` refreshes them. The map's
point menu has **Road route from here / to here**; road networks are added and listed on
Map data (`data-page/`; `/maps?offline=roads` leads to `/maps/data?add=1&kinds=roads`).
A region's roads come from its country file, one download read for roads and places
together and then kept or deleted as the person chose (`POST /api/maps/data/add`, see
[map data](maps.md#map-data-and-country-files)); a kept file is read again with no
download. Building from a file of the person's own in storage is offered through the API.
Tests: `road-route.test.tsx`, `e2e/tests/road-routes*.spec.ts` (networks built from the
server fixtures in storage).

## Storage and memory at rest

`road_networks` (one row a network) and `road_routes` (saved routes, the whole result as
JSON) in SQLite, migration `0042_road_routes`. Network files in `<data>/roads/`, listed in
Storage as "Roads for routes" under Outpost's own data (not moved; removed one by one). The
country file is in `collections/country-files/` of the chosen storage location while it is
read, and stays there only when kept. The joined graph is built on the first route
asked for and let go after 30 minutes unused (one `unref`'d timer), so a Pi at rest holds
none of it. One network is built at a time.

## Not done

Toll avoidance; ferries' timetables (only their time on board); turn restrictions (the
main roads rarely need them, and the directions are not turn by turn); a Pi measurement.
