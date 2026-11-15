# What the RT95 settings are doing underneath

Understanding five ideas—power, deviation/bandwidth, squelch, tones and duplex—turns most of the RT95 menu from codes into ordinary engineering.

## A mobile's advantage is mostly the antenna system

Moving from a 5 W handheld to 25 W is about 7 dB, a worthwhile but not magical increase. Moving from a rubber whip at body height to a well-sited resonant vehicle/base antenna with low-loss coax can transform both transmit **and receive**. That two-way improvement is why the RT95 often feels much stronger than its wattage ratio suggests.

The radio expects 50 Ω. A badly mismatched antenna sends energy back toward the output stage, causes heat and may trigger protection or damage. Measure SWR across the actual frequencies you will use, not one convenient point, and inspect connectors/coax before blaming the radio.

## Power and duty cycle

FM draws steady power for the whole PTT period. The alloy case is the heatsink; give it air. Long overs, VOX false-triggering and extended data or control tones build heat faster than short voice exchanges.

Use 5 W where it works, 15 W when the margin needs help and 25 W for a genuinely difficult path. A time-out timer protects against a trapped PTT, but it does not make repeated long transmissions thermally kind.

## Step, channel spacing and occupied bandwidth

- **Step** is the grid the VFO/offset moves on.
- **Channel spacing** is the separation between assigned channel centres.
- **Occupied bandwidth/deviation** is how much spectrum the transmitted FM signal uses.

The RT95 labels its bandwidths `WID` (25 kHz), `MID` (20 kHz) and `NAR` (12.5 kHz). Select what the local system expects. Too wide can splash into neighbours; too narrow makes your audio quieter at a wide receiver and may clip if levels are mismatched.

## Squelch and receive gating

Carrier squelch asks, “is the signal strong enough?” `RCDT` asks, “does it contain this CTCSS/DCS?” `T-DEC` asks, “does it contain this optional DTMF/5-tone call?” Channel Menu 06 combines those gates.

A moving signal meter with silence means the first question passed but a later gate did not. Pressing `MON` bypasses ordinary squelch and is the first diagnostic. The strongest general-purpose setup is often not the strictest one: low carrier squelch, receive tone off, optional decode off.

## Encode is not decode

A repeater may require your **transmit** CTCSS tone to open its input. That is `TCDT`. Whether your speaker waits for a tone on the repeater output is a separate choice, `RCDT`. Mixing them is the source of many “I can key it but hear nothing” or “I hear it but cannot key it” reports.

## Standard duplex, reverse, talk-around and `RTDF`

- **Offset:** receive plus a signed difference gives transmit; ideal for normal repeaters.
- **Reverse:** swap the two sides, including tones, to inspect the input path.
- **Talk-around:** temporarily bypass the repeater and speak direct on the chosen side.
- **RTDF:** display two explicitly independent VFO frequencies; useful for a true odd split.

Use the simplest model that describes the system. An ordinary repeater stored as `RTDF` is harder to inspect and easier to mis-key than the same pair stored as receive + offset.

## Dual watch is time sharing

One receiver cannot continuously demodulate two unrelated carriers at once. Dual watch rapidly samples main and sub and settles when activity is found. It is excellent for awareness but can clip the first syllable, pause the other side while busy, and cannot mix simultaneous conversations. It also does not choose your transmit side for you.

## Tone burst, DTMF and 5-tone are different languages

- **Tone burst:** one audible tone (often 1750 Hz) sent briefly to wake a legacy repeater.
- **CTCSS:** one low continuous analogue tone under speech.
- **DCS:** a continuous low-speed coded waveform under speech.
- **DTMF:** pairs of audible tones, like a telephone keypad.
- **5-tone:** a timed sequence of five audio tones used for selective calling/identity.

They are not interchangeable. Follow the system documentation exactly and leave unused decoders off.

## Busy lockout cannot hear the hidden station

`BU` prevents transmit when **your receiver** detects a carrier. Two mobiles on opposite sides of a hill may each fail to hear the other while both reach a high repeater. No menu setting solves that hidden-transmitter problem. Listen, wait after a conversation, identify, keep overs concise and accept that occasional doubles happen.
