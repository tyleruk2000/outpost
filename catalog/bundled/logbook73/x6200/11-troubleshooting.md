# Troubleshooting

Troubleshooting the X6200 is fastest when you divide the station into layers: power, radio state, RF path, audio/filter path, application/connection and firmware. A factory reset is near the end, not the beginning. Change one thing, retest the same symptom and record what changed.

## The two-minute triage

Before opening a menu maze:

1. **SYSTEM INFO:** photograph versions. Does the expected control belong to 1.0.6/1.0.7?
2. **Power:** battery seated/charged or regulated 12–15 V centre-positive communications supply rated at least 3.5 A? (Manufacturer V06 also rates 9–15 V, with battery takeover below 11 V.)
3. **RF:** correct ANT connection, antenna/dummy load, band and legal TX frequency?
4. **State:** PTT NORMAL, SPLE off, RIT/XIT zero, correct VFO/mode?
5. **Receiver neutral:** SQL open, RFG high, PRE/ATT off, AGC AUTO, default DFL, NR/NB/notch off?
6. **Accessory:** remove USB/HOST/ACC/key/external speaker and test bare radio if safe.

Those six checks solve a remarkable number of faults.

## Radio will not power on

### On battery

- Remove external power; switch off.
- Reseat detachable panel and inspect clean, undamaged contacts/latch.
- With the radio powered off, use the supplied charging adapter and `CHARGER ON` if the system can start.
- A red/empty icon after repeated correct charging suggests depleted/faulty panel.
- Stop using a swollen, leaking, odorous or hot pack.

### On external supply

- Measure polarity/voltage at the communications-supply plug before insertion: centre positive, preferably `12–15 V` (`13.8 V` normal). Manufacturer V06 permits `9–15 V`, but below `11 V` a fitted battery can take over.
- Supply capacity at least `3.5 A`; check current limiting and fuse.
- Inspect `5.5 × 2.5 mm` fit. A similar plug can feel inserted without reliable centre contact.
- Never raise above 15 V to “wake” it.

If both paths fail after known-good checks, disconnect everything and seek authorised service rather than bypassing protection.

## Frozen screen or abnormal shutdown

Try normal shutdown first: hold power until interface exits, release, wait five seconds.

If no response, hold power more than `12 seconds` until screen/light/sound stop. If still frozen, disconnect external supply and remove the battery panel, wait, refit and start normally. Abrupt removal is emergency recovery only.

If a red fault message flashes with lagging screen/audio, the manual specifically directs removal of both power sources and restart. Recurring freezes need context:

- with WR12 while spinning tuner quickly: firmware `1.0.7` includes a fix;
- after spectrum alpha below 255: `1.0.7` fixes a display freeze;
- only with HOST accessory: remove high-current/unsupported device/hub;
- after partial update: verify system and baseband versions;
- during transmit: investigate supply drop, heat and RF feedback.

## Receiver silent or “deaf”

Work outward:

1. Volume audible and `S/P MODE` matches device.
2. Stereo TRS headphone/speaker plug; a mono plug can short/silence output.
3. SQL open; knob label says VOL after adjustment.
4. RFG high.
5. ATT off; PRE off initially.
6. Correct mode and frequency.
7. DFL bank DEFAULT.
8. NOTCH/NR/NB off.
9. Antenna on ANT, not a loose adapter.
10. Compare a known strong WFM/shortwave station and another antenna/dummy-load noise test.

WFM becomes silent after idle on early firmware: 1.0.7 fixes that documented fault. If only WFM fails, check version before hardware repair.

## Ghosts, images and harsh strong signals

Symptoms across many frequencies usually mean overload, not hundreds of stations:

- turn PRE off;
- turn ATT on;
- reduce RFG;
- narrow DFL around wanted signal;
- disconnect local noise sources and chargers;
- use a broadcast-band reject or band-pass filter where appropriate;
- improve antenna placement/common-mode choking.

Moving RF FFT reference can hide the picture but does not fix overload. Test audio and signal behaviour, not display colour alone.

## No transmit

Check, in order:

- amateur licence/band and enabled transmit segment;
- not in WFM/airband receive-only coverage;
- PTT input actually selected/responding;
- SPLE/XIT not putting TX out of band;
- antenna/dummy load and acceptable SWR;
- power above zero and sufficient battery/supply;
- microphone selected by MIC SEL;
- CAT application not holding/denying PTT;
- key plug not miswired;
- thermal/protection state.

Test body PTT and built-in mic with all accessories removed into a dummy load. If that works, add H-22, USB and ACC one at a time.

## Low or distorted transmit audio

### Voice

- correct BUILT-IN/HANDLE path;
- speak at consistent distance;
- COMP off while calibrating;
- return EQ-MIC flat/off;
- set only the active mic gain using another receiver;
- inspect SWR/power supply before raising gain;
- RF feedback? lower power, add choke/ferrites/counterpoise.

### Data

