# Quick reference card

_The whole guide on one page: the keys, combos, menu items, frequencies and fixes worth memorising — print it and keep it with the radio._

## Golden rules

- **WIRES-X runs only on the A-band; APRS runs only on the B-band.**
- **RX DG-ID `00` hears every C4FM station** — non-zero is the classic "gone deaf" trap.
- **DN** for repeaters, WIRES-X and GM; **VW** is hi-fi simplex only (off by default).
- The **white** frequency is the operating band — PTT, DIAL and menus act there.
- Run the **lowest power that works**, and back up to microSD before any reset or firmware update.

## Essential keys and combos

| Action                                 | Does                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| `[F MENU]` short press                 | Function menu (two pages of soft keys — _actions_)               |
| `[F MENU]` press and hold              | Setup Menu (twelve category tiles — _settings_)                  |
| `[A/B]` press / hold                   | Swap operating band / toggle dual- ↔ mono-band                   |
| `[V/M]` press / hold                   | VFO ↔ memory / write current setup to a memory                   |
| `[GM/X]` press / hold (> 1 s)          | GM on–off / start WIRES-X (hold again to leave)                  |
| `[PMG]` press / hold                   | Open PMG activity monitor / register current channel             |
| Power (Lock) switch hold / press       | Power on–off / lock–unlock (MONI, SQL and VOL never lock)        |
| `[SQL]` + rotate VOL                   | Set squelch (per band; default level 1)                          |
| Touch and **hold** the white frequency | Numeric keypad for direct entry (a tap does something different) |
| DIAL with the function menu open       | Fast tuning in 1 MHz jumps                                       |
| Hold `[GM/X]` on the DG-ID screen      | Snap TX and RX DG-ID both back to `00`                           |
| Hold `[BAND]` in WIRES-X               | Disconnect from the room/node                                    |

Power via `[F MENU]` → `[TXPWR]`: **HIGH 5 W · LOW3 2.5 W · LOW2 1 W · LOW1 0.1 W** (stored per band).

## Power-on combos and resets

| Hold while switching on                | Result                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `[F MENU]` + `[A/B]`                   | **Setup Menu Reset** — settings to default, memories kept                                                          |
| `[F MENU]` + `[A/B]` + `[BAND]`        | **All Reset** — wipes everything incl. all 900 memories; callsign re-demanded. Back up first: `SD CARD → 1 BACKUP` |
| `[V/M]`                                | Memory-only mode (repeat the combo to leave)                                                                       |
| `[GM/X]` + `[BAND]`                    | WIRES-X Portable Digital Node mode                                                                                 |
| `[GM/X]` + `[F MENU]`                  | WIRES-X Portable HRI mode                                                                                          |
| `[F MENU]` (both radios, CT-168 cable) | Clone mode                                                                                                         |

## Settings worth memorising

| Menu item                        | Set to                                                           |
| -------------------------------- | ---------------------------------------------------------------- |
| `TX/RX → DIGITAL → 4 DIGITAL VW` | OFF — enable only for hi-fi simplex                              |
| `CONFIG → 9 LOCK`                | KEY&DIAL (PTT stays live)                                        |
| `CONFIG → 10 MONI/T-CALL`        | MONI if your repeaters use CTCSS; T-CALL for 1750 Hz burst       |
| `CONFIG → 14 RPT ARS`            | ON — auto repeater shift                                         |
| `CONFIG → 16 RPT SHIFT FREQ`     | 0.600 MHz (2 m) · 1.600 MHz (70 cm, UK) — check your band plan   |
| `CONFIG → 18 STEP`               | AUTO                                                             |
| `CONFIG → 20 TOT`                | 3 min                                                            |
| `CONFIG → 22 BAND SELECT`        | Hide bands you never use                                         |
| `SIGNALING → 11 SQL TYPE`        | TONE for repeater access (TONE SQL also mutes receive)           |
| `SIGNALING → 12 TONE SQL FREQ`   | The repeater's listed CTCSS tone                                 |
| `SCAN → 4 SCAN RESUME`           | BUSY; its separate DW line defaults HOLD — the "D.RCV died" trap |
| `APRS → 4 APRS MODEM`            | 1200 bps — this _is_ the APRS on-switch (`A12` appears)          |
| `APRS → 18 DIGI PATH`            | `WIDE1-1,WIDE2-1` (P3)                                           |
| `OPTION → 4 Bluetooth AUDIO`     | AUTO = headset **only** (speaker silent); FIX = both             |
| `SD CARD → 1 BACKUP`             | Write to SD before every reset or firmware update                |

## Go-to frequencies and tones

| What                  | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| 2 m FM calling        | 145.500 MHz (Region 1) · 146.520 MHz (Americas)         |
| APRS channel (B-band) | 144.800 MHz (UK/Region 1) · 144.390 MHz (North America) |
| CTCSS tones           | 50 tones, 67.0–254.1 Hz (default 100.0 Hz)              |
| DCS codes             | 104 codes, 023–754 (default 023)                        |
| Tone burst (T-CALL)   | 1750 Hz                                                 |
| APRS SSID / TX delay  | `-7` handheld (`-9` mobile) · 300 ms                    |

## When things go wrong

| Symptom                            | First check                                                               |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Silent on a live channel           | Right band white? Volume/squelch are **per band**; tone or DG-ID filter?  |
| Digital sounds like buzzing        | AMS off — touch `[MODE]` until the bar shows above the icon               |
| Silence but the LED blinks         | RX DG-ID mismatch — set `00` (hold `[GM/X]` on the DG-ID screen)          |
| Controls frozen                    | Lock is on — short-press the Power/Lock switch                            |
| "TX INHIBIT"                       | Tuned outside the amateur bands — a feature, not a fault                  |
| APRS never on the map              | Modem OFF (no `A12`), wrong band (needs B), no GPS fix, no APRS callsign  |
| WIRES-X won't connect              | Not in DN, not on A-band, no node in RF range, or WIRES-X DG-ID not AUTO  |
| Radio silent after pairing headset | `OPTION → 4 Bluetooth AUDIO` on AUTO — set FIX or wear the headset        |
| microSD not recognised             | Format **in the radio** (`SD CARD → 4 FORMAT`), 2–32 GB, insert power off |
| GPS won't fix                      | Open sky and patience — a cold start takes several minutes                |
