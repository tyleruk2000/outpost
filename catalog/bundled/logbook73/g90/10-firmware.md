# Firmware, versions, update and recovery

The G90 is two computers connected together. The removable display head runs **APP** firmware; the radio body runs **BASE** firmware. Updating only one half, sending the wrong file to a port or following an old bootloader sequence is how a healthy radio becomes an alarming blank screen. The good news is that Xiegu provides a recovery loader in each half, and an interrupted transfer is normally recoverable by repeating the correct procedure.

Do not update simply because an unfamiliar control behaved differently from a forum post. First read System Menu `10 Version`, identify both builds and compare the official release notes. Update when the release fixes a problem you have, is required for compatibility or contains an important radio correction—not as a ritual before a weekend activation.

## Decide before you update

Ask four questions:

1. **What exact problem or feature is the update for?** “Newer” is not a diagnosis.
2. **Does it support my controller generation and accessories?** Later MCUs require v1.77 or newer; GSOC stops at v1.78.
3. **Do I have the complete official matched APP/BASE bundle and its instructions?** A lone `.xgf` is not enough.
4. **Can I test and recover now?** You need stable power, correct cables/drivers, a computer, dummy load and time after reset.

If any answer is no, keep the known-working radio and prepare. Firmware is not a repair for poor audio cabling, high SWR, RF feedback or a loose head lead. Prove those externally first.

## The current baseline

This guide treats official matched `APP v1.81` and `BASE v1.81`, released 25 August 2025, as current stock behaviour. Xiegu's [v1.81 download page](https://xiegu.eu/sdm_downloads/xiegu-g90-firmware-v1-81-25-08-25/) lists:

- display/head fix for a black box covering the TX ERROR message;
- display/head fix for automatic tuning becoming stuck in SPLT;
- body fix for silent NFM reception; and
- body change to ALC: `0–100`, higher means greater MIC/LINE input, and digital operation must remain `≤50` for linearity.

