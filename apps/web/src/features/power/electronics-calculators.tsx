/**
 * Ohm's law, the resistor colour code, resistors in series and parallel, an LED's
 * resistor and a voltage divider. Nothing typed here is kept.
 */
import { useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import {
  type BandColour,
  DIGIT_COLOURS,
  decodeBands,
  E12,
  E24,
  encodeBands,
  ledResistor,
  MULTIPLIERS,
  ohmsLaw,
  parallelResistance,
  seriesResistance,
  TOLERANCES,
  voltageDivider,
} from "./calc/electrical";
import { Answer, Answers, Basis, ChoiceField, ClearButton, Fields, figure, NumberField, readNumber } from "./inputs";

/** 4700 → "4.7 kΩ". */
export function ohmsText(ohms: number): string {
  if (!Number.isFinite(ohms)) return "–";
  const steps: Array<[number, string]> = [
    [1e6, "MΩ"],
    [1e3, "kΩ"],
    [1, "Ω"],
    [1e-3, "mΩ"],
  ];
  const [scale, unit] = steps.find(([size]) => Math.abs(ohms) >= size) ?? steps[steps.length - 1]!;
  return `${figure(ohms / scale, 3)} ${unit}`;
}

const colourName = (colour: BandColour) => (colour === "none" ? "no band" : colour);

// ── Ohm's law ───────────────────────────────────────────────────────────────

export function OhmCalculator() {
  const [volts, setVolts] = useState<number | null>(null);
  const [amps, setAmps] = useState<number | null>(null);
  const [ohms, setOhms] = useState<number | null>(null);
  const [watts, setWatts] = useState<number | null>(null);
  const given = [volts, amps, ohms, watts].filter((value) => value !== null).length;
  const result = given === 2 ? ohmsLaw({ volts, amps, ohms, watts }) : null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-small text-ink-muted">Give any two; the other two are worked out.</p>
        <ClearButton
          onClear={() => {
            setVolts(null);
            setAmps(null);
            setOhms(null);
            setWatts(null);
          }}
        />
      </div>
      <Fields>
        <NumberField label="Voltage" unit="V" value={volts} onChange={setVolts} />
        <NumberField label="Current" unit="A" value={amps} onChange={setAmps} />
        <NumberField label="Resistance" unit="Ω" value={ohms} onChange={setOhms} min={0} />
        <NumberField label="Power" unit="W" value={watts} onChange={setWatts} />
      </Fields>
      <Answers
        missing={
          given < 2
            ? "Give two of the four."
            : given > 2
              ? "Give only two: clear the others."
              : result
                ? null
                : "These two cannot go together (a resistance of nought, or a power with no current)."
        }
      >
        {result ? (
          <>
            <Answer label="Voltage">{result.volts === null ? "–" : `${figure(result.volts, 4)} V`}</Answer>
            <Answer label="Current">{result.amps === null ? "–" : `${figure(result.amps, 4)} A`}</Answer>
            <Answer label="Resistance">{result.ohms === null ? "–" : ohmsText(result.ohms)}</Answer>
            <Answer label="Power">{result.watts === null ? "–" : `${figure(result.watts, 4)} W`}</Answer>
          </>
        ) : null}
      </Answers>
      <Basis>
        <p>V = I × R and P = V × I, so also P = I² × R = V² ÷ R. For direct current, or for alternating current into a plain resistance.</p>
      </Basis>
    </div>
  );
}

// ── Colour code ─────────────────────────────────────────────────────────────

const digitOptions = DIGIT_COLOURS.map((colour, digit) => ({ value: colour, label: `${colour} (${digit})` }));
const multiplierOptions = MULTIPLIERS.map((item) => ({ value: item.colour, label: `${item.colour} (× ${figure(10 ** item.power, 3)})` }));
const toleranceOptions = TOLERANCES.map((item) => ({ value: item.colour, label: `${colourName(item.colour)} (±${item.percent}%)` }));

