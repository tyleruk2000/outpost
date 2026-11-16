# Radio: reference sheets, a handbook and radio guides

Outpost ships with two kinds of radio material, both usable with no connection at all:

- **Nine reference sheets** about amateur radio, licence-free radio and emergency
  frequencies, written for Outpost from the regulators' own documents. The tables are in
  the sheets themselves, not behind a link. Most of this page is about them: what they
  are, where their facts come from, how they were checked and what their limits are.
  Read the limits before relying on a sheet.
- **Sixteen books from LogBook73**: the Radio Engineering Handbook, a beginner's course
  in ninety chapters, and fifteen companion guides for particular radios. They were
  written for another project by the same author and are copied in, not written for
  Outpost. See [The handbook and the radio guides](#the-handbook-and-the-radio-guides).

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
  document or page fetched on 2026-11-15 (one, the MCA's guidance note on VHF, on
  2026-11-16) from the regulator or body responsible:
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
  and 47 CFR Part 80, which give channel numbers only for channels 16, 70 and 9. On
  2026-11-16 the MCA's guidance note MGN 324 (M+F) Amendment 2 was read: it names
  channels 13, 6, 8, 72 and 77 and what each is for, without frequencies, and the
  emergency frequencies sheet now quotes it.
- **CHU (Canada)**: the National Research Council's site refused the check, and refused
  it again on 2026-11-16 (HTTP 403 for the station's page, though its `robots.txt`
  admits ordinary clients). The row is marked "not verified".
- **BBC Radio 4 long wave (198 kHz)**: reported closed on 27 June 2026, but only a
  secondary source could be read. The sheet says so and tells the reader not to plan on
  it. The end of the dedicated long wave Shipping Forecast on 31 March 2024 is confirmed
  by the MCA. The Met Office's factsheet on the Shipping Forecast, read on 2026-11-16,
  was written in January 2025, before the reported closure, and says only that the
  forecast can be received on long wave "until the transmitter is switched off". The
  BBC's own pages were not read: no address for one was found, and the search service
  used to look for one is refused by the BBC.
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
- **A 70 cm calling frequency for Region 1**, the frequencies of marine VHF channels
  other than 16, 70 and 9, the channel numbers of 156.300 and 156.650 MHz, and which of
  marine channels 62, 63 and 64 has which frequency.
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

## Keeping the sheets right

To correct or update a sheet: edit the file in `catalog/bundled/radio/`, re-check every
changed figure against its source, update the date under "Checked", and raise `version`
(and `lastVerified`) on its entry in `outpost-reference.json`, so that people who added
the old copy are offered the new one. Then run
`node apps/server/src/cli/validate-catalog.ts` and the catalogue tests. The rules for
what may go in `catalog/bundled/` are in [`catalog/README.md`](../catalog/README.md).

## The handbook and the radio guides

### What they are

| Book | What it holds |
| --- | --- |
| Radio Engineering Handbook | A beginner's course in how radio works, from electromagnetic waves to a first station: 90 chapters in eleven parts (foundations, signals and modulation, receiver performance, building blocks, antennas and feedlines, propagation and bands, amateur radio, digital modes, space, tools and projects, reference), with a glossary. It deliberately leaves out the details of any one country's licence. |
| Companion guides | One book for each of fifteen radios and interfaces: Baofeng UV-5R and GT-5R Mini, Quansheng UV-K5, Radtel RT-950 Pro, RT-4D and RT-6D, Retevis RT95, TIDRADIO TD-H3, Yaesu FT5DR, Xiegu G90, X6100 and X6200, (tr)uSDX, Digirig Mobile and DigiPi. Each explains the radio's menus and controls, gives ready-made configurations, troubleshooting and a quick reference, and points to the handbook for the theory behind a setting. |

They were written by Tyler Allen for [LogBook73](#where-they-come-from), an amateur radio
logbook, and are included under LogBook73's MIT licence. Together they are 328 chapters
and about 5.5 MB of Markdown, with 563 diagrams and 149 signal figures drawn from the
text.

**They are not the manufacturers' manuals and not legal advice.** Each guide carries the
date LogBook73 last reviewed its menu and specification claims, what the review was
based on, the models, regions, manuals and firmware it was checked against, and the
sources it started from. **Outpost has not checked any of it against the manufacturers'
manuals again.** Firmware changes, and a radio sold under one name can differ from one
market to another: where a guide and your radio disagree, believe the radio and its own
manual. What you may transmit is set by your own licence and your country's rules.

### Where to find them

In **Explore**, under **Radio communications**, each book says "Book, N chapters" and
"Included with Outpost"; "Who wrote it and how it was reviewed" opens the review note.
**Add to library** copies the book in there and then, with no connection. Two packs
gather them: **Learning amateur radio** (the handbook with two of the reference sheets)
and **Radio companion guides** (all fifteen guides and the handbook). The handbook is
also in the UK and US amateur radio packs. To add only the guide for your own radio,
find it under Radio communications.

A book is kept whole. It is listed once, under **Books** in the Library's Collections
tab, and its page is its contents: parts, chapter numbers, titles and one-line
summaries. Each chapter is a document of its own, so search lands on the chapter (and
says which book it is from) and a phone never loads a whole book to show one page.
A chapter says which book it is in and how far through, and ends with the previous and
next chapters and the way back to the contents. The chapters are not listed one by one
among your documents; typing part of a chapter's name in the Library's filter finds it.

Every book ends with **About this book**: who wrote it, the review in full with links
to its sources, what was not carried over, and the licence text.

### Links, diagrams and figures

- **Links between chapters** open the chapter in Outpost. A guide's links to the
  handbook work when the handbook is in your library; when it is not, the link keeps its
  words, has a dotted underline, and leads to the handbook in Explore, where it can be
  added. A note at the top of the chapter says so once.
- **Diagrams** (flow charts and sequence diagrams, written in the files as Mermaid
  text) are drawn when they come near the screen and shown as pictures that follow the
  light or dark theme. **Signal figures** (waveforms, spectra, filter and SWR curves,
  radiation patterns, constellations, waterfalls, annotated radio displays) are drawn
  from a short description in the file. On a phone a figure keeps a readable size and
  scrolls sideways inside its own box; **View larger** opens it on its own. A diagram's
  text is under **Diagram as text**.
- **Search** reads the chapters' words. Of a signal figure it reads the title and
  caption; of a diagram, nothing: the boxes' labels would turn up in results as
  fragments, and the paragraph beside a diagram already says what it shows.

### What was not carried over

- **Self-check quizzes and reading progress.** LogBook73 tracks which chapters have been
  read and asks questions at the end of a part. Outpost does neither.
- **Pop-up definitions** of terms. The handbook's glossary chapter holds most of the
  same definitions.
- **LogBook73's own screens** (its map, logbook, band tools, Morse practice and so on).
  Where a chapter linked to one, the words are kept and the link is not: 123 links in
  all. Sentences that tell the reader to do something "in LogBook73" are left as their
  author wrote them.
- **Thirteen illustrations** in eleven handbook chapters (about 25 MB of pictures). The
  Markdown view does not show pictures; the description and caption written for each
  one are shown in its place.
- Nothing else: there is no embedded HTML in the chapters beyond line breaks inside
  diagram labels, and every table, diagram and figure is drawn.

### Where they come from

The books are generated from a checkout of LogBook73 by
`apps/server/src/cli/import-logbook73.ts`. It reads LogBook73's two registries
(`packages/content/src/handbook.ts` and `guides.ts`) and the Markdown they name, and
writes `catalog/bundled/logbook73/` (one folder per book, one file per chapter),
`catalog/manifests/logbook73.json` (one entry per book; its description records the
LogBook73 commit) and the two packs it owns in `catalog/packs.json`. The files it
writes are committed: LogBook73 is not needed to build or run Outpost.

The chapters are their author's text and are not edited. The importer changes three
things because the format needs them: a chapter with no title of its own is given its
registry title as a first heading; links to other chapters become
`outpost:entry/<entry id>/<chapter key>` links (see
[catalog/README.md](../catalog/README.md#links-into-the-catalogue)); and links to
LogBook73's own screens keep their words and lose the link. It writes the last chapter
of each book from the registry. Chapters LogBook73 marks as planned are left out.

To refresh the books:

```
pnpm catalog:import-logbook73 /path/to/LogBook73
pnpm catalog:validate
pnpm --filter @outpost/server test
pnpm --filter @outpost/web test
```

The importer refuses a checkout with uncommitted changes to the content, reports any
link to a chapter or heading that does not exist, and gives the same output for the
same checkout whenever it is run. A book's `version` moves only when something in that
book differs from what is already here (it becomes the date of the LogBook73 commit),
so people who added a book are offered an update exactly when there is one. Its
`lastVerified` is the guide's own review date, not the day of the import. The server
and web tests read every chapter: every link names a chapter that exists, every
diagram is one Mermaid can read, and every signal figure draws.

The signal figures are drawn by a port of LogBook73's `RadioViz` component and its
maths (`apps/web/src/features/library/figures/`), also MIT and by the same author.
