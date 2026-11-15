# Troubleshooting

Troubleshoot the G90 from the outside inward. Power, cables, mode and a forgotten button state are more common than failed electronics. Change one thing at a time, test at low power into a dummy load, and write down APP/BASE versions before assuming firmware.

## The five-minute reset checklist

Without factory-resetting anything:

1. Disconnect CAT, DE-19, amplifier, key and every accessory except microphone and known-good antenna/dummy load.
2. Shut down properly, remove DC briefly, reconnect stable `13.8 V` and boot without PC serial polling.
3. Select VFO A, SPLT off, RIT zero and memory mode off.
4. Select a known band/mode; front end normal; AGC-A; RF Gain 50%; NB/CMP/VOX off.
5. Reset BPF1 with FUNC+CMP and BPF2 with FUNC+NB.
6. Bypass tuner into a dummy load.
7. Set one watt and test receive, then a brief licensed/dummy-load transmit.

If normal operation returns, reconnect one item and restore one setting at a time. This identifies the cause without erasing memories.

## Radio appears completely dead

### Check the CAT boot trap

Close CAT/logging programs and unplug the serial lead. Serial polling during startup can be interpreted as loader input. Remove/reapply DC and boot normally. Many “bricks” end here.

### Check the supply under load

Measure at the radio connector, not only at the battery. Confirm correct polarity, fuse continuity and `10.5–16.5 V`. A high-resistance fuse holder or thin lead can show 13 V with the radio off and collapse at startup/transmit. Substitute a known-good regulated supply and explicit lead.

### Check display blanking

If audio exists, tap POWER once: a previous short press may have blanked the display. Cycle brightness with LOCK and inspect the head cable/connector with power removed.

### After firmware work

Identify which half responds. Re-enter the correct APP or BASE bootloader and resend the matching official v1.81 file using XMODEM Send/1K. Do not flash random files. See [Firmware](outpost:entry/logbook73.guide.g90/firmware).

## Receiver has no audio

Work through:

1. Rotate VOL; short-press VOL to toggle internal/external output.
2. Remove headphones/external lead. Use stereo TRS, not mono.
3. On later hardware, inspect the hidden speaker/headphone impedance selector behind the detached head with power off.
4. Ensure squelch is open.
5. Choose AM on a known broadcast or correct SSB on a known amateur signal.
6. Reset both BPF windows; non-overlap can produce silence.
7. Set RF Gain 50%, AGC-A, ATT/PRE normal.
8. If only NFM is silent, verify BASE v1.81—the release fixes NFM receive silence.
9. Substitute headphones or a known external audio route suitable for the hardware.

If the spectrum shows signals but there is no audio, output/filter/mode is more likely than antenna. If spectrum and S-meter are empty too, test antenna/coax and front end.

## Reception is weak

- Confirm antenna switch/coax and correct band.
- Check ATT is not displayed and RF Gain is not near 1%.
- On a quiet upper band, compare PRE off/on by signal-to-noise ratio.
- Widen an accidentally narrow filter.
- Clear RIT and use correct mode.
- Compare with a known signal or signal generator; do not judge a naturally closed band as receiver failure.

An S0 band at midday on 80 m can be propagation; an S9 noise floor on 20 m can be local noise. Diagnose with time, frequency and a second receiver.

## Receiver has ghosts, broad signals or broadcast audio everywhere

This is usually overload:

1. Turn PRE off.
2. Lower RF Gain.
3. Select ATT.
4. Disconnect the antenna briefly; a ghost that collapses confirms external overload/noise.
5. Add a suitable medium-wave/high-pass or band-pass filter for the interfering source.
6. Improve antenna selectivity/location and common-mode control.

Narrowing DSP after overload does not remove products generated before the ADC. The fact that a false signal moves strangely when tuning is another clue.

## The S-meter disappeared

AGC is probably off. Select AGC-A/F/S. Normal meter action depends on AGC. This is expected behaviour, not display damage.

## Waterfall freezes or lags

High AVE deliberately lags; reduce it. If the FFT genuinely stops while audio/tuning continue, verify BASE is at least `v1.80b01`, which fixed an occasional FFT freeze. Reset after a matched update. If the entire head freezes, inspect APP/BASE compatibility, DC stability and head cable.

## Controls do not respond

Long-press the front-panel LOCK to unlock. Cancel a latched FUNC layer. Exit any BPF/RIT/System adjustment by pressing the main dial or the visible SAVE/EXIT action. If a microphone key fails, check System items 01–03 assignments. `FIL` and `XFC` have no useful current stock action. The v5 manual identifies the microphone LOCK as a lock control, so check for an on-screen state change; if it does not respond, use the front-panel control and include the APP/BASE versions in a support report rather than assuming inactivity is intended.

