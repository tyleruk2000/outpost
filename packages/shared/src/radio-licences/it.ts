/**
 * Italy: the amateur bands and power for the class A licence, and the licence-free CB and
 * PMR446 services, as the Ministero delle Imprese e del Made in Italy (MIMIT) sets them.
 *
 * The Codice delle comunicazioni elettroniche (D.Lgs. 259/2003, articles 134 to 145 as in
 * force on 28 April 2025) says a licence holder may use every band the national frequency
 * plan gives to the amateur and amateur-satellite services, within the technical rules of
 * Allegato 26. Allegato 26, as replaced by the decree of 1 March 2021, sets one power limit
 * for every band (500 W PEP), "subject to any power limits in the national frequency plan".
 * The bands, their status and the lower limits on 2200 m, 630 m and 60 m are from the Piano
 * nazionale di ripartizione delle frequenze (PNRF) approved by the decree of 31 August 2022.
 * In the plan, a service in capitals (RADIOAMATORE) is primary and one in lower case
 * (Radioamatore) is secondary. CB and PMR446 are from the plan's notes 49D and 101C, and
 * the CB conditions from article 145 of the Code.
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const MIMIT = "Ministero delle Imprese e del Made in Italy (MIMIT)";

const ALLEGATO_26: RadioRulesSource = {
  publisher: MIMIT,
  title:
    "Allegato n. 26 al Codice delle comunicazioni elettroniche, testo vigente: Decreto 1° marzo 2021, Modifiche all'allegato n. 26 al decreto legislativo 1° agosto 2003, n. 259, recante la normativa tecnica di disciplina dell'attività radioamatoriale (Gazzetta Ufficiale, Serie generale n. 70, 22 March 2021), articles 2, 3, 5, 9, 11 and 15",
  url: "https://www.mimit.gov.it/images/stories/documenti/allegati/Allegato_n_26_al_CdC_testo_vigente.pdf",
  checked: CHECKED,
};
const CODICE_134_145: RadioRulesSource = {
  publisher: MIMIT,
  title:
    "Decreto legislativo 1 agosto 2003, n. 259, Codice delle comunicazioni elettroniche (vigente al 28-4-2025), Capo VII Radioamatori, articles 134 to 145",
  url: "https://www.mimit.gov.it/images/stories/documenti/allegati/artt_da_134_a_145_del_CdC.pdf",
  checked: CHECKED,
};
const PNRF_INTRO: RadioRulesSource = {
  publisher: MIMIT,
  title:
    "Piano nazionale di ripartizione delle frequenze (decreto del Ministro 31 agosto 2022, GU n. 214 of 13 September 2022, S.O. n. 35): Introduzione, paragraph 4.2 (primary in capitals, secondary in lower case)",
  url: "https://www.mimit.gov.it/images/stories/digitale/01-Introduzione.docx.pdf",
  checked: CHECKED,
};
const PNRF_A: RadioRulesSource = {
  publisher: MIMIT,
  title: "Piano nazionale di ripartizione delle frequenze (decreto 31 agosto 2022): Tabella A, 0 to 27 500 kHz",
  url: "https://www.mimit.gov.it/images/stories/digitale/02-Tabella_A.pdf",
  checked: CHECKED,
};
const PNRF_B: RadioRulesSource = {
  publisher: MIMIT,
  title: "Piano nazionale di ripartizione delle frequenze (decreto 31 agosto 2022): Tabella B, 27.5 to 10 000 MHz",
  url: "https://www.mimit.gov.it/images/stories/digitale/03-Tabella_B.docx.pdf",
  checked: CHECKED,
};
const PNRF_C: RadioRulesSource = {
  publisher: MIMIT,
  title: "Piano nazionale di ripartizione delle frequenze (decreto 31 agosto 2022): Tabella C, 10 to 3000 GHz",
  url: "https://www.mimit.gov.it/images/stories/digitale/04-Tabella_C.pdf",
  checked: CHECKED,
};
const PNRF_NOTE: RadioRulesSource = {
  publisher: MIMIT,
  title:
    "Piano nazionale di ripartizione delle frequenze (decreto 31 agosto 2022): Note (notes 8, 15, 16, 32B, 49D, 57, 69, 101C, 117, 193, 279)",
  url: "https://www.mimit.gov.it/images/stories/digitale/05-Note.pdf",
  checked: CHECKED,
};
const DM_CLASSE_N: RadioRulesSource = {
  publisher: "Istituto Poligrafico e Zecca dello Stato (Gazzetta Ufficiale)",
  title:
    "Decreto 26 gennaio 2026, Criteri generali e modalità per il conseguimento della patente di classe N e delle modalità di assegnazione e gestione dei nominativi a scelta per l'attività radioamatoriale (26A00956), Gazzetta Ufficiale, Serie generale n. 51, 3 March 2026",
  url: "https://www.gazzettaufficiale.it/eli/gu/2026/03/03/51/sg/pdf",
  checked: CHECKED,
};
const ISPETTORATI_RADIOAMATORI: RadioRulesSource = {
  publisher: `${MIMIT}, Ispettorati territoriali`,
  title: "Servizi: radioamatori",
  url: "https://ispettorati.mise.gov.it/index.php/servizi/radioamatori",
  checked: CHECKED,
};
const ISPETTORATI_CB_PMR: RadioRulesSource = {
  publisher: `${MIMIT}, Ispettorati territoriali`,
  title: "Servizi: dispositivi di debole potenza (CB, PMR 446)",
  url: "https://ispettorati.mise.gov.it/index.php/servizi/dispositivi-debole-potenza",
  checked: CHECKED,
};

// ── The rules ───────────────────────────────────────────────────────────────

const PEP = "500 W PEP";
const SAT = "also amateur-satellite";

export const RULES_IT: CountryRadioRules = {
  country: "IT",
  regulator: "Ministero delle Imprese e del Made in Italy (MIMIT)",
  regulatorUrl: "https://www.mimit.gov.it/it/comunicazioni/radio/autorizzazioni-e-licenze/radioamatori",
  summary:
    "The ministry's regional offices (Ispettorati territoriali) run the exam for the operator's licence (patente) and issue the general authorisation and callsign. There is one working class today, class A (HAREC level), with every amateur band in the national frequency plan at up to 500 W PEP; a novice class N is set out in law but its exam and privileges have not yet been published.",
  classes: [
    {
      id: "it-classe-a",
      name: "Classe A",
      how: "Pass a written or oral exam at the regional Ispettorato territoriale on the syllabus in sub-annex D of Allegato 26, answering at least 60% of the questions correctly; the ministry says the exam has been a written test of 50 multiple-choice questions since 2023. You must be at least 14. Holders of some engineering, physics or maths degrees, technical diplomas or GMDSS and ship radio certificates are excused part A of the syllabus.",
      privileges: [
        { band: "2200 m", fromKhz: 135.7, toKhz: 137.8, power: "1 W e.i.r.p.", note: "secondary" },
        {
          band: "630 m",
          fromKhz: 472,
          toKhz: 479,
          power: "1 W e.i.r.p.",
          note: "secondary; must not interfere with 490 kHz or with aeronautical radionavigation, nor claim protection from it",
        },
        { band: "160 m", fromKhz: 1830, toKhz: 1850, power: PEP, note: "primary" },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: PEP, note: "secondary" },
        { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "15 W e.i.r.p.", note: "secondary" },
        { band: "40 m", fromKhz: 7000, toKhz: 7100, power: PEP, note: `primary; ${SAT}` },
        { band: "40 m", fromKhz: 7100, toKhz: 7200, power: PEP, note: "primary" },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: PEP, note: "secondary" },
        { band: "20 m", fromKhz: 14000, toKhz: 14250, power: PEP, note: `primary; ${SAT}` },
        { band: "20 m", fromKhz: 14250, toKhz: 14350, power: PEP, note: "primary" },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: PEP, note: `primary; ${SAT}` },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: PEP, note: `primary; ${SAT}` },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: PEP, note: `primary; ${SAT}` },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: PEP, note: `primary; ${SAT}` },
        {
          band: "6 m",
          fromKhz: 50000,
          toKhz: 52000,
          power: PEP,
          note: "secondary; must not interfere with wind-profiler radars, nor claim protection from them",
        },
        { band: "2 m", fromKhz: 144000, toKhz: 145800, power: PEP, note: "primary; for the amateur service only" },
        {
          band: "2 m",
          fromKhz: 145800,
          toKhz: 146000,
          power: PEP,
          note: "primary; for the amateur-satellite service only, for contacts through amateur satellites",
        },
        { band: "70 cm", fromKhz: 430000, toKhz: 434000, power: PEP, note: "secondary" },
        { band: "70 cm", fromKhz: 435000, toKhz: 436000, power: PEP, note: `primary; ${SAT}` },
        { band: "70 cm", fromKhz: 436000, toKhz: 438000, power: PEP, note: "secondary" },
        { band: "23 cm", fromKhz: 1240000, toKhz: 1245000, power: PEP, note: "secondary" },
        {
          band: "23 cm",
          fromKhz: 1267000,
          toKhz: 1270000,
          power: PEP,
          note: "secondary; amateur-satellite only, Earth to space",
        },
        { band: "23 cm", fromKhz: 1270000, toKhz: 1298000, power: PEP, note: "secondary" },
        { band: "13 cm", fromKhz: 2300000, toKhz: 2440000, power: PEP, note: "secondary" },
        { band: "13 cm", fromKhz: 2440000, toKhz: 2450000, power: PEP, note: `secondary; ${SAT} (secondary)` },
        { band: "6 cm", fromKhz: 5650000, toKhz: 5670000, power: PEP, note: "secondary; amateur-satellite only" },
        {
          band: "6 cm",
          fromKhz: 5760000,
          toKhz: 5770000,
          power: PEP,
          note: "primary; no protection from transmitting fixed-satellite earth stations in other countries",
        },
        {
          band: "6 cm",
          fromKhz: 5830000,
          toKhz: 5850000,
          power: PEP,
          note: "secondary; also amateur-satellite, space to Earth (secondary)",
        },
        { band: "3 cm", fromKhz: 10300000, toKhz: 10450000, power: PEP, note: "secondary" },
        { band: "3 cm", fromKhz: 10450000, toKhz: 10500000, power: PEP, note: `secondary; ${SAT} (secondary)` },
        { band: "1.2 cm", fromKhz: 24000000, toKhz: 24050000, power: PEP, note: `primary; ${SAT}` },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: PEP, note: `primary; ${SAT}` },
        { band: "4 mm", fromKhz: 76000000, toKhz: 77500000, power: PEP, note: `secondary; ${SAT} (secondary)` },
        { band: "4 mm", fromKhz: 77500000, toKhz: 78000000, power: PEP, note: `primary; ${SAT}` },
        { band: "4 mm", fromKhz: 78000000, toKhz: 81000000, power: PEP, note: `secondary; ${SAT} (secondary)` },
        { band: "4 mm", fromKhz: 81000000, toKhz: 81500000, power: PEP, note: `secondary; ${SAT} (secondary)` },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: PEP, note: "secondary" },
        { band: "2 mm", fromKhz: 134000000, toKhz: 136000000, power: PEP, note: `primary; ${SAT}` },
        { band: "2 mm", fromKhz: 136000000, toKhz: 141000000, power: PEP, note: `secondary; ${SAT} (secondary)` },
        { band: "1 mm", fromKhz: 241000000, toKhz: 248000000, power: PEP, note: `secondary; ${SAT} (secondary)` },
        { band: "1 mm", fromKhz: 248000000, toKhz: 250000000, power: PEP, note: `primary; ${SAT}` },
      ],
      notes: [
        "Allegato 26 allows 500 W at most, fixed or mobile and portable, measured as peak envelope power: the average power fed to the antenna line during one radio-frequency cycle at the crest of the modulation envelope. The national frequency plan's lower limits apply where it sets one (2200 m, 630 m and 60 m, given as e.i.r.p.).",
        "Italy does not give amateurs 1810 to 1830 kHz, 434 to 435 MHz, 438 to 440 MHz, 1245 to 1267 MHz, 1298 to 1300 MHz, 3.4 GHz or 24.05 to 24.25 GHz.",
        "The general authorisation lasts up to ten years and is obtained by sending a declaration to the regional Ispettorato. Another licensed operator may use your station only under your direct responsibility and with your callsign.",
        "Give your callsign at the start and end of each transmission and every ten minutes; in packet data, in every packet. Speak in plain language; data and telegraphy only in internationally recognised codes.",
        "Unattended repeaters need their own general authorisation: at most 10 W e.r.p., callsign every 10 minutes, the carrier must drop within 10 seconds of the last signal, and they must be open to all amateurs.",
        "Visitors from CEPT countries with a CEPT licence may operate a portable or mobile (not airborne) station during a temporary stay without formalities; HAREC holders staying longer than three months may ask for the Italian licence.",
      ],
      sources: [ALLEGATO_26, CODICE_134_145, PNRF_INTRO, PNRF_A, PNRF_B, PNRF_C, PNRF_NOTE, ISPETTORATI_RADIOAMATORI, DM_CLASSE_N],
    },
  ],
  licenceFree: [
    {
      name: "CB (27 MHz)",
      frequencies: "26.965 to 27.405 MHz, the 40 European channels, 10 kHz wide",
      power: "4 W output or e.r.p. on FM; on AM and SSB 1 W e.r.p. and 5 W output",
      licence:
        "No licence: free use (libero uso) under article 105 of the Code. The ministry says no paperwork or fee has been needed since decreto-legge 76/2020.",
      note: "Open to citizens of the EU, the EEA or countries with a reciprocal agreement who are at least 14, and to anyone resident in Italy, unless barred by certain criminal convictions. In a disaster, CB users may join relief work when the authorities ask.",
      frequencyEntryId: "lf-cb-cept",
      sources: [PNRF_NOTE, CODICE_134_145, ISPETTORATI_CB_PMR],
    },
    {
      name: "PMR446",
      frequencies: "446.0 to 446.2 MHz; 12.5 kHz channels for analogue, 6.25 or 12.5 kHz for digital",
      power: "500 mW e.r.p.",
      licence: "No licence: free use (libero uso) under article 105 of the Code, like CB.",
      note: "Handheld radios with a built-in antenna only, for short-range speech. Base stations, repeaters and any fixed installation are not allowed. PMR446 must not interfere with fixed links and gets no protection from them.",
      frequencyEntryId: "lf-pmr446-analogue",
      sources: [PNRF_NOTE, ISPETTORATI_CB_PMR],
    },
  ],
  notRead: [
    "Classe N (novice, CEPT ECC/REC (05)06) is in article 135 of the Code, and the decree of 26 January 2026 sets its general criteria, but its syllabus, bands and power are left to directorial decrees amending Allegato 26. The ministry's page says these are still being drafted, and until then the existing rules apply. So classe N is not listed.",
    "MIMIT consulted from 29 May to 30 June 2025 on amending Allegato 26. No decree from that consultation was found on the day checked; the 500 W PEP limit is from the 2021 text that the ministry publishes as the one in force.",
    "The article texts were read from the ministry's own copy of the Code as in force on 28 April 2025, not from Normattiva; later changes to articles 134 to 145 were not checked.",
    "The CB note in the frequency plan still mentions a declaration and a fee (article 145 and Allegato 25). The parts of article 145 that required them were repealed by decreto-legge 76/2020, and the ministry says no paperwork is needed. Allegato 25 itself was not read.",
    "The fees for the amateur general authorisation (Allegato 25, article 35) and the 2026 exam decree were not read. Short range devices (433 and 868 MHz) are not listed here.",
  ],
};
