# Quick reference card

Print this chapter or keep it on the station computer. It assumes matched stock APP/BASE `v1.81`.

## Safety strip

- Licensed amateur bands/modes/power only.
- Antenna or rated dummy load connected before PTT, TUNE or SWR scan.
- `13.8 V` negative ground; stay within `10.5–16.5 V`; fused near source; ≥8 A supply.
- Body ventilated; digital modes are high duty cycle.
- Hold POWER until `BYE` for shutdown. A short press only blanks the display.

## Everyday baseline

| Item           | Start                         |
| -------------- | ----------------------------- |
| VFO            | A; SPLT off; RIT 0            |
| Front end      | Normal (no PRE/ATT)           |
| AGC            | A                             |
| RF Gain        | 50%                           |
| NB / CMP / VOX | Off / off / off               |
| SSB filter     | 300–3000 Hz                   |
| CW filter      | 500 Hz search; ~300 Hz narrow |
| Data filter    | 100–3100 Hz                   |
| Power          | 1–5 W for setup               |
| ATU            | Bypass if resonant            |

## Button card

| Button/control | Short                             | Long                       | FUNC action           |
| -------------- | --------------------------------- | -------------------------- | --------------------- |
| POWER          | On / display off-on               | Shutdown                   | —                     |
| VOL            | Rotate volume; press output route | —                          | Press: VOX menu       |
| FUNC           | Second-function layer             | System Menu                | —                     |
| MW/MC          | Write memory                      | —                          | Clear memory          |
| A/B            | Swap active VFO                   | —                          | Copy A to B           |
| TUNE           | ATU in/out                        | New tune (transmits)       | —                     |
| POW            | Power / SWR threshold             | SWR scan (transmits)       | MIC Gain/Input        |
| KEY            | Keyer settings sequence           | Decoder                    | CW volume/tone/BW     |
| LOCK           | Brightness                        | Control lock               | FFT Scale/AVE         |
| PRE/ATT        | PRE → ATT → normal                | —                          | —                     |
| CMP            | Compressor                        | —                          | Reset BPF1 (v1.79+)   |
| NB             | Switch/Level/Width                | —                          | Reset BPF2 (v1.79+)   |
| AGC            | S → F → A → off                   | RF Gain                    | SPLT                  |
| VM             | VFO/memory                        | Callsign editor            | —                     |
| MFK            | Assigned value; press BPF edit    | Assign function / exit BPF | —                     |
| Main dial      | Tune; press step                  | RIT                        | Press: step behaviour |
| MODE ◀/▶       | Cycle 8 modes                     | —                          | —                     |
| BAND ◀/▶       | Cycle band stack                  | —                          | —                     |

## KEY sequence

`SPEED → M/L/R → Iambic A/B → QSK → QSK Time → Ratio`

QSK OFF = practice/sidetone, no normal keyed RF. QSK ON = transmit.

## System Menu 01–10

1. `Handle up/down` — FREQCH / BAND / VOLUME.
2. `Handle F1` — PRE/ATT, SPLT, NB, COMP, AGC.
3. `Handle F2` — SPLT, PRE/ATT, NB, COMP, AGC.
4. `LCD BL` — 10–100%, default 80.
5. `AUX IN Volum` — 0–15, default 8.
6. `AUX OUT Volum` — 0–15, default 15.
7. `RCLK Tune` — −1000…+1000 Hz, default 0; calibrate only.
8. `Band Stack Mode` — HAM Band / Full Band.
9. `ON/OFF Beep` — Enable / Disable.
10. `Version` — record APP + BASE and builds.

Use `SAVE` to retain; `EXIT` to abandon.

## Modes

`LSB · L-D · USB · U-D · CW · CWR · NFM · AM`

- LSB voice below 10 MHz, USB above by convention.
- U-D for most sound-card data; L-D where software/mode requires.
- v1.79+ data modes automatically use rear ACC line audio.

## Front-end recovery

Ugly/ghosty band:

1. PRE off.
2. AGC-A.
3. Lower RF Gain.
4. ATT if still overloaded.
5. Narrow BPF overlap only afterwards.

NB treats repeated impulses only. Stock G90 has no user DNR/NR/notch.

## Filter recovery