- correct X6200 playback/output device;
- COMP and mic EQ off;
- lower computer output and LINE IN GAIN, then raise gradually;
- use ≤5 W, airflow and accurate clock;
- check ALC/clean spectrum on separate receiver.

Too much audio can produce _less_ useful decoded power despite a busy meter.

## PTT stuck on

Immediate: release/disconnect control and remove power if necessary.

Then inspect:

- `PTT MODE = TOGGLE`—press again, then restore NORMAL;
- KEY mono/wrong wiring—power off, remove and rewire TRS;
- H-22 stuck PTT or damaged cable;
- CAT application asserted PTT—close software/remove DEV;
- ACC/XPA cable state;
- VOICE CALL/MODEM message still playing.

Do not reconnect a suspect key/mic while radio is powered.

## ATU will not match

- Short ATU only enabled it; long-press about one second to tune.
- Clear legal frequency and low power.
- Load may be outside approximately `20–175 Ω` or highly reactive.
- Broken/open/shorted feedline or wrong antenna tap.
- Old tuner memory belongs to another antenna—force new tune.
- Weak supply/battery under tune carrier.
- External tuner interacting.

Test a known 50 Ω dummy load. If good, improve physical antenna/counterpoise; do not repeat tune cycles until hot.

## SWR changes when touching the radio

The operator/cables are part of the return path. Common with whips/end-fed wires.

- add proper counterpoise/grounding appropriate to antenna;
- common-mode choke at feedline;
- ferrites on USB/mic/power leads near radio;
- move antenna farther from station;
- lower power.

The tuner cannot cure RF flowing on the outside of cables.

## Battery will not charge

- battery fitted correctly;
- CHARGER ON;
- supplied charging adapter connected with the radio powered off;
- temperature above 0°C and below safe limit;
- charging indicator meaning checked;
- wait full process (manual says about seven hours);
- never transmit from the supplied charging adapter; it is charge-only, and abnormal heat/smell is not normal.

Flashing red: stop, unplug, inspect/reseat. Persistent red/empty after correct cycles suggests battery replacement/service.

## Radio shuts down or power falls on transmit

- battery voltage/capacity low;
- supply current limit or thin cable causing drop;
- high SWR/protection;
- overheating from FT8/long call;
- external voltage below ~11 V makes fitted battery take over;
- connector loose.

Test into dummy load at 1 W, then increase while watching supply voltage/current. Xiegu specifies up to about 3 A transmit draw and recommends ≥3.5 A source.

## USB computer sees nothing

- cable in DEV, not HOST;
- data-capable cable, direct computer port;
- CH342 driver installed/authorised;
- radio fully booted;
- try another known cable/port, remove hub;
- inspect OS device list as cable connects.

HOST is not a second computer device port.

## CAT fails or is intermittent

- native XIEGU X6200 model rather than approximate CI-V profile;
- firmware 1.0.6 baseline **SERIAL-B**, `19200`, `8N1`, CI-V address `0xA4` (SERIAL-A is the terminal path);
- one application owns port;
- disable USB power saving;
- separate ferrite/routing from antenna;
- firmware matches CI-V reference/application expectations;
- test read frequency before write/PTT.

If frequency works but mode/split does not, the fallback rig profile may implement only a subset.

## USB FT8 decodes nothing

1. Exact computer time.
2. Correct dial frequency and USB/data mode.
3. X6200 recording device selected.
4. LINE OUT/computer input meter active, not clipped.
5. DFL passes full FT8 audio range.
6. NR/NB/notch off.
7. Wait complete periods and confirm actual signals.

The built-in FT8 decoder can be a cross-check: if radio decodes but PC does not, the problem is USB audio/software/time; if neither decodes, suspect tune/mode/filter/time/activity.

## FT8 decodes but will not transmit

- CAT PTT method/control port;
- X6200 playback device rather than speakers;
- LINE IN/application output not zero;
- out-of-band/split/XIT;
- radio power and antenna match;
- app in transmit period and not watchdog-stopped;
- Bluetooth FT8CN requires 1.0.6+ and correct supported link.

Dummy load first. Do not troubleshoot PTT on a live FT8 frequency with repeated long carriers.

## FT8 transmits but others cannot decode

- clock error (even a second matters);
- wrong period, dial or sideband;
- overdriven audio/ALC/compression;
- RF feedback corrupting USB/control;
- filter/processing affecting transmit path;
- actual RF low from SWR/supply/heat;
- poor propagation/antenna.

Lower audio and power before increasing them. Inspect with a second receiver.

## MODEM gibberish

- signal not RTTY/BPSK;
- wrong MODE, FC/TONE, RATE/SPEED or sideband;
- AFC chasing multiple signals;
- MODEM SQL/DFL inappropriate;
- NR/notch distorting tones;
- firmware 1.0.7 removed CW—use KEY decoder.

CLEAR, widen filter, processing off, manually centre, then select parameters.

## CW decoder poor

