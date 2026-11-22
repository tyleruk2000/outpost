# Power and batteries

**Tools → Power and batteries** has quick calculators, which keep nothing, and **power
plans**: your own battery system, saved under a name and worked out into how long it runs
and how much solar it needs. Everything is arithmetic on what you type, and works with no
connection.

**Electricity can hurt people and start fires.** Every answer is an estimate and general
information. Figures that bear on safety (how much current a cable, battery or charger may
carry) come from a named rule or from the maker's data you type in, and are never filled in
by Outpost. Nothing here replaces the wiring regulations for an installation or a qualified
electrician.

## The quick calculators

### Battery runtime

Give the battery (Ah and volts, or Wh) and its usable share: 80% for LiFePO4 and 50% for
lead acid to start with. Then say what it runs:

- **Devices.** **Add a device** opens the library of [common devices](#common-devices) and
  your own. Search ("pi 5", "iphone", "handheld") or browse; press a name to add it, again
  to add a second. For each, say hours a day (something that runs), charges a day
  (something charged), or, for a radio, its mode, minutes an hour transmitting, hours on
  and its output. **Where these figures come from** shows each figure with the publisher's
  words, document, link and the date read. Then give the number of days and, where they
  apply, the USB converter's, charging and inverter efficiencies.
- **A load in watts.** One load, with the efficiency of everything between battery and
  load (100% for DC, the inverter's for AC).

The answers: how long it runs, how many charges of each thing charged, **Uses most**, and
**Battery needed** for the days given with no charging. **Solar to keep up
with this** opens the solar calculator with the day's use filled in. **Make this a plan**
saves it all as a power plan.

Where a figure is only a maximum, runtimes are "at least".

**Charging assumptions**, each changeable: a phone's own charging is 80%, Outpost's
assumption, since nobody publishes one figure; a 12 V to USB converter is 71%, MEAN WELL's
typical figure for its SD-25A-5. Phones whose makers give only mAh are counted at 3.6 V; many
are nearer 3.8 V, so expect a few per cent fewer charges.

Left out: the voltage falling as the battery empties, cold, age, Peukert's effect (lead
acid is rated at its 20-hour rate) and devices drawing less as they fill.

### Solar output and charging

A day's output = panel watts × peak sun hours × (1 − losses) × temperature factor ×
controller. The losses are PVWatts' ten, each changeable, 14.08% combined to start
(soiling 2%, shading 3%, mismatch 2%, wiring 2%, connections 0.5%, light-induced
degradation 1.5%, nameplate 1%, availability 3%, snow and age 0%). Temperature costs 0.47%
a degree above 25 °C. For an MPPT controller give its efficiency (95% is a starting figure,
not a source); for PWM, the battery and panel voltages from the labels. Peak sun hours are
typed in; the screen links to PVGIS for your place. Left out: shade through the day, cloud
from day to day, and slower charging as the battery fills.

### Cable size and voltage drop

Give length, current, supply voltage and the drop you accept (BS 7671 is widely quoted as
3% for lighting and 5% otherwise; ABYC E-11 as 3% and 10%). The answer gives the drop, the
voltage at the load, the heat in the cable and the smallest metric and AWG size. Current capacity comes separately, from the US Coast Guard's limits for boat
wiring under 50 V (33 CFR 183.425), with derating in an engine space and for bundled
cables; type the maker's rating to compare that too. This is guidance from one rule, not
BS 7671.

### Batteries, generators and electronics

- **Series and parallel**: series adds volts, parallel adds amp-hours. Use batteries of the
  same model, capacity, age and charge; lithium needs a BMS and the maker's permission;
  fuse each battery or string as the maker says.
- **Generator fuel**: from your data sheet's tank size and run times. With only one run
  time the answer is a rougher estimate, and says so.
- **Electronics**: Ohm's law, the resistor colour code, resistors in series and parallel,
  an LED's resistor and a voltage divider.

**Charging safely, and generators** quotes UK official guidance (OPSS, the London Fire
Brigade, Electrical Safety First and the Chief Medical Officers): charge while awake and
present, don't overload extension leads, and keep a generator outdoors, at least 6 metres
away.

## Power plans

A plan holds a battery bank, loads, an inverter, solar, an optional generator or charger,
and the cable's rated current. It saves itself as you go. If another tab or device saved it
meanwhile, choose **Keep my version** or **Load the other version**. Plans can be copied,
deleted, compared side by side, and saved as a PDF with **Save as PDF**, **Add to library**
and **Share**. To link a plan from a page in Notes, put the plan's address in the page's
link field.

**Bring in a plan** reads a plan's JSON file from **Take everything out** and adds it as a
new plan; nothing already kept changes.

**Add a load** offers the library of devices, your own devices, a radio saved for the HF
planner (transmit draw estimated at twice its output, receive to be typed), or figures
typed by hand. A load from the library keeps where its figures came from, shown under it
and in the PDF; change a figure and it is marked "changed by you since". A load can run
over USB through the plan's converter, or be a charge of so many Wh a day.

### Peak sun hours from Weather and hazards

In the plan's solar section choose **where the panels are**: a place from Weather and
hazards, a saved place from Maps, or **Somewhere else** (coordinates, grid reference or
locator).

- If sun figures are held for that place, **Fill in from Weather and hazards** fills the
  twelve months, for panels facing south at PVGIS's best tilt or for level ground. Other
  angles differ, and shading is not counted.
- If none are held, **Fetch sun hours for** the place asks PVGIS (the European
  Commission's Joint Research Centre). Only the latitude and longitude, to two decimals,
  are sent; the answer is a few kilobytes and is kept, and the place joins the list on
  Weather and hazards. PVGIS does not cover everywhere; the screen says when it gives
  nothing.

Months you typed are replaced only after **Replace them**. The plan and its PDF say where
the figures came from.

### The answers

- A day's use, how long it runs with no charging, and days of autonomy.
- Each month, from full, for 30 days of that month's sun: solar a day, the lowest charge,
  and the day it first runs out, or "keeps up".
- Solar to break even in the darkest month (it errs high).
- Peak current from and into the battery against its rated currents and the cable's
  rating ("Not checked" where you gave no rating).
- The state of charge hour by hour over three days of the worst month, and every
  assumption in sentences.

The starting figures: LiFePO4 12.8 V, 80% usable, 92% round trip; lead acid (AGM or
flooded) 12 V, 50%, 80%; Li-ion 10.8 V, 80% (Outpost's choice), 92%. An inverter starts at
88% and 8 W idle, Outpost's figures, not a source. Radio duty: SSB voice 10%, SSB with
heavy processing and CW 20%, FM 50%, FT8 42.1%. The maker's discharge and charge current
ratings are never filled in.

Limits: up to 500 plans and 60 loads in each; up to 500 of your own devices.

### What is not modelled

Temperature (cold batteries, hot panels), ageing, Peukert's effect, the battery's voltage
curve, a charge controller's absorption and float stages, the shape of a real day's sun,
and day-to-day weather. A month is 30 days of the same sun. Peak sun hours are not worked
out for a place offline: that needs climate records Outpost does not hold.

## Your devices

**Add a device of your own** in the picker keeps a device with its figures and where they
came from; it is offered first next time. Removing one leaves loads made from it as they
are.

Plans and your devices are kept on the server, in every backup, counted on the Storage
screen, and erased with everything else.

## Common devices

The library comes with Outpost: Raspberry Pis, phones and things you charge, radios and
receivers, network equipment, and lights, a cool box, a kettle and a microwave. Every figure
is from the maker's own documents or an official body, read on 16 November 2026, never a
retailer or review.

- A figure that is only a maximum or a supply's rating is "at most", and answers using it
  "at least".
- Where a kind of thing has no single maker's figure (a phone in general, a lamp, a fibre
  box), the entry says where to read the label and offers to keep it as your own device.
- Medical devices (CPAP) have no figure, by design: the entry quotes the maker's guide and
  says that it and your clinician govern.
- A kettle and a microwave are there to show what an inverter must supply.

Left out for want of a maker's figure, among others: Yaesu FT-817ND and FT-818ND, Baofeng
UV-5R, Quansheng UV-K5, PMR446 handhelds, most CB sets, Airspy receivers, Raspberry Pi
accessories beyond the camera and fan, Apple Watch, Kindle, and most broadband hubs. Add
any of these from its label as your own device.

Product names are their owners' trade marks, used only to say which device a figure is
for. Outpost is not connected with or endorsed by any of them.

## Sources

Read on 16 November 2026: Battery University (BU-201, 216, 303, 808c); Victron Energy
LiFePO4 and SuperPack data sheets; the HOMER Pro manual (round trip, generator fuel curve);
NREL's PVWatts Version 5 manual; ARRL Station Evaluation Worksheet B (duty factors); the FT4
and FT8 protocol paper (QEX 2020); IEC 60028, ASTM B258, 33 CFR 183.425, IEC 60062 and
60063. Each device's source is with it on the screen.
