/**
 * First aid for the household book, quoted from the NHS website, unchanged.
 *
 * The NHS website's terms (read 21 November 2026, https://www.nhs.uk/our-policies/terms-and-conditions/)
 * release its content under the Open Government Licence; content copied without change
 * is credited "Information from the NHS website" with the date it was copied, on every
 * appearance, and content that has been changed may not name the NHS. So every line here
 * is a whole line of the page as it stood on the day it was read, and the book prints
 * the credit beside each page's lines. A line is never reworded: to change one, read the
 * page again and copy it again.
 *
 * What the NHS website no longer holds is not made up here. Its first aid pages for adults
 * (CPR, choking, the recovery position, severe bleeding) now send readers to St John
 * Ambulance, and the words of St John Ambulance, the British Red Cross and Resuscitation
 * Council UK may not be reprinted. The book says so and points to them.
 */

export const NHS_READ = "21 November 2026";
/** The credit the NHS website's terms ask for, with the date copied as they ask ("as at DDMMYY"). */
export const NHS_CREDIT = "Information from the NHS website, as at 211126.";

export interface FirstAidPage {
  id: string;
  title: string;
  url: string;
  /** "Page last reviewed", as the page gives it. */
  reviewed: string;
  /** Whole lines of the page, in its order, under its own headings. */
  parts: Array<{ heading: string; lines: string[] }>;
}

