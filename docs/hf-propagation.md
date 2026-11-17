# HF propagation

Outpost can predict how well a shortwave (HF, 2 to 30 MHz) signal gets from one place
to another: hour by hour through a day, band by band, for the power, antennas and mode
you have. It works on the computer Outpost runs on, with no connection, and goes on
working for as long as you like without one, once one set of data (559 kB) has been
fetched: VOACAP's ionospheric and noise maps, which Outpost does not ship. Until then
the planner says so in one line, with a **Download** button. See [Data](#data).

It is in **Radio**, then **HF propagation**. On a phone it is in the **More** sheet.
Three more screens are built on the same engine, each listed under **Radio** and in the
**More** sheet:

- **HF coverage**: where one transmitter is predicted to be heard, as a layer over the
  offline map. See [Coverage maps](#coverage-maps).
- **Communication plans**: several stations, and which band serves each pair at which
  hour. See [Communication plans](#communication-plans).
- **Contact log**: what actually happened on the air, typed in or read from an ADIF
  file, set beside what the engine predicted. See [The contact log](#the-contact-log).

Read [What it is not](#what-it-is-not) before relying on it.

## What it is not

- **Not today's conditions.** Every prediction is a *monthly median*: what a month like
  the one asked about usually does, from maps of the ionosphere built from decades of
  soundings. A geomagnetic storm, a flare or sporadic E can make any one day quite
  different. Nothing in Outpost measures the ionosphere, and nothing on the screen is
  called live or current.
- **Not a promise of a contact.** "Reliability" is the share of the month's days on
  which the signal-to-noise ratio is predicted to reach what a mode needs. Whether a
  contact is made also depends on interference, the operators and the equipment.
- **Not Outpost's own model.** Outpost contains no propagation physics. It runs VOACAP
  and shows what VOACAP returns, and, if you set it up, the ITU's P.533 beside it for
  comparison ([A second model](#a-second-model-itu-p533)). If an engine or its data is
  missing or damaged, it says so and predicts nothing.
- **Not permission to transmit.** Which frequencies you may use is set by your licence.
  The band sheets in the library give the limits ([radio.md](radio.md)).

## Making a prediction

1. **Where.** Give the transmitter and the receiver as coordinates (`51.5074, -0.1278`),
   a British grid reference or a Maidenhead locator (`IO91WM`), choose a saved place, or
   press **Choose on the map**. Saved places are the markers you keep on the map; there
   is no second list. See [Choosing a place on the map](#choosing-a-place-on-the-map).
   A transmitter not yet given starts at the home place (the saved place with the home
   icon), here and on HF coverage; one typed or kept from last time is left as it is.
2. **Date.** Any day. The model works by month, so every day of a month gets the same
   answer. The planner opens on today's date (UTC). The rest of the form is remembered
   in the browser from one visit to the next; a date you chose is remembered only until
   the end of that day, so the planner never opens on a date from weeks ago.
3. **With what.** Transmitter power, an antenna at each end, a band or a frequency, and
   a mode. A radio profile fills in the power.
4. **Noise where the receiver is.** Urban, residential, rural or remote. These are
   VOACAP's four man-made noise settings (-140.4, -144.7, -150.0 and -164.1 dBW in 1 Hz
   at 3 MHz, from the program's own source; the first three are the curves of
   Recommendation ITU-R P.372). Atmospheric and galactic noise come from the engine's
   maps. Real noise in a town is often well above the setting.
5. **The Sun.** See [Where the sunspot number comes from](#where-the-sunspot-number-comes-from).
6. **The reply** (optional). Give the other station's power and the noise at the
   transmitter's end, and the way back is predicted too.

Press **Predict**. The first time, **Try London to Birmingham on 40 m** fills the form
in and runs it.

### Saved predictions

**Save this prediction** keeps the question under a name. **Open** asks that question
again, with whatever data is installed then, and a notice above the answer names the
saved prediction and the date it is for, which is the date it was saved with and not
today's.

An antenna is shown as the generic antenna or the profile that is exactly the antenna
that was saved. If the profile has been changed or deleted since, the antenna is listed
as **As saved** and is run as it was saved; another antenna is never put in its place.
If the form cannot ask exactly what was saved, nothing is predicted and the screen says
what would not be the same.

### A prediction on paper

Under the form, once there is an answer, **This prediction on paper** offers the
prediction as a PDF to print and carry, with the three things every PDF made in Outpost
offers: **Save as PDF**, **Add to library** and, where the device can, **Share**
([library.md](library.md) says what each does and where the file goes). **Export as
Markdown** writes the same content as text. It is there for any prediction on screen,
whether just asked or a saved one opened again.

The PDF is two pages of A4 or US Letter. The paper is the choice the paper aids on the
Encryption screen use: one setting in the browser, starting from US Letter on a device
set to a country that prints on it and A4 everywhere else. Black on white, text and
figures only: every value is a printed figure, and nothing is carried by colour.

What is on it, in order:

- **The path and the date**, the mode and what it is taken to need, and that the model
  works by month.
- **The sunspot number and where it came from**: the same sentence the screen gives
  above the answer, the table's own range for the month, the number the engine ran at,
  and that it is not a reading of the ionosphere on the day.
- **Both stations as the engine ran them**: place, position, locator, power, noise, and
  for each antenna the engine's own sentence, which says when an antenna was
  approximated. The reply's power and noise, or that the reply was not asked for.
- **The best of it**, by the rules the screen uses: the hour at which the frequency
  does best, what the reply allows at that hour, the hours at which it reaches half the
  days, and the three best bands at that hour.
- **The frequency asked about, hour by hour**: reliability, the reply's reliability,
  the median signal-to-noise ratio with the worst and best tenth of days, signal in dBm
  and as an S-meter reading, MUF, FOT, the path and the take-off angle.
- **Every band, hour by hour**: reliability in per cent, nine bands by twenty-four
  hours. For a mode with no requirement there is no reliability, and the table gives the
  median signal-to-noise ratio instead and says so.
- **Before relying on it**: every caveat the screen lists.
- **Where the figures come from**: the engine and its checksum, the data versions, when
  the engine answered, and the answer's key.

It is built from the answer's own words and figures, and reads the answer loosely so
that it stays true as the engine's answer grows
(`apps/web/src/features/propagation/prediction-document.ts`): whatever is said under
`antennas` is printed, whatever its keys; any other sentence the answer carries that
the page has no place for (at the top level, or on a cell of the band table) is printed
under "More that came with the answer"; and **a cell with no figure is a dash, never a
nought**. A cell has no figure when the engine found no path at that hour, when the mode
has no requirement to measure against, or when the cell is missing or holds something
that is not a number. A nought on the page is the engine's own nought: a path was found
and the mode is predicted to get through on no day. The reply's figure is printed only
for an hour at which the outward direction has a path, because the answer does not say
whether the reply has one.

The file is dated by the moment the engine answered, so the same answer written out
twice is the same file, and the library says it already has it.

Characters the PDF's typeface cannot write (a place name outside Western European
letters) are printed as "?", and the screen says which; the Markdown export keeps them.

Under **the same path with one thing changed**, the comparison on screen has the same
buttons. Its PDF gives what was tried (each row, its sunspot number and its foF2 at
12:00 UTC) and, for every row, the reliability, the median signal-to-noise ratio and the
MUF hour by hour, with the caveats.

Not done: charts on the page (it is tables), the VOACAP listing, and the steep-path
working, which the screen shows for one chosen hour.

### Reading the answer

- **The notice at the top** says what kind of knowledge the answer rests on and how old
  it is.
- **A few sentences** state, for the chosen hour: first the reliability for the mode (on
  what share of days it is predicted to get through), then the path's MUF with what it
  means and on what share of days the frequency is below it, a better band if there is
  one, and the hours at which the frequency reaches half the days or more.
- **Frequency against time** is a grid: every whole megahertz from 2 to 30 against the
  24 hours (UTC), shaded by reliability, with the MUF drawn across it. Move over it, or
  give it focus and use the arrow keys, to read a cell; press or Enter to choose that
  hour. Every chart follows the chosen hour.
- **The figures for that hour**: reliability; the median signal-to-noise ratio in 1 Hz
  and in 2500 Hz, how far it falls on the worst tenth of days and rises on the best,
  and the margin over what the mode needs; signal power (with an S-meter reading by the
  convention S9 = -73 dBm) and field strength; noise; the path (hops and layer, take-off
  angle, virtual height); MUF, FOT, HPF and LUF; antenna gain at the take-off angle.
- **Charts through the day**: reliability, signal-to-noise ratio with its day-to-day
  spread and the level the mode needs, signal and noise power, and the modes side by
  side.
- **Bands**: each amateur band from 80 m to 10 m, ranked at the chosen hour and shown
  through the day. One frequency near the middle stands for each band; the edges are
  those of the United Kingdom licence. With an end-fed wire of a stated length each band
  is in one of three states: modelled (shaded as usual); approximate (shaded, framed
  with a dashed line and marked ≈, its bar striped); or not modelled (hatched, reading
  "Not modelled": no figure, which is not a poor figure). **The wire on each band**
  gives the wire's length in wavelengths and how it was run; see Equipment.
- **The steep path (NVIS)**: see below.
- **Where these figures come from**: the engine, the data and their versions, how each
  antenna was run, and **Show the page VOACAP prints**, the listing the original
  program gives for the same question.

A chart's numbers are also there as a table for a screen reader.

### Reliability and signal-to-noise ratio

VOACAP states every ratio in a 1 Hz bandwidth (dB-Hz). A mode's requirement is restated
that way: a ratio measured in *B* hertz, plus 10·log10(*B*).

- **MUF** is the frequency the path is open at on half the days of the month. **FOT**
  is open on nine days in ten, **HPF** on one in ten. "Below the MUF on 91% of days" is
  the engine's own figure (MUFday).
- **Reliability** is the share of days on which the ratio reaches the requirement. The
  engine works it out from the median ratio and how far the ratio falls on the worst
  tenth of days and rises on the best.
- **LUF** is the lowest whole megahertz at which the mode reaches 90% reliability at
  that hour. This is VOACAP's own definition (the first frequency of the run reaching
  the required reliability), applied to Outpost's sweep of 2 to 30 MHz.

### Modes

Each mode has a starting figure, which you can replace in the form. They are not on one
basis, and the planner says so.

| Mode | Figure | What it is | Read from |
| --- | --- | --- | --- |
| SSB voice | 45 dB in 1 Hz | VOACAP's planning figure for reasonable SSB reception | Jari Perkiömäki OH6BG, "Setting up input values for VOACAP", voacap.com |
| CW | 24 dB in 1 Hz | The same guide's figure for reasonable CW reception (it also offers 27) | as above |
| FT8 | -18.8 dB in 2500 Hz (15.2 dB in 1 Hz) | Half of transmissions decode, simulated mid-latitude moderate HF channel, no prior information. On a noise-only channel: -20.8 dB | Franke, Somerville and Taylor, "The FT4 and FT8 Communication Protocols", QEX July/August 2020, Table 6 |
| JS8Call, normal speed | -24 dB in 2500 Hz (10 dB in 1 Hz) | The sensitivity the guide states. It does not say on what channel or at what share of decodes. Slow -28, fast -20, JS8 40 -18 | JS8Call User Guide 4.0, 6 September 2026 |
| Another digital mode | none | No figure is assumed. Without one, signal-to-noise ratios are shown and no reliability | your own |

All four were read on 16 November 2026.

**Signal-to-noise needed, dB** and **In a bandwidth of, Hz** are each used whenever they are filled in. A
bandwidth typed on its own is applied to the mode's starting figure: CW with 500 in
**In a bandwidth of, Hz** and **Signal-to-noise needed, dB** left empty is asked as 24 dB in 500 Hz, which is
24 + 10·log10(500) = 51 dB in 1 Hz. The answer then lists the mode as your own
bandwidth with the published figure, because 24 dB in 500 Hz is not what the guide
states.

Hearing a station is not a contact. With **The reply** filled in, both directions are
predicted, and the planner says a contact can be expected on *no more than* the weaker
direction's share of days. It does not multiply the two: the same days tend to be bad
both ways.

### Steep paths (NVIS)

On a short path the signal goes nearly straight up and comes back down. Whether that
works is decided by the ionosphere overhead, not by the distance, so a path of 160 km
on 40 m is commonly shut at night. The planner keeps three things apart:

1. **Geometry.** With foF2 over the middle of the path (from the engine's map) and the
   height of reflection, a triangle over a curved Earth gives the take-off angle and
   the angle at which the ray meets the layer; the secant law then gives the highest
   frequency a layer with that foF2 returns on that path. This is a check with one
   number and a triangle. It ignores the Earth's magnetic field, the thickness of the
   layer and absorption. It is shown as geometry and is not the prediction.
2. **Signal against noise.** The engine's median ratio, with its loss figure and the
   antenna's gain at the take-off angle. Absorption in the D layer is inside the loss
   figure; the engine does not give it separately.
3. **Reliability.** The engine's share of days.

A chart beside them shows MUF, FOT and foF2 through the day against the frequency asked
about, and **the same path with one thing changed**: each month of the year, other
sunspot numbers (and so other foF2), other powers, each generic antenna, each kind of
noise.

A low horizontal antenna radiates upwards and suits these paths; a vertical does not.
That shows in the antenna gain at the take-off angle, which is the engine's.

## Choosing a place on the map

Wherever a position is asked for (the planner's transmitter and receiver, a coverage
map's transmitter, a plan's stations, the two ends of a logged contact), **Choose on
the map** opens the offline map: the same map, style and installed regions as the Maps
screen.

- Press the map and a pin is put there. The line under the map gives its coordinates
  and locator.
- Press one of your saved places and its position is taken, with its name.
- **Use the middle of the map** takes the centre of what is shown, for a keyboard: the
  arrow keys move the map and plus and minus zoom it.
- Nothing is chosen until **Use this place** is pressed. A place chosen this way is used
  where it was asked for and is not saved as a place; to keep one, save it on the Maps
  screen.

It works by touch. If the browser cannot draw the map (no WebGL 2), the screen says so
and positions can still be typed.

## Coverage maps

**Radio**, **HF coverage**. A coverage map answers "where can this transmitter be
heard?" by asking the engine the planner's question about every cell of a grid: the
transmitter fixed, a receiver at the centre of each cell in turn.

1. Say where the transmitter is, and with what: the date, a band or frequency, a mode,
   the power, the transmitting antenna, the antenna and the noise assumed at every
   receiver, and where the sunspot number comes from (the table, or a number of your
   own; a measured foF2 belongs to one path and is not taken here).
2. Move the map to the area you care about. **The grid is laid over whatever the map
   shows.** The line above the map says how many cells that is and how large each one
   is on the ground.
3. Choose a grid (coarse, medium or fine) and press **Work out coverage**. The work is a
   job: the screen counts the cells as they are done, **Stop** ends it, and it is also
   listed with the other work under Downloads.

### Reading it

- **What the map shows**: *Reliability*, *Signal to noise* or *Signal strength*, for any
  of the 24 hours (the engine gives the whole day for every cell, so changing the hour
  asks nothing new).
- **The legend says exactly what the number is**:
  - Reliability: the share of the days of the month on which the signal-to-noise ratio
    at the cell's centre is predicted to reach what the mode needs. The engine's own
    figure, in the planner's five classes (10, 30, 50, 70 and 90%).
  - Signal to noise: the median ratio in a 1 Hz bandwidth less what the mode needs, in
    10 dB classes from 20 dB short to 20 dB over. Zero is exactly enough on the median
    day.
  - Signal strength: the median signal power at the receiving antenna as an S-meter
    reading, by the convention S9 = -73 dBm and 6 dB to the unit.
- **Shades** are the five steps of one hue (the sequential ramp the planner's charts
  use), light to dark on the light map and dark to light on the dark one, so that
  "more" always stands further from the ground. A hairline in the page colour separates
  the cells. The cells are see-through enough for coasts, roads and names to show.
- **A cell below the lowest class is not shaded**, nor is an hour at which the engine
  found no path. The dashed line is the edge of the area that was worked out, so "no
  shade" inside it is told from "not asked" outside it.
- **A cell the engine did not answer is crossed through and never shaded**, and reading
  it gives the reason. The cell whose centre is the transmitter's own position is one:
  a path needs two different places.
- **The legend counts the cells in each class** at the hour shown, and states the grid:
  how many cells, their size in degrees and in kilometres.
- **Read a cell** by pressing it, or by typing a place: its position and locator, its
  distance and bearing from the transmitter, and its reliability, signal-to-noise ratio
  and signal at the hour shown. **Open this path in the planner** takes the same
  question there for the full account.

Nothing is smoothed, and nothing is filled in between cells. Every cell is one answer
from the engine for one place; a coverage map made of distance rings would give every
cell at one distance the same figure, and these differ (the server's tests check that
they do).

**The transmitting antenna's bearing.** A horizontal antenna with no bearing is turned
broadside to each cell in turn, which shows the best it can do in every direction and
not the pattern of one fixed wire. The map says so first among its limits. Give the
bearing (**Its broadside faces, degrees**) to see the pattern of the antenna as it
hangs.

### Saved coverage maps

**Save this map** keeps the map under a name, with its figures. A saved map opens with
the figures it was saved with (the screen says when they were worked out, with which
engine and data and at what sunspot number); it is not worked out again. Deleting it
from the list deletes nothing else.

### A coverage map on paper

Under the legend, **This map on paper** makes a PDF of the map as it is shown: what it
shades by and the hour chosen. **Make the PDF** draws the picture, which takes a moment
and a second, unseen map, so nothing is made until it is asked for; changing the hour or
what the map shows takes a file already made down. Then **Save as PDF**, **Add to
library** and **Share**, as for every PDF made here ([library.md](library.md)).

The page has:

- **The picture**: the light map with the cells in their five shades, the edge of the
  area and the transmitter, drawn at 150 dots to the inch by the same off-screen map as
  a printed map page.
- **The legend**, highest class first, each with its figure, its swatch as it looks
  over land, and the count of cells in it at that hour; then "no shade" for cells below
  the lowest class and for cells with no path, and "not answered" for cells the engine
  gave no answer for.
- **What the number is**, and **the size of the grid**: how many cells, their size in
  degrees and kilometres, and that each cell is one answer from the engine for a
  receiver at its centre, with nothing smoothed or filled in between.
- **The same grid in figures**: one character to a cell, north at the top, each row
  with its latitude. 1 to 5 are the classes of the legend, 0 is below the lowest, a
  dash is a cell with no path at that hour, and an x is a cell the engine did not
  answer. This is there because the picture carries its values by colour, which a grey
  printer and a search of the file both lose.
- **What the map rests on** and **before relying on it**: the basis, both antennas as
  run, the noise, every caveat, the engine and data versions and when it was worked out.

If the device cannot draw the picture, the PDF is made without it and says why; the
figures are all there. The shades on paper are the light theme's, whatever the screen
is set to. Not tried: an area that crosses the 180° meridian.

### How large, and how long

| Grid | Cells on the longer side | Britain and Ireland from London (14° by 10°) | On this machine |
| --- | --- | --- | --- |
| Coarse | 16 | 13 x 16 = 208 cells of about 70 km | 0.6 s |
| Medium | 32 | 26 x 32 = 832 cells of about 35 km | 2.2 s |
| Fine | 48 | 39 x 48 = 1,872 cells of about 23 km | 4.9 s |

Measured on 16 November 2026 on an Apple M2 Max through the coverage job of the
packaged app, while other work was running on the machine: 2.6 to 2.8 ms a cell. The
largest grid a request can ask for is 48 x 48 = 2,304 cells, about 6 s here. The linux/arm64
container on the same Mac ran a cell about a tenth slower in the first sitting's
measurements; a Raspberry Pi will be several times slower, and that has not been
measured. `node apps/server/src/cli/bench-propagation.ts` times all three grids on any
machine.

A request is bounded: one of the three grids (so at most 2,304 cells), an area at least
half a degree each way and no wider than the Earth, cell centres no nearer the poles
than 89°. One grid is worked out at a time; up to three may be waiting, and a fourth is
refused until one finishes. The same map asked for twice while it is being worked out
is one job. A job that is stopped keeps nothing; a server restarted part of the way
through a grid starts that grid again from the first cell.

### What a coverage map leaves out

- A cell is the answer for its centre. A coarse grid can miss a skip zone narrower than
  its cells: use a finer grid, or a smaller area, where that matters.
- Every cell assumes the same receiving antenna and the same noise.
- An area may cross the date line (the map can be moved across it). It may not reach
  the poles.
- The map is of one frequency. For another band, work out another map.

## Communication plans

**Radio**, **Communication plans**. A plan names several stations (home, a shelter, a
relative's house, a portable station, a rendezvous point) and says which band is
predicted to serve each pair of them at which hour.

1. **New plan**, and give it a name.
2. **Add a station** for each place: a name, where it is (typed, a saved place, or
   pressed on the map), the transmitter power (a radio profile fills it in), the antenna
   (a profile or a generic antenna) and the noise where that station listens. Up to
   eight stations.
3. **When, and on what**: the date (the model works by month), the hours of interest in
   UTC (a window may run past midnight), the bands of interest, the mode, and where the
   sunspot number comes from. Changes are saved as they are made. If the plan was
   saved on another device after this screen read it, the change is not saved over
   it: the screen says so and offers **Keep my change** (your change on top of the
   plan as the other device left it) or **Take theirs**.
4. **Work out the plan.** For every pair of stations the engine is asked for the day
   each way, on every band of the plan: the two directions differ, because the power,
   the antennas and the noise at the two ends differ.

### The matrix, and how the bands are chosen

For each pair the screen gives the distance and bearings, a **primary** and an
**alternate** band with the hours recommended for each, a grid of every band of the
plan through the 24 hours, and, for the hour pressed, each direction's figure and the
two-way figure.

The recommendation is a rule applied to the engine's figures. It is written out on the
screen above the matrix and in every export:

- For each band and hour, the **two-way figure** is the lower of the two directions'
  reliabilities, because a contact needs the path to work both ways. It is an upper
  bound on how often a contact can be expected, not a prediction of it.
- The **primary** band is the one whose two-way figure, averaged over the hours of the
  window, is highest. The **alternate** is the next highest. A tie goes to the band with
  the higher median signal-to-noise ratio.
- The **hours given** for a band are those at which its two-way figure is 50% of days or
  more. If it reaches that at no hour, the hours given are those within 5 points of its
  best, and it is marked as below half the days.
- A band whose two-way figure never reaches 10% of days in the window is not recommended
  at all. A pair may have no alternate, or no primary; the plan then says so.
- An hour at which the engine found no path counts as no days.

For a mode with no stated requirement (**Another narrowband digital mode**) the engine
gives no reliability, and the bands are compared by the lower of the two directions'
median signal-to-noise ratios instead; the hours given are those within 3 dB of the
band's best. The screen and the exports say which rule was used.

The matrix is kept. Renaming a plan, changing its notes, links or hours does not ask the
engine again; changing a station, the month, the bands, the mode or the sunspot number
does, and the screen shows nothing for the plan until it has been worked out as it
stands.

### Exports

**Save as PDF**, **Add to library** and **Export as Markdown** write the plan out to
print and carry (and **Share**, where the device can): the
date and hours, where the sunspot number came from, the stations, the primary and
alternate for each pair, each pair's bands hour by hour through the window, the rule,
the limits, the engine and data versions, your notes, and the titles of what is linked.

- The **PDF** is A4, made in the browser by the same writer as the map's printed pages:
  headings and prose in Helvetica, tables in Courier so that their columns stand in
  line, a footer on every page saying it is a monthly median. A table too wide for the
  page is set smaller (24 hours across still fits at a size that can be read).
  Characters the PDF's typeface cannot write (anything outside Western European
  letters) are printed as "?", and the screen says which; the Markdown export keeps
  them.
- The **Markdown** reads as plain text: its tables are padded so that every line of a
  table is the same width.

The files are made in the browser. Saving one sends nothing anywhere. **Add to
library** sends the PDF to this Outpost's own library, where it is filed under "Made in
Outpost", read for search and kept in backups, with a link back to the plan
([library.md](library.md)). The PDF says the day it was written out; written out twice
in a day it is the same file, and the library keeps one.

### Notes and links

A plan has notes of its own, printed with it. **Linked notes and documents** ties a
plan to notes and documents in Outpost (a net procedure, a frequency list): find one by
words from its title or text and press **Link**. The link opens the note or document.
If one is deleted later, the plan says a note or document is no longer in Outpost.
Deleting a plan does not touch what it linked to.

## The contact log

**Radio**, **Contact log**. A log of what actually happened: contacts made, stations
heard, and calls that got no answer.

- **Log an entry** takes the date and time (UTC), what happened, the frequency, the
  mode, the two stations (callsign and place; either may be left empty), the
  transmitter power, the antenna, the reports sent and received, and notes.
- **Import an ADIF file** reads the log your logging program exports. A small file is
  in the log when the request is answered. A file over 128 kB is brought in by a job:
  the screen shows how much of it has been read and a **Stop** button, and the job is
  also on the Downloads screen's list of work. None of a large file is in the log, in
  the counts or in a comparison until all of it is; stopped, refused or failed part of
  the way through, what was written is taken out again. One file is brought in at a
  time. Opened part of the way through, the screen picks the import up.

### Reading ADIF

The reader was written from the ADIF specification, **version 3.1.8** ("Released ADIF
Version 3.1.8, updated 2026-10-12", `adif.org/318/ADIF_318.htm`, read on 16 November
2026): section IV.A, "ADI File Format", and the QSO field definitions. It reads the
`.adi` form. The XML form (`.adx`) is not read.

Fields read: `QSO_DATE`, `TIME_ON`, `CALL`, `STATION_CALLSIGN`, `OPERATOR`, `FREQ`,
`BAND`, `MODE`, `SUBMODE`, `RST_SENT`, `RST_RCVD`, `TX_PWR`, `GRIDSQUARE`,
`MY_GRIDSQUARE`, `LAT`, `LON`, `MY_LAT`, `MY_LON`, `MY_ANTENNA`, `COMMENT`, `NOTES`,
`SWL` and `PROP_MODE`; from the header, `ADIF_VER`, `PROGRAMID` and `PROGRAMVERSION`.
Every other field is ignored.

- **Every record is accounted for.** After an import the screen gives the number of
  records in the file, how many were brought in, how many were already in the log, and
  how many were left out, with each reason and its count: no callsign (`CALL`), no date
  or time, a date or time the specification does not allow, neither a frequency nor a
  band, no mode, or a file that ends in the middle of a record.
- **A position is only what the file states.** An end gets a position from `LAT` and
  `LON` (or `MY_LAT`, `MY_LON`) when both are in the specification's `XDDD MM.MMM` form,
  and otherwise from `GRIDSQUARE` (or `MY_GRIDSQUARE`) when it is a locator of four
  characters or more, as the middle of that square. A two-character locator is a field
  20° wide and is not used. An end with neither has no position, is listed as "no
  position", and is left out of comparisons. **Nothing works a position out from a
  callsign, a country or anything else.** `GRIDSQUARE_EXT` is not used: the first eight
  characters are already within half a kilometre.
- **The same contact is never added twice.** Two entries are the same contact when the
  minute, the two callsigns (or, where there is none, the position), the band and the
  mode are the same. That holds within one file, across files, and against entries
  typed in. A typed entry that is already there is refused.
- **Taking a file back** (**Files imported**, **Take back**) removes the entries it
  brought in and nothing else. The file itself was never kept.
- A record marked `SWL` is a station heard: the station in `CALL` is the transmitter,
  and the power in the file, which is the listener's, is not used.
- The specification says ADI data is ASCII. Files in the wild hold accented letters,
  and programs disagree on whether a field's length then counts characters or bytes.
  The reader counts bytes, which is the same thing for ASCII, and reads a value as
  UTF-8 when it is valid UTF-8 and as Latin-1 otherwise.
- A file of more than 64 MB or 200,000 records is refused; export it in parts.
- **The header.** The specification's words (IV.A.3) are that "A Header begins with any
  character other than < and terminates with a case-insensitive End-Of-Header tag" and
  that "If the first character in an ADI file is <, it contains no Header". Programs
  put a UTF-8 byte-order mark at the start of a file and people leave a blank line
  there; read strictly, either makes a header of a file that has none. So where a mark
  or white space comes before the first `<`, the fields that follow are the header's if
  an `<EOH>` ends them and the first contact's if an `<EOR>` does. Words before the
  first `<` with no `<EOH>` anywhere are a header that never ends: nothing says where
  its fields stop and the first contact's begin, so nothing is read from the file.
- **A file with nothing in it to read is refused, in words.** A header that never ends,
  a header with no contacts after it, a file that stops in the middle of its first
  contact, or `<EOR>` tags with no fields before them: each is said, and no import is
  recorded. (A file whose contacts were all read and all left out, or all already in
  the log, is recorded, with the reasons and counts.)

#### How long an import holds the server

The server answers every request on one thread, so what matters is the longest piece
of work an import does without looking up. Measured on the machine this was written on
(an Apple M-series laptop, other work running), with a log of about 290 bytes a contact:

| Contacts | File | Before: in the request, in one piece | Now: longest piece | Now: whole import |
| --- | --- | --- | --- | --- |
| 1,000 | 0.3 MB | 0.2 s | 16 to 28 ms | 0.04 to 0.1 s |
| 20,000 | 5.8 MB | 3.1 s | 10 to 16 ms | 0.4 to 0.9 s |
| 200,000 | 58 MB | 28 s | 27 to 49 ms | 7.5 to 13.7 s |

"Before" read the whole file into text twice, looked each contact up in the log with a
query of its own, and wrote everything in one transaction. Now the file is read from
its bytes 200 contacts at a time, each batch is written as it is read, a duplicate is
left to the unique index on what makes two entries the same contact, and the server
looks up between batches. A file refused for holding more than 200,000 contacts has had
200,000 written by then; taking them out again is batched too (longest piece 36 ms,
about 14 seconds in all).

The line between "at once" and "a job" is 128 kB. Reading and writing a contact takes
about 17 millionths of a second, measured in one piece: 2 ms for 100 contacts, 3.5 ms
for 200, 8 ms for 500, 16 ms for 1,000, 33 ms for 2,000, 86 ms for 5,000. At the usual
300 bytes a contact 128 kB is some 450 contacts and 8 ms; a file of the barest contacts
(70 bytes) is about 1,800 and 25 ms.

The file of a job is held in memory (64 MB at most, one at a time), not written to
disk. So an import does not outlast the server: if Outpost is restarted part of the way
through, the job runs again, finds no file, takes out what had been written and fails
saying so. Nothing of the file is in the log; import it again.

No ADIF file from a real logging program was available here. The reader was tested
against files written for the tests from the specification.

### Comparing with predictions

**Compare with predictions** puts each entry that can be compared to the engine as a
path, at its own month, the nearest whole hour and its own frequency, and counts how
many entries fell where the engine gave a **low** (under 30% of days), **middling** (30
to 69%) or **high** (70% or more) reliability.

A log does not say what antenna or noise the other stations had, so you choose them:
your antenna, the antenna assumed at every other station, the noise assumed at every
receiver, and, if you wish, a power to assume where the log gives none.

An entry is left out, and counted under its reason, when:

- one end or both have no stated position;
- the frequency is outside 2 to 30 MHz (an entry with a band and no frequency is
  compared at the band's middle frequency);
- the mode has no published requirement here (only SSB, CW, FT8 and JS8 have one; ADIF's
  `MFSK` with submode `JS8` is JS8, `SSB` with `USB` or `LSB` is SSB);
- no power was logged and none was given to assume;
- the log says the signal travelled another way (`PROP_MODE` other than `F2`: a
  satellite, a repeater, the internet, sporadic E);
- the solar table has no sunspot number for that month and none was given;
- the two ends are in the same place to a hundredth of a degree, or the engine found no
  path at that hour;
- it is beyond the 500 most recent different paths, which is the most put to the engine
  for one comparison.

**Past months.** The solar table is NOAA's forecast and does not reach back. For a
month it does not cover, the screen asks for the smoothed sunspot number of that month;
left empty, that month's entries stay out. Outpost does not ship past sunspot numbers:
their licence (CC BY-NC) does not allow it.

**What the comparison is, and is not.** The screen says this itself:

- A log holds the contacts that were made. It does not hold the calls that went
  unanswered, unless you logged them as such, so it cannot show how often a low
  prediction was right to be low.
- Each entry is compared in one direction only, from the transmitting end, with the
  same assumed antenna at every other station and the same assumed noise at every
  receiver.
- The engine gives a monthly median; a contact happened on one day.
- A position read from a four-character locator is the middle of a square two degrees
  wide and one tall.
- With fewer than 30 entries compared, no percentages are shown at all, only counts.
  With 30 or more, each percentage is shown beside the count it rests on.
- Nothing here adjusts the engine. A calibration that did would have to be explainable
  and testable, and none is built.

## A second model: ITU P.533

The specification asks for the engine to be replaceable and for results to be checked
against a trusted reference where possible. Beside VOACAP, the planner can run a second
model for the same path: **ITURHFProp**, the implementation of Recommendation ITU-R
P.533 (with P.372 for noise) that ITU-R Study Group 3 publishes. It is a different
model from VOACAP, not a second copy of it.

It is optional, and **nothing of the ITU's ships with Outpost**: not its source, not
the built engine, not its maps. See [Licences and attribution](#licences-and-attribution)
for why. Each person who wants it builds the engine on their own computer from the ITU's
own repository and downloads the maps through the download manager.

### Setting it up

Under the prediction, **Compare with a second model (ITU P.533)** says in one line what
is missing and how big it is. Two things are needed:

1. **The engine**, built once on the computer that runs Outpost. It needs Docker and the
   internet, once:

   ```bash
   node scripts/build-p533-engine.mjs                       # into engines/p533/engine/
   node scripts/build-p533-engine.mjs --install <data dir>  # also into <data dir>/propagation/p533/
   ```

   The script fetches only the source folders of github.com/ITU-R-Study-Group-3/ITU-R-HF
   at commit `82017594a1c6` (15 May 2025), checks them against the tree checksum Outpost
   recorded, and compiles them in a container (Debian 12 slim and wasi-sdk 34.0, both
   pinned by checksum) with no network. The result must be, byte for byte, the file
   Outpost recorded (`iturhfprop.wasm`, 233,329 bytes, SHA-256 `2eb26424…29b2`); if it
   is not, it is not installed. A packaged app looks in
   `<data directory>/propagation/p533/`, so use `--install` there. The build image is
   about 740 MB; `--remove-image` deletes it afterwards.

2. **The maps**: press **Download the P.533 maps (137 MB)**. Twenty-five files from the
   same repository at the same commit (`P372/Data/`): the twelve monthly ionospheric maps
   (`ionos01.bin` to `ionos12.bin`, 11.2 MB each), P.372's twelve monthly noise tables
   (`COEFF01W.txt` to `COEFF12W.txt`) and the P.1239 decile factors, 137,270,856 bytes in
   all. They are fetched one after another into one file on the storage location chosen,
   checked against the checksum of the whole and of each file, and recorded as one
   collection, which **Manage and clean up** lists and can remove. Nothing is fetched
   unless the button is pressed.

Until both are there and match their checksums, the second model is simply not offered.

### What it shows

Press **Compare with a second model (ITU P.533)** under a prediction. Both models are
run for the same path, month, sunspot number, power, noise and requirement, for the
frequency asked about and each band, through the day:

- **Open or shut by hour**: for each band and hour, whether each model has the path
  open (the frequency at or below that model's median MUF), marked where they disagree,
  with the number of hours they agree on and, over the hours open in both, the range of
  P.533's signal less VOACAP's.
- **At the chosen hour**: for each band, open or shut, MUF, signal and signal-to-noise
  ratio from each model, and the difference. VOACAP's reliability and P.533's basic
  circuit reliability are two separate columns, each named.

The difference is stated, never averaged into one answer, and nothing says which model
is right. On London to Birmingham, 16 November 2026 (SSN 83, 5 W, urban noise, SSB),
the two agreed on open or shut in 22 to 24 of the 24 hours on every band; while both had
40 m open, P.533's signal was 3.6 to 9.0 dB weaker; the MUFs differed by 0.04 to
0.32 MHz.

**Antennas.** P.533 has no antenna models, and Outpost does not compute a pattern of its
own. So the comparison runs **both** models with isotropic antennas of 0 dBi at both
ends, with no gain added and no feedline loss, whatever antennas the prediction above
uses. The prediction above, with your antennas, is VOACAP's alone and is not relabelled.
A question to the P.533 engine with any other antenna is refused rather than quietly run
isotropic. The comparison is one way only (no reply).

### How Outpost's question is put to P.533

The engine is the ITU's command-line program, run as it is: Outpost writes an input
file in the program's own format and reads the CSV report it writes
(`modules/propagation/p533/input.ts`). Every mapping:

| Outpost | P.533 input | Note |
| --- | --- | --- |
| Transmitter and receiver | `Path.L_tx`, `Path.L_rx`, and the receiver as the one point of the area | Positions to four decimal places. Names are fixed ("Transmitter", "Receiver"): no text from a request goes into the file |
| Date | `Path.year`, `Path.month` | By month, as VOACAP |
| Hours | `Path.hour 1,…,24` | UTC; hour 24 is midnight at the end of the day, as in VOACAP |
| Sunspot number | `Path.SSN` | The same number VOACAP was run at, from the same source. P.533's program takes 1 to 311; outside that it is refused with that range |
| Power | `Path.txpower`, dB relative to 1 kW | 10·log10(W/1000). The program takes −30 to 60 dB(kW), 1 W to 1 GW; below 1 W the comparison is refused and says so |
| Frequencies | `Path.frequency`, up to 32 per run | The one asked about, then each band's centre |
| Antennas | `TXAntFilePath "ISOTROPIC"`, `RXAntFilePath "ISOTROPIC"`, `TXGOS 0.0`, `RXGOS 0.0` | Always. See above |
| Noise: urban, residential, rural, remote | `Path.ManMadeNoise "CITY"`, `"RESIDENTIAL"`, `"RURAL"`, `"QUIETRURAL"` | P.372's named curves, Fam = c − d·log10(f): c = 76.8, 72.5, 67.2 with d = 27.7, and c = 53.6 with d = 28.6. At 3 MHz they give −140.4, −144.7, −150.0 and −164.0 dBW in 1 Hz; VOACAP's four settings are −140.4, −144.7, −150.0 and −164.1. Atmospheric and galactic noise are each model's own. The upper and lower decile spreads of man-made noise are P.372's for each category (P.533's program uses the rural spreads for quiet rural) |
| The mode's requirement | `Path.SNRr` in 1 Hz, with `Path.BW 1.0` | Outpost states every ratio in 1 Hz. P.533's reliability depends on the ratio less the requirement, so asking in 1 Hz gives the same answer as asking in the mode's own bandwidth. A mode with no figure is run at 0 dB and no reliability of either kind is shown |
| — | `Path.SNRXXp 90` | The ratio exceeded 90% of the time, read but not shown |
| — | `Path.Modulation "ANALOG"`, `Path.SorL "SHORTPATH"` | P.533's "digital" method needs the time and frequency spread a modem tolerates, which no mode in Outpost states. Short path only, as with VOACAP |

And back, from the report's columns (named as the program names them):

| Shown as | P.533 column | Against VOACAP's |
| --- | --- | --- |
| MUF | `MUF50`, the path's basic MUF on half the days | VOACAP's MUF, the same definition. P.533's operational MUF (`OPMUF`, higher) is kept in the answer and not set against it |
| Open | frequency ≤ `MUF50` | frequency ≤ VOACAP's MUF |
| Field strength | `Ep`, dB(1 µV/m) | VOACAP's field strength |
| Signal | `PR`, dBW, median available received power | VOACAP's signal power |
| Noise | `FamT` − 204, dBW in 1 Hz | VOACAP's noise |
| Signal-to-noise ratio | `SNR`, dB in 1 Hz | VOACAP's median ratio |
| Basic circuit reliability | `BCR`, % | **Not VOACAP's reliability.** P.533 counts variation from hour to hour (5 and 8 dB deciles) as well as from day to day, after P.842. It is shown in its own column under its own name |

**Above the MUF** the two models differ by design. P.533 adds an above-the-MUF loss
that grows with how far the frequency is above each mode's basic MUF fb (in its
short-path method: for E modes 46·√(f/fb − 1) + 5 dB, at most 58 dB; for F2 modes
36·√(f/fb − 1) + 5 dB, at most 60, on paths up to 3,000 km, and 70·(f/fb − 1) + 8 dB,
at most 80, beyond), and widens the spread of its reliability with f/MUF. VOACAP treats such
frequencies its own way. A signal figure for a shut path is each model's own; the range
of differences counts only hours open in both. Beyond 9,000 km P.533 uses its own
long-path method, and the report's `Ep` is that method's field strength.

The program's value −307 means "not worked out"; Outpost treats exactly that value as
no figure. Figures below it (a very weak signal on a long path) are real.

### Held to the ITU's reference

**Against the ITU's own reference.** The repository carries nine reference inputs and
the outputs the ITU committed for them (`ITURHFProp/Bin/*.in`, `*.out`). The WebAssembly
build, run exactly as Outpost runs it (the same sandbox, a fresh instance for each run),
printed every one of them. Tolerance: none; every line is compared as text, except line
3 (the date the program was compiled) and line 6 (the time of the analysis), which say
when, not what.

| Case | Lines | Differing lines outside 3 and 6 |
| --- | --- | --- |
| 1-5-85 | 86 | 0 |
| 1-5-85_01 | 86 | 0 |
| 1-8-84 | 114 | 0 |
| 164-1-78 | 86 | 0 |
| caracas_201805_10_31_B4 (path dump, a type 13 antenna file) | 4,846 | 0 |
| itu_old (path dump) | 401 | 0 |
| itu_old22012020 (path dump, a type 13 antenna at the receiver) | 401 | 0 |
| moscow_201805_10_31_B4 | 102 | 0 |
| sydney_201805_10_31_B4 (path dump, 16,900 km) | 225 | 0 |

So no floating-point tolerance was needed. These are
`apps/server/test/propagation-p533-reference.test.ts`; because the ITU's files are not
in the repository, they run when the built engine, the fetched source and the maps are
on the computer (`node scripts/build-p533-engine.mjs --maps`), and are reported as
skipped, by name, when they are not. They were run on 16 November 2026 on an Apple M2
Max: 9 of 9 identical. Two of the nine name antenna files (`dipole_14mhz_10m_aagl.13`
and `201-6_0.t13`, the second under the name `201-6_0.T13` that the input gives), which
the test hands the program; Outpost itself never uses an antenna file with P.533.

**Building it again gives the same bytes.** Two builds on linux/arm64 and one on
linux/amd64 (under emulation on the same Mac) gave the same file, SHA-256
`2eb264246a77f6fda81325bb6a71a0f3b6e1c60e6e5bbadb38f5ca05c39229b2`.

**Against VOACAP**, on London to Birmingham: see [What it shows](#what-it-shows), and
[How it was checked](#how-it-was-checked) under The engine, which compared the two at
three sunspot numbers. Not compared with signals measured on the air. Not run on
Windows, a Raspberry Pi or an Intel Mac.

### The build

`engines/p533/` holds only Outpost's own files: `build/Dockerfile` and `build/compile.sh`
(the toolchain and the compile), `glue/` (below) and `NOTICE.txt`. **No line of the
ITU's source is edited or reproduced.** Building for WASI needed three things, none of
them a patch:

- **`dlopen`.** On Linux ITURHFProp loads P533 and P372 as shared libraries with
  `dlopen` and `dlsym`. WebAssembly here has none, so the three are linked into one
  program and `glue/outpost-dl.c`, with its own `glue/include/dlfcn.h`, answers those two
  calls from a fixed table of the functions linked in. Only the two library names and
  the 21 function names the ITU's code asks for are known; any other is an error. The
  sources are compiled with `__linux__` defined so that they take their Linux branches.
- **Variables defined in headers.** Each part defines the same function-pointer
  variables from its headers (the ITU's Linux makefiles link with `-z muldefs`). The
  link uses `--allow-multiple-definition`; every copy is an uninitialised pointer. The
  compile script stops if any *function* is defined twice, except five helpers for
  printing angles and times (`degrees`, `minutes`, `seconds`, `hrs`, `mns`) that P533
  and ITURHFProp both define with the same bodies at the pinned commit.
- **Reproducibility.** `__DATE__` and `__TIME__`, which the program prints as its
  compile time, come from `SOURCE_DATE_EPOCH`, set to the commit's time; paths are
  rewritten. The flags are the ITU makefiles' (`-O2`); there is no fast-maths, and
  WebAssembly has no fused multiply-add, which is why the outputs match to the last
  digit. No long doubles are used by the code.

The program's memory is capped at 128 MB when it is linked; a day of 32 frequencies
uses about 36 MB.

### The sandbox

The ITU's program runs in a worker thread of its own (`p533/p533.worker.ts`), apart from
VOACAP's, with its own WASI shim (`p533/wasi.ts`). It is given its command line, the
files Outpost puts in a map (the input, the month's maps, the noise and decile tables),
which it can read and never change, and one file it may create and write, the report,
up to 32 MB. `..` at the top of its tree stays at the top. It has no other file, no
network and no environment. Every run is a fresh instance of the compiled module, so no
state carries from one answer to the next. A question unanswered in a minute ends the
worker; the worker ends after five idle minutes.

### How fast

Measured on an Apple M2 Max, 16 November 2026, with other work running:

| | |
| --- | --- |
| Engine file | 233 kB |
| Load the engine and the first month's maps | 72 ms |
| One path, 24 hours, ten frequencies (London to Birmingham) | 110 to 130 ms; one run of 280 ms |
| The same, London to Sydney (16,994 km) | 460 ms |
| The whole comparison, first time (VOACAP isotropic and P.533) | 304 ms; found again, 12 ms |
| The program's memory for one run | 36 MB, released after the run |
| Maps held in the worker | two months (22 MB) and the small tables |

### Answers kept

A comparison is kept like any other answer, under a key made from the VOACAP
prediction's own key (the question as the engine reads it, the sunspot number, the
solar table's checksum, VOACAP's checksum and its data's version) with P.533's engine
checksum and the version of its maps (`p533-maps <commit> <maps checksum>`). Because the
comparison is isotropic, the antennas in the form do not change the key.

### What is not done

- P.533 is not offered for coverage maps or communication plans.
- No antenna but isotropic. A gain table (P.533's type 13 or 14 file) for each generic
  antenna, computed by a program whose patterns can be checked, is the way to more.
- The reply direction is not compared.
- P.533's digital-modulation reliability, its long-path reliability details and its
  operational MUF are not shown beside VOACAP's figures.

## Where the sunspot number comes from

VOACAP takes one figure about the Sun: the smoothed sunspot number for the month. A
prediction always says where its number came from.

| The notice says | The number is |
| --- | --- |
| A monthly median, with a recent solar forecast | NOAA's forecast for the month, from a solar cycle table no more than 45 days old |
| A monthly median, with an old solar forecast | The same, from an older table. The prediction still works; the notice gives the table's age |
| A monthly median, run at your own figure | A sunspot number you typed, or one found from an foF2 you measured |

- **The table** ships with Outpost: NOAA Space Weather Prediction Center's
  `predicted-solar-cycle.json` as served on 16 November 2026, May 2026 to December 2030.
  A month outside the table needs a number of your own.
- **A newer table** can be fetched under **Engine and data**, **Download a newer
  table**. It goes through the download manager into the storage location you choose,
  is checked (every month must have a usable number), and is recorded as a collection
  under **Radio data**. A working copy of the 17 kB file is kept in the data directory,
  so predictions do not depend on a network share being connected. Removing the
  collection goes back to the included table. Nothing is fetched unless you press the
  button.
- **A measured foF2.** Give the foF2 and the hour it was for. Outpost asks the engine's
  own map, at one sunspot number after another, until it gives that foF2 over the
  middle of the path at that hour, and runs the day at that number. One measurement
  stands for the whole day, and the shape of the day is still the monthly median's. An
  foF2 the map cannot give at any sunspot number is refused with the range it can give.

Which sunspot series VOACAP's maps were fitted to, the present international series or
the one before its 2015 revision, was not settled by anything read for this work.
VOACAP's own guide tells users to enter the current predicted smoothed number, and that
is what is done here.

## Equipment

**Equipment** keeps radios and antennas.

- **A radio**: name, model, power, the range it transmits over, modes, a note about the
  receiver, notes. Only the power is used in a prediction.
- **An antenna**: name, kind, the length of the wire for an end-fed wire, height of the
  wire, the bearing its broadside faces (empty turns it towards the other station), the
  ground under it, gain added, feedline loss, the range it is used over, notes. A sloping
  wire has, in place of the height and broadside, the height of its low end (the feed),
  its slope (10° to 60°) and the bearing its high end points towards (empty turns its
  low end towards the other station), set apart under "How it slopes".

Wherever an antenna is chosen (the planner, a plan's station, a coverage map, the
contact log's comparison) the list gives the person's own antennas first, then the
generic ones under headings: dipoles; end-fed wire 20 m, 10 m and 5 m, each with the ways
it is put up; verticals and others. Above the list is a box to find one by typing ("20 m
sloping", "spooltenna"). It opens above a dialog, and each choice is a thumb's height on a
phone.

An antenna is always run as one of VOACAP's own antenna models:

| Kind | Run as | What that leaves out |
| --- | --- | --- |
| Horizontal dipole | VOACAP type 23, a horizontal half-wave dipole over ground at the height given, resonant on whichever frequency is asked about | A wire cut for one band, bent, sloping or near buildings |
| Inverted-V | The same dipole at the *mean* height of the wire | VOACAP has no inverted-V. A real one radiates a little less upwards and more off its ends. Labelled an approximation wherever shown |
| End-fed half-wave wire, horizontal (a stated length) | Three states, by the wire's length in wavelengths at the frequency. **Half-wave** (0.45 to 0.55): VOACAP type 23 with the wire's length in metres. **Longer** (above 0.55): **approximate**, VOACAP type 41, the ITS-78 sloping long wire, laid level at the wire's height, its length and height in wavelengths at that frequency; labelled approximate wherever shown. **Shorter** (below 0.45): **not modelled, no figure** | A sloping wire and the matching unit's loss. On the approximate bands, a model whose level was never checked against the engine's checked models and reads 0.7 to 1.6 dB below the dipole where both can be compared; a wire whose current is a pure standing wave with no loss along it. Nothing on the bands where it is shorter |
| End-fed half-wave wire, vertical (a stated length) | VOACAP type 22, the vertical monopole, with the wire's length in metres as its height, on every frequency. The result says how long the wire is in wavelengths on each band | The matching unit's loss. Off the half-wave band the model is a wire fed against the ground at its base, which an end-fed half-wave is not: see below |
| End-fed half-wave wire, sloping (a stated length) | Two states. **A half-wave or longer** (from 0.45 wavelengths): **approximate**, VOACAP type 41, the ITS-78 sloping long wire, at the wire's slope, fed at its low end, its length and the low end's height in wavelengths at that frequency. **Shorter**: **not modelled, no figure** | The matching unit's loss. A model whose level is unchecked: over a perfect ground it sends out between about 9 dB less and 2 dB more than it is fed (below). A wire that sags or bends, the mast, the feedline's own radiation |
| End-fed half-wave recut for every band | The half-wave dipole of the first row at the wire's height: a wire whose length follows the frequency | Not one wire. VOACAP has no end-fed model. A sloping wire and the matching unit's loss. Labelled an approximation |
| Quarter-wave vertical | VOACAP type 22 | A short or loaded vertical, or few radials: take the difference off as gain |
| Isotropic | The same gain in every direction | Not a real antenna; for comparing with other tools |

Gain added and feedline loss shift the whole pattern by that many decibels. A loss at
the receiving end is taken off the signal only: where outside noise dominates, as it
usually does on HF, a real receiver loses signal and noise together, so this is
pessimistic. Ground is one of four assumed pairs of constants (poor 4 and 0.001 S/m, as
VOACAP's sample files use; good 10 and 0.01; average 15 and 0.005; sea 80 and 5).

Two antennas of the same kind do not have the same pattern. A profile is one model of
that kind, not a measurement of yours.

### End-fed wires of a stated length

Seven are offered as generic antennas: **End-fed half-wave, 20 m wire** sloping 25°
from 1.5 m to 10 m, and horizontal (level, 6 m up); the **SPOOLTENNA** as its maker puts it
up (below); and **10 m wire** and **5 m wire**, each **horizontal** (the wire level, 6 m
up) and **vertical** (the wire upright with its bottom end at the ground). Twenty metres
of wire is a half-wave on the 40 m band. Ten metres of wire is a half-wave on the 20 m band and five
metres on the 10 m band. A profile can be a wire of any length from 4.5 to 82 m: the
lengths that are a half-wave somewhere between 2 and 30 MHz. A profile also sets the
height of a level wire, the ground and the bearing.

Nothing about a wire's pattern is worked out by Outpost. What it does is choose which
of the engine's models to hand the wire to, say how sure that is, and refuse to give a
figure where none of them describes the wire.

**A level wire is in one of three states on each band**, by its length in free-space
wavelengths at the band's frequency:

| State | Where | Run as | Shown as |
| --- | --- | --- | --- |
| **Half-wave** | 0.45 to 0.55 wavelengths (a real half-wave wire is cut about 5% short of 0.5) | VOACAP's dipole, type 23, with the wire's length in metres | Figures, as for any antenna. "Half-wave: VOACAP's dipole" |
| **Approximate** | Longer than 0.55 wavelengths, up to 30 MHz | VOACAP's sloping long wire, type 41, laid level at the wire's height | Figures, marked approximate everywhere: "Approximate: VOACAP's sloping long wire, laid level; its level is unchecked and reads about 1.3 dB below the dipole model at a half-wave" |
| **Not modelled** | Shorter than 0.45 wavelengths | Nothing | No figure. "Not modelled" |

The limits 0.45 and 0.55 are Outpost's own choice of where to stop trusting the
half-wave model, not a figure from VOACAP. For the 10 m wire: not modelled below
13.5 MHz (80, 60, 40 and 30 m), the dipole from 13.5 to 16.5 MHz (20 m), approximate
above (17, 15, 12 and 10 m). For the 5 m wire: not modelled below 27.0 MHz, the dipole
from 27.0 to 30 MHz (10 m); it is never longer than a half-wave below 30 MHz, so it has
no approximate band. A 20 m wire: not modelled on 80 and 60 m, the dipole on 40 m,
approximate from 30 m to 10 m. An 82 m wire is approximate from 2.0 MHz up.

An upright wire is run as VOACAP's vertical monopole (type 22) of its height on every
band; off its half-wave band the figure is for a wire of that length fed against the
ground, and the screen says how long it is in wavelengths.

**Where each state is shown, and how.** Never by colour alone.

- *The planner.* The band table: an approximate row is shaded as any other, framed with
  a dashed line, and its label carries "≈"; in the ranking its bar is striped and framed
  and its figure reads "≈62%"; a row that is not modelled is hatched with no shade and
  reads "Not modelled". The heat map of every whole megahertz does the same, and its
  legend names all three. For a frequency asked about that is approximate, the first
  line of the answer reads "Approximate figures for 28.9 MHz", above it a notice gives
  the reason, and the reliability, ratio and gains are each followed by "(approximate)".
  **The wire on each band** gives each band's length in wavelengths and its state in the
  words above. Where the dipole and the long wire stand side by side across bands, a
  notice above the band table, "Two of VOACAP's models side by side", says where the
  model changes and by how much the two differ (below), and the list says it again.
- *Coverage maps* may be made on an approximate frequency. The legend says "≈
  Approximate map" with the reason, and so do the map's PDF and Markdown, in the title
  and beside the legend. A map on a frequency that is not modelled is refused.
- *Communication plans* may recommend an approximate band. The matrix marks it ≈ (on
  screen) or ~ (in the PDF and Markdown) beside every figure, the recommendation says
  "approximate" in its words and in the summary table, and the pair says which station's
  wire it is. A band that is not modelled is "n/m" and never recommended.
- *The comparison* ("with one thing changed") marks a series approximate or not
  modelled, on screen and in its PDF and Markdown (which until now printed a series that
  was not modelled as noughts; it now prints "n/m").
- *The contact log's comparison* counts entries on approximate frequencies apart, in a
  table of their own headed "≈ Compared with approximate figures": comparing what
  happened with an approximate model says less, and they are not mixed in with the
  rest. An entry on a frequency that is not modelled is left out and the reason given.
- *The prediction's PDF and Markdown* print "~" before an approximate figure and "n/m"
  for none, with the key to both under each table, a list of how each band was run,
  and the step between the models where both appear. The title and the first finding
  say "approximate" when the frequency asked about is.
- *Show the page VOACAP prints*: each approximate frequency is a page of its own (it has
  a file of its own, below), headed by Outpost "approximate"; the page names the model
  "HFMUFES#41". A frequency that is not modelled is left off.

**Which way the wire runs.** The bearing a person gives is the one the wire's broadside
faces, and "turned towards the other station" puts the broadside towards it. That is
kept on every band, because it is one wire hung one way: on its half-wave band its
broadside is its best direction, and on a band where it is longer it is not (a wire a
whole wavelength long has a null broadside, below). So on an approximate band the figure
is for the wire hung broadside to the path, which may be well below what the same wire
gives turned another way; the screen, the preset and the equipment form say so. Give
the bearing to model how yours hangs. The long wire's own reference direction is along
the wire, so Outpost hands the engine the broadside bearing turned 90°; the antenna's
words in the result give the line the wire runs, "the wire running 43° to 223°". Laid
level, the model gives the same pattern whichever end is fed (below), so which end the
feed is at does not need to be asked.

**The matching unit is not modelled.** An end-fed half-wave is fed through a transformer
that loses some power. Put its loss in the profile as feedline loss.

**Old answers.** Answers kept while these bands were not modelled are not served as
current. The key an answer is kept under gains a mark when a level wire is approximate
on any frequency the question covers (a prediction's frequency, bands and whole
megahertz; a comparison's frequency, and the generic antennas when they are what is
compared; a coverage map's frequency; a plan's bands), so those questions are worked out
again. Every other question keeps the key it had: the engine and its data have not
changed, and a dipole's answer, the 5 m wire's or an upright wire's is the same as
before. A saved prediction is asked again as it was saved, and so is answered as the
wire is run now.

**What VOACAP's models do with a length in metres**, and why the wires are run as they
are. Read from the sources on 16 November 2026 and then run on this engine (hfcast
2.14.0, VOACAP 16.1207W); the runs are kept as tests in
`apps/server/test/propagation-wire.test.ts`. The engine gives no pattern, only the gain
at the angle a signal leaves at, so a pattern was sampled: one antenna file, one
frequency, paths of twelve lengths from 150 to 6000 km through the 24 hours, which
between them leave at angles from 3° to about 75°; gains were compared at the same whole
degree. Average ground throughout. Where a direction is given, one path of 2500 km was
asked at noon with the antenna turned.

1. **Type 23, the horizontal dipole, takes a length in metres and is fed at its centre.**
   Its formula is that of a centre-fed wire with a sinusoidal current (VOACAP's
   `iongain.for`, label 340, in voacapl commit `c12a98b`; `src/voacap/ioncap.rs` in
   hfcast). A half-wave wire carries much the same current wherever it is fed, so there
   the model stands: 10 m of wire at 14.18 MHz (0.47 wavelengths) reads 0.1 dB below the
   half-wave dipole at every angle sampled. Away from a half-wave it does not stand, for
   two reasons that were both seen:
   - *Direction.* A wire a whole wavelength long, fed at its centre, is strongest
     broadside; fed at its end, its two halves are in opposite phase and it has a null
     there. On one path at 28.85 MHz (10 m of wire, 0.96 wavelengths) type 23 gave
     -12.1 dBi broadside and -19.3 dBi 40° off it. The engine's model of a wire fed at
     its end (type 41, below) gave -29.2 dBi broadside and +4.0 dBi 40° off.
   - *Level.* Type 23 refers its gain to the current at the centre feed point, which
     falls towards nothing as the wire nears a whole wavelength (the source divides by a
     resistance that grows as 1/sin² of the half-length in radians, and the factor that
     would undo it is set to 1). Against a half-wave at the same height and angles, the
     10 m wire read 3.7 dB lower at 7.1 MHz, 8.8 dB lower at 3.65 MHz and 17.5 dB lower
     at 28.85 MHz. No real wire loses that for being the wrong length.

   The program's own manual says as much: its antenna models "assume that the antenna
   parameters are within the design limits of each antenna and that the operating
   frequency is such that the antenna is close to resonance", it "is not appropriate to
   use these models ... far from resonance", and "they will not typically produce
   accurate results for full-wavelength or multiple-full-wavelength antennas" (NTIA
   Report 83-127, *Ionospheric Communications Analysis and Prediction Program User's
   Manual*, Teters, Lloyd, Haydon and Lucas, July 1983, section 4.4, page 41;
   its.ntia.gov/publications/download/83-127_ocr_reduced.pdf). So a level wire is given

2. **Type 22, the vertical monopole, takes any height, and is the wire fed at its
   bottom end.** The manual draws it with its feed at the ground (Figure 45, page 114)
   and its length as the one parameter. The current it assumes falls to nothing at the
   top, which is the current on a vertical wire fed at the bottom, whatever its length.
   Seen at 14.18 MHz, strongest angle and gain there: 0.25 wavelengths, 25 to 30° at
   -0.7 dBi; 0.5, 20° at +0.2 dBi; 0.625, 15° at +1.2 dBi; 0.75, 50° at +4.3 dBi with
   -1.5 dBi left at 10°; one wavelength, 30° at +3.6 dBi with -4.6 dBi at 10°. That is the
   textbook course: the lobe lowers as the wire lengthens to 5/8 of a wavelength and
   splits beyond. A height in metres gave what the same height in wavelengths gives on
   every band tried (within 0.1 dB from 7 to 29 MHz, 0.3 dB on 80 m, where the engine
   reads between the patterns it keeps for 3 and 4 MHz). A different part of the engine,
   type 41 stood upright with its feed on the ground, gave the same as type 22 to 0.1 dB
   at 14.18, 18.12 and 28.85 MHz. So an upright wire is run as type 22 on every band.

   *The ground system.* Below 0.35 wavelengths type 22 takes off an "antenna efficiency":
   0.6 dB at a quarter-wave (the manual's own Figure 46, page 115, prints -0.6) and, by
   the expression in the source, about 4 dB at 0.12 wavelengths and 12 dB at 0.05. With
   it, 10 m of wire at 3.65 MHz was seen strongest at -6.8 dBi and 5 m at -18.5 dBi, and
   at 7.1 MHz type 22 read 0.8 dB below type 41 stood upright, which has no such term. Neither the manual nor the source says what ground
   system that figure stands for. What is certain is that the model is a wire fed
   *against the ground*. A half-wave fed at its end draws almost no current at the feed,
   which is why it needs no radials. A shorter wire does draw current there; an end-fed
   half-wave has no ground system to return it and a matching unit made for a half-wave,
   so on those bands the real antenna does worse than the figure, by an amount the engine
   cannot give. The screen says so on every such band. For a wire a whole wavelength
   long the manual's warning in 1 applies, and the screen says that too.


3. **Type 41, the "sloping long wire" of the ITS-78 set, is a wire fed at one end, and
   is what a level wire longer than a half-wave is run as.** Its parameters are the
   slope from horizontal, the wire's length and the height of its feed
   (`antennas/samples/sample.41` in the VOACAP distribution, "Sample type 41 ITS-78
   Sloping Long Wire": a wire 91.44 m long, about three wavelengths at 10 MHz, sloping
   10° from a feed on the ground). Its source is `mufesgan.for`, `SUBROUTINE MUFESGAN`,
   "SLOPING LONG WIRE, KOP = 11" (voacapl commit `c12a98b`), after Ma and Walters, ESSA
   Technical Report ERL 104-ITS 74 (1969). Its field is that of a wire carrying the
   standing wave sin k(L − z), nought at the far end, with the ground's reflection
   added; its gain divides by `RIN`, the resistance of a monopole of the same length
   over perfect ground, whatever the slope and height. Run on this engine:
   - *Which end, which way.* Sloping 20° up from a feed 1 m above the ground, 10 m of
     wire at 21.22 MHz read -16.3 dBi along its reference direction and -0.2 dBi the
     other way: the reference direction runs from the feed up the wire. Laid level the
     pattern is the same towards either end, to 0.05 dB at 18.12, 21.22 and 28.85 MHz:
     the field of a standing wave has the same size both ways along the wire. So the feed
     end does not matter for a level wire, only the line it runs along.
   - *Its pattern as the wire lengthens* (14.18 MHz, 0.3 wavelengths up, a path leaving
     at 31°, strongest direction measured from the wire): 0.6 wavelengths, broadside
     (+5.5 dBi); 0.75, 49° (+5.2 dBi, 1.1 dBi broadside); one wavelength, 48° (+4.5 dBi),
     with -30 dBi broadside (the engine's floor); 1.5, 33°; two wavelengths, 24° with
     -30 dBi broadside; 2.5, 16°; three, 7°; and beyond, many narrower lobes (four,
     at 21°, 42°, 64° and 82°, for four wavelengths). That is the textbook course of a
     standing-wave long wire, seen at a raised angle. On the path of finding 1 at
     28.85 MHz the 10 m wire read -29.2 dBi broadside and +4.0 dBi 40° off it.
   - *Its level, where it can be checked.* A wire an odd number of half-waves long
     carries the same standing wave fed at its centre or at its end, and there type 23
     refers its gain to a current maximum, so there the dipole is a check on the long
     wire. At angles from 5° to 30°, 0.3 wavelengths up, the long wire read 1.36 dB below
     type 23 at 0.5 wavelengths, 1.49 at 1.5, 1.52 at 2.5, 1.54 at 3.5, 1.56 at 4.5 and
     1.58 at 7.5; at 0.15 wavelengths up 1.41 to 1.59; at 0.5 and one wavelength up 1.18
     to 1.46. Above 30° the two differ by an amount that depends on height and not on
     length (up to about 1.7 dB either way on average, seen at a half-wave too), and
     they place the nulls off broadside a little differently. The step of 1.3 to 1.6 dB
     is what dividing by a monopole's resistance gives: worked out in free space by
     Outpost for this note (not used in any figure), a monopole of length L over perfect
     ground has 1.34 dB more resistance than a level wire of length L at a half-wave,
     1.47 dB more at 1.5 wavelengths, 1.53 at four and 1.56 at eight; between whole
     numbers of half-waves the sum gives a fraction of a decibel the other way (−0.13 dB
     at 0.6 and 0.75 wavelengths, −0.63 at 1.25), where nothing in the engine can check
     it. So the long wire's level is unchecked off the odd half-waves, and about 1.3 to
     1.6 dB low on them.
   - *At the join.* Where Outpost changes from the dipole to the long wire, at 0.55
     wavelengths, the long wire as Outpost writes it read 0.72 dB below type 23 for the
     10 m wire 6 m up (16.49 MHz), 0.99 dB for a 20 m wire 6 m up and 0.85 dB 10 m up
     (8.24 MHz), at 5° to 30°; at a half-wave 1.36 dB. Neither model is adjusted to meet
     the other, and the screen says so where the bands stand side by side.
   - *A length in metres is read between patterns.* The engine works out a pattern for
     each whole megahertz and reads between them. A length in metres is a different
     number of wavelengths at each, and for a long wire the two patterns differ: 82 m of
     wire at 5.33 MHz (1.46 wavelengths; 1.37 at 5 MHz and 1.64 at 6) read up to 11.7 dB
     away from the pattern of the wire at 5.33 MHz itself; 10 m at 21.22 MHz, within
     0.1 dB. So Outpost writes the long wire's file for one frequency at a time, with
     its length and height in wavelengths there (negative figures, as VOACAP takes
     them), and runs each such frequency on its own.
   - *Gain added and feedline loss.* The type 41 file has no "gain above dipole" line,
     and its first line ("Max Gain dBi") moves nothing (seen: the same pattern at 0 and 3).
     So Outpost lowers the requirement the engine is given by the antenna's net figure and
     adds the figure to the ratio, the signal, the field strength (the transmitting end's
     only), each end's gain, and takes it off the system loss. Run both ways with the
     dipole, whose file does carry the line: the same to 0.01 in every figure at every
     hour, except the transmitting gain printed at take-off angles below 2° (0.15 to
     0.21 dB apart). The engine reads the requirement to a tenth of a decibel, as it reads
     the gain line. (Raising the transmitter's power instead was tried and is worse: the
     engine reads power to a tenth of a watt, which is half a decibel at half a watt.)
   - *Shorter than a half-wave* it gives figures too: 10 m of wire 6 m up read 3.3 dB
     below a half-wave dipole at 7.1 MHz and 3.6 dB below at 3.65 MHz. They are not used.
     Its current there is largest at the feed, and the model feeds it against something;
     an end-fed half-wave has nothing at its feed to return that current (no ground, no
     counterpoise, and a matching unit made for the high impedance of a half-wave), so
     what the real antenna does depends on its feedline, which no model here describes.

   **Why it is labelled approximate.** VOACAP's source marks which of these models "have
   been checked against the equations in Ma and Walters (1969) and where necessary
   brought into agreement with that report"; the sloping long wire is not one of them
   (`mufesgan.for`, the list of KOP numbers at its head). Its level is about 1.3 to
   1.6 dB below the dipole where the two can be compared and unchecked elsewhere. Its
   current is a standing wave with no loss along the wire, which a real long wire is
   not, increasingly so the longer it is. The program's manual's caution about wires a
   whole wavelength or more long (finding 1) is about its centre-fed models' feed point,
   which the long wire does not share, but it is a caution all the same. And nothing here
   was compared with NEC or a real antenna.

   **Why no upper limit.** The check against the dipole holds to within 0.2 dB from 0.5
   to 7.5 wavelengths, and with a file per frequency the engine's reading between
   patterns is gone, so the engine itself gives no reason to stop below 30 MHz. The
   range used, from 0.55 wavelengths to 30 MHz, is Outpost's choice; a shorter one
   would be safer against a long wire's lobes being narrower than anyone knows the
   bearing of their wire, and is a change to `wireOn` alone.

4. **Other models looked at.**
   - *Type 28 and 38, the inverted L, and type 44, the arbitrary tilted dipole*: run
     since, and not used; see "Other antennas looked at" below. *Type 35, the vertical
     dipole*: fed at its centre. *Type 47, the vertical with a ground screen*: an end-fed
     half-wave has no radials. Neither run.
   - *Type 23 on an odd harmonic* (three half-waves) would describe the same standing
     wave as the long wire, and was used above as a check; it is not used for figures,
     so that a level wire is run one way on every band longer than a half-wave.

**What was there before.** The generic antenna "End-fed half-wave, horizontal at 6 m" is
now **End-fed half-wave recut for every band, horizontal at 6 m**: it was always a wire
whose length follows the frequency, and beside wires of one length that needed saying.
Nothing about it changed but its name. A prediction saved with it, and a profile of that
kind, are the same antenna they were and give the same answers.

### A sloping wire

Twenty metres of wire is seldom level and never upright in the field: it is fed near the
ground and run up a pole or a tree. Outpost runs such a wire as **VOACAP's sloping long
wire (type 41) at its slope**: the same model as a level wire longer than a half-wave
(above), given the wire's slope, its length and the height of its low end, where it is
fed, the last two in wavelengths at each frequency in a file of its own. The engine's
reference direction runs from the feed up the wire, so it is given the bearing of the
high end.

| Where | Run as | Shown as |
| --- | --- | --- |
| A half-wave or longer (from 0.45 wavelengths) | Type 41 at the wire's slope | Figures, marked **approximate** everywhere, exactly as a level wire's approximate bands are: "Approximate: VOACAP's sloping long wire, at the wire's slope; its level is unchecked, a few decibels either way" |
| Shorter than a half-wave | Nothing | **Not modelled**, no figure, for the reason a level wire is not |

There is no "modelled" band: the half-wave band is approximate too, because no model in
the engine checked against another describes a sloping wire (below). One model on every
band with figures, so there is no step between two models to speak of.

The slope may be 10° to 60°, the slopes run here; the low end 0 to 50 m up. The 20 m
preset is fed 1.5 m up and rises at 25° to about 10 m, a 10 m fishing pole or a tree.

**What the engine does with a sloping wire.** Run on 16 November 2026 (hfcast 2.14.0,
VOACAP 16.1207W); the runs are kept as tests in
`apps/server/test/propagation-sloping.test.ts`. Gains are means at take-off angles from
5° to 30°, sampled as in the section above, over average ground. "Up" is towards the high
end, "down" the other way, "broadside" across the wire.

- *It is weak towards its high end.* The 20 m preset: 7.1 MHz (0.47 wavelengths) up
  -14.3 dBi, broadside -4.1, down -4.5; 10.12 MHz (0.68) up -10.4, broadside +0.9, down
  0.0; 14.18 MHz (0.95) up -12.3, broadside -6.6, down -1.0; 18.12 (1.21) up -7.5, down
  +3.0, 45° off down +3.7; 21.22 (1.42) up -9.6, down +0.5; 24.94 (1.66) up -6.2, down
  +3.8; 28.85 (1.92) up -8.8, down +0.4. On its half-wave band broadside and down are
  about equal; from a whole wavelength up, broadside falls away (a null there, as for a
  level wire) and the strongest directions move towards the line of the wire, down the
  slope and 45° either side of it.
- *With the slope.* 20 m of wire fed 1 m up: at 10° to 30° the high end's side is 5 to
  14 dB the weaker on every band from 40 m to 10 m. At 45° and 60° it is still the weaker
  on 40 m, but on 17 m to 10 m it turns over: at 24.94 MHz, 20° up -8.3 and down +3.9 dBi;
  45° up +3.0, down -2.1; 60° up +4.0, down -3.1. So for a steep wire on the high bands,
  "low end towards the other station" is the wrong way round; give the bearing.
- *The difference comes from the ground.* Over a ground that reflects everything the
  half-wave sloping wire is the same towards either end, to 0.05 dB (20° and 45°): its
  current is the same about its middle. Over real ground the reflection of the upright
  part of the field is weak at low angles, and what is left is the wire's own field,
  which is not the same both ways along a sloping wire.

**"Turned towards the other station".** With no bearing given, a sloping wire is turned
with its **low end towards the other station and its high end away** (the engine is
given the back bearing). That is the side the engine shows the stronger at low angles on
the wire's half-wave band at every slope tried, and on every band at slopes up to 30°.
The answer says which way it was turned ("its high end towards 131° (away from the other
station)"); a coverage map with no bearing turns the low end to each cell in turn and
says so. The form says it under the field, and the field is set apart, because which way
a sloping wire rises decides more of its figures than anything else about it.

**Its level, and what can check it.** Type 41 divides by the resistance of a monopole of
the wire's length over perfect ground, whatever the slope and height. At an odd number of
half-waves a *level* wire can be held against VOACAP's dipole (above); a *sloping* wire
has nothing in the engine with the same current to be held against. VOACAP's tilted
dipole (type 44) is the only other sloping model, and it is unchecked too and disagrees
in shape (below). So a different check was made, which needs no second model: **the power
in the whole pattern.** Over a ground that reflects everything (the engine takes a
conductivity of 10 000 S/m), a lossless antenna sends out exactly what it is fed, so its
gain summed over the sky above it is 0 dB. The sky was sampled with paths from 8 to
6500 km (take-off angles from about 1° to 89°) and the antenna turned in steps of 10°;
each whole degree of elevation is weighted by its share of the sky. The check was checked
first: VOACAP's vertical monopole a half-wave high reads -0.12 dB; a quarter-wave -0.65,
which is its own "antenna efficiency" of -0.57 dB and 0.08 dB of sampling; steps of 5°
in place of 10° move a result by 0.06 dB at most. Seen:

| | 7.1 | 10.12 | 14.18 | 18.12 | 21.22 | 24.94 | 28.85 MHz |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20 m preset, 25° from 1.5 m | -3.23 | +1.84 | -2.53 | +1.18 | -2.50 | +1.22 | -2.38 dB |
| SPOOLTENNA preset, 17° from 1.8 m | -5.03 | +0.76 | -2.67 | +1.47 | -2.56 | +0.57 | -2.27 dB |
| 20 m level, 6 m up (type 41, as a level wire is run) | -4.21 | +0.51 | -1.22 | +2.17 | -0.86 | +1.73 | -1.48 dB |

and for 20 m of wire fed 1 m up on 7.1 MHz: 10° -9.10 dB, 20° -4.85, 30° -2.62, 45°
-1.06, 60° -0.55, upright -0.46. The model is low near whole numbers of half-waves and
high between them, and furthest off for a shallow wire near the ground on its half-wave
band. More out than in is impossible over any ground, so where it reads high it
overstates. Where it reads low, part of that may be real: over real ground some power is
lost in the ground near the antenna, which no model here works out. So its figures are
read as "a few decibels either way", and the screens say so. Outpost does not correct
them by these figures: they are a check of the model, not a measurement of the antenna.

The same check, as a by-product, on the antennas there before (not changed): VOACAP's
dipole a half-wave long 6 m up reads -1.25 dB on 7.1 MHz and +0.52 on 14.18 (it refers its
gain to a dipole in free space and fades its gain towards the zenith value at high
angles); the level long wire, 10 m of wire 6 m up, +1.40 on 18.12, +1.73 on 21.22, -0.99
on 24.94 and -2.02 on 28.85. The level long wire was already labelled approximate; these
say its level is unchecked by more than the 1.3 to 1.6 dB measured against the dipole at
odd half-waves.

**What cannot be checked here.** Nothing above was compared with NEC or with a real
antenna. The check of power assumes the current the model assumes (a standing wave with
no loss along the wire, nought at the far end); whether a real sloping wire carries that
current, with its feedline and transformer at the low end and no counterpoise, the engine
cannot say.

### The SPOOLTENNA

SPOOLTENNA is a trade mark of Panther Creek Solutions LLC, used here only to say which
antenna is meant. What it is, from the maker's own documents, read on 16 November 2026
from spooltenna.com ("Documentation"):

- *SPOOLTENNA PARKS Owner's Manual*, model PARKS-EFHW4010 v1.3, dated 8/19/2026
  (`SPOOLTENNA_v1.3_Owner_s_Manual_081926.pdf`), and *SPOOLTENNA ULTRA Owner's Manual*,
  model ULTRA-EFHW4010 v1.6, dated 8/19/2026 (`ULTRA_v1.6_Owner_s_Manual_081926.pdf`);
  and the *Comparison Chart* (created 8 March 2026).
- Both are a "40-10M End Fed Half Wave Antenna": "This circuit consists of a 49:1
  impedance ratio transformer achieved through a 7:1 turns ratio. A 100pF, 1kV
  capacitor is also included across the feed point" (3 kV in the ULTRA).
- "The radiating element is approximately ½ wavelength for 40M (approximately 65 feet)";
  "Length: 65 ft 20AWG tinned copper wire (antenna wire is factory tuned, with additional
  length available for end-user final tuning)" (PARKS); 65 ft of 26 AWG copper-clad steel
  (ULTRA). No loading coil and no link is mentioned in either.
- Bands: 7.0 to 7.3, 14.1 to 14.35, 21.0 to 21.45 and 28.0 to 29.7 MHz. "Power: 100W
  SSB, 50W CW & digital". SWR "≤1.5:1 within the 40, 20, 15, and 10M bands".
- "A counterpoise may be added ... but it is not necessary. Without the counterpose the
  outside braid of the coax feed line serves as the return path."
- Put up as a sloper: Figure 3 ("Option A"), the spool about 25 ft up a mast or tree and
  the far end about 6 ft up a post, about 60 ft of wire over about 57 ft of ground; Figure
  4 ("Option B"), "the sloping direction can be reversed": the spool about 6 ft up near
  the operator and the far end about 25 ft up.

Offered as **SPOOLTENNA (PARKS or ULTRA), 65 ft wire, sloping as its manual shows**: 19.8 m
of wire, its low end 1.8 m up, rising at 17° (which with 19.8 m of wire puts the far end at
7.6 m, the manual's 25 ft), as Figure 4. That is all the engine is given. On the four bands
it is sold for the wire is 0.47, 0.94, 1.40 and 1.91 wavelengths long, and every figure is
approximate; on 80 m and 60 m it is not modelled. Not modelled: the transformer's loss and
the capacitor, the coax braid the maker says carries the return current, the wire's
gauge, and every claim of the maker's. Figure 3 (the spool at the top) is not offered,
because Outpost's sloping wire is fed at its low end: run in the engine with the feed at
the top (a slope of -17° from 7.6 m), it read within 0.6 dB of Figure 4 along the wire on
40, 20, 15 and 10 m, but 1.5 dB lower broadside on 20 m on average, and up to 4 dB apart
near the nulls on 10 m, so it is not the same antenna to the engine. Someone with a
SPOOLTENNA put up another way can make a profile of a 19.8 m sloping wire.

The 20 m preset and the SPOOLTENNA differ only in how they are put up: 20 m and 19.8 m of
wire, 25° from 1.5 m and 17° from 1.8 m.

### Other antennas looked at

Each was decided on one rule: a named, published model in the engine, checked by running
it, or it is left out with the reason. VOACAP's antenna types are those of `iongain.for`
(ITSA-1, types 21 to 30) and `mufesgan.for` (ITS-78, types 31 to 47, KOP 1 to 17) in
voacapl commit `c12a98b`; their lists are at the head of each.

- **Inverted L** (types 28 and 38): *not used.* Both are a vertical of height H fed against
  the ground with a level top of length L, and the current they assume is a standing wave
  nought at the far end, which is an end-fed half-wave's. But both divide by the
  resistance of the upright part alone. Run with 20 m of wire, 9 m up and 11 m along, the
  check of power gave, for type 28 over a perfect ground, +2.64 dB on 7.1 MHz, +2.14 on
  10.12, +3.54 on 14.18, +1.08 on 18.12, +8.37 on 21.22, +7.88 on 24.94, +4.50 on 28.85;
  type 38 over sea water from -1.22 to +4.80, above nought on six bands of seven. More out than in. Type 38 also takes off a loss
  for the ground of its own (`FMULT` in `mufesgan.for`): with no top at all it read 4.3 dB
  (7.1 MHz) and 5.5 dB (14.18 MHz) below VOACAP's vertical of the same height over
  average ground, where type 28 read +1.19 and 0.00.
- **Inverted V, end-fed** (the middle up a pole, both ends low): *not offered.* VOACAP has
  no model of two legs; no model of an end-fed wire bent in the middle. On its half-wave
  band the current is the same as a centre-fed inverted-V's, and that is the existing
  **Inverted-V** (VOACAP's dipole at the mean height, an approximation); on its harmonics
  there is nothing, so an end-fed inverted-V preset would have figures on one band only.
- **Tilted dipole** (type 44) for the sloping wire's half-wave band: *not used.* It is the
  only other sloping model. Over a perfect ground it allows for the ground under a level
  dipole (-0.04 dB at no tilt), but tilted it read -2.14 dB at 10°, -2.73 at 20°, -2.35 at
  30°, -0.97 at 45° and +1.25 at 60°. Over average ground it gave the same gain towards
  either end to 0.2 dB (20 m of wire, 20° from 1 m, 7.1 MHz: -4.1 dBi both ways), where
  type 41 with much the same current gave -17.3 up and -5.6 down, and where over a
  perfect ground the two agree in being the same both ways. One sloping model on every
  band, with its own unchecked level, was preferred to two that disagree in shape at the
  join. The program also stops (`TIP > X`) if the low end of a tilted dipole is below
  ground.
- **Random wire with a 9:1 transformer** (8.8, 12.5, 16, 21.6, 25.6, 32.6 m and so on,
  lengths chosen to be no half-wave on any band): *no preset; make a profile.* It is a
  wire of a stated length, and the three states apply as they are: where it is longer
  than a half-wave, type 41 is a model of the current on the wire, whose level the check
  above puts within about 2 dB either way; where it happens to be about a half-wave, the
  dipole; where it is shorter, it is fed against a counterpoise or the feedline, which no
  model here has, and no figure is given. "Approximate" is the right label wherever there
  is a figure but the half-wave band, which a random wire avoids by design. The
  counterpoise's own radiation is not in any of it.
- **Linked or resonant dipole**: the dipoles already offered (horizontal 5 m and 10 m,
  inverted-V); found by "linked" or "resonant".
- **Off-centre-fed dipole**: *no preset of its own.* On its fundamental and wherever it is
  a whole number of half-waves its current is that of a level end-fed wire of the same
  length (nought at both ends, the same standing wave), so the level wire of its length
  is its model, and the 20 m level wire is found by "OCFD". Between those lengths the
  two differ, and the end-fed model's approximate label covers that.
- **Quarter-wave vertical with raised radials**: already offered (type 22).
- **Short loaded whips and telescopic verticals**: *no preset.* Type 22 takes a height
  shorter than a quarter-wave and takes off its own "antenna efficiency" below 0.35
  wavelengths (about 4 dB at 0.12 wavelengths, 12 dB at 0.05), which neither its manual
  nor its source attributes to any ground system; and the loss that matters most in such
  an antenna, its coil's and its counterpoise's, is not in the engine at all. Any figure
  in a preset would be one Outpost made up. A whip can be made as a profile: the
  quarter-wave vertical with the loss from the maker's data or a measurement typed as a
  negative gain ("Negative for a short or loaded antenna"), and the pattern of a short
  monopole is close to a quarter-wave's.
- **Small transmitting loop** and **delta loop**: *not offered.* VOACAP has no loop of any
  kind among types 21 to 47 (rhombics, monopoles, dipoles, Yagis, log-periodics,
  curtains, vees, inverted L, long wire, tilted dipole, rhomboid, vertical with radials,
  and tables of gain).

## The engine

### What runs

VOACAP (Voice of America Coverage Analysis Program, version 16.1207W) was written by
the United States Institute for Telecommunication Sciences from its IONCAP. It is the
program most HF planning rests on. Outpost runs it as **hfcast**, a translation of
VOACAP into Rust (Apache-2.0), compiled to WebAssembly:

- `engines/voacap/engine/voacap.wasm` (564 kB) is the engine and Outpost's bridge to it.
  One file runs on macOS, Windows, Linux and a Raspberry Pi; there is no binary per
  platform and nothing to compile on the computer that runs Outpost.
- It runs in a worker thread, started on the first prediction and ended after five idle
  minutes.
- Its system calls are answered from memory (`voacap/wasi.ts`). The only files the
  engine can see are the data files Outpost hands it; it cannot read or write anything
  else on the computer.
- The engine and every data file are checked against recorded SHA-256 checksums each
  time the engine is loaded. A file that does not match is refused and named, and so is
  a set with a file missing: the engine never runs on part of its data.

Everything outside `apps/server/src/modules/propagation/voacap/` knows only the
interface in `engine.ts` (`circuit`, `ionosphere`, `listing`, `describe`, `datasets`),
so another engine can be put behind it. The ITU's P.533 is one, in
`modules/propagation/p533/`, used only for the side-by-side comparison
([A second model](#a-second-model-itu-p533)).

### Why this engine

Looked at on 16 November 2026.

| Candidate | What it is | Licence | State | Verdict |
| --- | --- | --- | --- | --- |
| [ITU-R-Study-Group-3/ITU-R-HF](https://github.com/ITU-R-Study-Group-3/ITU-R-HF) | The ITU's own C implementation of Recommendation P.533-14 with P.372 noise (ITURHFProp) | No licence file. A statement that it "may be used by implementers ... free from any copyright assertions"; four headers say "All rights reserved. No part of this publication may be reproduced, by any means whatsoever, without written permission of ITU" | Last commit May 2025 | Not chosen. Needs 134 MB of ionospheric maps (twelve files of 11 MB). Has no antenna models: a gain table must be supplied for every antenna, which Outpost would have to compute itself. Not one of Outpost's licences. Used here as an independent check, and since as the optional second model, built on each computer and never shipped ([A second model](#a-second-model-itu-p533)) |
| [jonathanmcsweet/hfcast-engine](https://github.com/jonathanmcsweet/hfcast-engine) | VOACAP translated to Rust, no dependencies | Apache-2.0 | Created August 2026, last commit 27 October 2026, two stars, one author | **Chosen**, in its `Compatible` tier only. Its claim to print what the Fortran prints was tested here and held |
| [v0l/antenna-toolbox](https://github.com/v0l/antenna-toolbox) | A Rust application for antenna modelling, a NanoVNA and path planning | GPL-3.0 | Created September 2026 | Not usable: GPL-3.0 |
| [jawatson/voacapl](https://github.com/jawatson/voacapl) | VOACAP itself, the Fortran, built for Linux | US Government work; the port's changes CC0 | Last commit March 2026 | Not chosen as the engine: Fortran needs a compiler per platform and writes scratch files beside its data. Used here as the reference |
| [WU6P/VOA](https://github.com/WU6P/VOA) | VOACAP translated to JavaScript | MIT | Last commit October 2026 | Not examined beyond its README. It would need no WebAssembly. Worth a look as a second engine |
| [VE3NEA/DVOACAP](https://github.com/VE3NEA/DVOACAP) | VOACAP in Pascal | MIT | Last commit September 2026 | Isotropic antennas only |
| im-alfa/p533-rs, liamsto/hfstat | P.533 in Rust | MIT; no licence file | 2026 | Neither publishes validation results |

hfcast also carries two things Outpost does not use: a "corrected" tier that departs
from VOACAP, and "Truecast", its author's own daily model. Neither is an established
model, and only the tier held to the original is run.

The choice has one weakness: hfcast is three months old and has one author. What stands
against that is the comparison below, the pinned commit, and the interface that lets it
be replaced.

### How it was checked

All of this was run on 16 November 2026 on an Apple M2 Max; the Fortran in Docker
(Debian 12, linux/arm64, gfortran 12.2.0).

**Against the Fortran original.** voacapl (commit `c12a98b`) was built from source and
given the same questions, as the card decks and antenna files Outpost's engine writes.

| Circuit | Lines printed | Outpost's engine against Fortran built with `-O2 -ffp-contract=off` | against Fortran built with `-O2` alone |
| --- | --- | --- | --- |
| London to Birmingham, November 2026, SSN 83, 5 W, dipoles at 5 m, urban noise, 45 dB-Hz, ten frequencies | 683 | identical, every character | 2 cells differ by one in the last printed digit |
| London to New York, June 2027, SSN 76, 100 W, vertical to a dipole at 10 m, rural noise, 24 dB-Hz, nine frequencies | 683 | identical | 1 cell |
| Tangier to Belgrade, March 2028, SSN 40, 25 W, isotropic with gain and loss, remote noise, 15.2 dB-Hz, eleven frequencies | 683 | identical | 1 cell |

The second column is the Fortran compiler fusing multiplications and additions on this
processor, which changes the last bit of some sums; with that switched off, the Fortran
and the translation print the same text. These three listings are kept in
`apps/server/test/fixtures/propagation/` and the server's tests hold the engine to them
with no tolerance.

The same three listings came out identical from the WebAssembly engine on macOS arm64,
in a `node:24-slim` container on linux/arm64, and in one on linux/amd64 under emulation.

hfcast's own test suite (`cargo test --release --all-features`), pointed at the data tree
the Fortran build installs, passed here: 371 tests, none failed.

**Against a different model.** The ITU's ITURHFProp (P.533 version 14.2, P.372 version
14.3) was built from source in the same container. Its nine reference inputs reproduced
the outputs committed in its repository line for line. It was then given London to
Birmingham for November 2026 with isotropic antennas, 5 W, "CITY" noise and a 1 Hz
bandwidth, and VOACAP the same.

| Over 24 hours, P.533 against VOACAP | SSN 60 | SSN 100 | SSN 140 |
| --- | --- | --- | --- |
| MUF, mean difference (largest) | 0.11 MHz (0.25) | 0.17 MHz (0.37) | 0.23 MHz (0.48) |
| Hours in which 7.1 MHz is above the MUF | the same 16 | the same 14 | the same 13 |
| Noise at 7.1 MHz, mean difference | 0.5 dB | 0.5 dB | 0.5 dB |
| Field strength at 7.1 MHz while below the MUF, mean difference (largest) | 8.0 dB (10.6) | 5.2 dB (9.1) | 4.0 dB (7.1) |

The two models agree on when the path is open and on the noise. P.533 gives a weaker
signal than VOACAP while the path is open, by 4 to 8 dB on average here, and the two
treat frequencies above the MUF quite differently. The cause was not traced. They are
different models, and neither was compared with measurements here. A reader should take
VOACAP's signal figures as one model's answer, good to several decibels at best.

**Not done.** No prediction was compared with signals measured on the air. The online
VOACAP service was not queried: its site forbids automated access, and a by-hand
comparison would repeat the Fortran one. Nothing was run on Windows, on a real
Raspberry Pi or on an Intel Mac.

### Speed

`node apps/server/src/cli/bench-propagation.ts` measures these on any machine.

| | Apple M2 Max, macOS | linux/arm64 container on the same Mac |
| --- | --- | --- |
| Load the engine and data, first answer | 19 ms | 89 ms |
| One day on all nine bands | 4.6 ms | 5.5 ms |
| Everything one planner screen asks for | 26 ms | 30 ms |
| One day, one frequency, one place (a coverage cell) | 2.5 ms | 2.8 ms |
| A coverage grid: coarse 208 cells, medium 832, fine 1,872 | 0.6 s, 2.2 s, 4.9 s | not measured |
| A communication plan of eight stations (28 pairs, 56 runs): three bands, all nine | 0.2 s, 0.3 s | not measured |

The container has the Pi's architecture, not its speed: a Raspberry Pi will be several
times slower, and that has not been measured. The grid and plan rows were measured in
the second sitting, on the same Mac while other work was running on it; see
[How large, and how long](#how-large-and-how-long).

### Answers already worked out

An answer is kept in the database under a key made from the question (as the engine
reads it: positions to a hundredth of a degree, frequency to 10 kHz, power to a tenth
of a watt), the sunspot number, the solar table's checksum, the engine's checksum and
the data's version. The same key is always the same answer. The 300 most recently used
are kept. `POST /api/radio/propagation/predict?background=true` runs the same work as a
job, for anything long.

Coverage maps and plans' matrices are kept the same way, under keys made the same way,
and counted apart: they are large (a fine coverage map is about a megabyte) and few.
The eight most recently used are kept beyond those a person saved by name and those
that belong to a plan, which are never dropped while the saved map or the plan exists.
The eight are counted among the ones nothing pins: however many maps are saved and
plans worked out, a map just made is still there to be saved.

Reading an answer because someone asked for it counts as a use of it. Listing does
not: the list of saved maps and the list of plans read no stored result and write
nothing. A plan's "worked out" is whether its key is there. A saved map's three figures
(when it was worked out, its sunspot number, its cells) are read out of the stored
result by SQLite the first time a list wants them, about 4 ms for a fine map, and
remembered while the server runs. Ten saved fine maps (684 kB each) took 88 ms and ten
writes every time the list was fetched; now 41 ms for the first list after a start and
0.6 ms after, with no writes.

At most three coverage maps wait or run at once, and the same map asked for twice is
one job. Both are found by asking the queue for coverage jobs by type, so they hold
however much other work has been queued since.

The sunspot number found from a measured foF2 is part of that key, and finding it is a
search: ten or eleven questions to the engine. The number is remembered, while the
server runs, by the path, the month, the foF2, the hour, the engine and the data, so
that a kept answer, a comparison or the printed page of the same question does not
search again. After a restart the first of them searches once.

### Rebuilding the engine

Running or packaging Outpost needs none of this; the built file, the data that ships
and the list of the data that does not are committed.

```bash
rustup toolchain install 1.97.1 --profile minimal --target wasm32-wasip1
node scripts/build-hf-engine.mjs            # build and replace engines/voacap/engine, data and coefficients.json
node scripts/build-hf-engine.mjs --check    # build and compare with what is committed
```

The script writes the antenna files to `engines/voacap/data/` and the coefficients, which
are not committed, to the tests' copy in `engines/voacap/.cache/`, and records both
lists. `--check` was last run on 16 November 2026 with the toolchain stood in for (the
committed WebAssembly in place of a build, the engine's files from `embedded/` at the
pinned commit): the lists it writes are the committed ones, byte for byte.

The script fetches hfcast at the commit pinned in it, applies `engines/voacap/wasm.patch`
(15 lines in a test harness Outpost never calls, so that it compiles where there are no
symbolic links; no arithmetic is touched), and builds `engines/voacap/wrapper`. A clean
rebuild on the same machine gave the committed file byte for byte.

To run the reference circuits through the Fortran again:
`node apps/server/test/fixtures/propagation/make-decks.ts <folder>` writes the decks and
antenna files, and `apps/server/test/fixtures/propagation/voacapl.Dockerfile` builds the
Fortran at the commit used here and says how to run them.

## Data

**Engine and data** lists what is installed with versions, sizes, where each came from
and when, and checksums.

| Set | Size | Ships with Outpost | Can be fetched |
| --- | --- | --- | --- |
| Antenna definitions and the version file (29 files, NTIA/ITS) | 15 kB | Yes | No |
| VOACAP's ionospheric and noise coefficients (15 files) | 559 kB | **No** | Yes, once, when you ask, or at set-up |
| Solar cycle prediction | 17 kB | Yes, dated 16 November 2026 | Yes, when you ask |
| ITU P.533 ionospheric and noise maps (25 files), for the second model only | 137 MB | No | Yes, when you ask, from the ITU's repository |

### VOACAP's coefficients: a one-time download

The engine cannot predict without its monthly maps of foF2 and M(3000)F2 (CCIR Report
340) and of atmospheric radio noise (CCIR Report 322). The ITU has not given permission
for those to be passed on ([Licences and attribution](#licences-and-attribution)), so
Outpost does not ship them. They are fetched once, and after that nothing changes and
nothing more is fetched:

- **In the app.** Until they are here, the planner, coverage maps, communication plans
  and the contact log's comparison each show one line where the form would run: what is
  missing and how big it is, why it is not shipped, and **Download (559 kB)**. Pressing
  it fetches the 15 files from the engine's own repository
  (`raw.githubusercontent.com/jonathanmcsweet/hfcast-engine`, at the commit the engine
  was built from) through the download manager: it is a row under Downloads, can be
  paused and resumed, and every file and the whole are checked against
  `engines/voacap/coefficients.json` before anything is installed. As soon as it
  finishes the screens work; nothing needs restarting. Nothing is fetched until the
  button is pressed, and the app never fetches them by itself, on start-up or later.
- **At set-up,** so that a box prepared once works offline at once:
  `node scripts/fetch-voacap-data.mjs --data-dir <data directory>` (the same list, the
  same checksums; [deployment.md](deployment.md) gives the line for each way of
  installing). `deploy/pi/install.sh` runs it unless given `--no-voacap-data`. With
  `--from <folder>` it takes the files from a folder instead of the network.

Where they are kept: `<data directory>/propagation/voacap-coefficients/`, with
`installed.json` saying how they came, from where and when. The engine reads only that
copy, so a storage location that is away does not stop predictions. A download also
leaves the downloaded file on a storage location, as a collection, so that it is listed
under **Manage and clean up**; removing it there, or with **Remove** on **Engine and
data**, removes the engine's copy too, after saying that the planner stops working
without them. If the data directory's copy goes and that file is still there, it is put
back from it on the next start, or when Download is pressed, with no request. A portable
drive takes the engine's copy with it.

Checked when loaded: all 15 files are read and hashed each time the engine starts (a few
milliseconds). A file missing or not matching is named, the engine refuses to run, and
the planner offers the download again; it never runs on part of the set or an altered
one.

### An installation from before this change

Until 16 November 2026 the coefficients were in the app folder
(`engines/voacap/data/itshfbc/coeffs/`), which a deploy replaces. On the first start
after the change, if the data directory has no copy and the app folder (or the checkout,
when running from source) still holds the files and every one matches its checksum, they
are **copied into the data directory with no download** ("Taken over from the app folder
of an earlier Outpost" on Engine and data). A copy someone placed in
`<data directory>/propagation/voacap-data/itshfbc/`, where an earlier Outpost looked for
one, is taken over the same way. The folder they came from is left as it is; the next
deploy's app folder no longer carries them. A deploy that replaces the app folder
**before** the new version first starts (`rsync --delete`, a new Docker image) leaves
nothing to take over: run the set-up line above first, with `--from` pointing at the old
app folder's `engines/voacap/data/itshfbc` if there is no internet, or press Download
afterwards.

### For the tests

The engine's tests need the real files. They are kept on each computer, not in the
repository, in `engines/voacap/.cache/` (ignored by git), filled once with the internet:

```bash
node scripts/fetch-voacap-data.mjs --cache
```

Each test server is given that copy in its data directory. Without it, the tests that
run the engine are reported as skipped, by name, with what is missing; the tests of the
download, the missing-data state, adoption and removal use small stand-ins and run
anyway. The end-to-end suite needs the copy and says so if it is not there.

Looked at and not offered:

- **Measured sunspot numbers** (SILSO, Royal Observatory of Belgium): CC BY-NC 4.0.
  NOAA's observed-indices file repeats them. Neither is shipped or fetched.
- **Ionosonde observations** (GIRO): CC BY-NC-SA 4.0, and shared only with people who
  hold an account with the data centre.
- **URSI-88 foF2 maps**: the ITU does not publish them itself; the CCIR maps are used.
- **Measured antenna patterns**: none.

## Licences and attribution

Outpost's rule is MIT, ISC, BSD or Apache-2.0 for what it ships, and it never bundles
copyrighted material without permission. The engine's code meets the first. Of the
engine's data, only NTIA/ITS's part ships; **the CCIR-derived coefficients are not
shipped** and are fetched once when a person asks:

| Part | Terms | Where read |
| --- | --- | --- |
| hfcast (the engine's code) | Apache-2.0 | its repository; `engines/voacap/engine/LICENSE-hfcast.txt`, `NOTICE-hfcast.txt` |
| VOACAP (what hfcast translates) and its antenna files: **shipped** | "NTIA/ITS has no objection to the use of this software for any purpose since it is not subject to copyright protection in the U.S." ITS's download page now asks that its disclaimer be kept "in any copied or derivative works" | the VOACAP distribution; its.ntia.gov |
| The coefficient files (the foF2, M(3000)F2 and atmospheric noise maps of CCIR Reports 340 and 322, about 350 kB, in the same files as about 195 kB of NTIA/ITS tables) and two short-whip patterns of unstated source: **not shipped** | The ITU publishes the CCIR data in its own P.533 and P.372 software, which "may be used by implementers in their implementation of the Recommendation ... free from any copyright assertions"; four headers of the same repository say "All rights reserved. No part of this publication may be reproduced, by any means whatsoever, without written permission of ITU" (both quoted in full below). The engine's repository, where Outpost fetches them, offers them under no licence: "Apache-2.0 covers the software in this repository. It does not cover these data files" | github.com/ITU-R-Study-Group-3/ITU-R-HF; github.com/jonathanmcsweet/hfcast-engine, `NOTICE` and `embedded/README.md` |
| voacapl's changes to VOACAP | CC0 | its repository |
| Solar cycle table | Public domain (United States Government work): "may be used without charge for any lawful purpose", without claiming it as your own, implying endorsement, or presenting a changed copy as official | weather.gov/disclaimer |

The full texts are in `engines/voacap/NOTICE.txt`, which travels with the packaged app.

### VOACAP's coefficients: which files, and why they are not shipped

Each file was classed by what is in it, from `engines/voacap/NOTICE.txt`, the hfcast
project's `NOTICE` and `docs/licence.md` (which name, from VOACAP's `REDMAP`, the arrays
each of the nine records of a month's file holds) and VOACAP's distribution. A file that
mixes NTIA/ITS and CCIR material is treated as CCIR, and so is one whose source could
not be found:

| File | Bytes | SHA-256 | What is in it | |
| --- | ---: | --- | --- | --- |
| `coeffs/coeff01w.bin` … `coeff12w.bin` | 38,552 each | in `engines/voacap/coefficients.json` | the month's M(3000)F2 map (Report 340) and noise maps (Report 322), with NTIA/ITS's sporadic-E, E, F1, F2 height-ratio and error tables | mixed: not shipped |
| `coeffs/fof2CCIR.daw` | 94,848 | `bd78d040…f7f` | the foF2 maps of Report 340 | CCIR: not shipped |
| `antennas/default/ccir.026`, `swwhip.voa` | 921, 943 | `66fc1af2…637`, `beac38eb…8dc` | a short whip's 91-angle pattern headed "SWWhip for REC533"; its source is not stated | unknown: not shipped |
| `antennas/default/` (the other 28) and `database/version.w32` | 14,548 in all | in `engines/voacap/data/dataset.json` | VOACAP's antenna definitions (a type code, dimensions, gain figures; `ccir.000` to `ccir.025` carry CCIR's names for antenna types) and its version string | NTIA/ITS: shipped |

All 15 not shipped: 559,336 bytes; the checksum of them one after another, in the list's
order, is `919e457a270626e5b0f2cc4726be81f556d414616be1c91200a36e1cb653f90f`.

They were bundled until 16 November 2026 on the strength of the ITU's first statement
below. The four headers that say "All rights reserved" were found since, and the
owner's rule is never to bundle copyrighted material without permission, so they left
the repository. **They remain in the git history of the branch that removed them**; a
squash merge keeps them out of `main`'s history from then on, but `main`'s earlier
commits carry them. The history was not rewritten.

Where they are fetched from, and on what terms: the hfcast repository, at the commit the
engine was built from (`bf34e8f9f375e190ed43fcac19f25d800992e0e6`), `embedded/`, over
GitHub's ordinary file addresses. On 16 November 2026 each of the 15 fetched from there
was byte for byte the file this repository held. NTIA/ITS publishes VOACAP only as a
Windows installer, and voacapl publishes the coefficients only as text sources its
installer converts, so neither offers these files as such. The hfcast repository offers
them under no licence and says so (`NOTICE`): "Apache-2.0 covers the software in this
repository. It does not cover these data files, which are the work of other bodies and
keep their own status." Its `embedded/README.md` adds: "Whether these files may be
redistributed to other people is an open question ... Embedding them for builds used on
one's own devices is not redistribution, which is why they are here while that stays
undecided." Outpost fetches them for the use of the person who presses the button, on
their own computer, and does not pass them on.

### The second model's terms

**ITURHFProp, P533 and P372, and their maps, are not under MIT or any open-source
licence**, and none of it ships with Outpost or is in its repository. The repository
(github.com/ITU-R-Study-Group-3/ITU-R-HF) has no licence file. At commit
`82017594a1c6cacfaa7e86954c4ae7b3a5825a3d` it carries two texts, quoted word for word:

1. `README.md`, lines 1098 to 1109 (and in nearly the same words in the headers of
   `P533/Src/P533/P533.c`, `P372/Src/P372/Noise.c` and
   `ITURHFProp/Src/ITURHFProp/ITURHFProp.c`):

   > The ITURHFProp, P533 and P372 software has been developed collaboratively by
   > participants in ITU-R Study Group 3. It may be used by implementers in their
   > implementation of the Recommendation as well as in revisions of the specific
   > original Recommendation and in other ITU Recommendations, free from any copyright
   > assertions.
   >
   > The software is provided “as is” WITH NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
   > BUT NOT LIMITED TO, THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
   > PURPOSE AND NON-INFRINGEMENT OF INTELLECTUAL PROPERTY RIGHTS.
   >
   > The ITU shall not be held liable in any event for any damages whatsoever
   > (including, without limitation, damages for loss of profits, business
   > interruption, loss of information, or any other pecuniary loss) arising out of or
   > related to use of the Software.

2. `P533/Src/P533/Common.h`, lines 37 to 40, and the same in `P372/Src/P372/Common.h`,
   `P372/Src/ITURNoise/Common.h` and `ITURHFProp/Src/ITURHFProp/Common.h`:

   > Copyright International Telecommunication Union (ITU) 2018
   > All rights reserved.
   > No part of this publication may be reproduced, by any means whatsoever,
   > without written permission of ITU

The first allows use by implementers of the Recommendation, which a P.533 engine is; the
second reserves all rights and forbids reproduction without the ITU's written
permission. Outpost does not read the first as overriding the second for
redistribution, so it redistributes nothing of the ITU's: the person fetches the source
and the maps from the ITU's repository and builds the engine for their own use. The
maps are fetched from that repository's `P372/Data/` folder (the ITU's own Linux
makefile installs the data from there), at the pinned commit, over GitHub's ordinary
file addresses (`raw.githubusercontent.com`), one request per file, when a person
presses the button. The ITU's own web page for Study Group 3's software
(itu.int, ITU-R, Study Group 3, "Software, data and validation examples for
ionospheric and tropospheric radio wave propagation", read 16 November 2026) offers
the same software as a Windows download, `ITU-R-HF_14.3.zip`, and says supplemental
software is provided "as is" without warranty and without any warranty that its results
conform to the Recommendation.

The same repository is where VOACAP's foF2, M(3000)F2 and noise maps were read (the row
above), and its headers carry the second text too; that is why those maps are no longer
shipped either ([which files, and why](#voacaps-coefficients-which-files-and-why-they-are-not-shipped)).

**If shipping is ever allowed** (the ITU's written permission, or the owner's decision),
it is one step: take the four `engines/p533/` lines out of `.gitignore`, commit
`engines/p533/engine/iturhfprop.wasm`, and add `engines/p533/engine` to what
`scripts/build-app.mjs` copies. Outpost already checks the file against the checksum in
`modules/propagation/p533/manifest.json` wherever it finds it. The maps would stay a
download. The full texts are also in `engines/p533/NOTICE.txt`.

## What is not built yet

- **The second model on coverage maps and plans**, and with antennas other than
  isotropic. See [What is not done](#what-is-not-done).
- **Multi-day planning** beyond one day at a time. Within a month every day is the
  same; across months, use **the same path with one thing changed**, **Months of the
  year**.
- **A coverage map of several bands at once**, or of the best band in each cell. One
  map is one frequency.
- **A job for a comparison of a long log.** A comparison is answered directly and takes
  the 500 most recent different paths.
- **Calibration** from logged contacts. The comparison counts and adjusts nothing.
- **ADIF's XML form** (`.adx`), and exporting the log as ADIF.

## Limits

- Radio and antenna profiles, saved predictions and coverage maps, communication plans
  and the contact log travel to a portable drive with the rest of the database, but
  changes made to them on the drive are not brought home by a merge. A solar table you
  downloaded does not travel; a drive uses the included one.
- They are a person's own data: they are in the database a backup holds, they are
  counted where **Manage and clean up** says what erasing everything would take, and
  erasing everything takes them, with every answer worked out (an answer holds the
  places it was asked about).
- Communication plans and logged contacts are not in the search across everything.
- 2 to 30 MHz. 160 m is outside the engine's stated range and is not offered.
- Short path only. The long way round the Earth is not predicted.
- Sporadic E is switched off, which is VOACAP's standard practice.
- The minimum take-off angle is 0.1°, the multipath settings and the required
  reliability of 90% are VOACAP's defaults as hfcast fixes them.
- Positions are read to a hundredth of a degree (about a kilometre).
- The coverage layer was looked at over the outline map and over the test suite's own
  made-up map tiles, in light and dark, at desktop width and at 390 px. No region of
  real map tiles was installed where this was built, so it was not looked at over one.
- Tested in Chromium. Not tried on a real phone.
