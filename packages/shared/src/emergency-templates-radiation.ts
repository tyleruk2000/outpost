/**
 * The emergency plan template for a radiation emergency: sheltering from radioactive
 * material outside, including fallout, made for the nuclear preparedness module
 * (docs/nuclear-preparedness.md, "Personal planning").
 *
 * Its words are the UK Health Security Agency's public guidance on GOV.UK ("go in, stay
 * in, tune in"), read on 16 November 2026, under the Open Government Licence v3.0 (the
 * GOV.UK terms already cleared in `SOURCE_TERMS_DATA`; each page also says "This
 * publication is licensed under the terms of the Open Government Licence v3.0 except
 * where otherwise stated"), with Be Ready's household plan for the supplies. Every
 * `quote` was checked word for word against the page as downloaded that day. US
 * guidance (Ready.gov) is pointed to, never quoted: its terms are not cleared (see
 * `ready-gov` in `SOURCE_TERMS_DATA`). The ICRP's and the IAEA's terms were read too and
 * are recorded below; nothing of theirs is used.
 *
 * Where the guidance read does not say something a household needs (which room, which
 * building nearby, what to do differently for a nuclear explosion), the template asks
 * (`prompts`) instead of answering. Outpost gives no advice of its own.
 */
import type { PlanSource, PlanTemplate, SourceTerms } from "./emergency-templates.ts";

export const RADIATION_SOURCE_TERMS: SourceTerms[] = [
  {
    id: "icrp",
    publisher: "International Commission on Radiological Protection (ICRP)",
    url: "https://www.icrp.org/page.asp?id=11",
    quote:
      "The publications of ICRP are copyright protected. If you want to reproduce material from an ICRP report, or if you want to translate and distribute it, permission is required from ICRP.",
    read: "16 November 2026",
    cleared: false,
    adapt: false,
    licence: "Permission needed (and “even free to access publications require permission for reuse”, icrp.org/page.asp?id=5): not quoted",
    attribution: null,
  },
  {
    id: "iaea",
    publisher: "International Atomic Energy Agency (IAEA), iaea.org",
    url: "https://www.iaea.org/about/terms-of-use",
    quote:
      "IAEA content of this Site is protected by copyright. To ensure wide dissemination of its information, the IAEA is committed to making its content freely available and encourages the use, reproduction and dissemination of the text, multimedia and data presented. Content may be adapted, translated, copied, printed and downloaded for private study, research and teaching purposes, and for use in commercial and non-commercial products or services, provided that appropriate acknowledgement of the IAEA as the source is given and that the IAEA's endorsement of users' views, products or services is not stated or implied in any way.",
    read: "16 November 2026, from the Internet Archive's copy of 17 October 2026 (iaea.org refused the request, HTTP 403)",
    cleared: true,
    adapt: true,
    licence:
      "The IAEA's terms for its website's own content, with acknowledgement; “Specific restrictions and/or conditions may apply to specific Materials”, so a publication's own notice is read before using it. No IAEA words are used: its public pages found are for responders and governments, not households",
    attribution: "Source: International Atomic Energy Agency (IAEA).",
  },
];

export const RADIATION_SOURCES: PlanSource[] = [
  {
    id: "ukhsa-radiation-what-to-do",
    publisher: "UK Health Security Agency (GOV.UK)",
    title: "What to do in a radiation emergency",
    url: "https://www.gov.uk/government/publications/radiation-emergencies-information-for-the-public/what-to-do-in-a-radiation-emergency",
    pageDate: "Updated 10 September 2024",
    checked: "16 November 2026",
    country: "UK",
    terms: "govuk",
  },
  {
    id: "ukhsa-self-decontamination",
    publisher: "UK Health Security Agency (GOV.UK)",
    title: "How to remove radioactive material from your skin and clothes – self-decontamination guidance",
    url: "https://www.gov.uk/government/publications/radiation-emergencies-information-for-the-public/how-to-remove-radioactive-material-from-your-skin-and-clothes-self-decontamination-guidance",
    pageDate: "Updated 10 September 2024",
    checked: "16 November 2026",
    country: "UK",
    terms: "govuk",
  },
  {
    id: "readygov-radiation",
    publisher: "Ready.gov (FEMA)",
    title: "Radiation Emergencies (US)",
    url: "https://www.ready.gov/radiation",
    pageDate: "Last Updated: 01/07/2025",
    checked: "16 November 2026",
    country: "US",
    terms: "ready-gov",
  },
];

