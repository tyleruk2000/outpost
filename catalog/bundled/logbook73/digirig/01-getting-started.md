# Getting started: prove it before the radio arrives

The single most useful habit with any interface is to **prove each piece works before the next piece joins**. Radio problems hide inside computer problems inside cable problems, and untangling all three at once is how whole weekends disappear. This chapter gets the Digirig recognised, tested and named on your computer — with no radio attached — so that when the radio does arrive in [chapter 3](outpost:entry/logbook73.guide.digirig/cables), it is the only new variable.

## In the box, and on the box

The device itself has three sockets:

| Socket                   | What it carries                                                                 |
| ------------------------ | ------------------------------------------------------------------------------- |
| **USB** (Type-C)         | Power and data to the computer — one lead, that's the whole connection          |
| **AUDIO** (3.5 mm TRRS)  | Transmit audio to the radio, receive audio from the radio, **and the PTT line** |
| **SERIAL** (3.5 mm TRRS) | CAT control to radios that support it                                           |

Two purchases decide your first evening:

- **A genuine USB-C data lead.** The official guidance is explicit that the cord "must support both power/charging and data" — the charge-only leads that come with gadgets look identical and produce a perfectly dead-seeming Digirig. If nothing appears on the computer, suspect the lead before the box.
- **The cable set for your radio** — covered properly in [chapter 3](outpost:entry/logbook73.guide.digirig/cables). You can do everything in _this_ chapter without it.

## First plug-in: what should appear

Connect the Digirig to the computer. Two new devices arrive, because the box really is two devices behind an internal hub:

**On Windows,** open Device Manager:

- Under _Sound, video and game controllers_: a **"USB PnP Sound Device"** (or similar generic USB audio name). No driver needed — the CM108 codec is a standard class device.
- Under _Ports (COM & LPT)_: **"Silicon Labs CP210x USB to UART Bridge (COMx)"** — note the COM number; your software will ask for it. If this entry shows **an exclamation mark and no COM number**, install the CP210x driver from Silicon Labs — the one driver the Digirig ever needs, and only on systems that don't carry it already.

**On macOS,** the audio device appears in _System Settings → Sound_ and the serial port as `/dev/tty.SLAB_USBtoUART` (or `usbserial`) once the Silicon Labs driver is present; recent systems often include support out of the box.

**On Linux,** it simply works: the audio device joins the ALSA list, and the serial port appears as `/dev/ttyUSB0` (or the next free number). Add yourself to the `dialout` group if the port refuses permission.

> **Both devices, always.** Seeing the sound card but not the COM port (or vice versa) points at the cable or port, not at settings — a healthy Digirig always presents both. The [troubleshooting chapter](outpost:entry/logbook73.guide.digirig/troubleshooting) has the escalation list: different lead, different USB socket, different computer.

## Name it, tame it

Two pieces of official setup advice pay for themselves every single day afterwards:

1. **Rename the audio devices to "Digirig"** in your operating system's sound control panel — both the playback and the recording device. Six months from now, "Digirig" in a WSJT-X dropdown is self-explanatory; "USB PnP Sound Device" next to your webcam's "USB PnP Sound Device" is a coin-flip.
2. **Make sure the Digirig is NOT the system default sound device.** Otherwise every notification chime, video call and cat video plays out over the air the moment a transmit cycle starts, and — worse — your radio audio disappears from your speakers. Set your computer's normal audio back as default for both playback and recording; applications will select the Digirig explicitly.

While you are in the sound settings, apply the rest of the official checklist:

- **Set initial levels to 20–50%** on both the playback and recording device — a deliberately modest starting point that the [levels chapter](outpost:entry/logbook73.guide.digirig/levels) will refine against the radio.
- **Switch off audio "enhancements"** — AGC, noise suppression, spatial sound, and anything else the operating system offers to "improve" audio. Digital modes need the untouched waveform; enhancement is distortion here.
- **Windows privacy settings:** allow desktop applications to use the microphone. A blocked recording device produces the baffling "sound card device is not ready" class of error in radio software while looking perfectly healthy in the mixer.

## The loopback test: proving the sound card

Before any radio, prove audio in and audio out with one 3.5 mm TRS lead (or even headphones and a speaker):

1. Plug a 3.5 mm lead into the **AUDIO** socket, and loop its far end back — or simply plug in stereo headphones.
2. Play audio to the _Digirig playback_ device: you should hear it in the headphones. That is your transmit path, working.
3. For the full loop: connect the lead from the audio socket to your computer's own line-in (or a second recorder), play a tone, and record it back. Clean tone in the recording = the receive path works.

This five-minute ritual means that later, when a mode fails with the radio attached, you already _know_ the computer half is good — the fault hunt starts at the cable, which is where it usually ends.

## Proving PTT without a radio

The PTT line lives on the audio socket and closes when software raises **RTS** on the Digirig's COM port. You can watch it work with nothing attached:

1. In WSJT-X (or any digital-mode program), set _PTT method: RTS_ and _Port:_ the Digirig's COM port — and, per the official guidance, **disable handshake/flow-control options** (RTS/CTS/DTR handshaking), which fight with PTT-by-RTS for the same pins.
2. Press the program's _Test PTT_ button.
3. No radio yet, so watch for the absence of errors and — if you enjoy certainty — a multimeter across the PTT contacts of the audio plug will show the line closing to ground on demand.

If _Test PTT_ errors out, the COM number is wrong, another program holds the port, or the driver is missing — all computer-side, all fixable tonight, all covered in [troubleshooting](outpost:entry/logbook73.guide.digirig/troubleshooting).

## A note for phone and tablet operators

Officially, the Digirig "works with all major OS flavors: Windows, MacOS and Linux." In practice the community also runs it against Android devices over USB-OTG with apps that speak to USB audio and serial directly, and single-board computers are first-class citizens — the [DigiPi](outpost:entry/logbook73.guide.digipi/overview) explicitly lists the Digirig Mobile among its supported radio interfaces, which turns "computer" into "a Raspberry Pi you control from your phone". This guide sticks to the officially supported systems for its instructions and flags community territory as exactly that.

## Where you now stand

The computer recognises both halves of the interface, the audio devices are named and de-defaulted, levels sit at a sane starting point, enhancements are off, and both audio and PTT are proven with your own ears and eyes. Nothing that follows can shake your confidence in this layer — which is precisely the point. Next: [what is actually happening inside the box](outpost:entry/logbook73.guide.digirig/how-it-works), and the one hardware decision (serial configuration) that must match your radio.
