/**
 * Food-safety figures, quoted word for word from the UK's food-safety bodies, read
 * 2026-11-16. The US Department of Agriculture's pages refused every request made to
 * them that day, so no USDA figure is used: nothing here was copied from memory.
 */
import type { Source } from "../kit";

const READ = "2026-11-16";

export const COOKING_SOURCES = {
  fsaCooking: {
    name: "Food Standards Agency, “Cooking your food” (published 18 December 2017)",
    url: "https://www.gov.uk/government/publications/cooking-your-food/cooking-your-food",
    read: READ,
  },
  fsaChristmas: {
    name: "Food Standards Agency, “Christmas food hygiene” (published 11 January 2018)",
    url: "https://www.gov.uk/government/publications/christmas-food-hygiene/christmas-food-hygiene",
    read: READ,
  },
  fss: {
    name: "Food Standards Scotland, “Turkey cooking guide”",
    url: "https://www.foodstandards.gov.scot/consumer-advice/food-safety/food-safety-in-the-kitchen/parties-and-events/christmas-food-safety/turkey-cooking-guide",
    read: READ,
  },
  which: {
    name: "Which?, “Oven temperature conversion table”",
    url: "https://www.which.co.uk/reviews/built-in-ovens/article/oven-temperature-conversion-table-aA5Ol9b157On",
    read: READ,
  },
  cdcYellowBook: {
    name: "CDC Yellow Book, “Water Disinfection” (last updated 23 April 2025): water boils at about 83 °C at about 4,900 m",
    url: "https://www.cdc.gov/yellow-book/hcp/preparing-international-travelers/water-disinfection-for-travelers.html",
    read: READ,
  },
  isa: { name: "ISO 2533, the International Standard Atmosphere (pressure with height)" },
  nist: {
    name: "NIST Chemistry WebBook, water: Antoine equation parameters (Stull, 1947), 344 to 373 K",
    url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=4",
  },
  units: { name: "The legal definitions of the units (Weights and Measures Act 1985; NIST Handbook 44)" },
} satisfies Record<string, Source>;

/** The FSA's time and temperature combinations for the middle of the food, as published. */
export const FSA_TIME_TEMPERATURE = [
  { celsius: 60, time: "45 minutes" },
  { celsius: 65, time: "10 minutes" },
  { celsius: 70, time: "2 minutes" },
  { celsius: 75, time: "30 seconds" },
  { celsius: 80, time: "6 seconds" },
] as const;

export const FSA_RULE =
  "To ensure that food is fully cooked, the middle of the food should reach a temperature of 70°C for 2 minutes or the following temperature-time combinations:";

/** What the FSA and FSS say about checking food, word for word. */
export const SAFETY_QUOTES: readonly { text: string; who: string }[] = [
  {
    text: "check if the food is steaming - you should see steam rising from the surface of the food, as well as in the middle of the food when it is cut into",
    who: "FSA",
  },
  { text: "Poultry (such as chicken, turkey, duck, and game birds) and pork can have bacteria all the way through the meat.", who: "FSA" },
  { text: "make sure there is no pink, fleshy meat, as this is a sign it is undercooked", who: "FSA" },
  { text: "the juices should run clear", who: "FSA" },
  {
    text: "mincemeat (any type) / burgers / sausages / kebabs / rolled joints / kidney, liver, and other types of offal … These meats need to be cooked all the way through.",
    who: "FSA",
  },
  { text: "Burgers shouldn't be served rare or pink at home.", who: "FSA" },
  {
    text: "Whole cuts of meat, such as steaks and joints (except poultry and pork), only ever have bacteria on the outside surface of the meat. These can be served pink in the middle according to taste",
    who: "FSA",
  },
  { text: "When food is at a temperature of between 8 - 63°C, this is called The Danger Zone.", who: "FSA" },
  { text: "it is important that food is cooked to steaming hot throughout", who: "FSA, on reheating" },
  { text: "you should only ever reheat once.", who: "FSA" },
  { text: "Check the thickest part of the bird (between the breast and the thigh) reaches 75°C or above", who: "FSS" },
];

