# Sources for the catalogue

This page lists the information sources that have been considered for Outpost's
catalogue, says what Outpost does with each one, and gives the reason wherever a source
is not used. It was last checked on 2026-11-15.

The catalogue itself lives in [`catalog/manifests/`](../catalog/manifests):

| Manifest | What it holds | Entries |
| --- | --- | --- |
| `kiwix-essentials.json` | A starter selection of archives from the Kiwix library | 61 |
| `kiwix-more.json` | Further Kiwix archives: programming documentation, more Project Gutenberg shelves, medical and science references, courses, talks, preparedness | 62 |
| `official-publications.json` | Individual PDF handbooks, guides and textbooks, each fetched from its publisher's own website | 50 |

A manifest only describes content and says where it comes from. Nothing is bundled
with Outpost, and nothing is fetched until a person asks for it. The format and the
rules for entries are in [`catalog/README.md`](../catalog/README.md).

## Status of each source

"Via Kiwix" means the source is packaged as a ZIM archive by the Kiwix project and
Outpost fetches that archive from Kiwix. "Direct" means an entry points at a file on
the publisher's own website. Links in the last column go to the page that was read on
2026-11-15; where a page could not be read, that is said.

### General

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 1 | Kiwix Library (library.kiwix.org) | A library of websites packaged as ZIM archives for offline reading | **Built in, and 123 catalogue entries** (61 in `kiwix-essentials`, 62 in `kiwix-more`). Each entry names a book; Outpost looks the book up in the library's feed at download time and takes the address, size and checksum from there. | No single licence: every book keeps its publisher's licence. Entries state the licence where it is known and say "See source" where it has not been checked. Kiwix's English terms-of-use page returned "not found" on the day, so no terms page is linked. |
| 2 | Kiwix direct downloads (download.kiwix.org/zim/) | The file servers behind the library | **Built in.** Files are fetched from these servers and their mirrors, but manifests never contain the address of a `.zim` file: Kiwix rebuilds most books every month or two and removes old builds. | As for source 1. |
| 3 | Project Gutenberg (gutenberg.org) | Public-domain books | **Via Kiwix: 9 entries.** Seven shelves and the complete English library in `kiwix-more` (medicine, agriculture, technology, science, geography and recreation, naval science, military science, everything), one shelf in `kiwix-essentials`. **No direct entries**: on 2026-11-15 www.gutenberg.org answered every request from the catalogue check with "403 Forbidden", including `robots.txt` and the [robot access policy](https://www.gutenberg.org/policy/robot_access.html), so the policy could not be read and no file could be verified. | Entries are marked "Public domain in the United States", as Project Gutenberg describes its books. The policy page linked here was **not** read, for the reason given. |
| 4 | OpenStax (openstax.org) | Peer-reviewed college textbooks from Rice University | **Direct: 9 entries** in `official-publications` (Anatomy and Physiology 2e, Microbiology, Clinical Nursing Skills, Biology 2e, Chemistry 2e, College Physics 2e, Astronomy 2e, Precalculus 2e, Introductory Statistics 2e). The PDF addresses come from OpenStax's own catalogue. The Kiwix library has no OpenStax archive. | CC BY-NC-SA 4.0. This is stated inside each PDF and in the licence fields of [OpenStax's catalogue](https://openstax.org/apps/cms/api/v2/pages/207/). Note that this is a non-commercial licence, not CC BY. |
| 5 | Internet Archive (archive.org) | A very large archive of books, recordings, software and web pages | **Add your own files.** Not in the catalogue: rights differ from item to item, so no general entry would be honest. | The [terms of use](https://archive.org/about/terms) page is drawn by a script and could not be read by the catalogue check. Read the rights statement on each item. |
| 6 | NASA (nasa.gov) | The US space agency | **Direct: 2 entries** from the NASA Technical Reports Server (NASA Systems Engineering Handbook; Fastener Design Manual). **Via Kiwix: 2 entries** in `kiwix-more` (Astronomy Picture of the Day; TED talks about NASA). | Each [Technical Reports Server record](https://ntrs.nasa.gov/api/citations/20170001761) gives the document's copyright status; both documents are marked as public use permitted. Astronomy Picture of the Day [says](https://apod.nasa.gov/apod/lib/about_apod.html) that NASA images are in the public domain but that some pictures are copyrighted by the people credited. |

### Survival and preparedness

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 7 | Ready.gov | The US government's public preparedness campaign, run by FEMA | **Direct: 4 entries** (Are You Ready?; the full set of hazard information sheets; Emergency Supply List; Disaster Preparedness Guide for Older Adults). **Via Kiwix: 1 entry** in `kiwix-essentials` (the whole site). | The [publications page](https://www.ready.gov/publications) says the files may be downloaded at no cost and reproduced, provided nothing is altered and no endorsement is implied. |
| 8 | FEMA (fema.gov) | The US Federal Emergency Management Agency | **Not integrated directly.** www.fema.gov answered the catalogue check with "Access Denied" (HTTP 403), so nothing hosted there was fetched. Ready.gov's page for Community Emergency Response Teams redirects to fema.gov, so the CERT Basic Training manual could not be looked for. FEMA publications hosted on Ready.gov are covered by source 7. | Could not be read. |
| 9 | Survivor Library (survivorlibrary.com) | A private collection of scanned older books on pre-industrial skills | **Not in the catalogue.** It is a third party's collection of other people's works, and the site's home page states no licence for the scans. Kiwix does publish the site as an archive (`survivorlibrary.com_en_all`, about 220 GB); it has been left out until someone has checked the rights. | No licence statement found on the [home page](https://www.survivorlibrary.com/). |
| 10 | TruePrepper survival PDF collection | A preparedness website's page of downloadable manuals | **Not in the catalogue.** The page re-hosts manuals written by other publishers. The site says it will not infringe copyrights but gives no licence for the individual files, and the site itself is marked "All rights reserved". Where a manual has an official publisher (FEMA, the US Army, the FAA), the catalogue points at that publisher instead. Kiwix publishes the site's own articles as `trueprepper.com_en_all` (about 1.4 GB); it has been left out for the same reason. | [The page](https://trueprepper.com/survival-pdfs-downloads/): "All rights reserved". |

### Medicine and food

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 11 | CDC (cdc.gov) | The US Centers for Disease Control and Prevention | **Via Kiwix: 1 entry** in `kiwix-essentials` (Travelers' Health). **No direct entries**: www.cdc.gov answered the catalogue check with HTTP 403, so no file there was fetched. | Could not be read. |
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
| 19 | ARRL (arrl.org) | The US national association for amateur radio | **Not integrated.** ARRL's [copyright page](https://www.arrl.org/copyright) reserves all rights and forbids storing its publications in a retrieval system. Radio material in the catalogue comes from elsewhere: the amateur radio and signal processing Stack Exchange archives, and the National Weather Service's radiofacsimile schedules. | All rights reserved. |
| 20 | NOAA (noaa.gov) | The US National Oceanic and Atmospheric Administration, which includes the National Weather Service | **Direct: 6 entries** from the National Weather Service (Weather Spotter's Field Guide; Thunderstorms, Tornadoes, Lightning; Winter Storms; Cloud Chart; Observing Handbook No. 1; Worldwide Marine Radiofacsimile Broadcast Schedules). | Public domain unless noted otherwise, per the [NWS disclaimer](https://www.weather.gov/disclaimer), which asks that the material is not claimed as your own or altered and then presented as official. |
| 21 | UIAA (theuiaa.org) | The International Climbing and Mountaineering Federation | **Direct: 2 entries** from its Medical Commission (Emergency Field Management of Altitude Sickness; Water Disinfection in the Mountains). | The [medical advice page](https://www.theuiaa.org/mountain-medicine/medical-advice/) offers the papers for free download. No reuse licence is stated there or in the papers, and the site's terms page had no readable text, so the entries say "See source". |

### Maps and geospatial data

| # | Source | What it is | How Outpost uses it | Licence and terms |
| --- | --- | --- | --- | --- |
| 22 | OpenStreetMap | The free, community-made map of the world | **Built in.** The Maps screen downloads regions cut from the Protomaps build of OpenStreetMap data; see [maps.md](maps.md). The OpenStreetMap wiki is also in `kiwix-essentials`. | Open Database Licence, per the [copyright page](https://www.openstreetmap.org/copyright). The credit is shown on the map. |
| 23 | Geofabrik downloads (download.geofabrik.de) | Regional extracts of raw OpenStreetMap data, updated daily | **Not integrated.** The extracts are raw data, not tiles. See [the note below](#geofabrik-extracts-and-what-outpost-uses-instead). | [ODbL 1.0](https://download.geofabrik.de/); the service is offered free of charge by Geofabrik. |
| 24–25 | Natural Earth | Public-domain map data at small scales | **Built in.** The 1:110m data draws the simple world outline beneath the map and the boxes of the country presets. | Public domain, as recorded in [maps.md](maps.md). The Natural Earth terms page did not answer on the day (two time-outs), so it was not read again. |
| 26 | USGS (usgs.gov) | The US Geological Survey | **Direct: 3 entries** (Topographic Map Symbols; Finding Your Way with Map and Compass; Map Projections: A Working Manual). USGS map and elevation data are not integrated. | The Publications Warehouse [says](https://pubs.usgs.gov/documentation/faq) that PDF files of USGS-published reports are in the public domain, though some illustrations are used with permission. The main usgs.gov site returned an empty page to the catalogue check. |
| 27 | NASA Earthdata Search | A search tool over NASA's Earth-observation datasets | **Not integrated.** It is an interactive search over scientific data files, not a set of documents or map tiles; nothing in it is a single stable file that the library or the map could use as it stands. | NASA's [data use guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance) says the data are freely accessible and asks for citation. |

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
- "Public domain (US Government work)" is used for documents published by US federal
  agencies. Such documents can still contain photographs or figures owned by someone
  else; the note says so where this was seen.
- Several licences in the catalogue do not allow commercial use (CC BY-NC-SA for
  OpenStax, FAO's terms). That does not affect downloading and reading, but it matters
  if you pass the files on.
- Outpost never redistributes anything. A download goes from the publisher's server to
  your disk. What you do with the file afterwards is governed by its licence.

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
  `--online` all 173 entries resolve at their source.
- **Conduct.** Requests were made one at a time with a generic client name and no
  personal information. `robots.txt` was read where present, and the ten-second crawl
  delay that the WHO and FAO repositories ask for was kept between downloads. The
  validator's online check keeps the same ten seconds between requests to any one
  host. A catalogue refresh in the app does not contact these publishers at all: every
  direct entry pins its size and checksum, and the download itself is the check. Hosts that
  refused the client (gutenberg.org, fema.gov, cdc.gov) were left alone after one or
  two requests, and nothing was done to get round the refusal. No search pages were
  crawled and no site was scraped.

## Sources that are not integrated: what you can do

- **Add your own files.** Download the file yourself from the source, on terms you are
  satisfied with, and add it under **Library → Add documents**. It is stored on your
  disk, indexed for search, and opens in the built-in viewer like any other document.
  This is the right route for Internet Archive items, single Project Gutenberg books,
  CDC and FEMA guides, and anything you hold a licence for.
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