export const FIRST_AID_PAGES: readonly FirstAidPage[] = [
  {
    id: "child-cpr",
    title: "How to resuscitate a child",
    url: "https://www.nhs.uk/baby/first-aid-and-safety/first-aid/how-to-resuscitate-a-child/",
    reviewed: "21 May 2026",
    parts: [
      {
        heading: "",
        lines: [
          "If a baby or child is unresponsive and not breathing normally, call 999 and start CPR straight away.",
          "When you call 999 for an ambulance, you should be given basic life-saving instructions over the phone, including advice about CPR.",
        ],
      },
      {
        heading: "4. Check their breathing",
        lines: [
          "Look, listen and feel for no more than 10 seconds before deciding that they're not breathing. Gasping breaths should not be considered to be normal breathing.",
        ],
      },
      {
        heading: "5b. If your child is not breathing or is breathing infrequently and irregularly",
        lines: [
          "Carefully remove any obvious obstruction in the mouth if easy to do so – being careful not to push it further down the throat.",
          "Give 5 initial rescue breaths (mouth-to-mouth resuscitation).",
        ],
      },
      {
        heading: "Rescue breaths for a baby under 1 year",
        lines: [
          "Take a breath, then cover your baby's mouth and nose with your mouth, making sure it's sealed. If you cannot cover both the mouth and nose at the same time, just seal either with your mouth. If you choose the nose, close the lips to stop air escaping.",
          "Blow a breath steadily into the baby's mouth and nose over 1 second. It should be sufficient to make the chest visibly rise.",
        ],
      },
      {
        heading: "Rescue breaths for a child over 1 year",
        lines: [
          "Close the soft part of their nose using the index finger and thumb of the hand that's on their forehead.",
          "Take a breath, then place your lips around their mouth, making sure it's sealed.",
          "Blow a breath steadily into their mouth for about 1 second, watching for the chest to rise.",
        ],
      },
      {
        heading: "No signs of life present",
        lines: [
          "Start chest compressions immediately.",
          "Combine chest compressions with rescue breaths, providing 2 breaths after every 30 compressions.",
        ],
      },
      {
        heading: "7. Chest compressions: general guidance",
        lines: [
          "Push down 4cm (for a baby or infant) or 5cm (a child), which is approximately one-third of the chest depth.",
          "Release the pressure, allowing the chest to come back up, then rapidly repeat at a rate of about 100 to 120 compressions a minute.",
          "After 30 compressions, tilt the head, lift the chin, and give 2 effective breaths.",
        ],
      },
      {
        heading: "Chest compression in babies less than 1 year",
        lines: [
          "Do the compressions on the breastbone with the tips of 2 fingers, do not use the whole hand or both hands.",
          "If you had no response to your call for help and you're alone, continue resuscitation for about 1 minute before trying to get help – for example, by calling 999.",
        ],
      },
      {
        heading: "Chest compression in children over 1 year",
        lines: [
          "Place the heel of 1 hand over the lower third of the breastbone.",
          "In larger children or if you're small, this may be done more easily by using both hands with the fingers interlocked, avoiding pressure on the ribs.",
          "If you had no response to your call for help and you're alone, continue resuscitation for about 1 minute before trying to get help – for example, by calling 999.",
        ],
      },
      {
        heading: "8. Continue resuscitation until",
        lines: [
          "Your child shows signs of life – normal breathing, coughing, movement of arms or legs (if this happens put them in the recovery position).",
          "Qualified help arrives.",
        ],
      },
    ],
  },
  {
    id: "heart-attack",
    title: "Heart attack",
    url: "https://www.nhs.uk/conditions/heart-attack/",
    reviewed: "31 March 2026",
    parts: [
      {
        heading: "Call 999 if:",
        lines: [
          "you have chest pain that feels tight or like squeezing on your chest",
          "you have chest pain that's spreading to your arms, neck or jaw",
          "you're having severe difficulty breathing – you're gasping, choking or not able to get words out",
          "someone has passed out and is not responding normally",
        ],
      },
      {
        heading: "While you're waiting for medical help",
        lines: [
          "Sit and rest on the floor in a comfortable position, with your knees bent and your back supported. If you cannot do this, you can also sit on a chair.",
          "Take aspirin (300mg) if you have any – do not give aspirin to someone who has an aspirin allergy.",
          "Keep checking someone who may be having a heart attack to make sure they're still responding and breathing.",
          "If someone stops responding to you and stops breathing, start CPR.",
        ],
      },
    ],
  },
  {
    id: "stroke",
    title: "Symptoms of a stroke",
    url: "https://www.nhs.uk/conditions/stroke/symptoms/",
    reviewed: "12 September 2024",
    parts: [
      {
        heading: "Check for signs of a stroke",
        lines: [
          "face weakness – one side of your face may droop (fall) and it might be hard to smile",
          "arm weakness – you may not be able to fully lift both arms and keep them there because of weakness or numbness in 1 arm",
          "speech problems – you may slur your words or sound confused",
          "The easiest way to remember these symptoms is the word FAST. This stands for: face, arms, speech and time to call 999.",
          "Symptoms of a stroke can sometimes stop after a short time, so you may think you're OK. Even if this happens, get medical help straight away.",
        ],
      },
    ],
  },
  {
    id: "bleeding",
    title: "Cuts and grazes",
    url: "https://www.nhs.uk/conditions/cuts-and-grazes/",
    reviewed: "02 April 2026",
    parts: [
      {
        heading: "What to do if the wound is bleeding a lot",
        lines: [
          "Wash your hands thoroughly and dry them. Put on disposable gloves if you have some.",
          "Check the wound and make sure there's nothing stuck in it.",
          "If there's nothing in the wound, put pressure on it using a bandage or a clean, folded cloth (such as a tea towel).",
          "If there's something stuck in the wound, do not try to take it out. Make sure not to press down on the object. Press firmly either side of it to push the edges of the wound together.",
          "If the wound is on your hand or arm, raise it above your head. If the wound is on your lower limb, lie down and raise it above the level of your heart. This will help reduce the blood flow.",
          "If blood comes through the bandage or cloth, apply another bandage or cloth on top to put pressure on the wound.",
        ],
      },
      {
        heading: "How to clean and dress a cut or graze",
        lines: [
          "If it's painful, you can take painkillers such as paracetamol or ibuprofen (but do not give aspirin to children under 16).",
          "Clean the wound by rinsing it with bottled or tap water, or by using sterile wipes.",
          "Remove the gauze or cloth and put on a sterile dressing or a plaster.",
        ],
      },
      {
        heading: "Call 999 or go to A&E if:",
        lines: [
          "you have a cut and cannot stop the bleeding",
          "the blood comes out in spurts and is bright red and hard to control",
          "the wound is very large or deep",
        ],
      },
    ],
  },
  {
    id: "burns",
    title: "Burns and scalds",
    url: "https://www.nhs.uk/conditions/burns-and-scalds/",
    reviewed: "31 March 2026",
    parts: [
      {
        heading: "What to do if you have a burn or scald",
        lines: [
          "Hold the burn or scald under cool running water for 20 minutes. Do this as soon as possible, within 3 hours of it happening. If there's no running water available, you can use cool bottled water or a wet towel.",
          "Remove any clothing or jewellery that's near the affected area – but do not remove anything that is stuck to the affected area.",
          "When the burn or scald has cooled, lay cling film over it if you can. Do not wrap the cling film around it.",
          "do not put any creams, oils or butter on burns or scalds",
        ],
      },
      {
        heading: "Call 999 or go to A&E if: You have a burn or scald that:",
        lines: [
          "is very large or deep",
          "is on your face, genitals or bottom",
          "has been caused by an acid or chemical, or by electricity",
        ],
      },
    ],
  },
  {
    id: "anaphylaxis",
    title: "Anaphylaxis",
    url: "https://www.nhs.uk/conditions/anaphylaxis/",
    reviewed: "21 June 2023",
    parts: [
      {
        heading: "What to do if you have anaphylaxis",
        lines: [
          "Use an adrenaline auto-injector (such as an EpiPen) if you have one – instructions are included on the side of the injector.",
          "Call 999 for an ambulance and say that you think you're having an anaphylactic reaction.",
          "Lie down – you can raise your legs, and if you're struggling to breathe, raise your shoulders or sit up slowly (if you're pregnant, lie on your left side).",
          "If your symptoms have not improved after 5 minutes, use a 2nd adrenaline auto-injector.",
          "Do not stand or walk at any time, even if you feel better.",
        ],
      },
    ],
  },
  {
    id: "hypothermia",
    title: "Hypothermia",
    url: "https://www.nhs.uk/conditions/hypothermia/",
    reviewed: "09 June 2023",
    parts: [
      {
        heading: "What to do while you're waiting for help for hypothermia",
        lines: [
          "move the person indoors or somewhere sheltered as quickly as possible",
          "remove any wet clothing, wrap them in a blanket, sleeping bag or dry towel, making sure their head is covered",
          "give them a warm non-alcoholic drink and some sugary food like chocolate if they're fully awake",
          "do not use a hot bath, hot water bottle or heat lamp to warm them up",
          "do not rub their arms, legs, feet or hands",
        ],
      },
    ],
  },
  {
    id: "heat",
    title: "Heat exhaustion and heatstroke",
    url: "https://www.nhs.uk/conditions/heat-exhaustion-heatstroke/",
    reviewed: "28 May 2026",
    parts: [
      {
        heading: "Things you can do to cool someone down",
        lines: [
          "Move them to a cool place.",
          "Remove all unnecessary clothing like a jacket or socks.",
          "Give them plenty of water to drink – you can also give them an isotonic sports drink or oral rehydration powder that you mix with water, which will help replace salt lost through sweating.",
          "Cool their skin – spray or sponge them with cool water and fan them. Cold packs, wrapped in a cloth and put under the armpits or on the neck are good too.",
          "Heatstroke is a medical emergency. Get immediate medical help if someone has the symptoms of heatstroke.",
        ],
      },
    ],
  },
  {
    id: "carbon-monoxide",
    title: "Carbon monoxide poisoning",
    url: "https://www.nhs.uk/conditions/carbon-monoxide-poisoning/",
    reviewed: "16 December 2025",
    parts: [
      {
        heading: "What to do if you think you have carbon monoxide poisoning",
        lines: [
          "stop using appliances you think might be making carbon monoxide (such as a boiler, cooker or heater) if you can",
          "go outside",
          "get medical advice as soon as possible – do not go back into the affected building until you have got advice",
          "Using barbecues or camping stoves inside, and turning on vehicle or lawn mower engines in an enclosed space (such as a garage) can also cause a build-up of carbon monoxide.",
        ],
      },
    ],
  },
  {
    id: "poisoning",
    title: "Poisoning",
    url: "https://www.nhs.uk/conditions/poisoning/",
    reviewed: "12 June 2025",
    parts: [
      {
        heading: "While you're waiting for medical help",
        lines: [
          "start CPR if someone is unresponsive and not breathing",
          "put the person in the recovery position if they're unconscious and still breathing",
          "try to find what may have caused the poisoning – look around for packaging, containers, or medicines",
          "do not try to make someone sick if you think they've swallowed something harmful – they could choke and stop breathing",
          "do not give the person anything to eat or drink",
        ],
      },
    ],
  },
  {
    id: "head-injury",
    title: "Head injury and concussion",
    url: "https://www.nhs.uk/conditions/head-injury-and-concussion/",
    reviewed: "29 May 2025",
    parts: [
      {
        heading: "Call 999 if: Someone has hit their head and:",
        lines: [
          "has been knocked out and has not woken up",
          "cannot stay awake or keep their eyes open",
          "has a fit (seizure)",
          "has clear fluid coming from their ears or nose",
          "has new numbness or weakness in any part of their body",
        ],
      },
    ],
  },
];

