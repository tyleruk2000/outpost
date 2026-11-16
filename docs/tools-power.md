# Power and batteries

Tools → Power and batteries (`/tools/power`) has two parts:

- **Quick calculators**, which keep nothing: battery runtime, solar output and charging,
  cable size and voltage drop, batteries in series and parallel, generator fuel, Ohm's
  law, the resistor colour code, resistors in series and parallel, an LED's resistor and
  a voltage divider.
- **Power plans** (`/tools/power/plans/:id`): a person's own battery system, kept on the
  server under a name, worked out into how long it runs and how much solar it needs.

Everything here is arithmetic on what was typed in. It works with no connection; the
only link out is to PVGIS, for peak sun hours, and it is opened only when pressed. A
plan can also take its peak sun hours from what Weather and hazards has already fetched
from PVGIS (below); this screen itself fetches nothing.

**Electricity can hurt people and start fires.** Every answer is an estimate and
general information. The figures that bear on safety (how much current a cable, a
battery or a charger may carry) come from a named rule or from the maker's data the
person types in, are said to be guidance, and are never filled in by Outpost. Nothing
here replaces the wiring regulations that apply to an installation or a qualified
electrician.

Code: formulas in `apps/web/src/features/power/calc/` (pure functions, tested against
worked examples in `calc.test.ts`); the screens in `apps/web/src/features/power/`; the
plan's types and starting figures in `packages/shared/src/power.ts`; the server's store
in `apps/server/src/modules/power/`.

## Sources

Checked on 16 November 2026 unless said otherwise.

