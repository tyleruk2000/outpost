# Routes and tracks

The **Routes** tab of the Maps screen holds every route: drawn by hand, recorded as you
walk, found by name, or imported from a file. All are drawn on the map, found by search,
printed and exported as GPX alike. Open one for its distance, ascent and elevation profile.
**Plan a route** on the same tab plans a drive on main roads (and, with walking and cycling added, door to door, on foot or by bicycle): see [road-routes.md](road-routes.md).

## Drawing a route

**A drawn route is straight lines between the points you place. It does not follow paths or
roads: Outpost does not work out a way for you.**

1. Press **Draw a route** (or the pencil on the map, or **Draw a route from here** in the
   right-click menu).
2. Click or tap to add points. Drag a point to move it; drag the handle mid-leg to add one
   between; press a point and Delete to remove it. Undo is Ctrl/⌘ Z. From the keyboard, move
   the map with the arrow keys and press Enter to add a point at the centre.
3. **Name and save**, with a colour. A route has 2 to 2,000 points.

An unsaved route survives a reload in the same tab. Escape or **Cancel** stops, asking first.

On saving, heights are read from the **terrain installed on this device** for the ascent and
profile; nothing is downloaded. With no terrain there is no profile, and the panel says so.
Install terrain later and choose **Fill in heights from terrain**.

**Edit shape** reshapes any route. For a recording imported from GPX it asks first, since
saving simplifies the line to about 300 points, joins its segments and drops its times;
**Edit a copy** leaves the recording alone.

## Recording a track

**A recording runs only while the screen is on and Outpost is the page in front.** No browser
gives a web page positions while the screen is locked or another app or tab is in front. For
a long day with the phone in a pocket, record with a GPS unit or an app made for it and
import the GPX file.

1. Press **Record a track** (the ring with a dot), then **Start recording**. The browser asks
   for your position the first time.
2. The card shows distance, time, moving time and climb. **Pause** and **Resume** start a new
   stretch; nothing is kept while paused.
3. **Stop**, then give a name and colour. **Carry on** undoes a stop.

Leaving the Maps screen does not stop a recording. Saved, it exports as GPX with the time of
every point.

- **The screen**: Outpost asks the browser to keep the screen on, and the card says whether it
  agreed. Where it cannot or will not, set the phone not to lock for the walk. A screen kept on
  drains the battery much faster.
- **Gaps**: when the page was hidden for over a minute with no positions, the card says how
  long was missed, and nothing is drawn or counted across the gap.
- **Nothing is lost** to a reload, a closed tab or a flat battery: points are kept on the
  device as they come, and Outpost offers **Continue**, **Save what there is** or **Discard**
  next time it opens.
- **Positions**: fixes worse than 30 m are ignored, and a fix must be 5 m from the last, so a
  phone lying still adds no distance. Climb counts rises of 3 m, so a wandering height adds
  false climb: treat it as rough. Phone heights may sit tens of metres off the map's.
- **Out of reach of the server**: recording needs no server; saving does. The recording waits
  on the device, is sent again by itself until the server has it (never twice), and **Download
  GPX** gets it off the phone at any time.
- **Limits**: 150,000 points (about 750 km), one recording per browser at a time, not in a
  private window, and HTTPS needed. Clearing the browser's site data deletes an unsaved
  recording.

## Finding a known route

