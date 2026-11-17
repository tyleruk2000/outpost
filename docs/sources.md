# Sources for the catalogue

This page lists the information sources that have been considered for Outpost's
catalogue, says what Outpost does with each one, and gives the reason wherever a source
is not used. It was last checked on 2026-11-16; the rows for FEMA and the CDC were checked again on 2026-11-17.

The catalogue itself lives in [`catalog/manifests/`](../catalog/manifests):

| Manifest | What it holds | Entries |
| --- | --- | --- |
| `kiwix-essentials.json` | A starter selection of archives from the Kiwix library | 61 |
| `kiwix-more.json` | Further Kiwix archives: programming documentation, more Project Gutenberg shelves, medical and science references, courses, talks, preparedness, and more question-and-answer sites | 89 |
| `official-publications.json` | Individual PDF handbooks, guides, leaflets and textbooks, each fetched from its publisher's own website | 107 |
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
| 3 | Project Gutenberg (gutenberg.org) | Public-domain books | **Via Kiwix: 9 entries.** Seven shelves and the complete English library in `kiwix-more` (medicine, agriculture, technology, science, geography and recreation, naval science, military science, everything), one shelf in `kiwix-essentials`. **No direct entries, by decision.** On 2026-11-15 www.gutenberg.org answered every request with "403 Forbidden". On 2026-11-16 it answered, and its [robot access policy](https://www.gutenberg.org/policy/robot_access.html) was read: the website "is intended for human users only", automated tools are blocked, and the exceptions are for people who mirror or harvest the collection. It also says the generated formats (EPUB among them) "are re-built monthly". An entry that had Outpost fetch a book from the website would go against the first statement, and its pinned checksum would stop matching every month, so none is listed and nothing further was fetched. On 2026-11-17 the site answered 503 (Service Unavailable) with a retry-after of an hour, was not asked again, and the decision stands. A single book is best downloaded in a browser and added under Library. | Entries are marked "Public domain in the United States", as Project Gutenberg describes its books. `robots.txt` (read 2026-11-16) disallows only the search pages; the policy page is what rules out automated downloads. |
| 4 | OpenStax (openstax.org) | Peer-reviewed college textbooks from Rice University | **Direct: 15 entries** in `official-publications` (Anatomy and Physiology 2e, Microbiology, Clinical Nursing Skills, Biology 2e, Chemistry 2e, College Physics 2e, Astronomy 2e, Precalculus 2e, Introductory Statistics 2e; and, added on 2026-11-16, University Physics Volume 2, Calculus Volume 1, Prealgebra 2e, Pharmacology for Nurses, Additive Manufacturing Essentials and the high-school Physics). The PDF addresses come from OpenStax's own catalogue. The Kiwix library has no OpenStax archive. | CC BY-NC-SA 4.0. This is stated inside each PDF and in the licence fields of [OpenStax's catalogue](https://openstax.org/apps/cms/api/v2/pages/207/). Note that this is a non-commercial licence, not CC BY. The one exception listed is the high-school *Physics*, which its own copyright page and the catalogue give as CC BY 4.0. For the five other books added on 2026-11-16 the licence was taken from the catalogue; each file was seen to say its content is under a Creative Commons licence, and was deleted before the full line was copied down. |
| 5 | Internet Archive (archive.org) | A very large archive of books, recordings, software and web pages | **Add your own files.** Not in the catalogue: rights differ from item to item, so no general entry would be honest. | The [terms of use](https://archive.org/about/terms) page is drawn by a script and could not be read by the catalogue check. Read the rights statement on each item. |
| 6 | NASA (nasa.gov) | The US space agency | **Direct: 2 entries** from the NASA Technical Reports Server (NASA Systems Engineering Handbook; Fastener Design Manual). **Via Kiwix: 2 entries** in `kiwix-more` (Astronomy Picture of the Day; TED talks about NASA). | Each [Technical Reports Server record](https://ntrs.nasa.gov/api/citations/20170001761) gives the document's copyright status; both documents are marked as public use permitted. Astronomy Picture of the Day [says](https://apod.nasa.gov/apod/lib/about_apod.html) that NASA images are in the public domain but that some pictures are copyrighted by the people credited. |

### Survival and preparedness

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 7 | Ready.gov | The US government's public preparedness campaign, run by FEMA | **Direct: 4 entries** (Are You Ready?; the full set of hazard information sheets; Emergency Supply List; Disaster Preparedness Guide for Older Adults). **Via Kiwix: 1 entry** in `kiwix-essentials` (the whole site). | The [publications page](https://www.ready.gov/publications) says the files may be downloaded at no cost and reproduced, provided nothing is altered and no endorsement is implied. |
| 8 | FEMA (fema.gov) | The US Federal Emergency Management Agency | **Direct: 7 entries** (changed 2026-11-17): Planning Guidance for Response to a Nuclear Detonation (Third Edition); Taking Shelter from the Storm (FEMA P-320, December 2024); and the five *Protect Your Property* brochures (earthquakes, flooding, severe winds, storm surge, wildfires). On 2026-11-15 and 2026-11-16 www.fema.gov answered with HTTP 403 and nothing there was fetched. On 2026-11-17 it answered Outpost's own client, unchanged, with 200; `robots.txt` was read (it asks for `crawl-delay: 15` and disallows `/disaster/*`, search and the non-English paths) and every request to the host was at least 15 seconds after the last. **Left out:** the CERT Basic Training participant manual, because neither FEMA's CERT page nor Ready.gov's (which now redirects to it) links a copy, and Earthquake Safety at Home (FEMA P-530), because it was prepared by a contractor and some 40 of its photographs and graphics are credited to outside people and bodies. See [the 2026-11-17 section](#what-was-added-on-2026-11-17-for-cdc-and-fema-and-how). FEMA publications hosted on Ready.gov are covered by source 7. | The [website information page](https://www.fema.gov/about/website-information) (read 2026-11-17, last updated 1 May 2023): "Most material on FEMA.gov is free of copyright and may be copied and distributed without permission." It says FEMA sometimes uses licensed or restricted photos or graphics, to be checked for a copyright notice or photo credit, and that the DHS seal and marks have their own rules. |
| 9 | Survivor Library (survivorlibrary.com) | A private collection of scanned older books on pre-industrial skills | **Not in the catalogue.** It is a third party's collection of other people's works, and the site's home page states no licence for the scans. Kiwix does publish the site as an archive (`survivorlibrary.com_en_all`, about 220 GB); it has been left out until someone has checked the rights. | No licence statement found on the [home page](https://www.survivorlibrary.com/). |
| 10 | TruePrepper survival PDF collection | A preparedness website's page of downloadable manuals | **Not in the catalogue.** The page re-hosts manuals written by other publishers. The site says it will not infringe copyrights but gives no licence for the individual files, and the site itself is marked "All rights reserved". Where a manual has an official publisher (FEMA, the US Army, the FAA), the catalogue points at that publisher instead. Kiwix publishes the site's own articles as `trueprepper.com_en_all` (about 1.4 GB); it has been left out for the same reason. | [The page](https://trueprepper.com/survival-pdfs-downloads/): "All rights reserved". |

### Medicine and food

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 11 | CDC (cdc.gov) | The US Centers for Disease Control and Prevention | **Direct: 8 entries** (changed 2026-11-17), one-page sheets: Make Water Safe During an Emergency; Water treatment while hiking, camping, and traveling; Eat Safe Food after a Power Outage; Emergency Wound Care After a Natural Disaster; Preventing Diarrhea After A Disaster; Heat-Related Illnesses; Carbon Monoxide Hazard: Using a Generator; Wash Your Hands. **Via Kiwix: 1 entry** in `kiwix-essentials` (Travelers' Health). On 2026-11-15 and 2026-11-16 www.cdc.gov and stacks.cdc.gov answered with HTTP 403. On 2026-11-17 www.cdc.gov answered Outpost's own client, unchanged, with 200; `robots.txt` was read (it disallows `/travel/`, `/flu/espanol/`, `/migration/`, `/niosh/archive/` and template paths, none of which is used). stacks.cdc.gov was not asked again and nothing is listed from it. **Left out:** Extreme Cold: A Prevention Guide, because its old page is gone (404) and the current winter weather pages link no PDF. | The [Use of Agency Materials page](https://www.cdc.gov/other/agencymaterials.html) (read 2026-11-17): "Most of the information on the CDC and ATSDR websites is not subject to copyright, is in the public domain, and may be freely used or reproduced without obtaining copyright permission." Conditions: credit CDC, imply no endorsement, do not change the substantive content, and say the material is available on the agency's website at no charge. Exceptions: material by contractors, grantees or third parties (which should carry a copyright statement), and the CDC logo. None of the eight sheets carries a copyright statement or outside credit. |
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
| R6 | NIST (nist.gov) | The US national standards laboratory, which runs WWV, WWVH and WWVB | **Direct: 2 entries** in `radio` (Special Publication 432, NIST Time and Frequency Services, 2012; Special Publication 250-67, NIST Time and Frequency Radio Stations, 2005). **Read for the sheets**: the three station pages. **Direct: 1 entry** in `official-publications`, added later on 2026-11-16 once the online check could confirm it: Special Publication 811 (Guide for the Use of the SI, 2008). **Not listed:** Special Publication 330 (The International System of Units, 2019). It was fetched again and read: it is the United States version of the English text of the SI Brochure of the International Bureau of Weights and Measures, and carries a note from that body that all its works are protected by copyright and that the document was drafted with its permission. NIST's statement covers works its own employees wrote and says works by third parties may be in copyright, so no licence that lets the text be reused was read; see [the check and these three files](#what-the-online-check-could-not-express-and-now-can). | Works of the US Government, for what NIST's employees wrote: its [statement](https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications), read on 2026-11-16, says such works are not subject to copyright protection within the United States and grants a worldwide right to reprint them, and that some works NIST publishes were written by third parties and may be in copyright. |
| R7 | Maritime and Coastguard Agency (gov.uk) | The UK agency responsible for maritime safety information | **Direct: 3 entries.** In `radio`: Maritime Safety Information Leaflet, Advice Note 1033, January 2026; and, added on 2026-11-16, GMDSS: The Benefits of Digital Selective Calling. In `official-publications`: Life Saving Signals (added 2026-11-16). **Read for the sheets**: the leaflet, the GOV.UK page on 406 MHz beacons, and (2026-11-16) MGN 324 (M+F) Amendment 2 on the use of VHF. | [GOV.UK](https://www.gov.uk/government/publications/advice-note-1033-maritime-safety-information-msi-leaflet) says its content is under the Open Government Licence v3.0 "except where otherwise stated"; the leaflet's maps and one diagram are marked "All rights reserved", and the entry says so. |
| R8 | IARU (iaru.org, iaru-r1.org, iaru-r2.org) | The International Amateur Radio Union and its regional organisations | **Direct: 7 entries** in `radio` (Ethics and Operating Procedures for the Radio Amateur, 4th edition; Region 1 HF and VHF band plans; Region 2 band plan; Region 3 band plan; Emergency Telecommunications Guide; Amateur and Amateur-satellite Service Spectrum). **Read for the sheets**: the same documents and the emergency frequencies page. | The operating guide states CC BY-SA 4.0 inside the file. The band plans, the emergency guide and the spectrum summary state no licence, and the website says its materials "may be subject to copyright", so those six entries say "See source". |
| R9 | ITU (itu.int) | The UN agency for telecommunications | **Not in the catalogue.** Recommendations M.1677-1 (Morse code) and M.1172 (Q code) were **read for the sheets**; both are marked "All rights reserved. No part of this publication may be reproduced ... without written permission of ITU". The Radio Regulations themselves were not read. **The P.533 software and its maps** (github.com/ITU-R-Study-Group-3/ITU-R-HF, Study Group 3's repository, commit `82017594a1c6`): not in the repository or the packaged app; the HF planner's optional second model fetches the 25 map files from that repository's `P372/Data/` (137 MB) when a person asks, and the person builds the engine from its source. See [hf-propagation.md](hf-propagation.md#the-second-models-terms). **VOACAP's CCIR-derived coefficients** (CCIR Reports 322 and 340), shipped until 2026-11-16 on the strength of the first statement in the next column, are no longer in the repository or the packaged app because of the second; see source 37. | All rights reserved. For the P.533 software: no licence file; "may be used by implementers in their implementation of the Recommendation ... free from any copyright assertions", and headers that say "All rights reserved. No part of this publication may be reproduced, by any means whatsoever, without written permission of ITU". |
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
| N1 | Met Office (metoffice.gov.uk) | The UK's national weather service | **Listed: 9 entries** in `official-publications`, factsheets of its National Meteorological Library and Archive (1 Clouds, 2 Thunderstorms, 4 Climate of the British Isles, 6 The Beaufort Scale, 8 The Shipping Forecast, 10 Air masses and weather fronts, 11 Interpreting weather charts, 14 Microclimates, 15 Weather radar). **Left out:** factsheet 3 (Water in the atmosphere), whose text cannot be extracted from the file, so it could not be read or searched. Factsheet 2 was first left out because its address answers `HEAD` with "404" until an ordinary request has warmed the publisher's cache, and was added later the same day ([see below](#what-the-online-check-could-not-express-and-now-can)). | The [factsheets page](https://www.metoffice.gov.uk/research/library-and-archive/publications/factsheets) says all information originating from the Met Office is Crown copyright and available under the Open Government Licence. Photographs credited to named people or other bodies are not covered; the entries say so. |
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
| 23 | Geofabrik downloads (download.geofabrik.de) | Regional extracts of raw OpenStreetMap data, updated daily | **Not integrated for map tiles.** The extracts are raw data, not tiles. See [the note below](#geofabrik-extracts-and-what-outpost-uses-instead). Since 2026-11-16 they are read for the reference layers (R4). | [ODbL 1.0](https://download.geofabrik.de/); the service is offered free of charge by Geofabrik. |
| 24–25 | Natural Earth | Public-domain map data at small scales | **Built in.** The 1:110m data draws the simple world outline beneath the map and the boxes of the country presets. | Public domain, as recorded in [maps.md](maps.md). The Natural Earth terms page did not answer on the day (two time-outs), so it was not read again. |
| 26 | USGS (usgs.gov) | The US Geological Survey | **Direct: 4 entries** (Topographic Map Symbols; Finding Your Way with Map and Compass; Map Projections: A Working Manual; and, added on 2026-11-16, The Universal Transverse Mercator (UTM) Grid). USGS map and elevation data are not integrated. | The Publications Warehouse [says](https://pubs.usgs.gov/documentation/faq) that PDF files of USGS-published reports are in the public domain, though some illustrations are used with permission. The main usgs.gov site returned an empty page to the catalogue check. |
| 27 | NASA Earthdata Search | A search tool over NASA's Earth-observation datasets | **Not integrated.** It is an interactive search over scientific data files, not a set of documents or map tiles; nothing in it is a single stable file that the library or the map could use as it stands. | NASA's [data use guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance) says the data are freely accessible and asks for citation. |

### Satellite imagery

Read on 16 November 2026. Nothing below is bundled with Outpost: each picture is
fetched from its publisher when a person asks for it (see
[maps.md](maps.md#satellite-imagery)).

| Source | What it is | How Outpost uses it | Licence and terms, in the publisher's words |
| --- | --- | --- | --- |
| NASA Blue Marble: Next Generation | Monthly cloud-free composites of the whole world for 2004, at 500 m | **Built in, downloaded on request.** July 2004, from the 2 km single GeoTIFF (255,799,706 bytes) or the eight 500 m GeoTIFFs (3,259,890,999 bytes), at `assets.science.nasa.gov`. | [The Blue Marble page](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/): "Blue Marble: Next Generation was produced by Reto Stöckli, NASA Earth Observatory (NASA Goddard Space Flight Center)." and "Anyone using or republishing Blue Marble: Next Generation please credit “NASA Earth Observatory.”" [NASA's media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/): NASA content "generally are not subject to copyright in the United States. You may use this material for educational or informational purposes, including photo collections, textbooks, public exhibits, computer graphical simulations and Internet Web pages." "NASA should be acknowledged as the source of the material." "If the NASA material is to be used for commercial purposes, including advertisements, it must not explicitly or implicitly convey NASA’s endorsement of commercial goods or services." The old Visible Earth "image use policy" addresses now lead to a page without one. |
| Copernicus Sentinel-2, Level-2A, Collection 1 | Surface reflectance at 10 m, every few days, from 2015 | **Built in, for areas chosen on the map.** Scenes found with [Earth Search](https://earth-search.aws.element84.com/v1) (collection `sentinel-2-c1-l2a`); only the parts of the red, green, blue and scene-classification files that cover the area are fetched, from `e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com`. | [Legal notice on the use of Copernicus Sentinel Data and Service Information](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice): "the law provides that users shall have a free, full and open access to Copernicus Sentinel Data and Service Information without any express or implied warranty, including as regards quality and suitability for any purpose." and "Where the Copernicus Sentinel Data and Service Information have been adapted or modified, the user shall provide the following notice: (1) 'Contains modified Copernicus Sentinel data [Year]' for Sentinel data". The [AWS Open Data registry](https://registry.opendata.aws/sentinel-2-l2a-cogs/) lists both buckets in us-west-2 under "Access (No AWS account required)", with no requester-pays; its licence line reads "Access to Sentinel data is free, full and open for the broad Regional, National, European and International user community." |
| Element 84 Earth Search | The STAC catalogue of those files | One search per press of **Find pictures** (`POST /v1/search`). | Its [README](https://github.com/Element84/earth-search): "Earth Search is a free-to-use SpatioTemporal Asset Catalog (STAC) API" and "This public API does not come with any guaranteed service." No terms of use or numeric rate limit were found. Outpost sends one search per press and, for a build, at most four requests at once to the bucket, backing off on 429 and 503. |
| EOX Sentinel-2 cloudless ("EOxCloudless") | A cloud-free 10 m mosaic, by year | **Not integrated.** See below. | [Licence page](https://cloudless.eox.at/license-non-commercial): "For the years 2018 to 2025, EOxCloudless WM(T)S layers is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License." and "For the year 2016, EOxCloudless is licensed under the Creative Commons Attribution 4.0 International License." [FAQ](https://cloudless.eox.at/documentation/faq): "2018+ Layers: No. Using the public WMS/WMTS endpoints for commercial production apps is strictly prohibited." and "2016 Layer: Commercial apps may access the free 2016 endpoint under CC BY 4.0, provided traffic is reasonable." Prices there: "starting at €1,500 excluding VAT per country/region"; "€5,000 excluding VAT per vintage"; "€6,000 excluding VAT (perpetual, one-off payment)". |
| USGS Landsat on AWS | 30 m imagery from 1982 | **Not integrated.** | The [registry page](https://registry.opendata.aws/usgs-landsat/) quotes USGS: "There are no restrictions on Landsat data downloaded from the USGS; it can be used or redistributed as desired." The bucket `usgs-landsat` is "Requester Pays": every download is billed to the downloader's AWS account. The USGS's own FAQ page refused automated reading on the day, so its wording was not read there. |
| Copernicus Data Space Ecosystem | ESA's own catalogue and archive | **Not used.** Its catalogue answers without an account, but files need one: "For downloading products you need an authorization token as only authorized users are allowed to download data products." ([OData documentation](https://documentation.dataspace.copernicus.eu/APIs/OData.html)). Its products are JPEG 2000, not cloud-optimised GeoTIFFs. | |

**The EOX route, checked and set aside.** The brief asked for EOX's cloudless mosaic
through the person's own AWS account, from a requester-pays bucket. EOX's 2017 post
([eox.at](https://www.eox.at/2017/03/sentinel-2-cloudless-original-tiles-available/))
said: "The bucket uses the "requester pays" setting which means you need to access it
using your AWS credentials", "Bucket ID: eox-s2maps Region: eu-central-1". On 16
November 2026 `https://eox-s2maps.s3.eu-central-1.amazonaws.com/` answered
`NoSuchBucket`, and no current EOX page mentions a bucket. With no files to read and
the map service's terms not permitting bulk downloads for keeping, nothing was built.
What building it would need, were the files offered again: EOX's terms for keeping a
copy of the year chosen (only 2016 is CC BY 4.0); credentials kept in the operating
system's secret store and accepted only from the computer Outpost runs on; requests
signed with AWS Signature Version 4 by Outpost's own code; and before each download the
transfer in gigabytes, the number of requests, AWS's price for the bucket's region (the
price list read on 16 November 2026 gave 0.09 USD a GB out to the internet in both
eu-central-1 and us-west-2 after the first 100 GB a month, which AWS gives free across
all services) and a hard cap the job stops at.

**A finding about Earth Search's older collection.** In `sentinel-2-l2a` (bucket
`sentinel-cogs`) the values of many files do not agree with the scale and offset in
the metadata ([issue 71](https://github.com/Element84/earth-search/issues/71), open on
16 November 2026, with no reply from the maintainers). Outpost uses Collection 1, whose
values were checked against its metadata on a scene over Keswick.

### Aerial photographs

Read on 16 November 2026, from each publisher's own pages and, where a page could not
be read, from its files and catalogues; where a fact comes only from search results it
says so. What was built is described in [maps.md](maps.md#aerial-photographs). The test
for each: an open licence that allows keeping a copy; no account, key or payment; and a
form Outpost can read a small area of without downloading a large file
(Cloud-Optimised GeoTIFF, or a modestly sized GeoTIFF, read by range request).

| Source | Licence | Detail | Form | Verdict |
| --- | --- | --- | --- | --- |
| England: Environment Agency vertical aerial photography | Open Government Licence | 10 to 50 cm, project by project since 2006, patchy | ECW only, in 5 km zip files per survey year | **Cannot be built**: ECW needs a closed decoder; no open form is offered |
| Scotland: Scottish Remote Sensing Portal | Open Government Licence v3 | (LiDAR only) | (LiDAR only) | **Nothing to build**: it holds no aerial photographs |
| Wales: Welsh Government and Natural Resources Wales | APGB public sector licence, or internal use only | | | **Cannot**: not open |
| Northern Ireland: DAERA coastal orthophotography (OpenDataNI) | Open Government Licence (search results) | 10 cm colour infra-red, a 200 m strip of the coast, 2021 | ArcGIS image service | **Not built**: a viewing service, not files; the coast only; not colour |
| Great Britain: APGB | Licensed to the public sector | 12.5 to 50 cm | | **Out**: not open |
| New Zealand: LINZ | CC BY 4.0, credited to each survey's licensor | 5 to 30 cm by survey | COG, WebP, NZTM, public S3 bucket | **Built** |
| United States: USDA NAIP via Microsoft's Planetary Computer | Public domain | 30 cm, 60 cm, 1 m | COG, Deflate, NAD83 / UTM, Azure blob with an anonymous token | **Built** |
| United States: NAIP on AWS | Public domain | | COG, but requester-pays | **Cannot**: requester-pays bills an AWS account |
| Switzerland: swisstopo SWISSIMAGE 10 cm | Free geodata, use and distribution allowed, source must be named | 10 cm (25 cm over the Alps), 3-year cycle | COG, JPEG (YCbCr) 2017 to 2025, Deflate 2026; LV95 | **Could be built; not built**: needs a JPEG decoder and the Swiss projection |
| Netherlands: Beeldmateriaal Nederland | CC BY 4.0 | 8 cm (and 25 cm) | 1 km tiled GeoTIFF, JPEG (YCbCr), no overviews, RD New | **Could be built; not built**: JPEG decoder, Dutch projection; no reduced copies, so a coarse zoom reads the full photograph |
| France: IGN BD ORTHO | Licence Ouverte 2.0 | 20 cm | JPEG 2000 per département, in archives | **Cannot**: no small-area access in an open form Outpost reads |
| Spain: PNOA | CC BY 4.0 | 25 cm (15 cm in places) | COG through the CNIG download centre | **Not verified**: whether files can be had without registration was not confirmed |
| Finland: NLS orthophotos | CC BY 4.0 | 50 cm | TIFF with world file; interfaces need an API key | **Cannot without a key** |
| Estonia: Land and Spatial Development Board | Open data licence | 10 to 40 cm | GeoTIFF, ECW | **Not verified**: whether COG, the projection and any key were not confirmed |
| Norway: Norge i bilder | Licensed products | | WMTS | **Cannot**: copying needs the rights holders' permission |
| Denmark: Dataforsyningen orthophotos | "Free data" | | Services need a free account and token (search results) | **Cannot without an account** |

**England, in the Environment Agency's words.** Its record on the Defra Data Services
Platform ([environment.data.gov.uk](https://environment.data.gov.uk/dataset/dae203a8-ba24-4c54-bab0-866b9faadb58),
the same text on [data.gov.uk](https://www.data.gov.uk/dataset/4921f8a1-d47e-458b-873b-2a489b1c8165/vertical-aerial-photography)):
"Images of the ground are captured at resolutions between 10cm and 50cm, and
ortho-rectified using simultaneous LIDAR and GPS to a high spatial accuracy." "The
Environment Agency has been capturing vertical aerial photography data regularly since
2006 on a project by project basis each ranging in coverage from a few square
kilometers to hundreds of square kilometers." "The data is available as a raster dataset
in ECW (enhanced compressed wavelet) format as either a true colour (RGB), near
infra-red (NIR) or a 4-band (RGBN) raster." "Data is available in 5km download zip files
for each year of survey. Within each zip file are ECW files aligned to the Ordinance
Survey grid." The record's data format: "Proprietary format | ER Mapper (ECW)". Its
licence: "Open Government Licence", with the attribution "© Environment Agency
copyright and/or database right 2022. All rights reserved." Its dates run from
15 December 2005 to 1 August 2024. The only download offered is the Survey Data
download page, a zip of ECW files per 5 km square and year; the record's WMS and WFS are
of the index of surveys, not of the photographs. So the licence would allow an offline
copy, and the obstacle is the form alone: ECW is read by Hexagon's ECW SDK, which is
closed and not under a licence Outpost may use, and a small area cannot be had without
the whole 5 km zip. What would change it: the Agency publishing the same photographs as
GeoTIFF or COG. A person can convert the ECW
files themselves with desktop software that includes the SDK, but Outpost
does not yet import a GeoTIFF of one's own as imagery.

**Scotland.** The [Scottish Remote Sensing Portal](https://remotesensingdata.gov.scot/about):
"The portal currently contains Scottish Public Sector LiDAR data." and "All data is made
available under the Open Government Licence v3". No aerial photographs.

**Wales.** From search results of DataMapWales and Natural Resources Wales, not read on
the pages themselves: "APGB dates flown (Wales)" is under the "APGB - Aerial Photography
and Height Data Supply (APHDS) Public Sector End User Licence"; NRW's aerial imagery
record says "the licencing conditions mean that NRW can only use this data for internal
use". No open orthophoto download was found.

**Northern Ireland.** OpenDataNI's pages refused automated reading (403); from search
results only: the 2021 NI 3D Coastal Survey's colour infra-red orthophotography at 10 cm,
covering the coastline about 200 m inland, offered as an ArcGIS service, under the Open
Government Licence. Not built: a map service is for viewing, and it is the coast only.

**New Zealand.** The [AWS Open Data registry](https://registry.opendata.aws/nz-imagery/):
"Licensed for re-use under "CC-BY-4.0"."; LINZ "does not own the copyright for all of the
imagery … licensors are listed in each survey's STAC Collection"; the suggested credit is
"Licensed by (insert the licensor) for re-use under CC-BY-4.0."; access "No AWS account
required"; "Cloud Optimised GeoTIFFs … using lossless WEBP compression for the main image
and lossy WEBP compression for the overviews." The bucket's own
[catalog.json](https://nz-imagery.s3.ap-southeast-2.amazonaws.com/catalog.json): "This
public S3 bucket has been made available to enable bulk access and cloud-based data
processing." Each survey's description gives its licensor (for example "Environment
Canterbury", "Christchurch City Council"), extent, dates flown and ground sample
distance; Outpost credits the licensor of the survey used, as the registry asks. Files
were read anonymously over HTTPS with range requests (206).

**United States.** The [Planetary Computer's NAIP collection](https://planetarycomputer.microsoft.com/api/stac/v1/collections/naip):
"provides U.S.-wide, high-resolution aerial imagery, with four spectral bands (R, G, B,
IR)", "Data are captured at least once every three years for each state." and "This
dataset represents NAIP data from 2010-present, in cloud-optimized GeoTIFF format."; its
providers name the USDA Farm Service Agency as "producer" and "licensor". The licence
in USDA's own words, as written into every file (TIFF ImageDescription): "Imagery has
been placed in the public domain and may be used and reproduced without permission or
fee. Please credit 'NAIP imagery provided by USDA Farm Service Agency' on any use."
USDA's NAIP page did not answer on the day (it timed out twice), so that wording was not
read there. The Planetary Computer's documentation on tokens (from search results; its
pages are drawn by JavaScript and could not be read directly): "Anyone can get a token
from our Data Authentication API - you don't have to be a registered Planetary Computer
user to get an access token." Outpost asks `planetarycomputer.microsoft.com/api/sas/v1/token/naip`
for one when it first needs it, adds it to each file request, keeps it in memory until
five minutes before it lapses, and never stores it. A file request without it also
worked on the day, but the documentation says to use one. The
[AWS registry](https://registry.opendata.aws/naip/) lists its NAIP buckets as "Requester
Pays", so they are not used. No rate limit was published that could be read; Outpost
sends at most four file requests at once and backs off on 429 and 503.

**Switzerland.** [swisstopo's terms](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices):
"The free geodata and geoservices of swisstopo may be used, distributed and made
accessible." "Furthermore, they may be enriched and processed and also used
commercially." "A reference to the source is mandatory." The
[product page](https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10): for 2026
"Format: Cloud Optimized Geotiff (COG), RGBN (4 x 8 bit), DEFLATE compression", for
2017 to 2025 "Cloud Optimized Geotiff (COG), RGB (3 x 8 bit), JPEG95 compression";
"Coordinate systems: CH1903+ / LV95 (EPSG:2056)". Files at `data.geo.admin.ch`, found
through its STAC API, readable by range request with no key. The 2026 files would be
read today, but they cover only the part flown that year; the rest needs JPEG, and every
file needs the Swiss oblique Mercator on the Bessel ellipsoid with a datum shift. Not
built in the time.

**The Netherlands.** [Beeldmateriaal Nederland's dataroom](https://beeldmateriaal.nl/dataroom):
"De downloads worden aangeboden in een 1×1km index … U kunt de luchtfoto downloaden in
GeoTIFF-formaat." "De beelden worden beschikbaar gesteld met een CC BY 4.0 licentie."
"De data is beschikbaar op basis van self-service." The 8 cm tiles (about 40 MB each)
are JPEG in YCbCr with no reduced copies, in RD New (EPSG 28992), at
`fsn1.your-objectstorage.com`, range-readable with no key. PDOK's map tile service of the
same photographs is for viewing; no statement allowing it to be downloaded in bulk was
found, so it is not used.

**France, Spain, Finland, Estonia, Norway, Denmark.** IGN's
[BD ORTHO](https://www.data.gouv.fr/datasets/bd-ortho-r) is "Licence Ouverte / Open
Licence version 2.0", "à 20 cm de résolution", downloaded per département as JPEG 2000
from `data.geopf.fr`. Spain's PNOA record in the
[CODSI catalogue](https://www.idee.es/csw-codsi-idee/srv/api/records/spaignTrueOrto2025)
gives "Cloud Optimized GeoTIFF, COG", the credit "PNOA 2025 CC-BY 4.0 scne.es" and
"Descarga gratuita a través del centro de descargas del CNIG"; whether that centre's files
can be had without registration was not confirmed. Finland's
[NLS](https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/orthophotos):
"Attribution 4.0 International (CC BY 4.0)", "Pixel size 0.5 m", "Distribution format
Tiff (tfw)"; its [interfaces](https://www.maanmittauslaitos.fi/en/node/11149): "The open
interface works using an API key." Estonia's
[geoportal](https://geoportaal.maaruum.ee/eng/Spatial-Data/Orthophotos-p309.html):
"GeoTIFF, ECW", 10 to 40 cm, open data licence; form and access not confirmed. Norway's
[Kartverket](https://www.kartverket.no/api-og-data/vilkar-for-bruk): "Alle flybilete på
norgeskart.no og norgeibilder.no er lisensierte produkt." and "Det må imidlertid
innhentast særskild løyve frå rettshavarane dersom dataa skal kopierast eller brukast på
annan måte." Denmark's
[Klimadatastyrelsen](https://www.klimadatastyrelsen.dk/kortlaegning/flyfotos-og-laserscanning):
"Både kortprodukter og ortofotos udstilles via Datafordeleren og Dataforsyningen som frie
data."; the need for an account and token comes from search results.

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

### Reference layers

Added on 2026-11-16 with the map's reference layers ([reference-layers.md](reference-layers.md),
which quotes each source's terms in full and says how each is used). Every page was
read on that day; where a page could not be read, that is said. Rows are numbered R1
onwards.

| # | Source | How Outpost uses it | Licence and the terms that decide it |
| --- | --- | --- | --- |
| R1 | Natural Earth: 1:50m countries, 1:10m regions and populated places | **Downloaded on request**, GeoJSON from `raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/`. | Public domain: "All versions of Natural Earth raster + vector map data found on this website are in the public domain." ([terms](https://www.naturalearthdata.com/about/terms-of-use/)). No checksums published. |
| R2 | OurAirports | **Downloaded on request**: `airports.csv` from `davidmegginson.github.io/ourairports-data/`, and with it, in the same install, `airport-frequencies.csv` from the same folder (listed under the repository README's direct downloads; 1,302,744 bytes and 30,397 rows on 17 November 2026), of which only the kept airports' rows are stored. | The data repository's licence is the Unlicense ("released into the public domain"), and covers both files. ourairports.com itself could not be read: its certificate expired on 6 November 2026 and still had not been renewed on 17 November, so its own terms and data dictionary were not read. The frequency file's columns are taken from its own header row: `id`, `airport_ref`, `airport_ident`, `type`, `description`, `frequency_mhz`. |
| R3 | OpenStreetMap by Overpass | **Downloaded on request**, one layer of one country per question, through the servers of the route sources (T3), or one the person declares. | ODbL. **T2 (Private.coffee) is not used for reference layers**: its terms exclude "projects related to warfare, military applications", and these layers include publicly mapped military sites. |
| R4 | Geofabrik extracts | **Downloaded on request**, one country's `.osm.pbf` with its MD5; or imported. This replaces "not integrated" in row 23 for these layers: Outpost now reads the tags it needs from a `.osm.pbf` itself; it still makes no map tiles from one. | "License: ODbL 1.0"; "Download responsibly!" (10 September 2025). No numeric limit is published. |
| R5 | Wikidata Query Service | **Asked on request**: nuclear power stations and research reactors with a position. | CC0; 60 seconds a query; an informative User-Agent with contact information. |
| R6 | WorldPop, population counts 2020, 1 km, UN-adjusted | **Downloaded on request**, by country. | CC BY 4.0 ([licence](https://hub.worldpop.org/data/licence.txt)); the citation WorldPop asks for is shown. |
| R7 | Swiss emergency meeting points (BABS) | **Downloaded on request**: one GeoJSON file. | opendata.swiss "terms_by" (open use, source to be given) as the dataset lists it; the opendata.swiss terms page refused to be read. |
| R8 | FAS Nuclear Notebook and Status of World Nuclear Forces | **Linked.** | "Federation of American Scientists © 2026"; the Bulletin of the Atomic Scientists' terms forbid automated extraction "regardless of whether the data is publicly accessible". |
| R9 | SIPRI Yearbook, World nuclear forces | **Linked.** A person may save the free summary or sample chapter. | Downloading for non-commercial use and single private copies are allowed; reproducing more than 10% of a data set needs permission. |
| R10 | NTI Index | **Linked.** | Not read (browser check; terms page refused). |
| R11 | IAEA PRIS | **Linked.** | Not read (402/403 on every terms page). |
| R12 | GeoNuclearData, WRI Global Power Plant Database, Global Energy Monitor | **Not used.** | Upstream terms unread; unmaintained since 2022; "All Rights Reserved". |
| R13 | National Security Archive, EBB 538; FEMA NAPB-90 (at FAS); The National Archives, HO 322 | **Linked.** No machine-readable transcription under an open licence exists; Outpost transcribed none. | US government works are public domain; the Archive's pages are its copyright; the UK files are not digitised. |
| R14 | UK REPPIR zones, US EPZs, Swiss ENSI zone plans, cantonal shelter files, Taiwan and Korea shelter data | **Linked or imported** by the person. | See [reference-layers.md](reference-layers.md#emergency-planning-zones-and-shelters). |

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
| 37 | hfcast-engine (github.com/jonathanmcsweet/hfcast-engine) | VOACAP translated to Rust, and the engine's data files in `embedded/` | The HF planner's engine is built from it at commit `bf34e8f9f375` (shipped, Apache-2.0). **Its coefficient files are not shipped**: 13 files holding the CCIR Report 322 and 340 maps, with NTIA/ITS tables, and two short-whip patterns, 559 kB, listed in `engines/voacap/coefficients.json` and fetched from `raw.githubusercontent.com` at that commit, one request per file, only when a person presses Download (or at set-up by `scripts/fetch-voacap-data.mjs`). Checked on 2026-11-16: each file there is byte for byte the one Outpost shipped before. See [hf-propagation.md](hf-propagation.md#data). | Code: Apache-2.0. The data files: no licence; its `NOTICE` says "Apache-2.0 covers the software in this repository. It does not cover these data files, which are the work of other bodies and keep their own status." The CCIR part is the ITU's (source R9). |

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
  two requests, and nothing was done to get round the refusal. (fema.gov and cdc.gov
  answered the same client on 2026-11-17; see below.) No search pages were
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
- **Dropped after checking.** Three files that passed every check by hand were not
  listed because the online check could not confirm them; two have since been added
  (next section). One Met Office
  factsheet has no readable text. One Weather Service sheet may not be its own work.
- **The validator.** `pnpm catalog:validate` passes, and with `--online` all 311 (308 since the three Ordnance Survey guides were taken out)
  entries resolve at their source.
- **Conduct.** One request at a time, `robots.txt` read first for every new host, at
  least two seconds between requests to one host and more where asked. Hosts that
  refused (cdc.gov, stacks.cdc.gov, fema.gov (cdc.gov and fema.gov answered on 2026-11-17), phmsa.dot.gov, nwcg.gov, fsis.usda.gov,
  spherestandards.org, ifrc.org, nrc.canada.ca, noaa.gov's disclaimer page) or failed
  (msi.nga.mil, fpl.fs.usda.gov) were left alone after one or two requests, and nothing
  was done to get round a refusal. One mistake: a faulty script sent ten requests to
  the Met Office for an address with no file name, which answered "not found" each
  time, before the ten factsheets were fetched properly. Project Gutenberg was asked
  for `robots.txt` and its policy page only, and for nothing after the policy was read.

### What the online check could not express, and now can

The online check asks each address with `HEAD`. It used to fall back to asking for the
first byte only when the answer was an error other than "not found", and two publishers
answer `HEAD` with "404 Not Found" for a file they serve normally: nvlpubs.nist.gov
(NIST's publications server), and the Met Office's file service until an ordinary
request has put the file in its cache. Three files that had been checked by hand were
left out for that reason alone.

The check now asks for the first byte whenever `HEAD` is refused, "not found" included,
and takes only that second answer as the file being gone
(`apps/server/src/modules/catalog/resolve.ts`). The three were then looked at again,
later on 2026-11-16. `robots.txt` was read for each host first (nvlpubs.nist.gov has
none), the address of each file was taken from the publisher's own page (the NIST pages
give a DOI, which was followed to the file), requests were made one at a time with a
generic client name, and each file was read with Outpost's own PDF reader:

- **Met Office factsheet 2, Thunderstorms** (2026 edition, 24 pages, 5,113,428 bytes):
  **listed.** `HEAD` answered 404 and the request for the first byte answered 200. The
  licence statement on the factsheets page was read again. The file service does not
  honour a request for one byte and sent the whole file in answer to it, so this file
  was fetched twice, not once; the second copy is the one that was hashed.
- **NIST Special Publication 811** (2008 edition, 90 pages, 2,027,518 bytes): **listed.**
  This time `HEAD` answered 200; the first byte answered 206. Written by two NIST
  employees; NIST's statement was read again. The entry notes that the guide's appendix
  of conversion factors descends from one reprinted from an IEEE standard with
  permission.
- **NIST Special Publication 330** (2019 edition, 138 pages, 1,098,279 bytes): **still
  not listed**, for a different reason. `HEAD` answered 404 and the first byte 206, so
  the check would now pass. But page vi of the file carries a note from the
  International Bureau of Weights and Measures: "All BIPM's works are internationally
  protected by copyright. This document has been drafted with permission obtained from
  the BIPM." The text is that body's, in a United States version edited at NIST. NIST's
  statement gives the right to reprint works its employees wrote and says works by
  third parties may be in copyright. The Bureau's own terms were not read, so nothing
  that was read says this text may be reused, and the entry was left out as the 2013 WHO
  pocket book was. NIST offers the file free of charge at
  <https://doi.org/10.6028/NIST.SP.330-2019>; a person can download it there and add it
  under Library.

The whole catalogue was not run through the online check again after this change: that
is some three hundred requests to other people's servers, made once already that day.
The two new entries were checked as above, by hand, and `pnpm catalog:validate` passes
with 310 entries.

## What was added on 2026-11-17 for CDC and FEMA, and how

- **Why now.** On 2026-11-15 and 2026-11-16 www.cdc.gov, stacks.cdc.gov and
  www.fema.gov refused the catalogue check with HTTP 403. On 2026-11-17 `robots.txt`
  for www.cdc.gov and www.fema.gov was requested with Outpost's own HTTP client
  (`apps/server/src/core/http.ts`, user agent "Outpost (self-hosted offline library)",
  unchanged) and both answered 200. Every request below went through that client. No
  other user agent, browser, proxy, mirror, cache or summarising fetcher was used.
  stacks.cdc.gov was not asked again.
- **Terms read.** CDC's [Use of Agency Materials](https://www.cdc.gov/other/agencymaterials.html)
  and FEMA's [website information](https://www.fema.gov/about/website-information) page,
  both quoted in rows 11 and 8 above. Each CDC entry's attribution carries the credit,
  the no-endorsement line and "available at no charge on www.cdc.gov", as CDC's page
  asks. Each file was searched for copyright notices and credits before it was listed.
- **Addresses** were taken from the agencies' own pages: CDC's water emergency and
  natural disaster communication resources pages and the page of each sheet, CDC's
  hiking water page and power-cut food page; FEMA's safe room resources page and its
  *Protect Your Property* brochures page. The one exception is the nuclear detonation
  planning guidance: none of the FEMA pages read (planning guides, radiological,
  hazardous response, the Office of Emerging Threats) links it, so its address came
  from a search engine. It is FEMA's own file store, the file names FEMA as publisher,
  and the entry's homepage is the Office of Emerging Threats page the guidance itself
  names. Search engines were used to find pages; neither agency's own search was used.
- **Files.** Sixteen PDFs, each fetched once (about 53 MB): measured, hashed, and the title,
  page count, edition and date read from the file. Fifteen were listed. FEMA's P-320
  address without a date redirects to the April 2025 file, so the entry names that file.
  P-320's own copyright note says its illustrations are by FEMA or a FEMA contractor
  and its photographs public domain or FEMA's; the ICC 500 section it reproduces with
  permission, and a copyright line on its design drawing sheets that names no holder,
  are stated in the entry. The nuclear guidance credits one figure to an outside
  author; the entry says so.
- **Left out.** FEMA P-530, Earthquake Safety at Home (fetched, not listed: prepared by
  the Applied Technology Council for FEMA, with some 40 photographs and graphics credited
  to outside people and organisations); the CERT Basic Training participant manual
  (FEMA's CERT page lists "Participant manuals" with no link, and Ready.gov's CERT page
  redirects there); CDC's Extreme Cold guide (no current page offers the PDF). Spanish
  and other language editions were not listed; the brief was English only.
- **Conduct.** At least 15 seconds between requests to www.fema.gov, as its
  `robots.txt` asks, and a few seconds between requests to www.cdc.gov. About 25 pages (twelve at the CDC,
  twelve at FEMA, one at Ready.gov that redirected to FEMA) and 16 files were requested,
  besides the online check. The downloaded files were kept outside the repository
  and deleted.
- **Checks.** `pnpm catalog:validate` passes with 325 entries, and
  `pnpm catalog:validate --online --delay 16` reports 325 of 325 entries resolving at
  their source. One entry from each host (the CDC generator flyer and FEMA's earthquake
  brochure) was downloaded through a throwaway Outpost server started from the
  repository, and both completed at the pinned size and checksum.

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
  is the plain name it uses for every download, "Outpost (self-hosted offline library)",
  with no version and no project address (the owner's choice, 16 November 2026: no
  repeater publisher's terms ask for more).
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

## Planning figures for supplies, read on 2026-11-16

Not catalogue entries: figures that Preparedness → Supplies works with, each quoted in
[supplies.md](supplies.md) with where it is used. Nothing is fetched from any of them.

| Source | What is used | Terms |
| --- | --- | --- |
| Public Health England, *Government Dietary Recommendations* (August 2016), tables 1 and 2 ([PDF](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/618167/government_dietary_recommendations.pdf)) | Energy a day by age band and sex | Crown copyright, Open Government Licence v3.0 (stated on page 2) |
| UK government, *Be ready: get prepared for emergencies* ([beready.campaign.gov.uk](https://beready.campaign.gov.uk/get-prepared-for-emergencies), formerly prepare.campaign.gov.uk) | 3 litres a person a day to drink | GOV.UK campaign page; a figure quoted, nothing copied |
| WHO, *Technical notes on drinking-water, sanitation and hygiene in emergencies*, note 9 (WEDC, July 2013) ([PDF of all notes](https://wedc-knowledge.lboro.ac.uk/resources/who_notes/WHO_TNE_ALL.pdf)) | 7.5 to 15 litres a day for drinking, cooking and basic hygiene (table 9.1) | © WHO 2013, all rights reserved: figures quoted, nothing copied |
| FEMA, [ready.gov/water](https://www.ready.gov/water) (updated 22 February 2021) | One US gallon a day for drinking and sanitation; needs can double in heat | US government work |
| GOV.UK, [Best before and use-by dates](https://www.gov.uk/understanding-food-labelling/best-before-and-use-by-dates) (updated 25 June 2026) | Use-by is safety, best before is quality | Open Government Licence v3.0 |
| Open Food Facts, [data](https://world.openfoodfacts.org/data) | Nothing used. What it would allow is in supplies.md | ODbL (database), DbCL (contents), CC BY-SA (images) |
| USDA FoodData Central, SR Legacy (April 2018), [download page](https://fdc.nal.usda.gov/download-datasets/) (read 2026-11-17) | **Built in.** Energy, protein, fat and carbohydrate per 100 g for 7,793 foods, offered by name when a food is added; made by `scripts/build-food-energy.mjs` from `FoodData_Central_sr_legacy_food_csv_2018-04.zip` (6.1 MB, fetched once on 2026-11-17; sha256 `b8081729…3e6fd0`). See [supplies.md](supplies.md#energy-from-usda-fooddata-central) | The [home page](https://fdc.nal.usda.gov/), read 2026-11-17: "USDA FoodData Central data are in the public domain and they are not copyrighted. They are published under CC0 1.0 Universal (CC0 1.0). No permission is needed for their use, but we request that users list FoodData Central as the source of the data" (and, where possible, "notify us of the product that uses the data"). Citation it asks for: "U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. [Internet]. [cited (enter date)]. Available from https://fdc.nal.usda.gov/." `robots.txt` disallows nothing. The download page and the FAQ carry no licence wording of their own. USDA has not been notified. |
## Device figures for the battery calculators, read on 2026-11-16

Not catalogue entries: the published power figures of common devices (Raspberry Pi
boards, phones, radios, routers, NAS boxes, lamps, a cool box) that Tools → Power and
batteries offers, each quoted with its publisher, document, URL and date in
[tools-power.md](tools-power.md#common-devices) and in
`packages/shared/src/power-devices-data.ts`. Nothing is fetched from any of them: the
figures were read once, by hand-run fetches of the makers' own pages and manuals, and
are bundled as data. Each figure is a short factual quotation (a current, a voltage, a
capacity) with its source; no document is copied. Read the same way, and quoted on the
screen: GOV.UK (OPSS and the UK Chief Medical Officers, Open Government Licence v3.0),
the London Fire Brigade and Electrical Safety First on charging, extension leads and
generators; Battery University (BU-303, BU-808c) for a lithium-ion cell's nominal voltage
and energy efficiency; MEAN WELL's SD-25 specification for a 12 V to 5 V converter's
efficiency.

## The IEEE's registry of device makers, read on 2026-11-16

"Devices on this network" can show who made a device from the first half of its
hardware address. The list of those prefixes is the IEEE Registration Authority's
public listing (MA-L), offered as a download at
<https://standards-oui.ieee.org/oui/oui.csv> from
<https://standards.ieee.org/products-programs/regauth/>. Those pages state no licence
and no permission to redistribute the file; the site's footer reads "© Copyright 2026
IEEE – All rights reserved", and links to the IEEE's site terms, whose text could not
be fetched. Since the terms do not clearly allow passing the file on, it is not
bundled: Outpost fetches it from the IEEE when a person presses "Fetch the registry",
states the size first (3,876,189 bytes on 2026-11-16), and keeps it in that computer's
data directory. See [tools-qr-and-network.md](tools-qr-and-network.md#who-made-each-device).

## Weather and hazards, read on 2026-11-16

What Preparedness → Weather and hazards fetches, on a press only, and what it does not
([weather.md](weather.md)). Every quotation was read on 16 November 2026 from the
publisher's own page, mostly from the page's text as served. Two pages that build
themselves with JavaScript were read through a summary and are marked "(summary)".
Those quotations should be read again on the page before being relied on.

### Used

| Source | Licence and attribution, in its words | Automated use, limits, key | Keeping a copy | Verdict |
| --- | --- | --- | --- | --- |
| **Open-Meteo** forecast API, `api.open-meteo.com/v1/forecast`, asked for `models=ukmo_seamless` | [Licence](https://open-meteo.com/en/licence): "API data are offered under Attribution 4.0 International (CC BY 4.0)"; "You must include a link next to any location Open-Meteo data are displayed", e.g. "Weather data by Open-Meteo.com"; it credits "Atmospheric forecasts from UK Met Office ( CC-BY-SA Licence )". [UKMO page](https://open-meteo.com/en/docs/ukmo-api): "UK Met Office data is provided under the CC BY-SA 4.0 licence. Therefore, any derived products from this data should also be redistributed under the same or a compatible licence." | [Terms](https://open-meteo.com/en/terms): "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute." "You may only use the free API services for non-commercial purposes." Non-commercial examples include "Personal home automation purposes." No key for non-commercial use. A request of more than 10 variables counts as more than one call ([pricing](https://open-meteo.com/en/pricing)); Outpost's asks 8 hourly and 7 daily. | Not stated; CC BY and CC BY-SA allow copying with credit. | **Used**, no key. The credit and a link are shown under every forecast. A copy kept by a household is not redistributed; if one ever were, it would be under CC BY-SA. |
| **Met Office** warnings RSS, `www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK` | Channel: "(c) Crown copyright". [RSS terms](https://weather.metoffice.gov.uk/guides/rss): "You must provide attribution to the Met Office website in connection with your use of the RSS feeds." "The Met Office retains all ownership and other rights in the RSS Content". | Same page: "The RSS service may be used only with those platforms from which a functional link is made available that, when accessed, takes the viewer directly to the display of the full article on the Met Office Site." "You may not insert any intermediate page, splash page or other content between the RSS link and the applicable Met office Site web page." No rate limit stated. No key. The [website terms](https://www.metoffice.gov.uk/policies/tandc) forbid automated copying "Save for any APIs that we provide or expressly authorise you to use"; the RSS service is one the Met Office provides for this. | Not addressed by the RSS terms. | **Used**, no key, one feed for the whole UK (no position sent). Every warning keeps its link straight to the Met Office page, the titles and descriptions are unaltered, and the credit is shown. **For the owner:** that the RSS terms neither allow nor forbid keeping a copy for offline reading. |
| **Environment Agency** real-time flood-monitoring API, `environment.data.gov.uk/flood-monitoring` | [Reference](https://environment.data.gov.uk/flood-monitoring/doc/reference): "These APIs are provided as open data under the Open Government Licence with no requirement for registration." Attribution: "this uses Environment Agency flood and river level data from the real-time data API (Beta)". | No numeric limit stated. "should not be relied upon for safety critical applications. They do not replace the existing channels by which the Agency notifies members of the public". | The OGL allows copying. | **Used**, no key. The caveat is quoted on the screen. England only. |
| **Environment Agency** real-time flood-monitoring API, river and sea levels: `/id/stations?parameter=level&lat=…&long=…&dist=…&_view=full`, `/id/measures/{id}/readings?_sorted&_limit=16`, `/id/measures/{id}/readings?since=…` | Read again on 17 November 2026, [reference](https://environment.data.gov.uk/flood-monitoring/doc/reference): "These APIs are provided as open data under the Open Government Licence with no requirement for registration. If you make use of this data please acknowledge this with the following attribution statement: this uses Environment Agency flood and river level data from the real-time data API (Beta)". Every answer's `meta` names the licence as OGL v3 and says "Status: Beta service". Typical range: "typicalRangeHigh … the measurement exceeded this for 5% of the relevant data on record"; "typicalRangeLow … exceeded this for 95%"; "highestRecent … The highest reading for this measurement in recent times (typically the last 5 years)"; "maxOnRecord … The highest reading for this measurement on record". Units: "mAOD (for metres relative to the Ordnance Survey datum), mASD (for metres relative to the local stage datum), m (for metres with an unspecified datum)". | Same page: "Water levels and flows are regularly monitored, usually every 15 minutes. However, data is transferred back to the Environment Agency at various frequencies … typically once or twice per day, but usually increases during times of heightened flood risk." "Readings … are available for the recent period (up to the last four weeks)." Its note on crawling asks programs that keep "a copy of all the latest level/flow values" to make "a single call every 15 mins" to `/data/readings?latest` rather than "crawling all the stations every 15 mins"; at high load, "limiting API use to common patterns (avoiding custom filtering) will improve the chances of cache hits". No numeric limit, contact or key is asked for. "should not be relied upon for safety critical applications. They do not replace the existing channels by which the Agency notifies members of the public". Readings are limited to "a hard limit of 10000 items". `robots.txt` at environment.data.gov.uk (read the same day) disallows `/doc/`, `/data/` and others at the root, not `/flood-monitoring/`. | The OGL allows copying and keeping. | **Used**, no key, on a press only: one request for the stations within the distance chosen, one for each of the nearest ten's latest readings, and one for a station's last three days on its own view. Outpost keeps no all-stations copy and polls nothing, so the crawling note's single `?latest` call (every measure in England; its size was not measured) does not fit a press for one place. England only. The attribution is on the screen. The Agency's "Check for flooding" station pages (`check-for-flooding.service.gov.uk/station/{RLOIid}`, read 17 November 2026; its `robots.txt` allows all) are linked, not fetched; Floodline's number, "0345 988 1188 … Open 24 hours a day, 7 days a week", is quoted from one. |
| **NASA POWER** climatology, `power.larc.nasa.gov/api/temporal/climatology/point` | [Referencing](https://power.larc.nasa.gov/docs/referencing/): "The data was obtained from National Aeronautics and Space Administration ( NASA ) Langley Research Center's Prediction Of Worldwide Energy Resources ( POWER ) project funded through the NASA Earth Science Division." It also says: "the Project requests notification if POWER data is transmitted to other researchers." No licence is named on the pages read (API, climatology, referencing, FAQ). | "A maximum of 20 parameters can currently be requested in one submission for a single point." The docs list a 429 response, with no number. No key. | Not stated. | **Used**, no key, with NASA's acknowledgement. **For the owner:** no licence is named. |
| **PVGIS** `MRcalc`, `re.jrc.ec.europa.eu/api/v5_3/MRcalc` | [Data page](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/general-information/geospatial-data-download_en): "The data in the sections below are free for public use if the source is acknowledged ( PVGIS © European Communities, 2001-2026)". Nothing specific to the API's answers was found. | [API page](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en): "API calls have a rate limit of 30 calls/second per IP address". "access to PVGIS APIs via AJAX is not allowed" (Outpost calls it from the server). No key. | Not stated. | **Used**, no key, with the acknowledgement. |

### Not used

| Source | Why | What is offered instead |
| --- | --- | --- |
| Met Office Weather DataHub (site-specific forecasts; NSWWS warnings API) | Needs an account and an API key ([FAQ](https://datahub.metoffice.gov.uk/support/faqs): "After subscribing to a product, you'll be provided with an API key."). Its FAQ says a 10,000-a-month allowance is "limited to 360 calls per day". Its terms (Version 13, 2024, [PDF](https://www.metoffice.gov.uk/api/assets/file/met-office-weatherdatahub-terms-and-conditionspdf?prefix=assets)) say: "You must not sub-license, distribute, sell, or otherwise make the Met Office Weather DataHub Products available to third parties other than via Your Application". Attribution: "Powered by Met Office data". The free plan's exact figures could not be read (the pricing page needs JavaScript). | The same Met Office models through Open-Meteo. It could be added as an optional source with the person's own key, kept the way other secrets are. |
| MET Norway, `api.met.no` locationforecast 2.0 | Licence NLOD 2.0 and CC BY 4.0, "Data from MET Norway". [Terms](https://api.met.no/doc/TermsOfService) (revised 2026-11-05): "All requests must (if possible) include an identifying User Agent-string (UA) in the request with the application/domain name, optionally version number. You should also include a company email address or a link to the company website where we can find contact information." The [HowTO](https://docs.api.met.no/doc/locationforecast/HowTO) says: "If this is missing or generic, you will get a 403 Forbidden response." It also requires caching until `Expires` and coordinates of at most 4 decimals. | **For the owner:** it would need contact details in Outpost's client name. Not built. |
| US National Weather Service, `api.weather.gov` (forecasts and alerts) | [Public domain](https://www.weather.gov/disclaimer), no key. "A User Agent is required to identify your application" and "If you include contact information (website or email), we can contact you". It covers the US only. | Not built; the owner is in England. |
| MeteoAlarm feeds | "Licensed under terms equivalent to CC BY 4.0, with additional requirements". Its [terms](https://meteoalarm.org/en/live/page/terms-and-conditions) (read from its content endpoint) say: "the delay between the publishing on the MeteoAlarm Website and the redistributor's website being on average less than five minutes and never longer than ten minutes", plus a required disclaimer. A copy kept for offline reading cannot promise ten minutes. | The UK's warnings straight from the Met Office. |
| Environment Agency, Flood Map for Planning (Flood Zones 2 and 3) | Read again on 16 November 2026. [data.gov.uk](https://www.data.gov.uk/dataset/flood-map-for-planning-flood-zones1) ("Updated 22 October 2026"): licence "Open Government Licence"; "Attribution statement: © Environment Agency copyright and/or database right 2025. All rights reserved."; "The Flood Zones are designed to only give an indication of flood risk to an area of land and are not suitable for showing whether an individual property is at risk of flooding. This is because we cannot know all the details about each property. Users of these datasets should always check they are suitable for the intended use."; "if downloading data for an area of interest, all polygons that intersect this area will be provided. Some polygons may be quite large and extend beyond the drawn area of interest." The OGC API Features service (landing page at `environment.data.gov.uk/spatialdata/flood-map-for-planning-flood-zones/ogc/features/v1`, which points to `environment.data.gov.uk/geoservices/datasets/04532375-a198-476e-985e-0579a0a11b47/ogc/features/v1`) has one collection, `Flood_Zones_2_3_Rivers_and_Sea`, extent −6.99 to 2.07 E, 49.88 to 55.81 N, stored in EPSG:27700 and served as GeoJSON in CRS84, `limit` "Minimum = 1. Maximum = 10000. Default = 10", paging by `startIndex`, with `numberMatched` in each answer. Properties: `flood_zone` (`FZ2`, `FZ3`), `flood_source` (`river`, `sea`, `unknown`), `origin`. Tried by hand that day: a box 0.1° by 0.06° round Bedford, 248 areas, 4,637,709 bytes, 0.43 s; a box 0.3° by 0.15° with `limit=1` was not answered within 90 seconds. No limit on requests, and no terms of service for the platform beyond the dataset's licence, were found on the publisher's pages (environment.data.gov.uk's support pages need JavaScript and its terms address answered 404). | **Fetched on a press** as a reference layer, for the area on screen up to 0.2° by 0.3° (about 20 km), at most 5,000 areas, one request after a count ([reference-layers.md](reference-layers.md)). |
| Environment Agency, Risk of Flooding from Rivers and Sea | OGL. Only a WMS and a bulk download are published; no feature API (as read by the weather work; not read again on 16 November 2026 for the flood layer). | Not built: a WMS is pictures, not areas Outpost can keep and draw, and the bulk file is national. |
| SEPA (Scotland) | [Time-series API](https://timeseriesdoc.sepa.org.uk/): OGL, "with no requirement for registration"; "please acknowledge SEPA". No flood-warning feed was found. | Linked; not built. |
| Natural Resources Wales | [API portal](https://api-portal.naturalresources.wales/): "Sign up now for an API key"; OGL. | Linked; would need the person's own key. |
| DfI Rivers (Northern Ireland) | Flood maps "available to be licensed commercially" ([DfI](https://www.infrastructure-ni.gov.uk/articles/can-data-within-flood-maps-ni-be-licensed-commercial-use)). | Not used. |
| Met Office Fire Severity Index | "The Fire Severity Index (FSI) webpage is moving from the Met Office to the Open Access site by Natural England." It is published as maps only, with no feed and no licence stated. "the FSI does not predict when or where wildfires will start." | Linked ([Open Access](https://openaccess.naturalengland.org.uk/)). |
| EFFIS fire danger forecast | [CC BY 4.0](https://forest-fire.emergency.copernicus.eu/about-effis/data-license): "reuse is allowed, provided appropriate credit is given and changes are indicated." Published as WMS images whose request is built in JavaScript; the exact request was not resolved. | Not built. |
| Met Office climate averages (1991–2020) and station data files | Shown on its website; the data files carry no licence line, and the website's OGL terms do not cover "Any underlying web services". | Linked; NASA POWER is used instead. |
| WorldClim | "Redistribution or commercial use is not allowed without prior permission." | Not used. |
| ERA5 (Copernicus CDS) | CC BY 4.0, but it needs an account, and "One must agree to the Terms of Use of a dataset before downloading any data out of it. This step must be done manually". | Not used; NASA POWER needs no account. |
| CRU TS | ODbL; "Please use the attribution Climatic Research Unit, University of East Anglia". Bulk gridded files, with no point API. | Not used. |
| NOAA US climate normals | No licence wording was found on the [product page](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals). US only. | Not used. |

## Sources that are not integrated: what you can do

- **Import a repeater list you obtained.** See [radio.md](radio.md#repeaters). Outpost
  fetches a list only from the publishers the table above marks **fetch**; for the
  rest the Repeaters screen gives the page and the steps.
- **Add your own files.** Download the file yourself from the source, on terms you are
  satisfied with, and add it under **Library → Add documents**. It is stored on your
  disk, indexed for search, and opens in the built-in viewer like any other document.
  This is the right route for Internet Archive items, single Project Gutenberg books,
  CDC and FEMA guides the catalogue does not list, Hesperian's books, the Sphere Handbook, and anything you hold a
  licence for.
- **Contribute a manifest entry.** If a publisher offers a stable address for a file
  and a licence that allows free download, it can be listed. The format, the rules and
  the checks to run are in [`catalog/README.md`](../catalog/README.md). You can also
  keep a manifest of your own in `<data directory>/catalog/` without sending it to
  anyone.
- **Peak sun hours for a power plan.** Tools → Power and batteries links to the
  European Commission's [PVGIS](https://re.jrc.ec.europa.eu/pvg_tools/en/) and asks
  for the twelve monthly figures to be typed in. The power screen itself fetches
  nothing. Preparedness → Weather and hazards can fetch the same figures from PVGIS's
  API for a place, on a press (below and [weather.md](weather.md#the-power-planner)).
  See [tools-power.md](tools-power.md).
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

## Emergency plan templates: what is quoted, and on what terms (read 2026-11-16)

The emergency plan templates ([emergency-plans.md](emergency-plans.md)) carry short
quotations from official pages, each with its publisher, title, address and date, in
`packages/shared/src/emergency-templates-data.ts`. No page or document is bundled or
fetched by Outpost; the sources were read by hand once. Only the words of a publisher
whose own terms allow them to be copied are shipped, under those terms; a test holds
this. Each publisher's terms, as read on its own terms, copyright or reuse page:

| Publisher | Terms page (read 16 November 2026) | What it says | Verdict |
| --- | --- | --- | --- |
| GOV.UK (Government Digital Service), including the Environment Agency's pages on GOV.UK | https://www.gov.uk/help/terms-conditions | “Most content on GOV.UK is subject to Crown copyright protection and is published under the Open Government Licence (OGL), which also sets out which content is exempt. … You can reproduce content published on GOV.UK under the OGL as long as you follow the licence’s conditions.” | Cleared: Open Government Licence v3.0 (logos, crests, the Royal Arms and third-party rights are exempt; none is used). Shown with its words: “Contains public sector information licensed under the Open Government Licence v3.0.” |
| Be Ready (Cabinet Office), beready.campaign.gov.uk | https://beready.campaign.gov.uk/about-this-website-and-uk-resilience/ | “It was developed by the Cabinet Office, in partnership with experts from across local and national government, … All content is available under the Open Government Licence v3.0, except where otherwise stated” | Cleared: Open Government Licence v3.0 (the site's own statement; its two PDFs carry no other notice). Shown with its words: “Contains public sector information licensed under the Open Government Licence v3.0.” |
| Met Office | https://www.metoffice.gov.uk/policies/tandc | “the Met Office grants you a worldwide, royalty-free, perpetual, non-exclusive licence to use, copy and adapt the Content (the "Licensed Content") under the terms of the UK Open Government Licence for Public Sector Information v3.0 … You must place the following attribution statement adjacent to the Licensed Content when reproducing the Licensed Content, as required by the Open Government Licence: "Contains public sector information licensed under the Open Government Licence v3.0"” | Cleared: Open Government Licence v3.0, with the statement adjacent to the words. Shown with its words: “Contains public sector information licensed under the Open Government Licence v3.0.” |
| NHS website (Department of Health and Social Care) | https://www.nhs.uk/our-policies/terms-and-conditions/ | “Copyright and database rights in NHS Website Content are released free-of-charge under the current version of the Open Government Licence ("OGL"), except where specified … If you copy and reuse NHS Website Content but do not make any changes or adaptions … then you must attribute us as follows: "Information from the NHS website", and "as at DDMMYY" … You must not attribute the content to the NHS website or cite the NHS specifically as the source of the adapted, updated or non-refreshed content.” | Cleared for exact copies only: Open Government Licence v3.0 with the NHS website's own conditions: an unchanged copy is credited "Information from the NHS website" with the date copied, on every appearance; an adapted one may not name the NHS. No NHS words are shipped: Be Ready's own (OGL) heat advice, which points to the NHS, is used instead.. |
| Ofcom | https://www.ofcom.org.uk/about-ofcom/our-website/copyright | “Unless indicated as Crown-owned material or otherwise, the material featured on this website or provided in hard copy may be reproduced free of charge in any format or medium, provided that it is reproduced accurately and not used in a misleading context. The material must be acknowledged as Ofcom copyright and the title of the document/publication specified.” | Cleared for exact copies only: Ofcom's permission to reproduce accurately, acknowledged; not a licence to adapt, so each step is a whole sentence of the page, unchanged. Shown with its words: “Ofcom copyright: words from “Stay connected in severe weather”, reproduced unchanged.” |
| European Commission | https://commission.europa.eu/legal-notice_en | “Unless otherwise indicated (e.g. in individual copyright notices), content owned by the EU on this website is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. This means that reuse is allowed, provided appropriate credit is given and changes are indicated.” | Cleared: CC BY 4.0. Shown with its words: “© European Union, CC BY 4.0 (European Commission, “112 - the EU's emergency phone number”).” |
| Queensland Government | https://www.qld.gov.au/legal/copyright | “Unless otherwise noted, all copyright material available on or through this website is licensed under a Creative Commons Attribution 4.0 International licence (CC BY 4.0). … You must keep the copyright notice on the copyright material and attribute the State of Queensland as the source of the copyright material.” | Cleared: CC BY 4.0. Shown with its words: “© State of Queensland, CC BY 4.0 (“Triple Zero (000)”, qld.gov.au).” |
| British Red Cross | https://www.redcross.org.uk/terms-and-conditions | “We and our licensors reserve all of our and their rights in any intellectual property in connection with these Terms. … Commercial use or publication of any or all of the Content is strictly prohibited without prior authorisation from us. Nothing contained herein shall be construed as conferring any licence to use any item displayed, other than as necessary to enable you to access the Site.” | Not cleared: All rights reserved: pointed to, not quoted. |
| Ready.gov and FEMA (United States) | https://www.fema.gov/about/website-information | “Not read directly: fema.gov refused every request from here (HTTP 403). Read through a summarising fetcher, the page says “Most material on FEMA.gov is free of copyright and may be copied and distributed without permission”, which names FEMA.gov and not Ready.gov; Ready.gov has no terms page of its own that could be found.” | Not cleared: Not established from a page that could be read: pointed to or left as a question, not quoted. |
| New Zealand Police | https://www.police.govt.nz/about-site-and-nz-police-app/copyright | “You may save to disk and reprint images and other information contained on this site for non-commercial private purposes only. Requests and enquiries concerning the reproduction of information on this website, or the use of web scripts or code, for any other purpose requires permission.” | Not cleared: Permission needed: the number 111 is given as a fact, cited, with none of the page's words. |

| International Commission on Radiological Protection (ICRP) | https://www.icrp.org/page.asp?id=11 | “The publications of ICRP are copyright protected. If you want to reproduce material from an ICRP report, or if you want to translate and distribute it, permission is required from ICRP.” Its publications page: “ICRP retains copyrights on all its publications; even free to access publications require permission for reuse.” | Not cleared: permission needed. Nothing used. |
| International Atomic Energy Agency (IAEA), iaea.org | https://www.iaea.org/about/terms-of-use (refused, HTTP 403; read from the Internet Archive's copy of 17 October 2026) | “Content may be adapted, translated, copied, printed and downloaded for private study, research and teaching purposes, and for use in commercial and non-commercial products or services, provided that appropriate acknowledgement of the IAEA as the source is given and that the IAEA's endorsement of users' views, products or services is not stated or implied in any way. Specific restrictions and/or conditions may apply to specific Materials within this Site.” | Cleared for the website's own content, with acknowledgement; a publication's own notice would be read first. Nothing used: no IAEA page for households was found. |

The radiation emergency template (nuclear preparedness) adds two GOV.UK pages of the UK
Health Security Agency, under GOV.UK's terms above, each also saying “This publication
is licensed under the terms of the Open Government Licence v3.0 except where otherwise
stated”, and points to Ready.gov's “Radiation Emergencies” page. Its sources and what
was not used (local-authority REPPIR leaflets, which carry no licence statement) are in
[nuclear-preparedness.md](nuclear-preparedness.md#the-radiation-emergency-template).

The British Red Cross, Ready.gov and New Zealand Police are pointed to or cited for a
fact, never quoted. The NHS's terms allow reuse with conditions that the templates do
not take on; no NHS words are shipped.

## The Morse trainer: its method, timing and content (read 2026-11-16)

Radio → Morse trainer ([morse-trainer.md](morse-trainer.md)) came from LogBook73, by the
same author under the same MIT licence. It bundles no document and fetches nothing; what
it is built on is named here.

| What | Where it comes from | How it was checked |
| --- | --- | --- |
| The code itself (letters, digits, punctuation, prosigns) | International Morse code, ITU-R M.1677-1 (source R9 above) | Written out in `packages/shared/src/morse/table.ts`, not copied from the Recommendation. |
| The timing proportions: dah 3 dits; gaps of 1 dit inside a character, 3 between characters, 7 between words | ITU-R M.1677-1 (source R9 above) | As in the Recommendation's part on spacing and length of signals, read for the radio sheets. |
| Speed in words per minute, and the dit length | The PARIS standard word: "PARIS", with the space after it, is 50 dits long, so at *w* wpm a dit lasts 60 / (50 *w*) = 1.2 / *w* seconds. Described, for example, by Pieter-Tjerk de Boer, PA3FWM, <https://pa3fwm.nl/technotes/tn31-morse-timing.html> | Read on 16 November 2026: "This word, including the space at the end, has a duration of exactly 50 units of time, each as long as a dot", "generally used to define the speed in words per minute (wpm)". The 1.2 / *w* follows from it. |
| Farnsworth spacing | Jon Bloom, KE3Z, "A Standard for Morse Timing Using the Farnsworth Technique", QEX, April 1990, pp. 8–9 (ARRL), listed on <https://www.arrl.org/cw-mode>, scan at <https://www.arrl.org/files/file/Technology/x9004008.pdf> | The listing was read; the scan is a fax-compressed image and was not read here. The engine's formula (characters at the character speed; PARIS's 19 spacing dits stretched so the word takes 60 / *s* seconds at the effective speed *s*: one spacing dit = (60 / *s* − 37.2 / *c*) / 19 seconds) is LogBook73's and matches the secondary descriptions found; it was not checked against the article itself. |
| The Koch method: start at full character speed with two characters, add one when a session is copied at 90 % | Ludwig Koch's work of the 1930s, as used by LCWO (lcwo.net, by Fabian Kurz, DJ5CW) | Common knowledge. LCWO's own course pages need signing in and could not be read here, so the 41-character order in `koch.ts` is as LogBook73 recorded it, not checked against LCWO's list. |
| Q-codes and abbreviations (CQ, DE, QRS, QTH, 73, 5NN…) | Common operating practice; the Q code is ITU-R M.1172 (source R9) | Short words in use on every band; no list was copied. |
| The words of the word drill | The 50 most common short English words and 40 longer ones, typed for LogBook73 | Common words. The first fifty follow the order of a common frequency list of English words; a list of common words is not a work of anyone's, so they are kept. |
| Example and practice callsigns | Made up | The fixed ones (the practice contact's stations, the defaults, the tests) start with Q, which the ITU never issues as a call prefix. The drills' random calls use real country prefixes and random letters, so one can happen to match a real station. GB100RSGB is kept as the form of a special-event call. |
| What a Reverse Beacon Network skimmer needs | The RBN's "How to get spotted by the RBN", <https://www.reversebeacon.net/pages/How+to+get+spotted+by+the+RBN+44>, and HamSCI's "Getting Spotted by the RBN", <https://www.hamsci.org/node/188> | Both read on 16 November 2026. Quoted: "you must send one of the key-words: TEST or CQ"; "Skimmer may want to "hear" two, three, or four repetitions of the call before it will be spotted."; "Skimmer may copy the T in CWT and run it together with the real callsign."; a node that has spotted you "will ignore you until 10 minutes have passed", or "QSY 300 Hz or more between transmissions"; HamSCI: "(1) calling CQ and (2) having a valid call sign", "The CQ word may have one other word between the CQ word and the call sign", unusual prefixes "can require up to 4 repetitions before they are spotted". |
| The network's own page, linked from On the air | <https://www.reversebeacon.net/main.php> | Read on 16 November 2026. The site's own pages give no address for the spots of one call (its search is a box on the page), so the link is to the page with that box. Outpost makes no request to the network; the link is opened only by a person. |
| The keyer presets (what each maker's radio does out of the box) | As LogBook73 recorded them | Not checked against each maker's manual; the screen says so. |

## The Solar clock: its formulas and reference values (read 2026-11-17)

Tools → Solar clock ([tools-solar-clock.md](tools-solar-clock.md)) bundles no document and
fetches nothing. Its arithmetic and the values its tests are held to come from these:

| What | Where it comes from | How it was checked |
| --- | --- | --- |
| The sun's position, the equation of time, refraction, sunrise at 0.833° | NOAA Global Monitoring Laboratory, "Solar Calculation Details", <https://gml.noaa.gov/grad/solcalc/calcdetails.html>, after J. Meeus, *Astronomical Algorithms* | The page was read: it names Meeus's book without an edition, gives the refraction model (quoted from its images' alt text) and says the calculator "is no longer actively supported". Meeus's book was **not** read; its chapter numbers (25 and 28, second edition) are as `sun.ts` already gave them. |
| Altitude, azimuth, dip of the horizon, the sidereal rate 1.00273791 | N. Bowditch, *The American Practical Navigator*, NGA Pub. 9, 2019, vol. 1, appendix B, <https://thenauticalalmanac.com/2019_Bowditch-_American_Practical_Navigator/Volume-_1/13-%20Appendices/Appendix%20B-%20Calculations%20and%20Conversions.pdf> (a copy of the US Government publication) | Pages 707 to 712 read: "Dip of the visible horizon … D = 1.76′ √h_m"; "Hc = sin⁻¹[(sin L sin d) + (cos L cos d cos LHA)]"; the time azimuth formula; "1 mean solar unit = 1.00273791 sidereal units". |
| Sidereal time | US Naval Observatory, "Computing Approximate Sidereal Time", <https://aa.usno.navy.mil/faq/GAST> | Read: "GMST = mod (18.697375 + 24.065709824279 DUT, 24h)"; "an accuracy of about 0.1 second of time". |
| Reference values for the tests | US Naval Observatory APIs: `api/celnav` (sun and star altitude, azimuth, declination, Greenwich hour angle), `api/siderealtime`, `api/rstt/oneday` | Queried on 17 November 2026 for the dates and places in the tests; each value is copied into the test that uses it with the address it came from. The star places of Polaris, Dubhe and Kochab are taken from the same data for 1 January 2026 and 2046. CDS (SIMBAD, VizieR) answered "Page unavailable" and was not used. |
| Horizontal sundial hour lines | North American Sundial Society, "Sundial Math", <https://sundials.org/education/sundial-math>: "tan(theta) = tan(HA) x sin(lat)", "the gnomon rises at an angle equal to the sundial site's latitude", "Civil = Sundial + EoT + dLon" | Read. |
| A table of hour-line angles | K. Gibbs, schoolphysics, "Making a horizontal sundial", <https://www.schoolphysics.co.uk/age14-16/Astronomy/text/Sundial_/index.html> | Read; the table for 50° to 55° is copied into `sundial.test.ts`. |
| Setting up a sundial, the equation of time and longitude in words | British Sundial Society, "Setting Up A Sundial", <https://sundialsoc.org.uk/all-about-sundials/setting-up-a-sundial/> | Read: "subtract 4 minutes per degree if you are West of the timezone"; it gives no shadow method for north. |
| True north from the shortest shadow | Yohkoh Public Outreach Project, "Finding Geographic North", <https://solar.physics.montana.edu/ypop/Classroom/Lessons/Sundials/north.html> | Read: "Draw a line from the dowel base to this point". The page names no institution; Montana State University is inferred from the address. |
| The nocturnal | L. Devoy, Royal Museums Greenwich, "What is a nocturnal?" (30 October 2023), <https://www.rmg.co.uk/stories/blog/astronomy/what-nocturnal> | Read: the steps of use, "to within 15 minutes", "around 40-60 degrees north latitude", "23 hours, 56 minutes and 4 seconds (1 sidereal day)". It does not name Kochab or cover the southern hemisphere. |
| A southern star clock | None | No source that could be checked was found; the screen says the south is not covered. |

## Frequencies to listen to (read 2026-11-17)

Radio → Frequencies to listen to ([radio-frequencies.md](radio-frequencies.md)) ships a
list of facts (frequencies, channels, hours, places) with, for each entry, the page it
was checked against and the day. Nothing is fetched by Outpost: the addresses are plain
links. Each entry's sources are in its file under `packages/shared/src/radio-frequencies/`
and on the screen; this section records how they were chosen and the terms that bore on
them.

**How pages were read.** Each page was read on 17 November 2026 with an ordinary fetch
that names itself as an AI agent. Where a site refused that fetch, or its `robots.txt` or
terms forbid AI agents, that was taken as the site's answer: the page was not read another
way (no other user-agent, cache or mirror), and nothing in the set rests on it. Two
researchers had first read some pages with a browser user-agent; every such page was read
again the ordinary way, or its content was removed. The US regulations were first read
through the eCFR's API, which `ecfr.gov`'s `robots.txt` disallows; they were replaced by
the Government Publishing Office's 1 October 2025 edition of the Code of Federal
Regulations on govinfo.gov.

**Primary sources used**, by kind (the full list is in the data files):

| Kind | Sources |
| --- | --- |
| Time signals | NIST (WWV, WWVH, WWVB), NPL (MSF), PTB (DCF77), NICT (JJY), ANFR (ALS162), GUM (e-Czas, Poland), the BIPM's annual table of time signals (February and March 2026 returns: HLA, RWM, RBU, RTZ, Beta, MIKES, LOL, BPM), NTSC's bulletin, ITU-R TF.768-4, INRiM, METAS, Royal Museums Greenwich (the pips) |
| Emergency broadcasting | GOV.UK and Be Ready, Ireland's Be Emergency Ready booklet, Ready.gov, Alert Ready and canada.ca, BBK, oesterreich.gv.at, BABS, Krisinformation and MCF, Statsforvalteren, borger.dk, FMI, kriis.ee and ERR, LRT, HZS ČR, Denk vooruit, centredecrise.be, Radio France's convention with the Ministry of the Interior, Protección Civil, Io non rischio, Yamanashi Prefecture |
| News broadcasters | Ofcom's transmitter parameters, RTÉ, 2RN, ANFR, Polskie Radio, Antena Satelor, NMHH, 47 CFR Part 73, MIC (Japan), EBC (Brazil), Radio Nacional (Argentina), Český rozhlas, RÚV, Deutschlandradio; for shortwave, RRI, RTVE, RTI, WRMI, Radio Prague International, RFA, RFE/RL, VOV, Channel Africa |
| Weather | NWS (NOAA Weather Radio, US marine broadcasts, the radiofax schedule compilation), canada.ca and the Canadian Coast Guard's Radio Aids to Marine Navigation 2026, the MCA's MSI leaflet, the Met Office, Ofcom, NATS's UK AIP and AirNav Ireland's AIP (VOLMET), the IMO NAVTEX Manual and the IHO's WWNWS reports, DWD, Kystverket, Météo-France, ANFR, ICAO regional air navigation plans, Airservices Australia |
| Distress and calling | Ofcom's distress and safety annex, the MCA (MGN 324), 47 CFR Parts 80 and 87 (govinfo), the UK AIP, Transport Canada's AIM, the Canadian Coast Guard, NSW and Queensland maritime pages, the IMO, NOAA SARSAT, the Wireless Telegraphy Act 2006 |
| Amateur | IARU Regions 1, 2 and 3 (emergency frequencies page, band plans, the VHF Handbook), ARRL, JARL, WIA, NZART, SARL HAMNET, the Hurricane Watch Net, NCDXF, JS8Call's own source, 47 CFR Part 97 (govinfo) |
| Licence-free | CEPT ECC/DEC/(15)05 and (11)03, ERC/REC 70-03, Ofcom IR 2027, IR 2027.2, IR 2030 and its CB guidance, BNetzA, 47 CFR Part 95 (govinfo), ISED RSS-210 and RIC-18, ACMA's CB class licence 2025, the New Zealand Gazette and RSM, Japan's Radio Act regulations (e-Gov), MCMC, ICASA |
| Bands | Ofcom's UK Frequency Allocation Table, NTIA's Redbook, 47 CFR Part 2 (govinfo), the IARU's summary of amateur allocations, ITU-R BS.1660-7, MIC, the Bureau of Meteorology's introduction to HF radio |

**Secondary sources**, each used for one fact and said so in the entry's notes: the RSGB
and WorldDAB (BBC Radio 4 long wave ending, 27 June 2026), Radio World (RTL 234 kHz, the
end of German medium wave, the CBC time signal), Avvenire (RAI medium wave), L'Adige (the
RAI time signal), the SWLing Post (CHU's closure, 22 June 2026, and Channel Africa's),
Keep Long Wave (the delay of the pips on digital radio), a district council page (the
UK's Radio 2 and Radio 4 frequencies in its own area), Hackaday and CERN's amateur radio
club (what sideband sounds like; the word "utility").

**Terms that bore on reuse**, as read:

- GOV.UK: "This publication is licensed under the terms of the Open Government Licence
  v3.0 except where otherwise stated."
- Ofcom: material "may be reproduced free of charge in any format or medium … provided
  that it is reproduced accurately and not used in a misleading context", and "must be
  acknowledged as Ofcom copyright and the title of the document/publication specified."
- Denk vooruit (Netherlands): "Unless stated otherwise, CC0 (Creative Commons Zero)
  applies to the content on our website… CC0 does not apply to photographs, videos,
  infographics or other images."
- ISED: "Unless otherwise specified, you may reproduce the materials in whole or in part
  for non-commercial purposes", with attribution and a link to the original.
- VOA: "All text, audio and video material produced exclusively by the Voice of America
  is in the public domain."
- IARU Region 1 VHF Handbook: copying "is allowed for IARU member societies and for
  non-commercial purposes provided the source of information is quoted."
- WIA band plan: CC BY-NC-ND 4.0, "copying and redistribution of the material in its
  original, unaltered form for non-commercial purposes only"; "You must not adapt,
  modify, transform, or build upon this material without prior written permission."
  Only single frequencies are taken from it, credited, not the plan.
- Radio Romania International: "The content of this Website cannot be copied, reproduced,
  republished, recompiled … with the exception of personal, non-commercial use."
  RTVE reserves the rights of reproduction of its content; the SABC grants use "for your
  personal, non-commercial use". From these three, only the frequencies and times of
  the current season's schedule are given, in Outpost's own words, with the source;
  no text or table is copied. That a list of frequencies and times is a fact and not
  the broadcaster's text is Outpost's reading, not legal advice; an owner who disagrees
  can remove those entries (`bc-sw-radio-romania-international`,
  `bc-sw-radio-exterior-de-espana`).
- US federal works (NIST, NWS, the CFR) carry no restriction.
- Natural Earth (countries' boxes, used to find the home place's country) is already in
  this page under reference layers.

**Not used because of their terms or because they refuse AI agents**: the BBC (its
`robots.txt` forbids "agentic AI or grounding using BBC content"), ABC (Australia), RNZ,
CBC, NHK, NRK, DR, Yle, KBS, Vatican News, RFI, Deutsche Welle, USAGM, Radio France's
radiofrance.fr, the Bureau of Meteorology's own pages, USCG NAVCEN, the FAA's AIP,
gov.ie, Cospas-Sarsat, aprs.org, the WSJT-X source on SourceForge, and Google Docs
(WRMI's schedule grid). What each would have given is listed as a gap in
[radio-frequencies.md](radio-frequencies.md#gaps), so that someone can fill it in by hand
from the broadcaster's own page.

**Not used as sources at all**: Wikipedia, hobbyist schedule lists (EiBi, Aoki and the
like), HFCC data, commercial frequency guides and RepeaterBook.

## The allotment's months and facts (read 2026-11-17)

Games → Allotment ([games.md](games.md#the-crops)) uses real sowing and harvest months for
its twelve crops, and a few facts about each on its almanac card. Nothing is fetched by
Outpost and no page or picture is bundled: the months are numbers in
`packages/shared/src/games/allotment/numbers.ts`, the facts are sentences written for
Outpost in `notes.ts`, and the pages are plain links behind "Where this comes from".

| What | Where it comes from | How it was read |
| --- | --- | --- |
| Sowing, planting and harvest months; hardiness, watering and a few facts for each crop | Royal Horticultural Society, "Grow your own" pages: <https://www.rhs.org.uk/vegetables/radishes/grow-your-own>, and the same address with `salad-leaves`, `onions`, `peas`, `carrots`, `beetroot`, `kale`, `broad-beans`, `potatoes`, `leeks`, `garlic` and `squash` | Each page fetched once on 17 November 2026 with Outpost's own user agent ("Outpost (self-hosted offline library)"), three seconds apart; every one answered 200. The month calendar is in the page's HTML (each month marked active or not, in rows Sow, Plant, Plant out and Harvest), and was read from it. The radishes page was also opened once with the ordinary fetch tool first, whose summary left out the calendar; that was the second request to that page. |
| The crop families and why rotation matters | RHS, "Crop rotation", <https://www.rhs.org.uk/vegetables/crop-rotation> | Fetched once the same day. Used: the four groups (brassicas, legumes, onions, the potato family, roots), that salads and the squash family can go anywhere, that soil pests and diseases attack one family again and again and decline while it is absent, clubroot in brassicas and onion white rot. |
| Which pages exist | The RHS sitemaps, <https://www.rhs.org.uk/sitemap_index.xml>, `sitemap-general.xml` and `sitemap-kontent-ai.xml` | Fetched once each, to find the addresses above rather than guess them. |
| What a robot may read | <https://www.rhs.org.uk/robots.txt> | Read the same day: for all user agents it disallows only `/api/`, Word documents, and paths ending `undefined` or `thank-you`, and names five crawlers that are shut out entirely; no crawl delay. `/vegetables/` is not disallowed. |
| Terms of reuse | The RHS site's footer and its policies page, <https://www.rhs.org.uk/about-us/what-we-do/policies> | No terms of use or reuse policy is linked: the footer says "© The Royal Horticultural Society 2026", and the policies page lists none for website content. So no prose, table or picture is copied. Outpost keeps only facts (which months; which family; hardy or tender; wants much or little water) and says them in its own words, with the source named and linked. |

The months as the RHS calendars gave them (Sow / Plant / Plant out / Harvest), so that
they can be checked again: radishes Mar–Sep / – / – / Jan, Feb, Apr–Dec (the winter months
are winter radishes; the game's salad radishes are harvested April to October, "about four
to six weeks" after sowing, as the page says); salad leaves Feb–Sep / – / – / Apr–Dec;
onions Jan–Apr, Aug–Sep / Mar–Apr, Sep–Nov / – / Jun–Sep; peas Feb–Jun / – / Mar–Apr /
Jun–Oct; carrots Feb–Jul / – / – / May–Nov; beetroot Mar–Jul / – / – / Jun–Oct; kale
Mar–Jun / – / May–Jul / Oct–Apr; broad beans Feb–May, Oct–Nov / – / Apr–May / May–Aug;
potatoes – / Mar–May / – / Jun–Oct; leeks Feb–Jun / May–Jul / – / Jan–Mar, Aug–Dec; garlic –
/ Feb–Mar, Oct–Dec / – / May–Aug; squash Apr–May / – / May–Jun / Jul–Oct.

Only the RHS was used, so no two sources had to be reconciled. Made up for the game, and
said so on the screen: how fast things grow, prices, how long water lasts and how often it
rains.
