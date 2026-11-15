# Every top-level menu item and control at a glance

This is the X6200's menu map: every documented physical control and top-level menu item in the expanded stock-firmware manual, with important subcontrols plus the additions and moves published for firmware `1.0.6` and `1.0.7`. Keep it open beside the radio when a label is familiar but its effect is not. The deeper chapters explain why and how to set each value.

The wording follows the radio where possible. Some English builds shorten `RADIO SETTING 1` to `SETTING 1`, use `WIFI` where the menu index says `WLAN`, or correct a translated label. Treat those as spelling differences. A completely absent page-3 display option usually means older firmware.

## Verdict key

| Symbol | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| ✅     | safe, everyday setup item                                           |
| ⭐     | useful when the operating situation calls for it                    |
| ⚠️     | changes transmit, storage, networking or recovery; understand first |
| ❌     | normally leave off unless solving a specific problem                |

## How menu navigation works

Press `GEN`, `APP`, `KEY`, `MSG`, `DFN` or `DFL`. Labels appear above the five physical soft-keys. In a GEN list, rotate the MFK **outer ring** to select an item and **inner ring** to change it; press MFK where confirmation or a subpage is required. Use NEXT/PREV to move between long pages. The usual list actions are **restore default**, decrease, increase, **set as shortcut tag**, and exit.

Press KEY, MSG or DFN again for page 2. In MODEM, operate its page selector to reach AFC/SQL/CLEAR/EXIT. DFL opens a filter bank editor rather than a simple value row.

## Direct controls

| Control       | Short press / rotate                     | Long press / second action                          |
| ------------- | ---------------------------------------- | --------------------------------------------------- |
| Power         | start                                    | orderly shutdown; more than 12 s is forced shutdown |
| Main knob     | tune frequency                           | context-sensitive numeric change                    |
| MFK inner     | tune on main screen; change menu value   | press to select/confirm/change focus                |
| MFK outer     | TX power on main screen; select menu row | —                                                   |
| VOL/SQL/RFG   | adjust selected function                 | press cycles VOL → SQL → RFG                        |
| Top `← / →`   | previous/next band or channel            | depends on HAM/ALL BAND setting                     |
| `AM / FM`     | AM/NFM mode family                       | WFM is receive-only context                         |
| `CW`          | CW mode family                           | select CW/CW-R as available                         |
| `SSB`         | SSB mode family                          | select LSB/USB as available                         |
| `A/B`         | swap active VFO                          | copy/equalise VFO A and B                           |
| `ATU`         | insert/bypass tuner                      | start tune, about 1 s                               |
| `FST`         | change fast step                         | lock/unlock controls                                |
| Body/H-22 PTT | transmit in NORMAL                       | in TOGGLE, press again to return to RX              |

## GEN: SETTING 1, page 1 — signal path and steps

| Item                  | What it controls                         | Sensible use                                                                                                |
| --------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **PRE**               | receiver preamplifier                    | ⭐ OFF initially; ON only for weak signals on a quiet band                                                  |
| **ATT**               | input attenuator                         | ⭐ OFF initially; ON for overload/very strong signals (manual suggests considering it above about S9+10 dB) |
| **AGC**               | `OFF / SLOW / FAST / AUTO` gain recovery | ✅ AUTO for general use; SLOW voice/AM, FAST CW/data-like rapid signals                                     |
| **TX POWER**          | RF output, `0.5 W` steps                 | ⚠️ lowest useful level; maximum about 8 W external, 5 W battery                                             |
| **MIC SEL**           | `AUTO / BUILT-IN / HANDLE`               | ✅ AUTO unless tracing a microphone fault                                                                   |
| **BUILT-IN MIC GAIN** | gain for body microphone                 | ⭐ set with an off-air monitor/report; excessive gain distorts                                              |
| **HANDLE MIC GAIN**   | gain for H-22 microphone                 | ⭐ separate calibration from built-in mic                                                                   |
| **LINE IN GAIN**      | computer/USB data audio into transmitter | ⚠️ adjust for clean ALC/power, never for “maximum meter”                                                    |
| **LINE OUT GAIN**     | receive audio sent to computer           | ⭐ set decoder input without clipping                                                                       |
| **MONITOR LEVEL**     | local monitor during recorded voice call | ⭐ low or off while recording to prevent echo                                                               |
| **COMP**              | speech compressor on/off                 | ⭐ useful for voice intelligibility; avoid overdriving                                                      |
| **SSB STEP**          | tuning increment in SSB                  | ✅ choose fine for normal tuning; `2.5/5 kHz` options added in 1.0.7                                        |
| **CW STEP**           | tuning increment in CW                   | ✅ use fine step to centre a tone                                                                           |
| **AM STEP**           | tuning increment in AM                   | ✅ match channel spacing in the service being received                                                      |
| **WFM STEP**          | tuning increment in WFM                  | ✅ match local broadcast channel spacing                                                                    |

