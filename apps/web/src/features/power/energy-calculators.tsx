/**
 * The quick calculators for batteries, solar, cable and generators. Nothing typed here
 * is kept. Each says its formula and its source behind "How this is worked out".
 */
import { CHEMISTRIES, type ChemistryFacts, chemistryById, LOSS_LABELS, PVWATTS_LOSSES, type SolarLosses } from "@outpost/shared";
import { useState } from "react";
import { Notice } from "@/components/page";
import { Segmented } from "@/components/ui/misc";
import {
  bank,
  chargeTime,
  combinedLoss,
  controllerFactor,
  fuelCurve,
  LITRES_PER_UK_GALLON,
  LITRES_PER_US_GALLON,
  litresPerHourAt,
  runtime,
  solarDailyWh,
  temperatureFactor,
} from "./calc/energy";
import {
  AWG_SIZES,
  areaForDrop,
  awgAreaMm2,
  cfrLimit,
  copperResistivity,
  DROP_CONVENTIONS,
  FEET_PER_METRE,
  gaugeForArea,
  INSULATION_RATINGS,
  type InsulationRating,
  METRIC_SIZES,
  nextSizes,
  voltageDrop,
} from "./calc/wire";
import { Answer, Answers, Basis, ChoiceField, Fields, figure, NumberField, PercentField } from "./inputs";

const hoursWords = (hours: number) =>
  hours >= 48 ? `${figure(hours, 1)} hours (${figure(hours / 24, 1)} days)` : `${figure(hours, 1)} hours`;

export const PVGIS_URL = "https://re.jrc.ec.europa.eu/pvg_tools/en/";

// ── Battery runtime ─────────────────────────────────────────────────────────

export function RuntimeCalculator() {
  const [by, setBy] = useState<"ah" | "wh">("ah");
  const [ah, setAh] = useState<number | null>(100);
  const [wh, setWh] = useState<number | null>(1280);
  const [volts, setVolts] = useState<number | null>(12.8);
  const [load, setLoad] = useState<number | null>(20);
  const [usable, setUsable] = useState<number | null>(0.8);
  const [efficiency, setEfficiency] = useState<number | null>(1);
  const energy = by === "ah" ? (ah !== null && volts !== null ? ah * volts : null) : wh;
  const run = energy !== null && volts && load && usable && efficiency ? runtime(energy, volts, load, usable, efficiency) : null;
  return (
    <div>
      <Segmented
        label="Capacity given as"
        value={by}
        onChange={setBy}
        options={[
          { value: "ah", label: "Amp-hours and volts" },
          { value: "wh", label: "Watt-hours" },
        ]}
        className="mb-4"
      />
      <Fields>
        {by === "ah" ? (
          <NumberField label="Capacity" unit="Ah" value={ah} onChange={setAh} min={0} />
        ) : (
          <NumberField label="Capacity" unit="Wh" value={wh} onChange={setWh} min={0} />
        )}
        <NumberField
          label="Battery voltage"
          unit="V"
          value={volts}
          onChange={setVolts}
          min={0}
          hint="Nominal: 12.8 V for a “12 V” LiFePO4, 12 V for lead acid."
        />
        <NumberField label="Load" unit="W" value={load} onChange={setLoad} min={0} />
        <PercentField
          label="Usable share of the capacity"
          value={usable}
          onChange={setUsable}
          hint="Starting figures: 80% for LiFePO4, 50% for lead acid (see below). Your battery's data sheet is better."
        />
        <PercentField
          label="Efficiency between battery and load"
          value={efficiency}
          onChange={setEfficiency}
          hint="100% for a DC load on the battery. For an AC load, your inverter's efficiency from its data sheet."
        />
      </Fields>
      <Answers missing={run ? null : "Give the capacity, the voltage and the load to see how long it runs."}>
        {run ? (
          <>
            <Answer label="Runs for" detail="An estimate: a battery gives less when cold, old or discharged fast.">
              {hoursWords(run.hours)}
            </Answer>
            <Answer label="Energy taken out">{figure(run.deliveredWh, 0)} Wh</Answer>
            <Answer
              label="Current from the battery"
              detail={`${figure(run.cRate, 3)} C. Lead-acid capacity is rated at the 20-hour rate (${figure((energy ?? 0) / (volts ?? 1) / 20, 1)} A for this one); at higher currents it gives noticeably less.`}
            >
              {figure(run.amps, 2)} A
            </Answer>
          </>
        ) : null}
      </Answers>
      <Basis>
        <p>
          Hours = capacity (Wh) × usable share × efficiency ÷ load (W). Watt-hours = amp-hours × volts. Current = load ÷ efficiency ÷ volts.
        </p>
        <ChemistryNotes />
        <p>
          Left out: the battery's voltage falling as it empties, the loss of capacity in the cold and with age, and Peukert's effect (lead
          acid gives fewer amp-hours at higher currents).
        </p>
      </Basis>
    </div>
  );
}

