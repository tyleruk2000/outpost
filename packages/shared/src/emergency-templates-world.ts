/**
 * Emergency plan templates from governments outside the UK: the Queensland Government
 * (Australia) and the Government of the Netherlands. Read on 22 November 2026; every
 * `quote` was checked word for word against the page as downloaded that day, and each
 * publisher's terms (below) were read the same day.
 *
 * - Queensland: qld.gov.au's disaster preparation pages, under CC BY 4.0 (the terms
 *   already recorded as `queensland` in `SOURCE_TERMS_DATA`, read again this day, same
 *   words).
 * - The Netherlands: Denk vooruit (english.denkvooruit.nl, the government's own English
 *   pages) and Rijksoverheid.nl, both CC0 1.0, which does not cover photographs, videos
 *   or infographics. The emergency kit list on Denk vooruit is an infographic "written out
 *   as text", so it is not used; the plain text around it is. A Dutch sentence of
 *   Rijksoverheid.nl is put into English here, and the quote keeps the Dutch.
 *
 * Other governments' terms read and not cleared, or pages that refused the request, are
 * listed in docs/emergency-plans.md. Nothing here is Outpost's own advice: a template
 * leaves what no source covers as a question (`prompts`).
 */
import type { PlanSource, PlanTemplate, SourceTerms } from "./emergency-templates.ts";

const READ = "22 November 2026";

export const WORLD_SOURCE_TERMS: SourceTerms[] = [
  {
    id: "bbk",
    publisher: "Bundesamt für Bevölkerungsschutz und Katastrophenhilfe (BBK), Germany",
    url: "https://www.bbk.bund.de/DE/Service/Impressum/impressum_node.html",
    quote:
      "Das Copyright für Texte und Bilder liegt, soweit nicht anders vermerkt, beim Bundesamt für Bevölkerungsschutz und Katastrophenhilfe. Auf den BBK-Webseiten zur Verfügung gestellte Texte, Textteile, Grafiken, Tabellen oder Bildmaterialien dürfen ohne vorherige Zustimmung des BBK nicht vervielfältigt, nicht verbreitet und nicht ausgestellt werden.",
    read: READ,
    cleared: false,
    adapt: false,
    licence: "Permission needed before any text is copied: no German template, nothing quoted",
    attribution: null,
  },
  {
    id: "denk-vooruit",
    publisher: "Denk vooruit (Ministry of Justice and Security, the Netherlands), english.denkvooruit.nl",
    url: "https://english.denkvooruit.nl/service/copyright",
    quote:
      "Unless stated otherwise, CC0 (Creative Commons Zero) applies to the content on our website. This means that the content on this website may be reprinted freely, unless otherwise indicated (for example, in the form of a copyright notice on a document). CC0 does not apply to images … CC0 does not apply to photographs, videos, infographics or other images.",
    read: READ,
    cleared: true,
    adapt: true,
    licence:
      "CC0 1.0 for the text; not photographs, videos or infographics, so the emergency kit infographic and its written-out text are not used. The Dutch terms add that a reuse must not suggest the government endorses it",
    attribution:
      "Words from Denk vooruit and Rijksoverheid.nl (Government of the Netherlands), CC0 1.0. The Dutch government has not reviewed or endorsed this plan.",
  },
  {
    id: "rijksoverheid",
    publisher: "Rijksoverheid.nl (Government of the Netherlands)",
    url: "https://www.rijksoverheid.nl/service/copyright",
    quote:
      "Voor deze website geldt de Creative Commons zero-verklaring (CC0 1.0). Veel teksten mag u gebruiken zonder onze toestemming. … Gebruikt u (een deel van) deze tekst? Dan moet duidelijk zijn dat de Rijksoverheid het niet automatisch eens is met de hele inhoud van uw tekst.",
    read: READ,
    cleared: true,
    adapt: true,
    licence:
      "CC0 1.0 (the page's own metadata says “CC0 1.0 Universal” too), on the condition that it is clear the government does not necessarily agree with the whole of the text it is used in; images and video almost never",
    attribution:
      "Words from Denk vooruit and Rijksoverheid.nl (Government of the Netherlands), CC0 1.0. The Dutch government has not reviewed or endorsed this plan.",
  },
];

