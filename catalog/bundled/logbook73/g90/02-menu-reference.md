# Control and menu reference at a glance

This is the G90's one-page map expanded into a usable reference. Every physical control, secondary function and current System Menu item appears here. The deeper chapters explain the reasoning; this page answers “which button was it?”

The baseline is matched `APP/BASE v1.81`. Where v1.79 changed a control, the current action is listed first and the obsolete one is explicitly labelled.

## Verdict key

| Symbol | Meaning                                          |
| ------ | ------------------------------------------------ |
| ✅     | Safe general starting point                      |
| ⭐     | Useful when the operating situation calls for it |
| ⚠️     | Understand the consequence before changing it    |
| ❌     | Leave off unless solving a specific problem      |

## Core controls

| Control              | Action         | Result                                                | Start/advice                           |
| -------------------- | -------------- | ----------------------------------------------------- | -------------------------------------- |
| **POWER**            | Short from off | Start radio                                           | Verify antenna/power first             |
| **POWER**            | Short while on | Display off/on; receiver remains active               | Do not mistake for shutdown            |
| **POWER**            | Hold           | Proper shutdown after `BYE`                           | ✅ Always shut down this way           |
| Status LED           | Observe        | Yellow-green RX/idle; red TX/startup                  | Red unexpectedly: stop and investigate |
| **VOL**              | Rotate         | AF volume                                             | Comfortable, not maximum               |
| **VOL**              | Short press    | Toggle internal/external audio route                  | Check this when audio vanishes         |
| **FUNC + VOL press** | Open           | VOX on/off, gain, anti-VOX, delay                     | ❌ Off until intentionally configured  |
| **FUNC**             | Short          | Arm/cancel second-function layer                      | Watch the function indication          |
| **FUNC**             | Hold           | Open ten-item System Menu                             | Use SAVE, not EXIT, to retain changes  |
| ΔF/CW LED            | Observe        | Flashes/lights near selected CW tone/decoder tracking | Aid, not proof of correct decode       |

## Memory, VFO and tuner group

| Control        | Short/primary                              | Long or FUNC action                            | Notes                                       |
| -------------- | ------------------------------------------ | ---------------------------------------------- | ------------------------------------------- |
| **MW/MC**      | Write current VFO to a memory              | `FUNC + MW/MC`: clear selected memory          | Current store is `CH00–CH63`                |
| **A/B · A>B**  | Swap active VFO A/B                        | `FUNC + A/B`: copy VFO A to B                  | In split, A receives and B transmits        |
| **TUNE**       | Insert/remove the last ATU match           | Hold >about 2 s: transmit and find a new match | Short press does not retune                 |
| **POW**        | Cycle `POWER` and `SWR THR`                | Hold: SWR scanner                              | Scanner transmits with tuner bypassed       |
| **FUNC + POW** | Cycle `MIC GAIN` and `INPUT` where offered | —                                              | v1.79+ data modes auto-route ACC line audio |

## CW, display and front-end group

| Control         | Short/primary                                              | Long or FUNC action                                | Starting point                                           |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| **KEY**         | Cycle key speed, wiring, Iambic mode, QSK, delay and ratio | Hold: CW decoder                                   | QSK must be on for live CW transmission                  |
| **FUNC + KEY**  | Cycle CW volume, CW tone and receive bandwidth             | —                                                  | Tone to taste; ~500 Hz general, ~300 Hz decoder          |
| **LOCK**        | Cycle display brightness                                   | Hold: lock/unlock controls                         | Use a low readable field brightness                      |
| **FUNC + LOCK** | Cycle `SCALE` then `AVE`                                   | —                                                  | SCALE is fixed AUTO in current firmware; AVE smooths FFT |
| **PRE/ATT**     | Cycle PRE → ATT → normal                                   | —                                                  | ✅ Normal; PRE usually only above ~18 MHz                |
| **CMP/F-L**     | Compressor on/off                                          | `FUNC + CMP`: reset BPF1 to mode default on v1.79+ | ❌ Compressor off unless needed                          |
| **NB/F-H**      | Cycle NB switch, Level, Width                              | `FUNC + NB`: reset BPF2 to mode default on v1.79+  | ❌ Off unless pulse noise exists                         |

> **Older firmware warning:** manuals written before the v1.79 two-BPF interface describe **F-L** and **F-H** as direct lower/high filter-edge controls. On current stock firmware, FUNC+CMP and FUNC+NB reset BPF1/BPF2. Use the MFK filter editor to move the current edges.

## Gain, split, memories and tuning

