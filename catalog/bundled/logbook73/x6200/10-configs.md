# Ready-made X6200 configurations

These recipes are starting configurations, not magic numbers. They tell you which controls matter, which should be neutral, and the order in which to adapt. Keep a written copy of your own mic/line gains and filter edges; values depend on voice, antenna, computer and firmware.

## How to use a recipe

Each has four stages:

1. **Safety/state:** antenna, band, power, split/offset and PTT.
2. **Receive:** mode, AGC, PRE/ATT/RFG, DFL and DSP.
3. **Transmit/application:** mic/data/keyer/tuner.
4. **Prove and save:** dummy-load/off-air test, then shortcut/memory.

At the end of any specialised session, use this “home state”:

```text
SPLE OFF · RIT 0 · XIT 0 · PTT NORMAL
PRE OFF · ATT OFF · AGC AUTO
NR OFF · NB OFF · NOTCH OFF
MIC SEL AUTO · COMP OFF
ATU state checked · CHARGER state checked
```

## 1. First HF SSB voice QSO

### Safety/state

- Resonant or tunable 50 Ω antenna connected.
- Legal clear frequency in the voice segment.
- `SPLE OFF`, RIT/XIT zero, `PTT MODE NORMAL`.
- 1–5 W initially; external or healthy battery supply.

### Receive

- LSB on 160/80/40 m or USB on 20 m and above by normal convention.
- AGC AUTO, PRE/ATT off, RFG high, SQL open.
- DFL natural-voice bank; NR/NB/notch off.
- `RF FFT SPAN 96 or 192 kHz`; waterfall reference shows weak traces without a solid sheet.

Tune until pitch is natural. If background is tiring, trim DFL first, then shallow NR. Use ATT/RFG rather than deep DSP for overload.

### Transmit

- `MIC SEL AUTO` with H-22 fitted, or deliberate HANDLE/BUILT-IN.
- Correct mic gain already checked; EQ MIC and COMP off initially.
- If SWR needs matching, move clear, enable ATU and long-press tune.
- Ask if frequency is in use, call, exchange and log UTC.

### Improve and save

Add COMP only after another receiver confirms clean audio. Save the frequency/state to MEMORY if it is a regular net; never assume a stored frequency remains clear/legal.

## 2. Portable SOTA/POTA-style voice

### Pack/setup

- X6200, detachable battery plus protected spare if available;
- lightweight resonant/link dipole or efficient vertical with real counterpoise;
- short low-loss feedline, BNC support, key/mic, headphones;
- weather cover, station clock/logger, licence/band-plan reference;
- common-mode choke/ferrites for end-fed/monopole systems.

### Radio

- Backlight low, screen saver/dim enabled.
- HAM BAND navigation, H-22 F1 PRE, F2 NR, F3 FILTER.
- 2–5 W voice; increase toward 8 W only on adequate external supply and when it genuinely helps.
- ATU after physical antenna adjustment; never tune on an occupied frequency.
- Voice-call recording can repeat a short CQ, but listen between calls and check reference/callsign.

### Field discipline

Use a broad filter to find responses, then a crowd filter. Keep PRE off on noisy lower bands. Watch battery/temperature, especially in sun. Log as you go; a tiny radio does not excuse missing required exchange data.

## 3. CW portable activation

### Radio-off setup

- Correctly wired 3.5 mm TRS paddle/key connected while off.
- Antenna adjusted and matched, minimum test power.

### KEY

- KEY TYPE matches hardware.
- KEY SPEED at a reliably copyable rate.
- Familiar IAMBIC mode; comfortable TONE/TONE LEVEL.
- Standard DI/DA, moderate QSK TIME.
- CW TRAINER used before radiating.

### Receive/transmit

- CW/CW-R chosen to put interference away from wanted station.
- DFL SEARCH bank, tune pitch to TONE, then QSO/PILE-UP bank.
- AGC FAST/AUTO; NR shallow/off; NOTCH off.
- CW decoder on `1.0.6+` only after centring; threshold appropriate to noise.
- Text MSG memories hold concise CQ/report/TU strings, checked before use.

At 3–5 W, a good antenna and accurate timing outperform maximal speed. Turn SPLE/RIT/XIT off after any pile-up operation.

