import { Timer } from "lucide-react";
import { useMemo } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import {
  Calculator,
  ChoiceField,
  convert,
  Formula,
  formatDuration,
  formatFigure,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  SourceList,
  ToolScreen,
  type Unit,
  u,
  useChoice,
  useNumber,
  useText,
} from "../kit";
import { guidanceSheetPdf } from "../kit/sheet";
import { BOILING_MAX_HEIGHT_M, boilingPointAtHeight, scaleRecipe } from "./formulas";
import {
  type Bird,
  FSA_RULE,
  FSA_TIME_TEMPERATURE,
  GAS_MARKS,
  nearestGasMark,
  roastGuide,
  COOKING_SOURCES as S,
  SAFETY_QUOTES,
  TIME_IS_A_GUIDE,
} from "./safety";
import { SAFETY_READ, SAFETY_SHEET_TITLE, safetyBlocks } from "./safety-sheet";
import { TimerPanel, TimerProvider, useTimer } from "./timer";

const CALCULATORS = [
  { id: "roasting", title: "Roasting a bird" },
  { id: "safe", title: "Safe cooking temperatures" },
  { id: "timer", title: "Timer" },
  { id: "altitude", title: "Boiling at altitude" },
  { id: "convert", title: "Weights and measures" },
  { id: "oven", title: "Oven temperatures" },
  { id: "scale", title: "Scaling a recipe" },
] as const;

export default function CookingPage() {
  return (
    <TimerProvider>
      <ToolScreen
        title="Cooking"
        description="Roasting times, safe temperatures, a timer, boiling at altitude, conversions and scaling a recipe: for a kitchen, a power cut or a camp stove."
        calculators={CALCULATORS}
        footer={
          <>
            Food-safety figures here are the UK Food Standards Agency's and Food Standards Scotland's, quoted. A cooking time is a guide;
            whether food is cooked is decided by its temperature in the middle, or by the checks the FSA gives.
          </>
        }
      >
        <RoastingCalculator />
        <SafeTemperatures />
        <Calculator id="timer" title="Timer" intro="A kitchen timer, or one set from a roasting time above.">
          <TimerPanel />
        </Calculator>
        <AltitudeCalculator />
        <ConversionCalculator />
        <OvenCalculator />
        <ScaleCalculator />
      </ToolScreen>
    </TimerProvider>
  );
}

// ── Roasting ────────────────────────────────────────────────────────────────

const BIRDS = [
  { value: "turkey", label: "Turkey" },
  { value: "chicken", label: "Chicken" },
  { value: "goose", label: "Goose" },
  { value: "duck", label: "Duck" },
] as const satisfies ReadonlyArray<{ value: Bird; label: string }>;

const rsWeight: NumberSpec = {
  id: "cooking.roast.weight",
  label: "Weight, oven-ready",
  initial: 2,
  units: [u.kg, u.lb],
  above: 0,
  max: 25,
};

