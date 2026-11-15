# CW, keyer, decoder and messages

CW is an unusually good fit for the X6200. A narrow signal uses QRP power efficiently, the waterfall and CW zoom help find activity, the internal keyer removes the need for a separate box, and five text memories can repeat a portable call. Firmware `1.0.6` adds a receive decoder, while `1.0.7` fixes its audio crackle and completes the move away from MODEM.

## Connect a key safely

The `KEY` socket is a 3.5 mm **stereo TRS** connection for dit, dah and common. The manufacturer's manual warns:

- power the radio off before connecting or removing a key;
- a straight key with a 6.35 mm two-pole plug must be adapted/wired correctly to the three-pole socket;
- a generic two-to-three-pole adapter can connect the wrong contacts;
- incorrect wiring may leave the radio continuously transmitting;
- an unsuitable plug can damage the socket.

Before on-air use, connect to a dummy load, set minimum power and verify that released contacts produce receive and each paddle side produces the intended element. If the radio keys as soon as the plug enters, switch off and inspect wiring—do not try to cure it with KEY TYPE.

## Select CW and centre a station

Press the top `CW` control to enter the CW family. Choose normal CW or CW-R as the interference situation requires. Set a fine `CW STEP`, tune until the received note matches your selected `TONE`, and use a moderate DFL bank. `CW ZOOM` on DISPLAY can magnify 2×, 4× or 8× around the tuned frequency.

CW-R changes which side of the carrier produces the audio tone. It is useful when a nearby station falls on one side of the passband. It does not reverse dit/dah or change the other station.

## KEY page 1, item by item

Press `KEY` once.

### KEY TYPE

Tell the radio what is connected: straight key or the supported paddle/keyer mode shown by your firmware. A straight key manually creates every element; a paddle asks the electronic keyer to generate timed dits and dahs.

Wrong type symptoms include one paddle side doing nothing, both sides behaving like a straight key, or automatic elements not repeating. Wiring comes first, menu second.

### KEY SPEED

Sets electronic keyer speed, normally expressed in words per minute. Begin below the fastest speed you can reliably _copy_. Clean, relaxed 12–15 WPM is more effective than repeated corrections at 25 WPM.

Speed affects paddle-generated and stored-message CW; it does not speed up a straight key or a received station.

### IAMBIC

Iambic mode A and B differ in what extra element is produced after squeezing both paddles and releasing them. Neither is universally superior. Choose the mode in which you learned; switching casually creates unexpected trailing elements.

If you use a single-lever paddle, the iambic difference is largely irrelevant because the levers are not squeezed together.

### TONE

Sets sidetone pitch—the note you hear when keying—and provides a useful received-signal centring target. Choose a pitch comfortable for long listening, then tune received CW to the same note. This places the station appropriately in the filter rather than merely at the brightest pixel.

The modem's old `FC/TONE` field is not a replacement for KEY TONE on current firmware.

### TONE LEVEL

Controls sidetone volume. It should be clear under headphones without masking receive or causing fatigue. Excessive sidetone can leak acoustically into a microphone or recordings.

An early firmware fault could remove sound above a particular high sidetone level; release `1.0.3` addressed a no-sound case above 63. If an old unit behaves that way, check version before suspecting the speaker.

## KEY page 2, item by item

Press `KEY` again.

### QSK TIME

Sets the delay between keying and the return to receive. Short delay gives break-in operation, letting you hear between elements/words; a longer delay prevents relays/audio from chattering and feels calmer.

Start moderate. Reduce until break-in is useful without clipped elements or distracting switching. Increase if the receiver pumps between every dit or an external amplifier is not ready. Test any accessory timing into a dummy load.

### DI/DA RATIO

Sets dot-to-dash weighting. Standard Morse uses approximately one unit for a dit and three for a dah, with defined spaces. Leave the default/standard ratio unless a trained operator has a deliberate preference. Changing weighting does not correct erratic paddle technique or contact bounce.

### CW TRAINER

Provides practice without intentionally radiating RF. Before training indoors, confirm power indication remains absent, antenna/dummy-load conditions are safe, and any firmware-specific trainer state behaves as expected. Practise callsigns, common exchanges and punctuation, not only random characters.

### CW DECODER — firmware 1.0.6+

Firmware `1.0.6` adds a dedicated decoder on KEY page 2. When ON, decoded text scrolls from right to left along the bottom of the waterfall. Firmware `1.0.7` fixes crackling that could occur in received audio after enabling it.

This is why current `1.0.7` removes CW from APP → MODEM. On an older manual or firmware, MODEM may still list it. Use the control that matches the installed version rather than expecting both.

### CW DECODING THRESHOLD — firmware 1.0.6+

Select the threshold control and use the MFK outer ring to adjust from `1` to `50`. Xiegu's release note suggests roughly:

- `5–14` for a low noise level;
- `15–30` when noise is around S9.

These are starting ranges, not calibration. Too low admits noise as false characters; too high rejects weak elements. Adjust while watching one steady, centred signal.

## Make the decoder's job possible

Automatic Morse decoding is harder than it looks. The radio must infer timing through fading, noise, human variation and other callers. Improve conditions before blaming the algorithm:

1. Select CW/CW-R and tune so the received pitch matches KEY TONE.
2. Use a DFL bank wide enough to find the signal, then narrow around it.
3. Choose AGC FAST or AUTO.
4. Turn NOTCH off—the wanted signal is the tone a notch would remove.
5. Use little or no NR initially; deep NR smears element edges.
6. Set threshold for current noise.
7. Let it read several words from one station at a stable speed.

A decoder is a confirmation and learning aid. Callsigns and reports must still be copied/verified by the operator. Never log or spot a callsign solely from one garbled decoder line.

## DFL banks for CW

Set three roles:

