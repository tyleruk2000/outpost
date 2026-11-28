# Sun, grey line, line of sight and radio range

The map's tools for the sky and the radio: sunrise and sunset anywhere, day and night over the map, whether two points can see each other, and how far a radio might reach. Part of the map guide, which starts at [Offline maps](maps.md).

## Sunrise and sunset

Worked out on your device; nothing is looked up. The **Sun** tab gives the day for the
centre of the map; on a phone today's sunrise and sunset are also under the readout. A
saved place, a found point, **Sun times here** and where you are each have a **Sun** line too.

| Row | What it is |
| --- | --- |
| First light, last light | Civil twilight: enough light to see by in clear weather. |
| Sunrise, sunset | The sun's upper edge on the horizon. |
| Solar noon | The sun at its highest, and how high. |
| Rises towards, sets towards | True bearing of sunrise and sunset. |
| Day length | And the change from the day before. |
| Nautical twilight | The sun less than 12° below the horizon. |
| Moon | Phase and percentage lit. |

Step a day with the arrows or pick a date. Days with no sunrise or sunset are said in words
("Does not set on this date (midnight sun)").

### Sun times on paper

**A PDF of sun times, day by day** makes a sheet for two weeks, a month or a year: **Save as
PDF**, **Add to library** or **Share**.

### Time zones

Offline, Outpost does not know a point's time zone. Times are on this device's clock, with
the zone named, or in **UTC**. Far from home, a line warns that local clocks probably read
differently; one zone over gets no warning, so check the zone named. The 12- or 24-hour
clock is under **Settings → Appearance → Clock**.

### How accurate it is

Within a minute or so between 72° N and S, a few minutes near the edges of the midnight sun.
**The horizon is taken as flat and at sea level: hills make the real sunrise later and
sunset earlier**, by many minutes in a valley. Moonrise and moonset are not given.

## The grey line: day and night

**Grey line (day and night)** shades where it is night and hatches it with fine diagonal
lines, so that night reads in either theme and in greyscale. The shade deepens through civil, nautical
and astronomical twilight, for now or a time you choose. Radio amateurs call the twilight
band along its edge the grey line: HF signals along it often travel well at dawn and dusk.
The legend gives the time it is drawn for; its clock button chooses another, and **Back to
now** returns. It shares its date with the Sun tab. It is good to about 2 km; the real edge
of daylight is softer. It is also on Radio → HF coverage
([radio.md](radio.md#radio-tools-on-the-map)).

## Line of sight

**This checks geometry against terrain. It does not predict signal strength or coverage.**

1. Press **Line of sight between two points** and press the map at A and B (a saved place
   puts the end exactly on it). Or use the ruler's **Check line of sight**, or a repeater's.
2. Give each aerial's height above the ground (**Handhelds, 1.5 m** or **Masts, 10 m** sets both at once) and the band or frequency.
3. Read the answer. **Swap A and B** turns it round; Escape puts the tool down.

### What it shows

Distance, bearings both ways, each end's locator, and the answer:

| Answer | Meaning |
| --- | --- |
| Clear | No ground in the way, and at least 60% of the first Fresnel zone clear. |
| In sight, with the Fresnel zone partly blocked | No ground in the way, but less than 60% clear somewhere. |
| Blocked | Ground above the line: how far, and where. |
| Not known | Terrain is missing for part of the path. |
| No terrain here | None installed along the path. |

The side view shows the ground, the ray and the Fresnel zone; move along it for the figures
at each point. If the ends cannot see each other, **Find high ground in sight of both**
shades the ground in sight of both and lists up to eight high and eight near places for a
relay (ends up to 200 km apart).

### The sums

The Earth's curve uses an effective radius of 4/3 × 6,371 km, the standard atmosphere radio
planning assumes; on a given day the air bends signals more or less. 60% of the first
Fresnel zone should be clear. The ray runs from aerial top to aerial top.

### Limits

- **Terrain only**: no buildings, trees or masts. A wood or a row of houses can block a path
  this calls clear.
- Narrow ridges read low, and anything narrower than a terrain cell is missing.
- **A blocked path may still work and a clear one may not**: diffraction, reflection and
  weather are not modelled.
- Where terrain is missing, no verdict is given.

## Estimated radio range from a point

Press and hold the map and choose **Estimated radio range from here**: the ground in line of
sight of a radio there, shaded green with a green edge round each patch, a dashed magenta
circle at the typical range, grey rings at 10, 25, 50 and 100 km out to the first beyond
the furthest ground in sight, and the card's typical and furthest distances. The card is two
lines, the answer in a few words, so the map stays clear; **Show the details** opens it out.
Set your aerial's height and the other station's (handheld, car, roof)
under **Heights and details**. **Why this shape: look along one direction** shows the
ground along any bearing. It counts only line of sight: power, aerials, woods and buildings
are not counted, and radio often reaches less.

A new point takes longer than another height at the same one, since the ground is read out to
100 km (about 0.6 s on a laptop; not yet timed on a Raspberry Pi).
A bar on the card fills as it goes, and the ground in sight is drawn out to 25 km first, then
50 km, then all of it. Other heights at the same point come back at once. While they are
worked out, the last answer stays on the map, faded. Heights are asked for once you stop
changing them. It works the same way as a repeater's
[estimated range](radio.md#the-estimated-range). In the **Night (red)** map style the
shading, its edge and the circles are drawn in reds, the typical-range circle the brightest.

## Repeaters on the map

**Repeaters** draws the repeaters you hold ([radio.md](radio.md#repeaters)); Outpost has none
until you add them. Each is drawn by the shape of its band (a circle for 2 m, a square for
70 cm, a triangle for 6 m and 10 m, a diamond for 23 cm and up; hollow if listed as not
operational), with its callsign and frequency as you zoom in; many are counted in discs.
Press one for its card: frequencies, access, distance and bearing from where you are (when
followed) or else from Home,
**Check line of sight** and **Estimated range** (up to eight at once). Repeaters with no
position are not drawn.
