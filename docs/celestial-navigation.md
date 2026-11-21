# Celestial navigation

**Tools → Celestial navigation** works out where you are from sextant sights of the Sun, the
Moon, the planets and the 57 navigational stars, with no GPS, no printed almanac, no sight
reduction tables and no internet. The almanac is worked out on the device for the second of
each sight.

**It is for learning, and as a fallback.** It is not for navigating a vessel: use proper
charts, a published almanac and the means of navigation the law and good seamanship
require. Never look at the Sun through a sextant without its shades.

## The position worked from

Every sight is worked from a position: your best estimate of where you are (dead
reckoning), a saved place, or Home. It need not be close; a few tens of miles out is fine,
because the fix is worked again from the answer until it settles.

## Sights and fix

1. **Stars to shoot now** lists up to three navigational stars well placed from that position:
   between 15° and 70° up, bright, and spread round the sky so that their lines cross well.
   Star sights need the stars and the horizon together, in the twilight after sunset or
   before dawn.
2. **For each sight**, give:
   - the body (and for the Sun or Moon, which limb you brought to the horizon);
   - the date and time in **UT**, to the second;
   - the sextant altitude, as degrees and minutes (`34 12.5`) or decimal degrees;
   - the index error in minutes: **+ if the sextant reads high** (on the arc), − if low;
   - the horizon: the sea; an artificial horizon (a dish of water or oil, which doubles the
     angle); or a plumb line on a quadrant;
   - for the sea horizon, your height of eye in metres.
3. Each sight shows its corrections step by step, so the arithmetic can be checked by hand:
   index error, dip (1.76′ × √height of eye), refraction, semi-diameter and parallax, to the
   observed altitude. Then the almanac (GHA and declination), the local hour angle, the
   computed altitude and azimuth from the position worked from, and the intercept in nautical
   miles, towards the body or away.
4. **The fix.** One sight gives a line of position: you are somewhere on it. Two or more that
   cross give a fix, with how far it could be out: the ellipse it lies in nineteen times in
   twenty if each sight is as good as allowed for (a minute of arc with a sextant, thirty with
   a plumb line). If the lines cross at a narrow angle, or one sight is well off the others,
   the screen says so.
5. **Running fix.** If you moved between sights, give the course and speed made good. Each
   earlier sight is worked from where you were when you took it, and the fix is for the time
   of the last sight. Two Sun sights a few hours apart make a running fix by day.

The fix is drawn on a plotting sheet on the screen, north up, which needs no map. **Show on
the map** opens the offline map with the lines, the fix and its ellipse; close the card on the
map to hide them.

The sights are kept on this device as typed, for when the page is opened again.

## Noon and Polaris

- **Latitude from the Sun at noon.** Follow the Sun's lower limb up until it stops rising and
  read the highest altitude. Give its time, whether the Sun bore south or north, the index
  error and height of eye. Latitude is the declination plus or minus 90° less the observed
  altitude. The longitude from the time of noon is shown too, but the top of the climb is
  flat, so a minute's doubt in its time is a quarter of a degree of longitude.
- **Latitude from Polaris.** In the northern hemisphere, Polaris's altitude is within about a
  degree of your latitude. Give the time and the altitude, and it is worked out exactly.

## Without a sextant

A protractor or a home-made quadrant with a plumb line measures the altitude from the
vertical, so there is no horizon to find and no dip. Enter such a sight with the plumb line
horizon. A minute of arc is a nautical mile, so a quadrant read to half a degree puts a line
anywhere within about 30 miles; a whole degree, 60. Never sight the Sun along it: let its
light through a pinhole on to the card.

## The clock

Four seconds of clock error is a minute of longitude: a nautical mile at the equator, less
towards the poles. Set your watch by a radio time signal (**Radio → Frequencies**, time
signals) and check the server's clock on **Settings → Server status**.

## The sight form

**Save** gives a printable form with every step in order for three sights, the formulas, and a
worked example: a Sun sight on 21 June 2026, worked from a position 15 miles off, whose line
passes within a tenth of a mile of where the observer really was. The same example is on the
screen.

## How accurate the almanac is

Held to the US Naval Observatory's celestial navigation data at five moments between 2026 and
2035, the Greenwich hour angle and declination worked out here are within:

| | Minutes of arc (nautical miles) |
| --- | --- |
| Navigational stars, and Aries | 0.5 |
| Sun | 0.5 |
| Moon | 2 |
| Venus, Mars, Jupiter, Saturn | 2 |

Star and Sun sights are the ones to trust; the Moon and planets can add a mile or two.
Sights reduced from the Observatory's own computed altitudes come back to the place they were
computed for within half a mile, north and south of the equator.

Left out: the Moon's augmentation (a few tenths of a minute), the air's temperature and
pressure in refraction (refraction is for average air, most uncertain below about 10°), and
any error of the clock.

## Sources

- N. Bowditch, *The American Practical Navigator* (NGA Pub. 9, 2019), appendix B: dip, and
  sight reduction by calculator.
- NOAA Global Monitoring Laboratory, *Solar Calculation Details*: refraction.
- P. Schlyter, *How to compute planetary positions*: the Sun, Moon and planets, parallax and
  semi-diameter.
- G. H. Kaplan, USNO Circular 179 (2005): precession and nutation.
- D. Hoffleit and W. H. Warren Jr, *The Bright Star Catalogue*, 5th revised edition.
- US Naval Observatory: approximate sidereal time; ΔT; and the almanac the tests are held to.

Each is listed with the date it was read in [sources.md](sources.md#the-night-sky-and-celestial-navigation).
