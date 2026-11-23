# Street routes: Valhalla against our router, measured

Measured 23 Nov 2026 on the owner's Raspberry Pi 5 (8 GB, SD card, Raspberry Pi OS,
Outpost and a monitoring stack running) and, for comparison only, a Mac with Apple silicon
(10 cores, Docker with 23 GB). Valhalla 3.9.3, `ghcr.io/valhalla/valhalla:3.9.3`
(arm64). The country file for both routers: Geofabrik's Great Britain extract of
22 Nov 2026, 2.21 GB.

## Decision: both, everything built on the Pi

**Our router stays the default "Drive".** **Valhalla is an optional add-on for door to
door, walking, cycling and reachable areas, built on the Pi itself.** A Mac is not part
of the path.

Why:

- **A Pi 5 builds Great Britain for Valhalla on its own: 56 minutes, two threads,
  completed**, with at least 4.0 GB of memory left all the way through and Outpost
  answering throughout. So a person with only a Pi can have it. The costs are real and are
  said up front: keep 8 GB of disk free to build (the working folder held 5.2 GB when the
  build ended; its peak was not measured), 2.7 GB afterwards, about 53 GB
  written to the disk per build, and the Pi busy (slower, swap full) for that hour.
- **Our router is still better at what it does**: the owner's high-level lines (7 to 8
  lines for 350–670 km, against Valhalla's 26 to 59 turn-by-turn steps), the named
  Channel crossing choice, 0.08–0.18 s on the Pi, a 30 MB network built in under three
  minutes on the Pi with 47 MB written. Nothing about it needs to change.
