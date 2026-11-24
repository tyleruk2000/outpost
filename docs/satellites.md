# Satellites

**Radio → Satellites** says when amateur, weather and crewed satellites pass over the
household's home (or any place you give), where each is now, its track across your sky, and what to tune to through a
pass as Doppler shifts its signal. Everything is worked out on your device except the orbital
elements, which are fetched only when you press.

Listening needs no licence. Sending to an amateur satellite needs an amateur licence; see
[What needs a radio licence](radio-licences.md).

## Getting the orbital elements

Press **Get orbital elements**. Outpost asks two places, and nothing else on the screen uses the
internet except **Read about it on Wikipedia** (below):

- **CelesTrak**: orbital elements for the amateur, weather and crewed-station groups.
- **SatNOGS DB**: each satellite's transmitters, frequencies, modes and whether in use (about
  4 MB), and its other names, launch date, countries and website (about 1.6 MB).

Press it again every week or two. A second press within two hours keeps what you have (CelesTrak
asks for no more), and SatNOGS DB is asked at most once a day. If either fails, what you had
stays and the screen says why.

### How old is too old

A low satellite drifts from its elements day by day. The screen warns after **7 days** (pass
times may be minutes out) and after **30 days** (they may be wrong by a lot), and flags any
satellite whose own elements are old. A wrong clock makes every time wrong: set it under
**Settings → Server status**.

## Where it is seen from

Passes are for the current household's home: its saved place (with one household, the saved
place with the home icon), or, for a portable household, where it was last said to be, with
how old that is. Nothing is worked out again because it moved until you open the screen. Under
**Seen from**, type coordinates or a locator, choose a saved place, or choose a point on the map.

## Passes

**Passes** lists every amateur satellite pass over the next 24 hours, 2, 3 or 7 days, by day:
rise and set (UTC and your clock), the directions it rises and sets in, how long it is up, and its
highest point. At first only passes 10° high or more are listed (untick **Only passes 10° high or
more** for the low ones too); a pass under 10° is a low pass, here, under **Weather satellites**
and on the PDF alike, and under 2° is left out. A geostationary satellite above your horizon is
not a pass but **always up**: the row says where to point (how high, and which way). The list
shows 40 at a time, with **Show 40 more** under it. Press a pass to open it under **One
satellite**, at the satellite's name.

When the elements are recent and nothing has gone wrong, what was fetched and when folds into
one line above **Seen from**; open it to fetch again.

## One satellite

Choose what to **Show** (every kept satellite, or one group), then the **Satellite**: type part of
its name or its NORAD number in the list and press Enter for the first match.

- **Passes in the next 24 hours**, first. The pass shown is marked with a bar and "shown"; choose
  another for its **sky track** (as if lying on your back, head to the north, horizon as the outer
  ring): an open circle where it rises, a diamond at its highest, a square where it sets, and a
  large ring where it is now during a pass. **Where to point and what to tune to, minute by
  minute** gives the bearing and height for each minute and, for a satellite with a downlink, the
  frequency to listen on (and to send on, with a licence), in MHz. It starts with the main
  transmitter (a transponder or repeater before a beacon or telemetry); choose another under
  **Transmitter**. A satellite with no downlink in use keeps the bearings and heights.
- **Where it is now**: the point beneath it, height, speed, and from your place its bearing,
  elevation, distance and whether it is coming nearer, updated every second. Under it, the
  **ground track** (below).
- **Frequencies and modes**: transmitters SatNOGS DB lists as in use. While it is above your
  horizon each downlink is also given corrected for Doppler; with a licence set under **Settings
  → Radio licence**, the uplink too.

### Ground track

Where on the Earth the satellite is overhead, drawn on a flat map of the world with no map tiles,
so it works with no internet. Choose **1 turn** or **2 turns** from now, or **This pass** (45
minutes before the pass chosen rises to 45 minutes after it sets).

- The heavy line is where it is above your horizon; the thin line the rest of the track; a dotted
  line where it has already been.
- A small circle marks every 10 minutes of UTC, with the time beside it where there is room (fewer
  times on a phone; every one is in the table).
- The square is your place; the dashed ring is where the satellite must be to be above your
  horizon, for its height now. The ringed dot is where it is now.
- Night is shaded as now, or for **This pass** as at its highest point.

