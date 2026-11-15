# Quick reference card

The whole guide compressed to one printable page — for the go-bag, next to the settings card.

## The box

| Socket            | Carries                                      |
| ----------------- | -------------------------------------------- |
| **USB** (Type-C)  | Power + data — lead **must** be a data cable |
| **AUDIO** (TRRS)  | TX audio · RX audio · **PTT**                |
| **SERIAL** (TRRS) | CAT (optional)                               |

Inside: CM108 sound card + CP2102 serial (one USB hub) · PTT = open-collector switch on **RTS** · hardware rev `1.11`, connector-compatible back to `1.6`.

## Serial configurations (hardware, solder-set)

| Config                     | For                                         |
| -------------------------- | ------------------------------------------- |
| **Logic levels** (default) | HTs, mobiles (programming-grade serial)     |
| **RS-232**                 | DB9-era rigs · Elecraft KX2/KX3 · Yaesu FTM |
| **CI-V**                   | Icom "remote" jack                          |
| **TX-500**                 | Lab599 TX-500                               |

Any config does **audio + PTT with any radio** — config only matters for CAT. Mobile vs **Lite**: Lite = same codec, **no serial port**, PTT by codec GPIO3; anything needing CAT (and the DigiPi) wants the **Mobile**.

## Computer setup (once)

1. Two devices appear: **USB PnP audio** + **CP210x COMx** (exclamation mark → Silicon Labs driver).
2. Rename both audio devices **"Digirig"** · **never system default**.
3. Levels **20–50%** start · AGC/enhancements **off** · Windows mic **privacy allowed**.
4. Loopback test the audio · _Test PTT_ dry.

## Universal app settings

| Setting                  | Value                                      |
| ------------------------ | ------------------------------------------ |
| Audio in/out             | Digirig / Digirig                          |
| PTT                      | **RTS** on Digirig COM (or CAT — pick one) |
| Handshake / flow control | **None**                                   |
| CAT                      | Radio model · Digirig COM · radio's baud   |
| Port sharing             | One owner — else flrig / rigctld           |

## Levels in one line

App slider ¾ → raise OS playback until power stops rising → back off until **ALC asleep** → write the numbers down. RX: app meter in its target zone; HTs = volume at the marked spot, squelch open, VOX off.

## First-aid table

| Symptom                   | First check                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| Nothing detected          | **Charge-only USB lead** · other port · other computer                           |
| COM has ⚠                 | CP210x driver                                                                    |
| No RX audio               | Audio socket not serial · privacy permission · squelch · _Listen to this device_ |
| No TX audio               | **Headphone test** in audio socket · data-input vs mic on radio                  |
| PTT dead                  | Radio LED sync check · RTS+port · short PTT pin to ground                        |
| Keys at random / stuck    | Flow control **off** · CAT off if no CAT radio · Linux: `gpsd` `USBAUTO="false"` |
| CAT dead                  | Port/baud/model · **loopback echo test** · config matches dialect                |
| Fails only on TX at power | RF: dummy-load confirm · feed-point choke · **ferrites**                         |
| Ugly/wide signal          | ALC awake — levels chapter                                                       |

Method: **simplify and isolate · one change at a time · rollback to what works.**

## Cable rules

Data/ACC socket beats mic jack · lookalike cables have different pinouts — **label everything** · "radio's TX = interface's RX" · acceptance-test every new cable on a dummy load.

## The card (copy per station)

Radio+socket ____ · Config: Logic/RS-232/CI-V/TX-500 · Baud ____ · OS playback ____ % · OS recording ____ % · App level ____ · HT volume mark ____ · PTT: RTS COM ____ / CAT

Full detail lives in the [complete guide](outpost:entry/logbook73.guide.digirig/overview); the DigiPi pairing lives in [its own](outpost:entry/logbook73.guide.digipi/overview).
