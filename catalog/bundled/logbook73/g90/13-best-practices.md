# Best practices, installation and clean operating

A radio companion should not finish at “which button.” Good operating is the collection of small choices that keeps the G90 clean, cool, recoverable and welcome on the band. Most of them cost nothing.

## Use the least power that completes the contact

Start low, then raise power when path conditions require it. Twenty watts can make a substantial difference over five watts—6 dB—but an efficient antenna, lower local noise and a better band opening can matter far more.

Low power:

- reduces battery drain and case heat;
- makes RF feedback less likely;
- reduces interference if something is misconfigured;
- eases ATU/feedline stress; and
- encourages cleaner gain settings.

This is not a rule that every difficult contact must remain QRP. If your licence and equipment allow 20 W and it improves a legitimate exchange, use it. The practice is to choose power, not leave it permanently at maximum.

## Listen before transmitting

The waterfall is helpful but not sufficient. A station may be between words, a digital signal between time slots, or a weak caller invisible in auto-scaled noise. Listen through at least one complete interval. On voice, ask “Is the frequency in use?” and leave time for a weak reply. On CW, send `QRL?` where customary. On data, observe multiple cycles.

A tune carrier and SWR sweep are transmissions too. Run them on a clear permitted frequency and keep them short.

## Keep speech clean

Mic gain and compressor are not volume controls for overcoming propagation.

1. Start MIC Gain near 10 and CMP off.
2. Speak 3–4 cm across the microphone in a normal voice.
3. Monitor off-air through a correctly attenuated receiver or ask a trusted station.
4. Remove room echo/fan noise before adding compression.
5. Use CMP only when its higher average level improves intelligibility.
6. Cure RF feedback with antenna/chokes/layout, not lower-quality audio settings.

Identify at the intervals and in the form your licence requires. Avoid roger beeps, excessive phonetics and long monologues on a calling frequency.

## Keep digital modes linear

Use U-D/L-D, rear ACC audio, compressor off and calibrated levels. On v1.81, keep digital ALC **at or below 50**. An old recommendation for a high ALC bar belongs to a different indication and can create a broad signal now.

Digital power is continuous for long intervals. A 20 W FT8 transmission heats the PA far more than speech whose average is a fraction of its peaks. Start around 5 W, give the body air and stop if it becomes abnormally hot. A contact completed at 5 W is no less valid.

Watch your transmitted width with an independent receiver/SDR when setting up. In FT8, stay within the allocated activity window and avoid transmitting on top of an ongoing station simply because you cannot decode it.

## Treat the tuner as a convenience, not absolution

Build/choose an antenna near the band of use. Use the correct transformer, counterpoise and choke. Measure it before asking the internal ATU to search. Bypass the tuner on a good resonant match; leave it in after a needed successful match.

If the tuner cannot find a match within its roughly 5:1 range, change the antenna. Repeated relay searches, raised threshold or more power are not improvements. High feedline loss can make the radio see a pretty SWR while the antenna radiates poorly.

At portable sites, secure wire ends high and visibly. Keep people away from end-fed high-voltage points, and never throw conductive line near overhead power cables. Stop before darkness/weather makes recovery unsafe.

## Preserve receiver headroom

Use PRE only when signal-to-noise ratio improves, usually on quiet upper HF. On lower bands, normal/ATT and lower RF Gain often hear more cleanly. The noise floor does not need to fill the S-meter.

Use NB only for repetitive pulses and the filter only as narrow as intelligibility allows. Extreme DSP settings can make a signal sound impressive while removing information. Restore both BPF defaults when changing to an activity needing wider audio, particularly FT8.

## Develop a before-PTT scan

In two seconds, read:

`frequency → mode → SPLT/B → power → SWR/ATU → input/CMP/VOX`

On CW add QSK. On digital add the selected PC device/ALC. On an amplifier add band and drive.

This prevents transmitting on an old split frequency, driving an amplifier at 20 W, speaking into U-D's muted microphone or calling with an antenna network recalled from another band.

After the QSO, clear SPLT and RIT immediately. Habits work because they occur before memory fades.

## Power and cable discipline

- Fuse positive close to the source.
- Use negative-ground `13.8 V` within the `10.5–16.5 V` limit.
- Size cable for current and length; measure voltage at the radio during transmit.
- Label earlier mini-Tamiya and later Powerpole leads clearly.
- Strain-relieve the detachable-head cable and use the proper one-to-one wiring.
- Keep DC, RF and audio/control cables separated where practical.
- Never defeat protective earth to remove hum; use isolation/chokes and correct station bonding.
- Shut down until `BYE`, then disconnect for transport.

Inspect portable leads for crushed insulation and connectors after every trip. Anderson contacts not fully seated can make intermittent heat and voltage drop.

## Cooling

Do not cover the body with a logbook, battery or rain bag. Leave air around fins/vents. Mount a remote body where warmed air can escape. In sunlight, shade it without enclosing it.

Temperature depends on duty cycle, ambient air, supply voltage and SWR. A comfortably warm case is normal; rapidly rising heat, odour or power foldback is a stop signal. Allow cool-down and diagnose before continuing.

## CAT and computer hygiene

Boot before connecting/starting polling. Close CAT programs before shutdown and prevent two applications fighting for the same serial port. Use a single coordinator such as Flrig when several programs need radio state.

Name/record serial and audio devices. OS updates often select the built-in microphone, causing either silence or room audio transmission. Disable audio enhancements. Add ferrites near both ends and use isolation if devices reset only on transmit.

