# Sources for the catalogue

Every source considered for the catalogue and for the figures Outpost ships: what Outpost
does with each, its terms as read at the source, the day read, and why any is not used. Rows keep their numbers (1, R1, N1, W1,
P1, T1 and so on) because the catalogue's notes and the code refer to them.

The catalogue lives in [`catalog/manifests/`](../catalog/manifests):

| Manifest | What it holds | Entries |
| --- | --- | --- |
| `kiwix-essentials.json` | A starter selection of Kiwix archives | 61 |
| `kiwix-more.json` | Further Kiwix archives: programming documentation, Project Gutenberg shelves, medicine and science, courses, preparedness, question-and-answer sites, literature, picture books, sheet music | 107 |
| `kiwix-languages.json` | Wikipedia in twelve more languages | 12 |
| `official-publications.json` | PDF handbooks, guides, leaflets and textbooks, each from its publisher's own website | 174 |
| `radio.json` | Radio rules, frequency tables, field guides and band plans (38 PDFs) and five Kiwix archives | 43 |
| `outpost-reference.json` | Reference sheets written for Outpost and shipped with it ([radio.md](radio.md)) | 9 |
| `logbook73.json` | The Radio Engineering Handbook and fifteen radio guides by this project's author for LogBook73 (MIT), generated and shipped as books ([radio.md](radio.md)) | 16 |

Nothing is fetched until a person asks. Two kinds of content ship in [`catalog/bundled/`](../catalog/bundled) and are
added by copying, with no network: Outpost's own reference sheets, and the LogBook73
handbook and guides, which are not checked against the manufacturers' manuals. The format
and rules for entries are in [`catalog/README.md`](../catalog/README.md).

## How the catalogue treats licences

- An entry states a licence only when it was read at the source: in the file, on the
  publisher's page, or in the publisher's catalogue record. The `licenseNote` says where
  and gives the main conditions.
- Where no licence statement was found or checked, the entry says `"See source"`. That
  covers most Kiwix archives of third-party websites, the USDA canning guide and the UIAA
  papers.
- Ofcom's documents are under Ofcom's own terms (row R1), not the Open Government Licence.
  GOV.UK documents are under the Open Government
  Licence v3.0 "except where otherwise stated"; entries name what is excepted where seen.
  The Met Office and HSE publish under the same licence; photographs credited to others
  are not covered.
- "Public domain (US Government work)" is used for US federal documents. They can still
  hold photographs or figures owned by someone else; the note says so where seen.
- Several licences do not allow commercial use: CC BY-NC-SA (OpenStax, WHO), FAO's terms,
  SARE's, the ICRC's and the EPA's. That does not affect downloading and reading; it
  matters if you pass the files on.
- Outpost never redistributes anything: a download goes from the publisher to your disk,
  and the file's licence governs what you do with it.
