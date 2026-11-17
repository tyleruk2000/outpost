# Solar clock

**Tools → Solar clock** (`/tools/solar-clock`) tells the time from the sun and the stars,
worked out on the device with no internet and no request to anywhere. It has four tabs,
each linkable (`?tab=recover`, `?tab=sundial`, `?tab=nocturnal`):

- **Now**: for the chosen place and this device's clock, the sun's height and true
  bearing, sundial time beside clock time, the equation of time today, the longitude
  correction for the clock's zone, today's solar noon in clock time, and the sun's path
  through the day as a chart. It says that it trusts the device's clock, and points to
  clock recovery for when that is what is in doubt. The clock is read again at the turn
  of each minute (the tab shows minutes and tenths of a degree, which change no faster),
  not at all while the page is hidden, and at once when it is shown again.
- **Clock recovery**: for after a power cut, with no internet and perhaps no signal.
  From a typed date, the place and something measured with a stick, level ground,
  string and a ruler, the time to set the clocks by, with a range and one sentence on
  what the range comes from. Nothing on this tab reads the device's clock.
- **Make a sundial**: a horizontal dial for the latitude, the hour lines tabulated,
  finding true north from a shadow, the correction table for the place, a template to
  print, and a card-and-pencil equatorial dial.
- **Make a nocturnal**: how a nocturnal tells the time from the stars turning about
  Polaris, the arithmetic of its date ring, a template to print made for the place, and
  a "read the star clock now" calculator.

General information for approximate timekeeping. The screen says once, at the top:
never look at the sun directly, and these methods are no good for navigation or for
anything where safety depends on the time.

## The place and the clock

Above the tabs: the place (the home place, any saved place from the map, or coordinates
typed in any form `parseCoordinates` reads) and the clock its answers are written on:
this device's time zone, with summer time from the zone data the browser carries, or a
fixed "UTC+n" chosen by hand (every half hour from UTC−12 to UTC+14, and +5:45, +8:45 and
+12:45), for when the device's zone is wrong. Both are remembered in the browser as a
preference of the device (`outpost.tools.solar-clock.*`), like every calculator's inputs.
Nothing is stored on the server and there is no migration.

Saved places are read from the server. If it cannot be reached the screen says so and
offers typed coordinates, which need nothing else.

## The methods of clock recovery, best first

