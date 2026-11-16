# Reference layers

Layers of published data for the map: country and regional boundaries, populated
places, airports, publicly mapped military sites and nuclear facilities, hospitals and
emergency services, shelters and emergency meeting points, emergency planning zones,
population density, and historical records. They are the data side of the nuclear
preparedness module (sections 2, 3, 5, 6, 8 and 10 of its specification); the effects
simulator and the module's workspace are built separately and mount these pieces.

Nothing is bundled and nothing is fetched by itself. Each pack is downloaded when a
person presses Download, after the size has been shown, or imported from a file the
person obtained. Every record keeps its source, its publisher's date, the date it was
fetched, how exactly it is placed and its licence, and says on screen which of these it
is:

| Class | On the map | Meaning |
| --- | --- | --- |
| Published public record | a filled dot | From a published dataset (OpenStreetMap, OurAirports, Wikidata, Natural Earth, an official register). Outpost has not checked it on the ground. |
| Historical document | a ring marked H | What a historical document records about the past, with the document and its date. |
| Unverified or speculative | a ring marked ? | Not from a published record, or an author's speculation. |
| Your own | a pin | Saved places and routes, as the Maps screen always draws them. |
| Modelled estimate | a dashed outline | The effects simulator's (not part of this work). |

The specification calls the first class "verified public infrastructure". Outpost does
not verify anything on the ground, so the class is named for what it is: a published
record, as its publisher gives it.

**What these layers never do.** Publicly mapped infrastructure is shown as what a public
dataset lists, nothing more. No layer, sort order, filter, score, ranking, heat map or
export presents a modern place as a likely target, and no probability is attached to any
place. Search results are ordered by how well the name matches; the map's patches count
features. The layers are not joined to the effects simulator in any way that scores or
ranks places; the simulator may ask the population grid for "people within a distance"
of a point it is given (`GET /api/reference/population/sum`), and nothing else.
Historical records, publicly mapped infrastructure and anything modelled are kept apart
in the data (a `provenance` column with a CHECK constraint, and historical records in a
table of their own whose `record_type` is required) and on screen (by mark and by words,
and never counted into one patch together).

## Where it is

- **Maps → Layers**: a switch for each installed layer, its mark and count; population
  with its scale in people per square kilometre and its product and year; filters by
  country, source and kind; a search of every installed layer by name; the legend of
  where things come from.
- **A press on a record** opens a card: its kind and layer, its class, its position, the
  source in one line with a link to the record at its source, and behind disclosures the
  full source facts (publisher, publication date, retrieval date, licence, accuracy,
  pack), other sources that describe the same thing, and every field the source gives. A
  historical record also shows which of the three kinds of record it is, the period, the
  document with its archive reference, classification, evidence and citations, and links
  to the document in the library or at its archive. A press inside an area (a boundary,
  a planning zone) opens what contains it, with the others listed.
- **Maps → Offline maps → Reference data for the map** (also reached from Downloads, and
  from Manage and clean up, by `/maps?reference=manage`): the installed packs with their
  source, licence, data date, fetch date, size, the storage location and whether it is
  connected; **Get reference data** (source, a country or the area on screen or the
  world, layers, then **Show the size**, then a choice of where to keep it and
  **Download**); **Import a file**; and the sources that are only linked, with why.
- **The search across everything** finds records by name (kind "map-feature") and opens
  them on the map at `/maps?feature=<id>`.

The pieces are self-contained in `apps/web/src/features/layers/`:
`useReferenceLayers({ engine, browsing, onManage })` returns the panel, the card and the
credits for any screen with a map; `ReferenceDataSection` is the dataset manager.

## Providers and their terms

