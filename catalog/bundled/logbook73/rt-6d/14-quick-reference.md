# Quick reference card

_The whole guide on one page: the keys, the settings, the numbers and the first fixes. Print it, fold it, keep it in the radio bag._

## Essential keys

| Key                | Does                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `VFO/MR`           | Toggles VFO (frequency) mode and channel (MR) mode                                       |
| `A/B`              | Moves the main-band highlight between regions A and B — PTT transmits on the bright line |
| **Side key 1**     | Default: **Monitor** — hold to force the squelch open                                    |
| **Side key 2**     | In VFO mode, flips the current region between **analogue and digital**                   |
| **PTT**            | Transmits on the main region; `Slaver PTT` (assignable) keys the **B** band instead      |
| Long press `#`     | Key in a transmit frequency directly (also toggles input method)                         |
| Short press `#`    | On a digital channel: starts a call (single / group / all-call)                          |
| Long press `*`     | Locks the keypad (repeat to unlock); short `*` cycles channel row display                |
| `0`–`9` long press | Ten assignable actions (set in `02 Key Define`)                                          |
| **MENU / ↵/EXIT**  | MENU opens and confirms; **▲/▼** moves; `↵/EXIT` always backs out, saving nothing        |

LED: **green on receive, red on transmit**. Lost? Press `↵/EXIT` a few times — it always walks you home.

## Factory reset

`01 Basic Settings → Initialization`. Keeps the firmware and calibration; **wipes your channels, zones, contacts, DMR ID and menu settings**. Back up your code plug from the CPS (USB-C data cable) _before_ you reset — read from the radio, save, then reset, then restore.

## Settings worth memorising

A DMR channel = **frequency + time slot + colour code + talkgroup** — all four must match or you get total silence.

| Setting                              | Value / note                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `Digital Setting → Personal ID`      | Your DMR ID from RadioID.net (usually 7 digits) — required before any DMR TX          |
| `Channel Settings → Color Code`      | `0`–`15`; **`1`** is the de-facto amateur default — shows as `CXX`                    |
| `Channel Settings → DMR Slot`        | `1` or `2` per the listing — shows as `T1`/`T2`; simplex hotspots use slot 2          |
| `Channel Settings → Contacts`        | The one talkgroup your PTT transmits to                                               |
| `Channel Settings → RX TG List`      | The talkgroups this channel unmutes for (build lists in `TG List Set`)                |
| `Channel Settings → Promiscuous`     | On = hear every talkgroup on the slot; PTT still goes only to `Contacts`              |
| `Channel Settings → TX Politely`     | **CC match** for repeaters, **Carrier Match** for shared simplex, Impolite bench only |
| `Channel Settings → Encryption`      | **Off, always** — illegal on the amateur bands                                        |
| `Channel Settings → TX Power`        | `Low` by default; `High` only for a genuinely marginal contact                        |
| `Channel Settings → TOT`             | A sane ceiling, e.g. 180 s house default                                              |
| `Channel Settings → RX Demodulation` | `FM` / `AM` / `SSB` — per analogue channel; SSB and AM are receive only               |
| `Basic Settings → Dual Standby`      | On = watch A and B; `TX Priority` `Edit`/`Busy` picks where PTT goes                  |
| `Basic Settings → Freq Step`         | `12.5` kHz suits most modern 2 m / 70 cm work                                         |
| `Basic Settings → Save CH`           | Stores the current VFO setup into a memory channel                                    |
| `09 Extend / GPS` and APRS menus     | **RT-6D Pro only** — absent on the plain RT-6D                                        |

## Go-to numbers

| Number                       | What it is                                                              |
| ---------------------------- | ----------------------------------------------------------------------- |
| `144.800` MHz FM             | APRS in Europe/UK (ITU Region 1) — **not** the North American `144.390` |
| `145.500` MHz FM             | 2 m FM calling channel (Region 1)                                       |
| `−0.600` MHz                 | Region 1 2 m repeater shift                                             |
| `1750 Hz`                    | Repeater tone burst (`Single Tone`; assign `Send Single Tone` to a key) |
| TG `91` / `235`              | Worldwide / UK-wide talkgroups (BrandMeister uses the raw number)       |
| TG `9990`                    | Parrot echo test — key up, pause a beat, speak, hear yourself back      |
| TG `4000`                    | Common network disconnect for dynamic talkgroups (check your network)   |
| `16777215`                   | All Call — built in, un-deletable; use sparingly                        |
| `WIDE1-1,WIDE2-1`            | The polite two-hop APRS path; SSID `-7` on foot, `-9` mobile (Pro)      |
| TX `136–174` / `400–470` MHz | Transmit range — amateur allocations only, per your licence             |

## When things go wrong

- **DMR won't key the repeater/hotspot** — `Personal ID` set? Then check `Color Code` and `DMR Slot` against the listing.
- **DMR channel is silent** — colour code, slot, then `RX TG List`; flip `Promiscuous` On to hear everything on the slot.
- **Analogue won't open the repeater** — wrong or missing `TX CTC/DCS` sub-tone; some older machines want the 1750 Hz burst.
- **SSB sounds like a duck** — set `RX Demodulation` to `SSB` and creep on with the smallest `Freq Step` until the voice sounds natural.
- **APRS beacon never appears (Pro)** — frequency first: `144.800` in Region 1; then a real GPS fix and `Station Mode` = GPS mobile.
- **GPS won't fix (Pro)** — `GPS On-off` on, clear view of the sky; a cold start takes several minutes.
- **CPS won't connect** — use a _data_ USB-C cable (many bundled leads are charge-only), install the driver, pick the right COM port; always read before you write.
- **Transmit but nobody hears** — outside your transmit band, wrong region's PTT (check the A/B highlight), or a nearly flat battery.
- **Radio killed and won't revive** — Wake-up only works if an Activate code was set beforehand; set one now, as hygiene.