Do not copy gain numbers from another operator. Microphone distance, voice, computer level and firmware differ. Record the original value and change one control at a time.

## GEN: SETTING 1, page 2 — three equalizers

Three banks each have five bands and a separate enable switch:

| Bank       | Documented centres                  | Applies to                  |
| ---------- | ----------------------------------- | --------------------------- |
| **EQ RX**  | `300 / 700 / 1200 / 1800 / 2300 Hz` | shortwave/HF receive audio  |
| **EQ WFM** | `50 / 300 / 1500 / 5000 / 12000 Hz` | WFM broadcast receive audio |
| **EQ MIC** | `300 / 700 / 1200 / 1800 / 2300 Hz` | transmit microphone audio   |

| Switch          | Meaning                    | Start point                             |
| --------------- | -------------------------- | --------------------------------------- |
| **EQ-RX**       | enables HF receive EQ      | ✅ OFF until a deliberate curve is made |
| **EQ-RX (WFM)** | enables WFM EQ             | ✅ OFF/flat initially                   |
| **EQ-MIC**      | enables transmitted mic EQ | ⚠️ OFF until checked off-air            |

The Rev 05 English table accidentally repeats `300 Hz` across the MIC row. Current manufacturer V06 resolves the centres as `300 / 700 / 1200 / 1800 / 2300 Hz`, matching the five-band RX pattern. The installed screen remains authoritative if a different release channel changes them.

## GEN: SETTING 2 — offsets, H-22 and hardware behaviour

| Item          | What it controls                       | Documented behaviour / safe start                                           |
| ------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| **RIT**       | receive-only frequency offset          | ⭐ zero when unused; adjust a caller without moving TX                      |
| **XIT**       | transmit-only frequency offset         | ⚠️ zero when unused; verify before PTT                                      |
| **HANDLE F1** | H-22 F1 assignment                     | ✅ default PRE                                                              |
| **HANDLE F2** | H-22 F2 assignment                     | ✅ default NR                                                               |
| **HANDLE F3** | H-22 F3 assignment                     | ✅ default filter selection                                                 |
| **SPLE**      | split operation                        | ⚠️ OFF normally; ON uses VFO A for RX and VFO B for TX                      |
| **PTT MODE**  | `NORMAL / TOGGLE`                      | ✅ NORMAL; TOGGLE latches TX until another press                            |
| **BANDSTACK** | `HAM BAND / ALL BAND` arrow cycle      | ✅ HAM BAND for transmitting operators; ALL BAND for broad listening        |
| **S/P MODE**  | `EAR PHONE / SPEAKER` output level     | ⚠️ match the connected device before listening                              |
| **CHARGER**   | internal charging enable               | ⚠️ ON only when intentionally charging a fitted battery                     |
| **BUILT-IN**  | selects internal wireless adapter path | ✅ ON for internal Wi-Fi/BT; OFF only when using supported external adapter |

The supplied charging adapter is **charge-only**: power the radio off to use it, and never transmit from it. For external operation, use a separate regulated `12–15 V DC`, centre-positive communications supply rated for at least `3.5 A`. Current manufacturer V06 also documents a `9–15 V` input range and battery takeover below `11 V`; the European English material uses `12–15 V`, so `13.8 V` remains the uncomplicated station baseline.

The manual notes that internal and external wireless adapters must not be active together.

## GEN: DISPLAY page 1 — spectrum, waterfall and screen

