# Every system-menu item explained

Hold **FUNC** for roughly one to two seconds to open the G90 System Menu. It contains ten pages—not dozens—and most should be set once, recorded and left alone. The bottom on-screen words correspond to physical soft buttons less neatly than their spacing suggests, so look at the highlighted action before pressing.

`PREV` and `NEXT` move between pages. The main dial changes the selected value. `SAVE` stores and exits; `EXIT` leaves without saving. When diagnosing a change, alter one item, save, test and record the result. Changing five at once guarantees uncertainty.

## 01 — Handle up/down

This page assigns the microphone's arrow keys:

- `FREQCH+/−` — frequency up/down in VFO mode and channel up/down in memory mode; factory default.
- `BAND+/−` — move through the band stack.
- `VOLUM+/−` — audio volume.

`FREQCH+/−` is the best general setting because it follows the radio's current operating context. A mobile operator who must keep eyes on the road may prefer volume, though no control assignment makes operating a radio while driving automatically safe or legal. A portable operator moving repeatedly between only a few bands may prefer BAND.

The arrows are not an independent tuning-step menu; frequency movement follows the relevant radio context. If they seem to change memories instead of frequency, check whether **VM** has placed the radio in memory mode.

**Starting point:** ✅ `FREQCH+/−`.

## 02 — Handle F1

This assigns microphone **F1**. Available functions are:

- `PRE/ATT` — cycle preamplifier, attenuator and normal;
- `SPLT` — toggle split;
- `NB` — noise blanker sequence;
- `COMP` — speech compressor; and
- `AGC` — AGC sequence.

The factory/default choice is `PRE/ATT`. It is a sensible assignment because receiver front-end state often needs changing quickly when moving from a quiet upper band to a crowded lower one.

Choose a function that is safe when pressed accidentally. SPLT is powerful but can move transmit to an unseen B frequency, so it is a poor F1 choice for an operator who often grabs the microphone by feel. COMP is less dangerous but may be forgotten. AGC is safe and frequently useful for CW/SSB switching.

**Starting point:** ✅ `PRE/ATT`; ⭐ `AGC` for CW-heavy use.

## 03 — Handle F2

This assigns microphone **F2** to the same set: `SPLT`, `PRE/ATT`, `NB`, `COMP` or `AGC`. The factory/default assignment is `SPLT`.

Keep SPLT here only if you regularly work DX stations operating “up” and have the discipline to verify B before every transmission. Otherwise assign AGC or NB. A blanker key is convenient for mobile ignition noise, while compressor is convenient for a portable voice operator but easy to leave enabled.

The radio does not display a special confirmation just because the change came from F2; always watch the SPLT, NB, CMP or AGC indication. Assign F1 and F2 to different functions.

**Starting point:** ⭐ `SPLT` for DX; ✅ `AGC` for general use if accidental split worries you.

## 04 — LCD BL

`LCD BL` sets the display backlight from `10–100%`; the published default is `80%`.

Brightness affects three things:

1. readability in sunlight;
2. night vision and visual fatigue; and
3. modest station power consumption and head temperature.

Use the lowest level that remains comfortably readable. At a dark field site, `20–40%` preserves night vision and is less distracting to nearby operators. In a bright vehicle or outdoor table, `80–100%` may be necessary. The front-panel LOCK short press also cycles brightness states for quick changes; this System value is the configured level/baseline on current firmware.

A dark screen is not always a failed head. Tap POWER once in case display blanking is active, then check brightness. If the receiver still produces audio, the body is running.

**Starting point:** ✅ `60–80%` indoors; lower at night.

## 05 — AUX IN Volum

`AUX IN Volum` controls the analogue line-input level entering through the rear ACC interface. Range is `0–15`; published default `8`.

This is not microphone gain. It is the radio-side receive level for computer-generated digital audio, and from v1.79 onward `U-D`/`L-D` automatically select that ACC data path and mute the hand microphone.

Set it as part of a gain chain:

`computer playback → interface/isolation → AUX IN → modulator → ALC`

Begin at `8`, set transmit power low, compressor off and use the computer's playback level for fine adjustment. On v1.81, increase only until the signal is clean and keep digital ALC **at or below 50**. If the computer level is 1% or 100%, rebalance: extreme endpoints reduce resolution and make accidental device changes dangerous.

Never apply speaker-level output or DC to ACC audio. The line input expects a small analogue signal with the proper connector wiring.

**Starting point:** ✅ `8`, then calibrate with a dummy load/monitor.

## 06 — AUX OUT Volum

`AUX OUT Volum` controls line-level receive audio leaving the ACC connector. Range is `0–15`; published default `15`.

This feed is intended for a sound card/interface and is independent of the listening comfort you set with VOL in normal data arrangements. It drives the decoder waterfall. Too low produces a dark/empty software waterfall; too high clips the sound card and paints broad, flat-topped signals.

Start at `15`, choose the correct computer recording device, disable enhancements and automatic level controls, then adjust the computer input so WSJT-X or fldigi shows a healthy level without clipping. If the sound card input must be at its minimum, reduce AUX OUT. Record both values because operating-system updates can switch devices or restore processing.

