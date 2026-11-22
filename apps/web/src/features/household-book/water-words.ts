/**
 * Clearing cloudy water and catching rain, for the book's water section and the drawings
 * beside them, quoted unchanged and read on 22 November 2026.
 *
 * - The CDC's "How to Make Water Safe in an Emergency" (page dated 19 September 2024):
 *   a US federal work, in the public domain (https://www.cdc.gov/other/agencymaterials.html);
 *   the CDC asks to be named and not to be shown as endorsing the use.
 * - US Army Field Manual 21-76, "Survival" (Headquarters, Department of the Army, 1992),
 *   chapter 6: a US federal work, which has no copyright (17 U.S.C. 105). Read from a
 *   reprint, as no official copy could be opened; superseded since by FM 3-05.70 and ATP
 *   3-50.21. docs/sources.md says what is still to check against an official copy.
 */

export const CDC_SAFE_WATER = {
  name: "US Centers for Disease Control and Prevention, “How to Make Water Safe in an Emergency” (19 September 2024)",
  short: "CDC",
  url: "https://www.cdc.gov/water-emergency/about/index.html",
  read: "22 November 2026",
  cloudy: [
    "If the water is cloudy, first filter it through a clean cloth, paper towel, or coffee filter.",
    "Another option is to let it settle.",
    "Then, draw off the clear water and follow the steps below.",
  ],
} as const;

export const FM_21_76 = {
  name: "US Army Field Manual 21-76, “Survival” (1992), chapter 6, “Water procurement”",
  short: "US Army FM 21-76",
  url: "https://www.sjsu.edu/people/michelle.hager/docs/fm_21-76_us_army_survival_manual_2006.pdf",
  read: "22 November 2026",
  filter: [
    "To make a filtering system, place several centimeters or layers of filtering material such as sand, crushed rock, charcoal, or cloth in bamboo, a hollow log, or an article of clothing (Figure 6-9).",
    "Note: These procedures only clear the water and make it more palatable. You will have to purify it.",
  ],
  rain: "Catch rain in tarps or in other water-holding material or containers.",
} as const;
