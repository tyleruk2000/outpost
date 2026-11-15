# Quick reference card

Keep this page beside the X6200. Version-labelled menu guidance uses the Xiegu EU `1.0.7` English baseline; current manufacturer V06 differences are called out. A newer manufacturer image/Radioddity `1.0.8` channel exists, so check SYSTEM INFO and the authorised source for your unit rather than cross-flashing by version number.

## Power and safety

| Item                      | Value / action                                                         |
| ------------------------- | ---------------------------------------------------------------------- |
| Recommended operating DC  | Regulated `12–15 V`, centre positive, ≥`3.5 A`; `13.8 V` normal        |
| Manufacturer V06 rating   | `9–15 V`; below `11 V`, a fitted battery takes over                    |
| Normal station supply     | regulated `13.8 V`                                                     |
| Supplied charging adapter | Charge-only; radio off, battery fitted, SETTING 2 → CHARGER ON         |
| RF output                 | up to about `8 W` external / `5 W` battery                             |
| Sustained data            | `≤5 W`, airflow and pauses                                             |
| XPA125B documented drive  | `≤2 W` through correct L4001/ACC setup                                 |
| GPA100 documented drive   | Current V06: `2–5 W`; use GPA100 manual, not the XPA125B limit         |
| Shutdown                  | hold until display exits; release; wait ≥5 s                           |
| Forced shutdown           | hold >12 s only if frozen; then remove both power sources if necessary |
| Battery storage           | remove, cool/dry, around 40–50% charge                                 |

Never transmit without an antenna/dummy load. Disconnect antenna/power for storms. Do not touch antenna while transmitting.

## Control surface

| Control          | Short                           | Long / press again          |
| ---------------- | ------------------------------- | --------------------------- |
| `← / →`          | previous/next band/channel      | route set by BANDSTACK      |
| `AM/FM`          | AM/NFM family                   | WFM is receive-only context |
| `CW`             | CW family                       | CW-R as selected            |
| `SSB`            | USB/LSB family                  | —                           |
| `A/B`            | swap active VFO                 | copy/equalise A and B       |
| `ATU`            | enable/bypass tuner             | start tune (~1 s)           |
| `FST`            | fast-step selection             | lock/unlock                 |
| VOL/SQL/RFG knob | adjust selected                 | press cycles function       |
| MFK inner        | tune main / change menu value   | press select/confirm        |
| MFK outer        | TX power main / select menu row | —                           |

Five bottom keys are **physical soft-keys** for the labels above them; do not rely on screen tapping.

## Function buttons

| Button | Page 1                                   | Page 2 / detail                        |
| ------ | ---------------------------------------- | -------------------------------------- |
| GEN    | SETTING 1/2, DISPLAY, SYSTEM, MEMORY     | NEXT/PREV within lists                 |
| APP    | MODEM, SWR SCAN, VOICE CALL, FT8 DECODER | MODEM has page 2                       |
| KEY    | type, speed, iambic, tone, level         | QSK, ratio, trainer; CW decode 1.0.6+  |
| MSG    | 5 text memories                          | press again: 5 voice memories          |
| DFN    | NR/depth, NB/width/level                 | press again: NOTCH/FC                  |
| DFL    | FILTER1/2/3                              | MFK selects L/H edge; DEFAULT recovers |

## Known-good home state

```text
PTT NORMAL · SPLE OFF · RIT 0 · XIT 0
AGC AUTO · PRE OFF · ATT OFF
SQL open · RFG high
DFL normal/default
NR OFF · NB OFF · NOTCH OFF
MIC SEL AUTO · COMP OFF
```

## GEN essentials

### SETTING 1

`PRE · ATT · AGC · TX POWER · MIC SEL · BUILT-IN MIC GAIN · HANDLE MIC GAIN · LINE IN GAIN · LINE OUT GAIN · MONITOR LEVEL · COMP · SSB STEP · CW STEP · AM STEP · WFM STEP`

EQ page: RX `300/700/1200/1800/2300`; WFM `50/300/1500/5000/12000`; MIC five displayed bands; master switches `EQ-RX`, `EQ-RX(WFM)`, `EQ-MIC`.

### SETTING 2

`RIT · XIT · HANDLE F1/F2/F3 · SPLE · PTT MODE · BANDSTACK · S/P MODE · CHARGER · BUILT-IN`

Defaults documented: H-22 F1 PRE, F2 NR, F3 filter; PTT NORMAL; BANDSTACK HAM BAND.

### DISPLAY

Page 1: RF FFT average/ref/span/peak hold, CW zoom, audio FFT average/ref, WF move/ref/colour, audio scope, grid, height ratio, line width, centre line, text colour, backlight, saver/dim/off.

Page 2: RGBA for scope line, scope fill and bandwidth marker.

Page 3 (`1.0.7`): `SHOW RX LEVEL` default OFF; `WATERFALL SPEED` default NORMAL; `3D BANDSCOPE` (requires page 1 `AUDIO SCOPE = OFF`).

### SYSTEM

