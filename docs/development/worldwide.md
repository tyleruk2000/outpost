# Working worldwide

Outpost is for anyone, anywhere. A UK-only source (Ordnance Survey, the FSA, the
Environment Agency, the Met Office, GOV.UK, Public Health England) is an extra on top of
a worldwide base, never the base itself. Where no worldwide source exists, or none has
been read from a primary source, the screen says so plainly instead of showing UK data
as if it applied.

## How a screen knows where it is

Two things decide a first choice. Each is only a first choice: the screen lets the
person change it, and keeps what they chose.

- **Home's country**: the current household's country, its own choice or else the country
  its home is in (`useHomeCountry` in `apps/web/src/features/frequencies/home-country.ts`,
  `households.country()` on the server). Use it for
  anything about the place: emergency numbers, warnings, which guidance applies,
  frequencies, map suggestions.
- **The device's region**: the region in the browser's language, "US" from "en-US"
  (`apps/web/src/lib/region.ts`). Use it for conventions of the person reading: how a
  date is written, the paper their printer takes, the units they think in.

Rules for new code:

- Write dates with `appLocale()` (English as the device's region writes it), never a
  fixed `"en-GB"`. On the server, use `dateInWords` or `readerLocale()` from
  `core/locale.ts`: the region of the browser's Accept-Language header, kept for the
  request and anything it starts. Times of day go through `clock.ts`. Numbers keep the full stop for
  the decimal point everywhere, through `formatNumber`.
- A PDF offers A4 and US Letter and starts on `likelyPaper`/`likelyPaperFor`.
- Units start on `likelyTemperatureUnit`, `likelyWindUnit` and `likelyHeightUnit`.
- Tests run as a device in Great Britain (`test-setup.ts` calls `setDeviceRegion("GB")`);
  a test of another region sets it and puts it back.

## Review, 21 November 2026

| What | Where | Done | Why, or what is left |
| --- | --- | --- | --- |
| Dates written the British way on every device | Over 40 web files, `formatDate` in `lib/utils.ts` | Fixed | Dates follow the device's region in English: "Nov 21, 2026" in the US, "21 Nov 2026" in Britain, Germany, India. Machine formats (UTC log stamps, time-zone parts) stay fixed on purpose. Tides left to the tides work. |
| Numbers | `formatNumber` | Not changed | A full stop for the decimal point everywhere: frequencies, grid references and many figures are written by code that cannot localise, and one screen must not mix "1.234,5" with "2.5". |
| Server-side dates (CSV, error messages, generated pages) | `apps/server/src/modules/*` | Fixed | Dates in words (tool answers, chat and merge notes, the event log page, HF predictions, route credits) follow the region of the browser that asked, from Accept-Language, as the web app does; British English when the request names no region or no request started the work. Imagery dates with month names spelled out are left as they are. |
| First-time map opened on Britain | `maps/lib/view.ts` | Fixed | Opens on the whole world when no map is installed; with one installed it fits that, as before. |
| Map print always started on A4 | `maps/print/print-tool.tsx` | Fixed | Starts on US Letter where the device's region uses it, as every other PDF already did. |
| Temperature in °C and wind in km/h for everyone | Weather and hazards | Fixed | First choice by region: °F in the United States and its territories; mph there and in the UK. |
| Heights in metres for everyone | `lib/heights.ts` | Fixed | Feet first on a device set to the United States. Choosing metres is now kept, so it is not undone. |
| Emergency number fell back to 999, then to 112 | Emergency plans, Nuclear, household papers | Fixed (24 Nov) | Home's country decides; with no home, the device's region. A country with no published source in `EMERGENCY_NUMBERS` gets no number: the plan asks for the household's own ("Not known for Canada" was 112 before Canada was added). The database default (112) is never used, as every create names a number, empty where unknown. |
| Emergency plan templates are UK guidance | New plan dialog | Partly fixed | Templates from the Queensland Government (Australia) and the Government of the Netherlands, read 22 Nov 2026, come first where Home (else the device) is in that country, and the dialog says whose they are. Elsewhere it says they are mostly UK guidance. Germany's BBK allows no copying; New Zealand's Get Ready and gov.ie refused the request (403); Canada.ca and nema.gov.au did not answer: follow-up. |
| UK-only steps in the UK templates | Emergency plans | Fixed (28 Nov) | A step naming the UK's own services (`onlyIn: ["GB"]` on the template step; a test in `emergency-plans-templates.test.ts` holds every UK step whose words or source's words name 105, Floodline, the NHS, the Met Office, GOV.UK, Ofcom, Gas Safe or redcross.org.uk to it, and keeps steps that only mention 999 unmarked) is left out of a plan started for a household whose home country is known and outside the UK (JE, GG and IM count as the UK), and listed as taken out. No home country: every step is kept; the device's region does not take steps out. Steps of the other governments' templates are not marked yet. |
| Water to store started on the UK's 3 litres | Tools, Water | Partly fixed (28 Nov) | Starts on FEMA's US gallon (Ready.gov, in sources.md) in the United States and its territories, by Home's country (else the device's region). Elsewhere it still starts on the UK's 3 litres and the hint says it is UK guidance; no other government's figure has been read. |
| "GP", "NHS number" on medical sheets | Household papers | Fixed | "Doctor or GP surgery" on the form, "Doctor" on the sheet and grab card, a neutral example in the notes. |
| "Postcode", "County or region" on addresses | Contacts | Fixed | "Postcode or ZIP code", "County, state or province". |
| "Mains" | Power, readiness drill | Fixed | "Wall socket (mains)", "grid power", "the power off at the main switch". |
| Ration figures started on UK (PHE) figures | Tools, Rations | Fixed | Starts on the international figures (UNHCR, UNICEF, WFP, WHO) outside the UK; UK figures remain a choice. |
| Days of food in Supplies use PHE figures only | Supplies outlook | Fixed | Household has an energy table: by Home's country (the UK's in the UK, the international FNNE table elsewhere and with no home place), or chosen. The server works the outlook to it. |
| Device time zone fell back to Europe/London | Weather readings import | Fixed | Falls back to UTC. |
| Mesh root topic prefilled msh/EU_868 | Settings, Mesh | Fixed | Before a household broker is saved, the root topic starts on msh/ and the region Meshtastic's "LoRa Region by Country" table (read 22 Nov 2026) gives Home's country, else the device's; the hint says which. The server offers the same for Home's country until a broker is saved, else msh/EU_868. |
| Grid references | Maps, Compass, grab cards | Already worldwide | Decimal degrees is the default readout. The National Grid is only used in Great Britain and dropped elsewhere; Compass picks UTM outside Britain. |
| Frequencies and band plans | Frequencies, Radio | Already worldwide | ITU regions and IARU Regions 1 to 3, the country filter starts on Home's country. |
| Weather and warnings | Weather and hazards | Already worldwide | Open-Meteo, GDACS and the USGS worldwide; MeteoAlarm, the US National Weather Service, ECCC (Canada), MetService (New Zealand) or JMA (Japan) by Home's country or the one chosen; Met Office and Environment Agency as UK extras. |
| Road routes | Maps › Routes › Road route | Already worldwide | Networks for any country Geofabrik publishes; junctions read "J10" in Britain, Ireland and the Crown Dependencies and "exit 21" elsewhere; kilometres or miles as chosen; one speed table for every country, kept under the UK's limits. |
| Garden calendar, map suggestions, radio licences | Garden, Explore, Radio | Already by Home's country | Each says which country it took. |
| Paper size on household papers, plans, cards, encryption aids, QR, HF predictions | PDFs | Already worldwide | A4 or US Letter, chosen by the device. |