function RoastingCalculator() {
  const [bird, setBird] = useChoice<Bird>("cooking.roast.bird", BIRDS, "chicken");
  const weight = useNumber(rsWeight);
  const guide = weight.value !== null ? roastGuide(bird, weight.value) : null;
  const timer = useTimer();
  return (
    <Calculator
      id="roasting"
      title="Roasting a bird"
      intro="The Food Standards Agency's roasting times, for when the packaging gives none. The time gets you close; the temperature in the thickest part says it is done."
    >
      <Inputs>
        <ChoiceField label="Bird" value={bird} onChange={setBird} options={BIRDS} />
        <NumberField input={weight} />
      </Inputs>
      <Result
        label="Roast for about"
        figure={guide ? formatDuration(Math.round(guide.minutes / 5) * 5) : null}
        keep={
          guide
            ? {
                title: `Roasting a ${guide.label.toLowerCase()} of ${formatFigure(weight.value!, { decimals: 2 })} kg`,
                lines: [
                  `About ${formatDuration(Math.round(guide.minutes / 5) * 5)} in an oven preheated to ${guide.oven} (FSA: ${guide.rule})`,
                  "Check the thickest part (between the breast and the thigh) reaches 75°C or above, no meat is pink and the juices run clear.",
                ],
              }
            : undefined
        }
      >
        {guide ? (
          <>
            <p>
              In an oven preheated to {guide.oven}. The FSA: “{guide.rule}”. Rounded to 5 minutes.
            </p>
            <p className="mt-2">
              Then check, as Food Standards Scotland says, that “the thickest part of the bird (between the breast and the thigh) reaches
              75°C or above”, and as the FSA says, “that none of the meat is pink and that any juices run clear.” If not, it goes back in.
            </p>
            {timer ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() =>
                  timer.start(Math.round(guide.minutes / 5) * 5, `${guide.label}, ${formatFigure(weight.value!, { decimals: 2 })} kg`)
                }
              >
                <Timer aria-hidden /> Start a timer for this
              </Button>
            ) : null}
          </>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <p>The FSA's figures, for when the retailer gives no cooking instructions:</p>
            <ul className="grid gap-1">
              <li>
                Turkey, at 180ºC: 45 minutes per kg plus 20 minutes under 4.5 kg; 40 minutes per kg from 4.5 to 6.5 kg; 35 minutes per kg
                over 6.5 kg.
              </li>
              <li>Chicken, at 180ºC: 45 minutes per kg plus 20 minutes.</li>
              <li>Goose, at 200ºC: 35 minutes per kg. Duck, at 200ºC: 45 minutes per kg.</li>
            </ul>
            <p>
              Food Standards Scotland gives goose at 220ºC (Gas Mark 7) for the same time per kg. “{TIME_IS_A_GUIDE.text}” (
              {TIME_IS_A_GUIDE.who})
            </p>
          </>
        }
        range="A whole, thawed, unstuffed bird in a conventional oven preheated to the temperature given."
        limits="Stuffing, a bird still cold or frozen in the middle, fan ovens (which “might cook the bird more quickly”, FSS), and ovens that run hot or cool. The US Department of Agriculture's timetables could not be read on the day and are not used."
        sources={[S.fsaChristmas, S.fss]}
      />
    </Calculator>
  );
}

// ── Safe temperatures ───────────────────────────────────────────────────────