- **SEARCH:** wide, for locating activity and recognising which station to follow;
- **QSO:** medium, centred on TONE, comfortable under ordinary conditions;
- **PILE-UP:** narrow, for a station already centred amid neighbours.

If FILTER3 seems silent, return to SEARCH and retune. A very narrow filter makes a small VFO error look like receiver failure. `CW ZOOM` changes the visual scale only; it does not widen or narrow the DFL passband.

## Break-in, split and external accessories

QSK makes rapid receive-return possible, but an external amplifier or tuner may need more switching time than the bare radio. The later Rev 05 X6200 manual's XPA125B/L4001 setup limits drive to `≤2 W`, which is more conservative than the earlier Rev 01 wording. Follow the current accessory manual and test sequencing at low power.

For a split CW pile-up, remember `SPLE = ON` means VFO A receive and B transmit. Centre the DX on A, copy/calculate the listening offset on B, verify B is legal, then enable split. Turn it off afterwards.

## MSG page 1: five text memories

Press `MSG` once. The X6200 stores five text messages used for automatic CW, RTTY and BPSK transmission where supported by current firmware.

### Editing

1. Select MSG1–MSG5.
2. Open the virtual keyboard with the displayed key.
3. Rotate either MFK ring to highlight a character.
4. Press MFK to enter it.
5. Press the keyboard control again to change among character, digit/symbol and IPv4-oriented layouts.
6. Use delete and space controls as needed.
7. Choose save-and-exit, or exit without saving.

Use all-capital plain text supported by the mode. Avoid typographic punctuation the radio may not encode.

### A practical memory set

For a portable CW activation:

- MSG1: `CQ CQ DE M6TYA M6TYA K`
- MSG2: `UR 599 599 BK`
- MSG3: `TU M6TYA QRZ`
- MSG4: a short activity reference if the exchange requires it;
- MSG5: `QRT TU` or a correction.

Replace the example callsign with your own and adapt to licence/exchange. Preview every slot before transmitting. A stale callsign or event reference is worse than manual sending.

### Sending

In the appropriate current interface, press MSG to show the stored messages and press the physical soft-key under the desired preview. The radio transmits at the selected KEY SPEED and mode parameters until complete.

Listen before sending, use low power, and know the stop/exit action. Do not turn a memory into an unattended beacon unless your licence and the radio's intended feature explicitly permit that use.

## MSG page 2: five voice memories

Press MSG again. These are separate from text memories and are covered fully in [Apps](outpost:entry/logbook73.guide.x6200/app-modem-ft8), but the controls belong here:

- `RECORD`
- `PLAY`
- `STOP`
- `EXIT`

Each slot holds up to 1 minute 30 seconds. Turn MONITOR down/off while recording, speak about 5–10 cm from the microphone and review the result. APP → VOICE CALL is the playback/transmit interface.

## A complete CW setup

1. Radio off: connect correctly wired paddle.
2. Connect dummy load or antenna; start radio.
3. Select CW, minimum power and KEY TYPE.
4. Set KEY SPEED, IAMBIC, TONE, TONE LEVEL, standard DI/DA and moderate QSK TIME.
5. Use CW TRAINER to verify element orientation and timing without RF.
6. Into a dummy load, make a short low-power keying test and check release returns to receive.
7. On air, use SEARCH DFL, tune pitch to TONE, then narrow.
8. If using the decoder, enable it only after tuning and adjust threshold.
9. Exchange callsigns/report; log in UTC.

## Common CW faults

### Radio keys continuously

Switch off. Remove key. Check TRS wiring and avoid a simple mono adapter. If released contacts measure shorted, fix cable/key before reconnecting.

### Dits and dahs reversed

Swap paddle conductors at the correctly wired plug or use an available paddle orientation setting if the build supplies one. Do not distort DI/DA ratio.

### First element clipped

Increase timing/settling allowance, test QSK, and check external amplifier sequencing. Reduce complexity until bare-radio keying is clean.

### Decoder prints nonsense

Centre tone, widen then appropriately narrow DFL, notch off, NR low, adjust threshold, choose one steady sender. Expect imperfect copy of hand-sent CW.

### No sidetone

Check TONE LEVEL, S/P mode/plug, volume and firmware. The older >63 issue was addressed in `1.0.3`.

### CW option missing in MODEM

Expected on `1.0.7`; use KEY page 2.

## Try it yourself

Use CW TRAINER for ten minutes:

1. set a comfortable 12 WPM;
2. send your callsign five times with identical spacing;
3. record it on a phone to hear timing;
4. try iambic A and B only if you understand the squeeze difference;
5. store and preview a CQ memory;
6. receive a strong station and compare your copy with the decoder after the word, not instead of listening.

## Key takeaways

- Power off before connecting the TRS key plug; wrong wiring can hold TX on.
- KEY page 1 controls type, speed, iambic behaviour, tone and tone level.
- KEY page 2 controls QSK, dot/dash ratio, trainer and—on `1.0.6+`—CW decoder/threshold.
- `1.0.7` removes CW from MODEM and fixes decoder crackle.
- Tune received pitch to TONE, then narrow DFL; a narrow filter before centring makes signals vanish.
- Decoder threshold is 1–50; Xiegu's suggested ranges are starts, not absolutes.
- MSG holds five text and five voice memories. Inspect content before sending.

For antenna matching before that first key-down, continue to [ATU and SWR Scanner](outpost:entry/logbook73.guide.x6200/atu-swr).

### References

- [X6200 public English manual](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200-USER-MANUAL-V01-PileupDX.com.pdf)
- [Manufacturer-authored Rev 05 manual mirror](https://radioddity.s3.amazonaws.com/Xiegu_X6200_Manual_20240925.pdf)
- [X6200 firmware notes](https://xiegu.eu/downloads/)
