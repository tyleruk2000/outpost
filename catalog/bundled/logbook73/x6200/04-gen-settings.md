# Every general, display and system setting

GEN is where the X6200 stops being a generic radio and becomes _your_ radio. It holds signal-path gain, microphone and data levels, equalizers, offsets, H-22 assignments, display geometry, network/system pages and memories. Most poor configurations come from changing several of these together without knowing which one fixed—or caused—the result. Photograph the relevant page, change one item, and test under the same conditions.

## Reaching and editing GEN pages

Press `GEN`; use the five physical keys under the displayed labels to choose SETTING 1, SETTING 2, DISPLAY, SYSTEM or MEMORY. On list pages:

- MFK outer ring moves between rows;
- MFK inner ring changes the selected value;
- MFK press selects/enters where required;
- NEXT/PREV changes long pages;
- the displayed action can restore the selected default, nudge a value, save it as a main-screen shortcut, or exit.

The main tuning knob is used for some numeric editors such as time. Follow the focus outline rather than assuming one knob always has one job.

## SETTING 1 page 1: receiver gain

### PRE — the preamplifier

PRE raises a weak RF input before later processing. It is valuable on 10 m or 6 m when atmospheric noise is low and the radio's own noise is noticeable. It is often unnecessary on 80 or 40 m, where the antenna already delivers far more natural/man-made noise than the receiver needs.

Use this test: with a weak station present, toggle PRE. If both station and noise rise equally and readability does not improve, leave it off. If the station emerges with little added noise, keep it on for that band. PRE is not an “extra sensitivity always” switch.

### ATT — the attenuator

ATT deliberately reduces input. That sounds wrong until a strong signal overloads the direct-sampling receiver and creates mixing products, ghost stations or harsh audio. The manual suggests turning it on when received strength is above about S9+10 dB; local conditions matter more than a single meter mark.

Try ATT when:

- a nearby broadcast transmitter appears in several places;
- the waterfall fills with symmetrical false signals;
- a strong station makes the rest of a band disappear;
- reducing RFG dramatically improves clarity.

If attenuation removes both interference and the wanted weak signal, an external band-specific reject filter may be the better solution.

### AGC — OFF, SLOW, FAST, AUTO

AGC controls how the receiver backs away from strong audio and recovers afterwards.

- `AUTO`: firmware chooses by mode; use this until a specific problem appears.
- `SLOW`: stable, comfortable SSB/AM speech; can remain depressed after a loud impulse.
- `FAST`: quick recovery for CW and rapidly keyed signals; background noise “breathes” more.
- `OFF`: wide level changes and more manual gain management; specialist use.

Firmware `1.0.7` refines AGC rise time by mode, so early reviews do not exactly predict current sound.

## SETTING 1 page 1: transmit and audio levels

### TX POWER

Power changes in `0.5 W` steps. Maximum is specified as about `8 W ±1 dB` on `13.8 V` and `5 W ±1 dB` from the battery. Start at the lowest level likely to complete the contact. For FT8 and other sustained data, Xiegu explicitly recommends `≤5 W`, longer gaps and better ventilation.

Power is not an audio-drive control. If selected power is not reached, investigate supply voltage/current, SWR, battery state, mode and audio drive rather than turning every gain to maximum.

### MIC SEL

`AUTO` selects the H-22 when inserted and the body microphone when it is absent. `BUILT-IN` and `HANDLE` force one path. AUTO is the everyday setting; forced selection is useful when comparing or diagnosing capsules.

### BUILT-IN MIC GAIN and HANDLE MIC GAIN

Each microphone has its own gain because distance and sensitivity differ. Set them independently:

1. Turn COMP off.
2. Use a dummy load and local monitor/second receiver, or ask a trusted station.
3. Speak at the real operating distance and volume.
4. Raise gain only until audio is clean and reaches normal modulation.
5. Back off if peaks flatten, splatter appears or speech becomes harsh.

The H-22 manual suggests about 5–10 cm for recordings; normal live voice should also use consistent distance. High gain cannot repair speaking away from the microphone in wind.

### LINE IN GAIN

This is the computer/data audio entering the transmit chain. It interacts with the operating system and application output sliders. Choose one end as the main adjustment and keep the other in a stable middle range.

A clean setup shows expected RF output without excessive ALC/compression. Too low gives weak output; too high gives distortion, splatter and decoder complaints. For FT8, turn speech processing off and reduce drive until the signal is clean, then increase only enough for the required few watts.

### LINE OUT GAIN

This sets receive audio presented to the computer. A decoder needs adequate level without clipping. Use the application's input meter: noise should register comfortably, strong signals should stay below the red/maximum region, and the computer must be listening to the X6200 input device rather than its built-in microphone.

Line out does not need to make the speaker loud. Keep computer and listening paths conceptually separate.

