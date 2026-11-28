# Road routes, reach, walking and cycling

Getting from one place to another on the map: road routes in short, what is reachable from a point in a given time, and walking and cycling. The whole of directions is in [Road routes](road-routes.md); the map guide starts at [Offline maps](maps.md).

## Road routes

Planned directions for a drive, written the way you would write them down: "M20 -
Folkestone", "A26 (E17) - Reims (A4)". On a phone, press **Directions** at the foot of the
map, type where to and press it: the route starts from home and is planned at once. On a
wider screen, open **Routes**, then **Directions**. Or press and hold (right-click) a point on
the map and choose **Directions from here** or **Directions to here**. The roads are added by country on **Offline maps**, as **Routes**. With
the optional Walking and cycling add-on, the same panel also plans door to door, walking and cycling.

Every planned route, whichever way, can be saved under a name and is kept as it was
planned, with its date; **Saved routes** under the form opens, renames and deletes them.
**Save GPX** downloads a planned or saved route as a GPX file (the line, the start, via
points and end, and each turn by its instruction), and **Printable route card (PDF)**
prints the directions. Walks and rides avoid ferries; one taken for want of another way is
said plainly and drawn dashed. See [road-routes.md](road-routes.md).

## Reachable from here

Press and hold a point and choose **Reachable from here**: the areas you could reach by car
or bicycle in up to **2 hours**, or on foot in up to **8 hours**. Choose the way, then the
time:

| Way | Times | To begin with |
| --- | --- | --- |
| Drive, Cycle | 15 min, 30 min, 1 h, 1½ h, 2 h | 30 min |
| Walk | 30 min, 1 h, 2 h, 4 h, 6 h, 8 h | 1 h |

Each way keeps the time you last chose for it. A time draws up to three areas, one inside
another, in steps of one colour with a labelled outline for each: 2 hours' drive shows
30 minutes, 1 hour and 2 hours; 8 hours on foot shows 2, 4 and 8 hours.

By car it works over the routes added (**Main roads only**); with walking and cycling added,
over every street (**Streets**), by car or bicycle. **On foot it works over the terrain**
(below), so it needs only terrain on **Offline maps**, not streets. Drives are for
free-flowing traffic with no stops, rides for a steady pace on the flat; over 2 hours on
foot (and over an hour by bicycle) no rests are counted, so a real day's walk covers much
less. A long time takes longer to work out: a 2 hour drive can take tens of seconds on a
Raspberry Pi, an 8 hour walk about ten, with a bar showing how far it has got. **Print or
save as PDF** in the card opens the map's print with the areas on it. See
[road-routes.md](road-routes.md#reachable-from-here).

### On foot, over the terrain

On foot the card shades the ground you could walk to, orange, darkest nearest, with a
ring and its time at each half hour (up to an hour) or each hour. The pace is Tobler's
hiking function on the installed terrain: about 5 km/h on a flat path, 6 km/h on a gentle
descent, slower up and on steep descents, and three fifths of that off paths and roads.
Paths and roads come from the installed map; water, rivers, canals and cliffs are barred
except at bridges, and so are slopes over 45°. It is for a fit adult with no load: under
**Pace and what this is**, choose **Slower** (three quarters: a pack, children) or **Much
slower** (half: someone hurt or tired). **It does not know** fences, private land, bog,
woods, snow, darkness or weather, which can halve a pace or stop it, and it can miss a
narrow gully or footbridge. Longer walks are read in coarser squares (25 m up to an hour,
120 m for 8 hours), so the work stays about the same.

On paper the walk is **Reachable on foot** in **Print or save as PDF**: the shading, each
ring with its time (so it reads in grey), the start as a ringed dot, and under the map the
key in words, the pace, the terrain it was read from and what it leaves out. Add the
**UTM grid lines** or **Latitude and longitude** for references.

## Walking and cycling

Only where the optional Walking and cycling add-on is installed, each country on **Offline maps** has a
**Walk/cycle** column, and **Walking and cycling** ("Walking, cycling and door-to-door
routes") is one of the choices in **Add a place**. It is built on this device from the
country's source file; nothing more is downloaded once that file is kept.

1. Press **Add** under **Walk/cycle** on the country's row (or **Add a place**, then tick
   **Walking and cycling** in **What for France?**). Where the source file is not kept yet,
   the flow downloads it first and says so ("Needs France's source file, 4.9 GB:
   downloaded first").
2. Read what it takes before you start: on a Raspberry Pi 5, 56 minutes for Great Britain
   and 91 for the United Kingdom, about 2.3 GB of memory, and about 53 GB written to the
   disk it works on. An SD card wears with every write: under **Where it works**, choose
   the NAS or a USB disk to spare it (the streets service must be able to write there; a
   NAS connected with `deploy/pi/nas-share.sh` can). The finished streets are copied back. Several countries are joined into one
   set, which replaces the one in use.
3. Press the button that starts it. The row shows each stage with its progress (step 3 of 5)
   and the time left; routes keep working on what is in use meanwhile.

One build runs at a time. Asked for while another is under way (a second country added
while the first builds, or a source file that finishes downloading during a build), it is
queued: **What for France?** says so before you press, it shows as **Waiting** on Offline
maps and under **Downloads and tasks**, where it can be cancelled, and it starts by itself
when the service is free, with the places already built kept in the new set. Asking again
for places already being built, or already waiting, queues nothing and says so.

**Remove…** in the place's **⋯** menu lets you tick **Walking and cycling**; the source file
stays unless you tick it too. Where the add-on is not installed, Offline maps says so in one
line ("Walking and cycling: not set up"), with how to add it.