| Control                    | Short/primary                                     | Long or FUNC action                         | Starting point                              |
| -------------------------- | ------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| **AGC/SPL**                | `AGC-S → AGC-F → AGC-A → AGC off`                 | Hold: RF Gain `1–100%`                      | ✅ AGC-A, RF Gain 50%                       |
| **FUNC + AGC**             | Toggle split                                      | —                                           | A=receive, B=transmit; confirm before PTT   |
| **VM**                     | Toggle VFO/memory mode                            | Hold: edit startup callsign                 | Memory frequencies are not directly tunable |
| **MFK**                    | Turn assigned quick value                         | Short: BPF editor; hold: assign quick value | Default `Freq 100k` is useful               |
| Main dial                  | Tune/change selected value                        | Short: tuning step; hold: RIT               | Clear RIT to zero after a contact           |
| **FUNC + main-dial press** | Change applicable tuning-step direction/behaviour | —                                           | Ensure FUNC is not accidentally latched     |
| Top **MODE ◀/▶**           | Move backward/forward through eight modes         | —                                           | Use data modes for ACC audio                |
| Top **BAND ◀/▶**           | Move backward/forward through band stack          | —                                           | System item 08 controls HAM/Full stack      |

### MFK assignable functions

A long MFK press opens the assignment list. Current control inventories and the v1.75 release history support these six choices:

| Assignment  | What rotation changes      | Advice                                                          |
| ----------- | -------------------------- | --------------------------------------------------------------- |
| `RF Gain`   | Receiver gain              | ⭐ Excellent for crowded/noisy bands                            |
| `Freq 100k` | Frequency in 100 kHz moves | ✅ Practical default                                            |
| `SQL Level` | Squelch threshold          | Useful mainly for NFM/AM                                        |
| `PO Level`  | Transmit power             | ⚠️ Avoid accidental high power                                  |
| `Key Speed` | CW keyer speed             | ⭐ Good for active CW operators                                 |
| `FFT Scale` | Spectrum scale             | Current firmware fixes scale at AUTO, so little practical value |

The June 2025 manual's MFK table omits `RF Gain` in one place, while Xiegu's v1.75 release history and current extended control inventory include it. Treat the live assignment list on your exact APP build as final.

## KEY sequence in full

Repeated short presses of **KEY** expose:

1. `SPEED` — keyer words per minute.
2. `M/L/R` — manual straight key, paddle orientation with left/right dot/dash.
3. `MODE` — Iambic A or B.
4. `QSK` — break-in on/off. Off is practice sidetone; on permits RF.
5. `QSK Time` — transmit/receive hang delay.
6. `Ratio` — dot-to-dash weighting.

Repeated **FUNC + KEY** actions expose CW monitor volume, sidetone pitch and receive bandwidth. Documentation wording around the last control varies across releases; use the visible value on your v1.81 unit, and do not assume a pre-v1.75 button sequence.

## NB sequence in full

Repeated **NB** presses expose:

1. `NBSW` — blanker on/off.
2. `NB Level` — detection threshold, `0–10`.
3. `NB Width` — blanking pulse width, `0–10`.

Use the lowest Level and Width that remove repetitive impulses. Excess blanking can roughen speech and create audible artefacts. NB does not remove steady hiss, atmospheric noise or adjacent speech.

## POW sequence in full

A short press alternates between:

- `POWER`: `1–20 W`, one-watt steps; and
- `SWR THR`: the protection threshold, normally `3:1` and adjustable within the firmware's offered range.

Press the main dial to finish. A long POW press opens SWR scan. The scan is an antenna check, not a live band scope, and radiates a carrier at roughly low tune power.

## The ten System Menu items

Hold **FUNC**, then use the on-screen `PREV`, `NEXT`, `SAVE` and `EXIT` actions. The exact current inventory is:

| No.  | On-screen name    | Values/current default                         | Purpose                       |
| ---- | ----------------- | ---------------------------------------------- | ----------------------------- |
| `01` | `Handle up/down`  | `FREQCH+/−` (default), `BAND+/−`, `VOLUM+/−`   | Assign microphone arrow keys  |
| `02` | `Handle F1`       | `PRE/ATT` default; `SPLT`, `NB`, `COMP`, `AGC` | Assign microphone F1          |
| `03` | `Handle F2`       | `SPLT` default; `PRE/ATT`, `NB`, `COMP`, `AGC` | Assign microphone F2          |
| `04` | `LCD BL`          | `10–100%`; default `80%`                       | Display backlight             |
| `05` | `AUX IN Volum`    | `0–15`; default `8`                            | Rear ACC line-input level     |
| `06` | `AUX OUT Volum`   | `0–15`; default `15`                           | Rear ACC line-output level    |
| `07` | `RCLK Tune`       | `−1000…+1000 Hz`; default `0`                  | Reference-clock calibration   |
| `08` | `Band Stack Mode` | `HAM Band` default / `Full Band`               | Choose band-key sequence      |
| `09` | `ON/OFF Beep`     | `Enable` default / `Disable`                   | Key acknowledgement beep      |
| `10` | `Version`         | APP and BASE versions/build data               | Diagnose/update compatibility |

Do not use `RCLK Tune` as a casual receive clarifier. Calibrate only against a trusted reference after thermal warm-up, otherwise every displayed frequency becomes wrong together.

## Hand microphone inventory

