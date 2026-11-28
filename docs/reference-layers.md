# Layers on the map

Layers of published data for the map: boundaries, populated places, airports and their
radio frequencies, publicly mapped military sites and nuclear facilities, hospitals and
emergency services, shelters and meeting points, emergency planning zones, flood zones in
England, population, historical records, walking and cycling routes with rights of way,
and food and supplies.

Nothing is bundled and nothing is fetched by itself. The layers are **nearby places**: a
country's are added in **Offline maps → Add a place → Nearby places → Which kinds**, the
worldwide sets under **World basics** the same way, each after its size has been shown; a
file you obtained is imported. Every record
keeps its source, dates, accuracy and licence, and the map says what kind of record it is:

| Class | On the map | Meaning |
| --- | --- | --- |
| Published public record | a filled dot | From a published dataset. Outpost has not checked it on the ground. |
| Historical document | a ring marked H | What a historical document records about the past. |
| Unverified or speculative | a ring marked ? | Not from a published record, or an author's speculation. |
| Your own | a pin | Saved places and routes. |
| Modelled estimate | a dashed outline | The nuclear effects simulator's rings. |

**What these layers never do.** A mapped site is shown as what a public dataset lists,
nothing more. No layer, sort, filter, score, heat map or export presents a modern place
as a likely target, and no probability is attached to any place. Historical records,
mapped infrastructure and anything modelled are kept apart and never counted together.

## Where it is

- **Maps → Layers**: a switch, mark and count for each installed layer; population with
  its scale; filters by country, source and kind; a search by name; the legend. A layer
  with nothing held is offered as the step that adds it, for the country in the middle of
  the map (or home): "Add hospitals for United Kingdom", or "Add country boundaries for the
  whole world". Nothing is downloaded or removed from the Layers tab itself.
- **A press on a record** opens its card: kind, class, source, dates, licence, accuracy,
  and every field the source gives.
- **Maps → Offline maps** (also from Storage): the one place layer data is managed. What is
  held is under **Nearby places** for each place and under **World basics**, with **Update**
  and **Remove…** in each place's **⋯** menu; **Add a place** adds the kinds you tick for a
  country, a part of one, an area you draw or the world; **Sources and licences** lists the
  sources that are only linked, with why.
- **Preparedness → Nuclear preparedness** shows the same layers
  ([nuclear-preparedness.md](nuclear-preparedness.md)). **Search** finds records by name.

## Getting a set

In **Add a place**, choose the place (a country, a part of one such as a US state, an area
you draw, or the whole world), tick **Nearby places**, then the kinds under **Which kinds**.
Each kind says its source. A country's kinds are read from its source file; the others are
asked of their own source on **Check size**, which shows each kind's size, then the total and
where it is kept. Press **Download** within half an hour. ([maps.md](maps.md) has the steps.)

Downloads resume and are checked where a checksum exists. A file that cannot be read
leaves the installed set as it was. **Update** in the place's menu asks the source again
(**Check**) and replaces the set (**Update**). If a set's drive is unplugged its records
stay on the map.

**Importing.** GeoJSON and CSV in WGS 84, Web Mercator, the British National Grid (to
about 5 m) or the Swiss grids (about 1 m); others are refused. A WorldPop grid downloaded
by hand imports if it is the 2020, 1 km, UN-adjusted product. Over 1,500 records in a view
are counted into patches: move closer.

## Providers

