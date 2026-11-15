# Getting started: head, body, power and first receive

The fastest way to become comfortable with the G90 is not to memorise every button. It is to build one safe receiving station, learn what the display is telling you and acquire three habits: a short press and a long press are different commands; **FUNC** changes the next button; and most setting screens are finished by pressing the main tuning knob.

## Before connecting power

Lay out the radio body, detachable display head, microphone, DC lead and head cable. Inspect the connectors rather than assuming that every second-hand accessory is correct.

There are at least two common hardware generations:

| Area           | Earlier G90                 | 2024-and-later revision                                                     |
| -------------- | --------------------------- | --------------------------------------------------------------------------- |
| DC input       | Mini-Tamiya-style connector | Anderson Powerpole                                                          |
| Lower case     | Prominent heat-sink fins    | Vent openings/revised case                                                  |
| External audio | Primarily headphone-level   | Hidden speaker/headphone impedance selector behind head on applicable units |

The operating controls are substantially the same, but a cable or loudspeaker suitable for one generation may not suit another. If the serial label, connector or selector differs from a photograph, trust the hardware in front of you.

### A safe supply

Use a regulated, negative-ground supply near `13.8 V`. The radio's specified range is approximately `10.5–16.5 V`; staying near 13.8 V avoids both low-voltage shutdowns and needless stress. Allow at least `8 A`, preferably a fused `10 A` station supply. A supply capable of more current is not inherently dangerous—the radio draws what it needs—but the cable and fuse must protect against a short.

For a portable battery:

1. Put a fuse close to the positive terminal.
2. Verify polarity with a meter before the first connection.
3. Use cable thick enough that transmit current does not pull voltage down at the radio.
4. Keep the connector away from wet ground and metal objects.
5. If the displayed voltage collapses when you key, suspect cable resistance or a tired battery before blaming firmware.

Do not reverse the Powerpole pair to match another brand's wiring. Red-to-positive and black-to-negative is the expected convention, but verify it.

## Fit the head and microphone

The front panel can mount directly to the body or work remotely. With power disconnected, align the head squarely and avoid using the retaining hardware to pull a misaligned connector into place. When remote mounting, use the intended one-to-one cable. A generic serial lead can cross pins or omit conductors even though both ends are DB9.

Install remote-head studs one at a time so the panel remains located. Give the body ventilation and support the cable; a dangling lead should not put its weight on the head connector.

Plug the hand microphone into its proper front/head socket with the radio off. Plug a key only into the **KEY** socket and confirm its wiring in the CW chapter. A mono plug or the wrong adapter can hold the transmitter keyed.

## Connect an antenna before transmitting

The SO-239 antenna socket expects a `50 Ω` system. For the first power-on, a resonant amateur antenna or a rated dummy load is ideal. The G90 may receive on a random wire, but that does not make the wire safe to transmit into.

Finger-tighten the PL-259 fully. A connector that appears seated but has a loose shell can produce intermittent high SWR. Route coax so it cannot lever against the socket.

## Power on and shut down correctly

With volume initially low, press **POWER** briefly. The status lamp changes during startup and the display loads. A brief press while the radio is already running turns the display off or back on; it does **not** shut down the radio. The receiver continues operating with a dark display.

To shut down, hold **POWER** until `BYE` appears, then release and wait. Do not habitually pull the DC lead from a running radio. A proper shutdown gives both controllers time to save state.

The status LED is yellow-green during reception/idle and red during transmit/startup. If it turns red unexpectedly, release the microphone, key or CAT PTT immediately and investigate.

## Read the body before cabling accessories

The G90's small labels invite assumptions, so trace each cable from purpose to port.

The **antenna SO-239** carries both receive and transmit RF. The **rear ACC** connector carries analogue line audio and control for data/accessories. The **rear COMM** socket is principally the BASE firmware-loading path. The **I/Q** jack supplies stereo baseband to a sound card. On the display head, the left **COMM** connection is the everyday CAT and APP-update route. These ports are not interchangeable simply because some use the same plug diameter.

Before powering a used radio, remove unknown home-made accessory leads. Test the bare station first. An incorrectly wired ACC lead can assert PTT; a mono key lead can key CW; a serial program can push the controller into its loader during boot.

### Detachable-head installation

Remote mounting moves heat and cable clutter away from the operating position, but it creates mechanical responsibilities:

