# Satellites

**Radio → Satellites** says when amateur, weather and crewed satellites pass over Home (or any
place you give), where each is now, its track across your sky, and what to tune to through a
pass as Doppler shifts its signal. Everything is worked out on your device except the orbital
elements, which are fetched only when you press.

Listening needs no licence. Sending to an amateur satellite needs an amateur licence; see
[What needs a radio licence](radio-licences.md).

## Getting the orbital elements

Press **Get orbital elements**. Outpost asks two places, and nothing else on the screen uses the
internet:

- **CelesTrak**: orbital elements for the amateur, weather and crewed-station groups.
- **SatNOGS DB**: each satellite's transmitters, frequencies, modes and whether in use (about
  4 MB).

Press it again every week or two. A second press within two hours keeps what you have (CelesTrak
asks for no more), and SatNOGS DB is asked at most once a day. If either fails, what you had
stays and the screen says why.

### How old is too old

A low satellite drifts from its elements day by day. The screen warns after **7 days** (pass
times may be minutes out) and after **30 days** (they may be wrong by a lot), and flags any
satellite whose own elements are old. A wrong clock makes every time wrong: set it under
**Settings → Server status**.

## Where it is seen from

Passes are for Home, the saved place with the home icon. Under **Seen from**, type coordinates or
a locator, choose a saved place, or choose a point on the map.

## Passes

**Passes** lists every amateur satellite pass over the next 24 hours, 2, 3 or 7 days, by day:
rise and set (UTC and your clock), highest point, how long it is up, and the directions it rises,
peaks and sets in. A pass under 10° is marked "low pass"; under 2° is left out. Press a pass to open it under **One satellite**.

## One satellite

- **Where it is now**: the point beneath it, height, speed, and from your place its bearing,
  elevation, distance and whether it is coming nearer, updated every second.
- **Frequencies and modes**: transmitters SatNOGS DB lists as in use. While it is above your
  horizon each downlink is also given corrected for Doppler; with a licence set under **Settings
  → Radio licence**, the uplink too.
- **Passes in the next 24 hours**. Choose one for its **sky track** (as if lying on your back,
  head to the north, horizon as the outer ring) and **What to tune to through the pass**: bearing,
  elevation and frequency for each minute.

**This pass as a PDF** writes where to point and what to tune to, to save, print or add to the
library. **Show on the map** draws its track. **Paste elements** takes one element set from
elsewhere (a two-line TLE, or one OMM object as JSON or KEY = VALUE lines), checked strictly, used
in this tab only and never kept.

## Weather satellites

**Weather satellites** lists the next 12 hours of passes with a downlink, each marked high (45°+),
good (20°+) or low, and in daylight, twilight or night. Receiving pictures needs a receiver and
decoding software; Outpost only says when and where to listen.

## On the map

On the Maps screen, **Layers**, **Satellites now** draws the amateur satellites and crewed
stations where they are, moving every 10 seconds. A shaded
ring is the ground that can hear a satellite: always the ISS's, the chosen satellite's, and any
above Home's horizon now.

## What it does not do

- It does not key or tune a radio or point an antenna.
- A transmitter listed as in use may be off on the day.
- Only CelesTrak's amateur, weather and crewed groups are kept; paste elements for others.
- Predictions use SGP4 and are as good as the elements and the clock.