Each publisher's terms, quoted with the day read, are in
[sources.md](sources.md#reference-layers) (RL1 to RL19).

| Provider | What | How it is used |
| --- | --- | --- |
| Natural Earth (public domain) | Countries, first-level regions, populated places | Fetched on a press, release v5.1.2, the countries file checked against a recorded SHA-256 |
| OurAirports (public domain) | Airports, airfields, heliports, and their frequencies | Fetched on a press (12.8 MB and 1.3 MB), the chosen area kept. Nothing says an airfield is military, and nothing is guessed |
| OpenStreetMap by Overpass (ODbL) | Military sites, nuclear facilities, hospitals, police, fire and ambulance stations, shelters; food and supplies | One layer of one country (or a box up to 20° by 20°) per question, paced, from dresel.systems or a server you declare. Private.coffee is not used: its terms exclude military uses |
| OpenStreetMap from Geofabrik (ODbL) | The same, plus routes and rights of way, from a `.osm.pbf` source file | At most three files per estimate, MD5 checked; or a file you downloaded |
| Wikidata (CC0) | Nuclear power stations and research reactors | Only after you agree to send Outpost's name ([below](#the-name-a-source-is-given)). A large country may time out |
| WorldPop (CC BY 4.0) | Population, 2020, about 1 km | One GeoTIFF per country, with WorldPop's citation |
| BABS, Switzerland | Emergency meeting points | One GeoJSON file, 1.5 MB |
| Environment Agency (OGL) | Flood Zones 2 and 3, England | [Below](#flood-zones-england) |
| Food Standards Agency (OGL) | Registered food retailers, UK | [Below](#food-and-supplies) |
| FAS, SIPRI, NTI, IAEA PRIS | Country-level estimates and lists | Linked only. A figure you read can be imported in a country figures file with its citation |
| GeoNuclearData, WRI, Global Energy Monitor | Power plant lists | Not used |

### Historical records

No machine-readable record of historical targeting cleared for redistribution was found,
so **none ships**, and Outpost transcribed none. The documents are linked in the dataset
manager: the US Strategic Air Command's *Atomic Weapons Requirements Study for 1959*
(National Security Archive, Briefing Book 538), FEMA's *Nuclear Attack Planning Base 1990*,
and the UK's Square Leg and Hard Rock files (The National Archives, HO 322, not digitised).

You can import a historical records CSV; the template, with every column, is at
`/api/reference/templates/historical-csv.csv` on your Outpost. Each row needs its
`record_type` (`target-list`, `assessment` or `speculation`), period, document, evidence,
precision, citations, publisher and licence, or it is refused. A speculation is shown as
unverified or speculative.

### Emergency planning zones and shelters

- **UK** REPPIR zones are councils' PDFs with no open licence: linked; a council's GeoJSON
  can be imported.
- **United States**: no national dataset found.
- **Switzerland**: meeting points fetched; ENSI zone plans and cantonal shelter files
  importable.
- **Taiwan** and **South Korea** publish shelter data: importable as CSV. None found for
  Finland or Germany.

OpenStreetMap shelters are `amenity=shelter` with `shelter_type=bomb_shelter`, bunkers
tagged `bunker_type=bomb_shelter`, `air_raid_shelter` or `nuclear`, and
`emergency=assembly_point`. A mark is what a mapper recorded: it does not mean a shelter
is open, kept up or meant for you.

### Flood zones (England)

The Environment Agency's Flood Zones 2 and 3, from rivers and the sea. England only.

- **Getting it**: **Add a place → Draw an area on the map**, then **Nearby places →
  Flood zones (England)** and **Check size**. At most 0.2° by 0.3° (about 22 by 20 km) and
  5,000 areas, so draw a small area. Larger boxes went unanswered.
- **On the map** once a town fills a phone, at most 3,000 to a view. Zone 3 is
  the deeper tone with a solid edge, zone 2 lighter with a broken edge.
- **The legend** gives each zone in the Agency's words (Zone 3: a 1% or greater annual
  chance of flooding from rivers, or 0.5% from the sea), that it ignores flood defences,
  and that it is "not suitable for showing whether an individual property is at risk of
  flooding". It is neither a forecast nor a warning.

### Airport frequencies

Fetched with the airports. If the file cannot be had or is not as expected, the
airports are installed without them and the set says so: update it to try again.

The card lists them first, tower first, then ATIS and information, each with what it is
for and the frequency in MHz. They are **not for navigation or flight planning**: a
community list that may be out of date or wrong. "No frequencies listed" means the file
has none, not that there are none.

### The name a source is given

Most sources are asked under Outpost's plain name. The public Overpass servers and
Wikidata ask programs to identify themselves, so to those two Outpost sends
`Outpost/0.1.0 (self-hosted offline library; +https://github.com/tyleruk2000/outpost)`,
the same for every copy and nothing about you (the source sees your address, as any site
does). It is never done quietly: the name is shown word for word, and **Check size** (or
**Check**, for an update) stays off until you tick **Send Outpost's name to …**, each time,
updates included.

## OpenStreetMap: which tags

| Layer | Tags | Left out |
| --- | --- | --- |
| Military sites | `landuse=military`; `military=base`, `airfield`, `barracks`, `naval_base`, `range`, `training_area`, `danger_area`, `academy`, `office`, `checkpoint`, `school`, `nuclear_explosion_site` | `military=bunker` alone (mostly old pillboxes) |
| Nuclear facilities | `power=plant` + `plant:source=nuclear` | Single reactors; research reactors come from Wikidata |
| Hospitals | `amenity=hospital`, `healthcare=hospital` | |
| Emergency services | `amenity=police`, `amenity=fire_station`, `emergency=ambulance_station` | |
| Walking and cycling routes | `route=hiking`, `foot`, `bicycle`, `mtb` | Bus, road, ferry, horse routes |
| Rights of way | `designation=public_footpath`, `public_bridleway`, `restricted_byway`, `byway_open_to_all_traffic`, `public_right_of_way`, `core_path` | Permissive paths |
| Food and supplies | `shop=supermarket`, `convenience`, `general`, `greengrocer`, `butcher`, `bakery`, `farm`; `amenity=marketplace`, `fuel`, `pharmacy`, `drinking_water`, `water_point`; `man_made=water_tap`; `social_facility=food_bank` | Restaurants, cafés, pubs; water tagged not drinkable |

In some countries it is illegal to map military sites or use a map of them; Outpost shows
the OpenStreetMap wiki's warning before that layer is estimated.

**The licence.** Keeping a set for your household owes nothing. The map credits
"© OpenStreetMap contributors, ODbL" while such a layer is drawn. Outpost has no export of
reference layers; anyone passing the downloaded files on must offer them under the ODbL.

## Walking and cycling routes, and rights of way

From a country's or region's source file: tick **Walking and cycling routes**,
**Rights of way**, or both (also under **Also read** when importing).

- Routes are a solid line once the map shows about a region, rights of way a broken line once
  it shows about a town. A press
  opens the card: name or number, network, distance, from and to.
- Only paths tagged with a `designation` are shown. In England and Wales the council's
  definitive map is the legal record: a path missing here may still be a right of way, and
  a line here is not permission to walk it nor a promise it is open.
- England's rights of way are hundreds of thousands of paths: on a small computer, read a
  county. To add routes to an area read before, read its source file again.

## Food and supplies

Shops and facilities a household looks for when the cupboard runs low: supermarkets,
small shops, greengrocers, butchers, bakers, farm shops, markets, food banks, drinking
water, fuel and pharmacies; in the UK, every shop registered as selling food.

**How complete.** Well mapped in towns in Britain and much of Europe; patchy elsewhere.
The Food Standards Agency's list is fuller for UK shops but places some at the postcode.

**Getting it**:

- **A country or a part of one**: **Food and supplies** under **Which kinds**, read from
  its source file ([below](#food-and-supplies-for-a-state-or-region)).
- **An area you draw**: **Food and supplies**, asked of an Overpass server, after you tick
  to send it Outpost's name. At most 1.5° by 2° (about a county) and 30,000 places.
- **Food Standards Agency (UK)**: **Registered food shops (UK)** for an area you draw, same limits; two sets,
  supermarkets and other shops. **Hygiene ratings are not kept or shown.**

A shop in both sources is shown once, the other listed under "Also recorded by".

**The Layers tab**: the kinds held with counts (press one to show it alone), and the
nearest of each, from the current household's home or the middle of the map, with straight-line
distance and bearing, within 100 km, worked out from what is held. Typing "supermarket",
"pharmacy" or "drinking water" in the quick search opens it.

**The card** gives what the source says; water not marked either way is "treat it as
untested". It does not say a place is open, stocked or still there. **In an emergency
shops may be shut or empty, and taps and pumps may not work.**

**Give Food** (UK food banks) asks to be contacted first and its data kept up to date
several times a day, which an offline copy cannot do: linked, not fetched.

### Food and supplies for a state or region

In **Add a place**, type the state or region ("Ohio", "Bavaria"). Parts of countries are
found once Geofabrik's list of regions has been read, which the first **Check size** does
(about 500 kB); a country Geofabrik publishes in parts also offers **Choose parts**.

1. Choose the part (**Ohio**), tick **Nearby places**, and under **Which kinds** tick **Food
   and supplies** (and any other kind, read from the same file).
2. **Check size**: Ohio is 328 MB to download.
3. Say what happens to the source file, then **Download**. Each region is its own set.

Sizes run from Cumbria's 46 MB to England's 1.72 GB and the United States' 12.3 GB. The
file is deleted once read or kept, as you choose on the source file's line. A state the
size of Ohio takes about a minute and 650 MB of memory to read on a Mac, a few minutes on
a Raspberry Pi; on a Pi with 1 GB start Outpost with a capped heap. Germany's whole-country
file is on another host, which Outpost does not follow: choose its Länder.

### A second source for the United States (not built)

The USDA's list of SNAP retailers could be a second US source, but its pages refused to
be read, so its terms are unknown and nothing was built ([sources.md](sources.md), RL19).
In the European Union no official list was found: OpenStreetMap is the source (RL15).

## What is not built, and why

Besides what is said above: no terrain or wind layers (terrain is the map's hill
shading; wind has no source); region downloads only where Geofabrik publishes the region;
OpenStreetMap relations drawn as outlines, not filled; no export of reference layers.

How it works, for developers: [development/preparedness.md](development/preparedness.md).