### MONITOR LEVEL

Monitor plays transmitted/recorded voice locally. Keep it low. During a voice recording, turn it off or down to prevent speaker-to-microphone feedback and echo. Headphones help but do not justify extreme level.

### COMP

The speech compressor reduces the difference between soft and loud syllables, raising average talk power. Establish clean mic gain first; then compare COMP off/on through an off-air receiver. If “on” is merely louder but less intelligible, back off the gain or disable it. Never use COMP for FT8 or other constant-envelope audio data.

## SETTING 1 page 1: per-mode steps

`SSB STEP`, `CW STEP`, `AM STEP` and `WFM STEP` let one tuning knob behave sensibly in four unlike services.

- SSB needs fine adjustment for natural voice. Firmware `1.0.7` also supplies `2.5 kHz` and `5 kHz` jumps for quick movement.
- CW needs the finest useful step so the received pitch can match `TONE`.
- AM needs spacing appropriate to shortwave or airband channels.
- WFM needs local broadcast spacing.

Changing a step never changes occupied bandwidth or legal channelisation. It only determines where the next knob detent lands.

## SETTING 1 page 2: equalizers

Equalization changes tonal balance, not RF filter width. DFL decides which audio-frequency range exists; EQ boosts/cuts parts within it.

### EQ RX

The documented centres are `300`, `700`, `1200`, `1800` and `2300 Hz`, with `EQ-RX` as the master switch.

A sensible voice curve starts flat. If speech is muddy, make a small reduction at 300 Hz rather than narrowing DFL until voices sound thin. If consonants lack definition, add a small amount near 1800–2300 Hz. Large boosts also raise noise and can clip the audio path.

### EQ WFM

WFM uses `50`, `300`, `1500`, `5000` and `12000 Hz` centres plus `EQ-RX(WFM)`. This broader range suits music and broadcast audio. The tiny internal speaker cannot reproduce deep bass; boosting 50 Hz wastes headroom. Set WFM EQ with the headphones/speaker you actually use.

### EQ MIC

EQ-MIC shapes transmitted voice at `300`, `700`, `1200`, `1800` and `2300 Hz` in the current manufacturer V06 manual. The Rev 05 English table repeats `300 Hz` across that row, a documentation error now resolved by V06. The installed screen remains the authority if another release channel changes the labels.

Start `EQ-MIC = OFF`. After mic gain is clean:

- reduce low/mid boom gently if the voice is muddy;
- add a little upper-mid presence for clarity if needed;
- avoid large treble boosts that exaggerate hiss and sibilance;
- check through another receiver, not the local monitor alone.

An EQ setting copied from another voice, microphone or language is not a calibration.

## SETTING 2: offsets and split

### RIT

RIT shifts receive only. It lets you tune a slightly off-frequency station while leaving your transmitted frequency unchanged. Set it back to zero after the QSO; a persistent RIT indicator is a useful warning.

### XIT

XIT shifts transmit only. It is less common and easier to forget. Zero it before normal simplex work and verify the transmit frequency within your licence segment.

### SPLE

With `SPLE = ON`, VFO A receives and VFO B transmits. Prepare both registers and verify B before PTT. After the split operation, turn it off. Do not use split as an improvised way to correct a small frequency error; RIT/XIT exist for that.

## SETTING 2: H-22 assignments

`HANDLE F1`, `HANDLE F2` and `HANDLE F3` assign the three microphone keys. Documented defaults are:

- F1: PRE;
- F2: NR;
- F3: filter selection.

These are strong choices because they solve receive problems while the operator is holding the microphone. Assign only functions you understand without a label. A quick transmit or latch function under a thumb is risky.

Current manufacturer V06 says the H-22 HOME key acts as **CE (clear entry)** during keypad frequency entry. Earlier English Rev01/Rev05 manuals instead say HOME recalls a configured frequency; Rev05 points to General Setting 2, but the same manual's full SETTING 2 table contains no HOME assignment. MEMORY `MARK` is described only as a house indicator in those manuals, while V06 calls it `MARK TO VFO`. Treat this as a documentation/firmware boundary: use the label and behaviour on your build, and do not promise that MARK programs HOME.

## SETTING 2: operating behaviour

### PTT MODE

`NORMAL` transmits while PTT is held and returns to receive when released. Use it almost always.

`TOGGLE` transmits after one press and continues until the next. It can help an accessibility need, but a dropped microphone or forgotten state leaves the transmitter active. The red logo and TX meter are your warning. Do not use TOGGLE casually in a bag or around children.

### BANDSTACK

`HAM BAND` makes band arrows visit amateur groups only; `ALL BAND` includes broad receive groups. This changes navigation, not the transmit-authorisation circuitry and certainly not your licence.

### S/P MODE