Short MFK → choose BPF1/BPF2 → rotate → long MFK exits.

No audio/confusing overlap:

- `FUNC + CMP` resets BPF1.
- `FUNC + NB` resets BPF2.

## ATU/SWR

- Short TUNE: insert/bypass stored match.
- Long TUNE: transmit and find new match.
- Published matching range: up to roughly 5:1.
- Default SWR protection threshold: about 3:1.
- Long POW: scanner; tuner bypassed; sweep transmits.
- v1.81 fixes ATU stuck in SPLT; still verify B transmit frequency.

## Memories and split

- 64 current channels: `CH00–CH63`.
- MW write; FUNC+MW clear; VM VFO/memory.
- Fixed memory must be copied to VFO before tuning.
- SPLT: A receives, B transmits.
- RIT: receive only, ±500 Hz. Clear after QSO.

## Digital/CAT

- Blue/black USB programming lead = serial only, **no audio**.
- CAT: head COMM, `19200 8N1`; boot before CAT polling.
- BASE update: rear COMM. APP update: head COMM.
- Audio: rear ACC through DE-19/CE-19/isolated interface.
- FT8: U-D, 3 kHz filter, CMP/VOX off, low power, accurate PC time.
- **v1.81 ALC: 0–100, higher = more input, DIGI ≤50. Ignore older high targets.**
- I/Q output = stereo baseband to sound card; not CAT/audio/PTT by itself.

## Firmware card

Current baseline `APP v1.81 + BASE v1.81`.

1. Official/authorised bundle only.
2. Record memories, settings and both old versions.
3. Stable power; CAT software closed.
4. APP file → head COMM; BASE file → rear COMM.
5. Tera Term XMODEM **Send**, choose **1K**.
6. Use head-generation-specific loader sequence.
7. Complete both matching halves.
8. Factory reset as bundle/manual directs.
9. Verify APP/BASE and test at 1 W dummy load.
10. Recalibrate data audio; v1.81 DIGI ALC ≤50.

## Symptom card

| Symptom                     | First check                                         |
| --------------------------- | --------------------------------------------------- |
| Looks dead at boot          | Disconnect CAT/polling, cold boot                   |
| Dark screen but audio       | Tap POWER, brightness, head cable                   |
| No audio                    | VOL output toggle, TRS plug, SQL, BPF resets        |
| Ghost signals               | PRE off, RF Gain down, ATT                          |
| No S-meter                  | AGC off                                             |
| CW sidetone/no RF           | QSK ON                                              |
| Continuous CW TX            | Wrong/mono key plug                                 |
| ATU no improvement          | Long not short TUNE; dummy load; antenna within 5:1 |
| CAT no connect              | Head port, driver, 19200 8N1, one program           |
| CAT works/no FT8 audio      | Add rear ACC sound path                             |
| Dirty FT8                   | U-D, CMP off, v1.81 ALC ≤50                         |
| NFM silent                  | BASE v1.81, correct 9 kHz filter                    |
| Waterfall freeze            | BASE ≥1.80b01, lower AVE                            |
| Controls differ from manual | Check APP/BASE; v1.75/v1.79 UI changes              |

## Thirty-second workflows

### SSB call

1. Correct LSB/USB and legal frequency.
2. AGC-A, RF Gain 50%, PRE/ATT normal.
3. Filter about 2.7 kHz; SPLT off; RIT zero.
4. Listen and ask if in use.
5. Confirm antenna/ATU, 5 W, MIC Gain ~10, CMP/VOX off.
6. PTT, identify, watch SWR/voltage, release.

### CW call

1. Correct CW/CWR and legal frequency.
2. 500 Hz while finding; centre at sidetone/ΔF; narrow ~300 Hz if needed.
3. Correct M/L/R and Iambic A/B; QSK ON.
4. Match caller speed; AGC-F; modest power.
5. Listen/QRL, call briefly and leave receive gaps.

### FT8 start

1. Boot radio before CAT software; select U-D.
2. 100–3100 Hz filter, CMP/VOX off, 5 W.
3. Select actual interface record/playback devices and accurate PC time.
4. CAT 19200 8N1; test frequency then PTT into dummy load.
5. AUX OUT/input calibrated; v1.81 ALC ≤50.
6. Check heat and unkey after every test.

