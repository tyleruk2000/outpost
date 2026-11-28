# HF propagation

Predict how well a shortwave (HF, 2 to 30 MHz) signal gets from one place to another, hour by
hour and band by band, for your power, antennas and mode. It runs offline once VOACAP's
ionospheric and noise maps (559 kB) have been fetched; until then the planner offers a
**Download** button (see [Data](#data)).

Open **Radio**, then **HF propagation** (on a phone, the **More** sheet).

## What it is not

- **Not today's conditions.** Every prediction is a *monthly median*. A geomagnetic storm, a
  flare or sporadic E can make any one day quite different. Nothing in Outpost measures the
  ionosphere.
- **Not a promise of a contact.** "Reliability" is the share of the month's days on which the
  signal-to-noise ratio is predicted to reach what the mode needs.
- **Not Outpost's own model.** Outpost runs VOACAP and shows what it returns (and, if you set it
  up, the ITU's P.533 beside it). If an engine or its data is missing or damaged, it predicts
  nothing and says why.
- **Not permission to transmit.** Your licence sets your frequencies ([radio.md](radio.md)).

## Today's conditions

**Fetch today's conditions** asks NOAA's Space Weather Prediction Center for five small files
(about 9 kB), only when pressed: solar flux, the day's sunspot number, the K and A indices,
NOAA's R, S and G scales and the WWV alert. A radio blackout (R1+) means the sunlit side is
likely worse than predicted; a geomagnetic storm (G2+) means HF is likely worse, most of all at
high latitudes; a radiation storm (S1+) means polar paths are likely worse. It never says the
bands are better, never changes the prediction, and is marked old after three hours.

## Making a prediction

1. **Where.** Transmitter and receiver as a place's name (from the place names on this
   Outpost), coordinates (`51.5074, -0.1278`), a British grid reference, a locator (`IO91WM`), a
   saved place, or **Choose on the map**. An empty
   transmitter starts at the current household's home (for a portable household, where it
   was last said to be).
2. **Date.** The model works by month: every day of a month gives the same answer.
3. **With what.** Power (a radio profile fills it in), an antenna at each end, a band or
   frequency, a mode.
4. **Noise at the receiver.** Urban, residential, rural or remote, VOACAP's four man-made noise
   levels. Real noise in a town is often higher.
