# Power and batteries

Tools → Power and batteries (`/tools/power`) has two parts:

- **Quick calculators**, which keep nothing: battery runtime (from a library of common
  devices, or one load in watts), solar output and charging,
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
| Every device in the library of common devices | Its maker's or an official body's document, in the table under [Common devices](#common-devices) |
| A lithium-ion cell's nominal voltage, 3.6 V, for phones whose makers give mAh only | Battery University, [BU-303 Confusion with voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages): "The nominal voltage of lithium-ion is 3.60V/cell." |
| A lithium-ion cell's own energy efficiency, about 97% at 0.5C | Battery University, [BU-808c Coulombic and Energy Efficiency with the Battery](https://batteryuniversity.com/article/bu-808c-coulombic-and-energy-efficiency-with-the-battery) |
| A 12 V to 5 V converter's efficiency, 71% typical | MEAN WELL, [SD-25 series specification](https://www.meanwell.com/Upload/PDF/SD-25/SD-25-SPEC.PDF), SD-25A-5: "EFFICIENCY (Typ.) 71%" |
| Charging, extension leads, generators and carbon monoxide | Quoted under [Safety](#safety-where-the-calculators-touch-it) |
| Copper: 1/58 Ω·mm²/m at 20 °C, 0.00393 per °C | IEC 60028, the International Annealed Copper Standard (from the standard's well-known figures; the standard itself is sold) |
| Wire gauge: d = 0.127 mm × 92^((36 − n)/39) | ASTM B258 (as above) |
| Current limits for cable | United States Coast Guard, [33 CFR 183.425](https://www.law.cornell.edu/cfr/text/33/183.425), table 5 and its notes 1 and 2 |
| Voltage drop conventions: 3% lighting, 5% other uses | BS 7671, Appendix 4 (as widely quoted; the standard is sold and its text was not checked here) |
| Voltage drop conventions: 3% for circuits that matter, 10% for those that tolerate it | ABYC E-11 (as widely quoted; the standard is sold and its text was not checked here) |
| Generator fuel: straight-line fuel curve; its worked example (50 kW, 8.48 L/h at 25 kW, 15.3 L/h at 50 kW) | UL Solutions, HOMER Pro manual, [Generator fuel curve intercept coefficient](https://homerenergy.com/products/pro/docs/3.15/generator_fuel_curve_intercept_coefficient.html) |
| Resistor colour code; E12 and E24 preferred values | IEC 60062 and IEC 60063 |

## The quick calculators

### Battery runtime

The battery: capacity in Ah and volts, or in Wh, and the usable share (80% for LiFePO4
and 50% for lead acid to start with, as below). Then what it runs, one of two ways:

**Devices** (the first choice). "Add a device" opens the library of
[common devices](#common-devices) and the person's own; a search box ("pi 5", "iphone",
"handheld", "lamp") and the groups below it; one press on a name adds it, and pressing
it again makes it two of it. Each row says how many and how it is used: hours a day for
something that runs (with a choice of the figures its maker gives: typical, measured
under load, the supply's rating); charges a day for something charged; for a radio, its
mode, minutes an hour transmitting, hours a day on, and its output (each published
transmit figure, or a lower output estimated as twice the output, said to be an
estimate). Behind "Where these figures come from" are its figures, the publisher's
words, the document, the URL and the date read, and the sentence that a maker's figure
is for a new device under the maker's own conditions and the label on the person's own
device governs. Then: for how many days, and, when there is a USB device, a charge or an
AC device, the USB converter's, the charging and the inverter's efficiency.

- What one thing uses from the battery in a day: watts × hours a day (a radio: on the
  air, duty × transmit + (1 − duty) × receive, where duty = minutes an hour transmitting
  ÷ 60 × the mode's factor); or its battery's Wh × charges a day ÷ the charging
  efficiency; ÷ the USB converter's efficiency over USB, ÷ the inverter's through it.
- Can be taken out = capacity × usable share. (A plan also counts the battery's own
  round trip, √η, so its runtime is a little shorter; the screen says so where a plan is
  made.)
- **Runs what runs** = can be taken out ÷ what the running things use in a day, in hours
  (and days).
- **Charges of one** of each thing charged: instead of anything else = can be taken out
  ÷ one charge from the battery; besides running the rest for the days given = what is
  left after those days ÷ one charge.
- **For so many days**, in a sentence: "With this battery, for 3 days, you can run … as
  set, and charge each … up to … times a day", or that what runs lasts only so long.
- **Everything as set**, in days, when there are both.
- **Uses most**: each thing's Wh a day from the battery and its share, most first, as a
  table with a bar on one axis in each row (the bars and the figures are the same
  cells, so they cannot disagree).
- **Battery needed** for the days given with no charging = a day's use × days ÷ usable
  share, in Wh and in Ah at the voltage given. "Solar to keep up with this" opens the
  solar calculator with the day's use filled in as "Used meanwhile each day", where it
  also answers the panels needed to keep up: a day's use ÷ (a panel watt's day of output
  × round trip), as a plan's break-even does.
- **At least.** Where any figure in use is a maximum (a supply's rating, "less than",
  "@ Max", a worst case), every runtime and count is "at least", the answers say so, and
  a note names the device.
- "Make this a plan" asks for a name and makes a power plan with this battery (as
  LiFePO4, its voltage and Ah, the usable share given), these devices with the record of
  where their figures came from, and the converter's and inverter's efficiency.

**A load in watts**: the calculator as it was. Hours = capacity (Wh) × usable share ×
efficiency ÷ load (W); watt-hours = amp-hours × volts; current = load ÷ efficiency ÷
volts, shown with its C-rate. "Efficiency" is everything between the battery and the
load (100% for a DC load; the inverter's for an AC one). Defaults: 100 Ah, 12.8 V, 20 W,
80% usable, 100% efficiency.

Left out of both: the voltage falling as the battery empties, cold, age, Peukert's
effect (the screen says that lead acid is rated at its 20-hour rate), and a phone or
laptop drawing less as it fills.

#### A worked example (tested in `calc/devices.test.ts`)

A 100 Ah, 12.8 V battery (1,280 Wh), 80% usable: 1,024 Wh can be taken out. Three days.
Converter 71%, charging 80%.

| Device | Use | Wh a day from the battery |
| --- | --- | --- |
| Raspberry Pi 5, bare board typical, 800 mA × 5.1 V = 4.08 W, over USB | 24 h | 4.08 × 24 ÷ 0.71 = 137.92 |
| 2 × iPhone 16, 3,561 mAh × 3.6 V = 12.82 Wh, over USB | 1 charge a day each | 12.82 ÷ 0.8 ÷ 0.71 = 22.57 a charge; 45.14 |
| Yaesu FT-65, receive 205 mA × 7.4 V = 1.517 W, transmit 1.5 A × 7.4 V = 11.1 W at 5 W, FM | 4 h on, half the time transmitting | (0.5 × 11.1 + 0.5 × 1.517) × 4 = 25.23 |

- Runs what runs: 1,024 ÷ (137.92 + 25.23 = 163.15) = 6.28 days, 151 hours.
- Charges of one iPhone 16: instead, 1,024 ÷ 22.57 = 45.4; besides three days of the
  rest, (1,024 − 3 × 163.15 = 534.55) ÷ 22.57 = 23.7. The screen shows whole charges: 45
  and 23.
- For 3 days: 534.55 ÷ (45.14 × 3) = 3.95 times the charging set, so each phone can be
  charged up to 3.9 times a day.
- Everything as set: 1,024 ÷ 208.29 = 4.92 days.
- Battery needed for 3 days: 208.29 × 3 ÷ 0.8 = 781 Wh, 61 Ah at 12.8 V.
- With the Pi at its supply's rating instead (5 A × 5.1 V = 25.5 W, at most), what runs
  alone: 1,024 ÷ (25.5 ÷ 0.71) = 28.5 hours, shown as "At least 28.5 hours".

### Charging: what is lost, and what is assumed

A charge is energy, not a steady load: the battery's watt-hours, plus what is lost on
the way. Two steps are counted.

- **The phone's own charging**, from its USB socket into its cell: **80%, Outpost's
  assumption.** No standards body, national lab or maker publishes one figure for it.
  What was found: Battery University gives a lithium-ion cell's own energy efficiency as
  "about 97 percent at 0.5C" (BU-808c), which leaves out the phone's charging circuit;
  Apple's Product Environmental Reports give its 20 W adapter's efficiency from the
  mains (87.49 to 88.06%, averaged over four loads), which is the step before, not this
  one; the EU's Ecodesign rule for external power supplies (Regulation (EU) 2019/1782,
  Annex II) and the US DOE's battery charger rule (10 CFR 430.32(z)) set minimum
  efficiencies or annual energy, not a per-charge loss. The screen labels 80% as an
  assumption and it can be changed.
- **The converter from a 12 V battery to USB**: **71%**, one maker's typical figure for
  a converter from 9.2 to 18 V down to 5 V (MEAN WELL SD-25A-5, "EFFICIENCY (Typ.)
  71%"). A USB car charger's own data sheet, where it gives one, is better; Anker's car
  charger pages give none.

Phones whose makers give mAh only (Apple's EU product information sheets for iPhone,
Google and Samsung): watt-hours = mAh × 3.6 V ÷ 1000, 3.6 V being Battery University's
nominal voltage for a lithium-ion cell (BU-303). The same table marks cells charged to
4.35 V as 3.8 V, which many phones' are, so the watt-hours may be a few per cent more
than shown and the count of charges a few per cent fewer. The voltage is on the
battery; the person can add their phone as a device of their own with its own figure.

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
("Saved." beside the title), one save at a time, and at once when the page is hidden,
closed or left (a save made as the page closes asks the browser to finish it after the
page has gone). A plan whose name has been emptied is not saved until it has one again.
Each save says which version it was made from; if another tab or device has saved the
plan since, nothing is written over it, saving stops, and the page says so and offers
**Keep my version** or **Load the other version**, as a note does. A save made as the
page closes while another save is still under way goes without that check, since it
cannot know the version the first will make. A device of your own changed in two places
is refused the same way, and the dialog says to open it again. Plans can be copied (named "… (copy)"), deleted, compared
side by side on the Power and batteries screen, and written out as a PDF with Save as
PDF, Add to library and Share (the PDF is made from the plan as last saved, dated by its
last change, and linked back to `/tools/power/plans/:id`). To link one from a note, put
that address in the note's link field; the plan's page shows it.

### Peak sun hours from Weather and hazards

Weather and hazards fetches PVGIS's monthly figures for one of its places when a person
presses "Fetch the averages for this place" there ([weather.md](weather.md)): twelve
numbers in kWh/m² a day, one series for a panel facing south at the tilt PVGIS found
best over the year and one for level ground. A plan's solar section lets the person
choose **where the panels are** and uses the figures for that place:

- The choice lists every place on Weather and hazards (those with sun figures first,
  home first among them, each saying whether figures are held), then the saved places
  from Maps that are not in that list yet, then **Somewhere else**, where a position is
  typed as coordinates, a grid reference or a locator.
- Where figures are held for the place, it offers **Fill in from Weather and hazards**,
  with a choice of the two series, and says whose figures they are, for which place
  and position, over which years and from which database, and how long ago they were
  fetched. Panels at another angle or facing another way get a different figure, and
  shading is not counted: the screen says so.
- Where none are held, it offers **Fetch sun hours for** the place. Before the press it
  says who is asked (PVGIS, the European Commission's Joint Research Centre, at
  `re.jrc.ec.europa.eu`), that only the place's latitude and longitude rounded to two
  decimal places are sent, that the answer is a few kilobytes and is kept, and that the
  place joins the list on Weather and hazards. The press adds the place to that list if
  it is not there (`POST /api/weather/places`) and asks for its sun figures alone
  (`POST /api/weather/update` with `kinds: ["solar"]` and the one place): the weather
  module's own route, the only one that contacts a publisher, so the copy is kept,
  counted, aged and removed there like any other. When PVGIS gives nothing (it does not
  cover everywhere), the screen says why; the place stays in the weather list, and a
  second press asks about it again without adding it twice.

Nothing is fetched until the fetch is pressed, and nothing is filled in until the fill
is. When the months hold figures the person typed
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
  the PDF, and the sentence that these are estimates and general information, no
  substitute for the wiring regulations or a qualified electrician, and that real
  batteries deliver less when cold, old or discharged fast.

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

Loads to start from ("Add a load"): the same searchable library of common devices and
the person's own devices as the quick calculator; a radio saved for the HF planner (its
name, and a transmit draw of twice its RF output, said to be an estimate for an
amplifier about half efficient, with the receive draw left to be typed); or the figures
typed by hand, for something that runs, a radio, or something charged. An entry with no
figure (another phone, a laptop, a lamp) opens the form with where to read the figure; a
medical device's entry says what its maker's guide says and adds nothing.

A load made from the library or an own device keeps a record (`origin`: which entry, its
state, and the figures it was given then). The plan's screen says under the load where
its figures came from ("From the library: Raspberry Pi 5, the maker's typical figure")
with the sources behind "Where these figures come from"; the PDF, and so the copy added
to the library, has a section "Where the figures come from" with each figure's working,
publisher, document, URL and date. A figure changed by hand afterwards is the person's:
the screen says "changed by you since" and the PDF "A figure has been changed by hand
since". Loads typed by hand, and every load of a plan made before this, have no record
and read as they did.

A load can also be supplied over USB, through the plan's USB converter (71% to start
with; its own section appears when a load uses it), and can be a charge: a battery of so
many Wh charged so many times a day at a charging efficiency (80% to start with),
spread over the hours a charge takes for the hour-by-hour chart only. Plans from before
these have neither and read as they did; no migration was needed for them, since a
plan's system is kept as one JSON value.

### Limits

Figures are checked by the server: up to 500 plans; up to 60 loads; watts to 1 MW; hours 0 to 24 (a
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

A person's own devices ("Add a device of your own" in the picker: a name; runs, is
charged, or a radio; how it is supplied; watts, a battery's Wh (or mAh and volts), or a
radio's receive, transmit and standby draw; and a note of where the figure came from)
are in the `power_devices` table (migration `0025_power_devices`), up to 500. They are
offered first in the picker next time, can be changed or removed there, are counted on
the Storage screen ("devices of your own for the battery calculators") and in what
erasing everything will take, and are erased with everything else
(`ctx.services.powerDevices`). Removing one leaves loads already made from it as they
are.

## Common devices

The library is data in `packages/shared/src/power-devices-data.ts`, bundled with the
app: nothing is fetched to use it. Every figure was read on 16 November 2026 from the
maker's own manual, specification sheet or product page, or an official body's
document, never from a retailer, a review or a forum, and is kept as published (a
current at a voltage, a capacity in mAh at a voltage, a wattage) with the publisher's
words, so the conversion can be checked. `calc/devices.test.ts` checks that every
figure has a source with a URL and a date, that watts are volts × amps and watt-hours
mAh × volts ÷ 1000 as quoted, that the published numbers are in the quoted words (or the
voltage's source in the note), that no entry with a figure lacks one, and that any
quoted maximum ("less than", "@ Max", "max", a worst case, a supply's rating) is marked
"at most".

Rules followed:

- Where the maker gives only a maximum or a supply's rating, the figure is "at most",
  never "typical", and an answer using it is "at least".
- Where the maker gives a current without a voltage beside it, the voltage's source is
  in the note: the same table's supply voltage, USB's 5 V, or, for the Xiegu and
  Elecraft radios, the top of the supply range the maker gives, which makes the figure
  the most it could be (and so "at most").
- Where a class of thing has no one maker's figure (a phone in general, a lamp, an
  electric blanket, a fibre box), the entry is a pointer to the label, not a figure: it
  says where to read it and offers to keep it as a device of the person's own.
- Medical devices (CPAP) have no figure, by design: the entry quotes the maker's own
  guide and says that it and the person's clinician govern.
- A kettle and a microwave are there only to show what an inverter must supply.

Product names are the trade marks of their owners, used here only to say which device a
figure is for. Outpost is not connected with or endorsed by any of them.

### The table

Figures as used (W for something that runs, Wh for a battery), then each as published.
Every source was read on 16 November 2026. The Raspberry Pi documentation was read from
its source in Raspberry Pi's own repository on GitHub (`power-supplies.adoc`, commit
`c6a6496`), since raspberrypi.com answered programs with a check for a browser.

#### Raspberry Pi and computers

| Device | Figure used | As published (the publisher's words) | Source |
| --- | --- | --- | --- |
| Raspberry Pi 5 | Bare board, typical: 4.08 W; At most, the recommended supply: 25.5 W (at most) | 800 mA at 5.1 V: “Raspberry Pi 5: typical bare-board active current consumption 800mA” Volts: “All models require a 5.1V supply” (the same page).<br>5 A at 5.1 V: “Raspberry Pi 5: recommended PSU current capacity 5.0A” Volts: “All models require a 5.1V supply” (the same page). | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi 500 | Bare board, typical: 4.08 W; At most, the recommended supply: 25.5 W (at most) | 800 mA at 5.1 V: “Pi 500: typical bare-board active current consumption 800mA” Volts: “All models require a 5.1V supply” (the same page).<br>5 A at 5.1 V: “Pi 500: recommended PSU current capacity 5.0A” Volts: “All models require a 5.1V supply” (the same page). | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi 4 Model B | Bare board, typical: 3.06 W; Idle, measured: 3.06 W; Under full load, measured: 6.12 W; At most, the recommended supply: 15.3 W (at most) | 600 mA at 5.1 V: “Raspberry Pi 4 Model B: typical bare-board active current consumption 600mA” Volts: “All models require a 5.1V supply” (the same page).<br>600 mA at 5.1 V: “Raspberry Pi 4B, Idle, Avg: 0.6” Volts: “All models require a 5.1V supply” (the same page). Raspberry Pi's measurements: “standard Raspberry Pi OS image … at room temperature, with the Raspberry Pi connected to an HDMI monitor, USB keyboard, and USB mouse … Raspberry Pi 4 was connected to Ethernet.”<br>1.2 A at 5.1 V: “Raspberry Pi 4B, Stress, Avg: 1.2” Volts: “All models require a 5.1V supply” (the same page). Raspberry Pi's measurements: “standard Raspberry Pi OS image … at room temperature, with the Raspberry Pi connected to an HDMI monitor, USB keyboard, and USB mouse … Raspberry Pi 4 was connected to Ethernet.”<br>3 A at 5.1 V: “Raspberry Pi 4 Model B: recommended PSU current capacity 3.0A” Volts: “All models require a 5.1V supply” (the same page). | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi 400 | Bare board, typical: 4.08 W; At most, the recommended supply: 15.3 W (at most) | 800 mA at 5.1 V: “Pi 400: typical bare-board active current consumption 800mA” Volts: “All models require a 5.1V supply” (the same page).<br>3 A at 5.1 V: “Pi 400: recommended PSU current capacity 3.0A” Volts: “All models require a 5.1V supply” (the same page). | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi 3 Model B+ | Bare board, typical: 2.55 W; At most, the recommended supply: 12.75 W (at most) | 500 mA at 5.1 V: “Raspberry Pi 3 Model B+: typical bare-board active current consumption 500mA” Volts: “All models require a 5.1V supply” (the same page).<br>2.5 A at 5.1 V: “Raspberry Pi 3 Model B+: recommended PSU current capacity 2.5A” Volts: “All models require a 5.1V supply” (the same page). | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi 3 Model B | Bare board, typical: 2.04 W; Idle, measured: 1.53 W; Under full load, measured: 4.335 W; At most, the recommended supply: 12.75 W (at most) | 400 mA at 5.1 V: “Raspberry Pi 3 Model B: typical bare-board active current consumption 400mA” Volts: “All models require a 5.1V supply” (the same page).<br>300 mA at 5.1 V: “Raspberry Pi 3B, Idle, Avg: 0.30” Volts: “All models require a 5.1V supply” (the same page). Raspberry Pi's measurements: “standard Raspberry Pi OS image … at room temperature, with the Raspberry Pi connected to an HDMI monitor, USB keyboard, and USB mouse … Raspberry Pi 4 was connected to Ethernet.”<br>850 mA at 5.1 V: “Raspberry Pi 3B, Stress, Avg: 0.85” Volts: “All models require a 5.1V supply” (the same page). Raspberry Pi's measurements: “standard Raspberry Pi OS image … at room temperature, with the Raspberry Pi connected to an HDMI monitor, USB keyboard, and USB mouse … Raspberry Pi 4 was connected to Ethernet.”<br>2.5 A at 5.1 V: “Raspberry Pi 3 Model B: recommended PSU current capacity 2.5A” Volts: “All models require a 5.1V supply” (the same page). | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi Zero 2 W | Bare board, typical: 1.785 W; At most, the recommended supply: 10.2 W (at most) | 350 mA at 5.1 V: “Zero 2 W: typical bare-board active current consumption 350mA” Volts: “All models require a 5.1V supply” (the same page).<br>2 A at 5.1 V: “Zero 2 W: recommended PSU current capacity 2A” Volts: “All models require a 5.1V supply” (the same page). | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi Camera Module | Typical: 1.275 W | 250 mA at 5.1 V: “Camera Module: 250 mA” Volts: “All models require a 5.1V supply” (the same page). | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi Case Fan | Typical: 0.3 W | 60 mA at 5 V: “Case fan: 60 mA at 5 V (300 mW)” | Raspberry Pi Ltd, [Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply) |
| Raspberry Pi Touch Display 2 (5-inch) | In use: 1.4 W | 1.4 W: “Power consumption 1.4 W” | Raspberry Pi Ltd, [Raspberry Pi Touch Display 2, 5-inch portrait, product brief (October 2026)](https://datasheets.raspberrypi.com/display/touch-display-2-product-brief.pdf) |
| Raspberry Pi Touch Display (original 7-inch) | At full brightness: 1 W | 200 mA at 5 V: “Power draw 200mA at 5 V typical, at maximum brightness.” | Raspberry Pi Ltd, [Raspberry Pi documentation, accessories, “Display” (display_intro.adoc in the raspberrypi/documentation repository)](https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/accessories/display/display_intro.adoc) |
| Raspberry Pi Monitor (15.6-inch) | In use, the top of the range: 6.5 W; In use, the bottom of the range: 4.5 W | 6.5 W: “Power consumption: 4.5-6.5 W during use”<br>4.5 W: “Power consumption: 4.5-6.5 W during use” | Raspberry Pi Ltd, [Raspberry Pi documentation, accessories, “Raspberry Pi Monitor” (monitor_intro.adoc in the raspberrypi/documentation repository)](https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/accessories/monitor/monitor_intro.adoc) |

#### Phones and things you charge

| Device | Figure used | As published (the publisher's words) | Source |
| --- | --- | --- | --- |
| iPhone 18 Pro | Battery: 14.6 Wh | 4,056 mAh at 3.6 V: “10. Rated battery capacity (Crated [mAh]) 4056” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Apple Inc., [Product information sheet, model A3714 (EU)](https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/A3714_V1/A3714/A3714_PIS_LotX_EU_English.pdf); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| iPhone 17 Pro Max | Battery: 17.36 Wh | 4,823 mAh at 3.6 V: “10. Rated battery capacity (Crated [mAh]) 4823” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Apple Inc., [Product information sheet, model A3526 (EU)](https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/A3526_V1/A3526/A3526_Product_Information_Sheet_EN_EU.pdf); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| iPhone 17 Pro | Battery: 14.36 Wh | 3,988 mAh at 3.6 V: “10. Rated battery capacity (Crated [mAh]) 3988” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Apple Inc., [Product information sheet, model A3523 (EU)](https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/A3523_V1/A3523/A3523_Product_Information_Sheet_EN_EU.pdf); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| iPhone 17 | Battery: 13.29 Wh | 3,692 mAh at 3.6 V: “10. Rated battery capacity (Crated [mAh]) 3692” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Apple Inc., [Product information sheet, model A3520 (EU)](https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/A3520_V1/A3520/A3520_Product_Information_Sheet_EN_EU.pdf); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| iPhone Air | Battery: 11.34 Wh | 3,149 mAh at 3.6 V: “10. Rated battery capacity (Crated [mAh]) 3149” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Apple Inc., [Product information sheet, model A3517 (EU)](https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/A3517_V1/A3517/A3517_Product_Information_Sheet_EN_EU.pdf); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| iPhone 17e | Battery: 14.42 Wh | 4,005 mAh at 3.6 V: “10. Rated battery capacity (Crated [mAh]) 4005” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Apple Inc., [Product information sheet, model A3634 (EU)](https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/A3634_V1/A3634/A3634_Product_Information_Sheet_EU_English.pdf); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| iPhone 16 | Battery: 12.82 Wh | 3,561 mAh at 3.6 V: “10. Rated battery capacity (Crated [mAh]) 3561” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Apple Inc., [Product information sheet, model A3287 (EU)](https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/A3287_V1/A3287/A3287_Product_Information_Sheet_EN_EU.pdf); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| iPhone 16e | Battery: 14.42 Wh | 4,005 mAh at 3.6 V: “10. Rated battery capacity (Crated [mAh]) 4005” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Apple Inc., [Product information sheet, model A3409 (EU)](https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/A3409_V1/A3409/A3409_Product_Information_Sheet_EN_EU.pdf); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| Google Pixel 10 | Battery: 17.89 Wh | 4,970 mAh at 3.6 V: “Typical 4970mAh (minimum 4835mAh)” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Google, [Google Pixel 10, Specs and hardware (Google Store)](https://store.google.com/us/product/pixel_10_specs); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| Google Pixel 9a | Battery: 18.36 Wh | 5,100 mAh at 3.6 V: “Typical 5100 mAh (minimum 5000 mAh)” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Google, [Pixel 9a, Phone specifications (Google Store)](https://store.google.com/us/product/pixel_9a_specs); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| Samsung Galaxy S25 | Battery: 14.4 Wh | 4,000 mAh at 3.6 V: “the Galaxy S25 having a 4,000mAh battery … Typical value is the estimated average value considering the deviation in battery capacity among the battery samples tested under IEC 61960 standard. Rated capacity is 3885 mAh for Galaxy S25” The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs. | Samsung Electronics, [Galaxy S25 \| S25+, Specs](https://www.samsung.com/ca/smartphones/galaxy-s25/specs/); Battery University (Cadex Electronics), [BU-303: Confusion with Voltages](https://batteryuniversity.com/article/bu-303-confusion-with-voltages) |
| iPad 11-inch (A16) | Battery: 28.93 Wh | 28.93 Wh: “Built‐in 28.93‐watt‐hour rechargeable lithium‑polymer battery” | Apple Inc., [iPad 11-inch (A16), Technical Specifications](https://www.apple.com/ipad-11/specs/) |
| iPad Air 11-inch (M4) | Battery: 28.93 Wh | 28.93 Wh: “iPad Air 11‑inch Built‐in 28.93‐watt‐hour rechargeable lithium‑polymer battery” | Apple Inc., [iPad Air, Technical Specifications](https://www.apple.com/ipad-air/specs/) |
| iPad Air 13-inch (M4) | Battery: 36.59 Wh | 36.59 Wh: “iPad Air 13‑inch Built‐in 36.59‐watt‐hour rechargeable lithium‑polymer battery” | Apple Inc., [iPad Air, Technical Specifications](https://www.apple.com/ipad-air/specs/) |
| MacBook Air 13-inch (M5) | Battery: 53.8 Wh | 53.8 Wh: “Built-in 53.8‑watt‑hour lithium‑polymer battery” | Apple Inc., [MacBook Air (M5), Tech Specs](https://www.apple.com/macbook-air/specs/) |
| MacBook Air 15-inch (M5) | Battery: 66.5 Wh | 66.5 Wh: “Built-in 66.5‑watt‑hour lithium‑polymer battery” | Apple Inc., [MacBook Air (M5), Tech Specs](https://www.apple.com/macbook-air/specs/) |
| Anker Laptop Power Bank (25K, 165W) | Battery: 90 Wh | 25,000 mAh at 3.6 V: “Your power bank has a rated cell capacity of 25,000mAh, equal to 90Wh under standard industry test conditions.” 90 Wh is Anker's own figure; 25,000 mAh × 3.6 V gives it. Anker adds that “usable output is about 63 - 70Wh”: what reaches the phones it charges. | Anker, [Anker Laptop Power Bank (25K, 165W, Built-In and Retractable Cables), A1695, product page](https://www.anker.com/products/a1695-anker-power-bank-25000mah-165w) |
| Petzl CORE head torch battery | Battery: 4.5 Wh | 1,250 mAh at 3.6 V: “CORE rechargeable battery (1250 mAh / 3.6 V / 4.5 Wh)” | Petzl, [ACTIK CORE headlamp, product page (Energy)](https://www.petzl.com/GB/en/Sport/Headlamps/ACTIK-CORE) |
| Panasonic eneloop AA cell | Battery: 2.4 Wh | 2,000 mAh at 1.2 V: “電池容量 min.2000 mAh; 電圧 1.2V” Battery capacity at least 2,000 mAh, 1.2 V, for the standard model sold in Japan (BK-3MCD): a minimum, so a cell holds this or more. | Panasonic (Japan), [eneloop AA, standard model, BK-3MCD/4H, specifications](https://panasonic.jp/battery/products/BK-3MCD_4H/spec.html) |
| Panasonic eneloop AAA cell | Battery: 0.96 Wh | 800 mAh at 1.2 V: “電池容量 min.800 mAh; 電圧 1.2V” Battery capacity at least 800 mAh, 1.2 V, for the standard model sold in Japan (BK-4MCD): a minimum. | Panasonic (Japan), [eneloop AAA, standard model, BK-4MCD/4H, specifications](https://panasonic.jp/battery/products/BK-4MCD_4H/spec.html) |
| Yaesu FT-65 battery (SBR-25LI) | Battery: 14.43 Wh | 1,950 mAh at 7.4 V: “7.4V, 1,950 mAh SBR-25LI Rechargeable Li-Ion Battery Pack” | Yaesu Musen, [FT-65R/FT-65E Operating Manual (EH066M105)](https://www.yaesu.com/FileLibraryF/4CB43DCB-1018-01AF-FA59D5B2EDAF2F37/FT-65R_E_OM_ENG_EH066M105_1710C-FC.pdf) |
| Yaesu FT-70D battery (SBR-24LI) | Battery: 13.32 Wh | 1,800 mAh at 7.4 V: “7.4 V, 1800 mAh Rechargeable Li-Ion Battery Pack SBR-24LI” | Yaesu Musen, [FT-70DR/FT-70DE Operating Manual (EH051M202)](https://www.yaesu.com/Files/DFDF4D53-1B78-7375-E6C7A6E4B192BE13/FT-70DR_DE_OM_ENG_EH051M202_1809R-CY-1.pdf) |
| Yaesu FT-60 battery (FNB-83) | Battery: 10.08 Wh | 1,400 mAh at 7.2 V: “FNB-83 7.2 V, 1,400 mAh Rechargeable Nickel-Metal Hydride Battery Pack” | Yaesu Musen, [FT-60R/E Operating Manual (EH017M209)](https://www.yaesu.com/Files/4CB43DCB-1018-01AF-FA59D5B2EDAF2F37/FT-60R_E_OM_USA_EXP_EU_ENG_EH017M209.pdf) |
| Yaesu FT-818 battery (SBR-32MH) | Battery: 18.24 Wh | 1,900 mAh at 9.6 V: “Ni-MH Battery Pack (9.6V 1900 mAh)” | Yaesu, [FT-818, product page](https://yaesu.com/product-detail.aspx?Model=FT-818&CatName=HF%20Transceivers/Amplifiers) |
| Icom BP-272 battery (IC-705, ID-52) | Battery: 14.8 Wh | 2,000 mAh at 7.4 V: “Voltage 7.4 V; Current Capacity (minimum) 1880 mAh; Current Capacity (typical) 2000 mAh” | Icom Inc., [BP-272, specifications](https://www.icomjapan.com/lineup/options/BP-272/) |
| Elecraft KX2 battery (KXBT2) | Battery: 28.6 Wh | 2,600 mAh at 11 V: “The KXBT2, shown here installed, is an 11 V, 2.6 Ah li-ion battery with protective circuitry.” | Elecraft, Inc., [KX2 Owner's Manual, Rev. B2, 22 March 2023](https://ftp.elecraft.com/KX2/Manuals%20Downloads/KX2%20owner's%20man%20B2.pdf) |
| Xiegu X6100 battery | Battery: 25.9 Wh | 3,500 mAh at 7.4 V: “内置大容量锂电池组（3500mAh，7.4V）” “Built-in high-capacity lithium battery pack (3500mAh, 7.4V)”, from the maker's Chinese manual. Copies of an English manual elsewhere give another figure; the maker's own edition is used. | Xiegu, [X6100 Operation Manual, V1.6 (in Chinese)](https://www.cqxiegu.com/filedownload/2988637) |
| AnyTone AT-D878UV battery | Battery: 15.54 Wh | 2,100 mAh at 7.4 V: “Operating Voltage: 7.4V DC ±20% (2100mAh)” | Qixiang Electron (AnyTone), [DMR Digital Radio AT-D878UV, product page](https://www.anytone.net/pro_info92.html) |
| LilyGo T-Echo (Meshtastic) | Battery: 3.145 Wh | 850 mAh at 3.7 V: “Battery Voltage 3.7V; Battery Capacity 850mAh” | Xinyuan-LilyGO, [T-Echo README (the maker's GitHub repository)](https://raw.githubusercontent.com/Xinyuan-LilyGO/T-Echo/HEAD/README.MD) |
| Eton FRX3+ wind-up and solar radio | Battery: 9.62 Wh | 2,600 mAh at 3.7 V: “The lithium battery is rated at 3.7V/2600mAh.” | Eton Corporation, [FRX3+ Owner's Manual](https://cdn.shopify.com/s/files/1/2407/2229/files/Eton_FRX3_Plus_Manual.pdf) |
| Midland ER310 emergency radio | Battery: 9.62 Wh | 2,600 mAh at 3.7 V: “The battery is specified as 3.7 VDC, 2600 mAh, lithium ion (Li-ion).” | Midland Radio Corporation, [ER310 Owner's Manual](https://midlandusa.com/wp-content/uploads/2016/12/ER310-Manual-Final-04.3.18.pdf) |
| Uniden Bearcat BC125AT scanner (two AA cells) | Battery: 5.52 Wh | 2,300 mAh at 2.4 V: “Rechargeable 2300mAh Ni-MH Batteries; 2 AA Rechargeable Ni-MH Batteries (2.4V DC)” | Uniden America Corporation, [BC125AT Owner's Manual](https://www.uniden.info/download/ompdf/BC125ATom.pdf) |
| Another phone or tablet | None: typed from the label | Add it as a device of your own with its battery's mAh and volts, or its Wh. They are on the battery, in the phone's settings, or in its maker's product information sheet. | |
| A laptop | None: typed from the label | Its battery's Wh is printed on the battery or under the laptop. Add it as a device of your own. | |
| An e-reader | None: typed from the label | Amazon publishes no battery figure for Kindles; others rarely do. Read mAh and volts from the battery or the label, and add it as a device of your own. | |
| A watch | None: typed from the label | Apple publishes no battery figure for Apple Watch. Read mAh and volts from the label where there is one, and add it as a device of your own. | |

#### Radios

| Device | Figure used | As published (the publisher's words) | Source |
| --- | --- | --- | --- |
| Yaesu FT-891 | Receive: 27.6 W; Transmit, 100 W out: 317.4 W | 2 A at 13.8 V: “Current Consumption (typical): Rx: 2.0 A (signal present)” Volts: “Supply voltage: 13.8 V DC ±15%” (same table).<br>23 A at 13.8 V: “Tx: 23 A” Volts: “Supply voltage: 13.8 V DC ±15%”; output: “Power Output: 100 W” (same table). | Yaesu Musen, [FT-891 Operating Manual](https://www.yaesu.com/Files/4CB893D7-1018-01AF-FA97E9E9AD48B50C/FT-891_OM_ENG_EH065H201_1611A-BO-2.pdf) |
| Yaesu FT-710 | Receive: 30.36 W; Standby: 24.84 W; Transmit, 100 W out: 289.8 W | 2.2 A at 13.8 V: “Power Consumption (approx.) Rx (signal present) 2.2A” Volts: “Supply Voltage: DC13.8V ± 15%” (same table).<br>1.8 A at 13.8 V: “Rx (no signal) 1.8A” Volts: “Supply Voltage: DC13.8V ± 15%”.<br>21 A at 13.8 V: “Tx (100W) 21A” Volts: “Supply Voltage: DC13.8V ± 15%”. | Yaesu Musen, [FT-710 Operation Manual](https://www.yaesu.com/Files/4CB893D7-1018-01AF-FA97E9E9AD48B50C/FT-710_OM_ENG_EH080H201_2307N-GS.pdf) |
| Yaesu FT-991A | Receive: 30.36 W; Standby: 24.84 W; Transmit, HF and 50 MHz, 100 W out: 317.4 W; Transmit, 144 and 430 MHz, 50 W out: 207 W | 2.2 A at 13.8 V: “Power Consumption (Approx.): Rx (signal present) 2.2 A” Volts: “Supply Voltage: DC 13.8 V ± 15%” (same table).<br>1.8 A at 13.8 V: “Rx (no signal) 1.8 A” Volts: “Supply Voltage: DC 13.8 V ± 15%”.<br>23 A at 13.8 V: “Tx 23 A (HF/50 MHz 100 W)” Volts: “Supply Voltage: DC 13.8 V ± 15%”.<br>15 A at 13.8 V: “15 A (144/430 MHz 50 W)” Volts: “Supply Voltage: DC 13.8 V ± 15%”. | Yaesu Musen, [FT-991A Operating Manual](https://www.yaesu.com/Files/4CB893D7-1018-01AF-FA97E9E9AD48B50C/FT-991A_OM_ENG_EH067M205_2111A-KS-1.pdf) |
| Icom IC-705 on 13.8 V | Receive: 6.9 W; Standby: 4.14 W; Transmit, 10 W out: 41.4 W (at most) | 500 mA at 13.8 V: “Current drain, 13.8 V DC: RX (Max. audio) 0.5 A (typical)”<br>300 mA at 13.8 V: “Current drain, 13.8 V DC: RX (Standby) 0.3 A (typical)”<br>3 A at 13.8 V: “Current drain, 13.8 V DC: TX (Max. power) Less than 3 A (10 W)” | Icom Inc., [IC-705, specifications](https://www.icomjapan.com/lineup/products/IC-705/specifications/) |
| Icom IC-705 on its BP-272 battery | Receive: 5.92 W; Standby: 3.7 W; Transmit, 5 W out: 18.5 W (at most) | 800 mA at 7.4 V: “Current drain, 7.4 V DC: RX (Max. audio) 0.8 A (typical)”<br>500 mA at 7.4 V: “Current drain, 7.4 V DC: RX (Standby) 0.5 A (typical)”<br>2.5 A at 7.4 V: “Current drain, 7.4 V DC: TX (Max. power) Less than 2.5 A (5 W)” | Icom Inc., [IC-705, specifications](https://www.icomjapan.com/lineup/products/IC-705/specifications/) |
| Icom IC-7300 | Receive: 17.25 W; Standby: 12.42 W; Transmit, 100 W out: 289.8 W | 1.25 A at 13.8 V: “Rx … 1.25A (Maximum audio)” Volts: “Power supply requirement 13.8V DC ±15%” (same table).<br>900 mA at 13.8 V: “Rx 0.9A typical (Standby)” Volts: “Power supply requirement 13.8V DC ±15%”.<br>21 A at 13.8 V: “Tx 21A (at 100W output power)” Volts: “Power supply requirement 13.8V DC ±15%”. | Icom America, [IC-7300, specifications](https://www.icomamerica.com/lineup/products/IC-7300/) |
| Icom IC-7100 | Receive: 16.56 W; Standby: 12.42 W; Transmit, HF and 50 MHz, 100 W out: 303.6 W; Transmit, 144 and 430 MHz, up to 50 W out: 220.8 W | 1.2 A at 13.8 V: “Current drain (at 13.8V DC) … RX 1.2A/0.9A (Max. audio/standby)”<br>900 mA at 13.8 V: “Current drain (at 13.8V DC) … RX 1.2A/0.9A (Max. audio/standby)”<br>22 A at 13.8 V: “Current drain (at 13.8V DC) Tx 22A (HF/50MHz)” Current drain at 13.8V DC; output “HF/50MHz: 2–100W” (same table).<br>16 A at 13.8 V: “Tx … 16A (144/440MHz)” Current drain at 13.8V DC; output “144MHz: 2–50W, 430/440MHz: 2–35W” (same table). | Icom America, [IC-7100, specifications](https://www.icomamerica.com/lineup/products/IC-7100USA/) |
| Elecraft KX2 | Receive: 2.25 W (at most); Transmit, about 10 W out: 30 W (at most) | 150 mA at 15 V: “150 mA typical in receive (backlight off, preamp off, no signal)” The maker gives the current without a voltage, for a supply of 8 V min, 15 V max: Outpost multiplies by the top of that range, so the figure is the most it could be.<br>2 A at 15 V: “1 to 2 A typical in transmit” The maker gives the current without a voltage, for a supply of 8 V min, 15 V max: Outpost multiplies by the top of that range, so the figure is the most it could be. The top of “1 to 2 A” is taken. | Elecraft, Inc., [KX2 Owner's Manual, Rev. B2, 22 March 2023](https://ftp.elecraft.com/KX2/Manuals%20Downloads/KX2%20owner's%20man%20B2.pdf) |
| Elecraft KX3 | Receive: 2.25 W (at most); Transmit, about 10 W out: 30 W (at most) | 150 mA at 15 V: “150 mA minimum receive, typical (backlight off, preamp off, no signal)” The maker gives the current without a voltage, for a supply of 8 V min, 15 V max: Outpost multiplies by the top of that range, so the figure is the most it could be.<br>2 A at 15 V: “1 to 2 A typical in transmit” The maker gives the current without a voltage, for a supply of 8 V min, 15 V max: Outpost multiplies by the top of that range, so the figure is the most it could be. The top of “1 to 2 A” is taken. | Elecraft, Inc., [KX3 Owner's Manual, Rev. C5, 16 June 2014](https://ftp.elecraft.com/KX3/Manuals%20Downloads/E740163%20KX3%20Owner's%20man%20Rev%20C5.pdf) |
| Xiegu X6100 | Receive: 6.75 W (at most); Transmit, 10 W out: 45 W (at most) | 450 mA at 15 V: “电流消耗：接收：450mA@ Max” “Current consumption: receive 450mA at most”. The maker gives the current without a voltage, for a supply of 9.0 to 15.0 V DC (“电源电压：9.0～15.0V DC”): Outpost multiplies by the top of that range, so the figure is the most it could be.<br>3 A at 15 V: “发射：3A@ Max” “Transmit 3A at most”; output “10W (SSB/CW/FM) ±1dB @13.8VDC”. The maker gives the current without a voltage, for a supply of 9.0 to 15.0 V DC: Outpost multiplies by the top of that range, so the figure is the most it could be. | Xiegu, [X6100 Operation Manual, V1.6 (in Chinese)](https://www.cqxiegu.com/filedownload/2988637) |
| Xiegu G90S | Receive: 11.55 W (at most); Transmit, 20 W out: 99 W (at most) | 700 mA at 16.5 V: “电流消耗：接收：700mA@ Max” “Current consumption: receive 700mA at most”. The maker gives the current without a voltage, for a supply of 10.5 to 16.5 V DC (“电源电压：10.5～16.5V DC”): Outpost multiplies by the top of that range, so the figure is the most it could be.<br>6 A at 16.5 V: “发射：6A@ Max” “Transmit 6A at most”; output “20W (SSB/CW/NFM)”. The maker gives the current without a voltage, for a supply of 10.5 to 16.5 V DC: Outpost multiplies by the top of that range, so the figure is the most it could be. | Xiegu, [G90S Operation Manual, Rev.05 (in Chinese)](https://www.cqxiegu.com/filedownload/2988690) |
| (tr)uSDX | Receive: 1.104 W; Transmit, 5 W out: 6.9 W | 80 mA at 13.8 V: “Typically it draws 80mA on RX (with MS5351 – less with Si5351) and 500mA on TX @13,8V”<br>500 mA at 13.8 V: “500mA on TX @13,8V and typical 85% PA Efficiency” Output: “it produces typically 5W @ 13,8V Power Supply” (same page). | DL2MAN (the designer), [(tr)uSDX, home page](https://dl2man.de/) |
| Yaesu FT-60 | Receive: 0.9 W; Standby: 0.324 W; Transmit, 144 MHz, 5 W out: 10.8 W; Transmit, 430 MHz, 5 W out: 11.52 W | 125 mA at 7.2 V: “Current Consumption: (Approx. @7.2 V) 125 mA (Receive)”<br>45 mA at 7.2 V: “45 mA (144 MHz, Standby, Saver Off)” Volts: “(Approx. @7.2 V)”.<br>1.5 A at 7.2 V: “1.5 A (5 W TX, 144 MHz)” Volts: “(Approx. @7.2 V)”.<br>1.6 A at 7.2 V: “1.6 A (5 W TX, 430 MHz)” Volts: “(Approx. @7.2 V)”. | Yaesu Musen, [FT-60R/E Operating Manual (EH017M209)](https://www.yaesu.com/Files/4CB43DCB-1018-01AF-FA59D5B2EDAF2F37/FT-60R_E_OM_USA_EXP_EU_ENG_EH017M209.pdf) |
| Yaesu FT-65 | Receive: 1.517 W; Standby: 0.74 W; Transmit, 144 MHz, 5 W out: 11.1 W; Transmit, 430 MHz, 5 W out: 12.58 W | 205 mA at 7.4 V: “Current Consumption (Approx. @7.4V): 205 mA (Receive) 200 mW Output”<br>100 mA at 7.4 V: “100 mA (Standby, Saver Off)” Volts: “(Approx. @7.4V)”.<br>1.5 A at 7.4 V: “1.5 A (5 W Tx , 144 MHz) 7.4 V DC”<br>1.7 A at 7.4 V: “1.7 A (5 W Tx , 430 MHz) 7.4 V DC” | Yaesu Musen, [FT-65R/FT-65E Operating Manual (EH066M105)](https://www.yaesu.com/FileLibraryF/4CB43DCB-1018-01AF-FA59D5B2EDAF2F37/FT-65R_E_OM_ENG_EH066M105_1710C-FC.pdf) |
| Yaesu FT-70D | Receive: 1.332 W; Standby: 0.888 W; Transmit, 144 MHz, 5 W out: 11.84 W; Transmit, 430 MHz, 5 W out: 14.06 W | 180 mA at 7.4 V: “Current Consumption(Approx.): 180 mA (Receive VOL Level 16)” Volts: “Supply Voltage: Nominal: 7.4 V DC” (same table).<br>120 mA at 7.4 V: “120 mA (Standby, Saver Off)” Volts: “Supply Voltage: Nominal: 7.4 V DC”.<br>1.6 A at 7.4 V: “1.6 A (5 W TX, 144 MHz 7.4 V DC)”<br>1.9 A at 7.4 V: “1.9 A (5 W TX, 430 MHz 7.4 V DC)” | Yaesu Musen, [FT-70DR/FT-70DE Operating Manual (EH051M202)](https://www.yaesu.com/Files/DFDF4D53-1B78-7375-E6C7A6E4B192BE13/FT-70DR_DE_OM_ENG_EH051M202_1809R-CY-1.pdf) |
| Yaesu FT-2980 (2 m mobile) | Receive: 9.66 W (at most); Standby: 4.14 W (at most); Transmit, 80 W out: 207 W; Transmit, 30 W out: 124.2 W; Transmit, 10 W out: 69 W; Transmit, 5 W out: 55.2 W | 700 mA at 13.8 V: “Current Consumption (typical): Rx: less than 0.7 A” Volts: “Supply voltage: 13.8 V DC ±15 %” (same table).<br>300 mA at 13.8 V: “less than 0.3 A (squelched)” Volts: “Supply voltage: 13.8 V DC ±15 %”.<br>15 A at 13.8 V: “Tx: 15 A (80 W)” Volts: “Supply voltage: 13.8 V DC ±15 %”.<br>9 A at 13.8 V: “9 A (30 W)” Volts: “Supply voltage: 13.8 V DC ±15 %”.<br>5 A at 13.8 V: “5 A (10 W)” Volts: “Supply voltage: 13.8 V DC ±15 %”.<br>4 A at 13.8 V: “4 A (5 W)” Volts: “Supply voltage: 13.8 V DC ±15 %”. | Yaesu Musen, [FT-2980R Operating Manual (EH039N111)](https://www.yaesu.com/Files/4CB3F875-1018-01AF-FAF21EE346767CA2/FT-2980R_OM_ENG_EH039N111.pdf) |
| Yaesu FTM-6000 (dual-band mobile) | Receive: 6.9 W; Transmit, 144 MHz, 50 W out: 138 W; Transmit, 430 MHz, 50 W out: 138 W | 500 mA at 13.8 V: “Current Consumption (approx.): 0.5A (Receive)” Volts: “Supply Voltage: Nominal 13.8V DC” (same table).<br>10 A at 13.8 V: “10A (50W TX, 144MHz)” Volts: “Supply Voltage: Nominal 13.8V DC”.<br>10 A at 13.8 V: “10A (50W TX, 430MHz)” Volts: “Supply Voltage: Nominal 13.8V DC”. | Yaesu Musen, [FTM-6000R/FTM-6000E Operating Manual (EH079M200)](https://www.yaesu.com/Files/4CB3F875-1018-01AF-FAF21EE346767CA2/FTM-6000R_E_OM_ENG_EH079M200_2110G-BS.pdf) |
| Icom ID-52 | Receive: 2.96 W (at most); Transmit, 5 W out: 18.5 W (at most) | 400 mA at 7.4 V: “Current drain (at 7.4 V DC): Receive (Maximum output, 8 Ω load) FM/FM-N Less than 400 mA”<br>2.5 A at 7.4 V: “Current drain (at 7.4 V DC): Transmit (at 5 W) Less than 2.5 A” | Icom Inc., [ID-52A/ID-52E Basic Manual (English)](https://www.icomjapan.com/api/download.php?post_id=3404&fl=JTJGdXBsb2FkcyUyRnN1cHBvcnQlMkZtYW51YWwlMkZJRC01MkFfRV9FTkdfQmFzaWNfMS5wZGY=) |
| Heltec WiFi LoRa 32 V3 (Meshtastic) | Listening: 0.45 W; Transmitting at 22 dBm: 1.15 W | 90 mA at 5 V: “RX: TX disabled; RX enabled 90 mA” Volts: “Type-C USB(≥500mA) 4.7 / 5 / 6 V” (typical 5 V, same sheet).<br>230 mA at 5 V: “TX: 22dBm, USB powered, 868: 230 mA” Volts: typical USB 5 V, as above. | Chengdu Heltec Automation Technology, [HTIT-WB32LA_V3 LoRa Node Development Kit datasheet, Rev 1.1, September 2022](https://resource.heltec.cn/download/WiFi_LoRa_32_V3/HTIT-WB32LA_V3(Rev1.1).pdf) |
| RTL-SDR Blog V4 (SDR dongle) | Typical: 1.35 W | 270 mA at 5 V: “Typical Current Draw 250 – 270 mA” Volts: USB supplies 5 V; the maker's sheet gives the current for its USB power. The top of the range is taken. | RTL-SDR Blog, [RTL-SDR Blog V4 Datasheet V1.0](https://www.rtl-sdr.com/wp-content/uploads/2024/12/RTLSDR_V4_Datasheet_V_1_0.pdf) |
| RTL-SDR Blog V3 (SDR dongle) | Typical: 1.4 W | 280 mA at 5 V: “Typical Current Draw: 270 – 280 mA” Volts: the same sheet speaks of “the 5V USB voltage”. The top of the range is taken. | RTL-SDR Blog, [RTL-SDR Blog V3 Datasheet](https://www.rtl-sdr.com/wp-content/uploads/2018/02/RTL-SDR-Blog-V3-Datasheet.pdf) |
| Nooelec NESDR SMArt v5 (SDR dongle) | Typical: 1.5 W; At most: 1.65 W (at most) | 300 mA at 5 V: “Operation Supply Current Isupply … 300 (Typical) … mA” Volts: “Input Voltage VUSB 5 Volts (Typical)” (same sheet).<br>330 mA at 5 V: “Operation Supply Current Isupply 270 (Min) 300 (Typical) 330 (Max) mA” Volts: “Input Voltage VUSB 5 Volts (Typical)”. | Nooelec Inc., [NESDR SMArt v5 datasheet, Revision 1, 4 October 2022](https://www.nooelec.com/store/downloads/dl/file/id/111/product/249/nesdr_smart_rtl_sdr_v5_datasheet_revision_1.pdf) |
| SDRplay RSP1B | Typical: 0.925 W | 185 mA at 5 V: “Low Current: 185 mA (excl bias T)” Volts: USB supplies 5 V; the maker's sheet gives the current for its USB power. “Powers over the USB cable” (same sheet). | SDRplay Limited, [RSP1B datasheet, January 2024, V1.0](https://sdrplay.com/wp-content/uploads/2026/06/RSP1B_Datasheet.pdf) |
| Tecsun PL-330 (shortwave receiver) | On shortwave, quiet: 0.167 W (at most); On FM, MW or LW, quiet: 0.092 W (at most) | 45 mA at 3.7 V: “Quiescent Current: < 45mA (SW)” Volts: “Power supply: 3.7V BL-5C Li-ion battery” (same table).<br>25 mA at 3.7 V: “Quiescent Current: < 25mA (FM/MW/LW)” Volts: “3.7V BL-5C Li-ion battery”. | Tecsun (copy published by Tecsun Radios Australia, its distributor), [PL-330 User Manual](https://www.tecsunradios.com.au/store/wp-content/uploads/2021/02/PL-330-USER-MANUAL.pdf) |
| Midland M-Mini USB (CB) | At most: 26.4 W (at most) | 2 A at 13.2 V: “Supply Voltage 13,2 V; Current Consumption 2 A max” | Midland Europe, [M-Mini-USB Instruction Guide](https://support.midlandeurope.com/media/manual/b/8/c/a/b8ca3f1c38bbd39b4ef23127b7971189869111d8_MANUAL_M_MINI_USB.pdf) |
| A PMR446 handheld | None: typed from the label | Makers give the pack's mAh (Motorola Talkabout: 800 mAh NiMH; Midland G7 Pro: 4 AA cells of 1,800 mAh) but not its volts or the current drawn. Read them from the pack, and add it as a device of your own. | |

#### Internet, network and screens

| Device | Figure used | As published (the publisher's words) | Source |
| --- | --- | --- | --- |
| FRITZ!Box 7530 AX router | Average: 6 W | 6 W: “Average power consumption: 6 watts” | FRITZ! (formerly AVM), [FRITZ!Box 7530 AX, technical specifications (UK)](https://uk.fritz.com/products/fritzbox/fritzbox-7530-ax/technical-specifications/) |
| BT Smart Hub 2 router | At most, its power supply's rating: 17.7 W (at most) | 17.7 W: “Output power (W) 17.7” Power supply S018CAM1200150: “Output Voltage (V) 12.0”, “Output content (A) 1.5”. | British Telecommunications plc, [Power efficiency info, BT Smart Hub 2, power supply unit information, Issue 1](https://www.bt.com/content/dam/bt/help/sh2-user-guides/BT-Smart-Hub-2-Power-Efficiency-information.pdf) |
| TP-Link Deco BE3600 mesh node | At most: 13.1 W (at most) | 13.1 W: “Power Consumption (without power adapter): 13.1 W max” | TP-Link, [Deco BE3600 (EU) 1.0 datasheet](https://static.tp-link.com/upload/product-overview/2025/202506/20250604/Deco%20BE3600(EU)1.0_Datasheet.pdf) |
| NETGEAR GS108 network switch (8 ports) | At most, every port busy: 4.92 W (at most) | 4.92 W: “Worst case, all ports used, line-rate traffic, max PoE … 4.92w [GS108v4]” | NETGEAR, [GS105/GS108 data sheet, DS-GS105/GS108-3](https://www.downloads.netgear.com/files/GDC/datasheet/en/GS105v5-GS108v4.pdf) |
| TP-Link TL-SG108S network switch (8 ports) | At most: 4 W (at most) | 4 W: “Max Power Consumption (220V/50Hz) … 4W [TL-SG108S]” | TP-Link, [TL-SG108S v3.0 datasheet](https://static.tp-link.com/upload/product-overview/2026/202609/20260924/TL-SG108S_v3.0_Datasheet.pdf) |
| Synology DS124 NAS, 1 drive | Being used (access): 10.69 W; Drives asleep (hibernation): 3.44 W | 10.69 W: “Power Consumption 10.69 watts (Access)” Tested with 1 × HAT5300-12T (Synology's knowledge centre).<br>3.44 W: “3.44 watts (HDD Hibernation)” Tested with 1 × HAT5300-12T. | Synology Inc., [Product Specifications DS124 (last updated 6 August 2026)](https://global.download.synology.com/download/Document/Hardware/ProductSpec/DiskStation/24-year/DS124/enu/Product_Spec_DS124_enu.pdf); Synology Inc., [How is power consumption tested on Synology devices? (knowledge centre)](https://kb.synology.com/en-ca/DSM/tutorial/How_is_power_consumption_tested_on_Synology_devices) |
| Synology DS224+ NAS, 2 drives | Being used (access): 14.69 W; Drives asleep (hibernation): 4.41 W | 14.69 W: “Power Consumption 14.69 watts (Access)” Tested with 2 × HAT5300-12T (Synology's knowledge centre).<br>4.41 W: “4.41 watts (HDD Hibernation)” Tested with 2 × HAT5300-12T. | Synology Inc., [Product Specifications DS224+ (last updated 6 August 2026)](https://global.download.synology.com/download/Document/Hardware/ProductSpec/DiskStation/24-year/DS224+/enu/Product_Spec_DS224+_enu.pdf); Synology Inc., [How is power consumption tested on Synology devices? (knowledge centre)](https://kb.synology.com/en-ca/DSM/tutorial/How_is_power_consumption_tested_on_Synology_devices) |
| Synology DS423+ NAS, 4 drives | Being used (access): 28.3 W; Drives asleep (hibernation): 8.45 W | 28.3 W: “Power Consumption* 28.3 watts (Access)” Tested with 4 × HAT5300-12T (Synology's knowledge centre).<br>8.45 W: “8.45 watts (HDD Hibernation)” Tested with 4 × HAT5300-12T. | Synology Inc., [Product Specifications DS423+ (last updated 23 April 2025)](https://global.download.synology.com/download/Document/Hardware/ProductSpec/DiskStation/23-year/DS423+/enu/Product_Spec_DS423+_enu.pdf); Synology Inc., [How is power consumption tested on Synology devices? (knowledge centre)](https://kb.synology.com/en-ca/DSM/tutorial/How_is_power_consumption_tested_on_Synology_devices) |
| QNAP TS-233 NAS, 2 drives | Operating, typical: 10.81 W; Drives on standby: 3.43 W | 10.81 W: “Power Consumption: Operating Mode, Typical 10.81 W”<br>3.43 W: “Power Consumption: Disk Standby Mode 3.43 W” | QNAP Systems, [TS-233, hardware specifications](https://www.qnap.com/en-uk/product/ts-233/specs/hardware) |
| Dell P2425H 24-inch monitor | On: 11.7 W | 11.7 W: “On mode power demand in SDR 11,7 W” | European Commission, EPREL (supplier Dell), [Product information sheet, electronic display, registration 1865623](https://eprel.ec.europa.eu/fiches/electronicdisplays/Fiche_1865623_EN.pdf) |
| Fibre box (ONT) or modem | None: typed from the label | Openreach and others do not publish what their fibre boxes draw. Its power supply's label gives the most it can (volts × amps). Add it as a device of your own. | |

#### Light, warmth, food and health

| Device | Figure used | As published (the publisher's words) | Source |
| --- | --- | --- | --- |
| LED bulb, 806 lumens (IKEA SOLHETTA) | Rated: 5 W | 5 W: “Rated Power 5 W; Luminous flux 806 lm; Energy efficiency class C” | IKEA, [SOLHETTA LED bulb E27 806 lumen, product page (article 005.915.16)](https://www.ikea.com/gb/en/p/solhetta-led-bulb-e27-806-lumen-globe-opal-white-00591516/) |
| Dometic CFX3 35 compressor cool box | Average, 32 °C outside and 4 °C inside: 11.76 W | 980 mA at 12 V: “Energy Consumption 12VDC (Ambient@32C, Internal@4C), [Ah/h] 0.98” 0.98 Ah each hour at 12 V: an average of 0.98 A. | Dometic, [Dometic CFX3 35 (9620009572), product page, specifications](https://www.dometic.com/en/product/dometic-cfx3-35-9620009572) |
| Kettle (Russell Hobbs Brontë) | Rated: 3,000 W (at most) | 3,000 W: “Wattage 3000” The page gives no unit beside the figure; its label is “Wattage”. | Russell Hobbs (Spectrum Brands UK), [Brontë Kettle, Stone, model 26751, product page](https://uk.russellhobbs.com/bronte-kettle-stone) |
| Microwave (Sharp R224H) | Starting: 1,900 W (at most); Running: 1,300 W | 1,900 W: “Input (Initial): 1.9 kW”<br>1,300 W: “Input (Steady): 1.3 kW” | Sharp (New Zealand), [R224HW Microwave Oven Operation Manual with Cooking Guide](https://www.sharp.net.nz/userfiles/media/production/technical_document/rel_754/operation_manual_r224h_updated.pdf) |
| CPAP: ResMed AirSense | None, by design | This is a medical device. Its maker's guide and the person's clinician govern how it is powered and for how long; Outpost gives no figure for it. ResMed's Power Station II guide says its run time depends on the settings and that it is “Not applicable to devices when using heated humidification and heated tubing”, and: “Make sure to revert to AC power when the remaining capacity of RPS II and/or device internal battery is low.” Follow ResMed's guides for your machine. | ResMed, [Power Station II User guide, 248948/1 2020-02](https://ap.resmed.com/hubfs/Himalayas%20-%20B2C/SG/Sleepcare/PDF/power-station-ii_user-guide_row_mul.pdf); ResMed, [AirSense 11 User guide (UK/EU), 398272/1 2024-08](https://document.resmed.com/documents/products/machine/airsense-11/user-guide/398272_airsense11-uk-eu_user-guide_eur_mul.pdf) |
| CPAP: Philips DreamStation 2 | None, by design | This is a medical device. Its maker's guide and the person's clinician govern how it is powered and for how long; Outpost gives no figure for it. Philips's manual: “a Philips Respironics DC battery adapter cable, when used with a DC power cord, allows the device to be operated from a 12 VDC free-standing battery”; “Only use a Philips Respironics DC Power Cord and Battery Adapter Cable”; and “The attached battery does not support humidification.” Follow Philips's manual for your machine. | Philips Respironics, [DreamStation 2 CPAP / Auto CPAP User manual, 1143534 R02](https://www.documents.philips.com/assets/Instruction%20for%20Use/20211202/7e52e95bb1a343a4a223adf201582311.pdf) |
| Another lamp or lantern | None: typed from the label | LED lamps say their watts on the base or the box. A rechargeable lantern: add it as a device of your own that is charged, with its battery's mAh and volts. | |
| A USB or 12 V fan | None: typed from the label | Its label gives volts and amps (or watts): volts × amps is the most it draws. Add it as a device of your own. | |
| An electric blanket | None: typed from the label | Its watts are on the label by the plug or on the controller. It draws less on a low setting. Add it as a device of your own; it needs an inverter. | |
| A medical device's charger | None: typed from the label | Read the watts (or volts × amps) from the charger's label, and add it as a device of your own. The maker's guide and the person's clinician govern how it is used and powered. | |

### Left out, for want of a source

- **Yaesu FT-818ND and FT-817ND** current draw: Yaesu's site no longer has their
  manuals; copies are on third-party sites only. The FT-818's battery is in.
- **Xiegu G90** (the first model): Xiegu publishes no manual for it; the G90S is in.
- **Baofeng UV-5R** and **Quansheng UV-K5**: the makers' sites refused or would not
  render for a program; only third-party copies of their manuals were found.
- **AnyTone AT-D878UV** and **LilyGo T-Echo**: no current published; their batteries
  are in. **LilyGo T-Beam** and **RAK4631**: no current at a stated voltage (RAK's
  20 dBm figure is printed "12 5mA").
- **PMR446 handhelds** (Motorola Talkabout T82, Midland G7 Pro): pack mAh without volts
  and no current; offered as a label to read.
- **CB sets** other than the Midland M-Mini USB; **Albrecht AE 6110** gives only "13,2 V".
- **Airspy** receivers, **Sangean ATS-909X2**, **Uniden SDS100**, **Tecsun PL-990**,
  **Eton Elite**, **Kaito**, **Whistler**: no figure from the maker found.
- **Raspberry Pi SSD, M.2 HAT+, Camera Module 3, Active Cooler**: their product briefs
  give no power figure (the M.2 HAT+ "up to 3A to connected M.2 devices" is what it can
  supply, not a draw). The documentation's "Camera Module 250 mA" and the case fan are
  in. Raspberry Pi publishes no idle or loaded figure for the Pi 5 beyond the bare
  board's 800 mA.
- **Samsung Galaxy A56 and A16**, **Google's and Samsung's nominal voltages**,
  **Apple Watch**, **Kindle**: no figure published (the phones' mAh are in, at 3.6 V as
  above; the rest are labels to read).
- **Openreach ONT**, **BT Smart Hub 2** (BT gives only its power supply's rating, which
  is in as "at most"), **Sky** and **Virgin** hubs, **eero** and **Nest Wifi**: not
  found or not attempted.
- **An electric blanket**, **a rechargeable lantern**, **a USB or 12 V fan**: only
  retailers' figures found; labels to read.
- **Philips DreamStation battery guide**: not found on Philips's site; the DreamStation 2
  manual's battery section is quoted instead.

## Safety where the calculators touch it

The battery runtime calculator has "Charging safely, and generators" behind one
disclosure: official guidance quoted as published, with whose it is and the date read,
and nothing of Outpost's own (`CHARGING_SAFETY` in `power-devices-data.ts`):

- Office for Product Safety and Standards, GOV.UK, [Buy Safe, Be Safe: avoid e-bike and
  e-scooter fires](https://www.gov.uk/guidance/buy-safe-be-safe-avoid-e-bike-and-e-scooter-fires):
  "Charge when you are awake and present, not when you are asleep or away from home."
- London Fire Brigade, [Batteries and chargers](https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/):
  not leaving things on charge after the cycle is complete, and never covering chargers.
- Electrical Safety First, [Overloading sockets](https://www.electricalsafetyfirst.org.uk/safety-advice/home-and-people/house-maintenance/overloading-sockets/),
  and London Fire Brigade, [Cables, fuses and leads](https://www.london-fire.gov.uk/safety/the-home/electrical-items/cables-fuses-and-leads/):
  an extension lead's rating, and kettles and microwaves not on the same extension.
- The UK Chief Medical Officers, [Public health advice during a national power
  outage](https://www.gov.uk/government/publications/public-health-advice-from-uk-cmos-during-a-national-power-outage/keeping-warm-or-cool-in-extreme-weather-scripts-for-broadcast-media):
  no petrol or diesel generators indoors, and a generator "outdoors at least 6 metres or
  20 feet away".

## The input pieces

The calculators use a small set of input components kept in one file,
`apps/web/src/features/power/inputs.tsx` (`NumberField`, `PercentField`,
`ChoiceField`, `Answer`, `Answers`, `Basis`, `CalculatorGroup`, `Fields`,
`ClearButton`), so that they can be moved to the shared calculator kit
(`apps/web/src/features/tools/kit/`) by changing that file and its imports.
