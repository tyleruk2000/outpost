/**
 * Water and food for a walk, as ranges from published figures: water from the UK Ministry
 * of Defence's hydration guidance, energy from the Compendium of Physical Activities.
 */
import {
  allValues,
  Calculator,
  ChoiceField,
  Formula,
  formatFigure,
  formatRange,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  u,
  useChoice,
  useNumber,
} from "../kit";
import { kcalFromMet } from "./formulas";
import { OUTDOOR_SOURCES as S } from "./sources";

/**
 * The UK MoD's maximum recommended fluid intake, litres an hour, by work rate, across its
 * bands of wet bulb globe temperature from 20 °C to 34 °C and over (JSP 375, annex F,
 * table 1). The low end is the coolest band, the high end the hottest.
 */
export const MOD_WATER = {
  easy: { label: "Easy", low: 0.25, high: 1.0 },
  moderate: { label: "Moderate", low: 0.5, high: 1.25 },
  hard: { label: "Hard", low: 0.75, high: 1.25 },
  veryHard: { label: "Very hard", low: 1.0, high: 1.25 },
} as const;

/** MET values of the 2024 Adult Compendium for kinds of walking, by code. Each kind is a range over the codes listed. */
export const WALK_KINDS = {
  stroll: { label: "Easy walking on hills, no load", mets: [3.8, 5.3], codes: "17081, 17082" },
  hike: { label: "Hiking cross-country or with a day pack", mets: [6.0, 7.8], codes: "17080, 17012" },
  backpack: { label: "Backpacking, or climbing hills with a load", mets: [7.0, 10.0], codes: "17010, 17050, 17060" },
} as const;

type WorkRate = keyof typeof MOD_WATER;
type WalkKind = keyof typeof WALK_KINDS;

const RATE_OPTIONS = (Object.keys(MOD_WATER) as WorkRate[]).map((value) => ({
  value,
  label: MOD_WATER[value].label,
  description: `${formatFigure(MOD_WATER[value].low, { decimals: 2 })} to ${formatFigure(MOD_WATER[value].high, { decimals: 2 })} litres an hour`,
}));
const KIND_OPTIONS = (Object.keys(WALK_KINDS) as WalkKind[]).map((value) => ({
  value,
  label: WALK_KINDS[value].label,
  description: `${WALK_KINDS[value].mets[0]} to ${WALK_KINDS[value].mets[1]} METs`,
}));

const hikeHours: NumberSpec = { id: "outdoors.hike.hours", label: "Hours walking", initial: 6, suffix: "hours", above: 0, max: 24 };
const hikeMass: NumberSpec = {
  id: "outdoors.hike.mass",
  label: "Your weight",
  initial: 75,
  units: u.units.bodyMass,
  above: 0,
  max: 300,
  hint: "Without the pack.",
};

export function HikingCalculator() {
  const hours = useNumber(hikeHours);
  const mass = useNumber(hikeMass);
  const [rate, setRate] = useChoice<WorkRate>("outdoors.hike.rate", RATE_OPTIONS, "moderate");
  const [kind, setKind] = useChoice<WalkKind>("outdoors.hike.kind", KIND_OPTIONS, "hike");
  const values = allValues(hours, mass);
  const water = values ? { low: MOD_WATER[rate].low * values[0], high: MOD_WATER[rate].high * values[0] } : null;
  const mets = WALK_KINDS[kind].mets;
  const energy = values ? { low: kcalFromMet(mets[0], values[1], values[0]), high: kcalFromMet(mets[1], values[1], values[0]) } : null;
  const waterText = water ? formatRange(water.low, water.high, "litres", { decimals: 1 }) : "";
  const energyText = energy ? formatRange(energy.low, energy.high, "kcal", { significant: 2, decimals: 0 }) : "";
  return (
    <Calculator
      id="hiking"
      title="Water and food for a walk"
      intro="Ranges from published figures, not a prescription: how much water to carry for warm or hot conditions, and the energy a day's walking uses."
    >
      <Inputs>
        <NumberField input={hours} />
        <NumberField input={mass} />
        <ChoiceField
          label="How hard the work is"
          value={rate}
          onChange={setRate}
          options={RATE_OPTIONS}
          hint="The MoD counts patrolling with a heavy load as hard."
        />
        <ChoiceField label="Kind of walking" value={kind} onChange={setKind} options={KIND_OPTIONS} />
      </Inputs>
      <Result
        label="Water, in warm or hot weather"
        figure={water ? waterText : null}
        keep={
          water && energy
            ? {
                title: `Water and food for ${formatFigure(values![0])} ${values![0] === 1 ? "hour" : "hours"} of walking`,
                lines: [
                  `Water in warm or hot weather: ${waterText} (UK MoD maximum provision; no more than 1.25 litres an hour)`,
                  `Energy used: ${energyText}`,
                ],
              }
            : undefined
        }
      >
        {water && energy ? (
          <>
            <p>
              The low end is for the coolest of the MoD's bands, the high end for the hottest. These are maximums to provide, not to force
              down: the MoD says the hourly rate “should not normally exceed 1.25 litres per hour”, and the US National Park Service at the
              Grand Canyon says “Drink When You Are Thirsty, and Rest and Eat Often”.
            </p>
            <p className="mt-2">
              Energy used: <span className="font-semibold tabular">{energyText}</span>, before what the body uses anyway at rest overnight.
            </p>
          </>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>water = hours × the MoD's litres an hour for the work rate (lowest to highest heat band)</Formula>
            <Formula>energy (kcal) = MET × weight in kg × hours</Formula>
            <p>
              MoD table 1, maximum recommended fluid intake in litres an hour, for wet bulb globe temperatures from 20 °C to 34 °C and over:
              easy 0.25 to 1.0, moderate 0.5 to 1.25, hard 0.75 to 1.25, very hard 1.0 to 1.25. The Compendium's METs for the kinds of
              walking above (codes {WALK_KINDS[kind].codes}): {mets[0]} to {mets[1]}. One MET is taken as 1 kcal per kilogram per hour, the
              usual approximation of resting energy use.
            </p>
          </>
        }
        range="Water: warm and hot conditions, the range the MoD's table covers (wet bulb globe temperature 20 °C and above). In cool weather, less."
        limits="Wet bulb globe temperature is a heat-stress measure taken with special instruments, not the air temperature in a forecast; the sun, wind, your own sweat rate, altitude and illness all change what you need. Energy figures are averages for groups of people."
        sources={[S.modHydration, S.npsGrandCanyon, S.compendium]}
      />
    </Calculator>
  );
}
