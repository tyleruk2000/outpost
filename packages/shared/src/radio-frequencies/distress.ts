/**
 * Frequencies to listen to: the kind "distress". See radio-frequencies.ts for the shape and
 * docs/radio-frequencies.md for how entries are sourced and checked.
 *
 * Marine and aviation distress, safety, calling and search and rescue frequencies, from the
 * regulators (Ofcom's distress annex, 47 CFR Parts 80 and 87), the coastguards and maritime
 * administrations (MCA, the Canadian Coast Guard, Maritime Safety Queensland, NSW Government),
 * the aeronautical information publications (UK AIP, TC AIM) and NOAA SARSAT. The CFR
 * sections were read in the Government Publishing Office's annual edition of Title 47 on
 * govinfo (revised as of 1 October 2025), one section at a time; the address given is the one read.
 */
import type { FrequencyEntry, FrequencyGuide, FrequencySource } from "../radio-frequencies.ts";

const CHECKED = "2026-11-17";

// ── Sources ─────────────────────────────────────────────────────────────────

const OFCOM_SAR: FrequencySource = {
  publisher: "Ofcom",
  title: "Frequencies for distress and safety, search and rescue and emergencies in the UK (UK Frequency Allocation Table), 19 August 2022",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/spectrum-information/frequency-allocation-table/fat-frequencies-distress-safety.pdf",
  checked: CHECKED,
};
const cfr = (section: string, title: string): FrequencySource => ({
  publisher: "US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition)",
  title: `47 CFR ${section}, ${title}`,
  url: `https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec${section.replace(".", "-")}.xml`,
  checked: CHECKED,
});
const CFR_80_1077 = cfr("80.1077", "Frequencies (GMDSS)");
const CFR_80_1069 = cfr("80.1069", "Maritime sea areas");
const CFR_80_369 = cfr("80.369", "Distress, urgency, safety, call and reply frequencies");
const CFR_80_373 = cfr("80.373", "Private communications frequencies");
const CFR_80_148 = cfr("80.148", "Watch on 156.8 MHz (Channel 16)");
const CFR_80_310 = cfr("80.310", "Watch required by voluntary vessels");
const CFR_80_1061 = cfr("80.1061", "Special requirements for 406.0-406.1 MHz EPIRB stations");
const CFR_87_173 = cfr("87.173", "Frequencies (aviation services)");
const CFR_87_187 = cfr("87.187", "Frequencies (aircraft stations)");
const MCA_MGN324: FrequencySource = {
  publisher: "Maritime and Coastguard Agency",
  title: "MGN 324 (M+F) Amendment 2, Navigation: watchkeeping safety, use of VHF radio and AIS, paragraphs 2.1 to 2.4",
  url: "https://www.gov.uk/government/publications/mgn-324-mf-amendment-2-navigation-watchkeeping-safety-use-of-very-high-frequency-vhf-radio-and-automatic-identification-system-ais/mgn-324-mf-amendment-2",
  checked: CHECKED,
};
const USCG_2182: FrequencySource = {
  publisher: "US Coast Guard, in the Federal Register",
  title:
    "Termination of Radiotelephone Medium Frequency 2182 kHz Watchkeeping, 2187.5 kHz Digital Selective Calling Channel Guard, and 2670 kHz Broadcasts, 78 FR 42102, 15 July 2013",
  url: "https://www.govinfo.gov/content/pkg/FR-2013-07-15/html/2013-16801.htm",
  checked: CHECKED,
};
const CCG_RAMN: FrequencySource = {
  publisher: "Canadian Coast Guard",
  title: "Radio Aids to Marine Navigation 2026, Part 4: General",
  url: "https://www.canada.ca/en/canadian-coast-guard/corporate/publications/radio-aids-marine-navigation/general.html",
  checked: CHECKED,
};
const NSW_SAR: FrequencySource = {
  publisher: "NSW Government",
  title: "Alerting search and rescue services",
  url: "https://www.nsw.gov.au/driving-boating-and-transport/waterways-safety-and-rules/emergencies/alerting-rescue-services",
  checked: CHECKED,
};
const MSQ_FACTSHEET: FrequencySource = {
  publisher: "Maritime Safety Queensland",
  title: "Marine communications (fact sheet, PDF dated January 2015)",
  url: "https://www.msq.qld.gov.au/-/media/MSQInternet/MSQFiles/Home/Safety/Marine-radios/marinecommunicationsfactsheet.pdf",
  checked: CHECKED,
};
const IMO_MSC509: FrequencySource = {
  publisher: "International Maritime Organization",
  title: "Resolution MSC.509(105), Provision of radio services for the Global Maritime Distress and Safety System (GMDSS)",
  url: "https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MSCResolutions/MSC.509(105).pdf",
  checked: CHECKED,
};
const UK_AIP = "https://www.aurora.nats.co.uk/htmlAIP/Publications/2026-10-29-AIRAC/html/eAIP";
const UK_AIP_GEN34: FrequencySource = {
  publisher: "NATS, UK Aeronautical Information Publication",
  title: "GEN 3.4 Communication services, AIRAC 2026-10-29",
  url: `${UK_AIP}/EG-GEN-3.4-en-GB.html`,
  checked: CHECKED,
};
const UK_AIP_GEN36: FrequencySource = {
  publisher: "NATS, UK Aeronautical Information Publication",
  title: "GEN 3.6 Search and rescue, AIRAC 2026-10-29",
  url: `${UK_AIP}/EG-GEN-3.6-en-GB.html`,
  checked: CHECKED,
};
const UK_AIP_ENR22: FrequencySource = {
  publisher: "NATS, UK Aeronautical Information Publication",
  title: "ENR 2.2 Other regulated airspace, section 3 Shanwick oceanic operations, AIRAC 2026-10-29",
  url: `${UK_AIP}/EG-ENR-2.2-en-GB.html`,
  checked: CHECKED,
};
const TC_AIM_NAT: FrequencySource = {
  publisher: "Transport Canada",
  title: "Transport Canada Aeronautical Information Manual (TC AIM), NAT section, effective 1 October 2026",
  url: "https://tc.canada.ca/sites/default/files/2026-10/aim-2026-2_nat_en.pdf",
  checked: CHECKED,
};
const NOAA_406: FrequencySource = {
  publisher: "NOAA SARSAT",
  title: "Emergency 406 Beacons",
  url: "https://www.sarsat.noaa.gov/emergency-406-beacons/",
  checked: CHECKED,
};
const NOAA_FAQ: FrequencySource = {
  publisher: "NOAA SARSAT",
  title: "Frequently Asked Questions",
  url: "https://www.sarsat.noaa.gov/faqs/",
  checked: CHECKED,
};
const WTA_47: FrequencySource = {
  publisher: "UK legislation (legislation.gov.uk)",
  title: "Wireless Telegraphy Act 2006, section 47, Misleading messages",
  url: "https://www.legislation.gov.uk/ukpga/2006/36/section/47",
  checked: CHECKED,
};
const WTA_48: FrequencySource = {
  publisher: "UK legislation (legislation.gov.uk)",
  title: "Wireless Telegraphy Act 2006, section 48, Interception and disclosure of messages",
  url: "https://www.legislation.gov.uk/ukpga/2006/36/section/48",
  checked: CHECKED,
};
const USC_325: FrequencySource = {
  publisher: "US Government Publishing Office",
  title: "47 U.S.C. 325, False distress signals; rebroadcasting programs (United States Code, 2023 edition)",
  url: "https://www.govinfo.gov/content/pkg/USCODE-2023-title47/html/USCODE-2023-title47-chap5-subchapIII-partI-sec325.htm",
  checked: CHECKED,
};
const CFR_80_89 = cfr("80.89", "Unauthorized transmissions");

