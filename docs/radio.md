# Radio: reference sheets, a handbook, radio guides, repeaters and tools on the map

Outpost ships with two kinds of radio material, both usable with no connection at all,
two radio tools on its map, and a place to keep repeaters:

- **Nine reference sheets** about amateur radio, licence-free radio and emergency
  frequencies, written for Outpost from the regulators' own documents. The tables are in
  the sheets themselves, not behind a link. Most of this page is about them: what they
  are, where their facts come from, how they were checked and what their limits are.
  Read the limits before relying on a sheet.
- **Sixteen books from LogBook73**: the Radio Engineering Handbook, a beginner's course
  in ninety chapters, and fifteen companion guides for particular radios. They were
  written for another project by the same author and are copied in, not written for
  Outpost. See [The handbook and the radio guides](#the-handbook-and-the-radio-guides).
- **On the map: Maidenhead locators and a line-of-sight check.** See
  [Radio tools on the map](#radio-tools-on-the-map).
- **Repeaters: a database of your own.** Outpost ships with no repeaters and downloads
  none. You bring in a list as a file, or enter repeaters by hand, and they are then
  found, measured from a place, drawn on the map and written out for a radio with no
  connection. See [Repeaters](#repeaters).

It also has an **HF propagation planner**, which predicts how a shortwave signal gets
between two places through the day. That has a page of its own:
[hf-propagation.md](hf-propagation.md). The **Radio** entry in the sidebar lists all of
these.

## Radio tools on the map

Both are on the **Maps** screen and work from what is installed, with no connection.
[maps.md](maps.md) has the detail; this is what they are and what they are not.

- **Maidenhead locators.** A grid that can be switched on over the map (fields,
  squares, subsquares and extended squares as you zoom in), the locator of a position
  written beside its coordinates wherever the map shows them, and locators of four,
  six or eight characters understood by the map's search box. See
  [maps.md](maps.md#maidenhead-locators).
- **Line of sight between two points.** Pick two points (or take a repeater you hold as
  one of them), give an antenna height at each and a band. Outpost gives the distance, the bearing each way and the locator of
  each end, draws the ground between them with the ray and the first Fresnel zone, and
  says whether the path is clear, or blocked and by how much, and how much of the
  Fresnel zone is clear at its tightest. See [maps.md](maps.md#line-of-sight).

Read these before relying on the line-of-sight check:

- **It is geometry, not propagation.** It does not predict signal strength or
  coverage. A blocked path may still be worked (signals bend over ridges and are
  carried by the weather), and a clear one may still be poor.
- **Terrain only.** It uses the terrain installed on the device: cells about 11.5 m
  wide in Britain at best, from source data that is 30 m over most of the world. It
  knows nothing of buildings, trees or masts.
- **The Earth's curve is the standard radio one**, an Earth of 4/3 its real radius. That
  is an average for the atmosphere, not what the air is doing today.
- **No terrain, no verdict.** Where terrain is not installed for part of a path it says
  which part and does not call the path clear.
- **The bands on offer** are those of the United Kingdom amateur licence from 10 m to
  13 cm, and PMR446, each standing for one frequency near the middle of the band;
  any frequency from 1 MHz to 100 GHz can be typed instead. The band only sets the
  width of the Fresnel zone. Nothing here says who may transmit where: that is in the
  sheets below.

## Repeaters

**Repeaters** (in the command palette, in the phone's More sheet, and behind the
**Repeaters** button on the map) is a database of amateur radio repeaters kept in
Outpost's own database on your machine. It holds what you put in it and nothing else.

Read these before relying on it:

- **Outpost fetches a list only where its publisher allows a program to, and only
  when you press the button.** Each publisher's terms were read on 16 November 2026.
  Two lists can be fetched; the rest, the United Kingdom's and the largest worldwide
  directory among them, are downloaded by hand, and the screen gives the page and the
  steps. Outpost does not read a list out of a web page, sign in, or get round a check
  for a browser. The findings, source by source, are in
  [sources.md](sources.md#repeater-lists).
- **A list is right for its date, and Outpost has no way to know what is on the air
  now.** Every screen says where an entry came from and the date of its data. A list
  over six months old is marked with its age, and one over a year old with a warning.
  A repeater's status is what the list said on that date.
- **Listed positions are often rough, on purpose.** Lists blur the positions of
  private sites, to one decimal place of a degree or a four-character locator.
  Outpost works out how far off a position may be from how it was written (half the
  last decimal place, or half the width of the locator square), marks one that may be
  a kilometre or more out as approximate, and says so again wherever an exact place
  matters: on the map, beside a distance, and in the line-of-sight check.
- **Who may use a repeater.** The screens carry one line: transmitting through a
  repeater needs an amateur radio licence that covers the band, and its keeper may
  restrict who uses it. That is from the United Kingdom licence conditions, under
  which a repeater "may be operated (but not controlled) by other radio amateurs" and
  its keeper "takes all reasonable steps to ensure that the Repeater is only used by an
  Amateur", and from Ofcom's guidance for licensees, section 4.5.3, which lists
  "restricting access to the station to certain licensees" among a keeper's remedies.
  Both documents are in Explore under Radio communications. Other countries have their
  own rules. This is not legal advice.

### Where to get a list

**Get a list**, below the lists you hold, sets out the sources by country. The country
your map was last looking at comes first, or failing that the one most of your saved
places are in; Outpost does not ask where you are. Each source is one of three kinds:

- **Outpost can get this list.** **Get the list** has the server fetch the one file
  from the publisher, once. That is the only moment that needs the internet. What
  comes back is shown exactly as an imported file is, and nothing is kept until you
  import it; if you close the box instead, the file is forgotten. The list then says
  where it was fetched from and when, and on which terms as they were read, and
  **Get it again** on the source (or **Bring up to date** on the list) fetches a newer
  copy into the same list.
- **To be downloaded by hand.** The publisher's page opens in your browser, the steps
  are written out, and **Import the file** takes what you saved.
- **Nothing usable here.** Said so that nobody looks twice.

Under each is **Why, and its terms as read**: the reason it is that kind, what the
publisher's terms say and where and when they were read. As shipped:

| Country | List | Kind |
| --- | --- | --- |
| United Kingdom | RSGB ETCC, ukrepeater.net | By hand: its server turns a program away |
| Ireland | IRTS voice repeaters (CHIRP file, no positions) | Outpost can get it |
| Worldwide | Hearham, about 23,000 repeaters with approximate positions, about 2,400 of them in or near the United Kingdom and Ireland | Outpost can get it |
| Worldwide | RepeaterBook | By hand: its terms forbid a program |
| Worldwide | Open Repeater | By hand |
| Australia | WIA repeater directory (no positions) | By hand: all rights reserved |
| Australia | ACMA register | Nothing Outpost can read |
| Finland | SRAL automatic stations | By hand, for now |
| Europe | przemienniki.net and repeate.rs | Nothing usable: maps only |

Things to know about fetching:

- **The file cannot be checked against a checksum**, as a catalogue download is,
  because its publisher makes it afresh each time it is asked for. The preview is the
  check: look at how it was read before you keep it.
- **Outpost leaves a publisher alone between requests**: ten seconds at least, a
  minute for Hearham, and for as long as the publisher says if it answers that it is
  busy. A second press too soon is refused with the number of seconds left.
- **If the publisher's server sends a web page in place of the file, refuses, or wants
  a browser**, Outpost says so and stops. It does not try another way. Download the
  file yourself from the page the source names.
- **The date of the data** is the publisher's own date for the file where its server
  gives one, and otherwise the moment it was fetched.
- **An administrator can change any of this**: which sources there are and what
  Outpost does with each is one file. See [Changing the sources](#changing-the-sources).

### Getting a list in

**Import a list** takes one file, up to 16 MB and 100,000 rows: a CSV, or a JSON file
that is a list of records. Nothing is kept until you have seen how it was read:

- **What it was read as.** Three layouts the RSGB's ETCC offers on ukrepeater.net are
  recognised by their headings (voice repeaters; voice repeaters and gateways with
  status; all modes), as are CHIRP's CSV, the Wireless Institute of Australia's
  directory, Hearham's JSON list and Outpost's own export. Any other CSV with a row of
  headings, or JSON list, is read by matching its headings or field names to what they
  usually mean ("Freq", "Shift", "Grid", "Town"). In a CHIRP file a channel named with
  a callsign and then a town ("EI2ABC Somewhere") is read as both.
- **The first rows as they would be kept**, so that you can see the output and the
  shift are the right way round. In every list Outpost keeps the **output** as the
  frequency the repeater transmits on, which is the one you listen on.
- **How the columns are read**, column by column, which you can change. A list read
  by its headings is shown with this open.
- **Which unit a frequency is in.** A unit written after the number ("145.6625 MHz")
  comes first, then the unit the column's heading names ("TX MHz", "Frequency (kHz)",
  "Freq GHz"); the layouts Outpost knows by name are all in megahertz. A number with
  no unit anywhere is read as megahertz, kilohertz and hertz, and kept when only one
  of those is a frequency between 1 MHz and 250 GHz, or only one falls in an amateur
  band (10 m to 1 mm). When nothing tells the readings apart ("7100" could be 7100 MHz
  or 7.1 MHz) the row is not kept and the preview says so: name the unit in the
  heading, or after the number.
- **The rows that cannot be kept**, each with its line and the reason: no callsign,
  a frequency that is not one or that could be two, a position that is not on Earth.
- **What is rough about it**: how many entries have no position, how many positions
  are approximate.
- **Which of them you already hold**: see [The same repeater twice](#the-same-repeater-twice).

You then give the list a name, say who publishes it, and give **the date of its
data**: the day the file was made or fetched from its publisher, not the day you
import it. A date in the future is refused.

What is read from a file: callsign, output and input (or a shift and its direction),
band, modes (FM, DMR, D-STAR, Fusion, NXDN, P25, M17, TETRA), CTCSS tone, DCS code, DMR
colour code, talkgroups, other access details (a 1750 Hz tone burst is recognised in a
tone column), channel name, town, region, country, latitude and longitude, locator,
aerial height, keeper, status and notes. A list with a locator and no coordinates is
placed at the middle of each square. CHIRP files hold no positions at all: their
entries are listed, and are not on the map until you give one a position.

**Add by hand** makes an entry of your own, with frequencies in megahertz and a
position as coordinates, a grid reference or a locator.

### Bringing a list up to date

**Bring up to date** on a list takes a newer copy of the same file. Before anything
changes you are shown how many entries are new, how many changed, how many are the
same, and how many are no longer in the file. Three things are promised:

- **An entry you changed is left as you have it.** If the list now says something
  different from what it said when you changed the entry, you are told how many such
  entries there are and which, and they are replaced only if you tick the box. What
  the list says now is kept beside your version: the repeater's own screen shows the
  two side by side, with **Put back to what the list says**.
- **An entry you removed stays removed.** It can be brought back from the list's
  menu.
- **An entry that has left the list is removed** unless you ask to keep those, and
  never if you had changed it.

Entries are matched from one copy to the next by the list's own number for them where
it has one (the ETCC's list with status does), and otherwise by callsign and output
frequency. Removing a list removes its entries, your changes to them included, after
saying so; entries from other lists and your own are not touched. The file itself is
never kept by Outpost.

### The same repeater twice

A repeater is often in more than one list (a national list and a worldwide one, or a
list and an entry you made), and sometimes twice in one file. Outpost takes two
entries to be **the same repeater** when their callsigns are the same, whatever the
case, spaces or hyphens, and their output frequencies are within 3 kHz of each other.
Lists round a frequency to the kilohertz, and the closest channels are 6.25 kHz apart,
so that never joins neighbours.

Two entries on one frequency at nearly one place with **different callsigns** (within
2 km, or closer than their listed positions can be told apart, and never more than
15 km) **may be** the same repeater spelt two ways. Outpost shows these and never acts
on them by itself: they can also be a repeater and a gateway that share a site.

**When you import**, the preview says how many rows are already held in another list
or by hand, how many of those you typed or changed, how many repeat an earlier row of
the file, and how many may be one you hold under another callsign. A few of each are
shown side by side: one column each, a row for each part in which they differ. You
choose, for that import:

- **Show each repeater once, with the newer data** (the default on the screen).
  Whichever has the later date of data is shown and the other is set aside. Anything
  you typed or changed by hand is carried onto the one that is shown: your tone, your
  notes, your position. That entry is then marked "Changed by you", with what its
  list says beside it, like any entry you change.
- **Leave what I hold as it is.** The incoming ones are set aside. Each repeater is
  shown once, as you hold it now.
- **Keep both.** Every row is brought in and nothing you hold is touched. The
  repeaters are then listed twice until you merge them. This is what the API does
  when an import does not say.

Nothing is deleted by any of the three: an entry that is set aside can be brought
back from its repeater's page.

**Find duplicates**, beside the lists, does the same for what is already held. Each
group is shown side by side, with the entry Outpost would keep already chosen: the
one from the list with the newest data. You can choose another and merge that group,
or **Merge all** the certain ones at once. The possible ones are merged only one pair
at a time, when you say so of that pair.

What merging does, and does not do:

- **Nothing is deleted.** The other entries are set aside, not removed. The entry
  that is kept says so on its own screen, under **Held more than once**, and
  **Separate them** brings them back.
- **What you typed is carried over.** Every part you typed on an entry made by hand,
  and every part you changed on an entry of a list, goes onto the entry that is kept,
  unless you had typed that part there too. Notes you wrote on both are joined.
- **Gaps are filled, in a merge you ask for.** A part the kept entry leaves empty is
  taken from another that has it, and modes are joined: one list saying FM and
  another FM and DMR is a repeater with both. An import does not do this: a new row is
  not filled in from another list.
- **A list is still a whole list.** An entry set aside stays in its list, so bringing
  that list up to date does not bring it back as new, and does not ask again.
- **Removing a list shows its repeaters from the other list again.** If the entry
  that was kept goes, because its list was removed or it left its list in an update,
  whatever was set aside for it comes back.
- **Removing a repeater removes it**, not one of its listings: what was set aside for
  it stays out of sight.

The list, the map, the counts, the search across everything and an export all show a
merged repeater once.

### Using it

- **The list** filters by band, by mode, and by distance from a place: a saved
  place, the middle of the map as you last left it, where the device is, or a position
  or locator you type. With a place chosen, entries are in order of distance, each with
  its distance and compass bearing; those with no position come last. Distances are
  measured on the great circle from the listed position, and say "about" for a
  position that is approximate.
- **Finding.** The box finds by callsign, by any part of a town, keeper, channel or
  locator, and by frequency: `145.7` finds every output or input from 145.700 to
  145.799 MHz. Outpost's search across everything finds repeaters the same way, under
  their own heading, **Repeaters**.
- **On the map.** See [maps.md](maps.md#repeaters-on-the-map).
- **One repeater** has a screen of its own: what to listen on and transmit on, access,
  modes, status with the date it was said, position with its locator and how exact it
  is, the listed aerial height, distance and bearing from a chosen place, **Show on
  the map** and **Check line of sight**.

### Taking a set out

**Export these** writes the repeaters the list is showing: the filters choose the set,
nearest first when a place is chosen, and you say how many at most.

- **CHIRP (CSV)**, for programming a radio. `Frequency` is the repeater's output,
  `Duplex` and `Offset` give the shift, `Tone` is `Tone` with the CTCSS tone or `DTCS`
  with the code. CHIRP has no column for a tone burst, a DMR colour code or a
  talkgroup, so those are written in each channel's comment with the town and the
  source and date of the entry. A repeater with no input listed is written with
  `Duplex` `off`, which tells a radio not to transmit on it. At most 2,000 channels.
- **Outpost (CSV)** carries every field, and reads back with nothing lost.

**Check the file before you transmit.** It is made from a list, a list goes out of
date, and what CHIRP's columns cannot say is only in a comment. The export says this
where the file is offered. The CHIRP layout was taken from CHIRP's own source on
16 November 2026 and tested by reading Outpost's files back with Outpost's own reader;
**it has not been loaded into CHIRP or into a radio.**

### Changing the sources

The sources are declared in one file, `catalog/repeater-sources.json`, in the way the
catalogue's manifests declare download hosts: Outpost fetches a list from the address
a source of kind `fetch` names and from nowhere else. To change what Outpost does with
a publisher, or to add a source of your own, write a file of the same format at
`<data directory>/catalog/repeaters/repeater-sources.json` and restart:

```json
{
  "schemaVersion": 1,
  "regions": [{ "id": "valley", "name": "Our valley", "bbox": [-3.4, 54.3, -2.9, 54.7] }],
  "sources": [
    {
      "id": "club-list",
      "region": "valley",
      "publisher": "Fell Radio Club",
      "name": "Club repeater list",
      "covers": "The club's own repeaters.",
      "pageUrl": "https://club.example.org/repeaters",
      "kind": "fetch",
      "why": "It is our own list.",
      "termsUrl": "https://club.example.org/repeaters",
      "termsNote": "Ours to use.",
      "termsRead": "2026-11-16",
      "fetch": { "url": "https://club.example.org/repeaters.csv", "waitSeconds": 10 }
    }
  ]
}
```

- A source with the `id` of a shipped one takes its place. That is how to make the
  IRTS's list a `link`, or to make a `link` a `fetch` once its publisher has told you
  that a program may fetch it. The decision and the terms are then yours to record in
  `why`, `termsNote` and `termsRead`.
- `"replaceShipped": true` leaves out every shipped source.
- `kind` is `fetch` (needs `fetch.url`), `link` (needs `steps`) or `none`.
- A shipped source must be `https` and leave at least ten seconds between requests. A
  file of your own may name an `http` address and a shorter wait, for a server of
  your own. A source on this computer or a private network is refused unless the
  server was started with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.
- A file that cannot be read is reported in the server's log and on the screen, and
  none of it is used. `pnpm catalog:validate` checks the shipped file.

### Limits

- **No list comes with Outpost.** Two can be fetched when you ask; the rest arrive as
  a file you downloaded. Nothing is fetched on a timer: a list is brought up to date
  when you press the button.
- **A country not in the list of sources was not looked at**, or was looked for and
  nothing was found: see [sources.md](sources.md#repeater-lists). The worldwide
  sources cover it as far as they go.
- **The fetch was tested against a stand-in, not a publisher.** The tests fetch
  made-up lists from a server of their own. Hearham's list and the IRTS's file were
  each fetched once by hand on 16 November 2026 and read by Outpost's reader
  (22,816 of 22,947 rows, and 45 of 45), as was the WIA's file (914 repeaters from
  1,023 rows); **"Get the list" itself has not been pressed against either site.**
- **Hearham's list holds many repeaters twice**: 1,454 of its rows repeat an earlier
  row by callsign and frequency. Choose **Leave what I hold as it is** or **Show the
  newer data** when importing it, or use **Find duplicates** afterwards. Measured with
  that list on an Apple M2 Max while other work was running: the preview half a
  second, the import four seconds, **Find duplicates** over the 21,362 it leaves
  0.7 seconds. The server answers little else while each of those is worked out.
- **Positions are missing from the IRTS's and the WIA's files**, which give none, so
  those entries are listed and are not on the map.
- **The steps for RepeaterBook and for the Finnish site were not walked through in a
  browser.**
- **Possible duplicates cannot be dismissed.** A pair that is offered as possibly the
  same, and is not, is offered again each time.
- **Lists are CSV, or JSON lists of records.** KML, GPX, ADIF, spreadsheets, a radio's
  own memory image and the programming files of particular radios other than CHIRP's
  CSV are not read.
- **Tested with made-up stations**, in the layouts described. No real list is in the
  repository, and none was run through the tests.
- **Fifty thousand entries were measured on an Apple M2 Max, not on a Raspberry Pi**:
  import 1.5 to 3 seconds for a 5.6 MB file; the first page of the list 3 ms; all of
  them sorted by distance from a place 26 ms; finding by callsign or town 6 to 13 ms;
  the map's request for the whole world 25 ms and for a country under 1 ms; the search
  across everything 3 ms more. A Pi 4 is several times slower. To measure on your own
  machine: `OUTPOST_SCALE=1 pnpm exec vitest run test/repeaters-scale.test.ts` in
  `apps/server`.
- **Out of reach of the server, a phone has no repeaters.** They are not among the
  things a phone keeps ([offline.md](offline.md#a-phone-out-of-reach-of-the-server)).
- **A printed map does not show them.**
- **Repeaters do not come back from a portable drive.** A drive carries them, since it
  carries the database, but bringing a drive's changes home covers pages, documents,
  saved places and routes only.
- **Backups hold them**, as part of the database.
- **"Erase everything" removes them**: every list you imported, every entry you added
  or changed, and the marks of entries you removed. The summary shown before it starts
  says how many repeaters in how many lists.

## Where to find the sheets

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
