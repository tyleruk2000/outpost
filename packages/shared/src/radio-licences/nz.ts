/**
 * New Zealand: the amateur general user radio licence (GURL) and the licence-free
 * services, from Radio Spectrum Management's notices in the New Zealand Gazette.
 *
 * New Zealand has one amateur qualification, the General Amateur Operator's Certificate
 * of Competency. The bands are clause 3 of the amateur GURL; where the notice lists
 * overlapping rows with different special conditions, they are joined here into one
 * band with the conditions in its note. Power is in dBW: peak envelope power unless the
 * notice says e.i.r.p.
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

const NZ_AMATEUR_GURL_2025: RadioRulesSource = {
  publisher: "New Zealand Gazette (Radio Spectrum Management)",
  title:
    "Radiocommunications Regulations (General User Radio Licence for Amateur Radio Operators) Notice 2025, 2025-go3272, in force 1 July 2025",
  url: "https://www.rsm.govt.nz/assets/Uploads/documents/gazette/radiocommunications-regulations-general-user-radio-licence-for-amateur-radio-operators-notice-2025.pdf",
  checked: CHECKED,
};
const RSM_AMATEUR: RadioRulesSource = {
  publisher: "Radio Spectrum Management, New Zealand",
  title: "Amateur Radio Operators GURL",
  url: "https://www.rsm.govt.nz/licensing/frequencies-for-anyone/amateur-radio-operators",
  checked: CHECKED,
};
const NZ_GURL: RadioRulesSource = {
  publisher: "New Zealand Gazette (Radio Spectrum Management)",
  title: "Radiocommunications Regulations (General User Radio Licence for Citizen Band Radio) Notice 2011, 2011-go3629",
  url: "https://gazette.govt.nz/notice/id/2011-go3629",
  checked: CHECKED,
};
const NZ_SRD_GURL_2022: RadioRulesSource = {
  publisher: "New Zealand Gazette (Radio Spectrum Management)",
  title:
    "Radiocommunications Regulations (General User Radio Licence for Short Range Devices) Notice 2022, 2022-go3100, in force 1 August 2022",
  url: "https://gazette.govt.nz/notice/id/2022-go3100",
  checked: CHECKED,
};

// Special conditions in the amateur GURL, in a few words.
const SHARED = "Shared: accept interference from other services and cause none";
const ISM = "ISM band: accept interference from ISM and short range devices";
const TEMPORARY = "Allocated on a temporary basis until further notice";
const SAT_BOTH = "May be used for satellite uplink and downlink";
const LOG_RULE = "Only after three months and 50 logged contacts";

const PEP = "30 dBW PEP";

export const RULES_NZ: CountryRadioRules = {
  country: "NZ",
  regulator: "Radio Spectrum Management (Ministry of Business, Innovation and Employment)",
  regulatorUrl: "https://www.rsm.govt.nz/licensing/frequencies-for-anyone/amateur-radio-operators",
  summary:
    "Amateurs in New Zealand transmit under a general user radio licence published in the Gazette, so there is no licence in your own name. There is one qualification, the General Amateur Operator's Certificate of Competency, and you need a callsign.",
  classes: [
    {
      id: "nz-general",
      name: "General Amateur Operator's Certificate of Competency",
      how: "Hold a General Amateur Operator's Certificate of Competency and a callsign. RSM says only New Zealand citizens or residents can be granted one.",
      privileges: [
        { band: "2200 m", fromKhz: 130, toKhz: 190, power: "7 dBW e.i.r.p.", note: `${SHARED}. ${TEMPORARY}` },
        { band: "630 m", fromKhz: 472, toKhz: 479, power: "14 dBW e.i.r.p.", note: SHARED },
        { band: "160 m", fromKhz: 1800, toKhz: 1950, power: PEP, note: SHARED },
        { band: "80 m", fromKhz: 3500, toKhz: 3900, power: PEP, note: SHARED },
        { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "11.8 dBW e.i.r.p.", note: `${SHARED}. ${LOG_RULE}` },
        { band: "40 m", fromKhz: 7000, toKhz: 7100, power: PEP, note: `${SAT_BOTH}. ${LOG_RULE}` },
        { band: "40 m", fromKhz: 7100, toKhz: 7300, power: PEP, note: `${SHARED}. ${LOG_RULE}` },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: PEP, note: `${SHARED}. ${LOG_RULE}` },
        {
          band: "20 m",
          fromKhz: 14000,
          toKhz: 14350,
          power: PEP,
          note: `14 to 14.25 MHz may be used for satellite uplink and downlink. ${LOG_RULE}`,
        },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: PEP, note: `${SAT_BOTH}. ${LOG_RULE}` },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: PEP, note: `${SAT_BOTH}. ${LOG_RULE}` },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: PEP, note: `${SAT_BOTH}. ${LOG_RULE}` },
        {
          band: "11 m",
          fromKhz: 26950,
          toKhz: 27300,
          power: "7 dBW e.i.r.p.",
          note: `Telemetry or telecommand only. ${SHARED}. ${ISM}`,
        },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: PEP, note: SAT_BOTH },
        { band: "6 m", fromKhz: 50000, toKhz: 51000, power: PEP },
        { band: "6 m", fromKhz: 51000, toKhz: 54000, power: PEP, note: SHARED },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: PEP, note: SAT_BOTH },
        { band: "2 m", fromKhz: 146000, toKhz: 148000, power: PEP, note: SHARED },
        {
          band: "70 cm",
          fromKhz: 430000,
          toKhz: 440000,
          power: PEP,
          note: `${SHARED}. 433.05 to 434.79 MHz is an ISM band. 435 to 438 MHz may be used for satellite uplink and downlink`,
        },
        {
          band: "33 cm",
          fromKhz: 915000,
          toKhz: 928000,
          power: "14 dBW e.i.r.p.",
          note: `${ISM}. Unwanted emissions in 800 to 915 MHz at most -79 dBW (-49 dBm e.i.r.p.) per 100 kHz`,
        },
        {
          band: "23 cm",
          fromKhz: 1240000,
          toKhz: 1300000,
          power: PEP,
          note: `${SHARED}. 1260 to 1270 MHz may be used for satellite uplink`,
        },
        {
          band: "13 cm",
          fromKhz: 2396000,
          toKhz: 2450000,
          power: PEP,
          note: `${ISM}. 2400 to 2450 MHz may be used for satellite uplink and downlink`,
        },
        {
          band: "6 cm",
          fromKhz: 5650000,
          toKhz: 5850000,
          power: PEP,
          note: `${ISM}. Satellite uplink 5650 to 5670 MHz, downlink 5830 to 5850 MHz`,
        },
        {
          band: "3 cm",
          fromKhz: 10000000,
          toKhz: 10500000,
          power: PEP,
          note: `${SHARED}. 10.45 to 10.5 GHz may be used for satellite uplink and downlink`,
        },
        {
          band: "12 mm",
          fromKhz: 24000000,
          toKhz: 24250000,
          power: PEP,
          note: `${ISM}. 24 to 24.05 GHz may be used for satellite uplink and downlink; 24.05 to 24.25 GHz is shared`,
        },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: PEP, note: SAT_BOTH },
        { band: "4 mm", fromKhz: 76000000, toKhz: 81000000, power: PEP, note: `${SHARED}. ${SAT_BOTH}` },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: PEP, note: `${SHARED}. ${ISM}` },
        {
          band: "2 mm",
          fromKhz: 134000000,
          toKhz: 141000000,
          power: PEP,
          note: `${SAT_BOTH}. 136 to 141 GHz is shared`,
        },
        {
          band: "1 mm",
          fromKhz: 241000000,
          toKhz: 250000000,
          power: PEP,
          note: `${SAT_BOTH}. 241 to 248 GHz is shared; 244 to 246 GHz is an ISM band`,
        },
        { band: "Above 275 GHz", fromKhz: 275000000, toKhz: 1000000000, power: PEP, note: `${SHARED}. ${TEMPORARY}` },
      ],
      notes: [
        "Bands between 5 and 25 MHz (60 m to 12 m) are open only after you have held the certificate for three months and logged 50 contacts. Keep the logbook for at least a year.",
        "Transmit your callsign at least once every 15 minutes during communications.",
        "Beacons, repeaters and fixed links may not be set up under this licence.",
        "Communications must not be encoded to hide their meaning, except control signals for remotely controlled stations.",
        "Visitors with a certificate or licence that meets CEPT T/R 61-01 or T/R 61-02 may operate for up to 90 days, with their own callsign and ZL.",
        "The 2025 notice removed Recommendation ITU-R M.1544 from the overseas qualifications it recognises.",
      ],
      sources: [NZ_AMATEUR_GURL_2025, RSM_AMATEUR],
    },
  ],
  licenceFree: [
    {
      name: "UHF CB (PRS)",
      frequencies: "476.425 to 477.4125 MHz, 80 channels (PRS01 to PRS80)",
      power: "9.2 dBW e.i.r.p.",
      licence: "No licence in your own name: the General User Radio Licence for Citizen Band Radio covers anyone.",
      note: "Channels 22 and 23 are for telemetry and telecommand only, at most 10 seconds of data in any 60 minutes. The licence does not cover repeaters.",
      frequencyEntryId: "lf-prs-nz",
      sources: [NZ_GURL],
    },
    {
      name: "CB (27 MHz)",
      frequencies: "26.330 to 26.770 MHz (CBL01 to CBL40) and 26.965 to 27.405 MHz (CBU01 to CBU40)",
      power: "10.8 dBW (12 W) e.i.r.p. PEP (SSB); 6.0 dBW (4 W) e.i.r.p. carrier (AM)",
      licence: "No licence in your own name: the General User Radio Licence for Citizen Band Radio covers anyone.",
      note: "AM and SSB only. The licence does not cover repeaters.",
      frequencyEntryId: "lf-cb-nz",
      sources: [NZ_GURL],
    },
    {
      name: "Short range devices, 915 to 928 MHz (LoRa, Meshtastic)",
      frequencies: "915 to 928 MHz",
      power: "0 dBW e.i.r.p. (1 W); 6 dBW e.i.r.p. in 920 to 928 MHz with frequency hopping or digital modulation",
      licence: "No licence in your own name: the General User Radio Licence for Short Range Devices covers anyone.",
      note: "Unwanted emissions at most -79 dBW e.i.r.p. in 800 to 915 MHz and -63 dBW e.i.r.p. in 928 MHz to 1 GHz, per 100 kHz.",
      sources: [NZ_SRD_GURL_2022],
    },
  ],
  notRead: [
    "RSM's rules for getting the certificate and a callsign (PIB 46, Radio Operator Certificate and Callsign Rules) were not read.",
    "The Gazette's web pages block automated reading; the amateur notice was read from RSM's copy of the Gazette PDF and the short range devices notice from the Gazette PDF.",
  ],
};
