/**
 * What the almanac tells about each crop: its family, how it takes the cold, how much
 * water it wants, and a few things worth knowing. Every line is a fact from the Royal
 * Horticultural Society's grow-your-own page for the crop (and its crop rotation page),
 * read on 17 November 2026 and put in Outpost's own words; nothing here is copied prose.
 * The months are in `numbers.ts`. docs/games.md lists the pages.
 */
import type { CropId } from "./numbers.ts";

/** The crop rotation groups the RHS uses, and the crops that can go anywhere. */
export const FAMILY_IDS = ["brassicas", "legumes", "onions", "potatoes", "roots", "anywhere"] as const;
export type FamilyId = (typeof FAMILY_IDS)[number];

export const FAMILIES: Record<FamilyId, { name: string; about: string }> = {
  brassicas: {
    name: "Brassicas, the cabbage family",
    about:
      "With cabbages, kale, sprouts, swedes and turnips. Moving them each year helps keep clubroot, a disease of the family, from building up.",
  },
  legumes: {
    name: "Legumes, the pea and bean family",
    about:
      "Their roots take nitrogen from the air and hold it in the soil, so leaving the roots in the ground after the harvest feeds the next crop.",
  },
  onions: {
    name: "The onion family",
    about: "With garlic, shallots and leeks. Moving them each year helps against onion white rot.",
  },
  potatoes: {
    name: "The potato family",
    about: "With tomatoes. In a rotation potatoes follow the brassicas, and their thick leaves smother weeds for the crop after.",
  },
  roots: {
    name: "Root crops",
    about: "With parsnips, celeriac and parsley. They share a part of the plot with the onions and legumes in a three-year rotation.",
  },
  anywhere: {
    name: "Fits in anywhere",
    about:
      "Salads and the squash family are not in the usual rotation: grow them wherever there is room, just not in the same place too often.",
  },
};

/** Why rotating matters, in one sentence, for the family line on each card. */
export const ROTATION_WHY =
  "Pests and diseases in the soil tend to attack one family again and again, so moving each family to a fresh bed every year lets them die down while it is away.";

export interface CropNotes {
  family: FamilyId;
  /** How it takes the cold, in a few words: "Hardy", "Tender: frost kills it". */
  cold: string;
  /** How much water it wants, in a sentence. */
  water: string;
  /** One or two things worth knowing, shown once the crop has been grown on the plot. */
  facts: readonly string[];
  /** The RHS page the months and facts come from. */
  source: string;
}

const rhs = (path: string) => `https://www.rhs.org.uk/vegetables/${path}/grow-your-own`;

