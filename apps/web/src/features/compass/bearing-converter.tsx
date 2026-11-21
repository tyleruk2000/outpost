/** A bearing from one north, from each of the others, at the place chosen at the top of the screen. */
import { convertBearing, type North, type Norths } from "@outpost/shared";
import {
  Calculator,
  ChoiceField,
  Formula,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  useChoice,
  useNumber,
} from "../tools/kit";
import { threeFigures } from "./live-compass";
import { MapToCompass } from "./norths-plates";
import { COMPASS_SOURCES as S } from "./sources";

const bearingSpec: NumberSpec = {
  id: "compass.convert.bearing",
  label: "Bearing",
  initial: 90,
  suffix: "°",
  min: 0,
  max: 360,
  reason: "a bearing is from 0° to 360°",
};

const NAMES: Record<North, string> = { true: "True north", grid: "Grid north", magnetic: "Magnetic north" };
const SHORT: Record<North, string> = { true: "True", grid: "Grid", magnetic: "Magnetic" };
const ALL = (["grid", "magnetic", "true"] as const).map((value) => ({ value, label: NAMES[value] }));

export function BearingConverter({ norths }: { norths: Norths | null }) {
  const bearing = useNumber(bearingSpec);
  const onGrid = norths?.convergence != null;
  const options = (onGrid ? (["grid", "magnetic", "true"] as const) : (["magnetic", "true"] as const)).map((value) => ({
    value,
    label: NAMES[value],
  }));
  const [stored, setFrom] = useChoice<North>("compass.convert.from", ALL, "grid");
  const from: North = stored === "grid" && !onGrid ? "magnetic" : stored;
  const offsets = norths ? { declination: norths.declination, convergence: norths.convergence } : null;
  const targets = (["true", "grid", "magnetic"] as const).filter((north) => north !== from && (north !== "grid" || onGrid));
  const answers =
    bearing.value !== null && offsets
      ? targets.map((north) => ({ north, value: convertBearing(bearing.value as number, from, north, offsets) as number }))
      : null;

  return (
    <Calculator
      id="convert"
      title="Convert a bearing"
      intro="A bearing taken from one north, given from the others at the place chosen above: off the map to set on the compass, or the other way."
    >
      <Inputs>
        <NumberField input={bearing} />
        <ChoiceField label="Measured from" value={from} onChange={setFrom} options={options} />
      </Inputs>
      <Result
        label={`${threeFigures(bearing.value ?? 0)} from ${NAMES[from].toLowerCase()} is`}
        figure={answers ? answers.map((answer) => `${SHORT[answer.north]} ${threeFigures(answer.value)}`).join(" · ") : null}
        refusal={offsets ? undefined : "Choose a place above: the norths are different from place to place."}
        keep={
          answers
            ? {
                title: `${threeFigures(bearing.value ?? 0)} from ${NAMES[from].toLowerCase()}`,
                lines: answers.map((answer) => `${NAMES[answer.north]}: ${threeFigures(answer.value)}`),
              }
            : undefined
        }
      >
        To the whole degree, as a hand compass is set.
      </Result>
      {norths && bearing.value !== null ? (
        <MapToCompass
          norths={norths}
          mapBearing={
            from === "magnetic"
              ? (convertBearing(bearing.value, "magnetic", onGrid ? "grid" : "true", offsets!) ?? bearing.value)
              : from === "true" && onGrid
                ? (convertBearing(bearing.value, "true", "grid", offsets!) ?? bearing.value)
                : bearing.value
          }
        />
      ) : null}
      <HowWorkedOut
        formula={
          <>
            <Formula>true = magnetic + declination = grid + convergence</Formula>
            <p>East counts as plus, west as minus, with the figures from North here.</p>
          </>
        }
        sources={[S.wmm, S.osgb, S.utm]}
      />
    </Calculator>
  );
}
