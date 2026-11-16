# Sources for the catalogue

This page lists the information sources that have been considered for Outpost's
catalogue, says what Outpost does with each one, and gives the reason wherever a source
is not used. It was last checked on 2026-11-16.

The catalogue itself lives in [`catalog/manifests/`](../catalog/manifests):

| Manifest | What it holds | Entries |
| --- | --- | --- |
| `kiwix-essentials.json` | A starter selection of archives from the Kiwix library | 61 |
| `kiwix-more.json` | Further Kiwix archives: programming documentation, more Project Gutenberg shelves, medical and science references, courses, talks, preparedness, and more question-and-answer sites | 89 |
| `official-publications.json` | Individual PDF handbooks, guides, leaflets and textbooks, each fetched from its publisher's own website | 93 |
| `radio.json` | Radio rules, frequency tables, field guides, broadcast guides and band plans as PDFs from their publishers (38), and five more Kiwix archives | 43 |
| `outpost-reference.json` | Reference sheets written for Outpost and shipped with it; see [radio.md](radio.md) | 9 |
| `logbook73.json` | The Radio Engineering Handbook and fifteen radio companion guides, written by this project's author for LogBook73 (MIT) and shipped as books; generated, see [radio.md](radio.md#the-handbook-and-the-radio-guides) | 16 |

A manifest only describes content and says where it comes from, and nothing is fetched
until a person asks for it. Two kinds of content ship with Outpost, in
[`catalog/bundled/`](../catalog/bundled), and are added to the library by copying, with
no network: its own reference sheets, which are original compilations written for
Outpost; and the radio handbook and guides its author wrote for LogBook73, which are
generated from that project under its MIT licence and are not checked by Outpost against
the manufacturers' manuals ([radio.md](radio.md#the-handbook-and-the-radio-guides)). The
format and the rules for entries are in [`catalog/README.md`](../catalog/README.md).

## Status of each source

