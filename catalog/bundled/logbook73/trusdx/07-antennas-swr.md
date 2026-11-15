# Antennas, SWR and protecting the PA

The (tr)uSDX has no antenna tuner, no folding-back protection circuit, and a power amplifier whose transistors cost pennies and die honestly. That sentence is not a criticism — it is the design contract. The radio gives you an onboard SWR meter and expects you to use it; feed it a decent match and it will transmit all day on a thimble of current. This chapter is the antenna-side of that contract: what to connect, how to check it, and how to stay on the right side of the physics.

## The contract, plainly

A transmitter delivers its rated power into a `50 Ω` load. When the antenna system presents something else, part of the power reflects back down the line — the mismatch that [SWR](outpost:entry/logbook73.handbook/swr) measures. A big rig shrugs, folds back its power, and its tuner papers over the difference. The (tr)uSDX's class-E stage instead sees voltages and currents it was not designed around, and its margin is real but finite:

- **SWR under about `1.5:1`** — the happy zone; operate freely.
- **Up to about `2:1`** — acceptable; some power is being wasted and stress is rising, but the design copes.
- **Beyond that** — you are gambling components on a wire. Fix the antenna, or put a tuner in line, before pressing transmit again.
- **No antenna at all** — the worst case of all. Never key up into nothing; a moment's "just testing" into an open BNC can be the whole repair bill.

## The onboard SWR meter: your side of the bargain

Menu `1.13 SWR meter` (on builds with metering — see [chapter 2](outpost:entry/logbook73.guide.trusdx/menu-reference)) reads the radio's built-in directional bridge during transmit:

- **FWD-SWR** — forward power and computed SWR, live, while you transmit. This is the everyday mode.
- **FWD-REF** and **VFWD-VREF** — forward and reflected power, and the raw bridge voltages, for diagnosis when the computed number seems suspect.

**The check that becomes a habit:** on a clear frequency, low stakes — CW mode, a one-second key-down — read forward power and SWR. Sensible power for your supply voltage, SWR in the happy zone: operate. Anything else: stop and investigate. This costs three seconds per band, per outing, and it is the entire protection system.

Two honest caveats about the little bridge. It reads while you transmit, so keep test transmissions brief and legal (identify if required — a dummy-load test needs no callsign, an on-air one does). And it is a built-in convenience, not a laboratory instrument — for antenna _building_, an antenna analyser or [NanoVNA](outpost:entry/logbook73.handbook/nanovna) measures without transmitting at all, and is the better tool.

## What to hang on the BNC

The radio's ideal companions are **resonant, single-feed wire antennas** — light, cheap, and needing no tuner:

- **A linked dipole** — a dipole with break-points you connect or disconnect to re-resonate it per band. The classic SOTA answer: one antenna, several bands, always resonant, nothing electronic to fail. Pairs beautifully with the five-band radio.
- **An end-fed half-wave (EFHW)** — one wire, one small matching transformer, and (cut for `40 m`) natural resonance on `40/20/15/10 m` — a lovely fit for the Classic filter build especially. Mind that the transformer must be rated for your power (five watts stresses nothing) and that band edges may still want a trim.
- **A quarter-wave vertical with radials** for a single favourite band — trivial to build for `20 m`, effective for DX.
- **A random wire _with a tuner_** — see below. The wire is random; the match must not be.

Whatever the wire: the [Antennas](outpost:entry/logbook73.handbook/antennas) and [Transmission Lines](outpost:entry/logbook73.handbook/transmission-lines) chapters carry the theory, and a few metres of height and a clear take-off matter more than any of it.

## Tuners: the optional diplomat

No ATU inside means an external one when you want antenna freedom:

- **Manual QRP tuners** (small L-networks and Z-match designs) weigh little, need no power, and match a genuinely random wire. You tune for minimum SWR on the radio's own meter — a ten-second ritual per band.
- **Auto-tuners** work too; give the radio's `3.4 TX Delay` a few tens of milliseconds if the tuner relays switch on keying, and tune at low drive.
- **The tuner belongs at the radio end** for convenience, or at the _antenna_ end for efficiency purists; at QRP power levels and sane coax lengths, convenience wins.

A tuner makes the _radio_ happy — it presents `50 Ω` at the BNC. It does not make a bad antenna good; the wasted power is merely relocated. [Impedance](outpost:entry/logbook73.handbook/impedance) explains that distinction properly.

## Harmonics, filters and being a good neighbour

Each band's low-pass filter on the RF board is what keeps your transmission's harmonics — the multiples of your frequency that any PA generates, and a switching PA generates enthusiastically — below the legal limits. This is why:

- **The LPF configuration must match the hardware** ([chapter 6](outpost:entry/logbook73.guide.trusdx/calibration)) — transmitting through the wrong filter section can mean both poor output _and_ poor harmonic suppression.
- **Kit builders must wind and tune the filters carefully** — the official assembly guidance emphasises filter tuning, and the difference between a sloppy and a careful set of toroids is measured in both watts out and cleanliness. If you built from a kit and have access to any spectrum-measuring tool (even a [TinySA](outpost:entry/logbook73.handbook/tinysa)), one look at your harmonics is worth the afternoon.
- **You never transmit on a band the filter board doesn't serve**, even where the VFO will happily tune. No filter, no cleanliness, no legality.

## Power into the antenna: what to expect

With calibration done ([chapter 6](outpost:entry/logbook73.guide.trusdx/calibration)) and a good match, expect output in the region of **five watts at `13.8 V`**, tapering with supply voltage down to about **half a watt from USB `5 V`** — the design degrades gracefully rather than cutting out. Per-band output varies a little with the individual filter build; the onboard forward-power reading tells you _your_ radio's truth. A kit whose output is dramatically low on one band while fine on others is almost always telling you about that band's filter coils, not about the PA.

## RF in odd places: the tiny-station problem

A pocket-sized station has a pocket-sized ground, and an antenna slung close to the operating position. If you meet tingling from the case on voice peaks, USB dropouts while transmitting, or a computer that misbehaves during digital overs — that is RF finding its way back along the feed line and cables. The fixes are standard and cheap: a **common-mode choke** (a few turns of the coax through a ferrite ring) at the radio, a **counterpoise wire** where the antenna design wants one, and moving the antenna's near field away from the bench. [EMC and RFI](outpost:entry/logbook73.handbook/emc-rfi) covers the toolkit; [chapter 8](outpost:entry/logbook73.guide.trusdx/digital) revisits it where it bites hardest, on USB-connected digital modes.

## The pre-transmit ritual, complete

1. Antenna connected — _look_ at the BNC.
2. Band chosen; filter board actually serves it; licence actually permits it.
3. Metering on; brief low-stakes key-down; **power sensible, SWR under `1.5:1`.**
4. Operate, and enjoy the slightly smug feeling of a station whose entire antenna-safety system is you, doing the job well.
