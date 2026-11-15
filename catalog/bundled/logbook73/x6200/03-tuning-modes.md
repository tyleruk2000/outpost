# Tuning, VFOs, modes and everyday operation

Operating frequency, mode and passband form one decision. A frequency without the right mode sounds wrong; the right mode with the wrong step is awkward to tune; both with an unsuitable filter can sound silent. This chapter joins those controls into a repeatable way of moving around the X6200.

## VFO A and VFO B

A **VFO** is a complete working-frequency register. The X6200 keeps two, A and B, so one can hold a receive frequency while the other waits on another band or serves as the split transmit frequency.

- Short-press `A/B` to make the other VFO active.
- Long-press `A/B` to make A and B share the same parameters. Think “copy/equalise,” not “swap.”
- The H-22 A/B key follows the same short/long idea.
- `SPLE = ON` uses **VFO A for receive and VFO B for transmit** according to the documented stock behaviour.

Before long-pressing A/B, glance at both displays. Copying is useful when preparing a small split; it is frustrating when it overwrites a frequency saved only in the other VFO.

## VFO mode and memory mode

VFO mode lets you tune freely. Memory/channel mode recalls stored combinations of frequency, mode and associated state. Use the H-22 `V/M` control or the displayed memory workflow to change context.

In GEN → MEMORY:

1. set the desired frequency, mode and filter in VFO;
2. choose `SAVE VFO` to place it in a blank channel;
3. use `TAG` to give it a meaningful name;
4. on firmware `1.0.3+`, `MEM TO VFO` (introduced as `READ CHANNEL`) copies the chosen memory back to a tunable VFO;
5. `ERASE MEMO` deletes the selected memory.

Rev01/Rev05 screens show an older `MARK` house-indicator action before the recall control was added/replaced. Current V06 shows the five-key order `TAG · MEM TO VFO · ERASE MEMO · SAVE VFO · EXIT`; its prose phrase “MARK TO VFO” is inconsistent with that screenshot and should not be treated as a sixth menu item.

Memories are conveniences, not a logging system or backup. Keep irreplaceable nets, beacons and receive channels in your station notes too.

## Changing band

The top `←` and `→` controls move through the band register. `GEN → SETTING 2 → BANDSTACK` determines the route:

- `HAM BAND` cycles only the stored amateur-band groups. This is the safest everyday choice for an operator who transmits.
- `ALL BAND` includes wider receive groups such as WFM and airband. It is useful for listening, but reaching a receive-only group does not create transmit permission.

The documented cycle includes the 1.8, 3.5, 7, 10, 14, 18, 21, 24, 28 and 50 MHz amateur groups, WFM broadcast and aviation receive. Enabled transmit edges vary by region. The screen's coloured “allocation diagram” is a convenience based on a particular plan; always follow your national band plan and licence.

Most band registers remember more than one recent operating state. `BANDSTACK` in this menu means which _classes of band_ the arrows visit, not the common “three remembered frequencies per band” feature name used on some other radios. Observe what your firmware retains and use MEMORY for anything that must be deterministic.

## Three ways to set a frequency

### Main knob

Rotate clockwise higher, anticlockwise lower. This is the normal way to search a waterfall and fine-tune a caller.

### FST and mode step

Short-press top `FST` to change the fast digit/step. Long-press locks controls. The base step is mode-dependent and is configured under SETTING 1 as `SSB STEP`, `CW STEP`, `AM STEP` and `WFM STEP`.

A practical hierarchy is:

- CW: `10–50 Hz`-class fine movement for centring, coarser only for crossing the band;
- SSB: `100 Hz`-class fine movement for voice, larger steps for scanning channelised activity;
- AM/NFM/WFM: match the service's channel spacing instead of dragging between channels;
- direct entry: use it when you know the exact frequency.

The radio supports a minimum 1 Hz tuning resolution, but a 1 Hz step is not automatically useful for casual voice. Firmware `1.0.7` adds `2.5 kHz` and `5 kHz` choices to SSB STEP for fast channel-style movement.

### H-22 direct entry

Press `F-INP ENT`, enter the frequency on the numeric keypad, then press `F-INP ENT` to accept. Check the displayed MHz value before PTT. If the intended entry is rejected or lands in the wrong decade, cancel and follow the on-screen digit cursor rather than guessing the unit format.

The H-22 numeric keys also provide direct band selection in their default state, while its step up/down controls move by the current step. That makes it practical to hold the microphone and operate without touching the main knob.

## Spectrum span and tuning behaviour

`RF FFT SPAN` changes how much spectrum fits in the same physical width:

