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
  and shows what VOACAP returns. If the engine or its data is missing or damaged, it
  says so and predicts nothing.
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
  those of the United Kingdom licence. With an end-fed wire of a stated length, a band
  the wire is not modelled on is hatched and reads "Not modelled" (it has no figure,
  which is not a poor figure), and **The wire on each band** gives the wire's length in
  wavelengths; see Equipment.
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

## A second engine: a proposal, not built

The specification asks for the engine to be replaceable and for results to be checked
against a trusted reference where possible. The first sitting checked VOACAP's signal
figures against the ITU's own P.533 software by hand (see
[How it was checked](#how-it-was-checked)). Running a second model inside Outpost, so
that a person could see two models side by side, was looked at on 16 November 2026 and
**was not started**.

| Candidate | What it is | Licence, as GitHub and the repository state it | State |
| --- | --- | --- | --- |
| [ITU-R-Study-Group-3/ITU-R-HF](https://github.com/ITU-R-Study-Group-3/ITU-R-HF) | ITURHFProp: the ITU's C implementation of Recommendation P.533 with P.372 noise. A different model from VOACAP | No licence detected. A statement that it "may be used by implementers ... free from any copyright assertions"; one header says "All rights reserved" | Last pushed 15 May 2025 |
| [im-alfa/p533-rs](https://github.com/im-alfa/p533-rs) | "A not-very Rusty port of the C impl of ITU-R P533 & P372" | MIT, by the porter. It is a translation of the ITU's code, so the MIT label stands on whatever the ITU's statement allows | Last pushed 10 March 2026, one star, publishes no validation |
| [WU6P/VOA](https://github.com/WU6P/VOA) | VOACAP translated to JavaScript | Not one GitHub recognises | A second copy of the same model. It would check the translation, which the Fortran comparison already does, and not the model |

Only P.533 is a second model, and it can be had two ways:

1. **Build the ITU's C to WebAssembly** (wasi-sdk), in the same sandbox as VOACAP.
2. **Build p533-rs to WebAssembly**, as hfcast is built.

Either way it would be held to ITURHFProp's own nine reference inputs and outputs,
which the first sitting reproduced line for line from a native build, on macOS arm64
and in linux/arm64 and linux/amd64 containers. What is in the way:

- **Licence.** Neither is cleanly inside Outpost's rule (MIT, ISC, BSD, Apache-2.0).
  The ITU's wording is for "implementers in their implementation of the
  Recommendation", which a P.533 engine is, so it fits better here than it does for
  VOACAP's data. It is still the owner's decision, as the coefficients already are.
- **Data.** P.533 needs the ITU's ionospheric maps: twelve files of 11 MB, 134 MB in
  all. They would be an optional download through the download manager, not shipped.
- **Antennas.** P.533 has no antenna models; it takes a gain table. Outpost must not
  compute patterns of its own, so a comparison would be for isotropic antennas only,
  as the first sitting's was.
- **What it would show.** Two models agreeing on when a path is open and differing by
  several decibels on signal, which the first sitting found. That is worth showing as
  "one model's answer, good to several decibels", not as a second opinion on which
  band to use.

Estimated at two sittings: one to build either candidate to WebAssembly reproducibly
and hold it to the nine reference outputs on three platforms (stopping there if it
cannot be), one for the adapter behind `engine.ts`, the optional dataset, and a
side-by-side view limited to isotropic antennas. Neither candidate was built or run in
this sitting; p533-rs's own tests were not run.

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
  ground under it, gain added, feedline loss, the range it is used over, notes.

An antenna is always run as one of VOACAP's own antenna models:

| Kind | Run as | What that leaves out |
| --- | --- | --- |
| Horizontal dipole | VOACAP type 23, a horizontal half-wave dipole over ground at the height given, resonant on whichever frequency is asked about | A wire cut for one band, bent, sloping or near buildings |
| Inverted-V | The same dipole at the *mean* height of the wire | VOACAP has no inverted-V. A real one radiates a little less upwards and more off its ends. Labelled an approximation wherever shown |
| End-fed half-wave wire, horizontal (a stated length) | VOACAP type 23 with the wire's length in metres, on the frequencies where the wire is about a half-wave (0.45 to 0.55 wavelengths). **On every other frequency: not modelled, no figure** | A sloping wire, the matching unit's loss, and every band on which the wire is not a half-wave, harmonics included |
| End-fed half-wave wire, vertical (a stated length) | VOACAP type 22, the vertical monopole, with the wire's length in metres as its height, on every frequency. The result says how long the wire is in wavelengths on each band | The matching unit's loss. Off the half-wave band the model is a wire fed against the ground at its base, which an end-fed half-wave is not: see below |
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

Four are offered as generic antennas: **End-fed half-wave, 10 m wire** and **5 m wire**,
each **horizontal** (the wire level, 6 m up) and **vertical** (the wire upright with its
bottom end at the ground). Ten metres of wire is a half-wave on the 20 m band and five
metres on the 10 m band. A profile can be a wire of any length from 4.5 to 82 m: the
lengths that are a half-wave somewhere between 2 and 30 MHz. A profile also sets the
height of a level wire, the ground and the bearing.

Nothing about a wire's pattern is worked out by Outpost. What it does is choose which
of the engine's models to hand the wire to, and refuse to give a figure where none of
them describes it.

**On each band the screen says which of three things the wire is:**

- **About a half-wave** (0.45 to 0.55 free-space wavelengths; a real half-wave wire is
  cut about 5% short of 0.5). Run as the table says. The limits are Outpost's own choice
  of where to stop trusting the half-wave model, not a figure from VOACAP. For the 10 m
  wire that is 13.5 to 16.5 MHz, the whole of 20 m and no other amateur band; for the
  5 m wire 27.0 to 30 MHz, the whole of 10 m.
- **Not a half-wave, run as a wire of this length** (the vertical wire only). The figure
  is the engine's for a vertical wire that long, fed at the bottom. The planner gives
  the length in wavelengths for every band under **The wire on each band**.
- **Not modelled** (the horizontal wire off its half-wave band). There is no figure. On
  the planner the band is hatched on the charts and reads "Not modelled" in the ranking;
  a prediction asked on such a frequency shows a notice in place of the figures; a
  coverage map on such a frequency is refused with the reason; a communication plan
  shows the band as not modelled for that pair, never recommends it, and its PDF and
  Markdown write "n/m" with the reason; the comparison of antennas marks the series; the
  contact log leaves the entry out and says why; **Show the page VOACAP prints** leaves
  those frequencies off the page. A band with no figure is not a band that does badly,
  and nowhere is it shown as 0%.

**The matching unit is not modelled.** An end-fed half-wave is fed through a transformer
that loses some power. Put its loss in the profile as feedline loss.

**What VOACAP's models do with a length in metres**, and why the wires are run as they
are. Read from the sources on 16 November 2026 and then run on this engine (hfcast
2.14.0, VOACAP 16.1207W); the runs are kept as tests in
`apps/server/test/propagation-wire.test.ts`. The engine gives no pattern, only the gain
at the angle a signal leaves at, so a pattern was sampled: one antenna file, one
frequency, paths of twelve lengths from 150 to 6000 km through the 24 hours, which
between them leave at angles from 3° to about 75°; gains were compared at the same whole
degree. Average ground throughout.

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
   figures only where it is about a half-wave.

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

3. **Other models looked at.**
   - *Type 41, the "sloping long wire"* of the ITS-78 set (`antennas/samples/sample.41`
     in the VOACAP distribution: slope from horizontal, wire length, feed height;
     `mufesgan.for`, KOP 11). It is in this engine, and its pattern is that of a wire
     fed at one end with a standing wave on it, at any slope: laid level it gave the
     null broadside and the four lobes of a whole wavelength in 1. It was **not used**
     for the level wire, for two reasons. It works its gain out against the resistance
     of the wire as a monopole over perfect ground, the same expression as type 22,
     whatever the slope and height: laid level as a half-wave 6 m up it read 1.2 to
     1.4 dB below type 23 at every angle, and for a whole wavelength there is nothing
     else in the engine to check its level against. And the source marks which of these
     models "have been checked against the equations in Ma and Walters (1969) and where
     necessary brought into agreement with that report": the sloping long wire is not
     one of them. It is the model to use if figures on the harmonic bands of a level
     wire are wanted more than that caution; the change is small (which file is written
     in `antenna-files.ts`, and which frequencies count as modelled in `wireOn`).
   - *Type 28, the inverted L, type 44, the arbitrary tilted dipole, and type 35, the
     vertical dipole*: each is fed at its centre or against ground, and none is a wire
     fed at one end. *Type 47, the vertical with a ground screen*: an end-fed half-wave
     has no radials. Not run.
   - *An end-fed wire on an odd harmonic* (three half-waves) has the same standing wave
     as the centre-fed wire of type 23, by the same argument as for a half-wave. It was
     not offered: the manual's caution about wires far from a half-wave applies, and
     neither wire asked for reaches three half-waves below 30 MHz.

**What was there before.** The generic antenna "End-fed half-wave, horizontal at 6 m" is
now **End-fed half-wave recut for every band, horizontal at 6 m**: it was always a wire
whose length follows the frequency, and beside wires of one length that needed saying.
Nothing about it changed but its name. A prediction saved with it, and a profile of that
kind, are the same antenna they were and give the same answers.

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
so another engine can be put behind it.

### Why this engine

Looked at on 16 November 2026.

| Candidate | What it is | Licence | State | Verdict |
| --- | --- | --- | --- | --- |
| [ITU-R-Study-Group-3/ITU-R-HF](https://github.com/ITU-R-Study-Group-3/ITU-R-HF) | The ITU's own C implementation of Recommendation P.533-14 with P.372 noise (ITURHFProp) | No licence file. A statement that it "may be used by implementers ... free from any copyright assertions"; one header says "All rights reserved" | Last commit May 2025 | Not chosen. Needs 134 MB of ionospheric maps (twelve files of 11 MB). Has no antenna models: a gain table must be supplied for every antenna, which Outpost would have to compute itself. Not one of Outpost's licences. Used here as an independent check |
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

## What is not built yet

- **A second engine**, to set two models side by side. See
  [A second engine](#a-second-engine-a-proposal-not-built).
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
