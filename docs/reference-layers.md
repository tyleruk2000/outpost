# Reference layers

Layers of published data for the map: country and regional boundaries, populated
places, airports, publicly mapped military sites and nuclear facilities, hospitals and
emergency services, shelters and emergency meeting points, emergency planning zones,
population density, historical records, and food and supplies (shops, markets, food
banks, drinking water, fuel and pharmacies; see [Food and supplies](#food-and-supplies)). They are the data side of the nuclear
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
  connected; **Get reference data** (source, a country, a state or region by name, the
  area on screen or the world, layers, then **Show the size**, then a choice of where to
  keep it and **Download**); **Import a file**; and the sources that are only linked, with why.
- **Preparedness → Nuclear preparedness** mounts the same panel, card and dataset manager
  in its Layers tab, lists historical records in a Records tab
  (`GET /api/reference/historical`), and asks the population grid for the people inside
  each ring of a scenario; nothing else joins the layers to its scenarios
  ([nuclear-preparedness.md](nuclear-preparedness.md)).
- **A WorldPop grid downloaded by hand** can be imported (Import a file, "Population grid
  from WorldPop"), read and credited as the download would be.
- **Food and supplies**: the kinds, the nearest list and the card, under the layer's
  switch in the Layers tab ([below](#food-and-supplies)).
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
| OurAirports | Airports, airfields, heliports, seaplane bases, with their own `type`; their radio frequencies | ourairports.com could not be read: its certificate expired on 6 November 2026 (still so on 17 November). The data repository's [licence](https://github.com/davidmegginson/ourairports-data/blob/main/LICENSE): "This is free and unencumbered software released into the public domain." Its README: "Open-data downloads for OurAirports, updated daily." | **Fetched on a press**: `airports.csv` (12.8 MB) from `davidmegginson.github.io`, the chosen countries or box kept, and `airport-frequencies.csv` (1.3 MB) from the same folder in the same install (see [Airport frequencies](#airport-frequencies)). There is no field that says an airfield is military, and none is guessed from names. |
| OpenStreetMap by Overpass | Military sites, nuclear facilities, hospitals, police, fire and ambulance stations, shelters | [Copyright](https://www.openstreetmap.org/copyright): "If you alter or build upon our data, you may distribute the result only under the same license." [Overpass manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html): users "keep their download volume below about 1 GB per day"; problematic is "Setting up an app for more than just OSM mappers and relying on the public instances as backend". [Wiki list of servers](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances) for dresel.systems: "Free to use, no API key. Limit of 4 parallel queries per IP address", "Please send a User-Agent or Referer that identifies your app." Private.coffee's own terms exclude "projects related to warfare, military applications". | **Fetched on a press**, one layer of one country (or a box up to about 20° by 20°) per question, one question at a time to a host with two seconds between and a minute after it says it is busy, from the servers of `catalog/route-sources.json` that hold the area (dresel.systems, Europe and North America) or from one the person declares. **Private.coffee is not used** for reference layers, because of its terms; overpass-api.de is not listed at all (see sources.md, T4). Elsewhere: a Geofabrik extract. |
| OpenStreetMap from Geofabrik | The same five layers, and food and supplies when ticked, from a country's or a region's `.osm.pbf` | [download.geofabrik.de](https://download.geofabrik.de/): "License: ODbL 1.0", "Data processed by Geofabrik GmbH and created by OpenStreetMap Contributors", "This open data download service is offered free of charge by Geofabrik GmbH." [Download responsibly!](https://blog.geofabrik.de/index.php/2025/09/10/download-responsibly/) (10 September 2025): "There's a limit to the outgoing network bandwidth"; "If you automate anything with regard to our download server, monitor what your script is doing"; "build in appropriate catches so that you don't end up downloading the same file 1000 times". Read again on 17 November 2026, with the [technical page](https://download.geofabrik.de/technical.html) on its index. | **Fetched on a press**, one file per country or region (see [Food and supplies for a state or region](#food-and-supplies-for-a-state-or-region)), at most three per estimate, with the MD5 Geofabrik publishes beside the dated file checked before reading; never retried in a loop beyond the download manager's own retries. Or imported from a file the person downloaded. |
| Wikidata | Nuclear power stations (Q134447) and research reactors (Q1438105) with a position | [Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing): "All structured data … is released into the public domain" (CC0). [Query service](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#Query_limits): 60 seconds a query, five at once per address. [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy): "Scripts should use an informative User-Agent string with contact information, or they may be blocked without notice." | **Fetched on a press**, once the person has ticked that the name may be sent: one count and one query, with Outpost's name and the project's web address, which the policy requires. See [The name a source is given](#the-name-a-source-is-given). |
| WorldPop | Population counts, 2020, 30 arc-seconds (about 1 km), unconstrained, UN-adjusted (DOI 10.5258/SOTON/WP00671) | [Licence](https://hub.worldpop.org/data/licence.txt): "WorldPop datasets are licensed under the Creative Commons Attribution 4.0 International License". | **Fetched on a press**, one GeoTIFF per country (Luxembourg: 23.7 kB). No checksum is published. The citation WorldPop asks for is kept with the grid and shown. The newer R2025A product is constrained and published as an "alpha version … and may change"; the 2020 release was chosen as fixed. |
| BABS (Switzerland) | Emergency meeting points (Notfalltreffpunkte) | [Federal geodata terms](https://www.geo.admin.ch/en/general-terms-of-use-fsdi): "Obtaining and using the data and services is free-of-charge, subject to the provisions on fair use"; "Automatic parsing of geoservices via bots with high query intensities is to be avoided." The dataset is listed under opendata.swiss's "terms_by" licence (open use, source to be given); the opendata.swiss terms page itself refused to be read. | **Fetched on a press**: one GeoJSON file, 1.5 MB, in the Swiss grid (LV95), converted. |
| FAS Nuclear Notebook, Status of World Nuclear Forces | Country-level estimates | FAS pages carry "Federation of American Scientists © 2026" and no licence; the Bulletin of the Atomic Scientists' [terms](https://thebulletin.org/terms-of-use/): "You should assume that everything you see or read on the Website is copyrighted", and no "robot, spider, scraper, crawler, or other automated means to access, extract, harvest" data "regardless of whether the data is publicly accessible". | **Linked.** A figure can be typed into a country figures file with its citation and imported. |
| SIPRI Yearbook | World nuclear forces chapter | [Terms](https://www.sipri.org/about/terms-and-conditions): "SIPRI freely authorizes the downloading or printing of the contents of its website for any non-commercial use." "you may make single copies for your own private use." "Any reproduction—in any medium, electronic or printed—of the data requires authorization"; "permission is only needed if you want to directly reproduce more than 10% of the data set." | **Linked.** The free summary and the sample chapter are PDFs the person may save to their library themselves; they are not added to the catalogue because their addresses change with each revision. Figures typed from them, with citation, can be imported. |
| NTI Index | Country-level security assessments | Not read: the site answered automated reading with a browser check; nti.org/terms-of-use refused. | **Linked.** |
| IAEA PRIS | Power reactor list | Not read: every iaea.org terms page answered 402 or 403. | **Linked**; nothing taken until its terms are read. |
| GeoNuclearData (GitHub), WRI Global Power Plant Database, Global Energy Monitor | Lists of power plants | GeoNuclearData is ODbL but "taken from WNA/IAEA", whose terms were not read; WRI's (CC BY 4.0) is "not currently maintained" since 2022; Global Energy Monitor's tracker page says "All Rights Reserved". | **Not used.** OpenStreetMap and Wikidata cover the same facilities with clear licences. |
| Historical archives | Declassified targeting and civil-defence planning | See [below](#historical-records). | **Linked; manual import.** |
| Environment Agency (England) | Flood Zones 2 and 3 (Flood Map for Planning, Rivers and Sea) | [data.gov.uk](https://www.data.gov.uk/dataset/flood-map-for-planning-flood-zones1), updated 22 October 2026: "Open Government Licence"; "Attribution statement: © Environment Agency copyright and/or database right 2025. All rights reserved." No limit on requests was found on the publisher's pages. See [below](#flood-zones-england) and [sources.md](sources.md). | **Fetched on a press**, for the area on screen up to about 20 km across, after a count. |
| Food Standards Agency (UK) | Registered food businesses: retailers only, for the food and supplies layer | See [Food and supplies](#food-and-supplies). [Terms](https://ratings.food.gov.uk/terms-and-conditions): "subject to the terms of the Open Government Licence". | **Fetched on a press**, for the area on screen up to about a county. |
| Give Food | UK food banks | See [Food and supplies](#food-and-supplies): asks to be contacted before launch and to be kept up to date several times a day. | **Linked**: wanted, and the project could be asked. |
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

### Flood zones (England)

The Environment Agency's Flood Map for Planning, Flood Zones 2 and 3 from rivers and the
sea, under the Open Government Licence. Its provenance class is **published public
record**. England only: the service's extent is England, a box outside it is refused
before anything is asked, and Scotland (SEPA), Wales (NRW) and Northern Ireland (DfI)
publish their own maps, which Outpost does not fetch.

- **Getting it.** Maps → Offline maps → Reference data for the map, source "Flood zones,
  England (Environment Agency)", **The area on screen**, **Show the size**. The area may
  be at most 0.2° north to south and 0.3° east to west (about 22 by 20 km in the
  Midlands); a larger one is refused with that reason, so zoom in first. Show the size
  asks the service for one area and its count (`numberMatched`), and gives the size as
  "about" (the count times 19 kB, the average measured round Bedford), because every
  area that touches the box comes whole and some are large. An area of more than 5,000
  is refused. Download then fetches all of them in one answer through the download
  manager onto a storage location. The same box fetched again replaces its pack; boxes
  side by side are separate packs, and an area in both is listed once, the other as a
  duplicate.
- **Why these limits.** On 16 November 2026 a box 7 km across held 248 areas, 4.6 MB,
  answered in under half a second; a box twice as wide each way was not answered within
  90 seconds. The limits are Outpost's, not the Agency's; no limit is published.
- **On the map.** Areas, filled, under the map's names (they are drawn below the labels,
  as the grey line is). The two zones are told apart without relying on colour: Flood
  Zone 3 in the deeper tone with a solid edge, Flood Zone 2 in a lighter tone of the
  same colour with a broken edge; zone 3 is drawn over zone 2. They are drawn from zoom
  11 in (about a town's width across a phone's screen), at most 3,000 to a view; further
  out, or with more, the legend says "Zoom in". They are never drawn as points or counted
  into patches. A press inside an area opens its card, with the zone, its source
  (`river`, `sea`), its `origin` as the Agency gives it, and the definition and caveat.
- **The legend** gives each zone in the Agency's words ("Flood Zone 3 – Areas shown to be
  at a 1% (1 in 100) or greater annual probability of flooding from rivers or, 0.5% (1 in
  200) or greater annual probability of flooding from the sea."; Flood Zone 2 likewise),
  that the map "shows the extent of land at present day risk of flooding from rivers and
  the sea, ignoring the benefits of defences", the Agency's caveat ("The Flood Zones are
  designed to only give an indication of flood risk to an area of land and are not
  suitable for showing whether an individual property is at risk of flooding. This is
  because we cannot know all the details about each property."), that it covers England
  only, and, in Outpost's words, that a planning zone is not a forecast that a place will
  flood nor a warning. The attribution is in the legend and the map's credits.
- **Not done.** The Agency's "Risk of Flooding from Rivers and Sea" (which takes defences
  into account) has no feature service, only a WMS of pictures and a national bulk file,
  so it is not offered. The download was tried by hand against the real service only as
  described above (a count and one box); the full flow through Outpost was tested against
  a local stand-in, not the live service (`OUTPOST_FLOOD_ZONES_URL` puts one in the
  Agency's place for tests), and there is no end-to-end test of it in a browser.


### Airport frequencies

The radio frequencies OurAirports' contributors list for each airport, from
`airport-frequencies.csv` in the same repository as `airports.csv`, under the same
licence (the Unlicense: public domain).

- **What is fetched.** When the airports pack is downloaded or updated, the install
  fetches `https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv`
  once, after `airports.csv` has arrived. On 17 November 2026 it was 1,302,744 bytes
  (340 kB as sent, compressed) with 30,397 rows for 11,215 airports, at most 31 for one.
  Show the size asks both files for their size and shows them together, naming each, with
  a note that the second file is fetched at install. Only the rows for the airports kept
  are stored; the file itself is not kept. A row without a usable frequency (some have 0)
  is left out and counted.
- **The columns.** ourairports.com's data dictionary could not be read (its certificate
  had expired), so the columns are the file's own header row as found on 17 November
  2026: `"id","airport_ref","airport_ident","type","description","frequency_mhz"`. A row
  is joined to its airport by `airport_ident`, the airport's `ident`. The header is
  checked before anything is used.
- **Where it is kept.** In each airport's own fields (`props.frequencies`, with the
  file's date in `props.frequencies_as_of`), so no table was added: the rows are counted
  with the layer's records, backed up with the database, replaced when the pack is
  updated, removed with the pack and erased by erase-everything. They are not searchable
  text: an airport is found by its name and codes as before.
- **When it fails.** If the file cannot be fetched, has another header, or is larger than
  16 MB (about twelve times its size on the day), the airports are installed without
  frequencies and the pack says so under Reference data for the map: "Radio frequencies
  were not included: …, update this pack to try again." When they are included it says
  for how many of the airports kept.
- **On the card.** An airport's card lists its frequencies: what each is for (the file's
  type and description as given; a type is put into words only where its meaning is
  certain, the ICAO abbreviations TWR, GND, APP, DEP, ARR, DEL, INFO, RDO and RDR and the
  same words typed out; anything else, such as `CLD` or `A/D`, is shown as given) and the
  frequency in MHz with three decimals at least, tower first, then ATIS, AFIS, FIS and
  information, then the rest in the file's order, one line each where it fits. They come
  first on the card, straight under what the place is, in a list about five rows high
  that scrolls inside the card, so that at 390 × 844 a phone shows the name, four or
  five rows and the caution. Under it, in a line: not for navigation or flight planning,
  OurAirports' community list as of the file's date may be out of date or wrong. Behind
  one disclosure: that it is a community-maintained public-domain dataset Outpost has
  not checked, the radio screens' own line on listening to aviation traffic, and a link
  to the VHF air band in Frequencies to listen to. The card folds to one line (the name
  and how many frequencies), as a repeater's card does, and opening a record from the
  Layers tab on a phone lowers the sheet for it. An airport the file has no rows for says "No frequencies
  listed", not that there are none. An airport from a pack installed before frequencies
  were fetched, or whose frequencies could not be fetched, says they are not held yet and
  links to Reference data for the map, where updating the pack gets them.
- **Tried.** The file was fetched once by hand on 17 November 2026 to read its header,
  size and rows; 33 of its rows are kept as the tests' fixture
  (`apps/server/test/fixtures/layers/ourairports-stand-in.ts`) and the rest was deleted.
  The download through Outpost was tested against a local stand-in only
  (`OUTPOST_OURAIRPORTS_URL` puts one in the repository's place), not against the real
  host.

### The name a source is given

Most sources are asked under the plain name Outpost uses for every download,
`Outpost (self-hosted offline library)`. Two ask for more: the public Overpass servers
and Wikidata's query service both tell programs to give a name that says what they are
and how their makers can be reached, and may block one that does not. To those two
Outpost sends "Outpost", its version and the project's web address
(`Outpost/0.1.0 (self-hosted offline library; +https://github.com/tyleruk2000/outpost)`).
It is the same for every copy of Outpost and says nothing about the person, their
library or the installation; the source also sees, as any site does, the address the
request comes from and what was asked for.

Some people will not want the software they run named to a third party, so this is
never done quietly:

- When one of these sources is chosen in "Get reference data", a panel headed "This
  source is told what is asking" shows the name word for word, says what it does and
  does not reveal, and says that leaving the source alone asks nothing.
- "Show the size", which is the first contact with the source, is switched off until
  the box "Send this name to …" is ticked. The tick is asked for each time the dialog
  is opened and again when the source is changed; it is not kept as a setting.
- Updating an installed pack from such a source opens the same dialog and waits for
  the same tick: no update is estimated by itself, as it is for other sources.
- The server refuses an estimate for such a source unless the request says the person
  agreed (`clientNameAgreed: true`), quoting the name in the refusal, so nothing is sent
  by a client that skips the screen. A download can only follow an estimate.

The catalogue (`GET /api/reference/catalogue`) gives each such provider's `clientName`;
the others have none.

## OpenStreetMap: which tags, and what the licence asks

| Layer | Tags (from the wiki pages, statuses as given there) | Left out, and why |
| --- | --- | --- |
| Military sites | `landuse=military` (de facto); `military=base` (approved), `airfield`, `barracks`, `naval_base` (deprecated, still 506 in use), `range`, `training_area`, `danger_area`, `academy`, `office`, `checkpoint`, `school`, `nuclear_explosion_site` (historical test sites) | `military=bunker` on its own (110,592 worldwide, mostly pillboxes from past wars); `trench`, `obstacle_course` |
| Nuclear facilities | `power=plant` + `plant:source=nuclear` (approved) | `power=generator` + `generator:source=nuclear`: reactors inside a station, which would list one station several times. No tag for research reactors is documented; they come from Wikidata. |
| Hospitals | `amenity=hospital`, `healthcare=hospital` | |
| Police, fire and ambulance | `amenity=police`, `amenity=fire_station`, `emergency=ambulance_station` | |
| Shelters and assembly points | as above | `amenity=shelter` of other kinds (bus stops, picnic shelters) |
| Food and supplies | `shop=supermarket`, `convenience` and `general` (small shop), `greengrocer`, `butcher`, `bakery`, `farm`; `amenity=marketplace`, `fuel`, `pharmacy`, `drinking_water`, `water_point`; `man_made=water_tap`; `social_facility=food_bank` | Restaurants, cafés, pubs, takeaways; taps and water points tagged `drinking_water=no`; `healthcare=pharmacy` on its own |

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

## Food and supplies

Asked for by the owner on 17 November 2026: "is there any open source data layers we
could use for food stores?" The layer holds the shops and public facilities a household
would look for when the shelves at home run low, as they are on any map: supermarkets,
small shops (`convenience`, `general`), greengrocers, butchers, bakers, farm shops,
markets, food banks, drinking water, fuel and pharmacies, and in the UK every shop
registered with its council as selling food. Nothing in it is about who holds food or
where to take it from. Its provenance class is **published public record**.

**How complete it is likely to be.** Well mapped in towns in Britain and much of Europe;
patchy in the countryside and in many other countries; a place missing from the map may
still be there. Opening hours, brands and addresses are mapped for some places and not
others. In the UK the Food Standards Agency's list is much fuller for shops, as every food
business must register, but its positions can be the postcode's rather than the door's,
and its "Retailers - other" includes any shop that sells some food (newsagents, chemists,
delicatessens, outdoor shops, campsite shops).

**Getting it.** Maps → Offline maps → Reference data for the map, then either source:

- **OpenStreetMap, by tag query**: tick **Food and supplies** (it is never part of "all
  layers"), choose **The area on screen**, tick that the client name may be sent, **Show
  the size**, **Download**. The area may be at most 1.5° north to south and 2° east to west
  (about a county: Devon is about 1.6° by 1°), and must count at most 30,000 places; a
  country is refused, with that reason, before anything is asked. These limits are
  Outpost's: the public servers' operators ask applications not to rely on them for bulk
  extraction (see the OpenStreetMap row above), and a country's shops is that.
- **OpenStreetMap, from a Geofabrik extract**: **A state or region, by name** (a US
  state, a German Land, an English county, or a whole country), tick **Food and
  supplies**, **Show the size**, **Download**. See [below](#food-and-supplies-for-a-state-or-region).
  From the first source with food ticked, the dialog links to this one for anything
  larger than a county.
- **Food Standards Agency: registered food businesses (UK)**: **The area on screen**,
  **Show the size**, **Download**. The same box limits; an area outside the UK is
  refused. Two packs come: supermarkets, and other shops selling food.

Updating either pack asks again for the same area and replaces it. Areas side by side are
separate packs, and a place in both is listed once.

**The Food Standards Agency's data.** Read on 17 November 2026: the terms say "Use of
proprietary food hygiene ratings information and services is subject to the terms of the
Open Government Licence", and the open data page that the API "is a free service and
there is no need to register to use it" and "The data is updated daily". The API's help
states no limit on requests, and says it needs no key "at this time". Neither
`robots.txt` exists (404). So it is fetched, under Outpost's plain name, on a press:
while estimating, one request per business type with a page of one, for the count; then
one page per type of up to 5,000 businesses within the distance in miles from the area's
middle to its corners (the API searches by centre and distance), keeping only those inside
the area. Only the two retailer types are asked for (`7840`, "Retailers -
supermarkets/hypermarkets"; `4613`, "Retailers - other"); restaurants, takeaways,
caterers, pubs, manufacturers and farmers are not. **Hygiene ratings are not kept or
shown**: they are not what the layer is for, and the Agency has its own rules for
displaying them ("Only the actual rating issued under the FHRS may be used"). Each record
links to the business's page on ratings.food.gov.uk. Credit on the map: "Food
businesses: Food Standards Agency, Open Government Licence v3.0". Measured once on
17 November 2026: 309 "Retailers - other" within 10 miles of Bedford, 243 kB, in 0.19 s.
The Agency says a page "maybe capped by the system"; where it sends fewer than it
counted, the pack says so. A search with a small distance (0.3 miles) answered with
businesses up to 2.1 miles away, so the distance is a floor rather than a fence, which
is why the area is cut to the box afterwards.

**One shop in both.** When a pack is installed, each of its places is compared with what
the other source holds nearby. Two are taken as one shop when their names agree, once
folded and without company words ("Ltd", "PLC", "UK", "Stores"), numbers and what is in
brackets (equal, or every word of the shorter, of four letters or more in all, in the
other), or the Agency's name of one or two words is the mapped brand; and they are within
150 m, or 400 m when both give the same postcode, or 100 m when they give different ones.
Otherwise both are shown. The mapped record leads, whichever came first, as it says what
kind of shop it is and when it opens; the card lists the Agency's under "Also recorded
by". In the middle of Keswick on 17 November 2026 this joined Booths (76 m apart,
postcodes CA12 5EA and CA12 5ED), Boots (3 m) and Open All Hours (9 m), and kept apart
Keswick Mini Market and Harpers Newsagents, 2 m apart with one postcode.

**A place with two roles.** A fuel station with a shop (`amenity=fuel` and
`shop=convenience` on one object) is kept once, under its first kind in the order food
bank, market, fuel, pharmacy, then what it sells, then drinking water, and is found under
each: the "small shop" filter and the nearest small shop include it, and its card says
"Fuel, also small shop".

**On the map.** Each kind has its own mark: a rounded square in the layer's colour (the
same teal as shelters) with a drawing in the line style of the saved places' icons: a
trolley, a bag, an apple, a cleaver, a loaf, an ear of wheat, a stall, a basket (other
shop selling food), a heart (food bank), and the places' own drop, pump and cross. The
square sets them apart from a person's own places, which are round. A shop's building
outline is not drawn; the mark stands at its middle. Further out they are counted into
patches like every layer.

**The Layers tab.** Under the switch: the kinds held, each with its mark and count; a
press shows that kind alone (the same as Show only → Kind), so drinking water can be shown
by itself. Then the nearest: of each kind (nearest first), or the nearest five of the kind
shown alone, from the home place (the saved place with the home icon) or the middle of the
map, chosen there and remembered on the device, with the distance in a straight line and
the bearing, as the repeater lists give them. It is worked out from what is held
(`GET /api/reference/nearest`), within 100 km; nothing is asked of any source. Then, in
words: how complete the layer is likely to be, that neither source says a place is open,
stocked or still there, and that in an emergency shops may be shut or empty.

**The card.** What the source says and no more: the name, the kind (and a second kind),
the address, opening hours exactly as mapped (each rule on its line) with "Opening hours
as mapped, fetched …", the brand; for the Agency's records the business type as it gives
it; for drinking water whether it is marked drinkable ("Mapped as a drinking water
point", "Marked as drinking water", or "Not marked as drinkable or not: treat it as
untested") and whether it is marked seasonal. Then the caution: "What OpenStreetMap
volunteers had mapped when it was fetched. It does not say a place is open, has anything
in stock or is still there. In an emergency shops may be shut or empty, and taps and pumps
may not work." (the Agency's records say "A business registered with its council as
selling food …" instead).

**Search.** The places are found by the search across everything and by the Layers tab's
search, by name, like every layer's.

**Wanted, and what stands in the way.** [Give Food](https://www.givefood.org.uk/) lists
UK food banks with what each needs, through a free API, but its API page asks: "Please
contact us at mail@givefood.org.uk if you're going to launch something using our data",
"Keep the information up to date", and says the data "changes multiple times per day". A
copy kept offline cannot do that, so it is linked, not fetched. The owner could ask Give
Food whether an offline copy, refreshed when a person presses, would be acceptable.

**Not tested.** Nothing was fetched through Outpost from the real Overpass server or the
real Agency API: both were tried by hand once each (above) to learn their answers' shape,
and the flow through Outpost was tested against local stand-ins
(`OUTPOST_FSA_URL` puts one in the Agency's place). The layer was not looked at over
satellite imagery.

### Food and supplies for a state or region

Asked for by the owner on 17 November 2026: "for the food and supplies layer do we have US
and EU stuff also? Only needs to be downloaded if the user selects it, guess for the US we
would want state also". The layer already worked anywhere OpenStreetMap is mapped, but only
for the area on screen (about a county). A whole state, Land or county is fetched as
Geofabrik's extract for it, through the same provider that already read a country's
extract for the other five OpenStreetMap layers.

**What a person sees.** Maps → Offline maps → Reference data for the map → **Get reference
data**; source **OpenStreetMap, from a Geofabrik extract**; area **A state or region, by
name** (beside **A whole country**). The first time, a line says that choosing needs
Geofabrik's list and that reading it asks `download.geofabrik.de` for one file of about
500 kB, with **Read the list of regions**. After that the list is kept on the server
(`reference/geofabrik-index.json` in the data directory) with the day it was read, and
**Read it again** is offered under it. Then:

- A box, **Find a country, state or region**: typing "ohio" or "bay" lists the matches from
  every country, those whose names begin with what was typed first, each with where it
  sits ("Oberbayern · Bayern, Germany").
- With nothing typed: **For the home place** first, then **Countries**. The home place is
  the saved place with the home icon; the server offers a region pack already held whose
  box holds it, the region the Natural Earth regions layer (if held) names there, and the
  country whose box holds it. Nothing is asked of anyone to work this out.
- A country opens onto **The whole of …** and its parts, and their parts indented under
  them (Germany: its Länder, and Bayern's seven Regierungsbezirke; the United Kingdom:
  England, Scotland, Wales, and England's counties; the United States: its states, Puerto
  Rico and the US Virgin Islands).
- Up to three are ticked; under the list each says what the layer will be made from:
  "OpenStreetMap only: likely to be fuller in towns than in the country", or in the UK
  that the Food Standards Agency's list can be added for the area on screen.
- With **Food and supplies** ticked, a note says that one download serves every layer and
  lists the other five; ticking them reads them from the same file.
- **Show the size** asks Geofabrik one `HEAD` (the index gives no sizes) and the `.md5` of
  the dated file it leads to, per region. The answer gives the file's size, what stays on
  the device afterwards, and **Keep the downloaded file too**, unticked.
- **Download** goes through the download manager: resumable, pausable, with progress; the
  MD5 is checked before reading; reading is part of the same job and can be stopped. Each
  region becomes its own pack, updated or removed on its own; a place in two regions'
  files (they overlap at their edges) is shown once.

For **Ohio**: United States of America → Ohio, tick Food and supplies, Show the size: "1
file to download, 328 MB, and at most 26.3 MB in Outpost's database"; afterwards only the
places. For **Bavaria**: type "bay" → Bayern (858 MB on 17 November 2026), or one of its
Regierungsbezirke (Oberbayern, with Munich, 260 MB).

**Sizes, and what is kept.** Sizes by `HEAD` on 17 November 2026: Monaco 708,123 bytes,
Rutland 1.95 MB, District of Columbia 21.1 MB, Cumbria 45.9 MB, Oberbayern 260 MB, Ohio
328 MB, Bayern 858 MB, California 1.34 GB, England 1.72 GB, the United States 12.3 GB.
Almost all of a file is roads, buildings and paths. Before this, a country's extract was
kept in the storage location "so that it can be read again"; nothing in Outpost reads it
again (an update downloads the file afresh), so:

- for a **region**, or any file read for **food and supplies**, the file is deleted once it
  has been read and the pack is in, unless **Keep the downloaded file too** is ticked; the
  pack keeps a short record in its place (`….read.json`: source, MD5, size, layers, how
  many places, when) so that it can be moved, checked and removed like every pack, and
  says "Only the places were kept: the … extract was deleted once read";
- for a **whole country read for the five layers only**, the default is unchanged: the file
  is kept, and the same box can untick it.

The space is needed while the file is downloaded and read: the download manager refuses to
start when the location has not the room. The database allowance shown is "at most": it is
worked out from Monaco's extract (84 places of food and supplies and 23 of the other layers
in 708,123 bytes), a city state, so a region with countryside holds fewer a megabyte.

**Reading a large file.** No new reader: the `.osm.pbf` reader written for the five layers
(`adapters/pbf.ts`, no dependency) now asks for food and supplies only when it is chosen.
Measured on this Mac (Apple silicon), at `nice 15` while other builders' test suites ran,
on a file made for the purpose: every element of Monaco's real extract (41,844 nodes,
6,281 ways, 351 relations) repeated 559 times with its ids shifted and each copy moved to
its own cell of a grid over an Ohio-sized area, written in blocks of 8,000 elements as
Geofabrik's files are, to 344 MB, Ohio's size. It is denser in places than a real state,
so these are on the heavy side:

| Read for | Places | Time | Peak memory of the process | Longest pause of the server |
| --- | --- | --- | --- | --- |
| Food and supplies, through a real server (download from a local stand-in, MD5, read, duplicates) | 46,956 | 2 s to download, 58 s to read | 664 MB (196 MB before) | health checks every ¼ s: median 5 ms, 95th percentile 52 ms, worst 175 ms |
| Food and supplies, the install alone, heap capped at 256 MB | 46,956 | 35.5 s | 447 MB (328 MB before) | 255 ms |
| All six layers, the install alone | 59,813 | 24 s | 639 MB (342 MB before) | none over 200 ms |

The reader holds only what matched and the positions of the nodes those ways need; the
rest of the peak is memory the runtime has not yet given back, as the capped run shows (it
finished in the same way with a heap of 256 MB). Reading is part of the download's job: it
shows its pass and how many places so far, and **Stop** under Downloads ends it between two
blocks of the file (tried on this file eight seconds into reading: stopped in 38 ms, the
pack already held untouched, nothing of the new one left in the database; the downloaded
file stays beside it as a partial file, as for every stopped download, until the download
is retried or removed). One thing found on the way: a lookup for "the same OpenStreetMap
object from the other source" written as `provider IN (…)` made SQLite scan every row for
each row, so the first try at this file never finished; it is asked once a source.
**On a Raspberry Pi** (not tried): expect four to eight times as long, a few minutes for a
state of this size; a Pi with 1 GB of memory should start Outpost with a capped heap.

**Nearest, search, cards, legend** work over a region's pack as over a box's; the map counts
marks into patches above 1,500 in a view, as for every layer. Measured through the API on the same pack of 46,956
places: the nearest of each kind 23 to 75 ms, the nearest five pharmacies 2 to 15 ms;
a phone's view (390 by 844) of the whole state at zoom 7 in 80 to 216 ms the first time, as
22 patches; at zoom 9, 13 to 18 ms as 48 patches; at zoom 11, 6 to 8 ms with up to 504
marks. In headless Chromium at 390 by 844, eight pans across the state at zoom 9 and at
zoom 11 each settled 54 to 82 ms after the finger lifted, with frames at 16.7 ms (the
95th percentile; the worst 33 ms). Not measured on a phone.

**What was not done, and why.** No whole state or country was ever downloaded: the flow was
tested against a stand-in Geofabrik (`OUTPOST_GEOFABRIK_URL`;
`apps/server/test/fixtures/layers/geofabrik-stand-in.ts`), and the large-file figures come
from Monaco's real extract repeated, as said above. Germany's whole-country address
redirects to a mirror on another host (`ftp5.gwdg.de`), which Outpost does not follow:
choosing "The whole of Germany" says so and asks for its Länder instead. Geofabrik's
"Great Britain" entry is not listed (the United Kingdom's covers it), nor are groups such as
"US Midwest". A file imported by hand is still read for the five layers only.

### A second source for the United States (not built)

The US Department of Agriculture publishes the retailers authorised to accept SNAP benefits
(the "SNAP Retailer Locator" data), with names, addresses, positions and a store type. On
17 November 2026 `www.fns.usda.gov` answered HTTP 403 to one ordinary request for the
locator page, its data page and `robots.txt`, so its terms could not be read and nothing was
built ([sources.md](sources.md), R19). The data.gov record lists CC BY 4.0 (last modified
2014). What it would take, once FNS's own pages can be read and allow it: an adapter like
the Food Standards Agency's, fetching one state's file on a press; its store types (not read
here, as the data could not be) mapped to the layer's kinds only where the meaning is plain,
everything else "other shop selling food"; joined to OpenStreetMap's places by the same rule
as the Agency's; and nothing about benefits on the card beyond the source's name.

### The European Union

There is no single official list of food shops: OpenStreetMap is the source, and coverage
varies by country and between towns and countryside. One search found no EU-wide or
multi-country open register on Eurostat or data.europa.eu; ESPON's "Location of Shops in
Europe" (2016 and 2021 snapshots, made mostly from OpenStreetMap) could not be read and would
add nothing to a current extract ([sources.md](sources.md), R20).

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
  country. The file is separated by commas, so its decimal mark is the point: `"1,234,567"`
  is a whole number, `"1,5"` can only be one and a half, and a value with words in it
  ("5 million") is kept as words.
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
The last 64 answers are kept until a record is written or removed, and the statements
that ask them are prepared once and kept (the last 64). The browser asks only
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
- **Admin-1 regions as a scope for downloads** are offered only where Geofabrik publishes
  a region as its own file (OpenStreetMap layers); other sources are chosen by country, a
  box on screen, or the world. The regions layer is a layer to look at.
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
| OurAirports | `airports.csv`, Luxembourg kept | 12,761,443 bytes | 3.1 s | 15 (1 large airport, 2 small, 11 heliports, 1 closed); the frequencies file was added on 17 November and not tried through Outpost against the real host |
| WorldPop | Luxembourg, 2020, 1 km | 23,719 bytes | 2.0 s | a grid; 10 km round Luxembourg city: about 220,000 people |
| Wikidata | Belgium's nuclear power stations and research reactors | 4,808 bytes | count 29 s, query 59 s | 5 |
| BABS | Swiss emergency meeting points | 1,473,452 bytes | 1.3 s | 2,958 |
| OpenStreetMap by Overpass (ovp.dresel.systems) | Luxembourg: military sites; hospitals | 18,952 and 34,775 bytes | 5.1 s for both, paced | 10 and 15; data of 2026-11-15 |
| OpenStreetMap from Geofabrik | Liechtenstein extract, MD5 checked | 3,519,004 bytes | 5.1 s | 24 (emergency services, shelters, hospitals) |

The Wikidata query took 59 of the service's 60 seconds; a larger country, or the world,
may be refused by the service. All files were deleted afterwards. The layers were looked
at in a browser at desktop and phone width, light and dark, against that copy.
