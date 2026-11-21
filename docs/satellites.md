# Satellites

**Radio → Satellites** says when the amateur, weather and crewed satellites pass over Home
(or any place you give), where each one is now, the track it takes across your sky, and
what to tune to through a pass as its signal shifts with Doppler. Everything is worked out
on your device. The one thing that needs a connection is the satellites' orbital elements,
and they are fetched only when you press for them.

Listening to satellites needs no licence. Sending to an amateur satellite needs an amateur
licence; see [What needs a radio licence](radio-licences.md).

## Getting the orbital elements

The first time, press **Get orbital elements**. Outpost asks two places, and nothing else
on the screen uses the internet:

- **CelesTrak** for the orbital elements of the amateur satellites, the weather satellites
  and the crewed stations (three small files).
- **SatNOGS DB** for the transmitters each satellite carries: frequencies, modes and
  whether they are in use (about 4 MB).

Press it again every week or two. CelesTrak updates its elements every two hours and asks
not to be fetched more often than that, so a second press within two hours keeps what you
have; SatNOGS DB is asked at most once a day. If either cannot be reached, what you had
stays and the screen says what went wrong.

### How old is too old

Elements describe an orbit as it was on their date, and a low satellite drifts from that
prediction day by day. The screen warns:

- after **7 days**: pass times of a low satellite may already be minutes out;
- after **30 days**: they may be wrong by a lot.

Each satellite's own elements carry their date, and a satellite the publisher has not
updated in weeks is flagged even when the fetch was recent. A clock that is wrong makes
every time wrong too: if the server's clock is off, put it right under **Settings → Server
status**.

## Where it is seen from

Passes are worked out for Home, the saved place with the home icon on the Maps screen. To
see them from somewhere else, type coordinates or a locator, choose a saved place, or
choose a point on the map under **Seen from**.

## Passes

The **Passes** tab lists every pass of every amateur satellite over the next 24 hours, 2
days, 3 days or 7 days, grouped by day. For each pass it gives when the satellite rises
(in UTC and on your own clock), when it sets, its highest point in degrees above the
horizon, how long it is up, and the directions it rises, peaks and sets in. A pass whose
highest point is 10° or more is worth setting up for; lower ones are marked "low pass" and
kept, since a clear horizon can still work them. Passes that never rise 2° are left out.
Find a satellite by name or NORAD number, or show only the higher passes.

Press a pass to open it under **One satellite**.

## One satellite

Choose a satellite (or show only one group of them). The screen gives:

- **Where it is now**: the point on the Earth beneath it, its height and speed, and from
  your place its bearing, elevation and distance, and whether it is coming nearer.
  These move every second while the screen is in view.
- **Frequencies and modes**: the transmitters SatNOGS DB lists as in use, with downlink
  and uplink. While the satellite is above your horizon, each downlink is also given as
  the frequency to listen on now, corrected for Doppler. For a licensed household the
  uplink is given corrected too (Settings → Radio licence).
- **Passes in the next 24 hours**. Choose one to see its **sky track**: the sky drawn as
  if you lay on your back with your head to the north, the horizon as the outer ring and
  straight up in the middle. **What to tune to through the pass** gives the bearing,
  elevation and corrected frequency for each minute from rise to set.

**This pass as a PDF** writes the pass on paper (where to point minute by minute, and what
to tune to at rise, peak and set) to save, print or add to the library. **Show on the
map** draws the satellite's track on the offline map.

**Paste elements** takes one element set you have from elsewhere: a two-line TLE, or one
OMM object as JSON or as KEY = VALUE lines. It is checked strictly, used in this tab only,
and never sent to the server or kept.

## Weather satellites

The **Weather satellites** tab lists the next 12 hours of passes of the weather satellites
that have a downlink listed, each with its downlink, whether the pass is high (45° or
more), good (20° or more) or low, and whether it comes in daylight, twilight or at night
where you are. Receiving their pictures needs a receiver and decoding software; Outpost
only says when and where to listen.

## On the map

On the Maps screen, under **Layers**, switch on **Satellites now**. The amateur satellites
and crewed stations are drawn where they are, moving every 10 seconds while the map is in
view (once a minute if your device asks for reduced motion). A shaded ring is the ground
that can hear a satellite: the ISS's always, the chosen satellite's, and any satellite's
that is above Home's horizon now, shaded more. The satellite last chosen on the Satellites
screen also has its ground track drawn, with its next pass over Home in a heavier line
and the point where it rises over Home marked.

## What it does not do

- It does not key or tune a radio, or point an antenna.
- A transmitter SatNOGS DB lists as in use may still be switched off on the day.
- Satellites outside CelesTrak's amateur, weather and crewed station groups are not kept,
  though their elements can be pasted.
- Predictions are SGP4's, the method the elements are made for. They are as good as the
  elements and the clock.
