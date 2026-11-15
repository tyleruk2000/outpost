# The automatic tuner, SWR and antenna analyser

The G90's built-in automatic tuner is unusually useful, but it is easy to misunderstand. It matches the transmitter to the impedance appearing at the radio. It does not change the antenna, remove feedline loss or guarantee that much energy is being radiated. Use it as a matching tool and the SWR scanner as a quick field measurement—not as permission to ignore the antenna.

## SWR in one useful explanation

A transmitter is designed for a load near `50 Ω`. When antenna and feedline present something else, some energy reflects. Forward and reflected waves create a standing-wave ratio:

- `1:1` — ideal match;
- `1.5:1` — excellent in ordinary service;
- `2:1` — often workable;
- `3:1` — significant mismatch and the G90's usual protection threshold; and
- higher — stop, diagnose and match/repair before applying power.

SWR is not an antenna-performance score. A dummy load has perfect SWR and intentionally radiates almost nothing. A lossy cable can hide a poor antenna by absorbing the return journey. Conversely, a modest mismatch through low-loss line may radiate well.

## What the tuner does

The internal ATU switches inductors and capacitors into an impedance-matching network. Xiegu publishes a range up to roughly `5:1`, with an initial search taking up to about twelve seconds and a recalled match returning in about two seconds under suitable conditions.

When a tune succeeds, the power amplifier sees a safer load. The impedance and standing waves beyond the tuner still exist. If high SWR is on a long lossy coax run, the line still wastes energy even though the radio meter looks happy.

The tuner is ideal for:

- a resonant antenna shifted by weather or mounting;
- a multiband wire whose feed system is designed for tuning;
- a sensible portable end-fed/random wire with the correct transformer and counterpoise; and
- moving within the usable range of an antenna.

It is not a cure for:

- open/shorted coax;
- a wrong connector;
- no counterpoise on a system that requires one;
- a whip vastly too short for the band;
- arcing or water ingress; or
- an impedance beyond its matching range.

## Where the tuner sits matters

The G90's ATU is at the radio end of the coax. Suppose a mismatched antenna creates a 5:1 SWR at the far end of 30 metres of small lossy cable. The tuner may transform the cable input to 1:1 for the PA, but forward and reflected energy still make repeated lossy trips along the cable. The radio is protected while effective radiated power remains poor.

A tuner at the antenna/feed point avoids high-SWR loss in the line, but requires a weatherproof remote unit and control/power. A balanced open-wire feeder can tolerate high standing waves much better than small coax when used with a suitable balanced matching arrangement. The internal ATU remains excellent for short low-loss feedlines and portable systems designed around it.

This also explains a deceptive result: adding a long lossy cable can make SWR _look_ lower because the cable absorbs reflected power. Better SWR with worse signal is possible.

## Use a dummy load intelligently

A rated `50 Ω` dummy load should show close to 1:1 without the tuner. It separates transmitter/meter faults from antenna/feedline faults.

- Choose a load rated for the G90's power and test duration.
- Connect with short known-good coax.
- Bypass ATU and set one watt first.
- Key briefly in the intended mode/test method.
- Confirm stable SWR and supply voltage.
- Increase only within the load's continuous/intermittent rating.

A tiny five-watt QRP load may be damaged by a twenty-watt or long digital test. Power rating and duty cycle both matter. Do not “tune” a proper dummy load as a normal step; if the ATU finds a complex match into one, the recalled network or measurement setup deserves investigation.

## Tuner memories and physical changes

The G90 can re-enter a previous match quickly when impedance resembles a stored condition. It cannot know that you changed the physical antenna while retaining the same frequency. Retune after changing antenna/feedline switch, raising or moving a portable wire, changing band, moving far enough within a band for SWR to rise, or weather/objects materially altering the system.

Do not retune because receive noise changed. Propagation changes reception, not the antenna impedance in that way. When using an antenna switch, label it: a match recalled for antenna A can be wrong on antenna B.

## Short TUNE and long TUNE

This distinction solves most confusion:

- **Short-press TUNE:** insert or bypass the previously found matching network. It does not search.
- **Long-press TUNE for about two seconds:** transmit a tune carrier, search relay combinations, store the result and leave the tuner inserted.

Watch the ATU indication. If a short press makes SWR worse, the recalled match belongs to another frequency/antenna; bypass it and perform a new long tune on a clear legal frequency.

## Safe tuning procedure

Tuning transmits. You need an appropriate licence, a permitted frequency and a connected antenna/dummy load.

1. Select the intended band, frequency and antenna.
2. Listen long enough to confirm the frequency is clear; ask if it is in use.
3. Reduce normal transmit power. Firmware v1.76 and later uses low tune power of roughly 5 W, but low operating power remains good discipline.
4. Ensure the coax and antenna are physically safe and people are clear of the radiating element.
5. Long-press TUNE until the search begins; release.
6. Wait without touching band, split or PTT controls.
7. Confirm the tuner is engaged and SWR is acceptably low on a brief transmission.
8. If unsuccessful, bypass, stop and inspect/change the antenna system.

Do not run repeated searches into a fault. Relays clicking are not progress if the antenna is impossible.