A CAT/programming cable carries no audio. If AUX OUT changes do nothing in software, verify that a rear ACC/DE-19 audio path actually exists.

**Starting point:** ✅ `15`; reduce only to prevent sound-card overload.

## 07 — RCLK Tune

`RCLK Tune` calibrates the radio's master/reference clock over approximately `−1000…+1000 Hz`; default `0`.

This is a service adjustment, not a fine-tuning control. Changing it shifts frequency accuracy across the radio. Use RIT for one off-frequency contact and the main dial for normal tuning.

Only calibrate when all of these are true:

1. the radio has warmed to a stable temperature;
2. the reference transmission is known to be accurate, unmodulated or otherwise appropriate;
3. Doppler, propagation and receiver-filter centring are understood;
4. the original value has been written down; and
5. you can check the result on more than one frequency.

A broadcast station's announced frequency is not automatically a laboratory reference, and an SSB voice is never one. Suitable standards include disciplined test equipment or a recognised frequency standard with the correct measurement method.

If all signals appear equally high/low, first clear RIT, check mode and verify the sound-card sample rate. Calibration is the last step.

**Starting point:** ✅ `0`; ⚠️ do not adjust casually.

## 08 — Band Stack Mode

Two choices control what the top BAND keys visit:

- `HAM Band` — amateur band memories only; default.
- `Full Band` — adds general-coverage/broadcast band segments to band stepping.

This setting changes navigation, not the receiver's underlying coverage and not transmit authorisation. `Full Band` is convenient for a shortwave listener moving among broadcast bands. `HAM Band` is faster and safer for an active amateur because each press stays within the expected amateur stack.

Each band retains useful operating context in the band stack, so mode/frequency can appear to “return” when revisiting. Treat those as conveniences, not channel memories.

**Starting point:** ✅ `HAM Band`; ⭐ `Full Band` for regular SWL.

## 09 — ON/OFF Beep

This enables or disables the key-confirmation beep:

- `Enable` — default;
- `Disable` — silent controls.

The beep confirms that a small or multi-function key registered, valuable when the display is not in your direct view. It can be tiring through headphones or disruptive in a shared field tent. It is not a transmit roger beep and is not sent over the air.

If controls become completely unresponsive, beep state is not the cause; check long-press LOCK. If only the sound vanished, confirm both the beep setting and VOL output route.

**Starting point:** ✅ preference; disable for quiet shared operating.

## 10 — Version

The Version page reports both controllers:

- **APP** — display/head firmware; and
- **BASE** — main radio-body firmware.

Record both plus displayed build date/time before troubleshooting or updating. The compact numeric field may omit a suffix such as `b01`, so the date and the release bundle matter. “I have 1.80” is not always enough to identify whether BASE is the fixed `1.80b01` build.

APP and BASE should be a compatible matched release. A successful head update does not update the body, and vice versa. The rear COMM port flashes BASE; the left/head COMM port flashes APP. Swapping files or leaving one half old can produce strange controls, no startup or an apparently bricked radio.

The current guide baseline is both halves of official `v1.81`. It supersedes the June 2025 manual's v1.80 baseline. Use [Firmware](outpost:entry/logbook73.guide.g90/firmware) before changing either half.

**Starting point:** ✅ photograph this page and keep it with station records.

## Saving, backing out and resetting

Use `SAVE` when a deliberate change is complete. `EXIT` is the safe escape if you rotated the wrong value. The radio does not provide a friendly exported settings backup, so photograph assignments, AUX levels, RCLK and Version.

Factory reset is a recovery/update tool, not routine maintenance. The current manual's sequence is: radio off, hold **FUNC** while tapping POWER, then use **PRE** to confirm or **VM** to cancel. A reset can clear channel memories and personal configuration. Record them before starting.

## Recommended profiles

| Item       | General station | Digital station   | Portable/SWL           |
| ---------- | --------------- | ----------------- | ---------------------- |
| 01 arrows  | FREQCH          | FREQCH            | BAND or VOLUME by need |
| 02 F1      | PRE/ATT         | PRE/ATT           | PRE/ATT                |
| 03 F2      | AGC             | SPLT or AGC       | NB                     |
| 04 LCD     | 60–80           | 60                | 20–80 by light         |
| 05 AUX IN  | 8               | Calibrated near 8 | 8                      |
| 06 AUX OUT | 15              | Calibrated ≤15    | 15                     |
| 07 RCLK    | 0               | 0 unless measured | 0                      |
| 08 stack   | HAM             | HAM               | Full for SWL           |
| 09 beep    | Preference      | Preference        | Off in quiet group     |
| 10 Version | Record          | Record            | Record                 |

## Key takeaways

- System Menu has exactly ten current pages; SAVE retains, EXIT abandons.
- Items 01–03 only assign microphone keys. They do not create new functions.
- AUX IN and OUT belong to the data audio chain and must be calibrated with the computer.
- RCLK is a master-clock calibration, not RIT. Leave it at zero without a trustworthy reference.
- Version means both APP and BASE plus their build information.

With persistent setup settled, [Receiver and DSP](outpost:entry/logbook73.guide.g90/receiver-dsp) explains how the front end, AGC, filter and spectrum cooperate—and where they cannot help one another.