## 4. FT8 with a computer over USB

### Connection

- Data-capable cable from `DEV` to computer.
- CH342 driver if needed; native XIEGU X6200 rig model.
- Correct serial control port, X6200 recording device and X6200 playback device.
- Computer clock synchronised precisely.

### Radio

- Published FT8 dial frequency and USB/data-appropriate mode.
- DFL wide enough for full decoder audio range.
- AGC AUTO; NR/NB/notch off; COMP off.
- LINE OUT set for receive meter below clipping.
- LINE IN/application audio raised from low until clean 1–5 W output.
- Matched antenna, airflow, CHARGER off if heat is a concern.

### Proof

First prove decode. Then CAT frequency read/write. Then PTT into a dummy load. Finally verify transmitted audio on a separate receiver. Xiegu recommends data power `≤5 W`, longer gaps and cooling.

Do not change LINE IN, application output and power simultaneously. If no one decodes, check time and overdrive before adding watts.

## 5. FT8 with FT8CN

### Requirements

- Firmware `1.0.6` or newer for full Bluetooth support.
- Compatible Android device/app and accurate phone time.
- `SETTING 2 → BUILT-IN ON`.

### Pair and prove

1. SYSTEM → BLUETOOTH ON, SCAN, connect.
2. Follow current FT8CN documentation for X6200 selection/permissions.
3. Verify receive/frequency control without PTT.
4. Use the correct FT8 dial/mode/filter.
5. Test transmit into dummy load at low audio/power.
6. Operate at ≤5 W with airflow.

A Bluetooth “connected” icon proves only the transport. If decode works but PTT does not, isolate app rig control, permissions and radio state rather than re-pairing blindly.

## 6. Radio-only FT8 activity check

Use `APP → FT8 DECODER` when you want to know whether a band is open without completing contacts.

- Set exact UTC/time and known FT8 dial frequency.
- USB/data-appropriate receive mode, broad enough DFL.
- No NR/NB/notch; AGC AUTO.
- Wait for several complete 15-second receive periods.

The screen decodes received messages only. Do not expect selecting a line to produce the full exchange/logging sequence.

## 7. RTTY/BPSK with built-in MODEM

### Receive

- APP → MODEM; choose correct MODE.
- Match FC/TONE and RATE/SPEED to the service.
- Correct sideband and DFL containing all tones.
- AFC off while manually centring, then on for small drift if useful.
- MODEM SQL low; CLEAR before a new sample.

### Send

- Prepare five MSG text slots, plain supported characters.
- Low power, matched antenna, clear/legal frequency.
- Preview message; transmit the selected slot.

On firmware `1.0.7`, CW is no longer a MODEM choice. Use KEY-page decoder/MSG CW workflow.

## 8. Shortwave listener

- `BANDSTACK ALL BAND` for broad navigation.
- AM for broadcasts; DFL choose 15 kHz clear/strong, 12 normal, 9 crowded on `1.0.7`.
- AGC SLOW/AUTO, PRE off initially, ATT/RFG for strong-station overload.
- EQ-RX can trim small-speaker mud after DFL is correct.
- 192/384 kHz span to survey; waterfall speed SLOW to retain intermittent stations.
- Save stations in MEMORY with concise tag, but schedules/frequencies change.

For synchronous or exotic modes not implemented by stock radio, route receive audio/IQ-like data as supported to external software; the X6200 has no X6100-style physical I/Q OUT port.

## 9. WFM broadcast listening

- Enter WFM receive band; match WFM STEP to local channel plan.
- Use broad WFM audio path and AGC as provided.
- EQ-RX(WFM) starts flat. Avoid boosting 50 Hz into the small speaker.
- Choose S/P EAR PHONE for headphones, SPEAKER for an external speaker.
- Firmware `1.0.7` fixes silence after WFM sat idle; check version if the symptom repeats.

WFM is receive-only. Do not confuse it with NFM communications mode.

## 10. Airband monitoring

- ALL BAND navigation, aviation group, AM.
- VHF-suitable antenna; line of sight matters.
- Correct channel step/filter for the displayed build and local plan.
- SQL can be set just above noise for channel monitoring, but too high hides weak aircraft.
- PRE only if receiver/system noise, not external noise, is limiting.
- Save local receive channels with clear tags.

