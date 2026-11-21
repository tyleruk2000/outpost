# Tide times

**Tools → Tide times** gives high and low water at the tide stations nearest a place, up to a
month ahead, with no internet.

**It is not for navigation.** It gives the tide the moon and sun raise, nothing else. Wind,
air pressure and river flow can hold the sea well above or below it, and the tide where you
stand can differ from a station some way off. Use official tide tables and forecasts wherever
safety depends on the water.

## Using it

1. **Choose the place**: home, another saved place, or coordinates. To use a point on the
   coast, save it as a place on Maps first.
2. **Choose the clock**: this device's time zone, or a fixed offset from UTC.
3. **Choose the station** from the eight nearest. If the nearest is over 50 km away, the
   screen warns that the tide there may differ in time and height.
4. **Choose the days**: from a date (today if empty), for 1, 3, 7, 14 or 31 days.

A curve shows the height, with each high and low marked, and a list by day below it. Point at
the curve, or use the arrow keys (an hour; Page Up and Page Down, a day), to read any time.

Heights are in metres above **mean lower low water**, the level US charts give depths from;
below zero is lower than that average. Where NOAA gives no such level, heights are above
**mean sea level**, and the screen says so.

## Where it works

About 1,370 NOAA stations: the coasts of the United States (with Alaska and Hawaii), Puerto
Rico, the US Virgin Islands, Guam and the Pacific territories, and a few ports elsewhere such
as Bermuda. Nowhere else yet: constants for Britain, Canada and most countries are published
under terms that do not allow them to be shipped (see
[sources.md](sources.md#tidal-constants)).

## Accuracy and limits

It sums NOAA's 37 tidal constituents for the station. Against NOAA's own predictions, times
agree within a minute or two and heights within a few millimetres. A wobble under half a
centimetre is not listed as a tide, as NOAA's tables leave such wavers out.

It does not give surges, waves, tidal streams, or secondary ports worked from a main station.
