/**
 * Frequencies to listen to: the kind "broadcasters". See radio-frequencies.ts for the shape and
 * docs/radio-frequencies.md for how entries are sourced and checked.
 *
 * This part: international shortwave broadcasters (ids "bc-sw-"). Each schedule is the
 * broadcaster's own, read on its own pages, and carries the season it is good for. Where a
 * broadcaster publishes no schedule, the entry gives the shortwave range with a note saying
 * so. Frequencies and times are facts restated in our own words, not the broadcasters' tables.
 */
import type { FrequencyEntry, FrequencyGuide, FrequencySource } from "../radio-frequencies.ts";

const CHECKED = "2026-11-17";

const RTI_LISTEN: FrequencySource = {
  publisher: "Radio Taiwan International",
  title: "How to Listen",
  url: "https://www.rti.org.tw/en/content?uid=10",
  checked: CHECKED,
};
const WRMI_PROGRAMMING: FrequencySource = {
  publisher: "WRMI Radio Miami International",
  title: "WRMI Programming",
  url: "https://www.wrmi.net/index.php/programming/",
  checked: CHECKED,
};
const PRAGUE_WAYS: FrequencySource = {
  publisher: "Radio Prague International (Český rozhlas)",
  title: "Ways to listen",
  url: "https://english.radio.cz/ways-listen-8701721",
  checked: CHECKED,
};
const VOA_FREQUENCIES: FrequencySource = {
  publisher: "Voice of America",
  title: "VOA Broadcast Frequency Schedules (undated)",
  url: "https://www.voanews.com/p/6212.html",
  checked: CHECKED,
};
const RFA_HALT: FrequencySource = {
  publisher: "Radio Free Asia",
  title: "RFA radio transmissions to China, Tibet halted (4 April 2025)",
  url: "https://www.rfa.org/english/asia/2025/04/04/china-tibet-shortwave-radio-free-asia/",
  checked: CHECKED,
};
const RFA_2026: FrequencySource = {
  publisher: "Radio Free Asia",
  title: "Radio Free Asia builds on major milestone with new chapter ahead (29 September 2026)",
  url: "https://www.rfa.org/english/about/releases/2026/09/29/rfa-builds-on-major-milestone/",
  checked: CHECKED,
};
const FARDA_2026: FrequencySource = {
  publisher: "RFE/RL",
  title: "Radio Farda Returns to Shortwave, Bypassing Iran's Digital Blackout (10 January 2026)",
  url: "https://about.rferl.org/article/radio-farda-returns-to-shortwave-bypassing-irans-digital-blackout/",
  checked: CHECKED,
};
const FARDA_ABOUT: FrequencySource = {
  publisher: "Radio Farda (RFE/RL)",
  title: "About us",
  url: "https://en.radiofarda.com/p/6258.html",
  checked: CHECKED,
};
const VOV_LETTERBOX: FrequencySource = {
  publisher: "Voice of Vietnam (VOV5, VOVWORLD)",
  title: "Letter Box, Wednesday October 7, 2026",
  url: "https://vovworld.vn/letter-box/wednesday-october-7-2026-2471189.vov5",
  checked: CHECKED,
};
const CHANNEL_AFRICA_ABOUT: FrequencySource = {
  publisher: "Channel Africa (SABC)",
  title: "About us: broadcast platforms",
  url: "https://www.channelafrica.co.za/channelafrica/about-us/",
  checked: CHECKED,
};
const SWLING_MEYERTON: FrequencySource = {
  publisher: "The SWLing Post (secondary source)",
  title: "Channel Africa and other broadcasters affected by closure of Meyerton Shortwave Station",
  url: "https://swling.com/blog/2019/02/channel-africa-and-other-broadcasters-affected-by-closure-of-meyerton-shortwave-station",
  checked: CHECKED,
};
const VON_RESTORE: FrequencySource = {
  publisher: "Voice of Nigeria",
  title: "Nigerian Government Begins Restoration of VON Shortwave Transmission (26 August 2025)",
  url: "https://von.gov.ng/nigerian-government-begins-restoration-of-von-shortwave-transmission/",
  checked: CHECKED,
};
const PRASAR_AKASHVANI: FrequencySource = {
  publisher: "Prasar Bharati",
  title: "Akashvani (All India Radio): External Services Division",
  url: "https://prasarbharati.gov.in/en/akashvani/",
  checked: CHECKED,
};
const NIST_WWV: FrequencySource = {
  publisher: "NIST",
  title: "Radio Station WWV",
  url: "https://www.nist.gov/pml/time-and-frequency-division/time-distribution/radio-station-wwv",
  checked: CHECKED,
};
const NOAA_HF: FrequencySource = {
  publisher: "NOAA Space Weather Prediction Center",
  title: "HF Radio Communications",
  url: "https://www.spaceweather.gov/impacts/hf-radio-communications",
  checked: CHECKED,
};