Under the map a line says it in words ("Now over 7.6° S, 16.1° W. Above Home 06:14 to 06:24 UTC, N
to WSW."), or when it is next up if it is not in the stretch drawn. **The track as a table** gives
the same every 10 minutes: the time, the point beneath it, and its bearing and height from your
place, the rows when it is up in bold.

A geostationary satellite stays over one point on the equator, so it is drawn as one dot with the
edge of where it can be seen, and the line says where to point from your place.

### The pass on paper

**This pass as a PDF** makes a sheet to take outside: when it rises, peaks and sets, the sky
track, its height minute by minute, where to point each minute, **Over the ground** (the ground
track from 45 minutes before the rise to 45 after the set, the rise, highest and set marked with
the same shapes as the sky track, your place as a house, night as at the highest point), and what
to tune to for each transmitter. It prints in greys as well as in colour: the marks differ by
shape and the lines by weight and dashes.

### About this satellite

A short description made only from facts: its other names, when it was launched and from which
countries, who runs it, whether it is in orbit, and what SatNOGS DB lists it as carrying (an FM
voice repeater, an APRS digipeater, a beacon, telemetry and so on). The orbit is worked out from
its elements: its mean height, how long one turn takes, its angle to the equator and so how far
north and south it passes over, and whether it is geostationary or sun-synchronous (crossing each
latitude at about the same local time every day). Its website is linked, and a satellite SatNOGS
DB flags as transmitting on an uncoordinated or denied frequency is marked.

When CelesTrak and SatNOGS DB give the same catalogue number names with nothing in common (as
with 53109, GREENCUBE to one and MTCube 2 to the other), the screen says so: one of them may have
another satellite under that number, so its frequencies and article need checking.

**Read about it on Wikipedia** finds the article by the satellite's catalogue number, not its
names: names are a poor key ("AO-73", FUNcube-1's OSCAR number, is also a US Navy oiler).

- **With a Wikipedia copy on this Outpost** (an English Wikipedia, WikiMed or a selection in the
  reference collections), it looks there first and needs no internet. An article whose title is
  one of the satellite's names is taken when its infobox gives the satellite's SATCAT number or
  COSPAR ID, and rejected when it gives another's. The summary says "From the Wikipedia copy on
  this Outpost" with the copy's name and date, and links to the article in the reader. If the copy
  has nothing clearly about it, **Ask Wikipedia online** asks online, on its own press.
- **Online**, Wikidata is asked for the entry that carries the satellite's NORAD number or COSPAR
  ID, and that entry's English article is read. Only when no such entry has one are its names and
  a search tried, and each answer is checked: an article about another numbered object, about
  something that is not a spacecraft, or a list or a general article ("Amateur radio satellite")
  is not taken. An OSCAR number on its own is never tried as a title. Wikimedia is asked once
  every 6 seconds, so this takes 10 to 20 seconds; if it asks Outpost to wait, the screen says for
  how long, and nothing more is asked until then.

The screen says how the article was matched: by catalogue number (the strongest), by name or by
search (check it), or as an article about the satellite's **series** (MetOp for METOP-B), said so.
If nothing is clearly about it, it says "No article found that is clearly about this satellite."
and why. The summary is kept to read offline; **Discard this article** removes it, and that title
is not offered for this satellite again (**Offer it again** undoes that). The summary is credited
to Wikipedia's contributors under CC BY-SA 4.0, with a link to the article.

**This pass as a PDF** writes the sky track as on screen, where to point and what to tune to, to save, print or add to the
library. **Show on the map** opens Maps with **Satellites now** switched on, fitted to where the
satellite is and its next pass over home, the other satellites drawn small and without names
(**Show every satellite alike** in **Layers** puts them back). **Paste elements** takes one element set from
elsewhere (a two-line TLE, or one OMM object as JSON or KEY = VALUE lines), checked strictly, used
in this tab only and never kept.

## Weather satellites

**Weather satellites** lists the next 12 hours of passes with a downlink, each marked high (45°+),
good (20°+), fair (10°+) or low, and in daylight, twilight or night. Receiving pictures needs a receiver and
decoding software; Outpost only says when and where to listen.

## On the map

On the Maps screen, **Layers**, **Satellites now** draws the amateur satellites and crewed
stations where they are, moving every 10 seconds. A shaded
ring is the ground that can hear a satellite: always the ISS's, the chosen satellite's, and any
above the household's home's horizon now.

## What it does not do

- It does not key or tune a radio or point an antenna.
- A transmitter listed as in use may be off on the day.
- Only CelesTrak's amateur, weather and crewed groups are kept; paste elements for others.
- Predictions use SGP4 and are as good as the elements and the clock.
