/**
 * A small household library for measuring search: the subjects people ask about, the
 * passing mentions that used to outrank them (a physics book's "car battery", a radio
 * menu's battery saver) and three long books whose every page says "water".
 *
 * Each entry is what a module hands the search index (`IndexEntity`). Ids are the
 * graded answers in queries.json.
 */

const doc = (entityId, title, sections, extra = {}) => ({
  kind: "document",
  entityId,
  title,
  url: `/library/documents/${entityId}`,
  sections,
  ...extra,
});
const note = (entityId, title, text, extra = {}) => ({
  kind: "note",
  entityId,
  title,
  url: `/notes/${entityId}`,
  sections: Array.isArray(text) ? text : [{ text }],
  ...extra,
});

/** A long book: `pages` pages, each mentioning water in passing. */
function longBook(entityId, title, pages, topic) {
  const sections = [];
  for (let page = 1; page <= pages; page += 1) {
    sections.push({
      page,
      text: `${topic} ${page}. Water moves through the system and the level is checked each week. Keep a log of the readings and of any change in colour or smell.`,
    });
  }
  return doc(entityId, title, sections);
}

export function library() {
  return [
    doc("car-maint", "Car maintenance manual", [
      {
        page: 3,
        heading: "Checking oil",
        text: "Check the oil with the engine cold and the car on level ground. Top up a little at a time.",
      },
      {
        page: 12,
        heading: "How to replace a car battery",
        text: "Changing a car battery takes about twenty minutes. Disconnect the negative terminal first, then the positive. Lift the old battery out, fit the new one, and connect positive first, then negative.",
      },
      { page: 14, heading: "Wipers", text: "Replace wiper blades every year, or when they smear." },
    ]),
    doc("physics", "University physics, volume 1", [
      {
        page: 301,
        heading: "Conservation of energy",
        text: "What do a car battery and a sandwich have in common? Both contain energy that can change form. The law of conservation of energy says how to account for it. A battery stores chemical energy; a car converts it.",
      },
      { page: 302, text: "Kinetic energy depends on mass and speed. Potential energy depends on height." },
    ]),
    doc("radio-menu", "The setup menu (1): display, audio, TX and RX", [
      {
        page: 8,
        text: "Battery saver: how to change it. SAVE is kind to the battery. Turn SAVE on if you want a day's operating to last longer. The display backlight can change too.",
      },
    ]),
    note(
      "jump-start",
      "Jump starting a car",
      "To jump start a car with a flat battery you need jump leads and a second car. Connect red to the flat battery's positive terminal, then to the good battery. Connect black to the good battery's negative, then to bare metal on the dead car.",
    ),
    note(
      "phone-charging",
      "Charging a phone in the car",
      "A phone charges from the car's 12 V socket with a USB adapter. Run the engine so the car battery is not drained.",
    ),
    note("solar-charger", "Folding solar charger", "A 20 W folding panel charges a phone or a small battery bank in a few hours of sun."),
    note(
      "tyre-pressure",
      "Car tyre pressures",
      "Check tyre pressure monthly, with tyres cold. The right pressure is on a sticker inside the driver's door.",
    ),
    note(
      "winter-driving",
      "Winter driving kit",
      "Keep a winter driving kit in the car: blanket, torch, shovel, de-icer, water and snacks. Hypothermia can set in if you are stranded.",
    ),
    doc("water-handbook", "Water treatment handbook", [
      {
        page: 1,
        heading: "Boiling",
        text: "Boiling is the most reliable way to purify water. Bring water to a rolling boil for one minute, three at altitude.",
      },
      {
        page: 2,
        heading: "Chlorine and bleach",
        text: "To purify water with bleach, add two drops of unscented household bleach per litre and wait thirty minutes. Chlorine tablets work the same way.",
      },
      {
        page: 3,
        heading: "Sand and gravel filters",
        text: "A sand filter: layers of gravel, coarse sand and fine sand in a bucket. Filter the water through it, then boil or disinfect it.",
      },
      {
        page: 4,
        heading: "Storing water",
        text: "Store at least 4 litres of drinking water per person per day, for at least three days. Rotate every six months.",
      },
    ]),
    note("pool-care", "Swimming pool care", "Keep pool water chlorine between 1 and 3 ppm. Shock the pool weekly in summer."),
    note("kit-list", "Kit list", [{ heading: "Cooking", text: "Stove, gas, lighter, pan for boiling water, mug." }]),
    note(
      "supplies-list",
      "Emergency supplies",
      "Water (4 litres per person per day), tinned food, torch, radio, batteries, first aid kit.",
    ),
    doc("first-aid", "First aid manual", [
      {
        page: 10,
        heading: "Burns",
        text: "Treat a burn by cooling it under cool running water for twenty minutes. Cover it loosely with cling film.",
      },
      { page: 14, heading: "Nosebleeds", text: "To stop a nosebleed, sit forward and pinch the soft part of the nose for ten minutes." },
      {
        page: 18,
        heading: "Hypothermia",
        text: "Signs of hypothermia: shivering, slurred speech, confusion, drowsiness. Warm the person slowly.",
      },
      {
        page: 22,
        heading: "CPR on a child",
        text: "CPR on a child: give five rescue breaths, then thirty chest compressions with one hand, a third of the chest's depth.",
      },
      {
        page: 26,
        heading: "Snake bites",
        text: "Treat a snake bite by keeping the person still and the bitten limb below the heart. Call for help.",
      },
      {
        page: 30,
        heading: "Dehydration",
        text: "Symptoms of dehydration: thirst, dark urine, dizziness, tiredness. Give small sips of fluid.",
      },
    ]),
    note(
      "burns",
      "Burns and scalds",
      "Cool a burn or scald with running water for 20 minutes. Do not use ice or butter. Treat large burns in hospital.",
    ),
    note("sunburn", "Sunburn", "Treat sunburn with cool showers and after-sun. A blistering burn needs a doctor."),
    note("cpr-adult", "CPR for adults", "CPR for an adult: thirty chest compressions, two rescue breaths, repeat until help comes."),
    note(
      "first-aid-kit",
      "What to put in a first aid kit",
      "A first aid kit: plasters, bandages, gauze, tape, scissors, tweezers, gloves, antiseptic wipes.",
    ),
    note(
      "oral-rehydration",
      "Oral rehydration solution",
      "To make oral rehydration solution for dehydration, mix six teaspoons of sugar and half a teaspoon of salt in a litre of clean water.",
    ),
    doc("bike-repair", "Bicycle repair", [
      {
        page: 5,
        heading: "Fixing a puncture",
        text: "To fix a puncture, take the inner tube out, find the hole, roughen the area, glue a patch on and let it dry.",
      },
      { page: 9, heading: "Brakes", text: "Adjust the brake cable so the levers stop well short of the handlebar." },
    ]),
    note(
      "fuel-storage",
      "Storing petrol and diesel",
      "Store petrol safely in approved metal or plastic containers, at most 30 litres at home, in a ventilated shed away from the house.",
    ),
    doc("generator", "Generator manual", [
      {
        page: 4,
        text: "Use a generator safely: run it outdoors only, never indoors, because of carbon monoxide. Let it cool before refuelling with petrol.",
      },
      { page: 6, text: "In a power cut, connect appliances directly to the generator with outdoor extension leads." },
    ]),
    note(
      "power-cut",
      "Power cut checklist",
      "What to do in a power cut: check whether neighbours are affected, report it on 105, unplug appliances, use torches not candles.",
    ),
    note(
      "freezer",
      "Freezer food in a power cut",
      "A full freezer keeps food frozen for about 48 hours in a power cut if the door stays shut. Frozen food lasts months in a working freezer.",
    ),
    doc("food-storage", "Food storage times", [
      { page: 2, text: "How long food lasts in the freezer: meat 4 to 12 months, bread 3 months, vegetables 8 to 12 months." },
      { page: 3, text: "Store rice long term in sealed buckets with oxygen absorbers; white rice keeps for 25 years." },
    ]),
    note(
      "soda-bread",
      "Soda bread (no yeast)",
      "Bread made without yeast: mix flour, bicarbonate of soda, salt and buttermilk, shape a round and bake for 30 minutes.",
    ),
    note("sourdough", "Sourdough starter", "A sourdough starter is wild yeast grown in flour and water. Feed it daily."),
    doc("bread-machine", "Bread machine manual", [{ page: 7, text: "Add water, flour, salt, then yeast last, away from the water." }]),
    doc("radio-freqs", "Emergency radio frequencies", [
      {
        page: 1,
        text: "The best frequency for an emergency call depends on the band. Marine VHF channel 16 (156.8 MHz) is the international distress and calling channel.",
      },
    ]),
    note(
      "pmr446",
      "PMR446 channels",
      "PMR446 is licence-free radio with 16 channels. Many groups agree channel 8 as their emergency channel.",
    ),
    doc("knots", "Knots for climbing", [
      {
        page: 2,
        heading: "Bowline",
        text: "To tie a bowline, make a small loop, pass the end up through it, round the standing part and back down.",
      },
      { page: 4, heading: "Clove hitch", text: "The clove hitch is quick to tie and easy to adjust at a belay." },
    ]),
    note(
      "fire-lighting",
      "Lighting a fire without matches",
      "To start a fire without matches, strike a ferro rod onto dry tinder, or use a bow drill. Build the fire from tinder to kindling to fuel.",
    ),
    doc("wood-stove", "Wood stove guide", [
      { page: 3, text: "Burn seasoned logs only. A stove fire needs air at first; close the vents once it is going." },
    ]),
    note("fire-safety", "Fire safety at home", "Test smoke alarms monthly. Plan two ways out of every room in case of fire."),
    note(
      "potatoes",
      "Growing potatoes",
      "Grow potatoes by planting chitted seed potatoes in spring and earthing up the shoots. Watch for potato blight in wet summers.",
    ),
    note(
      "pickling",
      "Pickling vegetables",
      "Pickling vegetables: pack them in clean jars and cover with hot vinegar, salt and sugar brine.",
    ),
    doc("compass", "Using a compass", [
      {
        page: 1,
        text: "To read a compass, hold it flat, turn the housing until the orienting arrow lines up with the needle, and read the bearing.",
      },
    ]),
    note(
      "map-reading",
      "Map reading basics",
      "A grid reference gives a place on the map: eastings first, then northings. A compass sets the map.",
    ),
    note(
      "co-alarm",
      "Carbon monoxide: symptoms and alarms",
      "Carbon monoxide poisoning causes headache, dizziness, nausea and tiredness. Fit a CO alarm near boilers and stoves.",
    ),
    doc("ev-chemistry", "Electric car battery chemistry", [
      { page: 1, text: "Lithium cells change voltage as they discharge. How fast depends on temperature and on the load." },
    ]),
    note(
      "forum-digest",
      "Forum digest: how-to questions",
      "This week: how to tie a tie, how to change a tyre on a car, how to find a battery for a watch, what to do with old paint, how to fix a dripping tap.",
    ),
    note(
      "faq",
      "Frequently asked questions",
      "How do I add a page? What is a tag? Where are my files? How do I store a document? What can I do when the power is off? How to find water on the map.",
    ),
    note("rice-pudding", "Rice pudding", "Rice pudding: short-grain rice, milk and sugar, baked slowly for two hours."),
    longBook("water-systems", "Water systems for the home", 45, "Header tanks and pipes, section"),
    longBook("water-storage", "Water storage containers", 45, "Containers and their care, section"),
    longBook("rainwater", "Rainwater harvesting", 45, "Gutters, butts and first-flush diverters, section"),
    ...Array.from({ length: 12 }, (_, index) =>
      note(
        `garden-${index + 1}`,
        `Garden diary, week ${index + 1}`,
        `Watered the beds this week. Water butts are ${index % 2 ? "full" : "low"}.`,
      ),
    ),
  ];
}