function SafeTemperatures() {
  const pdf = useMemo(
    () =>
      madePdf(
        guidanceSheetPdf(
          safetyBlocks(),
          SAFETY_SHEET_TITLE,
          "Safe cooking temperatures · UK food-safety guidance, quoted · Outpost",
          new Date(`${SAFETY_READ}T00:00:00Z`),
        ),
        SAFETY_SHEET_TITLE,
        "Guidance",
        {
          what: "the cooking calculators",
          path: "/tools/cooking#safe",
        },
      ),
    [],
  );
  return (
    <Calculator
      id="safe"
      title="Safe cooking temperatures"
      intro="The temperature the middle of the food has to reach, and for how long, as the Food Standards Agency gives it."
    >
      <p className="text-body text-ink">
        <q className="font-title">{FSA_RULE}</q>
      </p>
      <table className="mt-3 w-full max-w-sm text-left tabular">
        <thead>
          <tr className="text-small text-ink-muted">
            <th className="py-1 font-medium">In the middle of the food</th>
            <th className="py-1 font-medium">For at least</th>
          </tr>
        </thead>
        <tbody>
          {FSA_TIME_TEMPERATURE.map((row) => (
            <tr key={row.celsius} className="border-t border-border">
              <td className="py-1.5">
                {row.celsius}°C ({formatFigure(convert(row.celsius, u.celsius, u.fahrenheit), { decimals: 0 })}°F)
              </td>
              <td className="py-1.5">{row.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-small text-ink-muted">The °F figures are converted here; the FSA gives °C.</p>
      <ul className="mt-4 grid gap-1.5 text-small text-ink">
        {SAFETY_QUOTES.map((quote) => (
          <li key={quote.text}>
            <q className="font-title">{quote.text}</q> <span className="text-ink-muted">({quote.who})</span>
          </li>
        ))}
      </ul>
      <Notice tone="info" className="mt-4">
        Without a thermometer, the FSA's checks are steam rising from the middle when it is cut, no pink meat in poultry, pork, mince and
        sausages, and juices running clear. On a camp stove or in a power cut, food takes longer: go by these checks, not the clock.
      </Notice>
      <h3 className="mt-6 text-lead font-semibold text-ink">Keep a copy</h3>
      <p className="mt-1 mb-3 text-small text-ink-muted">
        These temperatures and checks on a sheet to print, dated by when the guidance was read.
      </p>
      <PdfActions pdf={pdf} />
      <div className="mt-4 text-small">
        <SourceList sources={[S.fsaCooking, S.fss]} />
      </div>
    </Calculator>
  );
}

// ── Boiling at altitude ─────────────────────────────────────────────────────

const alHeight: NumberSpec = {
  id: "cooking.altitude.height",
  label: "Height above sea level",
  initial: 1500,
  units: u.units.height,
  min: 0,
  max: BOILING_MAX_HEIGHT_M,
};

function AltitudeCalculator() {
  const height = useNumber(alHeight);
  const point = height.value !== null ? boilingPointAtHeight(height.value) : null;
  return (
    <Calculator
      id="altitude"
      title="Boiling at altitude"
      intro="Water boils at a lower temperature the higher you are, so food in boiling water cooks more slowly."
    >
      <Inputs>
        <NumberField input={height} />
      </Inputs>
      <Result
        label="Water boils at about"
        figure={
          point !== null
            ? `${formatFigure(point, { decimals: 0 })} °C (${formatFigure(convert(point, u.celsius, u.fahrenheit), { decimals: 0 })} °F)`
            : null
        }
        keep={
          point !== null
            ? {
                title: "Boiling point at altitude",
                lines: [
                  `About ${formatFigure(point, { decimals: 0 })} °C at ${formatFigure(height.value!, { decimals: 0 })} m, in standard air`,
                ],
              }
            : undefined
        }
      >
        {point !== null ? (
          <p>
            Pasta, rice and anything simmered take longer than the packet says; there is no official factor to multiply by, so cook until it
            is done and, for meat, until the middle is hot enough (see safe temperatures above). Boiling still makes water safe to drink at
            height: see the Water calculators for how long.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>pressure = 101,325 Pa × (1 − 2.25577 × 10⁻⁵ × height)^5.25588</Formula>
            <Formula>log₁₀(pressure in bar) = 5.08354 − 1663.125 ÷ (T − 45.622), T in kelvin</Formula>
            <p>
              The air pressure of the International Standard Atmosphere at your height, and the temperature at which water's vapour pressure
              equals it, from the Antoine equation with NIST's coefficients for water. It agrees with the CDC's “at approximately 4,900 m
              (16,000 ft) elevation, the boiling temperature of water is approximately 83°C (182°F)”.
            </p>
          </>
        }
        range="From sea level to 8,000 m, inside the range the coefficients hold for (water boiling between 71 °C and 100 °C)."
        limits="The weather: a low or high barometer moves the boiling point by a degree or so. Pressure cookers, which raise it."
        sources={[S.isa, S.nist, S.cdcYellowBook]}
      />
    </Calculator>
  );
}

// ── Weights and measures ────────────────────────────────────────────────────

const KINDS = {
  weight: { label: "Weight", units: [u.g, u.kg, u.oz, u.lb] as Unit[] },
  volume: {
    label: "Volume",
    units: [u.ml, u.litre, u.tsp, u.tbsp, u.ukFlOz, u.usFlOz, u.usCup, u.ukPint, u.ukGallon, u.usGallon] as Unit[],
  },
} as const;
type Kind = keyof typeof KINDS;

const cvAmount: NumberSpec = { id: "cooking.convert.amount", label: "Amount", initial: 250, min: 0 };

function ConversionCalculator() {
  const [kind, setKind] = useChoice<Kind>(
    "cooking.convert.kind",
    [
      { value: "weight", label: "Weight" },
      { value: "volume", label: "Volume" },
    ],
    "weight",
  );
  const units = KINDS[kind].units;
  const unitOptions = units.map((unit) => ({ value: unit.id, label: unit.name }));
  const [fromId, setFrom] = useChoice(`cooking.convert.from.${kind}`, unitOptions, units[0]!.id);
  const amount = useNumber(cvAmount);
  const from = units.find((unit) => unit.id === fromId) ?? units[0]!;
  const rows =
    amount.value !== null
      ? units.filter((unit) => unit.id !== from.id).map((unit) => [unit, convert(amount.value!, from, unit)] as const)
      : null;
  return (
    <Calculator id="convert" title="Weights and measures" intro="Recipe amounts from one unit into the others: metric, imperial and US.">
      <Inputs>
        <ChoiceField
          label="Measure"
          value={kind}
          onChange={setKind}
          options={[
            { value: "weight", label: "Weight" },
            { value: "volume", label: "Volume" },
          ]}
        />
        <ChoiceField label="From" value={from.id} onChange={setFrom} options={unitOptions} />
        <NumberField input={amount} />
      </Inputs>
      <Result
        label={`${formatFigure(amount.value ?? 0, { decimals: 3 })} ${from.symbol} is`}
        figure={rows ? `${formatFigure(rows[0]![1], { decimals: 2, significant: 3 })} ${rows[0]![0].symbol}` : null}
        keep={
          rows
            ? {
                title: `${formatFigure(amount.value!, { decimals: 3 })} ${from.name}`,
                lines: rows.map(([unit, value]) => `${formatFigure(value, { decimals: 2, significant: 3 })} ${unit.name}`),
              }
            : undefined
        }
      >
        {rows ? (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-small tabular">
            {rows.slice(1).map(([unit, value]) => (
              <div key={unit.id} className="contents">
                <dt className="text-ink-muted">{unit.name}</dt>
                <dd>{formatFigure(value, { decimals: 2, significant: 3 })}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <p>
            By the legal definitions: an ounce is 28.35 g and a pound 453.6 g; a UK pint 568 ml, a UK gallon 4.546 litres, a US gallon 3.785
            litres, a US cup 236.6 ml (half a US pint); a tablespoon 15 ml and a teaspoon 5 ml, the metric spoons UK recipes use.
          </p>
        }
        limits="Converting between weight and volume, which depends on the food: a cup of flour weighs much less than a cup of sugar. Older UK recipes may mean a slightly different spoon or cup."
        sources={[S.units]}
      />
    </Calculator>
  );
}

// ── Oven temperatures ───────────────────────────────────────────────────────

const ovTemp: NumberSpec = { id: "cooking.oven.temp", label: "Oven temperature, conventional", initial: 180, units: u.units.temperature };

function OvenCalculator() {
  const temp = useNumber(ovTemp);
  const mark = temp.value !== null ? nearestGasMark(temp.value) : null;
  return (
    <Calculator id="oven" title="Oven temperatures" intro="Conventional and fan oven temperatures and gas marks, from a published table.">
      <Inputs>
        <NumberField input={temp} />
      </Inputs>
      <Result
        label="Nearest gas mark"
        figure={mark ? `Gas mark ${mark.mark}` : null}
        refusal={temp.value !== null && !mark ? "That is outside the gas marks, which run from 1 (140 °C) to 9 (240 °C)." : undefined}
        keep={
          mark
            ? {
                title: "Oven temperature",
                lines: [
                  `${mark.celsius} °C, fan ${mark.fan} °C, ${mark.fahrenheit} °F, gas mark ${mark.mark} (${mark.words.toLowerCase()})`,
                ],
              }
            : undefined
        }
      >
        {mark ? (
          <p>
            Gas mark {mark.mark} is {mark.celsius} °C, or {mark.fan} °C in a fan oven, {mark.fahrenheit} °F: “{mark.words.toLowerCase()}”.
          </p>
        ) : null}
      </Result>
      <table className="mt-4 w-full text-left text-small tabular">
        <caption className="text-left font-semibold text-ink">Gas marks, as Which? tables them</caption>
        <thead>
          <tr className="text-ink-muted">
            <th className="py-1 font-medium">Gas mark</th>
            <th className="py-1 font-medium">°C</th>
            <th className="py-1 font-medium">Fan °C</th>
            <th className="py-1 font-medium">°F</th>
          </tr>
        </thead>
        <tbody>
          {GAS_MARKS.map((row) => (
            <tr key={row.mark} className={row.mark === mark?.mark ? "border-t border-border bg-primary-soft" : "border-t border-border"}>
              <td className="py-1">{row.mark}</td>
              <td className="py-1">{row.celsius}</td>
              <td className="py-1">{row.fan}</td>
              <td className="py-1">{row.fahrenheit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <HowWorkedOut
        formula={
          <p>
            Read from the table: the gas mark whose conventional temperature is nearest. Which? says “Fan oven cooking temperatures are
            typically around 20°C less than conventional ovens.” The FSA gives the same 20 °C for its roasting temperatures (180ºC, 160ºC
            fan).
          </p>
        }
        limits="Ovens that run hot or cool, and the maker's own advice for a fan oven."
        sources={[S.which, S.fsaChristmas]}
      />
    </Calculator>
  );
}

// ── Scaling ─────────────────────────────────────────────────────────────────

const scFrom: NumberSpec = { id: "cooking.scale.from", label: "The recipe serves", initial: 4, above: 0 };
const scTo: NumberSpec = { id: "cooking.scale.to", label: "You want to serve", initial: 6, above: 0 };

function ScaleCalculator() {
  const from = useNumber(scFrom);
  const to = useNumber(scTo);
  const [text, setText] = useText("cooking.scale.text", "500 g minced beef\n1 onion\n400 g tin of tomatoes\n2 tbsp oil\nSalt to taste");
  const factor = from.value && to.value ? to.value / from.value : null;
  const lines = factor ? scaleRecipe(text, factor) : null;
  return (
    <Calculator id="scale" title="Scaling a recipe" intro="Every amount at the start of a line, multiplied for more or fewer people.">
      <Inputs>
        <NumberField input={from} />
        <NumberField input={to} />
        <Field
          label="Ingredients, one a line"
          className="sm:col-span-2"
          hint="Amounts at the start of a line are scaled: 200, 1.5, 1/2, 1½."
        >
          {(ids) => <Textarea {...ids} rows={6} value={text} onChange={(event) => setText(event.target.value)} />}
        </Field>
      </Inputs>
      <Result
        label="Multiply by"
        figure={factor ? `× ${formatFigure(factor, { decimals: 3 })}` : null}
        keep={
          lines
            ? {
                title: `Recipe scaled from ${from.value} to ${to.value}`,
                lines: lines.map((line) => line.line).filter((line) => line.trim()),
              }
            : undefined
        }
      >
        {lines ? (
          <ul className="mt-1 grid gap-0.5">
            {lines
              .filter((line) => line.line.trim())
              .map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines of a recipe have no identity beyond their place
                <li key={index} className={line.scaled ? "text-ink" : "text-ink-muted"}>
                  {line.line}
                  {line.scaled ? null : <span className="text-small"> (not scaled)</span>}
                </li>
              ))}
          </ul>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={<Formula>new amount = amount × people wanted ÷ people the recipe serves</Formula>}
        limits="Cooking times, tin and egg sizes, and seasoning, which do not scale in a straight line. A bigger joint or dish needs its own time and must still reach a safe temperature in the middle."
        sources={[{ name: "Arithmetic: no published constant is used" }]}
      />
    </Calculator>
  );
}
