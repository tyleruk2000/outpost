# Tide times

**Tools → Tide times** gives high and low water at the tide stations nearest a place, for a
day up to a month ahead. It is worked out on the computer running Outpost from each
station's tidal constants, which come with Outpost, so it works with no internet.

**It is not for navigation.** The figures are the tide the moon and sun raise, and nothing
else. Wind, air pressure and river flow (a storm surge, or the opposite) can hold the sea
well above or below them, and the tide where you stand can differ from the tide at a
station some way off. Use official tide tables and forecasts wherever safety depends on
the water.

## Using it

1. **Choose the place.** The home place (the saved place with the home icon) unless you
   choose another saved place, or type coordinates. To use a point on the coast, save it
   as a place on the Maps screen first. The place and the clock are the same ones the Solar
   clock uses, and are remembered on this device.
2. **Choose the clock** the times are written on: this device's time zone, or a fixed
   offset from UTC.
3. **Choose the station.** The eight nearest are offered, nearest first, with their
   distance. If the nearest is more than 50 km away the screen says so: the tide there may
   come earlier or later, and rise higher or lower, than where you are.
4. **Choose the days:** from a date (today if left empty), for 1, 3, 7, 14 or 31 days.

The answer is a curve of the height through those days, with each high and low marked,
and below it a list of high and low waters by day. Point at the curve, or focus it and use
the arrow keys (an hour at a time; Page Up and Page Down a day), to read the height at any
time.

## The heights

Heights are in metres, to the centimetre, above **mean lower low water**: the average of
the lower of each day's two low waters, the level US charts give depths from. A height
below zero is a low tide below that average. At the few stations with no such level in
NOAA's data, heights are above **mean sea level**, and the screen says so.

## Where it works

Outpost holds the tidal constants NOAA publishes for its stations: about 1,370, on the
coasts of the United States (Alaska and Hawaii among them), Puerto Rico, the US Virgin
Islands, Guam and the Pacific territories, and a handful of ports elsewhere (Bermuda, a
few in Central America, and others). Nowhere else is covered yet. Constants for Britain,
Canada and most other countries are published under terms that do not allow them to be
shipped with Outpost; see [sources.md](sources.md#tidal-constants).

## How it is worked out

A tide is the sum of a few dozen regular waves (constituents), each with a speed fixed by
the motions of the moon and sun. A station's constants are the size and timing of each
wave there, measured over years. Outpost adds up NOAA's 37 constituents for the station,
each corrected for where the moon and sun are on the day, by the method of the US Coast and
Geodetic Survey's *Manual of Harmonic Analysis and Prediction of Tides* (Schureman, 1958).
Checked against NOAA's own published predictions for four stations, the times agree to
within a minute or two and the heights to within a few millimetres.

A wobble of less than half a centimetre between a high and a low is not listed as a tide:
where the tide is small and slack (parts of the Gulf of Mexico) the curve can waver, and
NOAA's tables leave such wavers out.

## What it does not do

- No surges, wind, pressure, river flow or waves: the astronomical tide only.
- No tidal streams (currents), and no secondary ports worked out by time and height
  differences from a main station.
- Only NOAA's stations; nothing for a coast without one nearby.
