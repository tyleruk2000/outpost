# Tools: Compass

**Tools → Compass** (`/tools/compass`) says, for a place, where magnetic north and the
map's grid north lie from true north, and so what a person with a paper map and a
compass adds or subtracts going from one to the other. It also shows the phone's own
compass, corrected by those figures, and converts a bearing between the three norths.
Everything is worked out on the device, with no internet and nothing stored on the
server.

## What the screen gives

- **Place.** The home place (the saved place with the home icon) unless another is
  chosen: a saved place, the middle of the map as Maps last left it, where the device is
  (a secure page only; at a plain http address it says so), or a position, grid
  reference or locator typed in. The same chooser as the repeater list, remembered in this
  browser as a preference (`outpost.compass.from`). The map's centre card opens the screen
  with `?lat=&lon=` for the middle of the map.
- **North here.** In Great Britain, first the rule for an Ordnance Survey map, both ways,
  worked out for that place and today's date, for example at Scafell Pike in November 2026:

  > Map to compass: subtract 1°
  > Compass to map: add 1°
  >
  > Magnetic north is 0.1° west of true north here, in November 2026, moving about 0.2°
  > east a year. Grid north is 1.0° west of true north here. Magnetic north is 0.9° east of
  > grid north here.

  Outside Great Britain there is no grid: the rule is for a map drawn to true north, from
  the declination alone. **Copy** and **Save as a page** keep the answer.
  Under it, the three norths drawn as a map's margin draws them; the angles between them
  are drawn a stated whole number of times their size (10 in most of Britain) so that
  they can be seen, and the figures written on the drawing are the real ones.
- **Live compass** (see below).
- **Convert a bearing**: a bearing from one north, from each of the others, to the whole
  degree, with a drawing of map to compass: the way off the map from the map's north, and
  the same way from magnetic north as the compass reads it (`norths-plates.tsx`, drawn
  from the same `northsAt` and `convertBearing` as the words).

Some figures it gives on 17 November 2026 (declination, convergence and grid magnetic
angle, degrees east; then the rule from map to compass):

| Place | Declination | Grid north | Magnetic from grid | Map to compass |
| --- | --- | --- | --- | --- |
| Scafell Pike | −0.12 | −0.99 | +0.86 | subtract 1° |
| Ben Nevis | −1.14 | −2.51 | +1.37 | subtract 1° |
| Snowdon | −0.28 | −1.66 | +1.38 | subtract 1° |
| Norwich | +1.62 | +2.62 | −1.00 | add 1° |
| Lerwick | +0.08 | +0.74 | −0.66 | add 1° |
| Land's End | −0.52 | −2.85 | +2.33 | subtract 2° |

## The model