/** The FSS line that says a roasting time is only a guide. */
export const TIME_IS_A_GUIDE = {
  text: "The cooking guidelines above are only estimates, so you should always check that the bird is properly cooked before serving.",
  who: "Food Standards Scotland",
};

export type Bird = "turkey" | "chicken" | "goose" | "duck";

export interface RoastGuide {
  bird: Bird;
  label: string;
  /** The oven as the FSA gives it. */
  oven: string;
  /** The FSA's words for the time, for the weight band that applies. */
  rule: string;
  minutes: number;
}

/**
 * The FSA's roasting time for a bird of a weight, for when the retailer gives none:
 * “If there are no cooking instructions, in an oven preheated to 180ºC (160ºC fan,
 * 350ºF or Gas Mark 4)” for turkey and chicken; goose and duck at 200ºC.
 */
export function roastGuide(bird: Bird, kg: number): RoastGuide {
  switch (bird) {
    case "turkey":
      if (kg < 4.5)
        return {
          bird,
          label: "Turkey",
          oven: "180ºC (160ºC fan, 350ºF or Gas Mark 4)",
          rule: "allow 45 minutes per kg plus 20 minutes for a turkey that weighs under 4.5kg",
          minutes: 45 * kg + 20,
        };
      if (kg <= 6.5)
        return {
          bird,
          label: "Turkey",
          oven: "180ºC (160ºC fan, 350ºF or Gas Mark 4)",
          rule: "allow 40 minutes per kg for a turkey that weighs between 4.5kg and 6.5kg",
          minutes: 40 * kg,
        };
      return {
        bird,
        label: "Turkey",
        oven: "180ºC (160ºC fan, 350ºF or Gas Mark 4)",
        rule: "allow 35 minutes per kg for a turkey that weighs over 6.5kg",
        minutes: 35 * kg,
      };
    case "chicken":
      return {
        bird,
        label: "Chicken",
        oven: "180ºC (160ºC fan, 350ºF or Gas Mark 4)",
        rule: "45 minutes per kg plus 20 minutes",
        minutes: 45 * kg + 20,
      };
    case "goose":
      return { bird, label: "Goose", oven: "200ºC (180 ºC fan, 400ºF or Gas Mark 6)", rule: "35 minutes per kg", minutes: 35 * kg };
    case "duck":
      return { bird, label: "Duck", oven: "200ºC (180 ºC fan, 400ºF or Gas Mark 6)", rule: "45 minutes per kg", minutes: 45 * kg };
  }
}

/** Oven temperatures by gas mark, as Which? tables them. */
export const GAS_MARKS = [
  { mark: 1, fahrenheit: 275, celsius: 140, fan: 120, words: "Cool" },
  { mark: 2, fahrenheit: 300, celsius: 150, fan: 130, words: "Cool" },
  { mark: 3, fahrenheit: 325, celsius: 160, fan: 140, words: "Moderate" },
  { mark: 4, fahrenheit: 350, celsius: 180, fan: 160, words: "Moderate" },
  { mark: 5, fahrenheit: 375, celsius: 190, fan: 170, words: "Moderately hot" },
  { mark: 6, fahrenheit: 400, celsius: 200, fan: 180, words: "Moderately hot" },
  { mark: 7, fahrenheit: 425, celsius: 220, fan: 200, words: "Hot" },
  { mark: 8, fahrenheit: 450, celsius: 230, fan: 210, words: "Hot" },
  { mark: 9, fahrenheit: 475, celsius: 240, fan: 220, words: "Very hot" },
] as const;

/** The gas mark nearest a conventional oven temperature in °C, and how far off it is. Null outside the table's span. */
export function nearestGasMark(celsius: number): (typeof GAS_MARKS)[number] | null {
  if (celsius < 130 || celsius > 250) return null;
  return GAS_MARKS.reduce((best, row) => (Math.abs(row.celsius - celsius) < Math.abs(best.celsius - celsius) ? row : best));
}
