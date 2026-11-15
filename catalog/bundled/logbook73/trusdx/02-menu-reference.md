# Menu and button reference at a glance

This page is the whole control system at a glance: the button gestures, then the numbered menu, item by item, with a one-line plain-English explanation and a pointer to the chapter that explains the why. Chapters [3](outpost:entry/logbook73.guide.trusdx/everyday-operating) to [8](outpost:entry/logbook73.guide.trusdx/digital) do the explaining; this page answers "which number was it?"

A word on completeness before the tables. The (tr)uSDX's firmware is actively developed, and menu items have been added, removed and even renumbered across the 2.00-series releases — the official manual page itself warns that its menu documentation can lag the code. The tables below document the **stable documented baseline** from the official manual, plus the items that firmware source and official pages confirm on current builds, each labelled. Where your radio's menu differs, your firmware version is the reason — trust the screen in front of you, and see [chapter 9](outpost:entry/logbook73.guide.trusdx/firmware) for the version story.

## Verdict key

| Symbol | Meaning                                          |
| ------ | ------------------------------------------------ |
| ✅     | Safe general starting point                      |
| ⭐     | Useful when the operating situation calls for it |
| ⚠️     | Understand the consequence before changing it    |
| ❌     | Leave alone unless solving a specific problem    |

## Button and encoder gestures

| Gesture                  | Action                                   | Notes                                   |
| ------------------------ | ---------------------------------------- | --------------------------------------- |
| **Left button**          | Open menu / power on                     | The "do something" button               |
| **Right button**         | Change mode / exit menu                  | The "back" button — you cannot get lost |
| **Double right**         | Cycle audio filter bandwidth             | Same list as menu `1.3`                 |
| **Slow double right**    | VFO mode: A → B → split                  | Same as menu `1.6`                      |
| **Hold right**           | RIT on/off                               | Same as menu `1.7`                      |
| **Turn encoder**         | Tune / adjust value                      | Moves by the tuning-rate digit          |
| **Press encoder**        | Step tuning rate                         | Your most-used control                  |
| **Double-press encoder** | Band selection                           | Bands come from the fitted filter board |
| **Hold left + turn**     | Quick menu (and spectrum view on 2.00t+) | Fast path once you know the numbers     |
| **Hold encoder**         | ⚠️ **Factory reset**                     | Wipes settings _and calibration_        |
| **Volume to zero**       | Power off                                | Turn volume fully down                  |

## Menu group 1 — receiver, tuning and display

| Item   | Name          | Values                                                     | What it does                                                                                                  | Start/advice                                                                 |
| ------ | ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `1.1`  | **Volume**    | `1–15`; `0` = off                                          | Audio level in coarse steps; zero switches the radio off                                                      | ✅ Set for comfort; remember 0 is "off"                                      |
| `1.2`  | **Mode**      | LSB, USB, CW, AM, FM                                       | Operating mode; right button cycles the common ones faster                                                    | ✅ LSB below 10 MHz, USB above, CW as needed                                 |
| `1.3`  | **Filter BW** | Full, `3000`, `2400`, `1800`, `500`, `200`, `100`, `50 Hz` | Audio passband; the wide ones are for SSB, the narrow ones for CW                                             | ✅ `2400` SSB · `500` CW; narrower only under fire                           |
| `1.4`  | **Band**      | The five bands of your filter board                        | Jumps to a stored frequency per band                                                                          | ⭐ Double-press the encoder instead                                          |
| `1.5`  | **Tune Rate** | `10M` … `1 Hz` per step                                    | How far one encoder click moves                                                                               | ✅ Drive it from the encoder press, not the menu                             |
| `1.6`  | **VFO Mode**  | VFO-A, VFO-B, Split                                        | Two independent VFOs and split working                                                                        | ✅ VFO-A; split for DX pile-ups ([ch. 3](outpost:entry/logbook73.guide.trusdx/everyday-operating)) |
| `1.7`  | **RIT**       | ON, OFF                                                    | Shift receive without moving transmit                                                                         | ⭐ Clear it after each contact                                               |
| `1.8`  | **AGC**       | ON, OFF                                                    | Automatic gain control — evens out loud and weak signals                                                      | ✅ ON for general use                                                        |
| `1.9`  | **NR**        | `0–8`                                                      | Software noise reduction; higher = smoother but muddier                                                       | ⭐ `0`–`2`; raise only on rough bands                                        |
| `1.10` | **ATT**       | `0` to `−73 dB` in steps                                   | Analogue attenuator for very strong signals                                                                   | ✅ `0`; step in when the band overloads                                      |
| `1.11` | **ATT2**      | `0–16` (6 dB steps)                                        | Digital attenuation after the ADC                                                                             | ✅ `0`; a rescue for extreme cases                                           |
| `1.12` | **S-meter**   | OFF, dBm, S, S-bar                                         | How signal strength is displayed                                                                              | ⭐ Taste; `S-bar` is the classic look                                        |
| `1.13` | **SWR meter** | OFF, FWD-SWR, FWD-REF, VFWD-VREF                           | Transmit metering from the onboard bridge — power and SWR on screen (present on builds with metering enabled) | ⭐ FWD-SWR while testing antennas; OFF once trusted                          |