`TIME SETTING · SYSTEM INFO · FIRMWARE UPGRADE · WLAN · BLUETOOTH · WFSERVER · LANGUAGE · FACTORY RESET`

Check SYSTEM INFO before troubleshooting. Photograph settings before reset/update.

### MEMORY

Current five keys: `TAG · MEM TO VFO · ERASE MEMO · SAVE VFO · EXIT` (`MEM TO VFO` arrived as Read Channel in 1.0.3; older Rev01/05 show MARK in that slot).

## Mode starts

| Job           | Mode / first setup                                                |
| ------------- | ----------------------------------------------------------------- |
| HF voice      | LSB usually below 10 MHz, USB above; AGC AUTO; normal voice DFL   |
| CW            | fine step, AGC FAST/AUTO, tune pitch to TONE, notch off           |
| AM broadcast  | 1.0.7 filters 9/12/15 kHz                                         |
| WFM broadcast | 88–108 MHz receive only; local channel step                       |
| Airband       | 108–136 MHz AM receive only; VHF antenna                          |
| FT8 PC        | DEV USB, native X6200 CAT, USB audio, clock exact, COMP off, ≤5 W |
| FT8CN         | firmware 1.0.6+, internal BT, app current, clock exact            |
| Built-in FT8  | APP → FT8 DECODER; receive decode only                            |

## ATU and SWR

```text
Listen → clear legal frequency → low power
short ATU = enable → long ATU = tune
verify SWR → leave enabled to retain match
```

Specified ATU range about `20–175 Ω`. Adjust physical antenna first. APP → SWR SCAN controls: `START · STEP · EXIT`; bypass ATU to inspect raw antenna. Scanner is reference-only.

## USB and wireless

| Path      | Use                                                                     |
| --------- | ----------------------------------------------------------------------- |
| DEV       | CAT on SERIAL-B: `19200` `8N1`, CI-V `0xA4`; virtual audio; CH342       |
| HOST      | one supported keyboard/mouse/WR12; limited power, no hub                |
| WLAN      | scan, password, static IP/gateway/DNS/prefix, connect                   |
| Bluetooth | keyboard/mouse; FT8CN 1.0.6+                                            |
| WFSERVER  | configure then START; blue WF icon; trusted LAN only                    |
| WR12      | HOST, blue icon, receive expansion; 1.0.6+, 1.0.7 fixes fast-tune crash |

## Firmware delta

### 1.0.6

- CW decoder/threshold `1–50` on KEY page 2;
- FT8CN Bluetooth support;
- WR12 support;
- NETWORK in SYSTEM INFO;
- NR, AM/NFM and battery improvements.

### 1.0.7

- AGC/NR/noise-floor improvements;
- SSB steps `2.5/5 kHz`;
- AM filters `9/12/15 kHz`;
- DISPLAY page 3;
- WFM silence, battery, CW crackle, WR12 and alpha-freeze fixes;
- CW removed from MODEM;
- receive ceiling 136 MHz.

## Firmware update

```text
Authorised X6200 archive + checksum
Photograph SYSTEM INFO/settings
Stable 13.8 V external supply
Remove detachable battery as tutorial directs
Stage 1: write/install system microSD image
Stage 2: SYSTEM → FIRMWARE UPGRADE baseband
Verify both versions → reset only if release requires
Receive test → dummy-load low-power TX test
```

Never use X6100 files/instructions. Follow the [official X6200 upgrade tutorial](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200FirmwareUpgradeTutorialWS-JSZL-2407-01ENRevised.pdf).

## Fast fault finder

| Symptom                 | Check first                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| dead/silent RX          | volume/S/P TRS, SQL open, RFG high, DFL DEFAULT, DSP off, antenna         |
| ghosts/whole band harsh | PRE off, ATT on, RFG down, external reject filter                         |
| no TX                   | legal band, SPLE/XIT, PTT, MIC SEL, load/SWR, supply                      |
| PTT stuck               | PTT TOGGLE, miswired KEY, CAT/voice message; remove power if needed       |
| ATU “did nothing”       | short only enables; long starts tune                                      |
| charge fails            | Radio off, supplied adapter, CHARGER ON, battery seated, temperature >0°C |
| USB absent              | DEV, data cable, CH342, direct port                                       |
| FT8 no decode           | clock, dial/mode, X6200 input, LINE OUT, full DFL                         |
| FT8 bad TX              | correct output/PTT, COMP off, lower audio, ≤5 W, clock                    |
| CW gibberish            | centre tone, DFL, notch off, threshold, 1.0.6+                            |
| menu missing            | SYSTEM INFO and firmware delta above                                      |
| freeze                  | normal off; >12 s only if stuck; 1.0.7 fixes WR12/alpha cases             |

## Authoritative links

- [Xiegu X6200 public manual and firmware downloads](https://xiegu.eu/downloads/)
- [X6200 English V01 manual](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200-USER-MANUAL-V01-PileupDX.com.pdf)
- [Firmware upgrade tutorial](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200FirmwareUpgradeTutorialWS-JSZL-2407-01ENRevised.pdf)