- `384 kHz` shows a broad survey but compresses detail;
- `192 kHz` is a good band-search view;
- `96 kHz` balances context and resolution;
- `48 kHz` helps separate close signals.

Span does not change receiver bandwidth. The passband marker from DFL decides what audio enters the demodulator; span merely changes the map scale.

`WF MOVE` controls whether the historic waterfall moves as you retune. Some operators like signals to remain fixed against absolute frequency; others like the tuned point fixed and the picture to slide. There is no RF advantage. Choose the representation that prevents you losing a signal.

Firmware `1.0.7` adds `WATERFALL SPEED = NORMAL / SLOW`. Slow preserves more history per screen and can make intermittent activity easier to see. Normal reacts faster while searching.

## SSB: USB and LSB

Single sideband carries voice efficiently by suppressing the carrier and one sideband. By long-standing convention, amateur voice is usually:

- **LSB** on 160, 80 and 40 m;
- **USB** on 20 m and higher, including 6 m.

This is a convention, not a law of nature. Data allocations, local nets and special services may differ. If a voice sounds like an unintelligible inverted growl, check USB/LSB before adjusting ten audio settings.

Start with AGC AUTO, no PRE/ATT, and a voice filter around the normal speech range. Tune until speech pitch is natural. The signal need not sit visually at the geometric centre of a broad waterfall trace; the sideband and passband marker define the correct relationship.

For transmit:

1. confirm an amateur frequency and your permitted mode;
2. choose the correct microphone through `MIC SEL`;
3. begin with low power;
4. watch power/ALC indications while speaking normally;
5. increase mic gain only if an off-air monitor or trusted report says audio is low;
6. add `COMP` only after clean uncompressed audio is established.

Compression can raise average talk power, but too much mic gain plus compression makes a harsh, wide signal rather than a stronger readable one.

## CW and CW-R

CW is a narrow keyed carrier. `CW` selects the normal injection; `CW-R` reverses the receive side, useful when an interfering signal sits on the wrong side of the wanted note. It does not reverse Morse or change what the other station sends.

Use the KEY `TONE` as the pitch target. Adjust the VFO until the received station matches that sidetone. A fine step and `CW ZOOM` at 2×, 4× or 8× make this easier. AGC FAST generally recovers between short elements better than SLOW.

Firmware `1.0.6` adds an optional decoder to KEY page 2. It is an aid, not a substitute for tuning: narrow the filter, match the tone, set a threshold appropriate to noise, and expect fading, multiple stations and unusual fists to produce errors.

## AM

AM carries a carrier and two sidebands, so it needs a wider filter than SSB. Use it for shortwave broadcast and airband receive as appropriate. Firmware `1.0.7` changes the preset AM bandwidths to `9 / 12 / 15 kHz`; select the narrowest that contains intelligible audio without excessive adjacent-channel interference.

On a crowded shortwave band, 9 kHz may be clearer; on a clean strong broadcast, 12 or 15 kHz sounds fuller. Civil airband speech is narrower and channelised; use the filter/step that the actual build presents for that receive range.

AM transmit is permitted only where your amateur band plan allows. It is less power-efficient than SSB, and the X6200's low output makes careful carrier/power management important.

## NFM and WFM are not interchangeable

**NFM** is narrow FM for communications. **WFM** is wide FM for `88–108 MHz` broadcast reception. A broadcast station in NFM sounds distorted and incomplete; a narrow communications signal in WFM sounds weak and noisy.

WFM is receive-only on this radio. Match WFM STEP to local channel spacing. Firmware `1.0.7` fixes a fault where WFM could become silent after sitting idle; a unit with that symptom should have its firmware checked before hardware troubleshooting.

## Airband reception

The `108–136 MHz` aviation range uses AM and is receive-only. Effective reception depends strongly on line of sight and an antenna suited to VHF; an HF wire may hear nearby aircraft but is not an ideal airband antenna.

Airband channels and monitoring laws differ by country. Receiving a frequency does not authorise transmitting, rebroadcasting or acting on safety traffic. Never connect a transmitting control workflow that could accidentally key the radio while exploring non-amateur ranges.

## PRE, ATT and RF gain

These three controls answer different questions:

- `PRE` adds gain near the receiver input. Use it when the band is quiet and a real weak signal needs help. If noise rises by the same amount as the signal, intelligibility did not improve.
- `ATT` reduces everything entering the receiver. It helps when a very strong station, broadcast transmitter or local RF source overloads the front end. The manual suggests considering it above roughly S9+10 dB.
- `RFG` adjusts gain through the shared VOL/SQL/RFG knob. On a noisy lower band, backing it down until the noise just falls can make listening more comfortable without using squelch.

