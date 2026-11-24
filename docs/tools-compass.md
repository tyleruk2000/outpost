# Tools: Compass

**Tools → Compass** says, for a place, how far magnetic north and the map's grid north lie
from true north, and so what to add or subtract going between a paper map and a compass. It
also shows the phone's own compass, corrected, and converts a bearing between the three
norths. It works with no internet.

## Using it

- **Place.** Home unless you choose another: where the device is (over HTTPS only; greyed
  out with the reason otherwise), a saved place, or **Search for a place…** (a town, a
  position, a grid reference or a locator). The map's centre card opens this screen for
  the middle of the map, shown as a point on the map.
- **North here.** In Great Britain, first the rule for an Ordnance Survey map, worked out
  for the place and today, for example at Scafell Pike in November 2026:

  > Map to compass: subtract 1°
  > Compass to map: add 1°
  >
  > Magnetic north is 0.1° west of true north here, in November 2026, moving about 0.2°
  > east a year. Grid north is 1.0° west of true north here. Magnetic north is 0.9° east of
  > grid north here.

  **The map's grid** chooses the grid: the usual one for the place (the National Grid in
  Great Britain, UTM elsewhere), the National Grid, UTM, or none (a map drawn to true
  north). **Copy** and **Save as a page** keep the answer. A drawing shows the three
  norths, with the angles enlarged so they can be seen (the drawing says by how much).
- **Convert a bearing** from one north to the others, to the whole degree.

The rule is rounded to whole degrees, which is what a hand compass is set and read to; the
figures under it are to a tenth. Where magnetic north is east of grid north, subtract going
from map to compass and add going back; where it is west, the other way round.

Other national grids (the Irish Grid, for one) are not worked out: on such a map the UTM
figure can be out by a degree or more.

## The live compass

Press **Start the compass** to see which way the top of the phone points, in degrees and as
one of sixteen points, from magnetic, true or grid north. On an iPhone the press asks
Safari's permission. It listens only while the card is on and the page is in view.

- It needs HTTPS and a phone. At a plain http address the card says so and links
  [HTTPS on your network](deployment.md#https-on-your-network); the rest of the screen
  works. On a computer with no compass it says, after three seconds, that none was found.
- A phone's compass is easily thrown by metal, magnets and cars. The card says how to
  settle it, and how to check it against the sun's bearing on the Solar clock.

On the map's centre card, one line gives magnetic north there to a tenth of a degree
("Magnetic 0.3° W") and opens this screen.

## How accurate it is

The figures come from the **World Magnetic Model 2025** (NOAA and the British Geological
Survey), valid from 2025 to the end of 2029. It is good to about ±0.4° of declination in
Britain. Outside those years the screen says how far past the end the date is, and that the
figures can be out by a degree or more. Near the magnetic poles it says when the compass is
unreliable (NOAA's caution and blackout zones).

Not in the model: local magnetism (magnetic rocks, enough in some hills to move a needle by
degrees; iron, cables, vehicles), the field's daily swing, and magnetic storms.

Where the model comes from and its terms:
[sources.md](sources.md#the-world-magnetic-model-and-the-compass). How it is worked out:
[development/tools.md](development/tools.md).