`EAR PHONE` and `SPEAKER` set the output level expected at the 3.5 mm stereo socket. Select before connecting/listening. Speaker mode can be dangerously loud in headphones. Always use TRS; a mono plug can short/silence the output.

### CHARGER

ON permits charging a fitted battery from a suitable source; OFF prevents it. Turn it off when running from external power with no need to charge or where heat/noise matters. Use a regulated `12–15 V DC` communications supply rated at least `3.5 A` for normal operation. The Xiegu EU English material gives that range; manufacturer V06 gives `9–15 V` and says a fitted battery takes over below `11 V`. Never exceed `15 V`. The supplied adapter is for charging the powered-off radio only; never transmit while using it.

### BUILT-IN

This selects the internal Wi-Fi/Bluetooth adapter. Leave ON for normal internal wireless use. Set OFF only when an approved external wireless adapter is in use; the manual warns not to operate both paths together.

## DISPLAY page 1: making the band readable

### RF FFT AVERAGE

Higher averaging steadies the trace but hides very brief peaks. Use enough to stop visual flicker, then reduce it for fast CW or bursty signals. It affects the drawing, not receiver audio.

### RF FFT REF LEVEL

This places the RF spectrum relative to the screen. Adjust until the noise floor is visible above the bottom with peaks having room above. It is not RF gain; moving the line does not change what the receiver can hear.

### RF FFT SPAN

Choose `384`, `192`, `96` or `48 kHz`. Broad span searches; narrow span inspects. It does not alter DFL bandwidth.

### RF FFT PEAK HOLD

When ON, a temporary trace shows recent maxima. It helps find an intermittent carrier but can make a busy band look permanently occupied. Turn off for an uncluttered live display.

### CW ZOOM

`2× / 4× / 8×` zoom around the CW frequency. More zoom makes centring easier but removes surrounding context. OFF returns normal scale.

### AUDIO FFT AVERAGE and AUDIO FFT REF LEVEL

These shape the separate audio-spectrum view when AUDIO SCOPE is enabled. They do not change sound. Use them for seeing hum, a CW tone or transmitted/received audio distribution.

### WF MOVE, WATERFALL REF LEVEL and COLOR MAP

WF MOVE decides whether history shifts as the VFO moves. WATERFALL REF LEVEL sets visibility; the manual describes a ±20 dBm adjustment. Raise/lower until weak signals appear as contrast against noise, not a uniform bright sheet. COLOR MAP is preference, but high contrast matters in sunlight and colour-vision differences.

### AUDIO SCOPE

ON shows audio spectrum/waveform at the right, reducing RF display width. Use it for diagnosis; leave OFF for the largest band view.

### SCOPE Y GRID STYLE

Choose grid lines on spectrum alone (`SCOPE`) or across spectrum and waterfall (`SCOPE+WF`). A dense grid helps measurement but can hide faint traces.

### SCOPE/WF HEIGHT RATIO

Give more height to spectrum for instantaneous amplitude or waterfall for time history. Portable search generally benefits from more waterfall.

### SCOPE LINE WIDTH, CENTER LINE and PARAMETER TEXT COLOR

Line width trades precision for visibility. CENTER LINE toggles the red tuned-centre marker. Text colour should provide strong contrast in the quick menu; avoid combinations that look attractive indoors but vanish in sunlight.

### BACKLIGHT, SCREEN SAVER, DIM and OFF

Backlight is `1–10`. The screen saver master enables DIM/OFF timers. Lower light saves battery and preserves night vision. Choose a dim time longer than a typical pause in conversation; a very short off time is irritating during a net. The radio remains active when the backlight turns off—do not mistake darkness for shutdown.

## DISPLAY page 2: RGBA colour editor

Red, green, blue and alpha values independently define:

- SCOPE LINE;
- SCOPE FILL;
- BW MARKER.

Alpha is transparency. Keep enough opacity to see filter edges and trace. Firmware `1.0.7` fixes a severe older fault where spectrum-line alpha below 255 could freeze the spectrum or screen. On an older build, avoid experimenting with low alpha until firmware is addressed.

Use a repeatable approach: write current RGBA values, change one channel in steps, view on a noisy and quiet band, then save. DEFAULT is better than random colour recovery.

## DISPLAY page 3: firmware 1.0.7

### SHOW RX LEVEL

Displays a numerical receive level in the upper-left spectrum area. Default is OFF. Enable it for antenna comparisons or repeatable tests; disable it for a cleaner view.

### WATERFALL SPEED

NORMAL is default. SLOW holds more time on screen and smooths rapid visual change. Neither changes receiver timing.

### 3D BANDSCOPE

Creates a perspective-style history display. Firmware 1.0.7 only shows it when **DISPLAY 1/3 → AUDIO SCOPE is OFF**; if the 3D view appears not to work, switch AUDIO SCOPE off before considering any reset. It can reveal signal evolution but uses more visual depth than a flat waterfall. Use whichever makes activity easiest to interpret.

