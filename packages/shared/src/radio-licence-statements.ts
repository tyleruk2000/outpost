/**
 * What needs a radio licence (Help → What needs a radio licence, and the one-line licence
 * notices on the radio screens): for each activity, what Ofcom (GB) and the FCC and US law
 * (US) say, from their own documents, with the day each was read.
 *
 * Outpost itself never transmits on an amateur frequency: it receives (APRS, aircraft,
 * ships, satellites, time signals) and helps people plan. Where a regulator says nothing
 * specific about a signal, the entry says so in `unknown` rather than guessing.
 * Quotations are exact. General information, not legal advice.
 */
import type { FrequencySource } from "./radio-frequencies.ts";
import type { LicenceStatement } from "./radio-licence.ts";

const CHECKED = "2026-11-21";

// ── Sources: GB ─────────────────────────────────────────────────────────────

const OFCOM_RULES: FrequencySource = {
  publisher: "Ofcom",
  title:
    "Rules on using radio equipment, published 10 July 2023 (sections on general radio reception and scanners, and unauthorised reception)",
  url: "https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law",
  checked: CHECKED,
};
const OFCOM_EXEMPTION_LIST: FrequencySource = {
  publisher: "Ofcom",
  title: "Wireless Telegraphy Exemption Regulations, last updated 25 March 2025",
  url: "https://www.ofcom.org.uk/spectrum/radio-equipment/wireless-telegraphy-regulations",
  checked: CHECKED,
};
const UK_RECEIVERS_1989: FrequencySource = {
  publisher: "UK legislation (legislation.gov.uk)",
  title: "The Wireless Telegraphy Apparatus (Receivers) (Exemption) Regulations 1989, SI 1989/123, as made",
  url: "https://www.legislation.gov.uk/uksi/1989/123/made",
  checked: CHECKED,
};
const UK_EXEMPTION_2021: FrequencySource = {
  publisher: "UK legislation (legislation.gov.uk)",
  title:
    "The Wireless Telegraphy (Exemption) Regulations 2021, SI 2021/493, revised version valid from 29 April 2026 (regulations 4 and 9)",
  url: "https://www.legislation.gov.uk/uksi/2021/493",
  checked: CHECKED,
};
const WTA_8: FrequencySource = {
  publisher: "UK legislation (legislation.gov.uk)",
  title: "Wireless Telegraphy Act 2006, section 8, Licences and exemptions",
  url: "https://www.legislation.gov.uk/ukpga/2006/36/section/8",
  checked: CHECKED,
};
const WTA_48: FrequencySource = {
  publisher: "UK legislation (legislation.gov.uk)",
  title: "Wireless Telegraphy Act 2006, section 48, Interception and disclosure of messages",
  url: "https://www.legislation.gov.uk/ukpga/2006/36/section/48",
  checked: CHECKED,
};
const OFCOM_IR2030: FrequencySource = {
  publisher: "Ofcom",
  title: "UK Interface Requirement 2030, Licence exempt Short Range Devices, published 23 October 2026",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir-2030.pdf",
  checked: CHECKED,
};
const OFCOM_PMR446: FrequencySource = {
  publisher: "Ofcom",
  title: "Analogue and Digital PMR446 Information Sheet, February 2018",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/business-radio/business-radio-guidance/ir_2009_analogue_and_digita1.pdf",
  checked: CHECKED,
};
const OFCOM_CB_GUIDE: FrequencySource = {
  publisher: "Ofcom",
  title: "Citizens' Band (CB) radio spectrum use: information and operation, guidance, March 2018",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/spectrum-enforcement/citizens-band.pdf",
  checked: CHECKED,
};
const OFCOM_AMATEUR_LICENCE: FrequencySource = {
  publisher: "Ofcom",
  title: "Amateur Radio Wireless Telegraphy Licence Conditions Booklet (OFW611), published 21 February 2024",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/emf/emf-amateur-licence-terms-and-conditions.pdf",
  checked: CHECKED,
};
const OFCOM_AMATEUR_GUIDANCE: FrequencySource = {
  publisher: "Ofcom",
  title: "Amateur Radio Guidance, licensing guidance document for amateur radio, updated 14 October 2025",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/amateur/amateur_radio_licence_guidance_for_licensees.pdf",
  checked: CHECKED,
};

