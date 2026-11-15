# Rig control: CAT without tears

Audio and PTT make a working station; CAT makes a _comfortable_ one. With rig control in place your logger stamps the true frequency, WSJT-X hops bands by itself, split operation happens without touching the radio, and the whole desk starts behaving like one instrument. This chapter is the deeper dive: what CAT actually is, matching the Digirig's serial side to your radio, the multiplexer question, and the diagnostic ladder for the day the rig goes silent on the wire.

## What CAT is, underneath

CAT — computer-aided transceiver control — is nothing more exotic than **a serial conversation in the radio maker's private dialect**: Kenwood-style text commands, Icom's CI-V binary frames, Yaesu's own opcodes. Software rarely speaks these dialects directly; it goes through a library — **Hamlib** in most open-source applications — that translates "set frequency" into whatever your radio expects. Your three settings (radio model, port, baud) exist to tell that library which dialect, which wire and which speed.

The Digirig's contribution is the wire: the CP2102 gives your computer an honest COM port, and the [hardware configuration](outpost:entry/logbook73.guide.digirig/how-it-works) makes that port electrically match the radio — logic levels, RS-232, CI-V or TX-500. Get the configuration right and CAT is usually a two-minute success; get it wrong and no software setting can save you, which is why this guide keeps repeating: **configuration is a hardware decision, made when ordering**.

## PTT by RTS or PTT by CAT?

With CAT working you have two ways to key the radio, and the choice matters less than _choosing exactly one_:

| Method             | How                                                 | Choose it when                                                                            |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **RTS** (hardware) | Serial control line closes the Digirig's PTT switch | Universal; radio-agnostic; keeps keying independent of protocol quirks — the safe default |
| **CAT** (protocol) | Software sends the radio a "transmit" command       | The radio family handles it well and you want the serial socket free of PTT semantics     |

The failure smell of an unclear choice: **stuck or phantom transmit**. The official troubleshooting entries map to it directly — _disable handshake and hardware flow control_ (flow control wiggles RTS for its own reasons), _configure PTT explicitly as RTS-controlled_ when that's your method, and _disable serial CAT_ in software when the connected radio has no CAT at all (otherwise some applications toggle lines while probing). One method, deliberately set, everywhere.

## Baud rates and radio-side settings

Two ends must agree:

- **The radio's menu** typically has settings for its CAT baud rate and, on Icoms, a CI-V address. Find them once, write them on the radio's card in the cable bag.
- **The software** must use the same baud on the Digirig's port. Wrong baud produces the most honest of failures: nothing at all, or garbage.

While in the radio's menus, check the related data-mode settings the [cables chapter](outpost:entry/logbook73.guide.digirig/cables) relies on: data-port input selected (not mic), data mode engaged where the radio has one, and any "data PTT" behaviour the manual documents.

## Sharing the rig: one port, many programs

The day arrives when the logger, WSJT-X and a cluster tool all want the radio. A serial port accepts **one** owner; everyone else gets "port in use" (and the official remedy for a wedged port is unglamorous and effective: reboot to release the lock). The proper fixes:

- **flrig or rigctld (Hamlib's daemon)** own the physical port and offer the radio to any number of clients over the network. Applications then select "flrig" or "Hamlib NET rigctl" instead of the COM port — a five-minute change that removes the whole class of conflict.
- **Logger-centric setups** (the logger owns the rig, other apps talk to the logger) achieve the same thing where supported.

If you run more than one Digirig — a second radio, a [DigiPi](outpost:entry/logbook73.guide.digipi/hardware) on the shelf — the official advice to **label each unit** stops the "which COM port is which box" comedy before it starts, because serial numbers otherwise all look alike at 2 a.m.

## The diagnostic ladder

CAT dead? Climb in order; each rung isolates one link:

1. **Port exists?** CP210x with a COM number in Device Manager ([chapter 1](outpost:entry/logbook73.guide.digirig/getting-started)); exclamation mark means driver.
2. **Port free?** Close the other candidates; reboot clears locks.
3. **Right port, right baud, right model** in the app — the boring trio that is the answer nine times in ten.
4. **Radio supports CAT at this socket?** Manual check — some sockets programme memories but don't do CAT; "confirm the radio supports serial CAT interface" heads the official list for a reason.
5. **The loopback test** — the official technique that splits the world in half: unplug the cable's radio end, **short the cable's TX and RX pins together**, open a serial terminal on the Digirig's port and type. **Your characters echo back** → computer, Digirig and cable all pass; the issue is the radio's socket, settings or the pin mapping _at the radio_. **No echo** → the fault is on your side of the short: pinout ("the radio's TX can be described as the interface's RX" — lines named from opposite points of view), cable fault, or a serial configuration that doesn't match the radio's dialect.
6. **Configuration audit**: an Icom CI-V rig on a logic-levels unit (or vice versa) passes loopbacks and still won't talk — electrical dialects differ. Match per [chapter 2](outpost:entry/logbook73.guide.digirig/how-it-works)'s table, or operate happily on audio+PTT while a re-jumpered unit is arranged.

## Living without CAT, gracefully

Plenty of excellent stations run audio+PTT only — every HT setup does, and any radio does in a pinch. The costs are clerical: set the dial by hand, tell the software the frequency (WSJT-X accepts manual frequency entry; loggers accept typed frequencies), and stay disciplined about logging the truth. The gains of adding CAT later are exactly the costs removed — which is a fine way to decide whether it is worth a differently-configured unit for that radio: if you band-hop constantly, CAT pays daily; if the radio lives on one FT8 frequency, RTS-and-a-dial is a complete station.

Next, for the curious: [what's actually happening in the theory underneath](outpost:entry/logbook73.guide.digirig/theory) — sound cards as modems, PTT methods compared, and why isolation matters.
