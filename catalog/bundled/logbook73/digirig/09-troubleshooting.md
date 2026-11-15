# Troubleshooting

The Digirig's official troubleshooting philosophy deserves quoting before any symptom, because it is the whole method in two lines: **"simplify and isolate — narrow your experimentation scope to a single concern"**, and when a working station has stopped working after changes, **"rollback to what works."** Test one link at a time, against known-good pieces, and every fault in this chapter falls in minutes. The symptoms below are ordered from the computer outward — the direction faults actually distribute.

## The computer can't see the Digirig

**No sound device, no COM port, or only one of the two.**

1. **The USB lead.** The official first suspect, verbatim: "some cables are missing the data lines and only good for charging." Swap for a known data lead before touching anything else.
2. **Different USB socket**, then **a different computer** — the official escalation that separates box from host in two moves.
3. **COM port with an exclamation mark:** install the Silicon Labs CP210x driver ([chapter 1](outpost:entry/logbook73.guide.digirig/getting-started)).
4. Both devices present but the app can't open them → the app-side entries below, not the hardware.

A healthy unit always shows **both** devices; one-of-two points at cable/port/driver, never at settings.

## No receive audio

**The band is roaring in the radio's speaker and the computer hears silence.**

- **Cable in the AUDIO socket?** The official list starts here because the two sockets are identical twins. Serial socket ≠ audio socket.
- **The right cable?** "Similar looking cables can have different pinouts" — the lookalike trap from [chapter 3](outpost:entry/logbook73.guide.digirig/cables).
- **Windows privacy:** the "sound card device is not ready" error means the microphone permission is blocked for desktop apps — a settings toggle, not a hardware fault.
- **Squelch open** on the radio (data hates squelch tails), volume at the mark on HT-class setups.
- **Recording level** up from zero; app pointed at the **Digirig** input, not "default".
- **Hear what the computer hears:** enable _Listen to this device_ on the Digirig recording device — band noise in your speakers proves the path into the computer, isolating the fault to the application's device selection.
- Still nothing: try the other audio channel — the official guide notes left/right/both channel testing, since radios and cables differ in which channel they drive.

## No transmit audio

**PTT keys, the radio shows transmit, and nothing modulates.**

- App output device = **Digirig**, playback level above zero, OS not muted.
- **The headphone test**, straight from the official guide: unplug the radio cable, "plug a regular 3.5mm stereo headphones into Digirig's audio socket and initiate transmit cycle" — hearing your tones in the headphones proves everything up to the cable.
- Radio expecting **data-port input** but set to mic (or vice versa) — the radio-menu check from [chapter 3](outpost:entry/logbook73.guide.digirig/cables).
- Radio in the wrong mode: digital voice or FM where the data mode should be, on rigs where that matters.

## PTT will not key — or will not stop

**Won't key:**

- The official LED check settles whether PTT is even the problem: if the radio's status light flips to transmit "in sync with the transmission time frame then there is no problem with PTT" — the fault is audio, not keying.
- PTT method **RTS**, on the **Digirig's** COM port, in the transmitting app; no other program holding the port.
- Hardware proof, per the official guide: short the PTT signal to ground on the plug that would enter the Digirig — the radio keys → radio+cable fine, computer side at fault; doesn't key → cable or radio socket.

**Won't stop, or keys at random:**

- **Disable handshake and hardware flow control** — flow control drives RTS for its own purposes; this is the classic "transmits when the program opens".
- **Disable serial CAT in software when no CAT radio is attached** — probing toggles lines.
- **Linux with a GPS daemon:** `gpsd` probes new serial ports and wiggles their control lines; the documented fix is `USBAUTO="false"` in `/etc/default/gpsd`.

## CAT is dead

The [rig-control diagnostic ladder](outpost:entry/logbook73.guide.digirig/rig-control) is the full treatment; the compressed version: port/baud/model triple-check → radio actually supports CAT on that socket → **the loopback test** (short TX/RX at the cable's radio end; typed characters echo = your side is fine) → remember lines are named from opposite ends ("the radio's TX can be described as the interface's RX") → serial **configuration** matches the radio's dialect. And after any port chaos: reboot — the official remedy for locked serial ports, undignified and effective.

## It works… until real power meets the real antenna

**Distortion, stuck PTT, USB disconnects or app crashes that only happen on transmit** — the signature of RF coming home to roost. The official sequence:

1. **Confirm the diagnosis:** minimum power, or a dummy load — problem vanishes? It's RF, proceed.
2. **Fix the antenna system first:** improve [SWR](outpost:entry/logbook73.handbook/swr); "install a choke balun at the antenna's feed point."
3. **Ferrites on the cables** — USB and audio leads through clip-ons or a few turns on a ring — "to block reflected RF"; the [theory chapter](outpost:entry/logbook73.guide.digirig/theory) explains why USB falls over first.
4. Re-test at each step; stop when clean at full power. [EMC and RFI](outpost:entry/logbook73.handbook/emc-rfi) carries the deep version.

## Levels are "working" but signals are ugly

Reports of wide/distorted, harmonic bars beside your waterfall trace, active ALC — all one fault family with one chapter: [levels](outpost:entry/logbook73.guide.digirig/levels). The one-line reminder: find the maxed-out stage; every knob belongs mid-range with ALC asleep.

## The method, restated as a checklist

1. **One change at a time**; write down what you changed.
2. **Known-good baseline first**: WSJT-X, the recommended baseline app, with its _Test CAT_ / _Test PTT_ buttons.
3. **Disconnect the non-essentials** — amplifiers, tuners, hubs — per the official method, until the minimal chain works.
4. **Isolate by halves**: loopbacks (audio and serial), the headphone test, the LED check — each one cuts the suspect list in half.
5. When it worked last week: **rollback** — the update, the new cable, the "improved" setting.

The quiet truth of interface troubleshooting: the hardware is almost never broken. The lead is charge-only, the pinout is a lookalike, the permission is blocked, the flow control is on, or the RF is loose — all findable in one patient evening with this page open.