export function ColourCodeCalculator() {
  const [bands, setBands] = useState<"4" | "5">("4");
  const [digits, setDigits] = useState<BandColour[]>(["yellow", "violet", "black"]);
  const [multiplier, setMultiplier] = useState<BandColour>("red");
  const [tolerance, setTolerance] = useState<BandColour>("gold");
  const [wanted, setWanted] = useState<number | null>(null);
  const count = bands === "4" ? 2 : 3;
  const value = decodeBands(digits.slice(0, count), multiplier, tolerance);
  const written = wanted !== null ? encodeBands(wanted, count) : null;
  return (
    <div>
      <Segmented
        label="Bands"
        value={bands}
        onChange={setBands}
        options={[
          { value: "4", label: "Four bands" },
          { value: "5", label: "Five bands" },
        ]}
        className="mb-4"
      />
      <Fields>
        {Array.from({ length: count }, (_, index) => (
          <ChoiceField
            // biome-ignore lint/suspicious/noArrayIndexKey: the bands are positions
            key={index}
            label={`Band ${index + 1}`}
            value={digits[index]!}
            onChange={(colour) => setDigits(digits.map((item, at) => (at === index ? colour : item)))}
            options={digitOptions}
          />
        ))}
        <ChoiceField label={`Band ${count + 1}: multiplier`} value={multiplier} onChange={setMultiplier} options={multiplierOptions} />
        <ChoiceField label={`Band ${count + 2}: tolerance`} value={tolerance} onChange={setTolerance} options={toleranceOptions} />
      </Fields>
      <Answers missing={value ? null : "Choose the bands."}>
        {value ? (
          <Answer
            label="Value"
            detail={`Between ${ohmsText(value.ohms * (1 - value.tolerance / 100))} and ${ohmsText(value.ohms * (1 + value.tolerance / 100))}.`}
          >
            {ohmsText(value.ohms)} ±{value.tolerance}%
          </Answer>
        ) : null}
      </Answers>
      <div className="mt-5">
        <NumberField label="Or the bands for a value" unit="Ω" value={wanted} onChange={setWanted} min={0} />
        {wanted !== null ? (
          <p className="mt-2 text-small text-ink" aria-live="polite">
            {written
              ? `${written.digits.join(", ")}, then ${written.multiplier}, then the tolerance band${figure(Number(wanted.toPrecision(count)), 6) !== figure(wanted, 6) ? ` (rounded to ${count} figures)` : ""}.`
              : "That value cannot be written in bands."}
          </p>
        ) : null}
      </div>
      <Basis>
        <p>
          The colours of IEC 60062: black 0, brown 1, red 2, orange 3, yellow 4, green 5, blue 6, violet 7, grey 8, white 9. The band after
          the figures multiplies by that power of ten (gold × 0.1, silver × 0.01). Read from the end with the bands closer together; the
          tolerance band is usually set apart.
        </p>
      </Basis>
    </div>
  );
}

// ── Series and parallel ─────────────────────────────────────────────────────

export function CombineCalculator() {
  const [text, setText] = useState("100, 220, 330");
  const values = text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(readNumber);
  const valid = values.every((value) => value !== null && value >= 0) && values.length > 0;
  const numbers = values as number[];
  const parallel = valid ? parallelResistance(numbers) : null;
  return (
    <div>
      <Field label="Resistances, in ohms" hint="Separated by commas or spaces: 100, 220, 330.">
        {(ids) => (
          <Input
            {...ids}
            className="tabular"
            value={text}
            onChange={(event) => setText(event.target.value)}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
          />
        )}
      </Field>
      <Answers missing={valid ? null : "Type one or more resistances in ohms."}>
        {valid ? (
          <>
            <Answer label="In series">{ohmsText(seriesResistance(numbers))}</Answer>
            <Answer label="In parallel">{parallel === null ? "–" : ohmsText(parallel)}</Answer>
          </>
        ) : null}
      </Answers>
      <Basis>
        <p>In series: R = R₁ + R₂ + … In parallel: 1/R = 1/R₁ + 1/R₂ + …</p>
      </Basis>
    </div>
  );
}