const LISTEN_MARINE =
  "Receiving is not licensed by the sources read; transmitting on a marine channel needs a ship station licence and an operator's certificate (MCA MGN 324, 2.1.5, for UK waters). In the UK, the Wireless Telegraphy Act 2006, section 48, makes it an offence to use a receiver with intent to obtain information from a message not meant for you, or to pass it on, without lawful authority. General information, not legal advice.";
const LISTEN_AIR =
  "Transmitting on an aeronautical frequency needs an aircraft or aeronautical station licence and a radio operator's licence. In the UK, the Wireless Telegraphy Act 2006, section 48, makes it an offence to use a receiver with intent to obtain information from a message not meant for you, or to pass it on, without lawful authority. General information, not legal advice.";

// ── Entries ─────────────────────────────────────────────────────────────────

export const DISTRESS: FrequencyEntry[] = [
  // Marine VHF.
  {
    id: "ds-marine-vhf-16",
    kind: "distress",
    name: "Marine VHF channel 16, international distress, safety and calling",
    what: "The worldwide marine voice channel for distress, urgency and safety calls, and for calling another station before moving to a working channel.",
    frequencies: [{ khz: 156_800, channel: "16" }],
    modes: ["NFM"],
    bands: ["marine-vhf"],
    where: ["world"],
    hours: "Continuous",
    expect:
      'Short calls in English or the local language: coastguard announcements of a weather or safety broadcast (then moving to a working channel), ships calling each other, and in an emergency "Mayday", "Pan-pan" or "Sécurité" calls and the coastguard\'s replies.',
    reception:
      "Line of sight from the coast or a ship, typically a few tens of kilometres; further from high ground or to a coastguard mast.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      'MCA MGN 324: channel 16 "may only be used for distress, urgency and very brief safety communications, and for calling to establish other communications which should then be concluded on a suitable working channel".',
      "47 CFR 80.148: compulsory vessels under way in US waters keep a watch on 156.800 MHz; the watch is kept so that ships without DSC can call GMDSS ships.",
      "Ofcom: 156.8 MHz may be used by aircraft stations for safety purposes only.",
    ],
    sources: [OFCOM_SAR, CFR_80_369, CFR_80_1077, CFR_80_148, MCA_MGN324],
    aliases: ["channel 16", "ch16", "mayday", "156.8"],
  },
  {
    id: "ds-marine-vhf-70-dsc",
    kind: "distress",
    name: "Marine VHF channel 70, digital selective calling (DSC)",
    what: "A data channel on which marine radios send digital distress alerts and calls: a button press sends the ship's identity and position. No voice is allowed on it.",
    frequencies: [{ khz: 156_525, channel: "70" }],
    modes: ["DSC"],
    bands: ["marine-vhf"],
    where: ["world"],
    hours: "Continuous",
    expect:
      "Short bursts of data tones. A DSC decoder (or an SDR with decoding software) shows the calling station's MMSI number, the kind of call and, for a distress alert, the position.",
    reception: "As channel 16: line of sight, tens of kilometres.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      'MCA MGN 324: channel 70 "may only be used for Digital Selective Calling, not oral communication".',
      'Ofcom: 156.525 MHz "is to be used exclusively for digital selective calling for distress, safety and calling".',
      "47 CFR 80.1077 note 1: used for ship-to-ship alerting and, within sea area A1, ship-to-shore alerting.",
    ],
    sources: [OFCOM_SAR, CFR_80_1077, CFR_80_369, MCA_MGN324],
    aliases: ["channel 70", "ch70", "DSC", "GMDSS"],
  },
  {
    id: "ds-marine-vhf-13",
    kind: "distress",
    name: "Marine VHF channel 13, navigation safety (bridge to bridge)",
    what: "The channel ships use to talk to each other about navigation safety: passing, overtaking, crossing.",
    frequencies: [{ khz: 156_650, channel: "13" }],
    modes: ["NFM"],
    bands: ["marine-vhf"],
    where: ["world"],
    expect:
      "Short low-power exchanges between ships' bridges about who will pass whom, and in some ports traffic for lock and bridge keepers.",
    reception: "Short range: US rules hold it to 1 watt in normal use, so only a few kilometres.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      'MCA MGN 324: channel 13 "is designated for use on a worldwide basis as a navigation safety communication channel, primarily for inter-ship navigation safety communications. It may also be used for the ship movement and port services."',
      'Ofcom lists 156.65 MHz for "GMDSS ship-to-ship communications relating to the safety of navigation"; 47 CFR 80.373 gives it the channel number 13 and a normal power of 1 watt.',
    ],
    sources: [MCA_MGN324, OFCOM_SAR, CFR_80_373],
    aliases: ["channel 13", "bridge to bridge"],
  },
  {
    id: "ds-marine-vhf-6",
    kind: "distress",
    name: "Marine VHF channel 6, ship to ship safety and search and rescue with aircraft",
    what: "An intership channel that is also the frequency between ships and aircraft working together in a co-ordinated search and rescue.",
    frequencies: [{ khz: 156_300, channel: "06" }],
    modes: ["NFM"],
    bands: ["marine-vhf"],
    where: ["world"],
    expect: "Routine talk between vessels; during a search, a rescue helicopter or aircraft talking to lifeboats and ships at the scene.",
    reception: "Line of sight; much further when an aircraft is transmitting.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      'Ofcom: 156.3 MHz is for "communications between ship stations and aircraft stations engaged in co-ordinated SAR operations".',
      'UK AIP GEN 3.6 lists "156.300 MHz Channel 6 VHF/FM Marine" among the scene-of-search frequencies.',
      "MCA MGN 324 names channels 6, 8, 72 and 77 for routine ship-to-ship working in UK waters.",
    ],
    sources: [OFCOM_SAR, CFR_80_373, UK_AIP_GEN36, MCA_MGN324],
    aliases: ["channel 6", "ch06"],
  },
  {
    id: "ds-us-marine-vhf-9",
    kind: "distress",
    name: "Marine VHF channel 9, boaters' calling channel (USA)",
    what: "In the United States, the calling channel for recreational and other non-commercial boats, set aside to take routine calling off channel 16.",
    frequencies: [{ khz: 156_450, channel: "09" }],
    modes: ["NFM"],
    bands: ["marine-vhf"],
    where: ["US"],
    expect: "Pleasure boats calling marinas, bridges and each other.",
    reception: "Line of sight, tens of kilometres.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      '47 CFR 80.369(e)(4): "Distress, urgency and safety calls should initially be made on 156.800 MHz (channel 16) or, if equipped with DSC, on 156.525 MHz (channel 70)."',
      "47 CFR 80.310: non-commercial vessels may keep their watch on channel 9 instead of channel 16 for call and reply.",
    ],
    sources: [CFR_80_369, CFR_80_310],
    aliases: ["channel 9"],
  },
  {
    id: "ds-ais-sart",
    kind: "distress",
    name: "AIS 1 and AIS 2, ship positions and AIS search and rescue transmitters",
    what: "The two channels of the Automatic Identification System, on which ships send their identity, position, course and speed. An AIS-SART (a survival-craft locator) sends its position on them too.",
    frequencies: [
      { khz: 161_975, channel: "AIS 1" },
      { khz: 162_025, channel: "AIS 2" },
    ],
    modes: ["AIS"],
    bands: ["marine-vhf"],
    where: ["world"],
    hours: "Continuous",
    expect:
      "Rapid data bursts. With an SDR and AIS decoding software, a list or chart of nearby ships; an AIS-SART shows as a distinct distress target.",
    reception: "Line of sight from ships, tens of kilometres; an antenna up high helps a great deal.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      'Ofcom: "AIS 1 – used for AIS search and rescue transmitters (AIS-SART) for use in search and rescue operations", and the same for AIS 2.',
    ],
    sources: [OFCOM_SAR, MCA_MGN324],
    aliases: ["AIS", "AIS-SART"],
  },
  // Marine MF and HF.
  {
    id: "ds-marine-mf-2182",
    kind: "distress",
    name: "2182 kHz, international MF voice distress and calling",
    what: "The medium-frequency marine voice distress frequency, the long-range counterpart of channel 16 from before satellites. Far fewer stations listen on it than once did.",
    frequencies: [{ khz: 2182, note: "carrier frequency; upper sideband" }],
    modes: ["USB"],
    bands: ["marine-mf"],
    where: ["world"],
    expect:
      "Mostly silence and noise. Coastguards in some countries announce their scheduled broadcasts here before moving to a working frequency; occasionally ships calling.",
    reception: "Hundreds of kilometres by ground wave, further at night.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      'Ofcom: "International distress carrier frequency for radiotelephony". US rules (47 CFR 80.369(a)) require J3E, single sideband with suppressed carrier, on 2182 kHz with stated exceptions.',
      "The US Coast Guard stopped its watch on 2182 kHz, its guard of DSC on 2187.5 kHz and its 2670 kHz broadcasts on 1 August 2013 (78 FR 42102).",
      'The Canadian Coast Guard\'s Radio Aids to Marine Navigation 2026 says its MCTS centres "continue to monitor the current distress and safety channels VHF Ch16 and MF 2182 kHz".',
    ],
    sources: [OFCOM_SAR, CFR_80_369, CFR_80_1077, USCG_2182, CCG_RAMN],
    aliases: ["2182", "MF distress"],
  },
  {
    id: "ds-marine-mf-dsc-2187.5",
    kind: "distress",
    name: "2187.5 kHz, MF digital selective calling",
    what: "The medium-frequency DSC channel for distress alerts and calls, the MF counterpart of channel 70.",
    frequencies: [{ khz: 2187.5 }],
    modes: ["DSC"],
    bands: ["marine-mf"],
    where: ["world"],
    expect: "Occasional short data bursts; a DSC decoder on an SSB receiver shows the call.",
    reception: "Hundreds of kilometres, further at night.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      "47 CFR 80.1077 note 3: used for ship-to-ship alerting and, within sea area A2, ship-to-shore alerting.",
      "Not guarded by the US Coast Guard since 1 August 2013; guarded by Canadian MCTS centres by automated watch (RAMN 2026).",
    ],
    sources: [OFCOM_SAR, CFR_80_1077, USCG_2182, CCG_RAMN],
    aliases: ["2187.5", "MF DSC"],
  },
  {
    id: "ds-marine-hf-voice",
    kind: "distress",
    name: "HF marine voice distress and safety frequencies",
    what: "Five shortwave frequencies for long-range voice distress and safety traffic between ships and coast stations, in the 4, 6, 8, 12 and 16 MHz marine bands.",
    frequencies: [
      { khz: 4125, note: "also between aircraft and ships for distress and safety" },
      { khz: 6215 },
      { khz: 8291 },
      { khz: 12_290 },
      { khz: 16_420 },
    ],
    modes: ["USB"],
    bands: ["marine-hf"],
    where: ["world"],
    expect:
      "Mostly quiet. Coast radio stations and rescue centres keep watch on some of them; you may hear a ship calling a coast station, or distress traffic being worked.",
    reception: "Thousands of kilometres depending on time of day: the lower frequencies at night, the higher ones by day.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      'Ofcom calls 4125 and 6215 kHz "carrier frequency used to supplement 2 182 kHz for distress and safety", and 8291, 12290 and 16420 kHz "carrier frequency for GMDSS distress and safety traffic by radiotelephony".',
      '47 CFR 80.369(b): "may be used by coast and ship stations on a simplex basis for distress and safety communications".',
      "The 2013 US Coast Guard notice pointed mariners to the HF distress frequencies and to DSC and satellite systems after ending its 2182 kHz watch.",
    ],
    links: [{ to: "/radio/propagation", label: "Is HF open now" }],
    sources: [OFCOM_SAR, CFR_80_369, CFR_80_1077, USCG_2182],
    aliases: ["4125", "6215", "8291", "12290", "16420", "HF distress"],
  },
  {
    id: "ds-marine-hf-dsc",
    kind: "distress",
    name: "HF marine digital selective calling (DSC) distress frequencies",
    what: "The shortwave DSC channels on which ships far from land send digital distress alerts.",
    frequencies: [{ khz: 4207.5 }, { khz: 6312 }, { khz: 8414.5 }, { khz: 12_577 }, { khz: 16_804.5 }],
    modes: ["DSC"],
    bands: ["marine-hf"],
    where: ["world"],
    hours: "Continuous",
    expect:
      "Short bursts of data, including test calls and coast stations acknowledging alerts. A DSC decoder on an SSB receiver shows the ship's MMSI, the call and, for a distress alert, the position.",
    reception: "Worldwide at the right time of day.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: ["47 CFR 80.1077 note 2: ships with MF/HF equipment keep a watch on 2187.5 kHz, 8414.5 kHz and one other DSC frequency."],
    links: [{ to: "/radio/propagation", label: "Is HF open now" }],
    sources: [OFCOM_SAR, CFR_80_1077, CCG_RAMN],
    aliases: ["HF DSC", "8414.5"],
  },
  {
    id: "ds-marine-nbdp-distress",
    kind: "distress",
    name: "MF and HF narrow-band direct-printing (telex) distress frequencies",
    what: "Frequencies for GMDSS distress and safety traffic sent as text by narrow-band direct printing, a radio telex.",
    frequencies: [{ khz: 2174.5 }, { khz: 4177.5 }, { khz: 6268 }, { khz: 8376.5 }, { khz: 12_520 }, { khz: 16_695 }],
    modes: ["SITOR-B"],
    bands: ["marine-mf", "marine-hf"],
    where: ["world"],
    expect: "Usually nothing. When used, a chirping two-tone data signal; a SITOR decoder prints the text.",
    reception: "As the voice frequencies of the same bands.",
    listening: LISTEN_MARINE,
    status: "occasional",
    notes: [
      'Ofcom lists each of these as "GMDSS distress and safety traffic by NBDP" (2174.5 kHz as the "International GMDSS distress frequency for narrow-band direct-printing telegraphy").',
      "The sources give the system as NBDP; the mode named here (SITOR-B, the broadcast form) is the nearest the app lists, and a SITOR decoder that also reads the ARQ form may be needed.",
    ],
    sources: [OFCOM_SAR, CFR_80_1077],
    aliases: ["NBDP", "telex", "radiotelex"],
  },
  // National marine watch.
  {
    id: "ds-ca-mcts",
    kind: "distress",
    name: "Canadian Coast Guard MCTS distress watch",
    operator: "Canadian Coast Guard, Marine Communications and Traffic Services (MCTS)",
    what: "The distress channels the Canadian Coast Guard's MCTS centres say they watch: voice on channel 16 and 2182 kHz, and DSC on channel 70 and 2187.5 kHz.",
    frequencies: [
      { khz: 156_800, channel: "16" },
      { khz: 156_525, channel: "70", note: "DSC, automated watch" },
      { khz: 2182, note: "upper sideband" },
      { khz: 2187.5, note: "DSC, automated watch" },
    ],
    modes: ["NFM", "USB", "DSC"],
    bands: ["marine-vhf", "marine-mf"],
    where: ["CA"],
    hours: "Continuous",
    expect: "MCTS officers answering calls and announcing broadcasts in English and French, then moving to a working channel.",
    reception: "VHF along the coasts, the St. Lawrence and the Great Lakes; MF further.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      'RAMN 2026: "2182 kHz and Ch16 (156.800 MHz) shall only be used for distress, urgency and safety communications and for calling purposes." Initial calls go on 2182 kHz or channel 16 "because the MCTS Centres do not monitor MF/VHF working frequencies."',
    ],
    sources: [CCG_RAMN],
    aliases: ["MCTS", "Canadian Coast Guard Radio"],
  },
  {
    id: "ds-au-marine",
    kind: "distress",
    name: "Australian small-craft distress channels: VHF 16, 27 MHz channel 88 and HF",
    what: "The distress frequencies Australian state boating authorities give small craft: VHF channel 16, 27 MHz marine channel 88, and the HF frequencies 4125, 6215 and 8291 kHz.",
    frequencies: [
      { khz: 156_800, channel: "16" },
      { khz: 27_880, channel: "88", note: "27 MHz marine band" },
      { khz: 4125, note: "upper sideband" },
      { khz: 6215, note: "upper sideband" },
      { khz: 8291, note: "upper sideband" },
    ],
    modes: ["NFM", "USB"],
    bands: ["marine-vhf", "hf", "marine-hf"],
    where: ["AU"],
    expect: "Volunteer marine rescue bases taking log-on calls from boats, weather and safety notices, and distress traffic.",
    reception: "VHF and 27 MHz along the coast near a rescue base; HF along the whole coast.",
    listening: LISTEN_MARINE,
    status: "on-air",
    notes: [
      "The NSW Government lists VHF 16, 27 MHz 88, and HF 4125, 6215 and 8291 kHz as distress channels, and gives the JRCC Australia telephone number 1800 641 792.",
      'The frequency of 27 MHz channel 88 (27.88 MHz) and the note that "most marine rescue groups monitor channel 27.88MHz, if in range, but larger vessels at sea do not listen to this radio" are from a Maritime Safety Queensland fact sheet dated January 2015; it also named Coast Radio Cairns and Gladstone watching the three HF frequencies, which was not checked against a newer source.',
      "The mode of 27 MHz marine sets (AM or FM) was not given in the sources read.",
      "The Australian Maritime Safety Authority's own pages refused the automated check on 17 November 2026.",
    ],
    sources: [NSW_SAR, MSQ_FACTSHEET],
    aliases: ["channel 88", "27.88", "VMR", "Marine Rescue"],
  },
  {
    id: "ds-gb-sar-working",
    kind: "distress",
    name: "UK coastguard and lifeboat search and rescue working frequencies",
    operator: "HM Coastguard, the RNLI and other UK search and rescue services",
    what: "Frequencies Ofcom lists as used by HM Coastguard, the RNLI and UK search and rescue on top of the international ones, heard during a rescue near the UK coast.",
    frequencies: [
      { khz: 2596, note: "HM Coastguard and RNLI search and rescue, sideband" },
      { khz: 132_650, note: "SAR helicopter co-ordination and counter-pollution" },
      { khz: 156_000, note: "HM Coastguard SAR on the UK coast" },
      { khz: 156_375, note: "SAR and anti-pollution; HM Coastguard yacht safety channel (1st reserve)" },
      { khz: 156_675, note: "SAR and anti-pollution; HM Coastguard 2nd reserve channel for SAR" },
      { khz: 160_600, note: "HM Coastguard SAR on the UK coast" },
    ],
    modes: ["USB", "AM", "NFM"],
    bands: ["marine-mf", "air-vhf", "marine-vhf"],
    where: ["GB"],
    expect: "Only during an operation: coastguard, lifeboat and helicopter crews working a rescue.",
    reception: "Near the scene; the helicopter frequency much further.",
    listening: LISTEN_MARINE,
    status: "occasional",
    notes: [
      'Ofcom\'s annex gives the uses; it does not give the mode of each. 2596 kHz is listed as a "carrier frequency for radiotelephony" (sideband); 132.65 MHz is in the air band (AM); the others are marine VHF (narrow FM). The modes are inferred from the bands.',
    ],
    sources: [OFCOM_SAR],
    aliases: ["HM Coastguard", "RNLI", "lifeboat"],
  },
  // Aviation.
  {
    id: "ds-air-121.5",
    kind: "distress",
    name: "121.5 MHz, aeronautical emergency frequency",
    what: "The international voice emergency frequency for aircraft, also used by survival craft, and the homing signal sent by 406 MHz beacons.",
    frequencies: [{ khz: 121_500 }],
    modes: ["AM"],
    bands: ["air-vhf"],
    where: ["world"],
    hours: "Continuous",
    expect:
      'Usually quiet. Pilots calling "Mayday" or "Pan-pan", air traffic emergency services answering, and the tone of a distress beacon homing signal.',
    reception: "Line of sight: hundreds of kilometres to an aircraft at height, much less to the ground.",
    listening: LISTEN_AIR,
    status: "on-air",
    notes: [
      'UK AIP GEN 3.4: "An emergency communications and aid service is continuously available on 121.500 from the Distress and Diversion (D & D) section located at RAF (U) Swanwick", callsign "London Centre", covering most of the UK above 3000 ft.',
      'UK AIP ENR 2.2: in the Shanwick oceanic area 121.500 MHz "should be continuously guarded" by aircraft.',
      "47 CFR 80.1061: a 406 MHz EPIRB must carry a 121.500 MHz homing beacon. Satellites no longer pick up 121.5 MHz signals (since 2009, NOAA SARSAT).",
    ],
    sources: [OFCOM_SAR, CFR_87_173, CFR_87_187, CFR_80_1061, UK_AIP_GEN34, UK_AIP_GEN36, UK_AIP_ENR22, NOAA_406],
    aliases: ["guard", "VHF guard", "121.5", "Mayday"],
  },
  {
    id: "ds-air-243",
    kind: "distress",
    name: "243 MHz, military emergency and survival craft frequency",
    what: "The UHF emergency frequency, used by military aircraft and by survival craft and emergency locator transmitters.",
    frequencies: [{ khz: 243_000 }],
    modes: ["AM"],
    bands: ["air-uhf"],
    where: ["world"],
    expect: "Usually quiet; military emergency calls and practice, and beacon tones.",
    reception: "Line of sight to aircraft.",
    listening: LISTEN_AIR,
    status: "on-air",
    notes: [
      'Ofcom: the band 242.95 to 243.05 MHz for "survival craft stations and equipment used for survival purposes".',
      '47 CFR 87.187(k): 121.500 MHz and 243.000 MHz are "emergency and distress frequences available for use by survival craft stations, emergency locator transmitters and equipment used for survival pruposes" (sic).',
      "UK AIP GEN 3.6: carried for speech and homing by HM Coastguard and Ministry of Defence aircraft.",
    ],
    sources: [OFCOM_SAR, CFR_87_173, CFR_87_187, UK_AIP_GEN36],
    aliases: ["243", "UHF guard"],
  },
  {
    id: "ds-sar-on-scene",
    kind: "distress",
    name: "Search and rescue on-scene frequencies: 123.1 MHz, 3023 kHz, 5680 kHz and 8364 kHz",
    what: "Frequencies aircraft, ships and rescue services use at the scene of a co-ordinated search and rescue, so that 121.5 MHz and channel 16 stay clear.",
    frequencies: [
      { khz: 123_100, note: "auxiliary to 121.5 MHz" },
      { khz: 3023, note: "SAMAR 1, night (UK AIP); upper sideband" },
      { khz: 5680, note: "SAMAR 1, day (UK AIP); upper sideband" },
      { khz: 8364, note: "survival craft and international intercommunication" },
    ],
    modes: ["AM", "USB"],
    bands: ["air-vhf", "air-hf"],
    where: ["world"],
    expect: "Only during a search: rescue aircraft, ships and coordination centres working together.",
    reception: "123.1 MHz line of sight; 3023 and 5680 kHz hundreds to thousands of kilometres.",
    listening: LISTEN_AIR,
    status: "occasional",
    notes: [
      "47 CFR 80.369(e)(1): stations must use 121.500 MHz for search and rescue only when 123.100 MHz or other VHF frequencies are not practicable, and shift to 123.100 MHz as soon as possible.",
      "47 CFR 80.1077 note 6: for ship-aircraft working, 4125 kHz first, then 3023 kHz.",
      'UK AIP GEN 3.6 gives the scene-of-search list, including 3085 and 5695 kHz for military use (not listed here); "Other HF frequencies may be used as directed by the controlling JRCC."',
      'Shanwick Radio lists 2182, 3023 and 5680 kHz as its search and rescue frequencies, "operated as required" (UK AIP ENR 2.2).',
    ],
    sources: [OFCOM_SAR, CFR_80_369, CFR_80_1077, UK_AIP_GEN36, UK_AIP_ENR22],
    aliases: ["123.1", "SAMAR", "scene of search"],
  },
  {
    id: "ds-air-123.45",
    kind: "distress",
    name: "123.450 MHz, inter-pilot air-to-air frequency over oceans and remote areas",
    what: "The VHF frequency on which aircraft over the oceans, out of range of ground stations, talk to each other: relaying position reports, turbulence, and offsets.",
    frequencies: [{ khz: 123_450 }],
    modes: ["AM"],
    bands: ["air-vhf"],
    where: ["north-atlantic", "world"],
    hours: "Continuous",
    expect: "Airline crews passing ride reports and relaying messages for each other, in English.",
    reception:
      "Mainly heard near coasts below the North Atlantic tracks and other oceanic routes, from aircraft at height up to a few hundred kilometres away.",
    listening: LISTEN_AIR,
    status: "on-air",
    notes: [
      'UK AIP ENR 2.2 (Shanwick): "Air-to-Air — 123.450 MHz H24 Air-to-Air inter-pilot frequency."',
      'TC AIM: "The inter-pilot air-to-air VHF frequency, 123.450 MHz, may be used to relay position reports via another aircraft."',
      "In the United States 47 CFR 87.173 lists 123.450 MHz among the frequencies for flight test stations (Part 87, subpart J), with no remark; the US rules read give it no air-to-air use.",
    ],
    sources: [UK_AIP_ENR22, TC_AIM_NAT, CFR_87_173],
    aliases: ["inter-pilot", "air to air", "123.45"],
  },
  {
    id: "ds-gb-air-to-air",
    kind: "distress",
    name: "UK common air-to-air channels for general aviation",
    what: "Two channels the UK assigns for pilots of light aircraft to share safety information with each other, mainly outside controlled airspace.",
    frequencies: [
      { khz: 123_065, channel: "123.065", note: "8.33 kHz channel name as published" },
      { khz: 123_135, channel: "123.135", note: "8.33 kHz channel name as published" },
    ],
    modes: ["AM"],
    bands: ["air-vhf"],
    where: ["GB"],
    expect: "Light aircraft pilots talking about weather, formation flights and where they are.",
    reception: "Line of sight to aircraft.",
    listening: LISTEN_AIR,
    status: "on-air",
    notes: [
      'UK AIP GEN 3.4, 3.2.6: "Two channels 123.065 and 123.135 have been assigned for Air-to-Air communications." The AIP says they "will eventually be allocated European-wide".',
      "The values are 8.33 kHz channel names; the exact carrier frequency of an 8.33 kHz channel can differ slightly from its name.",
    ],
    sources: [UK_AIP_GEN34],
    aliases: ["air to air", "GA"],
  },
  {
    id: "ds-us-air-to-air",
    kind: "distress",
    name: "US air-to-air frequencies: 122.750 MHz (fixed wing) and 123.025 MHz (helicopters)",
    what: "The frequencies US rules authorise for private fixed-wing aircraft and for helicopters to talk to each other.",
    frequencies: [
      { khz: 122_750, note: "private fixed-wing aircraft" },
      { khz: 123_025, note: "helicopters" },
    ],
    modes: ["AM"],
    bands: ["air-vhf"],
    where: ["US"],
    expect: "Pilots talking to each other.",
    reception: "Line of sight to aircraft.",
    listening: LISTEN_AIR,
    status: "on-air",
    notes: [
      '47 CFR 87.187(j): "The frequency 122.750 MHz is authoried for use by private fixed wing aircraft for air-air communications. The frequency 123.025 MHz is authorized for use by helicopters for air-air Communications." (sic)',
    ],
    sources: [CFR_87_187, CFR_87_173],
    aliases: ["air to air"],
  },
  {
    id: "ds-nat-hf-shanwick",
    kind: "distress",
    name: "Shanwick Radio, North Atlantic HF air-ground families",
    operator: "Irish Aviation Authority (Shanwick Radio, Ballygirreen)",
    what: "The shortwave frequencies on which airliners crossing the eastern North Atlantic give position reports to Shanwick Radio. NAT frequencies are grouped into families, each assigned to a band of latitudes.",
    frequencies: [
      { khz: 3016, note: "Family A, southern routes 43N to 47N", hours: "01:00 to 09:00 and 18:00 to 22:00 UTC" },
      { khz: 5598, note: "Family A", hours: "Continuous" },
      { khz: 8906, note: "Family A", hours: "09:00 to 21:00 UTC" },
      { khz: 13_306, note: "Families A and C", hours: "As needed (HO)" },
      { khz: 2899, note: "Family B, 47N to 64N", hours: "00:00 to 09:00 and 18:00 to 24:00 UTC" },
      { khz: 5616, note: "Family B", hours: "Continuous" },
      { khz: 8864, note: "Family B", hours: "09:00 to 21:00 UTC" },
      { khz: 13_291, note: "Families B and F", hours: "As needed (HO)" },
      { khz: 17_946, note: "Families B, C, D and F", hours: "As needed (HO)" },
      { khz: 2872, note: "Family C, 47N to 64N", hours: "00:00 to 09:00 and 18:00 to 24:00 UTC" },
      { khz: 5649, note: "Family C", hours: "Continuous" },
      { khz: 8879, note: "Family C", hours: "09:00 to 21:00 UTC" },
      { khz: 11_336, note: "Family C", hours: "As needed (HO)" },
      { khz: 2971, note: "Family D, north of 62N", hours: "01:00 to 08:00 UTC" },
      { khz: 4675, note: "Family D", hours: "01:00 to 08:00 and 11:00 to 18:00 UTC" },
      { khz: 8891, note: "Family D", hours: "As needed (HO)" },
      { khz: 11_279, note: "Family D", hours: "As needed (HO)" },
      { khz: 3476, note: "Family F, tactical with Gander", hours: "01:00 to 08:00 UTC" },
      { khz: 6622, note: "Family F", hours: "10:00 to 18:00 UTC" },
      { khz: 8831, note: "Family F", hours: "10:00 to 18:00 UTC" },
    ],
    modes: ["USB"],
    bands: ["air-hf"],
    where: ["north-atlantic", "GB", "IE"],
    site: "Ballygirreen, near Shannon, Ireland",
    expect:
      'Radio operators reading back position reports and oceanic clearances to airliners ("Shanwick, Speedbird 123, position..."), in English, and SELCAL tones.',
    reception: "Across the North Atlantic and western Europe; pick the frequency by time of day, low at night and high by day.",
    listening: LISTEN_AIR,
    status: "on-air",
    notes: [
      'Frequencies and hours from UK AIP ENR 2.2, section 3 (Shanwick). The AIP pairs each frequency with its hours in columns; they are read here in order. Hours in the UK AIP are UTC. "Hours of service of individual frequencies, or groups of frequencies, may vary as HF propagation conditions or operational requirements demand."',
      "Families H, I and J (tactical, shared with neighbouring NARTEL stations) are listed in the same AIP section and are not repeated here.",
      'TC AIM: "All international high frequency (HF) equipment is operated on single sideband (SSB) J3E emission. In all cases, the upper sideband (USB) is employed."',
      "Gander, New York and Santa Maria share the NAT families; their own lists were not read.",
    ],
    links: [{ to: "/radio/propagation", label: "Is HF open now" }],
    sources: [UK_AIP_ENR22, TC_AIM_NAT],
    aliases: ["Shanwick", "NAT", "MWARA", "oceanic", "HF air"],
  },
  // Beacons.
  {
    id: "ds-406-beacons",
    kind: "distress",
    name: "406 MHz distress beacons: EPIRBs, ELTs and PLBs",
    operator: "International Cospas-Sarsat Programme (the satellites and ground stations that receive them)",
    what: "The band on which distress beacons send a coded alert up to search and rescue satellites: EPIRBs on ships, ELTs in aircraft and personal locator beacons carried by walkers and sailors.",
    frequencies: [{ khz: 406_000, toKhz: 406_100 }],
    modes: ["BEACON"],
    bands: ["beacon-406"],
    where: ["world"],
    expect:
      "Nothing useful by ear: the 406 MHz signal is a short digital burst meant for satellites. What a listener near a beacon can hear is its separate homing signal on 121.5 MHz, an analogue tone.",
    listening: "406 to 406.1 MHz is for distress beacons only; nothing else may transmit there.",
    status: "on-air",
    notes: [
      'NOAA SARSAT: "406 MHz is the only frequency satellites can pick up in the event of a distress activation. Satellites have not had the ability to detect 121.5 MHz signals since 2009."',
      'NOAA SARSAT FAQ: 121.5 MHz beacons "transmit an analog signal that can only be detected by personnel monitoring 121.5 MHz on a radio on the ground or in an aircraft."',
      "Register a beacon with the national registry of the country it is coded for.",
    ],
    sources: [NOAA_406, NOAA_FAQ, OFCOM_SAR, CFR_80_1077, CFR_87_187],
    aliases: ["EPIRB", "PLB", "ELT", "Cospas-Sarsat", "406"],
  },
];

