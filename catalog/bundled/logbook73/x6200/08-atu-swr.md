# The automatic tuner and SWR scanner

The built-in tuner is one of the X6200's best field features, and one of the easiest to misunderstand. It transforms impedance so the transmitter sees an acceptable load. It does not repair a broken feedline, make a short lossy wire efficient, broaden a legal band edge, or lower RF exposure. A low displayed SWR after tuning means the **radio** is happier; it does not measure how much power reaches the horizon.

## SWR in one minute

An ideal 50 Ω transmitter sends power into a 50 Ω feed system. If the load impedance differs, some energy reflects toward the radio. Standing-wave ratio expresses the forward/reflected voltage relationship:

- `1:1` is an ideal match;
- around `1.5:1` is generally comfortable;
- `2:1` is often usable, depending on radio/feedline;
- high ratios may trigger protection, loss and tuning failure.

SWR is not antenna gain or radiation efficiency. A resistor can show 1:1 while radiating almost nothing. [SWR](outpost:entry/logbook73.handbook/swr), [Impedance](outpost:entry/logbook73.handbook/impedance) and [Antennas](outpost:entry/logbook73.handbook/antennas) give the full theory.

## What the X6200 tuner is specified to match

Xiegu specifies the internal ATU for approximately `20–175 Ω` loads at the antenna port. It gives a normal initial tune time of up to about `10 seconds` and memory recall near `0.1 second` under specified conditions. Those are not promises for every reactive antenna: impedance can be 50 Ω in magnitude yet highly reactive, or outside range at one end of a band.

The tuner sits inside the radio. Any loss in the feedline between tuner and antenna still occurs under high SWR. A remote tuner at an antenna feed point is often more efficient for a severely non-resonant system.

## Enable versus tune

The top ATU button has two distinct actions:

- **short press:** inserts/enables the ATU. An `ATU` icon appears. No new match is searched.
- **long press for about one second:** while enabled, begins automatic tuning.

After a successful match, leave ATU enabled to keep that matching network in the path. Bypassing it removes the match. If the antenna is naturally resonant at the current frequency, bypassing may reduce needless loss.

An ATU icon that flashes when transmitting after a previous match indicates the present SWR is still high and retuning is needed.

## Safe tuning, step by step

1. **Inspect the system.** Antenna connected, feedline intact, connectors dry/tight, no person near the radiator.
2. **Choose a clear legal frequency.** Listen first. Tuning transmits a carrier, so do not tune over a QSO, beacon or calling channel.
3. **Reduce power.** Use the minimum reliable tuner drive. The radio manages its tune carrier, but low selected power is a good discipline.
4. **Select the correct band/mode context.** Verify no split/XIT can place TX elsewhere.
5. **Short-press ATU** until the icon shows enabled.
6. **Long-press ATU** for about one second, then release and let the cycle complete.
7. **Read the result.** Confirm it returns to receive and SWR on a brief low-power transmission is acceptable.
8. **If it fails, stop.** Do not repeat indefinitely. Change antenna length/tap/counterpoise or use the correct external matcher.

Identify during tuning where required by local regulation. Even where a short adjustment carrier is permitted, courtesy still requires a clear frequency.

## Tuner memories

When returning near a previously matched frequency, the ATU can recall a stored solution far faster than a full search. That is why a remembered tune may appear nearly instant.

Memory is frequency-associated, not antenna-aware. If you change from a dipole to an end-fed wire while remaining on the same frequency, force a fresh tune rather than trusting the old network. The same applies after changing feedline, counterpoise, wet/dry conditions or antenna height.

## When not to use the tuner

Bypass ATU when:

- a resonant antenna already presents a good match;
- measuring the raw antenna with SWR SCAN or an analyser;
- an external tuner is doing the matching and the two would interact;
- troubleshooting a suspected tuner fault;
- the connected amplifier/tuner instructions require a defined state.

Two tuners can find a low displayed SWR while creating high circulating currents and unpredictable loss. Use one matching strategy at a time.

## SWR SCAN

Open `APP → SWR SCAN`. The documented controls are:

- `START`: begin, and press again to stop;
- `STEP`: change scan spacing;
- `EXIT`: leave the scanner.

The scanner makes test transmissions at a set of points and displays a match curve. That makes it useful for quick questions:

- Is the antenna's lowest-SWR region below or above the intended frequency?
- Did changing whip length move resonance the expected way?
- Is one band broadly usable before an activation?

It is not the tool for precision impedance, feedline loss or component design. The manual calls its results reference-only and recommends professional analysis equipment for accurate measurements.

## A safe scan workflow

1. Select a narrow range wholly inside an amateur allocation you may use.
2. Listen across it; avoid active frequencies.
3. Set low power and bypass the ATU if measuring the antenna itself.
4. Select a step coarse enough to minimise transmissions but fine enough to show the dip.
5. Start and observe; stop when sufficient.
6. Let the radio cool between repeated adjustments.
7. Re-enable/retune ATU only after the raw measurement is complete.

A separate antenna analyser is better because it receives its own tiny test signal rather than placing normal transmitter power on air and can be calibrated at the measurement plane.

## Reading the curve

A smooth dip suggests a resonance/match region. If the minimum is below the desired frequency, many simple wire/whip antennas are electrically too long; if above, too short. That rule is useful but not universal for traps, matching networks and multiband systems.

