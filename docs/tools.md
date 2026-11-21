# Tools: calculators

Five of the screens under **Tools** are small calculators: **Water**, **Outdoors**, **Radio
calculators**, **Building** and **Cooking** (`/tools/water`, `/tools/outdoors`,
`/tools/radio`, `/tools/building`, `/tools/cooking`). They are written for a phone held
in one hand, in a kitchen, a shed or on a hill: each input has its unit beside it, the
answer appears as you type, in figures and in a sentence, and **How this is worked out**
opens the formula, its source, the range it holds for and what it leaves out.

Nothing here needs the server or stores anything on it. The unit chosen for each input
and the last figure typed into it are kept in the browser as a preference of the device,
like the theme (`outpost.tools.*` in local storage). The exceptions are **Save as a
page**, which makes a new page in Notes when you press it, as any page is made, and
**Add to library** on the two printable sheets, which files the PDF in the library.

**General information, not advice.** A calculator gives the answer its formula gives.
Anything about health or safety (water treatment, food temperatures, cold and heat) is
quoted from the official body that publishes it, with the date the page was read, and no
figure is given more precisely than the source gives it. Where bodies differ, each is
quoted and the screen says whose figure it uses.

## How they are built

`apps/web/src/features/tools/kit/` is a small kit every calculator uses, so that the five
screens look and behave as one thing, and so that other builders' calculators can use it
too:

- `useNumber` and `NumberField`: a figure with a unit switch. It remembers the unit and
  the figure per device, reads what was typed (`readNumber`) and says what is wrong in
  words ("Type a figure in numbers, such as 12.5.", "Must be no more than 29,530 ft: …").
  Limits are given in the base unit and said back in the unit the person chose.
- `useChoice` and `ChoiceField`: a choice, side by side for two or three short ones, the
  shared drop-down otherwise. `useText` for a line of text.
- `units.ts`: units by their legal definitions (the international yard and pound of 1959,
  the UK gallon of the Weights and Measures Act 1985, the US gallon of NIST Handbook 44).
- `format.ts`: figures in British style, rounded by significant figures or decimals;
  `roughMinutes` rounds a time worked out from round estimates (a walking pace, a usable
  share) to about two figures: to 5 minutes under 2 hours, the quarter hour under 12 hours,
  the hour under 4 days and 6 hours beyond. The screen says so under the time.
- `Result`: the answer, said as soon as it can be, with **Copy** (which works on a plain
  http page too, through `lib/clipboard.ts`) and **Save as a page**.
- `HowWorkedOut`: one disclosure with the formula, the range, what is left out and the
  sources (each with the date it was read).
- `ToolScreen` and `Calculator`: the page, a line of links to each calculator on it, and
  each calculator as a section under a hairline.
- `sheet.ts`: a page of guidance as a PDF, laid out by the communication plans' writer.
  Only the purification guidance and the cooking temperatures are offered as sheets, both
  through the shared **Save as PDF**, **Add to library** and **Share** buttons. Each sheet
  is dated by when its guidance was read, not by the clock, so the same sheet made twice
  is the same file.

Formulas are pure functions beside each screen (`water/formulas.ts`,
`outdoors/formulas.ts` and so on), each tested against worked examples from its source.
Where Outpost already computed something, it is used rather than written again: sunrise
and sunset (`features/maps/lib/sun.ts` and `sun-text.ts`, as the map's Sun tab shows
them), distance, bearing, British grid references and Maidenhead locators
(`packages/shared`), the smooth-earth line of sight (`maxSightDistanceMeters`), watts and
dBW and the HF S-meter (`packages/shared/src/propagation.ts`), and the band table.

## Water