"Via Kiwix" means the source is packaged as a ZIM archive by the Kiwix project and
Outpost fetches that archive from Kiwix. "Direct" means an entry points at a file on
the publisher's own website. Links in the last column go to the page that was read on
2026-11-15; where a page could not be read, that is said. Sources first looked at on 2026-11-16 are in
[their own section](#added-on-2026-11-16), numbered N1 onwards; rows here that changed that day say so.

### General

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 1 | Kiwix Library (library.kiwix.org) | A library of websites packaged as ZIM archives for offline reading | **Built in, and 155 catalogue entries** (61 in `kiwix-essentials`, 89 in `kiwix-more`, 5 in `radio`). Each entry names a book; Outpost looks the book up in the library's feed at download time and takes the address, size and checksum from there. | No single licence: every book keeps its publisher's licence. Entries state the licence where it is known and say "See source" where it has not been checked. Kiwix's English terms-of-use page returned "not found" on the day, so no terms page is linked. |
| 2 | Kiwix direct downloads (download.kiwix.org/zim/) | The file servers behind the library | **Built in.** Files are fetched from these servers and their mirrors, but manifests never contain the address of a `.zim` file: Kiwix rebuilds most books every month or two and removes old builds. | As for source 1. |
| 3 | Project Gutenberg (gutenberg.org) | Public-domain books | **Via Kiwix: 9 entries.** Seven shelves and the complete English library in `kiwix-more` (medicine, agriculture, technology, science, geography and recreation, naval science, military science, everything), one shelf in `kiwix-essentials`. **No direct entries, by decision.** On 2026-11-15 www.gutenberg.org answered every request with "403 Forbidden". On 2026-11-16 it answered, and its [robot access policy](https://www.gutenberg.org/policy/robot_access.html) was read: the website "is intended for human users only", automated tools are blocked, and the exceptions are for people who mirror or harvest the collection. It also says the generated formats (EPUB among them) "are re-built monthly". An entry that had Outpost fetch a book from the website would go against the first statement, and its pinned checksum would stop matching every month, so none is listed and nothing further was fetched. A single book is best downloaded in a browser and added under Library. | Entries are marked "Public domain in the United States", as Project Gutenberg describes its books. `robots.txt` (read 2026-11-16) disallows only the search pages; the policy page is what rules out automated downloads. |
| 4 | OpenStax (openstax.org) | Peer-reviewed college textbooks from Rice University | **Direct: 15 entries** in `official-publications` (Anatomy and Physiology 2e, Microbiology, Clinical Nursing Skills, Biology 2e, Chemistry 2e, College Physics 2e, Astronomy 2e, Precalculus 2e, Introductory Statistics 2e; and, added on 2026-11-16, University Physics Volume 2, Calculus Volume 1, Prealgebra 2e, Pharmacology for Nurses, Additive Manufacturing Essentials and the high-school Physics). The PDF addresses come from OpenStax's own catalogue. The Kiwix library has no OpenStax archive. | CC BY-NC-SA 4.0. This is stated inside each PDF and in the licence fields of [OpenStax's catalogue](https://openstax.org/apps/cms/api/v2/pages/207/). Note that this is a non-commercial licence, not CC BY. The one exception listed is the high-school *Physics*, which its own copyright page and the catalogue give as CC BY 4.0. For the five other books added on 2026-11-16 the licence was taken from the catalogue; each file was seen to say its content is under a Creative Commons licence, and was deleted before the full line was copied down. |
| 5 | Internet Archive (archive.org) | A very large archive of books, recordings, software and web pages | **Add your own files.** Not in the catalogue: rights differ from item to item, so no general entry would be honest. | The [terms of use](https://archive.org/about/terms) page is drawn by a script and could not be read by the catalogue check. Read the rights statement on each item. |
| 6 | NASA (nasa.gov) | The US space agency | **Direct: 2 entries** from the NASA Technical Reports Server (NASA Systems Engineering Handbook; Fastener Design Manual). **Via Kiwix: 2 entries** in `kiwix-more` (Astronomy Picture of the Day; TED talks about NASA). | Each [Technical Reports Server record](https://ntrs.nasa.gov/api/citations/20170001761) gives the document's copyright status; both documents are marked as public use permitted. Astronomy Picture of the Day [says](https://apod.nasa.gov/apod/lib/about_apod.html) that NASA images are in the public domain but that some pictures are copyrighted by the people credited. |

### Survival and preparedness

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 7 | Ready.gov | The US government's public preparedness campaign, run by FEMA | **Direct: 4 entries** (Are You Ready?; the full set of hazard information sheets; Emergency Supply List; Disaster Preparedness Guide for Older Adults). **Via Kiwix: 1 entry** in `kiwix-essentials` (the whole site). | The [publications page](https://www.ready.gov/publications) says the files may be downloaded at no cost and reproduced, provided nothing is altered and no endorsement is implied. |
| 8 | FEMA (fema.gov) | The US Federal Emergency Management Agency | **Not integrated directly.** www.fema.gov answered the catalogue check with "Access Denied" (HTTP 403), so nothing hosted there was fetched. It refused again on 2026-11-16 (HTTP 403 for `robots.txt`); www.usfa.fema.gov answered but was not looked through. Ready.gov's page for Community Emergency Response Teams redirects to fema.gov, so the CERT Basic Training manual could not be looked for. FEMA publications hosted on Ready.gov are covered by source 7. | Could not be read. |
| 9 | Survivor Library (survivorlibrary.com) | A private collection of scanned older books on pre-industrial skills | **Not in the catalogue.** It is a third party's collection of other people's works, and the site's home page states no licence for the scans. Kiwix does publish the site as an archive (`survivorlibrary.com_en_all`, about 220 GB); it has been left out until someone has checked the rights. | No licence statement found on the [home page](https://www.survivorlibrary.com/). |
| 10 | TruePrepper survival PDF collection | A preparedness website's page of downloadable manuals | **Not in the catalogue.** The page re-hosts manuals written by other publishers. The site says it will not infringe copyrights but gives no licence for the individual files, and the site itself is marked "All rights reserved". Where a manual has an official publisher (FEMA, the US Army, the FAA), the catalogue points at that publisher instead. Kiwix publishes the site's own articles as `trueprepper.com_en_all` (about 1.4 GB); it has been left out for the same reason. | [The page](https://trueprepper.com/survival-pdfs-downloads/): "All rights reserved". |

### Medicine and food

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 11 | CDC (cdc.gov) | The US Centers for Disease Control and Prevention | **Via Kiwix: 1 entry** in `kiwix-essentials` (Travelers' Health). **No direct entries**: www.cdc.gov answered the catalogue check with HTTP 403, so no file there was fetched. Both www.cdc.gov and its document repository stacks.cdc.gov refused again on 2026-11-16 (HTTP 403 for `robots.txt`). | Could not be read. |
| 12 | WHO publications (who.int) | The World Health Organization's guidelines and manuals, held in its IRIS repository | **Direct: 6 entries** (Basic Emergency Care; Pocket Book of Primary Health Care for Children and Adolescents; Managing Complications in Pregnancy and Childbirth; Model List of Essential Medicines; Guidelines for Drinking-water Quality; Preventing Drowning). The repository answers a `HEAD` request with HTTP 500 although an ordinary download works, so the online check asks it for the first byte of each file instead. | CC BY-NC-SA 3.0 IGO for WHO's own publications, per its [copyright page](https://www.who.int/about/policies/publishing/copyright). Older documents need care: the 2013 *Pocket book of hospital care for children* is marked CC in the repository record but "All rights reserved" inside the file, so it was dropped. |
| 13 | National Center for Home Food Preservation (nchfp.uga.edu) | A US centre for research-based home food preservation, hosted by the University of Georgia | **Direct: 8 entries**: the eight files that make up the *USDA Complete Guide to Home Canning* (2015 revision). **Via Kiwix: 1 entry** in `kiwix-essentials` (the same guide as an archive). | The guide is a US Department of Agriculture bulletin, offered by the centre as ["the electronic version of the USDA canning guide"](https://nchfp.uga.edu/resources/entry/about-the-usda-guide-to-home-canning-2015-revision). No reuse licence is stated in the files or on the page, and the website is marked "All rights reserved", so the entries say "See source". |

### Repair, engineering and computing

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 14 | iFixit | Community repair guides | **Via Kiwix: 1 entry** in `kiwix-essentials`. | CC BY-NC-SA 3.0, per iFixit's [licensing page](https://www.ifixit.com/Info/Licensing). |
| 15 | Arduino documentation (docs.arduino.cc) | Official documentation for Arduino boards and software | **Not integrated.** No official offline bundle was found on the site. The text is kept in a Git repository, which is not a file Outpost can download and open. The Arduino questions and answers from Stack Exchange are in `kiwix-essentials`. | The content repository is licensed [CC BY-SA 4.0](https://github.com/arduino/docs-content/blob/main/LICENSE.md). |
| 16 | DevDocs (devdocs.io) | Programming documentation gathered into one compact format | **Via Kiwix: 18 entries** in `kiwix-more` (Python, JavaScript, HTML, CSS, Web APIs, HTTP, Bash, Git, Linux man pages, C, C++, Go, Rust, Node.js, TypeScript, Docker, PostgreSQL, SQLite). Kiwix publishes about 225 more; add any of them with a manifest of your own. | The DevDocs application is under the [Mozilla Public License 2.0](https://github.com/freeCodeCamp/devdocs/blob/main/LICENSE); each documentation set keeps its own project's licence, so the entries say "See source". |

### Agriculture, aviation, radio, weather and mountaineering

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 17 | FAO publications (fao.org) | Manuals and reports of the UN Food and Agriculture Organization | **Direct: 4 entries** (A Vegetable Garden for All; Small-scale Aquaponic Food Production; Farmer's Compost Handbook; Manual on Small Earth Dams). | © FAO. Each document prints its own terms; these four allow copying and downloading for private study, teaching and non-commercial use with acknowledgement, in line with FAO's [terms](https://www.fao.org/contact-us/terms/en/). *Rural structures in the tropics* (2011) was dropped because it asks for permission on request. |
| 18 | FAA aviation handbooks | The US Federal Aviation Administration's training handbooks | **Direct: 6 entries** (Pilot's Handbook of Aeronautical Knowledge; Airplane Flying Handbook; Aviation Weather Handbook; Instrument Flying Handbook; Helicopter Flying Handbook; Aviation Maintenance Technician Handbook: General). | Works of the US Government. The [handbooks page](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation) offers them for download; the FAA's [web policies](https://www.faa.gov/web_policies) carry no separate reuse statement. Images credited to outside contributors may remain in copyright. |
| 19 | ARRL (arrl.org) | The US national association for amateur radio | **Not integrated.** ARRL's [copyright page](https://www.arrl.org/copyright) reserves all rights and forbids storing its publications in a retrieval system. Radio material in the catalogue comes from elsewhere: see [Radio](#radio) below. One ARRL newsletter page was read, and nothing kept, to trace where the "Wilderness Protocol" comes from; the reference sheet names it as the source. | All rights reserved. |
| 20 | NOAA (noaa.gov) | The US National Oceanic and Atmospheric Administration, which includes the National Weather Service | **Direct: 9 entries.** Seven from the National Weather Service (Weather Spotter's Field Guide; Thunderstorms, Tornadoes, Lightning; Winter Storms; Cloud Chart; Observing Handbook No. 1; Worldwide Marine Radiofacsimile Broadcast Schedules; and, in `radio`, the NOAA Weather Radio brochure). Two added on 2026-11-16: *U.S. Chart No. 1* from the Office of Coast Survey (nauticalcharts.noaa.gov), and, in `radio`, the *NOAA Space Weather Scales* from the Space Weather Prediction Center (www.spaceweather.gov). The Weather Service's two-page *Lightning Safety for Backpackers and Campers* was downloaded and **left out**: it names no author, points to an outdoor school's lightning guidance, and may not be the Weather Service's own work. | Public domain unless noted otherwise, per the [NWS disclaimer](https://www.weather.gov/disclaimer), which asks that the material is not claimed as your own or altered and then presented as official; it was read again on 2026-11-16, and the Space Weather Prediction Center's pages point to it. For Chart No. 1 no reuse statement was read: www.noaa.gov/disclaimer answered HTTP 403. The chart's page says it is produced by NOAA and the National Geospatial-Intelligence Agency, and the entry says what was and was not read. |
| 21 | UIAA (theuiaa.org) | The International Climbing and Mountaineering Federation | **Direct: 2 entries** from its Medical Commission (Emergency Field Management of Altitude Sickness; Water Disinfection in the Mountains). | The [medical advice page](https://www.theuiaa.org/mountain-medicine/medical-advice/) offers the papers for free download. No reuse licence is stated there or in the papers, and the site's terms page had no readable text, so the entries say "See source". |

### Radio

Added on 2026-11-15 with the radio reference sheets. These rows are numbered R1 onwards
because they were not in the original list of sources. "Read for the sheets" means the
page or document was fetched once and its facts used in a reference sheet, with nothing
from it stored in the catalogue.

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| R1 | Ofcom (ofcom.org.uk) | The UK communications regulator | **Direct: 15 entries** in `radio` (Amateur Radio Licence Conditions Booklet; Amateur Radio Guidance for Licensees; Notice of Coordination Procedures; Phase 2 and 3 Change Guide; UK Frequency Allocation Table; Frequencies for Distress and Safety annex; Interface Requirements 2030, 2028, 2027 and 2027.2; PMR446 Information Sheet; Ship Radio Licences guidance notes; Ship Radio licence terms; and, added on 2026-11-16, Guidance on EMF Compliance and Enforcement and the EMF guide for amateur radio users). **Read for the sheets**: the same documents, and the page on receivers and scanners. | **Not the Open Government Licence.** Ofcom's [copyright page](https://www.ofcom.org.uk/about-ofcom/our-website/copyright) says its material "may be reproduced free of charge in any format or medium, provided that it is reproduced accurately and not used in a misleading context", acknowledged as Ofcom copyright with the document's title. The entries say so. The page was read again on 2026-11-16. |
| R2 | US Government Publishing Office (govinfo.gov) | The official publisher of the Code of Federal Regulations | **Direct: 2 entries** in `radio` (47 CFR Part 97, amateur radio; Part 95, personal radio services; both the 1 October 2025 edition, the latest printed). **Read for the sheets**: the current electronic Title 47 from govinfo's bulk data, a 2013 Federal Register notice, and 47 U.S.C. 605. | Works of the US Government. |
| R3 | eCFR (ecfr.gov) | The daily-updated electronic Code of Federal Regulations | **Not contacted for content.** Its `robots.txt` disallows the interfaces that serve whole parts, so the same text was taken from govinfo.gov's bulk data instead. | Works of the US Government. |
| R4 | FCC (fcc.gov) | The US communications regulator | **Not integrated directly.** www.fcc.gov answered the catalogue check with HTTP 403 and was left alone. Its rules are covered by source R2. | Could not be read. |
| R5 | NTIA (ntia.gov) | The US agency that manages federal spectrum use | **Direct: 1 entry** in `radio` (United States Frequency Allocation Chart, September 2025). The "Redbook" manual is now published as a web application at redbook.ntia.gov, with no single file to list, so it is **not integrated**. | Works of the US Government; the [chart page](https://www.ntia.gov/page/united-states-frequency-allocation-chart) carries no separate reuse statement. |
| R6 | NIST (nist.gov) | The US national standards laboratory, which runs WWV, WWVH and WWVB | **Direct: 2 entries** in `radio` (Special Publication 432, NIST Time and Frequency Services, 2012; Special Publication 250-67, NIST Time and Frequency Radio Stations, 2005). **Read for the sheets**: the three station pages. **Not listed:** Special Publications 330 (The International System of Units) and 811 (Guide for the Use of the SI). Both were downloaded and checked on 2026-11-16, but nvlpubs.nist.gov answers a `HEAD` request with "404 Not Found" while serving the file to an ordinary request, and the online check reads that as a file that has gone; see [what the check cannot express](#what-the-online-check-cannot-express). | Works of the US Government. |
| R7 | Maritime and Coastguard Agency (gov.uk) | The UK agency responsible for maritime safety information | **Direct: 3 entries.** In `radio`: Maritime Safety Information Leaflet, Advice Note 1033, January 2026; and, added on 2026-11-16, GMDSS: The Benefits of Digital Selective Calling. In `official-publications`: Life Saving Signals (added 2026-11-16). **Read for the sheets**: the leaflet, the GOV.UK page on 406 MHz beacons, and (2026-11-16) MGN 324 (M+F) Amendment 2 on the use of VHF. | [GOV.UK](https://www.gov.uk/government/publications/advice-note-1033-maritime-safety-information-msi-leaflet) says its content is under the Open Government Licence v3.0 "except where otherwise stated"; the leaflet's maps and one diagram are marked "All rights reserved", and the entry says so. |
| R8 | IARU (iaru.org, iaru-r1.org, iaru-r2.org) | The International Amateur Radio Union and its regional organisations | **Direct: 7 entries** in `radio` (Ethics and Operating Procedures for the Radio Amateur, 4th edition; Region 1 HF and VHF band plans; Region 2 band plan; Region 3 band plan; Emergency Telecommunications Guide; Amateur and Amateur-satellite Service Spectrum). **Read for the sheets**: the same documents and the emergency frequencies page. | The operating guide states CC BY-SA 4.0 inside the file. The band plans, the emergency guide and the spectrum summary state no licence, and the website says its materials "may be subject to copyright", so those six entries say "See source". |
| R9 | ITU (itu.int) | The UN agency for telecommunications | **Not in the catalogue.** Recommendations M.1677-1 (Morse code) and M.1172 (Q code) were **read for the sheets**; both are marked "All rights reserved. No part of this publication may be reproduced ... without written permission of ITU". The Radio Regulations themselves were not read. | All rights reserved. |
| R10 | CEPT Electronic Communications Committee (docdb.cept.org) | The European body that harmonises spectrum use | **Direct: 3 entries** in `radio` (Recommendation T/R 61-01, the CEPT Radio Amateur Licence; T/R 61-02, the harmonised examination certificate and syllabus; ECC Decision (15)05 on PMR446, which was also **read for the sheets**). The database's older addresses redirect over plain http, so the entries use its https download addresses. | No licence is stated in the documents and the database's terms were not found, so the entries say "See source". |
| R11 | US Coast Guard Navigation Center (navcen.uscg.gov) | The Coast Guard's pages on marine radio | **Not integrated.** The site answered the catalogue check with HTTP 403 twice (including for `robots.txt`) and was left alone. The marine distress frequencies in the sheets come from Ofcom and from 47 CFR Part 80 instead. | Could not be read. |
| R12 | National Research Council Canada (nrc.canada.ca) | The operator of the time station CHU | **Not integrated.** The site answered HTTP 403 and was left alone; the sheet marks CHU "not verified". It answered HTTP 403 again on 2026-11-16 for the station's page, although its `robots.txt` now answers and admits ordinary clients. | Could not be read. |
| R13 | National Physical Laboratory (npl.co.uk) and PTB (ptb.de) | The operators of the time stations MSF and DCF77 | **Read for the sheets** only: one page each. Nothing to download. | Not checked. |
| R14 | BBC (bbc.co.uk) | The broadcaster of the Shipping Forecast | **Not read.** The BBC's website does not admit automated clients. The Shipping Forecast times in the sheet come from the MCA leaflet, and the reported closure of Radio 4 long wave is marked "not verified". | Not applicable. |
| R15 | RSGB (rsgb.org) | The UK national society for amateur radio | **Not integrated.** No explicit licence was found for its publications or band plans, so none is listed and the UK band plans are not reproduced in the sheets. One news page was read, as a secondary source that the sheet names as such, for the reported date of the Radio 4 long wave closure. Its repeater list is source P1 below. | No licence found. |
| R16 | US Army publications (armypubs.army.mil) | Field manuals and training circulars on radio and antennas | **Not integrated.** The site's `robots.txt` disallows all automated access, so no manual was looked for, whatever its distribution statement. Copies on other websites are re-uploads and are not used. | Could not be read. |
| R17 | Preparedness websites (radiofreeq.wordpress.com, amrron.com) | A hobbyist blog and a private network's website | **Read for the sheets** only: one page each, to say where the "3-3-3" and "channel 3" conventions come from. Nothing from them is in the catalogue. | Not checked. |
| R19 | CISA (cisa.gov) | The US agency responsible for emergency communications | **Direct: 2 entries** in `radio` (National Interoperability Field Operations Guide, version 2.02; Auxiliary Communications Field Operations Guide, version 1.1). | Works of the US Government; the [page that offers them](https://www.cisa.gov/resources-tools/resources/field-operations-guides) carries no separate reuse statement. |
| R20 | Innovation, Science and Economic Development Canada (ised-isde.canada.ca) | The Canadian spectrum regulator | **Direct: 1 entry** in `radio` (RBR-4, Standards for the Operation of Radio Stations in the Amateur Radio Service). The site asks for a crawl delay of five to ten seconds. Its other amateur radio circulars were not looked for once a guessed address was not found. | No licence is stated in the file, and the Government of Canada's terms page would not load for the catalogue check, so the entry says "See source". |
| R21 | ACMA (acma.gov.au) | The Australian communications regulator | **Not integrated.** The site dropped the connection on both attempts and was left alone. | Could not be read. |
| R22 | ARISS (ariss.org) | The body that runs amateur radio on the International Space Station | **Read for the sheets** only: one page, for the station's frequencies. | Not checked. |
| R23 | MCA marine guidance notes on radio (gov.uk) | For example MGN 324 on the use of VHF radio and AIS | **Not integrated.** The current edition is published as a web page with no PDF to list. On 2026-11-16 it was **read for the sheets** through GOV.UK's content service, and the emergency frequencies sheet quotes it. | Open Government Licence v3.0. |
| R24 | Reticulum and Meshtastic | Open-source mesh radio projects | **Not integrated.** Reticulum's manual is offered only at a "latest release" address on GitHub that changes with every release and is served from other hosts, and it carries the project's own licence with restrictions; Meshtastic's documentation is a website with no single file. | Reticulum: its own licence. Meshtastic: not checked. |
| R18 | Kiwix archives on radio | Searched for in the Kiwix library's feed | The feed has very little on radio beyond what was already listed (the amateur radio, signal processing and electronics Stack Exchange archives). **5 entries added** in `radio`: the Raspberry Pi, Network Engineering, Internet of Things, Space Exploration and Aviation Stack Exchange archives. Searches of the feed for amateur, ham, CW, SDR, packet, APRS, Meshtastic, LoRa, satellite, shortwave, scanner, RF, telecommunication, telegraph and wireless found nothing else. *S2 Underground* (a 5.5 GB video channel on "communications doctrine") was **left out**: it is a third party's video channel and its rights have not been checked. | Stack Exchange content is CC BY-SA. |

### Added on 2026-11-16

Sources first looked at on 2026-11-16. "Listed" means entries were added; "candidate"
means the source looks worth having and something stopped it, which the row names.

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| N1 | Met Office (metoffice.gov.uk) | The UK's national weather service | **Listed: 8 entries** in `official-publications`, factsheets of its National Meteorological Library and Archive (1 Clouds, 4 Climate of the British Isles, 6 The Beaufort Scale, 8 The Shipping Forecast, 10 Air masses and weather fronts, 11 Interpreting weather charts, 14 Microclimates, 15 Weather radar). **Left out:** factsheet 3 (Water in the atmosphere), whose text cannot be extracted from the file, so it could not be read or searched; and factsheet 2 (Thunderstorms), which was checked but whose address answers `HEAD` with "404" until an ordinary request has warmed the publisher's cache ([see below](#what-the-online-check-cannot-express)). | The [factsheets page](https://www.metoffice.gov.uk/research/library-and-archive/publications/factsheets) says all information originating from the Met Office is Crown copyright and available under the Open Government Licence. Photographs credited to named people or other bodies are not covered; the entries say so. |
| N2 | Health and Safety Executive (hse.gov.uk) | The UK regulator for health and safety at work | **Listed: 5 entries** in `official-publications` (Basic advice on first aid at work, INDG347; Electrical safety and you, INDG231; Electricity at work: safe working practices, HSG85; Chainsaws at work, INDG317; Working at height, INDG401). Addresses were taken from each publication's own page. *First aid at work: guidance on regulations* (L74) was downloaded and left out: it is guidance for employers on the regulations and not a first aid reference. | The [copyright page](https://www.hse.gov.uk/help/copyright.htm) allows re-use of Crown material free of charge under the Open Government Licence, with the acknowledgement the entries carry; images the Crown does not own are excepted. |
| N3 | GOV.UK publications (gov.uk) | Guides published by UK departments and agencies | **Listed: 6 entries.** In `official-publications`: Life Saving Signals (Maritime and Coastguard Agency), The Countryside Code summary (Natural England and Natural Resources Wales), Personal Flood Plan (Environment Agency), National Risk Register 2025 (Cabinet Office), Know Your Traffic Signs (Department for Transport). In `radio`: GMDSS: The Benefits of Digital Selective Calling (MCA). Each address was taken from GOV.UK's content service for the publication's own page. **Left out:** *SOLAS V for pleasure craft*, which GOV.UK marks as withdrawn; and the collision regulations (MSN 1781), whose current amendment is a web page. | Open Government Licence v3.0 "except where otherwise stated", read in the footer of a [publication page](https://www.gov.uk/government/publications/live-saving-signals). The Risk Register and the traffic signs book state the licence inside the file as well. |
| N4 | Ordnance Survey (ordnancesurvey.co.uk) | Great Britain's national mapping agency | **Not listed.** Three guides were entered on 16 November 2026 and taken out again the same day, on the owner's decision: Map Reading: from the beginner to the advanced map reader; Map Reading Made Easy; Using the National Grid. They are not openly licensed (see the next column), and nothing in Outpost stops a portable drive from making a second copy. They can be had from its [teaching resources page](https://www.ordnancesurvey.co.uk/education/teacher-resources/primary). **Left out:** the legends for OS Explorer and OS Landranger maps, which print "Reproduction in whole or in part by any means is prohibited without the prior written permission of Ordnance Survey Limited"; and the map abbreviations sheet, whose address answered "not found". | **Not an open licence.** The guides are © Crown copyright, offered among OS's "free" teaching resources. The website's [general terms](https://www.ordnancesurvey.co.uk/legal/general-terms) say "You may access, view, download and print off one copy of any pages of our Website for your own personal use" and forbid commercial use without a licence. The entries say the file is for the person's own use and is not to be passed on. |
| N5 | US Department of Energy (energy.gov) | The department's technical standards programme | **Listed: 8 entries** in `official-publications`, DOE Fundamentals Handbooks from the 1990s: Electrical Science (4 volumes), Engineering Symbology, Prints, and Drawings (2), Mechanical Science (2). Addresses were taken from each volume's own page; the old address standards.doe.gov now redirects to the programme's page on energy.gov. The other handbooks in the series (mathematics, classical physics, thermodynamics, chemistry, instrumentation, materials, nuclear physics) were not looked at. | Each file is marked "Distribution Statement A. Approved for public release; distribution is unlimited." Works of the US Government. The department lists the series under the status "Archive". |
| N6 | Lessons In Electric Circuits (ibiblio.org/kuphaldt) | Tony R. Kuphaldt's free textbook series on electricity and electronics, hosted by ibiblio | **Listed: 6 entries** in `official-publications` (DC, AC, Semiconductors, Digital, Reference, Experiments). Each address comes from the volume's own contents page. ibiblio asks crawlers to wait two seconds; three were left. | CC BY 4.0: each volume reproduces the licence. The series index says only "the Creative Commons License". |
| N7 | Wireless Networking in the Developing World (wndw.net) | A free book on building low-cost wireless networks | **Listed: 1 entry** in `radio` (third edition, 2013; about 200 MB, the only edition the site's page links). | CC BY-SA 3.0, stated in the book and on the [licence page](https://wndw.net/license.html), which asks for a prominent link to wndw.net on copies. |
| N8 | Kiwix library, second pass | The library's English feed as it stood on 2026-11-16 (1,309 books) | **Listed: 27 entries** in `kiwix-more`. Stack Exchange sites: Home Improvement, Woodworking, Travel, Medical Sciences, Homebrewing, Astronomy, Physics, Chemistry, Biology, Mathematics, Geographic Information Systems, Unix & Linux, Server Fault, Information Security, Stack Overflow, the French, German and Spanish language sites, and Language Learning. Wikimedia: Wikiversity, Wikipedia's million top articles, and Wikipedia's history and climate change selections. Others: Rabbit Waves, Grimgrains, Based Cooking and the OpenWrt wiki. Every name and edition was taken from the feed, and each resolves there. **Left out**, with reasons: the 193 map archives named `maps_en_*` (Outpost has its own maps); CrashCourse, Surviving Residency, Skin of Color Society and other video or third-party collections whose terms were not read; the further LibreTexts shelves (K-12, Workforce and others) and Book Dash, because the addresses tried for their licence pages were not found; game, fiction and fan wikis; and the rest of the Project Gutenberg shelves, which the complete edition already covers. | Stack Exchange: CC BY-SA, versions by date of contribution, per its [licensing page](https://stackoverflow.com/help/licensing). Wikimedia: CC BY-SA 4.0, read on [Wikiversity](https://en.wikiversity.org/wiki/Wikiversity:Copyrights) and Wikipedia. Grimgrains: CC BY-NC-SA 4.0, per its [about page](https://grimgrains.com/site/about.html). OpenWrt wiki: CC BY-SA 4.0, per its [licence page](https://openwrt.org/license). Rabbit Waves and Based Cooking state no licence on their pages; their own repositories carry the MIT licence and the Unlicense, and the entries say that this is where the licence was read. |
| N9 | Sphere (spherestandards.org) | The Sphere Handbook of minimum standards in humanitarian response | **Candidate, not listed.** The site's `robots.txt` admits ordinary clients, but its pages on the handbook and on intellectual property answered HTTP 403, so the terms could not be read. Search results describe the handbook as free to download with all rights reserved. | Could not be read. |
| N10 | IFRC (ifrc.org) | The Red Cross and Red Crescent's international first aid, resuscitation and education guidelines | **Candidate, not listed.** The document's page answered HTTP 403. | Could not be read. |
| N11 | Médecins Sans Frontières medical guidelines (medicalguidelines.msf.org) | Clinical guidelines and essential drugs | **Not listed.** The address a search gives for the guideline as a PDF returns a one-page error; the site builds its PDFs on request, so there is no fixed file. Its about page states no licence. | Not found. |
| N12 | Hesperian Health Guides (hesperian.org) | *Where There Is No Doctor* and related books | **Not listed.** The [open copyright policy](https://hesperian.org/open-copyright-policy/) covers translation and adaptation in print, and says "please contact Hesperian for written permission to use our materials in any digital format". The books are also offered a chapter at a time under file names that change. Download them yourself and add them under Library. | Permission needed for digital use. |
| N13 | US agencies whose sites refused or failed | National Geospatial-Intelligence Agency (msi.nga.mil: *American Practical Navigator*, *International Code of Signals*), Forest Products Laboratory (*Wood Handbook*), PHMSA (*Emergency Response Guidebook*), NWCG (*Incident Response Pocket Guide*), USDA Food Safety and Inspection Service | **Candidates, not listed.** msi.nga.mil answered HTTP 503 twice; www.fpl.fs.usda.gov answered 502 twice, and the Forest Service's research repository disallows all automated access in `robots.txt`; www.phmsa.dot.gov, www.nwcg.gov and www.fsis.usda.gov answered 403. None was asked again. | Could not be read. These would be works of the US Government. |
| N14 | US Environmental Protection Agency (epa.gov) | Emergency disinfection of drinking water | **Not listed.** The guidance is a web page; the page links no PDF of its own. | Not applicable. |
| N15 | Radio sources looked at again | RSGB's repeater list (ukrepeater.net), Summits on the Air, the IARU Region 1 VHF and HF managers' handbooks | **Not listed.** ukrepeater.net's `robots.txt` disallows its data and documents folders and asks for ten seconds between requests; nothing was fetched. A search found no licence for the Summits on the Air rules, only a copyright notice on a copy elsewhere; of its own site only `robots.txt` was read. The IARU handbooks were not fetched: the IARU documents already listed state no licence, and no more "See source" entries were added. | No licence found. |
| N16 | Not examined | Mountaineering Scotland, the British Mountaineering Council, Mountain Rescue England and Wales, CAWST, Practical Action, Oxfam's technical briefs, the US National Park Service, the US Fire Administration, the US Coast Guard's boating safety site, the remaining FAO and WHO titles | **Thought of and not pursued** for want of time. Only `robots.txt` was read for some of them, and nothing else was fetched. They are named here so that the next pass can start with them. | Not checked. |
### Repeater lists

Read on 2026-11-16 for the repeater database ([radio.md](radio.md#repeaters)), in two
sittings: the first for importing a file a person has, the second for the sources the
Repeaters screen lists by country. These rows are numbered P1 onwards. The question
asked of each was narrower than for a document: may an application fetch the list when
a person asks, keep a copy for that person, and show it with no connection?

**Where this stands.** Each publisher is declared in
[`catalog/repeater-sources.json`](../catalog/repeater-sources.json) as one of three
kinds, and the Repeaters screen shows them by country:

- **fetch**: the publisher offers a data file, and nothing in its terms or `robots.txt`
  forbids an application fetching it when a person asks. Outpost fetches that one file
  when somebody presses **Get the list**, and at no other time.
- **link**: the publisher offers files but an application may not fetch them (its
  terms, `robots.txt`, a sign-in or a check for a browser say so), or its terms could
  not be established. The screen gives the publisher's page and the steps to download
  the file by hand; the importer reads it.
- **none**: nothing usable. Said so that nobody looks twice.

Outpost does not read a list out of a web page, does not answer a check that its
visitor is a browser, does not sign in, and does not go round a `robots.txt` rule or a
rate limit. Nothing here is in the catalogue and nothing is bundled.

| Country | Publisher | Kind | Why, in short | Where the terms were read |
| --- | --- | --- | --- | --- |
| United Kingdom | RSGB ETCC, ukrepeater.net (P1) | **link** | On the second reading its server refused a program outright and then put up a check for a browser, before any file was asked for. Its pages state no terms either way. | `robots.txt` (refused, HTTP 403, twice); its pages as read in the first sitting |
| Ireland | IRTS (P4) | **fetch** | Offers a CHIRP file by name at a fixed address with no sign-in; `robots.txt` disallows only `/callbook` and `/lib`; no terms, licence or copyright notice on the pages that offer it. The one fetch that rests on a file being offered and nothing forbidding it, not on stated leave. | `robots.txt`, [the repeater page](https://www.irts.ie/cgi/repeater.cgi), its downloads page |
| Worldwide | Hearham, hearham.com (P12) | **fetch** | Its page says the listing is "Free to use and free to use in your application" and the "JSON API is available to download or use in your offline/online application". | `robots.txt`, [the repeaters page](https://hearham.com/repeaters), [its terms](https://hearham.com/terms) |
| Worldwide | RepeaterBook (P2) | **link** | Forbids it in so many words: "bulk extraction, mirroring, redistribution, offline bundling, and secondary API use require written permission". | [`robots.txt`](https://www.repeaterbook.com/robots.txt); its API and legal pages as read in the first sitting |
| Worldwide | Open Repeater (P3) | **link** | Offers files to people, names no file address, and disallows the API a program would use; its terms contradict the licence it states. | `robots.txt`; its downloads and terms pages as read in the first sitting |
| Australia | Wireless Institute of Australia (P5) | **link** | "© 2026 Wireless Institute of Australia all rights reserved"; the CSV is offered to anyone in a browser. | [The repeater data page](https://www.wia.org.au/members/repeaters/data/) (the site has no `robots.txt`) |
| Australia | ACMA register (P6) | **none** | Its licence would allow a copy, but it is every radio service in several tables and Outpost does not read it. | [Its licence](https://cdn.acma.gov.au/offline-rrl/doc/LICENCE.TXT) |
| Finland | SRAL, automatic.sral.fi (P7) | **link** | Its terms allow non-commercial amateur radio applications. Not fetched yet because its API gives modes and access as numbers from further tables, which Outpost does not read. | `robots.txt`; the terms of use in the script that draws its pages; `/openapi.yaml` |
| Europe | PZK: przemienniki.net and repeate.rs (P13) | **none** | Maps only: no file is offered and no terms are stated for the data. | `robots.txt` and the home page of each |

| # | Source | What it holds | What its terms say | What Outpost does |
| --- | --- | --- | --- | --- |
| P1 | RSGB ETCC (ukrepeater.net) | The list of United Kingdom repeaters and gateways kept by the RSGB's Emerging Technology Co-ordination Committee. Its [downloads page](https://ukrepeater.net/csvfiles.html) offers nine CSV files, made afresh on each request, with no registration: voice repeaters (808 rows, 68 kB on the day), voice repeaters and gateways with status (1,348 rows, 148 kB), all modes (808 rows, 63 kB), a version with no headings, Echolink and AllStar links, a list up to UHF, packet, and a channel plan. Fields in the fullest file: the list's own number, callsign, band, channel, the two frequencies, aerial height, power, modes, locator, town, postcode area, region, CTCSS tone, DMR colour code, keeper, latitude, longitude, status. The page says entries whose keepers asked for privacy "are likely to have the location detail truncated or obfuscated". The same page names a "beta" API at api-beta.rsgb.online. The home page carried news dated the day before, so the list is current. | **Nothing either way.** The downloads page, the home page, the about page and the API's page state no licence, no copyright notice, no terms of use and nothing about automated access or keeping a copy. The only words near the subject are the footer's "free of sponsors – free of ads – no cookies – no registration – yours to enjoy!". `robots.txt` asks every client for a ten-second crawl delay and disallows a list of folders (`/data3/`, `/documents/`, `/scripts/` and others); the addresses of the CSV files are not among them. The privacy policy (a PDF) was not read. | **Link: downloaded by hand.** Read again on 2026-11-16 to decide between fetching and a link, and the site decided it: two requests for `robots.txt`, eleven seconds apart, by a program that named itself plainly, were refused. The first answer was "403 - Forbidden | Access to this page is forbidden."; the second was a page titled "Just a moment..." that asks for JavaScript and cookies, which is a check that the visitor is a browser. Nothing else was asked of the site. Outpost does not get round such a check, so the list is one to download in a browser. Had the site answered, the case for fetching was fair (files offered to anyone with no sign-in, a crawl delay that expects programs, the CSV addresses not disallowed) and so was the case against (no stated leave); it did not come to that. A catalogue entry is also ruled out by the catalogue's own rule that a file carries a checksum: these files are generated on request. The importer recognises three of the layouts by their headings (the two voice lists and the all-modes list), so a file saved from that page in a browser is read with nothing to configure. To learn those headings and the forms their values take, three of the files were fetched once each on 2026-11-16, eleven seconds apart, with a generic client name; they were read, used to write the importer, and deleted. No row of them is in this repository: the tests use made-up stations. **What would change this:** a written answer from the ETCC that an application may fetch the file when a person asks, and a server that lets one. The committee is reached through ukrepeater.net. An administrator who has such an answer can declare the source as `fetch` in their own source file. |
| P2 | RepeaterBook (repeaterbook.com) | A worldwide directory with an export API (one address for North America, one for the rest of the world). Fields named on its [API page](https://www.repeaterbook.com/wiki/doku.php?id=api): frequency, input, tones, town, county, state, callsign, use, operational status, mode flags, DMR colour code and ID, D-STAR, Fusion, NXDN, P25, linked-node numbers, notes, last update. | **Forbidden without written permission.** `robots.txt` opens with a policy summary: "AI/model training, bulk extraction, mirroring, redistribution, offline bundling, and secondary API use require written permission", and disallows `/api/`. The API page (last modified 2026-10-25) says "API access is not open by default", "Approval is required before access is granted", that a distributed application must not embed a shared token, that a client "may cache only the minimum data reasonably necessary for the approved workflow", and lists "redistributable offline repeater databases" among the things not authorised. Its [legal page](https://www.repeaterbook.com/index.php/about/legal) (last revised 2025-05-13) limits material to "your personal, non-commercial home use only" and forbids "data-mining, web-mirroring, scraping, or automated data copying of any kind". | **Not integrated, and not contacted** beyond `robots.txt` and those two pages. An offline repeater database is the very thing its terms name. Whether a file a person exported for their own use may be kept in a tool of their own is between that person and RepeaterBook; Outpost's importer will read such a CSV, as it reads any, and says nothing either way. **What would change this:** RepeaterBook's written approval of Outpost as an application, which its page says it may give a non-commercial project. Each person would then need a token of their own. |
| P3 | Open Repeater (openrepeater.org) | A directory of repeaters which, by a [write-up of it](https://hamradio.my/openrepeater-free-amateur-radio-repeater-directory/) dated 2026-08-10, are submitted by its users and reviewed before they are published; the same write-up says its API needs a free key and allows 30 requests a day. The pages read give no count of repeaters or countries. | **Stated as open, with a contradiction.** Its [downloads page](https://www.openrepeater.org/downloads) says "Repeater data is licensed under CC0" and anyone can "download files without signing in"; the footer says "Data licensed under CC0 1.0". Its [terms](https://www.openrepeater.org/terms) (last updated June 2026) say "Site content belongs to Open Repeater and its contributors unless stated otherwise" and "You may not resell or commercially redistribute the database without written permission", which does not sit with CC0. `robots.txt` disallows `/api/`. The terms name no legal entity, and where its entries first came from was not looked into. | **Not integrated.** The page that offers the files is drawn by a script and names no file address, so there is nothing fixed to list, and the route a script would use is the API that `robots.txt` disallows. The contradiction in its terms, and not knowing where its rows came from, are reasons of their own. A CSV saved from it in a browser can be imported like any other. |
| P4 | IRTS (irts.ie) | The Irish Radio Transmitters Society's [repeater page](https://www.irts.ie/cgi/repeater.cgi): about seventy voice repeaters with channel, frequencies, callsign, access and location, marked "Updated 24/02/2026", and four files for programming radios, one of them a CHIRP CSV. | No licence, copyright notice or terms on the page, and none on the society's downloads page, which lists the same four files (the CHIRP file as 4.5 kB). `robots.txt`, read on 2026-11-16: "Disallow: /callbook", "Disallow: /lib", and nothing else. The privacy policy was not read. | **Fetch: the CHIRP file, when a person asks.** The page offers the files by name ("Download the repeater listings in various formats") at fixed addresses with no sign-in, the file's folder is not disallowed, and nothing forbids it. Nothing grants leave in so many words either: this is the one source Outpost fetches on that footing, and the Repeaters screen says so beside it. The file was fetched once on 2026-11-16 to confirm it is CHIRP's layout: 45 channels, last changed by the society on 31 March 2026, each named with a callsign and a site. It holds no positions, so these entries are listed but are not on the map. **What would change this:** a word from the IRTS either way. An administrator can make it a link in their own source file. |
| P5 | Wireless Institute of Australia (wia.org.au) | A [repeater directory](https://www.wia.org.au/members/repeaters/data) as PDF and CSV (dated 2026-07-05), which the page says is cross-referenced with the regulator's register. | "© 2026 Wireless Institute of Australia all rights reserved." The page addresses "Application Developers who use this data" but grants nothing. The site has no `robots.txt` (HTTP 404 on 2026-11-16). | **Link: downloaded by hand.** The importer recognises the CSV by its headings. To learn them, the file dated 5 July 2026 was fetched once on 2026-11-16 from the address the page gives, read, and kept out of the repository: twelve columns, rows that head each section and name its mode, about 900 repeaters once those listed under two modes are counted once. It gives no positions. Its status letters are explained in a PDF that was not read: O and W are read as operational, as the page says, and the others are kept as written. |
| P6 | ACMA Register of Radiocommunications Licences (Australia) | The regulator's register of licensed stations in Australia, offered as one download. Its download page was not opened; a search engine's extract of it says the file is remade every few hours. Amateur repeaters would be a small part of it. | Not Creative Commons: its own [licence](https://cdn.acma.gov.au/offline-rrl/doc/LICENCE.TXT), accepted by downloading, allows a person "to use, reproduce and adapt the Register" and "to incorporate the Register in an electronic information retrieval system", asks for the credit "Based on Australian Communications and Media Authority information", and forbids reproducing the details of licensees who are people. | **None: nothing Outpost can read.** Its licence, read again byte for byte on 2026-11-16, would allow a copy to be kept. It is not built because the register is every radio service in several tables to be joined and filtered, far larger than the importer's limits, and its licence is accepted by the person who downloads it ("By clicking on the link below you are agreeing"). The register itself was not downloaded. It is the place to start if positions for Australian repeaters are wanted, since the WIA's file has none. |
| P7 | SRAL (automatic.sral.fi) | The Finnish league's list of automatic stations, with a page headed "Data export / machine-to-machine API". | **Read on 2026-11-16, at the source.** The site is drawn by scripts; `robots.txt` disallows its sign-in, help and old pages and `/js`, and the scripts that draw the pages are in `/assets`, which it does not disallow. The terms of use in them read: "This service and data may be used for non-commercial amateur radio applications only. Commercial use is not permitted.", "Do not overload the service. Avoid unnecessary queries.", and that breaking them may end in blocking. Its API is described at `/openapi.yaml`, whose header gives the API description itself an MIT licence. | **Link, for now.** Its terms would let Outpost fetch it. It is not fetched because `GET /api/stations` gives each station's modes and access as numbers that are looked up in further tables, and that reading has not been built; the API was not called. Until then the site's own export for CHIRP is the way (the names of its pages were taken from its script, not walked through in a browser). Seven requests were made of it in all, which is more than was meant: a home page and an export page that are both the same empty shell, then two scripts and the API description. |
| P8 | BrandMeister, EchoLink, AllStarLink, IRLP, RadioID | Networks and registries that publish lists of their own nodes or of DMR repeaters. | **No terms found.** A search for each found descriptions of the lists and of other people's use of them, and no page stating who may fetch or keep them. On 2026-11-16 RadioID's `robots.txt` was read (it disallows `/account/` and `/database/view`) and its page of database files was asked for once: the answer was a page headed "Checking your browser…". BrandMeister's site has no `robots.txt`. The others were not contacted. | **Not listed on the screen.** Not finding terms is not finding permission, and a check for a browser is not something Outpost answers. |
| P9 | OpenStreetMap | The map's own data has a tag for an amateur repeater (`communication:amateur_radio:repeater`), with frequency, shift and tone as further tags. | ODbL, as for the rest of the map. | **Not used.** A 2021 question on OpenStreetMap's help site, as a search engine extracted it, gives 182 mapped worldwide; it is not a repeater list, and the map tiles Outpost installs do not carry these tags. |
| P10 | Regulators other than the ACMA | No list of repeaters published by Ofcom itself was found: the licence says a repeater's callsign is "allocated and published by the Radio Society of Great Britain or any other body stipulated by Ofcom", which is source P1. Germany's Bundesnetzagentur publishes a list of callsigns as a PDF; it was not read. | Not applicable, or not read. | **Not integrated.** |
| P11 | CHIRP (chirpmyradio.com) | Not a list: the radio programming software whose CSV layout Outpost reads and writes. | Its licence was not read, because nothing of it is in Outpost. | **Read for the format only.** The column names, their order, the defaults and the words for tone modes and modes were taken from `chirp/chirp_common.py` in [CHIRP's source](https://github.com/kk7ds/chirp) on 2026-11-16. A layout is not a work; no code was copied. |
| P12 | Hearham (hearham.com) | A listing of about 23,000 repeaters (22,947 on 2026-11-16), two thirds of them in North America, offered as one JSON file of about 10 MB at `/api/repeaters/v1`. Fields: its own number, callsign, latitude, longitude, town, group, linked node, mode, the tone or code to send and to expect, frequency and shift in hertz, description, power source, whether it is in use, and any restriction. | **Offered to applications, in so many words.** Its [repeaters page](https://hearham.com/repeaters) says: "Free to use and free to use in your application. ( JSON API is available to download or use in your offline/online application!)". `robots.txt` disallows only comment and favourite pages. Its [terms](https://hearham.com/terms) (updated 14 November 2024) ask users not to "disassemble, reverse engineer, or otherwise intrude on server components or app components not expressly published as open-source", and say nothing against fetching the list. The answer carried a header "X-RateLimit-Limit: 60". | **Fetch, when a person asks.** One request for the one file, no more often than once a minute. It was fetched once on 2026-11-16 to learn its layout and kept out of the repository. **Two things to know.** The "group" field of 1,911 rows reads RSGB and of 979 reads WIA, with others naming other bodies: those rows appear to come from the lists of P1 and P5, whose publishers grant nothing. Hearham's leave is Hearham's to give for its own service; what it covers for those rows was not established, and Outpost keeps the list on the person's device and passes it to nobody. And 1,225 callsign and frequency pairs appear more than once in the file, which is what the import's handling of duplicates is for. |
| P13 | Polski Związek Krótkofalowców: przemienniki.net and repeate.rs | Maps of repeaters, for Poland and for 26 more countries, "created by" the Polish Amateur Radio Union. | **Nothing stated.** Both `robots.txt` files allow browsing; przemienniki.net's adds content signals ("search=yes,ai-train=no"). Neither home page, read on 2026-11-16, mentions an export, an API for others or a licence. Each draws its map from an address of its own under `/wp-json/`. Their privacy policies were not read. | **None.** No file is offered, and Outpost does not read a list out of a web page or use an address a site keeps for itself. An older przemienniki.net is remembered as having an export; nothing of one was found on the day. |
| P14 | ÖVSV (repeater.oevsv.at) | The Austrian society's map and list of repeaters. | **Not established.** `robots.txt` reads "Allow: /". The page is drawn by a script and the part that came back states no terms; a search found none. | **Not listed on the screen.** Worth reading by hand in a browser. |
| P15 | Germany, the Netherlands, Japan, Belgium | Searched for on 2026-11-16, not visited. | A search found no list of repeaters as a data file from the Bundesnetzagentur, the Dutch RDI or JARL (only notices and PDFs about them). A search extract says the Belgian UBA offers its list as XLS, PDF and KMZ; that was not confirmed at the source, and Outpost reads none of those formats. | **Not listed on the screen.** These, and every country not named here, are covered only as far as the worldwide sources cover them. |

What this means for a person, said once: under **Repeaters → Get a list**, press
**Get the list** for a source Outpost may fetch, or follow the steps for one it may
not and import the file you saved. Either way the list goes into your own database and
nowhere else, and Outpost keeps the date of its data and says how old it has become.

A fetched file cannot be held to a checksum, as a catalogue download is: its publisher
makes it afresh when it is asked for. What stands in its place is the importer, which
reads the file as text, checks every value and caps its size and its rows, and the
preview, which shows how the file was read before anything is kept
([security.md](security.md)).

### Maps and geospatial data

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 22 | OpenStreetMap | The free, community-made map of the world | **Built in.** The Maps screen downloads regions cut from the Protomaps build of OpenStreetMap data; see [maps.md](maps.md). The OpenStreetMap wiki is also in `kiwix-essentials`. Named routes are fetched from it on request: see [Routes](#routes). | Open Database Licence, per the [copyright page](https://www.openstreetmap.org/copyright). The credit is shown on the map. |
| 23 | Geofabrik downloads (download.geofabrik.de) | Regional extracts of raw OpenStreetMap data, updated daily | **Not integrated.** The extracts are raw data, not tiles. See [the note below](#geofabrik-extracts-and-what-outpost-uses-instead). | [ODbL 1.0](https://download.geofabrik.de/); the service is offered free of charge by Geofabrik. |
| 24–25 | Natural Earth | Public-domain map data at small scales | **Built in.** The 1:110m data draws the simple world outline beneath the map and the boxes of the country presets. | Public domain, as recorded in [maps.md](maps.md). The Natural Earth terms page did not answer on the day (two time-outs), so it was not read again. |
| 26 | USGS (usgs.gov) | The US Geological Survey | **Direct: 4 entries** (Topographic Map Symbols; Finding Your Way with Map and Compass; Map Projections: A Working Manual; and, added on 2026-11-16, The Universal Transverse Mercator (UTM) Grid). USGS map and elevation data are not integrated. | The Publications Warehouse [says](https://pubs.usgs.gov/documentation/faq) that PDF files of USGS-published reports are in the public domain, though some illustrations are used with permission. The main usgs.gov site returned an empty page to the catalogue check. |
| 27 | NASA Earthdata Search | A search tool over NASA's Earth-observation datasets | **Not integrated.** It is an interactive search over scientific data files, not a set of documents or map tiles; nothing in it is a single stable file that the library or the map could use as it stands. | NASA's [data use guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance) says the data are freely accessible and asks for citation. |

### Routes

Added on 2026-11-16 with "Find a route" on the Maps screen ([maps.md](maps.md#finding-a-known-route)).
The question was whether a named route, such as the Llanberis Path, can be put on the
map without the person finding a GPX file somewhere. These rows are numbered T1
onwards. Every page linked in the last column was read on 2026-11-16; where a page was
read somewhere other than its own address, that is said.

| # | Source | What it has | How Outpost uses it | Licence, terms and what they say about automated access |
| --- | --- | --- | --- | --- |
| T1 | OpenStreetMap route relations and named ways | Walking, cycling, riding and running routes that mappers have gathered into "route relations", each a list of ways; and paths that merely share a name. The Llanberis Path is a route relation ([4004181](https://www.openstreetmap.org/relation/4004181), five ways, 6.0 km as mapped); a search of ways round Snowdon turned up eight separate ways named Miners' Track. | **Built in: "Find a route".** Outpost's installed map does not carry routes, so one is fetched when a person chooses it, through a server in rows T2 and T3, and kept as a track. Nothing is bundled. | Open Database Licence 1.0, per the [copyright page](https://www.openstreetmap.org/copyright). Credit: "© OpenStreetMap contributors". What the licence asks of a route kept as data and of a map with the route on it is set out [below](#what-the-open-database-licence-asks-of-a-found-route). OpenStreetMap's own servers are not contacted: see T8. |
| T2 | Overpass API at Private.coffee (overpass.private.coffee) | A public Overpass API server for the whole world, run by a non-profit association in Austria (the server formerly at overpass.kumi.systems) | **Built in, listed in `catalog/route-sources.json`:** asked about any part of the world that no regional server is listed for. | Its [own page](https://overpass.private.coffee/) carries terms of use dated 10 April 2026: "Use our endpoints in any project requiring access to OpenStreetMap data, including commercial use. No registration needed, just point your application to our endpoint", with no rate limit. It asks users to optimise queries and limit simultaneous requests, to make sure requests "do not contain any personally identifiable information", to credit OpenStreetMap, and to send "a meaningful User-Agent header" with "your project name and a means to contact you (e.g., a link to your project website)"; it prefers `POST`. Not to be used in "projects related to warfare, military applications", nor "for critical infrastructure or where incorrect data could cause serious consequences". No warranty; may end at any time. Outpost does each of the things asked: one question at a time, `POST`, the client name "Outpost/&lt;version&gt;" with the project's address, the credit kept with every route. **On the day:** one search answered, after 95 seconds, from a copy of the map dated 2026-07-28; three more searches and one status request got no answer within 29 to 60 seconds. |
| T3 | Overpass API at dresel.systems (ovp.dresel.systems) | Two public Overpass API databases on one privately run machine in Germany: Europe and North America, from Geofabrik's extracts, refreshed about daily | **Built in, listed in `catalog/route-sources.json`:** asked first about views in Europe and in North America. | The operator's [own page](https://ovp.dresel.systems/) (in German) calls it an open server, "ohne Anmeldung und ohne API-Schlüssel", a free offer for everyone ("ein freies Angebot für alle"), on limited hardware (four cores): at most four queries at once per address and region, bulk queries to be batched not looped, no guarantee of availability, blocking in case of abuse. Its row on the [OpenStreetMap wiki](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances) adds: "Please send a User-Agent or Referer that identifies your app." The operator's page says nothing for or against use by applications; the wiki row expects it. **On the day:** nine questions to the Europe database answered in 0.2 to 5.5 seconds and one to the North America database in 0.5, all from the map as it was the evening before. |
| T4 | Overpass API main instance (overpass-api.de), run by FOSSGIS | The original public Overpass API servers | **Not listed.** Three things were read, and together they say an application should not be pointed at it by default. The [Overpass manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) lists among "problematic behaviour": "Setting up an app for more than just OSM mappers and relying on the public instances as backend", for which "only running your own instance sustainably serves your mission". FOSSGIS's [terms of use](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/) say its services exist chiefly for its own website and for OpenStreetMap contributors, welcome third-party use within limits, and add "Explicitly recommended: The URLs of our services should not be hardcoded into the app." And on the day its status address answered "This Overpass API server is currently at capacity ... This public endpoint is intended for browser-based and human-operated tools." A person can still declare it for their own use in their own route source file; it is then their use to answer for. | As quoted. The same terms ask for a User-Agent that identifies the application, at most two connections, attribution, and a link for reporting map errors. |
| T5 | Britain and Ireland Overpass instance (overpass.atownsend.org.uk) | A regional Overpass API server run by one mapper | **Not listed.** Its [usage policy](https://overpass.atownsend.org.uk/) refers to the "problematic behaviours" of row T4, which include applications that depend on a public instance, and says it is not for commercial use. It mostly answers over IPv6 only. | As described. |
| T6 | VK Maps Overpass instance (maps.mail.ru) | A public Overpass API server run by a Russian company | **Not listed.** The OpenStreetMap wiki's table says "Feel free to use our services in any project", but the operator's [own page](https://maps.mail.ru/osm/tools/overpass/) is a query tool with no terms on it, so nothing was read from the operator. | Not found at the source. |
| T7 | Overpass API servers that need a key or payment (Geofabrik, FairwayMapper, Tracestrack, Overspan, NextGIS, Mapsource, Overpass.ch) | Commercial or registered-access servers, as listed on the OpenStreetMap wiki | **Not listed.** Outpost has no accounts and stores no keys for this. Someone who has such a service can declare its address in their own route source file if the key is not part of a secret (the file is not a place for credentials). | Not read: each has its own terms. |
| T8 | OpenStreetMap's editing API (api.openstreetmap.org) | The API the map is edited through, which can also return one relation | **Not used.** The [API usage policy](https://operations.osmfoundation.org/policies/api/): "The editing API is provided in order to edit the map data, not for read-only purposes or projects." | As quoted. |
| T9 | Waymarked Trails (waymarkedtrails.org) | A map of OpenStreetMap's route relations, with a GPX file for each | **Not used.** Its "Legal and usage terms" say: "GPX tracks are provided for the convenience of visitors of this site. Mass download is not allowed." Nothing there offers its search or its files to other applications. Outpost reads the same relations from the same data instead (T1). | The routes overlay is CC BY-SA 3.0 DE and the GPX tracks ODbL. The site draws its help pages with a script, so the text was read in the site's [source](https://github.com/waymarkedtrails/waymarkedtrails-website/blob/master/src/i18n/qot/helppages.yaml), not on the site itself; its `robots.txt` answered "not found". |
| T10 | National Trails (England), Natural England | The lines of the National Trails as one dataset: shapefile, GeoPackage, GeoJSON (zipped), and map services | **A candidate, not integrated.** The files are real and open, but they are one zip of every trail, in a format Outpost has no reader for, and would need splitting into trails and joining into lines; none was downloaded, so there is no size or checksum to list. Until someone builds that, the same trails are found through T1 where mappers have recorded them. | The [data.gov.uk record](https://www.data.gov.uk/dataset/national-trails-england3) (updated 15 May 2026) links the Open Government Licence v3.0 and gives the attribution "© Natural England copyright. Contains Ordnance Survey data © Crown copyright and database right [year]". The Natural England geoportal page it points to is drawn by a script and was not read. Trails in Wales and Scotland are published by other bodies and were not looked for. |
| T11 | US National Park Service public trails | Trail lines for the national parks, as a map service | **A candidate, not integrated.** The [service's own description](https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails/MapServer/0/iteminfo?f=pjson) states no licence. It says the data is "for general informational and mapping purposes only" and "Not for navigation, emergency response, or resource protection decision-making". It is trail segments, not named routes put together. | No licence statement found. Works of the US Government are generally in the public domain, but that was not confirmed for this dataset, and copies of it on data.gov carry differing labels. |
| T12 | US Forest Service, National Forest System Trails | Trail lines for the national forests: a 248 MB shapefile or a 119 MB geodatabase, refreshed 8 November 2026 | **A candidate, not integrated.** Found on the Forest Service's [dataset list](https://data.fs.usda.gov/geodata/edw/datasets.php?xmlKeyword=trail); neither the file nor its metadata was downloaded, so no licence was read. Segments, not named routes, in a format Outpost does not read. | Not read. |
| T13 | Route-sharing websites and apps (AllTrails, Komoot, Walkhighlands, OS Maps, Strava, Wikiloc and the like) | Routes drawn or recorded by their staff and users | **Not used, and not contacted.** These are their owners' collections under their owners' terms, which were not read for this work; nothing is fetched from them and nothing was. If your account with one lets you export a GPX file, import that file. | Not read. |

#### What the Open Database Licence asks of a found route

Read on 2026-11-16 in the [licence itself](https://opendatacommons.org/licenses/odbl/1-0/)
and in three guidelines of the OpenStreetMap Foundation: on
[produced works](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline),
on [what is substantial](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline),
and on [attribution](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).
This is a reading of those texts, not legal advice.

- **A route's points, kept as data, are an extract of the database, not a "produced
  work".** The licence defines a produced work as "a work (such as an image,
  audiovisual material, text, or sounds)" made from the data. The Foundation's
  guideline draws the line by purpose: "If the published result of your project is
  intended for the extraction of the original data, then it is a database and not a
  Produced Work." A track in Outpost's database, and a GPX file of it, exist to hand
  the coordinates on. So they are OpenStreetMap data still: a "derivative database"
  where the extract is substantial.
- **Whether one route is "substantial" is not settled by a number, and Outpost does
  not try to settle it.** The Foundation regards "less than 100 Features" taken once
  as not substantial; the Llanberis Path is five ways, a long trail is thousands. A
  rule that changed the credit at some size would be a guess. Every found route is
  treated the same: as OpenStreetMap's data, with the notice kept.
- **What that asks.** Section 4.2: whoever passes the data on to people outside their
  own household or organisation must do so under the same licence, "include a copy of
  this License ... or its Uniform Resource Identifier (URI) with the Database", and
  "keep intact any copyright or Database Right notices". Hence the licence address and
  the credit inside the GPX file, in the fields GPX has for them, and in the route's
  description. Section 4.4 (share alike) and 4.6 (offering the data) fall on the
  person who publishes it, not on Outpost: Outpost passes nothing on. Keeping a route
  on your own server for your own household is not "public" use (the licence's
  definition of "Publicly", and section 4.5 c).
- **A map with the route drawn on it is a produced work.** That covers the screen, a
  screenshot, a printed map, a PDF. Section 4.3: when it is shown to other people it
  needs "a notice ... reasonably calculated to make any Person that uses, views,
  accesses, interacts with, or is otherwise exposed to the Produced Work aware that
  Content was obtained from the Database ... and that it is available under this
  License". The attribution guideline accepts "© OpenStreetMap contributors" with a
  way to reach openstreetmap.org/copyright, in a corner of an interactive map, and
  asks for the address printed out on paper. Hence "Routes: © OpenStreetMap
  contributors", linked, in the map's credits while a found route is drawn.

#### What was done on 2026-11-16 for routes, and how

- **Terms.** Each operator's own page was fetched once and read. Web search was used
  twice, to find the government datasets.
- **Questions to route sources.** Sixteen in all, each typed or started by hand, one
  at a time. Five to overpass.private.coffee: routes named "llanberis path" anywhere
  (answered in 95 seconds: relation 4004181); the routes in a box round Snowdon (no
  answer in 60 seconds); its status address (no answer in 30); and the same box
  searched twice through Outpost itself (no answer in 30 and in 29). One to
  overpass-api.de: its status address, which answered that it was at capacity. Nine
  to the Europe database at ovp.dresel.systems: relation 4004181 with its points;
  routes and paths named "track" round Snowdon; every route in that box with its
  length (19 routes); "llanberis path" across Europe; and through Outpost itself
  "pyg track" in that box, "Llanberis Path" anywhere, and the preview of relation
  4004181; and, once the interface was built, "Llanberis Path" in the view round
  Snowdon and its preview again, from a browser. One to its North America database, through Outpost: "Bright Angel" in a box
  at the Grand Canyon (two routes and three named paths).
- **The Llanberis Path, end to end.** Through a private copy of Outpost on a
  development machine: found by name anywhere in 5.5 seconds, and in the view round
  Snowdon in 0.8; previewed in 0.2 to 0.4 as one unbroken line of 277 points from five
  ways, 6.03 km; added; exported as GPX with its credit; the file validated against
  the GPX 1.1 schema. In the browser run, the browser itself contacted nothing but
  Outpost. No terrain was installed on
  that copy, so its heights were not seen; heights are tested with made-up terrain
  tiles and the made-up route.
- **What was not tried.** A route of thousands of ways from a real source; a route
  with real gaps or branches (the tests use made-up ones); the search on a real
  source from a phone; any source over a slow connection.
- **Conduct.** A plain client name on every request, nothing personal in any of them,
  no retries beyond those listed, and nothing fetched that was not looked at.

### Reference software

These are programs, not content, so none of them appears in the catalogue.

| # | Source | What it is | Relation to Outpost | Licence |
| --- | --- | --- | --- | --- |
| 28 | Kiwix | Readers and servers for ZIM archives | Outpost reads ZIM archives through kiwix-serve; see [architecture.md](architecture.md). | kiwix-serve is GPL-3.0 (see 29). |
| 29 | kiwix-tools | The command-line tools that include kiwix-serve | Run by Outpost as a separate, sandboxed program. | [GPL-3.0](https://github.com/kiwix/kiwix-tools/blob/main/COPYING). |
| 30 | Internet-in-a-Box | An offline learning server for low-cost hardware | Named in the README as one of the projects that showed the way. No code was taken from it. | [GPL-2.0](https://github.com/iiab/iiab/blob/master/LICENSE). |
| 31 | PrepperPi | Offline knowledge servers for the Raspberry Pi | Named in the README as one of the projects that showed the way. No code was taken from it. More than one small project on GitHub uses this name; those seen carry MIT-style licences. | MIT-style (per GitHub's listing; not read in full). |
| 32 | Paperless-ngx | A document management system | Named in the README as one of the projects that showed the way. No code was taken from it. | [GPL-3.0](https://github.com/paperless-ngx/paperless-ngx/blob/dev/LICENSE). |
| 33 | Offgrid Pi | An offline knowledge server for the Raspberry Pi | Named in the README as one of the projects that showed the way. No code was taken from it. | MIT (per GitHub's listing; not read in full). |
| 34 | Organic Maps | An offline maps application for phones | Named in the README as one of the projects that showed the way. No code was taken from it. | [Apache-2.0](https://github.com/organicmaps/organicmaps/blob/master/LICENSE). |
| 35 | MapLibre | An open-source map renderer | Outpost's map is drawn with MapLibre GL JS. | [BSD 3-Clause](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt). |
| 36 | Notion | A hosted note-taking service | Supplied as a point of reference. It is a commercial online service, with no content to list. | Proprietary. Its terms page is drawn by a script and could not be read by the catalogue check. |

## How the catalogue treats licences

- An entry states a licence only when it was read at the source: in the file itself, on
  the publisher's page, or in the publisher's own catalogue record. The `licenseNote`
  says where the statement comes from and what its main conditions are.
- Where no licence statement could be found, or it has not been checked, the entry
  says `"See source"` and the note says so. That applies to most Kiwix archives of
  third-party websites, to the USDA canning guide and to the UIAA papers.
- Ofcom's documents are not under the Open Government Licence. They carry Ofcom's own
  terms, which allow free reproduction with acknowledgement; the entries quote them.
  GOV.UK documents are under the Open Government Licence v3.0 only "except where
  otherwise stated", and the entries say what is excepted where that was seen. The Met
  Office and the Health and Safety Executive publish under the same licence by their
  own statements; photographs they credit to someone else are not covered.
- "Public domain (US Government work)" is used for documents published by US federal
  agencies. Such documents can still contain photographs or figures owned by someone
  else; the note says so where this was seen.
- Several licences in the catalogue do not allow commercial use (CC BY-NC-SA for
  OpenStax, FAO's terms). That does not affect downloading and reading, but it matters
  if you pass the files on.
- Outpost never redistributes anything. A download goes from the publisher's server to
  your disk. What you do with the file afterwards is governed by its licence.
- Everything listed may be kept and, as far as its licence note says, passed on. A
  [portable drive](portable.md) copies whatever documents and collections you tick from
  your own library to your own drive; it does not look at licences, and its README
  says only that each collection carries its own licence. For that reason sources that
  allow only one copy for personal use (Ordnance Survey's map reading guides) are not
  listed, and nor are those that ask for permission for any digital copy (Hesperian).
  If the catalogue ever gains a way to mark an entry "for your own use only" and keep
  it off a drive made for someone else, such sources could be listed.
- Where a website states no licence but its publisher's own repository does (Rabbit
  Waves, Based Cooking), the entry gives the repository's licence and says that is
  where it was read.
- A route found with "Find a route" is OpenStreetMap data under the Open Database
  Licence. Its credit is stored with it and written into its GPX export; see
  [what the licence asks](#what-the-open-database-licence-asks-of-a-found-route).

## Checksums, and what happens when a publisher changes a file

Kiwix entries carry no address or checksum: both are taken from the Kiwix library's
feed at the moment of download, because the files are rebuilt regularly.

Every direct entry carries the exact size and the SHA-256 checksum of the file as it was
on the day it was verified. Publishers replace PDFs in place from time to time (every OpenStax PDF checked had
been rebuilt during 2026, and agencies issue corrected editions under the same
address). When that happens the checksum no longer matches, the download is
refused with a clear message, and nothing is added to the library. A maintainer then
downloads the new file, checks it, and updates the entry's `sha256`, `sizeBytes`,
`version` and `lastVerified`. This is deliberate: a file that differs from the one that
was checked should not arrive silently.

## What was verified on 2026-11-15, and how

- **Kiwix entries.** Every book name and edition in `kiwix-more` was taken from a copy
  of the Kiwix library's full feed (3,655 books) saved that day. Descriptions were
  written from the titles and summaries in the feed. Sizes are the feed's figures,
  rounded, and are estimates until Outpost resolves the book.
- **Direct entries.** Each file was downloaded once from the address in the manifest,
  confirmed to be a real PDF and not a web page, measured and hashed. The title, page
  count, edition and date were read from the file. The licence was read from the file,
  the publisher's page or the publisher's catalogue record. About 3.1 GB was downloaded
  in all, across 61 files; the large files were deleted once hashed.
- **Addresses** were taken from the publishers' own pages or catalogue services (the FAA
  handbooks page, OpenStax's catalogue, the Ready.gov publications page, the NCHFP
  guide pages, the National Weather Service brochures page, the NASA Technical Reports
  Server, the USGS Publications Warehouse, the UIAA medical advice page). FAO documents
  were requested by document code and WHO records by record number; in both cases the
  title was confirmed from what came back before anything was used.
- **The validator.** `node apps/server/src/cli/validate-catalog.ts` passes, and with
  `--online` all 220 entries resolve at their source (checked again after the radio
  sources were added).
- **Conduct.** Requests were made one at a time with a generic client name and no
  personal information. `robots.txt` was read where present, and the ten-second crawl
  delay that the WHO and FAO repositories ask for was kept between downloads. The
  validator's online check keeps the same ten seconds between requests to any one
  host. A catalogue refresh in the app does not contact these publishers at all: every
  direct entry pins its size and checksum, and the download itself is the check. Hosts that
  refused the client (gutenberg.org, fema.gov, cdc.gov) were left alone after one or
  two requests, and nothing was done to get round the refusal. No search pages were
  crawled and no site was scraped.

## What was added on 2026-11-15 for radio, and how

- **Reference sheets.** Nine sheets were written for Outpost from the regulators' and
  bodies' own documents; [radio.md](radio.md) lists the sources of each, what could not
  be verified, and what the second reading of each table found.
- **Direct entries.** Thirty-three PDFs (about 38 MB in all) were downloaded once each from
  the address in the manifest, confirmed to be real PDFs, measured and hashed; the title,
  edition and date were read from each file. Ofcom's addresses are written without the
  `?v=` number its website adds, and redirect to the current file; when Ofcom replaces a
  document the checksum stops matching and the entry needs checking again.
- **Kiwix.** The library's feed was asked for a handful of subject words (radio,
  electronics, antenna, Morse, meteorology, weather, signal, and a few neighbours), one
  request at a time. Nothing on antennas, Morse or meteorology is published there beyond
  the archives already listed.
- **The validator.** After these additions `node apps/server/src/cli/validate-catalog.ts`
  passes, and with `--online` all 220 entries resolve at their source (the nine bundled
  sheets resolve by being present on disk).
- **Conduct.** As before: one request at a time, a generic client name, no personal
  information, `robots.txt` read first. Hosts that refused the client (navcen.uscg.gov,
  fcc.gov, nrc.canada.ca, acma.gov.au) were left alone after one or two requests; armypubs.army.mil
  and the eCFR interfaces were not used because their `robots.txt` says no; nothing was
  done to get round any of these. Search engines were used to find publishers' pages;
  no publisher's own search pages were crawled.

## What was added on 2026-11-16, and how

- **What was asked for.** More sources worth having offline, each one fetched and
  checked the same day, and nothing listed whose licence statement could not be read
  at the publisher. 75 entries were added: 48 PDFs and 27 Kiwix archives (three of the PDFs, the Ordnance Survey guides, were then taken out again, leaving 72). One of them,
  U.S. Chart No. 1, rests on being a work of the US Government with no separate
  statement read; its entry says so.
- **Direct entries.** Each file was downloaded once from the address in the manifest
  with Outpost's own client name, confirmed to be a real PDF, measured and hashed; the
  title, page count and edition were read from the file, and what each description
  says the document covers was checked against the file's text or the publisher's page. About
  770 MB was downloaded in 58 requests for files; the large ones were deleted once
  hashed. Forty-eight became entries and ten were left out, for the reasons given in
  the tables above.
- **Addresses** were taken from the publishers' own pages or services: the Met Office
  factsheets page, each HSE publication's page, GOV.UK's content service, the OS
  teaching resources page, each Department of Energy handbook's page, OpenStax's
  catalogue, the contents page of each Lessons In Electric Circuits volume, the WNDW
  home page, the NOAA Chart No. 1 page, the Space Weather Prediction Center's scales
  page, the USGS Publications Warehouse and Ofcom's EMF guidance page. Search engines
  were used to find those pages; no publisher's own search was used.
- **Kiwix.** The library's English feed was fetched once (1,309 books). Names, editions
  and sizes come from that copy. For each publisher that is not Stack Exchange or
  Wikimedia, the licence was read on the publisher's site or in its repository.
- **Dropped after checking.** Three files that passed every check by hand are not
  listed because the online check cannot confirm them (next section). One Met Office
  factsheet has no readable text. One Weather Service sheet may not be its own work.
- **The validator.** `pnpm catalog:validate` passes, and with `--online` all 311 (308 since the three Ordnance Survey guides were taken out)
  entries resolve at their source.
- **Conduct.** One request at a time, `robots.txt` read first for every new host, at
  least two seconds between requests to one host and more where asked. Hosts that
  refused (cdc.gov, stacks.cdc.gov, fema.gov, phmsa.dot.gov, nwcg.gov, fsis.usda.gov,
  spherestandards.org, ifrc.org, nrc.canada.ca, noaa.gov's disclaimer page) or failed
  (msi.nga.mil, fpl.fs.usda.gov) were left alone after one or two requests, and nothing
  was done to get round a refusal. One mistake: a faulty script sent ten requests to
  the Met Office for an address with no file name, which answered "not found" each
  time, before the ten factsheets were fetched properly. Project Gutenberg was asked
  for `robots.txt` and its policy page only, and for nothing after the policy was read.

### What the online check cannot express

The online check asks each address with `HEAD`, and falls back to asking for the first
byte only when the answer is an error other than "not found". Two publishers answer
`HEAD` with "404 Not Found" for a file they serve normally:

- **nvlpubs.nist.gov** (NIST's publications server) did so both times it was asked. NIST Special
  Publications 330 and 811 were downloaded, hashed and their terms read
  ([NIST's statement](https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications)
  says works by its employees are not subject to copyright in the United States and
  grants a worldwide right to reprint them), and they are not listed.
- **The Met Office's file service** does so for the Thunderstorms factsheet until an
  ordinary request has put the file in its cache, then answers "200" for some
  minutes. The other eight factsheets answered `HEAD` correctly from cold.

An ordinary request for each of the three succeeds. They were left out rather than
listed with a check that fails. Treating "not found" on `HEAD` as
a reason to ask for the first byte would admit them; that is a change to the server's
code and was not made here.
## What was read on 2026-11-16 for repeaters, and how

- **Terms first.** For each publisher its `robots.txt` was read before anything else,
  then the page that offers the data and the pages that state terms. Requests were made
  one at a time with a generic client name and no personal information.
- **Three files, once each.** Three of the ETCC's CSV files were fetched to learn their
  headings (about 280 kB in all), ten seconds or more apart as its `robots.txt` asks.
  They were kept outside the repository and deleted. Nothing else that is a list of
  repeaters was downloaded from anyone.
- **Not read.** RepeaterBook's API was not called. Open Repeater's API was not called.
  The ACMA's register was not downloaded. SRAL's page could not be read. BrandMeister,
  EchoLink, AllStarLink, IRLP and RadioID were looked for with a search engine and not
  visited.
- **How the pages were read.** The `robots.txt` files, Open Repeater's downloads page
  and the three CSV files were read byte for byte. The other pages were read through a
  tool that fetches a page and returns extracts from it; the quotations above are as it
  returned them, and are worth a second look by eye before anything is built on one.
- **What a search engine said is marked as that.** Three statements above come from a
  search result's extract and not from the page itself (SRAL's sentence, how often the
  ACMA's file is remade, and the count of repeaters mapped in OpenStreetMap); each says
  so.
- **The line about who may use a repeater** shown on the repeater screens was checked
  against Ofcom's own documents, fetched again that day and matching the checksums in
  `radio.json`: the licence conditions (a repeater "may be operated (but not controlled)
  by other radio amateurs", and its keeper "takes all reasonable steps to ensure that
  the Repeater is only used by an Amateur") and the guidance for licensees, section
  4.5.3 (a keeper's remedies for misuse include "restricting access to the station to
  certain licensees").

## What was read on 2026-11-16 for the repeater sources, and how

The second sitting, for the sources by country.

- **`robots.txt` first, one request, by a program that says what it is.** Seventeen
  were asked for at once, and repeate.rs's afterwards, with the client name "repeater-list-reader/1.0 (reading terms; one
  request per file)". Eleven answered with rules, four sites have none (HTTP 404), one
  redirected and was not followed, and one connection failed (the ACMA's). The project
  is not named in that client name; what Outpost itself sends when it fetches a list
  is "Outpost/&lt;version&gt;" with the project's address.
- **ukrepeater.net was asked twice and refused twice**, as its row says. It was not
  asked a third time, and nothing was tried to get past the refusal: no other client
  name, no browser.
- **Then the page that offers the data, and the page that states terms.** One request
  each. These were read byte for byte, with the markup stripped by a script; the
  quotations above are from those bytes.
- **Three files were fetched, once each, to learn their layouts**: Hearham's JSON
  (9.6 MB), the IRTS's CHIRP file (4.5 kB) and the WIA's CSV (68 kB). Each is offered
  by its publisher at the address it was fetched from. They were kept outside the
  repository and described by their shape (field names, forms of value, counts); the
  tests use made-up stations in the same shapes.
- **Requests per site** were at most five, except automatic.sral.fi, which took seven
  because its pages are empty until a script fills them; that is said in its row.
- **Not read.** RepeaterBook's API, Open Repeater's API, the SRAL's API and the ACMA's
  register were not called or downloaded. RepeaterBook's and Open Repeater's pages
  were not read again beyond `robots.txt`; what is said of them is from the first
  sitting. No privacy policy was read.
- **Three searches** were made for Germany, the Netherlands and Japan and found
  nothing to build on. Countries with many amateurs that were not looked at at all:
  the United States beyond the worldwide sources, Canada, Spain, Italy, France,
  Thailand, South Korea, China, Russia, Brazil, New Zealand.
- **Not walked through.** The steps the screen gives for RepeaterBook and for the
  SRAL's site were written from what their terms and scripts say, not by doing them
  in a browser. The steps for ukrepeater.net and the WIA are from the pages as read.

## Sources that are not integrated: what you can do

- **Import a repeater list you obtained.** See [radio.md](radio.md#repeaters). Outpost
  fetches a list only from the publishers the table above marks **fetch**; for the
  rest the Repeaters screen gives the page and the steps.
- **Add your own files.** Download the file yourself from the source, on terms you are
  satisfied with, and add it under **Library → Add documents**. It is stored on your
  disk, indexed for search, and opens in the built-in viewer like any other document.
  This is the right route for Internet Archive items, single Project Gutenberg books,
  CDC and FEMA guides, Hesperian's books, the Sphere Handbook, and anything you hold a
  licence for.
- **Contribute a manifest entry.** If a publisher offers a stable address for a file
  and a licence that allows free download, it can be listed. The format, the rules and
  the checks to run are in [`catalog/README.md`](../catalog/README.md). You can also
  keep a manifest of your own in `<data directory>/catalog/` without sending it to
  anyone.
- **Use the Kiwix archive.** Many websites that offer no downloadable file are
  packaged by Kiwix. Any book in the [Kiwix library](https://library.kiwix.org) can be
  listed by name in a manifest.

## Geofabrik extracts, and what Outpost uses instead

Geofabrik publishes OpenStreetMap data as `.osm.pbf` files: the raw points, lines and
tags of the map for a country or region. A map cannot be drawn from such a file
directly. It first has to be turned into tiles by a tile-generation program, which
takes time and memory for anything larger than a small region. Outpost does not
include that step, so a Geofabrik extract cannot be added to the map as it
stands.

Outpost uses data that has already been through that step:

- **Map tiles** come from the [Protomaps](https://protomaps.com) build of the whole
  OpenStreetMap planet, published as one PMTiles archive. The Maps screen downloads
  only the part you ask for (a rectangle and a range of zoom levels) and saves it as a
  region. The underlying data is the same OpenStreetMap data that Geofabrik
  distributes, under the same Open Database Licence.
- **The world outline** and the boxes of the country presets come from Natural Earth.
- **Place names** for offline search come from GeoNames.

If you already make your own tiles from a Geofabrik extract, you can point Outpost at
any PMTiles archive that follows the Protomaps basemap schema. See
[maps.md](maps.md) for regions, credits and using your own map source.