| Item                      | Function                                                     | Guidance                                                    |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| **RF FFT AVERAGE**        | smooths spectrum peak movement                               | ⭐ enough to calm flicker without hiding brief CW           |
| **RF FFT REF LEVEL**      | moves spectrum reference/noise position                      | ⭐ set the noise floor visibly above the bottom             |
| **RF FFT SPAN**           | `384 / 192 / 96 / 48 kHz` visible width                      | ✅ 96/192 general; 48 detailed; 384 survey                  |
| **RF FFT PEAK HOLD**      | leaves temporary signal-peak trace                           | ⭐ ON to spot intermittent signals, OFF for clean live view |
| **CW ZOOM**               | `OFF / 2× / 4× / 8×` CW-centred zoom                         | ⭐ useful for crowded CW                                    |
| **AUDIO FFT AVERAGE**     | smooths audio-spectrum display                               | ⭐ cosmetic/diagnostic                                      |
| **AUDIO FFT REF LEVEL**   | sets audio-spectrum reference                                | ⭐ adjust only if AUDIO SCOPE is used                       |
| **WF MOVE**               | waterfall moves as VFO moves                                 | ⭐ choose the visual behaviour that makes tuning intuitive  |
| **WATERFALL REF LEVEL**   | waterfall brightness/contrast, documented ±20 dBm adjustment | ✅ expose weak traces without saturating noise              |
| **WATERFALL COLOR MAP**   | selects colour palette                                       | ✅ preference; choose readable outdoor colours              |
| **AUDIO SCOPE**           | shows audio spectrum/waveform at right                       | ⭐ OFF for a larger RF display; ON for analysis             |
| **SCOPE Y GRID STYLE**    | grid on spectrum only or spectrum+waterfall                  | ⭐ preference                                               |
| **SCOPE/WF HEIGHT RATIO** | vertical split between spectrum and waterfall                | ✅ favour waterfall for finding activity                    |
| **SCOPE LINE WIDTH**      | trace thickness                                              | ✅ thin for detail, thicker for visibility                  |
| **CENTER LINE**           | red spectrum centre marker                                   | ✅ ON unless it obscures a preferred cursor view            |
| **PARAMETER TEXT COLOR**  | quick-menu parameter text colour                             | ✅ choose contrast, not decoration                          |
| **BACKLIGHT LEVEL**       | brightness `1–10`                                            | ✅ lowest comfortable outdoor/indoor level                  |
| **SCREEN SAVER**          | enables dim/off timers                                       | ⭐ useful on battery                                        |
| **SCREEN DIM TIME**       | delay before dimming                                         | ⭐ long enough not to interrupt an exchange                 |
| **SCREEN OFF TIME**       | delay before backlight off                                   | ⭐ use for listening/field endurance                        |

## GEN: DISPLAY page 2 — colour channels

This page edits red, green, blue and alpha (transparency) values for three elements:

| Element         | Red                | Green                | Blue                | Alpha                |
| --------------- | ------------------ | -------------------- | ------------------- | -------------------- |
| spectrum line   | **SCOPE LINE RED** | **SCOPE LINE GREEN** | **SCOPE LINE BLUE** | **SCOPE LINE ALPHA** |
| spectrum fill   | **SCOPE FILL RED** | **SCOPE FILL GREEN** | **SCOPE FILL BLUE** | **SCOPE FILL ALPHA** |
| passband marker | **BW MARKER RED**  | **BW MARKER GREEN**  | **BW MARKER BLUE**  | **BW MARKER ALPHA**  |

Some builds spell `SCOPE` as `SCPOE`; it is the same item. Firmware `1.0.7` fixes a freeze that could occur when spectrum-line transparency was below `255`. If an older radio freezes after an alpha change, update through the authorised process and restore a fully opaque value in the meantime.

## GEN: DISPLAY page 3 — firmware 1.0.7

These items do not exist on the early manual screens:

| Item                | Function                                         | Published default  |
| ------------------- | ------------------------------------------------ | ------------------ |
| **SHOW RX LEVEL**   | numeric received level at upper-left of spectrum | `OFF`              |
| **WATERFALL SPEED** | `NORMAL / SLOW` scroll rate                      | `NORMAL`           |
| **3D BANDSCOPE**    | alternative perspective band display             | off unless enabled |

If page 3 is absent, inspect SYSTEM INFO. Do not factory-reset merely to search for it on pre-1.0.7 firmware.

## GEN: SYSTEM

| Item                 | Opens / changes                                            | Caution                                                       |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| **TIME SETTING**     | date, time, time zone and time-server address              | ✅ use UTC for logging; avoid mixing local time and offset    |
| **SYSTEM INFO**      | firmware versions; network data added in 1.0.6             | ✅ photograph before support/update                           |
| **FIRMWARE UPGRADE** | baseband firmware selection/install                        | ⚠️ only one stage of full update; follow official tutorial    |
| **WLAN / WIFI**      | adapter, scan, credentials, IP/gateway/DNS/prefix, connect | ⚠️ use trusted network; do not expose remote service casually |
| **BLUETOOTH**        | on/off, scan, connect/disconnect                           | ⭐ keyboards/mice and supported FT8CN workflow                |
| **WFSERVER**         | remote-service settings and start                          | ⚠️ network service; configure intentionally                   |
| **LANGUAGE SETTING** | English / Simplified Chinese                               | ✅ preference                                                 |
| **FACTORY RESET**    | clears personalised settings and restarts                  | ⚠️ record configuration first; two confirmations              |