const PROPAGATION_LINK = { to: "/radio/propagation", label: "Is this band open now" };

/** The whole shortwave range, for a broadcaster that is on shortwave but publishes no schedule. */
const SHORTWAVE_RANGE = { khz: 3000, toKhz: 30_000 };

export const BROADCASTERS: FrequencyEntry[] = [
  {
    id: "bc-sw-radio-taiwan-international",
    kind: "broadcasters",
    name: "Radio Taiwan International, English service",
    operator: "Radio Taiwan International (RTI)",
    what: "Taiwan's international broadcaster. Its own page gives one English hour on shortwave, aimed at South Asia and southern China.",
    frequencies: [{ khz: 9405, hours: "16:00 to 17:00 UTC", note: "South Asia and southern China" }],
    modes: ["AM"],
    bands: ["hf"],
    where: ["TW", "IN", "PK", "BD", "NP", "LK", "CN"],
    hours: "16:00 to 17:00 UTC daily",
    expect: "News from Taiwan and features, in English.",
    reception:
      "RTI notes that shortwave reception is strongly affected by terrain and weather, and suggests pulling out the whip aerial, listening near a window, or clipping on a few metres of wire.",
    status: "on-air",
    notes: [
      "RTI's page carries no season or date; check it against the time of year. RTI programmes in Spanish are also relayed by WRMI to the Americas.",
      "9405 kHz lies just below the 31 m broadcast band as the bands table here draws it.",
    ],
    links: [PROPAGATION_LINK],
    sources: [RTI_LISTEN],
    aliases: ["RTI", "Radio Taiwan"],
  },
  {
    id: "bc-sw-wrmi",
    kind: "broadcasters",
    name: "WRMI Radio Miami International",
    operator: "WRMI (privately owned, FCC-licensed)",
    what: "A private shortwave station at Okeechobee, Florida, that sells airtime. Among its programmes are World Radio Network (news and programmes from public broadcasters), Radio Prague International and Radio Slovakia International, along with religious, music and talk programmes.",
    frequencies: [
      { khz: 9955, note: "WRMI's main frequency, also streamed; the Caribbean, Central and South America" },
      { khz: 15770, note: "Europe, Africa, the Middle East and north-eastern America" },
      { khz: 9395, note: "North America" },
      { khz: 5850, note: "North America" },
      { khz: 5950, note: "North America" },
      { khz: 9455 },
      { khz: 7570 },
      { khz: 5050 },
      { khz: 5010 },
      { khz: 7780, note: "Australia, New Zealand and Oceania for some programmes" },
    ],
    modes: ["AM"],
    bands: ["sw-60m", "sw-49m", "sw-31m", "sw-19m", "hf"],
    where: ["US", "CA", "MX", "itu-2", "caribbean", "cept"],
    site: "Okeechobee, Florida",
    hours: "Around the clock across its transmitters; each programme's times are in WRMI's programme listings",
    expect:
      "Whatever has bought the hour: World Radio Network's news and current affairs from public broadcasters, the English services of Radio Prague and Radio Slovakia, religious programmes, music and talk shows. Not all of it is news.",
    reception:
      "WRMI says its signal can be heard anywhere in the world, and suggests remote web SDR receivers for listeners who cannot hear it directly.",
    status: "on-air",
    notes: [
      "The frequencies are those WRMI's programming page names for its programmes. Its full B26 transmission grid is a Google Sheets document that was not used here, because docs.google.com's robots.txt disallows automated access.",
      "9395, 7570, 7780 and 5850 kHz lie outside the broadcast bands as the bands table here draws them.",
    ],
    links: [PROPAGATION_LINK],
    sources: [WRMI_PROGRAMMING],
    aliases: ["Radio Miami International", "World Radio Network", "WRN", "Radio Slovakia International", "RSI"],
  },
  {
    id: "bc-sw-radio-prague-international",
    kind: "broadcasters",
    name: "Radio Prague International, via WRMI",
    operator: "Český rozhlas (Czech Radio)",
    what: "The Czech Republic's international service. It has no shortwave transmitters of its own in use; its English and Spanish programmes are relayed to North America by WRMI in Florida.",
    frequencies: [{ khz: 9955 }, { khz: 9395 }, { khz: 7780 }, { khz: 5010 }],
    modes: ["AM"],
    bands: ["sw-60m", "hf"],
    where: ["CZ", "US", "CA", "itu-2"],
    expect: "News from the Czech Republic and features, in English or Spanish.",
    reception: "Beamed to North America from Florida. Times are in WRMI's schedule (see the WRMI entry).",
    status: "on-air",
    notes: [
      "Radio Prague's page names only WRMI for shortwave, and points to wrmi.net for the times. It also lists a Russian service on 738 kHz medium wave through WRN in Moscow.",
    ],
    links: [PROPAGATION_LINK],
    sources: [PRAGUE_WAYS, WRMI_PROGRAMMING],
    aliases: ["Radio Prague", "Radio Praga", "Czech Radio"],
  },
  {
    id: "bc-sw-voice-of-america",
    kind: "broadcasters",
    name: "Voice of America, English to Africa (state unclear)",
    operator: "Voice of America (US Agency for Global Media)",
    what: "The US government's international broadcaster. Most of its broadcasting was stopped in March 2025; its frequency page is still online but carries no date or season, and VOA's own pages say nothing about which services are on the air now.",
    frequencies: [
      { khz: 4930 },
      { khz: 4960 },
      { khz: 6080 },
      { khz: 6195 },
      { khz: 7455 },
      { khz: 9550 },
      { khz: 13590 },
      { khz: 15580 },
      { khz: 17885 },
      { khz: 17895 },
      { khz: 909, note: "medium wave" },
      { khz: 1530, note: "medium wave" },
      { khz: 11850, note: "South Sudan, English, 16:30 to 17:00 UTC" },
      { khz: 13865, note: "South Sudan, English, 16:30 to 17:00 UTC" },
      { khz: 15180, note: "South Sudan, English, 16:30 to 17:00 UTC" },
    ],
    modes: ["AM"],
    bands: ["sw-60m", "sw-49m", "sw-31m", "sw-25m", "sw-22m", "sw-19m", "sw-16m", "mw", "hf"],
    where: ["US", "itu-1", "SS", "ZW", "NG", "KE", "ET", "SO"],
    hours: "English to Africa, as the undated page gives it: 03:00 to 07:00 and 14:00 to 22:00 UTC",
    expect: "If on the air: news and programmes in English for Africa.",
    reception: "If on the air, aimed at Africa; several frequencies at once, changing through the day.",
    status: "not-verified",
    notes: [
      "The schedule page is VOA's own but undated; it may be older than the 2025 cuts. The language services named in the page's own menu are Dari, Korean, Kurdish, Mandarin, Pashto, Persian, Russian and Ukrainian; English to Africa is not among them.",
      "VOA's public-relations pages carry no news later than 2024, and the US Agency for Global Media's press releases none about shortwave since March 2025. Reports that some transmissions have resumed in 2026 come only from secondary sources and are not used here.",
    ],
    links: [PROPAGATION_LINK],
    sources: [VOA_FREQUENCIES],
    aliases: ["VOA", "USAGM"],
  },
  {
    id: "bc-sw-radio-free-asia",
    kind: "broadcasters",
    name: "Radio Free Asia (limited shortwave, no published schedule)",
    operator: "Radio Free Asia",
    what: "A US-funded broadcaster to China, North Korea, Myanmar, Cambodia, Vietnam and Laos. Its shortwave was cut sharply in April 2025; in September 2026 it said it was paying for limited shortwave broadcasts itself.",
    frequencies: [{ ...SHORTWAVE_RANGE, note: "No published schedule: RFA does not list its frequencies" }],
    modes: ["AM"],
    bands: ["hf"],
    where: ["CN", "KP", "MM", "KH", "VN", "LA"],
    expect: "News in the languages of its target countries (Korean and Mandarin are its first priorities in 2026).",
    status: "on-air",
    notes: [
      "On 4 April 2025 RFA said shortwave in Mandarin, Tibetan and Lao had stopped entirely and that Burmese, Khmer, Korean and Uyghur were on a heavily reduced schedule, as US government relay stations stopped transmitting: from 63 hours a day in March 2025 to seven.",
      "On 29 September 2026 RFA said it was self-financing limited shortwave broadcasts because it still has no access to the transmitters and satellites the US Agency for Global Media provided.",
    ],
    links: [PROPAGATION_LINK],
    sources: [RFA_2026, RFA_HALT],
    aliases: ["RFA"],
  },
  {
    id: "bc-sw-radio-farda",
    kind: "broadcasters",
    name: "Radio Farda (RFE/RL), Persian to Iran (no published schedule)",
    operator: "Radio Free Europe/Radio Liberty",
    what: "RFE/RL's Persian-language service. It went back on shortwave to Iran on 10 January 2026, through commercial transmitter companies, after Iran cut the internet.",
    frequencies: [{ ...SHORTWAVE_RANGE, note: "No published schedule: RFE/RL does not list the frequencies" }],
    modes: ["AM"],
    bands: ["hf"],
    where: ["IR"],
    expect: "News and current affairs in Persian.",
    status: "on-air",
    notes: [
      "Radio Farda's own page describes programmes around the clock on several platforms, including satellite and shortwave transmissions covering Iran.",
    ],
    links: [PROPAGATION_LINK],
    sources: [FARDA_2026, FARDA_ABOUT],
    aliases: ["RFE/RL", "Radio Free Europe", "Radio Liberty"],
  },
  {
    id: "bc-sw-voice-of-vietnam",
    kind: "broadcasters",
    name: "Voice of Vietnam (VOV5), English service",
    operator: "Voice of Vietnam",
    what: "Vietnam's national broadcaster; its foreign-language service (VOV5, VOVWORLD) is on shortwave in English and other languages. It publishes no schedule on its site; its listeners' programme names the frequencies heard.",
    frequencies: [{ khz: 7220, hours: "16:00 to 16:30 UTC", note: "English, as reported in VOV's Letter Box (A26 season)" }],
    modes: ["AM"],
    bands: ["sw-41m"],
    where: ["VN", "PK", "BD", "IN", "itu-3"],
    expect: "News from Vietnam and features, in English.",
    status: "on-air",
    notes: [
      "In its Letter Box of 7 October 2026 VOV acknowledged listeners' reports of its English service on 7220 kHz, one of them from 16:00 to 16:30 UTC on 28 September. That was the summer (A26) season; the winter schedule may differ, and no B26 schedule was found.",
    ],
    links: [PROPAGATION_LINK],
    sources: [VOV_LETTERBOX],
    aliases: ["VOV", "VOV5", "VOVWORLD", "Voice of Vietnam"],
  },
  {
    id: "bc-sw-channel-africa",
    kind: "broadcasters",
    name: "Channel Africa (SABC), shortwave closed",
    operator: "SABC (South African Broadcasting Corporation)",
    what: "South Africa's international radio service, in Chinyanja, Kiswahili, English, French and Portuguese. It is now on satellite and the internet only; its shortwave ended when Sentech closed the Meyerton shortwave station.",
    frequencies: [{ ...SHORTWAVE_RANGE, note: "Former shortwave service: nothing to hear" }],
    modes: ["AM"],
    bands: ["hf"],
    where: ["ZA", "itu-1"],
    expect: "Nothing on shortwave. Channel Africa is on free-to-air satellite (Intelsat 20) across sub-Saharan Africa, and online.",
    status: "closed",
    closed: "2019-03-31",
    notes: [
      "Channel Africa's own page names only satellite and internet. The closure date (31 March 2019) is from a secondary source, the SWLing Post, citing Sentech's closure of Meyerton.",
    ],
    sources: [CHANNEL_AFRICA_ABOUT, SWLING_MEYERTON],
    aliases: ["SABC Channel Africa", "Meyerton"],
  },
  {
    id: "bc-sw-voice-of-nigeria",
    kind: "broadcasters",
    name: "Voice of Nigeria (shortwave being restored)",
    operator: "Voice of Nigeria (VON)",
    what: "Nigeria's international broadcaster. Its shortwave had stopped; in August 2025 the government let the contract to restore the 250 kW TX2 transmitter at Lugbe, Abuja. Whether it is back on the air was not confirmed.",
    frequencies: [{ ...SHORTWAVE_RANGE, note: "No published schedule" }],
    modes: ["AM"],
    bands: ["hf"],
    where: ["NG", "itu-1"],
    site: "Lugbe transmitting station, Abuja",
    expect: "If on the air: news from Nigeria and Africa.",
    status: "not-verified",
    notes: [
      "The source is VON's report of the contract signing on 26 August 2025. No later VON statement that shortwave is back on the air was found.",
    ],
    links: [PROPAGATION_LINK],
    sources: [VON_RESTORE],
    aliases: ["VON"],
  },
  {
    id: "bc-sw-all-india-radio-external",
    kind: "broadcasters",
    name: "All India Radio, External Services (no published schedule)",
    operator: "Prasar Bharati (Akashvani)",
    what: "All India Radio's External Services Division, broadcasting in 27 languages (15 foreign and 12 Indian) for about 72 hours a day to over 100 countries. It has high-power shortwave transmitters at Bengaluru and Aligarh, but no current shortwave schedule was found on its sites.",
    frequencies: [{ ...SHORTWAVE_RANGE, note: "No published schedule found" }],
    modes: ["AM"],
    bands: ["hf"],
    where: ["IN", "itu-3", "itu-1"],
    expect: "News and programmes from India in English (the General Overseas Service) and many other languages.",
    status: "not-verified",
    notes: [
      "Prasar Bharati's page does not say how the External Services reach listeners now; that they are on shortwave was not confirmed from a primary source.",
    ],
    links: [PROPAGATION_LINK],
    sources: [PRASAR_AKASHVANI],
    aliases: ["AIR", "Akashvani", "AIR World Service", "General Overseas Service"],
  },
];