export const CROP_NOTES: Record<CropId, CropNotes> = {
  radishes: {
    family: "brassicas",
    cold: "A cool-weather crop: best in spring and late summer",
    water: "A lot. Keep the soil evenly moist, or the roots stay small or split.",
    facts: [
      "Radishes are in the cabbage family, though they look nothing like a cabbage.",
      "Sown in hot, dry weather they tend to flower early (bolt), and then the root does not swell.",
    ],
    source: rhs("radishes"),
  },
  salad: {
    family: "anywhere",
    cold: "Hardy kinds will stand the winter under a cloche or glass",
    water: "Often. Young plants dry out fast and may need water every day in summer.",
    facts: [
      "Sow a little every few weeks, so that a fresh batch is ready as the last one is finished.",
      "Water in the morning if you can: damp soil overnight brings slugs and snails.",
    ],
    source: rhs("salad-leaves"),
  },
  onions: {
    family: "onions",
    cold: "Hardy: overwintering sets go in during autumn",
    water: "Only in long dry spells, mostly while the roots are forming. Stop once the bulbs have swollen in midsummer.",
    facts: [
      "Most onions are grown from sets: small, half-grown bulbs that are pushed into the soil.",
      "Onions keep for months, so a big harvest does not all have to be eaten at once.",
    ],
    source: rhs("onions"),
  },
  peas: {
    family: "legumes",
    cold: "Will not come up in very cold soil: wait for about 10°C",
    water: "Little once growing, except in dry spells. A good soak when they flower, and again two weeks later, swells the pods.",
    facts: [
      "Peas are legumes: their roots fix nitrogen from the air, so leave the roots in the ground to feed the soil.",
      "Picking the pods often makes the plants form more.",
    ],
    source: rhs("peas"),
  },
  carrots: {
    family: "roots",
    cold: "Can be left in the ground into winter, under straw",
    water: "Little: carrots stand dry weather. In a long dry spell, a good soak every fortnight.",
    facts: [
      "Carrot fly finds carrots by smell, so touch the leaves as little as you can when weeding; fine mesh keeps the flies off.",
      "Roots split when the soil swings between dry and wet.",
    ],
    source: rhs("carrots"),
  },
  beetroot: {
    family: "roots",
    cold: "Early sowings want fleece or a cloche",
    water: "Some. Fairly moist soil makes tender roots, but too much water makes leaves instead of roots.",
    facts: [
      "A beetroot 'seed' is a little cluster of seeds, which is why they come up in groups.",
      "Darker roots usually taste earthier; paler ones milder and sweeter.",
    ],
    source: rhs("beetroot"),
  },
  kale: {
    family: "brassicas",
    cold: "One of the hardiest leafy vegetables",
    water: "Young plants regularly; after that, only in long dry spells.",
    facts: [
      "Kale gives fresh leaves through the coldest months, when little else on the plot does.",
      "Picking the leaves often makes the plant grow more.",
    ],
    source: rhs("kale"),
  },
  broadBeans: {
    family: "legumes",
    cold: "Hardy kinds can be sown in autumn and stand the winter",
    water: "Seldom in the ground, but a good soak as they flower, and again two weeks later, gives a much bigger harvest.",
    facts: [
      "Like peas, broad beans are legumes: their roots add nitrogen to the soil.",
      "Sown in late autumn in a mild, sheltered spot, they can be ready as early as May.",
    ],
    source: rhs("broad-beans"),
  },
  potatoes: {
    family: "potatoes",
    cold: "Tender: frost harms the young shoots",
    water: "In dry weather, for a good crop.",
    facts: [
      "As they grow, soil is drawn up round the stems (earthing up). It keeps frost off the early shoots and light off the tubers, which turn green and poisonous in the light.",
      "Early potatoes are the small new potatoes of midsummer; maincrops stay in longer and keep through the winter.",
    ],
    source: rhs("potatoes"),
  },
  leeks: {
    family: "onions",
    cold: "Hardy: winter kinds stand the hardest weather",
    water: "While they are young; after that, only in long dry spells.",
    facts: [
      "Leeks need not be lifted all at once: they wait in the ground until they are wanted, all winter.",
      "Soil drawn up round the stems keeps them white (blanched).",
    ],
    source: rhs("leeks"),
  },
  garlic: {
    family: "onions",
    cold: "Hardy, and needs the cold",
    water: "Only in dry spells in spring and early summer.",
    facts: [
      "Garlic is grown from cloves, the segments of a bulb, not from seed.",
      "It needs a spell of cold to make a good bulb, which is why it is planted in autumn.",
    ],
    source: rhs("garlic"),
  },
  squash: {
    family: "anywhere",
    cold: "Tender: planted out only after the last frost",
    water: "A lot, above all once the fruits are forming. Water the soil, not the leaves.",
    facts: ["Winter squashes are left to ripen fully, then kept to eat through the winter.", "Their big leaves shade out weeds."],
    source: rhs("squash"),
  },
};

/** The RHS pages behind the families and the rotation. */
export const ROTATION_SOURCE = "https://www.rhs.org.uk/vegetables/crop-rotation";
export const SOURCE_READ_ON = "17 November 2026";