A flat high line can mean:

- disconnected/broken feedline;
- antenna far outside the scan or tuner's range;
- wrong connector/adapter;
- very lossy system that hides resonance;
- scanner/ATU state confusion.

A jagged or changing line can mean intermittent contact, moving wire, RF interaction with the operator, low supply, or nearby objects. Fix mechanics before chasing millimetres of element length.

## Portable antenna sequence

For a linked dipole, adjustable whip or coil:

1. Erect it in the intended position with counterpoise/feedline deployed.
2. Use an analyser or bypassed low-power SWR scan to find the raw dip.
3. Adjust physical length/tap toward the operating segment.
4. Repeat until raw SWR is within a sensible range.
5. Enable and tune the internal ATU for the final small correction.
6. Recheck after rain, movement, band change or people leave the near field.

Physical resonance first, tuner second usually gives more radiated power and less feedline stress than making the ATU correct everything.

## Monopoles, end-fed wires and RF in the shack

The manual specifically warns that whip/monopole and long-wire systems need proper grounding/counterpoise and common-mode control. Without a return path, the radio body, microphone lead and USB cable become part of the antenna. Symptoms include:

- touch-sensitive SWR;
- computer disconnects on PTT;
- distorted audio or keyer behaviour;
- tingling/“RF bite” on metal;
- the ATU finding a different solution whenever cables move.

Use an appropriate counterpoise, common-mode choke and ferrite on cables near the radio. Lower power until fixed. Never accept RF burns as normal QRP behaviour.

## Using XPA125B

The manufacturer's appendices document the X6200 connected to the XPA125B amplifier/tuner with the specified L4001 cable. The Xiegu-hosted Rev 01 says `2–3 W`; the later manufacturer-written Rev 05 mirror tightens that to `≤2 W` and warns that excessive input can damage the amplifier. Follow the safer later limit unless current documentation for your exact amplifier revision says otherwise.

Important boundaries:

- use the exact cable and both manuals;
- connect/disconnect powered down;
- establish a good antenna/load at low power first;
- verify ACC, ALC and band behaviour on a dummy load;
- if the XPA125B is not being used, disconnect the ACC cable or keep the amplifier powered with PA/ATU off as its instructions require;
- an amplifier changes licence, RF exposure, supply, cooling and interference responsibilities.

The X6200's internal ATU and the amplifier's tuner should not be allowed to fight each other. Decide which tuner is active under the documented accessory configuration.

## Using GPA100

Current manufacturer V06 adds a GPA100 appendix and specifies **`2–5 W`** drive from the X6200. That is a different amplifier path, not permission to raise drive into an XPA125B. Follow the GPA100's own current manual for cabling, ALC/band control, supply and tuner order; begin at `2 W` into a dummy load and increase only within the documented range when the complete system is behaving correctly.

The same station responsibilities apply: amplified RF changes exposure calculations, licence limits, cooling, common-mode current and interference risk. Prove the X6200 barefoot before adding either amplifier.

## Common tuner failures

### Tune starts but never finds a match

- impedance outside roughly 20–175 Ω or too reactive;
- open/short/intermittent feedline;
- insufficient tune drive from weak supply/battery;
- antenna changed but memory solution reused;
- wrong band or external tuner state.

Stop repeated cycles. Test a dummy load: if it shows a good match, the antenna system is the likely problem.

### SWR good after tune, contacts still poor

- antenna inefficient/too short;
- feedline loss under high raw SWR;
- propagation/noise;
- poor counterpoise;
- low battery limiting power.

Low SWR protects the transmitter; it does not guarantee radiation.

### ATU icon present, tune did not run

You short-pressed only. Long-press about one second while enabled.

### Good match changes when touching microphone

Common-mode RF/insufficient return path. Improve counterpoise/choking and keep people from becoming part of the antenna.

### Scan looks good only with ATU on

You are plotting the matched radio-side impedance, not raw antenna. Bypass to inspect antenna.

## Try it yourself

Use a 50 Ω dummy load:

1. measure/observe SWR with ATU bypassed;
2. short-press ATU and note icon only;
3. long-press and observe how quickly an already-good load completes;
4. open SWR SCAN at minimum power within a legal segment and stop it manually;
5. repeat with the antenna only after mastering the controls.

## Key takeaways

- Short ATU inserts; long ATU tunes. Leave it inserted to retain the match.
- The internal match range is specified around `20–175 Ω`; it cannot match every reactive load.
- Tune only on a clear legal frequency, at low power, with nobody near the antenna.
- A low post-tuner SWR protects the radio but does not prove an efficient antenna.
- SWR SCAN is a transmitting reference plot, not a calibrated VNA.
- Tune/scan the actual antenna configuration and force a new solution after changing it.
- For monopoles/end-fed wires, provide a return path and common-mode choking.
- XPA125B use requires its exact cable/manual and `≤2 W` drive under the later Rev 05 X6200 guidance.

Next, [USB, CAT, Wireless, WR12 and Firmware](outpost:entry/logbook73.guide.x6200/connectivity-firmware) connects the radio without risking its software or ports.

### References

- [X6200 public English manual](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200-USER-MANUAL-V01-PileupDX.com.pdf)
- [Manufacturer-authored Rev 05 manual mirror](https://radioddity.s3.amazonaws.com/Xiegu_X6200_Manual_20240925.pdf)