## SYSTEM

### TIME SETTING

Set date/time and time server. Amateur logs use UTC; set the display to UTC where practical. The manual warns about mixing a local time value with a timezone adjustment. Confirm against a trusted clock before FT8, whose 15-second sequence is highly time-sensitive.

### SYSTEM INFO

This is the first troubleshooting page. Record all firmware/baseband information and, on `1.0.6+`, network information. Photograph it before any reset or update.

### FIRMWARE UPGRADE

This menu handles the baseband selection stage. A complete X6200 update may also require writing the supplied system image to microSD and booting it with the battery removed. Never treat this menu alone as the whole procedure; use the matching release archive and [official upgrade tutorial](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200FirmwareUpgradeTutorialWS-JSZL-2407-01ENRevised.pdf).

### WLAN/WIFI

The page provides adapter on/off/edit, SCAN, a network list, password, IP address, gateway, DNS, network prefix, CONNECT/DISCONNECT, NEXT and EXIT. Some networks require a manually assigned address in the same subnet. Do not rotate away while an unfinished text field is active; older firmware can discard the partial value.

### BLUETOOTH

Turn the adapter on, scan, select and connect. Supported keyboards/mice can enter text; firmware `1.0.6` adds full FT8CN support. Bluetooth is a transport, not proof that every phone/audio profile is supported.

### WFSERVER

Configure the displayed service fields and press START. Wait for the blue `WF` icon. WFSERVER needs a functioning network and compatible client; joining Wi-Fi alone does not start it. Use it only on a trusted network and stop it when remote access is not needed.

### LANGUAGE

Select English or Simplified Chinese. If the wrong language is selected, GEN → SYSTEM is still the same structural path; use the manual's screen order to recover.

### FACTORY RESET

This clears personalised settings, requires two confirmations, then restarts. Before reset, record mic/line gains, EQ curves, H-22 keys, memories, network settings, filter banks and display colours. A reset is appropriate after a release explicitly requires it or when configuration corruption is likely—not as the first response to weak propagation.

## MEMORY

Current V06 shows five actions: TAG, MEM TO VFO, ERASE MEMO, SAVE VFO and EXIT. SAVE VFO captures a working state; TAG names it; MEM TO VFO recalls it; ERASE MEMO clears it. Firmware `1.0.3` introduced that recall action as READ CHANNEL/MEM TO VFO. Rev01/Rev05 instead show an older MARK house-indicator action in the slot. V06 prose accidentally says “MARK TO VFO,” but its screenshot reads MEM TO VFO; it is not a sixth item, and no manual documents old MARK as programming the H-22 HOME key.

Use tags that make sense on a small screen: `40M NET`, `WWV10`, `AIR TWR`. A memory frequency can become out of date; verify nets and legal allocations periodically.

## A configuration record worth keeping

Write these in a note or photograph them:

| Group            | Values to preserve                                                |
| ---------------- | ----------------------------------------------------------------- |
| identity/version | SYSTEM INFO screen, region, update archive used                   |
| transmit audio   | built-in/handle mic gain, EQ MIC, COMP                            |
| digital audio    | LINE IN/OUT gain, computer device/levels                          |
| controls         | H-22 F1/F2/F3, PTT mode, BANDSTACK                                |
| display          | reference levels, span, colour RGBA, page-3 options               |
| wireless         | SSID and IP plan (store passwords securely, not in a public note) |
| operating        | DFL banks by mode, CW tone/speed/ratio                            |

This turns a factory reset from a crisis into a twenty-minute rebuild.

## Key takeaways

- PRE, ATT, RFG and AGC solve different gain problems. Begin PRE/ATT off and AGC AUTO.
- Set microphone, line input and line output independently using real meters/listening; never maximise them together.
- EQ comes after clean gain and sensible DFL bandwidth.
- NORMAL PTT, HAM BAND, correct S/P level and intentional CHARGER state are safe defaults.
- Display reference/colour controls change the picture, not RF sensitivity.
- DISPLAY page 3 belongs to firmware `1.0.7`; older builds will not show it.
- SYSTEM INFO precedes troubleshooting; FACTORY RESET follows a configuration backup.
- FIRMWARE UPGRADE is one part of a model-specific two-stage process.

For applications that sit on top of these settings, continue to [MODEM, FT8, SWR and Voice Apps](outpost:entry/logbook73.guide.x6200/app-modem-ft8).

### References

- [Manufacturer-authored Rev 05 manual mirror](https://radioddity.s3.amazonaws.com/Xiegu_X6200_Manual_20240925.pdf)
- [Current manufacturer manual downloads (including V06)](https://www.cqxiegu.com/zlxz)
- [X6200 1.0.6 and 1.0.7 notes](https://xiegu.eu/downloads/)