// ── Sources: US ─────────────────────────────────────────────────────────────

const cfr = (volume: number, section: string, title: string): FrequencySource => ({
  publisher: "US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition)",
  title: `47 CFR ${section}, ${title}`,
  url: `https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol${volume}/xml/CFR-2025-title47-vol${volume}-sec${section.replace(".", "-")}.xml`,
  checked: CHECKED,
});
const CFR_97_5 = cfr(5, "97.5", "Station license required");
const CFR_97_113 = cfr(5, "97.113", "Prohibited transmissions");
const CFR_97_301 = cfr(5, "97.301", "Authorized frequency bands");
const CFR_95_305 = cfr(5, "95.305", "Authorization to operate Personal Radio Services stations");
const CFR_95_1705 = cfr(5, "95.1705", "Individual licenses required; eligibility; who may operate; cooperative use (GMRS)");
const CFR_15_1 = cfr(1, "15.1", "Scope of this part");
const CFR_15_5 = cfr(1, "15.5", "General conditions of operation");
const CFR_15_121 = cfr(1, "15.121", "Scanning receivers and frequency converters used with scanning receivers");
const CFR_15_247 = cfr(1, "15.247", "Operation within the bands 902-928 MHz, 2400-2483.5 MHz, and 5725-5850 MHz");

const USC_605: FrequencySource = {
  publisher: "US Government Publishing Office",
  title: "47 U.S.C. 605, Unauthorized publication or use of communications (United States Code, 2023 edition)",
  url: "https://www.govinfo.gov/content/pkg/USCODE-2023-title47/html/USCODE-2023-title47-chap5-subchapVI-sec605.htm",
  checked: CHECKED,
};
const USC_18_2511: FrequencySource = {
  publisher: "US Government Publishing Office",
  title:
    "18 U.S.C. 2511, Interception and disclosure of wire, oral, or electronic communications prohibited (United States Code, 2023 edition)",
  url: "https://www.govinfo.gov/content/pkg/USCODE-2023-title18/html/USCODE-2023-title18-partI-chap119-sec2511.htm",
  checked: CHECKED,
};
const USC_18_2510: FrequencySource = {
  publisher: "US Government Publishing Office",
  title: "18 U.S.C. 2510, Definitions, paragraph (16) (United States Code, 2023 edition)",
  url: "https://www.govinfo.gov/content/pkg/USCODE-2023-title18/html/USCODE-2023-title18-partI-chap119-sec2510.htm",
  checked: CHECKED,
};

// ── Sources: band plans and products (not law) ──────────────────────────────

const IARU_R1_VHF: FrequencySource = {
  publisher: "IARU Region 1",
  title: "IARU-R1 VHF Handbook, version 10.03, February 2026 (band plans for 50 MHz and up)",
  url: "https://www.iaru-r1.org/wp-content/uploads/2026/02/VHF_Handbook_V10_03_final.pdf",
  checked: CHECKED,
};
const IARU_R2: FrequencySource = {
  publisher: "IARU Region 2",
  title: "IARU Region 2 Band Plan, September 2020",
  url: "https://www.iaru.org/wp-content/uploads/2020/10/IARU-Region-2-Band-plan.pdf",
  checked: CHECKED,
};
const MESHTASTIC_FAQ: FrequencySource = {
  publisher: "Meshtastic project",
  title: "Meshtastic FAQ, Amateur radio (ham)",
  url: "https://meshtastic.org/docs/faq/#amateur-radio-ham",
  checked: CHECKED,
};

const OTHER_COUNTRIES = "Other countries: not read. Ask the national radio regulator.";

// ── Statements ──────────────────────────────────────────────────────────────