WLAN's documented soft controls are **SCAN**, **CONNECT/DISCONNECT**, **EDIT**, **NEXT** and **EXIT**. The network form includes password, IP address, gateway, DNS and network prefix. Firmware/network behaviour has evolved, so use the help shown by your build where it differs.

Bluetooth provides **OFF/ON**, **SCAN**, **CONNECT/DISCONNECT** and **EXIT**. A paired peripheral may reconnect after reboot. `BUILT-IN` in SETTING 2 must be consistent with the adapter path in use.

WFSERVER has configuration fields and **START**. A blue `WF` icon indicates the service is active. Running it is not the same as merely joining Wi-Fi.

## GEN: MEMORY

| Current V06 / EU 1.0.3+ control | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| **TAG**                         | names the selected memory                                               |
| **MEM TO VFO**                  | recalls the selected channel to VFO; added as Read Channel in 1.0.3     |
| **ERASE MEMO**                  | clears the selected channel                                             |
| **SAVE VFO**                    | stores current VFO frequency, mode and related state in a blank channel |
| **EXIT**                        | leaves the editor                                                       |

Confirm the selected channel before erase. A factory reset may clear personal memories, so keep important frequencies elsewhere too.

Rev01/Rev05 predate the `1.0.3` recall change and show **MARK**, which adds a small-house indicator, in the slot where later firmware provides **MEM TO VFO**. Current V06's explanatory prose says “MARK TO VFO,” but its actual five-soft-key screenshot reads `TAG · MEM TO VFO · ERASE MEMO · SAVE VFO · EXIT`; treat the prose as a translation/label typo. No manual connects old MARK to the H-22 HOME key.

## APP

| Application     | Controls                                                                     | What it really does                                   |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| **MODEM**       | page 1 `MODE`, `FC/TONE`, `RATE/SPEED`; page 2 `AFC`, `SQL`, `CLEAR`, `EXIT` | receives/sends supported text modes with MSG memories |
| **SWR SCAN**    | `START`, `STEP`, `EXIT`                                                      | low-power reference sweep of antenna match            |
| **VOICE CALL**  | selects and transmits stored voice messages                                  | playback/transmit side of MSG voice recorder          |
| **FT8 DECODER** | opens decoder overlay                                                        | decodes received FT8; not a complete QSO keyboard     |

The Rev 05 manual lists `RTTY / CW / BPSK` under MODEM. On firmware `1.0.7`, **CW is removed from MODEM** because CW decoding moved to KEY. Current users should expect RTTY/BPSK there, not follow an old screen blindly.

In MODEM, `FC/TONE` selects carrier or sidetone frequency as appropriate, `RATE/SPEED` selects baud/code rate, `AFC` tracks carrier drift, `SQL` sets modem muting, and `CLEAR` empties decoded text. MSG opens the five preset text messages for transmission in the selected supported mode.

## KEY page 1

| Item           | Purpose                    | Starting idea                                       |
| -------------- | -------------------------- | --------------------------------------------------- |
| **KEY TYPE**   | straight key / paddle mode | ✅ match the connected hardware                     |
| **KEY SPEED**  | automatic keyer speed      | ✅ begin slower than your receive limit             |
| **IAMBIC**     | paddle timing mode A/B     | ⭐ match learned technique                          |
| **TONE**       | CW sidetone/pitch          | ⭐ choose comfortable pitch and use it for centring |
| **TONE LEVEL** | sidetone volume            | ✅ audible, not tiring                              |

## KEY page 2

| Item                      | Purpose                                      | Firmware note                                                              |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| **QSK TIME**              | transmit-to-receive delay/break-in behaviour | original documented item                                                   |
| **DI/DA RATIO**           | dot-to-dash weighting                        | leave standard unless correcting keying preference                         |
| **CW TRAINER**            | keyer practice without RF                    | verify no RF output before indoor practice                                 |
| **CW DECODER**            | received-CW decoder on/off                   | added in 1.0.6                                                             |
| **CW DECODING THRESHOLD** | decode threshold `1–50`                      | added in 1.0.6; Xiegu suggests roughly 5–14 low noise, 15–30 near S9 noise |

Decoded text scrolls at the bottom of the waterfall. Firmware `1.0.7` fixes crackling heard after enabling the decoder.

## MSG pages

| Page  | Slots                 | Documented editor controls                                            |
| ----- | --------------------- | --------------------------------------------------------------------- |
| text  | `MSG1` through `MSG5` | **KEYBOARD MODE**, **DELETE**, **SPACE**, **SAVE AND EXIT**, **EXIT** |
| voice | `MSG1` through `MSG5` | **RECORD**, **PLAY**, **STOP**, **EXIT**                              |

