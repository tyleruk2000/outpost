# Broadcasts worth knowing: weather, shipping and time signals

One-way broadcasts that anyone can receive: NOAA Weather Radio in the United States, standard time and frequency stations, and the UK's weather and safety broadcasts for shipping. Long-standing services in this field have been closing, so every entry was checked with the organisation that runs it, and anything that could not be confirmed is marked "not verified".

## The law in brief

These are broadcasts for general reception, so listening to them is lawful in the UK and the United States; check locally elsewhere. None of these frequencies is for the public to transmit on. This sheet is a reference, not legal advice.

## NOAA Weather Radio (United States)

A network of transmitters run by the US National Weather Service, which broadcasts forecasts and warnings continuously on seven VHF frequencies. An ordinary AM/FM radio cannot receive them; a weather radio can, and so can most marine VHF radiotelephones.

| Frequency |
| --- |
| 162.400 MHz |
| 162.425 MHz |
| 162.450 MHz |
| 162.475 MHz |
| 162.500 MHz |
| 162.525 MHz |
| 162.550 MHz |

Receivers often label these WX1 to WX7. The National Weather Service says such channel numbers "have no special significance" and that other numbering schemes exist, so go by the frequency. It also says a weather radio "will work in Canada", where the national weather service's transmitters "generally operate on the same frequencies".

## Time and standard-frequency stations

| Station | Run by | Location | Frequencies | Notes |
| --- | --- | --- | --- | --- |
| WWV | NIST (United States) | Near Fort Collins, Colorado | 2.5, 5, 10, 15 and 20 MHz; 25 MHz on an experimental basis | Voice time announcements, 24 hours a day. 10 kW on 5, 10 and 15 MHz; 2.5 kW on 2.5 and 20 MHz |
| WWVH | NIST (United States) | Kauai, Hawaii | 2.5, 5, 10 and 15 MHz | Voice time announcements, 24 hours a day |
| WWVB | NIST (United States) | Near Fort Collins, Colorado | 60 kHz | Time code for radio-controlled clocks; no voice |
| MSF | NPL (United Kingdom) | Anthorn, Cumbria | 60 kHz | Time and date code giving UK civil time, 24 hours a day; no voice |
| DCF77 | PTB (Germany) | Mainflingen | 77.5 kHz | Time code for radio-controlled clocks; no voice |
| CHU | NRC (Canada) | Not verified | Not verified | The National Research Council's website refused the check on 15 November 2026, and on 21 November 2026 its robots.txt was found to bar AI agents, so it was not read. Secondary reports say its shortwave broadcasts ended on 22 June 2026. The station is usually listed on 3330, 7850 and 14670 kHz; treat those as not verified |

MSF carries UK civil time and DCF77 carries German legal time; the pages read for WWV and WWVH did not say in so many words which time scale is announced, so that is not stated here. On the day of checking NIST noted that WWVH's 5 MHz transmitter was running at reduced power after an equipment failure, and NPL was asking users of MSF for evidence about how the service is used, to inform decisions about its future.

NIST explains that WWV and WWVH use several frequencies because shortwave reception depends on location, season, time of day and the frequency itself, so if one frequency is silent, try the others.

## UK weather and safety broadcasts for shipping

The Maritime and Coastguard Agency (MCA) is responsible for the UK's Maritime Safety Information service. The forecasts come from the Met Office.

### BBC Radio 4

The Shipping Forecast is broadcast on BBC Radio 4 FM at these times (local time):

| Days | Time | Content |
| --- | --- | --- |
| Every day | 00:48 | Gale warnings, Shipping Forecast, reports from coastal stations and the Inshore Waters Forecast |
| Every day | 05:34 | Gale warnings, Shipping Forecast, reports from coastal stations and the Inshore Waters Forecast |
| Saturday and Sunday | 17:54 | Gale warnings and Shipping Forecast |

Long wave: the MCA states that the BBC's dedicated long wave broadcast of the Shipping Forecast "ceased on 31 March 2024". BBC Radio 4 long wave on 198 kHz is reported to have closed altogether on 27 June 2026. That closure is not verified here: the BBC's website does not admit automated checks, and the report comes from the Radio Society of Great Britain. Do not plan on receiving anything on 198 kHz.

### HM Coastguard on marine VHF

HM Coastguard reads Maritime Safety Information on marine VHF channel 62, 63 or 64 (channel 10 may also be used), after an announcement on channel 16 saying which channel to turn to. Coverage is about 30 nautical miles from the coast.

| Broadcast | How often | Content |
| --- | --- | --- |
| Full broadcast | Every 12 hours, morning and evening | Gale warnings, new Inshore Waters Forecast and outlook, new Shipping Forecast, navigation warnings in force |
| Short broadcast | Every 3 hours | Gale warnings, Inshore Waters Forecast, new navigation warnings |

