# Quick reference card

_The whole guide on one page: the combos, settings, numbers and first-aid checks worth pinning next to the radio. Details and reasoning live in the linked chapters — this is the card you print._

## Knobs, buttons and combos

| Control             | Action                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Power button        | Press and hold to boot; hold again to shut down cleanly (give it a few seconds)                     |
| VOL/SQL/RFG knob    | Turn = adjust; **short-press cycles** volume → squelch → RF gain (watch the tag)                    |
| Main knob           | Tunes frequency; changes selected values in GEN grids                                               |
| MFK knob            | GEN selects; direct task menu adjusts the pressed soft-key item; DFL press toggles L/H edge         |
| Lock button         | Long-press ~2 s locks the main knob; short-press steps backlight (5 levels on battery, 10 external) |
| `[FST]`             | Cycles documented `10 / 100 / 1000 Hz` main-tuning steps                                            |
| `[A/B]` / `[V/M]`   | Short: swap VFO / VFO↔memory; long: `A=B` / selected memory `M→V`                                   |
| `[SSB]`             | Cycles `LSB → L-DIG → USB → U-DIG`; FT8 uses U-DIG/USB-DIG                                          |
| `[CW]` / `[AM\|FM]` | Press again to toggle CW↔CWR / AM↔FM                                                                |
| `[AGC]`             | Short cycles `AUTO → OFF → SLOW → FAST`; long toggles `SPL`                                         |
| `[PRE]`             | Short-press toggles PRE/bypass; long-press toggles ATT                                              |
| `[ATU]`             | **Short-press engages** (`ATU` icon); **long-press ~1 s runs a tune**                               |
| `[◄]` / `[►]`       | VFO: previous/next HAM or ALL band set; MEMO: previous/next stored channel                          |
| Hand mic            | `F-INP ENT` direct entry; `XFC` short A/B, long foreground→background; `TUNER` mirrors `[ATU]`      |

Six left-hand keys open six menus — **GEN** (settings, 5 tabs), **KEY** (CW keyer), **DFN** (NR/NB/notch), **DFL** (passband), **APP** (modem, SWR scan, voice call), **MSG** (text + voice messages). Press **KEY**, **DFN** or **MSG** again for page `<2>`; in GEN the MFK selects, the main knob changes.

## Settings worth memorising