export const LICENCE_STATEMENTS: LicenceStatement[] = [
  // Listening.
  {
    id: "receive-broadcast-time",
    group: "listen",
    topic: "Listening to broadcast radio and time-signal stations",
    rules: [
      {
        country: "GB",
        says: "No licence is needed to own or use a receive-only radio for broadcast stations. The receivers exemption covers any apparatus that cannot transmit, except equipment mainly for receiving television (covered by other rules) and equipment used to receive unlicensed broadcasting stations.",
        quote: "Generally, the use of radio receivers is exempt from requiring a licence unless it is also capable of transmission.",
        sources: [OFCOM_RULES, UK_RECEIVERS_1989, OFCOM_EXEMPTION_LIST, WTA_8],
      },
      {
        country: "US",
        says: "Federal law on intercepting and passing on radio messages does not apply to stations transmitting for the general public, which includes broadcast and time-signal stations. Outpost has not read an FCC page that says this in plain words: the FCC's consumer guide on interception was not available to the public when checked.",
        quote:
          "This section shall not apply to the receiving, divulging, publishing, or utilizing the contents of any radio communication which is transmitted by any station for the use of the general public",
        sources: [USC_605, USC_18_2511],
      },
    ],
    unknown: OTHER_COUNTRIES,
  },
  {
    id: "receive-amateur",
    group: "listen",
    topic: "Listening to amateur radio, including APRS and amateur satellites",
    rules: [
      {
        country: "GB",
        says: "No licence is needed to listen with a receive-only radio. Ofcom counts hobby radio among what receivers may be used for. Amateur stations may send calls, beacons and data (APRS is one) for other amateurs to receive. Section 48 still makes it an offence to use a receiver to get at a message meant for someone else, or to pass one on, without lawful authority.",
        quote:
          "Typically, receivers and scanners can only be used for ‘general reception’ such as licensed broadcasting stations and hobby radio.",
        sources: [OFCOM_RULES, UK_RECEIVERS_1989, OFCOM_AMATEUR_LICENCE, WTA_48],
      },
      {
        country: "US",
        says: "Intercepting radio from a station on an authorised amateur, CB or GMRS frequency is not unlawful under the federal interception law, and the rule against passing on radio messages does not apply to amateur and CB stations.",
        quote:
          "by a station operating on an authorized frequency within the bands allocated to the amateur, citizens band, or general mobile radio services",
        sources: [USC_18_2511, USC_605],
      },
    ],
    unknown: OTHER_COUNTRIES,
  },
  {
    id: "receive-aircraft",
    group: "listen",
    topic: "Receiving aircraft: airband voice and ADS-B",
    rules: [
      {
        country: "GB",
        says: "A receive-only radio needs no licence. Ofcom says receivers and scanners can typically be used only for general reception, such as broadcasting and hobby radio, and does not mention aircraft. Section 48 makes it an offence, without lawful authority, to use a receiver with intent to learn the contents, sender or addressee of a message you are not meant to receive, or to disclose it. Ofcom adds that it cannot give specific guidance on the law on receiving and suggests legal advice when in doubt.",
        quote:
          "It is an offence for an unauthorised person to use wireless telegraphy apparatus with intent to obtain information as to the contents, sender or addressee of any message",
        sources: [OFCOM_RULES, WTA_48, UK_RECEIVERS_1989],
      },
      {
        country: "US",
        says: "Intercepting a marine or aeronautical communications system is not unlawful under the federal interception law. The separate rule against divulging or using intercepted radio for your own benefit makes an exception only for broadcasts to the public, distress, amateur and CB, not for aircraft in general.",
        quote: "by any marine or aeronautical communications system",
        sources: [USC_18_2511, USC_605],
      },
    ],
    unknown:
      "Neither Ofcom's page nor the laws read mention ADS-B: Outpost does not know of a statement specific to ADS-B, in either country. Other countries: not read.",
  },
  {
    id: "receive-ships",
    group: "listen",
    topic: "Receiving ships: marine VHF voice and AIS",
    rules: [
      {
        country: "GB",
        says: "A receive-only radio needs no licence. Ofcom's page on receivers does not mention ships; transmitting on marine channels needs a ship radio licence. Section 48 makes it an offence, without lawful authority, to use a receiver with intent to learn the contents, sender or addressee of a message you are not meant to receive, or to disclose it.",
        quote:
          "Typically, receivers and scanners can only be used for ‘general reception’ such as licensed broadcasting stations and hobby radio.",
        sources: [OFCOM_RULES, WTA_48, UK_RECEIVERS_1989],
      },
      {
        country: "US",
        says: "Intercepting a marine or aeronautical communications system is not unlawful under the federal interception law. The rule against divulging or using intercepted radio for your own benefit excepts messages relating to ships in distress, but not ships in general.",
        quote: "which relates to ships, aircraft, vehicles, or persons in distress",
        sources: [USC_18_2511, USC_605],
      },
    ],
    unknown:
      "Neither Ofcom's page nor the laws read mention AIS: Outpost does not know of a statement specific to AIS, in either country. Other countries: not read.",
  },
  {
    id: "receive-other",
    group: "listen",
    topic: "What else is restricted to listen to, or to pass on",
    rules: [
      {
        country: "GB",
        says: "Using a receiver to get at a message not meant for you, without lawful authority, is an offence, and so is telling anyone else what was heard. The maximum penalty Ofcom gives is two years in prison or an unlimited fine. Receiving an unlicensed broadcasting station is outside the receivers exemption.",
        quote:
          "This means that it is illegal to disclose to a third party anything heard in a transmission that a person has listened to without authorisation.",
        sources: [OFCOM_RULES, WTA_48, UK_RECEIVERS_1989],
      },
      {
        country: "US",
        says: "The federal interception law forbids intentionally intercepting electronic communications, with exceptions for radio readily accessible to the general public. Radio that is scrambled or encrypted, or carried by a common carrier such as a mobile phone network, is not readily accessible. Scanners sold in the US must not be able to tune the cellular telephone bands. Passing on, or using for your own benefit, a radio message you were not meant to receive is forbidden outside the exceptions.",
        quote:
          "No person not being authorized by the sender shall intercept any radio communication and divulge or publish the existence, contents, substance, purport, effect, or meaning of such intercepted communication to any person.",
        sources: [USC_605, USC_18_2511, USC_18_2510, CFR_15_121],
      },
    ],
    unknown: OTHER_COUNTRIES,
  },

  // Licence-free radio.
  {
    id: "pmr446-cb",
    group: "licence-free",
    topic: "PMR446 and CB, and in the US FRS, CB and GMRS",
    rules: [
      {
        country: "GB",
        says: "No licence is needed for PMR446 (446.0 to 446.2 MHz, 500 mW e.r.p., handheld with a fixed antenna, no base station or repeater) or CB, as long as the radio meets Ofcom's interface requirement. US FRS radios cannot be used licence-exempt in the UK.",
        quote:
          "PMR446 users are reminded that their radios are only licence-exempt if they are built and operated within the conditions of the exemption regulations.",
        sources: [OFCOM_IR2030, UK_EXEMPTION_2021, OFCOM_PMR446, OFCOM_CB_GUIDE],
      },
      {
        country: "US",
        says: "The FCC authorises FRS, CB and the other Personal Radio Services by rule, with no individual licence. GMRS is the exception: it needs an individual licence, open to anyone 18 or older, which covers the holder's immediate family.",
        quote: "A valid individual license is required to operate a GMRS station.",
        sources: [CFR_95_305, CFR_95_1705],
      },
    ],
    unknown: OTHER_COUNTRIES,
  },
  {
    id: "meshtastic",
    group: "licence-free",
    topic: "Meshtastic and other LoRa radios on the licence-exempt band",
    rules: [
      {
        country: "GB",
        says: "Short range devices that meet Ofcom's IR 2030 are licence-exempt. Its general rows in 863 to 870 MHz have low power limits and duty-cycle or access rules; the highest, 869.40 to 869.65 MHz, allows 500 mW e.r.p. A radio set beyond those limits is not licence-exempt. Meshtastic's licensed (ham) mode drops encryption and sends a callsign so that it can be used as amateur radio: that is amateur use and needs an amateur licence, and Ofcom's licence forbids encryption between amateur stations.",
        quote: "Transmissions between amateur stations are not encrypted for the purpose of obscuring their meaning",
        sources: [OFCOM_IR2030, UK_EXEMPTION_2021, OFCOM_AMATEUR_LICENCE, OFCOM_AMATEUR_GUIDANCE, MESHTASTIC_FAQ],
      },
      {
        country: "US",
        says: "Part 15 lets certified devices run without an individual licence, as long as they cause no harmful interference and accept interference. In 902 to 928 MHz the limit for digitally modulated systems is 1 watt peak conducted output. 902 to 928 MHz is also the 33 cm amateur band in the Americas: Meshtastic's licensed (ham) mode works under the amateur rules, which need a licence and forbid messages encoded to obscure their meaning.",
        quote:
          "This part sets out the regulations under which an intentional, unintentional, or incidental radiator may be operated without an individual license.",
        sources: [CFR_15_1, CFR_15_5, CFR_15_247, CFR_97_301, CFR_97_5, CFR_97_113, MESHTASTIC_FAQ],
      },
    ],
    unknown:
      "Outpost has not read Meshtastic's region presets against IR 2030 row by row, so it does not say which UK row a given Meshtastic setting falls under. Other countries: not read.",
  },

  // What needs a licence.
  {
    id: "transmit-amateur",
    group: "needs-licence",
    topic: "Transmitting on any amateur band",
    rules: [
      {
        country: "GB",
        says: "Using radio equipment needs an Ofcom licence unless regulations exempt it, and there is no exemption for amateur bands. Transmitting there needs an amateur licence (Foundation, Intermediate or Full), within its bands and power.",
        quote:
          "It is unlawful— (a) to establish or use a wireless telegraphy station, or (b) to instal or use wireless telegraphy apparatus, except under and in accordance with a licence",
        sources: [WTA_8, OFCOM_AMATEUR_LICENCE, OFCOM_AMATEUR_GUIDANCE],
      },
      {
        country: "US",
        says: "An amateur station may transmit only when it is under the physical control of a person named in an FCC amateur licence (or authorised for reciprocal operation).",
        quote:
          "The station apparatus must be under the physical control of a person named in an amateur station license grant on the ULS consolidated license database",
        sources: [CFR_97_5],
      },
    ],
    unknown: OTHER_COUNTRIES,
  },
  {
    id: "transmit-aprs",
    group: "needs-licence",
    topic: "Sending APRS on VHF (144.800 MHz in Europe, 144.390 MHz in North America)",
    rules: [
      {
        country: "GB",
        says: "APRS on 2 m is amateur transmission and needs an amateur licence. Ofcom names APRS as an example of a data station and of a transmit-only beacon, with power limits by licence class. 144.800 MHz is the APRS frequency in the IARU Region 1 band plan, not in the licence.",
        quote: "Examples of a data station include APRS, UIView/Packet stations, data/trunk links and RF mesh networks.",
        sources: [OFCOM_AMATEUR_GUIDANCE, OFCOM_AMATEUR_LICENCE, WTA_8, IARU_R1_VHF],
      },
      {
        country: "US",
        says: "APRS on 2 m (144 to 148 MHz in the Americas) is amateur transmission and needs an amateur licence. 144.390 MHz is the APRS centre of activity in the IARU Region 2 band plan, not in the FCC rules.",
        sources: [CFR_97_5, CFR_97_301, IARU_R2],
      },
    ],
    unknown:
      "Outpost has not found the APRS frequencies in a regulator's own document; they come from the band plans. Other countries: not read.",
  },
  {
    id: "transmit-lora-aprs",
    group: "needs-licence",
    topic: "LoRa APRS on 433 MHz (433.775 MHz)",
    rules: [
      {
        country: "GB",
        says: "433.775 MHz is inside the UK 70 cm amateur band (430 to 440 MHz; 432 to 435 MHz is secondary), so LoRa APRS at amateur power is amateur transmission and needs a licence. Separately, IR 2030 lets anyone use short range devices in 433.05 to 434.79 MHz without a licence, but only at 10 mW e.r.p. with a duty cycle of 10 per cent or less (or 1 mW, or 10 mW in 434.04 to 434.79 MHz with 25 kHz or less bandwidth). A LoRa APRS tracker or gateway at amateur power is not that.",
        sources: [OFCOM_AMATEUR_LICENCE, WTA_8, OFCOM_IR2030, OFCOM_PMR446],
      },
      {
        country: "US",
        says: "433.775 MHz is inside the 70 cm amateur band (420 to 450 MHz in the Americas), so LoRa APRS there is amateur transmission and needs an amateur licence.",
        sources: [CFR_97_301, CFR_97_5],
      },
    ],
    unknown:
      "433.775 MHz for LoRa APRS is a common choice among operators; the IARU Region 1 band plan lists 433.625 to 433.775 MHz as digital communications channels but does not name LoRa APRS, and Outpost has not found it in a regulator's document. Outpost has not read a Part 15 rule for 433 MHz. Other countries: not read.",
  },
];
