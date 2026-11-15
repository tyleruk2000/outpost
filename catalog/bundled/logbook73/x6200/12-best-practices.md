# Best practices

Good X6200 operation is mostly a collection of small habits: verify before keying, use the antenna before watts, keep heat and lithium batteries in mind, preserve a known-good configuration, and update only with evidence. These habits make the radio feel simpler because fewer unexplained states accumulate.

## Antenna first

A watt lost in a poor antenna system never reaches the other station. Before adding power:

- use the largest efficient resonant antenna the site allows;
- keep feedline short/low-loss, especially on 6 m and VHF receive;
- support adapters so the BNC socket carries no heavy cable leverage;
- give monopoles/end-fed wires a deliberate counterpoise/return path;
- add a common-mode choke and ferrites where feedline/current enters station cables;
- physically adjust resonance, then use the internal tuner for final correction.

The ATU's roughly 20–175 Ω match range is useful, not miraculous. Low radio-side SWR does not prove high radiation efficiency.

## Use the least power that completes the contact

Start 1–5 W. Move toward the 8 W external maximum only when supply, antenna and situation justify it. A change from 5 to 8 W is about 2 dB—not a dramatic S-meter leap—while improving antenna placement or moving out of local noise can be transformative.

For sustained data, follow Xiegu's `≤5 W` recommendation. For the documented XPA125B/L4001 setup, follow the later Rev 05 manual's more conservative `≤2 W` X6200 drive limit. An amplifier adds RF exposure, harmonics/interference, supply and cooling responsibilities; establish a clean barefoot station first.

## Respect duty cycle and heat

Speech has pauses and variable envelope. FT8, RTTY and tune carriers are sustained. The small enclosure can become hot even at modest power.

- provide free airflow around the chassis/rear pack;
- shade from sun;
- do not wrap in a case while transmitting;
- reduce power before extending intervals;
- allow receive/cool-down gaps;
- avoid heavy transmit while simultaneously charging;
- stop if output falls, the radio smells unusual or the battery becomes abnormally hot.

“QRP” does not mean thermally unlimited.

## Treat the removable battery well

- Charge the powered-off radio with the supplied charging adapter and CHARGER ON.
- Charging below 0°C is inhibited; do not try to defeat it.
- Remove panel for long storage and keep around 40–50%, cool and dry.
- Do not leave fully empty or indefinitely full/on charge.
- Protect the rear panel from impact.
- Replace, do not repair, a swollen/leaking/damaged pack.
- Carry spares so contacts cannot short against metal.

Normal capacity declines with age/cycles. A shorter runtime is not a reason to overvoltage the DC input.

## External power discipline

Use a regulated `12–15 V DC`, centre-positive communications supply rated at least `3.5 A`, fused near its source; `13.8 V` is the normal station choice. Verify polarity with a meter once and label the lead. Current manufacturer V06 additionally rates the input `9–15 V` and says a fitted battery takes over below `11 V`, whereas the Xiegu EU English material specifies `12–15 V`. Never exceed `15 V`. The supplied charging adapter is charge-only: use it with the radio powered off and never as a transmit supply.

The manual notes roughly 100 mA consumption from external power while the radio is off because charging management remains active. Disconnect at the source for storage. If external voltage falls below about 11 V with the battery fitted, the radio may switch to battery; plan wiring so that transition is not mistaken for charging.

## Build a known-good receive state

Memorise:

```text
AGC AUTO · PRE OFF · ATT OFF
RFG high · SQL open
DFL default/normal
NR OFF · NB OFF · NOTCH OFF
RIT 0 · XIT 0 · SPLE OFF
```

Start there, then apply one tool for one symptom. This prevents last night's notch or narrow CW bank from ruining today's voice reception.

## Use DSP with restraint

- DFL for adjacent energy/hiss outside the wanted audio.
- NR for broadly random steady noise.
- NB for repetitive impulses.
- NOTCH for one steady unwanted tone.
- ATT/RFG/external filter for overload.

Deep NR and aggressive NB can be more tiring than noise. Digital decoders usually want a complete unprocessed passband.

## Keep transmissions clean

### Voice

Set MIC SEL and the active mic gain with COMP/EQ off. Check on a second receiver. Add modest compression/EQ only if intelligibility improves. Speak consistently 5–10 cm from H-22 for recordings and similar controlled distance for live operation.

### Data

Use correct USB output, COMP off, LINE IN and application audio below clipping. Raise from low until clean desired RF output. Exact time, correct dial/mode and antenna are more important than maximum ALC/power.

### CW

Correct TRS wiring, standard weighting, copyable speed, sensible QSK. Tune received pitch to TONE before narrowing. Treat decoder output as a clue to verify, not a callsign oracle.

## Stay legal and considerate

- Know licence class, band edges, mode/power limits and identification rules.
- The screen's coloured allocation strip is guidance for a particular plan, not law.
- WFM and 108–136 MHz airband are receive-only.
- Listen and ask before transmitting.
- Tune/SWR scan only on clear legal frequencies at low power.
- Avoid automatic repeated calls without listening.
- Protect privacy and follow national monitoring rules.
- Log date/time in UTC, frequency, mode and exchange accurately.