| Calculator | Formula | Source | Range and limits |
| --- | --- | --- | --- |
| Water to store | people × days × litres a person a day | [UK Government, Be ready](https://beready.campaign.gov.uk/be-ready-for-emergencies/) (3 litres a day for drinking, 3 days); [CDC](https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html) (1 US gallon, 3 days, 2 weeks if possible); [Ready.gov](https://www.ready.gov/water) (1 US gallon, several days); [WHO technical note 9](https://cdn.who.int/media/docs/default-source/wash-documents/who-tn-09-how-much-water-is-needed.pdf) (2.5 to 3 litres for survival, 7.5 to 15 for basic needs) | The person chooses whose figure; every body's figure for the same household is listed beside the answer. More is needed in heat, illness, pregnancy, for babies and pets. The Sphere handbook's own pages could not be read; WHO's note, adapted from Sphere, is used. |
| Rainwater from a roof | plan area (m²) × rainfall (mm) × run-off coefficient × filter efficiency | The yield formula and table A.1 of BS 8515 (draft for public comment, 2008); [CIRIA C753 table 11.4 as quoted by UNDA](https://www.unda.co.uk/drainage-calculators/rainwater-harvesting-calculator/) | The answer is a range over the two published coefficients for the surface (tiles: 0.8 in the draft BS 8515, 0.9 in CIRIA C753). Filter efficiency 0.9, which the draft calls "commonly quoted and used". With a daily use typed, how long the rain lasts is given to two figures, as the yield is. The published BS 8515 and BS EN 16941-1 could not be read (they are sold by BSI). Leaves out evaporation, overflow and first flush. |
| Filter life | (rated capacity − already filtered) ÷ litres a day, or the label's time limit if sooner | The filter's own label | No database of filters: makers rate differently and the label is the authority. A month is 30.44 days. Figures that come to more than 100 years are refused as mistyped. Dirty water clogs a filter sooner. |
| Making water safe to drink | Boiling time by height: 1 minute, 3 above 5,000 ft (EPA) or 6,500 ft (CDC). Everything else is quoted. | [CDC chart CS341852-A](https://www.cdc.gov/healthywater/pdf/drinking/Backcountry_Water_Treatment-508.pdf) (cell for cell), [CDC emergency page](https://www.cdc.gov/water-emergency/about/index.html), [CDC hiking page](https://www.cdc.gov/drinking-water/prevention/water-treatment-hiking-camping-traveling.html), [CDC Yellow Book](https://www.cdc.gov/yellow-book/hcp/preparing-international-travelers/water-disinfection-for-travelers.html), [EPA](https://www.epa.gov/ground-water-and-drinking-water/emergency-disinfection-drinking-water) (bleach table exactly), [WHO boil water brief](https://www.who.int/publications/i/item/WHO-FWC-WSH-15.02), [Drinking Water Inspectorate](https://www.dwi.gov.uk/receiving-a-boil-water-notice/) | None of the methods removes fuel, chemicals, heavy metals, salt or radioactive material: said first, in the sources' words. The bleach tables are shown as published (US gallons and quarts) and never scaled to another volume. |

Differences between bodies, as the screen says them: the EPA's three minutes start above
5,000 ft and its page gives that as 1,000 metres, which is not the same height (5,000 ft
is about 1,524 m); the CDC's start above 6,500 ft; the WHO and the Drinking Water
Inspectorate give no time, only a rolling boil. The CDC's emergency page says chlorine
dioxide "will kill Cryptosporidium"; its hiking page and chart say "somewhat effective".
Ready.gov advises against tablets that are not plain bleach; the EPA and the CDC accept
them by the maker's instructions. The DWI's page says "rolling ball", a misprint, quoted
with [sic]. The CDC's ⅛ is written 1/8 so that the printed sheet can set it.

## Outdoors

| Calculator | Formula | Source | Range and limits |
| --- | --- | --- | --- |
| Walking time | distance ÷ 5 km/h + 1 minute a 10 m climbed; Langmuir: −10 minutes a 300 m of gentle descent (5° to 12°), +10 a 300 m of steep (over 12°); Tranter's table as an option | [Adventure Activities Licensing Regulations 2004, reg. 2](https://www.legislation.gov.uk/uksi/2004/1309/regulation/2/made); Langmuir, *Mountaincraft and Leadership* (2013) pp. 38–39, as cited by [Wikipedia](https://en.wikipedia.org/wiki/Naismith%27s_rule); Tranter's table as [Wikipedia](https://en.wikipedia.org/wiki/Naismith%27s_rule#Tranter's_corrections) gives it | Tranter's table has no primary source on Wikipedia and none was found to check it against: the screen says so. It starts at a 2-hour Naismith time and refuses beyond the last figure of a row ("too much"). Times are rounded with `roughMinutes` (5 minutes under 2 hours, the quarter hour under 12), as the rule's pace and climb are round figures and Tranter's table is in quarter hours. Leaves out stops, navigation, heavy packs, snow and darkness. |
| Gradient | rise ÷ horizontal distance, as per cent, degrees and 1 in n | Trigonometry | An average: hides steeper parts. Links to the map's Routes panel for a profile from terrain. |
| Distance, bearing and coordinates | haversine on a sphere of 6,371 km; initial great-circle bearing; OS grid and Maidenhead conversion | Outpost's own `packages/shared` code, as the map's measure tool uses | Crow-flies over sea level. Bearing is true, not magnetic. |
| Sunrise, sunset and daylight | NOAA's solar calculator method (Meeus), sun's centre at −0.833° | `features/maps/lib/sun.ts`, the map's Sun tab | About a minute between 72° N and S; a flat horizon at sea level. Times on this device's clock, and with no date typed, today by that clock. |
| Wind chill | 13.12 + 0.6215 T − 11.37 V^0.16 + 0.3965 T V^0.16 (°C, km/h) | [NWS](https://www.weather.gov/safety/cold-wind-chill-chart); [Environment and Climate Change Canada](https://www.canada.ca/en/services/environment/weather/severeweather/wind-chill-index.html) and its calculator | Refused above 10 °C (50 °F) or below 4.8 km/h (3 mph), the NWS range. ECCC's risk band is quoted with the answer. Leaves out sun and wet clothing. |
| Heat index | Steadman's simple formula, then the Rothfusz regression with the NWS's two adjustments | [NWS Weather Prediction Center](https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml); [NWS heat index](https://www.weather.gov/safety/heat-index) | Refused below 80 °F (27 °C), where the NWS does not apply it, and above 110 °F (43 °C): the NWS says only that the regression "is not valid … beyond the range of data considered by Steadman", so Outpost stops near the top of the NWS's chart. ±1.3 °F. |
| Water and food for a walk | water = hours × the MoD's litres an hour for the work rate; energy = MET × kg × hours | [UK MoD JSP 375, annex F, table 1](https://assets.publishing.service.gov.uk/media/66606e4a0c8f88e868d3361c/Annex_F_-_hydration_guidance.pdf); [2024 Compendium of Physical Activities](https://pacompendium.com/walking/); [NPS Grand Canyon](https://www.nps.gov/grca/planyourvisit/hike-smart.htm) | Ranges, not single figures: water from the coolest to the hottest of the MoD's bands (wet bulb globe temperature 20 °C and above), energy over the Compendium codes for the kind of walking. The MoD's ceiling of 1.25 litres an hour is quoted. |

## Radio calculators

| Calculator | Formula | Source | Range and limits |
| --- | --- | --- | --- |
| Antenna lengths | factor × c ÷ 2f (half wave), ÷ 4f (quarter wave); factor 0.95 by default, adjustable | [ARRL](https://www.arrl.org/single-band-dipoles) (468 ÷ f feet); [RSGB](https://rsgb.org/main/get-started-in-amateur-radio/antennas/your-first-antenna-the-half-wave-dipole/) (143 ÷ f metres) | Says that a real antenna is cut long and trimmed to resonance in place. The band list fills in a frequency from Outpost's band tables. A drawing of the antenna chosen carries the lengths worked out (`radio-plates.tsx`). |
| Free-space path loss | 20 log(4πd/λ) = 32.45 + 20 log f + 20 log d | [ITU-R P.525-5](https://www.itu.int/rec/R-REC-P.525/en) (which rounds the constant to 32.4) | No ground, terrain or atmosphere. Refused closer than one wavelength, in the near field, where the formula does not hold. The transmitter power is optional: with it, the level at the receiver and its S-meter reading are given too. |
| Radio horizon | √(2kRh₁) + √(2kRh₂), k = 4/3 | [ITU-R P.834-9](https://www.itu.int/rec/R-REC-P.834/en); `maxSightDistanceMeters` | Smooth earth: says so, and links to the map's line of sight over real terrain. A drawing shows the line of sight grazing the Earth between the two horizons, the Earth drawn far smaller than it is (said under it) and every distance the real one. |
| Cable loss | dB per 100 m × length ÷ 100, read between published points on log scales | Times Microwave LMR-400 and LMR-240, SSB Ecoflex 10, Belden 8267 (RG-213), 9258 (RG-8X), 8240 (RG-58): see `radio/coax-data.ts` for each sheet's link and revision; or your own figure | Refused outside the published frequencies. Belden's 8267 and 8240 figures are per 100 ft, converted. Some sheets were read from distributors' copies because the makers' sites refused the request. Leaves out SWR, connectors, water and age. |
| Watts, dBm and S-units | dBm = 10 log mW; S9 = −73 dBm below 30 MHz, −93 dBm above; 6 dB a unit | [IARU Region 1 R.1, VHF Handbook v10.03](https://www.iaru-r1.org/wp-content/uploads/2026/02/VHF_Handbook_V10_03_final.pdf) | The handbook's own background note says the −93 dBm level was confirmed for 144 MHz and above, with nothing stated for 30 to 144 MHz: said on the screen. Real S-meters seldom follow it. |
| Battery life | capacity × usable share ÷ (Itx·tx% + Irx·rx% + Isb·standby%) | Arithmetic | The usable share (80% by default) is a working figure the person sets, not a property of a battery. The time is rounded with `roughMinutes` (to the hour from 12 hours), since the usable share and the duty cycle are estimates. A power system with solar and several loads belongs to the power tools. |

## Building

| Calculator | Formula | Source | Range and limits |
| --- | --- | --- | --- |
| Concrete and mortar | loose volume = volume × (1 + allowance) × factor, shared in the mix's proportions; also as buckets | [Hanson General Purpose Cement data sheet](https://www.packedproducts.heidelbergmaterials.co.uk/sites/default/files/assets/document/6a/98/technical-data-sheet-general-purpose-cement_0.pdf) (1:2:3, 1:4 ballast, mortar designations (i) to (iv)) | **No standard or maker was found that publishes how much loose material makes a cubic metre, or how much concrete a bag of cement makes.** The factor (1.5 by default) is a builder's rule of thumb the person can change, and the screen says so; cement is given as a volume and in buckets, not in bags. Not a designed or BS 8500 concrete. |
| Area and volume | rectangle, triangle, circle, trapezium; × depth | Geometry | Straight sides only. |
| Roof pitch | arctan(rise ÷ run); slope = √(rise² + run²) | Geometry | Not a rafter cut length (birdsmouth, ridge thickness). |
| Cutting list | first fit decreasing, one kerf a cut except the last piece of a board | A standard packing method | Said plainly to be not guaranteed optimal. |
| U-value of a wall or roof | U = 1 ÷ (Rsi + Σ d/λ + Rse); Rsi 0.13, 0.10 or 0.17 and Rse 0.04 by direction of heat flow | BS EN ISO 6946 as set out in [BRE BR 443 (2019)](https://www.cibse.org/media/wzrjrf3l/conventions-for-u-value-calculations.pdf); λ from [Knauf](https://pim.knaufinsulation.com/files/download/kine1508dat_loft_roll_40_and_44-datasheet.pdf), [Kingspan](https://www.kingspan.com/content/dam/kingspan/kil/products/thermawall-tw50-gb-and-ireland/kingspan-thermawall-tw50-brochure-en-ie.pdf) and BR 443 | Plain layers only: no thermal bridging, which the full method corrects for. An estimate, not a Building Regulations calculation. |
| Heat loss | U × A × ΔT | The definition of the U-value; published U-values from [Approved Document L](https://www.gov.uk/government/publications/conservation-of-fuel-and-power-approved-document-l) tables 4.1 and 4.2 and [RdSAP 10](https://bregroup.com/documents/d/bre-group/rdsap-10-specification-10-06-2025) tables 6, 13 and 24 | One element at steady temperatures. Leaves out ventilation, bridging at junctions, solar gain and ground floors. An estimate, not a heat-loss survey. |
| Sheets and fixings | sheets = area × (1 + allowance) ÷ sheet area, rounded up; fixings on a grid with a row at each edge | Geometry; the spacing is the sheet maker's, typed by the person | No fixing spacing is suggested by Outpost. |

## Cooking

| Calculator | Formula | Source | Range and limits |
| --- | --- | --- | --- |
| Roasting a bird | Turkey 45 min/kg + 20 under 4.5 kg, 40 min/kg to 6.5 kg, 35 min/kg over; chicken 45 min/kg + 20 (180 °C); goose 35, duck 45 min/kg (200 °C) | [FSA, Christmas food hygiene](https://www.gov.uk/government/publications/christmas-food-hygiene/christmas-food-hygiene); [Food Standards Scotland](https://www.foodstandards.gov.scot/consumer-advice/food-safety/food-safety-in-the-kitchen/parties-and-events/christmas-food-safety/turkey-cooking-guide) | Rounded to 5 minutes. Always followed by the check: 75 °C in the thickest part (FSS), no pink meat, juices clear (FSA), and FSS's "The cooking guidelines above are only estimates". FSS gives goose at 220 °C. A timer can be started from the result. |
| Safe cooking temperatures | Quoted: 60 °C for 45 minutes, 65 °C 10 minutes, 70 °C 2 minutes, 75 °C 30 seconds, 80 °C 6 seconds | [FSA, Cooking your food](https://www.gov.uk/government/publications/cooking-your-food/cooking-your-food) | °F is converted on screen. Offered as a printable sheet. |
| Timer | Counts to a time on the clock, kept on the device | | A tone made in the browser and a vibration where the phone allows. A locked phone may silence it. It sets no timer while stopped or paused, redraws once a second while it counts on screen, and while the page is hidden keeps only the alarm; shown again, it reads the time from the clock. |
| Boiling at altitude | ISA pressure 101,325 × (1 − 2.25577×10⁻⁵ h)^5.25588; Antoine log₁₀ P(bar) = 5.08354 − 1663.125 ÷ (T − 45.622) | ISO 2533; [NIST WebBook](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=4) (Stull 1947, 344 to 373 K); checked against the [CDC Yellow Book](https://www.cdc.gov/yellow-book/hcp/preparing-international-travelers/water-disinfection-for-travelers.html) (about 83 °C at about 4,900 m) | Sea level to 8,000 m. No official factor for longer cooking times was found, so none is given. Weather moves it by a degree or so. |
| Weights and measures | By the legal definitions of the units | Weights and Measures Act 1985; NIST Handbook 44 | No conversion between weight and volume, which depends on the food. |
| Oven temperatures | Nearest gas mark from the table | [Which?](https://www.which.co.uk/reviews/built-in-ovens/article/oven-temperature-conversion-table-aA5Ol9b157On); FSA's own fan offsets | Gas marks 1 to 9 only. |
| Scaling a recipe | amount × wanted ÷ serves, for the amount at the start of each line | Arithmetic | Lines with no amount at the start are left and marked. Times and safe temperatures do not scale. |

**USDA figures are not used.** Every page of the US Department of Agriculture's Food
Safety and Inspection Service refused the requests made to it on 16 November 2026, so its
safe minimum temperature chart, its roasting timetables and its high-altitude advice could
not be read and checked. They were not copied from memory. They can be added from the
pages themselves.

## What was not built

- A boiling-water or cooking-time adjustment factor for altitude: no official figure could
  be read (see above).
- Bags of cement for a volume of concrete: no published figure was found.
- A database of water filters, or of tablets and their doses: the product's own label is
  the authority, and the CDC says to follow it.
- Power and electronics calculators, a power and battery planner, a QR code generator, a
  network scanner and food and water inventory belong to other screens.
- Telling the time from the sun and stars (clock recovery, sundials, a nocturnal) is its
  own screen, the Solar clock: [tools-solar-clock.md](tools-solar-clock.md).
- Magnetic declination, grid north and the rule between map and compass, with the phone's
  own compass, are their own screen, the Compass: [tools-compass.md](tools-compass.md).
- High and low water at the tide stations near a place are their own screen, Tide times:
  [tides.md](tides.md).

## Not tested

The screens were looked at in a desktop Chromium at phone width (390 px) and at 1,280 px,
light and dark, and the end-to-end suite runs them on an emulated Pixel 7. They have not
been tried on a real iPhone: the tone and vibration at the end of the timer, and how
Safari treats the timer while the phone is locked, are unknown. That the timer stops
redrawing while the page is hidden is tested with a simulated clock and a simulated
hidden page, not in a real browser.
