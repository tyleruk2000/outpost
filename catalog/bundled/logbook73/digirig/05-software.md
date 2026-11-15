# Software: one settings block for everything

Every digital-mode application asks the same three questions — _which sound device? which PTT method? which rig?_ — and with a Digirig the answers are always the same three: _the device you renamed "Digirig"; RTS on the Digirig's COM port (or CAT); your radio via Hamlib/whatever the app uses_. This chapter walks the applications that matter, in the order most people meet them, with the Digirig-specific settings spelled out once so the pattern becomes obvious.

## The universal settings block

Whatever the application, you will fill in some arrangement of:

| Setting                  | Value with a Digirig                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Audio input              | **Digirig** recording device (never "default")                                     |
| Audio output             | **Digirig** playback device (never "default")                                      |
| PTT method               | **RTS**, on the Digirig's COM port — or **CAT** if your rig control handles keying |
| Handshake / flow control | **None / disabled** — flow control fights PTT-by-RTS                               |
| Rig / CAT                | Your radio model, Digirig COM port, radio's baud rate                              |
| Split / mode control     | Per app; only works when CAT works                                                 |

Two rules prevent the classic tangles: **one program owns the COM port at a time** (a stuck "port in use" clears with the official remedy — reboot to release locks, then set up a [rig-control multiplexer](outpost:entry/logbook73.guide.digirig/rig-control) if two programs genuinely need the rig), and **check the waterfall before believing any "no signals" complaint** — audio routing errors look identical to dead bands.

## WSJT-X: FT8 and the weak-signal family

The first stop for most owners, and the official troubleshooting guide's recommended baseline app ("start with basic software configured for direct radio control") precisely because its built-in tests are excellent.

_File → Settings:_

- **Radio tab:** _Rig:_ your radio model (or _None_ for audio+PTT-only setups). _CAT Control:_ Digirig COM port, baud per the radio's manual. _PTT Method:_ **RTS** with the same port — or _CAT_ on radios that key via the protocol. _Handshake:_ **None**. Press **Test CAT** (should go green), then **Test PTT** (radio keys).
- **Audio tab:** input and output both **Digirig**.
- Operating: pick a band, watch decodes flow, and keep the _Pwr_ slider inside the [levels discipline](outpost:entry/logbook73.guide.digirig/levels). The [FT8 handbook chapter](outpost:entry/logbook73.handbook/ft8) covers the operating side.

WSJT-X proves the whole chain with two buttons — which is why, whenever something breaks elsewhere, the official advice is to come back here and re-prove the basics.

## fldigi: the multi-mode workhorse

PSK31, RTTY, Olivia, CW and the rest of the [classic data modes](outpost:entry/logbook73.handbook/hf-data-modes):

- _Configure → Soundcard → Devices:_ PortAudio, capture and playback both **Digirig**.
- _Configure → Rig Control:_ either **hardware PTT** (_Use separate serial port PTT_, Digirig COM, **PTT via RTS**) or full CAT via **flrig/Hamlib** with your radio selected — not both fighting.
- fldigi's tuning display makes it the best app in the stable for _seeing_ audio problems: flat-topped signals and harmonic bars appear here first.

## Winlink: email over radio

On Windows, Winlink Express with the various HF and packet modems; cross-platform, **Pat** — the same client the [DigiPi](outpost:entry/logbook73.guide.digipi/winlink) builds its Winlink service around. Digirig's role is unchanged: audio devices, PTT by RTS or CAT. Session types that use software modems (ARDOP and friends) are sound-card modes exactly like FT8 as far as the interface is concerned. The one Winlink-specific caution: sessions are long full-duty transmissions — have the [levels](outpost:entry/logbook73.guide.digirig/levels) right _before_ the first real connect, and mind the radio's duty-cycle manners.

## APRS and packet: Direwolf

[Direwolf](outpost:entry/logbook73.handbook/aprs) is the software TNC that turns radio+Digirig into a packet modem for APRS clients, [iGates](outpost:entry/logbook73.handbook/aprs-igates) and digipeaters:

- In `direwolf.conf`: `ADEVICE` set to the Digirig's capture/playback devices; `PTT` line set to the Digirig COM port using **RTS** (Direwolf's documented serial-PTT support matches the hardware exactly).
- HT stations: volume at the marked position, squelch open, VOX off ([chapter 3](outpost:entry/logbook73.guide.digirig/cables)).
- Everything downstream — beacons, paths, maps — is ordinary APRS; the [APRS handbook chapters](outpost:entry/logbook73.handbook/aprs-your-station) take it from here. And if you would rather have all of this pre-wired with a web interface on a Raspberry Pi, that is literally the [DigiPi](outpost:entry/logbook73.guide.digipi/aprs).

## SSTV, JS8Call and the rest

The pattern holds everywhere: JS8Call mirrors WSJT-X's settings screens almost exactly; SSTV programs want the two audio devices and a PTT method; VarAC and other keyboard modes likewise. By the third application you configure, you will be filling the settings block from memory — that is the Digirig's real gift: **one hardware answer to every software question**.

## Phones, tablets and single-board computers

Officially the supported systems are Windows, macOS and Linux. Two adjacent worlds deserve honest signposts:

- **Android** apps that speak USB audio and serial directly are community territory — widely used, not officially documented; expect per-app quirks.
- **Raspberry Pi** is fully inside the Linux story and is where the [DigiPi](outpost:entry/logbook73.guide.digipi/overview) lives: a curated Pi image with Direwolf, Pat, WSJT-X-class tools and a phone-friendly web interface, listing the **Digirig Mobile (not the Lite)** among its supported interfaces. If your goal is "digital modes from my phone via a box on the shelf", that guide is the destination and this one is the wiring.

## A worked first evening

1. [Chapter 1](outpost:entry/logbook73.guide.digirig/getting-started) done: devices named, levels at the 20–50% start, PTT proven dry.
2. [Chapter 3](outpost:entry/logbook73.guide.digirig/cables) done: cable acceptance test passed on a dummy load.
3. WSJT-X: settings block above; **Test CAT**, **Test PTT** — both green.
4. [Levels](outpost:entry/logbook73.guide.digirig/levels): _Tune_ into the dummy load, ALC asleep, note the numbers.
5. Antenna on, 20 m FT8 by day or 40 m by evening, decode for ten minutes, answer a CQ.
6. Log the contact — and the settings. The second evening starts at step 5 forever after.