Remote control does not transfer responsibility to software. The licensed operator remains responsible for every transmission.

## Firmware without drama

Before update:

1. Read release notes and ask whether a fix/feature is needed.
2. Photograph SYSTEM INFO and settings.
3. Download only authorised X6200 files; verify checksum.
4. Read the exact tutorial end-to-end.
5. Prepare stable 13.8 V external supply and remove battery as directed.
6. Complete both system-image and baseband stages.
7. Verify versions/features, then test receive and dummy-load transmit.

Do not install an X6100 image, interrupt writing, or assume `FIRMWARE UPGRADE` alone is the full process. Do not reset unless release instructions or real corruption justify it.

## Version-aware support

Write in every support request:

- system/baseband versions from SYSTEM INFO;
- power source;
- mode/band;
- whether issue occurs on bare radio/dummy load;
- attached DEV/HOST/ACC/key devices;
- exact reproduction steps.

Remember: CW decoder/FT8CN/WR12/network info arrive in 1.0.6; DISPLAY page 3 and several critical fixes arrive in 1.0.7; CW MODEM option disappears intentionally.

## Network safely

- Join only trusted Wi-Fi; keep password out of screenshots.
- Give static IP/gateway carefully and avoid address conflicts.
- WFSERVER is a separately started service—stop it when unused.
- Do not forward it directly to the internet; use an understood VPN/firewall.
- Test remote receive before remote PTT.
- Provide independent shutdown if lawful unattended use is planned.
- Bluetooth connection is not proof of supported profile or safe PTT.

## Keep port roles clear

- DEV to computer for CAT/audio.
- HOST for one supported low-power peripheral or WR12; no hub.
- CARD for authorised system/update image and supported storage.
- ACC for documented control/ALC/band signals, not headphones/audio.
- KEY and S/P require correctly wired stereo plugs.

Label cables. A charge-only USB lead and wrong mono adapter can waste hours or key the transmitter.

## Create a pre-flight card

Before leaving home:

```text
Radio + battery seated / spare protected
Correct antenna, feedline, counterpoise, choke
Mic/key/headphones and correct adapters
Licence/band plan, UTC clock, logging method
Firmware/settings photo
Weather protection and safe antenna supports
Dummy load for setup if practical
```

Before PTT:

```text
Frequency/mode legal and clear
VFO / RIT / XIT / SPLE checked
Antenna connected; ATU match valid
Power appropriate; supply stable
Mic/data/key path correct
People clear of antenna
```

After operating:

```text
SPLE/RIT/XIT cleared
Temporary DSP/notch reset
WFSERVER/Bluetooth/Wi-Fi off if unused
Logs saved/backed up
Orderly shutdown; antenna/power disconnected
Battery stored safely
```

## Preserve settings without preserving mistakes

Keep a compact configuration record of mic/line gains, H-22 keys, EQ, DFL/CW values, display and network plan. After a factory reset, restore in groups and test. Do not blindly reproduce every number; some values may have caused the original fault or changed meaning with firmware.

Photographs are excellent for menus, but store network passwords separately and securely.

## Field care

- Keep dust/water out of open CARD/USB/KEY ports.
- Use a screen cover and transport protection around knobs.
- Do not leave in a hot vehicle/direct sun.
- Strain-relieve coax, power and H-22 lead.
- Keep antenna away from people, overhead lines and lightning.
- Wipe with a soft dry/slightly damp cloth; no solvents.
- Wait at least five seconds between shutdown/startup.

## Improve your station by measurement

Change one variable and record:

- received numeric level/noise (SHOW RX LEVEL on 1.0.7) under same span/gain;
- SWR with ATU bypassed and antenna geometry noted;
- battery start/end and transmit minutes;
- audio report/recording with mic gain/COMP/EQ;
- FT8 decoder input/ALC and power;
- firmware version.

Repeatable notes beat memory and internet folklore.

## Key takeaways

- Antenna, noise and operating skill matter more than moving 5 W to 8 W.
- Use ≤5 W for sustained data, airflow and pauses; avoid charging heat during heavy TX.
- Protect and partly charge the removable battery for storage; never exceed 15 V externally.
- Begin every diagnosis from a neutral receive/transmit state.
- Set clean mic/line/keying before compression, EQ or power.
- Treat band overlay, airband/WFM and automatic messages with legal/courtesy discipline.
- Firmware updates are two-stage, authorised and version-verified.
- Keep WFSERVER private and distinguish DEV, HOST, CARD, ACC, KEY and S/P.
- A pre-flight card and configuration record prevent most field failures.

Finish with the printable [X6200 Quick Reference](outpost:entry/logbook73.guide.x6200/quick-reference).

### References

- [X6200 public English manual and safety guidance](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200-USER-MANUAL-V01-PileupDX.com.pdf)
- [Official firmware/release notes](https://xiegu.eu/downloads/)
