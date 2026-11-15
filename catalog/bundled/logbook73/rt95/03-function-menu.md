# Function Menu: every radio-wide setting explained

These 21 items shape the whole radio rather than one saved channel. Hold `FUNC`, choose `FUNC MENU`, press `PUSH`, select an item, press `PUSH` so the value turns green, change it, then use `PUSH` or `P3` to save.

## 01 Beep — `OFF`, `1–5`

Sets the key-confirmation beep from silent to progressively louder levels. It does not change received audio volume.

- **Use:** confirms a key press without looking down.
- **Recommendation:** `1` or `2`; `OFF` in a quiet shack if preferred.
- **Trap:** high beeps through the selected speaker can be startling in a car and are not a substitute for watching the main-channel indicator.

## 02 Frequency step — nine values

Values are `2.5`, `5`, `6.25`, `10`, `12.5`, `20`, `25`, `30` and `50 kHz`. The step is how far the VFO moves for one click and also constrains offset adjustment.

- **Use:** align the VFO with the local channel raster.
- **Recommendation:** use the step specified by the band/channel plan, not the value that merely reaches one favourite frequency.
- **Trap:** step and bandwidth are different. A 12.5 kHz channel raster does not mean the transmitted signal is 12.5 kHz wide.

## 03 Display mode — `FRQ`, `CH`, `NM`

- `FRQ`: frequency plus channel information.
- `CH`: channel-number presentation.
- `NM`: channel name where one exists, otherwise frequency/channel.

Use `FRQ` while learning and diagnosing. Use `NM` once memories carry meaningful names. A fleet code plug may lock the radio to channel presentation and prevent front-panel VFO access.

## 04 Squelch — `OFF–9`

Squelch mutes receiver hiss until a signal exceeds a threshold. `OFF` holds the receiver open; higher numbers demand a stronger signal.

- **Recommendation:** begin at `2` or `3`, then lower until idle noise opens and raise one step.
- **Trap:** high squelch hides weak callers and shortens practical range. CTCSS receive decode is a second gate, not a stronger squelch.

## 05 Volume — `1–36`

Sets the audio level; a soft key can provide quicker volume control and the power key provides instant mute.

- **Recommendation:** loud enough to understand speech without distortion.
- **Trap:** if `HAND` is selected in Menu 16, turning the main speaker up will not move the sound back to the radio body.

## 06 Power-on password — `ON/OFF`

When enabled, the RT95 requires its configured numeric password after power-up. The actual password is managed in programming software.

- **Use:** discourage casual use in a shared vehicle or fleet.
- **Recommendation:** `OFF` for most personal amateur installations.
- **Trap:** enabling it before recording the configured password can lock you out. It is not encryption and does not protect transmitted audio.

## 07 Scan dwell — `TO`, `CO`, `SE`

- `TO` (**time operated**): pause for Menu 08's time, then resume even if the station is still talking.
- `CO` (**carrier operated**): remain while the signal is present, then continue after it clears.
- `SE` (**search/stop**): stop scanning on the first qualifying signal until restarted.

Use `CO` to follow conversations, `TO` to sample busy channels, and `SE` when hunting one unknown active frequency. [Scan and signalling](outpost:entry/logbook73.guide.rt95/scan-signalling) gives worked setups.

## 08 Scan pause — `5S`, `10S`, `15S`

Sets the time-operated pause used with `TO`. It is not a delay after every carrier in `CO` mode. Five seconds samples quickly; 10–15 seconds copies more of a short transmission but slows the scan.

## 09 `AOP` automatic power-on — `ON/OFF`

With `ON`, the radio starts when DC appears instead of waiting for the power key.

- **Use:** controlled base installations or go-boxes switched by a master supply.
- **Vehicle caution:** an automatically starting radio can drain a battery, surprise a driver or power-cycle during engine cranking. Prefer `OFF` unless the wiring and operating routine are designed for it.

## 10 Dual watch — `ON/OFF`

Allows the single receive path to watch the upper and lower displayed channels. Only the selected main side transmits.

