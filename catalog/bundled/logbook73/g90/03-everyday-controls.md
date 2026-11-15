# Everyday controls, modes and the spectrum display

The G90 becomes quick when you stop treating its buttons as a list and start treating them as a workflow: choose a band and mode, set receiver gain, shape the passband, tune the signal, then prepare the transmitter. This chapter follows that workflow and explains the controls you use on nearly every contact.

## Band, mode and frequency

The two **BAND** keys on top move down or up through the band stack. In the default `HAM Band` setting, they visit amateur bands from 160 through 10 metres. `Full Band` adds receive-only broadcast ranges to the stepping sequence. It does not modify transmit limits.

The two **MODE** keys step in opposite directions through `LSB`, `L-D`, `USB`, `U-D`, `CW`, `CWR`, `NFM` and `AM`. Choose the mode deliberately:

- amateur voice normally uses LSB below 10 MHz and USB above it;
- FT8, FT4, PSK and JS8 normally use U-D;
- traditional RTTY arrangements may use L-D;
- CW and CWR hear the same transmitted Morse on opposite receive sidebands, useful for moving interference;
- AM is for AM signals, not “wide SSB”; and
- NFM is only for narrow-FM activity within a legal HF allocation.

The main encoder changes frequency. Short-press it to select the digit decade. A good operating rhythm is `1 kHz` for travelling, `100 Hz` for searching SSB, and `10 Hz` for centring a voice or CW note. Use the microphone's direct-entry key when the destination is known, then look at the screen before transmitting; a missing digit can put you far outside the intended band.

### The 100 kHz MFK shortcut

By default, turning **MFK** moves in `100 kHz` increments. This is faster than repeatedly changing main-dial steps and keeps the main dial ready for fine tuning. Long-press MFK if you prefer to assign RF Gain, power, key speed or squelch. Avoid assigning power until you have the habit of checking it—an accidental twist from one to twenty watts can upset an amplifier, tuner or QRP event.

## VFO A and B

The G90 has two variable-frequency oscillators. Short-press **A/B** to choose which one is active. `FUNC + A/B` copies A into B; it does not merely swap them.

Keeping both VFOs useful saves time. One simple pattern is A on the calling frequency and B on a nearby working frequency. Another is A on FT8 and B on an SSB portion of the same band. Copy A to B before small experiments so returning is easy.

In split mode, **A is receive and B is transmit**. That fixed convention matters. Before enabling split:

1. Put the receive station on A.
2. Put the frequency on which they are listening on B.
3. Tap FUNC, then **AGC/SPL**.
4. Confirm the SPLT indication.
5. Check B is legal and clear before PTT.

Disable split immediately after the QSO. A forgotten split is a classic cause of “people answer someone else when I call” and “my radio transmits on the wrong frequency.”

## RIT: hear them without moving your transmitter

Long-press the main dial to open **RIT**, the receiver incremental tuning control. Rotate for up to about `±500 Hz`. RIT moves only what you hear; the transmitted frequency stays at the main display frequency.

Use it when another operator is slightly off frequency or when a net controller asks everyone to leave the net channel fixed. Do not use it to correct a large or permanent frequency error—that is what tuning or RCLK calibration is for. Return RIT to `0` immediately afterwards. If every station later sounds high or low by the same amount, look for a forgotten `R+...` or `R-...` before touching calibration.

## The receiver front-end decision

Press **PRE/ATT** to cycle:

`PRE → ATT → normal`

The three states are mutually exclusive.

**Normal** is the right default. **PRE** adds front-end gain and can help above roughly `18 MHz` when external band noise is low. On 160, 80, 60 and 40 metres it usually raises noise and overload risk more than useful signal. **ATT** reduces everything before the sensitive receiver stages; use it when a very strong nearby signal, broadcaster or local transmitter is causing ghost signals, reciprocal mixing or broad splatter.

The key test is readability, not S-meter height. If ATT drops noise by four S-units and the wanted voice by two, intelligibility improves despite the smaller reading.

## AGC and RF Gain together

Short-press **AGC** to cycle slow, fast, automatic and off:

- `AGC-S`: slow recovery, calm voice/AM listening;
- `AGC-F`: quick recovery, useful for CW and rapidly changing signals;
- `AGC-A`: automatic general-purpose choice;
- `AGC off`: manual-gain work only; the S-meter also stops behaving normally.