- firmware older than 1.0.6;
- signal pitch not matching TONE;
- DFL too wide/multiple stations or too narrow/off-centre;
- threshold too low/high (range 1–50);
- NOTCH on, deep NR, slow fading;
- irregular hand sending.

Xiegu suggests 5–14 low noise and 15–30 near S9 noise. Treat output as aid, not truth. 1.0.7 fixes crackling after decoder on.

## Voice recorder/caller echoes

- MONITOR LEVEL high;
- speaker near active mic;
- mic gain/COMP too high;
- H-22 more than necessary distance;
- record in quiet space, monitor off, then PLAY before transmit.

Each slot max 1 minute 30 seconds. A message stopping there is a limit, not storage corruption.

## Wi-Fi will not connect

- SETTING 2 BUILT-IN ON for internal adapter;
- correct password;
- static IP unused and same subnet;
- gateway correct; prefix/DNS suitable;
- captive portal/client isolation/unsupported newer band/protocol;
- save field before turning knob; rescan;
- move away from 2.4 GHz congestion.

SYSTEM INFO NETWORK on 1.0.6+ tells whether the radio obtained/holds the expected data.

## WFSERVER unavailable

Prove layers:

1. Wi-Fi connected.
2. Radio/client can reach each other on LAN.
3. WFSERVER configured.
4. START pressed and blue WF icon visible.
5. Compatible client/version/firewall.

Do not solve by exposing ports directly to the internet.

## Bluetooth/FT8CN fails

- firmware 1.0.6+;
- BUILT-IN adapter path;
- forget and re-pair, scan with other peripherals off;
- supported profile/device/app permissions;
- phone time exact;
- connection icon is not proof of CAT/audio/PTT.

Test receive and frequency control separately before transmit.

## WR12 not detected or freezes

- 1.0.6+ support; 1.0.7 recommended for fast-knob black-screen fix;
- WR12 directly in HOST, no hub/competing device;
- module seated/powered per its instructions;
- blue WR12 icon expected near voltage;
- normal reboot with module removed, then reconnect as documented.

WR12 is receive expansion, not transmit unlock.

## Menu item missing

| Missing              | Required baseline             |
| -------------------- | ----------------------------- |
| CW decoder/threshold | 1.0.6+ KEY page 2             |
| NETWORK info         | 1.0.6+ SYSTEM INFO            |
| WR12                 | 1.0.6+                        |
| SHOW RX LEVEL        | 1.0.7 DISPLAY 3/3             |
| WATERFALL SPEED      | 1.0.7 DISPLAY 3/3             |
| 3D BANDSCOPE         | 1.0.7 DISPLAY 3/3             |
| CW in MODEM          | deliberately removed in 1.0.7 |

Never factory-reset a 1.0.5 radio to “reveal” a 1.0.7 item.

If **3D BANDSCOPE** is present but the view does not appear, set **DISPLAY 1/3 → AUDIO SCOPE = OFF**. That is the documented 1.0.7 display prerequisite; do not jump straight to a factory reset.

## After a failed/partial update

- Do not keep reflashing random images.
- Remove accessories/battery and use stable external supply exactly per official tutorial.
- Confirm system image and baseband stages both completed.
- Use only authorised X6200 archive, verify checksum.
- Check SYSTEM INFO.
- If it cannot reach recovery/update screen, stop and contact authorised support with version/photo/steps.

Do not substitute an X6100 image or instructions.

## When a factory reset is justified

Record configuration first. Reset when:

- the release instructions require it;
- menu/state remains corrupt after normal restart/defaulting one bank;
- support directs it;
- system/baseband update completed but settings are incompatible.

Reset clears personal settings, confirms twice and restarts. Restore in small groups, testing after each, so a bad old value is not immediately recreated.

## Evidence to give support

- full SYSTEM INFO photo;
- serial/hardware revision if requested (do not post sensitive IDs publicly);
- power source measured under load;
- bare-radio/dummy-load result;
- exact steps and whether receive/transmit/app;
- which accessories/cables;
- short video/audio/screenshot;
- whether problem follows band, mode, battery/external power or firmware update.

“Doesn't work” is hard to diagnose; “1.0.7, DEV CAT reads frequency but native profile PTT fails into dummy load while body PTT works” is actionable.

## Key takeaways

- Triage power, RF, state, neutral receive, accessories and version before reset.
- Default DFL/open SQL/high RFG cures many “deaf” cases.
- Isolate transmit using body PTT, built-in mic, dummy load and low power.
- DEV/HOST, USB audio/CAT and Wi-Fi/WFSERVER are separate layers.
- Time and audio overdrive cause more FT8 failures than low power.
- 1.0.6/1.0.7 explain many missing/moved controls and documented freezes.
- Use forced shutdown/battery removal only for a true freeze; use official two-stage update only.
- Give support versions, controlled test results and exact reproduction steps.

For habits that prevent most of these faults, continue to [Best Practices](outpost:entry/logbook73.guide.x6200/best-practices).