Each Coastguard centre has its own times: for example Aberdeen at 07:30 and 19:30 and Dover at 07:10 and 19:10 (local time) for the full broadcast. Gale, storm and navigation warnings are also read when they are received. The leaflet in the sources has the times and channel for every aerial.

Ofcom's frequency table lists 160.725, 160.775 and 160.825 MHz (paired with 156.125, 156.175 and 156.225 MHz) as the MCA's Maritime Safety Information frequencies. This sheet has not checked which of channels 62, 63 and 64 is which against the international channel plan.

### HM Coastguard on MF

Scheduled voice broadcasts, announced first on 2182 kHz, with coverage of about 150 miles.

| Coastguard centre | Radio site | Frequency | Times |
| --- | --- | --- | --- |
| Belfast | Tiree | 1883 kHz | 08:10 and 20:10 |
| Shetland | Collafirth | 1770 kHz | 07:10 and 19:10 |
| Stornoway | Butt of Lewis | 1743 kHz | 07:10 and 19:10 |
| Falmouth | Scillies | 1880 kHz | 07:10 and 19:10 |
| Aberdeen | Gregness | 2226 kHz | 07:30 and 19:30 |
| Humber | Cullercoats | 1925 kHz | 07:50 and 19:50 |

These need a receiver that covers 1.6 to 3 MHz in single sideband.

### NAVTEX

NAVTEX sends warnings and forecasts as text to a dedicated receiver. Coverage is out to about 300 miles.

| Service | Frequency | UK stations and their identity letters | Content |
| --- | --- | --- | --- |
| International | 518 kHz | Cullercoats (G), Niton (E), Portpatrick (O) | Gale warnings, Shipping Forecast, navigation warnings, in English |
| National | 490 kHz | Cullercoats (U), Niton (I), Portpatrick (C) | Inshore Waters Forecasts, strong wind warnings, coastal weather reports |

## Checked

15 November 2026. Each frequency was read on the operator's own page, and the tables were then compared a second time with those pages.

## Sources

- US National Weather Service, NOAA Weather Radio marine frequencies page: the seven frequencies and the note on WX channel numbers. https://www.weather.gov/marine/wxradio
- US National Weather Service, NOAA Weather Radio receiver information: reception and use in Canada. https://www.weather.gov/nwr/nwr_receivers
- NIST, Radio Station WWV: https://www.nist.gov/pml/time-and-frequency-division/time-distribution/radio-station-wwv
- NIST, Radio Station WWVH: https://www.nist.gov/pml/time-and-frequency-division/time-distribution/radio-station-wwvh
- NIST, Radio Station WWVB: https://www.nist.gov/pml/time-and-frequency-division/time-distribution/radio-station-wwvb
- National Physical Laboratory, MSF radio time signal: https://www.npl.co.uk/products-services/time-frequency/msf-radio-time-signal
- Physikalisch-Technische Bundesanstalt, DCF77 and DCF77 carrier frequency: https://www.ptb.de/cms/en/ptb/fachabteilungen/abt4/fb-44/ag-442/dissemination-of-legal-time/dcf77.html
- Maritime and Coastguard Agency, Maritime Safety Information Leaflet (Advice Note 1033), January 2026: the BBC Radio 4 schedule, the end of the long wave Shipping Forecast, Coastguard VHF and MF broadcasts, and NAVTEX. https://assets.publishing.service.gov.uk/media/697c7ec82ff8d10a830d5dab/MSI_Leaflet.pdf
- Ofcom, Frequencies for distress and safety, search and rescue and emergencies in the UK, 19 August 2022: the MCA's Maritime Safety Information frequencies. https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/spectrum-information/frequency-allocation-table/fat-frequencies-distress-safety.pdf
- Radio Society of Great Britain, BBC Long Wave Shutdown (a secondary source, used only for the reported closure date): https://rsgb.org/main/radio-sport/rsgb-contest-club/bbc-long-wave-shutdown/

## Not covered

- CHU (Canada) and BBC Radio 4 long wave could not be confirmed with their operators and are marked as not verified above.
- The frequencies of BBC Radio 4 FM, which vary by transmitter.
- Local NOAA Weather Radio station lists and coverage, and Weatheradio Canada's own station list.
- Other countries' time stations (for example in Russia, China and Japan) and other countries' marine weather broadcasts.
- Radiofax and other HF weather services. The US National Weather Service's worldwide radiofacsimile schedule is in the catalogue as a separate download.
- Shortwave broadcasters, and local radio.
