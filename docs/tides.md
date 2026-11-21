# Tide times

**Tools → Tide times** gives high and low water at the tide stations near a place, for a
day up to a month ahead. It is worked out on the computer running Outpost from each
station's tidal constants, which come with Outpost: there is nothing to download, and it
works with no internet.

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
3. **Choose the station.** Up to eight stations within 100 km are offered, nearest first,
   with their distance. If the one chosen is more than 50 km away the screen says so: the
   tide there may come earlier or later, and rise higher or lower, than where you are. A
   gauge up a river is marked "(river)": the river's flow bends the tide there.

   If no station is within 100 km, none is offered. The screen says there is no tide data
   for the coast near the place and names the nearest station with its distance. Inland,
   there is no tide to show. On a coast with no station near, save a place on the shore
   nearer a port and choose it, or use the tide tables of the country's hydrographic office.
4. **Choose the days:** from a date (today if left empty), for 1, 3, 7, 14 or 31 days.

The answer is a curve of the height through those days, with each high and low marked,
and below it a list of high and low waters by day. Point at the curve, or focus it and use
the arrow keys (an hour at a time; Page Up and Page Down a day), to read the height at any
time.

## The heights

Heights are in metres, to the centimetre. At NOAA's stations they are above **mean lower
low water**: the average of the lower of each day's two low waters, the level US charts
give depths from. A height below zero is a low tide below that average.

Everywhere else (and at the few NOAA stations with no such level) heights are above **mean
sea level** at the gauge, and the screen says so. That is not the level a chart gives depths
from, which is lower: add the chart's figure for mean sea level above chart datum, if you
have it, to compare with a chart.

## Where it works

Outpost holds two sets of tidal constants, about 4,100 stations in all:

- **NOAA's**, about 1,370 stations on the coasts of the United States (Alaska and Hawaii
  among them) and its territories, and a handful of ports elsewhere.
- **TICON-4's**, about 2,700 tide gauges on every continent's coasts, worked out by the
  German Geodetic Research Institute (DGFI-TUM) from the GESLA-4 collection of tide-gauge
  records: Britain and Ireland, Europe, Canada, Australia and New Zealand, Japan, much of
  Africa, South America and Asia, and many islands.

Coverage is thinnest in South Asia, parts of Africa and the Arctic. See
[sources.md](sources.md#tidal-constants) for where each set comes from and its licence.

## How it is worked out

A tide is the sum of a few dozen regular waves (constituents), each with a speed fixed by
the motions of the moon and sun. A station's constants are the size and timing of each
wave there, measured over years. Outpost adds up NOAA's 37 constituents for the station,
each corrected for where the moon and sun are on the day, by the method of the US Coast and
Geodetic Survey's *Manual of Harmonic Analysis and Prediction of Tides* (Schureman, 1958).
Checked against NOAA's own published predictions for four stations, the times agree to
within a minute or two and the heights to within a few millimetres. TICON-4's constants
give a little less: checked against the Norwegian Mapping Authority's predictions for
Bergen, Oslo and Narvik, the times agree to within a quarter of an hour and the heights to
within a few centimetres. Where the tide is small and its turns are flat (Stavanger), the
time of a high or low can be out by up to an hour, though the heights still agree.

TICON-4 gives 50 constituents; Outpost uses the 39 whose conventions it can be sure of.
The rest are small at almost every gauge.

A wobble of less than half a centimetre between a high and a low is not listed as a tide:
where the tide is small and slack (parts of the Gulf of Mexico) the curve can waver, and
NOAA's tables leave such wavers out.

## What it does not do

- No surges, wind, pressure, river flow or waves: the astronomical tide only.
- No tidal streams (currents), and no secondary ports worked out by time and height
  differences from a main station.
- Nothing for a coast with no station within 100 km.