const WHAT = "ukhsa-radiation-what-to-do";
const DECON = "ukhsa-self-decontamination";
const PLAN_PDF = "gov-be-ready-household-plan-pdf";

export const RADIATION_TEMPLATE: PlanTemplate = {
  id: "radiation",
  kind: "shelter-at-home",
  kindText: "Radiation emergency",
  name: "Radiation emergency",
  about:
    "Sheltering from radioactive material outside, fallout among it: go in, stay in, tune in, from the UK Health Security Agency's guidance on GOV.UK.",
  steps: [
    {
      id: "radiation.before.1",
      phase: "before",
      text: "Know the advice you are likely to be given: go in, stay in and tune in.",
      source: WHAT,
      quote: "In most situations, if you are in the affected area, you will be advised to go in, stay in and tune in.",
    },
    {
      id: "radiation.before.2",
      phase: "before",
      text: "Write a household plan, print it, keep it easy to find.",
      source: PLAN_PDF,
      quote: "Print it out - or write it out - and keep it somewhere safe and easy to find in a power cut.",
    },
    {
      id: "radiation.before.3",
      phase: "before",
      text: "Keep a wind-up or battery FM radio at home for updates.",
      source: "gov-be-ready-phone-broadband",
      quote: "Keep a wind-up or battery FM radio with spare batteries at home. Updates may be given on the radio during an outage.",
    },
    {
      id: "radiation.before.4",
      phase: "before",
      text: "If you use a private water supply, register it with your local authority.",
      source: WHAT,
      quote: "Users of private water supplies (that is, not mains water) are required to register these with their local authority.",
    },
    {
      id: "radiation.before.5",
      phase: "before",
      source: "readygov-radiation",
      quote: "",
      pointer: true,
      text: "For comparison, the US government's Ready.gov has a page on radiation emergencies, a nuclear explosion among them: see its page “Radiation Emergencies”, https://www.ready.gov/radiation",
    },
    {
      id: "radiation.during.1",
      phase: "during",
      text: "Go indoors as soon as you can and stay there.",
      source: WHAT,
      quote:
        "The most important thing to do if you are told you are near a radiation emergency is go indoors as soon as you can and stay there.",
    },
    {
      id: "radiation.during.2",
      phase: "during",
      text: "Brick, stone or concrete buildings protect best; any building is better than outside.",
      source: WHAT,
      quote:
        "Buildings made of brick, stone, concrete or similar materials provide the best protection, but being inside any building is better than being outside.",
    },
    {
      id: "radiation.during.3",
      phase: "during",
      text: "Away from home, shelter in the nearest building; do not travel home.",
      source: WHAT,
      quote:
        "You should shelter in the nearest building if you are not already at home. Do not travel home to shelter there as this may take too long and put you at risk of being exposed to radiation.",
    },
    {
      id: "radiation.during.4",
      phase: "during",
      text: "A vehicle or tent is not enough shelter: get into a building, safely.",
      source: WHAT,
      quote: "Vehicles and tents do not provide sufficient shelter from significant radiation.",
    },
    {
      id: "radiation.during.5",
      phase: "during",
      text: "Close external doors and windows.",
      source: WHAT,
      quote: "Close external doors and windows.",
    },
    {
      id: "radiation.during.6",
      phase: "during",
      text: "Stay in the middle of the building, away from external doors, windows and walls.",
      source: WHAT,
      quote: "As far as possible, stay in the middle of the building away from external doors, windows and walls",
    },
    {
      id: "radiation.during.7",
      phase: "during",
      text: "Turn off fans and air conditioning; close air vents, trickle vents too.",
      source: WHAT,
      quote:
        "You should also turn off any equipment which brings air from the outside into the building (such as fans or air conditioning) and close any air vents, including trickle vents in windows, if you can.",
    },
    {
      id: "radiation.during.8",
      phase: "during",
      text: "Told to stay indoors: do not go out to collect family from school or elsewhere.",
      source: WHAT,
      quote:
        "If your family or friends are not with you, for example if they are at school, nursery, hospital or with other people, do not go to collect them if you have been informed to stay indoors.",
    },
    {
      id: "radiation.during.9",
      phase: "during",
      text: "Bring pets in if they are with you; do not go out to find them.",
      source: WHAT,
      quote:
        "If your pet is outside with you when you are advised to go in, bring them indoors with you. If you are indoors and you don’t know where your pet is, do not go out to find them.",
    },
    {
      id: "radiation.during.10",
      phase: "during",
      text: "If advised to decontaminate: take off outer clothes and shoes first.",
      source: DECON,
      quote: "Take off your outer layer of clothes and shoes. Cut off clothing where necessary to avoid removing anything over your head.",
    },
    {
      id: "radiation.during.11",
      phase: "during",
      text: "Bag the clothes, seal the bag and put it away from people.",
      source: DECON,
      quote: "Put your clothing and face covering in a plastic bag or other sealable container, seal it and place it away from people.",
    },
    {
      id: "radiation.during.12",
      phase: "during",
      text: "Wash with soap and shampoo; do not use conditioner.",
      source: WHAT,
      quote:
        "Do not use conditioner when washing your hair, as this can bind contamination to hair. Simple soaps or mild shampoos are effective for removing contamination.",
    },
    {
      id: "radiation.during.13",
      phase: "during",
      text: "Put on clean clothes that were stored indoors.",
      source: DECON,
      quote: "Put on clean clothes that have been stored indoors.",
    },
    {
      id: "radiation.during.14",
      phase: "during",
      text: "Food and drink already indoors, and tap water, are safe unless you are told otherwise.",
      source: WHAT,
      quote: "Food and drink that are already indoors, including tap water and food and drink in shops, will be safe to consume.",
    },
    {
      id: "radiation.during.15",
      onlyIn: ["GB"],
      phase: "during",
      text: "Need regular medication? Contact NHS 111 rather than leaving the building.",
      source: WHAT,
      quote:
        "If you need to take medication regularly for existing health conditions, you will be advised to seek advice from the NHS by contacting NHS 111 (online or by phone) rather than leaving the building.",
    },
    {
      id: "radiation.during.16",
      phase: "during",
      text: "Take stable iodine only if officially told to, and only the tablets provided.",
      source: WHAT,
      quote:
        "It is important that you only take the stable iodine tablets provided for this purpose and that you take them at the right time.",
    },
    {
      id: "radiation.during.17",
      phase: "during",
      text: "Do not evacuate unless advised to.",
      source: WHAT,
      quote: "You should not evacuate unless advised to do so, as leaving shelter may increase your exposure to radiation.",
    },
    {
      id: "radiation.during.18",
      onlyIn: ["GB"],
      phase: "during",
      text: "Tune in: follow the news and official advice on GOV.UK.",
      source: WHAT,
      quote: "Monitor the news and follow official UK advice on GOV.UK for what to do next.",
    },
    {
      id: "radiation.during.19",
      phase: "during",
      text: "If an alert arrives, stop and follow its instructions.",
      source: "gov-be-ready-alerts",
      quote: "stop what you are doing and follow the instructions of the alert",
    },
    {
      id: "radiation.during.20",
      phase: "during",
      text: "Be ready to stay indoors for one to two days, perhaps longer.",
      source: WHAT,
      quote:
        "In most cases you will be advised to stay inside for one to two days after a release. This could be longer if there is a prolonged release of radioactive material.",
    },
    {
      id: "radiation.during.21",
      phase: "during",
      text: "Wait to be told when it is safe to go outside.",
      source: WHAT,
      quote: "You will be given additional instructions, including when it is safe to go outside.",
    },
    {
      id: "radiation.after.1",
      phase: "after",
      text: "Do not go back into an affected area until told it is safe.",
      source: WHAT,
      quote: "You should not return to the affected area until you are advised that it is safe to do so.",
    },
    {
      id: "radiation.after.2",
      phase: "after",
      text: "Wait for advice on food stored outside or grown at home.",
      source: WHAT,
      quote: "You will be provided with further advice on any food that has been stored outside, including food you have grown yourself.",
    },
    {
      id: "radiation.after.3",
      onlyIn: ["GB"],
      phase: "after",
      text: "Keep following the news and GOV.UK: the advice will change.",
      source: WHAT,
      quote:
        "it is important that you continue to monitor the news, GOV.UK and local official advice if overseas, for advice on what to do next.",
    },
  ],
  supplies: [
    {
      id: "radiation.supply.1",
      name: "Bottled water",
      quantity: 3,
      unit: "litre",
      perPerson: true,
      perDay: true,
      category: "water",
      source: PLAN_PDF,
      quote: "Bottled water (3 litres per person per day for at least 3 days)",
    },
    {
      id: "radiation.supply.2",
      name: "Non-perishable food needing no cooking, and a tin opener",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: "food",
      source: PLAN_PDF,
      quote:
        "Non-perishable food to last at least 3 days that does not require cooking or refrigerating (e.g. tinned meat, fruit or vegetables) and tin opener",
    },
    {
      id: "radiation.supply.3",
      name: "FM radio (battery/wind up)",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: "equipment",
      source: PLAN_PDF,
      quote: "FM radio (battery/wind up) to get updates during a power cut",
    },
    {
      id: "radiation.supply.4",
      name: "Torch (battery/wind up) and spare batteries",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: "equipment",
      source: PLAN_PDF,
      quote: "Torch (battery/wind up) and spare batteries - torches are safer then candles",
    },
    {
      id: "radiation.supply.5",
      name: "Essential medication or medical supplies",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: "medical",
      source: PLAN_PDF,
      quote: "Essential medication or medical supplies to last several days",
    },
    {
      id: "radiation.supply.6",
      name: "First aid kit",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: "medical",
      source: PLAN_PDF,
      quote: "First aid kit / first aid items",
    },
    {
      id: "radiation.supply.7",
      name: "Plastic bags or sealable containers, for clothing taken off",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: null,
      source: DECON,
      quote: "Put your clothing and face covering in a plastic bag or other sealable container, seal it and place it away from people.",
    },
    {
      id: "radiation.supply.8",
      name: "Waterproof gloves and face masks",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: "hygiene",
      source: DECON,
      quote: "Wear waterproof gloves and a face mask if possible.",
    },
    {
      id: "radiation.supply.9",
      name: "Soap and shampoo",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: "hygiene",
      source: DECON,
      quote: "Wash your body, face and hair using soap and shampoo. Use warm water.",
    },
    {
      id: "radiation.supply.10",
      name: "Pet products",
      quantity: null,
      unit: "",
      perPerson: false,
      perDay: false,
      category: null,
      source: PLAN_PDF,
      quote: "Pet products (food and bottled water)",
    },
  ],
  where: [
    {
      id: "radiation.where.1",
      what: "Switches for fans and air conditioning, and the air vents to close",
      source: WHAT,
      quote:
        "turn off any equipment which brings air from the outside into the building (such as fans or air conditioning) and close any air vents, including trickle vents in windows",
    },
    {
      id: "radiation.where.2",
      what: "Clean clothes stored indoors",
      source: DECON,
      quote: "Put on clean clothes that have been stored indoors.",
    },
  ],
  days: {
    value: 3,
    source: PLAN_PDF,
    quote: "Bottled water (3 litres per person per day for at least 3 days)",
  },
  prompts: [
    "Which room is nearest the middle of your home, away from outside doors, windows and walls? The guidance says to stay in the middle of the building; which room that is, is yours to decide.",
    "If someone is caught away from home, which building near their school, work or usual route would they go into? The guidance says the nearest building; no page names one.",
    "Do you know what your children's school or nursery will do? The guidance says not to collect them if you are told to stay indoors, and that they will be asked to stay where they are.",
    "Which radio station will you tune in to, and who keeps the radio? See also this plan's part on what to do if the phones fail.",
    "Do you live or work near a nuclear site? Its council publishes information for its emergency planning zone; ask your council. No council page found was published under terms that let its words be copied here.",
    "The UK guidance read is for radiation emergencies such as an incident at a nuclear site, and says nothing of a nuclear explosion's blast, heat or flash. Decide what, if anything, your household would do differently.",
  ],
};