- mount the body so its fins or vents are unobstructed and connectors are accessible;
- mount the head within comfortable sight without blocking vehicle safety equipment;
- use a verified straight-through, one-to-one head cable and intended hardware;
- add strain relief so vibration does not work the DB9 connectors;
- route separately from ignition, high-current and RF cables where possible; and
- leave enough service loop to remove the head without pulling pins sideways.

If the head intermittently resets when the cable is touched, stop and fix the connector/cable. Repeated hot interruptions can corrupt state and are not cured with a firmware update.

### Audio-output generations

The short VOL press chooses the internal or external path. On later hardware, a small impedance-mode selector behind the removable panel supports the intended passive-speaker/headphone choice. Make changes powered off and begin at low volume. On an older radio without that arrangement, use headphones or an amplified speaker appropriate to a headphone-level signal.

Never use a mono TS plug that ties stereo contacts together. A stereo-to-mono adapter must combine channels through proper resistors rather than shorting outputs.

## The display, decoded

The 1.8-inch screen is busy because it combines a conventional radio readout with an SDR view. Work from large information to small:

- **VFO and frequency:** `A` or `B` identifies the active oscillator. The large digits are the operating frequency. In split operation, A receives and B transmits.
- **Mode:** `LSB`, `L-D`, `USB`, `U-D`, `CW`, `CWR`, `NFM` or `AM`.
- **Filter:** the on-screen band-pass graphic shows two filter windows and their overlap. On v1.79 and later, the overlap is what you hear.
- **Spectrum:** live signal strength versus frequency across roughly 48 kHz.
- **Waterfall:** the same information over time. A vertical trail is a persistent carrier; speech makes irregular wider marks.
- **Receive meter:** signal strength/S-units and dBm when AGC is active.
- **Transmit meters:** forward power, SWR and ALC. Their meaning depends on whether you are transmitting voice, CW or data.
- **State icons:** PRE/ATT, noise blanker, compressor, tuner, VOX, AGC, split, squelch, lock and audio-output state.
- **Supply voltage:** useful for spotting portable-battery sag; allow roughly `±0.3 V` display tolerance before judging a calibrated meter against it.
- **RIT:** `R+...` or `R-...` means the receive frequency is offset from the displayed transmit frequency.

The screen is not touch-sensitive. Touching a label will achieve nothing except fingerprints.

## Learn the three kinds of press

The G90 uses the same key in three ways:

1. **Short press:** tap and release. This is usually the printed primary function.
2. **Long press:** hold for roughly one to two seconds. This usually opens an adjustment or starts an action.
3. **FUNC action:** tap **FUNC** so its indicator/layer is active, then press the target button. This is the smaller second label such as **SPL**.

Do not hold **TUNE** when you only intend to insert the existing match: a long hold actually transmits and retunes. Do not merely tap **POWER** when leaving the station: that only darkens the display.

Most adjustment pages use the main tuning dial to change a value. Press the main dial to accept and leave. The System Menu instead supplies explicit `SAVE` and `EXIT` actions; use `SAVE` if you want the change retained.

## Your first receive session

This exercise uses no transmitter and can be done before you are licensed.

1. Press the right or left **BAND** top key to select `40 m` after dark or `20 m` in daylight.
2. Use the **MODE** top keys to choose `LSB` on 40 m or `USB` on 20 m.
3. Set the front end to normal: press **PRE/ATT** until neither PRE nor ATT is shown.
4. Press **AGC** until `AGC-A` appears.
5. Rotate **VOL** for a comfortable level.
6. Rotate the main dial. Short-press it to choose a useful step—`100 Hz` for searching voice, `10 Hz` for fine centring.
7. Watch for a trace in the waterfall and tune its centre toward the display's receive marker.
8. Short-press **MFK** to enter filter editing. Press it to select an edge, rotate carefully, and leave enough speech bandwidth to sound natural. Long-press MFK to exit.

If the band sounds like a wall of noise, do not immediately switch on PRE. Long-press **AGC** and reduce RF Gain below its `50%` starting point, or use ATT if a genuinely huge signal is nearby. Less gain can produce more usable dynamic range.

## Set a frequency precisely

The main tuning dial works in selectable decades. Short-press it to cycle:

`10 Hz → 100 Hz → 1 kHz → 10 kHz → 100 kHz`

The highlighted digit shows which place will change. `10 Hz` is right for resolving CW and fine voice tuning; `100 Hz` is comfortable for SSB; `1 kHz` or more is for moving quickly. A **FUNC + main-dial press** changes the stepping direction/behaviour on applicable current firmware, so if a press seems to walk the wrong way, check that FUNC is not latched.

For direct keypad entry, press the microphone's **F-INP/ENT**, enter the digits and confirm with **ENT**. The ordinary number keys select bands when frequency-entry mode is not active.

## Set volume and audio output

Rotate **VOL** for level. A short press of the knob toggles between the internal speaker and the external/headphone route. This explains many “the radio went silent” reports: the radio is receiving normally but output has been switched away from the internal speaker.

Use a stereo TRS plug. On an applicable later unit, remove the head and set the hidden impedance selector appropriately before using a passive external speaker; on an earlier unit assume headphone-level output unless its documentation proves otherwise. Begin at low volume when changing output or headphones.

**FUNC + press VOL** opens VOX controls. Leave VOX off while learning. An accidental VOX transmission caused by room noise is both embarrassing and potentially unlawful.

## Choose a mode and band

The paired **MODE** keys on top move backward or forward through all eight modes. The paired **BAND** keys move through amateur bands. In the default `HAM Band` stack, band stepping avoids the broadcast bands. If System Menu item 08 is changed to `Full Band`, the sequence includes shortwave receive bands, but that does not create transmit permission or expand the transmitter.

Sideband convention is a convention, not a demodulator lock: amateur voice is normally LSB below 10 MHz and USB above 10 MHz. Use U-D rather than USB for most sound-card data because data mode selects the ACC line route and suitable default filtering. Use L-D where the digital program requires it, commonly traditional RTTY arrangements.

## Make a first test transmission safely

Only do this if licensed and on a legal, clear frequency.

1. Connect a resonant antenna or dummy load.
2. Listen and ask whether the frequency is in use.
3. Short-press **POW** and set `POWER` to `1 W`.
4. If the antenna needs matching, long-press **TUNE**. The radio transmits during the search. Confirm a successful low SWR.
5. Select `LSB` or `USB`, check `INPUT MIC`, set MIC Gain near `10`, compressor off and VOX off.
6. Press PTT, identify, speak normally 3–4 cm from the microphone, and watch power/SWR/ALC.
7. Release PTT. If SWR rose sharply, stop and inspect the antenna system before increasing power.

Do not use an on-air frequency merely as a test bench. A rated dummy load lets you test without radiating and should be one of the first accessories for any transmitter.

## A first-day baseline

| Setting | Start here              | Why                                            |
| ------- | ----------------------- | ---------------------------------------------- |
| DC      | `13.8 V`, fused, ≥`8 A` | Stable voltage with transmit headroom          |
| Power   | `1–5 W` while testing   | Limits consequences of mistakes                |
| AGC     | `AGC-A`                 | Safe general-purpose behaviour                 |
| RF Gain | `50%`                   | Xiegu's useful midpoint; adjust for band noise |
| PRE/ATT | Neither                 | Avoid needless overload                        |
| NB      | Off                     | It only helps pulse noise                      |
| CMP     | Off                     | Clean, natural voice while setting gain        |
| SQL     | Off on SSB/CW           | Squelch can hide weak HF signals               |
| ATU     | Out on a resonant load  | Avoid unnecessary matching loss                |
| RIT     | `0 Hz`                  | Prevent mystery receive offset                 |
| VOX     | Off                     | Prevent accidental transmit                    |

## Key takeaways

- A short POWER press only blanks the display; hold it until `BYE` for shutdown.
- Short, long and FUNC presses are separate commands. Look before holding TUNE or POW.
- Start with PRE/ATT normal, AGC-A, RF Gain 50%, NB/CMP/VOX off and low transmit power.
- The two filter windows overlap; from v1.79 onward, their overlap is the actual audible passband.
- A silent speaker may simply be VOL's output toggle, not a failed receiver.
- Hardware revisions differ at the DC connector, case and external-speaker arrangement.

The next chapter is the complete [menu and control reference](outpost:entry/logbook73.guide.g90/menu-reference); keep it open beside the radio until the three-way button logic becomes automatic.