function ChemistryNotes() {
  return (
    <ul className="grid gap-1.5">
      {CHEMISTRIES.map((chemistry: ChemistryFacts) => (
        <li key={chemistry.id}>
          <span className="font-medium">{chemistry.label}:</span> {chemistry.basis}
        </li>
      ))}
    </ul>
  );
}

// ── Solar ───────────────────────────────────────────────────────────────────

export function LossFields({ losses, onChange }: { losses: SolarLosses; onChange: (losses: SolarLosses) => void }) {
  return (
    <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
      {(Object.keys(LOSS_LABELS) as Array<keyof SolarLosses>).map((key) => (
        <NumberField
          key={key}
          label={LOSS_LABELS[key]}
          unit="%"
          min={0}
          max={100}
          value={losses[key]}
          onChange={(value) => onChange({ ...losses, [key]: value ?? 0 })}
        />
      ))}
    </div>
  );
}

export function SolarCalculator() {
  const [watts, setWatts] = useState<number | null>(100);
  const [sun, setSun] = useState<number | null>(null);
  const [losses, setLosses] = useState<SolarLosses>({ ...PVWATTS_LOSSES });
  const [cell, setCell] = useState<number | null>(25);
  const [controller, setController] = useState<"mppt" | "pwm">("mppt");
  const [mppt, setMppt] = useState<number | null>(0.95);
  const [batteryV, setBatteryV] = useState<number | null>(13.6);
  const [vmp, setVmp] = useState<number | null>(18);
  const [refill, setRefill] = useState<number | null>(1024);
  const [roundTrip, setRoundTrip] = useState<number | null>(0.92);
  const [dailyLoad, setDailyLoad] = useState<number | null>(0);
  const loss = combinedLoss(Object.values(losses));
  const factor = controllerFactor(controller, mppt ?? 0, batteryV ?? 0, vmp ?? 0);
  const daily = watts !== null && sun !== null ? solarDailyWh(watts, sun, loss, factor, temperatureFactor(cell ?? 25)) : null;
  const time = daily !== null && refill !== null && roundTrip ? chargeTime(refill, daily, roundTrip, dailyLoad ?? 0) : null;
  return (
    <div>
      <Fields>
        <NumberField label="Panels" unit="W" value={watts} onChange={setWatts} min={0} hint="The sum of the panels' rated watts." />
        <NumberField
          label="Peak sun hours"
          unit="h"
          value={sun}
          onChange={setSun}
          min={0}
          max={12}
          hint={
            <>
              The day's sun on the panels in kWh/m². For a place, month and tilt, PVGIS gives it (
              <a href={PVGIS_URL} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                re.jrc.ec.europa.eu
              </a>
              , needs the internet).
            </>
          }
        />
        <ChoiceField
          label="Charge controller"
          value={controller}
          onChange={setController}
          options={[
            { value: "mppt", label: "MPPT" },
            { value: "pwm", label: "PWM" },
          ]}
        />
        {controller === "mppt" ? (
          <PercentField
            label="Controller efficiency"
            value={mppt}
            onChange={setMppt}
            hint="From its data sheet. 95% is a starting figure."
          />
        ) : (
          <>
            <NumberField label="Battery voltage while charging" unit="V" value={batteryV} onChange={setBatteryV} min={0} />
            <NumberField
              label="Panel voltage at maximum power (Vmp)"
              unit="V"
              value={vmp}
              onChange={setVmp}
              min={0}
              hint="On the panel's label."
            />
          </>
        )}
        <NumberField
          label="Cell temperature"
          unit="°C"
          value={cell}
          onChange={setCell}
          hint="Panels are rated at 25 °C. In sun they run 20 to 30 °C above the air."
        />
      </Fields>
      <h4 className="mt-5 mb-2 text-small font-semibold text-ink">Losses (PVWatts' defaults, change any)</h4>
      <LossFields losses={losses} onChange={setLosses} />
      <h4 className="mt-5 mb-2 text-small font-semibold text-ink">Time to charge</h4>
      <Fields>
        <NumberField
          label="Energy to put back"
          unit="Wh"
          value={refill}
          onChange={setRefill}
          min={0}
          hint="What was taken out of the battery."
        />
        <PercentField label="Battery round-trip efficiency" value={roundTrip} onChange={setRoundTrip} hint="92% LiFePO4, 80% lead acid." />
        <NumberField label="Used meanwhile each day" unit="Wh" value={dailyLoad} onChange={setDailyLoad} min={0} />
      </Fields>
      <Answers missing={daily === null ? "Give the panels' watts and the peak sun hours." : null}>
        {daily !== null ? (
          <>
            <Answer label="Made in a day" detail={`${figure(loss * 100, 2)}% losses, ${figure(factor * 100, 1)}% through the controller.`}>
              {figure(daily, 0)} Wh
            </Answer>
            {time ? (
              <Answer
                label="Days to charge"
                detail={`${figure(time.neededWh, 0)} Wh to put in, counting the charging loss; ${figure(time.netDailyWh, 0)} Wh a day left for the battery.`}
              >
                {time.days === null ? "Never: the loads use all of it" : `${figure(time.days, 1)} days`}
              </Answer>
            ) : null}
          </>
        ) : null}
      </Answers>
      <Basis>
        <p>
          A day's output = panel watts × peak sun hours × (1 − losses) × temperature × controller. Losses are combined as PVWatts does, 1 −
          Π(1 − lossᵢ), with PVWatts' defaults (NREL, PVWatts Version 5 Manual, 2014): 14.08% in all. Temperature: −0.47% per °C above 25
          °C, PVWatts' figure for a standard module.
        </p>
        <p>
          MPPT: the controller's efficiency. PWM: the panel is held at the battery's voltage, so it gives about battery volts ÷ Vmp of its
          power. Charging: energy to put back ÷ √(round trip), the charging half of the round trip as HOMER splits it.
        </p>
        <p>Left out: shading through the day, cloud from one day to the next, and the battery taking charge more slowly as it fills.</p>
      </Basis>
    </div>
  );
}

