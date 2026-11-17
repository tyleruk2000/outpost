# Frequencies to listen to

**Radio → Frequencies to listen to** (`/radio/frequencies`) is a reference list of where
to tune to hear the time, news, warnings, weather and other people when the internet is
out. It is for listening: the reader has a radio of some kind (a kitchen FM and medium
wave set, a shortwave portable, a scanner, a marine or CB set, an amateur transceiver or
an SDR) and wants to know what is worth trying.

The list ships with Outpost. Nothing is fetched to show it, and nothing on the screen
reaches out: each entry names the page it was checked against as a plain link, which a
person may open in their own browser when they have the internet.

## What is covered

As shipped (all checked on 17 November 2026): 277 entries and 12 guides, naming 90
countries and the regions below. 238 are on the air as their sources say, 22 only some of
the time or when activated, 13 closed (kept with the date), and 4 could not be checked
against a primary source and are hidden unless asked for.

| Kind | Entries | Where |
| --- | --- | --- |
| Time signals | 25 | US, Canada, Mexico, UK, Ireland, Germany, France, Switzerland, Italy, Poland, Finland, Russia, Belarus, Kyrgyzstan, China, Japan, Korea, Australia, Argentina, Brazil, and the ITU regions |
| Emergency broadcasting | 21 | UK, Ireland, US, Canada, Germany, Austria, Switzerland, Sweden, Norway, Denmark, Finland, Estonia, Lithuania, Czechia, Netherlands, Belgium, France, Spain, Italy, Japan |
| News broadcasters | 33 | National long and medium wave and FM/DAB for the UK, Ireland, France, Luxembourg, the Isle of Man, Poland, Romania, Hungary, the US, Japan, Brazil and Argentina; international shortwave from Taiwan, the US, Czechia, Vietnam and others, with their target areas |
| Weather | 63 | NOAA Weather Radio, Canada, the UK's shipping and coastguard broadcasts, NAVTEX stations in 39 countries and territories, radiofax, VOLMET, US Coast Guard voice, German, French, Norwegian and Monaco broadcasts |
| Distress and calling | 22 | Worldwide marine, aviation and beacon frequencies, with national detail for the UK, US, Canada, Ireland and Australia |
| Amateur radio | 31 | IARU Regions 1, 2 and 3, and national emergency frequencies for the UK, Germany, Austria, Switzerland, France, Ireland, the Netherlands, South Africa, Japan, Australia, New Zealand and the US |
| Licence-free radio | 21 | CEPT countries, UK, Germany, US, Canada, Australia, New Zealand, Japan, Malaysia, South Africa |
| Bands, for hunting | 59 | Worldwide and by ITU region, with Japan's FM, the old OIRT band, UK CB and PMR446 |

Entries for one country also show for anyone in it when they apply to its ITU region or
to the CEPT countries, or worldwide.

The kinds, in the order the screen gives them:

1. **Time signals.** Standard-frequency and time stations on shortwave, long wave and
   VLF, each with its frequencies, power where published, hours, how the signal is laid
   out (the seconds ticks, how the minute and hour are marked, the voice announcements
   and their language, the time code), which time it gives and how to get local time
   from it, and roughly where and when it is heard. Stations that have closed are kept,
   marked closed with the date, so that nobody hunts for them. Time on ordinary
   broadcast radio (the BBC's pips and the like) is here too, with the caveat that
   digital and online radio arrive late. A guide, "Set a clock from a time signal", sits
   above the list when this kind is chosen.
2. **Emergency broadcasting.** What each country tells its public to tune to in an
   emergency, where a government or national broadcaster publishes it. Where a country
   names no frequency, the entry says what it does say and gives the band to look in.
3. **News broadcasters.** National long wave and medium wave services with their
   present state (many have closed in the last few years: those are marked closed),
   international shortwave broadcasters with their present state, and how to find FM
   and DAB stations. A shortwave schedule is given only where it was read on the
   broadcaster's own pages, and carries its season and the day it runs out.
4. **Weather.** VHF weather radio, marine forecasts and safety broadcasts, NAVTEX,
   weather fax, VOLMET (aviation weather by voice) and HF marine voice weather.
5. **Distress and calling.** Marine, aviation and beacon frequencies, to listen on.
6. **Amateur radio.** Emergency centres of activity, national emergency nets, calling
   frequencies, the international beacons (also a check on which bands are open) and
   digital-mode dial frequencies.
7. **Licence-free radio.** PMR446, CB, FRS, GMRS, MURS, UHF CB and their neighbours, with
   the emergency and calling channels where a regulator or official body names them.
8. **Bands, for hunting.** What lives where across the spectrum a home radio covers,
   with a short guide to hunting: the time of day against the band, why a station is on
   several frequencies at once, UTC, fading, what sideband sounds like on an AM set, and
   what "utility" stations are.

## Using the screen

- **Filters.** Kind, country or region, band, "a set like mine", and a search box that
  finds a station by name, a frequency by its first figures in kHz or MHz (`9410`,
  `156.8`), or a channel (`16`). They are kept in the address, so a link can open one
  kind: `/radio/frequencies?kind=time-signals`. The other parameters are `place` (a
  country code such as `GB`, a region id, or `any`), `band`, `set` and `q`.
- **Country first.** With no `place` in the address, the list starts from the country of
  the home place (the saved place with the home icon), found from the boxes round
  countries that the reference layers carry. An entry applies to a country when it
  names it, names a region with that country in it (ITU Region 1, the CEPT countries),
  or is worldwide. "Show every place" takes the filter off. With no home place, every
  place is shown.
- **A set like mine.** Each kind of set is described in a line (what it is assumed to
  tune, in which modes). A digital mode counts only for a set that can be joined to a
  decoder (an SDR, an HF transceiver with a computer); a 406 MHz beacon counts for none.
  These are typical sets, not one maker's: a particular radio's own manual is what
  counts.
- **Rows.** Each row gives the frequencies large, in kHz below 30 MHz and in MHz above,
  as radios show them, with the channel where people know it by one; then what it is,
  the mode, when and where. The frequencies are text and can be selected. Pressing the
  name opens the rest: what you hear, how the signal goes, where it is heard, any
  licence or restriction on listening, notes, links to other Outpost screens, each
  source with its address and the day it was checked.
- **Expired schedules.** An entry whose schedule has an end date is marked "Schedule
  expired" from the day after, worked out on the device from its own date. The entry
  stays, with the bands to hunt in.
- **On paper.** **Make a PDF** writes the list as it is filtered, kind by kind, with
  each time signal's layout and every source and date, through the same Save as PDF,
  Add to library and Share as other PDFs Outpost makes ([library.md](library.md)).
- **Not in the quick search.** Like the other reference data that ships in the app (the
  battery calculators' devices), the entries are found on this screen, not in the
  search across everything. The screen itself is in the quick search's "Go to" list.

Elsewhere in Outpost: amateur repeaters are on the [Repeaters](radio.md#repeaters)
screen; whether a shortwave band is likely to be open now is in
[HF propagation](hf-propagation.md); plans between your own stations are in
Communication plans.

## How entries are sourced and dated

- **Read today, from the source.** Every entry was checked on the day it gives against
  the page it names: the station or broadcaster itself, the national regulator, the
  ITU, the IMO or a national coastguard or hydrographic office, a national weather
  service or air navigation service, a national metrology institute for time signals,
  the IARU or a national amateur radio society. No frequency was written from memory.
- **Wikipedia and hobbyist lists were not sources.** They were used, at most, to find
  the primary page. No compiled schedule or frequency database (hobbyist schedule
  lists, HFCC data, commercial guides, RepeaterBook) was copied. Where one fact rests
  on a secondary source, the entry says so in a note. The terms read are in
  [sources.md](sources.md#frequencies-to-listen-to-read-2026-11-17).
- **What could not be verified stayed out.** An entry that could not be checked against
  a primary or clearly authoritative page was left out, or (where noted) kept with the
  status "not verified", which the screen hides. What was looked for and not found is
  listed under [Gaps](#gaps).
- **Spot checks.** After the research, entries were compared again with their cited pages by hand: 92
facts in all (10 in the national broadcasters, 18 emergency frequencies, 9 time-signal
facts, 11 shortwave schedule times and frequencies, 5 VOLMET facts, 31 amateur emergency
frequencies and 8 UHF CB facts), with none found wrong. Separately, every statement
resting on the US regulations was re-read in the 2025 printed edition (see
[sources.md](sources.md#frequencies-to-listen-to-read-2026-11-17)): four were loose and
were corrected. The distress and bands entries were not compared again by hand.

## Keeping the set

The set will age: stations close, schedules change twice a year, and regulators move
channels. Nothing updates it by itself, and there is no way to fetch a newer one. To
correct or add an entry:

1. Edit its file under `packages/shared/src/radio-frequencies/` (one file per kind; the
   shape is in `packages/shared/src/radio-frequencies.ts`).
2. Read the source again and set its `checked` day; for a shortwave schedule, set
   `schedule` with the season and the days it is good for.
3. Run `cd apps/web && pnpm exec vitest run src/features/frequencies`. The data test
   fails an entry with no source address, no checked date, a frequency with no value
   or outside every band it names, a place that is neither an ISO country code nor a
   known region, a duplicate, a schedule date that is not a real day, a closed entry
   with no closing date, or a time without "UTC". `FREQ_KIND=weather` checks one kind.

A closed station is better kept as closed, with the date, than removed.

## Deliberately left out

- **Transmitting.** The list says nothing about what you may transmit on. Listening is
  lawful in most places; transmitting needs a licence or the rules of where you are.
  Transmitting on a distress frequency other than in distress is an offence nearly
  everywhere.
- **Individual FM and DAB transmitters**, local AM stations, repeaters (see Repeaters),
  police, fire, ambulance and utility networks, military and numbers stations, and
  anything encrypted or whose reception is restricted.
- **Full shortwave schedules** beyond what a broadcaster publishes itself for the
  current season.

## Shortwave from further away

A country chosen in the filter shows what is filed under that country, under a region that
holds it, and under "worldwide". Shortwave does not stop at a region's edge, so under that
list the screen adds "Shortwave from further away": time signals and broadcasters on 2.3 to
30 MHz that are on the air but filed elsewhere (WWV from the United States for a reader in
Britain, say), with a line saying they can only sometimes be heard and a link to HF
propagation. The other filters still apply to it, closed and unchecked entries are left
out, and the PDF includes it. The rule is `heardFromAfar` in
`packages/shared/src/radio-frequencies.ts`.

## Gaps

Looked for and not put in, by kind. Most are pages that refuse AI agents, or that could
not be reached on the day; a person can fill them in by hand from the page named.

- **Time signals.** CHU (Canada) is marked closed on 22 June 2026 from secondary
  sources only: the NRC's pages refused to be read. YVTO (Venezuela), ATA (India), BSF
  (Taiwan), EBC (Spain), ZUO (South Africa) and OMA (Czechia, said to have closed): no
  current primary source. The Russian stations rest on the BIPM's table alone (VNIIFTRI's
  site could not be reached). Brazil's PPE is "not verified". The pips on RNZ and ABC
  radio, and NHK's time signal: their sites refuse AI agents or nothing was found.
- **Emergency broadcasting.** Australia (ABC) and New Zealand (RNZ; getready.govt.nz
  refused): their sites refuse AI agents. Israel (Home Front Command refused), India,
  the Philippines, Indonesia, South Africa, Kenya, the Caribbean, the Pacific islands,
  Latvia and Poland: no official page naming a station was read. The US list of FEMA's
  Primary Entry Point stations was not read. Spain and Italy name no station.
- **News broadcasters.** BBC World Service and the BBC's own frequency pages, NHK World,
  RFI, Deutsche Welle, KBS World, Vatican Radio, RNZ Pacific, Radio Australia's closure
  (2017), CBC, ABC, NRK, DR and Yle: their sites refuse AI agents. China Radio
  International, Voice of Turkey, Radio Habana Cuba, Voice of Korea, Radio Thailand,
  Radio Kuwait, Radio Algérienne, RAI, RNE, TRT, Mayak, Europe 1 (183 kHz), and the
  medium wave services of Australia, Canada, New Zealand, South Korea, India and South
  Africa: no primary page was read. Voice of America, Voice of Nigeria and All India
  Radio's external service are "not verified".
- **Weather.** New York and Gander VOLMET (the FAA's AIP refused), and the Pacific and
  Asian VOLMETs (no AIP read); RAF VOLMET; the Bureau of Meteorology's HF voice
  broadcasts and the US Coast Guard's NAVCEN pages (both refuse); Irish Coast Guard,
  Dutch, Swedish, Danish, Finnish, Spanish and Portuguese VHF forecasts; New Zealand
  maritime weather. Japan's JMH fax and Australia's fax rest on the NWS's compilation.
- **Distress and calling.** ITU Radio Regulations Appendix 15 (not read directly), ICAO
  NAT Doc 007 and the Gander, New York, Santa Maria and Pacific HF families (only
  Shanwick is in), AMSA's pages.
- **Amateur radio.** FT8, FT4 and WSPR dial frequencies (the WSJT-X source is on a site
  whose `robots.txt` disallows it), Winlink (no fixed frequencies published), SATERN and
  the VoIP Hurricane Net, RAYNET's, DARC's and NZART's own lists (they publish none),
  Argentina and Brazil.
- **Licence-free radio.** Japan's specified low-power radio (422 MHz), India's CB
  exemption, Brazil's and Russia's rules.
- **Bands.** The ITU Radio Regulations Article 5 were not read directly (the bands come
  from Ofcom's and NTIA's tables); ACMA's spectrum plan could not be reached.

## Legal notes

Where an entry describes a rule (who may listen, or that a channel is for emergencies),
it says whose rule it is. That is general information, not legal advice.