- Everything listed may be kept and, as far as its licence note says, passed on. A
  [portable drive](portable.md) copies whatever you tick and does not look at licences, so
  sources that allow only one personal copy (Ordnance Survey's map reading guides) or need
  permission for any digital copy (Hesperian) are not listed. If the catalogue gains a
  "for your own use only" mark that keeps an entry off a drive, they could be.
- A route found with **Find a route** is OpenStreetMap data under the Open Database
  Licence; its credit is stored with it and written into its GPX export (see
  [what the licence asks](#what-the-open-database-licence-asks-of-a-found-route)).

## Checksums, and when a publisher changes a file

Kiwix entries carry no address or checksum: both come from the Kiwix feed at download
time, because Kiwix rebuilds most books every month or two and removes old builds.

Every direct entry carries the exact size and SHA-256 of the file as verified.
Publishers replace PDFs in place (every OpenStax PDF checked had been rebuilt during 2026).
When that happens the download is refused with a clear message and nothing is added. A
maintainer then checks the new file and updates `sha256`, `sizeBytes`, `version` and
`lastVerified`. A file that differs from the one checked should not arrive silently.

The online check (`pnpm catalog:validate --online`) asks each address with `HEAD`, and
when `HEAD` is refused (a "404" included) asks for the first byte, taking only that answer
as the file being gone: NIST's publications server and the Met Office's file service answer
`HEAD` with 404 for files they serve. It leaves Kiwix's hosts alone unless
`--include-kiwix` is given (see [Kiwix's robots.txt](#kiwixs-robotstxt-read-on-2026-11-17)).
On its last full run, `nasa.fastener-design-manual` failed to fetch; CDC's page for *Eat Safe
Food after a Power Outage* now links `eat_safe-r5-infographic2-h.pdf`, where the entry has
`…-h_1.pdf` (the old address still answers; its checksum was not compared).

## How sources were read

The same rules for every source:

- `robots.txt` first, for every new host. A path it disallows is left alone.
- One request at a time, through Outpost's own client ("Outpost (self-hosted offline
  library)"), with nothing personal. At least two seconds between requests to one host,
  more where asked (ten at WHO, FAO and nidirect; fifteen or more at fema.gov). The online
  check keeps ten seconds per host.
- A host that refused (403, a browser check, a challenge) or failed was left after one or
  two requests. Nothing was done to get round a refusal: no other client name, browser,
  mirror, cache or summarising service.
- Each file was fetched once, confirmed to be a real PDF, measured, hashed, read for its
  title, edition, pages, licence and outside credits, and deleted. Nothing fetched is
  kept.
- Addresses came from the publisher's own pages or catalogue services. Search engines
  were used to find pages, and are named where an address came from one. No publisher's
  own search was crawled.
- Where a quotation comes from a search result's extract, or from a page read through a
  summarising tool, the row says so.

Exceptions: the Kiwix feed was fetched once before its `robots.txt` was read; the radio
frequency pages were read with a fetch that names itself an AI agent
([below](#frequencies-to-listen-to-read-2026-11-17)); the garden pages were fetched with
curl.

## Open questions for the owner

- **Joint works with charities.** UKHSA and Age UK's *Top tips for keeping warm* (W2), and
  Ready.gov's caregivers' guide and *Prepare with Pedro* (W6), are listed. Drop them if
  joint work with a charity should be treated like FEMA P-530 (left out for outside
  credits).
- **Met Office warnings RSS.** Its terms neither allow nor forbid keeping a copy for
  offline reading.
- **NASA POWER.** No licence is named on its pages.
- **MET Norway.** It would need contact details in Outpost's client name.
- **Kiwix.** Not yet asked about its `robots.txt` (below).
- Publishers worth asking for permission are listed under
  [Wanted, and not yet possible](#wanted-and-not-yet-possible).

## Status of each source

"Via Kiwix": packaged as a ZIM archive by Kiwix and fetched from Kiwix. "Direct": the
entry points at a file on the publisher's own website. Rows 1 to 36 were read on
2026-11-15 unless a date is given.

### General

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| 1 | Kiwix Library (library.kiwix.org) | **Built in; 185 entries** across the Kiwix manifests, each naming a book whose address, size and checksum come from the feed at download time. | Every book keeps its publisher's licence; entries say "See source" where unchecked. Kiwix's English terms page returned "not found". Its feed's `robots.txt` disallows everything: see [below](#kiwixs-robotstxt-read-on-2026-11-17). |
| 2 | Kiwix downloads (download.kiwix.org/zim/) | **Built in.** Files come from these servers and mirrors; manifests never hold a `.zim` address. | As row 1. |
| 3 | Project Gutenberg (gutenberg.org) | **Via Kiwix: 17 entries.** **No direct entries, by decision**: the [robot access policy](https://www.gutenberg.org/policy/robot_access.html) says the site "is intended for human users only", and its formats "are re-built monthly". Download a single book in a browser and add it under Library. | "Public domain in the United States", as Project Gutenberg describes its books. |
| 4 | OpenStax (openstax.org) | **Direct: 30 entries** (anatomy, microbiology, nursing, biology, chemistry, physics, astronomy, mathematics, statistics, history, philosophy, economics, writing). Addresses from OpenStax's catalogue. No Kiwix archive exists. | CC BY-NC-SA 4.0, inside each PDF and in [the catalogue](https://openstax.org/apps/cms/api/v2/pages/207/): non-commercial. The high-school *Physics* is CC BY 4.0. Figures credited to others are excepted. |
| 5 | Internet Archive (archive.org) | **Add your own files.** Rights differ by item, so no general entry would be honest. | The [terms](https://archive.org/about/terms) are drawn by a script and could not be read. Read each item's rights statement. |
| 6 | NASA (nasa.gov) | **Direct: 4**: the Systems Engineering Handbook and Fastener Design Manual (Technical Reports Server); *NACA to NASA to Now* and *50 Years of Solar System Exploration* (history e-books, W30). **Via Kiwix: 2** (Astronomy Picture of the Day; TED talks about NASA). | Each [NTRS record](https://ntrs.nasa.gov/api/citations/20170001761) marks public use permitted. NASA's [media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/): generally not under US copyright; acknowledge NASA; imply no endorsement. Some APOD pictures are copyrighted by those credited. |

### Survival and preparedness

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| 7 | Ready.gov (FEMA) | **Direct: 9 entries** (Are You Ready?, hazard sheets, supply list, guides for older adults, pets, caregivers, disabilities, family communication plan, *Prepare with Pedro*). **Via Kiwix: 1** (the whole site). | The [publications page](https://www.ready.gov/publications): files may be downloaded and reproduced, provided nothing is altered and no endorsement is implied. |
| 8 | FEMA (fema.gov) (read 2026-11-17) | **Direct: 7 entries**: Planning Guidance for Response to a Nuclear Detonation (3rd ed.; address from a search engine, as no FEMA page links it); *Taking Shelter from the Storm* (P-320, the April 2025 file); five *Protect Your Property* brochures. **Left out:** the CERT participant manual (no page links a copy); *Earthquake Safety at Home* (P-530: prepared by a contractor, some 40 photographs and graphics credited to outsiders). `robots.txt` asks `crawl-delay: 15`. | [Website information](https://www.fema.gov/about/website-information): "Most material on FEMA.gov is free of copyright and may be copied and distributed without permission." Licensed photos and the DHS seal are excepted. P-320 reproduces an ICC 500 section with permission; the nuclear guidance credits one figure to an outside author; the entries say so. |
| 9 | Survivor Library (survivorlibrary.com) | **Not listed.** A third party's scans of others' works; no licence on the [home page](https://www.survivorlibrary.com/). Kiwix's archive of it (about 220 GB) is left out until the rights are checked. | None found. |
| 10 | TruePrepper survival PDFs | **Not listed.** The page re-hosts other publishers' manuals; where one has an official publisher, the catalogue points there. Its Kiwix archive is left out too. | [The page](https://trueprepper.com/survival-pdfs-downloads/): "All rights reserved". |

### Medicine and food

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| 11 | CDC (cdc.gov) (read 2026-11-17) | **Direct: 13 one-page sheets**: water in an emergency and while hiking; food after a power cut; wound care; diarrhoea; heat illness; generators and carbon monoxide; hand washing; coping with a disaster; *Ready Wrigley Prepares for Winter Weather*; chronic conditions, periods and nappy changing after a disaster. **Via Kiwix: 1** (Travelers' Health). **Left out:** *Extreme Cold* (no current page offers the PDF); *Helping Children Cope* (its file is a different sheet). stacks.cdc.gov refused and was not used. | [Use of Agency Materials](https://www.cdc.gov/other/agencymaterials.html): most material "is in the public domain, and may be freely used or reproduced". Credit CDC, imply no endorsement, do not change the substance, say it is available at no charge on www.cdc.gov. Contractor and third-party material and the logo are excepted; no listed sheet carries any. |
| 12 | WHO (iris.who.int) | **Direct: 8 entries** (Basic Emergency Care; Pocket Book of Primary Health Care for Children; Managing Complications in Pregnancy and Childbirth; Essential Medicines list; Drinking-water Quality; Preventing Drowning; *Doing What Matters in Times of Stress*; *Guidelines on Sanitation and Health*). The repository answers `HEAD` with 500, so the check asks for the first byte. | CC BY-NC-SA 3.0 IGO ([copyright page](https://www.who.int/about/policies/publishing/copyright)). Files that say "All rights reserved" inside although the record says CC are left out (the 2013 hospital pocket book, mhGAP 2.0, *Pregnancy, Childbirth, Postpartum and Newborn Care*, *Psychological First Aid*). |
| 13 | National Center for Home Food Preservation (nchfp.uga.edu) | **Direct: 8 entries**, the eight files of the *USDA Complete Guide to Home Canning* (2015). **Via Kiwix: 1** (the same guide). | A USDA bulletin; no reuse licence in the files or [page](https://nchfp.uga.edu/resources/entry/about-the-usda-guide-to-home-canning-2015-revision), site "All rights reserved": "See source". |
| AU1 | NIOSH (cdc.gov/niosh) | See [Audiobooks and the NIOSH Pocket Guide](#audiobooks-and-the-niosh-pocket-guide-added-on-2026-11-17). | Public domain. |

### Repair, engineering and computing

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| 14 | iFixit | **Via Kiwix: 1 entry.** | CC BY-NC-SA 3.0 ([licensing](https://www.ifixit.com/Info/Licensing)). |
| 15 | Arduino documentation | **Not integrated**: no offline bundle; the text is a Git repository. Arduino's Stack Exchange is in `kiwix-essentials`. | Content [CC BY-SA 4.0](https://github.com/arduino/docs-content/blob/main/LICENSE.md). |
| 16 | DevDocs (devdocs.io) | **Via Kiwix: 18 entries** (Python, JavaScript, HTML, CSS, Web APIs, HTTP, Bash, Git, Linux man pages, C, C++, Go, Rust, Node.js, TypeScript, Docker, PostgreSQL, SQLite). Kiwix has about 225 more; add any with your own manifest. | App: [MPL 2.0](https://github.com/freeCodeCamp/devdocs/blob/main/LICENSE). Each set keeps its project's licence: "See source". |

### Agriculture, aviation, weather and mountaineering

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| 17 | FAO (fao.org) | **Direct: 7 entries** (A Vegetable Garden for All; Small-scale Aquaponics; Farmer's Compost Handbook; Small Earth Dams; Small-scale Poultry Production; Quality Declared Seed System; Soil Organic Matter). **Left out:** *Rural structures in the tropics*, *Beekeeping and Sustainable Livelihoods* and *Seeds in Emergencies* (use "upon request"); *Meat Processing Technology* and *Bees and their Role in Forest Livelihoods* (permission needed); post-harvest, fish farming and grain storage manuals (HTML only). | © FAO; each document prints its terms. Listed ones: "Reproduction and dissemination … for educational or other non-commercial purposes are authorized without any prior written permission … provided the source is fully acknowledged" ([terms](https://www.fao.org/contact-us/terms/en/)). |
| 18 | FAA handbooks | **Direct: 6 entries** (Pilot's Handbook of Aeronautical Knowledge; Airplane Flying; Aviation Weather; Instrument Flying; Helicopter Flying; Aviation Maintenance Technician: General). The Airframe handbook and AC 43.13-1B pass but are set aside as aircraft-only; Powerplant (205 MB, no checksum published) not fetched. | US Government works; [handbooks page](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation). Images credited to outsiders may be in copyright. |
| 19 | ARRL (arrl.org) | **Not integrated.** The [copyright page](https://www.arrl.org/copyright) reserves all rights and forbids storing its publications in a retrieval system. One newsletter page was read to trace the "Wilderness Protocol". | All rights reserved. |
| 20 | NOAA (noaa.gov) | **Direct: 9 entries**: from the National Weather Service, the Weather Spotter's Field Guide, Thunderstorms, Winter Storms, Cloud Chart, Observing Handbook No. 1, Marine Radiofacsimile Schedules, the NOAA Weather Radio brochure; *U.S. Chart No. 1* (Office of Coast Survey); *NOAA Space Weather Scales* (SWPC). **Left out:** *Lightning Safety for Backpackers* (no author; may not be NWS's work). | Public domain unless noted ([NWS disclaimer](https://www.weather.gov/disclaimer)): do not claim it as yours or alter it and present it as official. For Chart No. 1 no reuse statement could be read (noaa.gov/disclaimer answered 403); its entry says so. |
| 21 | UIAA (theuiaa.org) | **Direct: 2 entries** (Altitude Sickness; Water Disinfection in the Mountains). | Offered free on the [medical advice page](https://www.theuiaa.org/mountain-medicine/medical-advice/); no reuse licence found: "See source". |

### Radio

"Read for the sheets": fetched once and its facts used in a reference sheet, with nothing
stored in the catalogue.

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| R1 | Ofcom (ofcom.org.uk) | **Direct: 15 entries** in `radio`: the licence conditions and guidance, coordination notice, Frequency Allocation Table, distress and safety annex, interface requirements IR 2027 to 2030, PMR446, ship radio and EMF guidance. **Read for the sheets**, with the page on receivers and scanners. | **Not the Open Government Licence.** [Copyright page](https://www.ofcom.org.uk/about-ofcom/our-website/copyright): material "may be reproduced free of charge in any format or medium, provided that it is reproduced accurately and not used in a misleading context", acknowledged as Ofcom copyright with the title. |
| R2 | US Government Publishing Office (govinfo.gov) | **Direct: 2 entries** (47 CFR Parts 97 and 95, 1 October 2025 edition). **Read for the sheets**: Title 47 from govinfo's bulk data, a 2013 Federal Register notice, 47 U.S.C. 605. | US Government works. |
| R3 | eCFR (ecfr.gov) | **Not used for content**: its `robots.txt` disallows the interfaces that serve whole parts; govinfo's bulk data is used instead. | US Government works. |
| R4 | FCC (fcc.gov) | **Not integrated**: answered 403. Its rules are covered by R2. | Could not be read. |
| R5 | NTIA (ntia.gov) | **Direct: 1 entry** (US Frequency Allocation Chart, September 2025). The "Redbook" is now a web application with no file. | US Government works. |
| R6 | NIST (nist.gov) | **Direct: 3 entries**: SP 432 and SP 250-67 (time and frequency services and stations), SP 811 (Guide for the Use of the SI; its conversion appendix descends from an IEEE standard reprinted with permission). **Not listed:** SP 330, the US version of the BIPM's SI Brochure, which the BIPM says is copyright; free at <https://doi.org/10.6028/NIST.SP.330-2019> to add yourself. | [NIST's statement](https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications): its employees' works are not under US copyright and may be reprinted; third parties' may be. |
| R7 | Maritime and Coastguard Agency (gov.uk) | **Direct: 3 entries**: the Maritime Safety Information leaflet (January 2026), *GMDSS: The Benefits of DSC*, *Life Saving Signals*. **Read for the sheets**: the leaflet, the 406 MHz beacon page, MGN 324. | Open Government Licence v3.0 "except where otherwise stated"; the leaflet's maps and one diagram are "All rights reserved", and the entry says so. |
| R8 | IARU (iaru.org, iaru-r1.org, iaru-r2.org) | **Direct: 7 entries**: the operating guide (4th ed.), the three regions' band plans, the Emergency Telecommunications Guide, the spectrum summary. **Read for the sheets.** | The operating guide is CC BY-SA 4.0. The others state no licence and the site says materials "may be subject to copyright": "See source". |
| R9 | ITU (itu.int) | **Not listed.** M.1677-1 (Morse) and M.1172 (Q code) read for the sheets. **P.533 software and maps** (github.com/ITU-R-Study-Group-3/ITU-R-HF, commit `82017594a1c6`): not shipped; the HF planner's optional second model fetches the 25 map files (137 MB) when a person asks, and the person builds the engine ([hf-propagation.md](hf-propagation.md)). VOACAP's CCIR coefficients are not shipped either (row 37). | All rights reserved. The P.533 software has no licence file; it "may be used by implementers … free from any copyright assertions", with headers reserving all rights. |
| R10 | CEPT ECC (docdb.cept.org) | **Direct: 3 entries** (T/R 61-01, the CEPT licence; T/R 61-02, the examination certificate; ECC Decision (15)05 on PMR446, also read for the sheets). | No licence stated: "See source". |
| R11 | US Coast Guard NAVCEN | **Not integrated**: 403 twice. Marine distress frequencies come from Ofcom and 47 CFR Part 80. | Could not be read. |
| R12 | National Research Council Canada (CHU) | **Not integrated**: 403; the sheet marks CHU "not verified". | Could not be read. |
| R14 | BBC | **Not read**: its site does not admit automated clients. Shipping Forecast times come from the MCA leaflet. | Not applicable. |
| R15 | RSGB (rsgb.org) | **Not integrated**: no licence found for its publications or band plans. One news page read as a secondary source. Its repeater list is P1. | No licence found. |
| R16 | US Army publications (armypubs.army.mil) | **Not integrated**: `robots.txt` disallows all automated access. Re-uploads elsewhere are not used. | Could not be read. |
| R18 | Kiwix archives on radio | **5 entries** in `radio` (Raspberry Pi, Network Engineering, Internet of Things, Space Exploration, Aviation Stack Exchange). The feed has little else on radio. *S2 Underground* (a 5.5 GB video channel) left out: rights unchecked. | Stack Exchange: CC BY-SA. |
| R19 | CISA (cisa.gov) | **Direct: 2 entries** (National Interoperability Field Operations Guide 2.02; Auxiliary Communications Field Operations Guide 1.1). | US Government works. |
| R20 | ISED Canada | **Direct: 1 entry** (RBR-4). Crawl delay of five to ten seconds asked. | No licence in the file; terms page would not load: "See source". |
| R21 | ACMA (acma.gov.au) | **Not integrated**: dropped the connection twice. | Could not be read. |
| R23 | MCA guidance notes (MGN 324) | **Not listed**: a web page with no PDF. Read through GOV.UK's content service and quoted in the emergency frequencies sheet. | Open Government Licence v3.0. |
| R24 | Reticulum and Meshtastic | **Not integrated**: Reticulum's manual is at a "latest release" address that changes, under its own restrictive licence; Meshtastic's docs are a website with no file. See also [Mesh radio](#mesh-radio-read-2026-11-17). | Reticulum: its own licence. Meshtastic: not checked. |

Also read for the sheets only, one page each, terms not checked: NPL (MSF) and PTB (DCF77) (R13); radiofreeq.wordpress.com and amrron.com, for where "3-3-3" and "channel 3" come from (R17); ARISS, for the ISS's frequencies (R22).

### Added on 2026-11-16

"Candidate": worth having, but something stopped it, named in the row.

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| N1 | Met Office (metoffice.gov.uk) | **Listed: 9 factsheets** (1 Clouds, 2 Thunderstorms, 4 Climate of the British Isles, 6 Beaufort Scale, 8 Shipping Forecast, 10 Air masses and fronts, 11 Weather charts, 14 Microclimates, 15 Weather radar). **Left out:** factsheet 3, whose text cannot be extracted. | [Factsheets page](https://www.metoffice.gov.uk/research/library-and-archive/publications/factsheets): Crown copyright under the Open Government Licence. Photographs credited to others excepted. |
| N2 | HSE (hse.gov.uk) | **Listed: 6 entries** (First aid at work INDG347; Electrical safety INDG231; Electricity at work HSG85; Chainsaws INDG317; Working at height INDG401; Gas appliances INDG238). L74 left out: guidance for employers, not a first aid reference. | [Copyright page](https://www.hse.gov.uk/help/copyright.htm): Open Government Licence with acknowledgement; images not Crown-owned excepted. |
| N3 | GOV.UK publications | **Listed: 6 entries**: *Life Saving Signals* (MCA), Countryside Code summary, Personal Flood Plan, National Risk Register 2025, *Know Your Traffic Signs*, GMDSS DSC (MCA). Addresses from GOV.UK's content service. **Left out:** *SOLAS V for pleasure craft* (withdrawn); MSN 1781 (a web page). | Open Government Licence v3.0 "except where otherwise stated". |
| N4 | Ordnance Survey (ordnancesurvey.co.uk) | **Not listed**, by the owner's decision: the map reading guides are not openly licensed and a portable drive could copy them; get them from the [teaching resources page](https://www.ordnancesurvey.co.uk/education/teacher-resources/primary). Map legends prohibit reproduction. | © Crown copyright. [General terms](https://www.ordnancesurvey.co.uk/legal/general-terms): "You may access, view, download and print off one copy of any pages of our Website for your own personal use". |
| N5 | US Department of Energy (energy.gov) | **Listed: 18 entries**, DOE Fundamentals Handbooks: Electrical Science (4), Engineering Symbology (2), Mechanical Science (2), Mathematics (2), Chemistry (2), Material Science (2), Classical Physics, Thermodynamics, Heat Transfer and Fluid Flow (3). Instrumentation and Nuclear Physics not fetched. | "Distribution Statement A. Approved for public release; distribution is unlimited." Listed by the department as "Archive". |
| N6 | Lessons In Electric Circuits (ibiblio.org/kuphaldt) | **Listed: 6 entries** (DC, AC, Semiconductors, Digital, Reference, Experiments). | CC BY 4.0, reproduced in each volume. |
| N7 | Wireless Networking in the Developing World (wndw.net) | **Listed: 1 entry** in `radio` (3rd ed., 2013, about 200 MB). | CC BY-SA 3.0 ([licence page](https://wndw.net/license.html)), which asks for a prominent link to wndw.net on copies. |
| N8 | Kiwix library, second pass (1,309 books) | **Listed: 27 entries** in `kiwix-more`: 19 Stack Exchange sites (home improvement, woodworking, medicine, homebrewing, sciences, GIS, Unix, Server Fault, security, Stack Overflow, languages), Wikiversity, three Wikipedia selections, Rabbit Waves, Grimgrains, Based Cooking, the OpenWrt wiki. **Left out:** the 193 `maps_en_*` archives (Outpost has its own maps), video and third-party collections with unread terms, LibreTexts shelves (no licence page), game and fan wikis. | Stack Exchange: CC BY-SA ([licensing](https://stackoverflow.com/help/licensing)). Wikimedia: CC BY-SA 4.0. Grimgrains: CC BY-NC-SA 4.0. OpenWrt: CC BY-SA 4.0. Rabbit Waves and Based Cooking: MIT and the Unlicense, read in their repositories. |
| N9 | Sphere Handbook (spherestandards.org) | **Candidate.** Its handbook and IP pages answered 403. Search results describe it as free to download, all rights reserved. | Could not be read. |
| N10 | IFRC first aid guidelines | **Candidate.** The page answered 403. | Could not be read. |
| N11 | MSF medical guidelines | **Not listed**: PDFs are built on request, so there is no fixed file; no licence on the about page. | Not found. |
| N12 | Hesperian (*Where There Is No Doctor*) | **Not listed.** The [open copyright policy](https://hesperian.org/open-copyright-policy/): "please contact Hesperian for written permission to use our materials in any digital format". Download the books yourself and add them under Library. | Permission needed for digital use. |
| N13 | US agencies that refused or failed | **Candidates**: 503, 502 and 403 answers; tried again in W27. | Would be US Government works. |
| N15 | Radio sources again | ukrepeater.net (disallows its data folders), Summits on the Air (no licence found), IARU VHF and HF managers' handbooks (not fetched). **Not listed.** | No licence found. |

Also: the EPA's emergency water disinfection is a web page with no PDF (N14). Not yet examined (N16): Mountaineering Scotland, the BMC, Mountain Rescue England and Wales, Oxfam's technical briefs, the US Fire Administration, the US Coast Guard's boating safety site, remaining FAO and WHO titles.

### Audiobooks and the NIOSH Pocket Guide, added on 2026-11-17

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| AU1 | NIOSH (cdc.gov/niosh) | **Listed: 1 entry**: *NIOSH Pocket Guide to Chemical Hazards*, DHHS (NIOSH) 2005-149, third printing (September 2007), 454 pages, 6,339,883 bytes. Address from the [Pocket Guide page](https://www.cdc.gov/niosh/npg/). NIOSH updates its online edition more often than the PDF; the entry says so. | Page ii: "This document is in the public domain and may be freely copied or reprinted." CDC's attribution wording (row 11) is carried. |
| AU2 | LibriVox (librivox.org) | **Links only, by decision**: a shelf of 15 books in Explore (`catalog/audiobooks.json`: three practical, six classics, six for children), each linking to its LibriVox page and zip, which you download in your browser and add under Library. Outpost never fetches a recording. Sizes are "about", worked out from the running time at 64 kbps. | [Public domain page](https://librivox.org/pages/public-domain/): "all our recordings are public domain in the USA, but not necessarily in other countries"; outside the USA, "check the copyright status of the work in your country before downloading". Its catalogue records are public domain too. The [API update](https://librivox.org/2026/09/16/librivox-api-update/) welcomes reuse and asks for requests "several seconds" apart. |
| AU3 | Internet Archive, for LibriVox's files | **Not fetched.** LibriVox's zips are "Hosted by Archive.org" at its `/compress/` service, which builds each zip on request, so no size or checksum can be pinned, and archive.org's terms could not be read. | `robots.txt` disallows only `/control/` and `/report/`; [terms](https://archive.org/about/terms) need JavaScript. |
| AU4 | Kiwix, for LibriVox | **Nothing to list**: no book found. | Not applicable. |

### The wider search, 2026-11-17

More sources for a household cut off for days, months or years, and good things to read.
Rows for publishers already above (W5 HSE, W6 Ready.gov, W7 CDC, W15 DOE, W17 WHO, W18
FAO, W19 USGS, W29 OpenStax, W30 NASA) are folded into those rows.

**A few days without power or internet**

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| W1 | Be Ready, Cabinet Office (beready.campaign.gov.uk) | **Listed: 2**: Household Emergency Plan and Be Ready Checklist (October 2026). | [About this website](https://beready.campaign.gov.uk/about-this-website-and-uk-resilience/): "All content is available under the Open Government Licence v3.0, except where otherwise stated". |
| W2 | GOV.UK: Home Office and UKHSA | **Listed: 6**: *Fire Safety in the Home* (2021); UKHSA's Easy Read booklets on cold, heat, keeping cool and after a flood; *Top tips for keeping warm and well this winter* (with Age UK; see [open questions](#open-questions-for-the-owner)). The Food Standards Agency's and the EA's flood and power cut advice is HTML only. | Open Government Licence v3.0 "except where otherwise stated". |
| W3 | Ready Scotland (ready.campaign.gov.scot) | **Listed: 1**: Home Emergency Plan (March 2026). | Open Government Licence v3.0 "except for graphic assets"; the entry says so. |
| W4 | nidirect | **Listed: 2**: Household Emergency Life-Saving Plan; Household Severe Weather Plan. Ten-second crawl delay kept. | [Crown copyright](https://www.nidirect.gov.uk/articles/crown-copyright): reuse under the Open Government Licence, logos and images excepted. |
| W8 | US EPA (epa.gov) | **Listed: 1**: *Homeowner's and Renter's Guide to Mold Cleanup After Disasters* (2015). | [Disclaimers](https://www.epa.gov/web-policies-and-procedures/epa-disclaimers): "may be freely distributed and used for non-commercial, scientific and educational purposes". |
| W10 | Government of Canada (*Your emergency preparedness guide*) | **Candidate**: canada.ca pages are HTML only; the PDF is on publications.gc.ca, not yet asked. | [Terms](https://www.canada.ca/en/transparency/terms.html): reproduction for non-commercial purposes without charge or permission. |
| W11 | New Zealand NEMA (getready.govt.nz) | **Not listed**: refused (403). | Could not be read. |
| W12 | St John Ambulance | **Not listed.** | [Legal page](https://www.sja.org.uk/legal-and-site-information/): no copying "without the prior written permission". |
| W14 | Electrical Safety First, NFCC, London Fire Brigade | **Not listed**: ESF's terms page not found; NFCC's `robots.txt` disallows PDFs; LFB has no terms page. The Home Office booklet (W2) covers the ground. | As said. |

Also not listed: FEMA's and the Met Office's winter material (W9: covered by Ready.gov's sheets); RoSPA and the American Red Cross (W13: personal use only).

**Months and years: growing, repair, medicine**

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| W16 | USDA Forest Service (fs.usda.gov) | **Listed: 3**: *The Forest Service Ax Manual* (2020; outside material named in the entry), *Crosscut Saw Manual*, *Trail Construction and Maintenance Notebook*. | [Notices](https://www.fs.usda.gov/about-agency/disclaimers-important-notices): "public information and may be distributed or copied"; credits requested. |
| W20 | US National Park Service, Preservation Briefs | **Listed: 5**: Briefs 2 (lime mortar), 21 (plaster), 29 (slate roofs), 39 (damp), 47 (exteriors). They suit British houses of brick, stone, lime and slate. | "This publication is not copyrighted and can be reproduced without penalty." Outside photographs in Briefs 39 and 47 may not be reused. |
| W21 | SARE (sare.org) | **Listed: 1**: *Building Soils for Better Crops*, 4th ed. (2021). | [Permissions](https://www.sare.org/about/sare-outreach/publishing-with-sare-outreach/recommended-attribution-format/): "may be copied and distributed with attribution for educational, non-commercial purposes." |
| W22 | ICRC | **Listed: 1**: *War Surgery*, Volume 1 (2nd ed., 2019), from the shop's free e-book download. | [Terms](https://www.icrc.org/en/copyright-and-terms-use): personal and non-commercial copying, entire and unmodified, with copyright and source. |
| W24 | CAWST (household water treatment, biosand filter) | **Candidate**: files are on `cdn.sanity.io`, not yet asked. | [Terms](https://www.cawst.org/privacy-policy-and-terms?lang=en): CC BY-SA 4.0. |
| W25 | Peace Corps manuals | **Not listed**: `robots.txt` disallows `/manuals/`. | Not applicable. |
| W27 | Forest Products Laboratory and NGA, second try | **Not listed**: failed again (502, 503). | Could not be read. |

Also not listed: Practical Action's briefs (W26: no file or terms); NRCS, the Marine Corps, the Navy and ATTRA (W28: copies only on other sites).

**Textbooks, reference and good reading**

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| W31 | Standard Ebooks | **Not listed.** The texts are public domain in the US and its own work is CC0, but [bulk downloads](https://standardebooks.org/bulk-downloads) and feeds are for paying members, and books are revised in place. A link shelf, as for LibriVox, would be honest. | As said. |
| W32 | Open Book Publishers, StoryWeaver, African Storybook, Global Digital Library, LibreTexts | **Not listed**: each refused, built files on request, stated no licence or was not followed. | Could not be read, or none found. |

### Kiwix's robots.txt, read on 2026-11-17

`https://opds.library.kiwix.org/robots.txt` (the feed every Kiwix entry is resolved
through) and `https://download.kiwix.org/robots.txt` (the file servers) both read, in full:

```
User-agent: *
Disallow: /
```

library.kiwix.org redirects to a JavaScript "Access confirmation" page, citing AI crawlers.
No Kiwix page read (its [OPDS page](https://wiki.kiwix.org/wiki/OPDS) among them) allows or
forbids other software fetching for a person.

**The owner's decision (17 November 2026):** Outpost fetches the feed and a file only
when a person presses Download, which is what the feed is published for and what Kiwix's
own readers do; that is not crawling. The catalogue's online check, which walks every
entry, leaves Kiwix's hosts alone unless `--include-kiwix` is given, and no development
tool asks those hosts for anything. Kiwix has not been asked for its view; nothing depends
on the answer for now.

### Kiwix entries added on 2026-11-17

18 entries in `kiwix-more`, from one copy of the feed, not checked online:

| Archive | Size | Licence (read 2026-11-17) |
| --- | --- | --- |
| Project Gutenberg shelves PR, PS, PZ, PN, PA, PE, M, B | 13.0, 11.6, 14.5, 3.1, 0.5, 0.6, 3.7, 5.4 GB | As row 3; a few may be in copyright in the UK. The complete edition is 221 GB, so the shelves are the practical way in. |
| Wikiquote (no images) | 401 MB | [Wikiquote:Copyrights](https://en.wikiquote.org/wiki/Wikiquote:Copyrights): editors' work CC BY-SA; quotations carry their own terms. |
| Book Dash picture books | 11.7 GB | [Open content partners](https://bookdash.org/who-we-are/open-content-partners/): CC BY 4.0. |
| Mutopia Project sheet music | 6.6 GB | [Legal page](https://www.mutopiaproject.org/legal.html): each piece CC BY-SA, CC BY or public domain. |
| Stack Exchange: Literature, History, Philosophy, English Language, Puzzling, Music, Parenting | 74, 324, 219, 774, 591, 345, 60 MB | CC BY-SA. |

Left out, licences not read (the place to start next): the Internet Encyclopedia of
Philosophy, Prunelle, Tom Lehrer, xkcd, Nicky Case, Open Music Theory, the Milne textbooks,
ProofWiki, PlanetMath, VOA Learning English, the Chopin and Celtic scores. Also out: One More
Library (a third party's collection), CrashCourse and TED.

### Repeater lists

Read on 2026-11-16 for the repeater database ([radio.md](radio.md)). The question asked of
each: may an application fetch the list when a person asks, keep a copy for that person,
and show it with no connection? Each publisher is declared in
[`catalog/repeater-sources.json`](../catalog/repeater-sources.json) as one of three kinds:

- **fetch**: the publisher offers a data file and nothing in its terms or `robots.txt`
  forbids an application fetching it. Outpost fetches that one file when somebody presses
  **Get the list**, and at no other time.
- **link**: files are offered but an application may not fetch them, or the terms could
  not be established. The screen gives the publisher's page and the steps to download the
  file by hand; the importer reads it.
- **none**: nothing usable.

Outpost does not read a list out of a web page, answer a browser check, sign in, or go
round `robots.txt` or a rate limit. Nothing here is in the catalogue or bundled. A fetched
file cannot be held to a checksum (its publisher makes it afresh); the importer's checks,
caps and preview stand in for one ([security.md](security.md)). Under **Repeaters → Get a
list**, either press **Get the list** or follow the steps and import the file you saved;
the list goes into your own database only, with the date of its data.

| # | Country | Source | Kind | What its terms say, and what Outpost does |
| --- | --- | --- | --- | --- |
| P1 | United Kingdom | RSGB ETCC (ukrepeater.net): nine CSV files made on request; private keepers' locations "truncated or obfuscated" | **link** | **No terms stated** on any page read. On 2026-11-16 the server refused a program (403, then a browser check), so download the list in a browser; the importer recognises three of its layouts. A written answer from the ETCC would change this; an administrator with one can declare it `fetch` in their own source file. |
| P2 | Worldwide | RepeaterBook (repeaterbook.com), with an export API | **link** | **Forbidden without written permission**: `robots.txt` lists "offline bundling" among uses needing it and disallows `/api/`; the [legal page](https://www.repeaterbook.com/index.php/about/legal) limits use to "personal, non-commercial home use only". Its written approval, and a token per person, would change it. Your own CSV export can be imported. |
| P3 | Worldwide | Open Repeater (openrepeater.org) | **link** | [Downloads](https://www.openrepeater.org/downloads): "Repeater data is licensed under CC0"; but its [terms](https://www.openrepeater.org/terms) forbid commercial redistribution without permission, which does not sit with CC0, and `robots.txt` disallows `/api/`. The page names no file address. A CSV saved from it can be imported. |
| P4 | Ireland | IRTS ([repeater page](https://www.irts.ie/cgi/repeater.cgi)): about seventy voice repeaters, and a CHIRP file of 45 channels | **fetch** | No licence, copyright notice or terms on its pages; `robots.txt` disallows only `/callbook` and `/lib`. The file is offered by name at a fixed address with no sign-in. **The one source fetched on that footing alone**, not on stated leave; the screen says so. It holds no positions, so these repeaters are listed but not on the map. |
| P5 | Australia | Wireless Institute of Australia ([data page](https://www.wia.org.au/members/repeaters/data/)): PDF and CSV, about 900 repeaters, no positions | **link** | "© 2026 Wireless Institute of Australia all rights reserved." No `robots.txt`. The importer recognises its CSV; status letters O and W are read as operational, others kept as written. |
| P6 | Australia | ACMA Register of Radiocommunications Licences | **none** | Its own [licence](https://cdn.acma.gov.au/offline-rrl/doc/LICENCE.TXT) would allow a copy (credit "Based on Australian Communications and Media Authority information"; licensees who are people not reproduced), but it is every radio service in several tables, beyond the importer, and the licence is accepted by the person downloading. The place to start for Australian repeater positions. |
| P7 | Finland | SRAL (automatic.sral.fi) | **link** | Terms, in the site's scripts: "may be used for non-commercial amateur radio applications only"; "Do not overload the service." Not fetched yet: its API gives modes and access as numbers from further tables, which Outpost does not read. Use the site's CHIRP export. |
| P11 | Format | CHIRP ([source](https://github.com/kk7ds/chirp)) | format only | Column names, order, defaults and mode words taken from `chirp/chirp_common.py` on 2026-11-16. A layout is not a work; no code copied. |
| P12 | Worldwide | Hearham (hearham.com): one JSON file of about 23,000 repeaters, about 10 MB | **fetch** | [Repeaters page](https://hearham.com/repeaters): "Free to use and free to use in your application. ( JSON API is available to download or use in your offline/online application!)". One request, no more than once a minute. **Know:** 1,911 rows are marked RSGB and 979 WIA, so appear to come from P1 and P5, whose publishers grant nothing; Outpost passes the list to nobody. 1,225 callsign and frequency pairs repeat; the import's duplicate handling deals with them. |

Not listed: BrandMeister, EchoLink, AllStarLink, IRLP and RadioID (P8: no terms found; RadioID answered with a browser check); OpenStreetMap's repeater tags (P9: few mapped, not in the tiles); regulators' lists (P10: Ofcom publishes none); PZK's przemienniki.net and repeate.rs (P13: maps only, **none**); ÖVSV (P14: no terms found); Germany, the Netherlands, Japan and Belgium (P15: no data file found). Other countries are covered only as far as the worldwide sources cover them.

The line on the repeater screens about who may use a repeater was checked against Ofcom's
licence conditions (a repeater "may be operated (but not controlled) by other radio
amateurs") and guidance section 4.5.3 (a keeper may restrict access "to certain
licensees").

### Maps and geospatial data

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| 22 | OpenStreetMap | **Built in.** Map regions are cut from the Protomaps build of OpenStreetMap ([maps.md](maps.md)); named routes are fetched on request ([Routes](#routes)). The OSM wiki is in `kiwix-essentials`. | Open Database Licence ([copyright](https://www.openstreetmap.org/copyright)). The credit is shown on the map. |
| 23 | Geofabrik (download.geofabrik.de) | **Not used for map tiles** ([below](#geofabrik-extracts-and-what-outpost-uses-instead)); read for the reference layers (R4, R18). | [ODbL 1.0](https://download.geofabrik.de/); free of charge from Geofabrik. |
| 24–25 | Natural Earth | **Built in**: the 1:110m world outline and the country presets' boxes. | Public domain. |
| 26 | USGS (usgs.gov) | **Direct: 5 entries** (Topographic Map Symbols; Finding Your Way with Map and Compass; Map Projections: A Working Manual; The UTM Grid; Basic Ground-Water Hydrology). | The [Publications Warehouse](https://pubs.usgs.gov/documentation/faq): report PDFs are public domain, some illustrations used with permission. |
| 27a | Ordnance Survey OS Open Names (read 2026-11-17) | **Downloaded on a press** from the [OS Downloads API](https://docs.os.uk/os-apis/accessing-os-apis/os-downloads-api/technical-specification), with no key or account. The CSV (about 103 MB for October 2026) feeds the place search for Great Britain ([maps.md](maps.md)). OS Terrain 50 was read and not added. | [OS OpenData](https://www.ordnancesurvey.co.uk/opendata) under the [OGL v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Outpost shows each edition's own line, "Contains OS data © Crown Copyright and database rights 2026.", on the map, in the search list and beside the download. |
| 27 | NASA Earthdata Search | **Not integrated**: a search over scientific data files, not documents or tiles. | [Data use guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance): freely accessible, citation asked. |
| C1 | World Magnetic Model 2025 (NOAA NCEI and the British Geological Survey) | **Built in**: `WMM.COF` unchanged, for the declination on **Tools → Compass** and the map's centre card. Fetched by hand once; nothing at run time. See [below](#the-world-magnetic-model-and-the-compass). | Public domain. |
| C2 | Ordnance Survey, *A guide to coordinate systems in Great Britain* (v3.6, 2020) | **Formulae only**, for National Grid references and grid convergence. Not shipped. | © OS 2020; no text or figure reproduced. |
| C2a | Ordnance Survey of Ireland and Ordnance Survey of Northern Ireland, *The Irish Grid: A Description of the Co-ordinate Reference System* (2000), read 2026-11-22 from the Internet Archive's copy of the file once on ordnancesurvey.co.uk (its own address now answers 404) | **Formulae, constants and test figures only**, for Irish Grid references: the Airy Modified ellipsoid (a = 6 377 340.189 m, e² = 0.006 670 540 15), the projection (true origin 53° 30′ N 8° W, scale 1.000 035, 200 000 E 250 000 N) and the worked examples of section 6 (OSO Phoenix Park, Howth), which the tests hold the projection to. Not shipped. | © Government of Ireland and © Crown copyright 2000; no text or figure reproduced. |
| C2b | EPSG Geodetic Parameter Dataset (IOGP), apps.epsg.org, read 2026-11-22 | **Parameters only**: TM75 to WGS 84 (2), EPSG:1954, a position-vector Helmert shift (482.5, −130.6, 564.6 m; −1.042″, −0.214″, −0.631″; 8.15 ppm), stated accuracy 1 m; Irish Transverse Mercator, EPSG:2157 (GRS 1980, 53° 30′ N 8° W, scale 0.999 82, 600 000 E 750 000 N). ETRS89 is taken as WGS 84, as EPSG:1954 does. ITM figures were checked against PROJ's `cs2cs`. | [Terms of use](https://epsg.org/terms-of-use.html) (read 2026-11-22): "The data may be included in any commercial package provided that any commerciality is based on value added by the provider"; "Ownership of the EPSG Dataset by IOGP must be acknowledged". The parameters are as given; the EPSG Dataset is owned by IOGP. |
| C2c | NISRA, [Grid square products](https://www.nisra.gov.uk/research-support/grid-square-products), read 2026-11-22 | **One test figure**: Belfast City Hall, 333831 E 374015 N, "J 338 740 to a 100m resolution", which checks the letters of the Irish Grid's 100 km squares. | © Crown copyright; a fact, not reproduced text. |
| C2d | Ordnance Survey Ireland, *Active Stations* (GPS-STATION-COORDINATES.pdf, osi.ie, 2012), read 2026-11-22 from the Internet Archive's copy (the address now answers elsewhere) | **Test figures only**: the ETRS89 latitude and longitude and ITM easting and northing of five active GPS stations (Athlone, Fingal CC, Cork I.T, Kilrea, Tralee), which ITM is held to within a centimetre and typed ITM is read back to. The ITM parameters agree with Cory, Morgan, Bray and Greenway, *A New Coordinate System for Ireland* (FIG, 2001, table 1), read the same day. Not shipped. | © Ordnance Survey Ireland; facts, not reproduced text. |
| C3 | NGA.SIG.0012_2.0.0_UTMUPS (NGA, 2014) | **Rules and test figures only** for UTM, UPS and MGRS: zones, bands, the Norway and Svalbard exceptions, 100 km square letters, polar letters. Read 2026-11-21 from the Internet Archive's copy (NGA's servers did not answer). | US Government work. |
| C4 | DMA TM 8358.2 (1989); NGS datasheets HV4442, UW5293, AI9478, TW0515; FGDC-STD-011-2001 (USNG) | **Test figures only**: UPS examples, survey marks with UTM coordinates and convergence, the USNG truncation rule. Read 2026-11-21. A polar MGRS test uses GeographicLib's GeoConvert manual (Karney), a secondary source. | US Government works. |
| C5 | W. Tobler, NCGIA Technical Report 93-1 (1993), [eScholarship](https://escholarship.org/uc/item/05r820mz) (read 2026-11-21) | **Formula only**, for how far on foot from a point: "W = 6 exp ( -3.5 * abs(S + 0.05))" km/h, times 0.6 off path. The slower paces and the 45° limit are Outpost's own. | Published formula, credited. |

### The World Magnetic Model and the compass

Read on 2026-11-17. [The model's page](https://www.ncei.noaa.gov/products/world-magnetic-model):
"The WMM source code is in the public domain and not licensed or under copyright." "The
information and software may be used freely by the public." Under 17 U.S.C. 403 a
copyrighted work consisting mainly of US Government material must say so; Outpost gives
that notice in the file's header and here. WMM2025 was released on 17 December 2024, covers
2025.0 to 2030.0, and "expires on December 31, 2029". Citation: "NOAA NCEI Geomagnetic
Modeling Team; British Geological Survey. 2024: World Magnetic Model 2025. NOAA National
Centers for Environmental Information. https://doi.org/10.25921/aqfd-sd83."

- [Coefficients](https://www.ncei.noaa.gov/products/world-magnetic-model/wmm-coefficients):
  `WMM2025COF.zip` (42,887 bytes), holding `WMM.COF` (90 rows) and 100 test values.
- [Published test values](https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt)
  (12 rows).
- Chulliat, A. et al. (2025), "The US/UK World Magnetic Model for 2025-2030: Technical
  Report", https://doi.org/10.25923/prbc-s316: equations, worked examples of the field and
  of UTM grid convergence, blackout and caution zones, the precision required ("correct to
  within 0.1 nT"), the declination's error model.
- The [W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/)
  specification, for the orientation angles and "Interfaces are now only available in
  secure contexts."

The OS guide (C2) gives no worked figures for grid convergence, so convergence is checked
against NOAA's UTM example and the projection's own properties. When WMM2030 is published at
the end of 2029, it goes in the same way.

### Satellite imagery

Read on 2026-11-16. Nothing is bundled: each picture is fetched from its publisher when a
person asks ([maps.md](maps.md)).

| Source | How Outpost uses it | Licence and terms |
| --- | --- | --- |
| NASA Blue Marble: Next Generation (July 2004, 500 m) | **Downloaded on request**: the 2 km GeoTIFF (255,799,706 bytes) or eight 500 m GeoTIFFs (3,259,890,999 bytes) from `assets.science.nasa.gov`. | [Blue Marble page](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/): produced by Reto Stöckli; "please credit “NASA Earth Observatory.”" NASA's media guidelines as row 6. |
| Copernicus Sentinel-2 Level-2A, Collection 1 (10 m, from 2015) | **For areas chosen on the map.** Scenes found with Element 84's Earth Search (`sentinel-2-c1-l2a`); only the parts of the red, green, blue and scene-classification files covering the area are read, from `e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com`. The older `sentinel-2-l2a` collection is not used: many of its files disagree with their metadata's scale and offset ([issue 71](https://github.com/Element84/earth-search/issues/71)). | [Legal notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice): "free, full and open access … without any express or implied warranty"; adapted data must say "Contains modified Copernicus Sentinel data [Year]". The [AWS registry](https://registry.opendata.aws/sentinel-2-l2a-cogs/): no AWS account required, not requester-pays. |
| Element 84 Earth Search (STAC) | One search per press of **Find pictures**; at most four requests at once to the bucket, backing off on 429 and 503. | [README](https://github.com/Element84/earth-search): "free-to-use"; "does not come with any guaranteed service." No rate limit found. |
| EOX Sentinel-2 cloudless | **Not integrated.** The requester-pays bucket EOX described in 2017 (`eox-s2maps`) no longer exists, and the map service's terms do not allow bulk downloads for keeping. Building it would need EOX's terms for a kept copy, the person's AWS credentials in the system's secret store, and the cost (0.09 USD a GB out, as AWS priced it) shown before download with a hard cap. | [Licence](https://cloudless.eox.at/license-non-commercial): 2018–2025 CC BY-NC-SA 4.0; 2016 CC BY 4.0. [FAQ](https://cloudless.eox.at/documentation/faq): commercial use of 2018+ public endpoints "strictly prohibited". Paid licences from €1,500. |
| USGS Landsat on AWS | **Not integrated**: the bucket is requester-pays, billed to the downloader's AWS account. | "There are no restrictions on Landsat data downloaded from the USGS" ([registry](https://registry.opendata.aws/usgs-landsat/)). |
| Copernicus Data Space Ecosystem | **Not used**: downloads need an account token ([OData](https://documentation.dataspace.copernicus.eu/APIs/OData.html)), and files are JPEG 2000. | |

### Aerial photographs

Read on 2026-11-16 ([maps.md](maps.md)). The test for each: an open licence that allows
keeping a copy; no account, key or payment; and a form Outpost can read a small area of
(a Cloud-Optimised or modest GeoTIFF, by range request). Facts from search results only
are marked so.

| Source | Licence | Detail and form | Verdict |
| --- | --- | --- | --- |
| New Zealand: LINZ ([AWS registry](https://registry.opendata.aws/nz-imagery/)) | CC BY 4.0, credited to each survey's licensor ("Licensed by (insert the licensor) for re-use under CC-BY-4.0.") | 5 to 30 cm; COG (WebP), NZTM, public S3 bucket, no account | **Built.** Outpost credits the licensor of the survey used. |
| United States: USDA NAIP via Microsoft's [Planetary Computer](https://planetarycomputer.microsoft.com/api/stac/v1/collections/naip) | Public domain: "Please credit 'NAIP imagery provided by USDA Farm Service Agency' on any use." (in every file) | 30 cm to 1 m, at least every three years per state, 2010 onwards; COG | **Built.** An anonymous token from `planetarycomputer.microsoft.com/api/sas/v1/token/naip` is fetched when first needed, held in memory until five minutes before it lapses, never stored. At most four file requests at once, backing off on 429 and 503. |
| England: Environment Agency vertical aerial photography ([record](https://environment.data.gov.uk/dataset/dae203a8-ba24-4c54-bab0-866b9faadb58)) | Open Government Licence ("© Environment Agency copyright and/or database right 2022. All rights reserved.") | 10 to 50 cm, project by project since 2006, patchy; ECW only, in 5 km zips per survey year | **Cannot**: ECW needs Hexagon's closed decoder, and a small area needs the whole zip. GeoTIFF or COG from the Agency would change it. You can convert ECW yourself with desktop software, but Outpost does not yet import your own GeoTIFF as imagery. |
| Switzerland: swisstopo SWISSIMAGE 10 cm ([terms](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices)) | Free use and distribution, commercial included; "A reference to the source is mandatory." | 10 cm (25 cm over the Alps); COG, JPEG 2017–2025, Deflate 2026; LV95 | **Could be built, not built**: needs a JPEG decoder and the Swiss projection. |
| Netherlands: [Beeldmateriaal Nederland](https://beeldmateriaal.nl/dataroom) | CC BY 4.0 | 8 cm; 1 km GeoTIFF tiles, JPEG, no overviews, RD New | **Could be built, not built**: JPEG, the Dutch projection, and no reduced copies. PDOK's tile service is for viewing. |
| France: IGN [BD ORTHO](https://www.data.gouv.fr/datasets/bd-ortho-r) | Licence Ouverte 2.0 | 20 cm; JPEG 2000 per département | **Cannot**: no small-area access in a form Outpost reads. |
| Spain: PNOA ([record](https://www.idee.es/csw-codsi-idee/srv/api/records/spaignTrueOrto2025)) | CC BY 4.0 ("PNOA 2025 CC-BY 4.0 scne.es") | 25 cm; COG via the CNIG download centre | **Not verified**: whether files need registration. |
| Finland: [NLS](https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/orthophotos) | CC BY 4.0 | 50 cm; TIFF; interfaces need an API key | **Cannot without a key.** |

Also not built: NAIP on AWS (requester-pays); Scotland's portal (LiDAR only, OGL v3); Wales and APGB (public sector licences only); Northern Ireland's DAERA coastal photographs (a viewing service of the coast, OGL per search results); Estonia (form and access not confirmed); Norway (copying needs the rights holders' permission); Denmark (an account and token, per search results).

### Routes

Read on 2026-11-16 for **Find a route** on the Maps screen ([maps.md](maps.md)). A route is
fetched when a person chooses one, through a server in T2 or T3, and kept as a track;
nothing is bundled. Sources are declared in `catalog/route-sources.json`; you can add your
own in `<data directory>/catalog/routes/route-sources.json` (not a place for credentials).

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| T1 | OpenStreetMap route relations and named ways | **Built in.** The Llanberis Path, for example, is relation [4004181](https://www.openstreetmap.org/relation/4004181), five ways, 6.0 km. | ODbL 1.0; credit "© OpenStreetMap contributors". See [below](#what-the-open-database-licence-asks-of-a-found-route). |
| T2 | Overpass API at Private.coffee (overpass.private.coffee), a non-profit in Austria | **Built in**, for any part of the world no regional server covers. Often slow: on the day one search answered after 95 seconds and four got no answer within a minute. | [Its page](https://overpass.private.coffee/) (10 April 2026): any project, commercial included, no registration or rate limit; optimise queries; nothing personal; credit OpenStreetMap; "a meaningful User-Agent header" with a project link; `POST` preferred; not for "projects related to warfare, military applications" or critical infrastructure. Outpost sends one question at a time by `POST` as "Outpost/<version>" with the project's address. |
| T3 | Overpass API at dresel.systems (ovp.dresel.systems), Europe and North America, privately run in Germany | **Built in**, asked first for views in Europe and North America. Answers in under six seconds. | [Its page](https://ovp.dresel.systems/): open, "ohne Anmeldung und ohne API-Schlüssel", a free offer for all; at most four queries at once; no guarantee. The [OSM wiki](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances): "Please send a User-Agent or Referer that identifies your app." |
| T4 | overpass-api.de (FOSSGIS) | **Not listed.** The [Overpass manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) counts relying on the public instances as an app's backend as problematic, and [FOSSGIS](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/) says its URLs "should not be hardcoded into the app." You may declare it for your own use. | As quoted. |
| T8 | OpenStreetMap editing API | **Not used.** [Policy](https://operations.osmfoundation.org/policies/api/): "not for read-only purposes or projects." | As quoted. |
| T9 | Waymarked Trails | **Not used**: "Mass download is not allowed" (its [help text](https://github.com/waymarkedtrails/waymarkedtrails-website/blob/master/src/i18n/qot/helppages.yaml)). Outpost reads the same relations from T1. | Overlay CC BY-SA 3.0 DE; GPX ODbL. |
| T10 | National Trails (England), Natural England ([data.gov.uk](https://www.data.gov.uk/dataset/national-trails-england3)) | **Candidate**: one zip of every trail in formats Outpost has no reader for. | OGL v3.0; "© Natural England copyright. Contains Ordnance Survey data © Crown copyright and database right [year]". |

Also not listed: overpass.atownsend.org.uk (T5: its policy points to the same "problematic behaviours"; not for commercial use), VK Maps (T6: no terms on the operator's page), and servers needing a key or payment (T7: Outpost keeps no keys for this). Candidates not built: the US National Park Service's and Forest Service's trail lines (T11, T12: segments, licences not confirmed). Route-sharing sites (AllTrails, Komoot, Walkhighlands, OS Maps, Strava, Wikiloc; T13) are not used or contacted: export a GPX from your own account and import it.

#### What the Open Database Licence asks of a found route

Read on 2026-11-16 in the [licence](https://opendatacommons.org/licenses/odbl/1-0/) and
the OpenStreetMap Foundation's guidelines on
[produced works](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline),
[substantial extracts](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline)
and [attribution](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines). A reading,
not legal advice.

- **A route's points, kept as data or a GPX file, are an extract of the database**, not a
  produced work: "If the published result of your project is intended for the extraction
  of the original data, then it is a database and not a Produced Work."
- **Whether one route is "substantial" is not settled by a number**, so every found route
  is treated the same: as OpenStreetMap data, with the notice kept.
- **Passing it on** to people outside your household (section 4.2) means the same licence,
  its address with the data, and the notices intact: hence the licence address and credit
  in the GPX file and the route's description. Share-alike (4.4, 4.6) falls on whoever
  publishes it; Outpost passes nothing on, and keeping a route for your own household is
  not "public" use (4.5 c).
- **A map with the route on it is a produced work** (screen, screenshot, print, PDF).
  Shown to others it needs a notice (4.3): "© OpenStreetMap contributors" with a link to
  openstreetmap.org/copyright, printed out on paper. Hence "Routes: © OpenStreetMap
  contributors", linked, in the map's credits while a found route is drawn.

### Map file formats

What the KML, KMZ and GeoJSON import follows (read 2026-11-21):

- [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946): positions are longitude then latitude
  in WGS 84 (section 4); the old `crs` member is no longer used (appendix B).
- Google's [KMZ page](https://developers.google.com/kml/documentation/kmzarchives): the main
  file is `doc.kml` by default; Google Earth opens the first `.kml` in the archive.

### Reference layers

Read on 2026-11-16 unless a date is given, for the map's reference layers
([reference-layers.md](reference-layers.md), which says how each is used).

| # | Source | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- |
| R1 | Natural Earth: 1:50m countries, 1:10m regions and populated places | **Downloaded on request** from `raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/`. | Public domain ([terms](https://www.naturalearthdata.com/about/terms-of-use/)). No checksums published. |
| R2 | OurAirports | **Downloaded on request**: `airports.csv` and, in the same install, `airport-frequencies.csv` (about 1.3 MB) from `davidmegginson.github.io/ourairports-data/`; only kept airports' frequency rows are stored. | The data repository's Unlicense covers both. ourairports.com's certificate had expired (6 November 2026), so its own terms were not read. |
| R3 | OpenStreetMap by Overpass | **Downloaded on request**, one layer of one country per question, through T3 or a server you declare. **T2 is not used here**: its terms exclude "military applications", and these layers include publicly mapped military sites. | ODbL. |
| R4 | Geofabrik extracts | **Downloaded on request**, one country's `.osm.pbf` with its MD5, or imported. Outpost reads the tags it needs itself; it still makes no tiles. | "License: ODbL 1.0"; "Download responsibly!" (10 September 2025). No numeric limit. |
| R5 | Wikidata Query Service | **Asked on request**: nuclear power stations and research reactors with a position. | CC0; 60 seconds a query; an informative User-Agent with contact information. |
| R6 | WorldPop, population counts 2020, 1 km, UN-adjusted | **Downloaded on request**, by country. | CC BY 4.0 ([licence](https://hub.worldpop.org/data/licence.txt)); its citation is shown. |
| R7 | Swiss emergency meeting points (BABS) | **Downloaded on request**: one GeoJSON file. | opendata.swiss "terms_by" (open use, source given), as the dataset lists it. |
| R8 | FAS Nuclear Notebook, Status of World Nuclear Forces | **Linked.** | "Federation of American Scientists © 2026"; the Bulletin's terms forbid automated extraction. |
| R9 | SIPRI Yearbook, World nuclear forces | **Linked**; save the free summary yourself. | Non-commercial download and single copies allowed; more than 10% of a data set needs permission. |
| R13 | National Security Archive EBB 538; FEMA NAPB-90 (at FAS); The National Archives HO 322 | **Linked.** No open machine-readable transcription exists; Outpost made none. | US works public domain; the Archive's pages its copyright; the UK files not digitised. |
| R14 | UK REPPIR zones, US EPZs, Swiss ENSI plans, cantonal shelters, Taiwan and Korea shelters | **Linked, or imported by you.** | See [reference-layers.md](reference-layers.md). |
| R15 | OpenStreetMap by Overpass, food and supplies (read 2026-11-17) | **Downloaded on request**, as R3: shops, markets, food banks, drinking water, fuel and pharmacies, for the area on screen only, at most 1.5° by 2° (about a county) and 30,000 places. | As R3. Tags from the wiki pages for `shop=*`, `amenity=marketplace`, `amenity=drinking_water`, `amenity=water_point`, `man_made=water_tap`, `amenity=fuel`, `amenity=pharmacy`, `social_facility=food_bank`. |
| R16 | Food Standards Agency, food hygiene rating data (read 2026-11-17) | **Downloaded on request**, retailers only (business types 7840 and 4613), for the area on screen up to about a county, from `api.ratings.food.gov.uk`. Ratings are not kept or shown. | [Terms](https://ratings.food.gov.uk/terms-and-conditions): Open Government Licence; free, no registration, updated daily. Credited "Food businesses: Food Standards Agency, Open Government Licence v3.0". |
| R17 | Give Food, UK food banks (read 2026-11-17) | **Linked only.** | [API page](https://www.givefood.org.uk/api/): contact them before launching; "Keep the information up to date" (it changes several times a day); credit with a link; no licence stated. An offline copy cannot keep up, and the project has not been asked. |
| R18 | Geofabrik extracts by region (read 2026-11-17) | **Downloaded on request**, as R4, for part of a country (a US state, a German Land or Regierungsbezirk, an English county, one of Italy's five parts), chosen from Geofabrik's `index-v1-nogeom.json`, read only when you press **Read the list of regions** and then kept. The list gives no sizes, so **Show the size** asks one `HEAD` (and the dated file's `.md5`). Up to three regions a press, each its own pack, never retried in a loop. A region's file is deleted once read unless you tick to keep it. Germany is fetched by Länder (its whole-country address redirects to another host). Sizes on the day run from Rutland 1.95 MB to England 1.72 GB and the United States 12.3 GB. | [download.geofabrik.de](https://download.geofabrik.de/): ODbL 1.0, "Data processed by Geofabrik GmbH and created by OpenStreetMap Contributors", free of charge. [Download responsibly!](https://blog.geofabrik.de/index.php/2025/09/10/download-responsibly/): bandwidth is limited; don't download "the same file 1000 times". |
| R19 | USDA SNAP Retailer Locator (tried 2026-11-17) | **Not used**: every page, `robots.txt` included, answered 403. The only licence seen is a 2014 data.gov record, not the publisher's. | Could not be read. |

Also: the NTI Index (R10) and IAEA PRIS (R11) are linked, their terms unread (a browser check; 402 and 403); GeoNuclearData, the WRI database and Global Energy Monitor (R12) are not used (terms unread, unmaintained, all rights reserved); no EU-wide open list of food shops was found (R20), so OpenStreetMap is the source there.

### Reference software

Programs, not content; none is in the catalogue.

| # | Source | Relation to Outpost | Licence |
| --- | --- | --- | --- |
| 28–29 | Kiwix, kiwix-tools (kiwix-serve) | Outpost reads ZIM archives through kiwix-serve, run as a separate, sandboxed program ([architecture.md](architecture.md)). | [GPL-3.0](https://github.com/kiwix/kiwix-tools/blob/main/COPYING). |
| 30 | Internet-in-a-Box | Named in the README as a project that showed the way; no code taken. | [GPL-2.0](https://github.com/iiab/iiab/blob/master/LICENSE). |
| 31 | PrepperPi | As 30. Several small projects use the name. | MIT-style (per GitHub's listing). |
| 32 | Paperless-ngx | As 30. | [GPL-3.0](https://github.com/paperless-ngx/paperless-ngx/blob/dev/LICENSE). |
| 33 | Offgrid Pi | As 30. | MIT (per GitHub's listing). |
| 34 | Organic Maps | As 30. | [Apache-2.0](https://github.com/organicmaps/organicmaps/blob/master/LICENSE). |
| 35 | MapLibre GL JS | Draws Outpost's map. | [BSD 3-Clause](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt). |
| 36 | Notion | A point of reference; a commercial online service. | Proprietary. |
| 37 | hfcast-engine (github.com/jonathanmcsweet/hfcast-engine), commit `bf34e8f9f375` | VOACAP in Rust; the HF planner's engine is built from it (shipped). **Its 13 coefficient files are not shipped** (CCIR Reports 322 and 340, NTIA/ITS tables, two short-whip patterns, 559 kB): they are fetched from `raw.githubusercontent.com` at that commit, one request per file, when a person presses Download ([hf-propagation.md](hf-propagation.md)). | Code Apache-2.0. Its `NOTICE`: Apache-2.0 "does not cover these data files, which are the work of other bodies". The CCIR part is the ITU's (R9). |
| 38 | Calibre | Outpost reads the `metadata.opf` Calibre writes beside each book: `dc:creator` (role `aut`), `dc:subject`, `dc:description`, `calibre:series`, `calibre:series_index`, the `uuid` and the cover reference, as in `metadata_to_opf` (read 2026-11-21). No code taken. | [GPL-3.0](https://github.com/kovidgoyal/calibre/blob/master/LICENSE). |

## Wanted, and not yet possible

| What is wanted | Best source known | What stands in the way |
| --- | --- | --- |
| A household first aid manual, UK | St John Ambulance, British Red Cross | Both reserve all rights (W12; [emergency plan templates](#emergency-plan-templates-what-is-quoted-and-on-what-terms-read-2026-11-16)). The NHS's pages are HTML only. **Ask** St John Ambulance. |
| *Where There Is No Doctor*, *Where There Is No Dentist* | Hesperian | Permission needed for any digital copy (N12). **Ask** Hesperian. Nothing open on dentistry was found. |
| Midwifery and newborn care, mental health in primary care, psychological first aid | WHO | Each file says "All rights reserved" although the record gives CC (row 12). **Ask** WHO which governs. |
| The *Wood Handbook*; Bowditch; the *International Code of Signals* | Forest Products Laboratory; NGA | Hosts failing (W27). Try another day. |
| Peace Corps manuals | files.peacecorps.gov | `robots.txt` disallows `/manuals/` (W25). **Ask** the Peace Corps. |
| Household water filters and latrines | CAWST | Files on `cdn.sanity.io`, not yet asked (W24); CC BY-SA 4.0. The owner can allow that host. |
| Beekeeping, seeds in emergencies | FAO | Use "upon request" (row 17). **Ask** FAO. |
| Food storage beyond canning; food in a power cut (UK) | FAO post-harvest manuals; Food Standards Agency | HTML only (row 17, W2). |
| The classics as well-made books | Standard Ebooks | Paid membership for programmatic access (W31). A link shelf is possible, or **ask**. |
| Children's picture books as single files | African Storybook, StoryWeaver, Global Digital Library | W32. Book Dash through Kiwix fills part of it. |
| Open scholarship, literature in translation | Open Book Publishers | Refused (W32). |
| Generator, electrical and fire safety, UK | Electrical Safety First; NFCC | W14. |
| New Zealand's and Canada's household guides | NEMA; Public Safety Canada | W11 refused; W10 not yet asked. |

## Sources that are not integrated: what you can do

- **Import a repeater list you have.** See [radio.md](radio.md). Outpost fetches a list only
  from publishers marked **fetch** above; for the rest the Repeaters screen gives the steps.
- **Add your own files.** Download the file yourself, on terms you are satisfied with, and
  add it under **Library → Add documents**. This is the route for Internet Archive items,
  single Project Gutenberg books, CDC and FEMA guides the catalogue does not list,
  Hesperian's books, the Sphere Handbook, Standard Ebooks, and anything you hold a licence
  for.
- **Contribute a manifest entry.** A publisher's stable file address and a licence that
  allows free download is enough. See [`catalog/README.md`](../catalog/README.md). Or keep
  your own manifest in `<data directory>/catalog/`, listing any Kiwix book by name.
- **Peak sun hours for a power plan.** **Tools → Power and batteries** links to the
  European Commission's [PVGIS](https://re.jrc.ec.europa.eu/pvg_tools/en/) for the twelve
  monthly figures to type in; **Preparedness → Weather and hazards** can fetch them on a
  press ([weather.md](weather.md), [tools-power.md](tools-power.md)).

## Geofabrik extracts, and what Outpost uses instead

Geofabrik's `.osm.pbf` files are raw map data; a map cannot be drawn from them until a
tile-generation program has made tiles, a step Outpost does not include. Instead:

- **Map tiles** come from the [Protomaps](https://protomaps.com) build of the whole planet,
  one PMTiles archive, of which the Maps screen downloads only the part you ask for. Same
  OpenStreetMap data, same Open Database Licence.
- **The world outline** and country boxes come from Natural Earth.
- **Place names** come from GeoNames, and for Great Britain from OS Open Names (27a).

If you make your own tiles from an extract, point Outpost at any PMTiles archive that
follows the Protomaps basemap schema ([maps.md](maps.md)).

## Planning figures for supplies, read on 2026-11-16

Figures **Preparedness → Supplies** works with ([supplies.md](supplies.md)). Nothing is
fetched from any of them.

| Source | What is used | Terms |
| --- | --- | --- |
| Public Health England, *Government Dietary Recommendations* (August 2016), tables 1 and 2 ([PDF](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/618167/government_dietary_recommendations.pdf)) | Energy a day by age band and sex | Crown copyright, OGL v3.0 |
| UNHCR, UNICEF, WFP and WHO, *Food and Nutrition Needs in Emergencies* (2002), annex 1 ([PDF](https://iris.who.int/server/api/core/bitstreams/c6f336b9-0c36-4431-80fd-840c05344817/content), read 2026-11-21 for the ration calculator) | Energy a day by year of age and sex, light activity: the table for a household whose Home is outside the UK | Figures quoted, nothing copied |
| UK government, *Be ready* ([beready.campaign.gov.uk](https://beready.campaign.gov.uk/get-prepared-for-emergencies)) | 3 litres a person a day to drink | A figure quoted |
| WHO, *Technical notes on drinking-water, sanitation and hygiene in emergencies*, note 9 (WEDC, 2013) ([PDF](https://wedc-knowledge.lboro.ac.uk/resources/who_notes/WHO_TNE_ALL.pdf)) | 7.5 to 15 litres a day for drinking, cooking and basic hygiene (table 9.1) | © WHO 2013, all rights reserved: figures quoted, nothing copied |
| FEMA, [ready.gov/water](https://www.ready.gov/water) | One US gallon a day for drinking and sanitation; needs can double in heat. Read again 2026-11-21: "Water that has not been commercially bottled should be replaced every six months", the interval of the stored-water check ([readiness.md](readiness.md)); no interval is given for bottled water | US Government work |
| GOV.UK, [Best before and use-by dates](https://www.gov.uk/understanding-food-labelling/best-before-and-use-by-dates) | Use-by is safety, best before is quality | OGL v3.0 |
| Open Food Facts ([data](https://world.openfoodfacts.org/data)) | Nothing used; what it would allow is in supplies.md | ODbL (database), DbCL (contents), CC BY-SA (images) |
| USDA FoodData Central, SR Legacy (April 2018) ([downloads](https://fdc.nal.usda.gov/download-datasets/), read 2026-11-17) | **Built in**: energy, protein, fat and carbohydrate per 100 g for 7,793 foods, made by `scripts/build-food-energy.mjs` from `FoodData_Central_sr_legacy_food_csv_2018-04.zip` (6.1 MB; sha256 `b8081729…3e6fd0`) | [Home page](https://fdc.nal.usda.gov/): public domain, CC0 1.0; "we request that users list FoodData Central as the source". Citation: "U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. [Internet]. [cited (enter date)]. Available from https://fdc.nal.usda.gov/." USDA asks to be told of products that use it; it has not been told. |

## Device figures for the battery calculators, read on 2026-11-16

The published power figures of common devices (Raspberry Pi boards, phones, radios,
routers, NAS boxes, lamps, a cool box) that **Tools → Power and batteries** offers, each with
its publisher, document, address and date, are in [tools-power.md](tools-power.md) and
`packages/shared/src/power-devices-data.ts`. They were read once from the makers' own pages
and manuals and are bundled as short factual quotations; no document is copied. Also
quoted on the screen: GOV.UK (OPSS and the UK Chief Medical Officers, OGL v3.0), the London
Fire Brigade and Electrical Safety First on charging, extension leads and generators;
Battery University (BU-303, BU-808c) for a lithium-ion cell's voltage and efficiency;
MEAN WELL's SD-25 specification for a 12 V to 5 V converter's efficiency.

## The IEEE's registry of device makers, read on 2026-11-16

**Devices on this network** can name a device's maker from its hardware address, using the
IEEE Registration Authority's MA-L listing at <https://standards-oui.ieee.org/oui/oui.csv>
(from <https://standards.ieee.org/products-programs/regauth/>). The pages state no licence
to redistribute it; the footer reads "© Copyright 2026 IEEE – All rights reserved", and the
site terms could not be fetched. So it is not bundled: Outpost fetches it when a person
presses **Fetch the registry**, states the size first (3,876,189 bytes on the day), and
keeps it in that computer's data directory ([tools-qr-and-network.md](tools-qr-and-network.md)).

## Weather and hazards, read on 2026-11-16

What **Preparedness → Weather and hazards** fetches, on a press only, and what it does not
([weather.md](weather.md)). Two pages that build themselves with JavaScript were read
through a summary and are marked "(summary)".

### Used

| Source | Licence and attribution | Automated use, limits, key | Verdict |
| --- | --- | --- | --- |
| **Open-Meteo** forecast, `api.open-meteo.com/v1/forecast`, `models=ukmo_seamless` | [Licence](https://open-meteo.com/en/licence): CC BY 4.0, with a link next to the data; the Met Office models are CC BY-SA 4.0 ([UKMO page](https://open-meteo.com/en/docs/ukmo-api)). | [Terms](https://open-meteo.com/en/terms): under 10,000 calls a day; non-commercial only ("Personal home automation" is an example). No key. Outpost asks 8 hourly and 7 daily variables, one call. | **Used.** Credit and link under every forecast. A household copy is not redistributed; if it were, CC BY-SA. |
| **Met Office** warnings RSS, `www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK` | "(c) Crown copyright". [RSS terms](https://weather.metoffice.gov.uk/guides/rss): attribute the Met Office website; it keeps all rights. | Each item must link straight to the full article, with nothing in between. No rate limit or key. | **Used**, one feed for the whole UK (no position sent). Links, titles and descriptions unaltered; credit shown. Keeping a copy is an [open question](#open-questions-for-the-owner). |
| **Environment Agency** flood-monitoring API, `environment.data.gov.uk/flood-monitoring`: warnings, and river and sea levels (`/id/stations?parameter=level&lat=…&long=…&dist=…&_view=full`, `/id/measures/{id}/readings?_sorted&_limit=16`, `…?since=…`) (read again 2026-11-17) | [Reference](https://environment.data.gov.uk/flood-monitoring/doc/reference): open data under the OGL with no registration; attribution "this uses Environment Agency flood and river level data from the real-time data API (Beta)". | No numeric limit or key. Levels usually every 15 minutes, sent back once or twice a day (more in floods); readings kept four weeks. Outpost keeps no all-stations copy and polls nothing. "should not be relied upon for safety critical applications". | **Used**, England only, on a press: stations within the distance chosen, the nearest ten's latest readings, a station's last three days. The caveat and attribution are on the screen. "Check for flooding" station pages are linked, not fetched; Floodline, "0345 988 1188 … Open 24 hours a day, 7 days a week", is quoted from one. |
| **NASA POWER** climatology, `power.larc.nasa.gov/api/temporal/climatology/point` | [Referencing](https://power.larc.nasa.gov/docs/referencing/): "The data was obtained from National Aeronautics and Space Administration ( NASA ) Langley Research Center's Prediction Of Worldwide Energy Resources ( POWER ) project funded through the NASA Earth Science Division." It asks to be told if data is passed to other researchers. No licence named. | At most 20 parameters a request; 429 documented with no number. No key. | **Used**, with the acknowledgement. |
| **PVGIS** `re.jrc.ec.europa.eu/api/v5_3/MRcalc` | [Data page](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/general-information/geospatial-data-download_en): free if acknowledged ("PVGIS © European Communities, 2001-2026"). | [API page](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en): 30 calls a second per address; no AJAX (Outpost calls from the server). No key. | **Used**, with the acknowledgement. |
| **GDACS** RSS, `www.gdacs.org/xml/rss.xml` (read 2026-11-21) | Each item: "European Union (CC BY 4.0), reuse is allowed, provided appropriate credit to GDACS is given." [Terms](https://www.gdacs.org/About/termofuse.aspx): alerts do not replace official ones. | Updated every 6 minutes; no key or limit. | **Used**, with credit and disclaimer. |
| **USGS** earthquakes, `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson` (read 2026-11-21) | [Copyrights and Credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) (read in a browser 2026-11-22): "USGS-authored or produced data and information are considered to be in the U.S. Public Domain"; credit asked as "Credit: U.S. Geological Survey". | Updated every minute; no key. | **Used**, credited in those words. |
| **MeteoAlarm**, `feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-<country>` (read 2026-11-21) | "terms equivalent to CC BY 4.0, with additional requirements" ([terms](https://meteoalarm.org/en/live/page/terms-and-conditions), 15/03/2024, section 5): credit "EUMETNET – MeteoAlarm" (or the national service), the time of issue, a link, a set disclaimer; operational redistribution on average under five minutes and never more than ten behind. A single country's warnings must always name "the relevant MeteoAlarm Participant", its national meteorological and hydrological service. | No key or registration; no limit published. | **Used** for Home's country, with all of those, for personal use. The owner decided (2026-11-22): each country's warnings name its national services (below), and a copy fetched more than ten minutes ago is marked "Not current: for reference only" with its fetch time, because a kept copy cannot promise the ten-minute delay. It is still shown, for use offline. |
| **MeteoAlarm Participants**, [members page](https://www.meteoalarm.org/en/live/page/meteoalarm-members) (read 2026-11-22) | The names Outpost credits. The page is drawn by script, so its list was read from a search engine's extract of it (44 participants), and checked against the `senderName` of one warning from each country whose feed had any (fetched once from `feeds.meteoalarm.org/api/v1/warnings/…`, 31 of 39 countries). | Nothing fetched by Outpost: the names are in the code. The country feeds Outpost reads carry no sender, so the page's names are used; a warning that does name its sender is credited with that name. | **Used.** Several countries have more than one participant: the United Kingdom (Met Office, Environment Agency, Natural Resources Wales, Scottish Environment Protection Agency), Norway, Bosnia and Herzegovina; all are named. |
| **US National Weather Service** alerts, `api.weather.gov/alerts/active?point=` (read 2026-11-21) | [Disclaimer](https://www.weather.gov/disclaimer): public domain unless noted. | A User-Agent is required ("can be anything"); the rate limit "is not public information". | **Used** when Home is in the US. |
| **Environment and Climate Change Canada** alerts, MSC GeoMet `api.weather.gc.ca/collections/weather-alerts/items?f=json&lang=en&bbox=…` (read 2026-11-22) | [Data Servers End-use Licence](https://eccc-msc.github.io/open-data/licence/readme_en/) v2.1.1: commercial use allowed, "for any lawful purpose"; credit "Data Source: Environment and Climate Change Canada" and "Contains information licenced under the Data Server End-use Licence of Environment and Climate Change Canada"; watches and warnings reproduced without changing their content or intent; no implied endorsement. | [Usage policy](https://eccc-msc.github.io/open-data/usage-policy/readme_en/): contact MSC at 86,400 requests a day or more; a meaningful User-Agent; no `no-cache` headers. No key. | **Used** when the country is Canada: one request for a box 0.02° round Home; ECCC's English text as written. |
| **MetService** (New Zealand) CAP alerts, `alerts.metservice.com/cap/rss` and each `…/cap/alert?id=` it lists (read 2026-11-22) | The feed: "Copyright Meteorological Service of New Zealand Limited, 2026. Licensed under Creative Commons BY 4.0." [Data Access Policy](https://about.metservice.com/our-data-access-policy) (no date shown): severe weather outlooks, watches and warnings are Open Access; commercial or professional use must not alter the text and must show "This information is made freely available by MetService. Despite this, MetService is not associated with, and does not endorse, [Insert your name/name of business] or have involvement in how this information is presented". The code of practice it points to, `metservice.com/warnings`, could not be read from here. | No key or limit published. The feed was empty on 2026-11-22; the CAP format was read from an archived alert of 15 October 2026. | **Used** when the country is New Zealand, with both statements; at most 40 alerts a press. |
| **Japan Meteorological Agency** XML feed, `www.data.jma.go.jp/developer/xml/feed/extra_l.xml` (read 2026-11-22) | [Terms of Use](https://www.jma.go.jp/jma/en/copyright.html): Public Data License (Version 1.0), "compatible with the Creative Commons Attribution License 4.0"; cite "Source: Japan Meteorological Agency website (URL of relevant page)" and say when content has been edited. Article 23 of the Meteorological Service Act restricts issuing warnings: Outpost only shows JMA's. | [PULL feed page](https://xml.kishou.go.jp/xmlpull.html): delivery may stop or be delayed; JMA takes no responsibility for use; an address downloading 10 GB or more a day is blocked. The long feed is hourly, several days, about 4 MB. | **Used** when the country is Japan: the latest "気象特別警報・警報・注意報" headline from each office, in Japanese, credited and marked as edited. |
| **NOAA SWPC** `services.swpc.noaa.gov`: `products/noaa-scales.json`, `products/summary/10cm-flux.json`, `products/noaa-planetary-k-index.json`, `text/wwv.txt`, `text/daily-solar-indices.txt` (read 2026-11-21) | The NWS disclaimer: public domain; do not claim it, imply endorsement or present it altered as official. Credits requested. | Retry no more than once a minute; "Request only the data that you need." The K-index file changed format about 31 March 2026 (Service Change Notice 26-21). | **Used** under HF propagation. Scale words from [NOAA's scales](https://www.swpc.noaa.gov/noaa-scales-explanation); a-index bands from the [glossary](https://www.swpc.noaa.gov/content/space-weather-glossary). |
| **The Zambretti forecaster** (read 2026-11-21) | The instrument's directions: [Science Museum Group, object 1984-531](https://collection.sciencemuseumgroup.org.uk/objects/co54425). Letters and pressures: Meteormetrics Ltd, tables 1a–1c ([archived copy](http://web.archive.org/web/20160213225210/http://meteormetrics.com/zambretti.htm)), read off a 1915 instrument. | Nothing fetched; the tables are in the code. | **Used** as figures with their source. beteljuice's `betel_cast.js` is not used: "free … as long as NO CHARGE is EVER made" does not fit Outpost's MIT licence. |

### Not used

| Source | Why | What is offered instead |
| --- | --- | --- |
| Met Office Weather DataHub | Needs an account and API key ([FAQ](https://datahub.metoffice.gov.uk/support/faqs)); a 10,000-a-month allowance "limited to 360 calls per day"; its [terms](https://www.metoffice.gov.uk/api/assets/file/met-office-weatherdatahub-terms-and-conditionspdf?prefix=assets) forbid making products available to third parties except via your application. | The same models through Open-Meteo. Could be an optional source with your own key. |
| MET Norway `api.met.no` | NLOD 2.0 and CC BY 4.0. [Terms](https://api.met.no/doc/TermsOfService) (2026-11-05): an identifying User-Agent with contact details, or "403 Forbidden"; caching until `Expires`; coordinates to 4 decimals. | Not built ([open question](#open-questions-for-the-owner)). |
| Environment Agency, Flood Map for Planning (Flood Zones 2 and 3) | [data.gov.uk](https://www.data.gov.uk/dataset/flood-map-for-planning-flood-zones1): OGL; "© Environment Agency copyright and/or database right 2025. All rights reserved."; "not suitable for showing whether an individual property is at risk of flooding". An OGC API Features service, up to 10,000 features a page; larger boxes time out. | **Fetched on a press as a reference layer**, for the area on screen up to 0.2° by 0.3° (about 20 km), at most 5,000 areas ([reference-layers.md](reference-layers.md)). |

Also not used: the EA's Risk of Flooding from Rivers and Sea (a WMS and a national file only); SEPA's time-series API (OGL, no flood-warning feed; linked); Natural Resources Wales (needs an API key; linked); DfI Rivers (licensed commercially); the Met Office Fire Severity Index (maps only, moving to Natural England's [Open Access](https://openaccess.naturalengland.org.uk/) site; linked); EFFIS fire danger (CC BY 4.0, but images built in JavaScript); Met Office climate averages (no licence on the data; linked); WorldClim (no redistribution without permission); ERA5 (account and manual terms); CRU TS (bulk gridded files only); NOAA US climate normals (no licence found). For climate, NASA POWER is used.

## Emergency plan templates: what is quoted, and on what terms (read 2026-11-16)

The templates ([emergency-plans.md](emergency-plans.md)) carry short quotations, each with
publisher, title, address and date. Nothing is bundled or fetched. Only the words of a
publisher whose terms allow copying are shipped; a test holds this.

| Publisher | Terms page | What it allows | Verdict |
| --- | --- | --- | --- |
| GOV.UK (including the Environment Agency's pages) | https://www.gov.uk/help/terms-conditions | OGL. | **Cleared**: OGL v3.0, shown with "Contains public sector information licensed under the Open Government Licence v3.0." |
| Be Ready (Cabinet Office) | https://beready.campaign.gov.uk/about-this-website-and-uk-resilience/ | "All content is available under the Open Government Licence v3.0, except where otherwise stated" | **Cleared**, as GOV.UK. |
| Met Office | https://www.metoffice.gov.uk/policies/tandc | Use, copy and adapt under the OGL, with the attribution statement adjacent. | **Cleared**, statement adjacent. |
| NHS website | https://www.nhs.uk/our-policies/terms-and-conditions/ | OGL; an unchanged copy credited "Information from the NHS website" with the date; an adapted one may not name the NHS. | Exact copies only. **No NHS words shipped**: Be Ready's heat advice, which points to the NHS, is used instead. |
| Ofcom | https://www.ofcom.org.uk/about-ofcom/our-website/copyright | Reproduce accurately, not misleadingly, acknowledged with the title. | Exact copies only: each step a whole unchanged sentence, shown "Ofcom copyright: words from “Stay connected in severe weather”, reproduced unchanged." |
| European Commission | https://commission.europa.eu/legal-notice_en | CC BY 4.0. | **Cleared**: "© European Union, CC BY 4.0 (European Commission, “112 - the EU's emergency phone number”)." |
| Queensland Government | https://www.qld.gov.au/legal/copyright | CC BY 4.0, keep the notice, attribute the State. | **Cleared**: "© State of Queensland, CC BY 4.0 (“Triple Zero (000)”, qld.gov.au)." |
| British Red Cross | https://www.redcross.org.uk/terms-and-conditions | All rights reserved. | **Not cleared**: pointed to, not quoted. |
| Ready.gov and FEMA | https://www.fema.gov/about/website-information | fema.gov refused (403) on the day; read only through a summarising fetcher; Ready.gov has no terms page of its own. | **Not cleared**: pointed to, not quoted. |

### Templates from other governments (read 2026-11-22)

| Publisher | Terms page | What it allows | Verdict |
| --- | --- | --- | --- |
| Queensland Government (Australia), qld.gov.au disaster pages | https://www.qld.gov.au/legal/copyright | As above: CC BY 4.0 (page last reviewed 13 February 2025). | **Cleared**: the two Queensland templates, with the notice above. |
| Denk vooruit (Ministry of Justice and Security, the Netherlands), english.denkvooruit.nl | https://english.denkvooruit.nl/service/copyright | CC0 for the content, but "CC0 does not apply to photographs, videos, infographics or other images". | **Cleared** for the text. The emergency kit list is an infographic "written out as text", so it is **not used**, nor its water figure. |
| Rijksoverheid.nl (Government of the Netherlands) | https://www.rijksoverheid.nl/service/copyright | CC0 1.0; a reuse must make clear the government does not necessarily agree with all of it. | **Cleared**, shown with "The Dutch government has not reviewed or endorsed this plan." |
| BBK (Germany) | https://www.bbk.bund.de/DE/Service/Impressum/impressum_node.html | Texts may not be copied without the BBK's prior consent. | **Not cleared**: no German template. |
| New Zealand Get Ready (NEMA), getready.govt.nz | https://getready.govt.nz/copyright/ | Refused the request (HTTP 403). | **Not read**: follow-up. |
| gov.ie (Ireland) | https://www.gov.ie/en/help/copyright/ | Refused the request (HTTP 403). | **Not read**: follow-up. |
| Canada.ca (Get Prepared) | https://www.canada.ca/en/transparency/terms.html | No answer (timed out twice). | **Not read**: follow-up. |
| NEMA (Australia), nema.gov.au | https://www.nema.gov.au/copyright | No answer (timed out twice). | **Not read**: follow-up. |

Not used: ICRP (permission needed for any reuse); New Zealand Police (non-commercial private use only, so 111 is given as a fact); the IAEA (its website allows reuse with acknowledgement, per the Internet Archive's copy of its terms, but no page for households was found).

The radiation emergency template adds two UKHSA pages on GOV.UK (OGL v3.0) and points to
Ready.gov's "Radiation Emergencies". Local-authority REPPIR leaflets carry no licence
statement and are not used ([nuclear-preparedness.md](nuclear-preparedness.md)).

## The Morse trainer: its method, timing and content (read 2026-11-16)

**Radio → Morse trainer** ([morse-trainer.md](morse-trainer.md)) came from LogBook73 (same
author, MIT). It bundles no document and fetches nothing.

| What | Where it comes from | Notes |
| --- | --- | --- |
| The code (letters, digits, punctuation, prosigns) | ITU-R M.1677-1 (R9) | Written out for Outpost, not copied. |
| Timing: dah 3 dits; gaps of 1, 3 and 7 dits | ITU-R M.1677-1 | As in its part on spacing. |
| Words per minute | The PARIS standard: 50 dits a word, so a dit lasts 1.2 / *w* seconds. See [PA3FWM](https://pa3fwm.nl/technotes/tn31-morse-timing.html). | Read. |
| Farnsworth spacing | J. Bloom, KE3Z, "A Standard for Morse Timing Using the Farnsworth Technique", QEX, April 1990 ([ARRL listing](https://www.arrl.org/cw-mode)) | One spacing dit = (60 / *s* − 37.2 / *c*) / 19 seconds. LogBook73's formula, matching secondary descriptions; the article (a fax scan) was not read. |
| The Koch method | Ludwig Koch (1930s), as used by LCWO | Common knowledge. The 41-character order is LogBook73's, not checked against LCWO (sign-in needed). |
| Callsigns, Q-codes, word drill | Made up; common practice (ITU-R M.1172); common English words | Fixed callsigns start with Q, never issued by the ITU; random drill calls use real prefixes and may match a real station. No list copied. |
| What a Reverse Beacon Network skimmer needs | [RBN](https://www.reversebeacon.net/pages/How+to+get+spotted+by+the+RBN+44), [HamSCI](https://www.hamsci.org/node/188) | "you must send one of the key-words: TEST or CQ"; two to four repetitions of the call; a node ignores you for 10 minutes once spotted, or QSY 300 Hz. |
| The RBN's page, linked from **On the air** | <https://www.reversebeacon.net/main.php> | There is no address for one call's spots, so the link is to the page with its search box. Outpost makes no request to it. |
| Keyer presets | As LogBook73 recorded them | Not checked against makers' manuals; the screen says so. |

## The Solar clock: its formulas and reference values (read 2026-11-17)

**Tools → Solar clock** ([tools-solar-clock.md](tools-solar-clock.md)) bundles and fetches
nothing.

| What | Where it comes from | Notes |
| --- | --- | --- |
| The sun's position, equation of time, refraction, sunrise at 0.833° | NOAA GML, ["Solar Calculation Details"](https://gml.noaa.gov/grad/solcalc/calcdetails.html), after J. Meeus, *Astronomical Algorithms* | The page is "no longer actively supported". Meeus's book was not read; its chapter numbers (25 and 28, 2nd ed.) are as the code gave them. |
| Altitude, azimuth, dip, the sidereal rate 1.00273791 | N. Bowditch, *American Practical Navigator*, NGA Pub. 9 (2019), vol. 1, appendix B ([copy](https://thenauticalalmanac.com/2019_Bowditch-_American_Practical_Navigator/Volume-_1/13-%20Appendices/Appendix%20B-%20Calculations%20and%20Conversions.pdf)) | Pages 707 to 712: dip D = 1.76′ √h; Hc = sin⁻¹[(sin L sin d) + (cos L cos d cos LHA)]; the time azimuth formula. |
| Sidereal time | USNO, ["Computing Approximate Sidereal Time"](https://aa.usno.navy.mil/faq/GAST) | GMST = mod (18.697375 + 24.065709824279 DUT, 24h), "about 0.1 second". |
| Test values | USNO APIs `api/celnav`, `api/siderealtime`, `api/rstt/oneday` (queried 2026-11-17) | Each value copied into its test with its address. Polaris, Dubhe and Kochab for 2026 and 2046 from the same data. |
| Horizontal sundial hour lines | North American Sundial Society, ["Sundial Math"](https://sundials.org/education/sundial-math) | tan(θ) = tan(HA) × sin(lat); the gnomon at the latitude; "Civil = Sundial + EoT + dLon". Also K. Gibbs, [schoolphysics](https://www.schoolphysics.co.uk/age14-16/Astronomy/text/Sundial_/index.html) (a table for the tests), and the British Sundial Society, ["Setting Up A Sundial"](https://sundialsoc.org.uk/all-about-sundials/setting-up-a-sundial/). |
| True north from the shortest shadow | Yohkoh Public Outreach Project, ["Finding Geographic North"](https://solar.physics.montana.edu/ypop/Classroom/Lessons/Sundials/north.html) | Montana State University inferred from the address. |
| The nocturnal | L. Devoy, Royal Museums Greenwich, ["What is a nocturnal?"](https://www.rmg.co.uk/stories/blog/astronomy/what-nocturnal) (2023) | "to within 15 minutes", "around 40-60 degrees north latitude"; it does not name Kochab or cover the south. |
| A southern star clock | None found | The screen says the south is not covered. |

## Frequencies to listen to (read 2026-11-17)

**Radio → Frequencies to listen to** ([radio-frequencies.md](radio-frequencies.md)) ships
facts (frequencies, channels, hours, places), each with the page it was checked against and
the day; the full list of sources is in the data files and on the screen, and the addresses
are plain links. Primary sources are the regulators, time-signal laboratories (NIST, NPL,
PTB, NICT, the BIPM), national emergency and civil protection agencies, the broadcasters
themselves, weather and maritime services (NWS, the MCA, the Met Office, the IMO), the IARU
regions and national amateur societies, and the CFR from govinfo (not the eCFR, whose
`robots.txt` disallows its API). Secondary sources (the RSGB and WorldDAB on Radio 4 long
wave ending on 27 June 2026, Radio World, the SWLing Post on CHU's closure on 22 June 2026,
and a few others) are each used for one fact and said so in the entry. Added on 2026-11-21:
Queensland Government's "Tune into warnings", NEMA's Broadcast Media Memorandum (May 2025)
and "Stay informed" leaflet, Prasar Bharati's list of AIR transmitters (18 September 2025),
Ofcom's Licensing Priorities for Broadcast Radio (14 September 2026), ISED RSS-236 Issue 2,
ComReg 02/71 R16 and 47 CFR 97.303 (eCFR).

Pages were read with a fetch that names itself as an AI agent. Where a site refused it, or
its `robots.txt` or terms forbid AI agents, that was its answer: the page was not read
another way and nothing rests on it.

**Terms that bore on reuse:** GOV.UK (OGL v3.0); Ofcom (reproduce accurately, acknowledged);
Denk vooruit (CC0, images excepted); ISED (non-commercial with attribution); VOA (public
domain); the IARU Region 1 VHF Handbook (non-commercial, source quoted); the WIA band plan
(CC BY-NC-ND 4.0: single frequencies only, credited); US federal works. Radio Romania
International and RTVE allow only personal use, so nothing is taken from them; the SABC
likewise, so its entry says only that Channel Africa's shortwave has closed.

**Not used, by their terms or because they refuse AI agents:** the BBC, ABC, RNZ, CBC, NHK,
NRK, DR, Yle, KBS, Vatican News, RFI, Deutsche Welle, USAGM, radiofrance.fr, the Bureau of
Meteorology's pages, USCG NAVCEN, the FAA's AIP, gov.ie, Cospas-Sarsat, aprs.org, WSJT-X on
SourceForge, Google Docs. What each would have given is a gap in
[radio-frequencies.md](radio-frequencies.md). **Not sources at all:** Wikipedia, hobbyist
lists (EiBi, Aoki), HFCC data, commercial guides, RepeaterBook.

## The allotment's months and facts (read 2026-11-17)

**Games → Allotment** ([games.md](games.md)) uses real sowing and harvest months for twelve
crops and a few facts each. Nothing is fetched or bundled; the pages are plain links behind
**Where this comes from**.

| What | Where it comes from | Notes |
| --- | --- | --- |
| Sowing, planting and harvest months; hardiness, watering, facts | RHS "Grow your own": `https://www.rhs.org.uk/vegetables/<crop>/grow-your-own` for radishes, salad-leaves, onions, peas, carrots, beetroot, kale, broad-beans, potatoes, leeks, garlic, squash | Fetched once each with Outpost's own client. The calendar was read from the page's HTML (rows Sow, Plant, Plant out, Harvest). |
| Crop families and rotation | RHS, ["Crop rotation"](https://www.rhs.org.uk/vegetables/crop-rotation) | The four groups; salads and squash go anywhere; soil pests decline while their family is absent; clubroot, onion white rot. |
| Terms | The RHS footer ("© The Royal Horticultural Society 2026") and [policies page](https://www.rhs.org.uk/about-us/what-we-do/policies) | No reuse terms, so only facts are kept, in Outpost's own words, with the source named. `robots.txt` does not disallow `/vegetables/`. |

The months as read are in `packages/shared/src/games/allotment/numbers.ts`. The game's salad
radishes are harvested April to October, "about four to six weeks" after sowing; the RHS's
winter months are winter radishes.

Made up for the game, and said so on the screen: growth rates, prices, how long water lasts
and how often it rains.

## Chess: the rules and the move generator's check (read 2026-11-21)

**Games → Chess** ([games.md](games.md)). Nothing bundled or fetched.

| What | Source | How it is used |
| --- | --- | --- |
| The rules | [FIDE Laws of Chess](https://handbook.fide.com/chapter/E012023) from 1 January 2023 | Articles 3.7, 3.8, 5.2, 9.2, 9.3 and 9.6. Outpost ends the game at the third repetition and the fiftieth move without a claim, and says so. |
| Perft counts | Chess Programming Wiki, ["Perft Results"](https://www.chessprogramming.org/Perft_Results) (CC BY-SA 3.0) | The six standard positions' leaf counts are the move generator's test; only the counts and FENs are used. |

The computer's piece-square values are Outpost's own plain rules, not a published table.

## Mesh radio (read 2026-11-17)

For the mesh radio link ([mesh-radio.md](mesh-radio.md)). Nothing from these projects is
bundled or fetched.

- **Meshtastic.** Firmware and protobufs are GPL version 3, so no code or `.proto` file is
  used, and the binary client API (TCP port 4403) is not built: its field numbers are
  published only in those files. The [MQTT page](https://meshtastic.org/docs/software/integrations/mqtt/)
  gives the topics (`msh/REGION/2/e/CHANNELNAME/USERID`, `msh/US/2/json/…`), `from` as the
  decimal node ID, "-1" for a broadcast, and sending as JSON (`type` `"sendtext"`) to
  `msh/US/2/json/mqtt/` on a channel named "mqtt" with Downlink on; "JSON is not supported
  on the nRF52 platform." It shows no text example, so a payload is accepted as a string or
  `payload.text`, unconfirmed. The Android docs: "Maximum length: 200 bytes"; LongFast uses
  "a well-known default key, so anyone running Meshtastic on the same preset can read it";
  no per-recipient acknowledgement, so none is claimed. The trademark terms ask
  noncommercial sites to say they are "not affiliated with or endorsed by Meshtastic": the
  screen says "works with" and that sentence, with no logo. The LoRa page's "Check your
  national band plan before transmitting" is linked; Outpost states no country's rules.
  The [LoRa Region by Country](https://meshtastic.org/docs/configuration/region-by-country/)
  table (docs version 2.8, read 2026-11-22) gives the first choice of root topic by Home's
  country (`msh/` and the region); where it lists two regions the first is taken. Facts
  only, in `packages/shared/src/meshtastic-regions.ts`.
- **MeshCore** (MIT, © 2025 Scott Powell). Built from `docs/companion_protocol.md`
  (2026-03-08, firmware v1.12.0+; it says it "may be inaccurate"): command and answer bytes,
  little-endian, UTF-8, 133 characters. USB frames from `ArduinoSerialInterface.cpp`
  (`<` in, `>` out, length LSB then MSB). The network interface's source answered 404, so
  the network port (5000, per the FAQ) is assumed to use the USB frames: untested. Serial at
  115200.

## Satellites, licences and band plans (read 2026-11-21)

**Satellite tracking** ([satellites.md](satellites.md)) was ported from LogBook73 (MIT) and
uses `satellite.js` 6.0.2 (MIT). Its two sources are fetched only on a press:

| Page | What it says | What follows |
| --- | --- | --- |
| celestrak.org/usage-policy.php (updated 16 November 2026) | Data updates "once every 2 hours"; "only download data once per update"; FORMAT=tle can 404 for new objects, CSV recommended; stop on any answer but 200. No data licence or redistribution terms. | Asked as CSV, not again within 2 hours; a failed answer keeps what was there; nothing republished. |
| db.satnogs.org/about | "All data are public and freely distributed under the Creative Commons Atribution-Share Alike v4.0 license." | Credited on the screen and each printed pass. |
| db.satnogs.org transmitters API | Fields `uuid`, `description`, `alive`, `type`, uplink and downlink low and high, `mode`, `invert`, `baud`, `norad_cat_id`, `status`, `updated` | The fields read. |

**What needs a radio licence** ([radio-licences.md](radio-licences.md)) and **Licences and
band plans** rest on the regulators' own documents, each named with its date beside the
statement it supports:

Ofcom (the Licence Conditions Booklet OFW611, its guidance, IR 2030, 2027 and 2027.2, "Rules
on using radio equipment", the Wireless Telegraphy Act 2006 ss. 8 and 48); ComReg (09/45R6,
02/71 R16, S.I. 93/1998 and 436/1998; its web page could not be read); 47 CFR Parts 97, 95
and 15, 47 U.S.C. 605 and 18 U.S.C. 2510–2511 (fcc.gov refused); ISED (RBR-4, RIC-3, RSS-210,
RSS-236, RIC-18); Australia's amateur, CB and LIPD class licences; New Zealand's GURL
notices; Germany's Amateurfunkverordnung and BNetzA Vfg 21/2021 and 91/2025; the two Dutch
Regelingen gebruik van frequentieruimte; Arcep décisions 2012-1241 and 2019-1412. France's
certificate arrêté and current short range devices decision could not be read, so no
French licence-free services are listed. Belgium: the BIPT Council decision of 24 May 2019
(Annex 2), BIPT's English extract of its band table, the BIPT decision of 29 August 2023 on
40.66–40.69 MHz (read in the UBA's copy; BIPT's own address answered not found), and BIPT's
pages on CB and PMR446. Switzerland: the VNF (SR 784.102.1, 1 January 2024), the VVNF
(SR 784.102.11, 1 January 2026, Anhang 4), OFCOM's Merkblatt Amateurfunk (30 September 2026),
RIR0507-35 (PMR446) and RIR1102-02 (CB); Anhang 1 (short range devices) is on a fedlex page
that needs a script and was not read. Spain: Orden IET/1311/2013 (consolidated, amended by
IET/614/2015) and the CNAF, Orden TDF/732/2026 (from 18 July 2026), notes UN-3, UN-100,
UN-108, UN-110, UN-122 and UN-132. Italy: Allegato 26 to the Codice delle comunicazioni
elettroniche (as replaced in 2021) and its articles 134–145 (in force on 28 April 2025), the
PNRF (decree of 31 August 2022), and the decree of 26 January 2026 on classe N. Corrected on
2026-11-21: Canadian CB FM (RSS-236 Issue 2, 4.8), US 60 m channels (47 CFR 97.303(h)),
Irish PMR446 (ComReg 02/71 R16; a revision R17 may exist but ComReg's pages answered only
with redirects).

National societies' band plans (RSGB, ARRL, WIA) were used only to find the regulator's
document. The IARU regional band plans are cited for APRS frequencies, which no regulator
names.

## Heard on the radio (read 2026-11-21)

For [Heard on the radio](heard-on-the-radio.md). Nothing is bundled or fetched; the
decoders are programs you run.

| Source | What follows |
| --- | --- |
| APRS Protocol Reference 1.2 draft c (github.com/wb2osz/aprsspec); 1.0.1 is marked "Obsolete" | The APRS reader: positions, Mic-E, objects, items, weather (DIR/SPD "in knots", "s" in mph). Checked against Dire Wolf 1.8.1. |
| Dire Wolf User Guide 1.8 (October 2025) and "Raspberry Pi SDR IGate" | KISS on port 8001; squelch open; a configuration with null audio output and no PTT, beacon or digipeater, so nothing can be sent. Outpost writes nothing to the port. The SDR example uses 144.390 MHz; no North American band plan naming it could be read. |
| IARU Region 1 VHF Handbook 10.03; WIA band plan 2026-1 | APRS on 144.800 MHz in Europe, 145.175 MHz in Australia. |
| Ofcom, "Rules on using radio equipment"; Wireless Telegraphy Act 2006 s. 48; 18 U.S.C. 2511(2)(g)(ii) | Receivers are licence-exempt for "general reception"; using one to learn a message not meant for you is an offence in the UK; amateur, marine and aeronautical traffic may be received in the US. Whether aircraft and ships count as general reception in the UK is not said, and the screen says Outpost does not know. |
| "SBS BaseStation Article 4.2" (woodair.net); dump1090-fa; readsb | Port 30003, 22 fields, flags -1 and 0. The SBS reader, checked against readsb 3.16. The Mac install line was tried; the Pi line was not. |
| "AIVDM/AIVDO protocol decoding" (E. S. Raymond, gpsd); AIS-catcher; rtl-ais | The AIS reader (types 4, 5, 18, 19, 21, 24; channels 161.975 and 162.025 MHz), checked against pyais 3.3.1; port 10110. The AIS-catcher lines are untried. |
| CA2RXU LoRa_APRS_iGate | A KISS TCP receiver on port 8001 with receive-only settings; untried with a board. OE5BPA's project was archived on 14 September 2025; ESP32APRS_Audio has no network KISS server, so it is not readable. |

## The Steading's household figures (read 2026-11-21)

**Games → Steading** ([games.md](games.md)) uses real figures for what a household uses in a
day, in Outpost's own words with the source named. Nothing fetched or bundled.

| What | Where it comes from |
| --- | --- |
| Food energy, 2,000 and 2,500 kcal a day (women and men, 19 to 64) | Public Health England, Government Dietary Recommendations (2016), as Supplies holds it |
| White bread, 266 kcal per 100 g | USDA FoodData Central SR Legacy, FDC 174924, as Supplies holds it |
| Water, 7.5 to 15 litres a person a day | WHO technical note 9 (2013), table 9.1, as Supplies holds it |
| Electricity 2,500 kWh and gas 9,500 kWh a year, medium use, from 1 July 2026 (replacing 2,700 and 11,500) | Ofgem, ["Review of typical domestic consumption values: decision"](https://www.ofgem.gov.uk/sites/default/files/2026-05/Review%20of%20typical%20domestic%20consumption%20values%20decision.pdf), 27 May 2026, table 1 |
| Air-dry log wood (20% moisture) 4.1 kWh per kg; house coal 7.5 to 8.6 | Forest Research, ["Typical calorific values of fuels"](https://www.forestresearch.gov.uk/tools-and-resources/biomass-energy-resources/reference-biomass/facts-figures/typical-calorific-values-of-fuels/) (© Crown copyright); only the two figures used |

Everything else in the game is made up (an 800 g loaf, a 10 kg bundle of firewood, rates,
costs, a day passing in an hour).

## The Steading's lands and power (read 2026-11-21)

Games → Steading ([games.md](games.md#steading)) gives each kind of land the sun, wind and
cold of a real place, and models solar arrays, a wind turbine, batteries and a diesel
generator with published figures. Nothing is fetched by Outpost and no document is
bundled: the figures are numbers in `packages/shared/src/games/steading/lands.ts` and
`electric.ts`, said in Outpost's own words with the source named.

| What | Where it comes from | How it was read |
| --- | --- | --- |
| Each land's monthly solar output per kWp (E_d), at the optimal fixed slope, crystalline silicon, 14% system loss | European Commission Joint Research Centre, PVGIS API v5.3, `PVcalc` (PVGIS-SARAH3, or PVGIS-ERA5 for Kiruna, with the horizon from the terrain), for Keswick (54.60, −3.13), Davos (46.80, 9.84), Kiruna (67.86, 20.23), Ouarzazate (30.93, −6.91), Belmullet (54.23, −9.99) and Freudenstadt (48.46, 8.41) | Each place asked once on 21 November 2026; the twelve monthly figures kept. |
| Daylight hours, mean temperature and mean wind at 10 m for each month; heating degree days (base 15.5 °C) and growing degree days (base 5 °C) | PVGIS API v5.3, `tmy` (typical meteorological year; ERA5) for the same six places | Each place's hourly year fetched once on 21 November 2026 and summed by a short script; only the derived monthly figures are kept. |
| PVGIS terms | PVGIS data download pages (joint-research-centre.ec.europa.eu): "The data in the sections below are free for public use if the source is acknowledged (PVGIS © European Communities, 2001-2026)" | Read 21 November 2026. The API page states no terms of its own; the download pages' condition is taken to carry over, and the credit line is given in the game and here. |
| The Commission's reuse notice | European Commission legal notice, <https://commission.europa.eu/legal-notice_en>: "© European Union, 1995-2026"; content the EU owns is "licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence", reuse policy under the Commission Decision of 12 December 2011 (CELEX 32011D0833), "unless otherwise indicated (e.g. in individual copyright notices)" | Read 22 November 2026. PVGIS's own notice (above) is such an individual notice, and asks the same thing CC BY does: credit. Outpost gives "PVGIS © European Communities, 2001-2026" in the game and here. |
| Why the Mountains land has almost no wind | PVGIS API v5.3, `tmy` (ERA5), mean wind at 10 m over the typical year, for eight Alpine and Scandinavian mountain cells: Davos 0.91 m/s, St Moritz (46.50, 9.84) 0.86, Andermatt (46.63, 8.59) 0.82, Chamonix (45.92, 6.87) 0.79, Zermatt (46.02, 7.75) 0.86, Bernina (46.41, 10.02, 2,260 m) 0.94, Jungfraujoch (46.55, 7.98, 3,421 m) 0.71; the Jotunheimen fjell in Norway (61.60, 8.30, 1,780 m) 1.53 | Each fetched once on 22 November 2026. Every Alpine cell is as calm as Davos, the 3,421 m ridge included, so Davos is not an odd choice within the source: in every Alpine cell tried, ERA5's 10 m wind is under 1 m/s. Davos is kept, and the guide says that a real exposed site would be windier. |
| A Bergey Excel 10's power curve (W against hub-height wind speed, 0.5 to 20.5 m/s, sea-level density), 8.9 kW rated at 11 m/s, 12.6 kW peak, 38.5 m² swept | ICC-SWCC, Summary Report SWCC-10-12 (2022), <https://smallwindcertification.org/wp-content/uploads/2022/04/SWCC-10-12-Summary-Report-20220406.pdf> | Text of the PDF read 21 November 2026. The curve is applied to each hour of the typical year with the hub at 10 m (where PVGIS gives the wind; a real tower is taller, so the game's figure is low); the standby draw below cut-in is counted as nothing. |
| Excel 10 cut-in 2.5 m/s, no cut-out, furling 14–20 m/s, 7.0 m rotor | Bergey Excel 10 specification sheet, a copy hosted by a reseller (renewableenergyhub.co.uk) | Read 21 November 2026; used only to describe the turbine. |
| Battery cell voltages, usable share and round trip (lead acid 2.0 V, 50%, 80%; LiFePO4 3.2 V, 80%, 92%); each way √η | Tools → Power's figures (Battery University BU-201, BU-216, BU-303; Victron Energy data sheets; HOMER Pro manual), listed in [tools-power.md](tools-power.md#sources) | Reused from `packages/shared/src/power.ts`; not read again. |
| A generator's straight fuel line, from HOMER's worked example (50 kW: 1.655 L/h with no load, 15.3 L/h at full load), scaled to 10 kW | UL Solutions, HOMER Pro manual, as in Tools → Power | Reused; not read again. |
| Household electricity and heat, food, water, firewood | As in [the Steading's household figures](#the-steadings-household-figures-read-2026-11-21) | Unchanged. |

Made up for the game: the array's size (twelve 400 W panels), the cells in each battery,
the 200-litre tank and the 20-litre can, the belts, the water wheel's 120 kWh a day,
how heat and harvests follow the land (two thirds of the heat by heating degree days;
harvest by growing degree days between a quarter and one and a half), the wells' water,
the extra bricks, and every price.

## The server's own figures, read on 21 November 2026

For Server status, the clock, `outpost.local` and `/metrics` ([device.md](device.md)).
Nothing bundled or fetched.

- Raspberry Pi documentation: cores are throttled progressively from 80 °C, cores and GPU
  at 85 °C, so the screen needs attention from 80 °C and calls 85 °C a problem;
  `get_throttled` bits 0 to 3 (under-voltage, frequency capped, throttled, soft temperature
  limit) and 16 to 19 ("has occurred"), read from `/sys`, which a container can read.
- eMMC wear (netmodule-linux.readthedocs.io; the 2016 kernel patch adding `life_time` and
  `pre_eol_info`): wear in tens of per cent, pre-EOL normal, warning (80%) or urgent (90%).
  SD cards have no such attributes, and the screen says their wear is not reported.
- The Prometheus text format 0.0.4, followed by hand for `/metrics`.
- Node's `monitorEventLoopDelay`, used in its timer mode and only while there is work.
- avahi-publish(1) (Debian bookworm): `outpost-name.service` runs
  `avahi-publish -f -a -R NAME.local ADDRESS`.

## The garden calendar (read 2026-11-21)

**Tools → Garden** ([garden.md](garden.md)) uses the RHS month calendar for 22 vegetables,
with sowing, planting and harvest apart. Nothing fetched or bundled; the pages are links at
the foot of the screen.

| What | Where it comes from | Notes |
| --- | --- | --- |
| Sow, Plant or Plant out, Harvest; which crops are tender | RHS "Grow your own" for the twelve allotment crops and courgettes, cucumbers, french-beans, runner-beans, sweetcorn, tomatoes, lettuce, parsnips, cabbages, spinach | Each page fetched once with curl; months read from the calendar in the HTML, frost sentences from the text. Same terms as [the allotment](#the-allotments-months-and-facts-read-2026-11-17): facts only, in Outpost's words. |
| When the last frost usually comes | Met Office, ["Why frost can still occur in late spring"](https://www.metoffice.gov.uk/blog/2026/why-frost-can-still-occur-in-late-spring) (2026) | Average last air frost before the end of April in the south and on coasts, well into May (a few places June) further north and higher. It gives no date for a place, so the screen asks for yours. |

The months as read on 21 November 2026 are in `packages/shared/src/garden.ts`; a server test
holds the twelve allotment crops to the game's.

Tender, in the pages' own words: courgettes, cucumbers, squash, sweetcorn and tomatoes; French
and runner beans go out "once all risk of frost has passed". The screen keeps tender crops back
until the day after your last frost, never earlier; that rule follows the pages' "plant out
after the last frost" and is not the RHS's own calculation.

## Tidal constants

**Tools → Tide times** ([tides.md](tides.md)) ships NOAA's harmonic constants for the United States and TICON-4's for the
rest of the world, and works the tides out from them. Read on 21 November 2026.

| What | Where it comes from | Notes |
| --- | --- | --- |
| Harmonic constituents and datums (MSL, MLLW) for every NOAA station with constituents, outside the Great Lakes | NOAA CO-OPS metadata API, <https://api.tidesandcurrents.noaa.gov/mdapi/prod/> | Fetched by `scripts/build-tide-stations.mjs`: 1,374 listed, 1,370 kept; four (9415265, 9415423, 9415584, 9416131) answered 403 every time. About 409 kB. |
| The licence | NOAA Tides and Currents, [Disclaimers](https://tidesandcurrents.noaa.gov/disclaimers.html) | "in the public domain, unless specifically annotated otherwise"; "NOS requests that attribution be given". The screen names NOAA CO-OPS. Stations outside the US (Bermuda, Central America) are kept on the same footing. |
| The method | P. Schureman, *Manual of Harmonic Analysis and Prediction of Tides*, Special Publication 98 (1958), [NOAA's scan](https://tidesandcurrents.noaa.gov/publications/SpecialPubNo98.pdf) | Tables 1, 2, 2a and 6; paragraphs 24 and 77; the node-factor formulas (73–80, 141–150, 195–235). |
| Predictions the tests are held to | NOAA CO-OPS data API, `product=predictions`, MLLW, GMT | High and low waters, 15 to 21 January 2027, at The Battery, San Francisco, Honolulu and Galveston; hourly heights for January 2027 at the first two. Every high and low within 1 minute and 1 mm (2 minutes at Galveston), every hourly height within 2 mm. |
| TICON-4 constants for 4,838 tide gauges (2,728 kept: lakes dropped, gauges within 2 km of a NOAA station give way) | M. Hart-Davis, D. Dettmering and F. Seitz (2025), *TICON-4: TIdal CONstants based on GESLA-4 sea-level records*, SEANOE, <https://doi.org/10.17882/109129> | CC BY 4.0 (the SEANOE page's licence link, "Open access"); the screen names the dataset, its authors and the licence. Built by `scripts/build-ticon-stations.mjs`; 39 of 50 constituents used. |
| The gauge records TICON comes from | GESLA-3/4 licence page: records under several licences, some for research use only | Not shipped. Whether those terms reach the derived constants is not settled (about 650 gauges). **Owner's decision, 22 Nov 2026:** keep all 2,728 gauges, with TICON-4 credited under CC BY 4.0. |
| Predictions the TICON tests are held to | Kartverket, API for water level data, <https://vannstand.kartverket.no/tideapi_en.html>, CC BY 4.0 | Bergen within 14 minutes and 2.5 cm, Narvik 11 minutes and 3.3 cm, Oslo 15 minutes and 7 cm. |

Not shipped: the **Canadian Hydrographic Service** (its [licence](https://tides.gc.ca/en/licence-agreement)
forbids giving the data to a third party and can be withdrawn; whether the open.canada.ca copy
includes harmonic constants was not settled) and the **UK Hydrographic Office**
([tidal harmonics](https://admiralty.co.uk/UKHO/tidal-harmonics): no terms for the constants,
no open licence found).

## The night sky and celestial navigation

**Tools → Night sky** ([night-sky.md](night-sky.md)) and **Tools → Celestial navigation**
([celestial-navigation.md](celestial-navigation.md)) work out the sky on the device. Read on
21 November 2026 unless a date is given.

| What | Where it comes from | How it is used |
| --- | --- | --- |
| The stars | D. Hoffleit and W. H. Warren Jr, *The Bright Star Catalogue*, 5th revised ed. (Yale; NASA ADC V/50, 1991), <http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz> | The 906 stars of magnitude 4.5 or brighter (position, magnitude, proper motion). |
| The catalogue's licence | [data.gov](https://catalog.data.gov/dataset/bright-star-catalog): publisher HEASARC, licence "https://www.usa.gov/government-works" | Shipped on that footing, authors and ADC credited. **Not settled:** Debian's [copyright file](https://metadata.ftp-master.debian.org/changelogs/non-free/y/yale/stable_copyright) quotes the ADC allowing distribution with acknowledgement, but adds that the files "must NOT be altered in any way (without permission of the original authors)" and files the package as non-free. Outpost ships a subset of the figures, not the files. **Owner's decision, 22 Nov 2026:** keep it, credited. |
| Constellation figures | Outpost's own stick figures of 27 constellations | No source's drawing copied. |
| Navigational stars | USNO, [Celestial Navigation Data](https://aa.usno.navy.mil/data/celnav) | The 57 stars and Polaris, by name and number. |
| Sun, Moon and planets | P. Schlyter, [*How to compute planetary positions*](https://stjarnhimlen.se/comp/ppcomp.html), sections 4, 6, 9, 10, 13, 15 | Positions, parallax, semi-diameter, phase, magnitudes; good to one or two minutes of arc. |
| Precession and nutation | G. H. Kaplan, USNO Circular 179 (2005), [PDF](https://aa.usno.navy.mil/downloads/Circular_179.pdf) | IAU 2006 precession; the first 13 terms of IAU 2000A nutation. |
| Sidereal time | USNO, [GAST](https://aa.usno.navy.mil/faq/GAST) (read 2026-11-17) | With the equation of the equinoxes. |
| TT − UT | USNO, [monthly ΔT](https://maia.usno.navy.mil/ser7/deltat.data) | 69.2 s, the value for 1 October 2026. |
| Moonrise and moonset | USNO, [Rise, Set, and Twilight Definitions](https://aa.usno.navy.mil/faq/RST_defs) | The Moon's centre at 90.5666° plus its radius less its parallax. |
| Finding north and south | US Army FM 21-76 *Survival*, chapter 18 ([copy](https://www.sjsu.edu/people/michelle.hager/docs/fm_21-76_us_army_survival_manual_2006.pdf)) | The Plough's pointers, about five times their distance to Polaris; the Southern Cross's long axis. |
| Sight corrections and reduction | Bowditch, NGA Pub. 9 (2019), vol. 1, appendix B, articles 3 and 5 | Dip 1.76′ √h; computed altitude; time azimuth. Refraction as for Sun times (NOAA). |
| Test values | USNO `/api/celnav` (five moments, 2026 to 2035, four places) and `/api/rstt/oneday` (seven days and places) | Stars and Aries within 0.5′, Sun within 0.5′, Moon and planets within 2′; moonrise and set within 3 minutes, phases within 10; fixes within 0.5 mile. |

## Updating Outpost, read on 21 November 2026

For **Settings → Updates** ([updating.md](updating.md)).

| Page | What it says | What follows |
| --- | --- | --- |
| [minisign](https://jedisct1.github.io/minisign/), signature and public key formats | Public key: base64(`Ed` ‖ key id ‖ Ed25519 key). Signature: base64(algorithm ‖ key id ‖ signature), a trusted comment, base64(global signature) over signature ‖ comment. `ED` signs the BLAKE2b-512 hash; "New implementations must use the hashed signature format". | The server checks signatures with Node's Ed25519 and BLAKE2b-512; releases are signed with `minisign -S`. Checked both ways against minisign 0.11 (Debian bookworm, ISC; installed by `install.sh`, not shipped). |

## Ration calculator

**Tools → Rations** ([tools.md](tools.md)) quotes figures from these, read on 21 November
2026, each named on screen. Nothing fetched or bundled.

| What | Where it comes from |
| --- | --- |
| 2,100 kcal a person a day; protein 10 to 12% and fat 17% of energy (53 g and 40 g); options for reducing a ration | The Sphere Handbook (2018), food security standard 6.1, food assistance standard 6.3, appendix 6, from the chapter [as UNHCR hosts it](https://emergency.unhcr.org/sites/default/files/2024-05/SphereFS%2BN.pdf) (Sphere's own site answered 403). No newer edition. |
| Need by age and sex; +285 kcal pregnant, +500 lactating; +100 kcal for every 5° below 20 °C; reducing a ration with a safety net for the vulnerable (table 12) | UNHCR, UNICEF, WFP and WHO, *Food and Nutrition Needs in Emergencies* (2002), [on WHO's IRIS](https://iris.who.int/server/api/core/bitstreams/c6f336b9-0c36-4431-80fd-840c05344817/content) |
| +191 kcal a day in the last trimester; +330 kcal a day in the first six months of breastfeeding | SACN, *Dietary Reference Values for Energy* (2011), paragraphs S50 and S51 ([PDF](https://assets.publishing.service.gov.uk/media/5a7edb37ed915d74e33f2d8f/SACN_Dietary_Reference_Values_for_Energy.pdf)), OGL |
| Twelve staple foods' energy, protein and fat | USDA FoodData Central SR Legacy, as Supplies holds it; a server test holds each figure to the table |

## Languages of each country, for Explore

| What | Where it comes from | Notes |
| --- | --- | --- |
| Each country's languages, most used first | GeoNames [`countryInfo.txt`](https://download.geonames.org/export/dump/countryInfo.txt), fetched once on 21 November 2026 | The language column only, in `packages/shared/src/country-languages.ts`. CC BY 4.0, per GeoNames' `readme.txt`. |
| Wikipedia in twelve more languages (French, Spanish, German, Portuguese, Arabic, Russian, Chinese, Hindi, Swahili, Italian, Japanese, Indonesian) | The Kiwix feed, one query per language for `wikipedia_<code>_all` (21 November 2026) | Names, editions and sizes in `catalog/manifests/kiwix-languages.json`; the smallest edition of each (introductions only; Swahili's without images). CC BY-SA 4.0. |

## The household book (read 2026-11-21)

- **First aid: the NHS website.** Whole lines of eleven pages (how to resuscitate a
  child, heart attack, symptoms of a stroke, cuts and grazes, burns and scalds,
  anaphylaxis, hypothermia, heat exhaustion and heatstroke, carbon monoxide poisoning,
  poisoning, head injury), copied unchanged on 21 November 2026 and checked word for word
  against the pages as downloaded that day. The NHS website's terms (read the same day,
  as recorded for the emergency plan templates) release its content under the Open
  Government Licence, and ask that content reused unchanged be credited "Information from
  the NHS website" with the date copied; the book prints that credit with each page's
  lines. The NHS website's own first aid pages for adults (CPR, the recovery position,
  choking, severe bleeding) now redirect to St John Ambulance.
- **Not used: St John Ambulance, the British Red Cross, Resuscitation Council UK.** RCUK's
  terms (read 21 November 2026, resus.org.uk/terms-and-conditions): "reproduction of part
  or all of the contents of this web site in any form is prohibited." The British Red
  Cross's are recorded under the emergency plan templates. The book points to their pages.
- **Hygiene: CDC, "Guidelines for Personal Hygiene During an Emergency"** (page dated 5
  August 2024), four sentences quoted unchanged. cdc.gov refused requests from here
  (HTTP 403) on 21 November 2026, so the page was read through a reader that day; US
  federal government work.
- **The wind's direction: NASA POWER, WD10M** ("Wind Direction at 10 Meters", defined by
  POWER as "The average of the wind direction at 10 meters above the surface of the
  earth"), asked for with the climate averages, monthly and for the year. Checked on 21
  November 2026 against the climatology API for a point near Reading (annual 245.8°).
  The same acknowledgement as the other POWER figures.
- **Walking pace:** Tobler's hiking function, as for the walking reach on Maps.
- **Not held, and said so in the book:** major hazard (COMAH) sites and their public
  information zones, and industrial sites other than nuclear ones. No openly licensed copy
  Outpost could fetch was found.

## The household book's printed pages: words, drawings and typeface (read 2026-11-22)

- **Recovery position.** FEMA, *CERT Basic Training Instructor Guide* (August 2019), unit 3,
  "Disaster Medical Operations – Part 1", page 3-12,
  https://www.ready.gov/sites/default/files/2019.CERT_.Basic_.IG_.FINAL_.508c.pdf. FEMA's
  website information page (updated 1 May 2023, https://www.fema.gov/about/website-information)
  says most of its material is free of copyright; licensed photos and graphics are excluded,
  and only FEMA's words are used (the drawing is Outpost's). Quoted unchanged, with the
  caution about the spine. It describes the position, not how to roll someone into it.
- **Clearing cloudy water.** CDC, "How to Make Water Safe in an Emergency" (19 September 2024),
  https://www.cdc.gov/water-emergency/about/index.html. Public domain
  (https://www.cdc.gov/other/agencymaterials.html); the CDC asks to be named and not to be
  shown as endorsing the use, and the book's sources page says both.
- **A layered filter, catching rain.** US Army FM 21-76, *Survival* (1992), chapter 6, and
  figure 6-1. A US federal work with no copyright (17 U.S.C. 105). No official copy could be
  opened (globalsecurity.org refused, archive.org did not load); it was read from a reprint,
  https://www.sjsu.edu/people/michelle.hager/docs/fm_21-76_us_army_survival_manual_2006.pdf,
  pages 61–62. Open: check the quoted sentences against an official copy. FM 21-76 is
  superseded (FM 3-05.70, then ATP 3-50.21). It names the filter's materials but no order;
  the drawing's caption says so.
- **Chest compressions for a child and a baby.** The NHS website lines the book already
  quotes ("How to resuscitate a child", read 21 November 2026); the drawing shows only them.
- **Not used:** NHS recovery position pages (now redirect to St John Ambulance); HSE INDG347
  (OGL, but says only "place in the recovery position"); MedlinePlus (A.D.A.M. content,
  copyrighted); US Army TC 4-02.1 (one sentence, read from a third-party copy).
- **Typeface.** Atkinson Hyperlegible Next (Braille Institute of America), SIL Open Font
  License 1.1, static TTFs from https://github.com/googlefonts/atkinson-hyperlegible-next at
  commit 7925f50f649b3813257faf2f4c0b381011f434f1, with `OFL.txt` beside them in
  `apps/web/src/features/print-kit/fonts/`.
- **Fallback typefaces.** Noto Sans, Noto Sans Arabic, Hebrew, Devanagari, Thai, SC and KR
  (The Noto Project Authors), SIL Open Font License 1.1, from the variable files in
  https://github.com/google/fonts (`ofl/notosans*`, read 2026-11-22), instanced and subset
  with fontTools 4.68 for print; `OFL.txt` in `apps/web/src/features/print-kit/fonts/noto/`.

## Printed power plan: where the fuses go (read 2026-11-22)

- **33 CFR 183.455, Overcurrent protection: General** (United States Coast Guard rules for
  the electrical systems of boats), read 22 November 2026 from
  https://www.law.cornell.edu/cfr/text/33/183.455 (ecfr.gov sent the request to a check
  page). Quoted on the printed power plan beside its wiring drawing: (a) "Each ungrounded
  current-carrying conductor must be protected by a manually reset, tripfree circuit
  breaker or fuse"; (b) one "must be placed at the source of power for each circuit or
  conductor", or "within seven inches of the source of power" where that is physically
  impractical, measured along the conductor; (c)(1) under 50 volts, a rating no more than
  "150% of the value of the amperage in Table 5 for the conductor size it is protecting".
  The drawing puts a fuse at the battery end of each cable on that rule. It is the companion
  of 33 CFR 183.425 (Table 5), which Tools, Power and batteries already uses for cable
  current, and is given as guidance in the same way. A US federal regulation, public domain.

## The radio papers' drawings (read 2026-11-22)

- **The ionosphere, ground wave, sky wave, the skip zone and coming back straight down.**
  Australian Government, Bureau of Meteorology, Space Weather Services, *Introduction to HF
  radio propagation* (2016),
  https://sws.bom.gov.au/Category/Educational/Other%20Topics/Radio%20Communication/Intro_HF_Radio.pdf.
  Used: section 1.1 (the regions' heights, D 50 to 90 km, E 90 to 140 km, F1 140 to 210 km,
  F2 over 210 km; D, E and F1 all but gone at night; D absorbs, E, F1 and F2 refract; F2
  present day and night), 2.1 (ground wave up to 100 km over land and 300 km over sea;
  direct wave; sky wave), 2.2 (the usable range between D-region absorption and the highest
  frequency returned, moving with the hour, season and solar cycle; absorption greater at
  lower frequencies), 2.6 and figure 2.8 (at a fixed frequency steeper rays land nearer, the
  steepest that returns bounds the skip zone, steeper still penetrates; no skip zone when the
  frequency is returned at vertical incidence; use a lower frequency to reach into a skip
  zone) and 2.7. © Commonwealth of Australia 2016: facts and figures only are used, and the
  drawings are Outpost's own. Drawn in `features/propagation/print/radio-diagrams.ts` for the
  HF prediction and communication plan PDFs.
- **The radio dial's bands** on the frequencies PDF. ITU Radio Regulations No. 2.1, as given in
  Recommendation ITU-R V.431-9 (10/2025), https://www.itu.int/dms_pubrec/itu-r/rec/v/R-REC-V.431-9-202510-I!!PDF-E.pdf,
  and mirrored in 47 CFR 2.101 (https://www.law.cornell.edu/cfr/text/47/2.101): band N runs
  from 0.3 × 10^N to 3 × 10^N Hz, so LF 30 to 300 kHz, MF 300 kHz to 3 MHz, HF 3 to 30 MHz,
  VHF 30 to 300 MHz, UHF 300 MHz to 3 GHz.
- **Day and night on the world** at a paper's hour: Outpost's own grey-line arithmetic
  (`maps/grey-line/geometry.ts`, after Meeus; see the Solar clock's sources), over the bundled
  Natural Earth 1:110m land outline (public domain).
- **Charts** on printed pages are drawn with d3-scale 4.0.2 and d3-shape 3.2.0 (ISC licence,
  https://github.com/d3/d3-scale, https://github.com/d3/d3-shape), already in the app's
  dependency tree through Mermaid; no data comes from them.