- **Use:** local repeater on main, calling/event channel on sub.
- **Trap:** it is not two independent receivers. Always confirm the main side before PTT.

## 11 Backlight brightness — `1–3`

Three TFT brightness levels. Use the lowest clearly readable at night; daytime may need more. Brightness does not change the microphone keypad, which has its own `HANDY KEY` setting from `OFF` to `31`.

## 12 `TOT` time-out timer — `OFF`, `1–30 minutes`

Stops one continuous transmission after the chosen number of minutes and sounds a warning.

- **Recommendation:** `3 minutes` is a useful guard against a trapped PTT and discourages overlong overs.
- **Trap:** `OFF` removes a safety net; 30 minutes is effectively no protection for a stuck microphone.

## 13 `APO` automatic power-off — `OFF`, `30`, `60`, `120 minutes`

Turns the transceiver off after its timer expires. Use it to protect a portable/go-box battery or an accessory circuit that remains live. Leave it off where missing a safety or event call would matter. `APO` (power **off**) is different from `AOP` (power **on**).

## 14 Pilot frequency / tone burst — four tones

Selects `1000`, `1450`, `1750` or `2100 Hz`. While holding PTT, press microphone `DOWN` to send it.

- **Use:** legacy repeaters that explicitly publish a tone-burst requirement; `1750 Hz` is the familiar European example.
- **Recommendation:** set the published value and send only when required.
- **Trap:** this is an audible burst, not continuous CTCSS and not DTMF.

## 15 `DIR` display direction — `STAN`, `FAIL`

`STAN` is normal orientation; the strangely translated `FAIL` reverses the TFT by 180 degrees. Choose the one that makes the installed lettering upright. Rotation does not swap physical key order or microphone routing.

## 16 Microphone speaker — `MAIN`, `HAND`, `M&H`

- `MAIN`: radio-body speaker only.
- `HAND`: microphone speaker only.
- `M&H`: both.

The microphone speaker can put speech closer to the driver; both can help in noise but may sound slightly delayed or coloured. An external speaker may be clearer. Remember the external output is bridge-tied and must not have one conductor grounded.

## 17 `RTDF` separate RX/TX frequencies — `ON/OFF`

In VFO mode, `ON` makes the upper line the receive frequency and the lower line the transmit frequency. This is a genuine odd-split tool when a simple offset cannot describe the pair.

- **Use:** unusual cross-band or non-standard split operation that is lawful and coordinated.
- **Recommendation:** `OFF` for ordinary repeaters; use Channel 10 offset instead.
- **Important:** the manual says `RTDF` is VFO-only and hides talk-around, offset and channel-name functions while active. Check both lines before transmitting.

## 18 VOX — `ON/OFF`

Voice-operated transmit keys the radio when microphone audio crosses a threshold.

- **Use:** controlled hands-free or accessibility arrangements after careful testing.
- **Recommendation:** `OFF` in a normal vehicle. Road noise, passengers, navigation prompts and music can trigger unwanted transmissions.
- **Safety:** hands-free RF is not automatically safe driving. Prefer a properly mounted microphone/PTT and obey local road law.

## 19 `VOX-L` sensitivity — `1–9`

The scale runs backwards from what many operators expect: **`1` is most sensitive; `9` is least sensitive**.

Start around the middle. Raise the number if background noise keys the radio; lower it if speech beginnings are missed. Test into a dummy load or with a cooperating station, not on a busy repeater.

## 20 `VOX-T` release delay — `1–9`

Controls how long transmission remains keyed after speech falls quiet: `1` is shortest and `9` longest. Too short chops between words; too long holds the channel after you finish. Change one step at a time with the real microphone and noise environment.

## 21 Reset — `OPT`, `ALL`

- `OPT`: reset function options while preserving channel-menu data.
- `ALL`: reset options, channels and signalling to factory defaults.

`ALL` is destructive. Before either reset, read the radio with programming software and save a dated backup. After a full reset the manual gives factory VFOs of `145.150` and `431.150 MHz`, high power, squelch 3, volume 28 and no saved memories; defaults may vary by region or revision.