// ── Guides ──────────────────────────────────────────────────────────────────

export const DISTRESS_GUIDES: FrequencyGuide[] = [
  {
    id: "ds-guide-listening",
    kind: "distress",
    title: "Listening on distress frequencies",
    paragraphs: [
      'Distress and calling frequencies are for listening, unless you are licensed for the service and have a reason to call. Transmitting a false or hoax distress call is an offence nearly everywhere. In the UK, the Wireless Telegraphy Act 2006, section 47, makes it an offence to send a message you know is false or misleading and likely to endanger a ship, aircraft or person, in particular one that "falsely suggests that a ship or aircraft... is in distress". In the United States, 47 U.S.C. 325(a) says no person shall "knowingly utter or transmit... any false or fraudulent signal of distress". Other countries have rules of the same kind; this is general information, not legal advice.',
      'If you hear a distress call, keep quiet and listen. Ofcom: "Distress calls take absolute priority over all other transmissions; anyone receiving a distress call must immediately cease any transmissions that may interfere with the call and listen on the frequency used for the call." A coastguard or air traffic unit will normally answer.',
      "Do not repeat or publish what you hear. In the UK, section 48 of the same Act makes it an offence to use a receiver with intent to obtain information from a message not meant for you, or to disclose it, without lawful authority.",
      "What to expect: marine VHF channel 16 and the air band 121.5 MHz are quiet most of the time. Voice on VHF is narrow FM at sea and AM in the air; HF marine and aeronautical voice is upper sideband, so an HF set needs SSB. DSC and AIS are data and need a decoder.",
    ],
    sources: [WTA_47, WTA_48, USC_325, CFR_80_89, OFCOM_SAR, TC_AIM_NAT],
  },
  {
    id: "ds-guide-gmdss",
    kind: "distress",
    title: "GMDSS in brief",
    paragraphs: [
      "The Global Maritime Distress and Safety System (GMDSS) is the internationally agreed set of satellite and land-based radio systems ships use to raise the alarm and receive safety information. Instead of relying on someone hearing a voice call, a ship sends a digital distress alert by DSC (on VHF channel 70, on 2187.5 kHz or on the HF DSC frequencies) or by satellite, and a 406 MHz EPIRB can raise the alarm on its own.",
      "Coverage is described by sea areas. US rules (47 CFR 80.1069) define sea area A1 as within the coverage of a VHF coast station with continuous DSC alerting, A2 as within an MF coast station's coverage outside A1, A3 as within the coverage of an Inmarsat geostationary satellite outside A1 and A2, and A4 as the rest. The IMO's resolution MSC.509(105) says each area A1 or A2 \"requires a continuous\" VHF or MF guard by coast stations affiliated to a rescue coordination centre.",
      "For a listener, the voice side of GMDSS is still channel 16, 2182 kHz and the HF voice frequencies 4125, 6215, 8291, 12290 and 16420 kHz; maritime safety information comes by NAVTEX on 518 and 490 kHz and by satellite (see Weather).",
    ],
    sources: [CFR_80_1077, CFR_80_1069, IMO_MSC509, USCG_2182],
  },
];
