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
rise and set (UTC and your clock), highest point, how long it is up, and the directions it rises,
peaks and sets in. A pass under 10° is a low pass, here, under **Weather satellites** and on
the PDF alike; under 2° is left out. A geostationary satellite above your horizon is not a pass
but **always up**: the row says where to point (how high, and which way). Press a pass to open it under **One satellite**.

## One satellite

- **Where it is now**: the point beneath it, height, speed, and from your place its bearing,
  elevation, distance and whether it is coming nearer, updated every second.
- **Frequencies and modes**: transmitters SatNOGS DB lists as in use. While it is above your
  horizon each downlink is also given corrected for Doppler; with a licence set under **Settings
  → Radio licence**, the uplink too.
- **Passes in the next 24 hours**. Choose one for its **sky track** (as if lying on your back,
  head to the north, horizon as the outer ring) and **What to tune to through the pass**: bearing,
  elevation and frequency for each minute.

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