Long-press **AGC** to adjust RF Gain from `1–100%`. Xiegu's useful default is `50%`, not “always maximum.” Think of RF Gain as setting how hard the whole receiver chain is driven. Raise it on a quiet band when chasing a weak station. Lower it on a noisy or crowded lower band until the band noise sits comfortably above the receiver noise but strong signals no longer batter the AGC.

A disciplined recovery sequence for an ugly band is:

1. switch PRE off;
2. return to AGC-A;
3. lower RF Gain gradually;
4. use ATT if one enormous signal still causes products;
5. then narrow the DSP filter.

The DSP filter cannot undo distortion already created in the front end.

## Volume, audio route and squelch

Rotate **VOL** for listening level and short-press it to change between the internal and external/headphone route. Keep volume low before plugging headphones in.

Squelch is available through the MFK assignment. On SSB and CW, leave it open: HF signals fade and a squelch threshold can remove the exact weak syllables you need. It is useful for NFM or a consistently strong AM channel. Set the lowest level that closes between signals; a high setting does not improve rejection, it only hides more reception.

## Shape the receive filter

Current firmware uses two overlapping band-pass windows, BPF1 and BPF2. Short-press **MFK** to enter the editor. A further press selects which coloured window is active; rotation moves the selected edge/window. The overlapping portion—shown as the combined colour—is the passband you hear. Long-press MFK to leave.

Why two filters? The model lets you trim either side while preserving a stored/reference window and makes it easy to see exactly what is being rejected. Operationally, use the overlap:

- SSB voice: begin near `300–3000 Hz`; trim the low edge upward to remove rumble or the high edge downward to reject an adjacent voice.
- Digital: `100–3100 Hz` passes the usual sound-card window. Do not narrow around one FT8 signal; the decoder needs the whole activity slice.
- CW: `500 Hz` is comfortable searching; about `300 Hz` helps the decoder or a crowded band, but too narrow rings and demands precise tuning.
- AM: roughly `6 kHz` sounds natural on a clean signal; narrower is better in congestion.
- NFM: the default `9 kHz` receive passband suits the mode.

If the display becomes confusing or the audio disappears after editing, reset BPF1 with `FUNC + CMP` and BPF2 with `FUNC + NB`. On pre-v1.79 software those labels once moved low/high edges; that is why old cheat sheets disagree.

## Noise blanker: only for the right noise

Repeated short presses of **NB** select switch, level and width. First enable `NBSW`, then raise Level just until regular impulses are detected, and Width just enough to cover each pulse.

Good targets include ignition clicks, electric-fence ticks and some switch-mode spikes. Bad targets include atmospheric hiss, band noise, a broad power-line buzz and adjacent speech. The blanker removes tiny slices of time; too much Width removes wanted audio too. If it makes speech watery or CW clicks rough, back it down or turn it off.

Stock G90 firmware does not offer the X6100's NR/DNF tools. A menu screenshot from another model is not evidence that yours is missing a feature.

## Spectrum and waterfall controls

`FUNC + LOCK` cycles spectrum `SCALE` and averaging `AVE`. In current firmware scale is fixed at `AUTO`; the visible assignment remains but does not provide the old manual control. AVE ranges from `1–10`:

- low averaging reacts quickly and reveals short CW/digital bursts;
- high averaging produces a calmer display but hides brief events and lags tuning;
- a middle value is a readable everyday compromise.

Do not use waterfall colour alone as a calibrated signal-strength measurement. Automatic scale deliberately changes the visual reference. The display is for finding and comparing signals, while dBm/S-meter and external test gear are for measurements.

Short-press **LOCK** to cycle backlight levels. Long-press it to lock or unlock controls. Lock is valuable in a bag, vehicle or crowded field table, but does not make PTT safe by itself; unplug or disable anything that can key the radio when transporting it.

## Prepare voice transmission

Short-press **POW** to select `POWER`, rotate the main dial and press to accept. Start with the minimum that makes the contact. Twenty watts is available, not mandatory.

`FUNC + POW` reaches MIC Gain and, on applicable screens, input selection. A microphone gain around `10` is a sensible beginning. Speak across the microphone from roughly `3–4 cm`, rather than touching it to your lips. Increase gain only after an off-air monitor or trusted report says audio is genuinely low.

Short-press **CMP** to enable the speech compressor. Leave it off while establishing clean audio. Compression raises average speech power and can help a marginal SSB path, but also raises room noise and makes overdrive less forgiving. Use moderate microphone gain with it; never treat a louder ALC bar as automatically better.