Airband is receive-only. Follow national monitoring/privacy rules and never act as an aviation station.

## 11. Home/base station

### Power and RF

- Regulated 13.8 V, centre-positive, ≥3.5 A, fused leads.
- Support coax/adapter so BNC bears no heavy leverage.
- Common-mode choke and station grounding/bonding appropriate to local electrical code.
- Disconnect antenna/power for storms.

### Usability

- S/P SPEAKER for proper external speaker; never headphones at speaker level.
- Backlight comfortable, screen saver less aggressive.
- WFSERVER only on trusted LAN; stop when not used.
- DEV USB for logger/CAT; isolate RF feedback with routing/ferrites.

### Optional amplifier

For the documented XPA125B/L4001 setup, follow both manuals and keep X6200 drive at `≤2 W`, the later Rev 05 limit. Establish clean barefoot operation and load first. Recalculate RF exposure and licence limits at amplified power.

Current manufacturer V06 separately documents the GPA100 at `2–5 W` drive. Do not transfer that range to the XPA125B: use the exact amplifier/cable manual, start at its lower limit into a dummy load and verify ALC/band/tuner behaviour before an antenna.

## 12. Weak-signal/high-noise receive

Start neutral: PRE/ATT off, AGC AUTO, RFG high, DFL correct, all DFN off.

Then diagnose:

1. Strong overload/ghosts? ATT on or RFG down.
2. Quiet high band, weak real signal? PRE on.
3. Adjacent station? DFL edge/CW-R.
4. Smooth noise? shallow NR.
5. Repeating impulses? NB pulse-noise level in small steps, then minimum effective width.
6. Stable whistle? NOTCH FC.

Do not stack all tools. Compare readability after each one. An external broadcast reject/common-mode filter or quieter antenna site often outperforms DSP.

## 13. Battery-conserving receive day

- Backlight 2–4 as comfortable; screen saver/dim/off timers enabled.
- 3D bandscope and AUDIO SCOPE off unless needed.
- Bluetooth/Wi-Fi/WFSERVER off.
- PRE off unless it improves readability.
- Headphones at low level.
- CHARGER state irrelevant on battery but leave deliberate.
- Shut down normally during long breaks; remove battery for storage.

Transmit power dominates energy use. Short, efficient calls and listening more than calling save more than cosmetic display changes.

## 14. Remote receive on a trusted LAN

1. BUILT-IN ON, Wi-Fi configured with stable IP/gateway.
2. Confirm NETWORK in SYSTEM INFO (`1.0.6+`).
3. WFSERVER configure and START; blue WF icon.
4. Compatible client on same trusted LAN.
5. Prove receive frequency/audio control first.
6. Keep PTT disabled until an attended dummy-load test and legal/safety plan exist.

Never forward WFSERVER directly to the public internet as a casual experiment. Use an understood VPN/firewall and independent power-off path for any lawful unattended station.

## Save three personal profiles on paper

The X6200 does not present a one-button profile manager for all settings, so maintain a small card:

| Voice         | CW                      | Data                    |
| ------------- | ----------------------- | ----------------------- |
| mic, EQ, COMP | key type/speed/tone/QSK | line in/out, PC devices |
| DFL banks     | DFL banks/zoom          | DFL/data mode           |
| AGC/DSP       | AGC/decoder threshold   | power/clock/PTT         |

After a factory reset, this card restores intent without copying every old accidental setting.

## Key takeaways

- Neutralise split/offset/DSP before applying a recipe.
- Prove receive, then control, then transmit into a dummy load.
- Voice uses clean mic gain before compression; digital uses clean line audio with COMP off.
- FT8 built-in is an activity decoder; FT8CN or PC completes contacts.
- Use ≤5 W for sustained data and ≤2 W into the documented XPA125B setup under the later Rev 05 guidance.
- Physical antenna adjustment before ATU gives better field performance.
- WFM/airband are receive-only and need their own step/filter/antenna expectations.
- Preserve three written profiles for fast recovery after reset.

If a recipe still fails, use [Troubleshooting](outpost:entry/logbook73.guide.x6200/troubleshooting) rather than changing every value.