export const WORLD_SOURCES: PlanSource[] = [
  {
    id: "qld-emergency-plan",
    publisher: "Queensland Government",
    title: "Prepare your emergency plan",
    url: "https://www.qld.gov.au/emergency/dealing-disasters/prepare-for-disasters/prep-emergency-plan",
    pageDate: "Last updated: 11 December 2025",
    checked: READ,
    country: "AU",
    terms: "queensland",
  },
  {
    id: "qld-evacuation",
    publisher: "Queensland Government",
    title: "Prepare for evacuation",
    url: "https://www.qld.gov.au/emergency/dealing-disasters/prepare-for-disasters/evacuation-kit",
    pageDate: "Last updated: 15 October 2019",
    checked: READ,
    country: "AU",
    terms: "queensland",
  },
  {
    id: "qld-emergency-kit",
    publisher: "Queensland Government",
    title: "Emergency kit: essential items, all times",
    url: "https://www.qld.gov.au/emergency/dealing-disasters/prepare-for-disasters/emergency-kit",
    pageDate: "Last updated: 15 October 2019",
    checked: READ,
    country: "AU",
    terms: "queensland",
  },
  {
    id: "qld-prepare-home",
    publisher: "Queensland Government",
    title: "Prepare your home",
    url: "https://www.qld.gov.au/emergency/dealing-disasters/prepare-for-disasters/prepare-home",
    pageDate: "Last updated: 15 October 2019",
    checked: READ,
    country: "AU",
    terms: "queensland",
  },
  {
    id: "dv-emergency-kit",
    publisher: "Denk vooruit (Government of the Netherlands)",
    title: "Putting together an emergency kit",
    url: "https://english.denkvooruit.nl/prepare-yourself/putting-together-an-emergency-kit",
    pageDate: "No date shown (the page's metadata: modified 28 November 2025)",
    checked: READ,
    country: "NL",
    terms: "denk-vooruit",
  },
  {
    id: "dv-emergency-plan",
    publisher: "Denk vooruit (Government of the Netherlands)",
    title: "Make an emergency plan",
    url: "https://english.denkvooruit.nl/prepare-yourself/make-an-emergency-plan",
    pageDate: "No date shown (the page's metadata: modified 6 February 2026)",
    checked: READ,
    country: "NL",
    terms: "denk-vooruit",
  },
  {
    id: "dv-radio",
    publisher: "Denk vooruit (Government of the Netherlands)",
    title: "Radio",
    url: "https://english.denkvooruit.nl/prepare-yourself/this-is-how-youll-be-alerted/radio",
    pageDate: "No date shown (the page's metadata: modified 3 December 2025)",
    checked: READ,
    country: "NL",
    terms: "denk-vooruit",
  },
  {
    id: "rijksoverheid-noodpakket",
    publisher: "Rijksoverheid.nl (Government of the Netherlands)",
    title: "Wat zit er in een noodpakket? (What is in an emergency kit?), in Dutch",
    url: "https://www.rijksoverheid.nl/documenten/vraag-en-antwoord/veiligheidsregios-en-crisisbeheersing/wat-zit-er-in-een-noodpakket",
    pageDate: "No date shown (the page's metadata: modified 23 September 2026)",
    checked: READ,
    country: "NL",
    terms: "rijksoverheid",
  },
];

const supply = (
  id: string,
  name: string,
  category: PlanTemplate["supplies"][number]["category"],
  source: string,
  quote: string,
): PlanTemplate["supplies"][number] => ({ id, name, quantity: null, unit: "", perPerson: false, perDay: false, category, source, quote });

