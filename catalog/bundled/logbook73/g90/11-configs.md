# Ready-made G90 configurations

These recipes are known starting points, not magic profiles. They make every consequential control explicit so that when a contact fails you can diagnose one variable instead of wondering which forgotten state is responsible. Frequencies and transmit permissions always come from your national licence and band plan; the examples describe radio setup, not permission.

Before every transmitting recipe: connect an antenna or dummy load, verify SWR at low power, listen for a clear frequency, identify normally and keep people away from the antenna.

## How to read the recipes

Button names are bold. A sequence such as `FUNC + AGC` means tap FUNC, then the AGC/SPL button. BPF widths are the resulting overlap on v1.79+ firmware. `Normal` front end means neither PRE nor ATT displayed.

Every recipe assumes matched APP/BASE v1.81. If your control sequence differs, consult [Firmware](outpost:entry/logbook73.guide.g90/firmware) before forcing values.

## 1. First SSB voice contact

Use 40 m LSB in the evening for regional contacts or 20 m USB in daylight for wider paths, subject to propagation and your band plan.

| Control  | Start                                   | Reason                                 |
| -------- | --------------------------------------- | -------------------------------------- |
| Mode     | LSB below 10 MHz; USB above             | Amateur voice convention               |
| Filter   | 300–3000 Hz (2.7 kHz)                   | Natural intelligible speech            |
| PRE/ATT  | Normal                                  | Maximum useful headroom                |
| AGC      | AGC-A                                   | General fading response                |
| RF Gain  | 50%                                     | Adjust for actual band noise           |
| NB       | Off                                     | Enable only for repetitive pulses      |
| CMP      | Off                                     | Establish clean microphone audio first |
| MIC Gain | About 10                                | Sensible stock beginning               |
| VOX      | Off                                     | PTT prevents accidental keying         |
| RIT/SPLT | Zero/off                                | Avoid mystery receive/transmit offsets |
| Power    | 5 W, increase only if needed            | Easier fault containment               |
| ATU      | Bypass if resonant; long-tune if needed | Avoid needless network loss            |

Find a signal on the waterfall, centre by ear, listen through one exchange and call once. Speak across the microphone from 3–4 cm. Watch SWR and supply voltage during the first over. If reports say quiet, increase microphone gain slightly only after confirming the mic input route; if readable but weak, increase RF power rather than audio drive.

After clean audio is established, CMP may help a marginal path by raising average speech power. Toggle it while a trusted station or independent receiver compares intelligibility. If room noise and harshness grow more than useful speech, leave it off.

## 2. Weak SSB on a noisy lower band

The temptation is PRE and maximum RF Gain. Usually do the opposite.

1. Select correct sideband and AGC-S or AGC-A.
2. Ensure PRE is off.
3. Lower RF Gain from 50% until the noise floor drops but the voice remains intelligible; raise just a little.
4. If a huge station or broadcaster still creates ghosts, use ATT.
5. Narrow the 2.7 kHz passband toward 2.2–2.4 kHz from the interfering side.
6. Enable NB only if the noise is a repeated tick/click.

This works because front-end headroom is more valuable than an impressive S reading. If the wanted signal and noise fall together with RF Gain, signal-to-noise ratio is unchanged; listening comfort and distortion may still improve. If only the noise/ghosts fall, it improves.

Do not squeeze the filter until speech loses consonants. In a pile-up, waiting for QSB to lift or moving antenna direction can outperform another menu adjustment.

## 3. First CW QSO

| Control  | Start                          | Reason                             |
| -------- | ------------------------------ | ---------------------------------- |
| Mode     | CW                             | Normal receive side                |
| Filter   | 500 Hz; ~300 Hz after centring | Easy search, selective copy        |
| AGC      | Fast                           | Recovers between elements          |
| PRE/ATT  | Normal, PRE off on lower bands | Preserve headroom                  |
| RF Gain  | Enough to hear band noise      | Avoid overload                     |
| SPEED    | 15–18 WPM or caller's speed    | Copy accurately                    |
| M/L/R    | Correct straight/paddle wiring | Prevent continuous/reversed keying |
| Iambic   | Your learned A or B            | Preserve muscle memory             |
| QSK      | ON                             | Required for RF keying             |
| QSK Time | Moderate                       | Clean semi-break-in                |
| Ratio    | Default                        | Standard element weighting         |
| Power    | 3–5 W initially                | CW is efficient                    |

