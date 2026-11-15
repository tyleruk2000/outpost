# Quick reference card

_The whole guide on one page: the keys, the menu items and the fixes you will actually reach for. Print it and keep it with the radio._

## Essential keys

| Key              | Short press                                                                                                          | Long press                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **MENU/Confirm** | Open the menu; save a value                                                                                          | —                                                     |
| **↵ (Return)**   | Back out / cancel; swap Area A ↔ B; DTMF entry (analogue) or dial-call (digital); deletes a character in text fields | —                                                     |
| `*`              | Cycle channel label (number / number+name / name)                                                                    | Lock / unlock keypad                                  |
| `#`              | `#` DTMF tone; toggle input method in text entry                                                                     | Cycle display modes: channel → frequency (VFO) → zone |
| `0`–`9`          | Type a digit                                                                                                         | Your assigned function (`02 Key Define`)              |
| Side keys 1 & 2  | Programmable                                                                                                         | Programmable (four slots in total)                    |

- LED: **red = transmit, green = receive**. The **▶** marks the main working band — the one the PTT keys.
- Lost? Press **↵** a few times — it backs you out of any menu, changing nothing.
- Suggested side-key layout: **Monitor (Ana)**, **H/L Power**, **Scanning**, **Talk Around**; leave the Remote Stun/Kill commands unassigned.

## Factory reset

`Basic Set → 32 Initialization` restores factory defaults. **Read the radio into CPS over USB-C and save the code plug first** — do not assume channels, contacts and zones survive. For one bad channel use `28 Delete CH` instead.

## Settings worth memorising

| Setting                               | Recommended                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Digital Set → 01 Personal ID`        | Your DMR ID from RadioID.net — set before any DMR transmit                                        |
| `Channel Set → 02 DMR Slot`           | Slot 1 / 2 — match the repeater's published slot                                                  |
| `Channel Set → 03 Color Code`         | 0–15 — match the repeater/hotspot; `1` is the de-facto amateur default                            |
| `Channel Set → 04 Contacts`           | The one talkgroup you transmit to                                                                 |
| `Channel Set → 05 RX Group`           | The list of talkgroups you hear (built in `Digital Set → 10 Group List Set`)                      |
| `Channel Set → 06 Encryption`         | **Off — always, on every amateur channel**                                                        |
| `Channel Set → 07 TX Politely`        | `CC match` for repeaters, `Carrier Match` for shared simplex; never `Impolite` on air             |
| `Channel Set → 08 TX Power`           | Low first; High only when the contact needs it                                                    |
| `Channel Set → 10 TOT`                | 60–120 s so a stuck PTT cannot hog a slot                                                         |
| `Channel Set → 12/13 Offset Dir/Freq` | The repeater's published shift (commonly 600 kHz on 2 m, 1.6 MHz on 70 cm — check your band plan) |
| `Basic Set → 10 Dual Standby`         | On to watch Areas A and B                                                                         |
| `Basic Set → 11 TX priority`          | `Busy` — a reply lands on the channel that just called                                            |
| `Basic Set → 20 Main PTT TX`          | `Main Area` — ↵ picks the transmit band                                                           |
| `Basic Set → 12 Freq Step`            | 12.5 kHz for amateur/DMR; 25 kHz for airband and legacy wide                                      |
| `Basic Set → 15 Scan Mode`            | `CO` (carrier) to follow whole conversations                                                      |
| `Basic Set → 27 Save CH`              | Store the current setup into channels 0001–1024                                                   |
| `Analog Set → 01 SQ level`            | Middle (~4–6), tuned by ear                                                                       |
| `Analog Set → 03 TX End Tone`         | Off — no roger beep on the amateur bands                                                          |

**A DMR channel = frequency + time slot + colour code + talkgroup.** All four must match the far end or you get total silence.

## Go-to numbers (from this guide's examples)

| What                                             | Value                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 2 m FM calling (Region 1 — check your band plan) | `145.500` MHz                                                                                         |
| Tone burst for older European repeaters          | `1750 Hz` (`Analog Set → 04 Single Tone`)                                                             |
| BrandMeister Parrot (echo test)                  | Private/group contact ID `9990`                                                                       |
| Worldwide talkgroup                              | TG `91`                                                                                               |
| UK-wide talkgroup                                | TG `235` (TGIF wants `4`-prefixed seven digits, e.g. `4000777` for TGIF 777)                          |
| DMR simplex convention                           | `433.450` MHz (Region 1), colour code `1`, slot `1`, TG `99`                                          |
| BrandMeister dynamic-talkgroup disconnect        | TG `4000`                                                                                             |
| Simplex hotspot                                  | TX = RX, colour code commonly `1`, slot `2`                                                           |
| All Call (built-in, use sparingly)               | ID `16777215`                                                                                         |
| NOAA weather (North America, receive only)       | `162.400`/`.425`/`.450`/`.475`/`.500`/`.525`/`.550`, plus `161.650`/`161.750`/`161.775`/`162.000` MHz |

## When things go wrong

Read the LCD first: `D-`/`A-` (mode), `T1`/`T2` (slot), `CXX` (colour code), `ENC` (encryption on — it must not be).

| Symptom                                      | First thing to check                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| DMR won't key the repeater                   | `Personal ID` is set, then colour code, slot, TX contact, then `TX Politely` holding you off           |
| DMR channel silent while others hear traffic | Colour code, then slot, then the talkgroup is in your RX Group list                                    |
| Parrot (`9990`) stays silent                 | Colour code first, then slot, then `Personal ID`                                                       |
| Analogue repeater won't open                 | CTCSS/DCS tone from the listing; then offset dir/size; older machines want the 1750 Hz burst           |
| Transmitting but nobody hears                | You are inside your transmit band; the ▶ marks the area you meant to key; battery not nearly flat      |
| One-way DMR contact / garble                 | `Channel Set → 06 Encryption` reads Off                                                                |
| CPS won't connect                            | A _data_ USB-C cable, then driver/COM port — and read from the radio before you ever write             |
| Scan skips a channel / never stops           | `Channel Set → 09 Scan Add` on each channel; `Scan Mode` = CO; squelch not too loose                   |
| Radio dead after a Stun/Kill                 | Only a pre-set Activate (wake) code can revive it over the air — otherwise it is a cable-reprogram job |
