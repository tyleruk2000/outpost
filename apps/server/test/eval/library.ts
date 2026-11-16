/**
 * The small library the answers evaluation is run over (see answers-eval.ts).
 *
 * Every word of it was written for this purpose and belongs to the repository. It is the
 * household papers of nobody: a made-up home with a made-up generator, repeater and
 * relatives. The facts are deliberately its own (a boiler pressure, a net time, a
 * meeting point), so that a model which answers from memory instead of from the page
 * gets them wrong, and several documents share words ("boil", "water", "code",
 * "battery", "minutes") so that search hands the model passages that are near the
 * question and do not answer it, as a real library does.
 *
 * Do not edit a passage without checking the questions that rest on it (questions.ts).
 */

export interface EvalSection {
  heading: string;
  page?: number;
  text: string;
}

export interface EvalDocument {
  id: string;
  kind: "document" | "note";
  title: string;
  collection: string | null;
  sections: EvalSection[];
}

export const LIBRARY: EvalDocument[] = [
  {
    id: "water",
    kind: "document",
    title: "Water treatment in the field",
    collection: "Medicine and first aid",
    sections: [
      {
        heading: "Boiling",
        page: 1,
        text: "Boiling is the surest way to make water safe to drink, because heat kills the bacteria, viruses and parasites that cause illness. Bring clear water to a rolling boil and keep it there for one minute. Above 2,000 metres, boil it for three minutes, because water boils at a lower temperature at height. Let the water cool by itself with the lid on. Do not cool it with ice from a source you have not treated. Boiling does not take out chemicals, fuel or silt, and it makes water taste flat; pouring it from one clean container to another a few times brings the taste back.",
      },
      {
        heading: "Cloudy water",
        page: 2,
        text: "Treat cloudy water before you disinfect it. Let it stand for an hour so that the heavy silt settles, pour the clear part off carefully, and strain it through a clean cloth or a coffee filter. Chlorine and tablets work badly in cloudy water, because the dirt uses the chemical up before it reaches the germs. Straining does not make water safe on its own account: it only makes the next step work. Keep one container for dirty water and another for treated water, and mark them so that they are never mixed up.",
      },
      {
        heading: "Chlorine dioxide tablets",
        page: 3,
        text: "One chlorine dioxide tablet treats one litre of clear water. Drop it in, close the bottle, and wait thirty minutes before drinking. In water colder than 5 °C the tablet works slowly: wait four hours. Loosen the cap and let a little treated water run over the threads, since the threads have touched untreated water. Tablets keep for about five years in their foil; do not use one from a strip that has been torn open. The yellow tint and the faint smell of a swimming bath are normal and fade if the bottle is left open for a few minutes.",
      },
      {
        heading: "Household bleach",
        page: 4,
        text: "Plain unscented household bleach of 5 to 6 per cent can be used when there is nothing else. Add two drops to each litre of clear water, or four drops to each litre if the water is still cloudy after straining. Stir, and let it stand for thirty minutes. The water should smell faintly of chlorine afterwards; if it does not, add the same amount again and wait another fifteen minutes. Do not use scented bleach, colour-safe bleach or bleach with added cleaners. Bleach loses strength in storage, so write the date on a new bottle and replace it after a year.",
      },
      {
        heading: "Storing treated water",
        page: 5,
        text: "Store treated water in clean food-grade containers with tight lids, in the dark and away from fuel and paint. Label each container with the date it was filled. Treated water kept this way is good for six months; after that, use it for washing and fill the container again. Allow two litres a person a day for drinking, and as much again for cooking and washing. Do not store water in containers that have held milk, because the residue cannot be washed out and feeds bacteria.",
      },
    ],
  },
  {
    id: "first-aid",
    kind: "document",
    title: "First aid notes",
    collection: "Medicine and first aid",
    sections: [
      {
        heading: "Burns and scalds",
        page: 1,
        text: "Cool a burn under cool running water for twenty minutes, and start as soon as you can. Do not use ice, iced water, butter or toothpaste. Take off rings, watches and tight clothing near the burn before the swelling starts, but leave anything that is stuck to the skin. When the burn has been cooled, cover it loosely with cling film laid along the limb, not wrapped round it, or with a clean plastic bag for a hand. Do not burst blisters. A burn larger than the person's own palm, a deep burn, or any burn to the face, hands, feet or a joint needs a doctor.",
      },
      {
        heading: "Bleeding",
        page: 2,
        text: "Press firmly on the wound with a clean pad and keep pressing for ten minutes without lifting the pad to look. If blood soaks through, put a second pad on top of the first; do not take the first one off. Raise a bleeding arm or leg above the heart if nothing is broken. Do not pull out anything that is stuck in the wound: press on either side of it and pad round it. A wound that is still bleeding after ten minutes of firm pressure, or that spurts, needs an ambulance.",
      },
      {
        heading: "Sprains and strains",
        page: 3,
        text: "For the first two days: rest the joint, cool it with ice wrapped in a cloth for fifteen minutes at a time, wrap it firmly but not tightly with an elastic bandage, and keep it raised. Never put ice straight on the skin. After two days, begin to move the joint gently. Suspect a break, not a sprain, if the person cannot put any weight on it, if the shape looks wrong, or if pressing on the bone itself is very painful.",
      },
      {
        heading: "Cold and hypothermia",
        page: 4,
        text: "The early signs are shivering, clumsy hands, slurred speech and bad temper. Get the person out of the wind and off the ground, take off wet clothes and put on dry ones, and cover the head. Give warm sweet drinks if the person is fully awake. Give no alcohol. Do not rub the arms and legs and do not put the person in a hot bath: both send cold blood to the heart. Someone who has stopped shivering and is drowsy is in danger and needs an ambulance.",
      },
      {
        heading: "Rehydration drink",
        page: 5,
        text: "For diarrhoea or heavy sweating when no sachets are to hand, make a rehydration drink: six level teaspoons of sugar and half a level teaspoon of salt, dissolved in one litre of clean water. Measure carefully, because too much salt is harmful, especially to a child. The drink should taste no saltier than tears. Give small sips often. Make a fresh batch every day and throw away what is left.",
      },
    ],
  },
  {
    id: "kit",
    kind: "note",
    title: "Kit list",
    collection: null,
    sections: [
      {
        heading: "Stove",
        text: "The small gas stove boils a litre of water in four minutes with the windshield on. A 230 gram canister lasts about ninety minutes at full flame, which is roughly twenty litres boiled. Keep the canister inside your jacket for a while before using it in frost, since cold gas burns weakly. The pan set nests round the canister; the lighter lives in the lid with a spare box of matches in a bag.",
      },
      {
        heading: "Light",
        text: "Each person carries a head torch and three spare AAA batteries. The red setting keeps your night vision and uses the least power. The lantern in the blue box runs for forty hours on low from its four D cells; take the cells out before storing it, because a leaking battery ruins the contacts.",
      },
      {
        heading: "Shelter and sleeping",
        text: "The green tarp is three metres by three and pitches with the two walking poles. Sleeping bags are stored loose in the cotton sacks, never squashed in their stuff sacks, or the filling goes flat. The foam mats matter more than the bags on cold ground: most heat is lost downwards.",
      },
    ],
  },
  {
    id: "radio",
    kind: "document",
    title: "Radio procedures",
    collection: "Radio",
    sections: [
      {
        heading: "Repeaters and CTCSS",
        page: 1,
        text: "A repeater listens on one frequency and sends what it hears out again on another, from a high site, so that two small radios can reach each other over a hill. A CTCSS tone is a low tone, too low to notice, that your radio sends underneath your voice. The repeater opens only for a signal that carries the right tone, which keeps it from being set off by interference or by a distant station on the same frequency. Our local repeater, GB3ZZ, is on 145.725 MHz with a shift of minus 600 kHz and needs a CTCSS tone of 77.0 Hz. If you can hear the repeater but it does not answer you, the tone or the shift is almost always what is wrong.",
      },
      {
        heading: "Q codes",
        page: 2,
        text: "The Q code is a set of three-letter signals that began in Morse and are still used in speech. The ones heard most: QTH is your location. QSY means change frequency. QRT means closing down, or stop sending. QRM is interference from other stations, and QRN is static from the weather. QSL means I confirm receipt. QRP is low power, usually five watts or less. Put a question mark after a code to make it a question: QTH? asks where the other station is.",
      },
      {
        heading: "The family net",
        page: 3,
        text: "The family net meets every Sunday at 19:30 local time on 145.550 MHz, simplex, with no tone. If that frequency is busy, move up to 145.575 MHz. Whoever opens the net calls each station in turn; answer with your call sign and either 'no traffic' or 'with traffic'. Keep each over shorter than a minute so that a weak station can break in. If you have heard nothing by 19:45, listen on the repeater instead. The BBC World Service schedule is pinned inside the lid of the radio box for news when the network is down.",
      },
      {
        heading: "Handheld batteries",
        page: 4,
        text: "The handheld's battery lasts about eight hours on low power and about three on high, with one minute in ten spent transmitting. Charge both batteries on the first day of each month whether they have been used or not. The spare battery lives in the radio box with the dry-cell case, which takes six AA cells and works when there is no way to charge. Do not leave a battery on the charger for more than a day.",
      },
      {
        heading: "Morse code",
        page: 5,
        text: "Morse code is still the mode that gets through when speech cannot. A dash is three times as long as a dot. The gap between the parts of a letter is one dot long, between letters three dots, and between words seven. The distress signal SOS is three dots, three dashes and three dots, sent as one run with no gaps between the letters. Learn the letters by their sound at a proper speed, not by counting dots and dashes from a chart.",
      },
    ],
  },
  {
    id: "generator",
    kind: "document",
    title: "Generator manual",
    collection: "Equipment",
    sections: [
      {
        heading: "Starting",
        page: 1,
        text: "Check the oil level before every start. Turn the fuel tap on. Close the choke if the engine is cold. Turn the engine switch to ON and pull the starter cord steadily until you feel it bite, then pull hard. When the engine has run for thirty seconds, open the choke gradually. Let it run for two minutes before plugging anything in, and plug in the largest load first.",
      },
      {
        heading: "Oil",
        page: 2,
        text: "Use SAE 10W-30 engine oil. The sump holds 0.6 litre. Change the oil after the first 20 hours of running, and after that every 100 hours or every six months, whichever comes first. Change it while the engine is warm, so that the oil runs out freely. The engine has a low-oil cut-out: if it stops and will not restart, check the oil before anything else.",
      },
      {
        heading: "Fuel",
        page: 3,
        text: "Use unleaded petrol only. The tank holds 15 litres, which runs the generator for about ten hours at half load. Never refuel while the engine is running or hot: stop it and wait fifteen minutes. Wipe up any spilt fuel before starting. Petrol goes stale in about three months; for storage longer than a month, add fuel stabiliser or run the carburettor dry by turning the fuel tap off and letting the engine stop by itself.",
      },
      {
        heading: "Where to run it",
        page: 4,
        text: "Never run the generator indoors, in a garage, in a porch or under an open window. The exhaust contains carbon monoxide, which has no smell and kills. Stand it outside, at least five metres from doors and windows, with the exhaust pointing away from the house. Keep it dry under the open-sided cover, never under a sheet. Fit the battery carbon monoxide alarm in the room nearest to it.",
      },
      {
        heading: "What it will run",
        page: 5,
        text: "The generator gives 2,000 watts continuously and 2,200 for a few seconds. That is enough for the freezer, the boiler pump and lights together, but not the kettle at the same time. A motor takes about three times its running power to start, so let the freezer start before adding anything else. Use the heavy orange extension lead and unroll it fully, or it overheats on the drum.",
      },
    ],
  },
  {
    id: "stove",
    kind: "document",
    title: "Wood stove manual",
    collection: "Equipment",
    sections: [
      {
        heading: "Clearances and hearth",
        page: 3,
        text: "The stove gives off most of its heat from the sides and the top, and anything that can burn must be kept away from it. Keep at least 400 mm between the sides of the stove and anything combustible, and at least 600 mm clear in front of the door. A wall of solid brick or stone with no timber in it may be as close as 100 mm, which is only there so that air can move behind the stove. The hearth must be of stone, tile or another material that cannot burn, and must reach at least 300 mm in front of the door and 150 mm to each side, so that an ember that falls when the door is opened lands on it and not on the floor. Furniture, log baskets, curtains and firelighters all count as combustible. So does washing: do not dry clothes closer than one metre to the stove, and never hang them over it. A beam above a fireplace opening needs its own protection, which the installer will advise on; this manual cannot say what a particular chimney breast needs. Keep the space between the stove and the wall clear of logs. Logs stacked against a hot stove dry out to the point where they can catch from heat alone, which is a common cause of house fires. Children should be kept back by a fixed guard, because the whole surface of the stove, the door handle included, is hot enough to burn within seconds.",
      },
      {
        heading: "Lighting",
        page: 5,
        text: "Open both air controls fully before lighting. The lower control lets primary air in under the fire, which kindling needs; the upper control lets secondary air in above the fire, which burns the smoke. Build the fire from the top down: lay two small logs on the bed of ash, stack kindling crosswise on them in three or four layers, and put one firelighter on the very top. Lit this way the fire burns downwards, the flue warms quickly and far less smoke is made than when paper is lit underneath. Leave the door ajar on the first catch for no more than five minutes while the kindling takes, and do not leave the room while it is ajar. Close the door when the kindling is burning strongly. After about fifteen minutes, when the logs are charred all over and burning without help, close the lower control completely and regulate the fire with the upper control alone. Wood burns from above and does not need air from beneath once it is alight; leaving the lower control open wastes wood and overheats the grate. Never use petrol, paraffin, lamp oil or barbecue fluid to light or revive the fire. Do not burn painted or treated wood, chipboard, plastics or household rubbish, which damage the flue and send poisons up it.",
      },
      {
        heading: "Refuelling and running",
        page: 6,
        text: "Add wood to a bed of glowing embers, not to tall flames. Open the upper air control fully for about a minute before opening the door, then open the door slowly: this draws the smoke up the flue, not into the room. Put on two or three logs at a time, none longer than 25 cm, and do not load the firebox higher than the top of the firebricks. Wood stacked above the firebricks blocks the secondary air holes in the back plate and burns against the baffle. When the new logs have caught, turn the upper control down again. The magnetic thermometer on the flue pipe is the best guide to running the stove well. Keep it between 120 °C and 250 °C. Below 120 °C the smoke is cool enough for tar to settle in the flue, which is how chimney fires begin; above 250 °C the stove is being over-fired, which warps the baffle and cracks the firebricks. Do not try to keep the stove in overnight by filling it and shutting the air down. A fire starved of air smoulders, makes very little heat and coats the flue with tar. It is better to let the fire burn out and to relight it in the morning from kindling, which takes five minutes.",
      },
      {
        heading: "Cleaning",
        page: 8,
        text: "Clean the glass when the stove is cold. Dampen a sheet of newspaper, dip it in the cold wood ash and rub the glass with it; the fine ash lifts the brown film without scratching. Wipe off with a dry sheet. Never use an abrasive pad, a blade or oven cleaner on the glass, and never throw water at glass that is hot. Glass that blackens within an hour of lighting is a sign of damp wood or of the air being shut down too soon, not of a fault in the stove. Leave a bed of ash about 2 cm deep when you empty the stove, since wood burns best on ash. Take out only what is above that. Lift out the baffle plate and brush it once a month during the burning season: soot that falls from the flue collects on top of it and narrows the way out for the smoke, and a stove that has begun to smoke into the room when the door is opened usually has a loaded baffle. Check the rope seal round the door at the start of each season by shutting the door on a strip of paper. If the paper pulls out easily anywhere round the door, the rope has gone hard and should be replaced, because a leaking door lets the fire run away.",
      },
      {
        heading: "Faults",
        page: 9,
        text: "Smoke comes into the room when the door is opened: the flue is cold, the baffle is loaded with soot, or the door was opened too fast. Warm the flue with kindling, brush the baffle and open the door slowly. The fire burns too fast and will not turn down: air is getting in round the door or the ash pan. Check both seals with a strip of paper. The fire is hard to light and dies when the door is closed: the wood is damp, or the flue is partly blocked; have it looked at before using the stove again. The stove roars and the flue pipe glows or rattles: this is a chimney fire. Close both air controls and the door, get everyone out of the house and call the fire brigade. Do not open the stove door and do not pour water into the stove. Afterwards, do not use the stove until the flue has been swept and inspected. A smell of hot paint in the first few fires of a new stove is the finish curing and is harmless; open a window for the first three firings.",
      },
    ],
  },
  {
    id: "supply",
    kind: "document",
    title: "Looking after a private water supply",
    collection: "Household",
    sections: [
      {
        heading: "What this guide is for",
        page: 1,
        text: "A private supply is a spring, well or borehole that is not run by a water company. Whoever owns it is responsible for the water being safe to drink, and the surest way to keep it safe is to understand the whole supply from the catchment to the tap and to look after every part of it, not to rely on a test of the water now and then. A test only says what was in one bottle on one day. This guide follows the water from where it falls as rain to where it is drunk, and at each stage asks what could make it unsafe and what stops that happening. Several barriers are better than one: a protected source, a covered tank and a working treatment unit each catch what the others miss. When a supply is known or suspected to be contaminated, for example after a flood or when treatment has failed, the people who drink it should be told at once to boil water for drinking, for cleaning teeth and for preparing food, until the fault has been put right and the water has been shown to be safe again. A notice to boil water should say plainly whom it applies to, what the water may still be used for without boiling, and when the advice will be looked at again. Boiled water should be kept covered and used within a day. Bottled water is an alternative while the notice is in force, particularly for making up feeds for babies.",
      },
      {
        heading: "The source",
        page: 2,
        text: "Most contamination gets in at the source. Animals are the commonest cause, so fence livestock out for at least ten metres round a spring or well head, and further on the uphill side. The top of a well or borehole should stand at least 30 cm above the ground, with a sound concrete apron sloping away from it, so that surface water runs off and not in. The cover must fit closely and be locked or bolted down. A spring should be enclosed in a chamber, with the water led away through a pipe; an open pool is not a safe source however clear it looks. Keep fuel, fertiliser, slurry and septic tanks well away from the source and downhill of it. Fertiliser and manure spread on the catchment can raise the nitrate in the water, which matters most for babies fed on formula; if the catchment is farmed, ask for nitrate to be included when the water is tested. Walk the whole catchment twice a year, in a dry spell and after heavy rain, and look for anything that has changed: a new track, a broken fence, a ditch that now drains towards the source.",
      },
      {
        heading: "The storage tank",
        page: 3,
        text: "The storage tank is where a clean supply most often becomes a dirty one. Look inside it every three months for silt, slime, insects and anything that has fallen in. Drain and clean the tank once a year: scrub the walls and floor, then fill it with a chlorine solution of 50 mg per litre, leave it for an hour, and flush the tank and the pipes until the smell of chlorine has gone. The lid must fit tightly and overlap the rim, so that rain running off it falls outside the tank. Fit fine mesh over the overflow and the vent to keep out insects, mice and birds. The tank must be dark inside, because light grows algae. A tank in a loft should stand on a board that supports the whole of its base and should be lagged at the sides but not underneath, so that warmth from the house keeps it from freezing.",
      },
      {
        heading: "Treatment",
        page: 4,
        text: "Treatment is the last barrier, not the only one, and each kind has its limits. An ultraviolet unit kills bacteria and viruses as the water flows past the lamp, and adds nothing to the water. It works only in clear water, so a filter of 5 microns must come before it. Replace the lamp every twelve months even if it still lights, because its output falls long before it fails, and clean the quartz sleeve round the lamp every three months. Where chlorine is dosed instead, the aim is a free chlorine level of between 0.2 and 0.5 mg per litre at the furthest tap. Test for it every week with the tablet kit and write the result down. Less than 0.2 mg per litre means that the chlorine is being used up on the way, usually by dirt in the tank or the pipes, and is a reason to look for the cause, not simply to add more. A jug filter with a carbon cartridge improves the taste and removes some chemicals; it does not make unsafe water safe.",
      },
      {
        heading: "Testing and records",
        page: 5,
        text: "Have the water tested by a laboratory whenever its taste, colour or smell changes, after a flood, and after any work on the source, the tank or the pipes. Take the sample from the kitchen cold tap after letting it run for two minutes, in the sterile bottle the laboratory sends, and return it the same day in a cool bag. The usual test looks for the bacteria that show that sewage or animal droppings have reached the water; none should be found in 100 ml. Keep a log of every inspection, cleaning, lamp change and test result, with the date and who did it. A log makes it possible to see a slow change that no single reading shows, and it is the first thing asked for when something goes wrong or the house is sold.",
      },
    ],
  },
  {
    id: "pantry",
    kind: "document",
    title: "Pantry and preserving",
    collection: "Food preservation",
    sections: [
      {
        heading: "Rice and dry goods",
        page: 1,
        text: "White rice keeps for ten years or more when it is sealed with oxygen absorbers in a cool, dark place. Brown rice keeps only about six months, because the oil in the bran goes rancid. Cook white rice with one cup of rice to two cups of water. Flour keeps for a year in a sealed tub; wholemeal flour for three months. Freeze new bags of flour and rice for four days before storing them, to kill any insect eggs.",
      },
      {
        heading: "Dried beans",
        page: 2,
        text: "Soak dried beans overnight in plenty of cold water, then throw the soaking water away. Red kidney beans must be boiled hard for ten minutes before they are simmered, to destroy a natural toxin that causes severe sickness. A slow cooker does not get hot enough to do this, so boil them on the stove first. After the hard boil, simmer for about an hour until soft. Old beans take longer and some never soften; write the year on the jar.",
      },
      {
        heading: "Jam",
        page: 3,
        text: "Use equal weights of fruit and sugar for most jams. Boil hard until the jam reaches 105 °C, or until a drop wrinkles when pushed on a cold saucer. Pot it into jars warmed in the oven, fill to within half a centimetre of the top and put the lids on at once. Jam made this way keeps for a year unopened in a cool cupboard. Mould on the top means the jar was not filled hot or not sealed; do not scrape it off and eat the rest.",
      },
      {
        heading: "Rotation",
        page: 4,
        text: "Put new stock at the back and use from the front. Go through the shelves on the first weekend of March and September. Throw out any tin that bulges, leaks, spurts when opened or is rusted along the seam. A date on a tin is about quality, not safety, but home-bottled food more than a year old should be used first or thrown away.",
      },
    ],
  },
  {
    id: "garden",
    kind: "note",
    title: "Garden year",
    collection: null,
    sections: [
      {
        heading: "Potatoes",
        text: "Set seed potatoes to sprout in egg boxes on a cool windowsill from late January. Plant first earlies in the middle of March, 30 cm apart in rows 60 cm apart, with the shoots upwards. Draw soil up round the stems when the shoots are 20 cm tall, and again three weeks later. First earlies are ready about twelve weeks after planting, when the flowers open. Do not grow potatoes in the same bed more than one year in four.",
      },
      {
        heading: "Garlic",
        text: "Plant garlic in October. Split the bulb, and push each clove in pointed end up, 3 cm deep and 15 cm apart. It needs a cold spell to form a bulb, which is why autumn planting does best. Stop watering in June. Lift the bulbs in July when the lower leaves have turned yellow, and dry them under cover for two weeks before plaiting.",
      },
      {
        heading: "Compost",
        text: "Build the heap from two parts brown material, such as dry leaves, straw and torn cardboard, to one part green, such as grass cuttings and kitchen peelings. Turn it every four weeks. A heap that smells sour is too wet and too green: add cardboard and turn it. Leave out cooked food, meat and bread, which bring rats.",
      },
      {
        heading: "Water in the garden",
        text: "The water butt by the shed holds 200 litres and fills from the shed roof. Water in the evening, at the roots, and give a good soak twice a week, not a sprinkle every day. In a drought, use washing-up water on shrubs and flowers only, never on salad or anything eaten raw. Rain water from the butt is for the garden and is not for drinking unless it has been treated.",
      },
    ],
  },
  {
    id: "knots",
    kind: "note",
    title: "Knots I use",
    collection: null,
    sections: [
      {
        heading: "Loops",
        text: "The bowline makes a fixed loop at the end of a rope. It does not slip or jam, and it is easy to untie after it has carried a heavy load. Leave a tail as long as your hand. The figure-of-eight loop is bulkier and harder to untie, but it is easier to check by eye, which is why climbers use it.",
      },
      {
        heading: "Hitches",
        text: "The clove hitch ties a rope to a post quickly and can be adjusted without untying, but it slips if the pull keeps changing direction. The round turn and two half hitches holds under a changing pull and can be untied under load. The trucker's hitch gives a three-to-one pull for tightening a load on a trailer or a ridge line for the tarp.",
      },
      {
        heading: "Joining ropes",
        text: "The sheet bend joins two ropes of different thickness; make the bight in the thicker rope. Use a double sheet bend when one rope is much thinner or the ropes are wet. The reef knot is for tying a bandage or a bundle and should never be used to join two ropes that will carry weight.",
      },
    ],
  },
  {
    id: "house",
    kind: "note",
    title: "House systems",
    collection: null,
    sections: [
      {
        heading: "Water",
        text: "The main stopcock is under the kitchen sink, behind the left-hand door. Turn it clockwise to close it. The outside stop tap is under the square metal cover by the gate and needs the long key that hangs in the shed. If a pipe bursts, close the stopcock, open the cold taps to drain the pipes, and switch the boiler off.",
      },
      {
        heading: "Electricity",
        text: "The fuse box is in the cupboard under the stairs. The freezer is on circuit 7 and the boiler on circuit 4; both are marked with red tape. The torch on the hook inside the cupboard door stays there. If a breaker trips again as soon as it is reset, unplug everything on that circuit and try once more before calling anyone.",
      },
      {
        heading: "Boiler",
        text: "The boiler pressure gauge should read between 1 and 1.5 bar when the heating is cold. If it has dropped below 1, open the filling loop under the boiler slowly until the needle reaches 1.2, then close both valves fully. If the pressure climbs above 2.5 bar when hot, call the engineer. The boiler is serviced every October.",
      },
      {
        heading: "Wood stove",
        text: "Burn only wood that has dried to below 20 per cent moisture; check a split log with the meter in the kindling basket. Have the chimney swept every September. Empty the ash into the metal bucket and leave it outside for two days before it goes on the garden. The carbon monoxide alarm on the bookshelf is tested with the smoke alarms on the first Sunday of each month.",
      },
    ],
  },
  {
    id: "plan",
    kind: "document",
    title: "Emergency plan",
    collection: "Household",
    sections: [
      {
        heading: "Meeting points",
        page: 1,
        text: "If we cannot get into the house, the first meeting point is the oak tree at the end of the lane. If the lane itself cannot be reached, the second meeting point is the car park of the village hall. Wait for one hour at a meeting point, then leave a note in the tin under the bench and go on to the next. Children at school stay at school until one of us comes.",
      },
      {
        heading: "Who to call",
        page: 2,
        text: "Our out-of-area contact is Aunt Morag in Inverness. If we are separated and cannot reach each other, each of us rings her and says where we are; a call out of the area often gets through when local calls do not. Her number is on the card in every go bag and inside the radio box. Send a text rather than calling when the network is busy.",
      },
      {
        heading: "Go bags",
        page: 3,
        text: "There is a go bag for each person in the hall cupboard. Each holds two litres of water, food for a day, a head torch, a whistle, a foil blanket, copies of our papers in a sealed bag, twenty pounds in coins and small notes, and the contact card. Check the bags on the first weekend of March and September, with the pantry.",
      },
      {
        heading: "Power cuts",
        page: 4,
        text: "Keep the freezer shut. A full freezer stays frozen for about 48 hours with the door closed, and a half-full one for about 24 hours. The fridge stays cold for four hours. If the cut lasts longer than a day, run the generator for the freezer for two hours morning and evening. Switch off the cooker and the iron at the wall, so that nothing comes on unattended when the power returns.",
      },
    ],
  },
  {
    id: "bicycle",
    kind: "note",
    title: "Bicycle maintenance",
    collection: null,
    sections: [
      {
        heading: "Tyres",
        text: "The touring bike's 37 mm tyres run at 4 bar in the front and 4.5 bar in the rear, a little more with full panniers. Check them every week, since a soft tyre punctures on the rim. The trailer's tyres take 2.5 bar. Carry two spare tubes, the three levers and the small pump; the patches are for the evening, not the roadside.",
      },
      {
        heading: "Chain",
        text: "Wipe the chain and oil it after every wet ride, one drop on each roller, then wipe off what is left on the outside. Replace the chain when the checker shows 0.75 per cent wear. A chain changed in time saves the sprockets; a worn one left on wears them to fit, and then a new chain skips.",
      },
      {
        heading: "Brakes",
        text: "Replace the brake pads when the grooves have gone or less than a millimetre of pad is left. Squealing usually means the pads are dirty or not toed in. After fitting new pads, brake hard ten times from walking pace to bed them in before trusting them on a hill.",
      },
    ],
  },
  {
    id: "hens",
    kind: "note",
    title: "Keeping hens",
    collection: null,
    sections: [
      {
        heading: "Feeding",
        text: "A laying hen eats about 120 grams of layers pellets a day. Give grain only as a handful in the afternoon, or they fill up on it and lay less. They need grit for the gizzard and crushed oyster shell for the egg shells, in a pot of their own. Fresh water every day: six hens drink about two litres in hot weather.",
      },
      {
        heading: "Housing",
        text: "Allow 30 cm of perch for each bird and one nest box for every three hens. Shut the pop-hole at dusk and open it at first light. Keep dogs away from the run, even friendly ones, since a chase can kill a hen by fright alone. Clean the droppings board weekly and the whole house once a month.",
      },
      {
        heading: "Red mite",
        text: "Look for red mite every week in summer: grey dust at the perch ends, and pale combs. The mites live in the cracks of the house and feed at night. Scrub the perches, dust the cracks with diatomaceous earth and repeat after five days to catch the ones that hatch.",
      },
    ],
  },
  {
    id: "navigation",
    kind: "document",
    title: "Navigation notes",
    collection: "Outdoors",
    sections: [
      {
        heading: "Grid references",
        page: 1,
        text: "Read the eastings before the northings: along the corridor, then up the stairs. A four-figure reference names a one-kilometre square. A six-figure reference fixes a point to within 100 metres, by estimating tenths of the square. Always give the two letters of the 100 km square first when passing a reference by radio.",
      },
      {
        heading: "Bearings",
        page: 2,
        text: "Magnetic north here lies about one degree west of grid north in 2026, and the difference shrinks a little each year. To walk on a bearing taken from the map, add the variation: grid to mag, add. To plot a compass bearing on the map, subtract it. With so small a variation the correction matters only over several kilometres, but make it anyway so that the habit is there when you travel.",
      },
      {
        heading: "Timing and pacing",
        page: 3,
        text: "Naismith's rule: allow one hour for every 5 km on the map, plus one minute for every 10 metres of climb. Add a quarter for a heavy pack or rough ground. Count double paces to measure distance in mist: I take 64 double paces to 100 metres on the flat, and about 80 uphill. Check your own count on a measured stretch before you rely on it.",
      },
    ],
  },
  {
    id: "solar",
    kind: "document",
    title: "Solar panel and battery",
    collection: "Equipment",
    sections: [
      {
        heading: "What the panel gives",
        page: 1,
        text: "The 100 watt panel gives about 300 watt-hours on a clear summer day and about 60 watt-hours on a day in December. Tilt it to face south at about 35 degrees in summer and 60 degrees in winter. A shadow across one corner cuts the output by far more than its share, so move the panel, not the shadow.",
      },
      {
        heading: "The battery",
        page: 2,
        text: "The battery is a 100 amp-hour lithium iron phosphate type. Do not charge it when it is colder than 0 °C: charging below freezing damages the cells for good, although it can still be used to run things down to minus 20 °C. Bring it indoors in a frost, or wait until it has warmed up. Store it half charged if it will not be used for a month or more.",
      },
      {
        heading: "What it will run",
        page: 3,
        text: "The inverter gives 300 watts, which runs the radio, the lights, the laptop and the phone chargers. The camping fridge draws 45 watts while its motor runs, about a third of the time. Do not plug the kettle, the toaster or any heater into the inverter. A full battery runs the fridge alone for about three days without sun.",
      },
    ],
  },
];
