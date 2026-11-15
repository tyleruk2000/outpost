# Installation, controls and the first power-on

A mobile radio is part electrical installation, part RF installation and part user interface. Get those three foundations right before programming a single repeater.

## Before power: the non-negotiable checks

1. **Use a 12 V vehicle electrical system or regulated base supply.** The RT95 is specified for `13.8 V DC ±15%`. Never connect it directly to a 24 V vehicle system or mains AC.
2. **Keep both 10 A fuses.** The factory lead has protection in the cable and the manual specifies 10 A fusing. If a replacement fuse blows, find the fault; do not fit a larger fuse.
3. **Observe polarity.** Red is positive, black is negative. For a permanent vehicle installation route the supplied cable to the battery, protected from heat, moisture and ignition wiring. The manual discourages a cigarette-lighter socket because voltage drop can dim the display and reduce transmit power.
4. **Connect a 50 Ω antenna or dummy load before transmitting.** Never press PTT into an empty or badly mismatched antenna socket.
5. **Use a sound mounting point.** The bracket must not become a knee hazard in a crash, block an airbag, bake in direct sun or lose its cooling airflow.

For a base station the manual recommends a regulated supply capable of **12 A**. That leaves sensible headroom for a nominal 25 W FM transmitter. A smaller supply may appear fine on receive and collapse only when PTT is pressed.

### An unusual external-speaker warning

The `EXT SP` socket expects an 8 Ω speaker on a 3.5 mm mono plug, but its output is **bridge-tied (BTL)**. Neither speaker conductor should be tied to vehicle chassis or signal ground. Use a normal isolated speaker and plug; do not adapt one side of the output to ground. The microphone also contains a speaker, selected independently in Function Menu 16.

## Front panel

| Control        | What it does                                                                   | Practical use                                                                            |
| -------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Power/mute key | Short press mutes/restores audio; hold powers off                              | A quick mute is safer than winding the volume away and forgetting it                     |
| `P1`–`P6`      | Six programmable soft keys                                                     | Put `A/B`, `V/M`, `CDT`, `SCN`, `MON` and volume/frequency control where you expect them |
| `FUNC`         | Short press changes the displayed key-function group; hold opens `SELECT MENU` | Short and long presses lead to very different places                                     |
| Channel knob   | Turn changes frequency/channel/value; press (`PUSH`) selects or edits          | Hold `PUSH` to lock/unlock most controls                                                 |
| `MIC` socket   | Eight-pin modular microphone connector                                         | Seat the plug until the latch clicks; do not yank the cable                              |

The six labels drawn beside `P1`–`P6` are live descriptions of the current function group. When an instruction says “the PX key defined as SCN”, it means **whichever one of P1–P6 currently shows `SCN`**, not a fixed scan button.

## Microphone

| Control           | Job                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `PTT`             | Transmit on the selected main channel                                                                  |
| `UP` / `DOWN`     | Move frequency, memory or menu value; while holding PTT they send the programmed signalling/tone burst |
| Numeric keypad    | Direct VFO frequency entry, three-digit memory entry and live DTMF digits                              |
| `A/B`             | Select upper or lower display as main                                                                  |
| Side slide switch | Locks only the microphone's `UP`/`DOWN` keys                                                           |
| Speaker           | Can replace or supplement the radio's main speaker                                                     |

Keep the microphone 2.5–5 cm from your mouth and speak normally. Shouting creates distortion; holding it at arm's length produces weak, noisy audio.

## Reading the display

The upper row is the main channel; the lower row is the watched sub-channel. Around them are indicators for:

- main transmit/receive and sub receive activity;
- signal strength;
- memory number, frequency or name;
- bandwidth;
- CTCSS/DCS;
- reverse and offset;
- scan-list membership (`S`);
- supply voltage and menu values;
- automatic power-off state.

The `DIR` menu can turn the whole TFT through 180 degrees for inverted mounting. It is an electrical rotation, not a reason to install the radio where ventilation or controls become unsafe.

## Frequency, channel and name are display choices

The RT95 separates **display mode** from **working mode**:

- `FRQ` display shows frequency plus channel information.
- `CH` display emphasises memory channel number.
- `NM` shows a programmed channel name, falling back to frequency/channel where no name exists.
- **VFO** working mode lets the knob tune by the chosen step and retains its current operating settings.
- **MR** working mode moves through the 200 stored memories, skipping empty slots.

In a software-locked professional/channel configuration, the front panel may not allow a return to VFO. That is deliberate fleet control, not a broken V/M key. Read and save the current code plug before changing display or lock settings in software.

## First receive test

1. Connect the antenna and power, then switch on.
2. Select VFO mode with the soft key assigned `V/M`.
3. Make the upper row main with `A/B`.
4. Enter a **receive-only test frequency** from the microphone keypad: for `145.500 MHz`, key `1 4 5 5 0 0`.
5. Set Function Menu 04 squelch around `2` or `3`.
6. Assign/use `MON` and open the squelch. You should hear clean receiver noise; release or toggle it to restore squelch.
7. Adjust volume with the programmed `VOL` action.

Do not use an arbitrary receive test as a transmit test. Before PTT, confirm the frequency is permitted, the band/mode fits your licence, an antenna or dummy load is attached, the main side is correct and the channel is not busy.

## First simplex call

Use a local amateur simplex frequency permitted by your band plan. Start on **low power**, leave receive/transmit tones and optional signalling off, use the appropriate bandwidth, listen first, then give your callsign and invite a response. If low power is solid, keep it there. Mobile 25 W is useful for a difficult path, not a default badge of seriousness.

The complete operating workflows continue in [Memories, repeaters and odd splits](outpost:entry/logbook73.guide.rt95/memories-repeaters).