## The SPLT firmware trap

Older firmware could leave automatic tuning stuck when `SPLT` was active. Official v1.81 fixes this. Even on v1.81, tuning with split deserves care because A receives and B transmits: the tuner must match the actual transmit frequency. Confirm B and legality before the tune carrier. As a simple workflow, disable split, tune the intended transmit frequency, then re-establish split and check both VFOs.

If tuning hangs on an older radio, release/stop, disable split and update using the official process rather than repeatedly power-cycling mid-transmission.

## Leave the tuner in or out?

Bypass it for a resonant antenna with a good direct match. Every matching network has finite loss, and needless relay combinations add complexity.

Leave it inserted after a successful match on an antenna that needs it. Retune when changing band, antenna or moving far enough in frequency for SWR to rise. The tuner can recall nearby matches, so a short insertion may settle quickly.

An ATU icon only says the network is in circuit. It does not say the currently recalled combination is correct.

## SWR protection threshold

Short-press **POW** to alternate between transmit power and `SWR THR`. Published/default threshold is about `3:1`; firmware may offer roughly `1.8–3.6`.

The threshold tells the G90 when to reduce/protect power. It does not repair the mismatch. Raising it to silence protection merely allows the PA to work into a worse load. Keep the default unless a well-understood system and test procedure requires otherwise.

If power falls during a contact, look at SWR, supply voltage and temperature before raising commanded power.

## The SWR scanner

Long-press **POW** to enter SWR scan. Unlike the spectrum display, this is not listening across the band. The radio transmits a low-power carrier at a series of frequencies, measures SWR and draws the result. The tuner is bypassed so the graph describes antenna/feedline as presented directly.

Current/older documentation exposes scan span/step and `FAST`/`SLOW` choices, with step values around `1–5 kHz` depending on build and view. Use the screen's actual labels; press `QUIT` when done. The bottom identifies the best frequency/SWR in the sweep.

### Running a responsible sweep

1. Choose only a frequency span where your licence permits transmitting a carrier.
2. Listen across/around the range first. A sweep can interfere with several stations, not just one frequency.
3. Use the narrowest span and fastest useful scan.
4. Keep the antenna clear and equipment ventilated.
5. Read the minimum and curve shape, then quit promptly.

The scanner is roughly a five-watt transmitter test. Never sweep broadcast, aviation, marine or other non-amateur spectrum just because the receiver can display it.

## Reading the curve

- **Broad shallow valley:** forgiving/resonant over a useful part of band.
- **Narrow deep valley:** good at one frequency, rapidly worse away; common with high-Q compact antennas.
- **Minimum below desired frequency:** antenna is electrically long; shortening generally raises resonance.
- **Minimum above desired frequency:** antenna is electrically short; lengthening generally lowers resonance.
- **Flat high line:** disconnected/wrong system, severe mismatch or scan/setup error.
- **Sudden jagged changes:** intermittent connector, moving element, arcing or local interaction.

Those length rules are first-order guidance for simple antennas. Traps, loading coils, end-fed transformers and nearby structures complicate them; change one physical variable at a time.

## Scanner versus a VNA

The built-in scanner is convenient because it checks the exact installed radio/coax/antenna system. It gives SWR and costs no extra equipment. It also radiates, covers only legal transmit frequencies, has limited resolution and cannot separate resistance from reactance.

A vector network analyser such as a NanoVNA uses a tiny measurement signal and displays impedance, reactance, phase and Smith-chart information. It is the better tool for building and diagnosing. The G90 scanner is the better last-minute “did the field antenna survive assembly?” check.

## Portable-wire reality

Random wire does not mean arbitrary wire. A wire near a half-wave multiple can present extreme impedance, while another length may fall comfortably within the 5:1 tuner range. Use a proven length chart, appropriate unun/balun, a defined counterpoise and common-mode choke. Keep high-voltage wire ends away from people and combustible material.

At only 20 W, RF burns and high voltages are still possible at current/voltage maxima. The tuner and feedline may be safe while the end of an end-fed wire is not.

## Troubleshooting a failed tune

Work in this order:

1. Stop transmitting and bypass ATU.
2. Confirm band/frequency and that split is not sending elsewhere.
3. Hand-check connector tightness with power off.
4. Substitute a dummy load. If it tunes/reads near 1:1, radio and meter are likely fine.
5. Substitute known-good coax.
6. Inspect antenna continuity, transformer, counterpoise and switches.
7. Measure with an analyser.
8. Change wire length or feed arrangement to bring impedance within range.

Do not “solve” a failed tune by raising SWR threshold, power or tune repetitions.

## Key takeaways

- A tuner transforms impedance at the radio; it does not tune the physical antenna or remove feedline loss.
- Short TUNE inserts/bypasses a stored match. Long TUNE transmits and searches.
- The published range is up to about 5:1; outside it, fix the antenna/feed system.
- SWR scan transmits with the tuner bypassed and must stay within legal, clear spectrum.
- v1.81 fixes the split/tuner hang, but always confirm the actual B transmit frequency.

Next, [Memories, VFOs and split](outpost:entry/logbook73.guide.g90/memories-split) shows how to store and reuse the frequencies you have just matched.