Encoder movement in the wrong decade means the tuning step is selected differently; short-press the main dial. If direction/selection changed after FUNC, cancel FUNC and retest.

## Radio will receive but not transmit

Check in this order:

1. Appropriate licence, amateur transmit band and regional band edge.
2. PTT/key wiring and LOCK state.
3. Correct mode and input: USB/LSB microphone voice, U-D/L-D rear line data.
4. Power above 0/1 W as intended.
5. SWR protection—substitute dummy load.
6. Supply voltage under key-down load.
7. SPLT: B may be outside a permitted segment.
8. CW: QSK must be ON; QSK OFF gives practice sidetone only.
9. CAT/ACC PTT: remove interface and test hand PTT.

If TX ERROR is partly obscured on older APP firmware, v1.81 fixes the black-box display issue, but the underlying error still needs resolving.

## Power is lower than set

- High SWR causes protection/foldback.
- Supply sag limits PA output; measure at radio while keyed.
- AM carrier behaviour is not comparable to SSB peak power, and published documents have differed—do not expect a constant 20 W AM carrier.
- Voice power meters show changing speech envelope; use a steady test method/dummy load only where appropriate.
- Digital audio underdrive gives low output; rebalance while keeping v1.81 ALC ≤50.
- Overdrive does not safely create more RF; it creates distortion.

Use an accurate external wattmeter/dummy load to confirm a persistent fault, allowing instrument tolerance.

## Voice audio is quiet, harsh or splattering

### Quiet

Confirm USB/LSB rather than U-D/L-D, `INPUT MIC`, microphone plug fully seated and MIC Gain around 10. Speak 3–4 cm across the mic. Raise gain in small steps while a separate receiver or trusted station monitors.

### Harsh/broad

Turn CMP off, lower MIC Gain, move slightly away and reduce room echo/noise. Check supply grounding and ferrites if distortion happens only on certain bands/powers; RF may be entering the microphone lead.

Do not ask a co-located receiver without attenuation to judge splatter—it may itself overload. Use a dummy load, physical separation and attenuation or a distant report.

## VOX keys unexpectedly or clips words

- Turn VOX off until calibrated.
- Lower VOX Gain if fans/room noise trigger it.
- Raise Anti-VOX if the radio's speaker retriggers transmit.
- Increase DLY slightly if word endings vanish; decrease if it stays keyed too long.
- Use headphones to prevent acoustic feedback.
- Test all levels into a dummy load.

If data software uses VOX, CAT/ACC PTT is usually more deterministic.

## CW gives sidetone but no RF

Set QSK ON. QSK OFF is deliberate practice mode and the mode indication may appear red. Then check transmit band, key wiring, power and SWR.

If RF is continuous, power down and inspect the TRS plug/adapter. If dot/dash are reversed, choose the other L/R orientation. If extra characters appear, ensure Iambic A/B matches your learned technique.

## CW decoder displays nonsense

Set a 500 Hz filter, tune to chosen sidetone until ΔF responds, narrow toward 300 Hz, match displayed keyer speed to the sender and ensure only one signal is inside. QSB and human spacing will still fool it. Copy by ear and treat decoder text as a prompt only.

## Tuner does not improve SWR

First prove the radio on a dummy load. Then:

- remember short TUNE only recalls/bypasses; long TUNE initiates a search;
- disable SPLT or install v1.81 if older firmware hangs;
- inspect coax, antenna switch, transformer and counterpoise;
- measure untuned SWR with scanner/analyser;
- change antenna length/feed arrangement to enter the ~5:1 range; and
- leave SWR THR at its protective default.

Clicking relays cannot fix an open connector. Stop repeated tune attempts when the result is unchanged.

## SWR jumps only while speaking or in wind

Intermittent hardware is likely: loose PL-259, cracked wire, moving telescopic section, arcing transformer, wet connector or inadequate counterpoise. Reduce power and inspect. A stable dummy load separates radio from antenna. Wind-driven SWR changes are physical, not AGC or DSP.

## CAT will not connect

1. Boot radio normally before opening software.
2. Verify cable is in head COMM, not rear BASE-update port.
3. Identify the actual FTDI/Prolific/CH342 serial device.
4. Close every other program owning it.
5. Select 19200 8N1 and native G90/Flrig profile/address.
6. Test frequency read, then mode, then PTT into dummy load.
7. Replace charge-only/poor USB cables and avoid unpowered hubs.
8. If it fails only on transmit, add ferrites/isolation and cure common-mode RF.

