# Retevis RT95: the small mobile set that deserves a real manual

The **Retevis RT95** is a compact analogue FM mobile radio for 2 m and 70 cm. It is a useful step up from a handheld: the radio runs from a 13.8 V supply, feeds a proper external antenna, delivers three power levels up to a nominal 25 W, and has a front-firing speaker plus a speaker in the microphone. It is small enough for a car, camper, compact base station or go-box.

The factory manual is unusually complete about button sequences but unusually terse about judgement. It tells you that Channel Menu 12 offers `BU`, `RL` and `OFF`; it does not tell you which busy-channel lockout protects an amateur repeater channel, or why tone squelch must never be mistaken for privacy. This companion guide supplies that missing layer: **what each setting changes, when it is useful, a sensible starting point and the traps that matter.**

## What it actually is

| Capability           | RT95 reality                                                                    |
| -------------------- | ------------------------------------------------------------------------------- |
| Radio type           | Analogue FM dual-band mobile transceiver                                        |
| Bands                | 2 m and 70 cm; exact factory limits depend on market version                    |
| Power                | Nominal 25 W / 15 W / 5 W                                                       |
| Memories             | 200, with names and per-channel tones, bandwidth, power and signalling          |
| Display              | Colour TFT, electrically reversible for upside-down mounting                    |
| Receive arrangement  | Main plus sub-channel **dual watch**, using one receive path                    |
| Transmit arrangement | The selected **main** channel only                                              |
| Modulation           | Analogue FM; no DMR, C4FM, D-STAR or SSB                                        |
| Position/data        | No GPS, APRS or packet modem                                                    |
| Programming          | Front panel, official CPS, and current Retevis listings advertise CHIRP support |
| Supply               | 13.8 V DC ±15%; the manual recommends a 12 A regulated base supply              |

This is not a scanner with wideband airband receive, and it is not a digital-voice radio. Its strength is narrower: it is a small, clear, configurable **analogue mobile** for local simplex, repeaters and club nets.

## Market versions are not interchangeable facts

The official multi-language manual lists these factory amateur ranges:

- **EU:** VHF `144–146 MHz`, UHF `430–440 MHz`
- **US:** VHF `144–148 MHz`, UHF `430–440 MHz`

Product batches, programming software and national versions can differ. Treat the printed label, the radio's own limits and the current manufacturer documentation for **your unit** as the hardware facts. Treat your licence and national band plan as the legal facts. A radio accepting a frequency never grants permission to transmit there.

The RT95's nine tuning steps (`2.5`, `5`, `6.25`, `10`, `12.5`, `20`, `25`, `30`, `50 kHz`) and three bandwidths (`25`, `20`, `12.5 kHz`) let it fit several channel plans, but the correct values still depend on the service and country.

## The screen is two channels, not two complete radios

The upper and lower rows can watch two frequencies or memories. One is the **main** channel; that is the side from which the RT95 transmits. The other is a watched sub-channel. When dual watch is enabled the receiver samples both, but it does not become two simultaneous full-duplex receivers. If both become active together, expect one to win rather than two mixed conversations.

This distinction matters in use:

- put the frequency you may need to answer on the main side;
- use the sub side for a calling channel, local repeater or event coordination channel;
- check the main-channel indicator before pressing PTT;
- do not assume the side that made a noise is automatically the side you will transmit on.

[Scan and dual watch](outpost:entry/logbook73.guide.rt95/scan-signalling) explains a calm way to use both without transmitting on the wrong frequency.

## Features you will use

- **VFO and memory operation.** Explore in VFO, then save dependable repeaters and simplex channels into named memories.
- **Separate receive and transmit tones.** Use a transmit CTCSS tone to open a repeater without needlessly muting your own receiver.
- **True odd split.** `RTDF` shows an independent receive frequency above and transmit frequency below when a normal offset is not enough.
- **Frequency reverse and talk-around.** Reverse listens to a repeater input; talk-around temporarily works direct on the output.
- **Flexible scan.** Scan VFO steps or selected memories, choose time/carrier/stop behaviour, and exclude nuisance channels.
- **Six programmable front keys.** Arrange the functions you touch while operating instead of menu-diving.
- **Reversible display and two speakers.** Useful for under-dash, shelf or go-box installations.
- **Tone burst.** The microphone can send 1000, 1450, 1750 or 2100 Hz where a legacy repeater requires it.

## Features most amateurs can leave alone

DTMF and 5-tone selective calling, ANI, remote stun/kill/wake and the optional scrambler come from commercial-fleet radio practice. They are not digital voice and they do not make an amateur conversation private. Leave optional decode and scrambling off unless you have a specific, lawful system that requires them. Ordinary repeater access normally needs only the published frequency, shift and transmit CTCSS tone.

## How this guide was checked

This guide was reviewed on **17 August 2026** against the official Retevis RT95 multi-language instruction manual, the official RT95 product specification/download page and the official programming-software listing. Where the manual contains an obvious numbering or translation error, this guide calls it out instead of silently inventing an answer. Manufacturer specifications and software support can change; verify a new hardware or firmware revision before programming or transmitting.

- [Official Retevis RT95 product and downloads](https://www.retevis.com/products/rt95-25w-dual-band-ham-mobile-radio-with-program-cable)
- [Official RT95 multi-language manual (PDF)](https://v3.retevis.com/Themes/Retevis/Assets/files/download/Manuals_Mobile_Radios/RT95-Multi-Language-Manual.pdf)
- [Official Retevis programming-software downloads](https://www.retevis.com/downloads/software)

## Read next

Start with [Installation, controls and the first power-on](outpost:entry/logbook73.guide.rt95/getting-started). If the radio is already installed, the [complete menu map](outpost:entry/logbook73.guide.rt95/menu-reference) is the fastest route to a setting, and the [quick reference](outpost:entry/logbook73.guide.rt95/quick-reference) is designed to keep beside the microphone.