/** The Queensland emergency kit's items, shared by its two templates (each with ids of its own). */
const qldKit = (prefix: string): PlanTemplate["supplies"] => [
  supply(`${prefix}.supply.1`, "Non-perishable food", "food", "qld-emergency-kit", "Range of non—perishable food items"),
  supply(`${prefix}.supply.2`, "Bottled water", "water", "qld-emergency-kit", "Bottled water"),
  supply(`${prefix}.supply.3`, "First aid kit and manual", "medical", "qld-emergency-kit", "First Aid Kit and manual"),
  supply(
    `${prefix}.supply.4`,
    "Essential medicines, prescriptions and doses",
    "medical",
    "qld-emergency-kit",
    "Essential medications, prescriptions and dosage",
  ),
  supply(`${prefix}.supply.5`, "Torch with extra batteries", "equipment", "qld-emergency-kit", "Flashlight/torch with extra batteries"),
  supply(`${prefix}.supply.6`, "Battery powered lantern", "equipment", "qld-emergency-kit", "Battery powered lantern"),
  supply(
    `${prefix}.supply.7`,
    "Battery powered radio with extra batteries",
    "equipment",
    "qld-emergency-kit",
    "Battery powered radio with extra batteries",
  ),
  supply(`${prefix}.supply.8`, "Personal hygiene items", "hygiene", "qld-emergency-kit", "Personal hygiene items"),
  supply(
    `${prefix}.supply.9`,
    "Warm jumper, waterproof jacket, hat and gloves for everyone",
    "other",
    "qld-emergency-kit",
    "Warm jumper, waterproof jacket, hat and gloves for everyone",
  ),
  supply(
    `${prefix}.supply.10`,
    "Closed-toed shoes or boots for everyone",
    "other",
    "qld-emergency-kit",
    "Closed—toed shoes or boots for everyone",
  ),
  supply(
    `${prefix}.supply.11`,
    "Whistle, utility knife, duct or masking tape",
    "equipment",
    "qld-emergency-kit",
    "Whistle, utility knife, duct/masking tape",
  ),
  supply(`${prefix}.supply.12`, "Spare house and car keys", "other", "qld-emergency-kit", "Spare house and car keys"),
  supply(
    `${prefix}.supply.13`,
    "Pet food, water and other animal needs",
    "pet-food",
    "qld-emergency-kit",
    "Pet food, water and other animal needs",
  ),
  supply(
    `${prefix}.supply.14`,
    "Copies of important documents in sealed plastic bags",
    "other",
    "qld-emergency-kit",
    "Keep original or certified copies of these documents in your Emergency Kit",
  ),
];

const qldWhere = (prefix: string): PlanTemplate["where"] => [
  {
    id: `${prefix}.where.1`,
    what: "The emergency kit",
    source: "qld-emergency-kit",
    quote: "Know: All householders need to know where your Emergency Kit is kept.",
  },
  {
    id: `${prefix}.where.2`,
    what: "The emergency plan, and its copies",
    source: "qld-emergency-plan",
    quote:
      "Display your Emergency Plan on the fridge or household notice board, provide copies to household members, relevant friends, family and neighbours and keep a copy in your Emergency Kit.",
  },
];