Text slots store content for CW/RTTY/BPSK as supported by the current MODEM/KEY implementation. Rotate an MFK ring to choose a character and press MFK to enter it; KEYBOARD MODE cycles character/digit/IPv4 layouts.

Voice slots store recordings of up to 1 minute 30 seconds. Keep the microphone roughly 5–10 cm from the mouth, use a normal voice and turn monitor down/off while recording to avoid feedback.

## DFN pages

| Page | Item         | Function                         |
| ---- | ------------ | -------------------------------- |
| 1    | **NR**       | noise-reduction switch           |
| 1    | **NR DEPTH** | amount of noise reduction        |
| 1    | **NB**       | impulse-noise blanker switch     |
| 1    | **NB WIDTH** | width of detected blanking pulse |
| 1    | **NB LEVEL** | pulse-noise/blanking level       |
| 2    | **NOTCH**    | notch filter switch              |
| 2    | **NOTCH FC** | notch centre frequency           |

Use NR for broadly random noise, NB for short repetitive impulses and NOTCH for a steady tone. They are not three strengths of one effect.

## DFL

| Control     | Purpose                                               |
| ----------- | ----------------------------------------------------- |
| **FILTER1** | remembered passband bank 1 for the current mode       |
| **FILTER2** | remembered passband bank 2 for the current mode       |
| **FILTER3** | remembered passband bank 3 for the current mode       |
| **DEFAULT** | restores the selected bank's documented default edges |
| **CLOSE**   | exits the filter editor                               |

Select a bank, press MFK to alternate the low-cut and high-cut edges, then rotate the documented control to move the selected edge. The overlapping portion of the two filter shapes is the audio passed to you. Values are automatically stored and banks change with mode.

If low cut crosses too far toward high cut, or high cut crosses too far toward low cut, the useful signal can vanish. Restore DEFAULT before diagnosing a receiver failure.

## Firmware/version reconciliation

| What an older manual says             | What the EU 1.0.7 baseline does                         |
| ------------------------------------- | ------------------------------------------------------- |
| MODEM offers RTTY/CW/BPSK             | CW removed from MODEM; decoder lives in KEY             |
| KEY page 2 ends after CW TRAINER      | 1.0.6 adds CW decoder and threshold                     |
| DISPLAY has two pages                 | 1.0.7 adds page 3 with RX level, speed and 3D bandscope |
| SSB lacks 2.5/5 kHz steps             | 1.0.7 adds them                                         |
| AM filter presets follow early values | 1.0.7 presets are 9/12/15 kHz                           |
| no WR12/network status                | 1.0.6 adds WR12 support and network info                |

The authoritative view for _your unit_ is SYSTEM INFO plus the release notes for its installed image, not a screenshot from a different version.

The manufacturer channel now publishes a V06 Chinese manual and a newer 2026 image; Radioddity labels a `1.0.8` package. This table remains explicitly the Xiegu EU `1.0.7` English baseline. Do not cross-flash release channels or infer unlisted `1.0.8` behaviour from the version number alone.

## Key takeaways

- GEN contains five families: SETTING 1, SETTING 2, DISPLAY, SYSTEM and MEMORY.
- Every documented core item is indexed above; the chapters on [General Settings](outpost:entry/logbook73.guide.x6200/gen-settings), [Apps](outpost:entry/logbook73.guide.x6200/app-modem-ft8), [DSP](outpost:entry/logbook73.guide.x6200/dsp-filters) and [CW/Messages](outpost:entry/logbook73.guide.x6200/cw-messages) explain the choices.
- Firmware `1.0.6` adds CW decoder, FT8CN/WR12 support and network information. `1.0.7` adds DISPLAY page 3 and moves/removes CW from MODEM.
- A silent receiver is often SQL, RFG or an over-narrow DFL bank; reset those before assuming a defect.
- APP FT8 is decode-only; full contacts need a supported external workflow.
- FACTORY RESET and FIRMWARE UPGRADE are deliberate maintenance actions, not exploratory buttons.

### References

- [Manufacturer-authored Rev 05 manual mirror](https://radioddity.s3.amazonaws.com/Xiegu_X6200_Manual_20240925.pdf)
- [Current manufacturer manual downloads (including V06)](https://www.cqxiegu.com/zlxz)
- [Xiegu EU X6200 firmware 1.0.6/1.0.7 release notes](https://xiegu.eu/downloads/)