Practise once with QSK OFF—sidetone only—then use a dummy load at 1 W with QSK ON. On air, tune to your selected sidetone until ΔF responds. Match the other station's speed. If interference sits on one side, try CWR and recenter.

Use the decoder only after you can hear one centred signal. A decoded call is a hypothesis until copied/confirmed.

## 4. FT8 with DE-19 or isolated ACC interface

FT8 is high duty cycle. Give the body air and start at five watts.

### Radio

| Control | Start                             |
| ------- | --------------------------------- |
| Mode    | U-D                               |
| Filter  | 100–3100 Hz, 3 kHz overlap        |
| Power   | 5 W                               |
| CMP/VOX | Off/off                           |
| AGC     | A or F                            |
| PRE/ATT | Normal; reduce overload if needed |
| AUX OUT | 15, then calibrate PC recording   |
| AUX IN  | 8, then calibrate playback        |
| ALC     | **v1.81: at or below 50**         |
| CAT     | 19200 8N1, native G90/Flrig       |
| PTT     | CAT or proper ACC keying          |

### Computer

1. Select the DE-19/interface recording and playback devices, not the laptop mic/speaker.
2. Disable AGC, enhancement, noise cancellation and spatial audio.
3. Synchronise clock accurately.
4. Select native G90 control or Flrig; verify frequency/mode before allowing PTT.
5. Set a healthy receive waterfall without clipping.
6. Transmit into a dummy load and balance playback/AUX IN so v1.81 ALC remains ≤50 with a clean spectrum.
7. Move the FT8 transmit audio cursor away from 100/3100 Hz filter edges.

The USB CAT lead alone cannot complete this recipe because it has no audio. If CAT works but the software waterfall is blank, inspect rear ACC audio—not CI-V commands.

Use the lowest power that completes contacts. If ten watts is needed, raise commanded RF power while keeping audio clean; do not drive harder to fake power. Check case temperature every few cycles.

## 5. Portable POTA/SOTA-style voice station

The G90 has no internal battery, so the portable station is a system.

### Pack list

- 4-cell LiFePO4 or other suitable regulated battery with fused lead;
- correct Powerpole/mini-Tamiya cable for your hardware revision;
- proven wire antenna, support line and non-conductive throw line;
- correct transformer/balun, counterpoise and common-mode choke;
- lightweight coax and adapters already tested;
- headphones, microphone and key if used;
- dummy load or tiny analyser if space permits;
- weather protection that leaves ventilation; and
- paper/digital log plus licence details.

### Radio setup

`5–10 W`, correct sideband, AGC-A, RF Gain 50%, PRE only on quiet upper bands, CMP off initially, NB off, LCD `20–50%`, arrows assigned BAND or FREQCH. Use the ATU only after assembling the full antenna and checking that its impedance is plausible.

At the site, antenna height/clearance and low local noise are worth more than the last ten watts. Secure cables so a passer-by cannot pull the radio. Keep the body out of direct rain and sun without wrapping it in an insulating bag. A transparent loose cover can shield drizzle during receive; stop and pack down when water threatens connectors.

Call CQ, then pause long enough for weak answers. State the programme/reference clearly but prioritise callsigns and reports. Move a long QSO away from a calling frequency.

## 6. Home/base-station voice

Use a regulated 13.8 V/10 A supply, a proper external speaker/headphones for the hardware generation, common-mode chokes and a resonant outside antenna.