## Menu group 2 — CW

| Item  | Name            | Values                              | What it does                                          | Start/advice                                                |
| ----- | --------------- | ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `2.1` | **CW Decoder**  | ON, OFF                             | Prints received Morse on the display                  | ⭐ ON while learning; it loves clean senders                |
| `2.2` | **CW Tone**     | `600`, `700 Hz`                     | Sidetone/filter centre pitch, on builds that offer it | ✅ Whichever your ear prefers                               |
| `2.4` | **Semi QSK**    | ON, OFF                             | How quickly the receiver returns between elements     | ✅ ON for a smoother CW rhythm ([ch. 5](outpost:entry/logbook73.guide.trusdx/cw)) |
| `2.5` | **Keyer Speed** | about `10–40` WPM (build-dependent) | Paddle keyer speed in words per minute                | ✅ Your comfortable speed                                   |
| `2.6` | **Keyer Mode**  | Iambic-A, Iambic-B, Straight        | Paddle logic, or straight-key mode                    | ✅ Straight for a straight key; A/B to taste                |
| `2.7` | **Keyer Swap**  | ON, OFF                             | Swaps dit and dah paddle contacts                     | ⭐ Fixes a "backwards" paddle instantly                     |
| `2.8` | **Practice**    | ON, OFF                             | Keyer and sidetone with **no RF output**              | ⭐ Superb for learning; ⚠️ remember it is on                |

## Menu group 3 — transmit

| Item  | Name           | Values                          | What it does                                                  | Start/advice                                                      |
| ----- | -------------- | ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `3.1` | **VOX**        | ON, OFF                         | Voice/audio-operated transmit switching                       | ❌ OFF except for digital modes ([ch. 8](outpost:entry/logbook73.guide.trusdx/digital)) |
| `3.2` | **Noise Gate** | `0–255`                         | Audio level below which the mic is ignored                    | ✅ Low; raise to kill background-noise triggering                 |
| `3.3` | **TX Drive**   | `0–8`; `8` = constant amplitude | Transmit drive/modulation depth — _the_ SSB quality control   | ⚠️ Read [ch. 4](outpost:entry/logbook73.guide.trusdx/ssb) before touching               |
| `3.4` | **TX Delay**   | `0–255 ms`                      | Delay before RF after keying, for external amp/antenna relays | ✅ `0` barefoot; set to protect external kit                      |
| `3.5` | **MOX**        | `0–2`                           | Monitor own transmit audio (where offered)                    | ⭐ Brief self-checks only                                         |

## Menu group 4 — CW messages

