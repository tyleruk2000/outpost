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
A new line starts where the road or the place to follow changes; a road signed again for a
place its signs gave before stays one line, with its European routes together ("M6 (E05 -
E22 - E18) - Preston"). An A road with no sign of its own takes the place the next road is
signed for ("A501 - Preston"); with none, it is its number alone. A via point reads by its
name ("Via Oxford").

Everything is worked out on this device from the routes you have added under Offline maps. Once the
countries you need are added, nothing goes on the internet.

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

## Adding routes for a place

Routes are part of a place on **Maps → Offline maps** (one row per place: **Map**,
**Routes**, **Nearby places**), with the day their data is from and their size. You need
not add countries before you plan: **Plan a route** says which countries a route needs and
adds exactly those (see [Which countries a route needs](#which-countries-a-route-needs)).

Routes come by country, or by part of a country, from OpenStreetMap. Add every country you
will drive through: a trip from England to Austria needs the United Kingdom, France, and
Belgium or Luxembourg and Germany (or however you go), and Austria. Neighbouring countries
join at their borders by themselves.

1. Press **Add a place** (or **Add** under **Routes** on a place's row), and say where:
   a country, a part of one, or a town (Outpost finds its country on this device).
2. In **What for France?**, tick **Routes** ("Plan a drive").
3. **Check size** asks the map source how large the country's source file is. Nothing is
   downloaded yet.
4. The first time, choose what happens to the source file once read: **Keep the source
   file** (rebuild routes and places later with no download), and where, or **Delete it
   after reading** (saves its room; an update downloads it again). The routes kept are about
   1–2% of the file (the United Kingdom's 2.3 GB file makes about 30 MB of routes). The
   choice is remembered, and can be changed under **More choices**.
5. **Download**. The file is checked against its publisher's checksum and read for its main
   roads; the row shows the progress, as does **Downloads and tasks**. Building takes
   minutes for a large country on a Raspberry Pi, in the background.

Germany (and some other large countries) comes in parts: all are ticked, and they join.

Each place's **⋯** menu has **Update**, which reads its source file again (downloading it
when none is kept) and replaces the routes, and **Remove…**, which lets you tick what to
remove (saved routes keep their directions). Routes can also be built from an `.osm.pbf`
file already in your storage, through the API only (see
[the developer page](development/road-routes.md)); that file is yours and is never deleted.

## Planning a route

On the Maps screen, open **Routes** and press **Plan a route** (or type "directions" in the
quick search). Give a start (**From**) and an
end (**To**), and up to ten via points (**Add a via point**) in the order you want to pass
them. For each, type a saved place, a town (with place names installed) or coordinates,
choose from your saved places, or press **Map centre**. You can also press and hold
(right-click) a point on the map and choose **Plan a route from here** or **Plan a route to
here**. Then press **Plan route**. The first route after a while takes longest, up to a
minute on a small computer, while the routes are read.

On a phone the form takes the whole panel, with its fields at the top; **← Routes** at the
top leads back. With the keyboard up, the field you are typing in and its list of
suggestions stay above the keyboard. Once planned, the panel lowers to show the route, with
its distance and time first.

The route is drawn on the map: the main roads bold, a crossing dashed. Under it come the
totals and the directions: the start ("Join the A24"), a line for each road, the crossing
in a band of its own, each via point as a rule across, and the end ("Leave the N205, then
local roads"). Choose a line to see that part on the map; **Whole route on the map** shows
all of it again. Each is joined to the nearest main road; the result
says how far that is, and warns when it is more than 5 km.

**Sea crossing** appears only when the route crosses the sea. Choose **Any** (the
quickest), or a particular crossing from those in the roads kept: a ferry by name, or
**Eurotunnel** where the roads kept include the Channel Tunnel. A crossing reaches both
sides only when the roads on both sides are kept.

### Which countries a route needs

The form is always there, with or without roads kept. Until From and To are chosen it says
so: "Choose where from and where to. Outpost then says which countries' roads it needs."

Once they are, Outpost works out on this device, from the country outlines it holds, which
countries the route touches: each point's own, and those the straight line between points
crosses for more than a corner. Before you press anything it says what is missing:

- **France has no roads yet**: "This route runs through France. United Kingdom is
  ready." **Add roads for France** opens **Add a place** for France alone, which asks
  the size first; it needs a connection once. Several are named together ("France and
  Switzerland have no roads yet") and added with one press. **Plan route** waits, saying
  "Add France first".
- **Only part of France has roads**: roads are kept for a part of the country and a point
  of the route is outside it. **Add roads for all of France**.
- **On their way**: while a country's roads download and are built, the panel shows it in
  the words of Offline maps with a bar: "France: Downloading 1.20 of 4.90 GB, 18 minutes left",
  then "Building". You can leave the screen. When they are ready it says "France is
  ready." and **Plan route** is enabled.

The line between points is only a guide: a road may go round a country the line crosses.
If a route still cannot be planned, the message names the countries, with the same button,
or the point that is too far from any main road kept ("more than 40 km from any main road
kept for France: only Nord-Pas-de-Calais is kept").

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

## Door to door, walking and cycling

Where the optional Walking and cycling add-on is installed, **Plan a route** has four ways of
travelling at its top. Without it (most installations) there is nothing to choose and the
form plans a drive, as above; one line under it says the other ways exist.

| Way | What you get |
| --- | --- |
| **Drive** | The main-road lines above, unchanged. |
| **Door to door** | The same main-road lines, with the streets from your door to the first main road and from the last one to your door. Each end is one line, "From your door to the A24 (8 turns, 2.1 km)", which opens to its turns. Under 15 km between the doors, or with no routes added, the whole drive is turn by turn instead. |
| **Walk** | Turn by turn on streets and paths: "Turn left onto Church Street (B2450)", each with the distance to the next. |
| **Cycle** | The same by bicycle, on streets, lanes and cycle paths. |

Choose a road or a turn to see it on the map. The route card and the condensed plain text
carry the turns too: on a door-to-door card each end is a band with its turns in smaller
type and a box to tick. Routes on streets are saved like a drive (see
[Saving and printing](#saving-and-printing)).

### Ferries

Walks, rides and the streets of a drive avoid ferries: a river bus or a foot ferry is
taken only where the streets built offer no other way, or only one far longer. When a
route still takes one, it says so at the top ("This walk takes a ferry from Lombard Road
to Cadogan Pier, 2 km on the water…"), the line in the directions reads "Take the ferry
… Check it is running: it may not be in a power cut", and the stretch on the water is
drawn dashed on the map, as a sea crossing is on a drive. Check the ferry before you set
off, or plan via a bridge.

A way that cannot be used yet still shows, and choosing it says why in one line with the
step that puts it right: **Add walking and cycling for** the point's country (not built
yet), or **See its progress** while it is being built. A point outside what is built is
said plainly ("Walking and cycling is not added for France").

To turn the add-on on, see [Street routes on a Raspberry Pi](deployment.md#street-routes);
**Walking and cycling** is then one of the choices in **Add a place** (see
[maps.md](maps.md#walking-and-cycling)).

## Reachable from here

Press and hold (right-click) a point on the map and choose **Reachable from here**, or
type "reachable" in the quick search for the middle of the map. A card shows the areas you
could reach by car or bicycle in up to **2 hours** (15 min, 30 min, 1 h, 1½ h, 2 h), or on
foot in up to **8 hours** (30 min, 1, 2, 4, 6 or 8 h); each way keeps its own time. The time
you choose is drawn with up to two shorter ones inside it (2 hours' drive: 30 minutes,
1 and 2 hours; 8 hours on foot: 2, 4 and 8 hours), as steps of one colour, darkest nearest,
each with its own outline (solid for the shortest, then dashed, then dotted) and its time
written on it, so they read apart in grey too. The legend says which is which and where
the areas come from:

- **Streets**: over every street, by car, bicycle or on foot, where walking and cycling is
  added for the place.
- **Main roads only**: by car over the routes added, on every installation with them. The point is joined to the nearest main road; streets off the main roads are
  not counted, so the true area is a little larger near towns.

Where the point's own country has no roads kept, the card says so ("France has no roads
yet.") with **Add roads for France**; walking and cycling, where it is not added there,
names that country too ("Add walking and cycling for France"). Outpost never offers
your home country in place of where the point is.

Both are for **free-flowing traffic, no stops**; on foot and by bicycle, a steady pace on
the flat with no stops (the streets hold no heights, so hills are not counted). Over 2 hours
on foot, or an hour by bicycle, the card adds that no rests are counted: a real day's walk
reaches far less than the 8 hour area. Tick **Reachable areas** in **Print or
save as PDF** to put them on a paper map, with the legend in words under it.

## Saving and printing

Any route can be saved: a drive, door to door, a walk or a ride, with its via points.
Give it a name and press **Save route**. It is kept exactly as it was planned, with its
directions and the day it was planned: opening it never plans it again, so it opens and
prints even if you later remove or update the routes or the streets. Saved routes are
listed under the form, as **Saved routes**, each with its way of travelling: open one to
rename it, delete it, print it, save it as GPX or **Plan it again** on what you have now.

**Save GPX**, on a planned or a saved route, downloads the route as a GPX 1.1 file, made on
this device, for a GPS, a walking app or another map: the line as a track, the start, via
points and end as waypoints, and each line of the directions as a route point named with
its instruction ("Turn left onto Church Street (B2450)"). The file carries the map credit
and any warnings, such as a ferry.

**Printable route card (PDF)** makes the card on this device, on A4 or US Letter: first an
overview map of the whole route (your offline map where a place covers it, otherwise the
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
Geofabrik's downloads of it. Every route, saved route and printed page carries that credit and
the date of the data. See [sources.md](sources.md#road-routes).
