# Road routes

Plan a drive the way you would write it down for yourself: the main roads, which way,
the junction to leave at and the place on the signs to follow. From London to Chamonix
that reads:

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

Each line is a road, the European route numbers it carries in brackets, and the place
signed to follow, spelt as the sign spells it. Under it, smaller: which way, the junction
to join and to leave at ("leave at J10 (Ardley) for Bicester", "exit 21" outside Britain
and Ireland), the distance and the time. A long trip comes out at fifteen to thirty lines.

Everything is worked out on this device from road data you have installed. Once the
countries you need are installed, nothing goes on the internet.

## What it is, and what it is not

- **Planned, never live.** A route is worked out once, before you go. There is no
  following along, no "recalculating", no voice.
- **Not turn by turn.** Main roads only: motorways, trunk roads, A and B roads (and
  their equivalents abroad). Getting from your door to the first main road, and from the
  last one to where you are going, is "local roads".
- **No traffic, roadworks or closures.** Times are for free-flowing traffic with no
  stops. Real journeys take longer.
- **Check the signs and closures before you go.** The signs and junction numbers are as
  mapped in OpenStreetMap; signs change, and a place on the list may be spelt or placed
  a little differently on the road.
- **Crossings are booked and timetabled.** The time given is time on board; check-in,
  waiting and the timetable are not included.

## Installing road networks

On the Maps screen, open **Offline**; the part called **Road networks for routes** lists the
networks installed, with the country, the date of the map data and the size. **Add a road
network** offers first the countries your downloaded map regions cover, then any country or
region by name.

Road data comes by country, or by part of a country, from Geofabrik's OpenStreetMap
extracts. Install every country you will drive through: a trip from England to Austria
needs Great Britain, France, and Belgium or Luxembourg and Germany (or however you go),
and Austria. Neighbouring networks join at their borders by themselves.

1. Read Geofabrik's list of regions once (the same list as for reference layers).
2. Choose a country or region and install it. The extract is downloaded (you see it on
   **Downloads and tasks**), checked against Geofabrik's checksum, read for its main roads,
   and then **deleted**. Only the network is kept: about 1–2% of
   the extract (Great Britain's 2.2 GB extract makes a 30 MB network).
3. Building takes a while on a Raspberry Pi: minutes for a large country. It runs in the
   background; one network is built at a time.

Germany (and some other large countries) cannot be downloaded whole, because Geofabrik
sends its file from another server: install its parts (its Länder) instead. They join.

A network can also be built from an `.osm.pbf` file already in your storage, or with
the extract kept, through the API only (see
[the developer page](development/road-routes.md)); that file is yours and is never deleted.

Each network's **…** menu has **Update**, which downloads it again and replaces the network, and
**Remove**, which deletes the network (saved routes keep their directions).
While a network is being added its download and then its build show there with their
progress, and the download is on **Downloads and tasks** too.

## Planning a route

On the Maps screen, open **Routes** and press **Road route**. Give a start (**From**) and an
end (**To**), and up to ten via points (**Add a via point**) in the order you want to pass
them. For each, type a saved place, a town (with place names installed) or coordinates,
choose from your saved places, or press **Map centre**. You can also press and hold
(right-click) a point on the map and choose **Road route from here** or **Road route to
here**. Then press **Plan route**. The first route after a while takes longest, up to a
minute on a small computer, while the networks are read.

The route is drawn on the map: the main roads bold, a crossing dashed. Under it come the
totals and the directions: the start ("Join the A24"), a line for each road, the crossing
in a band of its own, each via point as a rule across, and the end ("Leave the N205, then
local roads"). Choose a line to see that part on the map; **Whole route on the map** shows
all of it again. Each is joined to the nearest main road; the result
says how far that is, and warns when it is more than 5 km.

**Crossing the Channel**: choose **Any** (the quickest), **Eurotunnel**,
or a particular ferry from the list of crossings in your installed networks. A crossing
reaches both sides only when the networks on both sides are installed.

If a point is in a country with no network installed, you are told which country to
install. If two points cannot be joined, you are told which country between them is
missing.

Distances are in kilometres or miles, as you choose.

### How fast

| Road | Speed used |
| --- | --- |
| Where a limit is mapped | 90% of the limit, at most 120 km/h on motorways, 100 on trunk roads, 90 on A roads, 80 on B roads |
| Motorway, no limit mapped | 105 km/h |
| Trunk road | 85 km/h |
| A road (primary) | 65 km/h |
| B road (secondary) | 55 km/h |
| Slip roads | 35–55 km/h |
| Roundabouts | at most 30 km/h |
| Ferry with no time mapped | 28 km/h |

These are Outpost's assumptions, kept under the legal limits (in the United Kingdom
70 mph on motorways and dual carriageways, 60 mph on single carriageways).

## Saving and printing

Give the route a name and press **Save route**. It is kept with its directions, so it opens
and prints even if you later remove or update the networks. Saved routes are listed under
the form, as **Saved road routes**: open one to rename it, delete it, print it or **Plan it
again** on the networks you have now.

**Printable route card (PDF)** makes the card on this device, on A4 or US Letter: first an
overview map of the whole route (your offline map where a region covers it, otherwise the
plain map of coastlines and borders) with the main roads drawn bold, the via points and
the crossing marked; then the directions in large type, each road's line bold with the
detail small under it, the distance and time in columns, the crossing in its own band, and
a box to tick for each line. At the foot: planned in advance and not live, the day it was
planned, check the signs and closures, and the OpenStreetMap credit. There are no maps of
junctions. Save it, add it to the library or share it as with any PDF Outpost makes.

The **condensed plain text** is the whole route in lines no wider than 48 characters, in a
box with a **Copy** button, ready to paste into a message or a note or to print on a small
printer of your own (Outpost does not print it itself). Tick **Plain letters only (ASCII)**
if your printer lacks accents ("Genève" becomes "Geneve").

## The data

Road data © OpenStreetMap contributors, under the Open Database Licence 1.0, from
Geofabrik's extracts. Every route, saved route and printed page carries that credit and
the date of the data. See [sources.md](sources.md#road-routes).