| Item        | Name               | Values   | What it does                                         | Start/advice                          |
| ----------- | ------------------ | -------- | ---------------------------------------------------- | ------------------------------------- |
| `4.1`       | **CQ Interval**    | `0–60 s` | Pause before an automatic message repeat             | ⭐ `4`–`10 s` for a beacon-style CQ   |
| `4.2`       | **CQ Message**     | text     | Your stored CQ, keyed by the radio itself            | ⭐ `CQ CQ DE <call> <call> K`         |
| `4.3`–`4.7` | **CW Message 2–6** | text     | Extra message slots on builds with extended messages | ⭐ Exchange, "TU 73", contest strings |

On message-capable firmware, a left-button press in CW message mode plays a message; the interval setting turns a message into a repeating caller until you touch the key. [Chapter 5](outpost:entry/logbook73.guide.trusdx/cw) walks through recording and using them.

## Menu group 8 — calibration and hardware ⚠️

These settings match the firmware to your particular board. They are set once, written down, and left alone; all of [chapter 6](outpost:entry/logbook73.guide.trusdx/calibration) is about them.

| Item  | Name                | Values          | What it does                                                                                                                                       | Start/advice                                                        |
| ----- | ------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `8.1` | **PA Bias min**     | `0–255`         | PWM level for zero RF output (removed and fixed at `0` in recent betas)                                                                            | ⚠️ Calibration procedure only                                       |
| `8.2` | **PA Bias max**     | `0–255`         | PWM level for full RF output — sets your maximum power                                                                                             | ⚠️ Calibrate per [ch. 6](outpost:entry/logbook73.guide.trusdx/calibration); write it down |
| `8.3` | **Ref freq**        | Hz              | Fine-tunes the frequency of the clock-generator crystal so the dial reads true                                                                     | ⚠️ Calibrate once against a known signal; write it down             |
| `8.4` | **IQ Phase**        | `0–180`°        | Receiver I/Q phase trim for best unwanted-sideband rejection                                                                                       | ⚠️ Calibrate once; write it down                                    |
| `8.7` | **LPF/Band config** | Lo, Hi, Classic | Tells the firmware which filter-board recipe is fitted — Lo `80/60/40/30/20 m`, Hi `20/17/15/12/10 m`, Classic `80/40/20/15/10 m` (current builds) | ⚠️ Must match the hardware or band switching is nonsense            |

## Menu group 10 — display

| Item   | Name          | Values  | What it does         | Start/advice                           |
| ------ | ------------- | ------- | -------------------- | -------------------------------------- |
| `10.1` | **Backlight** | ON, OFF | Display illumination | ✅ ON; OFF squeezes the last milliamps |

## Items you may see that this table does not promise

Depending on the exact build, you may meet a few more entries: debug/diagnostic read-outs (sample rate, CPU load) on development builds, an IQ test aid on some hardware variants, and the beta-series experiments described in [chapter 9](outpost:entry/logbook73.guide.trusdx/firmware) — the 2.00v/w/x betas at one point removed the attenuators, noise reduction and practice mode from the menu, then restored several of them after user feedback. None of this changes how the documented items above behave; it changes only which of them your screen shows. When in doubt: the number and name on your display, plus this table's explanation of that name, is the truth for your radio.

## The five-minute sanity setup

A fresh or factory-reset radio becomes pleasant with exactly these moves:

1. `1.8 AGC` ON, `1.9 NR` `0`, `1.10/1.11` attenuators `0`.
2. `1.3 Filter BW` `2400` (SSB) — narrow later as conditions demand.
3. `1.12 S-meter` to `S-bar`, and `1.13 SWR meter` (if present) to `FWD-SWR` until you trust your antenna.
4. CW people: `2.5` speed, `2.6` mode, `2.7` swap until the paddle feels right; `2.8 Practice` ON until you mean it.
5. Confirm `8.7` matches your filter board, confirm the [calibration values](outpost:entry/logbook73.guide.trusdx/calibration) are set and _written down_ — then leave group 8 alone.