| Method | What is measured | How the time follows | Where the range comes from |
| --- | --- | --- | --- |
| Noon, two equal shadows | The moments, morning and afternoon, when the shadow's tip touches one circle round the stick, on any clock that runs | Halfway between them is worked out exactly (it differs from solar noon by seconds as the declination changes); the screen gives what the running clock should have read then, and how far it is out if its two readings are typed | The marking error divided by how fast the tip moves at each mark, combined: about a minute with a 1 m stick, a 4 m circle and 5 mm, more for a circle close to the noon shadow |
| Noon, the shortest shadow | The moment the shadow is shortest | Solar noon for the date and place | How long the shadow stays within the marking error of its shortest: 18 minutes either side in June at Greenwich with a 1 m stick and 5 mm, because near noon the shadow hardly changes |
| The shadow's length | Stick and shadow, morning or afternoon | Apparent height = atan(stick ÷ shadow); refraction taken off; the time is when the sun stands at that height on that side of noon | The error on both lengths and half the sun's width (0.25°, Outpost's own allowance for the blurred tip) through the same arithmetic. Good two hours or more from noon; within about 75 minutes of noon the screen says to use the noon method instead |
| The shadow's bearing | Compass bearing from the stick's foot to the tip, and the magnetic declination if known | Sun's true bearing = shadow's bearing + 180° + declination (east positive); the time is when the sun stands there | The compass error. Outpost has no model of the Earth's magnetic field, and no other part of Outpost holds a declination; without one the screen says the answer is off by an unknown amount and how many minutes each degree is worth then |
| Sunrise or sunset on the sea | Which, and the eye's height above the sea | The sun's centre 0.833° below a level line (NOAA), lowered by the dip 1.76′ √h (Bowditch) | ±0.3° for the air's refraction at the horizon, Outpost's own allowance and not a published figure. A rough check only |

**If the date is not certain**: for each method worked out, how far the answer moves if
the date is 1, 3 or 7 days out either way. At Greenwich on 17 November with the defaults:
noon moves under a minute for a day and about 2 minutes for a week (the equation of
time); sunrise 12 minutes for a week (the declination).

A time is written to no more figures than its range deserves: to the minute when it is
good to 3 minutes, to 5 minutes up to 20, to 10 up to an hour, to a quarter beyond; the
range's ends are rounded outwards. **Better sources** points to radio time signals
(a link to Radio frequencies, `/radio/frequencies`),
a GPS receiver, and a phone that has had signal.

## Formulas and sources

| What | Formula | Source |
| --- | --- | --- |
| The sun's declination and the equation of time | NOAA's equations: the low-accuracy solar position of J. Meeus, *Astronomical Algorithms*, chapters 25 and 28 (as `features/maps/lib/sun.ts` already used) | [NOAA GML, Solar Calculation Details](https://gml.noaa.gov/grad/solcalc/calcdetails.html), read 17 November 2026. NOAA names the book but not its edition; the chapter numbers are those of the second edition (Willmann-Bell, 1998) as the existing code gives them. **The book itself was not read**: no worked example from it is used; the tests are held to the US Naval Observatory instead |
| Hour angle | (UTC minutes + equation of time + 4 × longitude) ÷ 4 − 180° | NOAA, as above ("true solar time") |
| Height and bearing | sin h = sin L sin d + cos L cos d cos LHA; bearing by the time-azimuth formula, written with atan2 | N. Bowditch, *The American Practical Navigator* (NGA Pub. 9, 2019), vol. 1, appendix B, art. B5, read 17 November 2026 |
| Refraction | NOAA's piecewise model (58.1/tan h − 0.07/tan³ h + 0.000086/tan⁵ h seconds of arc above 5°; a polynomial from −0.575° to 5°; −20.774/tan h below) | NOAA, as above |
| Dip of a sea horizon | 1.76′ √(height of eye in metres) | Bowditch, as above, art. B3 |
| Sidereal time | GMST = 18.697375 + 24.065709824279 D hours, D in days of UT from 2000 January 1 12h | [USNO, Computing Approximate Sidereal Time](https://aa.usno.navy.mil/faq/GAST), read 17 November 2026, given there as good to about 0.1 s |
| Star places (Polaris, Dubhe, Kochab) | Apparent right ascension and declination for 1 January 2026 and 2046, on a straight line between | Derived from the hour angles of the US Naval Observatory's [celestial navigation data](https://aa.usno.navy.mil/data/celnav), read 17 November 2026. Merak is not one of its stars, so the calculator uses Dubhe as the pointer; the instrument is laid along both |
| Horizontal sundial hour lines | tan θ = sin φ × tan(15° × hours from noon); the gnomon at the latitude | [North American Sundial Society, Sundial Math](https://sundials.org/education/sundial-math), read 17 November 2026; held to the table in K. Gibbs, [schoolphysics, Making a horizontal sundial](https://www.schoolphysics.co.uk/age14-16/Astronomy/text/Sundial_/index.html) |
| Clock time from sundial time | clock = sundial − equation of time + (zone offset − 4 min × longitude east) | The same in words as the [British Sundial Society, Setting up a sundial](https://sundialsoc.org.uk/all-about-sundials/setting-up-a-sundial/), and NASS's "Civil = Sundial + EoT + dLon" (whose EoT has the opposite sign), both read 17 November 2026 |
| True north from the shortest shadow | The line from the stick's foot to the nearest point of the shadow's path | Yohkoh Public Outreach Project (Montana State University), [Finding Geographic North](https://solar.physics.montana.edu/ypop/Classroom/Lessons/Sundials/north.html), read 17 November 2026 (the university is inferred from the address; the page names none) |
| The nocturnal: its use, 15 minutes, 40° to 60° north | Set the tooth to the date, sight Polaris through the centre, lay the arm along the pointers, read the hour | L. Devoy, Royal Museums Greenwich, [What is a nocturnal?](https://www.rmg.co.uk/stories/blog/astronomy/what-nocturnal) (30 October 2023), read 17 November 2026 |
| The equatorial (card and pencil) dial | Card parallel to the equator, pencil along the Earth's axis, hours 15° apart | Outpost's own description from the geometry. NASS mentions the equatorial dial only as a simplified armillary sphere; no step-by-step source was read |

The southern hemisphere has no pole star. No method of telling the time from the
Southern Cross was found in a source that could be checked, so the screen says the star
clock does not cover the south rather than give one.

## Accuracy achieved

Every figure below is measured by the tests in `apps/web/src/features/maps/lib/` and
`apps/web/src/features/solar-clock/`, against values published by others and read on 17
November 2026.

| What | Against | Largest difference found |
| --- | --- | --- |
| The sun's height | USNO celestial navigation, computed altitude Hc, 9 cases from 54.8° S to 89.9° N | 0.007° |
| The sun's bearing | USNO, Zn, the same 9 cases | 0.012° |
| The sun's declination | USNO, the same 9 cases | 0.002° |
| The equation of time | USNO, from the sun's Greenwich hour angle, the same 9 cases | 3.1 seconds |
| Solar noon, sunrise, sunset | USNO one-day data, to the minute (`sun.test.ts`, 16 November, and 17 November 2026 at Greenwich: transit 11:45, rise 07:21, set 16:08) | 32 seconds (existing tests); 11:44:56, 07:21:12, 16:08:06 here |
| Greenwich mean sidereal time | USNO sidereal time, 17 November 2026 10:00 UT1 (13:45:54.8849) | 0.006 seconds |
| Polaris, Dubhe and Kochab, height and bearing | USNO celnav, 1 January 2036 (between the two years the places come from; the 2026 check reproduces its own input) | 0.005° |
| The star clock | The time given back from the angle of Dubhe from Polaris worked out from USNO's published places alone (1 January 2026, 00:00 UT, Greenwich) | 0.3 seconds |
| Hour lines | schoolphysics's table, latitudes 50° to 55°, 1 to 6 hours | 0.06°: five figures are printed cut short rather than rounded (23.859° as 23.8) |
| The printed nocturnal, which takes Polaris to be at the pole | The calculator, every 1st and 15th of 2026, 6 pm to 6 am | 6.4 minutes at 30° N, 7.0 at 40°, 8.0 at 51.5°, 9.2 at 60°, 11.7 at 70° |

Range of validity: NOAA gives its sunrise and sunset as good to a minute between 72°
north and south and to ten minutes beyond. The arithmetic holds at every latitude: the
poles themselves are taken 0.01° short, where the bearing is still defined; inside the
polar circles the polar night and the midnight sun are said in words (no noon shadow, no
sunrise to time), never left as a blank or a NaN; on the equator the horizontal dial is
refused (every hour line is the noon line) and the card dial offered. The star places
are for 2026 to 2046; outside those years they are extrapolated and drift slowly.

## The templates

Both are PDFs written by the map's PDF writer (`features/maps/print/pdf.ts`) on A4,
drawn inside the part US Letter also holds, each with a 100 mm bar to check the printer
did not scale it, and offered through the shared **Save as PDF**, **Add to library** and
**Share** (`features/library/made/`). Each is dated 1 January of its year, so the same
template made twice is the same file.

- **Sundial** (`templates.ts`, `sundialPdf`): page 1 the dial plate, every hour and half
  hour from the earliest sunrise to the latest sunset (at most 4 am to 8 pm), the centre
  mark and the gnomon's slot, "true north (south) this way"; page 2 the gnomon to cut out
  with a fold-under tab, the set-up steps and the correction table for the place and
  its clock. Not offered within 1° of the equator.
- **Nocturnal** (`nocturnalPdf`): page 1 the date disc and handle, a tick for every day
  of the year placed for the place's longitude and its clock's standard offset; page 2
  the hour disc with teeth for the Plough and Kochab, the arm, and how to use it. Not
  offered south of the equator.

## Where the code is

- `apps/web/src/features/maps/lib/sun.ts`: `sunAt` (height, bearing, hour angle at an
  instant), `apparentSolarHours`, `refraction`, `geometricFromApparent`,
  `altitudeCrossing` (taken out of `sunDay`, which now uses it). Tests: `sun-at.test.ts`.
- `apps/web/src/features/maps/lib/sky.ts`: sidereal time, the three stars, the angle of
  a star from Polaris. Tests: `sky.test.ts`.
- `apps/web/src/features/solar-clock/`: `recovery.ts`, `sundial.ts`, `nocturnal.ts`,
  `templates.ts` and `zone.ts` (pure, each with tests), and the screen.

## Not tested

- **Nobody has gone outside with a stick.** Every method is tested by running the
  arithmetic backwards from a known instant; none against a real shadow, a real compass
  or a real sunrise. The marking errors offered as defaults (5 mm with a 1 m stick, 2°
  on a compass) are Outpost's guesses at careful work, said as such on the screen.
- The templates were looked at as rendered PDFs, not printed, cut out or used. A real
  nocturnal has not been made from one, and the sundial's gnomon thickness is left out.
- Screens were looked at in headless Chromium at 390 px and 1,360 px, light and dark;
  not on a real phone.
