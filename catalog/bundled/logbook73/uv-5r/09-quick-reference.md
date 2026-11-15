# Quick reference card

_The whole guide on one page: the key combos, the menus worth memorising, the UK repeater numbers, and the first thing to check when it misbehaves. Print it and keep it with the radio._

## Key combos and shortcuts

| Action                              | Keys                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Menu rhythm                         | `MENU` → item number (or `▲`/`▼`) → `MENU` → `▲`/`▼` → `MENU` to save → `EXIT` |
| Escape from anywhere                | Press `EXIT` a couple of times — changes nothing                               |
| Monitor (force squelch open)        | Hold `MONI` (lower side key)                                                   |
| Flashlight                          | Short press `MONI`                                                             |
| FM broadcast radio on/off           | Short press `CALL` (upper side key)                                            |
| Alarm (transmits — treat with care) | Hold `CALL`; hold again to cancel                                              |
| VFO (frequency) ↔ memory (MR) mode  | `VFO/MR`                                                                       |
| Switch active line (A/B)            | `A/B` — the arrow marks the line PTT transmits on                              |
| VHF ↔ UHF (VFO mode)                | `BAND`                                                                         |
| Reverse (swap TX/RX)                | Short press `✳`; press again to cancel (clears the `R`)                        |
| Start a scan                        | Hold `✳`                                                                       |
| High/Low power (memory mode)        | Short press `#`                                                                |
| Keypad lock / unlock                | Hold `#` for about two seconds                                                 |
| 1750 Hz repeater toneburst          | Hold `PTT`, tap `BAND`                                                         |
| CTCSS tone scan                     | Open the `R-CTS` menu, press `*SCAN` while the signal is present               |

## Factory reset

Menu `40` (`RESET`): **VFO** resets operating settings only and keeps your memories; **ALL** wipes every setting **and every memory channel**, no undo. Reach for VFO first; use ALL only with a CHIRP backup to restore from.

## Menus worth memorising

Edit per-channel settings in **VFO mode**, then re-save — most are frozen in memory mode (only High/Low power can be nudged there).

| No. | Item     | Set to                                                     |
| --- | -------- | ---------------------------------------------------------- |
| 0   | `SQL`    | 3–5 — lowest number that reliably mutes the hiss           |
| 1   | `STEP`   | 12.5 kHz for the UK amateur bands                          |
| 2   | `TXP`    | LOW by default, HIGH by exception                          |
| 3   | `SAVE`   | 1:2 or 1:3; OFF when the first syllable matters            |
| 5   | `W/N`    | Match the channel — NARROW for modern UK 12.5 kHz channels |
| 7   | `TDR`    | ON to watch both lines; know `TX-AB` first                 |
| 9   | `TOT`    | 180 s — the stuck-mic safety net                           |
| 11  | `R-CTS`  | OFF for general listening (it mutes non-matching signals)  |
| 13  | `T-CTS`  | The repeater's published access tone                       |
| 23  | `BCL`    | ON for simplex, OFF on repeater memories                   |
| 25  | `SFT-D`  | OFF simplex; UK repeaters: `−` on 2 m, `+` on 70 cm        |
| 26  | `OFFSET` | UK: `00.600` on 2 m, `01.600` on 70 cm                     |
| 27  | `MEMCH`  | Store the finished VFO setup to a channel (000–127)        |
| 35  | `STE`    | ON — kills the simplex squelch tail                        |
| 39  | `ROGER`  | OFF — no roger beep on the amateur bands                   |

## Go-to frequencies (UK / Region 1)

| Use                         | Frequency               | Notes                                                |
| --------------------------- | ----------------------- | ---------------------------------------------------- |
| 2 m FM calling (S20)        | `145.500`               | Call, then move off to a working frequency           |
| 70 cm FM calling (SU20)     | `433.500`               | Simplex, no tone                                     |
| 2 m repeaters               | output                  | `SFT-D` `−`, `OFFSET` `00.600`, tone in `T-CTS`      |
| 70 cm repeaters             | output                  | `SFT-D` `+`, `OFFSET` `01.600`, tone in `T-CTS`      |
| Marine ch 16 (listen only)  | `156.800`               | Distress/calling — wide FM, 25 kHz step              |
| PMR446 ch 1–8 (listen only) | `446.00625`–`446.09375` | 12.5 kHz narrow FM; not legal to transmit on a UV-5R |

## When things go wrong

- **Totally silent, no hiss** → squelch too high: drop menu `0` to `3`; hold `MONI` to prove the receiver is alive.
- **Bars jump but no audio** → a receive tone is muting it: set menus `10` (`R-DCS`) and `11` (`R-CTS`) to `OFF`.
- **Won't transmit** → check in order: `BCL` on a busy channel, frequency outside 136–174 / 400–480 MHz, flat battery, keypad lock (hold `#`), time-out timer.
- **Hears the repeater but can't open it** → set `T-CTS` (menu `13`), check `SFT-D`/`OFFSET` (menus `25`/`26`), turn Reverse (`R`) off, or try the 1750 Hz burst.
- **Ghost signals near masts** → front-end overload, not a fault; the cures are physical (distance, smaller antenna, band-pass filter), never a menu.
- **Keys seem dead** → memory mode with nothing stored, wrong line active (`A/B`), or keypad locked.
- **CHIRP won't connect** → it's nearly always the cable/driver; pick the right port and model, and always download from the radio before you upload.
- **Everything tangled** → menu `40` `RESET` → VFO first; ALL only with a backup.