Do not run PRE and ATT together as a permanent setting. They can partly cancel level while adding their own compromises. Begin both off and choose the one the situation needs.

## AGC

Automatic gain control reduces huge volume jumps between weak and strong signals.

- `AUTO` selects behaviour by mode and is the best general start.
- `SLOW` gives smooth voice and AM listening but can stay suppressed after a strong impulse.
- `FAST` recovers quickly for CW and rapidly changing signals, at the cost of more audible noise pumping.
- `OFF` hands more level variation to the operator and is an advanced choice.

Firmware `1.0.7` refines AGC rise time by mode. If advice based on an early unit sounds unlike yours, compare versions.

## RIT and XIT

`RIT` shifts receive frequency without moving transmit. Use it when a caller is slightly off-frequency while your transmitted carrier should stay put. Clear it to zero after the exchange; the RIT readout on the main screen is the warning.

`XIT` shifts transmit without moving receive. It is useful in specialised operating but dangerous to forget. Before any normal simplex contact, check that both RIT and XIT are zero.

Neither control replaces split. Split holds two deliberately distinct frequencies; RIT/XIT are small offsets around one setup.

## Split operation

The X6200's documented `SPLE` behaviour is unambiguous: VFO A receives and VFO B transmits.

Safe setup:

1. Set the station's listening frequency on VFO A.
2. Long-press A/B to make B a known copy if starting close by.
3. Short-press A/B to select B and tune the announced transmit offset.
4. Return to A.
5. Set `SPLE = ON`.
6. Verify the small VFO B frequency and your licence limits.
7. Make a low-power test into a dummy load or use the radio's TX indication to confirm the intended frequency.

Turn SPLE off immediately after the operation. A forgotten split is a classic reason for “nobody answers me.”

## Reading the meters

On receive, the S-meter is a relative signal-strength guide. It is useful for comparing the same signal with PRE/ATT/antenna changes, but not a precision laboratory measurement.

On transmit, watch:

- **power**, which varies with selected power, supply and load;
- **SWR**, which reports the match seen at the radio after any inserted tuner;
- ALC-related behaviour, where available, as a warning that microphone/data drive may be too high.

Firmware `1.0.7` adds optional `SHOW RX LEVEL` on DISPLAY page 3. A numerical dB-like reading is useful for repeatable comparisons; it still does not turn an uncalibrated portable installation into a standards laboratory.

## A complete first SSB contact

1. Connect a suitable antenna and confirm the chosen frequency is permitted.
2. Select the band, USB/LSB, AGC AUTO, PRE/ATT off, normal DFL voice bank.
3. Listen. Ask whether the frequency is in use.
4. If matching is needed, move to a clear frequency, reduce power, enable ATU and long-press to tune.
5. Return to the frequency; listen again.
6. Set 1–5 W initially. Speak across the selected microphone at a consistent distance.
7. Exchange callsigns, signal reports and required information; log in UTC.
8. After the QSO, clear RIT/XIT/split, return any temporary NR/NB/notch, and note battery level.

## Try it yourself

On receive only, store these four contrasting setups in VFO/memory and notice why each differs:

- 40 m LSB voice, moderate filter, 100 Hz-class tuning;
- 20 m CW, narrow filter, fine step, CW ZOOM;
- a WFM broadcast, wide filter and channel step;
- an airband AM frequency with suitable step.

Changing only the frequency between them will not work well. Mode, step, filter, AGC and display scale are part of the station state.

## Key takeaways

- A/B short swaps; A/B long copies/equalises. In `SPLE`, A receives and B transmits.
- BANDSTACK `HAM BAND` keeps arrow navigation in amateur groups; `ALL BAND` adds receive groups.
- FST, the per-mode STEP settings and H-22 direct entry solve different tuning jobs.
- Span changes the view, not receiver bandwidth; DFL changes the audio passband.
- Usually use LSB below 10 MHz and USB above for amateur voice, while following actual activity and band plan.
- WFM broadcast and AM airband are receive-only.
- PRE helps a weak signal on a quiet band; ATT/RFG help when there is too much signal.
- Clear RIT, XIT and SPLE after use.

Next, [General, Display, System and Memory Settings](outpost:entry/logbook73.guide.x6200/gen-settings) turns every deeper option into an operating decision.

### References

- [Manufacturer-authored Rev 05 manual mirror](https://radioddity.s3.amazonaws.com/Xiegu_X6200_Manual_20240925.pdf)
- [Firmware 1.0.7 changes](https://xiegu.eu/downloads/)