// ── Cable ───────────────────────────────────────────────────────────────────

export function WireCalculator() {
  const [volts, setVolts] = useState<number | null>(12);
  const [amps, setAmps] = useState<number | null>(10);
  const [length, setLength] = useState<number | null>(3);
  const [lengthUnit, setLengthUnit] = useState<"m" | "ft">("m");
  const [sizing, setSizing] = useState<"mm2" | "awg">("mm2");
  const [area, setArea] = useState<string>("4");
  const [gauge, setGauge] = useState<string>("12");
  const [celsius, setCelsius] = useState<number | null>(20);
  const [target, setTarget] = useState<string>("0");
  const [rating, setRating] = useState<InsulationRating>(105);
  const [engine, setEngine] = useState<"no" | "yes">("no");
  const [bundled, setBundled] = useState<number | null>(2);
  const [own, setOwn] = useState<number | null>(null);

  const metres = length === null ? null : lengthUnit === "m" ? length : length / FEET_PER_METRE;
  const areaMm2 = sizing === "mm2" ? Number(area) : awgAreaMm2(Number(gauge));
  const drop = volts && amps !== null && metres !== null ? voltageDrop(volts, amps, metres, areaMm2, celsius ?? 20) : null;
  const convention = DROP_CONVENTIONS[Number(target)]!;
  const needed = volts && amps && metres ? areaForDrop(volts, amps, metres, convention.percent, celsius ?? 20) : null;
  const sizes = needed !== null ? nextSizes(needed) : null;
  const row = sizing === "awg" ? AWG_SIZES.find((size) => size.n === Number(gauge)) : gaugeForArea(areaMm2);
  const limit = row ? cfrLimit(row.n, rating, { engineSpace: engine === "yes", bundled: bundled ?? 1 }) : null;

  return (
    <div>
      <Fields>
        <NumberField label="Supply voltage" unit="V" value={volts} onChange={setVolts} min={0} />
        <NumberField label="Current" unit="A" value={amps} onChange={setAmps} min={0} />
        <div className="grid gap-2">
          <NumberField
            label="Length of the run, one way"
            unit={lengthUnit}
            value={length}
            onChange={setLength}
            min={0}
            hint="The cable goes out and back: the loop is twice this."
          />
          <Segmented
            label="Length in"
            value={lengthUnit}
            onChange={setLengthUnit}
            options={[
              { value: "m", label: "Metres" },
              { value: "ft", label: "Feet" },
            ]}
          />
        </div>
        <div className="grid gap-2">
          {sizing === "mm2" ? (
            <ChoiceField
              label="Cable size"
              value={area}
              onChange={setArea}
              options={METRIC_SIZES.map((size) => ({ value: String(size), label: `${size} mm²` }))}
            />
          ) : (
            <ChoiceField
              label="Cable size"
              value={gauge}
              onChange={setGauge}
              options={AWG_SIZES.map((size) => ({ value: String(size.n), label: `${size.label} (${figure(awgAreaMm2(size.n), 2)} mm²)` }))}
            />
          )}
          <Segmented
            label="Sizes in"
            value={sizing}
            onChange={setSizing}
            options={[
              { value: "mm2", label: "mm²" },
              { value: "awg", label: "AWG" },
            ]}
          />
        </div>
        <NumberField
          label="Conductor temperature"
          unit="°C"
          value={celsius}
          onChange={setCelsius}
          hint="Copper's resistance rises about 0.4% for each degree. A cable near its limit runs much warmer than the air."
        />
        <ChoiceField
          label="Drop to work to"
          value={target}
          onChange={setTarget}
          options={DROP_CONVENTIONS.map((item, index) => ({ value: String(index), label: `${item.percent}%`, description: item.rule }))}
        />
      </Fields>
      <Answers missing={drop ? null : "Give the voltage, the current and the length."}>
        {drop ? (
          <>
            <Answer
              label="Voltage drop"
              detail={`${figure(drop.atLoad, 2)} V reaches the load. ${drop.percent > convention.percent ? `More than the ${convention.percent}% you chose.` : `Within the ${convention.percent}% you chose.`}`}
            >
              {figure(drop.volts, 3)} V, {figure(drop.percent, 2)}%
            </Answer>
            <Answer label="Lost as heat in the cable">{figure(drop.watts, 2)} W</Answer>
            <Answer label="Resistance of the loop">{figure(drop.ohms * 1000, 2)} mΩ</Answer>
            {needed !== null && sizes ? (
              <Answer
                label={`Smallest for ${convention.percent}%`}
                detail="On voltage drop alone. That says nothing about whether the cable can carry the current safely: see below."
              >
                {figure(needed, 2)} mm²: {sizes.metric !== null ? `${sizes.metric} mm²` : "larger than 120 mm²"}
                {sizes.awg ? ` or ${sizes.awg.label}` : ""}
              </Answer>
            ) : null}
          </>
        ) : null}
      </Answers>

      <h4 className="mt-6 mb-1 text-small font-semibold text-ink">How much current the cable may carry</h4>
      <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
        Guidance from one published rule, 33 CFR 183.425 table 5: the United States Coast Guard's limits for the low-voltage wiring of
        boats. It is not BS 7671, it is not a substitute for the wiring regulations that apply to your installation or for a qualified
        electrician, and the maker's rating for your cable comes first.
      </p>
      <Fields>
        <ChoiceField
          label="Insulation rated to"
          value={String(rating)}
          onChange={(value) => setRating(Number(value) as InsulationRating)}
          options={INSULATION_RATINGS.map((item) => ({ value: String(item), label: `${item} °C` }))}
          hint="On the cable or its data sheet. Common PVC is 70 °C: take the 60 °C column for it."
        />
        <ChoiceField
          label="In an engine space"
          value={engine}
          onChange={setEngine}
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
        />
        <NumberField
          label="Current-carrying conductors bundled together"
          value={bundled}
          onChange={setBundled}
          min={1}
          hint="A pair out and back is 2. Three or more lowers the limit."
        />
        <NumberField
          label="Your cable's own rating"
          unit="A"
          value={own}
          onChange={setOwn}
          min={0}
          hint="From its maker, if you have it."
        />
      </Fields>
      <Answers missing={limit ? null : "The table starts at 18 AWG (0.82 mm²). For a smaller cable, use its maker's rating."}>
        {limit ? (
          <>
            <Answer
              label="Table 5 allows"
              detail={`${limit.gauge.label}, ${rating} °C insulation: ${limit.tableAmps} A${limit.factor !== 1 ? `, × ${figure(limit.factor, 2)} for the notes` : ""}.${sizing === "mm2" ? ` A ${area} mm² cable is read as ${limit.gauge.label}, the largest gauge with no more copper.` : ""}`}
            >
              {figure(limit.amps, 1)} A
            </Answer>
            {amps !== null ? (
              <Answer label="Against your current">
                {amps > limit.amps
                  ? `${figure(amps, 1)} A is more than the table allows`
                  : `${figure(amps, 1)} A is within the table's figure`}
              </Answer>
            ) : null}
            {own !== null && amps !== null ? (
              <Answer label="Against the maker's rating">
                {amps > own
                  ? `${figure(amps, 1)} A is more than ${figure(own, 1)} A`
                  : `${figure(amps, 1)} A is within ${figure(own, 1)} A`}
              </Answer>
            ) : null}
          </>
        ) : null}
      </Answers>
      {limit && amps !== null && (amps > limit.amps || (own !== null && amps > own)) ? (
        <Notice tone="warning" className="mt-3">
          The current is more than this cable is rated for. A cable carrying more than its rating overheats; choose a larger cable, and fuse
          it to protect the cable, near the battery.
        </Notice>
      ) : null}
      <Basis>
        <p>
          Resistance of the loop = ρ × 2 × length ÷ area, with ρ = 1/58 Ω·mm²/m for annealed copper at 20 °C and 0.00393 more per °C (IEC
          60028, the International Annealed Copper Standard): {figure(copperResistivity(celsius ?? 20), 5)} Ω·mm²/m at {celsius ?? 20} °C.
          Drop = current × resistance. Gauge: diameter = 0.127 mm × 92^((36 − n)/39) (ASTM B258).
        </p>
        <p>
          Drop conventions: {DROP_CONVENTIONS.map((item) => `${item.percent}% (${item.rule})`).join("; ")}. They are about things working
          well, not about safety.
        </p>
        <p>
          Current: 33 CFR 183.425, table 5, with note 1 (engine spaces) and note 2 (bundles of three or more). Stranded cable of a nominal
          size can have a few per cent more resistance than solid copper; connections, fuses and switches add their own drop.
        </p>
      </Basis>
    </div>
  );
}