- **Valhalla does what ours cannot**: real streets at both ends (ours stops at "then local
  roads to the end"), walking and cycling, and reachable-area shapes. Our main-roads graph
  can do drive-time reach quickly (0.35 s for an hour on the Pi) and its extent matches
  Valhalla's, but it has only main roads: no walking, cycling or door to door.
- **Hosting stays simple**: off by default, one switch to turn on (below), no port opened,
  nothing fetched from the internet after the image, and the rest of Outpost unchanged
  without it.

What the owner does:

- **Install**: `./deploy/pi/install.sh --street-routes` (or `COMPOSE_PROFILES=routes` in
  `.env`, then `docker compose up -d --build`). It downloads Valhalla's image once
  (about 700 MB). Then, from Offline maps → Map data, build streets for a country whose
  country file is in storage: about an hour for Great Britain on a Pi 5.
- **Update**: build again from Map data. The streets in use keep working until the new
  ones are ready; a failed or stopped build leaves them as they were.
- **Remove**: take `routes` out of `COMPOSE_PROFILES` and run `docker compose up -d`;
  delete the `valhalla-tiles` volume to free the disk.

Limits to say plainly in the guide:

- An SD card wears with writes: a monthly rebuild of Great Britain is about 0.6 TB a
  year. A USB SSD is better for anyone rebuilding often. (No figure for any particular
  card's endurance is claimed here.)
- France (5.1 GB, 2.3 times Great Britain) and joined countries were not built on the Pi.
  Expect two to three hours and more memory; offer them on a Pi only once measured.
- A Pi 4, or a Pi with 4 GB, was not tried. The Great Britain build used about 2.3 GB on
  top of what was running; with Outpost and Kiwix beside it, 4 GB is likely too tight.
  Smaller areas (a county, Greater London) build in one to three minutes and are the
  safe offer there.

## Building, Great Britain

| | Pi 5, Valhalla (2 threads) | Pi 5, ours | Mac, Valhalla (4 threads, comparison) | Mac, ours |
| --- | --- | --- | --- | --- |
| Wall time | 56 min (boundaries 77 s, tiles 53 min, packing 75 s) | 168 s | 54 min* | 184 s |
| Memory | 2.3 GB taken from what was available (6.3 → 4.0 GB at the lowest); its processes' resident size peaked at 7.5 GB, mostly memory-mapped working files | 367 MB peak | 12.7 GiB (Docker's figure, with page cache) | 630 MB peak |
| Swap | 511 of 511 MB used (other services paged out) | none | — | — |
| Result on disk | 2.73 GB tiles tar (tiles folder 2.6 GB, deleted after packing) | 30 MB | 2.73 GB | 30 MB |
| Written to the disk | 53 GB (the Pi's background is 13 MB a minute) | 47 MB | — | — |
| Completed | yes | yes | yes | yes |

\* The Mac's Valhalla build read the country file through Docker Desktop's file sharing,
which made it slower than the Pi; it is here only to show the Mac is not needed.

During the Pi build Outpost's `/api/health` answered in 1 to 130 ms, once 1.3 s; load
average 3 to 8 with up to 47% of the time waiting on the disk. Docker's memory limit is
not applied on Raspberry Pi OS (the memory cgroup is off), so the build was guarded by a
watchdog stopping it below 1 GB available; it never came near. The sidecar keeps that
guard (`VALHALLA_MIN_AVAILABLE_MB`, default 800).

Smaller areas on the Pi (2 threads):

| Area (Geofabrik) | Country file | Build | Tiles tar | Written |
| --- | --- | --- | --- | --- |
| Kent | 54 MB | 59 s | 77 MB | 0.7 GB |
| Greater London | 131 MB | 142 s | 185 MB | 2.3 GB |
| Great Britain | 2.21 GB | 56 min | 2.73 GB | 53 GB |

## Serving on the Pi

Valhalla served the Pi-built tiles with two threads on a port bound to 127.0.0.1. At rest
70 MB; after the runs below 2.1 GB resident, of which 0.7 GB its own and 1.4 GB tile data
mapped from the tar (the system drops that when short).

Times in milliseconds, three runs each (two for reachable areas); the first run of a
session reads tiles from the card.

| Request | Valhalla on the Pi | Ours on the Pi |
| --- | --- | --- |
| Leatherhead → Epsom, car, 7 km | 675, 34, 32 | — |
| Leatherhead → Box Hill, walk, 6 km | 16, 17, 16 | — |
| Leatherhead → Dorking, cycle, 9 km | 33, 34, 32 | — |
| King's Cross → Tower of London, walk, 6 km | 219, 269, 214 | — |
| Westminster → Camden Town, cycle, 5 km | 202, 207, 227 | — |
| Leatherhead → Manchester, car | 630, 332, 324 (347 km, 3 h 14) | 257, 111, 109 (346 km, 3 h 35) |
| Leatherhead → Edinburgh, car | 265, 215, 220 (644 km, 6 h 20) | 212, 179, 180 (667 km, 7 h 00) |
| Leatherhead → Penzance, car | 118, 95, 96 (442 km, 4 h 11) | 77, 79, 76 (441 km, 4 h 41) |
| Reachable, drive 15 min from Trafalgar Square | 619, 598 | 59 (main roads only) |
| Reachable, drive 30 min | 1,777, 1,726 | 147 |
| Reachable, drive 60 min | 5,605, 4,698 | 349 |
| Reachable, drive 15, 30 and 60 min in one request | 4,610, 4,563 | — |
| Reachable, walk 30 min | 111, 112 | — |

Valhalla's drive times are 10–15% shorter than ours: its default speeds are higher than
our table (ours drives at 90% of the limit, under a ceiling). Neither counts traffic.

## Quality

**Directions for the long drives.** Ours, Leatherhead → Manchester, 7 lines:

```
M25 (E30) - Watford          Clockwise, join at J9 (Leatherhead), leave at J16 (Denham) for Birmingham
M40 (E05) - Birmingham       … leave at Umberslade for Birmingham (E,N & C)
M42 (E05) - Birmingham (E,N & C)
M6 (E05) - Birmingham (C & N)  … leave at J19 (Tabley Interchange) for Manchester
A556 - Manchester (M56(E))
M56 - City Centre
A5103                        … then local roads to the end
```

Valhalla's, 26 steps, from "Drive northeast on Upper Fairfield Road." through "Enter the
roundabout and take the 2nd exit onto M25.", "Take exit 16 onto M40 (W) towards
Birmingham/Oxford.", "Keep left to take exit 3A onto M42 North towards Birmingham
(E,N & C)/…", "Keep right to stay on E 05." (that is the M6), "Take exit 19 onto
M56(E)/A556 towards Manchester/Stockport." to "Turn left onto Lloyd Street." and "Your
destination is on the left." Edinburgh is 59 steps against our 8 lines; Penzance 44
against 8.

- **Signs** come through well in Valhalla: exit numbers, the road branched to and the
  places towards, as separate fields (`sign.exit_number_elements`, `exit_branch_elements`,
  `exit_toward_elements`).
- **European routes** (`int_ref`) come through only as street names: the M6 stretch is
  named "E 05" alone, so the instruction reads "Keep right to stay on E 05", which no one
  in Britain would recognise. Ours keeps the road number first and the E-routes in
  brackets. Valhalla's narrative should not replace the owner's lines.
- **Door-to-door ends**: ours joins the B2122 16 m from the Leatherhead start and ends
  "then local roads to the end" (Manchester, from the A5103; Penzance 1 km). Valhalla gives
  the streets: 6 steps from the door to the M25 and 7 from the M56 to the door, with
  roundabout exits counted. That is what door to door should add.
- **Route choice** differs on Edinburgh: Valhalla takes the M1, A1(M) and A68 (644 km),
  ours the M6, A74(M) and A701 (667 km). Both are reasonable; it comes from the speed
  tables. Valhalla names part of the A1 "E 15" here too.

**Reachable areas.** Rendered and looked at: Valhalla's 15, 30 and 60 minute drive areas
from Trafalgar Square nest as expected (15 minutes a ragged patch of central London,
60 minutes out to about the M25, with fingers along the motorways), and the 30 minute
walk is an area about 2.5 km in radius. Our own 60 minute reach
over main roads covers almost the same extent as Valhalla's 60 minute area, so a drive-
only reach on our network would be a fair cheaper option; walking would not.

## The sidecar

`docker/valhalla/` (image pinned by digest, plus osmium-tool to join neighbouring country
files), `outpost-valhalla.sh` (serves `current/tiles.tar`; builds or imports when Outpost
leaves `request.json` in the `valhalla-tiles` volume; `status.json` per stage; stops on
`cancel` or short memory; swaps only a finished build in), the Compose service `valhalla`
under the profile `routes` on an internal network with no published port,
`deploy/valhalla/build-tiles.sh` (build on any computer with Docker, optional), the
`.env.example` lines and `deploy/pi/install.sh --street-routes`. Tried on the Mac: a build
joining Kent and East Sussex, an import, a stopped build (the tiles in use kept serving),
a missing file, a build replacing the tiles in use, and a stop of the container in 2 s.
Not yet run on the Pi in Compose.
