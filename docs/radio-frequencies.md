# Frequencies to listen to

**Radio → Frequencies to listen to** is a list of where to tune to hear the time, news,
warnings, weather and other people when the internet is out, on whatever radio you have.
It ships with Outpost and nothing on the screen reaches out. Each entry links to the page
it was checked against, for your own browser when you are online.

## What is covered

278 entries across 90 countries, checked on 17 November 2026 with additions on 21 November:
239 on the air, 22 only some
of the time, 13 closed (kept with the date so nobody hunts for them) and 4 not verified
(hidden unless asked for).

| Kind | Entries | What it holds |
| --- | --- | --- |
| Time signals | 25 | Time stations, with how each signal is laid out so a clock can be set by ear (guide: "Set a clock from a time signal"), and broadcast pips, which arrive late on digital radio |
| Emergency broadcasting | 23 | What each country tells its public to tune to |
| News broadcasters | 34 | Long and medium wave, FM and DAB, international shortwave with its season |
| Weather | 63 | Weather radio, marine forecasts, NAVTEX, radiofax, VOLMET |
| Distress and calling | 22 | Marine, aviation and beacon frequencies, to listen on |
| Amateur radio | 31 | Emergency activity, nets, calling and beacon frequencies |
| Licence-free radio | 21 | PMR446, CB, FRS, GMRS, MURS, UHF CB |
| Bands, for hunting | 59 | What lives where, with a guide to hunting by band and time of day |

## Using the screen

- **In an emergency, tune to**, at the top: the emergency broadcasting entries for the
  household's country (or the country chosen), never a closed station, and a link to the
  distress and calling frequencies.

- **Filters**: kind, country or region, band, **a set like mine**, and a search box for a
  name, a frequency's first figures (`9410`, `156.8`) or a channel (`16`). They are kept in
  the address, so a link can open one kind: `/radio/frequencies?kind=time-signals`. On a
  phone the four lists fold under **Kind, place, band and set**, and choosing one brings the
  list into view.
- **Country first**: the list starts from the current household's country, with entries for its
  region (ITU Region 1, the CEPT countries) and the world. **Show every place** takes the
  filter off.
- **A set like mine** says what each kind of set (kitchen radio, shortwave portable,
  scanner, marine or CB set, transceiver, SDR) is assumed to tune.
- **Rows** give the frequency large (kHz below 30 MHz, MHz above). Press the name for what
  you will hear, any rule on listening, and each source with the day it was checked.
- **Schedule expired** marks a schedule past its end date; the entry stays.
- **Closed** stations are not among the live ones: they are under **Closed**, after the list,
  each with the day it closed and the page that says so.
- **Shortwave from further away**: with a country chosen, shortwave stations filed
  elsewhere that can sometimes be heard (WWV for a listener in Britain), with a link to
  [HF propagation](hf-propagation.md).
- **Make a PDF** writes the filtered list with every source ([library.md](library.md)).

Repeaters are on [Repeaters](radio.md#repeaters).

## How entries are sourced

Every entry was checked against a primary page (the station, a regulator, the ITU or IMO,
a coastguard, weather or air navigation service, a metrology institute, the IARU or a
national society), never copied from Wikipedia or a hobbyist list. A fact resting on a
secondary source says so ([sources.md](sources.md#frequencies-to-listen-to-read-2026-11-17)).
The list does not update itself, and schedules change twice a year: check the source
before relying on an entry.

## Deliberately left out

- **Transmitting.** Transmitting on a distress frequency other than in distress is an
  offence nearly everywhere. This is not legal advice.
- Individual FM and DAB transmitters, local AM stations, emergency-service, utility,
  military and numbers stations, anything encrypted, and full shortwave schedules.

## Gaps

Looked for and not put in, mostly because the site refused automated readers or had no
primary page. You can add them by hand from the station's own page.

- **Time signals**: CHU (marked closed on 22 June 2026 from secondary sources; the NRC's
  pages refused and its `robots.txt` bars AI agents), YVTO, ATA,
  BSF, EBC, ZUO, OMA; RNZ, ABC and NHK pips. Russian stations rest on the BIPM's table
  alone; Brazil's PPE is not verified.
- **Emergency broadcasting**: Australia rests on Queensland's advice alone (ABC bars AI
  agents; the Northern Territory's and Victoria's sites refused). New Zealand rests on
  NEMA's PDFs, with no RNZ frequencies (rnz.co.nz bars AI agents). Not found: Israel, India, the Philippines,
  Indonesia, South Africa, Kenya, the Caribbean, the Pacific islands, Latvia, Poland;
  FEMA's Primary Entry Point list. Spain and Italy name no station.
- **News**: BBC World Service, NHK World, RFI, Deutsche Welle, KBS World, Vatican Radio,
  RNZ Pacific, CBC, ABC, NRK, DR, Yle, CRI, RAI, RNE, TRT and others; the medium wave of
  Australia, Canada, New Zealand, South Korea and South Africa. BBC Radio 4 long wave's
  closing date rests on the RSGB: Ofcom (14 September 2026) confirms the closure but gives
  no date. All India Radio's medium wave is from Prasar Bharati's list of 18 September
  2025 (main cities only). Voice of America,
  Voice of Nigeria and All India Radio's external service are not verified.
- **Weather**: most VOLMETs outside Shanwick's area, Australia's HF voice, US Coast Guard
  NAVCEN, several European VHF forecasts, New Zealand maritime weather.
- **Distress**: ITU Appendix 15, ICAO NAT Doc 007, HF families other than Shanwick.
- **Amateur**: FT8, FT4 and WSPR dial frequencies, Winlink, SATERN, RAYNET, DARC and NZART
  lists (none published), Argentina, Brazil.
- **Licence-free**: Japan's 422 MHz radio, India, Brazil, Russia.
- **Bands**: from Ofcom's and NTIA's tables, not the ITU's directly.