Read on 16 November 2026. The quotes are the publishers' own words; where a page could
not be read, that is said. [sources.md](sources.md#reference-layers) has the same table
with the rest of Outpost's sources.

| Provider | What | Terms, quoted | Verdict |
| --- | --- | --- | --- |
| Natural Earth | Countries (1:50m), first-level regions and populated places (1:10m) | [Terms of use](https://www.naturalearthdata.com/about/terms-of-use/): "All versions of Natural Earth raster + vector map data found on this website are in the public domain." "No permission is needed to use Natural Earth." "Crediting the authors is unnecessary." Nothing is said about automated downloads; downloads are "generously hosted by Amazon Web Services". | **Fetched on a press**, as GeoJSON from the project's repository pinned at release v5.1.2 (`raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/`). No checksum is published; the 1:50m countries file is pinned by a SHA-256 Outpost worked out from the file on the day (`3e458fc0…7fdeb`). |
| OurAirports | Airports, airfields, heliports, seaplane bases, with their own `type` | ourairports.com could not be read: its certificate expired on 6 November 2026. The data repository's [licence](https://github.com/davidmegginson/ourairports-data/blob/main/LICENSE): "This is free and unencumbered software released into the public domain." Its README: "Open-data downloads for OurAirports, updated daily." | **Fetched on a press**: `airports.csv` (12.8 MB) from `davidmegginson.github.io`, the chosen countries or box kept. There is no field that says an airfield is military, and none is guessed from names. |
| OpenStreetMap by Overpass | Military sites, nuclear facilities, hospitals, police, fire and ambulance stations, shelters | [Copyright](https://www.openstreetmap.org/copyright): "If you alter or build upon our data, you may distribute the result only under the same license." [Overpass manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html): users "keep their download volume below about 1 GB per day"; problematic is "Setting up an app for more than just OSM mappers and relying on the public instances as backend". [Wiki list of servers](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances) for dresel.systems: "Free to use, no API key. Limit of 4 parallel queries per IP address", "Please send a User-Agent or Referer that identifies your app." Private.coffee's own terms exclude "projects related to warfare, military applications". | **Fetched on a press**, one layer of one country (or a box up to about 20° by 20°) per question, one question at a time to a host with two seconds between and a minute after it says it is busy, from the servers of `catalog/route-sources.json` that hold the area (dresel.systems, Europe and North America) or from one the person declares. **Private.coffee is not used** for reference layers, because of its terms; overpass-api.de is not listed at all (see sources.md, T4). Elsewhere: a Geofabrik extract. |
| OpenStreetMap from Geofabrik | The same five layers, from a country's `.osm.pbf` | [download.geofabrik.de](https://download.geofabrik.de/): "License: ODbL 1.0", "Data processed by Geofabrik GmbH and created by OpenStreetMap Contributors". [Download responsibly!](https://blog.geofabrik.de/index.php/2025/09/10/download-responsibly/) (10 September 2025): "There's a limit to the outgoing network bandwidth"; "monitor what your script is doing or build in appropriate catches". | **Fetched on a press**, one file per country, at most three per estimate, with the MD5 Geofabrik publishes beside it checked before reading; never retried in a loop beyond the download manager's own retries. Or imported from a file the person downloaded. |
| Wikidata | Nuclear power stations (Q134447) and research reactors (Q1438105) with a position | [Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing): "All structured data … is released into the public domain" (CC0). [Query service](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#Query_limits): 60 seconds a query, five at once per address. [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy): "Scripts should use an informative User-Agent string with contact information, or they may be blocked without notice." | **Fetched on a press**: one count and one query, with Outpost's name and project address. |
| WorldPop | Population counts, 2020, 30 arc-seconds (about 1 km), unconstrained, UN-adjusted (DOI 10.5258/SOTON/WP00671) | [Licence](https://hub.worldpop.org/data/licence.txt): "WorldPop datasets are licensed under the Creative Commons Attribution 4.0 International License". | **Fetched on a press**, one GeoTIFF per country (Luxembourg: 23.7 kB). No checksum is published. The citation WorldPop asks for is kept with the grid and shown. The newer R2025A product is constrained and published as an "alpha version … and may change"; the 2020 release was chosen as fixed. |
| BABS (Switzerland) | Emergency meeting points (Notfalltreffpunkte) | [Federal geodata terms](https://www.geo.admin.ch/en/general-terms-of-use-fsdi): "Obtaining and using the data and services is free-of-charge, subject to the provisions on fair use"; "Automatic parsing of geoservices via bots with high query intensities is to be avoided." The dataset is listed under opendata.swiss's "terms_by" licence (open use, source to be given); the opendata.swiss terms page itself refused to be read. | **Fetched on a press**: one GeoJSON file, 1.5 MB, in the Swiss grid (LV95), converted. |
| FAS Nuclear Notebook, Status of World Nuclear Forces | Country-level estimates | FAS pages carry "Federation of American Scientists © 2026" and no licence; the Bulletin of the Atomic Scientists' [terms](https://thebulletin.org/terms-of-use/): "You should assume that everything you see or read on the Website is copyrighted", and no "robot, spider, scraper, crawler, or other automated means to access, extract, harvest" data "regardless of whether the data is publicly accessible". | **Linked.** A figure can be typed into a country figures file with its citation and imported. |
| SIPRI Yearbook | World nuclear forces chapter | [Terms](https://www.sipri.org/about/terms-and-conditions): "SIPRI freely authorizes the downloading or printing of the contents of its website for any non-commercial use." "you may make single copies for your own private use." "Any reproduction—in any medium, electronic or printed—of the data requires authorization"; "permission is only needed if you want to directly reproduce more than 10% of the data set." | **Linked.** The free summary and the sample chapter are PDFs the person may save to their library themselves; they are not added to the catalogue because their addresses change with each revision. Figures typed from them, with citation, can be imported. |
| NTI Index | Country-level security assessments | Not read: the site answered automated reading with a browser check; nti.org/terms-of-use refused. | **Linked.** |
| IAEA PRIS | Power reactor list | Not read: every iaea.org terms page answered 402 or 403. | **Linked**; nothing taken until its terms are read. |
| GeoNuclearData (GitHub), WRI Global Power Plant Database, Global Energy Monitor | Lists of power plants | GeoNuclearData is ODbL but "taken from WNA/IAEA", whose terms were not read; WRI's (CC BY 4.0) is "not currently maintained" since 2022; Global Energy Monitor's tracker page says "All Rights Reserved". | **Not used.** OpenStreetMap and Wikidata cover the same facilities with clear licences. |
| Historical archives | Declassified targeting and civil-defence planning | See [below](#historical-records). | **Linked; manual import.** |
| Emergency planning zones and shelter registers | Official zones and registers | See [below](#emergency-planning-zones-and-shelters). | **Swiss meeting points fetched; the rest linked or imported.** |

### Historical records

What exists, as found on 16 November 2026:

- The US Strategic Air Command's *Atomic Weapons Requirements Study for 1959*, published
  by the National Security Archive as [Electronic Briefing Book 538](https://nsarchive2.gwu.edu/nukevault/ebb538-Cold-War-Nuclear-Target-List-Declassified-First-Ever/)
  (December 2015, updated April 2016): "lists of more than 1100 airfields in the Soviet
  bloc"; "SAC listed over 1200 cities". It is a US government document ("Copyright is
  not claimed as to any work of the United States government"), published as scans of
  the National Archives' copies, not as data. The Archive's own pages are "Copyright
  1995-2017 National Security Archive. All rights reserved."
- A transcription of a 1956 list exists (the Future of Life Institute's map, and a CSV on
  Alex Wellerstein's site); neither carries an open licence ("All rights reserved";
  "All text copyright (©) 2011-2026 by Alex Wellerstein, unless otherwise specified"),
  so neither is used.
- FEMA's *Nuclear Attack Planning Base 1990* (NAPB-90, 1987), released in 2005, is kept
  by FAS as scans; its files could not be confirmed as stable downloads.
- The UK's Square Leg (1980) and Hard Rock (1982) exercise files at The National
  Archives (HO 322/950–951, HO 322/983–1020) are open but not digitised; HO 322/785,
  "Probable nuclear targets in the United Kingdom: assumptions for planning" (1969–72),
  is held by its department, not at Kew. *Protect and Survive* (1980) is Crown copyright.

**No machine-readable source cleared for redistribution was found, so no dataset ships.**
Built instead: the historical records table, the import, the map layer and the record
card. A historical records CSV (template at `/api/reference/templates/historical-csv.csv`)
has one row per record with the fields of section 6: `record_id`, `name`, `latitude`,
`longitude` (both may be empty when the place is not documented), `location_text`,
`country`, `period`, **`record_type`** (`target-list`, `assessment` or `speculation`:
an actual historical target list, a historical assessment of likely targets, or an
author's speculation; required), `document_title`, `document_publisher`,
`document_date`, `archive_ref`, `classification` (the original classification or
archival context), `target_category`, `evidence_quality`, `geographic_precision`,
`citations` (separated by `|`), `document_url`, `library_document_id` (a document in
the library, opened from the record), `publisher` (who made the transcription),
`license` (of the transcription) and `notes`. A row without its record type, period,
document, evidence, precision, citation, publisher or licence is not stored. An
author's speculation is stored as "unverified or speculative", the others as
"historical document". Outpost did not transcribe any records itself.

The source documents are in the Linked list of the dataset manager. None is added to
the download catalogue: the Archive's scans are public-domain works, but the files could
not be confirmed as stable addresses on the day; a person can save them to the library
from the Archive's page.

### Emergency planning zones and shelters

- **UK** detailed emergency planning zones (REPPIR 2019) are published by each local
  authority, mostly as maps in PDFs. data.gov.uk lists "Nuclear Emergency Planning
  Zones" with licence "unpublished" and "There are no links to this data." West
  Berkshire's map server has the AWE zones as layers, with no licence stated. So: linked
  (the HSE's page on the regulations), and a zone a council publishes as a file can be
  imported as GeoJSON in British National Grid, which is converted.
- **United States**: HIFLD Open was withdrawn in August 2025 and no national NRC zone
  dataset was found; nrc.gov refused automated reading. Linked only (nothing listed).
- **Switzerland**: the zone plans round nuclear facilities (ENSI) are published as
  geodata in LV95, but one record says "proprietary" and the federal terms say "Any
  reproduction requires the prior written consent of the copyright holder", while
  another says "keine Einschränkungen". Linked, importable. The emergency meeting points
  (BABS) are fetched. Cantonal shelter files (Zug, Glarus, Schwyz, Lucerne) exist under
  opendata.swiss terms and can be imported; they are not fetched (each is its own
  format, and none was tried).
- **Finland, Germany**: no open national register was found. **Taiwan** (county air-raid
  shelter CSVs under the Open Government Data License 1.0) and **South Korea** (the
  interior ministry's civil-defence shelter service) publish data; neither was tried,
  and Korea's likely needs a key. Importable as CSV.

OpenStreetMap's tags for shelters, from the wiki: `amenity=shelter` with
`shelter_type=bomb_shelter` (in use), `bunker_type=bomb_shelter`, `air_raid_shelter`
and `nuclear` (with `military=bunker` or `building=bunker`), and
`emergency=assembly_point`. The wiki has no tag that says "civil defence". A mark from
these is what a mapper recorded; the layer says so, and that a mark does not mean a
shelter is open, kept up or meant for you.

## OpenStreetMap: which tags, and what the licence asks

| Layer | Tags (from the wiki pages, statuses as given there) | Left out, and why |
| --- | --- | --- |
| Military sites | `landuse=military` (de facto); `military=base` (approved), `airfield`, `barracks`, `naval_base` (deprecated, still 506 in use), `range`, `training_area`, `danger_area`, `academy`, `office`, `checkpoint`, `school`, `nuclear_explosion_site` (historical test sites) | `military=bunker` on its own (110,592 worldwide, mostly pillboxes from past wars); `trench`, `obstacle_course` |
| Nuclear facilities | `power=plant` + `plant:source=nuclear` (approved) | `power=generator` + `generator:source=nuclear`: reactors inside a station, which would list one station several times. No tag for research reactors is documented; they come from Wikidata. |
| Hospitals | `amenity=hospital`, `healthcare=hospital` | |
| Police, fire and ambulance | `amenity=police`, `amenity=fire_station`, `emergency=ambulance_station` | |
| Shelters and assembly points | as above | `amenity=shelter` of other kinds (bus stops, picnic shelters) |

The wiki's page on `military=*` warns: "In some territories … it is illegal to create
maps of military facilities, or even mapping their location … using OpenStreetMap can
be illegal when other contributors have mapped these things." Outpost shows that
warning before the military layer is estimated or downloaded.

**The Open Database Licence.** A pack of OpenStreetMap records kept in Outpost is an
extract of the database (a "derivative database" where it is substantial, which a
country's hospitals are). Keeping it for one household is not public use, so nothing is
owed for keeping it. The map on screen is a "produced work" and carries "© OpenStreetMap
contributors, ODbL" in its credits while an OpenStreetMap layer is drawn. Outpost has
**no export** of reference layers, so it passes nothing on and no share-alike duty
arises from it. The downloaded files (Overpass answers, `.osm.pbf` extracts) stay in the
storage location; anyone who copies them on to others must offer them under the ODbL
with the notice, as with any OpenStreetMap data.

## The data model

Migration **0020** (`apps/server/src/db/migrations/0020_reference_layers.sql`).

- **A pack is a collection** of kind `dataset` (`meta.reference`: provider, item key,
  scope, layers, version, publisher's date, retrieval time, counts, what was skipped and
  why). It is therefore listed, moved, checked and removed like every collection, counted
  in Manage and clean up, and its file lives in a storage location: local disk, an
  external drive or a network share.
- **`reference_features`**: one row per record, with `provider`, `source_id`, `layer`,
  `kind` (the source's own code), `name`, `alt_names`, `country`, a representative point
  (`lat`, `lon`, WGS 84), a box, a GeoJSON `geometry` for areas and lines, the source's
  kept fields (`props`), `provenance` (CHECK: `public-infrastructure`, `historical`,
  `user`, `unverified`), `accuracy` in words and `accuracy_m` where it can be said,
  `publisher`, `license`, `source_url`, `published_at`, `retrieved_at`, and
  `duplicate_of`.
- **`reference_features_rtree`** (SQLite R*Tree) and **`reference_features_fts`**
  (FTS5 on names), kept by triggers.
- **`historical_records`**: the section-6 fields for each historical record, one to one
  with its feature, `record_type` CHECKed.
- **`country_figures`**: a country, an indicator, a value (or words), unit, year, and the
  source's title, publisher, date, address, page and licence. Nothing finer than a
  country.
- **Population grids** are the GeoTIFF in the storage location and, in the data
  directory, `reference/population/<key>.bin`: the grid summed into cells of 4, 16, 64
  and 256 to a side, written at install.

Records reach the app's search through a search source (`modules/layers/index.ts`) that
answers from the full-text index. Records link to documents (`library_document_id`) and
to each other (`duplicate_of`): the "relationships between records" of section 8.

**R*Tree, measured.** The driver's SQLite (3.54.1) is built with `ENABLE_RTREE`,
`ENABLE_GEOPOLY` and `ENABLE_FTS5`. On this Mac (Apple silicon), 300,000 clustered points
in memory, 50 queries each:

| View | R*Tree count | R*Tree rows | Tile key (z12, B-tree) | No index |
| --- | --- | --- | --- | --- |
| 0.1° (3 found) | 0.01 ms | 0.01 ms | 0.02 ms | 9.05 ms |
| 0.5° (97) | 0.02 ms | 0.06 ms | 0.07 ms | 9.60 ms |
| 4° (4,490) | 0.19 ms | 2.52 ms | 1.48 ms | 10.12 ms |
| 30° (115,744) | 4.37 ms | 60.18 ms | 39.11 ms | 13.50 ms |

The R*Tree was chosen: fastest where views are small, and at continent scale both are
outrun by a plain scan, which is why large views are counted into patches. The query
joins the R*Tree first (`CROSS JOIN`): left to itself SQLite started from the layer index
and was a thousand times slower on a town-sized view.

**Duplicates.** When a pack is installed, each of its records is compared with what is
already held: the same record of the same source in another pack; an OpenStreetMap object
whose `wikidata` tag names a Wikidata item that is held (the Wikidata record becomes the
duplicate, as the mapped one has the outline); and, between different sources in the same
layer, a record within a kilometre whose name is the same once folded. The duplicate is
kept, with its provenance, and listed in the card as "Also recorded by"; it is not drawn
twice. Removing a pack releases the records that were hidden as its duplicates.

**Coordinate systems.** Everything is stored in WGS 84. A GeoJSON file's `crs` member, or
a system named when importing, is honoured: Web Mercator (EPSG:3857), the British
National Grid (EPSG:27700, by OSGB36 and the published Helmert transformation, about 5 m,
which the record's accuracy says) and the Swiss grids (EPSG:2056 and 21781, by swisstopo's
approximate formulas, about 1 m) are converted; any other is refused with a message
naming it. A file that names no system but whose coordinates are not degrees is refused,
and a position whose latitude and longitude look swapped is skipped with that reason. A
population grid in anything but EPSG:4326 is refused.

## The map, and how it stays quick

`GET /api/reference/features?bbox&zoom&layers…` answers a view from the R*Tree. Up to
1,500 features are sent as points; above that they are counted into patches of a power
of two of a degree, about eight to the height of the view, per layer and per provenance
class. Areas are sent for boundaries, regions and planning zones at any zoom and for
other layers from zoom 9, simplified (Douglas–Peucker) to the view's scale, at most 600.
The last 64 answers are kept until a record is written or removed. The browser asks only
when the map comes to rest, for the view rounded outwards so that a small nudge asks
nothing new.

Measured on this Mac with 300,000 features in the database, through the API, while other
test suites were running: a view of the world 1.1 to 1.4 s the first time (counting every
feature into patches) and at once after; a country 44 to 70 ms; a town 1 ms; a search by
name 14 to 38 ms. Inserting the 300,000 took 20 to 45 s (with both indexes kept by
triggers). Frame times in the browser were not measured with an instrument; the map
draws at most 1,500 points or a few hundred patches, which MapLibre draws without
strain on this Mac. **On a Raspberry Pi** (not tried): expect the database parts to be
four to eight times slower, so a first view of the world of a few hundred thousand
features in five to ten seconds, and a country view well under a second.

Population is drawn from the coarse grids for any view larger than about 3,000 cells and
from the GeoTIFF itself close in; strips last read are kept in memory up to 64 MB.
Densities under one person a square kilometre are left clear. The classes are 1, 10,
100, 500 and 2,000 people per km², in the sequential ramp, with WorldPop's product and
year beside the switch.

## The dataset manager, downloads and updates

- **Estimate first.** Show the size asks the source only for what it needs to say how
  big: a HEAD request for a file (asked for uncompressed, as GitHub otherwise gives the
  compressed length), a count from Overpass or Wikidata, Geofabrik's index and MD5. The
  answer lists each item with its size (marked "about" where it is worked out), its host,
  how the size was arrived at, and what it would replace, then the total, an allowance for
  the database, and a choice of storage location with its free space. The estimate is
  kept on the server for half an hour; Download starts only items from it.
- **Downloads** go through the download manager: resumable for files, a checksum where
  the publisher gives one (Geofabrik's MD5) or Outpost pinned one (Natural Earth's
  countries), cancellable, with progress. An Overpass or Wikidata answer cannot be
  resumed part-way, so a retry asks again.
- **Installing** reads the file under a temporary owner; only when all of it is read is
  the pack recorded and given the rows, and any pack of the same source, item and area
  removed, in one transaction. A file that cannot be read fails with the reason and
  leaves the installed pack as it was; an interrupted install leaves nothing behind
  (rows of a pack that no longer exists are cleared at start).
- **Updating** is the same estimate made again from the pack's own request; the new pack
  replaces the old when it is in. No source offers incremental updates that Outpost
  applies: Overpass cannot say what was deleted, Geofabrik's change files are not read,
  OurAirports and BABS publish whole files.
- **A storage location going away** (a drive unplugged, a share unmounted): the pack says
  so; its records stay on the map (they are in the database); population draws from the
  coarse grids in the data directory, and a sum within a circle says the drive is needed.

## Adding an adapter

An adapter implements `ReferenceAdapter` (`apps/server/src/modules/layers/types.ts`):

1. `provider`: its entry in `providers.ts`, with the licence, the terms quoted with the
   date read, and the verdict. Read the publisher's own terms first; if they do not allow
   a program to fetch, the verdict is `import` or `link` and there is no `estimate`.
2. `estimate(request)`: what it offers for the countries or box asked, each item with an
   honest size and how it was arrived at. Anything the download needs that the browser
   should not see (a dated address, a checksum) goes in the item's `extra`.
3. `download(request, item)`: the address, the hosts allowed, the size, the checksum and
   the fetcher (`http`, or `reference-query` for an answer to a query).
4. `read({ filePath, meta, sink })`: check the format, convert to WGS 84 (`crs.ts`), and
   hand each record to `sink.add` with its provenance, accuracy, publisher, licence and
   dates; `sink.skip(reason)` for what cannot be used; throw `PermanentJobError` for a
   file that is not what it should be.
5. Register it in `service.ts`, add its host to [security.md](security.md#reference-layers),
   a test against a file in its publisher's format, and a row above.

## What is not built, and why

- **No dataset of historical targets ships**: none cleared for redistribution exists as
  data (above). Outpost did not transcribe any.
- **The specification's "terrain" and "offline weather and wind reference data" layers**
  are not part of this work: terrain is the Maps screen's existing hill shading and
  contours; wind data has no source here.
- **Admin-1 regions as a scope for downloads** are not offered: a pack is chosen by
  country, a box on screen, or the world. Regions are a layer to look at.
- **Cantonal Swiss shelter files, Taiwan's and Korea's shelter data** are importable as
  CSV but no adapter fetches them.
- **The 1:10m regions and populated places** are fetched as the whole world's files (41 MB
  and 19 MB) and the chosen countries kept; Natural Earth does not publish them by
  country.
- **OpenStreetMap relations** are drawn by their outer edges as lines, not filled; ways are
  filled.
- **An export of reference layers** is not offered (above).
- **The browser's frame times** with a few hundred thousand features were not measured with
  an instrument; nothing was run on a Raspberry Pi.

## What was done on 16 November 2026, and how

One real download per provider through a private copy of Outpost on this Mac (port 9005,
its own data directory), each by an API call made by hand:

| Provider | What | Size | Time | Records |
| --- | --- | --- | --- | --- |
| Natural Earth | Countries 1:50m, Luxembourg kept | 3,083,490 bytes (SHA-256 checked) | 1.0 s | 1 |
| OurAirports | `airports.csv`, Luxembourg kept | 12,761,443 bytes | 3.1 s | 15 (1 large airport, 2 small, 11 heliports, 1 closed) |
| WorldPop | Luxembourg, 2020, 1 km | 23,719 bytes | 2.0 s | a grid; 10 km round Luxembourg city: about 220,000 people |
| Wikidata | Belgium's nuclear power stations and research reactors | 4,808 bytes | count 29 s, query 59 s | 5 |
| BABS | Swiss emergency meeting points | 1,473,452 bytes | 1.3 s | 2,958 |
| OpenStreetMap by Overpass (ovp.dresel.systems) | Luxembourg: military sites; hospitals | 18,952 and 34,775 bytes | 5.1 s for both, paced | 10 and 15; data of 2026-11-15 |
| OpenStreetMap from Geofabrik | Liechtenstein extract, MD5 checked | 3,519,004 bytes | 5.1 s | 24 (emergency services, shelters, hospitals) |

The Wikidata query took 59 of the service's 60 seconds; a larger country, or the world,
may be refused by the service. All files were deleted afterwards. The layers were looked
at in a browser at desktop and phone width, light and dark, against that copy.
