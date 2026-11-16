# HF propagation

Outpost can predict how well a shortwave (HF, 2 to 30 MHz) signal gets from one place
to another: hour by hour through a day, band by band, for the power, antennas and mode
you have. It works on the computer Outpost runs on, with no connection, and goes on
working for as long as you like without one.

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

### Reading the answer

- **The notice at the top** says what kind of knowledge the answer rests on and how old
  it is.
- **A few sentences** state, for the chosen hour: the path's MUF, on what share of days
  the frequency is below it, the reliability for the mode, a better band if there is
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
  those of the United Kingdom licence.
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

**Needs, dB** and **Measured in, Hz** are each used whenever they are filled in. A
bandwidth typed on its own is applied to the mode's starting figure: CW with 500 in
**Measured in, Hz** and **Needs, dB** left empty is asked as 24 dB in 500 Hz, which is
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
   sunspot number comes from. Changes are saved as they are made.
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

**Export as PDF** and **Export as Markdown** write the plan out to print and carry: the
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

Neither is sent anywhere: the file is made in the browser and saved by it.

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
- **Import an ADIF file** reads the log your logging program exports.

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
- **An antenna**: name, kind, height of the wire, the bearing its broadside faces (empty
  turns it towards the other station), the ground under it, gain added, feedline loss,
  the range it is used over, notes.

An antenna is always run as one of VOACAP's own antenna models:

| Kind | Run as | What that leaves out |
| --- | --- | --- |
| Horizontal dipole | VOACAP type 23, a horizontal half-wave dipole over ground at the height given, resonant on whichever frequency is asked about | A wire cut for one band, bent, sloping or near buildings |
| Inverted-V | The same dipole at the *mean* height of the wire | VOACAP has no inverted-V. A real one radiates a little less upwards and more off its ends. Labelled an approximation wherever shown |
| End-fed half-wave | The same dipole at the wire's height | VOACAP has no end-fed model. A sloping wire, harmonics and the matching unit's loss. Labelled an approximation |
| Quarter-wave vertical | VOACAP type 22 | A short or loaded vertical, or few radials: take the difference off as gain |
| Isotropic | The same gain in every direction | Not a real antenna; for comparing with other tools |

Gain added and feedline loss shift the whole pattern by that many decibels. A loss at
the receiving end is taken off the signal only: where outside noise dominates, as it
usually does on HF, a real receiver loses signal and noise together, so this is
pessimistic. Ground is one of four assumed pairs of constants (poor 4 and 0.001 S/m, as
VOACAP's sample files use; good 10 and 0.01; average 15 and 0.005; sea 80 and 5).

Two antennas of the same kind do not have the same pattern. A profile is one model of
that kind, not a measurement of yours.

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
  time the engine is loaded. A file that does not match is refused and named.

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

The sunspot number found from a measured foF2 is part of that key, and finding it is a
search: ten or eleven questions to the engine. The number is remembered, while the
server runs, by the path, the month, the foF2, the hour, the engine and the data, so
that a kept answer, a comparison or the printed page of the same question does not
search again. After a restart the first of them searches once.

### Rebuilding the engine

Running or packaging Outpost needs none of this; the built file and the data are
committed.

```bash
rustup toolchain install 1.97.1 --profile minimal --target wasm32-wasip1
node scripts/build-hf-engine.mjs            # build and replace engines/voacap/engine and data
node scripts/build-hf-engine.mjs --check    # build and compare with what is committed
```

The script fetches hfcast at the commit pinned in it, applies `engines/voacap/wasm.patch`
(15 lines in a test harness Outpost never calls, so that it compiles where there are no
symbolic links; no arithmetic is touched), and builds `engines/voacap/wrapper`. A clean
rebuild on the same machine gave the committed file byte for byte.

To run the reference circuits through the Fortran again:
`node apps/server/test/fixtures/propagation/make-decks.ts <folder>` writes the decks and
antenna files, and `apps/server/test/fixtures/propagation/voacapl.Dockerfile` builds the
Fortran at the commit used here and says how to run them.

## Data

**Engine and data** lists what is installed with versions, sizes, dates and checksums.

| Set | Size | Ships with Outpost | Can be fetched |
| --- | --- | --- | --- |
| Ionospheric and noise coefficients (44 files) | 650 kB | Yes | No |
| Solar cycle prediction | 17 kB | Yes, dated 16 November 2026 | Yes, when you ask |
| ITU P.533 ionospheric and noise maps (25 files), for the second model only | 137 MB | No | Yes, when you ask, from the ITU's repository |

A copy of the coefficients placed in `<data directory>/propagation/voacap-data/`
(`dataset.json` and `itshfbc/`) is used in preference to the included one.

Looked at and not offered:

- **Measured sunspot numbers** (SILSO, Royal Observatory of Belgium): CC BY-NC 4.0.
  NOAA's observed-indices file repeats them. Neither is shipped or fetched.
- **Ionosonde observations** (GIRO): CC BY-NC-SA 4.0, and shared only with people who
  hold an account with the data centre.
- **URSI-88 foF2 maps**: the ITU does not publish them itself; the CCIR maps are used.
- **Measured antenna patterns**: none.

## Licences and attribution

Outpost's rule is MIT, ISC, BSD or Apache-2.0 for what it ships. The engine's code
meets it. **The engine's data does not**, and that is the project owner's decision to
confirm:

| Part | Terms | Where read |
| --- | --- | --- |
| hfcast (the engine's code) | Apache-2.0 | its repository; `engines/voacap/engine/LICENSE-hfcast.txt`, `NOTICE-hfcast.txt` |
| VOACAP (what hfcast translates), its antenna files, and about 195 kB of the coefficients | "NTIA/ITS has no objection to the use of this software for any purpose since it is not subject to copyright protection in the U.S." ITS's download page now asks that its disclaimer be kept "in any copied or derivative works" | the VOACAP distribution; its.ntia.gov |
| The foF2, M(3000)F2 and atmospheric noise maps (CCIR Reports 340 and 322), about 350 kB | Published by the ITU in its own P.533 and P.372 software, which "may be used by implementers in their implementation of the Recommendation ... free from any copyright assertions". That wording is for implementations of ITU Recommendations, and VOACAP is not one | github.com/ITU-R-Study-Group-3/ITU-R-HF |
| voacapl's changes to VOACAP | CC0 | its repository |
| Solar cycle table | Public domain (United States Government work): "may be used without charge for any lawful purpose", without claiming it as your own, implying endorsement, or presenting a changed copy as official | weather.gov/disclaimer |

The full texts are in `engines/voacap/NOTICE.txt`, which travels with the packaged app.
If the coefficients must not ship, the alternative is already built in: leave
`engines/voacap/data` out of the package and have each person place the same files in
their data directory. Predictions then need that one step before they work.

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
above), and its headers carry the second text too.

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