A normal CAT lead has no sound card. Successful frequency control says nothing about audio.

## FT8 decodes nothing

- Choose U-D and a full 100–3100 Hz data passband.
- Select interface recording device, not laptop microphone.
- Verify AUX OUT and computer input meters.
- Disable enhancements/AGC/noise cancellation.
- Set accurate computer time.
- Check band/frequency and propagation.
- Ensure strong signals are not clipping the sound card; reduce PC input/AUX OUT or receiver gain.

If the software waterfall remains black while radio audio exists, trace the physical ACC → interface → PC path. CAT cannot fill it.

## FT8 keys but sends no/dirty RF

- Confirm U-D automatically selected ACC line input.
- Select interface playback device.
- CMP and VOX off.
- AUX IN around 8 and moderate PC playback.
- On v1.81, higher ALC means more input and DIGI must remain ≤50.
- If using older firmware, update rather than applying v1.81 numbers blindly.
- Keep transmit tone away from filter edges.
- Test CAT/ACC PTT unkeys after application stops.
- Reduce power and allow cooling for high duty cycle.

Do not follow stale advice to chase 85–100 ALC on v1.81. That can overdrive the transmitter.

## Computer loses devices during transmit

RF common-mode current or supply noise is entering USB/audio:

- reduce power and test into dummy load;
- add a feedline choke at antenna/feed point;
- add ferrites to USB, ACC and DC near both ends;
- use galvanic audio/PTT isolation;
- separate radio/coax/antenna from computer leads;
- bond/ground safely; and
- replace poor USB hubs/cables.

If it occurs into a dummy load too, inspect station wiring/supply. If only on one antenna/band, antenna common mode is strongly implicated.

## External speaker is silent or distorted

Determine hardware revision. Older units may provide headphone-level output unsuitable for a passive low-impedance speaker. Later units with the hidden selector must be set to the correct headphone/speaker position with power off/head removed as instructed. Use stereo TRS wiring. Start at low volume and never short left/right channels with a mono plug.

## Memories vanished or count seems wrong

A reset/update can erase them. Current firmware exposes 64 channels (`CH00–CH63`). The old 100-memory FAQ is stale. Restore from the external record. If memory mode will not tune, copy the channel to a VFO—fixed recall is expected.

## Everything changed after an update

Verify both APP and BASE versions/build dates. A one-half update or skipped reset creates mismatched behaviour. Perform the bundle-required factory reset and rebuild settings. Remember the major changes:

- v1.79 two-filter BPF model and data modes;
- current FFT scale fixed AUTO;
- v1.81 ALC/NFM/SPLT-tuner behaviour.

Do not downgrade a later-controller unit below v1.77 or mix GSOC-era assumptions with current firmware.

## When to factory-reset

Reset after the official firmware instructions require it or after settings corruption persists despite the five-minute checklist. Record memories, AUX levels, RCLK, key assignments and versions first. Enter reset from power-off with FUNC held while tapping POWER; PRE confirms, VM cancels on the documented current flow.

Factory reset will not repair bad coax, wrong drivers or a broken power connector. Use it after evidence, not before diagnosis.

## When to stop and seek service

Stop transmitting and contact an authorised service route when:

- smoke, burning smell, liquid ingress or abnormal connector/case heating occurs;
- correct supply repeatedly blows the correct fuse;
- high SWR appears into a verified dummy load with known-good coax;
- the PA produces no output after mode/power/supply/firmware checks;
- the loader cannot be reached with correct official recovery procedure; or
- the head/body connector is physically damaged.

Provide serial number, hardware generation, APP/BASE versions/builds, supply voltage at idle/transmit, exact accessories, reproduction steps and tests already completed. “It doesn't work” creates a long support exchange; evidence shortens it.

## Key takeaways

- Isolate the radio first: stable power, dummy load, no CAT/accessories, neutral controls.
- Boot problems often come from CAT polling; audio problems often come from VOL routing or non-overlapping BPFs.
- PRE/RF overload, QSK off, split B frequency and CAT-without-audio explain many apparent faults.
- v1.81 specifically fixes NFM silence and split-tuner hang, and changes digital ALC to ≤50.
- Factory reset is for firmware/settings corruption, not cables or antennas.

Once faults are under control, [Best practices](outpost:entry/logbook73.guide.g90/best-practices) turns these fixes into habits that protect the station and everyone sharing the band.