5. **The Sun.** See [Where the sunspot number comes from](#where-the-sunspot-number-comes-from).
6. **The reply** (optional): the other station's power and your noise, to predict the way back.

Press **Predict**, or **Try London to Birmingham on 40 m** for a first look. If something needs
putting right, the line under **Predict** names the field, and the cursor goes to it. The form is
remembered in the browser. **Save this prediction** keeps the question by name; **Open** asks it
again with today's data. An antenna profile changed since is run **As saved**.

### A prediction on paper

**This prediction on paper** makes a two-page PDF (**Save as PDF**, **Add to library**,
**Share**; see [library.md](library.md)) and **Export as Markdown** the same as text: the path,
mode, sunspot source, both stations, the best hours and bands, the frequency and every band hour
by hour, every caveat and the versions. A cell with no figure is a dash, never a nought.

### Reading the answer

- **The first line** says what was assumed: the power and each antenna ("For 5 W into a
  half-wave dipole, 5 m up…"). The form starts at 5 W and a low dipole; change them for your station.
- **The notice at the top** says what the answer rests on and how old that is.
- **A few sentences** give the chosen hour's reliability, the MUF, a better band if any, and the
  hours that work on half the days or more.
- **Frequency against time**: 2 to 30 MHz against 24 hours (UTC), shaded by reliability, MUF
  drawn across. Arrow keys move; Enter or a press chooses the hour every chart follows.
- **The figures for that hour**, **charts through the day**, **Bands** (80 to 10 m, ranked), and
  **Where these figures come from**, with **Show the page VOACAP prints**.

**MUF** is open on half the days, **FOT** on nine in ten, **HPF** on one in ten. **LUF** is the
lowest megahertz reaching 90% reliability. Ratios are in 1 Hz: a figure in *B* hertz plus
10·log10(*B*).

### Modes

| Mode | Starting figure | Source |
| --- | --- | --- |
| SSB voice | 45 dB in 1 Hz | OH6BG, "Setting up input values for VOACAP", voacap.com |
| CW | 24 dB in 1 Hz | as above |
| FT8 | -18.8 dB in 2500 Hz (half of transmissions decode) | Franke, Somerville and Taylor, QEX July/August 2020 |
| JS8Call, normal | -24 dB in 2500 Hz (channel unstated) | JS8Call User Guide 4.0 |
| Another digital mode | none: ratios shown, no reliability | your own |

The figures are not on one basis; replace them if you know better. A **Bandwidth, Hz** typed
alone is applied to the mode's figure. With **The reply** filled in, a contact is expected on
*no more than* the weaker direction's share of days.

### Steep paths (NVIS)

On a short path the ionosphere overhead decides it: 160 km on 40 m is commonly shut at night. The
planner shows the geometry (a one-number check, not the prediction), the engine's signal against
noise, and its reliability, with MUF, FOT and foF2 through the day. **The same path with one
thing changed** tries each month, sunspot number, power, antenna and noise.

## Choosing a place on the map

**Choose on the map** opens the offline map: press to drop a pin, or press a saved place.
**Use the middle of the map** suits a keyboard. Nothing is taken until **Use this place**, and
nothing is saved as a place. Without WebGL 2, type positions instead.

## Coverage maps

**Radio**, **HF coverage** asks the planner's question for a receiver at the centre of every
cell of a grid.

1. Give the transmitter and its settings, and the antenna and noise assumed at every receiver.
2. Move the map: **the grid covers what the map shows**.
3. Choose coarse, medium or fine and press **Work out coverage**. It runs as a job; **Stop**
   ends it.

Show **Reliability**, **Signal to noise** (over or short of the mode's need) or **Signal
strength**, at any hour. Unshaded cells are below the lowest class or have no path; crossed
cells were not answered (the transmitter's own is one). The dashed line is the edge of what was
worked out. Press a cell for its figures, then **Open this path in the planner**.

A horizontal antenna with no bearing is turned broadside to each cell in turn (its best
everywhere). Give **Its broadside faces, degrees** to see it as it hangs. **Save this map**
keeps it as worked out.

### A coverage map on paper

**This map on paper**, then **Make the PDF**, gives the map, the legend with cell counts, the
grid as figures (one character a cell, so grey printing loses nothing) and what it rests on.

### How large, and how long

| Grid | Britain and Ireland (14° by 10°) | On an Apple M2 Max |
| --- | --- | --- |
| Coarse | 208 cells of about 70 km | 0.6 s |
| Medium | 832 cells of about 35 km | 2.2 s |
| Fine | 1,872 cells of about 23 km | 4.9 s |

A Raspberry Pi is several times slower. One grid runs at a time and three may wait; areas reach
no nearer the poles than 89°. A coarse grid can miss a narrow skip zone. One map is one
frequency.

## Communication plans

**Radio**, **Communication plans** says which band serves each pair of stations at which hour.

1. **New plan**, and name it.
2. **Add a station** for each place (up to eight): where, power, antenna, noise, and its
   call sign if it has one (printed with it in the household book).
3. **When, and on what**: date, hours (UTC), bands, mode, sunspot number. If another device saved
   the plan meanwhile, choose **Keep my change** or **Take theirs**.
4. **Work out the plan.** Each pair is asked both ways on every band.

**Bring in a plan** reads a plan's JSON file from **Take everything out** and adds it as a new
plan. Links to pages and documents this Outpost does not hold are left off, and the matrix is
worked out again.

### The matrix, and how the bands are chosen

Each pair gets distance, bearings, a **primary** and an **alternate** band with their hours, and
every band through the day. The rule, also shown on screen and in exports:

- The **two-way figure** is the weaker direction's reliability: an upper bound on contacts.
- **Primary** has the best two-way figure averaged over the window, **alternate** the next; ties
  go to the higher signal-to-noise ratio.
- A band's hours are those at 50% of days or more (failing that, within 5 points of its best,
  marked). A band never reaching 10% is not recommended.
- A mode with no requirement is compared by the weaker median ratio, hours within 3 dB of best.

### Exports

**Save as PDF**, **Add to library**, **Export as Markdown** and **Share** write the whole plan,
its rule, limits and notes. They are made in the browser; nothing is sent anywhere.

### Notes and links

**Linked notes and documents** ties a plan to a net procedure or frequency list.

## The contact log

**Radio**, **Contact log** records contacts made, stations heard and calls unanswered. **Log an
entry**, or **Import an ADIF file** from your logging program (ADIF 3.1.8 `.adi`; not `.adx`).

- Every record is accounted for: brought in, already there, or left out with its reason.
- A position is only what the file states (`LAT`/`LON`, or a locator of four characters or
  more). Nothing is guessed from a callsign.
- An entry typed in starts from where your station was last time. A position typed as a
  locator is listed as that locator.
- No contact is added twice. **Take back**, under **Files imported**, removes one file's entries.
- **Edit** beside an entry puts it right in place, typed or imported. An imported entry still
  belongs to its file, so taking the file back removes it too; one logged with a band and no
  frequency keeps that band until a frequency is given.
- Large files import as a job; nothing appears until all of it is in. Over 64 MB or 200,000
  records is refused: export in parts.

### Comparing with predictions

**Compare with predictions** asks the engine about each entry at its month, hour and frequency,
and counts entries that fell where reliability was **low** (under 30%), **middling** or **high**
(70%+). You choose the antennas and noise to assume. Entries are left out, by reason, with no
position, outside 2 to 30 MHz, a mode with no requirement, no power, a non-F2 path, or no
sunspot number for the month (type one for months before the solar table).

A log holds contacts made, not calls unanswered, so it cannot show a low prediction was right.
Under 30 entries only counts are shown. Nothing adjusts the engine.

## A second model: ITU P.533

Beside VOACAP the planner can run **ITURHFProp**, the ITU's implementation of Recommendation
ITU-R P.533: a different model, for comparison. Nothing of the ITU's ships with Outpost
([The second model's terms](#the-second-models-terms)).

Under a prediction, **Compare with a second model (ITU P.533)** says what is missing:

1. **Build the P.533 engine (193 MB)** fetches the ITU's source and a compiler, compiles, and
   keeps the result only if it matches the recorded file byte for byte. Needs about 860 MB free
   while it runs (25 seconds on a Raspberry Pi 5 on a fast line). 64-bit Linux and macOS,
   including Docker. Or: `node scripts/build-p533-engine.mjs --install <data dir>`.
2. **Download the P.533 maps (137 MB)**.

Both models then run the same question on each band. You see, per band and hour, where each has
the path open and where they disagree; and at the chosen hour each model's MUF, signal and ratio.
VOACAP's reliability and P.533's basic circuit reliability are separate columns. Nothing says
which is right. P.533 has no antenna models, so the comparison runs both with isotropic 0 dBi
antennas, one way only.

### What is not done

P.533 is not offered for coverage maps or plans, with real antennas, or for the reply.

## Where the sunspot number comes from

Every prediction says where its sunspot number came from:

- **The solar table** (default): NOAA's predicted solar cycle, shipped (May 2026 to December
  2030). **Engine and data**, **Download a newer table** fetches a newer one.
- **Your own number**, typed.
- **A measured foF2** and its hour: Outpost finds the sunspot number at which the engine's map
  gives it, and runs the day at that. One measurement stands for the whole day.

## Equipment

**Equipment** keeps radios (only the power is used) and antennas. Every antenna is run as one of
VOACAP's models; a profile is that model, not a measurement of yours.

| Kind | Run as |
| --- | --- |
| Horizontal dipole | VOACAP's half-wave dipole at its height |
| Inverted-V | The dipole at the mean height (approximate) |
| End-fed wire, level | Half-wave (0.45 to 0.55 wavelengths): the dipole. Longer: **approximate**. Shorter: **not modelled**, no figure |
| End-fed wire, vertical | VOACAP's vertical of its height; off its half-wave band the real wire does worse, and the screen says so |
| End-fed wire, sloping | Half-wave or longer: **approximate**, a few decibels either way. Shorter: **not modelled** |
| Quarter-wave vertical | VOACAP's vertical. Enter a short or loaded whip's loss as negative gain |
| Isotropic | Equal gain everywhere, for comparison |

Approximate figures are marked ≈ (~ on paper) and not-modelled bands read "Not modelled" ("n/m");
never colour alone. **The wire on each band** gives each band's state. A coverage map on a
not-modelled frequency is refused; a plan never recommends one.

Presets: **End-fed half-wave, 20 m wire** sloping 25° from 1.5 m, and level at 6 m; **10 m
wire** and **5 m wire**, level and vertical; and the **SPOOLTENNA**. A profile can be 4.5 to 82 m.
The bearing is the broadside's: where a wire is a wavelength or more long, broadside is a null,
so give the bearing your wire really hangs at. A sloping wire with no bearing has its low end
turned towards the other station; at 45° or steeper on 17 to 10 m that is the wrong way round.
The matching unit is not modelled: enter its loss as feedline loss.

SPOOLTENNA is a trade mark of Panther Creek Solutions LLC, named only to say which antenna is
meant. It is offered as in its manual's Figure 4: 19.8 m of wire from 1.8 m up, rising 17°. Its
transformer and the coax as return are not modelled.

Not offered, as the engine has no checked model: inverted L, end-fed inverted-V, loops. For a
random wire or an off-centre-fed dipole, make a level-wire profile of its length.

## Data

**Engine and data** lists what is installed, with versions and checksums.

| Set | Size | Ships | Fetched |
| --- | --- | --- | --- |
| Antenna definitions (NTIA/ITS) | 15 kB | Yes | No |
| VOACAP's coefficients | 559 kB | **No** | Once, when you ask |
| Solar cycle table | 17 kB | Yes | When you ask |
| P.533 maps | 137 MB | No | When you ask |

### VOACAP's coefficients: a one-time download

The ITU has not given permission for these maps (CCIR Reports 340 and 322) to be passed on, so
Outpost does not ship them. Press **Download (559 kB)** on any HF screen: it fetches them from
the engine's repository (`raw.githubusercontent.com/jonathanmcsweet/hfcast-engine`) and checks
every file. To prepare a box for offline use at set-up, run
`node scripts/fetch-voacap-data.mjs --data-dir <data directory>` (add `--from <folder>` to copy
from a folder); [deployment.md](deployment.md) has the line for each install.

## Licences and attribution

The engine, hfcast, is Apache-2.0. VOACAP and its antenna files are from NTIA/ITS, which has "no
objection to the use of this software for any purpose"; its disclaimer is kept. voacapl's changes
are CC0. The solar table is a US Government work. The coefficient files are CCIR data that
Outpost fetches only for the person who presses, for their own use. Full texts:
`engines/voacap/NOTICE.txt`.

### The second model's terms

ITURHFProp and its maps are under no open-source licence. The ITU's repository says the software
"may be used by implementers in their implementation of the Recommendation ... free from any
copyright assertions", and four of its headers say "All rights reserved. No part of this
publication may be reproduced, by any means whatsoever, without written permission of ITU".
Outpost redistributes nothing of it: you fetch and build it for your own use.

## Limits

- 2 to 30 MHz; short path only; sporadic E off; positions to about 1 km.
- One day at a time (use **Months of the year** to compare months). One frequency per coverage
  map. No calibration from logged contacts; no ADIF export.
- Everything here is in backups. On a portable drive it travels, but changes made there are not
  merged back. Plans and logged contacts are not in the search across everything.
- What has not been tried: [testing-status.md](testing-status.md).
- For developers: [development/propagation.md](development/propagation.md).