Back up software configurations, but do not assume they back up radio memories.

## RF exposure and the operating position

Twenty watts is modest, not harmless. Exposure depends on frequency, antenna gain, duty cycle, distance and local limits. A short portable whip beside the operator can create greater exposure than a full-size wire well away at the same transmitter setting. Digital and AM carriers have higher average duty than SSB speech.

- Follow the exposure assessment/control rules of your licence authority.
- Keep radiating elements and end-fed high-voltage ends away from people.
- Put the antenna outside and separated from the desk where possible.
- Reduce power and increase distance during tuning/tests.
- Prevent public access to the controlled antenna area.
- Reassess after changing antenna, band, power or duty cycle.

The internal tuner changes impedance at the radio but does not reduce exposure around the antenna. A low displayed SWR is not an exposure calculation.

## Keep a clean band footprint

A spectrum display makes it easy to notice other people's wide signals; apply that awareness to your own station. Overdriven SSB grows beyond its expected 2.7 kHz region. Overdriven PSK/FT8 grows sidebands and raises noise around the signal. Poorly sequenced or shaped keying spreads CW clicks.

Monitor with a separate receiver/SDR at a level that does not overload it. A dummy-load sample through suitable attenuation is better than listening two metres away on an antenna. Check more than one band because common-mode RF and microphone response vary.

If using an amplifier, configure drive, PTT timing and output matching per band. Never let ALC between unrelated manufacturers become the only power control. Reduce G90 power explicitly and keep the amplifier within its linear and duty-cycle ratings.

## Firmware hygiene

- Record APP and BASE versions/build dates.
- Download only from Xiegu/authorised sources.
- Read release notes before installing.
- Keep APP/BASE files clearly labelled and paired.
- Use stable power and XMODEM Send `1K` per official tutorial.
- Record all 64 channels and settings first.
- Reset and verify as the bundle directs.
- Recalibrate digital audio after a release that changes ALC.

Do not update the evening before an essential activation unless the current firmware makes the activation impossible. Leave time to reset, test receive, dummy-load transmit, ATU and computer integration.

## Memory and station records

Keep a small station document containing:

- hardware revision/serial;
- APP/BASE version and official bundle source;
- supply and fuse rating;
- microphone/key wiring;
- System Menu values, especially AUX and RCLK;
- 64-channel memory list;
- known-good SSB/CW/digital baseline;
- antenna matches by band; and
- cable/interface driver/device names.

This transforms a future fault from archaeology into comparison. Photograph the Version page and connector layout when travelling.

## Portable etiquette

POTA, SOTA and other activations attract pile-ups. State the callsign and reference clearly, but keep exchanges efficient. Acknowledge partial calls, request repeats calmly and avoid berating callers. If two stations double, identify enough characters to separate one.

Do not occupy a general calling frequency for a long activation. Respect established nets, emergency traffic and regional mode centres. Spotting/logging conveniences never outrank what you actually heard; correct a callsign before uploading.

Pack out wire, line, tape and cable ties. Do not damage trees, monuments or fences, and get site permission. Radio achievement does not justify unsafe access.

## Mobile safety

Install body/head/cables outside airbag deployment zones and away from pedals. Fuse at the battery/source and protect cable through bulkheads. Bond the antenna mount correctly. Configure controls while stationary.

No radio contact is worth divided attention. Local hands-free rules may still prohibit or restrict microphone operation, and legality does not equal safety. Pull over for filtering, logging, split operation or antenna tuning.

## Courtesy in troubleshooting

If another operator reports a broad or distorted signal, thank them and reduce drive/power while investigating. Do not demand proof on air. Move to a dummy load and monitor. Conversely, give useful reports: frequency, observed width, whether distortion tracks speech, and your receiver conditions.

Avoid prolonged carrier tests on busy bands. Use a dummy load for bench work and announce a brief test with callsign where radiating is unavoidable and legal.

## Periodic care

Every few months or before field season:

1. Inspect DC fuse/contacts and coax connectors.
2. Verify supply voltage under a dummy-load transmission.
3. Check fanless cooling surfaces/vents for dust.
4. Exercise ATU at low power on a suitable load.
5. Confirm APP/BASE records and whether a relevant official fix exists.
6. Test CAT, ACC PTT and audio at one watt.
7. Check paddle/microphone cables for strain.
8. Compare frequency against a trustworthy reference without altering RCLK unless needed.
9. Review memories/band-plan changes.

Do not open the radio merely for routine curiosity; internal RF and static risks exceed the value without a service task and competence.

## Responsible ownership transfer

Before selling or lending:

- clear/change startup callsign;
- remove personal memories where appropriate;
- disclose hardware revision and APP/BASE versions;
- include the correct DC/head cables and fuse information;
- identify any modified ACC/key wiring; and
- explain that the manual baseline may be older than v1.81.

Never hide an intermittent connector or failed update. A precise fault description protects the next operator and improves the chance of repair.

## Key takeaways

- Listen first, use the least power required and keep speech/data clean.
- v1.81 digital ALC is ≤50; duty cycle makes cooling as important as peak watts.
- Preserve receiver headroom and use the ATU only within a sensible antenna system.
- Make a before-PTT scan and an after-QSO SPLT/RIT clear routine.
- Record versions, settings, memories and cable identities before trouble or updates.
- Good amateur practice includes safety, spectrum courtesy, accurate logging and care for the operating site.

The final [Quick reference](outpost:entry/logbook73.guide.g90/quick-reference) condenses the whole companion into a printable field card.