For v1.81, ALC is `0–100` and increases with input. Digital operation must remain at or below `50`; voice needs a clean, controlled indication rather than an old internet target. The exact recipe is in [Connectivity and digital](outpost:entry/logbook73.guide.g90/connectivity-digital).

## Use VOX intentionally

`FUNC + press VOL` opens the VOX sequence:

- switch on/off;
- `GAIN`, sensitivity to your voice;
- `ANTI-VOX`, resistance to receiver audio retriggering it; and
- `DLY`, how long transmit hangs after speech, roughly `0–2 s` in 0.1-second steps.

A gain and anti-VOX value near `50` is a starting point, not a law. Set up into a dummy load at low power. Speak softly, loudly and from normal distance; play receiver audio; let fans and keyboards run. The radio should key on every intended phrase, never on its own speaker and not stay keyed for long silences. A little delay prevents the ends of words being clipped.

## Tuner in, tuner out, retune

The **TUNE** key has two distinct jobs:

- short press: insert or bypass the last stored tuner network;
- long press: transmit and search for a new match, then leave the tuner inserted.

On a resonant antenna, bypass usually has lower loss. On a compromise antenna, tune once at low power and leave the successful network in. Retune after a significant frequency or antenna change, not before every CQ. If the match is poor or unstable, stop and fix the system rather than repeatedly clicking relays.

## Make the hand microphone useful

The keypad is not only for PTT. Its arrows follow System item 01, F1/F2 follow items 02/03, number keys jump bands and **F-INP/ENT** enters a frequency. **MODE**, **MW**, **VM** and **TUNER** mirror important panel actions. The microphone status LED is green in receive and red in transmit.

Choose assignments around the operating environment:

- **Home/general:** arrows FREQCH, F1 PRE/ATT, F2 AGC. These change reception without silently moving transmit elsewhere.
- **DX split:** F2 SPLT is quick, but check the B frequency and SPLT icon before PTT.
- **Mobile noise:** F1 PRE/ATT and F2 NB make sense when safely parked; configure before moving.
- **CW:** F2 AGC and an MFK key-speed assignment keep frequently used settings close, though the microphone is seldom needed.

The printed **FIL** and **XFC** labels tempt owners into searching for missing actions. In current stock operation they have no effective user function. Use MFK for the filter and A/B/SPLT for receive/transmit arrangements. The v5 manual does identify the microphone **LOCK** key as a lock control: use it only after confirming the lock icon/state on your installed APP/BASE pair, with the front-panel long LOCK as the dependable alternative if it does not respond.

Direct frequency entry deserves a confirmation habit: press F-INP, enter all digits, press ENT, then read the large display and mode before transmitting. The keypad has no knowledge of whether the typed frequency belongs to a legal amateur allocation.

## What to watch during transmission

Read the meter group, not one bar:

- **Power** should broadly follow the selected output and mode/test signal.
- **SWR** should remain low and stable; speech-induced jumping suggests an intermittent antenna or RF problem.
- **ALC** indicates drive/control behaviour, but v1.81's data limit is not a target to maximise.
- **Supply voltage** should not collapse as current rises.
- **TX state/LED** should return to receive immediately after PTT, key or CAT release.

Voice meters move with speech. A whistle is a poor way to set natural audio and can overdrive the chain. Digital waveforms make thermal and linearity checks more demanding. If anything looks wrong, release PTT first and diagnose second; protection is a safety net, not a normal operating state.

## A complete SSB QSO flow

1. Choose the band and correct sideband.
2. PRE/ATT normal, AGC-A, RF Gain near 50%.
3. Find the station visually, then tune by ear.
4. Set an intelligible 2.4–2.8 kHz overlap.
5. Confirm RIT zero, SPLT off, correct antenna and legal frequency.
6. Set low power; tune the antenna only if necessary.
7. Listen for the full exchange before calling.
8. PTT, identify once, speak clearly and release promptly.
9. Watch SWR and supply voltage on the first transmission.
10. Increase power only if the path needs it.

## Key takeaways

- Start the front end in normal, not PRE; use RF Gain and ATT to preserve headroom.
- AGC-A is general purpose, AGC-F helps CW and AGC-S calms voice/AM.
- The audible filter is the overlap of BPF1/BPF2. Reset both rather than fighting a lost passband.
- Split always receives on A and transmits on B; RIT moves receive only and must be cleared.
- TUNE short press recalls/bypasses; long press transmits and retunes.
- Power, microphone gain and compression solve different problems. Keep the signal clean first.

For persistent preferences rather than daily controls, open the [System Menu](outpost:entry/logbook73.guide.g90/system-menu).
