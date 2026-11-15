# Radio reference sheets

Outpost ships with nine reference sheets about amateur radio, licence-free radio and
emergency frequencies. They are meant to be usable with no connection at all: the
tables are in the sheets themselves, not behind a link.

This page says what the sheets are, where their facts come from, how they were checked
and what their limits are. Read the limits before relying on a sheet.

## Where to find them

In **Explore**, open the category **Radio communications**, or set **Show** to
**Included**. Each sheet says "Included with Outpost". Press **Add to library** and it
is copied into the document library there and then: nothing is downloaded, so this
works offline. From then on it is an ordinary document: it opens in the library,
its text is searched with everything else (try a frequency such as `145.500` or
`446.00625`, or a channel name), and you can tag it, move it or delete it.

The files themselves are Markdown, in [`catalog/bundled/radio/`](../catalog/bundled/radio),
and are listed in [`catalog/manifests/outpost-reference.json`](../catalog/manifests/outpost-reference.json).
Adding a sheet copies the file; the shipped one is never changed. When a later version
of Outpost ships a corrected sheet, Explore offers **Update** on the copy you added.

The same Explore category also lists the official documents the sheets were compiled
from, as PDFs you can download while you have a connection (see
[sources.md](sources.md#radio)).

## The sheets

| Sheet | What it holds | Compiled from |
| --- | --- | --- |
| Amateur radio bands in the United Kingdom | Every band in the Ofcom amateur licence with status, power for Foundation, Intermediate and Full, airborne use, the eleven 5 MHz segments, and Region 1 calling frequencies | Ofcom licence conditions booklet OFW611 (Schedule 1) and Ofcom's licensee guidance; IARU Region 1 band plans |
| Amateur radio bands in the United States | Part 97 bands by licence class, mode sub-bands, the 60 metre channels, power limits, and the rules on emergencies | 47 CFR Part 97, current electronic edition and the October 2025 printed edition; 47 U.S.C. 605; IARU Region 2 band plan |
| Amateur radio bands worldwide | The three ITU and IARU regions, international allocations from 135 kHz to 1300 MHz, where regions differ, UK and US side by side, emergency centres of activity | IARU's summary of the international allocations (2020); Ofcom; 47 CFR 97.301 |
| Radio you can use without an amateur licence | PMR446 (analogue and digital channels), UK CB (both forty-channel bands), UK short range devices at 433 MHz; FRS, GMRS, MURS and CB in the United States | Ofcom IR 2030, IR 2027, IR 2027.2 and the PMR446 information sheet; CEPT ECC Decision (15)05; 47 CFR Part 95 |
| Emergency, distress and calling frequencies | Marine VHF, MF and HF distress frequencies, aeronautical emergency frequencies, 406 MHz beacons, amateur calling frequencies and emergency centres of activity, who may transmit, and what the regulators say about emergencies | Ofcom's distress and safety annex; 47 CFR Parts 80, 95 and 97; a 2013 US Coast Guard notice; the MCA; GOV.UK; IARU |
| Weather, shipping and time signal broadcasts | NOAA Weather Radio, the time stations WWV, WWVH, WWVB, MSF and DCF77, and the UK's Shipping Forecast, Coastguard and NAVTEX broadcasts | The US National Weather Service, NIST, NPL, PTB, the MCA's January 2026 leaflet, Ofcom |
| Repeaters, data modes and space: band-plan frequencies | Repeater inputs, outputs and shifts on 2 metres in Regions 1 and 2, APRS, FT8 and WSPR frequencies, HF data segments, and the International Space Station's frequencies | IARU Region 1, 2 and 3 band plans; ARISS |
| Preparedness radio channel conventions | The "3-3-3" plan, "channel 3", the Wilderness Protocol and calling frequencies, each traced to where it comes from and labelled as unofficial | The blog post and websites that publish each convention; the regulators' channel tables |
| Radio operating reference | Phonetic alphabet, Morse code, Q code, RST reports, band names, wavelength and frequency, UTC | The FAA's Aeronautical Information Manual; ITU-R M.1677-1 and M.1172; the IARU operating guide; 47 CFR 2.101 |

Each sheet ends with three sections: **Checked** (the date), **Sources** (each with its
address and what it was used for) and **Not covered**.

## How they were made

- **From primary sources only.** Every frequency, limit and rule was taken from a
  document or page fetched on 2026-11-15 from the regulator or body responsible:
  Ofcom, the US Code of Federal Regulations as published by the Government Publishing
  Office, the IARU, the MCA, NIST and the others listed in each sheet. Nothing was
  written from memory. Where a channel table could be built by a program straight from
  the source text (the CB, FRS and PMR446 tables), it was.
- **Read twice.** After a sheet was written, its tables were compared with a second,
  separate reading of the source: a fresh download where the publisher allowed one, read
  by a different method. All 55 rows and eleven 5 MHz segments of the UK band tables,
  all 80 UK CB channel frequencies, the 40 US CB channels and the 22 FRS channels were
  compared by program, the United States band tables were compared with the printed
  2025 edition of the rules, and all 82 figures in the repeaters, data and space sheet
  were found again in a second reading of the band plans and the ARISS page.
- **Quoted, not interpreted.** Where a sheet says what the law is, it quotes or cites
  the regulator. It does not give legal advice, and it does not say that an unlicensed
  transmission would be lawful in an emergency.

## What the second reading found

- **United States, 60 metres.** The printed 1 October 2025 edition of Part 97 still shows
  the old arrangement of five channels. The current electronic rules, amended in January
  2026, give the band 5351.5 to 5366.5 kHz (9.15 W ERP) and four channels (100 W ERP).
  The sheet follows the current rules and says so.
- **Digital PMR446 abroad.** Ofcom's 2018 information sheet says digital PMR446 is not
  harmonised across Europe; the European decision as amended in March 2018 designates
  the whole band for digital use from 1 January 2018. The sheet gives both and tells the
  reader to check the country.
- **Emergency frequencies.** A first draft said every marine and aeronautical frequency
  in the sheet was in both the Ofcom annex and the FCC rules. The comparison showed four
  are in the Ofcom annex only and one in the FCC rules only; the sheet now says that.
- **Statements with no source** were removed or reworded before release: wavelength
  names for the microwave bands that no source gives, the number of NOAA transmitters, a
  claim about which time scale WWV announces, antenna rules of thumb, and an expansion of
  the name "AmRRON" that its own page does not give.
- No band edge, channel frequency or power limit differed between the two readings.

## What could not be verified

These are marked in the sheets, or left out and named under "Not covered".

- **The US Coast Guard Navigation Center** refused the automated check, so its marine
  frequency tables and channel lists were not used. Marine frequencies come from Ofcom
  and 47 CFR Part 80, which give channel numbers only for channels 16, 70 and 9.
- **CHU (Canada)**: the National Research Council's site refused the check. The row is
  marked "not verified".
- **BBC Radio 4 long wave (198 kHz)**: reported closed on 27 June 2026, but only a
  secondary source could be read. The sheet says so and tells the reader not to plan on
  it. The end of the dedicated long wave Shipping Forecast on 31 March 2024 is confirmed
  by the MCA.
- **The ITU Radio Regulations** were not read directly. International allocations are
  from the IARU's January 2020 summary, so any change made at the 2023 World
  Radiocommunication Conference is not reflected.
- **Repeater access tones and national repeater plans** for the UK and the United
  States are not in any document read, and the national societies' band plans are not
  reproduced, so the repeater tables give the regional pattern only. HF emergency nets
  run by RAYNET, ARES and similar groups were not checked with those groups and are
  left out.
- **A slip in a source.** The IARU Region 3 band plan prints the 15 metre WSPR
  frequency as "21.0946 kHz"; the sheet gives 21094.6 kHz and says so.
- **A 70 cm calling frequency for Region 1**, marine VHF channel numbers other than 16,
  70 and 9, and which of marine channels 62, 63 and 64 has which frequency.
- **Commonly repeated preparedness conventions with no traceable source** (a CB
  "truckers' channel", particular PMR446 channels in the UK, lists of "prepper" HF
  frequencies) are left out.

## Limits

- **They go out of date.** Regulators change bands and limits, and broadcasts close. A
  sheet is right for the date under "Checked" and may be wrong the day after. If a
  decision matters, check the source it names.
- **They are not official and not legal advice.** The licence or rule itself is what
  counts.
- **Two countries in detail.** The UK and the United States are covered properly; the
  rest of the world only through the international table.
- **In the library, a sheet is drawn from its Markdown, not as a web page.** Headings,
  bold type, lists, links and tables are shown (a table scrolls sideways inside its own
  box on a narrow screen, with the first column staying in view). Use "Download the
  original" for the Markdown file itself.

## Keeping them right

To correct or update a sheet: edit the file in `catalog/bundled/radio/`, re-check every
changed figure against its source, update the date under "Checked", and raise `version`
(and `lastVerified`) on its entry in `outpost-reference.json`, so that people who added
the old copy are offered the new one. Then run
`node apps/server/src/cli/validate-catalog.ts` and the catalogue tests. The rules for
what may go in `catalog/bundled/` are in [`catalog/README.md`](../catalog/README.md).
