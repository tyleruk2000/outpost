# Map data: what is kept for the map

What Outpost keeps for the map, place by place: adding a place under **Offline maps**, the nearby places and source file that come with it, updating and removing, an area of your own, and keeping an area on a phone. The Maps screen itself is in [Offline maps](maps.md).

## Offline maps: everything kept for the map

**Maps → Offline maps** (also **All offline maps** in the Offline tab, and **Manage** under
Storage) is the one place map data is added, updated, moved and removed. The line under the
title says how much there is and where.

Each place is one row: a country, a part of one, an area drawn on the map, or **World
basics** (the world overview, the world's towns, borders and airports). A row says where
each thing a place can have stands:

| | What it is for |
| --- | --- |
| **Map** | The map to look at, its hills and heights, and its towns found by name |
| **Routes** | Planning a drive |
| **Nearby places** | Hospitals, shelters, food and supplies, on the map and in the lists of what is nearest |
| **Walk/cycle** | Walking, cycling and door-to-door routes, where the optional Walking and cycling add-on is installed |

On a phone the row is the place's name, its size and **…**, then one line ("Map, Routes 43%,
Nearby places: Add"); on a wider screen the same rows line up as a table. **Add** in a row
starts Add a place for that place with that ticked; an area drawn on the map offers a map and
its nearby places (no routes), and World basics the world's. A row opens to what is behind each word:
the day the data is from, where it is kept, the source file, and progress with Pause and
Cancel.

Every row, whatever it holds, says where it stands in the same words: **Not added**,
**Waiting**, **Downloading 1.0 of 2.3 GB, 19 min left**, **Building**, **Ready, from 17 Nov
2026**, **Over a year old**, **Failed:** and what to do, **Storage not connected**, **Moving**.
Its **…** menu has the same actions in the same order: **Update**, **Move…**, **Remove…**,
**Details**.

Above the rows, a line follows anything downloading ("United Kingdom routes: 1.0 of 2.3 GB,
19 min") and leads to it; another says how many places are over a year old, with **Check for
updates**. Below them: whether walking and cycling is set up, what is kept on this phone, and
**Sources and licences**.

### Add a place

One button, **Add a place**, wherever a map, routes or nearby places are offered.

1. **Where?** Type a country, a region or a town in **Country, region or town**; a town says
   which country it is in and, where Outpost knows it, the part of it: "Chamonix-Mont-Blanc is
   in France: Rhône-Alpes (smaller) or all of France". This is answered on the device: nothing
   is looked up elsewhere. Or tap a country on the small map of the world, or choose a
   suggestion: where the map is now, home, the whole world, **Draw an area on the map**, or
   **Import a file**. Nothing is chosen for you. A region Geofabrik names in its own language
   is found by its English name too: "Bavaria" finds Bayern, "Catalonia" Cataluña. Other parts
   of countries (a US state, England, Rhône-Alpes) are found once Geofabrik's list of its files
   has been read: until then a search says so under the box, with **Read the list of parts**
   (about 500 kB from download.geofabrik.de, on that press only, then kept). A map of
   a part is of the part alone where Outpost knows its outline (a ready-made area of its
   name, such as England, or the regions layer of Nearby places); otherwise it covers the
   whole country. Offline maps lists a map under the country most of its land is in, a map
   you imported or drew too; one across several countries is under **Other areas**.
2. **What for France?** **Map** and **Routes** are ticked, **Nearby places** is not.
   Ticked, **Nearby places** opens to **Which kinds** (see below). The source file is one
   line under the ticks (see below). **More choices** has the detail of the map, hills and
   heights, and where things are kept. A country Geofabrik also publishes in parts says so
   ("Germany comes in 16 parts, 4.3 GB together. All are ticked."): untick the parts you do
   not need, and only those are read. A press anywhere on a row ticks it.
3. **Check size** asks the map sources how large it is; the first time, it reads Geofabrik's
   list of regions too (download.geofabrik.de). Nothing is downloaded yet. The answer, or why
   it could not be had, is brought into view under the ticks. Geofabrik sends its largest
   country files (Germany's) from another server, which Outpost does not download from: for
   such a country the parts are fetched instead, each its own file, and the dialog says so.
4. **Download · 4.1 GB**. Progress shows at the top of Offline maps and under **Downloads and
   tasks**; you can leave the screen.

A route that needs countries you have no roads for opens the same steps with those countries
and **Routes** ticked. A layer with nothing held, in the Layers tab, opens them with its kind
ticked ("Add hospitals for United Kingdom"). For Great Britain, a map's place names come from Ordnance Survey's OS
Open Names, with nothing more to choose (see below).

### Which kinds of nearby places

Nearby places are the layers drawn on the map and listed by what is nearest. Under **Which
kinds**, each is ticked on its own, grouped by where it comes from:

- **A country**: hospitals; police, fire and ambulance; shelters and assembly points; food
  and supplies (shops, markets, fuel, drinking water, food banks, pharmacies); military
  sites; nuclear facilities; waymarked routes; rights of way. All are read from the source
  file, with nothing more downloaded. Also population density (WorldPop), and in Switzerland
  the official emergency meeting points.
- **World basics** (the whole world): country boundaries, regions and populated places
  (Natural Earth), airports and airfields (OurAirports), nuclear power stations and research
  reactors (Wikidata).
- **An area you draw**: the same kinds asked of an Overpass server for the area, registered
  food shops in the UK, flood zones in England (up to about 20 km across), and airports.

What is held already says **Held**. Adding a kind never takes away those held: the kinds held
are read again with it. After **Check size**, each kind from its own source shows its size,
and each kind read from the source file the most its places can take in Outpost's database,
worked out from the source file's size ("up to 120 MB"): nothing more is downloaded for those.
Wikidata and the Overpass servers ask to be told what is asking: tick **Send Outpost's name
to …** (the name is shown word for word); nothing is asked of them until you do.

Nearby places are updated and removed with the rest of the place: **Update** and **Remove…**
in its **⋯** menu. A set from its own source is checked with **Check**, then **Update**.

### The source file

Routes and nearby places are read from a country's whole OpenStreetMap record, a separate
file from Geofabrik (4.9 GB for France). It is always one line under the ticks:

- The first time, both choices are shown, each with its reason, and nothing is chosen for
  you:
  - **Keep it**: needed to add walking and cycling later, or to update without downloading
    again. The location with the most room is suggested. On a drive that is switched off,
    routes keep working and updating waits.
  - **Delete it after reading**: saves its space (2.3 GB for the United Kingdom). Routes and
    nearby places keep working; walking and cycling or an update downloads it again.
- After that, the choice you made is said in one line with **Change**: "Source file (2.3
  GB): kept on NAS. Needed to add walking and cycling or update without downloading again ·
  Change".
- With **Walking and cycling** ticked the file is kept, because it is built from it:
  "Source file (4.9 GB): kept on NAS. Walking and cycling is built from it, so it is kept."

The total under the ticks says what happens to the file either way. With the file kept,
adding routes or nearby places reads it again with no download (**Build from the kept
file**).

### Updating

Something over twelve months old says **Over a year old**; sets made once and never revised
(Natural Earth's borders, census grids) never do. Hills and heights have no date: Mapterhorn
gives none, so their row says "Mapterhorn gives no date for its heights" rather than the day
they were downloaded, they are never said to be over a year old, and **Check** says Outpost
cannot tell whether its newest copy is newer than yours (**Update** downloads it again either
way). Ordnance Survey's place names for Great Britain are dated by their edition ("from 1 Oct
2026" for October 2026's), and are checked and updated in the same list as everything else.
**Check for updates** lists each place
("France · Map from 1 Jun 2025"), and **Update** in a row's menu does the same for one place.
Nothing is checked or downloaded until you press:

- **Check** asks the source, named first, how large and how new its newest copy is. **Update**
  downloads it to the same storage location. What you have stays, and is used, until the new
  one is in place and checked; a download that stops leaves it as it was. The new one needs
  room beside the old one while it downloads.
- Routes and nearby places are read again from the kept source file with no download, or
  from a newer one (**Download a newer file**).
- **Update all** does every place listed. A map imported from a file of your own cannot be
  fetched again: import a newer file.
- A kept source file that no longer matches its checksum (Storage's check says so) offers
  **Repair the damaged part** in its place's details: only the damaged stretch is fetched
  again from download.geofabrik.de, not the whole file, and the file is then checked against
  Geofabrik's checksum. If that fails, or the damage is too large, the file is left as it was
  and you are told to download it again.

### Removing

**Remove…** in a row's menu lists what the place has, each with its size, ticked; the source
file is listed unticked. It says what stops working ("Saved routes keep their directions.")
and what is freed: **Remove · frees 3.1 GB**. What is on a storage location that is not
connected is left there until it is back.

### An area of the map

**Offline** on the Maps screen shows what covers the view, with **Add this view** and **Draw
an area** (drag a box on the map; Escape stops). Both open Add a place with that area, where
you name it. Where a map on this device (on a connected storage location) already covers the
area at that detail, **Map** starts unticked and says so ("A map you hold already covers this
view"), so satellite pictures of the view are one tick. A box cannot cross the 180° meridian (make two), and a map of over about 20
million tiles is refused: choose less detail under **More choices**. The detail levels:

| Detail | Roughly what you see |
| --- | --- |
| Roads and towns | Towns, most roads |
| Villages and tracks | Villages, tracks, larger streams |
| Footpaths and buildings, Everything | Streets and paths, for walking |

Hills and heights are less detailed than the most detailed map: the source stops before
footpath detail. Downloads can be paused and survive a
restart.

## Keeping a map area on a phone

**Offline maps → Map areas on this phone** keeps the part of the map in view in a phone's
browser, with routes and places, for when it cannot reach the server. See
[offline.md](offline.md#a-phone-out-of-reach-of-the-server).

## What is not included

- **Routing on foot or by bicycle**, and live navigation of any kind. Planned road
  directions (main roads, junctions and signs) are in [road-routes.md](road-routes.md).
- **Surveyed contours**, crags, scree and spot heights.
- **Recording in the background**: only while the screen is on and Outpost is in front.
- **Radio coverage**: line of sight and range are geometry, not signal predictions.
- **A place's time zone, moonrise and moonset.**

## If map labels are missing

A build made without its fonts draws no names: see
[troubleshooting.md](troubleshooting.md#the-map-has-no-labels).

The API is in [api.md](api.md#maps); how the map works inside is in
[development/maps.md](development/maps.md).