// ── Series and parallel banks ───────────────────────────────────────────────

export function BankCalculator() {
  const [chemistry, setChemistry] = useState<string>("lifepo4");
  const facts = chemistryById(chemistry as ChemistryFacts["id"]);
  const [volts, setVolts] = useState<number | null>(12.8);
  const [ah, setAh] = useState<number | null>(100);
  const [series, setSeries] = useState<number | null>(1);
  const [parallel, setParallel] = useState<number | null>(2);
  const result = volts && ah && series && parallel ? bank(volts, ah, Math.round(series), Math.round(parallel)) : null;
  return (
    <div>
      <Fields>
        <ChoiceField
          label="Chemistry"
          value={chemistry}
          onChange={(value) => {
            setChemistry(value);
            const next = chemistryById(value as ChemistryFacts["id"]);
            setVolts(Number((next.cellVolts * next.cellsPerBlock).toFixed(2)));
          }}
          options={CHEMISTRIES.map((item) => ({ value: item.id, label: item.label }))}
        />
        <NumberField label="Voltage of one battery" unit="V" value={volts} onChange={setVolts} min={0} />
        <NumberField label="Capacity of one battery" unit="Ah" value={ah} onChange={setAh} min={0} />
        <NumberField label="In series in each string" value={series} onChange={setSeries} min={1} max={100} />
        <NumberField label="Strings in parallel" value={parallel} onChange={setParallel} min={1} max={100} />
      </Fields>
      <Answers missing={result ? null : "Give the battery and how many."}>
        {result ? (
          <>
            <Answer label="Bank">
              {figure(result.volts, 1)} V, {figure(result.ampHours, 0)} Ah
            </Answer>
            <Answer
              label="Energy"
              detail={`${figure(result.wattHours * facts.usableDod, 0)} Wh usable at ${figure(facts.usableDod * 100, 0)}%, the starting figure for ${facts.label}.`}
            >
              {figure(result.wattHours, 0)} Wh
            </Answer>
            <Answer label="Batteries">{result.batteries}</Answer>
          </>
        ) : null}
      </Answers>
      <Notice tone="info" title="Before connecting batteries together" className="mt-3">
        <ul className="list-disc space-y-1 pl-4">
          <li>Use the same model, capacity and age, and bring them to the same state of charge before connecting them.</li>
          <li>
            Lithium batteries need a battery management system (BMS). Check the maker allows them in series or parallel, and how many: many
            “12 V” LiFePO4 batteries allow only a few in series.
          </li>
          <li>Fuse each battery or string as the maker's instructions say, as close to its terminal as you can.</li>
          <li>Charge with a charger set for the chemistry and for the bank's voltage.</li>
        </ul>
      </Notice>
      <Basis>
        <p>
          Batteries in series add their voltages and keep one battery's amp-hours; strings in parallel add their amp-hours at one string's
          voltage. Energy = volts × amp-hours. Nominal voltages:{" "}
          {CHEMISTRIES.map((item) => `${item.label} ${item.cellVolts} V a cell`).join("; ")} (Battery University BU-216 and BU-303).
        </p>
      </Basis>
    </div>
  );
}