### Portable arrival

1. Site/antenna clear of people and power lines.
2. Fused battery polarity/voltage checked.
3. Assemble antenna, transformer, counterpoise, choke and coax.
4. Receive-check band; scanner/analyser if needed.
5. Long TUNE on legal clear frequency only if match required.
6. Start 5 W, secure/weatherproof cables without covering vents.

## Mini-glossary

| Term      | Plain meaning                                        |
| --------- | ---------------------------------------------------- |
| APP       | Firmware in detachable display head                  |
| BASE      | Firmware in main radio body                          |
| AGC       | Automatic gain control for changing signal levels    |
| RF Gain   | Overall receiver gain/headroom control               |
| PRE       | Front-end preamplifier; usually upper-band tool      |
| ATT       | Front-end attenuator for strong-signal overload      |
| BPF1/BPF2 | Two DSP filter windows; overlap is what you hear     |
| NB        | Pulse noise blanker, not general noise reduction     |
| CMP       | Speech compressor; raises average voice level        |
| SQL       | Squelch; mutes below threshold                       |
| VFO       | Freely tunable frequency register A or B             |
| RIT       | Receive-only fine offset, about ±500 Hz              |
| SPLT      | Receive on VFO A, transmit on VFO B                  |
| ATU       | Impedance matcher between PA and feedline            |
| SWR       | Forward/reflected-wave match indication              |
| ALC       | Transmit input/control indication; firmware-specific |
| ACC       | Rear accessory audio/PTT connector                   |
| CAT       | Computer serial control; no audio in simple cable    |
| CI-V      | Icom-style command protocol subset used by G90       |
| I/Q       | Stereo in-phase/quadrature baseband for SDR software |
| QSK       | CW break-in; must be ON for ordinary RF keying       |
| ΔF        | CW tone/frequency matching indication                |

## State-clearing strip

When changing activity or lending the radio:

`SPLT off · RIT 0 · VFO A · AGC-A · RF Gain 50% · PRE/ATT normal · NB off · CMP off · VOX off · BPF defaults · power 1 W · ATU bypass · CAT/PTT disconnected`

This is not a factory reset and does not erase memories. It simply removes the hidden state most likely to surprise the next operator.

## Revision warning strip

- This card describes matched stock APP/BASE **v1.81**.
- A June 2025 v5 manual describes v1.80/v1.80b01 and is one release behind.
- Pre-v1.79 filter instructions using direct F-L/F-H actions do not match the current BPF-overlap interface.
- Pre-v1.79 data instructions may call for manual LINE selection; current U-D/L-D route ACC automatically.
- Old FAQs may say 100 memories or no working FM; current inventory is 64 memories and NFM, with v1.81 fixing NFM silence.
- One manual table omits MFK `RF Gain`; v1.75 release history and current control inventory include it. Trust the live assignment list.
- Current FFT SCALE remains AUTO even though an old control/assignment label survives.
- GSOC support ended at v1.78; do not assume it works with v1.81.
- Never carry an older numeric ALC target forward. On v1.81, higher means more input and DIGI stays `≤50`.

When asking for help, provide radio serial/hardware connector generation, APP and BASE values, build dates, mode, exact button sequence and connected accessories. “G90 latest firmware” is not enough to reproduce a fault.

Keep this card with the radio, but recheck the official download page before any update. A field reference preserves safe habits; it cannot supersede newer manufacturer release notes.

## Official references

- [Xiegu downloads](https://xiegu.eu/downloads/)
- [G90 v1.81 release](https://xiegu.eu/sdm_downloads/xiegu-g90-firmware-v1-81-25-08-25/)
- [Operation Manual v5](https://radioddity.s3.amazonaws.com/Radioddity_G90_User_Manual_V5_June_2025.pdf)
- [Firmware-upgrade tutorial](https://xiegu.eu/sdm_downloads/g90-firmware-upgrade-tutorial/)
- [CI-V reference](https://xiegu.eu/wp-content/uploads/sites/4/2023/08/XIEGU-RADIO-CI-V-REFERENCE.pdf)
- [Data-connection tutorial](https://xiegu.eu/wp-content/uploads/sites/4/2020/06/XIEGU-Radio-Data-Communication-Connection-Setup-Tutorial.pdf)