| Area         | Home setup                                          |
| ------------ | --------------------------------------------------- |
| Cooling      | Clear body vents/fins; no papers stacked on top     |
| Front end    | PRE off below ~18 MHz; RF Gain adjusted by band     |
| Filter       | 2.7 kHz starting voice, narrower in congestion      |
| Power        | As little as practical, up to 20 W                  |
| Mic          | Gain ~10, CMP only after monitoring                 |
| CAT          | Connect after normal boot; ferrites near both ends  |
| Ground/noise | Safe electrical earth plus RF/common-mode treatment |

If a computer charger or monitor raises noise, prove it by receiving from battery and switching devices off one at a time—without defeating safety earth. Add ferrites or replace the noise source. An attenuator can hide overload but not cure conducted household noise at the antenna.

## 7. Shortwave listening post

Set System item 08 to `Full Band`. Use AM for broadcast audio, USB/LSB for utility/amateur voice and CW for Morse.

| Control | Start                                              |
| ------- | -------------------------------------------------- |
| Mode    | Match the signal                                   |
| AGC     | Slow for AM/voice                                  |
| RF Gain | 30–60% on crowded lower frequencies                |
| PRE     | Usually off; perhaps useful above 18 MHz           |
| ATT     | Use around strong broadcasters                     |
| Filter  | AM 6 kHz clear, 3–4 kHz congested; SSB 2.4–2.8 kHz |
| SQL     | Off                                                |
| AVE     | 3–6                                                |
| Memory  | Store only genuine recurring stations/standards    |

The receiver can tune outside amateur bands, but never press TUNE, SWR Scan, PTT or key there. Disconnect the microphone/key if a visitor will explore. A tuner does not improve ordinary receive enough to justify accidentally transmitting.

For synchronous-like fading on AM, try USB or LSB and tune the carrier carefully; listening to one sideband can reject interference on the other, though the G90 does not provide a true synchronous detector.

## 8. Mobile receive/occasional parked operation

Mount the body where air can circulate and the head where it does not block the driver's view or airbags. Fuse the DC lead at the source, route away from sharp metal and verify the vehicle's charging voltage stays within range. Use a properly engineered antenna mount with bonding/common-mode control.

Assign microphone arrows to volume and F1 to PRE/ATT if local law and operating practice permit. The safest configuration while moving is receive-only or no interaction. Pull over before changing filters, tuning an antenna, logging or transmitting if attention would be divided.

Alternator whine changes pitch with engine speed; ignition noise produces repeated pulses. NB may help the latter. Ferrites, bonding and cable routing cure causes more effectively than extreme blanker settings.

## 9. Emergency listening and low-power communications

The G90 is not a certified public-safety radio, but can support amateur emergency communications within licence and local arrangements.

- Pre-programme agreed amateur net frequencies and modes.
- Keep paper frequencies and channel list with the radio.
- Test battery capacity and fused spare leads.
- Use 5 W unless the path requires more.
- Keep transmissions concise and factual.
- Preserve battery by reducing LCD, volume and unnecessary receive accessories.
- Have a resonant antenna so a tuner failure is not mission-critical.
- Never transmit on emergency-service or other protected frequencies merely because a situation feels urgent; legal emergency provisions are jurisdiction-specific.

## Moving between recipes cleanly

The G90 remembers states, so use a reset checklist rather than factory reset:

1. SPLT off.
2. RIT zero.
3. ATU state appropriate.
4. Correct mode/input route.
5. CMP, NB and VOX as intended.
6. Power checked.
7. PRE/ATT and RF Gain reset for new band.
8. Filter defaults restored if the last mode was unusually narrow.
9. CAT/PTT disconnected when not needed.

## Key takeaways

- Recipes are baselines; propagation, noise, antenna and licence determine final settings.
- Start SSB with clean uncompressed mic audio and low power.
- Start CW at a copyable speed, 500 Hz filter and QSK ON.
- Start FT8 in U-D through real ACC audio, and on v1.81 keep ALC ≤50.
- Portable success comes from the complete power/antenna system, not 20 W alone.
- Clear SPLT, RIT and unusual filter/input states when changing activities.

When a recipe does not behave as described, continue to the symptom-first [Troubleshooting](outpost:entry/logbook73.guide.g90/troubleshooting) chapter.