// ── Generator fuel ──────────────────────────────────────────────────────────

const FUEL_UNITS = {
  l: { label: "litres", per: 1 },
  uk: { label: "UK gallons", per: LITRES_PER_UK_GALLON },
  us: { label: "US gallons", per: LITRES_PER_US_GALLON },
};

export function GeneratorCalculator() {
  const [rated, setRated] = useState<number | null>(2000);
  const [unit, setUnit] = useState<keyof typeof FUEL_UNITS>("l");
  const [tank, setTank] = useState<number | null>(null);
  const [fullRun, setFullRun] = useState<number | null>(null);
  const [secondLoad, setSecondLoad] = useState<number | null>(0.25);
  const [secondRun, setSecondRun] = useState<number | null>(null);
  const [load, setLoad] = useState<number | null>(500);
  const [hours, setHours] = useState<number | null>(4);
  const per = FUEL_UNITS[unit].per;
  const tankL = tank === null ? null : tank * per;
  const curve =
    tankL && fullRun
      ? fuelCurve(
          { load: 1, litresPerHour: tankL / fullRun },
          secondRun && secondLoad !== null ? { load: secondLoad, litresPerHour: tankL / secondRun } : null,
        )
      : null;
  const share = rated && load !== null ? load / rated : null;
  const lph = curve && share !== null ? litresPerHourAt(curve, share) : null;
  const inUnit = (litres: number) => `${figure(litres / per, 2)} ${FUEL_UNITS[unit].label}`;
  return (
    <div>
      <p className="mb-4 max-w-[70ch] text-small text-ink-muted">
        From your generator's own data sheet: most give how long a full tank lasts at the rated load, and many also at a quarter load.
      </p>
      <Fields>
        <NumberField label="Rated output" unit="W" value={rated} onChange={setRated} min={0} />
        <ChoiceField
          label="Fuel in"
          value={unit}
          onChange={setUnit}
          options={Object.entries(FUEL_UNITS).map(([value, item]) => ({ value: value as keyof typeof FUEL_UNITS, label: item.label }))}
        />
        <NumberField label="Tank" unit={unit === "l" ? "L" : "gal"} value={tank} onChange={setTank} min={0} />
        <NumberField label="Runs on a tank at rated load" unit="h" value={fullRun} onChange={setFullRun} min={0} />
        <PercentField label="Second figure: at a load of" value={secondLoad} onChange={setSecondLoad} hint="A quarter load is 25%." />
        <NumberField
          label="Runs on a tank at that load"
          unit="h"
          value={secondRun}
          onChange={setSecondRun}
          min={0}
          hint="Leave empty if the data sheet has no second figure."
        />
        <NumberField label="Your load" unit="W" value={load} onChange={setLoad} min={0} />
        <NumberField label="Hours a day" unit="h" value={hours} onChange={setHours} min={0} max={24} />
      </Fields>
      <Answers missing={lph !== null ? null : "Give the tank and how long it runs at rated load, from the data sheet."}>
        {lph !== null && curve ? (
          <>
            <Answer
              label="Fuel at your load"
              detail={
                curve.basis === "two-points"
                  ? "A straight line through your data sheet's two figures."
                  : "An estimate: your data sheet's full-load figure with the usual shape of the curve (see below). A second figure from the data sheet makes it your generator's own."
              }
            >
              {inUnit(lph)} an hour
            </Answer>
            {tankL ? <Answer label="A tank lasts">{hoursWords(tankL / lph)}</Answer> : null}
            {hours !== null ? <Answer label="Fuel a day">{inUnit(lph * hours)}</Answer> : null}
            {share !== null && share > 1 ? <Answer label="Load">More than the rated output: the generator cannot supply it.</Answer> : null}
          </>
        ) : null}
      </Answers>
      <Basis>
        <p>
          Fuel an hour = intercept + slope × load share, the straight-line fuel curve HOMER uses (UL Solutions, HOMER Pro manual, “Generator
          fuel curve intercept coefficient”). With two figures, the line goes through them. With one, the shape is taken from HOMER's worked
          example (a 50 kW generator using 8.48 L/h at half load and 15.3 L/h at full load), so that idling uses about 11% of the full-load
          figure. That shape is from one large diesel; a small petrol generator, especially an inverter type that slows its engine at light
          load, can differ a good deal.
        </p>
        <p>Never run a generator indoors or near an open window: its exhaust carries carbon monoxide.</p>
      </Basis>
    </div>
  );
}