**Find a route** looks up a route by name (a waymarked walk, a cycle route, a named path such
as the Llanberis Path) in [OpenStreetMap](https://www.openstreetmap.org/copyright) and adds it
to your routes. **This is the one part of the map that needs the internet when you use it.**
Nothing is sent until you press **Search**; an added route works offline.

1. Type part of the name, or nothing to list routes in the view.
2. Choose **This map view** or **Anywhere**.
3. **Search**, then choose a result to see it drawn, with its length and any gaps.
4. **Add to my routes**. Tick **Also add its alternative legs** for alternatives and
   excursions.

Searching the view by name also finds named paths (stretches of path sharing a name);
**Anywhere** finds routes only. A view may be at most 2° by 2°, and a name needs three
letters. A long trail kept as sections is listed by section.

Gaps in OpenStreetMap's line are left open, never drawn across, and the length counts only
what is mapped. A route may have up to 200,000 points (about 2,000 km). Heights come from
installed terrain.

### What is sent, and to whom

The view names the server before you search. Sent: the name typed, the edges of the view, and
a client name for Outpost with its version and web address. Nothing about you, your library or
this installation is sent, and nothing while you type.

| Server | Knows | Asked first when the map is over | Run by |
| --- | --- | --- | --- |
| `ovp.dresel.systems` | Europe; North America | Europe; North America | A private person in Germany |
| `overpass.private.coffee` | The whole world | Anywhere else | Private.coffee, a non-profit in Austria |

These are volunteers' [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
servers, with no promise of being there, and can take over a minute. **Change server**
chooses another; a failed search offers **Ask another server**. Results say when a server's
copy of the map is over a month old. To use a server of your own, see
[development/maps.md](development/maps.md#route-sources). Their terms are in
[sources.md](sources.md).

### Credit and licence

A found route is © OpenStreetMap contributors under the
[Open Database Licence](https://opendatacommons.org/licenses/odbl/1-0/). Outpost keeps the
credit with it: in its panel, in the map's credits while it is drawn, and in its GPX export.
**If you pass the GPX file on, leave the credit in it. If you print or publish a map with the
route on it, the credit must be on it.**

### What it does not do

- It does not search walking websites or apps; their terms do not allow it.
- It does not check a route. OpenStreetMap is made by volunteers: a route can be wrong,
  closed or dangerous. Check it against the ground and a proper map.
- It does not refresh a route or fetch anything in the background.

## GPX tracks

Drop `.gpx` files on the map or press **Import a map file**. Tracks and routes become a
route; waypoints stay with it or, if you choose, become saved places.

- GPX 1.0 and 1.1, up to 20 MB, 1,000,000 points and 20,000 waypoints a file. A file over a
  limit is refused whole, with a message saying which.
- Refused: XML that is not well formed (it is not repaired), files with a DOCTYPE, and files
  saved as UTF-16 (save as UTF-8).
- Ascent ignores rises under 3 m as GPS noise.
- **Export**: one route, or several with your saved places as waypoints, as GPX 1.1. A drawn
  route has no times.

### Icons and GPX

A place's icon is written as Garmin's symbol name (Home as `Residence`, Shelter as `Lodge`,
Camp as `Campground`, Water as `Drinking Water`, Summit as `Summit`, Danger as `Danger Area`,
and so on); Pin, Meeting point and Star have none. On import, known symbols become icons and
others a plain pin, and the file's own symbol is written back unchanged until you change the
icon. Colour and favourite are not part of GPX.

## KML, KMZ and GeoJSON files

**Import a map file** also takes KML (Google Earth, My Maps), KMZ and GeoJSON.

- Before anything is saved, the dialog says what each file would make ("A new route of 2 lines
  and 1 outline · 12 new places"). Importing adds; nothing is replaced.
- Points become saved places, lines one route, polygons outlines, drawn as faintly filled
  areas in the route's colour. An outline is not counted in the distance, climb or profile.
- A KML file whose lines lie in more than one folder makes one route for each folder, named
  after it; what lies in no folder is a route named after the file. A folder of points alone
  makes no route.
- Linked files and overlays in KML are not followed.
- GeoJSON must be in longitude and latitude (WGS 84); one in another coordinate system is
  refused, so export it again as EPSG:4326.
- Limits as for GPX.

### Exporting as KML or GeoJSON

On a route, **Other formats** exports it as KML or GeoJSON; **Export routes and places**
(under the routes list's menu) chooses GPX, KML or GeoJSON for several at once.

- **KML** puts each route in a folder in its colour, and the saved places in one more, so
  Outpost reads the file back as the same routes. Outlines are polygons again.
- **GeoJSON** has a feature for each line, area and point, with `kind` (`route`, `area`,
  `waypoint`, `place`), the route's name and its colour.
- **GPX** has no areas, so an outline stays a closed line.