| Setting                               | Value                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GEN → RADIO SETTING1 → TX POWER`     | Lowest that works; ~5 W battery, ~10 W external; XPA125B ≤2.5 W; GPA100/L4001 V1.6 path 2–5 W |
| `[AGC]`                               | APP V1.2.0: AGC-SLOW for AM/SSB voice, AGC-FAST for CW                                        |
| `AGC SLOW` / `AGC FAST`               | Millisecond time constants; record the installed values before changing                       |
| `[PRE]`                               | Preamp off below 14 MHz; V1.6 says ATT above about −50 dBm                                    |
| `MIC SEL` + `I-MIC`/`H-MIC GAIN`      | Match the mic in use; gain so ALC just moves on peaks                                         |
| `LINE IN LV` / `LINE OUT LV`          | Data-mode levels — ALC barely tickling on FT8                                                 |
| `KEY → QSK TIME` (page 2)             | **Must be on to transmit CW** — otherwise sidetone only                                       |
| `DFL` passband                        | SSB ~2.4–2.7 kHz; CW ~300–500 Hz; FT8 open to ~2.7–3.0 kHz                                    |
| `GEN → RADIO SETTING2 → RIT/XIT/SPLE` | Zero/off after use, or you call where you aren't listening                                    |
| `GEN → RADIO SETTING2 → HANDLE F1/F2` | Two hand-mic shortcuts — assign deliberately and test while receiving                         |
| `GEN → DISPLAY SETTING → BL LEVEL`    | Low — the screen is the biggest battery drain                                                 |
| `GEN → RADIO SETTING1 → CENTER MODE`  | ON = centred tuning; OFF = V1.2.0 movable spectrum cursor                                     |
| `GEN → RADIO SETTING1 → PTT MODE`     | `NORMAL` hold-to-talk; do not assume firmware-dependent `TOGGLE` works                        |
| `GEN → RADIO SETTING1 → BANDSTACK`    | `HAM BAND` arrow scope normally; `ALL BAND` adds receive coverage                             |
| `GEN → SYSTEM SETTING → TIME SETTING` | Set to UTC                                                                                    |
| `GEN → SYSTEM SETTING → SYSTEM INFO`  | Record both APP and BASE before an update or support request                                  |
| `GEN → RADIO SETTING1 → CHARGER`      | On to charge; off for long stints on external power                                           |
| `S/P` jack                            | **Stereo TRS only** — mono TS shorts output and can damage the device                         |
| Mode                                  | LSB/USB for voice by band; `USB-DIG` / `U-DIG` for sound-card data                            |
| PC input / recording                  | `Microphone (USB Audio)` — radio RX into the decoder                                          |
| PC output / playback                  | `Loudspeaker (USB Audio)` — generated tones into the radio                                    |

## Power and battery

- External supply: 13.8 V, ≥3.5 A, correct polarity — **never over 15 V DC**.
- Battery: current V1.6 `7.4 V`, `3500 mAh`; current gauge firmware shuts down below 10% displayed capacity; store at 40–50%.
- Charge light: EU v1.1.7 blinking green/steady complete; V1.6 powered-off charge green lit, red lit abnormal, off disabled.
- Never transmit without an antenna or dummy load; ATU matches up to about 4.5:1.

## Frequencies

- FT8 dial: `14.074` (20 m), `7.074 MHz` (40 m) — and band equivalents; radio in `USB-DIG` (`U-DIG` on some displays), not ordinary USB voice.
- Region 1 phone (roughly, check your plan): 40 m `7.06–7.20 MHz`; 20 m from about `14.10 MHz` up.
- 40 m for evenings/regional, 20 m for daytime DX; verify transmit edges against your own unit and band plan.

## Factory reset

`GEN → SYSTEM SETTING → FACTORY RESET` — confirm, the radio resets and shuts down; power it on again to finish. It wipes your settings and the 200 memory channels, so note them first, then re-set the clock and gains. **Mandatory after some firmware updates** (the V1.2.0 line) — skipping it can corrupt band data.

Stock firmware is two-stage and uses stable external `13.8 V` power: write `x6100udimg.img` to a bootable microSD card and boot it for the automatic APP/system stage; remove the card after shutdown; boot normally; apply the matching BASE image through `SYSTEM SETTING → FIRMWARE/FW UPGRADE`; reboot, verify both versions, then perform any required reset. Use the [official tutorial](https://xiegu.eu/sdm_downloads/xiegu-x6100-firmware-update-tutorial/) and release notes, not this summary alone.

Community firmware (OpenX6100, OpenX6X00) boots from its own microSD card and leaves the stock firmware in place: **switch off and remove the card to go back to stock**, and update Xiegu's firmware with the community card out. Details in [Custom Firmware](outpost:entry/logbook73.guide.x6100/custom-firmware).

## When things go wrong

| Symptom                          | First check                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| No transmit at all               | Outside an amateur transmit segment? For CW: QSK off (`KEY` page 2)?                                 |
| Only ~5 W out                    | You are on the internal battery — external 13.8 V gives ~10 W                                        |
| Stuck in transmit                | Miswired key plug — use a stereo TRS plug; power off before plugging a key                           |
| `SWR` icon keeps flashing        | Long-press `[ATU]` to actually tune; beyond ~4.5:1 the fix is the antenna                            |
| Radio "deaf"                     | Mono plug in `S/P`; knob left in SQL/RFG; squelch high; `DFL` over-narrowed (`DEFAULT`); ATT left in |
| Harsh, phantom signals           | Front-end overload — ATT in, RF gain down, broadcast-reject filter                                   |
| CAT won't connect                | `DEV`, CH342 driver, native X6100 profile or OmniRig `IC-7000`/`19200`, then try the other COM port  |
| FT8 decodes nothing              | PC clock (NTP sync); PC input = `Microphone (USB Audio)`                                             |
| FT8 won't key up                 | Set the software's PTT method to CAT                                                                 |
| Won't charge                     | `CHARGER` switched off in RADIO SETTING1                                                             |
| TX cuts out late in a session    | Check displayed battery capacity; current firmware shuts down below 10% — charge or go external      |
| Frozen screen                    | Hold power >12 s to force shutdown; wait 30 s before switching on                                    |
| Bands won't switch / frequency 0 | Do the post-update factory reset                                                                     |