The **World Magnetic Model 2025** (WMM2025), made by NOAA's National Centers for
Environmental Information and the British Geological Survey, is for **2025.0 to 2030.0**
(NOAA: "the current model expires on December 31, 2029"). It is public domain; its
coefficient file `WMM.COF` is kept unchanged in `packages/shared/src/wmm-coefficients.ts`,
with the model's name, epoch, years, source and the notice 17 U.S.C. 403 asks for in its
header. How it was fetched and the terms quoted: [sources.md](sources.md#the-world-magnetic-model-and-the-compass).

`packages/shared/src/wmm.ts` follows section 1.2 of the technical report (Chulliat et al.
2025, https://doi.org/10.25923/prbc-s316):

1. Geodetic latitude φ and height h on WGS 84 to geocentric latitude φ′ and radius r:
   Rc = A / √(1 − e² sin² φ), p = (Rc + h) cos φ, z = (Rc(1 − e²) + h) sin φ,
   r = √(p² + z²), φ′ = asin(z / r).
2. The Gauss coefficients for the date: g(t) = g + (t − 2025.0) ġ, and the same for h.
3. The field in geocentric components from Schmidt semi-normalised associated Legendre
   functions of sin φ′ to degree and order 12, with a = 6,371,200 m:
   X′ = −Σ (a/r)ⁿ⁺² (g cos mλ + h sin mλ) dPₙᵐ/dφ′;
   Y′ = (1/cos φ′) Σ (a/r)ⁿ⁺² m (g sin mλ − h cos mλ) Pₙᵐ;
   Z′ = −Σ (n + 1)(a/r)ⁿ⁺² (g cos mλ + h sin mλ) Pₙᵐ; and the same with ġ, ḣ for the
   yearly changes.
4. Rotated into the ellipsoid's frame: X = X′ cos(φ′ − φ) − Z′ sin(φ′ − φ), Y = Y′,
   Z = X′ sin(φ′ − φ) + Z′ cos(φ′ − φ).
5. H = √(X² + Y²), F = √(H² + Z²), D = atan2(Y, X), I = atan2(Z, H), and their yearly
   changes (Ḋ = (X Ẏ − Y Ẋ) / H² and so on).

It also gives the inclination and the field's strength (they cost nothing more), NOAA's
blackout zone (H under 2,000 nT) and caution zone (under 6,000 nT) round the magnetic
poles (report section 1.8), each said on the screen, and the report's error model for the
declination, δD = √(0.26² + (5417 / H)²) degrees (section 3.4; the equation itself is an
image in the PDF, and is taken from the text round it, which gives both constants and
checks them: 0.29° where H = 41,875 nT). In Britain that is about ±0.4°.

**Outside its years** the model still answers, by carrying its straight lines on, and the
screen says, above the answer, how long the date is past the end (or before the start)
and that the figures can then be out by a degree or more. It never does so silently. A
new model is due from NOAA in December 2029: put its `WMM.COF` in with
`node scripts/write-wmm-coefficients.mjs path/to/WMM.COF`, and its test values beside the
present ones.

## Grid north and the rule

Grid north on the Ordnance Survey **National Grid** differs from true north by the grid
convergence: nothing on its central meridian, 2° W, and about Δλ · sin φ elsewhere (some
2.9° at Land's End). It is worked from the grid's own projection, the one the map's grid
references already use (`toOsGrid` in `packages/shared/src/maps.ts`, after the Ordnance
Survey's "A guide to coordinate systems in Great Britain", annex C): the direction a
meridian runs on the grid, from two points 11 m either side of the place
(`convergenceOf` in `packages/shared/src/compass.ts`). That takes in the ellipsoid and
the WGS 84 to OSGB36 shift exactly as the map does.

Then, with east as plus:

- grid magnetic angle = declination − convergence;
- bearing on the compass = bearing on the map − grid magnetic angle.

So where magnetic north lies **east** of grid north, a bearing taken off the map has the
angle **subtracted** to set on the compass, and a bearing read off the compass has it
**added** to draw on the map; where it lies west, the other way round. The rule is worked
out for the place and date, not recited. It is rounded to **whole degrees**, which is
what a hand compass is set and read to (a baseplate compass is commonly marked every 2°); the
figures under it are given to a tenth. Where the angle rounds to nothing, the screen says
to use a bearing as it is.

The grid is Great Britain's only. Maps of Ireland and Northern Ireland use the Irish
Grid, which is not worked out: the screen says so under How this is worked out. Outside
the National Grid's area only true and magnetic north are given.

## The live compass

Where the device has a compass, the **Live compass** card shows the heading of the top of
the phone in degrees and as one of sixteen points, from magnetic north as the phone reads
it, or corrected to true north (+ declination) or grid north (− convergence), and says
which north it is showing. A small dial turns with it.

- It asks for nothing until **Start the compass** is pressed. On an iPhone that press asks
  Safari's permission (`DeviceOrientationEvent.requestPermission()`), which Safari allows
  only from a press and only on a secure page; the heading is Safari's
  `webkitCompassHeading`, with its stated accuracy. On Android the heading is worked from
  the `deviceorientationabsolute` angles (W3C Device Orientation, rotation Z–X′–Y″): the
  direction of the top edge while the phone is flatter than upright, and of its back while
  it is held up.
- It listens only while the card is on and the page is in view: hiding the page, Stop, or
  leaving the screen removes every listener. The figure is redrawn only when the whole
  degree it shows changes.
- **At a plain http address** browsers give no orientation at all. The card says a live
  compass needs HTTPS and a phone, links Settings, "HTTPS on your network", and offers no
  Start button; the rest of the screen works. **On a computer** (or any device with no
  compass) a press waits three seconds for a heading and then says the device gives none.
  A refusal is said, with how to allow it again.
- The card says that a phone's compass is easily thrown by metal, magnets and cars, how to
  settle it, and how to check it against the sun with the Solar clock's bearing of the sun.

`apps/web/src/lib/insecure-page.test.ts` fails if orientation events are listened for, or
permission asked, in a file that does not first check `isSecureContext`.

## The map's centre card

Under the coordinates of the centre, beside today's sunrise and sunset, one line gives
magnetic north there to a tenth of a degree ("Magnetic 0.3° W"). It is worked out when
the map comes to rest, not while it moves, and opens this screen for that point. On a
phone it is shown when the sun line is; on a wide screen always.

## Precision, and what is left out

- Against NOAA's figures, to the precision they are printed to (below). The model itself
  is good to about ±0.4° of declination in Britain.
- **Local magnetism** is not in the model: magnetic rocks (in some hills enough to move a
  needle by degrees), iron, cables and vehicles. Nor are the daily swing of the field and
  magnetic storms.
- Height above the ellipsoid is taken as nought: a kilometre changes the declination in
  Britain by about a hundredth of a degree.
- Exactly at a geographic pole the model has no east; a millionth of a degree from it is
  used.

## Tests

- `apps/server/test/wmm.test.ts`: every row of NOAA's 12 published test values
  (`WMM2025_TEST_VALUES.txt`, the same as the report's Table 6), all fourteen elements,
  to half a unit of the printed figure (0.1 nT, 0.1 nT a year, 0.01°); every row of the
  100 test values in the coefficient package, to 0.002 nT and 0.01°; the report's worked
  example (Table 3b) step by step to 1e-6 nT and 1e-9 rad; the years, blackout and caution
  zones and the error model.
- `apps/server/test/compass-norths.test.ts`: no Ordnance Survey publication that could be
  read gives worked figures for grid convergence. The method is checked against NOAA's
  UTM example (report Table 3d: −2.9545046801° and +2.9545046801° at 80° S, 120° W in
  zones 10 and 11) on a Transverse Mercator built from the OS guide's own formulae, which
  are themselves checked against the guide's worked example; the National Grid against
  being nothing on 2° W, equal and opposite either side, and the textbook series
  Δλ sin φ (1 + Δλ² cos² φ (1 + 3η²)/3) at six places, to 0.005°. The rule's sign in each
  of the four combinations of east and west, and against converting a bearing.
- `apps/web/src/features/compass/compass-page.test.tsx`: the screen's states (home place,
  none, a typed grid reference, a place handed in, outside Britain, out of date), the live
  compass's (not a secure page, no sensor, a heading, hidden, stopped, refused), the
  converter and the centre card's line.
- `e2e/tests/compass.mobile.spec.ts` on an emulated Pixel 7, and the compass in
  `e2e/tests/not-secure.spec.ts`.

## Not tested

**The live compass has not been tried on a real phone.** The tests feed it events of the
shape iOS and Android are documented to give; whether a given phone's browser fires them,
and whether its heading is magnetic (as assumed for both) or already corrected to true
north, has not been seen. Nor has the landscape correction (the screen's turn is added to
the heading of the top edge).

## Cost

Measured with `e2e/tools/idle-cost.mjs` at 390 × 844 on 17 November 2026: the screen at
rest uses 0% of the page's processor, no frames, timers or requests; hidden, the same as
the Solar clock beside it (the app's own timers, 20 a minute). With the live compass on
and no sensor it adds nothing; fed 60 readings a second turning 18° a second, the page
used 2.2% of a core (0.9% script), redrawing about 19 times a second, once per whole
degree.