export const BROADCASTERS_GUIDES: FrequencyGuide[] = [
  {
    id: "bc-sw-guide-stale-schedule",
    kind: "broadcasters",
    title: "Hunting shortwave broadcasts when the schedule is stale",
    paragraphs: [
      "International broadcasters use a set of shortwave broadcast bands named in metres. Voice of America gives the conversion: metres = 300000 divided by the frequency in kHz. The bands themselves are listed under Bands, for hunting.",
      "Which band carries a signal depends on the time of day along the path. By day the sun-lit ionosphere absorbs the lower frequencies (NOAA's Space Weather Prediction Center describes its lowest layer as an absorber of radio waves), so try the higher bands in daylight and the lower ones after dark.",
      "Schedules change twice a year, with the seasons: the summer (A) schedules start at the end of March and the winter (B) schedules at the end of October. A frequency in a list from another season may be silent, or carry a different station. Stations also change frequencies in mid-season, for example when a transmitter fails.",
      "A broadcaster often uses several frequencies at once, each beamed to a different area or chosen for a different path: Voice of America's English to Africa schedule lists up to six frequencies (shortwave and medium wave) in the same hour. NIST explains the same for its WWV time signal: reception depends on location, time of year, time of day and the frequency, and with several frequencies at least one is likely to be usable at any time.",
      "So, with a stale schedule: start with the frequencies listed here for your area; if one is silent, try the same station's other frequencies; then tune slowly through the band that suits the hour (higher bands by day, lower by night). A longer aerial helps: Radio Taiwan International suggests pulling out the whip, listening by a window, or clipping 3 to 15 metres of wire to the aerial and taking the other end outdoors.",
    ],
    sources: [VOA_FREQUENCIES, NOAA_HF, NIST_WWV, RTI_LISTEN],
  },
];
