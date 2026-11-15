# Quick reference card

The whole guide, compressed to one printable page — for the go-kit pouch, next to the settings card.

## First boot / field connection

1. Flash image (**unzip first** unless using Balena Etcher) — fits an `8 GB`+ card.
2. Power on; wait for wifi network **`DigiPi`**.
3. Join it — password **`abcdefghij`**.
4. Browse **`http://10.0.0.5/wifi.php`** (or `http://10.0.0.5/` → Wifi) to set home wifi; reboot.
5. On home wifi: **`http://digipi/`** — or the IP from your router's client list.
6. Setup form: **callsign · passcodes (APRS-IS, Winlink) · grid**.

In the field there is no step 4–5: the `DigiPi` hotspot _is_ the network; operate at `10.0.0.5`.

## Supported hardware at a glance

| Part                  | Supported                                                                           |
| --------------------- | ----------------------------------------------------------------------------------- |
| **Pi**                | Zero 2 W · 3A+ · 3B+ · Pi 4 · Pi 5 (❌ single-core: Zero, 3A, 2B)                   |
| **Type A radios**     | USB-equipped rigs (IC-7300, FT-991, IC-705, Xiegu…) — one USB cable                 |
| **Type B interfaces** | AIOC · Digirig **Mobile** (not Lite) · DRA-Pi-Zero · DigiPi Hat · Fe-Pi + N7EBB RIB |
| **Screens**           | ST7789 1.3" · ILI9341 2.8" · ILI9486/MHS35 3.5" · DSI 5"/7" (❌ on Zero 2 W) · HDMI |

## The modes

| Hat                | What it gives you                                                                     |
| ------------------ | ------------------------------------------------------------------------------------- |
| **APRS**           | WebChat messaging · map/dashboard · digipeater (`144.390` / `144.800 MHz` EU) · iGate |
| **Winlink**        | Pat email client + server · telnet · **ARDOP** (HF) · MERCURY (experimental)          |
| **Weak signal**    | WSJT-X **FT8** · JS8Call                                                              |
| **Keyboard modes** | FLDigi: CW, PSK31, RTTY, MFSK, Olivia…                                                |
| **Pictures**       | Slow-scan TV                                                                          |
| **Plumbing**       | AX.25 node services/BBS · `44.*` IP tunneling · Bluetooth pairing                     |

One radio, one audio path — **one hat at a time**; stop a service before starting the next.

## Rules of the box

- Read-only filesystem: power cuts are harmless; **updates = re-flash** (two cards, rotated).
- Config changes through the web interface only; treat the image as firmware.
- Radio tuning is _your_ job — the right frequency/mode for the hat, before the hat transmits.
- Automatic roles (digi, transmitting iGate, Winlink server, beacons) = **check your licence's unattended/automatic conditions first**.
- One attended test transmission after _any_ change.

## First-aid (symptom → first check)

| Symptom                       | Check first                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------- |
| No `DigiPi` hotspot           | Power supply · image unzipped before flash · supported Pi?                        |
| Can't find `digipi/`          | Router client list → use IP directly                                              |
| Mode won't start              | Another service holds the audio — stop it (or reboot; it's free)                  |
| Decodes nothing               | Busy frequency? · squelch open · levels ([Digirig guide](outpost:entry/logbook73.guide.digirig/levels)) |
| Won't key TX                  | PTT path — interface cable/socket ([Digirig PTT](outpost:entry/logbook73.guide.digirig/how-it-works))   |
| Keys, nobody hears            | TX audio level — up if silent, **down** if garbled                                |
| USB drops during TX           | RF on the leads — ferrites, antenna further away                                  |
| Beacon not on internet maps   | Needs an iGate in range — maybe there isn't one                                   |
| Winlink RF fails, telnet fine | Gateway/band/propagation, then levels                                             |
| Blank TFT                     | Exact controller supported? · DSI ≠ Zero 2 W                                      |
| Was fine, now weird           | Swap to spare card · what image version?                                          |

## The settings card (fill in, laminate)

Callsign/SSIDs ______ · APRS-IS passcode source ______ · Winlink account ______ · Home wifi ______ · Image version ______ · Box IP ______

## Where help lives

KM6LYW Radio on **YouTube** (config/demo video) · project **Discord** · **Google Group** · source at `github.com/craigerl/digipi` (education/GPL — "not a recipe" for the image) · image + announcements via the **Patreon** supporter page.

Everything in long form: start at the [overview](outpost:entry/logbook73.guide.digipi/overview); partner-interface depth in the [Digirig guide](outpost:entry/logbook73.guide.digirig/quick-reference).
