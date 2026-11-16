# HF propagation

Outpost can predict how well a shortwave (HF, 2 to 30 MHz) signal gets from one place
to another: hour by hour through a day, band by band, for the power, antennas and mode
you have. It works on the computer Outpost runs on, with no connection, and goes on
working for as long as you like without one.

It is in **Radio**, then **HF propagation**. On a phone it is in the **More** sheet.

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
   a British grid reference or a Maidenhead locator (`IO91WM`), or choose a saved place.
   Saved places are the markers you keep on the map; there is no second list.
2. **Date.** Any day. The model works by month, so every day of a month gets the same
   answer.
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

The container has the Pi's architecture, not its speed: a Raspberry Pi will be several
times slower, and that has not been measured.

### Answers already worked out

An answer is kept in the database under a key made from the question (as the engine
reads it: positions to a hundredth of a degree, frequency to 10 kHz, power to a tenth
of a watt), the sunspot number, the solar table's checksum, the engine's checksum and
the data's version. The same key is always the same answer. The 300 most recently used
are kept. `POST /api/radio/propagation/predict?background=true` runs the same work as a
job, for anything long.

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

- **Coverage maps** over the offline map. The engine answers one place in 2.5 ms, so a
  grid is a job of seconds; the job, the cache and the engine interface are ready for
  it, and the map layer is not written.
- **Choosing a place by pressing on the map.** Saved places and typed positions work.
- **Communication plans** between several places, with their matrix and PDF and
  Markdown exports.
- **Logged contacts**, ADIF import, and comparing predictions with what happened.
- **Multi-day planning** beyond one day at a time. Within a month every day is the
  same; across months, use **the same path with one thing changed**, **Months of the
  year**.

## Limits

- Radio and antenna profiles and saved predictions travel to a portable drive with the
  rest of the database, but changes made to them on the drive are not brought home by a
  merge. A solar table you downloaded does not travel; a drive uses the included one.
- 2 to 30 MHz. 160 m is outside the engine's stated range and is not offered.
- Short path only. The long way round the Earth is not predicted.
- Sporadic E is switched off, which is VOACAP's standard practice.
- The minimum take-off angle is 0.1°, the multipath settings and the required
  reliability of 90% are VOACAP's defaults as hfcast fixes them.
- Positions are read to a hundredth of a degree (about a kilometre).
- Tested in Chromium. Not tried on a real phone.