/** Where the NHS website sends readers for what it no longer holds, and the others whose words may not be reprinted. */
export const FIRST_AID_POINTERS = [
  {
    what: "CPR for an adult, the recovery position, choking and severe bleeding",
    who: "St John Ambulance, where the NHS website now sends readers for first aid",
    url: "https://www.sja.org.uk/first-aid-advice/",
  },
  {
    what: "How to do CPR",
    who: "Resuscitation Council UK",
    url: "https://www.resus.org.uk/public-resource/how-do-cpr",
  },
  {
    what: "First aid courses",
    who: "British Red Cross",
    url: "https://www.redcross.org.uk/first-aid",
  },
] as const;

/**
 * What the pages above name to use, each with the page it is named on: the first aid kit
 * the book lists is these and nothing else, so that it says nothing the pages do not.
 */
export const KIT_FROM_PAGES: ReadonlyArray<{ item: string; page: string }> = [
  { item: "Disposable gloves", page: "Cuts and grazes" },
  { item: "Bandages, and clean folded cloths such as tea towels", page: "Cuts and grazes" },
  { item: "Sterile gauze, sterile dressings and plasters", page: "Cuts and grazes" },
  { item: "Sterile wipes", page: "Cuts and grazes" },
  { item: "Cling film, for a burn once it has cooled", page: "Burns and scalds" },
  { item: "Painkillers such as paracetamol or ibuprofen", page: "Cuts and grazes; Burns and scalds" },
  { item: "Aspirin (300mg), for a heart attack, unless allergic", page: "Heart attack" },
  { item: "Each person's adrenaline auto-injector, where one is prescribed", page: "Anaphylaxis" },
  { item: "A blanket or sleeping bag", page: "Hypothermia" },
  { item: "Oral rehydration powder", page: "Heat exhaustion and heatstroke" },
];

/**
 * Keeping clean with little water: the US Centers for Disease Control and Prevention,
 * "Guidelines for Personal Hygiene During an Emergency" (page dated 5 August 2024), read
 * on 21 November 2026 through a reader (cdc.gov refused requests from here directly).
 * US federal government work, quoted unchanged.
 */
export const CDC_HYGIENE = {
  title: "CDC, Guidelines for Personal Hygiene During an Emergency (5 August 2024)",
  url: "https://www.cdc.gov/water-emergency/safety/guidelines-for-personal-hygiene-during-an-emergency.html",
  read: "21 November 2026",
  lines: [
    "If clean tap water is not available, create a temporary handwashing station by using a large water jug.",
    "If you do not have soap and water, use an alcohol-based hand sanitizer that contains at least 60% alcohol.",
    "Hand sanitizers are not as effective when hands are visibly dirty or greasy.",
    "Follow local guidance on water that is safe for bathing.",
  ],
} as const;
