# Quick reference card

_The whole guide on one page: the key combos, the settings worth memorising, the frequencies, and the first thing to check when something misbehaves. Print it, fold it, keep it with the radio._

## Keys and combos

| Key       | Short press            | Long press                                                                         |
| --------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `MENU/OK` | Enter menu / confirm   | Spectrum display                                                                   |
| `A/B/C`   | Switch active VFO      | Remote sub-tone (CTCSS/DCS) scan                                                   |
| `Exit`    | Back out / clear       | Frequency sweep mode (reads a signal's frequency **and** tone; `MENU/OK` saves it) |
| `V/M`     | Swap VFO / memory mode | Jump to the APRS screen                                                            |

- The three side PTTs **A/B/C each transmit on their own VFO**, regardless of which row is highlighted; the main PTT sends on the highlighted one.
- Menu drill: **MENU/OK → move → MENU/OK → save → Exit**. Lost? Press `Exit` a few times — it always walks you home.
- `PF2` short/long press and long-press `0`–`9` are assignable in _Menu → User Key_ — set `PF2` to **MONI** (monitor).

## Startup modes

| Mode                            | How to enter                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Normal (Work) Mode              | Power on holding nothing — where you should live                             |
| All Band Test Mode              | Hold the **down direction key** while switching on (same combo toggles back) |
| Super Mode                      | Hold **`8`** + **`PTT-C`** while switching on, until `Supermode` appears     |
| Radio Mode (broadcast receiver) | **Long-press `0`** (assign `RADIO` in _User Key_ first)                      |

Test and Super mode drop the transmit guard-rails — your licence, not the radio, keeps you legal.

## Reset

Back up first with the vendor software or phone app — the radio is not CHIRP-compatible, and there is no undo.

- **VFO Reset** — VFO settings back to defaults; memory channels and zones survive.
- **Reset All** — wipes everything back to factory.
- _APRS → Factory Setting_ — resets only the APRS block (re-enter your callsign after).

## Settings worth memorising

| Setting                                       | Set to                                                |
| --------------------------------------------- | ----------------------------------------------------- |
| _Radio → SQL_                                 | 3–5                                                   |
| _Radio → Trans Power_                         | Lowest that does the job                              |
| _Radio → Bandwidth_                           | Match the channel (PMR446 is narrow)                  |
| _Radio → Busy Lockout_                        | ON                                                    |
| _Radio → TOT_ / _TALL_                        | 180 s / ON                                            |
| _Radio → Standby Set_                         | ON — it is the **tri-watch** switch, not a power save |
| _Radio → Battery Save_                        | Normal (OFF for APRS, scanning, cross-band)           |
| _Radio → Scan Mode_                           | Carrier                                               |
| _Radio → R-TONE_                              | 1750 Hz (UK/European burst)                           |
| _Radio → ROGRE_ / _VOX Switch_                | OFF / OFF                                             |
| _VFO/CH → Step_                               | 12.5 kHz ham · 8.33 kHz Euro airband · 25 kHz marine  |
| _Setting → Keypad Lock_ / _Back Light_        | 5–10 s / 30–60 s                                      |
| _APRS → Path Choose_                          | `WIDE1-1,WIDE2-1`                                     |
| _APRS → Digi Setup → Routing_                 | OFF                                                   |
| _CTCSS DCS → Encryption_ / _Radio → Scramble_ | OFF — not permitted on amateur bands                  |

## Frequencies and offsets

| Use                              | Value                                                |
| -------------------------------- | ---------------------------------------------------- |
| 2 m FM calling (Region 1)        | `145.500 MHz`                                        |
| 70 cm FM calling                 | `433.500 MHz`                                        |
| 6 m FM calling                   | `51.510 MHz` UK/R1 · `52.525 MHz` US                 |
| APRS                             | `144.800 MHz` Region 1 · `144.390 MHz` North America |
| Marine Channel 16 (receive only) | `156.800 MHz`                                        |
| Airband (receive only, AM)       | `118–137 MHz`                                        |
| UK repeater shift, 2 m           | Direction `−`, Offset `0.600 MHz`                    |
| UK repeater shift, 70 cm         | Direction `+`, Offset `1.600 MHz`                    |

Repeater ritual, in VFO mode: tune the output → Direction → Offset → _TX CTCSS_ from the listing → Bandwidth → _CH-Memory_.

## When things go wrong

| Symptom                                    | First thing to check                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Won't transmit                             | VFO on a TX-permitted band? Then Busy Lockout, tripped TOT, low battery, wrong PTT for the row |
| Repeater won't open                        | TX CTCSS exact? Then offset direction/size; a set RX tone can mute the reply                   |
| APRS beacon invisible                      | Callsign set, APRS ON, TNC Type OFF (not KISS), GPS fix, right frequency, sane path            |
| KISS "broke" APRS                          | By design — set _TNC Type → OFF_ for standalone beaconing                                      |
| GPS slow to fix                            | Cold start is physics — open sky, stand still, wait minutes                                    |
| `V/M` does nothing                         | Store at least one channel first                                                               |
| Airband silent                             | _RX Modulation_ → AM                                                                           |
| Menu items greyed out                      | You're in memory mode — edit in VFO mode, re-save                                              |
| Speaker dead, signal bar alive             | Clear _RX CTCSS_ / _RX DCS_                                                                    |
| Keys up on its own                         | Turn _VOX Switch_ off                                                                          |
| "Repeater" on an odd frequency near a mast | Intermod/overload, not a real signal                                                           |
| Receiver deaf 20–60 s                      | Known firmware behaviour on some builds — note your version in _About Machine_                 |
