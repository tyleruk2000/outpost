# Quick reference card

The whole guide, compressed to one printable page. Gestures, menu numbers, the rituals, and the first-aid list — for the pouch, next to the calibration card.

## Controls

| Gesture              | Does                           |
| -------------------- | ------------------------------ |
| Left button          | Menu / power on                |
| Right button         | Mode / exit                    |
| Double right         | Filter bandwidth               |
| Slow double right    | VFO A → B → Split              |
| Hold right           | RIT on/off                     |
| Turn encoder         | Tune / adjust                  |
| Press encoder        | Tuning rate (digit)            |
| Double-press encoder | Band                           |
| Hold left + turn     | Quick menu · spectrum (2.00t+) |
| Volume to `0`        | Power off                      |
| **Hold encoder**     | ⚠️ **Factory reset — avoid**   |

## Menu map

| Group                | Items                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 Receiver**       | `1.1` Volume · `1.2` Mode · `1.3` Filter BW · `1.4` Band · `1.5` Tune Rate · `1.6` VFO Mode · `1.7` RIT · `1.8` AGC · `1.9` NR · `1.10` ATT · `1.11` ATT2 · `1.12` S-meter · `1.13` SWR meter |
| **2 CW**             | `2.1` Decoder · `2.2` CW Tone · `2.4` Semi QSK · `2.5` Keyer Speed · `2.6` Keyer Mode · `2.7` Keyer Swap · `2.8` Practice                                                                     |
| **3 Transmit**       | `3.1` VOX · `3.2` Noise Gate · `3.3` TX Drive · `3.4` TX Delay · `3.5` MOX                                                                                                                    |
| **4 Messages**       | `4.1` CQ Interval · `4.2` CQ Message · `4.3`–`4.7` Messages 2–6                                                                                                                               |
| **8 Calibration** ⚠️ | `8.1` PA Bias min · `8.2` PA Bias max · `8.3` Ref freq · `8.4` IQ Phase · `8.7` LPF config                                                                                                    |
| **10 Display**       | `10.1` Backlight                                                                                                                                                                              |

_(Exact items vary by firmware version — the screen wins.)_

## Sane defaults

| Setting               | Value                                            |
| --------------------- | ------------------------------------------------ |
| AGC / NR / ATT / ATT2 | ON / `0` / `0` / `0`                             |
| Filter                | `2400` SSB · `500` CW                            |
| TX Drive              | `4–6` SSB · `8` CW/FM                            |
| VOX / MOX / TX Delay  | OFF / `0` / `0`                                  |
| S-meter · SWR meter   | `S-bar` · `FWD-SWR`                              |
| Sideband              | LSB below `10 MHz` · USB above · USB for digital |

## Bands by filter board

| Build             | Bands                    | `8.7`   |
| ----------------- | ------------------------ | ------- |
| **Lo** (standard) | 80 · 60 · 40 · 30 · 20 m | Lo      |
| **Hi**            | 20 · 17 · 15 · 12 · 10 m | Hi      |
| **Classic**       | 80 · 40 · 20 · 15 · 10 m | Classic |

Licence beats filter board: transmit only where _you_ are permitted (60 m is nationally specific).

## Pre-transmit ritual

1. Antenna connected — look at it.
2. Band legal, filter board serves it.
3. Brief key-down: power sensible, **SWR < `1.5:1`**.
4. RIT off? Split intended? Practice off?

## Power facts

| Supply           | Output     |
| ---------------- | ---------- |
| `13.8 V` DC      | ≈ `5 W`    |
| USB `5 V`        | ≈ `0.5 W`  |
| RX draw          | ≈ `80 mA`  |
| TX draw @ 13.8 V | ≈ `500 mA` |

Never above the mid-teens of volts · never AC · never reversed · never keyed without a load.

## CAT / digital

| Thing          | Value                                              |
| -------------- | -------------------------------------------------- |
| Rig type       | Kenwood **TS-480**                                 |
| Baud           | `115200` (2.00t+) · `38400` (older)                |
| Audio over USB | firmware **2.00u+**, driver/bridge app on computer |
| Fallback       | audio cables + `3.1` VOX ON, gate just above hiss  |
| TX drops USB?  | ferrites on USB + coax; antenna further away       |

## First-aid (symptom → first check)

| Symptom                 | Check first                                              |
| ----------------------- | -------------------------------------------------------- |
| No transmit at all      | `2.8` Practice ON · TX Drive `0` · key in wrong jack     |
| Low power / high SWR    | Antenna & links · `8.7` matches board · supply voltage   |
| Deaf receive            | BNC · ATT/ATT2 not `0` · plug in phones jack             |
| Loud night-time mush    | Overload — step in `1.10` ATT                            |
| Backwards twin signals  | Recalibrate `8.4` IQ Phase                               |
| Dial reads slightly off | Recalibrate `8.3` Ref freq                               |
| Harsh SSB reports       | `3.3` TX Drive down a step                               |
| CAT dead after update   | Baud `115200` vs `38400`                                 |
| Settings all default    | Factory reset or update — card back in                   |
| No serial at power-up   | Bootloader/fuse issue — [ch. 9](outpost:entry/logbook73.guide.trusdx/firmware) |

## The card that lives with the radio

`8.3` Ref freq ______ · `8.2` PA Bias max ______ · `8.4` IQ Phase ______ · `8.7` ______ · Serial ______ · Firmware ______

Fill it in once ([chapter 6](outpost:entry/logbook73.guide.trusdx/calibration)), update it after every change, and no reset or update can cost you more than ten minutes. Everything else is in the [full guide](outpost:entry/logbook73.guide.trusdx/overview).
