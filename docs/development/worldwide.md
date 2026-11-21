# Working worldwide

Outpost is for anyone, anywhere. A UK-only source (Ordnance Survey, the FSA, the
Environment Agency, the Met Office, GOV.UK, Public Health England) is an extra on top of
a worldwide base, never the base itself. Where no worldwide source exists, or none has
been read from a primary source, the screen says so plainly instead of showing UK data
as if it applied.

## How a screen knows where it is

Two things decide a first choice. Each is only a first choice: the screen lets the
person change it, and keeps what they chose.

- **Home's country**: the country of the saved place with the home icon
  (`useHomeCountry` in `apps/web/src/features/frequencies/home-country.ts`). Use it for
  anything about the place: emergency numbers, warnings, which guidance applies,
  frequencies, map suggestions.
- **The device's region**: the region in the browser's language, "US" from "en-US"
  (`apps/web/src/lib/region.ts`). Use it for conventions of the person reading: how a
  date is written, the paper their printer takes, the units they think in.

Rules for new code:

- Write dates with `appLocale()` (English as the device's region writes it), never a
  fixed `"en-GB"`. Times of day go through `clock.ts`. Numbers keep the full stop for
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
| Server-side dates (CSV, error messages, generated pages) | `apps/server/src/modules/*` | Not changed | The server does not know the reader's region. They use month names, which read the same anywhere. |
| First-time map opened on Britain | `maps/lib/view.ts` | Fixed | Opens on the whole world when no map is installed; with one installed it fits that, as before. |
| Map print always started on A4 | `maps/print/print-tool.tsx` | Fixed | Starts on US Letter where the device's region uses it, as every other PDF already did. |
| Temperature in °C and wind in km/h for everyone | Weather and hazards | Fixed | First choice by region: °F in the United States and its territories; mph there and in the UK. |
| Heights in metres for everyone | `lib/heights.ts` | Fixed | Feet first on a device set to the United States. Choosing metres is now kept, so it is not undone. |
| Emergency number fell back to 999 | Emergency plans, Nuclear, household papers | Fixed | Home's country first, then the device's region, then 112 (EU, UK and beyond). The field still lists every number Outpost has a source for. |
| Emergency plan templates are UK guidance | New plan dialog | Said on screen | Outside the UK (by Home, else the device) the dialog says the templates come mostly from UK guidance, that Outpost has none from the person's own government, and to check every step. The power cut number 105 is a UK step from a UK source and stays in that template. No other government's template has been read. |
| "GP", "NHS number" on medical sheets | Household papers | Fixed | "Doctor or GP surgery" on the form, "Doctor" on the sheet and grab card, a neutral example in the notes. |
| "Postcode", "County or region" on addresses | Contacts | Fixed | "Postcode or ZIP code", "County, state or province". |
| "Mains" | Power, readiness drill | Fixed | "Wall socket (mains)", "grid power", "the power off at the main switch". |
| Ration figures started on UK (PHE) figures | Tools, Rations | Fixed | Starts on the international figures (UNHCR, UNICEF, WFP, WHO) outside the UK; UK figures remain a choice. |
| Days of food in Supplies use PHE figures only | Supplies outlook | Not fixed | The screen names the source. Moving it to the international table needs a server change: filed as follow-up. |
| Device time zone fell back to Europe/London | Weather readings import | Fixed | Falls back to UTC. |
| Mesh root topic prefilled msh/EU_868 | Settings, Mesh | Said on screen | The hint says a radio with none set uses msh/ and its LoRa region (msh/US, msh/EU_868), from Meshtastic's MQTT page (read 21 Nov 2026). The stored default is unchanged; a country-to-region table has not been read from a primary source. |
| Grid references | Maps, Compass, grab cards | Already worldwide | Decimal degrees is the default readout. The National Grid is only used in Great Britain and dropped elsewhere; Compass picks UTM outside Britain. |
| Frequencies and band plans | Frequencies, Radio | Already worldwide | ITU regions and IARU Regions 1 to 3, the country filter starts on Home's country. |
| Weather and warnings | Weather and hazards | Already worldwide | Open-Meteo, GDACS and the USGS worldwide; MeteoAlarm or the US National Weather Service by Home's country; Met Office and Environment Agency as UK extras. |
| Garden calendar, map suggestions, radio licences | Garden, Explore, Radio | Already by Home's country | Each says which country it took. |
| Paper size on household papers, plans, cards, encryption aids, QR, HF predictions | PDFs | Already worldwide | A4 or US Letter, chosen by the device. |