| Key           | Current purpose                            | Caveat                                  |
| ------------- | ------------------------------------------ | --------------------------------------- |
| **PTT**       | Hold to transmit, release to receive       | Stop if SWR or current is abnormal      |
| **UP/DOWN**   | Assigned frequency/channel, band or volume | Set in System item 01                   |
| **0–9**       | Select amateur band                        | After F-INP they enter frequency digits |
| **F-INP/ENT** | Begin/confirm direct frequency entry       | Check decimal/unit before transmit      |
| **MODE**      | Cycle operating mode                       | Confirm sideband/data route             |
| **FIL**       | No effective current DSP-filter action     | Use MFK editor instead                  |
| **F1/F2**     | User-assigned radio functions              | System items 02 and 03                  |
| **MW**        | Write memory                               | Avoid overwriting a wanted channel      |
| **VM**        | VFO/memory toggle                          | Mirrors front-panel VM                  |
| **XFC**       | No assigned stock function                 | Do not rely on old third-party labels   |
| **TUNER**     | Short in/out; hold to tune                 | Tuning transmits                        |
| **LOCK**      | Lock control identified by the v5 manual   | Confirm the lock icon on your unit      |
| Mic LED       | Green receive/red transmit                 | Unexpected red means PTT/VOX/CAT keying |

The June 2025 v5 manual inventories the microphone **LOCK** key as a lock control, but the v1.81 release note does not separately describe or redefine it. Treat that as the intended action: press it and confirm the on-screen lock state before relying on it. If your hardware/firmware combination does not respond, use the front-panel long LOCK and record both APP and BASE versions when seeking support. The guide does not label the documented key “unused” merely because behaviour has differed in older owner reports.

## Mode-default passbands on v1.79+

The radio creates the heard passband from the overlap of BPF1 and BPF2. Xiegu's published defaults are approximately:

| Mode family | BPF1/BPF2 default edges | Resulting width |
| ----------- | ----------------------- | --------------- |
| SSB voice   | `300–3000 Hz`           | `2700 Hz`       |
| SSB data    | `100–3100 Hz`           | `3000 Hz`       |
| CW/CWR      | `−250…+250 Hz`          | `500 Hz`        |
| AM          | `−3000…+3000 Hz`        | `6000 Hz`       |
| NFM         | `−4500…+4500 Hz`        | `9000 Hz`       |

Short-press MFK to edit. Press it again to choose the red BPF1 or blue BPF2 window, rotate to move the selected part, and long-press to leave. Purple/overlap is the audio actually passed. Reset an accidentally mangled window with **FUNC+CMP** (BPF1) or **FUNC+NB** (BPF2).

## Current defaults worth preserving

| Area            | Sensible baseline                                                     |
| --------------- | --------------------------------------------------------------------- |
| General receive | AGC-A, RF Gain 50%, normal front end, NB off                          |
| SSB voice       | correct sideband, 2.4–2.8 kHz, mic gain ~10, CMP off                  |
| CW              | CW/CWR, 500 Hz general or ~300 Hz decoder, QSK to preference          |
| Digital         | U-D usually, CMP off, low/modest power, v1.81 ALC ≤50                 |
| ATU             | Bypass on resonant antenna; long TUNE only when a new match is needed |
| Spectrum        | SCALE AUTO; AVE low-to-middle for readable motion                     |
| System          | Leave RCLK 0 unless calibrated; HAM Band; record versions             |

## Documentation traps

- **ALC:** v1.81 reversed/redefined the useful interpretation. Higher now means more input; digital must remain `≤50`. Ignore older numeric targets.
- **Filters:** v1.79 replaced the old F-L/F-H workflow with two overlapping BPF windows.
- **Data audio:** U-D/L-D added in v1.79 and automatically use ACC line audio. Old instructions may ask you to select LINE manually.
- **NFM:** very old FAQs say the G90 does not have working FM; current firmware does. v1.81 fixes a receive-silence bug.
- **Memories:** current firmware/documentation exposes 64 (`CH00–CH63`); an old FAQ says 100.
- **FFT scale:** current firmware fixes it at AUTO even though an MFK assignment and older controls still mention scale.
- **GSOC:** support ended at v1.78. Do not update to current firmware and assume the discontinued GSOC arrangement remains supported.

## Key takeaways

- Every control is either a short press, long press or FUNC action; never infer one from another.
- Current filters are an overlap of BPF1 and BPF2, edited with MFK and reset with FUNC+CMP/FUNC+NB.
- System Menu has exactly ten current items, from microphone assignments through Version.
- MFK's useful assignments are RF Gain, 100 kHz frequency, squelch, power and key speed; FFT scale is vestigial on current firmware.
- The microphone's FIL and XFC buttons have no useful current stock action.

For the same controls taught as operating habits rather than a table, continue to [Everyday controls](outpost:entry/logbook73.guide.g90/everyday-controls). The ten setup pages receive a full explanation in [System Menu](outpost:entry/logbook73.guide.g90/system-menu).