The [June 2025 Operation Manual v5](https://radioddity.s3.amazonaws.com/Radioddity_G90_User_Manual_V5_June_2025.pdf) describes APP v1.80 and BASE v1.80b01, so it is one release behind. It remains the main control manual; v1.81 notes override it where changed.

## Why old instructions look different

G90 firmware did more than fix bugs. Several releases changed the operating model:

| Release       | Material change for an operator                                                             |
| ------------- | ------------------------------------------------------------------------------------------- |
| v1.71         | RF Gain, DSP filter centre/width, reset, RCLK, band-stack, beep and FFT averaging developed |
| v1.72         | ALC display, RIT and 100 kHz tuning step                                                    |
| v1.73         | encoder/AGC-off behaviour and MIC Gain refinements                                          |
| v1.74         | automatic FFT scale, RF Gain/filter changes                                                 |
| v1.75         | new System/MFK/filter workflow, RF Gain MFK assignment, NFM test and squelch                |
| v1.76         | tuner search power reduced to about 5 W                                                     |
| v1.77         | AGC work and support for revised GD/ST microcontrollers                                     |
| v1.78         | receive, ALC, tuner/keyer and CI-V ATU work; last GSOC-supported line                       |
| v1.79b02      | U-D/L-D, automatic ACC routing, two-BPF filter model, fixed AUTO FFT scale                  |
| v1.79b03      | AM/NFM filter correction and waterfall work                                                 |
| APP v1.80     | CI-V `0x25/0x26` and radio-identification support                                           |
| BASE v1.80b01 | occasional FFT-freeze fix and AGC improvement                                               |
| v1.81         | NFM, SPLT-tuner, TX ERROR display and new ALC semantics                                     |

The official [v1.79b03 cheat sheet](https://xiegu.eu/wp-content/uploads/sites/4/2024/08/XIEGU-G90-Cheat-Sheet-V1.79b03-102622.pdf) includes the most useful release-history thread. It is historical evidence, not the authority for v1.81 ALC.

Three dividing lines matter:

- **Before v1.75:** many button and MFK sequences differ.
- **Before v1.79:** no U-D/L-D automatic data path and the filter is described as F-L/F-H rather than two overlapping BPF windows.
- **Before v1.81:** ALC target advice cannot be transferred numerically to v1.81.

## Hardware-generation firmware constraint

Xiegu's release history says radios after serial `X04G211600001` use revised microcontrollers and require firmware `v1.77` or newer. Do not downgrade a later body/head below the generation it supports. The 2024 case/Powerpole revision is visually obvious, but serial/controller generation—not the connector alone—governs bootloader compatibility.

The discontinued GSOC controller is supported only through the v1.78 firmware line. Current v1.81 features and GSOC support should not be promised together. If a station relies on GSOC, research that legacy configuration separately before changing anything.

## Before downloading

Use [Xiegu's authorised downloads index](https://xiegu.eu/downloads/) or a Xiegu-authorised distributor. Xiegu explicitly warns against firmware from unknown sources. A checksum, if published, checks download integrity; it does not make an unofficial modification safe.

For each bundle:

1. Read its release notes and included instructions completely.
2. Confirm it contains separate files for display/head and main/body.
3. Record the exact filenames and which unit each belongs to.
4. Check whether the bundle requires a particular order or factory reset.
5. Do not rename files so APP and BASE become indistinguishable.

Keep a local copy of the currently working official bundle so recovery does not depend on internet access.

## Prepare the station

Firmware transfer is not an operating session. Remove variables:

- use a stable `13.8 V` supply with secure connectors;
- close CAT/logging/digital applications;
- disconnect antennas/amplifiers and anything able to key PTT;
- connect only the intended firmware cable/port;
- record/photograph all 64 memories, callsign, System Menu, AUX and RCLK settings;
- note current APP, BASE and build dates; and
- install the correct FTDI/Prolific/CH342 driver before entering a loader.

The official tutorial warns that channel records are cleared. Assume every personal setting may be lost.

Use a laptop with adequate battery or mains backed by an uninterruptible supply if local power is unreliable. Do not perform updates in a vehicle with an engine about to start, on a field battery near empty, or during a storm.

## APP versus BASE ports

This mapping is non-negotiable:

| Target            | Physical port        | File                                     |
| ----------------- | -------------------- | ---------------------------------------- |
| APP, display/head | Left-side/head COMM  | APP/display/head `.xgf` from same bundle |
| BASE, main/body   | Rear radio-body COMM | BASE/main/body `.xgf` from same bundle   |

The everyday CAT cable also uses head COMM, but CAT programs must be closed. Rear COMM is not the normal CAT port.

Place a paper label on each file/lead if necessary. Sending APP to BASE or BASE to APP is more consequential than choosing a wrong menu value.

## Transfer program settings

Xiegu's [official firmware-upgrade tutorial](https://xiegu.eu/sdm_downloads/g90-firmware-upgrade-tutorial/) uses Tera Term and XMODEM. Follow the tutorial shipped with the exact bundle if it differs. The important choices are:

- select the correct serial COM device;
- open the firmware loader prompt for the intended controller;
- choose `File → Transfer → XMODEM → Send`;
- select the matching `.xgf` file; and
- **tick/choose `1K` mode**.

Do not choose XMODEM Receive. Older tutorials warn that doing so can alter/corrupt the source firmware file. Keep a pristine copy anyway.

Normal CAT uses 19200 8N1, but loader terminal settings are defined by the upgrade tutorial. Do not assume normal CAT settings replace its directions.

## Entering each bootloader

Bootloader entry differs by display hardware generation. The official tutorial documents:

- **X04-series head:** apply/start power and press the keyboard space bar during the countdown.
- **V7-series head:** hold the volume knob while tapping POWER to enter the APP loader.
- **BASE/body:** use the rear connection, tap power and press space at the loader countdown as instructed.

The screen/prompt in front of you and the included tutorial take priority over a memorised YouTube sequence. If no prompt appears, stop and verify port, driver, cable, head generation and power rather than spraying keystrokes.

## Transfer and power-cycle discipline

For each controller:

1. Confirm target, port and filename aloud or on paper.
2. Enter its loader.
3. Start XMODEM Send in `1K` mode.
4. Do not touch cables, power or computer sleep controls during transfer.
5. Wait for the completion indication and loader instructions.
6. Close the terminal as directed.
7. Disconnect data and DC according to the tutorial; do not casually use the front POWER key as a shortcut if the instructions say remove power.
8. Move to the other controller and repeat with its matching file.

Update both halves from the same release bundle. “The head update finished” is only halfway.

## Factory reset and verification

The current manual recommends a factory reset before and after upgrade. Follow the exact bundle instructions; at minimum plan to reset after both halves are complete. With radio off, the documented reset entry is hold **FUNC** while tapping POWER, then **PRE** confirms and **VM** cancels.

After reset:

1. Enter System Menu 10.
2. Verify both APP and BASE versions/build dates match the intended release.
3. Test receive into a known antenna at normal front-end settings.
4. Test controls without transmission.
5. Test 1 W into a dummy load: PTT, mode, power, SWR and audio.
6. Test ATU on a suitable load.
7. Test CAT only after a normal boot.
8. Re-enter memories and AUX/RCLK values deliberately, not by guessing.

Do not restore an old ALC target after v1.81. Recalibrate digital audio and keep ALC at or below 50.

## Recovery after interruption

An incomplete firmware image normally leaves the loader available. Treat the radio as recoverable until the official sequence proves otherwise:

1. Disconnect CAT and every accessory.
2. Remove DC for a controlled interval, then reconnect the stable supply.
3. Confirm which half failed and whether the other still reports normally.
4. Re-enter the correct controller's loader using its hardware sequence.
5. Resend the correct official file with XMODEM 1K.
6. Complete the matching half, reset and verify.

Do not alternate random APP/BASE files, serial speeds or unofficial “unbrick” utilities. Keep notes of the exact point of failure and terminal messages. If the loader cannot be reached after correct cable/driver/power checks, contact the authorised seller/Xiegu support with serial, hardware generation, old/new versions and a photograph of the prompt.

## Common update failures

| Symptom                                 | Likely cause                           | Correct response                                 |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| No serial port                          | Driver/cable/USB issue                 | Identify chipset, replace data cable/port        |
| Gibberish terminal                      | Wrong loader serial settings           | Use exact tutorial settings                      |
| Transfer starts then stalls             | No 1K, bad cable, PC sleep/noisy USB   | Cancel safely per tutorial; stabilise and repeat |
| Blank head after one update             | APP/BASE mismatch or wrong file        | Loader recovery with matched official pair       |
| Radio enters loader at ordinary boot    | CAT polling during startup             | Disconnect CAT/close program; cold boot          |
| Controls differ after successful update | Reset omitted or old settings retained | Factory reset, then reconfigure                  |
| BASE says 1.80 but uncertain build      | Numeric suffix hidden                  | Compare build date/time with release             |
| NFM silent                              | Pre-v1.81 BASE or mode/filter issue    | Verify BASE, update/restore filter               |
| ATU hangs in split                      | Pre-v1.81 APP behaviour                | Disable SPLT; install matched v1.81              |
| FT8 advice no longer gives expected ALC | v1.81 changed scale semantics          | Recalibrate; DIGI ≤50                            |

## Should you downgrade?

Downgrade only for a documented compatibility requirement, with hardware-generation support and a complete matched bundle. Later-controller units must not go below v1.77. GSOC's v1.78 ceiling is a legacy exception, not a recommendation. A downgrade also reintroduces fixed bugs and old control behaviour, so this guide will no longer mechanically match.

## Key takeaways

- APP=head, BASE=body. Each has its own file, port and loader; update them as a matched official pair.
- Current baseline is v1.81; the June 2025 manual's v1.80 descriptions are one release behind.
- Back up memories/settings, use stable power, XMODEM Send with 1K and the hardware-specific loader sequence.
- Factory-reset as the official bundle directs, then verify both versions and recalibrate digital audio.
- Many apparent bricks are recoverable loader states or CAT polling during startup.
- v1.81 ALC semantics supersede every older numeric target: digital must remain `≤50`.

With the radio current and known, [Practical configurations](outpost:entry/logbook73.guide.g90/configs) supplies repeatable setups for voice, CW, FT8, portable use, home and shortwave listening.