// ── LED resistor ────────────────────────────────────────────────────────────

export function LedCalculator() {
  const [supply, setSupply] = useState<number | null>(12);
  const [forward, setForward] = useState<number | null>(2);
  const [count, setCount] = useState<number | null>(1);
  const [milliamps, setMilliamps] = useState<number | null>(20);
  const [series, setSeries] = useState<"e12" | "e24">("e24");
  const result =
    supply !== null && forward !== null && count && milliamps
      ? ledResistor(supply, forward, Math.round(count), milliamps / 1000, series === "e12" ? E12 : E24)
      : null;
  return (
    <div>
      <Fields>
        <NumberField label="Supply" unit="V" value={supply} onChange={setSupply} min={0} />
        <NumberField
          label="LED forward voltage"
          unit="V"
          value={forward}
          onChange={setForward}
          min={0}
          hint="From the LED's data sheet: about 2 V red, 3 V white or blue."
        />
        <NumberField label="LEDs in series" value={count} onChange={setCount} min={1} max={50} />
        <NumberField
          label="Current"
          unit="mA"
          value={milliamps}
          onChange={setMilliamps}
          min={0}
          hint="No more than the data sheet's rated current."
        />
        <ChoiceField
          label="Resistor series"
          value={series}
          onChange={setSeries}
          options={[
            { value: "e12", label: "E12 (10% values)" },
            { value: "e24", label: "E24 (5% values)" },
          ]}
        />
      </Fields>
      <Answers missing={result ? null : "The supply must be higher than the LEDs' forward voltages added together."}>
        {result ? (
          <>
            <Answer
              label="Resistance"
              detail={`Exactly ${ohmsText(result.exactOhms)}; the next value up in the series keeps the current under what you asked.`}
            >
              {ohmsText(result.chosenOhms)}
            </Answer>
            <Answer label="Current with it">{figure(result.chosenAmps * 1000, 1)} mA</Answer>
            <Answer label="Power in the resistor" detail="Choose a resistor rated well above this; twice is a common margin.">
              {figure(result.watts, 3)} W
            </Answer>
          </>
        ) : null}
      </Answers>
      <Basis>
        <p>
          R = (supply − LEDs × forward voltage) ÷ current; P = I² × R. Preferred values from IEC 60063. A supply that varies (a battery
          charging) changes the current too.
        </p>
      </Basis>
    </div>
  );
}

// ── Voltage divider ─────────────────────────────────────────────────────────

export function DividerCalculator() {
  const [vin, setVin] = useState<number | null>(12);
  const [r1, setR1] = useState<number | null>(10_000);
  const [r2, setR2] = useState<number | null>(4700);
  const [load, setLoad] = useState<number | null>(null);
  const result = vin !== null && r1 !== null && r2 !== null ? voltageDivider(vin, r1, r2, load) : null;
  return (
    <div>
      <Fields>
        <NumberField label="Input" unit="V" value={vin} onChange={setVin} />
        <NumberField label="R1, the upper resistor" unit="Ω" value={r1} onChange={setR1} min={0} />
        <NumberField label="R2, the lower resistor" unit="Ω" value={r2} onChange={setR2} min={0} />
        <NumberField label="Load across R2" unit="Ω" value={load} onChange={setLoad} min={0} hint="Leave empty for none." />
      </Fields>
      <Answers missing={result ? null : "Give the input and both resistors."}>
        {result ? (
          <>
            <Answer label="Output">{figure(result.vout, 3)} V</Answer>
            <Answer label="Current through R1">{figure(result.amps * 1000, 3)} mA</Answer>
          </>
        ) : null}
      </Answers>
      <Basis>
        <p>
          Vout = Vin × R2 ÷ (R1 + R2), with R2 taken in parallel with the load when there is one. A divider is not a power supply: the load
          pulls the output down.
        </p>
      </Basis>
    </div>
  );
}