| What | Source |
| --- | --- |
| Nominal cell voltages: lead acid 2 V, LiFePO4 3.2 V, Li-ion 3.6 V | Battery University, [BU-303 Confusion with voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) and [BU-216 Summary table of lithium-based batteries](https://batteryuniversity.com/article/bu-216-summary-table-of-lithium-based-batteries) |
| Round-trip efficiency: LiFePO4 92% (at 1C or less) | Victron Energy, [12.8 V lithium iron phosphate batteries Smart, data sheet](https://www.victronenergy.de/upload/documents/Datasheet-12,8-Volt-lithium-iron-phosphate-batteries-Smart-EN.pdf) |
| Round-trip efficiency: "the average lead-acid battery" 80%, Li-ion 92% | Victron Energy, [Lithium SuperPack data sheet](https://www.victronenergy.com/upload/documents/Datasheet-12%2C8V-%26-25%2C6-Lithium-SuperPack-EN-.pdf) |
| Usable share, LiFePO4 80%: the depth at which the maker rates cycle life (2,500 cycles at 80%) | Victron LiFePO4 Smart data sheet, above |
| Usable share, lead acid 50%: deep-cycle lead acid gives 400 to 500 cycles at 50% depth, 150 to 200 at 100% | Battery University, [BU-201 How does the lead acid battery work?](https://batteryuniversity.com/article/bu-201-how-does-the-lead-acid-battery-work), table 3 |
| Round trip split evenly between charge and discharge, √η each way | UL Solutions, HOMER Pro manual, [Battery charge efficiency](https://support.ul-renewables.com/homer-manual-pro/battery_charge_efficiency.html) |
| Solar losses and how they combine; temperature coefficient −0.47%/°C | A. P. Dobos, *PVWatts Version 5 Manual*, NREL/TP-6A20-62641, 2014 ([OSTI 1158421](https://www.osti.gov/biblio/1158421)). The per-loss defaults were checked against secondary sources that reproduce them; NREL's own server could not be reached from here. |
| Peak sun hours for a place, month and tilt | European Commission Joint Research Centre, [PVGIS](https://re.jrc.ec.europa.eu/pvg_tools/en/): linked, not fetched |
| Duty factors: CW 40%, SSB 20% with no speech processing and 40% with heavy processing, FM and digital modes 100% | ARRL, [Station Evaluation Worksheet B](https://www.arrl.org/files/file/Technology/RFsafetyCommittee/rfex1_2edited.pdf), after FCC OET Bulletin 65 Supplement B |
| FT8: 79 symbols of 0.160 s (12.64 s) in each 15 s period | S. Franke, B. Somerville and J. Taylor, [The FT4 and FT8 Communication Protocols](https://wsjt.sourceforge.io/FT4_FT8_QEX.pdf), QEX July/August 2020, table 4 and section 1 |
| Raspberry Pi: recommended supply 3 A (Pi 4) and 5 A (Pi 5); bare board typically 600 mA and 800 mA | [Raspberry Pi documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html), "Power supply" |
| Copper: 1/58 Ω·mm²/m at 20 °C, 0.00393 per °C | IEC 60028, the International Annealed Copper Standard (from the standard's well-known figures; the standard itself is sold) |
| Wire gauge: d = 0.127 mm × 92^((36 − n)/39) | ASTM B258 (as above) |
| Current limits for cable | United States Coast Guard, [33 CFR 183.425](https://www.law.cornell.edu/cfr/text/33/183.425), table 5 and its notes 1 and 2 |
| Voltage drop conventions: 3% lighting, 5% other uses | BS 7671, Appendix 4 (as widely quoted; the standard is sold and its text was not checked here) |
| Voltage drop conventions: 3% for circuits that matter, 10% for those that tolerate it | ABYC E-11 (as widely quoted; the standard is sold and its text was not checked here) |
| Generator fuel: straight-line fuel curve; its worked example (50 kW, 8.48 L/h at 25 kW, 15.3 L/h at 50 kW) | UL Solutions, HOMER Pro manual, [Generator fuel curve intercept coefficient](https://homerenergy.com/products/pro/docs/3.15/generator_fuel_curve_intercept_coefficient.html) |
| Resistor colour code; E12 and E24 preferred values | IEC 60062 and IEC 60063 |

## The quick calculators

### Battery runtime

Hours = capacity (Wh) × usable share × efficiency ÷ load (W); watt-hours = amp-hours ×
volts; current = load ÷ efficiency ÷ volts, shown with its C-rate. "Efficiency" is
everything between the battery and the load (100% for a DC load; the inverter's for an
AC one). Defaults: 100 Ah, 12.8 V, 20 W, 80% usable, 100% efficiency. Left out: the
voltage falling as the battery empties, cold, age, and Peukert's effect; the screen says
that lead acid is rated at its 20-hour rate and gives the 20-hour current.

### Solar output and charging

A day's output = panel W × peak sun hours × (1 − losses) × temperature factor ×
controller. Losses are PVWatts' ten, each changeable, combined as 1 − Π(1 − lossᵢ):

| Loss | Default |
| --- | --- |
| Soiling | 2% |
| Shading | 3% |
| Snow | 0% |
| Mismatch | 2% |
| Wiring | 2% |
| Connections | 0.5% |
| Light-induced degradation | 1.5% |
| Nameplate rating | 1% |
| Age | 0% |
| Availability | 3% |
| **Combined** | **14.08%** |

Temperature factor = 1 − 0.47% × (cell °C − 25). Controller: MPPT, its efficiency (95%
is a starting figure, not a source: use the data sheet's); PWM, battery volts ÷ panel
Vmp (13.6 V and 18 V are starting figures to be replaced from the labels). Time to
charge = energy to put back ÷ √(round trip) ÷ (day's output − day's use meanwhile).
Peak sun hours are typed in: there is no figure for them without a place's weather
records, so the screen links to PVGIS. (A power plan can take them from Weather and
hazards; the quick calculator does not keep anything, and does not.) Left out: shade
through the day, cloud from day to day, and the battery accepting charge more slowly as
it fills.

### Cable size and voltage drop

Loop resistance = ρ(T) × 2 × length ÷ area, ρ(T) = (1/58)(1 + 0.00393(T − 20)) Ω·mm²/m.
Drop = I × R; also the percentage of the supply, the voltage at the load and the heat in
the cable. The smallest area for a chosen drop = ρ × 2 × length × I ÷ (V × percent),
with the next metric size and the next gauge. Lengths in metres or feet; sizes in mm²
(0.5 to 120) or AWG (18 to 4/0).

The answer on voltage drop says it is on voltage drop alone. Current comes separately:
33 CFR 183.425 table 5 (the Coast Guard's limits for boat wiring under 50 V), by gauge
and insulation rating (60 to 200 °C), × note 1's factor in an engine space, × note 2's
for three or more conductors bundled (0.7; 4 to 6, 0.6; 7 to 24, 0.5; 25 or more, 0.4).
A metric cable is read as the largest gauge with no more copper than it (2.5 mm² as
14 AWG), so the table is never read for more copper than is there; a cable under 18 AWG
has no figure. The maker's rating, if typed, is compared too, and a warning shows when
either is exceeded. The screen says this is guidance from one rule, that it is not
BS 7671, and that it is no substitute for the regulations that apply or a qualified
electrician. Left out: stranded conductors' slightly higher resistance, connections,
fuses and switches.

### Batteries in series and parallel

Series adds volts; parallel adds amp-hours; energy = volts × amp-hours; usable energy at
the chemistry's starting share. The cautions shown with it: same model, capacity and
age at the same charge; lithium needs a BMS and the maker must allow series or parallel
(and say how many); fuse each battery or string as the maker says; a charger set for the
chemistry and the bank's voltage.

### Generator fuel

From the person's own data sheet: tank size and run time at rated load, and optionally a
second run time at another load (many give a quarter load). Fuel an hour = intercept +
slope × load share (HOMER's straight-line curve). With two figures the line goes through
them. With one, the line is that figure scaled by the shape of HOMER's worked example
(intercept 1.655 of 15.3 L/h, about 11%), and the answer says it is an estimate and why
(the example is a 50 kW diesel; small petrol and inverter generators can differ a good
deal). Litres, UK gallons (4.54609 L) or US gallons (3.785411784 L). It also warns never
to run a generator indoors.

### Electronics

- **Ohm's law:** any two of V, I, R, P give the other two (V = IR, P = VI).
- **Colour code:** four or five bands (two or three figures, multiplier, tolerance), and
  the bands for a value (rounded to two or three figures).
- **Series and parallel:** R = ΣRᵢ; 1/R = Σ1/Rᵢ.
- **LED resistor:** R = (Vs − n·Vf) ÷ I, then the next E12 or E24 value up, the current
  with it and the power in it; "choose a resistor rated well above this; twice is a
  common margin".
- **Voltage divider:** Vout = Vin × R2′ ÷ (R1 + R2′), R2′ being R2 in parallel with the
  load if one is given.

## Power plans

A plan holds a battery bank, its loads, an inverter, solar and an optional generator or
mains charger, and the cable's rated current. It is saved 0.7 s after the last change
("Saved." beside the title). Plans can be copied (named "… (copy)"), deleted, compared
side by side on the Power and batteries screen, and written out as a PDF with Save as
PDF, Add to library and Share (the PDF is made from the plan as last saved, dated by its
last change, and linked back to `/tools/power/plans/:id`). To link one from a note, put
that address in the note's link field; the plan's page shows it.

### Peak sun hours from Weather and hazards

Weather and hazards fetches PVGIS's monthly figures for one of its places when a person
presses "Fetch the averages for this place" there ([weather.md](weather.md)): twelve
numbers in kWh/m² a day, one series for a panel facing south at the tilt PVGIS found
best over the year and one for level ground. A plan's solar section reads what is kept
(`kept[kind="solar"]` of `GET /api/weather`) and:

- where none has been fetched, says that they can be fetched on Weather and hazards,
  with a link;
- where some have, offers **Fill in from Weather and hazards**, with a choice of place
  when there are several (home first) and of the two series, and says whose figures
  they are, for which place and position, over which years and from which database,
  and how long ago they were fetched. Panels at another angle or facing another way get
  a different figure, and shading is not counted: the screen says so.

Nothing is filled in until that press. When the months hold figures the person typed
(or changed after a fill), the press asks first and replaces them only on "Replace
them". The figures are rounded to two decimal places.

The plan records where its figures came from (`solar.sunHoursSource`: the place, its
position, the series and best tilt, the years, the database, when fetched and when
filled, and PVGIS's credit). Typing over a month afterwards keeps the record and marks
it `edited`. The screen shows the record under the months, and the PDF (and the copy
added to the library) carries the same sentence under the month-by-month table, for example (made-up figures):
"Peak sun hours from PVGIS (European Commission Joint Research Centre) for Home (52.13,
-0.46), on a panel facing south at 38°, the best tilt, averaged over 2005 to 2023 from
PVGIS-SARAH3; fetched by Weather and hazards on 16 November 2026. PVGIS © European
Communities, 2001-2026.", with "Some months were changed by hand since." when they
were, or "Peak sun hours typed in." when there is no record. Plans saved before this
have none and read as typed in; no migration was needed, since a plan's system is kept
as one JSON value.

### The model

- **Battery bank:** V = series × volts; Ah = parallel × amp-hours; usable = Wh × usable
  share; delivered = usable × √(round trip). Choosing a chemistry sets the voltage,
  usable share and efficiency to its starting figures (table below); each can be
  changed. The rated discharge and charge currents are the maker's and are never filled
  in.
- **A device:** watts × hours a day × how many, from a start hour.
- **A radio:** duty = share of time on the air transmitting × the mode's factor; on the
  air it draws duty × transmit + (1 − duty) × receive; on standby, its standby power.
  Transmit, receive and standby are the radio's draw from its supply (the manual's
  currents × the supply voltage), not its RF output.
- **AC loads** draw their power ÷ the inverter's efficiency from the battery, and the
  inverter draws its idle power for its hours on, spread evenly over the day. 88% and
  8 W are Outpost's starting figures, not a source, and the screen says so.
- **Solar** as in the calculator, for each month's peak sun hours, spread over 06:00 to
  18:00 as half a sine (the daily total is what matters; the shape only decides when
  in the day the battery fills).
- **Hour by hour:** what is made feeds the loads first and charges the battery with
  what is over (× √η); what a full battery cannot take is lost; what the loads take
  from the battery is ÷ √η; at the usable limit the loads go unmet (the battery's BMS or
  a low-voltage disconnect would cut them).

### The answers

- Used in a day (Wh, and the average in W), with the inverter's share.
- Runs with no charging (delivered ÷ average draw) and days of autonomy (delivered ÷ a
  day's use).
- Each month, from full, for 30 days of that month's sun: the solar a day, the lowest
  charge, and the day it first reaches the usable limit, or "keeps up".
- Solar to break even in the month with the fewest peak sun hours given, with no
  charger: a day's use ÷ (1 W's day of output × round trip). This treats all of the
  day's use as passing through the battery, so it errs high.
- Peak current from the battery (every load at once, radios key down, AC ÷ efficiency,
  plus idle, ÷ bank volts) against the battery's rated discharge current and the
  cable's rating; peak charge current (array W × controller + charger W, ÷ bank volts)
  against the rated charge current. "Not checked" when a rating has not been given.
- The state of charge hour by hour over three days of the worst month, starting full,
  drawn as one line in one hue with the usable limit marked, labelled axes, a readout
  for the pointer and the arrow keys, and a table for screen readers.
- Every assumption, in sentences (`assumptions` in `calc/plan.ts`), on the screen and in
  the PDF, and the sentence that these are estimates and that real batteries deliver
  less when cold, old or discharged fast.

### Starting figures

| Chemistry | V a cell | Block | Usable | Round trip |
| --- | --- | --- | --- | --- |
| LiFePO4 | 3.2 | 4 cells, 12.8 V | 80% | 92% |
| Lead acid, AGM | 2.0 | 6 cells, 12 V | 50% | 80% |
| Lead acid, flooded | 2.0 | 6 cells, 12 V | 50% | 80% |
| Li-ion (NMC) | 3.6 | 3 cells, 10.8 V | 80% (Outpost's choice: there is no one maker's figure) | 92% |

| Radio mode | Share of time transmitting | Mode's factor | Duty |
| --- | --- | --- | --- |
| SSB voice | 50% (Outpost's assumption) | 20% (ARRL) | 10% |
| SSB, heavy speech processing | 50% | 40% (ARRL) | 20% |
| CW | 50% | 40% (ARRL) | 20% |
| FT8 | 12.64 s of 30 s, 42.1% (QEX 2020) | 100% (ARRL, digital modes) | 42.1% |
| FM voice | 50% | 100% (ARRL) | 50% |

Loads to start from: a Raspberry Pi 4 (15 W) or 5 (25 W) running Outpost, 24 hours,
from the supply Raspberry Pi recommends (the most it should draw; the bare board's
typical draw is given beside it); a radio; lights, a phone charger and a laptop with
typical hours but **no watts**, which the person types from the label; a radio saved for
the HF planner (its name, and a transmit draw of twice its RF output, said to be an
estimate for an amplifier about half efficient, with the receive draw left to be typed);
or anything.

### Limits

Figures are checked by the server: up to 60 loads; watts to 1 MW; hours 0 to 24 (a
radio's on-air and standby hours together at most 24); shares 0 to 1; peak sun hours 0
to 12; 1 to 100 batteries in series and in parallel.

### What is not modelled

Temperature (cold batteries, hot panels), ageing, Peukert's effect, the battery's
voltage curve, a charge controller's absorption and float stages, the shape of a real
day's sun, and day-to-day weather. A month is 30 days of the same sun. Peak sun hours are
not worked out for a place: doing so offline needs climate records Outpost does not hold,
and a clear-sky figure would overstate a cloudy month by a wide margin.

## Own data

Plans are in the `power_plans` table (migration `0016_power_plans`), so they are in every
backup; they are counted on the Storage screen ("power plans") and in what erasing
everything will take, and erased with everything else (`ctx.services.power.kept`).
Nothing about them is kept in the browser.

## The input pieces

The calculators use a small set of input components kept in one file,
`apps/web/src/features/power/inputs.tsx` (`NumberField`, `PercentField`,
`ChoiceField`, `Answer`, `Answers`, `Basis`, `CalculatorGroup`, `Fields`,
`ClearButton`), so that they can be moved to the shared calculator kit
(`apps/web/src/features/tools/kit/`) by changing that file and its imports.