export const WORLD_TEMPLATES: PlanTemplate[] = [
  {
    id: "qld-evacuate",
    kind: "evacuate",
    kindText: "",
    name: "Leaving home (Queensland)",
    about: "Getting ready to leave, and the checklist before you go, from the Queensland Government's disaster pages.",
    country: "AU",
    government: "the Queensland Government, Australia",
    steps: [
      {
        id: "qld-evacuate.before.1",
        phase: "before",
        text: "Ask your local council about warnings, how evacuation works and the evacuation routes.",
        source: "qld-evacuation",
        quote: "Check with your local council about local warning systems, evacuation process and nominated evacuation routes.",
      },
      {
        id: "qld-evacuate.before.2",
        phase: "before",
        text: "Find out if you live in a flood-prone area or an evacuation zone.",
        source: "qld-evacuation",
        quote: "Find out if you live in a flood—prone area or evacuation zone.",
      },
      {
        id: "qld-evacuate.before.3",
        phase: "before",
        text: "Ask about the emergency and evacuation plans at work, school and childcare.",
        source: "qld-evacuation",
        quote: "Ask about emergency and evacuation plans at your workplace, school, and childcare providers.",
      },
      {
        id: "qld-evacuate.before.4",
        phase: "before",
        text: "If your household will need help to leave, find out what help there is.",
        source: "qld-evacuation",
        quote: "If your household will need support to evacuate, find out what assistance is available.",
      },
      {
        id: "qld-evacuate.before.5",
        phase: "before",
        text: "Choose two meeting places everyone can reach: one nearby, one outside your neighbourhood.",
        source: "qld-emergency-plan",
        quote:
          "Nominate two meeting places in case of an emergency, one nearby, another outside your neighbourhood, everyone can easily get to.",
      },
      {
        id: "qld-evacuate.before.6",
        phase: "before",
        text: "Choose two emergency contacts who do not live with you: one local, one interstate.",
        source: "qld-emergency-plan",
        quote:
          "Nominate two family members or friends who do not live with you (one local, one interstate) to be household emergency contacts in case you and your family become separated.",
      },
      {
        id: "qld-evacuate.before.7",
        phase: "before",
        text: "Write the SES number, 132 500, on the plan with Triple Zero (000).",
        source: "qld-emergency-plan",
        quote: "132 500 (SES)",
      },
      {
        id: "qld-evacuate.before.8",
        phase: "before",
        text: "Teach children how and when to call Triple Zero (000); 112 from mobile phones.",
        source: "qld-emergency-plan",
        quote: "Teach children how and when to call Triple Zero (000) in an emergency (use 112 from mobile phones).",
      },
      {
        id: "qld-evacuate.before.9",
        phase: "before",
        text: "Make sure everyone knows where and when to turn off the power, water and gas.",
        source: "qld-emergency-plan",
        quote: "Ensure everyone know where and when to turn off the main power, water and gas supply in case of evacuation.",
      },
      {
        id: "qld-evacuate.before.10",
        phase: "before",
        text: "Practise the plan with the household three times a year.",
        source: "qld-emergency-plan",
        quote: "Review and practise your Emergency Plan regularly (three times per year).",
      },
      {
        id: "qld-evacuate.during.1",
        phase: "during",
        text: "Check that official advice has been given to evacuate.",
        source: "qld-evacuation",
        quote: "Has official advice been given to evacuate?",
      },
      {
        id: "qld-evacuate.during.2",
        phase: "during",
        text: "Know where you are going: further inland, on higher ground and secure.",
        source: "qld-evacuation",
        quote: "Is you evacuation point further inland, on higher ground and secure?",
      },
      {
        id: "qld-evacuate.during.3",
        phase: "during",
        text: "Know the route you will take.",
        source: "qld-evacuation",
        quote: "Do you know the preferred route for evacuation?",
      },
      {
        id: "qld-evacuate.during.4",
        phase: "during",
        text: "Fill the car with fuel.",
        source: "qld-evacuation",
        quote: "Is your vehicle full of fuel?",
      },
      {
        id: "qld-evacuate.during.5",
        phase: "during",
        text: "Pack the emergency plan, the emergency kit and the evacuation kit.",
        source: "qld-evacuation",
        quote: "Have you packed your Emergency Plan?",
      },
      {
        id: "qld-evacuate.during.6",
        phase: "during",
        text: "Take the household's essential medicines.",
        source: "qld-evacuation",
        quote: "Do you have essential medications for your family?",
      },
      {
        id: "qld-evacuate.during.7",
        phase: "during",
        text: "Pack important documents and valuables.",
        source: "qld-evacuation",
        quote: "Have you packed important documents and valuables?",
      },
      {
        id: "qld-evacuate.during.12",
        phase: "during",
        text: "Pack emergency water.",
        source: "qld-evacuation",
        quote: "Have you packed emergency water supplies?",
      },
      {
        id: "qld-evacuate.during.8",
        phase: "during",
        text: "Turn off the power, gas and water at the mains.",
        source: "qld-evacuation",
        quote: "Have you turned off all the power, gas and water mains to your home?",
      },
      {
        id: "qld-evacuate.during.9",
        phase: "during",
        text: "Make sure your pets are safe and secure.",
        source: "qld-evacuation",
        quote: "Are your pets safe and secure?",
      },
      {
        id: "qld-evacuate.during.10",
        phase: "during",
        text: "Secure and lock your home.",
        source: "qld-evacuation",
        quote: "Have you secured and locked your home?",
      },
      {
        id: "qld-evacuate.during.11",
        phase: "during",
        text: "Check on neighbours who are elderly or disabled.",
        source: "qld-evacuation",
        quote: "Have you checked on neighbours who are elderly or disabled?",
      },
    ],
    supplies: qldKit("qld-evacuate"),
    where: qldWhere("qld-evacuate"),
    days: null,
    prompts: [
      "Where will you go: friends or family on higher ground, or somewhere the council names? The pages read ask the question and leave the answer to you.",
    ],
  },
  {
    id: "qld-storm",
    kind: "severe-weather",
    kindText: "Storm or cyclone",
    name: "Storm or cyclone (Queensland)",
    about:
      "Getting the home ready before storm and cyclone season, and what to do when a warning is issued, from the Queensland Government.",
    country: "AU",
    government: "the Queensland Government, Australia",
    steps: [
      {
        id: "qld-storm.before.1",
        phase: "before",
        text: "Check the roof and repair loose tiles, eaves and screws.",
        source: "qld-prepare-home",
        quote: "Check the condition of the roof and repair loose tiles, eaves and screws.",
        subKind: "storm",
      },
      {
        id: "qld-storm.before.2",
        phase: "before",
        text: "Clean gutters and downpipes so water drains away quickly.",
        source: "qld-prepare-home",
        quote: "Clean gutters and downpipes so water can drain away as quickly as possible.",
        subKind: "storm",
      },
      {
        id: "qld-storm.before.3",
        phase: "before",
        text: "Trim trees and overhanging branches.",
        source: "qld-prepare-home",
        quote: "Trim trees and overhanging branches.",
        subKind: "storm",
      },
      {
        id: "qld-storm.before.4",
        phase: "before",
        text: "Secure loose items that high winds could blow about, such as garden furniture and toys.",
        source: "qld-prepare-home",
        quote: "Secure loose items that could cause damage if blown around in high winds (such as garden furniture and toys).",
        subKind: "storm",
      },
      {
        id: "qld-storm.before.5",
        phase: "before",
        text: "Check your home, contents and car insurance is current, including debris clean-up.",
        source: "qld-prepare-home",
        quote:
          "Ensure your home, contents and car insurance is current and covers your assets adequately - check your policy includes debris clean up and disposal.",
        subKind: "storm",
      },
      {
        id: "qld-storm.before.6",
        phase: "before",
        text: "Pick the strongest room to shelter in: usually the smallest, with the fewest windows.",
        source: "qld-prepare-home",
        quote:
          "Identify which room is the strongest part of the house, in case you need to shelter in your home during severe storm or cyclone. Usually this would be the smallest room in the house, with the least windows.",
        subKind: "storm",
      },
      {
        id: "qld-storm.before.7",
        phase: "before",
        text: "Find out where and how to turn off the water, power and gas.",
        source: "qld-prepare-home",
        quote: "Identify where and how to turn off the mains supply for water, power and gas.",
        subKind: "storm",
      },
      {
        id: "qld-storm.before.8",
        phase: "before",
        text: "In a flood-prone area, store all poisons well above the ground.",
        source: "qld-prepare-home",
        quote: "Store all poisons well above ground level.",
        subKind: "storm",
      },
      {
        id: "qld-storm.during.1",
        phase: "during",
        text: "When a severe weather warning is issued, unplug appliances and outside TV and radio aerials.",
        source: "qld-prepare-home",
        quote: "Disconnect electrical appliances and all external television and radio aerials.",
        subKind: "storm",
      },
      {
        id: "qld-storm.during.2",
        phase: "during",
        text: "Turn off the electricity and gas if the emergency services tell you to.",
        source: "qld-prepare-home",
        quote: "Turn off electricity and gas main supplies if instructed by emergency authorities.",
        subKind: "storm",
      },
      {
        id: "qld-storm.during.3",
        phase: "during",
        text: "Secure outdoor furniture and other garden items.",
        source: "qld-prepare-home",
        quote: "Secure outdoor furniture and other garden items.",
        subKind: "storm",
      },
      {
        id: "qld-storm.during.4",
        phase: "during",
        text: "Fill buckets and the bath with clean water in case the supply stops.",
        source: "qld-prepare-home",
        quote: "Fill buckets and bath with clean water in case of interruptions to main supply.",
        subKind: "storm",
      },
      {
        id: "qld-storm.during.5",
        phase: "during",
        text: "Park vehicles under cover, away from trees, power lines and waterways.",
        source: "qld-prepare-home",
        quote: "Park vehicles under cover, away from trees, powerlines and waterways.",
        subKind: "storm",
      },
      {
        id: "qld-storm.during.6",
        phase: "during",
        text: "Check everyone is safe and in the strongest room.",
        source: "qld-prepare-home",
        quote: "Check all household members are safe and are in the strongest room in the house.",
        subKind: "storm",
      },
      {
        id: "qld-storm.during.8",
        phase: "during",
        text: "Take your emergency kit.",
        source: "qld-prepare-home",
        quote: "Take your Emergency Kit.",
        subKind: "storm",
      },
      {
        id: "qld-storm.during.7",
        phase: "during",
        text: "Listen to your local radio station for updates and warnings.",
        source: "qld-prepare-home",
        quote: "Tune in and listen to your local radio station for updates on the event and further warnings and safety messages.",
        subKind: "storm",
      },
    ],
    supplies: [
      ...qldKit("qld-storm"),
      supply(
        "qld-storm.supply.15",
        "Containers to store drinking water",
        "water",
        "qld-prepare-home",
        "containers to store drinking water",
      ),
      supply(
        "qld-storm.supply.16",
        "Spare fuel for the car, stored safely",
        "fuel",
        "qld-prepare-home",
        "spare supply of fuel for use in your vehicle (ensure you store safely)",
      ),
    ],
    where: [
      ...qldWhere("qld-storm"),
      {
        id: "qld-storm.where.3",
        what: "The mains switches for water, power and gas",
        source: "qld-prepare-home",
        quote: "Identify where and how to turn off the mains supply for water, power and gas.",
      },
    ],
    days: null,
    prompts: ["Which is your local radio station, and on what frequency? Write it down: the page says to listen to it."],
  },
  {
    id: "nl-72-hours",
    kind: "shelter-at-home",
    kindText: "",
    name: "The first 72 hours at home (Netherlands)",
    about:
      "Managing on your own for the first three days, with a kit, a plan and a radio, from the Dutch government's Denk vooruit campaign and Rijksoverheid.nl.",
    country: "NL",
    government: "the Government of the Netherlands",
    steps: [
      {
        id: "nl-72-hours.before.1",
        phase: "before",
        text: "Gather the most important things you do not already have.",
        source: "dv-emergency-kit",
        quote: "First gather together the most important things you don't already have.",
      },
      {
        id: "nl-72-hours.before.2",
        phase: "before",
        text: "Think about your own needs, such as baby food, medicine, and food and water for pets.",
        source: "dv-emergency-kit",
        quote:
          "Think carefully about your own situation and what you need, for example baby food, medicine and food and water for your pet.",
      },
      {
        id: "nl-72-hours.before.3",
        phase: "before",
        text: "Keep the kit somewhere easy to reach, in a waterproof pack such as a backpack.",
        source: "dv-emergency-kit",
        quote:
          "Store items in a convenient, easily accessible place. Use a waterproof pack such as a backpack, which you can also easily carry if you need to evacuate suddenly.",
      },
      {
        id: "nl-72-hours.before.4",
        phase: "before",
        text: "Check the stock every six months: is it complete, and still in date?",
        source: "dv-emergency-kit",
        quote: "Check the emergency stock every six months. Is the stock still complete? Are the products still in date?",
      },
      {
        id: "nl-72-hours.before.5",
        phase: "before",
        text: "If you cannot put a kit together on your own, do it with family or neighbours.",
        source: "dv-emergency-kit",
        quote:
          "If you can't put together an emergency kit on your own, you can also do it with family, neighbours or people in the neighbourhood.",
      },
      {
        id: "nl-72-hours.before.6",
        phase: "before",
        text: "Keep a radio in the kit: one on batteries, or a DAB+ radio that also has FM.",
        source: "dv-radio",
        quote:
          "This could be a battery-operated radio or a digital radio (DAB+). If you have a digital radio, check that it also has FM frequencies.",
      },
      {
        id: "nl-72-hours.before.7",
        phase: "before",
        text: "Look up your regional broadcaster's FM frequency and tune the radio to it now.",
        source: "dv-radio",
        quote:
          "Every region has its own radio station and FM frequency. Check the overview for the frequency in your region. You can already tune your radio to the right frequency.",
      },
      {
        id: "nl-72-hours.before.8",
        phase: "before",
        text: "Keep cash for the first 72 hours: about €70 for each adult and €30 for each child, in mixed notes and coins.",
        source: "rijksoverheid-noodpakket",
        quote:
          "Doe ook € 70 voor een volwassene en € 30 voor een kind in het noodpakket voor de eerste 72 uur. Dit bedrag is een advies. Het is ook handig om verschillende biljetten en munten te hebben.",
      },
      {
        id: "nl-72-hours.before.9",
        phase: "before",
        text: "Have more than one way to pay, such as a bank app and a debit card, perhaps with different banks.",
        source: "rijksoverheid-noodpakket",
        quote:
          "En zorg voor verschillende betaalmiddelen. Bijvoorbeeld een werkende bank-app op een mobiele telefoon en een pinpas. Eventueel bij verschillende banken.",
      },
      {
        id: "nl-72-hours.before.10",
        phase: "before",
        text: "Agree with the people around you how you will reach or find each other, and who needs extra help.",
        source: "dv-emergency-plan",
        quote:
          "It contains clear agreements with the people around you on what you will do in an emergency situation. For example, how you will reach or locate each other, plus arrangements for anyone requiring extra help.",
      },
      {
        id: "nl-72-hours.before.11",
        phase: "before",
        text: "Talk the plan through with your partner, children, parents or neighbours.",
        source: "dv-emergency-plan",
        quote: "Once you’ve made your emergency plan, discuss it with your partner, children, parents and/or neighbours.",
      },
      {
        id: "nl-72-hours.before.12",
        phase: "before",
        text: "Give your emergency contacts a photo or a copy of the plan.",
        source: "dv-emergency-plan",
        quote: "Take a photo or make a copy of your emergency plan and share it with the emergency contacts you’ve filled in.",
      },
      {
        id: "nl-72-hours.during.1",
        phase: "during",
        text: "With no power or internet, listen to the regional public broadcaster on the radio.",
        source: "dv-radio",
        quote:
          "If the power goes down and an Internet connection is no longer possible, the regional public broadcaster can still continue to broadcast via radio.",
      },
    ],
    supplies: [
      supply(
        "nl-72-hours.supply.1",
        "Torch",
        "equipment",
        "rijksoverheid-noodpakket",
        "In een noodpakket heeft u bijvoorbeeld een zaklamp en contant geld nodig.",
      ),
      supply(
        "nl-72-hours.supply.2",
        "Radio on batteries or wind-up",
        "equipment",
        "rijksoverheid-noodpakket",
        "En een radio op batterijen of een opwindbare radio.",
      ),
      supply(
        "nl-72-hours.supply.3",
        "Cash",
        "other",
        "rijksoverheid-noodpakket",
        "In een noodpakket heeft u bijvoorbeeld een zaklamp en contant geld nodig.",
      ),
      supply(
        "nl-72-hours.supply.4",
        "Food and drink that keeps",
        "food",
        "rijksoverheid-noodpakket",
        "Ook eten en drinken dat lang goed blijft, hoort in een noodpakket.",
      ),
      supply(
        "nl-72-hours.supply.5",
        "Baby food, if needed",
        "food",
        "dv-emergency-kit",
        "Think carefully about your own situation and what you need, for example baby food, medicine and food and water for your pet.",
      ),
      supply(
        "nl-72-hours.supply.6",
        "Medicines",
        "medical",
        "dv-emergency-kit",
        "Think carefully about your own situation and what you need, for example baby food, medicine and food and water for your pet.",
      ),
      supply(
        "nl-72-hours.supply.7",
        "Food and water for pets",
        "pet-food",
        "dv-emergency-kit",
        "Think carefully about your own situation and what you need, for example baby food, medicine and food and water for your pet.",
      ),
    ],
    where: [
      {
        id: "nl-72-hours.where.1",
        what: "The emergency kit",
        source: "dv-emergency-kit",
        quote: "Store items in a convenient, easily accessible place.",
      },
      {
        id: "nl-72-hours.where.2",
        what: "The emergency plan",
        source: "dv-emergency-plan",
        quote:
          "Keep the emergency plan in a handy place. For example with your emergency kit, on the fridge, in the meter cupboard or in the hall cupboard.",
      },
    ],
    days: {
      value: 3,
      source: "dv-emergency-kit",
      quote: "Having an emergency kit means you are prepared for the first three days (72 hours) of an emergency situation.",
    },
    prompts: [
      "How much water will you keep? The Dutch government's figure is in its kit infographic, whose words may not be copied here: read it on Denk vooruit.",
      "Who will collect the children if the phones do not work, and where will you meet? Denk vooruit asks these questions; the answers are yours.",
    ],
  },
];
