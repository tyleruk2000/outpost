# Troubleshooting

A DigiPi has satisfyingly few moving parts, and its failures sort cleanly by layer: power and card, network, audio path, then the mode's own world. This chapter is organised by symptom, worst-panic first, and each entry names the layer before the fix — because on this box, diagnosing the _layer_ is nine tenths of the repair. Keep the [install chapter](outpost:entry/logbook73.guide.digipi/install) beside it; half the cures are re-walking one of its steps deliberately.

## The `DigiPi` hotspot never appears (first boot)

Layer: power and card — the network can't fail before the box has booted.

1. **Power supply first.** Undervoltage is the great imitator of every Pi fault. Try the best supply you own, not the drawer's most convenient.
2. **The flash itself.** If you didn't use Balena Etcher, was the image **unzipped before writing**? (The documented gotcha.) Re-flash with verification on; try a different card — cards fail young or lie about their size, especially bargain ones.
3. **The board.** Is it a [supported Pi](outpost:entry/logbook73.guide.digipi/hardware)? The single-core boards (original Zero, 3A, 2B) are explicitly unsupported — symptoms of trying anyway include exactly this one.
4. **Patience, once.** First boots do more work than later ones; give it a couple of minutes before each retry.

## Hotspot appeared, but wifi setup won't take / it never joins the home network

Layer: network configuration.

- Re-join `DigiPi` (password `abcdefghij`), revisit `http://10.0.0.5/wifi.php`, and re-enter the SSID and password watching for the classics: capitalisation, a trailing space from a phone keyboard's autocomplete, the neighbour's similarly-named network.
- 2.4 GHz-band considerations apply as with any small wifi device — if your network's name only lives on an exotic band, give the Pi a name it can see.
- After the reboot, the box has _left_ the hotspot: its absence is progress, not failure. Go look for it on the home network (next entry).

## Can't find the box on the home network

Layer: name resolution, not the box.

1. Try **`http://digipi/`** first; if that fails, **the router's client list** for the newest wifi device, then browse to its IP directly.
2. Bookmark the IP when found; some networks simply never resolve the friendly name, and the IP is just as good.
3. If the router shows no new client at all, the join failed silently — back one entry.
4. Reachable yesterday, gone today? Routers reshuffle addresses; check the client list again before suspecting anything on the shelf.

## The web page loads, but a mode won't start

Layer: the hat rack. One radio, one audio path — [the web-interface chapter](outpost:entry/logbook73.guide.digipi/web-interface)'s model.

- **What is already running?** Stop the current service before starting the next; "won't start" is usually "something else already owns the audio".
- If a stop/start cycle misbehaves, the appliance move is honest and cheap: reboot the box. Read-only design makes this consequence-free, and it clears wedged audio ownership definitively.

## Deaf: a mode runs but decodes nothing

Layer: the receive audio path — radio → interface → Pi.

1. **Is there anything to hear?** Tune a _known-busy_ signal: the regional APRS channel at commute time, an FT8 band mid-afternoon. Diagnosing receive on a silent frequency wastes evenings.
2. **Radio settings:** volume feeding the interface at a sane level, squelch open for data work, right frequency and (on HF) right sideband convention.
3. **Interface path:** the [Digirig levels chapter](outpost:entry/logbook73.guide.digirig/levels) and its troubleshooting apply nearly verbatim to any Type B interface — cable in the right socket, pinout matching _your_ radio, recording level neither starved nor slammed. Type A radios: the rig's own USB-audio level menus.
4. **Prove the halves separately** where you can — headphones on the radio prove RF-to-audio; a decode of a strong station proves audio-to-Pi.

## Mute: transmissions key nothing, or key but send silence

Layer: PTT line, then transmit audio — they fail independently.

- **Does the radio key at all?** Watch its TX indicator during a send. No key-up → PTT line: interface cabling and the [interface guide's PTT section](outpost:entry/logbook73.guide.digirig/how-it-works). Keys but nobody hears you → transmit audio: playback level on the Pi's audio device, radio's data/mic gain, and the [overdrive discipline](outpost:entry/logbook73.guide.digirig/levels) (too _much_ level garbles as surely as too little).
- **Stuck transmitting** → stop the service, then look for the usual suspect from the interface world: something on the serial side keying when it shouldn't; the [Digirig troubleshooting](outpost:entry/logbook73.guide.digirig/troubleshooting) entry on unwanted PTT applies.
- **Keys, transmits, then USB chaos mid-transmission** → RF getting back into the wiring. Ferrites on the USB and audio leads, antenna further from the box, power down while testing: the [RFI treatment](outpost:entry/logbook73.guide.digirig/troubleshooting) in the interface guide is the full course.

## APRS specifically misbehaving

- **Beacons transmit but never appear on the internet maps** → somebody must iGate you: in thin-coverage areas that may be nobody. The local map ([chapter 4](outpost:entry/logbook73.guide.digipi/aprs)) showing your own transmissions proves your station; the internet's silence may be geography.
- **Digipeater enabled but nothing repeats** → confirm packets are _heard_ (map fills?) and that heard packets actually request digipeating with a [path](outpost:entry/logbook73.handbook/aprs-paths) your station serves.
- **iGate connects nothing to APRS-IS** → the APRS-IS **passcode** from [setup](outpost:entry/logbook73.guide.digipi/install), and whether the box currently has internet at all ([field mode](outpost:entry/logbook73.guide.digipi/phone-operating) deliberately doesn't).

## Winlink sessions failing

Work the [layer discipline from chapter 5](outpost:entry/logbook73.guide.digipi/winlink): **telnet failing too?** → account/identity, no radio involved. **Telnet fine, RF failing?** → gateway choice, band, propagation, then levels. **Connects then collapses?** → margin: nearer gateway, better band, and the transmit-audio checks above. The gateway directory is part of the toolkit — a gateway being absent _right now_ is common and is not your station's fault.

## The screen is blank (but the web interface works)

Layer: display hardware/variant — the box itself is fine, as the working web page proves.

- Confirm the panel is genuinely one of the [supported controllers](outpost:entry/logbook73.guide.digipi/hardware) (ST7789 / ILI9341 / ILI9486 / MHS35 / DSI / HDMI) — lookalike clones with different controllers are the classic cause.
- Remember the documented limit: **DSI panels are unsupported on the Zero 2 W.**
- Reseat the connection; hats and ribbon cables loosen in transit.

## The box was fine and now behaves oddly

- **Power event or card age?** Try the spare card ([the two-card strategy](outpost:entry/logbook73.guide.digipi/updates)); if the spare is fine, re-flash the suspect.
- **After an update?** Re-check the release announcement — changed defaults masquerade as faults ([updates chapter](outpost:entry/logbook73.guide.digipi/updates)).
- **When stuck**, the community layers from [chapter 9](outpost:entry/logbook73.guide.digipi/updates) — Discord for live eyes, the mailing list for searchable history — with your symptom, your image version, and what layer you have already cleared. That last clause is the difference between a five-minute answer and a shrug.

The meta-rule, one last time: **card and power, then network, then audio, then the mode.** Walk the layers in order and this chapter stays short in practice, whatever length it is on paper.
