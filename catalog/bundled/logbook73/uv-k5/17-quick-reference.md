# Quick reference card

_The whole guide on one page: the stock UV-K5's key combos, the menu items worth memorising, the go-to frequencies, and the first thing to check when it misbehaves. Print it, or stick it inside the battery cover._

## Essential key combos (stock firmware)

| Press                            | Does                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `F` + `1`                        | BAND — switch frequency band                                  |
| `F` + `2`                        | A/B — switch main channel between VFO A and B                 |
| `F` + `3`                        | VFO/MR — frequency mode ↔ memory (channel) mode               |
| `F` + `4`                        | Frequency meter — read a strong nearby signal (Fast Copy)     |
| `F` + `5`                        | Weather — NOAA weather-channel receive                        |
| `F` + `6`                        | Cycle transmit power High / Medium / Low                      |
| `F` + `7`                        | VOX on/off                                                    |
| `F` + `8`                        | Reverse — swap transmit and receive frequencies               |
| `F` + `9`                        | CALL — jump to the one-key call channel (`31 1-CALL`)         |
| `F` + `*`                        | SER — CTCSS/DCS tone search on the current signal (`M` saves) |
| `F` + `0`                        | Broadcast FM radio on/off                                     |
| Long-press `F`                   | Lock/unlock keypad (side keys still work)                     |
| Long-press `*`                   | Start a scan; `▲`/`▼` reverse direction, `EXIT` stops         |
| Long-press `M`                   | Jump to the last menu item you used                           |
| Long-press `EXIT`                | Return to the main screen from anywhere                       |
| Side Key 1                       | Short = Monitor (open squelch); long = 1750 Hz tone burst     |
| Side Key 2                       | Short = Flashlight; long = Emergency alarm                    |
| `PTT` + Side Key 2 (both radios) | AIR COPY — clone radio-to-radio on `410.0125` MHz             |

## Firmware flashing

| Action                           | How                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Enter bootloader (DP32G030 sets) | Radio off → hold `PTT` → power on → flashlight LED lights                          |
| Back up EEPROM first             | `k5prog -r` (DP32G030); UVTools2 / quansheng_toolkit (V3/K1)                       |
| Match firmware to MCU            | DP32G030 = UV-K5 / K5(8) / K6 / 5R+; PY32F071 = V3 / UV-K1 — never cross the split |

## Factory reset

Menu `55 RESET`: **`VFO`** resets settings but **keeps your channels**; **`ALL`** is a full factory wipe. Back up (AIR COPY or CHIRP) before `ALL`.

## Menu items worth memorising

| Menu                   | Setting                  | Recommended                                          |
| ---------------------- | ------------------------ | ---------------------------------------------------- |
| `01 SQL`               | Squelch `0`–`9`          | Start at `3`; usually `2`–`4`                        |
| `02 STEP`              | Frequency step           | `12.5K` for most amateur work                        |
| `03 TXP`               | TX power                 | `LOW` as default, `HIGH` only when needed            |
| `07 T_CTCS`            | Transmit CTCSS tone      | The repeater's listed tone; leave `05 R_CTCS` off    |
| `08 SFT-D`             | Repeater shift direction | `OFF` for simplex; `+`/`−` per repeater              |
| `09 OFFSET`            | Repeater offset          | Per band plan (e.g. `0.6000` on 2 m)                 |
| `10 W/N`               | Bandwidth                | `NARROW` for modern 12.5 kHz channels                |
| `12 BCL`               | Busy-channel lockout     | `ON` for shared channels                             |
| `14 MEM-CH`            | Save VFO to a channel    | Set everything in VFO mode first, then save          |
| `18 TDR`               | Dual watch               | Sets default TX line — check the arrow before keying |
| `21 TOT`               | TX time-out timer        | `2`–`3` minutes                                      |
| `23 SC-REV`            | Scan resume              | `CO` (carrier) for most scanning                     |
| `28 STE` / `29 RP-STE` | Tail-tone elimination    | Both `ON`                                            |
| `47 ROGER`             | Roger beep               | `OFF`                                                |
| `49 AM`                | AM receive               | `ON` for airband only (108–136 MHz)                  |

## Go-to frequencies

| Use                                 | Frequency                                   |
| ----------------------------------- | ------------------------------------------- |
| 2 m FM calling (simplex, no tone)   | `145.500` MHz                               |
| 70 cm FM calling (simplex, no tone) | `433.500` MHz                               |
| UK repeater shifts                  | `−0.6` MHz on 2 m; `+1.6` MHz on 70 cm      |
| Airband (AM, receive only)          | `108–136` MHz with menu `49 AM` on          |
| PMR446 ch 1–8 (receive only)        | `446.00625`–`446.09375` MHz, 12.5 kHz steps |
| NOAA weather (North America only)   | ~`162` MHz, via `F` + `5`                   |

## When things go wrong

| Symptom                           | First thing to check                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Won't transmit at all             | You're outside your market version's TX band — or `12 BCL` is refusing a busy channel |
| Repeater ignores you              | Wrong/missing tone in `07 T_CTCS`, or shift direction `08 SFT-D` backwards            |
| Receiver silent on a busy channel | Squelch too high (`01 SQL`) or a stray receive tone in `04`/`05`                      |
| Airband thin or garbled           | Menu `49 AM` is off                                                                   |
| Ghost stations near masts         | Front-end overload — raise squelch, use a smaller antenna                             |
| Scan skips a channel              | It isn't in the active scan list (`26`/`27`/`32`)                                     |
| CHIRP/flasher won't connect       | CH340 driver, cable fully seated, Chromium browser for web tools                      |
| Won't boot after a flash          | Re-enter bootloader (hold `PTT` + power on) and reflash an MCU-correct build          |
| Settings in a muddle              | Menu `55 RESET` → `VFO` — keeps your channels                                         |
